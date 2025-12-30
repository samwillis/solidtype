/**
 * Documents Electric Shape API Route
 * 
 * Proxies Electric shape requests for documents filtered by user access.
 * This route ensures users only sync documents they have access to.
 */

import { createFileRoute } from '@tanstack/react-router';
import { documentsProxy } from '../../../../lib/electric-proxy';
import { requireAuth } from '../../../../lib/auth-middleware';

export const Route = createFileRoute('/api/shapes/documents/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAuth(request);
        return documentsProxy(request, session.user.id);
      },
    },
  },
});