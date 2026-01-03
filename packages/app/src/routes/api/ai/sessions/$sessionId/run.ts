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
import { aiChatSessions } from "../../../../../db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

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
          const runId = uuid();
          const userMessageId = uuid();
          const assistantMessageId = uuid();
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
            systemPrompt = buildDashboardSystemPrompt(
              authSession.user.id,
              chatSession.projectId || undefined
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
          for await (const chunk of stream) {
            if (chunk.type === "content" && chunk.delta) {
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
              // Tool result
              await streamDb.stream.append(
                chatStateSchema.messages.insert({
                  value: {
                    id: uuid(),
                    runId,
                    role: "tool_result",
                    status: "complete",
                    parentMessageId: assistantMessageId,
                    toolCallId: chunk.toolCallId,
                    toolResult: chunk.content,
                    createdAt: new Date().toISOString(),
                  },
                })
              );
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
          // 15. Handle error - write error records to stream
          const endTime = new Date().toISOString();
          const errorMessage = error instanceof Error ? error.message : String(error);

          try {
            // Try to append error message
            await streamDb.stream.append(
              chatStateSchema.messages.insert({
                value: {
                  id: uuid(),
                  runId: uuid(), // May not have a valid runId if error occurred early
                  role: "error",
                  status: "complete",
                  content: errorMessage,
                  createdAt: endTime,
                },
              })
            );
          } catch {
            // Ignore errors when writing error state
          }

          streamDb.close();

          console.error("[AI Chat Run] Error:", error);
          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
