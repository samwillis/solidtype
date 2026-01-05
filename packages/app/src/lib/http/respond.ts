/**
 * HTTP Response Helpers
 *
 * Utilities for converting errors to HTTP responses and
 * wrapping handlers with error handling.
 */

import {
  HttpError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  ConflictError,
  ValidationError,
} from "./errors";

/**
 * Convert an error to an HTTP Response
 */
export function toResponse(err: unknown): Response {
  // Handle known HTTP errors
  if (err instanceof HttpError) {
    const body: Record<string, unknown> = { error: err.message };

    // Include validation errors if present
    if (err instanceof ValidationError && Object.keys(err.errors).length > 0) {
      body.errors = err.errors;
    }

    return new Response(JSON.stringify(body), {
      status: err.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle standard Error objects
  if (err instanceof Error) {
    // Log unexpected errors
    console.error("Unexpected error:", err);

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle unknown error types
  console.error("Unknown error type:", err);
  return new Response(JSON.stringify({ error: "Internal server error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Type for route handler functions
 */
type RouteHandler = (ctx: {
  request: Request;
  params: Record<string, string>;
}) => Promise<Response>;

/**
 * Wrap a route handler with automatic error handling
 *
 * Catches any errors thrown by the handler and converts them
 * to appropriate HTTP responses.
 *
 * @example
 * ```ts
 * GET: safeHandler(async ({ request, params }) => {
 *   const session = await requireAuth(request);
 *   // ... handler logic
 *   return new Response(JSON.stringify(data), { status: 200 });
 * })
 * ```
 */
export function safeHandler(handler: RouteHandler): RouteHandler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      return toResponse(err);
    }
  };
}

// Re-export error types for convenience
export {
  HttpError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  ConflictError,
  ValidationError,
};
