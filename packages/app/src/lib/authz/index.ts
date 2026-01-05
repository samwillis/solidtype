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
 *
 * NOTE: This module uses dynamic imports for server-only dependencies (auth, repos)
 * to prevent them from being bundled in client code. The authz module is dynamically
 * imported by server function handlers, and these lazy imports ensure the full
 * dependency chain stays server-only.
 */

import { AuthenticationError, ForbiddenError, NotFoundError } from "../http/errors";

// Re-export for convenience
export { AuthenticationError, ForbiddenError, NotFoundError };

// Lazy-loaded modules - imported on first use
let _auth: typeof import("../auth").auth | null = null;
let _workspacesRepo: typeof import("../../repos/workspaces") | null = null;
let _projectsRepo: typeof import("../../repos/projects") | null = null;
let _documentsRepo: typeof import("../../repos/documents") | null = null;
let _aiChatRepo: typeof import("../../repos/ai-chat") | null = null;

async function getAuth() {
  if (!_auth) {
    const mod = await import("../auth");
    _auth = mod.auth;
  }
  return _auth;
}

async function getWorkspacesRepo() {
  if (!_workspacesRepo) {
    _workspacesRepo = await import("../../repos/workspaces");
  }
  return _workspacesRepo;
}

async function getProjectsRepo() {
  if (!_projectsRepo) {
    _projectsRepo = await import("../../repos/projects");
  }
  return _projectsRepo;
}

async function getDocumentsRepo() {
  if (!_documentsRepo) {
    _documentsRepo = await import("../../repos/documents");
  }
  return _documentsRepo;
}

async function getAiChatRepo() {
  if (!_aiChatRepo) {
    _aiChatRepo = await import("../../repos/ai-chat");
  }
  return _aiChatRepo;
}

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
  const auth = await getAuth();
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
  const auth = await getAuth();
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
): Promise<WorkspaceMembership> {
  const workspacesRepo = await getWorkspacesRepo();
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
): Promise<WorkspaceMembership> {
  const membership = await requireWorkspaceMember(session, workspaceId);

  if (!roles.includes(membership.role)) {
    throw new ForbiddenError(`Requires one of these roles: ${roles.join(", ")}`);
  }

  return membership;
}

// Re-export types that were previously imported from repos
export type WorkspaceMembership = Awaited<
  ReturnType<Awaited<ReturnType<typeof getWorkspacesRepo>>["getMembership"]>
>;
export type ProjectWithWorkspace = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof getProjectsRepo>>["findById"]>>
>;
export type DocumentWithBranch = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof getDocumentsRepo>>["findWithBranch"]>>
>;
export type ChatSession = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof getAiChatRepo>>["findByIdAndUser"]>>
>;

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
): Promise<{ project: ProjectWithWorkspace; canEdit: boolean; role: string }> {
  const projectsRepo = await getProjectsRepo();
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
): Promise<{ project: ProjectWithWorkspace; role: string }> {
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
): Promise<{ project: ProjectWithWorkspace }> {
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
  doc: DocumentWithBranch;
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
  const documentsRepo = await getDocumentsRepo();
  const projectsRepo = await getProjectsRepo();

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
): Promise<ChatSession> {
  const aiChatRepo = await getAiChatRepo();
  const chatSession = await aiChatRepo.findByIdAndUser(sessionId, session.user.id);

  if (!chatSession) {
    throw new ForbiddenError("Chat session not found or not owned by user");
  }

  return chatSession;
}

// ============================================================================
// Branch Authorization
// ============================================================================

// Branch type
export type Branch = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof getDocumentsRepo>>["getBranch"]>>
>;

/**
 * Require user to have access to a branch's project
 */
export async function requireBranchAccess(
  session: Session,
  branchId: string,
  mode: "view" | "edit" = "view"
): Promise<{ branch: Branch }> {
  const documentsRepo = await getDocumentsRepo();
  const projectsRepo = await getProjectsRepo();

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
