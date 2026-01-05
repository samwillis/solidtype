/**
 * AI Chat Validators
 *
 * Zod schemas for AI chat-related inputs.
 * Uses context and status enums from entity schema.
 */

import { z } from "zod";
import { aiChatContextEnum, aiChatStatusEnum } from "../schemas/entities/ai-chat-session";

// ============================================================================
// Common Schemas
// ============================================================================

export const sessionIdSchema = z.object({
  sessionId: z.uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createChatSessionSchema = z.object({
  session: z.object({
    id: z.uuid().optional(),
    context: aiChatContextEnum,
    document_id: z.uuid().nullable().optional(),
    project_id: z.uuid().nullable().optional(),
    title: z.string().max(200).optional(),
  }),
});

export const createChatSessionDirectSchema = z.object({
  context: aiChatContextEnum,
  documentId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  title: z.string().max(200).optional(),
});

export const updateChatSessionSchema = z.object({
  sessionId: z.uuid(),
  updates: z.object({
    title: z.string().max(200).optional(),
    status: aiChatStatusEnum.optional(),
  }),
});

export const deleteChatSessionSchema = z.object({
  sessionId: z.uuid(),
});

// ============================================================================
// Types
// ============================================================================

export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;
export type CreateChatSessionDirectInput = z.infer<typeof createChatSessionDirectSchema>;
export type UpdateChatSessionInput = z.infer<typeof updateChatSessionSchema>;
export type DeleteChatSessionInput = z.infer<typeof deleteChatSessionSchema>;
