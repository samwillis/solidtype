/**
 * Folder Entity Schema
 *
 * Folders provide hierarchical organization within a branch.
 */

import { z } from "zod";
import { dateField } from "../common";

// ============================================================================
// Schema
// ============================================================================

/**
 * Full folder schema matching database structure.
 * Uses snake_case to match Electric sync format.
 *
 * Input: Accepts string dates (from API/Electric) or Date objects (from re-insert)
 * Output: All dates as Date objects
 */
export const folderSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  branch_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  name: z.string(),
  sort_order: z.number(),
  created_at: dateField,
  updated_at: dateField,
  created_by: z.string(), // text ID from better-auth
});

// ============================================================================
// Types
// ============================================================================

/** Input type - what you pass to insert/update (dates can be strings) */
export type FolderInput = z.input<typeof folderSchema>;

/** Output type - what you get from queries (dates are Date objects) */
export type FolderOutput = z.output<typeof folderSchema>;

/** Re-export for backwards compatibility */
export type Folder = FolderOutput;
