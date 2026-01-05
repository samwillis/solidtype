/**
 * Server Functions - Folder Operations
 *
 * All functions use session-based authentication.
 * No userId is accepted from client inputs.
 *
 * NOTE: Server-only modules (db, authz, repos) are imported dynamically
 * inside handlers to avoid bundling them for the client.
 */

import { z } from "zod";
import { createAuthedServerFn } from "../server-fn-wrapper";
import {
  createFolderSchema,
  updateFolderSchema,
  deleteFolderSchema,
} from "../../validators/folder";

// ============================================================================
// Query Schema (defined inline since it's specific to this module)
// ============================================================================

const getFoldersSchema = z.object({
  projectId: z.string().uuid(),
  branchId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
});

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get folders for a branch (requires branch access)
 */
export const getFoldersForBranch = createAuthedServerFn({
  method: "POST",
  validator: getFoldersSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { folders } = await import("../../db/schema");
    const { eq, and, asc } = await import("drizzle-orm");
    const { requireBranchAccess } = await import("../authz");

    // Verify branch access
    await requireBranchAccess(session, data.branchId, "view");

    const conditions = [eq(folders.projectId, data.projectId), eq(folders.branchId, data.branchId)];

    if (data.parentId !== undefined) {
      if (data.parentId === null) {
        // TypeScript workaround for null comparison
        conditions.push(eq(folders.parentId, null as unknown as string));
      } else {
        conditions.push(eq(folders.parentId, data.parentId));
      }
    }

    const branchFolders = await db
      .select()
      .from(folders)
      .where(and(...conditions))
      .orderBy(asc(folders.sortOrder), asc(folders.name));

    return { data: branchFolders };
  },
});

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Create a folder (requires branch edit access)
 */
export const createFolderMutation = createAuthedServerFn({
  method: "POST",
  validator: createFolderSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { folders } = await import("../../db/schema");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireBranchAccess } = await import("../authz");

    // Verify branch access for edit
    await requireBranchAccess(session, data.folder.branchId, "edit");

    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(folders)
        .values({
          projectId: data.folder.projectId,
          branchId: data.folder.branchId,
          name: data.folder.name,
          parentId: data.folder.parentId ?? null,
          sortOrder: data.folder.sortOrder ?? 0,
          createdBy: session.user.id,
        })
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: created, txid };
    });
  },
});

/**
 * Update a folder (requires branch edit access)
 */
export const updateFolderMutation = createAuthedServerFn({
  method: "POST",
  validator: updateFolderSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { folders } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireBranchAccess } = await import("../authz");
    const { NotFoundError } = await import("../http/errors");

    // Get the folder to find its branch
    const folder = await db.query.folders.findFirst({
      where: eq(folders.id, data.folderId),
    });

    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    // Verify branch access for edit
    await requireBranchAccess(session, folder.branchId, "edit");

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(folders)
        .set(data.updates)
        .where(eq(folders.id, data.folderId))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  },
});

/**
 * Delete a folder (requires branch edit access)
 */
export const deleteFolderMutation = createAuthedServerFn({
  method: "POST",
  validator: deleteFolderSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { folders } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireBranchAccess } = await import("../authz");
    const { NotFoundError } = await import("../http/errors");

    // Get the folder to find its branch
    const folder = await db.query.folders.findFirst({
      where: eq(folders.id, data.folderId),
    });

    if (!folder) {
      throw new NotFoundError("Folder not found");
    }

    // Verify branch access for edit
    await requireBranchAccess(session, folder.branchId, "edit");

    return await db.transaction(async (tx) => {
      await tx.delete(folders).where(eq(folders.id, data.folderId));

      const txid = await getCurrentTxid(tx);
      return { data: { id: data.folderId }, txid };
    });
  },
});
