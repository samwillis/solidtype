/**
 * Durable State Schema for AI Chat
 *
 * Defines the state schema for chat transcripts using @durable-streams/state.
 * Each Durable Stream corresponds to exactly one chat session.
 *
 * Design principles:
 * - No `sessionId` on records — the stream itself represents the session
 * - Chunks are insert-only — never update, just append
 * - Messages have lifecycle status — `streaming` → `complete` or `error`
 * - Runs track exchange boundaries — one run = user message + assistant response + tool calls
 *
 * Note: Unlike Electric SQL collections, Durable Streams use JSON serialization,
 * so we keep dates as ISO strings rather than Date objects.
 */

import { createStateSchema } from "@durable-streams/state";
import { z } from "zod";

/**
 * Message roles in the chat transcript
 */
export const messageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool_call",
  "tool_result",
  "error",
]);

/**
 * Message status lifecycle
 */
export const messageStatusSchema = z.enum([
  "streaming", // Assistant message being generated
  "complete", // Message finished successfully
  "pending", // Tool call awaiting execution/approval
  "running", // Tool call being executed
  "error", // Message/operation failed
]);

/**
 * Run status lifecycle
 */
export const runStatusSchema = z.enum(["running", "complete", "error"]);

/**
 * Message record schema
 *
 * Uses string dates for JSON serialization compatibility with Durable Streams.
 */
export const messageSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  role: messageRoleSchema,
  status: messageStatusSchema,
  content: z.string().optional(),
  parentMessageId: z.uuid().optional(),
  toolName: z.string().optional(),
  toolArgs: z.unknown().optional(),
  toolCallId: z.string().optional(),
  toolResult: z.unknown().optional(),
  requiresApproval: z.boolean().optional(),
  createdAt: z.string(), // ISO date string
  updatedAt: z.string().optional(), // ISO date string
});

/**
 * Chunk record schema (insert-only)
 * ID format: ${messageId}:${seq} for deterministic idempotent retries
 *
 * Uses string dates for JSON serialization compatibility.
 */
export const chunkSchema = z.object({
  id: z.string(), // ${messageId}:${seq}
  messageId: z.uuid(),
  seq: z.number(),
  delta: z.string(),
  createdAt: z.string(), // ISO date string
});

/**
 * Run record schema
 * Tracks a complete exchange: user message + assistant response + tool calls
 *
 * Uses string dates for JSON serialization compatibility.
 */
export const runSchema = z.object({
  id: z.uuid(),
  status: runStatusSchema,
  userMessageId: z.uuid(),
  assistantMessageId: z.uuid(),
  startedAt: z.string(), // ISO date string
  endedAt: z.string().optional(), // ISO date string
  error: z.string().optional(),
});

/**
 * Chat state schema for Durable Streams
 */
export const chatStateSchema = createStateSchema({
  messages: {
    schema: messageSchema,
    type: "message",
    primaryKey: "id",
  },
  chunks: {
    schema: chunkSchema,
    type: "chunk",
    primaryKey: "id",
  },
  runs: {
    schema: runSchema,
    type: "run",
    primaryKey: "id",
  },
});

// ============================================================================
// Type exports
// ============================================================================

export type Message = z.infer<typeof messageSchema>;
export type MessageRole = z.infer<typeof messageRoleSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type Chunk = z.infer<typeof chunkSchema>;
export type Run = z.infer<typeof runSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
