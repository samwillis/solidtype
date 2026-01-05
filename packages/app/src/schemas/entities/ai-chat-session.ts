/**
 * AI Chat Session Entity Schema
 *
 * Stores metadata for AI chat sessions.
 * Actual message content is stored in Durable Streams for efficient streaming/resumption.
 */

import { z } from "zod";
import { dateField, nullableDateField } from "../common";

// ============================================================================
// Enums
// ============================================================================

/** Chat context type enum */
export const aiChatContextEnum = z.enum(["dashboard", "editor"]);
export type AIChatContext = z.infer<typeof aiChatContextEnum>;

/** Chat status enum */
export const aiChatStatusEnum = z.enum([
  "active", // Currently in use
  "archived", // User closed/archived
  "error", // Session ended with error
]);
export type AIChatStatus = z.infer<typeof aiChatStatusEnum>;

// ============================================================================
// Schema
// ============================================================================

/**
 * Full AI chat session schema matching database structure.
 * Uses snake_case to match Electric sync format.
 *
 * Input: Accepts string dates (from API/Electric) or Date objects (from re-insert)
 * Output: All dates as Date objects
 */
export const aiChatSessionSchema = z.object({
  id: z.uuid(),
  user_id: z.string(), // text ID from better-auth
  context: aiChatContextEnum,
  document_id: z.uuid().nullable(),
  project_id: z.uuid().nullable(),
  status: aiChatStatusEnum,
  title: z.string().nullable(),
  message_count: z.number(),
  last_message_at: nullableDateField,
  durable_stream_id: z.string().nullable(),
  created_at: dateField,
  updated_at: dateField,
});

// ============================================================================
// Types
// ============================================================================

/** Input type - what you pass to insert/update (dates can be strings) */
export type AIChatSessionInput = z.input<typeof aiChatSessionSchema>;

/** Output type - what you get from queries (dates are Date objects) */
export type AIChatSessionOutput = z.output<typeof aiChatSessionSchema>;

/** Re-export for backwards compatibility */
export type AIChatSession = AIChatSessionOutput;
