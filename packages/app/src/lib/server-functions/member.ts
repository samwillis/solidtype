/**
 * Server Functions - Member Management
 *
 * Workspace and project member operations.
 * All functions use session-based authentication.
 *
 * NOTE: Server-only modules (db, authz, repos) are imported dynamically
 * inside handlers to avoid bundling them for the client.
 */

import { createAuthedServerFn } from "../server-fn-wrapper";
import {
  listWorkspaceMembersSchema,
  addWorkspaceMemberSchema,
  updateWorkspaceMemberRoleSchema,
  removeWorkspaceMemberSchema,
  listProjectMembersSchema,
  addProjectMemberSchema,
  updateProjectMemberSchema,
  removeProjectMemberSchema,
} from "../../validators/member";

// ============================================================================
// Workspace Member Management
// ============================================================================

/**
 * List all members of a workspace
 */
export const listWorkspaceMembersMutation = createAuthedServerFn({
  method: "POST",
  validator: listWorkspaceMembersSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { workspaceMembers } = await import("../../db/schema");
    const { user } = await import("../../db/schema/better-auth");
    const { eq, asc } = await import("drizzle-orm");
    const { requireWorkspaceMember } = await import("../authz");

    // Verify user has access to this workspace
    await requireWorkspaceMember(session, data.workspaceId);

    // Get all members with user details
    const members = await db
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(workspaceMembers)
      .innerJoin(user, eq(workspaceMembers.userId, user.id))
      .where(eq(workspaceMembers.workspaceId, data.workspaceId))
      .orderBy(asc(workspaceMembers.joinedAt));

    return { members };
  },
});

/**
 * Add a member to a workspace by email
 */
export const addWorkspaceMemberMutation = createAuthedServerFn({
  method: "POST",
  validator: addWorkspaceMemberSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { workspaceMembers } = await import("../../db/schema");
    const { user } = await import("../../db/schema/better-auth");
    const { eq, and } = await import("drizzle-orm");
    const { requireWorkspaceRole } = await import("../authz");
    const { NotFoundError, ConflictError } = await import("../http/errors");

    // Verify user is admin or owner
    await requireWorkspaceRole(session, data.workspaceId, ["owner", "admin"]);

    // Find user by email
    const targetUser = await db.query.user.findFirst({
      where: eq(user.email, data.email.toLowerCase().trim()),
    });

    if (!targetUser) {
      throw new NotFoundError("No user found with that email address");
    }

    // Check if already a member
    const existingMembership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, targetUser.id)
      ),
    });

    if (existingMembership) {
      throw new ConflictError("User is already a member of this workspace");
    }

    // Add member
    await db.insert(workspaceMembers).values({
      workspaceId: data.workspaceId,
      userId: targetUser.id,
      role: data.role,
    });

    return {
      member: {
        userId: targetUser.id,
        userName: targetUser.name,
        userEmail: targetUser.email,
        userImage: targetUser.image,
        role: data.role,
        joinedAt: new Date(),
      },
    };
  },
});

/**
 * Update a workspace member's role
 */
export const updateWorkspaceMemberRoleMutation = createAuthedServerFn({
  method: "POST",
  validator: updateWorkspaceMemberRoleSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { workspaceMembers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { requireWorkspaceRole } = await import("../authz");
    const { NotFoundError, ForbiddenError } = await import("../http/errors");

    // Verify user is admin or owner
    await requireWorkspaceRole(session, data.workspaceId, ["owner", "admin"]);

    // Can't change owner role
    const targetMembership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new NotFoundError("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new ForbiddenError("Cannot change owner role");
    }

    // Update role
    await db
      .update(workspaceMembers)
      .set({ role: data.role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, data.workspaceId),
          eq(workspaceMembers.userId, data.userId)
        )
      );

    return { success: true };
  },
});

/**
 * Remove a member from a workspace
 */
export const removeWorkspaceMemberMutation = createAuthedServerFn({
  method: "POST",
  validator: removeWorkspaceMemberSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { workspaceMembers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { requireWorkspaceRole } = await import("../authz");
    const { NotFoundError, ForbiddenError } = await import("../http/errors");

    // Verify user is admin or owner
    await requireWorkspaceRole(session, data.workspaceId, ["owner", "admin"]);

    // Can't remove the owner
    const targetMembership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new NotFoundError("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new ForbiddenError("Cannot remove workspace owner");
    }

    // Remove member
    await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, data.workspaceId),
          eq(workspaceMembers.userId, data.userId)
        )
      );

    return { success: true };
  },
});

// ============================================================================
// Project Member Management
// ============================================================================

/**
 * List all members of a project
 */
export const listProjectMembersMutation = createAuthedServerFn({
  method: "POST",
  validator: listProjectMembersSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { projectMembers } = await import("../../db/schema");
    const { user } = await import("../../db/schema/better-auth");
    const { eq, asc } = await import("drizzle-orm");
    const { requireProjectAccess } = await import("../authz");

    // Verify user has access to this project
    await requireProjectAccess(session, data.projectId);

    // Get all members with user details
    const members = await db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        canEdit: projectMembers.canEdit,
        joinedAt: projectMembers.joinedAt,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(projectMembers)
      .innerJoin(user, eq(projectMembers.userId, user.id))
      .where(eq(projectMembers.projectId, data.projectId))
      .orderBy(asc(projectMembers.joinedAt));

    return { members };
  },
});

/**
 * Add a member to a project by email
 */
export const addProjectMemberMutation = createAuthedServerFn({
  method: "POST",
  validator: addProjectMemberSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { projectMembers } = await import("../../db/schema");
    const { user } = await import("../../db/schema/better-auth");
    const { eq, and } = await import("drizzle-orm");
    const { requireProjectRole } = await import("../authz");
    const { NotFoundError, ConflictError } = await import("../http/errors");

    // Verify user is admin or owner
    await requireProjectRole(session, data.projectId, ["owner", "admin"]);

    // Find user by email
    const targetUser = await db.query.user.findFirst({
      where: eq(user.email, data.email.toLowerCase().trim()),
    });

    if (!targetUser) {
      throw new NotFoundError("No user found with that email address");
    }

    // Check if already a member
    const existingMembership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, targetUser.id)
      ),
    });

    if (existingMembership) {
      throw new ConflictError("User is already a member of this project");
    }

    // Add member
    await db.insert(projectMembers).values({
      projectId: data.projectId,
      userId: targetUser.id,
      role: data.role,
      canEdit: data.canEdit,
    });

    return {
      member: {
        userId: targetUser.id,
        userName: targetUser.name,
        userEmail: targetUser.email,
        userImage: targetUser.image,
        role: data.role,
        canEdit: data.canEdit,
        joinedAt: new Date(),
      },
    };
  },
});

/**
 * Update a project member's role or permissions
 */
export const updateProjectMemberMutation = createAuthedServerFn({
  method: "POST",
  validator: updateProjectMemberSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { projectMembers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { requireProjectRole } = await import("../authz");
    const { NotFoundError, ForbiddenError } = await import("../http/errors");

    // Verify user is admin or owner
    await requireProjectRole(session, data.projectId, ["owner", "admin"]);

    // Can't change owner
    const targetMembership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new NotFoundError("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new ForbiddenError("Cannot modify owner permissions");
    }

    // Build update object
    const updates: { role?: "admin" | "member" | "guest"; canEdit?: boolean } = {};
    if (data.role !== undefined) updates.role = data.role;
    if (data.canEdit !== undefined) updates.canEdit = data.canEdit;

    if (Object.keys(updates).length === 0) {
      return { success: true };
    }

    await db
      .update(projectMembers)
      .set(updates)
      .where(
        and(eq(projectMembers.projectId, data.projectId), eq(projectMembers.userId, data.userId))
      );

    return { success: true };
  },
});

/**
 * Remove a member from a project
 */
export const removeProjectMemberMutation = createAuthedServerFn({
  method: "POST",
  validator: removeProjectMemberSchema,
  handler: async ({ session, data }) => {
    const { db } = await import("../db");
    const { projectMembers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { requireProjectRole } = await import("../authz");
    const { NotFoundError, ForbiddenError } = await import("../http/errors");

    // Verify user is admin or owner
    await requireProjectRole(session, data.projectId, ["owner", "admin"]);

    // Can't remove the owner
    const targetMembership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new NotFoundError("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new ForbiddenError("Cannot remove project owner");
    }

    // Remove member
    await db
      .delete(projectMembers)
      .where(
        and(eq(projectMembers.projectId, data.projectId), eq(projectMembers.userId, data.userId))
      );

    return { success: true };
  },
});
