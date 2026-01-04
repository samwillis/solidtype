/**
 * Server Functions - Main Entry Point
 *
 * Re-exports all server functions organized by domain.
 * This file maintains backward compatibility with existing imports.
 */

// Helpers
export { normalizeNullableUuid, getCurrentTxid } from "./helpers";

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

// Re-export remaining functions from the original file
// TODO: These should be moved to their own domain modules
export {
  getDocument,
  updateDocument,
  deleteDocument,
  createBranchMutation,
  updateBranchMutation,
  deleteBranchMutation,
  createDocumentMutation,
  updateDocumentMutation,
  deleteDocumentMutation,
  createFolderMutation,
  updateFolderMutation,
  deleteFolderMutation,
  createBranchWithContentMutation,
  getBranchesForProject,
  getFoldersForBranch,
  mergeBranchMutation,
  listWorkspaceMembersMutation,
  addWorkspaceMemberMutation,
  updateWorkspaceMemberRoleMutation,
  removeWorkspaceMemberMutation,
  listProjectMembersMutation,
  addProjectMemberMutation,
  updateProjectMemberMutation,
  removeProjectMemberMutation,
  // AI Chat sessions
  createChatSessionMutation,
  updateChatSessionMutation,
  deleteChatSessionMutation,
  createChatSessionDirect,
} from "../server-functions-legacy";
