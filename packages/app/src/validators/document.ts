/**
 * Document Validators
 *
 * Zod schemas for document-related inputs.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const documentIdSchema = z.object({
  docId: z.string().uuid(),
});

// ============================================================================
// Query Schemas
// ============================================================================

export const getDocumentSchema = z.object({
  docId: z.string().uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createDocumentSchema = z.object({
  document: z.object({
    projectId: z.string().uuid(),
    branchId: z.string().uuid(),
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    type: z.string().default("model"),
    folderId: z.string().uuid().nullable().optional(),
    featureCount: z.number().int().min(0).optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const updateDocumentSchema = z.object({
  docId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export const updateDocumentMutationSchema = z.object({
  documentId: z.string().uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    folderId: z.string().uuid().nullable().optional(),
    featureCount: z.number().int().min(0).optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const deleteDocumentSchema = z.object({
  docId: z.string().uuid(),
});

export const deleteDocumentMutationSchema = z.object({
  documentId: z.string().uuid(),
});

// ============================================================================
// Types
// ============================================================================

export type GetDocumentInput = z.infer<typeof getDocumentSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type UpdateDocumentMutationInput = z.infer<typeof updateDocumentMutationSchema>;
export type DeleteDocumentInput = z.infer<typeof deleteDocumentSchema>;
export type DeleteDocumentMutationInput = z.infer<typeof deleteDocumentMutationSchema>;
