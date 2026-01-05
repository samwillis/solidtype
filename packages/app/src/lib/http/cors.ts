/**
 * CORS Configuration
 *
 * Centralized CORS headers and helpers.
 * Use these instead of defining CORS headers in individual routes.
 */

/**
 * Default CORS headers for API routes
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Stream-Next-Offset, Stream-Cursor, Stream-Up-To-Date, ETag, Content-Type",
};

/**
 * Options for customizing CORS headers
 */
export interface CorsOptions {
  /** Allowed origin(s). Defaults to "*" */
  allowOrigin?: string;
  /** Allowed HTTP methods. Defaults to common methods */
  allowMethods?: string;
  /** Allowed request headers. Defaults to Content-Type, Authorization */
  allowHeaders?: string;
  /** Headers to expose to the client */
  exposeHeaders?: string;
  /** Max age for preflight cache in seconds */
  maxAge?: number;
}

/**
 * Build CORS headers with custom options
 */
export function corsHeaders(options: CorsOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": options.allowOrigin ?? "*",
    "Access-Control-Allow-Methods":
      options.allowMethods ?? "GET, POST, PUT, DELETE, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": options.allowHeaders ?? "Content-Type, Authorization",
  };

  if (options.exposeHeaders) {
    headers["Access-Control-Expose-Headers"] = options.exposeHeaders;
  } else {
    headers["Access-Control-Expose-Headers"] =
      "Stream-Next-Offset, Stream-Cursor, Stream-Up-To-Date, ETag, Content-Type";
  }

  if (options.maxAge !== undefined) {
    headers["Access-Control-Max-Age"] = String(options.maxAge);
  }

  return headers;
}

/**
 * Handle OPTIONS preflight request
 *
 * @example
 * ```ts
 * OPTIONS: async ({ request }) => handleOptions(request)
 * ```
 */
export function handleOptions(_request?: Request, options?: CorsOptions): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(options),
  });
}

/**
 * Add CORS headers to an existing Response
 */
export function withCors(response: Response, options?: CorsOptions): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders(options))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
