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
 * Schema Architecture:
 * - Entity schemas are defined in schemas/entities/ with transforms
 * - Input types accept string dates (from API/Electric)
 * - Output types have Date objects (after Electric parser + Zod transform)
 * - Electric parser converts timestamptz strings to Date objects at sync level
 *
 * See: https://electric-sql.com/AGENTS.md
 */

import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
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
  createChatSessionMutation,
  updateChatSessionMutation,
  deleteChatSessionMutation,
} from "./server-functions";

// Import centralized entity schemas
import {
  workspaceSchema,
  projectSchema,
  branchSchema,
  documentSchema,
  folderSchema,
  aiChatSessionSchema,
} from "../schemas";

// Re-export types for backwards compatibility
export type {
  Workspace,
  WorkspaceInput,
  WorkspaceOutput,
  Project,
  ProjectInput,
  ProjectOutput,
  Branch,
  BranchInput,
  BranchOutput,
  Document,
  DocumentInput,
  DocumentOutput,
  DocumentType,
  Folder,
  FolderInput,
  FolderOutput,
  AIChatSession,
  AIChatSessionInput,
  AIChatSessionOutput,
  AIChatContext,
  AIChatStatus,
} from "../schemas";

// ============================================================================
// Electric Parser Configuration
// ============================================================================

/**
 * Custom parser for Electric shape streams.
 * Converts PostgreSQL timestamp strings to JavaScript Date objects.
 */
const electricParser = {
  timestamptz: (date: string) => new Date(date),
};

// ============================================================================
// Helper Functions
// ============================================================================

// Get API base URL for client-side requests
const getApiBase = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
};

// ============================================================================
// Singleton Collections (one per table)
// ============================================================================

/**
 * Workspaces collection
 * Syncs all workspaces the authenticated user is a member of.
 */
export const workspacesCollection = createCollection(
  electricCollectionOptions({
    id: "workspaces",
    schema: workspaceSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/workspaces`,
      parser: electricParser,
    },
    onInsert: async ({ transaction }) => {
      const newWorkspace = transaction.mutations[0].modified;
      const { txid } = await createWorkspaceMutation({
        data: {
          name: newWorkspace.name,
          slug: newWorkspace.slug,
          description: newWorkspace.description ?? undefined,
        },
      });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateWorkspaceMutation({
        data: {
          workspaceId: updated.id,
          updates: {
            name: updated.name,
            description: updated.description ?? undefined,
          },
        },
      });
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
    id: "branches",
    schema: branchSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/branches`,
      parser: electricParser,
    },
    onInsert: async ({ transaction }) => {
      const newBranch = transaction.mutations[0].modified;
      const { txid } = await createBranchMutation({
        data: {
          projectId: newBranch.project_id,
          branch: {
            name: newBranch.name,
            description: newBranch.description,
            parentBranchId: newBranch.parent_branch_id ?? undefined,
            isMain: newBranch.is_main,
          },
        },
      });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateBranchMutation({
        data: {
          branchId: updated.id,
          updates: {
            name: updated.name,
            description: updated.description,
          },
        },
      });
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
    id: "documents",
    schema: documentSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/documents`,
      parser: electricParser,
    },
    onInsert: async ({ transaction }) => {
      const newDoc = transaction.mutations[0].modified;
      // Build document object with only the fields the server expects
      const folderId =
        newDoc.folder_id &&
        typeof newDoc.folder_id === "string" &&
        newDoc.folder_id.trim() !== ""
          ? newDoc.folder_id
          : undefined;

      const { txid } = await createDocumentMutation({
        data: {
          document: {
            projectId: newDoc.project_id,
            branchId: newDoc.branch_id,
            name: newDoc.name,
            type: newDoc.type,
            folderId: folderId ?? null,
            featureCount: newDoc.feature_count ?? undefined,
            sortOrder: newDoc.sort_order ?? undefined,
          },
        },
      });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateDocumentMutation({
        data: {
          documentId: updated.id,
          updates: {
            name: updated.name,
            folderId: updated.folder_id,
            featureCount: updated.feature_count ?? undefined,
            sortOrder: updated.sort_order ?? undefined,
          },
        },
      });
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
    id: "projects",
    schema: projectSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/projects`,
      parser: electricParser,
    },
    onInsert: async ({ transaction }) => {
      const newProject = transaction.mutations[0].modified;
      const { txid } = await createProjectMutation({
        data: {
          workspaceId: newProject.workspace_id,
          name: newProject.name,
          description: newProject.description ?? undefined,
        },
      });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateProjectMutation({
        data: {
          projectId: updated.id,
          updates: {
            name: updated.name,
            description: updated.description ?? undefined,
          },
        },
      });
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
    id: "folders",
    schema: folderSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/folders`,
      parser: electricParser,
    },
    onInsert: async ({ transaction }) => {
      const newFolder = transaction.mutations[0].modified;
      const { txid } = await createFolderMutation({
        data: {
          folder: {
            projectId: newFolder.project_id,
            branchId: newFolder.branch_id,
            name: newFolder.name,
            parentId: newFolder.parent_id,
            sortOrder: newFolder.sort_order ?? undefined,
          },
        },
      });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateFolderMutation({
        data: {
          folderId: updated.id,
          updates: {
            name: updated.name,
            parentId: updated.parent_id,
            sortOrder: updated.sort_order ?? undefined,
          },
        },
      });
      return { txid };
    },
    onDelete: async ({ transaction }) => {
      const deleted = transaction.mutations[0].original;
      const { txid } = await deleteFolderMutation({ data: { folderId: deleted.id } });
      return { txid };
    },
  })
);

/**
 * AI Chat Sessions collection
 * Syncs all chat sessions for the authenticated user.
 */
export const aiChatSessionsCollection = createCollection(
  electricCollectionOptions({
    id: "ai_chat_sessions",
    schema: aiChatSessionSchema,
    getKey: (row) => row.id,
    shapeOptions: {
      url: `${getApiBase()}/api/shapes/ai-chat-sessions`,
      parser: electricParser,
    },
    onInsert: async ({ transaction }) => {
      const newSession = transaction.mutations[0].modified;
      const { txid } = await createChatSessionMutation({
        data: {
          session: {
            id: newSession.id ?? undefined,
            context: newSession.context,
            document_id: newSession.document_id,
            project_id: newSession.project_id,
            title: newSession.title ?? undefined,
          },
        },
      });
      return { txid };
    },
    onUpdate: async ({ transaction }) => {
      const updated = transaction.mutations[0].modified;
      const { txid } = await updateChatSessionMutation({
        data: {
          sessionId: updated.id,
          updates: {
            title: updated.title ?? undefined,
            status: updated.status,
          },
        },
      });
      return { txid };
    },
    onDelete: async ({ transaction }) => {
      const deleted = transaction.mutations[0].original;
      const { txid } = await deleteChatSessionMutation({ data: { sessionId: deleted.id } });
      return { txid };
    },
  })
);
