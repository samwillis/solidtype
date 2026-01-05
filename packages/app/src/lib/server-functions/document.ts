/**
 * Server Functions - Document Operations
 *
 * All functions use session-based authentication.
 * No userId is accepted from client inputs.
 *
 * NOTE: Server-only modules (db, authz, repos) are imported dynamically
 * inside handlers to avoid bundling them for the client.
 */

import { createAuthedServerFn } from "../server-fn-wrapper";
import {
  getDocumentSchema,
  updateDocumentSchema,
  deleteDocumentSchema,
  createDocumentSchema,
  updateDocumentMutationSchema,
  deleteDocumentMutationSchema,
} from "../../validators/document";
import { normalizeNullableUuid } from "./helpers";

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get a single document (requires access)
 */
export const getDocument = createAuthedServerFn({
  method: "GET",
  validator: getDocumentSchema,
  handler: async ({ session, data }) => {
    const { requireDocumentAccess } = await import("../authz");

    const { doc, canEdit } = await requireDocumentAccess(session, data.docId, "view");
    return { document: doc, access: { canEdit } };
  },
});

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Update a document (requires edit access)
 */
export const updateDocument = createAuthedServerFn({
  method: "POST",
  validator: updateDocumentSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { documents } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { requireDocumentAccess } = await import("../authz");

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
  },
});

/**
 * Soft delete a document (requires edit access)
 */
export const deleteDocument = createAuthedServerFn({
  method: "POST",
  validator: deleteDocumentSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { documents } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { requireDocumentAccess } = await import("../authz");

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
  },
});

// ============================================================================
// Electric Collection Mutation Functions
// These return { data, txid } for Electric reconciliation
// ============================================================================

/**
 * Create a document (requires branch edit access)
 */
export const createDocumentMutation = createAuthedServerFn({
  method: "POST",
  validator: createDocumentSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { documents } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireBranchAccess } = await import("../authz");

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
  },
});

/**
 * Update a document with txid (requires edit access)
 */
export const updateDocumentMutation = createAuthedServerFn({
  method: "POST",
  validator: updateDocumentMutationSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { documents } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireDocumentAccess } = await import("../authz");

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
  },
});

/**
 * Soft delete a document with txid (requires edit access)
 */
export const deleteDocumentMutation = createAuthedServerFn({
  method: "POST",
  validator: deleteDocumentMutationSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { documents } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireDocumentAccess } = await import("../authz");

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
  },
});
