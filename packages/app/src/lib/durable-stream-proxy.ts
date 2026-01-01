/**
 * Durable Streams proxy utilities
 *
 * Proxies Durable Stream requests with proper authorization.
 */

const DURABLE_STREAMS_URL = process.env.DURABLE_STREAMS_URL || "http://localhost:4437";

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
    const response = await fetch(durableUrl.toString(), {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/octet-stream",
        Accept: request.headers.get("Accept") || "*/*",
      },
      body: request.method === "POST" ? request.body : undefined,
      // @ts-expect-error duplex is needed for streaming request bodies
      duplex: request.method === "POST" ? "half" : undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": response.headers.get("Cache-Control") || "no-cache",
      },
    });
  } catch (error) {
    console.error("Durable Stream proxy error:", error);
    return new Response("Durable Stream unavailable", { status: 503 });
  }
}
