/**
 * Project Repository
 *
 * Database access layer for project-related queries.
 * Keep this file focused on data access - no business logic.
 */

import { db } from "../lib/db";
import { projects, projectMembers, workspaceMembers } from "../db/schema";
import { eq, and } from "drizzle-orm";

export type ProjectRole = "owner" | "admin" | "member" | "guest";

export interface ProjectMembership {
  projectId: string;
  userId: string;
  role: ProjectRole;
  canEdit: boolean;
  joinedAt: Date;
}

export interface ProjectWithWorkspace {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Find a project by ID
 */
export async function findById(projectId: string): Promise<ProjectWithWorkspace | null> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) return null;

  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    description: project.description,
    createdBy: project.createdBy,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/**
 * Get a user's direct project membership
 * Returns null if not a direct member
 */
export async function getDirectMembership(
  projectId: string,
  userId: string
): Promise<ProjectMembership | null> {
  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  });

  if (!membership) return null;

  return {
    projectId: membership.projectId,
    userId: membership.userId,
    role: membership.role as ProjectRole,
    canEdit: membership.canEdit,
    joinedAt: membership.joinedAt,
  };
}

/**
 * Get a user's effective access to a project
 * Checks both direct project membership and workspace membership
 */
export async function getEffectiveAccess(
  projectId: string,
  userId: string
): Promise<{ canEdit: boolean; role: string } | null> {
  // First get the project to find its workspace
  const project = await findById(projectId);
  if (!project) return null;

  // Check workspace membership first (grants access to all projects)
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
  const directMembership = await getDirectMembership(projectId, userId);
  if (!directMembership) return null;

  return { canEdit: directMembership.canEdit, role: directMembership.role };
}

/**
 * List projects in a workspace that a user has access to
 */
export async function listForWorkspace(workspaceId: string, userId: string) {
  // Check workspace membership
  const workspaceMembership = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
  });

  if (!workspaceMembership) {
    return [];
  }

  // Owner/admin can see all projects
  if (workspaceMembership.role === "owner" || workspaceMembership.role === "admin") {
    return db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
  }

  // Members see projects they have access to
  return db
    .select({ project: projects })
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projects.workspaceId, workspaceId), eq(projectMembers.userId, userId)));
}
