/**
 * AI Chat Session Stream Proxy Route
 *
 * Proxies Durable Stream requests for AI chat session transcripts.
 * Handles authentication and ownership verification.
 *
 * GET - Stream transcript events from Durable Streams
 * POST - Append events to the transcript stream
 * PUT - Create/initialize the stream
 */

import { createFileRoute } from "@tanstack/react-router";
import { proxyToDurableStream } from "../../../../../lib/durable-stream-proxy";
import { handleOptions, withCors } from "../../../../../lib/http/cors";
import { getSessionOrThrow, requireChatSessionOwner } from "../../../../../lib/authz";
import { toResponse } from "../../../../../lib/http/respond";
import { db } from "../../../../../lib/db";
import { aiChatSessions } from "../../../../../db/schema";
import { eq } from "drizzle-orm";
import { getChatStreamId } from "../../../../../lib/ai/session";

/**
 * Ensure session has a durable stream ID, creating one if needed
 */
async function ensureStreamId(sessionId: string): Promise<string> {
  const session = await db.query.aiChatSessions.findFirst({
    where: eq(aiChatSessions.id, sessionId),
    columns: { durableStreamId: true },
  });

  if (session?.durableStreamId) {
    return session.durableStreamId;
  }

  // Generate and save stream ID
  const streamId = getChatStreamId(sessionId);
  await db
    .update(aiChatSessions)
    .set({ durableStreamId: streamId })
    .where(eq(aiChatSessions.id, sessionId));

  return streamId;
}

/**
 * Authenticate and verify session ownership
 */
async function authenticateAndVerifySession(
  request: Request,
  sessionId: string
): Promise<{ streamId: string } | Response> {
  try {
    const authSession = await getSessionOrThrow(request);
    await requireChatSessionOwner(authSession, sessionId);
    const streamId = await ensureStreamId(sessionId);
    return { streamId };
  } catch (err) {
    return withCors(toResponse(err));
  }
}

export const Route = createFileRoute("/api/ai/sessions/$sessionId/stream")({
  server: {
    handlers: {
      OPTIONS: async () => handleOptions(),

      GET: async ({ request, params }) => {
        const result = await authenticateAndVerifySession(request, params.sessionId);
        if (result instanceof Response) return result;

        const response = await proxyToDurableStream(request, result.streamId, {
          defaultContentType: "application/json",
        });
        return withCors(response);
      },

      POST: async ({ request, params }) => {
        const result = await authenticateAndVerifySession(request, params.sessionId);
        if (result instanceof Response) return result;

        const response = await proxyToDurableStream(request, result.streamId, {
          defaultContentType: "application/json",
        });
        return withCors(response);
      },

      PUT: async ({ request, params }) => {
        const result = await authenticateAndVerifySession(request, params.sessionId);
        if (result instanceof Response) return result;

        const response = await proxyToDurableStream(request, result.streamId, {
          defaultContentType: "application/json",
        });
        return withCors(response);
      },
    },
  },
});
