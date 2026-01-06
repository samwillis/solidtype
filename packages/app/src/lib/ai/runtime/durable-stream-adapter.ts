/**
 * Durable Stream Adapter for TanStack AI
 *
 * Custom connection adapter that uses Durable Streams as the transport layer.
 * Converts Durable Stream records (messages, chunks, runs) to TanStack AI StreamChunks.
 *
 * This enables:
 * - Resilient streaming that survives browser/worker closure
 * - Multi-tab synchronization of chat state
 * - Server-side persistence of LLM responses
 * - Client tool execution in the worker
 */

import { createChatStreamDB, type ChatStreamDB } from "../state/db";
import type { Message, Chunk, Run } from "../state/schema";

/**
 * TanStack AI StreamChunk types (simplified for our needs)
 * These match the types from @tanstack/ai
 */
export interface ContentStreamChunk {
  type: "content";
  delta: string;
  content: string;
}

export interface ToolCallStreamChunk {
  type: "tool_call";
  toolCall: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  };
}

export interface ToolResultStreamChunk {
  type: "tool_result";
  toolCallId: string;
  content: unknown;
}

export interface DoneStreamChunk {
  type: "done";
  finishReason: "stop" | "error" | "tool_calls";
}

export interface ErrorStreamChunk {
  type: "error";
  error: Error;
}

export type StreamChunk =
  | ContentStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk;

/**
 * Options for the Durable Stream adapter
 */
export interface DurableStreamAdapterOptions {
  sessionId: string;
  documentId?: string;
  projectId?: string;
  /** Polling interval in ms for checking new records (default: 100ms) */
  pollInterval?: number;
}

/**
 * State tracked during streaming
 */
interface StreamState {
  /** Last chunk sequence number processed */
  lastChunkSeq: number;
  /** Tool call message IDs we've already yielded */
  seenToolCalls: Set<string>;
  /** Tool result message IDs we've already yielded */
  seenToolResults: Set<string>;
  /** Accumulated content for the content field */
  accumulatedContent: string;
}

/**
 * Create an async generator that yields StreamChunks from a Durable Stream
 *
 * This function:
 * 1. Connects to the Durable Stream for the session
 * 2. Polls for new records (chunks, tool_calls, tool_results)
 * 3. Converts records to TanStack AI StreamChunk format
 * 4. Yields chunks until the run completes
 *
 * @param sessionId - The chat session ID
 * @param runId - The run ID to stream
 * @param signal - AbortSignal for cancellation
 * @param pollInterval - Polling interval in ms
 */
export async function* streamChunksFromDurableStream(
  sessionId: string,
  runId: string,
  signal?: AbortSignal,
  pollInterval = 100
): AsyncGenerator<StreamChunk, void, unknown> {
  const db = createChatStreamDB(sessionId);

  try {
    // preload() establishes a live subscription that keeps collections updated
    await db.preload();
    console.log("[DurableStreamAdapter] Connected to stream:", sessionId);

    const state: StreamState = {
      lastChunkSeq: -1,
      seenToolCalls: new Set(),
      seenToolResults: new Set(),
      accumulatedContent: "",
    };

    let done = false;

    while (!done && !signal?.aborted) {
      // Collections are updated in real-time via the preload subscription
      // Poll for new records that match our run

      // Check for new chunks
      const newChunks = getNewChunks(db, runId, state);
      for (const chunk of newChunks) {
        state.accumulatedContent += chunk.delta;
        yield {
          type: "content",
          delta: chunk.delta,
          content: state.accumulatedContent,
        };
      }

      // Check for new tool calls
      const newToolCalls = getNewToolCalls(db, runId, state);
      for (const toolCall of newToolCalls) {
        yield {
          type: "tool_call",
          toolCall: {
            id: toolCall.toolCallId || toolCall.id,
            function: {
              name: toolCall.toolName || "",
              arguments: JSON.stringify(toolCall.toolArgs || {}),
            },
          },
        };
      }

      // Check for new tool results
      const newToolResults = getNewToolResults(db, runId, state);
      for (const toolResult of newToolResults) {
        yield {
          type: "tool_result",
          toolCallId: toolResult.toolCallId || "",
          content: toolResult.toolResult,
        };
      }

      // Check if run is complete
      const run = getRun(db, runId);
      if (run) {
        if (run.status === "complete") {
          done = true;
          yield { type: "done", finishReason: "stop" };
        } else if (run.status === "error") {
          done = true;
          yield { type: "done", finishReason: "error" };
        }
      }

      if (!done) {
        // Small delay before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    if (signal?.aborted) {
      console.log("[DurableStreamAdapter] Aborted");
    }
  } catch (error) {
    console.error("[DurableStreamAdapter] Error:", error);
    yield {
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    db.close();
  }
}

/**
 * Get the assistant message ID for a run
 */
function getAssistantMessageId(db: ChatStreamDB, runId: string): string | null {
  const runs = Array.from(db.collections.runs.values());
  const run = runs.find((r) => r.id === runId);
  return run?.assistantMessageId || null;
}

/**
 * Get new chunks since last check
 */
function getNewChunks(db: ChatStreamDB, runId: string, state: StreamState): Chunk[] {
  const assistantMessageId = getAssistantMessageId(db, runId);
  if (!assistantMessageId) return [];

  const allChunks = Array.from(db.collections.chunks.values());
  const relevantChunks = allChunks
    .filter((c) => c.messageId === assistantMessageId && c.seq > state.lastChunkSeq)
    .sort((a, b) => a.seq - b.seq);

  if (relevantChunks.length > 0) {
    state.lastChunkSeq = relevantChunks[relevantChunks.length - 1].seq;
  }

  return relevantChunks;
}

/**
 * Get new tool calls since last check
 */
function getNewToolCalls(db: ChatStreamDB, runId: string, state: StreamState): Message[] {
  const allMessages = Array.from(db.collections.messages.values());
  const newToolCalls = allMessages.filter(
    (m) => m.role === "tool_call" && m.runId === runId && !state.seenToolCalls.has(m.id)
  );

  for (const tc of newToolCalls) {
    state.seenToolCalls.add(tc.id);
  }

  return newToolCalls;
}

/**
 * Get new tool results since last check
 */
function getNewToolResults(db: ChatStreamDB, runId: string, state: StreamState): Message[] {
  const allMessages = Array.from(db.collections.messages.values());
  const newToolResults = allMessages.filter(
    (m) => m.role === "tool_result" && m.runId === runId && !state.seenToolResults.has(m.id)
  );

  for (const tr of newToolResults) {
    state.seenToolResults.add(tr.id);
  }

  return newToolResults;
}

/**
 * Get run by ID
 */
function getRun(db: ChatStreamDB, runId: string): Run | undefined {
  return db.collections.runs.get(runId);
}

/**
 * Resume streaming an existing run
 *
 * Similar to streamChunksFromDurableStream but handles catching up on
 * existing records before switching to live streaming.
 *
 * @param sessionId - The chat session ID
 * @param runId - The run ID to resume
 * @param signal - AbortSignal for cancellation
 */
export async function* resumeStreamFromDurableStream(
  sessionId: string,
  runId: string,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  // For now, resume is the same as start - we catch up on all records
  // The adapter will yield all existing records, then continue polling for new ones
  yield* streamChunksFromDurableStream(sessionId, runId, signal);
}

/**
 * Check if there's an active (running) run for a session
 */
export async function getActiveRun(sessionId: string): Promise<Run | null> {
  const db = createChatStreamDB(sessionId);
  try {
    await db.preload();
    const runs = Array.from(db.collections.runs.values());
    const activeRun = runs.find((r) => r.status === "running");
    return activeRun || null;
  } finally {
    db.close();
  }
}
