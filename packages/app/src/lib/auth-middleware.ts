/**
 * Authentication middleware for API routes
 */

import { auth } from './auth';

/**
 * Require authentication for a request
 * Throws 401 if not authenticated
 */
export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  
  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }
  
  return session;
}

/**
 * Get session without requiring authentication
 * Returns null if not authenticated
 */
export async function getSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}
