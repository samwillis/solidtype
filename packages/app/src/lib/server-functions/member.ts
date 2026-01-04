/**
 * Server Functions - Member Management
 *
 * Workspace and project member operations.
 */

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { workspaceMembers, projectMembers } from "../../db/schema";
import { user } from "../../db/schema/better-auth";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../auth-middleware";

// ============================================================================
// Workspace Member Management
// ============================================================================

/**
 * List all members of a workspace
 */
export const listWorkspaceMembersMutation = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceId: string }) => data)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user has access to this workspace
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      ),
    });

    if (!membership) {
      throw new Error("Not a member of this workspace");
    }

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
  });

/**
 * Add a member to a workspace by email
 */
export const addWorkspaceMemberMutation = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceId: string; email: string; role: "admin" | "member" }) => data)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user is admin or owner
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      ),
    });

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only owners and admins can add members");
    }

    // Find user by email
    const targetUser = await db.query.user.findFirst({
      where: eq(user.email, data.email.toLowerCase().trim()),
    });

    if (!targetUser) {
      throw new Error("No user found with that email address");
    }

    // Check if already a member
    const existingMembership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, targetUser.id)
      ),
    });

    if (existingMembership) {
      throw new Error("User is already a member of this workspace");
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
  });

/**
 * Update a workspace member's role
 */
export const updateWorkspaceMemberRoleMutation = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceId: string; userId: string; role: "admin" | "member" }) => data)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user is admin or owner
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      ),
    });

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only owners and admins can update member roles");
    }

    // Can't change owner role
    const targetMembership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new Error("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new Error("Cannot change owner role");
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
  });

/**
 * Remove a member from a workspace
 */
export const removeWorkspaceMemberMutation = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceId: string; userId: string }) => data)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user is admin or owner
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      ),
    });

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only owners and admins can remove members");
    }

    // Can't remove the owner
    const targetMembership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new Error("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new Error("Cannot remove workspace owner");
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
  });

// ============================================================================
// Project Member Management
// ============================================================================

/**
 * List all members of a project
 */
export const listProjectMembersMutation = createServerFn({ method: "POST" })
  .inputValidator((data: { projectId: string }) => data)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user has access to this project
    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, session.user.id)
      ),
    });

    if (!membership) {
      throw new Error("Not a member of this project");
    }

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
  });

/**
 * Add a member to a project by email
 */
export const addProjectMemberMutation = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      projectId: string;
      email: string;
      role: "admin" | "member" | "guest";
      canEdit: boolean;
    }) => data
  )
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user is admin or owner
    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, session.user.id)
      ),
    });

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only owners and admins can add members");
    }

    // Find user by email
    const targetUser = await db.query.user.findFirst({
      where: eq(user.email, data.email.toLowerCase().trim()),
    });

    if (!targetUser) {
      throw new Error("No user found with that email address");
    }

    // Check if already a member
    const existingMembership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, targetUser.id)
      ),
    });

    if (existingMembership) {
      throw new Error("User is already a member of this project");
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
  });

/**
 * Update a project member's role or permissions
 */
export const updateProjectMemberMutation = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      projectId: string;
      userId: string;
      role?: "admin" | "member" | "guest";
      canEdit?: boolean;
    }) => data
  )
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user is admin or owner
    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, session.user.id)
      ),
    });

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only owners and admins can update member permissions");
    }

    // Can't change owner
    const targetMembership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new Error("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new Error("Cannot modify owner permissions");
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
  });

/**
 * Remove a member from a project
 */
export const removeProjectMemberMutation = createServerFn({ method: "POST" })
  .inputValidator((data: { projectId: string; userId: string }) => data)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Verify user is admin or owner
    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, session.user.id)
      ),
    });

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only owners and admins can remove members");
    }

    // Can't remove the owner
    const targetMembership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!targetMembership) {
      throw new Error("Member not found");
    }

    if (targetMembership.role === "owner") {
      throw new Error("Cannot remove project owner");
    }

    // Remove member
    await db
      .delete(projectMembers)
      .where(
        and(eq(projectMembers.projectId, data.projectId), eq(projectMembers.userId, data.userId))
      );

    return { success: true };
  });
