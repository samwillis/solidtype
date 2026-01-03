/**
 * Durable Stream Persistence Layer
 *
 * Handles encoding/decoding and storage of chat messages to Durable Streams.
 * Uses lib0 binary encoding for efficient storage.
 */

import { getChatStreamId, type ChatMessage } from "./session";
import { StreamChunkSchema, type StreamChunk } from "./persistence-types";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// Get Durable Streams URL - works on both client and server
function getDurableStreamsUrl(): string {
  if (typeof window !== "undefined") {
    // Client-side: use Vite env var
    return (import.meta.env.VITE_DURABLE_STREAMS_URL as string) || "http://localhost:3200";
  } else {
    // Server-side: use process.env (non-VITE prefixed) or default
    return process.env.DURABLE_STREAMS_URL || "http://localhost:3200";
  }
}

/**
 * Encode a single chunk to binary
 */
function encodeChunk(chunk: StreamChunk): Uint8Array {
  const encoder = encoding.createEncoder();
  const json = JSON.stringify(chunk);
  encoding.writeVarString(encoder, json);
  return encoding.toUint8Array(encoder);
}

/**
 * Decode chunks from binary data
 */
function decodeChunks(data: Uint8Array): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  const decoder = decoding.createDecoder(data);

  while (decoder.pos < data.length) {
    try {
      const json = decoding.readVarString(decoder);
      const parsed = JSON.parse(json);
      const result = StreamChunkSchema.safeParse(parsed);
      if (result.success) {
        chunks.push(result.data);
      } else {
        console.warn("Invalid chunk in stream:", result.error);
      }
    } catch {
      // End of valid data
      break;
    }
  }

  return chunks;
}

/**
 * Persist a single chunk to the Durable Stream
 * Silently fails if Durable Streams is unavailable (e.g., not running in dev)
 */
export async function persistChunk(sessionId: string, chunk: StreamChunk): Promise<void> {
  const streamId = getChatStreamId(sessionId);
  const data = encodeChunk(chunk);

  try {
    const baseUrl = getDurableStreamsUrl();
    let response = await fetch(`${baseUrl}/v1/stream/${streamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: data as unknown as BodyInit,
    });

    // If stream doesn't exist (404), create it first with PUT, then retry POST
    if (response.status === 404) {
      const createResponse = await fetch(`${baseUrl}/v1/stream/${streamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
      });

      if (!createResponse.ok) {
        console.warn(`Failed to create stream ${streamId}: ${createResponse.status}`);
        return;
      }

      // Retry the POST now that the stream exists
      response = await fetch(`${baseUrl}/v1/stream/${streamId}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: data as unknown as BodyInit,
      });
    }

    if (!response.ok) {
      console.warn(
        `Failed to persist chunk to Durable Streams (${streamId}): ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    // Silently fail - Durable Streams may not be running in development
    // Chat will still work, messages just won't be persisted to streams
    console.debug(`Durable Streams unavailable for ${streamId}, skipping persistence:`, error);
  }
}

/**
 * Persist streaming response chunks as they arrive
 * Silently fails if Durable Streams is unavailable
 */
export async function persistStreamingResponse(
  sessionId: string,
  messageId: string,
  stream: ReadableStream<string>
): Promise<void> {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await persistChunk(sessionId, {
        type: "assistant-chunk",
        messageId,
        content: value,
        timestamp: new Date().toISOString(),
      });
    }

    await persistChunk(sessionId, {
      type: "assistant-complete",
      messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Don't throw - persistence failures shouldn't break the chat
    console.debug("Failed to persist streaming response:", error);
  }
}

/**
 * Load and reconstruct chat history from Durable Stream
 * Returns empty array if Durable Streams is unavailable (e.g., not running in dev)
 */
export async function loadChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const streamId = getChatStreamId(sessionId);

  try {
    const baseUrl = getDurableStreamsUrl();
    const response = await fetch(`${baseUrl}/v1/stream/${streamId}?offset=-1`, {
      headers: { Accept: "application/octet-stream" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return []; // New session, no history yet
      }
      // Service unavailable - return empty array, chat will still work
      console.debug(`Durable Streams returned ${response.status}, starting with empty history`);
      return [];
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const chunks = decodeChunks(data);
    // Reconstruct messages from chunks
    return reconstructMessages(chunks);
  } catch (error) {
    // Connection refused or network error - Durable Streams may not be running
    // Return empty array so chat can still work
    console.debug("Durable Streams unavailable, starting with empty history:", error);
    return [];
  }
}

/**
 * Reconstruct ChatMessage array from stream chunks
 */
function reconstructMessages(chunks: StreamChunk[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const assistantMessages = new Map<
    string,
    {
      content: string;
      toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
    }
  >();

  for (const chunk of chunks) {
    switch (chunk.type) {
      case "user-message":
        messages.push({
          id: chunk.id,
          role: "user",
          content: chunk.content,
          timestamp: chunk.timestamp,
        });
        break;

      case "assistant-chunk": {
        const existing = assistantMessages.get(chunk.messageId) || { content: "", toolCalls: [] };
        existing.content += chunk.content;
        assistantMessages.set(chunk.messageId, existing);
        break;
      }

      case "assistant-complete": {
        const msg = assistantMessages.get(chunk.messageId);
        if (msg) {
          messages.push({
            id: chunk.messageId,
            role: "assistant",
            content: msg.content,
            toolCalls: msg.toolCalls.length > 0 ? msg.toolCalls : undefined,
            timestamp: chunk.timestamp,
          });
          assistantMessages.delete(chunk.messageId);
        }
        break;
      }

      case "tool-call": {
        const msg = assistantMessages.get(chunk.messageId) || { content: "", toolCalls: [] };
        msg.toolCalls.push({
          id: chunk.id,
          name: chunk.name,
          arguments: chunk.arguments,
        });
        assistantMessages.set(chunk.messageId, msg);
        break;
      }

      case "tool-result":
        messages.push({
          id: chunk.toolCallId,
          role: "tool",
          content: JSON.stringify(chunk.result),
          toolResults: [{ toolCallId: chunk.toolCallId, result: chunk.result }],
          timestamp: chunk.timestamp,
        });
        break;
    }
  }

  return messages;
}
