/**
 * Branches Electric Shape API Route
 * 
 * Proxies Electric shape requests for branches filtered by user access.
 * This route ensures users only sync branches they have access to.
 */

import { createFileRoute } from '@tanstack/react-router';
import { branchesProxy } from '../../../../lib/electric-proxy';
import { requireAuth } from '../../../../lib/auth-middleware';

export const Route = createFileRoute('/api/shapes/branches/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAuth(request);
        return branchesProxy(request, session.user.id);
      },
    },
  },
});