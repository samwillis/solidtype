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
type ModelRole = "user" | "assistant" | "tool";

/**
 * Tool call structure for assistant messages
 */
interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Model message format (for LLM APIs / TanStack AI)
 *
 * Supports user, assistant (with optional toolCalls), and tool result messages.
 * Note: TanStack AI uses camelCase (toolCallId, toolCalls) internally.
 */
export interface ModelMessage {
  role: ModelRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/**
 * Build model-compatible messages from hydrated transcript
 * Converts to the format expected by LLM APIs (OpenAI format)
 *
 * For multi-turn conversations with tools, we include:
 * 1. User messages
 * 2. Assistant messages (with tool_calls array if any)
 * 3. Tool result messages (immediately after the assistant message that called them)
 *
 * Note: System messages are not included - pass them separately via the `system` parameter
 *
 * @param transcript - Hydrated messages
 * @returns Messages in LLM API format
 */
export function toModelMessages(transcript: HydratedMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  // Group messages by runId to associate tool calls with their results
  const messagesByRun = new Map<string, HydratedMessage[]>();
  for (const m of transcript) {
    const existing = messagesByRun.get(m.runId) || [];
    existing.push(m);
    messagesByRun.set(m.runId, existing);
  }

  // Get unique runs in order (by first message timestamp)
  const runOrder = Array.from(messagesByRun.entries())
    .sort(
      ([, a], [, b]) =>
        new Date(a[0]?.createdAt || 0).getTime() - new Date(b[0]?.createdAt || 0).getTime()
    )
    .map(([runId]) => runId);

  for (const runId of runOrder) {
    const runMessages = messagesByRun.get(runId) || [];

    // Find messages by role for this run
    const userMsg = runMessages.find((m) => m.role === "user");
    const assistantMsg = runMessages.find((m) => m.role === "assistant");
    const toolCalls = runMessages.filter((m) => m.role === "tool_call");
    const toolResults = runMessages.filter((m) => m.role === "tool_result");

    // Add user message
    if (userMsg && userMsg.content) {
      result.push({
        role: "user",
        content: userMsg.content,
      });
    }

    // Add assistant message with tool calls
    if (assistantMsg) {
      // Skip streaming/error assistant messages
      if (assistantMsg.status === "streaming" || assistantMsg.status === "error") {
        continue;
      }

      const assistantMessage: ModelMessage = {
        role: "assistant",
        content: assistantMsg.content || "",
      };

      // Filter valid tool calls (must have non-empty toolName and toolCallId)
      const validToolCalls = toolCalls.filter(
        (tc) => tc.toolName && tc.toolCallId && tc.toolCallId.length > 0
      );

      // If there were valid tool calls, add them to the assistant message
      if (validToolCalls.length > 0) {
        assistantMessage.toolCalls = validToolCalls.map((tc) => ({
          id: tc.toolCallId!,
          type: "function" as const,
          function: {
            name: tc.toolName!,
            arguments: JSON.stringify(tc.toolArgs || {}),
          },
        }));
      }

      // Only add if there's content or toolCalls
      if (assistantMessage.content || (assistantMessage.toolCalls?.length ?? 0) > 0) {
        result.push(assistantMessage);
      }

      // Add tool results (must come after assistant message with toolCalls)
      // Only add for valid tool calls that we included above
      for (const toolCall of validToolCalls) {
        const matchingResult = toolResults.find((tr) => tr.toolCallId === toolCall.toolCallId);
        if (matchingResult && toolCall.toolCallId) {
          result.push({
            role: "tool",
            toolCallId: toolCall.toolCallId,
            content: JSON.stringify(matchingResult.toolResult ?? { success: true }),
          });
        }
      }
    }
  }

  return result;
}
