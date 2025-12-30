/**
 * better-auth API route handler
 * 
 * Catch-all route for all /api/auth/* requests.
 * Forwards all requests to the better-auth handler.
 * 
 * See: https://www.better-auth.com/docs/integrations/tanstack
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '../../../lib/auth';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => {
        return auth.handler(request);
      },
      POST: ({ request }) => {
        return auth.handler(request);
      },
    },
  },
});
