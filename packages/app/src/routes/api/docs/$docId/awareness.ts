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
import { proxyToDurableStream } from "../../../../lib/durable-stream-proxy";
import { handleOptions, withCors } from "../../../../lib/http/cors";
import { toResponse } from "../../../../lib/http/respond";
import { getSessionOrThrow, requireDocumentAccess } from "../../../../lib/authz";
import { db } from "../../../../lib/db";
import { documents } from "../../../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Get awareness stream ID for a document
 */
async function getAwarenessStreamId(docId: string): Promise<string> {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, docId),
    columns: { durableStreamId: true },
  });

  const baseStreamId = doc?.durableStreamId || `project/default/doc/${docId}/branch/default`;
  return `${baseStreamId}/awareness`;
}

export const Route = createFileRoute("/api/docs/$docId/awareness")({
  server: {
    handlers: {
      OPTIONS: async () => handleOptions(),

      GET: async ({ request, params }) => {
        try {
          const session = await getSessionOrThrow(request);
          const { docId } = params;

          // Verify document access - awareness readable by anyone with access
          await requireDocumentAccess(session, docId, "view");

          const awarenessStreamId = await getAwarenessStreamId(docId);
          const response = await proxyToDurableStream(request, awarenessStreamId, {
            defaultContentType: "application/json",
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

          // Verify document access - awareness writable by anyone with access
          await requireDocumentAccess(session, docId, "view");

          const awarenessStreamId = await getAwarenessStreamId(docId);
          const response = await proxyToDurableStream(request, awarenessStreamId, {
            defaultContentType: "application/json",
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

          // Verify document access
          await requireDocumentAccess(session, docId, "view");

          const awarenessStreamId = await getAwarenessStreamId(docId);
          const response = await proxyToDurableStream(request, awarenessStreamId, {
            defaultContentType: "application/json",
          });
          return withCors(response);
        } catch (err) {
          return withCors(toResponse(err));
        }
      },
    },
  },
});
