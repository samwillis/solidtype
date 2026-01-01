/**
 * Document Stream API Route
 *
 * Proxies Durable Stream requests for Yjs document persistence.
 * Handles authentication and access control for document streams.
 *
 * GET - Stream document updates from Durable Streams
 * POST - Append updates to the document stream
 * PUT - Create/initialize the stream (called by y-durable-streams provider)
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

export const Route = createFileRoute("/api/docs/$docId/stream")({
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

        // Verify document access
        const access = await verifyDocumentAccess(session.user.id, docId);
        if (!access) {
          return new Response("Forbidden", { status: 403 });
        }

        // Get the document's durable stream ID
        const doc = await db.query.documents.findFirst({
          where: eq(documents.id, docId),
          columns: { durableStreamId: true },
        });

        if (!doc || !doc.durableStreamId) {
          // If no stream exists yet, create one automatically
          const streamId = `project/default/doc/${docId}/branch/default`;

          // Update the document with the new stream ID
          await db
            .update(documents)
            .set({ durableStreamId: streamId })
            .where(eq(documents.id, docId));

          return proxyToDurableStream(request, streamId);
        }

        return proxyToDurableStream(request, doc.durableStreamId);
      },

      POST: async ({ request, params }) => {
        // Authenticate user
        const session = await requireAuth(request);
        const { docId } = params;

        // Verify document access with write permission
        const access = await verifyDocumentAccess(session.user.id, docId);
        if (!access) {
          return new Response("Forbidden", { status: 403 });
        }

        if (!access.canEdit) {
          return new Response("Read-only access", { status: 403 });
        }

        // Get the document's durable stream ID
        const doc = await db.query.documents.findFirst({
          where: eq(documents.id, docId),
          columns: { durableStreamId: true },
        });

        if (!doc || !doc.durableStreamId) {
          // If no stream exists yet, create one automatically
          const streamId = `project/default/doc/${docId}/branch/default`;

          // Update the document with the new stream ID
          await db
            .update(documents)
            .set({ durableStreamId: streamId })
            .where(eq(documents.id, docId));

          return proxyToDurableStream(request, streamId);
        }

        return proxyToDurableStream(request, doc.durableStreamId);
      },

      PUT: async ({ request, params }) => {
        // Authenticate user
        const session = await requireAuth(request);
        const { docId } = params;

        // Verify document access with write permission
        const access = await verifyDocumentAccess(session.user.id, docId);
        if (!access) {
          return new Response("Forbidden", { status: 403 });
        }

        if (!access.canEdit) {
          return new Response("Read-only access", { status: 403 });
        }

        // Get the document's durable stream ID
        const doc = await db.query.documents.findFirst({
          where: eq(documents.id, docId),
          columns: { durableStreamId: true },
        });

        if (!doc || !doc.durableStreamId) {
          // If no stream exists yet, create one automatically
          const streamId = `project/default/doc/${docId}/branch/default`;

          // Update the document with the new stream ID
          await db
            .update(documents)
            .set({ durableStreamId: streamId })
            .where(eq(documents.id, docId));

          return proxyToDurableStream(request, streamId);
        }

        return proxyToDurableStream(request, doc.durableStreamId);
      },
    },
  },
});
