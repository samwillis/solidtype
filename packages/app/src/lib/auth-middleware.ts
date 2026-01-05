/**
 * Authentication middleware for API routes
 */

import { auth } from "./auth";
import { AuthenticationError } from "./http/errors";

// Re-export for backwards compatibility
export { AuthenticationError };

/**
 * Require authentication for a request
 * Throws AuthenticationError if not authenticated
 */
export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw new AuthenticationError();
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
