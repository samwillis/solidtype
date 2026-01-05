/**
 * Server Functions - Folder Operations
 *
 * All functions use session-based authentication via middleware.
 * No userId is accepted from client inputs.
 *
 * TanStack Start automatically code-splits server function handlers
 * so top-level imports of server-only modules are safe here.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { authMiddleware } from "../server-fn-middleware";
import { db } from "../db";
import { folders } from "../../db/schema";
import { requireBranchAccess } from "../authz";
import { getCurrentTxid } from "./db-helpers";
import { NotFoundError } from "../http/errors";
import {
  createFolderSchema,
  updateFolderSchema,
  deleteFolderSchema,
} from "../../validators/folder";

// ============================================================================
// Query Schema (defined inline since it's specific to this module)
// ============================================================================

const getFoldersSchema = z.object({
  projectId: z.uuid(),
  branchId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
});

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get folders for a branch (requires branch access)
 */
export const getFoldersForBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(getFoldersSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

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
  });

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Create a folder (requires branch edit access)
 */
export const createFolderMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createFolderSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

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
  });

/**
 * Update a folder (requires branch edit access)
 */
export const updateFolderMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateFolderSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

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
  });

/**
 * Delete a folder (requires branch edit access)
 */
export const deleteFolderMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteFolderSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

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
  });
