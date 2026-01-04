/**
 * Server Functions - Folder Operations
 */

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { folders } from "../../db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../auth-middleware";
import { getCurrentTxid } from "./db-helpers";

// ============================================================================
// Query Functions
// ============================================================================

export const getFoldersForBranch = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string; branchId: string; parentId?: string | null }) => d)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    await requireAuth(request); // Verify authentication

    const conditions = [eq(folders.projectId, data.projectId), eq(folders.branchId, data.branchId)];

    if (data.parentId !== undefined) {
      if (data.parentId === null) {
        conditions.push(eq(folders.parentId, null as any));
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

export const createFolderMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { folder: any }) => d)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(folders)
        .values({
          ...data.folder,
          createdBy: session.user.id, // Override with session user ID for security
        })
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: created, txid };
    });
  });

export const updateFolderMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { folderId: string; updates: any }) => d)
  .handler(async ({ data }) => {
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

export const deleteFolderMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { folderId: string }) => d)
  .handler(async ({ data }) => {
    const folderId = data.folderId;

    return await db.transaction(async (tx) => {
      // Verify folder exists before deleting
      const folder = await tx.query.folders.findFirst({
        where: eq(folders.id, folderId),
      });

      if (!folder) {
        throw new Error("Folder not found");
      }

      await tx.delete(folders).where(eq(folders.id, folderId));

      const txid = await getCurrentTxid(tx);
      return { data: { id: folderId }, txid };
    });
  });
