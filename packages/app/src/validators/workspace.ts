/**
 * Workspace Validators
 *
 * Zod schemas for workspace-related inputs.
 * Derives validation rules from entity schemas where applicable.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const workspaceIdSchema = z.object({
  workspaceId: z.uuid(),
});

// ============================================================================
// Query Schemas
// ============================================================================

/** No input needed - uses session for userId */
export const getWorkspacesSchema = z.object({});

export const getWorkspaceSchema = z.object({
  workspaceId: z.uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500, "Description too long").optional(),
});

export const updateWorkspaceSchema = z.object({
  workspaceId: z.uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  }),
});

export const deleteWorkspaceSchema = z.object({
  workspaceId: z.uuid(),
});

// ============================================================================
// Types
// ============================================================================

export type GetWorkspacesInput = z.infer<typeof getWorkspacesSchema>;
export type GetWorkspaceInput = z.infer<typeof getWorkspaceSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceSchema>;
