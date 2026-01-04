/**
 * Server Functions - Main Entry Point
 *
 * Re-exports all server functions organized by domain.
 */

// Helpers (pure functions safe for client use)
export { normalizeNullableUuid } from "./helpers";

// Workspace operations
export {
  getWorkspaces,
  getWorkspace,
  createWorkspace,
  createWorkspaceMutation,
  updateWorkspaceMutation,
  deleteWorkspaceMutation,
} from "./workspace";

// Project operations
export {
  getProjects,
  getProject,
  createProject,
  createProjectMutation,
  updateProjectMutation,
  deleteProjectMutation,
} from "./project";

// Document operations
export {
  getDocument,
  updateDocument,
  deleteDocument,
  createDocumentMutation,
  updateDocumentMutation,
  deleteDocumentMutation,
} from "./document";

// Branch operations
export {
  getBranchesForProject,
  createBranchMutation,
  updateBranchMutation,
  deleteBranchMutation,
  createBranchWithContentMutation,
  mergeBranchMutation,
} from "./branch";

// Folder operations
export {
  getFoldersForBranch,
  createFolderMutation,
  updateFolderMutation,
  deleteFolderMutation,
} from "./folder";

// Member management
export {
  // Workspace members
  listWorkspaceMembersMutation,
  addWorkspaceMemberMutation,
  updateWorkspaceMemberRoleMutation,
  removeWorkspaceMemberMutation,
  // Project members
  listProjectMembersMutation,
  addProjectMemberMutation,
  updateProjectMemberMutation,
  removeProjectMemberMutation,
} from "./member";

// AI Chat sessions
export {
  createChatSessionMutation,
  updateChatSessionMutation,
  deleteChatSessionMutation,
  createChatSessionDirect,
} from "./ai-chat";
