/**
 * Branch Validators
 *
 * Zod schemas for branch-related inputs.
 * Derives validation rules from entity schemas where applicable.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const branchIdSchema = z.object({
  branchId: z.uuid(),
});

// ============================================================================
// Query Schemas
// ============================================================================

export const getBranchesSchema = z.object({
  projectId: z.uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createBranchSchema = z.object({
  projectId: z.uuid(),
  branch: z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    description: z.string().max(500).nullable().optional(),
    parentBranchId: z.uuid().optional(),
    isMain: z.boolean().optional(),
  }),
});

export const createBranchWithContentSchema = z.object({
  projectId: z.uuid(),
  parentBranchId: z.uuid(),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500).nullable(),
});

export const updateBranchSchema = z.object({
  branchId: z.uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
  }),
});

export const deleteBranchSchema = z.object({
  branchId: z.uuid(),
});

export const mergeBranchSchema = z.object({
  sourceBranchId: z.uuid(),
  targetBranchId: z.uuid(),
});

// ============================================================================
// Types
// ============================================================================

export type GetBranchesInput = z.infer<typeof getBranchesSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type CreateBranchWithContentInput = z.infer<typeof createBranchWithContentSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type DeleteBranchInput = z.infer<typeof deleteBranchSchema>;
export type MergeBranchInput = z.infer<typeof mergeBranchSchema>;
