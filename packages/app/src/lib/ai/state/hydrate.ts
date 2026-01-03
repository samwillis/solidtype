/**
 * Transcript Hydration Utilities
 *
 * Reconstructs chat transcripts from Durable State.
 * Assembles complete messages from chunks and orders by timestamp.
 */

import type { ChatStreamDB } from "./db";
import type { Message, Chunk } from "./schema";

/**
 * A hydrated message with assembled content
 */
export interface HydratedMessage {
  id: string;
  runId: string;
  role: Message["role"];
  status: Message["status"];
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolCallId?: string;
  toolResult?: unknown;
  requiresApproval?: boolean;
  createdAt: string;
}

/**
 * Hydrate a transcript from StreamDB collections
 *
 * This joins messages with their chunks (for assistant messages),
 * filters out error pseudo-messages, and sorts by creation time.
 *
 * @param db - The StreamDB instance with loaded state
 * @returns Array of hydrated messages in chronological order
 */
export function hydrateTranscript(db: ChatStreamDB): HydratedMessage[] {
  const messages = Array.from(db.collections.messages.values());
  const chunks = Array.from(db.collections.chunks.values());

  // Group chunks by messageId
  const chunksByMessage = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const existing = chunksByMessage.get(chunk.messageId) || [];
    existing.push(chunk);
    chunksByMessage.set(chunk.messageId, existing);
  }

  // Hydrate messages
  const hydrated: HydratedMessage[] = messages
    .filter((m) => m.role !== "error") // Exclude error pseudo-messages from history
    .map((m) => {
      let content = m.content || "";

      // For assistant messages, concatenate chunks
      if (m.role === "assistant") {
        const messageChunks = chunksByMessage.get(m.id) || [];
        messageChunks.sort((a, b) => a.seq - b.seq);
        content = messageChunks.map((c) => c.delta).join("");
      }

      return {
        id: m.id,
        runId: m.runId,
        role: m.role,
        status: m.status,
        content,
        toolName: m.toolName,
        toolArgs: m.toolArgs,
        toolCallId: m.toolCallId,
        toolResult: m.toolResult,
        requiresApproval: m.requiresApproval,
        createdAt: m.createdAt,
      };
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return hydrated;
}

/**
 * Hydrate messages from raw arrays (for use outside StreamDB context)
 *
 * @param messages - Array of message records
 * @param chunks - Array of chunk records
 * @returns Array of hydrated messages in chronological order
 */
export function hydrateFromArrays(messages: Message[], chunks: Chunk[]): HydratedMessage[] {
  // Group chunks by messageId
  const chunksByMessage = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const existing = chunksByMessage.get(chunk.messageId) || [];
    existing.push(chunk);
    chunksByMessage.set(chunk.messageId, existing);
  }

  // Role order for secondary sorting when timestamps are equal
  // User messages come before assistant messages in the same run
  const roleOrder: Record<string, number> = {
    user: 0,
    assistant: 1,
    tool_call: 2,
    tool_result: 3,
    error: 4,
    system: -1,
  };

  // Hydrate messages
  return messages
    .filter((m) => m.role !== "error")
    .map((m) => {
      let content = m.content || "";

      if (m.role === "assistant") {
        const messageChunks = chunksByMessage.get(m.id) || [];
        messageChunks.sort((a, b) => a.seq - b.seq);
        content = messageChunks.map((c) => c.delta).join("");
      }

      return {
        id: m.id,
        runId: m.runId,
        role: m.role,
        status: m.status,
        content,
        toolName: m.toolName,
        toolArgs: m.toolArgs,
        toolCallId: m.toolCallId,
        toolResult: m.toolResult,
        requiresApproval: m.requiresApproval,
        createdAt: m.createdAt,
      };
    })
    .sort((a, b) => {
      // Primary sort by timestamp
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;

      // Secondary sort by role order when timestamps are equal
      return (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
    });
}

/**
 * Model message role type (for LLM APIs)
 * Note: "system" is not included as it's passed separately to TanStack AI
 */
type ModelRole = "user" | "assistant";

/**
 * Model message format (for LLM APIs)
 *
 * We only include user and assistant messages in history.
 * Tool calls/results are handled by TanStack AI during the current run.
 */
export interface ModelMessage {
  role: ModelRole;
  content: string;
}

/**
 * Build model-compatible messages from hydrated transcript
 * Converts to the format expected by LLM APIs
 * Note: System messages are not included - pass them separately via the `system` parameter
 *
 * @param transcript - Hydrated messages
 * @returns Messages in LLM API format
 */
export function toModelMessages(transcript: HydratedMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const m of transcript) {
    // Only include user and assistant messages
    // Tool calls and results are complex to replay correctly and TanStack AI
    // handles them internally during the current run. For history, we just
    // need the user prompts and final assistant responses.
    if (m.role !== "user" && m.role !== "assistant") {
      continue;
    }

    // Skip assistant messages that are streaming or error (incomplete)
    if (m.role === "assistant" && (m.status === "streaming" || m.status === "error")) {
      continue;
    }

    // Skip assistant messages with no content (tool-call-only messages)
    if (m.role === "assistant" && (!m.content || m.content.trim() === "")) {
      continue;
    }

    const message: ModelMessage = {
      role: m.role,
      content: m.content,
    };

    result.push(message);
  }

  return result;
}
