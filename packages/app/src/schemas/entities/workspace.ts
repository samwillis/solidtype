/**
 * Workspace Entity Schema
 *
 * Workspaces are the top-level organizational unit.
 * Users belong to workspaces, and workspaces contain projects.
 */

import { z } from "zod";
import { dateField } from "../common";

// ============================================================================
// Schema
// ============================================================================

/**
 * Full workspace schema matching database structure.
 * Uses snake_case to match Electric sync format.
 *
 * Input: Accepts string dates (from API/Electric) or Date objects (from re-insert)
 * Output: All dates as Date objects
 */
export const workspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  created_by: z.string(), // text ID from better-auth
  created_at: dateField,
  updated_at: dateField,
});

// ============================================================================
// Types
// ============================================================================

/** Input type - what you pass to insert/update (dates can be strings) */
export type WorkspaceInput = z.input<typeof workspaceSchema>;

/** Output type - what you get from queries (dates are Date objects) */
export type WorkspaceOutput = z.output<typeof workspaceSchema>;

/** Re-export for backwards compatibility */
export type Workspace = WorkspaceOutput;
