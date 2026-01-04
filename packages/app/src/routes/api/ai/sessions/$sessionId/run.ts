/**
 * AI Chat Session Run Endpoint
 *
 * Handles starting a new AI chat run (user message + assistant response).
 * Writes all transcript events to Durable State for live sync across tabs.
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
import { createAndPreloadServerChatStreamDB, chatStateSchema } from "../../../../../lib/ai/state";
import { hydrateTranscript, toModelMessages } from "../../../../../lib/ai/state/hydrate";
import { getApprovalLevel, type AIChatContext } from "../../../../../lib/ai/approval";
import { db } from "../../../../../lib/db";
import { aiChatSessions, projects, branches } from "../../../../../db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { DashboardContext } from "../../../../../lib/ai/prompts/dashboard";

// Stale run threshold - runs older than this are marked as error
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export const Route = createFileRoute("/api/ai/sessions/$sessionId/run")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // 1. Authenticate user
        let authSession;
        try {
          // Debug: Log cookie header
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
        const { content } = body;

        if (!content || typeof content !== "string") {
          return new Response(JSON.stringify({ error: "Missing or invalid content" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // 4. Create StreamDB for this session
        const streamDb = await createAndPreloadServerChatStreamDB(sessionId);

        // Declare IDs at this scope so they're available in catch block
        let runId: string | undefined;
        let userMessageId: string | undefined;
        let assistantMessageId: string | undefined;

        try {
          const now = new Date();

          // 5. Check for stale runs and recover
          for (const run of streamDb.collections.runs.values()) {
            if (run.status === "running") {
              const startedAt = new Date(run.startedAt);
              if (now.getTime() - startedAt.getTime() > STALE_RUN_THRESHOLD_MS) {
                // Mark stale run as error
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

                // Also mark the assistant message as error
                const assistantMsg = streamDb.collections.messages.get(run.assistantMessageId);
                if (assistantMsg && assistantMsg.status === "streaming") {
                  await streamDb.stream.append(
                    chatStateSchema.messages.update({
                      value: {
                        ...assistantMsg,
                        status: "error",
                        updatedAt: now.toISOString(),
                      },
                      oldValue: assistantMsg,
                    })
                  );
                }
              }
            }
          }

          // 6. Check if there's already an active run
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

          // 7. Build history for model from existing messages
          const transcript = hydrateTranscript(streamDb);
          const historyMessages = toModelMessages(transcript);

          // 8. Generate IDs for this run
          runId = uuid();
          userMessageId = uuid();
          assistantMessageId = uuid();
          const timestamp = now.toISOString();

          // 9. Append run + user message + assistant placeholder
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

          // 10. Get tools and system prompt based on context
          let tools: Awaited<ReturnType<typeof getDashboardTools>>;
          let systemPrompt: string;

          if (chatSession.context === "dashboard") {
            tools = await getDashboardTools(authSession.user.id);

            // Fetch full context for dashboard prompt
            const dashboardContext: Partial<DashboardContext> = {};

            if (chatSession.projectId) {
              // Fetch project with workspace
              const project = await db.query.projects.findFirst({
                where: eq(projects.id, chatSession.projectId),
                with: { workspace: true },
              });

              if (project) {
                dashboardContext.projectName = project.name;
                dashboardContext.workspaceId = project.workspaceId;
                dashboardContext.workspaceName = project.workspace.name;

                // Fetch main branch for this project
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
            // Editor context - for now, use empty tools (Phase 25/26 will add these)
            tools = [];
            systemPrompt = await buildEditorSystemPrompt(chatSession.documentId || undefined);
          }

          // 11. Start streaming chat
          let seq = 0;

          // Determine approval context for tool calls
          const approvalContext: AIChatContext = chatSession.context as AIChatContext;

          const stream = await chat({
            adapter: getAdapter(),
            messages: [...historyMessages, { role: "user" as const, content }],
            tools,
            systemPrompts: [systemPrompt],
          });

          // 12. Process stream chunks
          // Track the last content we saw to detect when we need a separator
          let lastContentEndsWithPunctuation = false;
          let hadToolCallSinceLastContent = false;

          for await (const chunk of stream) {
            // Known chunk types we handle or can ignore:
            // - content: text from assistant
            // - tool_call: tool invocation
            // - tool_result: tool response
            // - done: stream completion (ignore)
            // - error: stream error (logged below)
            if (
              chunk.type !== "content" &&
              chunk.type !== "tool_call" &&
              chunk.type !== "tool_result" &&
              chunk.type !== "done"
            ) {
              // Log unexpected chunk types for debugging
              console.debug("[AI Stream] Unhandled chunk type:", chunk.type, chunk);
            }

            if (chunk.type === "content" && chunk.delta) {
              // If we had a tool call and content resumes, insert a paragraph break
              // This prevents text from running together like "...error.The folder..."
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

              // Track if content ends with sentence-ending punctuation
              const trimmed = chunk.delta.trimEnd();
              lastContentEndsWithPunctuation = /[.!?]$/.test(trimmed);

              // Text content from assistant
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
            } else if (chunk.type === "tool_call") {
              // Tool call from assistant
              const toolName = chunk.toolCall.function.name;
              const toolArgs = JSON.parse(chunk.toolCall.function.arguments || "{}");
              const toolCallId = chunk.toolCall.id;

              // Log tool call for debugging
              console.log("[AI Tool Call]", {
                toolName,
                toolCallId,
                args: toolArgs,
              });

              // Check if this tool requires approval
              const approvalLevel = getApprovalLevel(toolName, approvalContext);
              const requiresApproval = approvalLevel === "confirm";
              const status = requiresApproval ? "pending" : "running";

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
                    requiresApproval,
                    createdAt: new Date().toISOString(),
                  },
                })
              );
            } else if (chunk.type === "tool_result") {
              // Tool result - log for debugging
              const toolResult = chunk.content;

              // Log all tool results
              if (toolResult && typeof toolResult === "object" && "error" in toolResult) {
                console.warn("[AI Tool Result - ERROR]", {
                  toolCallId: chunk.toolCallId,
                  error: (toolResult as { error: unknown }).error,
                });
              } else {
                console.log("[AI Tool Result - SUCCESS]", {
                  toolCallId: chunk.toolCallId,
                  result: toolResult,
                });
              }

              await streamDb.stream.append(
                chatStateSchema.messages.insert({
                  value: {
                    id: uuid(),
                    runId,
                    role: "tool_result",
                    status: "complete",
                    parentMessageId: assistantMessageId,
                    toolCallId: chunk.toolCallId,
                    toolResult,
                    createdAt: new Date().toISOString(),
                  },
                })
              );

              // Mark that we had a tool call, so we can add paragraph break if needed
              hadToolCallSinceLastContent = true;
            }
            // Other chunk types (done, error, etc.) are handled implicitly
          }

          // 13. Mark complete
          const endTime = new Date().toISOString();

          // Get the current assistant message for update
          const currentAssistantMsg = streamDb.collections.messages.get(assistantMessageId);
          if (currentAssistantMsg) {
            await streamDb.stream.append(
              chatStateSchema.messages.update({
                value: {
                  ...currentAssistantMsg,
                  status: "complete",
                  updatedAt: endTime,
                },
                oldValue: currentAssistantMsg,
              })
            );
          }

          // Get the current run for update
          const currentRun = streamDb.collections.runs.get(runId);
          if (currentRun) {
            await streamDb.stream.append(
              chatStateSchema.runs.update({
                value: {
                  ...currentRun,
                  status: "complete",
                  endedAt: endTime,
                },
                oldValue: currentRun,
              })
            );
          }

          // 14. Update session metadata in PostgreSQL
          const newMessageCount = (chatSession.messageCount || 0) + 2;
          await db
            .update(aiChatSessions)
            .set({
              messageCount: newMessageCount,
              lastMessageAt: new Date(endTime),
              updatedAt: new Date(endTime),
              // Auto-generate title from first message
              ...(chatSession.messageCount === 0
                ? { title: content.slice(0, 50) + (content.length > 50 ? "..." : "") }
                : {}),
            })
            .where(eq(aiChatSessions.id, sessionId));

          streamDb.close();

          return new Response(JSON.stringify({ runId, userMessageId, assistantMessageId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          // 15. Handle error - mark run and assistant message as failed
          const endTime = new Date().toISOString();
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("[AI Chat Run] Error:", error);

          try {
            // If we have a runId and assistantMessageId, mark them as error
            if (runId && assistantMessageId) {
              const currentAssistantMsg = streamDb.collections.messages.get(assistantMessageId);
              if (currentAssistantMsg && currentAssistantMsg.status === "streaming") {
                await streamDb.stream.append(
                  chatStateSchema.messages.update({
                    value: {
                      ...currentAssistantMsg,
                      status: "error",
                      updatedAt: endTime,
                    },
                    oldValue: currentAssistantMsg,
                  })
                );
              }

              const currentRun = streamDb.collections.runs.get(runId);
              if (currentRun && currentRun.status === "running") {
                await streamDb.stream.append(
                  chatStateSchema.runs.update({
                    value: {
                      ...currentRun,
                      status: "error",
                      error: errorMessage,
                      endedAt: endTime,
                    },
                    oldValue: currentRun,
                  })
                );
              }
            }
          } catch (cleanupError) {
            // Ignore errors when writing error state
            console.warn("[AI Chat Run] Failed to write error state:", cleanupError);
          }

          streamDb.close();

          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
