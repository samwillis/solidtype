/**
 * Projects Electric Shape API Route
 * 
 * Proxies Electric shape requests for projects filtered by user access.
 * This route ensures users only sync projects they have access to.
 */

import { createFileRoute } from '@tanstack/react-router';
import { projectsProxy } from '../../../../lib/electric-proxy';
import { requireAuth } from '../../../../lib/auth-middleware';

export const Route = createFileRoute('/api/shapes/projects/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAuth(request);
        return projectsProxy(request, session.user.id);
      },
    },
  },
});