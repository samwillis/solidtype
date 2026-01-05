/**
 * Server Function Types
 *
 * This module provides ONLY types for server functions.
 * It intentionally does NOT import any server-only modules (db, authz, etc.)
 * to prevent them from being bundled in client code.
 *
 * Each server function file must import its own server-only dependencies
 * and use createServerFn directly from @tanstack/react-start.
 *
 * Usage:
 * ```ts
 * import { createServerFn } from "@tanstack/react-start";
 * import { db } from "../db";
 * import { auth } from "../auth";
 *
 * export const myServerFn = createServerFn({ method: "POST" })
 *   .inputValidator(mySchema)
 *   .handler(async ({ data, request }) => {
 *     const session = await auth.api.getSession({ headers: request.headers });
 *     // ...
 *   });
 * ```
 */

/**
 * Session type - defined here to avoid importing authz
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
