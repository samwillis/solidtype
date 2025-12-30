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

import { createServerFn } from '@tanstack/react-start';
import { db, pool } from './db';
import { 
  workspaces, 
  workspaceMembers, 
  projects, 
  projectMembers, 
  branches,
  documents,
  folders,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';

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

export const getWorkspaces = createServerFn({ method: 'GET' })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const userWorkspaces = await db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        eq(workspaces.id, workspaceMembers.workspaceId)
      )
      .where(eq(workspaceMembers.userId, data.userId));
    
    return userWorkspaces;
  });

export const createWorkspace = createServerFn({ method: 'POST' })
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
        role: 'owner',
      });
      
      return [ws];
    });
    
    return workspace;
  });

export const getWorkspace = createServerFn({ method: 'GET' })
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
      throw new Error('Forbidden');
    }
    
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, data.workspaceId),
    });
    
    if (!workspace) {
      throw new Error('Not found');
    }
    
    return { workspace, role: membership.role };
  });

// ============================================================================
// Project Functions
// ============================================================================

export const getProjects = createServerFn({ method: 'GET' })
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
      throw new Error('Forbidden');
    }
    
    let userProjects;
    if (membership.role === 'owner' || membership.role === 'admin') {
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
          and(
            eq(projects.workspaceId, data.workspaceId),
            eq(projectMembers.userId, data.userId)
          )
        );
    }
    
    return userProjects;
  });

export const createProject = createServerFn({ method: 'POST' })
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
      throw new Error('Forbidden');
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
        role: 'owner',
        canEdit: true,
      });
      
      await tx.insert(branches).values({
        projectId: proj.id,
        name: 'main',
        description: 'Main branch',
        isMain: true,
        createdBy: data.userId,
        ownerId: data.userId,
      });
      
      return [proj];
    });
    
    return project;
  });

export const getProject = createServerFn({ method: 'GET' })
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
      throw new Error('Forbidden');
    }
    
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, data.projectId),
      with: { branches: true },
    });
    
    if (!project) {
      throw new Error('Not found');
    }
    
    return { project, access: { canEdit: projectMember.canEdit, role: projectMember.role } };
  });

// ============================================================================
// Document Functions
// ============================================================================

export const getDocument = createServerFn({ method: 'GET' })
  .inputValidator((d: GetDocumentInput) => d)
  .handler(async ({ data }) => {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, data.docId),
    });
    
    if (!doc) {
      throw new Error('Not found');
    }
    
    // Check project access via the document's branch and project
    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, doc.branchId),
    });
    
    if (!branch) {
      throw new Error('Not found');
    }
    
    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, branch.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });
    
    if (!projectMember) {
      throw new Error('Forbidden');
    }
    
    return { document: doc, access: { canEdit: projectMember.canEdit } };
  });

export const updateDocument = createServerFn({ method: 'POST' })
  .inputValidator((d: UpdateDocumentInput) => d)
  .handler(async ({ data }) => {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, data.docId),
    });
    
    if (!doc) {
      throw new Error('Not found');
    }
    
    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, doc.branchId),
    });
    
    if (!branch) {
      throw new Error('Not found');
    }
    
    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, branch.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });
    
    if (!projectMember || !projectMember.canEdit) {
      throw new Error('Forbidden');
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

export const deleteDocument = createServerFn({ method: 'POST' })
  .inputValidator((d: DeleteDocumentInput) => d)
  .handler(async ({ data }) => {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, data.docId),
    });
    
    if (!doc) {
      throw new Error('Not found');
    }
    
    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, doc.branchId),
    });
    
    if (!branch) {
      throw new Error('Not found');
    }
    
    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, branch.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });
    
    if (!projectMember || !projectMember.canEdit) {
      throw new Error('Forbidden');
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
  const result = await pool.query<{ txid_current: bigint }>('SELECT txid_current()');
  // txid_current returns a bigint, convert to number
  return Number(result.rows[0]?.txid_current || 0);
}

// Branch mutations
export const createBranchMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { projectId: string; branch: any }) => d)
  .handler(async ({ data }) => {
    const [created] = await db
      .insert(branches)
      .values(data.branch)
      .returning();
    
    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateBranchMutation = createServerFn({ method: 'POST' })
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

export const deleteBranchMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { branchId: string }) => d)
  .handler(async ({ data }) => {
    await db
      .delete(branches)
      .where(eq(branches.id, data.branchId));
    
    const txid = await getCurrentTxid();
    return { data: { id: data.branchId }, txid };
  });

// Document mutations
export const createDocumentMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { document: any }) => d)
  .handler(async ({ data }) => {
    const [created] = await db
      .insert(documents)
      .values(data.document)
      .returning();
    
    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateDocumentMutation = createServerFn({ method: 'POST' })
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

export const deleteDocumentMutation = createServerFn({ method: 'POST' })
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
export const createFolderMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { folder: any }) => d)
  .handler(async ({ data }) => {
    const [created] = await db
      .insert(folders)
      .values(data.folder)
      .returning();
    
    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateFolderMutation = createServerFn({ method: 'POST' })
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

export const deleteFolderMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { folderId: string }) => d)
  .handler(async ({ data }) => {
    await db
      .delete(folders)
      .where(eq(folders.id, data.folderId));
    
    const txid = await getCurrentTxid();
    return { data: { id: data.folderId }, txid };
  });

// Workspace mutations
export const createWorkspaceMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { workspace: any }) => d)
  .handler(async ({ data }) => {
    const [created] = await db
      .insert(workspaces)
      .values(data.workspace)
      .returning();
    
    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateWorkspaceMutation = createServerFn({ method: 'POST' })
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

export const deleteWorkspaceMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data }) => {
    await db
      .delete(workspaces)
      .where(eq(workspaces.id, data.workspaceId));
    
    const txid = await getCurrentTxid();
    return { data: { id: data.workspaceId }, txid };
  });

// Project mutations
export const createProjectMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { project: any }) => d)
  .handler(async ({ data }) => {
    const [created] = await db
      .insert(projects)
      .values(data.project)
      .returning();
    
    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateProjectMutation = createServerFn({ method: 'POST' })
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

export const deleteProjectMutation = createServerFn({ method: 'POST' })
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data }) => {
    await db
      .delete(projects)
      .where(eq(projects.id, data.projectId));
    
    const txid = await getCurrentTxid();
    return { data: { id: data.projectId }, txid };
  });
