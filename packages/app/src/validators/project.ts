/**
 * Project Validators
 *
 * Zod schemas for project-related inputs.
 * Derives validation rules from entity schemas where applicable.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const projectIdSchema = z.object({
  projectId: z.uuid(),
});

// ============================================================================
// Query Schemas
// ============================================================================

export const getProjectsSchema = z.object({
  workspaceId: z.uuid(),
});

export const getProjectSchema = z.object({
  projectId: z.uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createProjectSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
});

export const updateProjectSchema = z.object({
  projectId: z.uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  }),
});

export const deleteProjectSchema = z.object({
  projectId: z.uuid(),
});

// ============================================================================
// Types
// ============================================================================

export type GetProjectsInput = z.infer<typeof getProjectsSchema>;
export type GetProjectInput = z.infer<typeof getProjectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type DeleteProjectInput = z.infer<typeof deleteProjectSchema>;
