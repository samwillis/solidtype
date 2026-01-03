/**
 * Durable Streams proxy utilities
 *
 * Proxies Durable Stream requests with proper authorization.
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
 * CORS headers to allow cross-origin access
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Stream-Next-Offset, Stream-Cursor, Stream-Up-To-Date, ETag, Content-Type",
};

/**
 * Build response headers from a Durable Streams response
 */
function buildResponseHeaders(response: Response): HeadersInit {
  const headers: Record<string, string> = { ...CORS_HEADERS };
  for (const headerName of FORWARDED_HEADERS) {
    const value = response.headers.get(headerName);
    if (value) {
      headers[headerName] = value;
    }
  }
  // Always use application/json for AI chat streams
  headers["content-type"] = "application/json";
  return headers;
}

/**
 * Proxy a request to Durable Streams
 */
export async function proxyToDurableStream(
  request: Request,
  streamPath: string
): Promise<Response> {
  const url = new URL(request.url);

  const durableUrl = new URL(`/v1/stream/${streamPath}`, DURABLE_STREAMS_URL);

  // Forward query params (offset, live, etc.)
  for (const [key, value] of url.searchParams) {
    durableUrl.searchParams.set(key, value);
  }

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
    if (response.status === 404 && request.method === "GET") {
      // Create the stream with PUT (this is the Durable Streams protocol)
      // Use application/json for AI chat streams (required for @durable-streams/state)
      const createResponse = await fetch(durableUrl.toString().split("?")[0], {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (createResponse.ok) {
        // Retry the original GET request now that the stream exists
        const retryResponse = await fetch(durableUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        return new Response(retryResponse.body, {
          status: retryResponse.status,
          headers: buildResponseHeaders(retryResponse),
        });
      }
    }

    return new Response(response.body, {
      status: response.status,
      headers: buildResponseHeaders(response),
    });
  } catch (error) {
    console.error("Durable Stream proxy error:", error);
    return new Response("Durable Stream unavailable", { status: 503 });
  }
}
