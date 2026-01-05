/**
 * AI Chat Validators
 *
 * Zod schemas for AI chat-related inputs.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createChatSessionSchema = z.object({
  session: z.object({
    id: z.string().uuid().optional(),
    context: z.enum(["dashboard", "editor"]),
    document_id: z.string().uuid().nullable().optional(),
    project_id: z.string().uuid().nullable().optional(),
    title: z.string().max(200).optional(),
  }),
});

export const createChatSessionDirectSchema = z.object({
  context: z.enum(["dashboard", "editor"]),
  documentId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).optional(),
});

export const updateChatSessionSchema = z.object({
  sessionId: z.string().uuid(),
  updates: z.object({
    title: z.string().max(200).optional(),
    status: z.enum(["active", "archived", "error"]).optional(),
  }),
});

export const deleteChatSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

// ============================================================================
// Types
// ============================================================================

export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;
export type CreateChatSessionDirectInput = z.infer<typeof createChatSessionDirectSchema>;
export type UpdateChatSessionInput = z.infer<typeof updateChatSessionSchema>;
export type DeleteChatSessionInput = z.infer<typeof deleteChatSessionSchema>;
