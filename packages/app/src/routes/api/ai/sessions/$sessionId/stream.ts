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
import { requireAuth, AuthenticationError } from "../../../../../lib/auth-middleware";
import { proxyToDurableStream } from "../../../../../lib/durable-stream-proxy";
import { db } from "../../../../../lib/db";
import { aiChatSessions } from "../../../../../db/schema";
import { eq } from "drizzle-orm";
import { getChatStreamId } from "../../../../../lib/ai/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Stream-Next-Offset, Stream-Cursor, Stream-Up-To-Date, ETag, Content-Type",
};

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
  let authSession;
  try {
    authSession = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw err;
  }

  const chatSession = await db.query.aiChatSessions.findFirst({
    where: eq(aiChatSessions.id, sessionId),
  });

  if (!chatSession || chatSession.userId !== authSession.user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const streamId = await ensureStreamId(sessionId);
  return { streamId };
}

export const Route = createFileRoute("/api/ai/sessions/$sessionId/stream")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      },

      GET: async ({ request, params }) => {
        const result = await authenticateAndVerifySession(request, params.sessionId);
        if (result instanceof Response) return result;
        return proxyToDurableStream(request, result.streamId);
      },

      POST: async ({ request, params }) => {
        const result = await authenticateAndVerifySession(request, params.sessionId);
        if (result instanceof Response) return result;
        return proxyToDurableStream(request, result.streamId);
      },

      PUT: async ({ request, params }) => {
        const result = await authenticateAndVerifySession(request, params.sessionId);
        if (result instanceof Response) return result;
        return proxyToDurableStream(request, result.streamId);
      },
    },
  },
});
