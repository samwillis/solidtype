/**
 * Server Function Wrapper
 *
 * Wrapper for TanStack Start server functions that provides:
 * - Automatic authentication via session
 * - Proper TypeScript types
 * - Zod validation
 *
 * Usage:
 * ```ts
 * export const myServerFn = createAuthedServerFn({
 *   method: "POST",
 *   validator: z.object({ name: z.string() }),
 *   handler: async ({ session, data }) => {
 *     // session.user.id is available
 *     return { success: true };
 *   },
 * });
 * ```
 *
 * NOTE: This file uses dynamic imports for server-only modules (@tanstack/react-start/server, authz)
 * because it's imported by many server function files. Top-level imports would break TanStack Start's
 * virtual module resolution during client bundling.
 */

import { createServerFn } from "@tanstack/react-start";
import type { z } from "zod";

// Type-only import is safe - erased at compile time
import type { Session } from "./authz";
export type { Session };

/**
 * Handler context with session and validated data
 */
export interface AuthedHandlerContext<TInput> {
  session: Session;
  data: TInput;
  request: Request;
}

/**
 * Configuration for creating an authenticated server function
 */
export interface CreateAuthedServerFnConfig<TInput, TOutput> {
  method: "GET" | "POST";
  validator: z.ZodSchema<TInput>;
  handler: (ctx: AuthedHandlerContext<TInput>) => Promise<TOutput>;
}

// Helper type to extract the handler function type
type HandlerFn<TInput, TOutput> = (ctx: { data: TInput }) => Promise<TOutput>;

/**
 * Create an authenticated server function
 *
 * This wrapper:
 * 1. Validates input using the provided Zod schema
 * 2. Extracts and validates the session from the request
 * 3. Passes both to the handler
 *
 * The handler receives { session, data, request } where:
 * - session: The authenticated user's session
 * - data: The validated input data
 * - request: The original request object
 */
export function createAuthedServerFn<TInput, TOutput>(
  config: CreateAuthedServerFnConfig<TInput, TOutput>
) {
  const handler: HandlerFn<TInput, TOutput> = async (ctx) => {
    // Dynamic imports required because this file is imported by many server function files.
    // Top-level imports would break TanStack Start's virtual module resolution.
    const { getRequest } = await import("@tanstack/react-start/server");
    const { getSessionOrThrow } = await import("./authz");

    const request = getRequest();
    const session = await getSessionOrThrow(request);

    return config.handler({
      session,
      data: ctx.data,
      request,
    });
  };

  return createServerFn({ method: config.method })
    .inputValidator(config.validator)
    .handler(handler as never);
}

/**
 * Create a server function that doesn't require authentication
 * but still provides proper typing and validation
 */
export interface UnauthHandlerContext<TInput> {
  session: Session | null;
  data: TInput;
  request: Request;
}

export interface CreateServerFnConfig<TInput, TOutput> {
  method: "GET" | "POST";
  validator: z.ZodSchema<TInput>;
  handler: (ctx: UnauthHandlerContext<TInput>) => Promise<TOutput>;
}

export function createTypedServerFn<TInput, TOutput>(
  config: CreateServerFnConfig<TInput, TOutput>
) {
  const handler: HandlerFn<TInput, TOutput> = async (ctx) => {
    // Dynamic imports required because this file is imported by many server function files.
    const { getRequest } = await import("@tanstack/react-start/server");
    const { getSession } = await import("./authz");

    const request = getRequest();

    // Try to get session but don't require it
    let session: Session | null = null;
    try {
      session = await getSession(request);
    } catch {
      // Session not available
    }

    return config.handler({
      session,
      data: ctx.data,
      request,
    });
  };

  return createServerFn({ method: config.method })
    .inputValidator(config.validator)
    .handler(handler as never);
}
