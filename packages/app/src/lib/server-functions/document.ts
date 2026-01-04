/**
 * Server Functions - Document Operations
 */

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { documents, branches, projectMembers } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../auth-middleware";
import { normalizeNullableUuid } from "./helpers";
import { getCurrentTxid } from "./db-helpers";

// ============================================================================
// Types
// ============================================================================

interface GetDocumentInput {
  docId: string;
  userId: string;
}

interface UpdateDocumentInput {
  docId: string;
  name?: string;
  folderId?: string | null;
  userId: string;
}

interface DeleteDocumentInput {
  docId: string;
  userId: string;
}

// ============================================================================
// Query Functions
// ============================================================================

export const getDocument = createServerFn({ method: "GET" })
  .inputValidator((d: GetDocumentInput) => d)
  .handler(async ({ data }) => {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, data.docId),
    });

    if (!doc) {
      throw new Error("Not found");
    }

    // Check project access via the document's branch and project
    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, doc.branchId),
    });

    if (!branch) {
      throw new Error("Not found");
    }

    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, branch.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!projectMember) {
      throw new Error("Forbidden");
    }

    return { document: doc, access: { canEdit: projectMember.canEdit } };
  });

// ============================================================================
// Mutation Functions
// ============================================================================

export const updateDocument = createServerFn({ method: "POST" })
  .inputValidator((d: UpdateDocumentInput) => d)
  .handler(async ({ data }) => {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, data.docId),
    });

    if (!doc) {
      throw new Error("Not found");
    }

    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, doc.branchId),
    });

    if (!branch) {
      throw new Error("Not found");
    }

    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, branch.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!projectMember || !projectMember.canEdit) {
      throw new Error("Forbidden");
    }

    const [updated] = await db
      .update(documents)
      .set({
        ...(data.name && { name: data.name }),
        ...(data.folderId !== undefined && { folderId: data.folderId }),
        updatedAt: new Date(),
        lastEditedBy: data.userId,
      })
      .where(eq(documents.id, data.docId))
      .returning();

    return updated;
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .inputValidator((d: DeleteDocumentInput) => d)
  .handler(async ({ data }) => {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, data.docId),
    });

    if (!doc) {
      throw new Error("Not found");
    }

    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, doc.branchId),
    });

    if (!branch) {
      throw new Error("Not found");
    }

    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, branch.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!projectMember || !projectMember.canEdit) {
      throw new Error("Forbidden");
    }

    await db
      .update(documents)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: data.userId,
      })
      .where(eq(documents.id, data.docId));

    return { success: true };
  });

// ============================================================================
// Electric Collection Mutation Functions
// These return { data, txid } for Electric reconciliation
// ============================================================================

export const createDocumentMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { document: any }) => d)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    return await db.transaction(async (tx) => {
      // Normalize nullable fields: convert empty strings to undefined so Drizzle omits them
      // This allows the database to use NULL defaults for nullable columns
      const normalizedDocument: any = {
        projectId: data.document.projectId,
        branchId: data.document.branchId,
        name: data.document.name,
        type: data.document.type,
        featureCount: data.document.featureCount ?? 0,
        sortOrder: data.document.sortOrder ?? 0,
        createdBy: session.user.id, // Override with session user ID for security
      };

      // Only include folderId if it's a valid UUID (not empty/null/undefined)
      const folderId = normalizeNullableUuid(data.document.folderId);
      if (folderId !== undefined) {
        normalizedDocument.folderId = folderId;
      }

      // Insert document (durableStreamId and baseDocumentId will be set after creation)
      const [created] = await tx.insert(documents).values(normalizedDocument).returning();

      // Set baseDocumentId = id for new documents (as per schema comment)
      // Generate durableStreamId: "project/{projectId}/doc/{documentId}/branch/{branchId}"
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

export const updateDocumentMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { documentId: string; updates: any }) => d)
  .handler(async ({ data }) => {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(documents)
        .set(data.updates)
        .where(eq(documents.id, data.documentId))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  });

export const deleteDocumentMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data }) => {
    return await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
        })
        .where(eq(documents.id, data.documentId));

      const txid = await getCurrentTxid(tx);
      return { data: { id: data.documentId }, txid };
    });
  });
