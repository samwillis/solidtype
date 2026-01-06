/**
 * StreamDB Factory for AI Chat
 *
 * Creates StreamDB instances for chat sessions using @durable-streams/state.
 * Each session has its own StreamDB backed by a Durable Stream.
 */

import { createStreamDB, type StreamDB } from "@durable-streams/state";
import { chatStateSchema } from "./schema";
import { getChatStreamId } from "../session";

// Durable Streams server URL (direct access, no auth proxy)
// Note: Server-side functions use this directly; client-side uses the auth proxy
// Use import.meta.env for Vite compatibility in workers/browser
const getDurableStreamsUrl = (): string => {
  // In browser/worker: this code path shouldn't be reached (we use the proxy)
  // On server (SSR/API routes): Vite replaces import.meta.env at build time
  if (typeof import.meta !== "undefined" && import.meta.env?.DURABLE_STREAMS_URL) {
    return import.meta.env.DURABLE_STREAMS_URL;
  }
  return "http://localhost:3200";
};

/**
 * StreamDB type with our chat state schema
 */
export type ChatStreamDB = StreamDB<typeof chatStateSchema>;

/**
 * Create a StreamDB instance for a chat session (client-side via auth proxy)
 *
 * @param sessionId - The chat session UUID
 * @returns A StreamDB instance backed by the session's Durable Stream
 */
export function createChatStreamDB(sessionId: string): ChatStreamDB {
  // Client-side: use the app's proxy endpoint (handles auth)
  // Note: In SharedWorkers, `window` is undefined but `self.location` works
  const apiBase = getClientOrigin();

  return createStreamDB({
    streamOptions: {
      url: `${apiBase}/api/ai/sessions/${sessionId}/stream`,
      contentType: "application/json",
    },
    state: chatStateSchema,
  });
}

/**
 * Get the origin URL for client-side requests
 * Works in both main thread (window) and workers (self)
 */
function getClientOrigin(): string {
  // Check for window (main thread)
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  // Check for self (workers - SharedWorker, Worker, ServiceWorker)
  if (typeof self !== "undefined" && self.location?.origin) {
    return self.location.origin;
  }
  // Fallback for SSR/Node
  return "http://localhost:3000";
}

/**
 * Create a StreamDB instance for server-side use (direct to Durable Streams)
 *
 * This bypasses the auth proxy since server-side code has already authenticated.
 *
 * @param sessionId - The chat session UUID
 * @returns A StreamDB instance connected directly to Durable Streams
 */
export function createServerChatStreamDB(sessionId: string): ChatStreamDB {
  const streamId = getChatStreamId(sessionId);
  const baseUrl = getDurableStreamsUrl();

  return createStreamDB({
    streamOptions: {
      url: `${baseUrl}/v1/stream/${streamId}`,
      contentType: "application/json",
    },
    state: chatStateSchema,
  });
}

/**
 * Ensure the stream exists in Durable Streams, creating it if needed
 *
 * @param sessionId - The chat session UUID
 */
async function ensureStreamExists(sessionId: string): Promise<void> {
  const streamId = getChatStreamId(sessionId);
  const baseUrl = getDurableStreamsUrl();
  const url = `${baseUrl}/v1/stream/${streamId}`;

  // Create stream with PUT (idempotent - safe to call if already exists)
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok && response.status !== 409) {
    // 409 = already exists, which is fine
    throw new Error(`Failed to create stream: ${response.status} ${response.statusText}`);
  }
}

/**
 * Preload a StreamDB and return when ready (client-side)
 *
 * @param sessionId - The chat session UUID
 * @returns A preloaded StreamDB instance
 */
export async function createAndPreloadChatStreamDB(sessionId: string): Promise<ChatStreamDB> {
  const db = createChatStreamDB(sessionId);
  await db.preload();
  return db;
}

/**
 * Preload a StreamDB and return when ready (server-side, direct access)
 *
 * Creates the stream if it doesn't exist.
 *
 * @param sessionId - The chat session UUID
 * @returns A preloaded StreamDB instance
 */
export async function createAndPreloadServerChatStreamDB(sessionId: string): Promise<ChatStreamDB> {
  // Ensure stream exists before trying to read from it
  await ensureStreamExists(sessionId);

  const db = createServerChatStreamDB(sessionId);
  await db.preload();
  return db;
}
