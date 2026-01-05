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
import { proxyToDurableStream } from "../../../../lib/durable-stream-proxy";
import { handleOptions, withCors } from "../../../../lib/http/cors";
import { toResponse } from "../../../../lib/http/respond";
import { getSessionOrThrow, requireDocumentAccess } from "../../../../lib/authz";
import { db } from "../../../../lib/db";
import { documents } from "../../../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Get or create stream ID for a document
 */
async function getOrCreateStreamId(docId: string): Promise<string | null> {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, docId),
    columns: { durableStreamId: true, projectId: true, branchId: true },
  });

  if (!doc) return null;

  if (doc.durableStreamId) {
    return doc.durableStreamId;
  }

  // Create stream ID if not exists
  const streamId = `project/${doc.projectId}/doc/${docId}/branch/${doc.branchId}`;
  await db.update(documents).set({ durableStreamId: streamId }).where(eq(documents.id, docId));

  return streamId;
}

export const Route = createFileRoute("/api/docs/$docId/stream")({
  server: {
    handlers: {
      OPTIONS: async () => handleOptions(),

      GET: async ({ request, params }) => {
        try {
          const session = await getSessionOrThrow(request);
          const { docId } = params;

          // Verify document access
          await requireDocumentAccess(session, docId, "view");

          const streamId = await getOrCreateStreamId(docId);
          if (!streamId) {
            return withCors(
              new Response(JSON.stringify({ error: "Document not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              })
            );
          }

          const response = await proxyToDurableStream(request, streamId, {
            defaultContentType: "application/octet-stream",
          });
          return withCors(response);
        } catch (err) {
          return withCors(toResponse(err));
        }
      },

      POST: async ({ request, params }) => {
        try {
          const session = await getSessionOrThrow(request);
          const { docId } = params;

          // Verify document access with write permission
          await requireDocumentAccess(session, docId, "edit");

          const streamId = await getOrCreateStreamId(docId);
          if (!streamId) {
            return withCors(
              new Response(JSON.stringify({ error: "Document not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              })
            );
          }

          const response = await proxyToDurableStream(request, streamId, {
            defaultContentType: "application/octet-stream",
          });
          return withCors(response);
        } catch (err) {
          return withCors(toResponse(err));
        }
      },

      PUT: async ({ request, params }) => {
        try {
          const session = await getSessionOrThrow(request);
          const { docId } = params;

          // Verify document access with write permission
          await requireDocumentAccess(session, docId, "edit");

          const streamId = await getOrCreateStreamId(docId);
          if (!streamId) {
            return withCors(
              new Response(JSON.stringify({ error: "Document not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              })
            );
          }

          const response = await proxyToDurableStream(request, streamId, {
            defaultContentType: "application/octet-stream",
          });
          return withCors(response);
        } catch (err) {
          return withCors(toResponse(err));
        }
      },
    },
  },
});
