/**
 * Folders Electric Shape API Route
 *
 * Proxies Electric shape requests for folders filtered by user access.
 * This route ensures users only sync folders they have access to.
 */

import { createFileRoute } from "@tanstack/react-router";
import { foldersProxy } from "../../../../lib/electric-proxy";
import { requireAuth } from "../../../../lib/auth-middleware";

export const Route = createFileRoute("/api/shapes/folders/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAuth(request);
        return foldersProxy(request, session.user.id);
      },
    },
  },
});
