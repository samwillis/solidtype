/**
 * Server Function Middleware
 *
 * Provides session authentication middleware for server functions.
 * This allows server functions to access the authenticated session
 * through the context without manual session extraction in each handler.
 *
 * Usage:
 * ```ts
 * import { authMiddleware } from "../server-fn-middleware";
 *
 * export const myServerFn = createServerFn({ method: "POST" })
 *   .middleware([authMiddleware])
 *   .inputValidator(mySchema)
 *   .handler(async ({ context, data }) => {
 *     // context.session is available and typed
 *     const userId = context.session.user.id;
 *   });
 * ```
 */

import { createMiddleware } from "@tanstack/react-start";

/**
 * Session type matching better-auth's session structure
 */
export interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}

/**
 * Authentication middleware that extracts and validates the session.
 * Throws an error if no valid session is found.
 *
 * Adds `session` to the context for downstream handlers.
 */
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  // Dynamic imports to prevent bundling server-only code
  const { getRequest } = await import("@tanstack/react-start/server");
  const { auth } = await import("./auth");

  const request = getRequest();
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return next({
    context: {
      session: session as Session,
    },
  });
});

/**
 * Optional authentication middleware that extracts the session if available.
 * Does not throw if no session is found - sets session to null instead.
 *
 * Adds `session` (or null) to the context for downstream handlers.
 */
export const optionalAuthMiddleware = createMiddleware().server(async ({ next }) => {
  // Dynamic imports to prevent bundling server-only code
  const { getRequest } = await import("@tanstack/react-start/server");
  const { auth } = await import("./auth");

  const request = getRequest();
  let session: Session | null = null;

  try {
    const result = await auth.api.getSession({
      headers: request.headers,
    });
    session = result as Session | null;
  } catch {
    // Session not available
  }

  return next({
    context: {
      session,
    },
  });
});
