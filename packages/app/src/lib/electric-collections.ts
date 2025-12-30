/**
 * Electric Collections for SolidType
 * 
 * Uses TanStack DB with Electric collections for real-time sync.
 * Collections subscribe to Electric Shapes via the server proxy.
 * 
 * Architecture:
 * - Electric (read-path): Postgres → Electric → Client collections
 * - Writes: Collection mutation → API → Postgres → txid → Electric sync → reconcile
 * 
 * Collections are singleton instances - one per table.
 * The auth proxy ensures users only sync data they have access to.
 * Components query collections using useLiveQuery with WHERE clauses.
 * 
 * See: https://electric-sql.com/AGENTS.md
 */

import { createCollection } from '@tanstack/react-db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { z } from 'zod';
import {
  createBranchMutation,
  updateBranchMutation,
  deleteBranchMutation,
  createDocumentMutation,
  updateDocumentMutation,
  deleteDocumentMutation,
  createFolderMutation,
  updateFolderMutation,
  deleteFolderMutation,
  createWorkspaceMutation,
  updateWorkspaceMutation,
  deleteWorkspaceMutation,
  createProjectMutation,
  updateProjectMutation,
  deleteProjectMutation,
} from './server-functions';

// ============================================================================
// Schemas (Zod for validation + type inference)
// ============================================================================

export const branchSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  is_main: z.boolean(),
  parent_branch_id: z.string().uuid().nullable(),
  forked_at: z.string().datetime().nullable(),
  created_by: z.string(), // text ID from better-auth
  owner_id: z.string(), // text ID from better-auth
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  merged_at: z.string().datetime().nullable(),
  merged_by: z.string().nullable(),
});

export const documentSchema = z.object({
  id: z.string().uuid(),
  branch_id: z.string().uuid(),
  name: z.string(),
  folder_id: z.string().uuid().nullable(),
  sort_order: z.number(),
  durable_stream_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.string(), // text ID from better-auth
  last_edited_by: z.string().nullable(),
  is_deleted: z.boolean(),
  deleted_at: z.string().datetime().nullable(),
  deleted_by: z.string().nullable(),
});

export const folderSchema = z.object({
  id: z.string().uuid(),
  branch_id: z.string().uuid(),
  name: z.string(),
  parent_id: z.string().uuid().nullable(),
  sort_order: z.number(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  created_by: z.string(), // text ID from better-auth
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const projectSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  created_by: z.string(), // text ID from better-auth
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Type exports
export type Branch = z.infer<typeof branchSchema>;
export type Document = z.infer<typeof documentSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Project = z.infer<typeof projectSchema>;

// ============================================================================
// Singleton Collections (one per table)
// ============================================================================

// Get API base URL for client-side requests
const getApiBase = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
};

/**
 * Workspaces collection
 * Syncs all workspaces the authenticated user is a member of.
 */
export const workspacesCollection = createCollection(
  electricCollectionOptions({
    id: 'workspaces',
    schema: workspaceSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/workspaces`,
      parser: {
        timestamptz: (date: string) => date,
      },
    },
    onInsert: async ({ transaction }) => {
      const newWorkspace = transaction.mutations[0].modified;
      const { txid } = await createWorkspaceMutation({ data: { workspace: newWorkspace } });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateWorkspaceMutation({ data: { workspaceId: updated.id, updates: updated } });
      return { txid };
    },
    onDelete: async ({ transaction }) => {
      const deleted = transaction.mutations[0].original;
      const { txid } = await deleteWorkspaceMutation({ data: { workspaceId: deleted.id } });
      return { txid };
    },
  })
);

/**
 * Branches collection
 * Syncs all branches the authenticated user has access to.
 */
export const branchesCollection = createCollection(
  electricCollectionOptions({
    id: 'branches',
    schema: branchSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/branches`,
      parser: {
        timestamptz: (date: string) => date,
      },
    },
    onInsert: async ({ transaction }) => {
      const newBranch = transaction.mutations[0].modified;
      const { txid } = await createBranchMutation({ data: { projectId: newBranch.project_id, branch: newBranch } });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateBranchMutation({ data: { branchId: updated.id, updates: updated } });
      return { txid };
    },
    onDelete: async ({ transaction }) => {
      const deleted = transaction.mutations[0].original;
      const { txid } = await deleteBranchMutation({ data: { branchId: deleted.id } });
      return { txid };
    },
  })
);

/**
 * Documents collection
 * Syncs all documents the authenticated user has access to.
 */
export const documentsCollection = createCollection(
  electricCollectionOptions({
    id: 'documents',
    schema: documentSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/documents`,
      parser: {
        timestamptz: (date: string) => date,
      },
    },
    onInsert: async ({ transaction }) => {
      const newDoc = transaction.mutations[0].modified;
      const { txid } = await createDocumentMutation({ data: { document: newDoc } });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateDocumentMutation({ data: { documentId: updated.id, updates: updated } });
      return { txid };
    },
    onDelete: async ({ transaction }) => {
      const deleted = transaction.mutations[0].original;
      const { txid } = await deleteDocumentMutation({ data: { documentId: deleted.id } });
      return { txid };
    },
  })
);

/**
 * Projects collection
 * Syncs all projects the authenticated user has access to.
 */
export const projectsCollection = createCollection(
  electricCollectionOptions({
    id: 'projects',
    schema: projectSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/projects`,
      parser: {
        timestamptz: (date: string) => date,
      },
    },
    onInsert: async ({ transaction }) => {
      const newProject = transaction.mutations[0].modified;
      const { txid } = await createProjectMutation({ data: { project: newProject } });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateProjectMutation({ data: { projectId: updated.id, updates: updated } });
      return { txid };
    },
    onDelete: async ({ transaction }) => {
      const deleted = transaction.mutations[0].original;
      const { txid } = await deleteProjectMutation({ data: { projectId: deleted.id } });
      return { txid };
    },
  })
);

/**
 * Folders collection
 * Syncs all folders the authenticated user has access to.
 */
export const foldersCollection = createCollection(
  electricCollectionOptions({
    id: 'folders',
    schema: folderSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/folders`,
      parser: {
        timestamptz: (date: string) => date,
      },
    },
    onInsert: async ({ transaction }) => {
      const newFolder = transaction.mutations[0].modified;
      const { txid } = await createFolderMutation({ data: { folder: newFolder } });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateFolderMutation({ data: { folderId: updated.id, updates: updated } });
      return { txid };
    },
    onDelete: async ({ transaction }) => {
      const deleted = transaction.mutations[0].original;
      const { txid } = await deleteFolderMutation({ data: { folderId: deleted.id } });
      return { txid };
    },
  })
);