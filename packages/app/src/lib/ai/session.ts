/**
 * Chat Session Types and Helpers
 *
 * Defines the session structure for AI chat conversations.
 * Sessions are stored in PostgreSQL (metadata) with messages in Durable Streams.
 */

import { z } from "zod";

// Zod schemas for runtime validation
export const ChatSessionSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  context: z.enum(["dashboard", "editor"]),
  documentId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  status: z.enum(["active", "archived", "error"]),
  title: z.string().nullable(),
  messageCount: z.number(),
  lastMessageAt: z.string().nullable(),
  durableStreamId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChatSession = z.infer<typeof ChatSessionSchema>;

// Message schema (stored in Durable Stream, not PostgreSQL)
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()),
      })
    )
    .optional(),
  toolResults: z
    .array(
      z.object({
        toolCallId: z.string(),
        result: z.unknown(),
      })
    )
    .optional(),
  timestamp: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// Stream ID format for Durable Streams
export function getChatStreamId(sessionId: string): string {
  return `ai-chat/${sessionId}`;
}

// Context types
export type AIChatContext = "dashboard" | "editor";
export type AIChatStatus = "active" | "archived" | "error";
