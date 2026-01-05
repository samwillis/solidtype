/**
 * Durable Streams Proxy Utilities
 *
 * A "dumb transport" layer that proxies requests to Durable Streams.
 *
 * IMPORTANT: This module does NOT handle authentication or authorization.
 * Callers MUST authenticate and authorize before calling proxyToDurableStream().
 *
 * CORS headers are NOT added by this module. Callers should use lib/http/cors
 * to add CORS headers to responses if needed.
 */

const DURABLE_STREAMS_URL = process.env.DURABLE_STREAMS_URL || "http://localhost:3200";

/**
 * Headers that should be forwarded from Durable Streams responses.
 * These are essential for the protocol to work correctly.
 */
const FORWARDED_HEADERS = [
  "content-type",
  "cache-control",
  "transfer-encoding",
  "stream-next-offset",
  "stream-cursor",
  "stream-up-to-date",
  "etag",
  "location",
];

/**
 * Options for proxy behavior
 */
export interface ProxyOptions {
  /**
   * Default content-type to use if upstream doesn't provide one.
   * If not specified, uses the upstream content-type or falls back to application/octet-stream.
   */
  defaultContentType?: string;

  /**
   * Whether to auto-create the stream on 404 GET requests.
   * Defaults to true for backwards compatibility.
   */
  autoCreate?: boolean;
}

/**
 * Build response headers from a Durable Streams response
 */
function buildResponseHeaders(response: Response, options: ProxyOptions = {}): HeadersInit {
  const headers: Record<string, string> = {};

  for (const headerName of FORWARDED_HEADERS) {
    const value = response.headers.get(headerName);
    if (value) {
      headers[headerName] = value;
    }
  }

  // Only set content-type if not already set from upstream
  if (!headers["content-type"]) {
    headers["content-type"] = options.defaultContentType || "application/octet-stream";
  }

  return headers;
}

/**
 * Proxy a request to Durable Streams
 *
 * @param request - The incoming request (for query params and body)
 * @param streamPath - The stream path (e.g., "ai-chat/session-id")
 * @param options - Optional proxy configuration
 *
 * @example
 * ```ts
 * // In a route handler:
 * const session = await getSessionOrThrow(request);
 * await requireChatSessionOwner(session, sessionId);
 * return proxyToDurableStream(request, `ai-chat/${sessionId}`, {
 *   defaultContentType: "application/json",
 * });
 * ```
 */
export async function proxyToDurableStream(
  request: Request,
  streamPath: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const url = new URL(request.url);

  const durableUrl = new URL(`/v1/stream/${streamPath}`, DURABLE_STREAMS_URL);

  // Forward query params (offset, live, etc.)
  for (const [key, value] of url.searchParams) {
    durableUrl.searchParams.set(key, value);
  }

  const autoCreate = options.autoCreate ?? true;

  try {
    // Determine if request has a body (POST and PUT can have bodies)
    const hasBody = request.method === "POST" || request.method === "PUT";

    const response = await fetch(durableUrl.toString(), {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/octet-stream",
        Accept: request.headers.get("Accept") || "*/*",
      },
      body: hasBody ? request.body : undefined,
      // @ts-expect-error duplex is needed for streaming request bodies
      duplex: hasBody ? "half" : undefined,
    });

    // Handle 404 for GET requests - stream doesn't exist yet
    // Create the stream with PUT, then retry the GET
    if (response.status === 404 && request.method === "GET" && autoCreate) {
      // Create the stream with PUT (this is the Durable Streams protocol)
      const createResponse = await fetch(durableUrl.toString().split("?")[0], {
        method: "PUT",
        headers: {
          "Content-Type": options.defaultContentType || "application/json",
        },
      });

      if (createResponse.ok) {
        // Retry the original GET request now that the stream exists
        const retryResponse = await fetch(durableUrl.toString(), {
          method: "GET",
          headers: { Accept: options.defaultContentType || "application/json" },
        });

        return new Response(retryResponse.body, {
          status: retryResponse.status,
          headers: buildResponseHeaders(retryResponse, options),
        });
      }
    }

    return new Response(response.body, {
      status: response.status,
      headers: buildResponseHeaders(response, options),
    });
  } catch (error) {
    console.error("Durable Stream proxy error:", error);
    return new Response("Durable Stream unavailable", { status: 503 });
  }
}
