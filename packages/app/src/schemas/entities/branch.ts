/**
 * Branch Entity Schema
 *
 * Branches allow users to work on isolated copies of a project.
 * Each project has a "main" branch by default.
 */

import { z } from "zod";
import { dateField, nullableDateField } from "../common";

// ============================================================================
// Schema
// ============================================================================

/**
 * Full branch schema matching database structure.
 * Uses snake_case to match Electric sync format.
 *
 * Input: Accepts string dates (from API/Electric) or Date objects (from re-insert)
 * Output: All dates as Date objects
 */
export const branchSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  is_main: z.boolean(),
  parent_branch_id: z.uuid().nullable(),
  forked_at: nullableDateField,
  created_by: z.string(), // text ID from better-auth
  owner_id: z.string(), // text ID from better-auth
  created_at: dateField,
  updated_at: dateField,
  merged_at: nullableDateField,
  merged_by: z.string().nullable(),
});

// ============================================================================
// Types
// ============================================================================

/** Input type - what you pass to insert/update (dates can be strings) */
export type BranchInput = z.input<typeof branchSchema>;

/** Output type - what you get from queries (dates are Date objects) */
export type BranchOutput = z.output<typeof branchSchema>;

/** Re-export for backwards compatibility */
export type Branch = BranchOutput;
