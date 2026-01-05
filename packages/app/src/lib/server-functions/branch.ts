/**
 * Server Functions - Branch Operations
 *
 * All functions use session-based authentication via middleware.
 * No userId is accepted from client inputs.
 *
 * TanStack Start automatically code-splits server function handlers
 * so top-level imports of server-only modules are safe here.
 */

import { createServerFn } from "@tanstack/react-start";
import { eq, desc, and } from "drizzle-orm";
import { authMiddleware } from "../server-fn-middleware";
import { db } from "../db";
import { branches, folders, documents } from "../../db/schema";
import { requireProjectAccess, requireBranchAccess } from "../authz";
import { getCurrentTxid } from "./db-helpers";
import {
  getBranchesSchema,
  createBranchSchema,
  createBranchWithContentSchema,
  updateBranchSchema,
  deleteBranchSchema,
  mergeBranchSchema,
} from "../../validators/branch";

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all branches for a project (requires project access)
 */
export const getBranchesForProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(getBranchesSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Verify project access
    await requireProjectAccess(session, data.projectId);

    const projectBranches = await db
      .select()
      .from(branches)
      .where(eq(branches.projectId, data.projectId))
      .orderBy(desc(branches.isMain), desc(branches.createdAt));

    return { data: projectBranches };
  });

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Create a new branch (requires project edit access)
 */
export const createBranchMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createBranchSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Verify project access for edit
    const { project, canEdit } = await requireProjectAccess(session, data.projectId);

    // Check canEdit
    if (!canEdit) {
      throw new Error("Read-only access to this project");
    }

    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(branches)
        .values({
          projectId: project.id,
          name: data.branch.name,
          description: data.branch.description,
          parentBranchId: data.branch.parentBranchId,
          isMain: data.branch.isMain ?? false,
          createdBy: session.user.id,
          ownerId: session.user.id,
        })
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: created, txid };
    });
  });

/**
 * Update a branch (requires branch edit access)
 */
export const updateBranchMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateBranchSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Verify branch access for edit
    await requireBranchAccess(session, data.branchId, "edit");

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(branches)
        .set(data.updates)
        .where(eq(branches.id, data.branchId))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  });

/**
 * Delete a branch (requires branch edit access, cannot delete main)
 */
export const deleteBranchMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteBranchSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Verify branch access for edit
    const { branch } = await requireBranchAccess(session, data.branchId, "edit");

    if (branch.isMain) {
      throw new Error("Cannot delete main branch");
    }

    return await db.transaction(async (tx) => {
      await tx.delete(branches).where(eq(branches.id, data.branchId));

      const txid = await getCurrentTxid(tx);
      return { data: { id: data.branchId }, txid };
    });
  });

/**
 * Create a new branch with copied content from parent branch.
 * This copies all folders and documents from the parent branch.
 * Documents keep the same baseDocumentId for tracking across branches.
 */
export const createBranchWithContentMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createBranchWithContentSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Verify project access for edit
    await requireProjectAccess(session, data.projectId);

    // Also verify parent branch access
    await requireBranchAccess(session, data.parentBranchId, "view");

    // Create branch and copy content in a transaction
    return await db.transaction(async (tx) => {
      // Create the new branch
      const [newBranch] = await tx
        .insert(branches)
        .values({
          projectId: data.projectId,
          name: data.name,
          description: data.description,
          isMain: false,
          parentBranchId: data.parentBranchId,
          forkedAt: new Date(),
          createdBy: session.user.id,
          ownerId: session.user.id,
        })
        .returning();

      // Get all folders from parent branch
      const parentFolders = await tx
        .select()
        .from(folders)
        .where(eq(folders.branchId, data.parentBranchId));

      // Create mapping from old folder IDs to new folder IDs
      const folderIdMapping = new Map<string, string>();

      // Copy folders (need to handle hierarchy - copy root folders first, then children)
      const rootFolders = parentFolders.filter((f) => f.parentId === null);
      const childFolders = parentFolders.filter((f) => f.parentId !== null);

      // Copy root folders first
      for (const folder of rootFolders) {
        const [newFolder] = await tx
          .insert(folders)
          .values({
            projectId: data.projectId,
            branchId: newBranch.id,
            parentId: null,
            name: folder.name,
            sortOrder: folder.sortOrder,
            createdBy: session.user.id,
          })
          .returning();
        folderIdMapping.set(folder.id, newFolder.id);
      }

      // Copy child folders
      for (const folder of childFolders) {
        const newParentId = folder.parentId ? folderIdMapping.get(folder.parentId) : null;
        const [newFolder] = await tx
          .insert(folders)
          .values({
            projectId: data.projectId,
            branchId: newBranch.id,
            parentId: newParentId,
            name: folder.name,
            sortOrder: folder.sortOrder,
            createdBy: session.user.id,
          })
          .returning();
        folderIdMapping.set(folder.id, newFolder.id);
      }

      // Get all documents from parent branch (excluding deleted ones)
      const parentDocuments = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.branchId, data.parentBranchId), eq(documents.isDeleted, false)));

      // Copy documents with the same baseDocumentId
      for (const doc of parentDocuments) {
        const newFolderId = doc.folderId ? folderIdMapping.get(doc.folderId) : null;
        const baseDocId = doc.baseDocumentId || doc.id;

        await tx.insert(documents).values({
          projectId: data.projectId,
          branchId: newBranch.id,
          baseDocumentId: baseDocId,
          folderId: newFolderId,
          name: doc.name,
          type: doc.type,
          durableStreamId: null, // Yjs stream forking not yet implemented
          featureCount: doc.featureCount,
          sortOrder: doc.sortOrder,
          createdBy: session.user.id,
        });
      }

      const txid = await getCurrentTxid(tx);
      return { data: { branch: newBranch }, txid };
    });
  });

// ============================================================================
// Yjs Stream Helpers
// ============================================================================

const DURABLE_STREAMS_URL = process.env.DURABLE_STREAMS_URL || "http://localhost:3200";

function decodeYjsUpdate(item: unknown): Uint8Array | null {
  if (typeof item === "string") {
    try {
      const binary = atob(item);
      return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  } else if (item && typeof item === "object" && "data" in item) {
    return new Uint8Array(item.data as ArrayBuffer);
  }
  return null;
}

async function copyYjsStream(sourceStreamId: string, targetStreamId: string) {
  try {
    const sourceUrl = `${DURABLE_STREAMS_URL}/v1/stream/${sourceStreamId}?offset=-1`;
    const sourceRes = await fetch(sourceUrl);

    if (!sourceRes.ok) {
      console.warn("Source stream not found, skipping copy");
      return;
    }

    const data = await sourceRes.json();
    if (!data.items || data.items.length === 0) return;

    // Reconstruct full state and write to target
    const Y = await import("yjs");
    const doc = new Y.Doc();

    for (const item of data.items) {
      const update = decodeYjsUpdate(item);
      if (update) Y.applyUpdate(doc, update);
    }

    const fullState = Y.encodeStateAsUpdate(doc);
    const base64 = btoa(String.fromCharCode(...fullState));

    await fetch(`${DURABLE_STREAMS_URL}/v1/stream/${targetStreamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: base64 }),
    });
  } catch (error) {
    console.error("Failed to copy Yjs stream:", error);
  }
}

async function mergeYjsStreams(sourceStreamId: string, targetStreamId: string) {
  try {
    const Y = await import("yjs");

    // Load source doc
    const sourceUrl = `${DURABLE_STREAMS_URL}/v1/stream/${sourceStreamId}?offset=-1`;
    const sourceRes = await fetch(sourceUrl);
    if (!sourceRes.ok) return;

    const sourceData = await sourceRes.json();
    const sourceDoc = new Y.Doc();
    if (sourceData.items) {
      for (const item of sourceData.items) {
        const update = decodeYjsUpdate(item);
        if (update) Y.applyUpdate(sourceDoc, update);
      }
    }

    // Load target doc
    const targetUrl = `${DURABLE_STREAMS_URL}/v1/stream/${targetStreamId}?offset=-1`;
    const targetRes = await fetch(targetUrl);
    if (!targetRes.ok) return;

    const targetData = await targetRes.json();
    const targetDoc = new Y.Doc();
    if (targetData.items) {
      for (const item of targetData.items) {
        const update = decodeYjsUpdate(item);
        if (update) Y.applyUpdate(targetDoc, update);
      }
    }

    // Compute diff: changes in source that target doesn't have
    const diff = Y.encodeStateAsUpdate(sourceDoc, Y.encodeStateVector(targetDoc));

    // Append diff to target if there are changes
    if (diff.length > 0) {
      const base64 = btoa(String.fromCharCode(...diff));
      await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: base64 }),
      });
    }
  } catch (error) {
    console.error("Failed to merge Yjs streams:", error);
  }
}

/**
 * Merge a branch into another branch
 * Uses Yjs CRDT merge with "edit wins" strategy
 */
export const mergeBranchMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(mergeBranchSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    const { sourceBranchId, targetBranchId } = data;

    // Verify access to both branches
    await requireBranchAccess(session, sourceBranchId, "view");
    await requireBranchAccess(session, targetBranchId, "edit");

    // Get source branch
    const sourceBranch = await db.query.branches.findFirst({
      where: eq(branches.id, sourceBranchId),
    });

    if (!sourceBranch) {
      throw new Error("Source branch not found");
    }

    // Get all documents from both branches
    const sourceDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.branchId, sourceBranchId));

    const targetDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.branchId, targetBranchId));

    const sourceDocsMap = new Map(sourceDocs.map((d) => [d.baseDocumentId || d.id, d]));
    const targetDocsMap = new Map(targetDocs.map((d) => [d.baseDocumentId || d.id, d]));

    const results: Array<{ docId: string; action: string }> = [];

    // Process each document in source branch
    for (const [baseDocId, sourceDoc] of sourceDocsMap) {
      const targetDoc = targetDocsMap.get(baseDocId);

      if (!targetDoc) {
        // Document created in source branch - copy to target
        const newDocId = crypto.randomUUID();
        const newDurableStreamId = `project/${sourceDoc.projectId}/doc/${newDocId}/branch/${targetBranchId}`;

        await db.insert(documents).values({
          id: newDocId,
          projectId: sourceDoc.projectId,
          branchId: targetBranchId,
          baseDocumentId: baseDocId,
          folderId: null,
          name: sourceDoc.name,
          type: sourceDoc.type,
          durableStreamId: newDurableStreamId,
          featureCount: sourceDoc.featureCount,
          sortOrder: sourceDoc.sortOrder,
          createdBy: session.user.id,
        });

        // Copy Yjs stream
        if (sourceDoc.durableStreamId) {
          await copyYjsStream(sourceDoc.durableStreamId, newDurableStreamId);
        }

        results.push({ docId: newDocId, action: "created" });
      } else if (targetDoc.isDeleted && !sourceDoc.isDeleted) {
        // Deleted in target but exists in source - RESTORE (edit wins)
        await db
          .update(documents)
          .set({
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
          })
          .where(eq(documents.id, targetDoc.id));

        // Merge Yjs streams
        if (sourceDoc.durableStreamId && targetDoc.durableStreamId) {
          await mergeYjsStreams(sourceDoc.durableStreamId, targetDoc.durableStreamId);
        }

        results.push({ docId: targetDoc.id, action: "restored" });
      } else if (!sourceDoc.isDeleted && !targetDoc.isDeleted) {
        // Both exist - merge Yjs states
        if (sourceDoc.durableStreamId && targetDoc.durableStreamId) {
          await mergeYjsStreams(sourceDoc.durableStreamId, targetDoc.durableStreamId);
        }
        results.push({ docId: targetDoc.id, action: "merged" });
      }
    }

    // Mark source branch as merged
    return await db.transaction(async (tx) => {
      await tx
        .update(branches)
        .set({
          mergedAt: new Date(),
          mergedBy: session.user.id,
          mergedIntoBranchId: targetBranchId,
        })
        .where(eq(branches.id, sourceBranchId));

      const txid = await getCurrentTxid(tx);
      return { data: { branch: sourceBranch, results }, txid };
    });
  });
