/**
 * Authorization Module
 *
 * Unified authorization primitives for checking user permissions.
 * All permission checks should go through this module.
 *
 * Usage:
 * ```ts
 * const session = await getSessionOrThrow(request);
 * const membership = await requireWorkspaceMember(session, workspaceId);
 * ```
 */

import { auth } from "../auth";
import { AuthenticationError, ForbiddenError, NotFoundError } from "../http/errors";
import * as workspacesRepo from "../../repos/workspaces";
import * as projectsRepo from "../../repos/projects";
import * as documentsRepo from "../../repos/documents";
import * as aiChatRepo from "../../repos/ai-chat";

// Re-export for convenience
export { AuthenticationError, ForbiddenError, NotFoundError };

/**
 * Session type from better-auth
 */
export interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}

export type WorkspaceRole = "owner" | "admin" | "member";
export type ProjectRole = "owner" | "admin" | "member" | "guest";

// ============================================================================
// Core Auth
// ============================================================================

/**
 * Get session from request, throwing if not authenticated
 */
export async function getSessionOrThrow(request: Request): Promise<Session> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw new AuthenticationError();
  }

  return session as Session;
}

/**
 * Get session without requiring authentication
 * Returns null if not authenticated
 */
export async function getSession(request: Request): Promise<Session | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session as Session | null;
}

// ============================================================================
// Workspace Authorization
// ============================================================================

/**
 * Require user to be a member of a workspace
 * Throws ForbiddenError if not a member
 */
export async function requireWorkspaceMember(
  session: Session,
  workspaceId: string
): Promise<workspacesRepo.WorkspaceMembership> {
  const membership = await workspacesRepo.getMembership(workspaceId, session.user.id);

  if (!membership) {
    throw new ForbiddenError("Not a member of this workspace");
  }

  return membership;
}

/**
 * Require user to have one of the specified roles in a workspace
 * Throws ForbiddenError if not authorized
 */
export async function requireWorkspaceRole(
  session: Session,
  workspaceId: string,
  roles: WorkspaceRole[]
): Promise<workspacesRepo.WorkspaceMembership> {
  const membership = await requireWorkspaceMember(session, workspaceId);

  if (!roles.includes(membership.role)) {
    throw new ForbiddenError(`Requires one of these roles: ${roles.join(", ")}`);
  }

  return membership;
}

// ============================================================================
// Project Authorization
// ============================================================================

/**
 * Require user to have access to a project
 * Checks both workspace membership and direct project membership
 */
export async function requireProjectAccess(
  session: Session,
  projectId: string
): Promise<{ project: projectsRepo.ProjectWithWorkspace; canEdit: boolean; role: string }> {
  const project = await projectsRepo.findById(projectId);
  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const access = await projectsRepo.getEffectiveAccess(projectId, session.user.id);
  if (!access) {
    throw new ForbiddenError("Not authorized to access this project");
  }

  return { project, ...access };
}

/**
 * Require user to be able to edit a project
 */
export async function requireProjectEdit(
  session: Session,
  projectId: string
): Promise<{ project: projectsRepo.ProjectWithWorkspace; role: string }> {
  const { project, canEdit, role } = await requireProjectAccess(session, projectId);

  if (!canEdit) {
    throw new ForbiddenError("Read-only access to this project");
  }

  return { project, role };
}

/**
 * Require user to have a specific role on a project
 * For operations like delete that require ownership
 */
export async function requireProjectRole(
  session: Session,
  projectId: string,
  roles: ProjectRole[]
): Promise<{ project: projectsRepo.ProjectWithWorkspace }> {
  const { project, role } = await requireProjectAccess(session, projectId);

  if (!roles.includes(role as ProjectRole)) {
    throw new ForbiddenError(`Requires one of these roles: ${roles.join(", ")}`);
  }

  return { project };
}

// ============================================================================
// Document Authorization
// ============================================================================

export interface DocumentAccessResult {
  doc: documentsRepo.DocumentWithBranch;
  canEdit: boolean;
}

/**
 * Require user to have access to a document
 * Verifies access through the project/workspace hierarchy
 */
export async function requireDocumentAccess(
  session: Session,
  docId: string,
  mode: "view" | "edit" = "view"
): Promise<DocumentAccessResult> {
  const doc = await documentsRepo.findWithBranch(docId);
  if (!doc) {
    throw new NotFoundError("Document not found");
  }

  // Check project access (which checks workspace membership)
  const access = await projectsRepo.getEffectiveAccess(doc.projectId, session.user.id);
  if (!access) {
    throw new ForbiddenError("Not authorized to access this document");
  }

  if (mode === "edit" && !access.canEdit) {
    throw new ForbiddenError("Read-only access to this document");
  }

  return { doc, canEdit: access.canEdit };
}

// ============================================================================
// AI Chat Authorization
// ============================================================================

/**
 * Require user to own a chat session
 */
export async function requireChatSessionOwner(
  session: Session,
  sessionId: string
): Promise<aiChatRepo.ChatSession> {
  const chatSession = await aiChatRepo.findByIdAndUser(sessionId, session.user.id);

  if (!chatSession) {
    throw new ForbiddenError("Chat session not found or not owned by user");
  }

  return chatSession;
}

// ============================================================================
// Branch Authorization
// ============================================================================

/**
 * Require user to have access to a branch's project
 */
export async function requireBranchAccess(
  session: Session,
  branchId: string,
  mode: "view" | "edit" = "view"
): Promise<{ branch: NonNullable<Awaited<ReturnType<typeof documentsRepo.getBranch>>> }> {
  const branch = await documentsRepo.getBranch(branchId);
  if (!branch) {
    throw new NotFoundError("Branch not found");
  }

  // Check project access
  const access = await projectsRepo.getEffectiveAccess(branch.projectId, session.user.id);
  if (!access) {
    throw new ForbiddenError("Not authorized to access this branch");
  }

  if (mode === "edit" && !access.canEdit) {
    throw new ForbiddenError("Read-only access to this branch");
  }

  return { branch };
}
