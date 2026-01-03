/**
 * AI Chat Sessions Electric Shape API Route
 *
 * Proxies Electric shape requests for chat sessions filtered by user ownership.
 * This route ensures users only sync their own chat sessions.
 */

import { createFileRoute } from "@tanstack/react-router";
import { aiChatSessionsProxy } from "../../../../lib/electric-proxy";
import { requireAuth } from "../../../../lib/auth-middleware";

export const Route = createFileRoute("/api/shapes/ai-chat-sessions/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAuth(request);
        return aiChatSessionsProxy(request, session.user.id);
      },
    },
  },
});
