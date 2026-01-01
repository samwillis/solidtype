/**
 * Database schema exports
 *
 * All schema definitions are exported from here for use with Drizzle.
 */

// Better-auth tables (managed by better-auth, but included for type inference and relations)
export { user, session, account, verification } from "./better-auth";
export { userRelations, sessionRelations, accountRelations } from "./better-auth";

// Application tables
// Note: We keep the 'users' export for backwards compatibility, but better-auth uses 'user' (singular)
export { users } from "./users";
export type { User, NewUser } from "./users";

export { workspaces, workspacesRelations } from "./workspaces";
export type { Workspace, NewWorkspace } from "./workspaces";

export {
  workspaceMembers,
  workspaceMembersRelations,
  workspaceRoleEnum,
} from "./workspace-members";
export type { WorkspaceMember, NewWorkspaceMember, WorkspaceRole } from "./workspace-members";

export { projects, projectsRelations } from "./projects";
export type { Project, NewProject } from "./projects";

export { projectMembers, projectMembersRelations, projectRoleEnum } from "./project-members";
export type { ProjectMember, NewProjectMember, ProjectRole } from "./project-members";

export { branches, branchesRelations } from "./branches";
export type { Branch, NewBranch } from "./branches";

export { folders, foldersRelations } from "./folders";
export type { Folder, NewFolder } from "./folders";

export { documents, documentsRelations, documentTypeEnum } from "./documents";
export type { Document, NewDocument, DocumentType } from "./documents";
