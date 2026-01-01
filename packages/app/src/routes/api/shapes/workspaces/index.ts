/**
 * Workspaces Electric Shape API Route
 *
 * Proxies Electric shape requests for workspaces filtered by user membership.
 * This route ensures users only sync workspaces they have access to.
 */

import { createFileRoute } from "@tanstack/react-router";
import { workspacesProxy } from "../../../../lib/electric-proxy";
import { requireAuth } from "../../../../lib/auth-middleware";

export const Route = createFileRoute("/api/shapes/workspaces/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAuth(request);
        return workspacesProxy(request, session.user.id);
      },
    },
  },
});
