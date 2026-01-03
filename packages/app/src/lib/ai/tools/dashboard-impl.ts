/**
 * Dashboard Tool Implementations
 *
 * Server-side implementations for dashboard tools.
 * These query the database and perform operations.
 */

import { db } from "../../db";
import {
  workspaces,
  workspaceMembers,
  projects,
  projectMembers,
  branches,
  documents,
  folders,
} from "../../../db/schema";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import type { ServerTool } from "@tanstack/ai";
import {
  listWorkspacesDef,
  createWorkspaceDef,
  getWorkspaceDef,
  listProjectsDef,
  createProjectDef,
  openProjectDef,
  getProjectDef,
  listDocumentsDef,
  createDocumentDef,
  openDocumentDef,
  renameDocumentDef,
  moveDocumentDef,
  deleteDocumentDef,
  listBranchesDef,
  createBranchDef,
  switchBranchDef,
  deleteBranchDef,
  mergeBranchDef,
  resolveMergeConflictDef,
  getBranchDiffDef,
  listFoldersDef,
  createFolderDef,
  renameFolderDef,
  deleteFolderDef,
  searchDocumentsDef,
  searchProjectsDef,
} from "./dashboard";

/**
 * Get dashboard tools with server implementations
 */
export async function getDashboardTools(userId: string): Promise<ServerTool[]> {
  const tools: ServerTool[] = [];

  // List Workspaces
  tools.push(
    listWorkspacesDef.server(async () => {
      const result = await db.query.workspaceMembers.findMany({
        where: eq(workspaceMembers.userId, userId),
        with: { workspace: true },
      });
      return result.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role as "owner" | "admin" | "member",
      }));
    })
  );

  // Create Workspace
  tools.push(
    createWorkspaceDef.server(async ({ name, slug, description }) => {
      const workspaceSlug =
        slug ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      const [ws] = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(workspaces)
          .values({
            name,
            slug: workspaceSlug,
            description,
            createdBy: userId,
          })
          .returning();

        await tx.insert(workspaceMembers).values({
          workspaceId: created.id,
          userId,
          role: "owner",
        });

        return [created];
      });

      return { workspaceId: ws.id, name: ws.name, slug: ws.slug };
    })
  );

  // Get Workspace
  tools.push(
    getWorkspaceDef.server(async ({ workspaceId }) => {
      const ws = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
        with: { members: true, projects: true },
      });
      if (!ws) throw new Error("Workspace not found");

      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        description: ws.description ?? undefined,
        memberCount: ws.members.length,
        projectCount: ws.projects.length,
      };
    })
  );

  // List Projects
  tools.push(
    listProjectsDef.server(async ({ workspaceId }) => {
      const query = workspaceId
        ? db.query.projects.findMany({
            where: eq(projects.workspaceId, workspaceId),
            with: { workspace: true },
            orderBy: desc(projects.updatedAt),
          })
        : db.query.projects.findMany({
            with: { workspace: true },
            orderBy: desc(projects.updatedAt),
          });
      const result = await query;
      return result.map((p) => ({
        id: p.id,
        name: p.name,
        workspaceId: p.workspaceId,
        workspaceName: p.workspace.name,
        updatedAt: p.updatedAt.toISOString(),
      }));
    })
  );

  // Create Project
  tools.push(
    createProjectDef.server(async ({ workspaceId, name, description }) => {
      const [proj] = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(projects)
          .values({
            workspaceId,
            name,
            description,
            createdBy: userId,
          })
          .returning();

        // Add creator as project owner
        await tx.insert(projectMembers).values({
          projectId: created.id,
          userId,
          role: "owner",
          canEdit: true,
        });

        // Create main branch
        await tx.insert(branches).values({
          projectId: created.id,
          name: "main",
          description: "Main branch",
          isMain: true,
          createdBy: userId,
          ownerId: userId,
        });

        return [created];
      });

      return { projectId: proj.id, name: proj.name };
    })
  );

  // Open Project
  tools.push(
    openProjectDef.server(async ({ projectId }) => {
      const url = `/dashboard/projects/${projectId}`;
      return { url, navigated: true };
    })
  );

  // Get Project
  tools.push(
    getProjectDef.server(async ({ projectId }) => {
      const proj = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        with: { workspace: true, branches: true },
      });
      if (!proj) throw new Error("Project not found");

      // Count documents across all branches
      const docCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(eq(documents.projectId, projectId));

      return {
        id: proj.id,
        name: proj.name,
        description: proj.description ?? undefined,
        workspaceId: proj.workspaceId,
        workspaceName: proj.workspace.name,
        branchCount: proj.branches.length,
        documentCount: Number(docCount[0]?.count || 0),
        updatedAt: proj.updatedAt.toISOString(),
      };
    })
  );

  // List Documents
  tools.push(
    listDocumentsDef.server(async ({ projectId, branchId, folderId }) => {
      // If no branchId, get main branch
      let branch = branchId;
      if (!branch) {
        const mainBranch = await db.query.branches.findFirst({
          where: and(eq(branches.projectId, projectId), eq(branches.isMain, true)),
        });
        branch = mainBranch?.id;
      }
      if (!branch) throw new Error("No branch found");

      const conditions = [eq(documents.branchId, branch), eq(documents.isDeleted, false)];
      if (folderId) {
        conditions.push(eq(documents.folderId, folderId));
      }

      const result = await db.query.documents.findMany({
        where: and(...conditions),
        orderBy: [documents.sortOrder, documents.name],
      });

      return result.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type as "part" | "assembly",
        updatedAt: d.updatedAt.toISOString(),
        folderId: d.folderId ?? undefined,
      }));
    })
  );

  // Create Document
  tools.push(
    createDocumentDef.server(async ({ branchId, name, type, folderId }) => {
      // Get project ID from branch
      const branch = await db.query.branches.findFirst({
        where: eq(branches.id, branchId),
      });
      if (!branch) throw new Error("Branch not found");

      const docId = crypto.randomUUID();
      const durableStreamId = `project/${branch.projectId}/doc/${docId}/branch/${branchId}`;

      const [doc] = await db
        .insert(documents)
        .values({
          id: docId,
          baseDocumentId: docId,
          projectId: branch.projectId,
          branchId,
          folderId,
          name,
          type,
          durableStreamId,
          createdBy: userId,
        })
        .returning();

      return { documentId: doc.id, name: doc.name };
    })
  );

  // Open Document
  tools.push(
    openDocumentDef.server(async ({ documentId }) => {
      const url = `/editor?doc=${documentId}`;
      return { url, navigated: true };
    })
  );

  // Rename Document
  tools.push(
    renameDocumentDef.server(async ({ documentId, newName }) => {
      const [doc] = await db
        .update(documents)
        .set({ name: newName, updatedAt: new Date() })
        .where(eq(documents.id, documentId))
        .returning();

      return { success: !!doc, name: doc?.name || newName };
    })
  );

  // Move Document
  tools.push(
    moveDocumentDef.server(async ({ documentId, folderId }) => {
      await db
        .update(documents)
        .set({ folderId, updatedAt: new Date() })
        .where(eq(documents.id, documentId));

      return { success: true };
    })
  );

  // Delete Document
  tools.push(
    deleteDocumentDef.server(async ({ documentId, confirm }) => {
      if (!confirm) {
        throw new Error("Deletion not confirmed");
      }

      await db
        .update(documents)
        .set({ isDeleted: true, deletedAt: new Date(), deletedBy: userId })
        .where(eq(documents.id, documentId));

      return { success: true };
    })
  );

  // List Branches
  tools.push(
    listBranchesDef.server(async ({ projectId }) => {
      const result = await db.query.branches.findMany({
        where: eq(branches.projectId, projectId),
        orderBy: [desc(branches.isMain), branches.name],
      });

      return result.map((b) => ({
        id: b.id,
        name: b.name,
        isMain: b.isMain,
        createdAt: b.createdAt.toISOString(),
      }));
    })
  );

  // Create Branch
  tools.push(
    createBranchDef.server(async ({ projectId, parentBranchId, name, description }) => {
      const [branch] = await db
        .insert(branches)
        .values({
          projectId,
          parentBranchId,
          name,
          description,
          isMain: false,
          createdBy: userId,
          ownerId: userId,
        })
        .returning();

      return { branchId: branch.id, name: branch.name };
    })
  );

  // Switch Branch
  tools.push(
    switchBranchDef.server(async ({ branchId }) => {
      const branch = await db.query.branches.findFirst({
        where: eq(branches.id, branchId),
      });
      if (!branch) throw new Error("Branch not found");

      return { success: true, branchName: branch.name };
    })
  );

  // Delete Branch
  tools.push(
    deleteBranchDef.server(async ({ branchId, confirm }) => {
      if (!confirm) {
        throw new Error("Deletion not confirmed");
      }

      const branch = await db.query.branches.findFirst({
        where: eq(branches.id, branchId),
      });
      if (!branch) throw new Error("Branch not found");
      if (branch.isMain) throw new Error("Cannot delete main branch");

      await db.delete(branches).where(eq(branches.id, branchId));

      return { success: true, branchName: branch.name };
    })
  );

  // Merge Branch
  tools.push(
    mergeBranchDef.server(async ({ sourceBranchId, targetBranchId, dryRun }) => {
      // Get documents from both branches
      const sourceDocs = await db.query.documents.findMany({
        where: and(eq(documents.branchId, sourceBranchId), eq(documents.isDeleted, false)),
      });
      const targetDocs = await db.query.documents.findMany({
        where: and(eq(documents.branchId, targetBranchId), eq(documents.isDeleted, false)),
      });

      // Build maps by baseDocumentId
      const sourceByBase = new Map(sourceDocs.map((d) => [d.baseDocumentId, d]));
      const targetByBase = new Map(targetDocs.map((d) => [d.baseDocumentId, d]));

      const conflicts: {
        documentId: string;
        documentName: string;
        type: "modified-both" | "deleted-modified" | "modified-deleted";
      }[] = [];

      // Check for conflicts
      for (const [baseId, sourceDoc] of sourceByBase) {
        const targetDoc = targetByBase.get(baseId);
        if (targetDoc) {
          // Both branches have this document - check if both modified
          if (
            sourceDoc.updatedAt > targetDoc.createdAt &&
            targetDoc.updatedAt > sourceDoc.createdAt
          ) {
            conflicts.push({
              documentId: sourceDoc.id,
              documentName: sourceDoc.name,
              type: "modified-both",
            });
          }
        }
      }

      if (dryRun || conflicts.length > 0) {
        return {
          success: conflicts.length === 0,
          merged: false,
          conflicts,
          mergedDocumentCount: 0,
        };
      }

      // Perform merge: copy new/modified docs from source to target
      let mergedCount = 0;
      for (const [baseId, sourceDoc] of sourceByBase) {
        const targetDoc = targetByBase.get(baseId);
        if (!targetDoc) {
          // New document in source - copy to target
          await db.insert(documents).values({
            ...sourceDoc,
            id: crypto.randomUUID(),
            branchId: targetBranchId,
            durableStreamId: `project/${sourceDoc.projectId}/doc/${sourceDoc.baseDocumentId}/branch/${targetBranchId}`,
          });
          mergedCount++;
        } else if (sourceDoc.updatedAt > targetDoc.updatedAt) {
          // Source is newer - update target
          await db
            .update(documents)
            .set({
              name: sourceDoc.name,
              folderId: sourceDoc.folderId,
              updatedAt: new Date(),
            })
            .where(eq(documents.id, targetDoc.id));
          mergedCount++;
        }
      }

      return {
        success: true,
        merged: true,
        conflicts: [],
        mergedDocumentCount: mergedCount,
      };
    })
  );

  // Resolve Merge Conflict
  tools.push(
    resolveMergeConflictDef.server(
      async ({ sourceBranchId: _sourceBranchId, targetBranchId, documentId, resolution }) => {
        const sourceDoc = await db.query.documents.findFirst({
          where: eq(documents.id, documentId),
        });
        if (!sourceDoc) throw new Error("Document not found");

        const targetDoc = sourceDoc.baseDocumentId
          ? await db.query.documents.findFirst({
              where: and(
                eq(documents.branchId, targetBranchId),
                eq(documents.baseDocumentId, sourceDoc.baseDocumentId)
              ),
            })
          : null;

        switch (resolution) {
          case "keep-source":
            if (targetDoc) {
              await db
                .update(documents)
                .set({
                  name: sourceDoc.name,
                  folderId: sourceDoc.folderId,
                  updatedAt: new Date(),
                })
                .where(eq(documents.id, targetDoc.id));
            }
            break;
          case "keep-target":
            // Nothing to do - target stays as is
            break;
          case "keep-both":
            // Create a copy with a new name
            await db.insert(documents).values({
              ...sourceDoc,
              id: crypto.randomUUID(),
              baseDocumentId: crypto.randomUUID(),
              branchId: targetBranchId,
              name: `${sourceDoc.name} (merged)`,
              durableStreamId: `project/${sourceDoc.projectId}/doc/${crypto.randomUUID()}/branch/${targetBranchId}`,
            });
            break;
        }

        return { success: true, documentName: sourceDoc.name };
      }
    )
  );

  // Get Branch Diff
  tools.push(
    getBranchDiffDef.server(async ({ sourceBranchId, targetBranchId }) => {
      const sourceDocs = await db.query.documents.findMany({
        where: and(eq(documents.branchId, sourceBranchId), eq(documents.isDeleted, false)),
      });
      const targetDocs = await db.query.documents.findMany({
        where: and(eq(documents.branchId, targetBranchId), eq(documents.isDeleted, false)),
      });

      const sourceByBase = new Map(sourceDocs.map((d) => [d.baseDocumentId, d]));
      const targetByBase = new Map(targetDocs.map((d) => [d.baseDocumentId, d]));

      const added: { id: string; name: string }[] = [];
      const modified: { id: string; name: string }[] = [];
      const deleted: { id: string; name: string }[] = [];

      // Find added and modified in source
      for (const [baseId, sourceDoc] of sourceByBase) {
        const targetDoc = targetByBase.get(baseId);
        if (!targetDoc) {
          added.push({ id: sourceDoc.id, name: sourceDoc.name });
        } else if (sourceDoc.updatedAt > targetDoc.updatedAt) {
          modified.push({ id: sourceDoc.id, name: sourceDoc.name });
        }
      }

      // Find deleted (in target but not in source)
      for (const [baseId, targetDoc] of targetByBase) {
        if (!sourceByBase.has(baseId)) {
          deleted.push({ id: targetDoc.id, name: targetDoc.name });
        }
      }

      return { added, modified, deleted };
    })
  );

  // List Folders
  tools.push(
    listFoldersDef.server(async ({ branchId, parentFolderId }) => {
      const conditions = [eq(folders.branchId, branchId)];
      if (parentFolderId) {
        conditions.push(eq(folders.parentId, parentFolderId));
      } else {
        conditions.push(sql`${folders.parentId} IS NULL`);
      }

      const result = await db.query.folders.findMany({
        where: and(...conditions),
        orderBy: folders.name,
      });

      return result.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId ?? undefined,
      }));
    })
  );

  // Create Folder
  tools.push(
    createFolderDef.server(async ({ branchId, name, parentFolderId }) => {
      // Get project ID from branch
      const branch = await db.query.branches.findFirst({
        where: eq(branches.id, branchId),
      });
      if (!branch) throw new Error("Branch not found");

      const [folder] = await db
        .insert(folders)
        .values({
          projectId: branch.projectId,
          branchId,
          parentId: parentFolderId,
          name,
          createdBy: userId,
        })
        .returning();

      return { folderId: folder.id, name: folder.name };
    })
  );

  // Rename Folder
  tools.push(
    renameFolderDef.server(async ({ folderId, newName }) => {
      const [folder] = await db
        .update(folders)
        .set({ name: newName, updatedAt: new Date() })
        .where(eq(folders.id, folderId))
        .returning();

      return { success: !!folder, name: folder?.name || newName };
    })
  );

  // Delete Folder
  tools.push(
    deleteFolderDef.server(async ({ folderId }) => {
      // Check if folder is empty
      const docs = await db.query.documents.findFirst({
        where: eq(documents.folderId, folderId),
      });
      if (docs) throw new Error("Cannot delete non-empty folder");

      await db.delete(folders).where(eq(folders.id, folderId));

      return { success: true };
    })
  );

  // Search Documents
  tools.push(
    searchDocumentsDef.server(async ({ query }) => {
      const result = await db.query.documents.findMany({
        where: and(ilike(documents.name, `%${query}%`), eq(documents.isDeleted, false)),
        with: {
          branch: { with: { project: { with: { workspace: true } } } },
        },
        limit: 20,
      });

      return result.map((d) => ({
        id: d.id,
        name: d.name,
        projectId: d.branch.projectId,
        projectName: d.branch.project.name,
        workspaceName: d.branch.project.workspace.name,
      }));
    })
  );

  // Search Projects
  tools.push(
    searchProjectsDef.server(async ({ query }) => {
      const result = await db.query.projects.findMany({
        where: ilike(projects.name, `%${query}%`),
        with: { workspace: true },
        limit: 20,
      });

      return result.map((p) => ({
        id: p.id,
        name: p.name,
        workspaceId: p.workspaceId,
        workspaceName: p.workspace.name,
      }));
    })
  );

  return tools;
}
