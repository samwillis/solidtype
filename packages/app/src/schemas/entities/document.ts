/**
 * Document Entity Schema
 *
 * Documents are the actual CAD files (parts, assemblies, etc).
 * Each document has a Yjs document synced via Durable Streams.
 */

import { z } from "zod";
import { dateField, nullableDateField } from "../common";

// ============================================================================
// Enums
// ============================================================================

/** Document type enum matching database definition */
export const documentTypeEnum = z.enum([
  "part", // CAD part (current focus)
  "assembly", // Future: assembly of parts
  "drawing", // Future: 2D drawings
  "sketch", // Future: standalone sketch
  "file", // Future: attached files
  "notes", // Future: rich text notes
]);

export type DocumentType = z.infer<typeof documentTypeEnum>;

// ============================================================================
// Schema
// ============================================================================

/**
 * Full document schema matching database structure.
 * Uses snake_case to match Electric sync format.
 *
 * Input: Accepts string dates (from API/Electric) or Date objects (from re-insert)
 * Output: All dates as Date objects
 */
export const documentSchema = z.object({
  id: z.uuid(),
  base_document_id: z.uuid().nullable(), // For branching: tracks sibling documents across branches
  project_id: z.uuid(),
  branch_id: z.uuid(),
  name: z.string(),
  type: documentTypeEnum,
  folder_id: z.uuid().nullable(),
  sort_order: z.number(),
  feature_count: z.number().nullable(), // Feature count for quick display
  durable_stream_id: z.string().nullable(),
  created_at: dateField,
  updated_at: dateField,
  created_by: z.string(), // text ID from better-auth
  last_edited_by: z.string().nullable(),
  is_deleted: z.boolean(),
  deleted_at: nullableDateField,
  deleted_by: z.string().nullable(),
});

// ============================================================================
// Types
// ============================================================================

/** Input type - what you pass to insert/update (dates can be strings) */
export type DocumentInput = z.input<typeof documentSchema>;

/** Output type - what you get from queries (dates are Date objects) */
export type DocumentOutput = z.output<typeof documentSchema>;

/** Re-export for backwards compatibility */
export type Document = DocumentOutput;
