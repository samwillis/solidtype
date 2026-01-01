/**
 * Permission checking utilities
 */

import { db } from "./db";
import { projectMembers, documents, workspaceMembers, projects } from "../db/schema";
import { eq, and } from "drizzle-orm";

// Permission types
export type Permission =
  | "workspace:read"
  | "workspace:write"
  | "workspace:delete"
  | "workspace:manage_members"
  | "project:read"
  | "project:write"
  | "project:delete"
  | "project:manage_members"
  | "document:read"
  | "document:write"
  | "document:delete";

// Role definitions
type WorkspaceRole = "owner" | "admin" | "member";
type ProjectRole = "owner" | "admin" | "member" | "guest";

const workspacePermissions: Record<WorkspaceRole, Permission[]> = {
  owner: ["workspace:read", "workspace:write", "workspace:delete", "workspace:manage_members"],
  admin: ["workspace:read", "workspace:write", "workspace:manage_members"],
  member: ["workspace:read"],
};

const projectPermissionsMap: Record<ProjectRole, (canEdit: boolean) => Permission[]> = {
  owner: () => [
    "project:read",
    "project:write",
    "project:delete",
    "project:manage_members",
    "document:read",
    "document:write",
    "document:delete",
  ],
  admin: () => [
    "project:read",
    "project:write",
    "project:manage_members",
    "document:read",
    "document:write",
    "document:delete",
  ],
  member: (canEdit) =>
    canEdit
      ? ["project:read", "document:read", "document:write"]
      : ["project:read", "document:read"],
  guest: (canEdit) =>
    canEdit
      ? ["project:read", "document:read", "document:write"]
      : ["project:read", "document:read"],
};

/**
 * Verify user has access to a document
 * Returns access info or null if no access
 *
 * Access is granted if:
 * 1. User is a member of the workspace containing the project (workspace membership grants access)
 * 2. OR user has direct project membership
 */
export async function verifyDocumentAccess(
  userId: string,
  documentId: string
): Promise<{ canEdit: boolean } | null> {
  // Look up document to get the branch and project info
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    with: {
      branch: {
        with: {
          project: {
            columns: { id: true, workspaceId: true },
          },
        },
      },
    },
  });

  if (!doc || !doc.branch?.project) return null;

  const { project } = doc.branch;

  // First check workspace membership (grants access to all projects in workspace)
  const workspaceMembership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, project.workspaceId),
      eq(workspaceMembers.userId, userId)
    ),
  });

  if (workspaceMembership) {
    // Workspace members can edit based on their workspace role
    // owner/admin can always edit, members can edit by default
    const canEdit = ["owner", "admin", "member"].includes(workspaceMembership.role);
    return { canEdit };
  }

  // Fall back to direct project membership
  const projectMembership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)),
  });

  if (!projectMembership) return null;

  return { canEdit: projectMembership.canEdit };
}

/**
 * Verify user has access to a project
 * Returns access info or null if no access
 *
 * Access is granted if:
 * 1. User is a member of the workspace containing the project
 * 2. OR user has direct project membership
 */
export async function verifyProjectAccess(
  userId: string,
  projectId: string
): Promise<{ canEdit: boolean; role: string } | null> {
  // Get project to find its workspace
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { workspaceId: true },
  });

  if (!project) return null;

  // Check workspace membership first
  const workspaceMembership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, project.workspaceId),
      eq(workspaceMembers.userId, userId)
    ),
  });

  if (workspaceMembership) {
    // Workspace members can edit based on their workspace role
    const canEdit = ["owner", "admin", "member"].includes(workspaceMembership.role);
    return { canEdit, role: workspaceMembership.role };
  }

  // Fall back to direct project membership
  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  });

  if (!membership) return null;

  return { canEdit: membership.canEdit, role: membership.role };
}

/**
 * Verify user is a member of a workspace
 * Returns membership info or null if not a member
 */
export async function verifyWorkspaceMember(
  userId: string,
  workspaceId: string
): Promise<{ role: string } | null> {
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
  });

  if (!membership) return null;

  return { role: membership.role };
}

/**
 * Check if user has a specific permission
 */
export async function checkPermission(
  userId: string,
  permission: Permission,
  context: { workspaceId?: string; projectId?: string }
): Promise<boolean> {
  // Check workspace permissions
  if (context.workspaceId && permission.startsWith("workspace:")) {
    const membership = await verifyWorkspaceMember(userId, context.workspaceId);
    if (!membership) return false;

    const role = membership.role as WorkspaceRole;
    return workspacePermissions[role]?.includes(permission) ?? false;
  }

  // Check project permissions
  if (
    context.projectId &&
    (permission.startsWith("project:") || permission.startsWith("document:"))
  ) {
    const access = await verifyProjectAccess(userId, context.projectId);
    if (!access) return false;

    const role = access.role as ProjectRole;
    const permissions = projectPermissionsMap[role]?.(access.canEdit) ?? [];
    return permissions.includes(permission);
  }

  return false;
}
