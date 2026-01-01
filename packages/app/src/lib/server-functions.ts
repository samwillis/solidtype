/**
 * Server Functions using TanStack Start
 *
 * These functions run on the server and can be called from the client.
 *
 * NOTE: Authentication is currently disabled for development.
 * To enable auth, set up TanStack Start's useSession or integrate better-auth
 * with request middleware.
 *
 * See: https://tanstack.com/start/latest/docs/framework/react/middleware
 */

import { createServerFn } from "@tanstack/react-start";
import { db, pool } from "./db";
import { requireAuth } from "./auth-middleware";
import {
  workspaces,
  workspaceMembers,
  projects,
  projectMembers,
  branches,
  documents,
  folders,
} from "../db/schema";
import { eq, and } from "drizzle-orm";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a nullable UUID field value.
 * Converts empty strings, undefined, and whitespace-only strings to undefined.
 * Using undefined (not null) causes Drizzle to omit the field from the insert,
 * which allows the database to use its default (NULL) for nullable columns.
 */
function normalizeNullableUuid(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return undefined;
}

// ============================================================================
// Types
// ============================================================================

interface CreateWorkspaceInput {
  name: string;
  slug: string;
  description?: string;
  userId: string; // TODO: Get from session
}

interface GetWorkspaceInput {
  workspaceId: string;
  userId: string; // TODO: Get from session
}

interface GetProjectsInput {
  workspaceId: string;
  userId: string; // TODO: Get from session
}

interface CreateProjectInput {
  workspaceId: string;
  name: string;
  description?: string;
  userId: string; // TODO: Get from session
}

interface GetProjectInput {
  projectId: string;
  userId: string; // TODO: Get from session
}

interface GetDocumentInput {
  docId: string;
  userId: string; // TODO: Get from session
}

interface UpdateDocumentInput {
  docId: string;
  name?: string;
  folderId?: string | null;
  userId: string; // TODO: Get from session
}

interface DeleteDocumentInput {
  docId: string;
  userId: string; // TODO: Get from session
}

// ============================================================================
// Workspace Functions
// ============================================================================

export const getWorkspaces = createServerFn({ method: "GET" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const userWorkspaces = await db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, data.userId));

    return userWorkspaces;
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .inputValidator((d: CreateWorkspaceInput) => d)
  .handler(async ({ data }) => {
    const [workspace] = await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({
          name: data.name,
          slug: data.slug,
          description: data.description,
          createdBy: data.userId,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: data.userId,
        role: "owner",
      });

      return [ws];
    });

    return workspace;
  });

export const getWorkspace = createServerFn({ method: "GET" })
  .inputValidator((d: GetWorkspaceInput) => d)
  .handler(async ({ data }) => {
    // Verify membership
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!membership) {
      throw new Error("Forbidden");
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, data.workspaceId),
    });

    if (!workspace) {
      throw new Error("Not found");
    }

    return { workspace, role: membership.role };
  });

// ============================================================================
// Project Functions
// ============================================================================

export const getProjects = createServerFn({ method: "GET" })
  .inputValidator((d: GetProjectsInput) => d)
  .handler(async ({ data }) => {
    // Verify workspace membership
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!membership) {
      throw new Error("Forbidden");
    }

    let userProjects;
    if (membership.role === "owner" || membership.role === "admin") {
      userProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, data.workspaceId));
    } else {
      userProjects = await db
        .select({ project: projects })
        .from(projects)
        .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
        .where(
          and(eq(projects.workspaceId, data.workspaceId), eq(projectMembers.userId, data.userId))
        );
    }

    return userProjects;
  });

export const createProject = createServerFn({ method: "POST" })
  .inputValidator((d: CreateProjectInput) => d)
  .handler(async ({ data }) => {
    // Verify workspace membership
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!membership) {
      throw new Error("Forbidden");
    }

    const [project] = await db.transaction(async (tx) => {
      const [proj] = await tx
        .insert(projects)
        .values({
          workspaceId: data.workspaceId,
          name: data.name,
          description: data.description,
          createdBy: data.userId,
        })
        .returning();

      await tx.insert(projectMembers).values({
        projectId: proj.id,
        userId: data.userId,
        role: "owner",
        canEdit: true,
      });

      await tx.insert(branches).values({
        projectId: proj.id,
        name: "main",
        description: "Main branch",
        isMain: true,
        createdBy: data.userId,
        ownerId: data.userId,
      });

      return [proj];
    });

    return project;
  });

export const getProject = createServerFn({ method: "GET" })
  .inputValidator((d: GetProjectInput) => d)
  .handler(async ({ data }) => {
    // Check project access
    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!projectMember) {
      throw new Error("Forbidden");
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, data.projectId),
      with: { branches: true },
    });

    if (!project) {
      throw new Error("Not found");
    }

    return { project, access: { canEdit: projectMember.canEdit, role: projectMember.role } };
  });

// ============================================================================
// Document Functions
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
// Electric Collection Mutation Server Functions
// These return { data, txid } for Electric reconciliation
// ============================================================================

/**
 * Helper to get the current Postgres transaction ID
 * Electric uses this for reconciliation after mutations
 */
async function getCurrentTxid(): Promise<number> {
  const result = await pool.query<{ txid_current: bigint }>("SELECT txid_current()");
  // txid_current returns a bigint, convert to number
  return Number(result.rows[0]?.txid_current || 0);
}

// Branch mutations
export const createBranchMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string; branch: any }) => d)
  .handler(async ({ data }) => {
    const [created] = await db.insert(branches).values(data.branch).returning();

    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateBranchMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { branchId: string; updates: any }) => d)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(branches)
      .set(data.updates)
      .where(eq(branches.id, data.branchId))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const deleteBranchMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { branchId: string }) => d)
  .handler(async ({ data }) => {
    // Check if branch is main - cannot delete main branch
    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, data.branchId),
    });

    if (!branch) {
      throw new Error("Branch not found");
    }

    if (branch.isMain) {
      throw new Error("Cannot delete main branch");
    }

    await db.delete(branches).where(eq(branches.id, data.branchId));

    const txid = await getCurrentTxid();
    return { data: { id: data.branchId }, txid };
  });

// Document mutations
export const createDocumentMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { document: any }) => d)
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

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
    const [created] = await db.insert(documents).values(normalizedDocument).returning();

    // Set baseDocumentId = id for new documents (as per schema comment)
    // Generate durableStreamId: "project/{projectId}/doc/{documentId}/branch/{branchId}"
    const durableStreamId = `project/${created.projectId}/doc/${created.id}/branch/${created.branchId}`;
    const [updated] = await db
      .update(documents)
      .set({
        durableStreamId,
        baseDocumentId: created.id,
      })
      .where(eq(documents.id, created.id))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const updateDocumentMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { documentId: string; updates: any }) => d)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(documents)
      .set(data.updates)
      .where(eq(documents.id, data.documentId))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const deleteDocumentMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data }) => {
    await db
      .update(documents)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
      })
      .where(eq(documents.id, data.documentId));

    const txid = await getCurrentTxid();
    return { data: { id: data.documentId }, txid };
  });

// Folder mutations
export const createFolderMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { folder: any }) => d)
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    const [created] = await db
      .insert(folders)
      .values({
        ...data.folder,
        createdBy: session.user.id, // Override with session user ID for security
      })
      .returning();

    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateFolderMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { folderId: string; updates: any }) => d)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(folders)
      .set(data.updates)
      .where(eq(folders.id, data.folderId))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const deleteFolderMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { folderId: string }) => d)
  .handler(async ({ data }) => {
    const folderId = data.folderId;

    // Verify folder exists before deleting
    const folder = await db.query.folders.findFirst({
      where: eq(folders.id, folderId),
    });

    if (!folder) {
      throw new Error("Folder not found");
    }

    await db.delete(folders).where(eq(folders.id, folderId));

    const txid = await getCurrentTxid();
    return { data: { id: folderId }, txid };
  });

// Workspace mutations
export const createWorkspaceMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { workspace: any }) => d)
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    const [created] = await db
      .insert(workspaces)
      .values({
        ...data.workspace,
        createdBy: session.user.id, // Override with session user ID for security
      })
      .returning();

    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateWorkspaceMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { workspaceId: string; updates: any }) => d)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(workspaces)
      .set(data.updates)
      .where(eq(workspaces.id, data.workspaceId))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const deleteWorkspaceMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data }) => {
    await db.delete(workspaces).where(eq(workspaces.id, data.workspaceId));

    const txid = await getCurrentTxid();
    return { data: { id: data.workspaceId }, txid };
  });

// Project mutations
export const createProjectMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { project: any }) => d)
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Create project, project member, and main branch in a transaction
    const [created] = await db.transaction(async (tx) => {
      // Create project
      const [project] = await tx
        .insert(projects)
        .values({
          ...data.project,
          createdBy: session.user.id, // Override with session user ID for security
        })
        .returning();

      // Add creator as project owner (required for Electric sync access)
      await tx.insert(projectMembers).values({
        projectId: project.id,
        userId: session.user.id,
        role: "owner",
        canEdit: true,
      });

      // Automatically create "main" branch
      await tx.insert(branches).values({
        projectId: project.id,
        name: "main",
        isMain: true,
        createdBy: session.user.id,
        ownerId: session.user.id,
      });

      return [project];
    });

    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateProjectMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string; updates: any }) => d)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(projects)
      .set(data.updates)
      .where(eq(projects.id, data.projectId))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const deleteProjectMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data }) => {
    await db.delete(projects).where(eq(projects.id, data.projectId));

    const txid = await getCurrentTxid();
    return { data: { id: data.projectId }, txid };
  });

/**
 * Create a new branch with copied content from parent branch.
 * This copies all folders and documents from the parent branch.
 * Documents keep the same baseDocumentId for tracking across branches.
 */
export const createBranchWithContentMutation = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { projectId: string; parentBranchId: string; name: string; description: string | null }) =>
      d
  )
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Create branch and copy content in a transaction
    const result = await db.transaction(async (tx) => {
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

      // Copy child folders (simple approach - may need multiple passes for deep hierarchies)
      // For now, we'll do a simple single-pass approach
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
        const baseDocId = doc.baseDocumentId || doc.id; // Use existing baseDocumentId or the document's own ID

        await tx.insert(documents).values({
          projectId: data.projectId,
          branchId: newBranch.id,
          baseDocumentId: baseDocId,
          folderId: newFolderId,
          name: doc.name,
          type: doc.type,
          // Note: durableStreamId will be null - Yjs stream forking is not yet implemented
          durableStreamId: null,
          featureCount: doc.featureCount,
          sortOrder: doc.sortOrder,
          createdBy: session.user.id,
        });
      }

      return { branch: newBranch };
    });

    const txid = await getCurrentTxid();
    return { data: result, txid };
  });

// Helper functions for fetching data for dialogs
export const getBranchesForProject = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    const projectBranches = await db
      .select()
      .from(branches)
      .where(eq(branches.projectId, data.projectId))
      .orderBy(branches.isMain, "desc")
      .orderBy(branches.createdAt, "desc");

    return { data: projectBranches };
  });

export const getFoldersForBranch = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string; branchId: string; parentId?: string | null }) => d)
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

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
      .orderBy(folders.sortOrder)
      .orderBy(folders.name);

    return { data: branchFolders };
  });
