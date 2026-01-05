/**
 * Folder Validators
 *
 * Zod schemas for folder-related inputs.
 * Derives validation rules from entity schemas where applicable.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const folderIdSchema = z.object({
  folderId: z.uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createFolderSchema = z.object({
  folder: z.object({
    projectId: z.uuid(),
    branchId: z.uuid(),
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    parentId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const updateFolderSchema = z.object({
  folderId: z.uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    parentId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const deleteFolderSchema = z.object({
  folderId: z.uuid(),
});

// ============================================================================
// Types
// ============================================================================

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type DeleteFolderInput = z.infer<typeof deleteFolderSchema>;
