/**
 * Workspace Repository
 *
 * Database access layer for workspace-related queries.
 * Keep this file focused on data access - no business logic.
 */

import { db } from "../lib/db";
import { workspaces, workspaceMembers } from "../db/schema";
import { eq, and } from "drizzle-orm";

export type WorkspaceRole = "owner" | "admin" | "member";

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

/**
 * Find a workspace by ID
 */
export async function findById(workspaceId: string) {
  return db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
}

/**
 * Get a user's membership in a workspace
 * Returns null if not a member
 */
export async function getMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMembership | null> {
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
  });

  if (!membership) return null;

  return {
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    role: membership.role as WorkspaceRole,
    joinedAt: membership.joinedAt,
  };
}

/**
 * List all workspaces for a user with their membership info
 */
export async function listForUser(userId: string) {
  return db
    .select({
      workspace: workspaces,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));
}

/**
 * Check if a user has one of the specified roles in a workspace
 */
export async function hasRole(
  workspaceId: string,
  userId: string,
  roles: WorkspaceRole[]
): Promise<boolean> {
  const membership = await getMembership(workspaceId, userId);
  if (!membership) return false;
  return roles.includes(membership.role);
}
