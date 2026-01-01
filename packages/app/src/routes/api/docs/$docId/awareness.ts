/**
 * Document Awareness Stream API Route
 *
 * Proxies Durable Stream requests for Yjs awareness/presence.
 * Handles authentication and access control for awareness streams.
 *
 * GET - Stream awareness updates from Durable Streams
 * POST - Append awareness updates to the stream
 * PUT - Create/initialize the awareness stream
 */

import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../../lib/auth-middleware";
import { verifyDocumentAccess } from "../../../../lib/permissions";
import { proxyToDurableStream } from "../../../../lib/durable-stream-proxy";
import { db } from "../../../../lib/db";
import { documents } from "../../../../db/schema";
import { eq } from "drizzle-orm";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Stream-Next-Offset, Stream-Cursor, Stream-Up-To-Date, ETag, Content-Type",
};

export const Route = createFileRoute("/api/docs/$docId/awareness")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      },

      GET: async ({ request, params }) => {
        // Authenticate user
        const session = await requireAuth(request);
        const { docId } = params;

        // Verify document access - awareness readable by anyone with access
        const access = await verifyDocumentAccess(session.user.id, docId);
        if (!access) {
          return new Response("Forbidden", { status: 403 });
        }

        // Get the document's durable stream ID and derive awareness stream
        const doc = await db.query.documents.findFirst({
          where: eq(documents.id, docId),
          columns: { durableStreamId: true },
        });

        // Use the document's stream ID or create a default one
        const baseStreamId = doc?.durableStreamId || `project/default/doc/${docId}/branch/default`;
        const awarenessStreamId = `${baseStreamId}/awareness`;

        return proxyToDurableStream(request, awarenessStreamId);
      },

      POST: async ({ request, params }) => {
        // Authenticate user
        const session = await requireAuth(request);
        const { docId } = params;

        // Verify document access - awareness writable by anyone with access
        const access = await verifyDocumentAccess(session.user.id, docId);
        if (!access) {
          return new Response("Forbidden", { status: 403 });
        }

        // Get the document's durable stream ID and derive awareness stream
        const doc = await db.query.documents.findFirst({
          where: eq(documents.id, docId),
          columns: { durableStreamId: true },
        });

        // Use the document's stream ID or create a default one
        const baseStreamId = doc?.durableStreamId || `project/default/doc/${docId}/branch/default`;
        const awarenessStreamId = `${baseStreamId}/awareness`;

        return proxyToDurableStream(request, awarenessStreamId);
      },

      PUT: async ({ request, params }) => {
        // Authenticate user
        const session = await requireAuth(request);
        const { docId } = params;

        // Verify document access
        const access = await verifyDocumentAccess(session.user.id, docId);
        if (!access) {
          return new Response("Forbidden", { status: 403 });
        }

        // Get the document's durable stream ID and derive awareness stream
        const doc = await db.query.documents.findFirst({
          where: eq(documents.id, docId),
          columns: { durableStreamId: true },
        });

        // Use the document's stream ID or create a default one
        const baseStreamId = doc?.durableStreamId || `project/default/doc/${docId}/branch/default`;
        const awarenessStreamId = `${baseStreamId}/awareness`;

        return proxyToDurableStream(request, awarenessStreamId);
      },
    },
  },
});
