/**
 * Document Validators
 *
 * Zod schemas for document-related inputs.
 * Uses document type enum from entity schema.
 */

import { z } from "zod";
import { documentTypeEnum } from "../schemas/entities/document";

// ============================================================================
// Common Schemas
// ============================================================================

export const documentIdSchema = z.object({
  docId: z.uuid(),
});

// ============================================================================
// Query Schemas
// ============================================================================

export const getDocumentSchema = z.object({
  docId: z.uuid(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

export const createDocumentSchema = z.object({
  document: z.object({
    projectId: z.uuid(),
    branchId: z.uuid(),
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    type: documentTypeEnum.default("part"),
    folderId: z.uuid().nullable().optional(),
    featureCount: z.number().int().min(0).optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const updateDocumentSchema = z.object({
  docId: z.uuid(),
  name: z.string().min(1).max(100).optional(),
  folderId: z.uuid().nullable().optional(),
});

export const updateDocumentMutationSchema = z.object({
  documentId: z.uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    folderId: z.uuid().nullable().optional(),
    featureCount: z.number().int().min(0).optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const deleteDocumentSchema = z.object({
  docId: z.uuid(),
});

export const deleteDocumentMutationSchema = z.object({
  documentId: z.uuid(),
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
