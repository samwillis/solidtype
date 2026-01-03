/**
 * Stream Chunk Types for Durable Stream Persistence
 *
 * Defines the structure of chunks stored in Durable Streams for AI chat.
 */

import { z } from "zod";

/**
 * Stream chunk types stored in Durable Stream
 */
export const StreamChunkSchema = z.discriminatedUnion("type", [
  // User message
  z.object({
    type: z.literal("user-message"),
    id: z.string(),
    content: z.string(),
    timestamp: z.string(),
  }),
  // Assistant text chunk (streaming)
  z.object({
    type: z.literal("assistant-chunk"),
    messageId: z.string(),
    content: z.string(),
    timestamp: z.string(),
  }),
  // Assistant message complete
  z.object({
    type: z.literal("assistant-complete"),
    messageId: z.string(),
    timestamp: z.string(),
  }),
  // Tool call
  z.object({
    type: z.literal("tool-call"),
    id: z.string(),
    messageId: z.string(),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    timestamp: z.string(),
  }),
  // Tool result
  z.object({
    type: z.literal("tool-result"),
    toolCallId: z.string(),
    messageId: z.string(),
    result: z.unknown(),
    error: z.string().optional(),
    timestamp: z.string(),
  }),
]);

export type StreamChunk = z.infer<typeof StreamChunkSchema>;
