/**
 * Server Functions - Document Operations
 *
 * All functions use session-based authentication via middleware.
 * No userId is accepted from client inputs.
 *
 * TanStack Start automatically code-splits server function handlers
 * so top-level imports of server-only modules are safe here.
 */

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../server-fn-middleware";
import { db } from "../db";
import { documents } from "../../db/schema";
import { requireDocumentAccess, requireBranchAccess } from "../authz";
import { getCurrentTxid } from "./db-helpers";
import { normalizeNullableUuid } from "./helpers";
import {
  getDocumentSchema,
  updateDocumentSchema,
  deleteDocumentSchema,
  createDocumentSchema,
  updateDocumentMutationSchema,
  deleteDocumentMutationSchema,
} from "../../validators/document";

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get a single document (requires access)
 */
export const getDocument = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(getDocumentSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    const { doc, canEdit } = await requireDocumentAccess(session, data.docId, "view");
    return { document: doc, access: { canEdit } };
  });

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Update a document (requires edit access)
 */
export const updateDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateDocumentSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Require edit access
    await requireDocumentAccess(session, data.docId, "edit");

    const [updated] = await db
      .update(documents)
      .set({
        ...(data.name && { name: data.name }),
        ...(data.folderId !== undefined && { folderId: data.folderId }),
        updatedAt: new Date(),
        lastEditedBy: session.user.id,
      })
      .where(eq(documents.id, data.docId))
      .returning();

    return updated;
  });

/**
 * Soft delete a document (requires edit access)
 */
export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteDocumentSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Require edit access
    await requireDocumentAccess(session, data.docId, "edit");

    await db
      .update(documents)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: session.user.id,
      })
      .where(eq(documents.id, data.docId));

    return { success: true };
  });

// ============================================================================
// Electric Collection Mutation Functions
// These return { data, txid } for Electric reconciliation
// ============================================================================

/**
 * Create a document (requires branch edit access)
 */
export const createDocumentMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createDocumentSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Verify branch access for edit
    await requireBranchAccess(session, data.document.branchId, "edit");

    return await db.transaction(async (tx) => {
      // Normalize nullable fields
      const normalizedDocument = {
        projectId: data.document.projectId,
        branchId: data.document.branchId,
        name: data.document.name,
        type: data.document.type,
        featureCount: data.document.featureCount ?? 0,
        sortOrder: data.document.sortOrder ?? 0,
        createdBy: session.user.id,
        folderId: normalizeNullableUuid(data.document.folderId) ?? null,
      };

      // Insert document
      const [created] = await tx.insert(documents).values(normalizedDocument).returning();

      // Set baseDocumentId = id for new documents
      // Generate durableStreamId
      const durableStreamId = `project/${created.projectId}/doc/${created.id}/branch/${created.branchId}`;
      const [updated] = await tx
        .update(documents)
        .set({
          durableStreamId,
          baseDocumentId: created.id,
        })
        .where(eq(documents.id, created.id))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  });

/**
 * Update a document with txid (requires edit access)
 */
export const updateDocumentMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateDocumentMutationSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Require edit access
    await requireDocumentAccess(session, data.documentId, "edit");

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(documents)
        .set({
          ...data.updates,
          updatedAt: new Date(),
          lastEditedBy: session.user.id,
        })
        .where(eq(documents.id, data.documentId))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  });

/**
 * Soft delete a document with txid (requires edit access)
 */
export const deleteDocumentMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteDocumentMutationSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Require edit access
    await requireDocumentAccess(session, data.documentId, "edit");

    return await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: session.user.id,
        })
        .where(eq(documents.id, data.documentId));

      const txid = await getCurrentTxid(tx);
      return { data: { id: data.documentId }, txid };
    });
  });
