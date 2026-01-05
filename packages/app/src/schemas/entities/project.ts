/**
 * Project Entity Schema
 *
 * Projects belong to workspaces and contain documents.
 */

import { z } from "zod";
import { dateField } from "../common";

// ============================================================================
// Schema
// ============================================================================

/**
 * Full project schema matching database structure.
 * Uses snake_case to match Electric sync format.
 *
 * Input: Accepts string dates (from API/Electric) or Date objects (from re-insert)
 * Output: All dates as Date objects
 */
export const projectSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  created_by: z.string(), // text ID from better-auth
  created_at: dateField,
  updated_at: dateField,
});

// ============================================================================
// Types
// ============================================================================

/** Input type - what you pass to insert/update (dates can be strings) */
export type ProjectInput = z.input<typeof projectSchema>;

/** Output type - what you get from queries (dates are Date objects) */
export type ProjectOutput = z.output<typeof projectSchema>;

/** Re-export for backwards compatibility */
export type Project = ProjectOutput;
