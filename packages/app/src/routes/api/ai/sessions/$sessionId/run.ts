/**
 * AI Chat Session Run Endpoint
 *
 * Handles starting a new AI chat run (user message + assistant response).
 * Writes all transcript events to Durable State for live sync across tabs.
 *
 * Architecture:
 * - Server runs chat() and writes all chunks to Durable Stream
 * - For server tools: execute immediately and return result
 * - For client tools: write tool_call, wait for worker's tool_result via subscription
 * - Returns 202 with runId, processing continues async
 *
 * POST - Start a new run with a user message
 */

import { createFileRoute } from "@tanstack/react-router";
import { requireAuth, AuthenticationError } from "../../../../../lib/auth-middleware";
import { chat } from "@tanstack/ai";
import { getAdapter } from "../../../../../lib/ai/adapter";
import { getDashboardTools } from "../../../../../lib/ai/tools/dashboard-impl";
import { buildDashboardSystemPrompt } from "../../../../../lib/ai/prompts/dashboard";
import { buildEditorSystemPrompt } from "../../../../../lib/ai/prompts/editor";
import {
  createAndPreloadServerChatStreamDB,
  chatStateSchema,
  type ChatStreamDB,
} from "../../../../../lib/ai/state";
import { hydrateTranscript, toModelMessages } from "../../../../../lib/ai/state/hydrate";
import { getApprovalLevel, type AIChatContext } from "../../../../../lib/ai/approval";
import { isLocalTool } from "../../../../../lib/ai/tools/execution-registry";
import { db } from "../../../../../lib/db";
import { aiChatSessions, projects, branches } from "../../../../../db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { DashboardContext } from "../../../../../lib/ai/prompts/dashboard";

// Stale run threshold - runs older than this are marked as error
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Timeout for waiting for client tool results
const CLIENT_TOOL_TIMEOUT_MS = 60 * 1000; // 60 seconds

/**
 * Wait for a client tool result to appear in the Durable Stream
 * The worker writes tool_result messages after executing client tools
 */
async function waitForClientToolResult(
  streamDb: ChatStreamDB,
  toolCallId: string,
  timeoutMs = CLIENT_TOOL_TIMEOUT_MS
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let resolved = false;

    const checkForResult = async () => {
      if (resolved) return;

      try {
        // Re-preload to get fresh data from Durable Streams
        // The worker writes tool_result to the stream, we need to see it
        await streamDb.preload();
      } catch (err) {
        console.warn("[waitForClientToolResult] Preload failed:", err);
      }

      // Look for tool_result with matching toolCallId
      const messages = Array.from(streamDb.collections.messages.values());
      const toolResult = messages.find(
        (m) => m.role === "tool_result" && m.toolCallId === toolCallId
      );

      if (toolResult) {
        resolved = true;
        clearInterval(pollInterval);

        // Check if it's an error result
        if (
          toolResult.toolResult &&
          typeof toolResult.toolResult === "object" &&
          "error" in toolResult.toolResult
        ) {
          // Return the error as result - TanStack AI will handle it
          resolve(toolResult.toolResult);
        } else {
          resolve(toolResult.toolResult);
        }
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        resolved = true;
        clearInterval(pollInterval);
        reject(new Error(`Timeout waiting for client tool result: ${toolCallId}`));
      }
    };

    // Poll for results
    const pollInterval = setInterval(checkForResult, 200);

    // Check immediately
    checkForResult();
  });
}

/**
 * Process the chat stream in the background
 * Writes all chunks to Durable Stream and handles tool coordination
 */
async function processStream(
  streamDb: ChatStreamDB,
  stream: AsyncIterable<unknown>,
  runId: string,
  assistantMessageId: string,
  approvalContext: AIChatContext,
  chatSession: { id: string; context: string; messageCount: number | null }
): Promise<void> {
  let seq = 0;
  let lastContentEndsWithPunctuation = false;
  let hadToolCallSinceLastContent = false;

  try {
    for await (const chunk of stream as AsyncIterable<{
      type: string;
      delta?: string;
      toolCall?: { id: string; function: { name: string; arguments: string } };
      toolCallId?: string;
      content?: unknown;
    }>) {
      // Handle different chunk types
      if (chunk.type === "content" && chunk.delta) {
        // If we had a tool call and content resumes, insert a paragraph break
        if (hadToolCallSinceLastContent && seq > 0) {
          const firstChar = chunk.delta.trimStart()[0];
          const startsWithCapital =
            firstChar && firstChar === firstChar.toUpperCase() && /[A-Z]/.test(firstChar);

          if (lastContentEndsWithPunctuation && startsWithCapital) {
            await streamDb.stream.append(
              chatStateSchema.chunks.insert({
                value: {
                  id: `${assistantMessageId}:${seq}`,
                  messageId: assistantMessageId,
                  seq: seq++,
                  delta: "\n\n",
                  createdAt: new Date().toISOString(),
                },
              })
            );
          }
          hadToolCallSinceLastContent = false;
        }

        // Track punctuation
        const trimmed = chunk.delta.trimEnd();
        lastContentEndsWithPunctuation = /[.!?]$/.test(trimmed);

        // Write content chunk
        await streamDb.stream.append(
          chatStateSchema.chunks.insert({
            value: {
              id: `${assistantMessageId}:${seq}`,
              messageId: assistantMessageId,
              seq: seq++,
              delta: chunk.delta,
              createdAt: new Date().toISOString(),
            },
          })
        );
      } else if (chunk.type === "tool_call" && chunk.toolCall) {
        const toolName = chunk.toolCall.function.name;
        const toolArgs = JSON.parse(chunk.toolCall.function.arguments || "{}");
        const toolCallId = chunk.toolCall.id;

        console.log("[AI Tool Call]", { toolName, toolCallId, args: toolArgs });

        // Check if this is a client tool (local execution in worker)
        const isClientTool = isLocalTool(toolName);

        // Determine approval status
        const approvalLevel = getApprovalLevel(toolName, approvalContext);
        const requiresApproval = approvalLevel === "confirm";
        // Client tools start as "running" so worker picks them up
        // Server tools that need approval start as "pending"
        const status = isClientTool ? "running" : requiresApproval ? "pending" : "running";

        // Write tool_call to Durable Stream
        await streamDb.stream.append(
          chatStateSchema.messages.insert({
            value: {
              id: uuid(),
              runId,
              role: "tool_call",
              status,
              parentMessageId: assistantMessageId,
              toolName,
              toolArgs,
              toolCallId,
              requiresApproval: isClientTool ? false : requiresApproval,
              createdAt: new Date().toISOString(),
            },
          })
        );

        hadToolCallSinceLastContent = true;
      } else if (chunk.type === "tool_result") {
        const toolResult = chunk.content;
        const toolCallId = chunk.toolCallId;

        // Log result
        if (toolResult && typeof toolResult === "object" && "error" in toolResult) {
          console.warn("[AI Tool Result - ERROR]", {
            toolCallId,
            error: (toolResult as { error: unknown }).error,
          });
        } else {
          console.log("[AI Tool Result - SUCCESS]", { toolCallId, result: toolResult });
        }

        // For client tools, the worker already wrote the tool_result to Durable Stream
        // Check if it already exists to avoid duplicates
        const existingResults = Array.from(streamDb.collections.messages.values()).filter(
          (m) => m.role === "tool_result" && m.toolCallId === toolCallId
        );

        if (existingResults.length === 0) {
          // Write tool_result to Durable Stream (only for server tools)
          await streamDb.stream.append(
            chatStateSchema.messages.insert({
              value: {
                id: uuid(),
                runId,
                role: "tool_result",
                status: "complete",
                parentMessageId: assistantMessageId,
                toolCallId,
                toolResult,
                createdAt: new Date().toISOString(),
              },
            })
          );
        } else {
          console.debug("[processStream] Skipping duplicate tool_result for:", toolCallId);
        }
      }
      // Ignore: done, error, thinking, etc.
    }

    // Mark run complete
    const endTime = new Date().toISOString();
    console.debug("[processStream] Stream finished, wrote", seq, "chunks");

    const currentAssistantMsg = streamDb.collections.messages.get(assistantMessageId);
    if (currentAssistantMsg) {
      await streamDb.stream.append(
        chatStateSchema.messages.update({
          value: { ...currentAssistantMsg, status: "complete", updatedAt: endTime },
          oldValue: currentAssistantMsg,
        })
      );
    }

    const currentRun = streamDb.collections.runs.get(runId);
    if (currentRun) {
      await streamDb.stream.append(
        chatStateSchema.runs.update({
          value: { ...currentRun, status: "complete", endedAt: endTime },
          oldValue: currentRun,
        })
      );
    }
    console.debug("[processStream] Run marked complete");

    // Update session metadata
    const newMessageCount = (chatSession.messageCount || 0) + 2;
    await db
      .update(aiChatSessions)
      .set({
        messageCount: newMessageCount,
        lastMessageAt: new Date(endTime),
        updatedAt: new Date(endTime),
      })
      .where(eq(aiChatSessions.id, chatSession.id));
  } catch (error) {
    // Mark run as error
    const endTime = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[AI Chat Run] Error:", error);

    try {
      const currentAssistantMsg = streamDb.collections.messages.get(assistantMessageId);
      if (currentAssistantMsg && currentAssistantMsg.status === "streaming") {
        await streamDb.stream.append(
          chatStateSchema.messages.update({
            value: { ...currentAssistantMsg, status: "error", updatedAt: endTime },
            oldValue: currentAssistantMsg,
          })
        );
      }

      const currentRun = streamDb.collections.runs.get(runId);
      if (currentRun && currentRun.status === "running") {
        await streamDb.stream.append(
          chatStateSchema.runs.update({
            value: { ...currentRun, status: "error", error: errorMessage, endedAt: endTime },
            oldValue: currentRun,
          })
        );
      }
    } catch (cleanupError) {
      console.warn("[AI Chat Run] Failed to write error state:", cleanupError);
    }
  } finally {
    streamDb.close();
  }
}

export const Route = createFileRoute("/api/ai/sessions/$sessionId/run")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // 1. Authenticate user
        let authSession;
        try {
          const cookieHeader = request.headers.get("cookie");
          console.log("[run] Cookie header:", cookieHeader ? "present" : "missing");

          authSession = await requireAuth(request);
          console.log("[run] Auth successful, user:", authSession.user.id);
        } catch (err) {
          console.log("[run] Auth failed:", err);
          if (err instanceof AuthenticationError) {
            return new Response("Unauthorized", { status: 401 });
          }
          throw err;
        }
        const { sessionId } = params;

        // 2. Load session and verify ownership
        const chatSession = await db.query.aiChatSessions.findFirst({
          where: eq(aiChatSessions.id, sessionId),
        });

        console.log("[run] Session lookup:", {
          sessionId,
          found: !!chatSession,
          sessionUserId: chatSession?.userId,
          authUserId: authSession.user.id,
          match: chatSession?.userId === authSession.user.id,
        });

        if (!chatSession || chatSession.userId !== authSession.user.id) {
          return new Response("Forbidden", { status: 403 });
        }

        // 3. Parse request body
        const body = await request.json();
        const { content, runId: clientRunId } = body;

        if (!content || typeof content !== "string") {
          return new Response(JSON.stringify({ error: "Missing or invalid content" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // 4. Create StreamDB for this session
        const streamDb = await createAndPreloadServerChatStreamDB(sessionId);

        try {
          const now = new Date();

          // 5. Check for stale runs and recover
          for (const run of streamDb.collections.runs.values()) {
            if (run.status === "running") {
              const startedAt = new Date(run.startedAt);
              if (now.getTime() - startedAt.getTime() > STALE_RUN_THRESHOLD_MS) {
                await streamDb.stream.append(
                  chatStateSchema.runs.update({
                    value: {
                      ...run,
                      status: "error",
                      error: "Timeout - run exceeded maximum duration",
                      endedAt: now.toISOString(),
                    },
                    oldValue: run,
                  })
                );

                const assistantMsg = streamDb.collections.messages.get(run.assistantMessageId);
                if (assistantMsg && assistantMsg.status === "streaming") {
                  await streamDb.stream.append(
                    chatStateSchema.messages.update({
                      value: { ...assistantMsg, status: "error", updatedAt: now.toISOString() },
                      oldValue: assistantMsg,
                    })
                  );
                }
              }
            }
          }

          // 6. Check for active run
          const activeRun = Array.from(streamDb.collections.runs.values()).find(
            (r) => r.status === "running"
          );

          if (activeRun) {
            streamDb.close();
            return new Response(
              JSON.stringify({ error: "Run already in progress", runId: activeRun.id }),
              { status: 409, headers: { "Content-Type": "application/json" } }
            );
          }

          // 7. Build history
          const transcript = hydrateTranscript(streamDb);
          const historyMessages = toModelMessages(transcript);

          // 8. Generate IDs (use client-provided runId if available to prevent deadlock)
          // Client provides runId so it can start streaming before POST completes
          const runId = clientRunId || uuid();
          const userMessageId = uuid();
          const assistantMessageId = uuid();
          const timestamp = now.toISOString();

          // 9. Write initial records
          await streamDb.stream.append(
            chatStateSchema.runs.insert({
              value: {
                id: runId,
                status: "running",
                userMessageId,
                assistantMessageId,
                startedAt: timestamp,
              },
            })
          );

          await streamDb.stream.append(
            chatStateSchema.messages.insert({
              value: {
                id: userMessageId,
                runId,
                role: "user",
                status: "complete",
                content,
                createdAt: timestamp,
              },
            })
          );

          await streamDb.stream.append(
            chatStateSchema.messages.insert({
              value: {
                id: assistantMessageId,
                runId,
                role: "assistant",
                status: "streaming",
                createdAt: timestamp,
              },
            })
          );

          // Auto-generate title from first message
          if (chatSession.messageCount === 0) {
            await db
              .update(aiChatSessions)
              .set({ title: content.slice(0, 50) + (content.length > 50 ? "..." : "") })
              .where(eq(aiChatSessions.id, sessionId));
          }

          // 10. Get tools and prompt based on context
          const approvalContext = chatSession.context as AIChatContext;
          let tools: Awaited<ReturnType<typeof getDashboardTools>>;
          let systemPrompt: string;

          if (chatSession.context === "dashboard") {
            tools = await getDashboardTools(authSession.user.id);

            const dashboardContext: Partial<DashboardContext> = {};
            if (chatSession.projectId) {
              const project = await db.query.projects.findFirst({
                where: eq(projects.id, chatSession.projectId),
                with: { workspace: true },
              });

              if (project) {
                dashboardContext.projectName = project.name;
                dashboardContext.workspaceId = project.workspaceId;
                dashboardContext.workspaceName = project.workspace.name;

                const mainBranch = await db.query.branches.findFirst({
                  where: and(
                    eq(branches.projectId, chatSession.projectId),
                    eq(branches.isMain, true)
                  ),
                });
                if (mainBranch) {
                  dashboardContext.branchId = mainBranch.id;
                  dashboardContext.branchName = mainBranch.name;
                }
              }
            }

            systemPrompt = buildDashboardSystemPrompt(
              authSession.user.id,
              chatSession.projectId || undefined,
              dashboardContext
            );
          } else {
            // Editor context - for client tools, create wrappers that wait for worker
            tools = await getEditorToolsWithWorkerBridge(streamDb, runId, assistantMessageId);
            systemPrompt = await buildEditorSystemPrompt(chatSession.documentId || undefined);
          }

          // 11. Start chat stream
          console.log("[run] Starting chat with", tools.length, "tools");
          console.log("[run] Tool names:", tools.map((t) => t.name).join(", "));
          const stream = await chat({
            adapter: getAdapter(),
            messages: [...historyMessages, { role: "user" as const, content }],
            tools,
            systemPrompts: [systemPrompt],
          });

          // 12. Process stream synchronously - must complete before response
          // Note: We MUST await this because serverless environments kill
          // background processing once the response is sent
          console.debug("[run] Starting stream processing for run:", runId);
          await processStream(streamDb, stream, runId, assistantMessageId, approvalContext, {
            id: sessionId,
            context: chatSession.context,
            messageCount: chatSession.messageCount,
          });
          console.debug("[run] Stream processing complete for run:", runId);

          // Return 200 OK with run details after processing completes
          return new Response(JSON.stringify({ runId, userMessageId, assistantMessageId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          streamDb.close();
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("[AI Chat Run] Setup error:", error);

          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

/**
 * Create editor tools that bridge to worker execution via Durable Stream
 *
 * For client tools (sketch and modeling tools), we use toolDefinition().server() to create
 * proper ServerTool objects. The implementation:
 * 1. Waits for the tool_call to be written to Durable Stream
 * 2. Waits for worker's tool_result to appear
 * 3. Returns the result to the LLM so it can continue the conversation
 */
async function getEditorToolsWithWorkerBridge(
  streamDb: ChatStreamDB,
  runId: string,
  _assistantMessageId: string
): Promise<Awaited<ReturnType<typeof getDashboardTools>>> {
  // Import all tool definitions
  const {
    sketchToolDefs,
    sketchHelperToolDefs,
    modelingQueryToolDefs,
    modelingFeatureToolDefs,
    modelingModifyToolDefs,
    modelingHelperToolDefs,
  } = await import("../../../../../lib/ai/tools/index");

  type ServerTool = Awaited<ReturnType<typeof getDashboardTools>>[number];
  const tools: ServerTool[] = [];

  // Create a bridge implementation for a tool
  // The implementation waits for the worker to execute the tool and return a result
  const createBridgeImpl =
    (toolName: string) =>
    async (_input: unknown): Promise<unknown> => {
      // Wait a moment for the tool_call to be written by processStream
      await new Promise((r) => setTimeout(r, 100));

      // Refresh to see the tool_call we just wrote
      await streamDb.preload();

      const messages = Array.from(streamDb.collections.messages.values());
      const toolCall = messages
        .filter((m) => m.role === "tool_call" && m.runId === runId && m.toolName === toolName)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (!toolCall?.toolCallId) {
        throw new Error(`Tool call not found for ${toolName}`);
      }

      // Wait for worker to execute and write result
      console.log(
        `[Editor Bridge] Waiting for worker result: ${toolName} (${toolCall.toolCallId})`
      );
      const result = await waitForClientToolResult(streamDb, toolCall.toolCallId);
      console.log(`[Editor Bridge] Got result for ${toolName}:`, result);

      return result;
    };

  // Helper to add tool definitions to the tools array
  const addToolDefs = (defs: Record<string, unknown> | unknown[], label: string) => {
    const values = Array.isArray(defs) ? defs : Object.values(defs);
    console.log(`[getEditorToolsWithWorkerBridge] Adding ${values.length} tools from ${label}`);
    for (const def of values) {
      try {
        const toolDef = def as {
          name: string;
          server: (fn: (input: unknown) => Promise<unknown>) => ServerTool;
        };
        if (typeof toolDef.server !== "function") {
          console.error(
            `[getEditorToolsWithWorkerBridge] Tool ${toolDef.name} has no server method`
          );
          continue;
        }
        tools.push(toolDef.server(createBridgeImpl(toolDef.name)));
      } catch (err) {
        console.error("[getEditorToolsWithWorkerBridge] Error adding tool:", err);
      }
    }
  };

  // Add all sketch tools (Phase 25)
  addToolDefs(sketchToolDefs, "sketchToolDefs");
  addToolDefs(sketchHelperToolDefs, "sketchHelperToolDefs");

  // Add all modeling tools (Phase 26)
  addToolDefs(modelingQueryToolDefs, "modelingQueryToolDefs");
  addToolDefs(modelingFeatureToolDefs, "modelingFeatureToolDefs");
  addToolDefs(modelingModifyToolDefs, "modelingModifyToolDefs");
  addToolDefs(modelingHelperToolDefs, "modelingHelperToolDefs");

  console.log(`[getEditorToolsWithWorkerBridge] Total tools registered: ${tools.length}`);

  return tools;
}
