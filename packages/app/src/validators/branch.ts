/**
 * Branch Validators
 *
 * Zod schemas for branch-related inputs.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const branchIdSchema = z.object({
  branchId: z.string().uuid(),
});

// ============================================================================
// Query Schemas
// ============================================================================

export const getBranchesSchema = z.object({
  projectId: z.string().uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createBranchSchema = z.object({
  projectId: z.string().uuid(),
  branch: z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    description: z.string().max(500).nullable().optional(),
    parentBranchId: z.string().uuid().optional(),
    isMain: z.boolean().optional(),
  }),
});

export const createBranchWithContentSchema = z.object({
  projectId: z.string().uuid(),
  parentBranchId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500).nullable(),
});

export const updateBranchSchema = z.object({
  branchId: z.string().uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
  }),
});

export const deleteBranchSchema = z.object({
  branchId: z.string().uuid(),
});

export const mergeBranchSchema = z.object({
  sourceBranchId: z.string().uuid(),
  targetBranchId: z.string().uuid(),
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
