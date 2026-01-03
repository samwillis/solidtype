/**
 * AI Chat API Route
 *
 * Handles AI chat requests with SSE streaming.
 * Authenticates users, sets up tools, and streams responses.
 */

import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../lib/auth-middleware";
import { chat, toServerSentEventsStream } from "@tanstack/ai";
import { getAdapter } from "../../../lib/ai/adapter";
import { getDashboardTools } from "../../../lib/ai/tools/dashboard-impl";
import { buildDashboardSystemPrompt } from "../../../lib/ai/prompts/dashboard";
import { buildEditorSystemPrompt } from "../../../lib/ai/prompts/editor";
import { persistChunk } from "../../../lib/ai/persistence";
import { v4 as uuid } from "uuid";

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate user
        const session = await requireAuth(request);
        const userId = session.user.id;

        try {
          const body = await request.json();
          const { sessionId, messages, context, documentId, projectId } = body;
          console.log(`[AI Chat API] Processing request for session ${sessionId}`);

          // Persist user message first
          const userMessage = messages[messages.length - 1];
          if (userMessage?.role === "user") {
            await persistChunk(sessionId, {
              type: "user-message",
              id: uuid(),
              content: userMessage.content,
              timestamp: new Date().toISOString(),
            });
          }

          // Get appropriate tools and system prompt based on context
          let tools;
          let systemPrompt: string;

          if (context === "dashboard") {
            tools = await getDashboardTools(userId);
            systemPrompt = buildDashboardSystemPrompt(userId, projectId);
          } else {
            // Editor context - for now, use empty tools (Phase 25/26 will add these)
            tools = [];
            systemPrompt = await buildEditorSystemPrompt(documentId);
          }

          const messageId = uuid();

          // Create chat stream with agentic loop
          const stream = await chat({
            adapter: getAdapter(),
            messages,
            tools,
            system: systemPrompt,
            onToolCall: async (toolCall: { id: string; name: string; arguments: unknown }) => {
              // Persist tool call
              await persistChunk(sessionId, {
                type: "tool-call",
                id: toolCall.id,
                messageId,
                name: toolCall.name,
                arguments: toolCall.arguments as Record<string, unknown>,
                timestamp: new Date().toISOString(),
              });
            },
            onToolResult: async (toolResult: {
              toolCallId: string;
              result: unknown;
              error?: string;
            }) => {
              // Persist tool result
              await persistChunk(sessionId, {
                type: "tool-result",
                toolCallId: toolResult.toolCallId,
                messageId,
                result: toolResult.result,
                error: toolResult.error,
                timestamp: new Date().toISOString(),
              });
            },
          });

          // Return SSE response
          const readableStream = toServerSentEventsStream(stream);
          return new Response(readableStream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } catch (error) {
          console.error("AI chat error:", error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
