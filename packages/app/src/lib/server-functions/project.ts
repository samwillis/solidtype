/**
 * Server Functions - Project Operations
 */

import { createServerFn } from "@tanstack/react-start";
import { db, pool } from "../db";
import { projects, projectMembers, workspaceMembers, branches } from "../../db/schema";
import { eq, and } from "drizzle-orm";

/** Get the current transaction ID from the database */
async function getCurrentTxid(): Promise<number> {
  const result = await pool.query("SELECT txid_current()");
  return Number(result.rows[0]?.txid_current || 0);
}

// ============================================================================
// Types
// ============================================================================

interface GetProjectsInput {
  workspaceId: string;
  userId: string;
}

interface CreateProjectInput {
  workspaceId: string;
  name: string;
  description?: string;
  userId: string;
}

interface GetProjectInput {
  projectId: string;
  userId: string;
}

// ============================================================================
// Query Functions
// ============================================================================

export const getProjects = createServerFn({ method: "GET" })
  .inputValidator((d: GetProjectsInput) => d)
  .handler(async ({ data }) => {
    // Verify workspace membership
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!membership) {
      throw new Error("Forbidden");
    }

    let userProjects;
    if (membership.role === "owner" || membership.role === "admin") {
      userProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, data.workspaceId));
    } else {
      userProjects = await db
        .select({ project: projects })
        .from(projects)
        .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
        .where(
          and(eq(projects.workspaceId, data.workspaceId), eq(projectMembers.userId, data.userId))
        );
    }

    return userProjects;
  });

export const getProject = createServerFn({ method: "GET" })
  .inputValidator((d: GetProjectInput) => d)
  .handler(async ({ data }) => {
    // Check project access
    const projectMember = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, data.projectId),
        eq(projectMembers.userId, data.userId)
      ),
    });

    if (!projectMember) {
      throw new Error("Forbidden");
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, data.projectId),
      with: { branches: true },
    });

    if (!project) {
      throw new Error("Not found");
    }

    return { project, access: { canEdit: projectMember.canEdit, role: projectMember.role } };
  });

// ============================================================================
// Mutation Functions
// ============================================================================

export const createProject = createServerFn({ method: "POST" })
  .inputValidator((d: CreateProjectInput) => d)
  .handler(async ({ data }) => {
    // Verify workspace membership
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!membership) {
      throw new Error("Forbidden");
    }

    const [project] = await db.transaction(async (tx) => {
      const [proj] = await tx
        .insert(projects)
        .values({
          workspaceId: data.workspaceId,
          name: data.name,
          description: data.description,
          createdBy: data.userId,
        })
        .returning();

      await tx.insert(projectMembers).values({
        projectId: proj.id,
        userId: data.userId,
        role: "owner",
        canEdit: true,
      });

      await tx.insert(branches).values({
        projectId: proj.id,
        name: "main",
        description: "Main branch",
        isMain: true,
        createdBy: data.userId,
        ownerId: data.userId,
      });

      return [proj];
    });

    return project;
  });

export const createProjectMutation = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { workspaceId: string; project: { name: string; description?: string }; userId: string }) =>
      d
  )
  .handler(async ({ data }) => {
    const [created] = await db.transaction(async (tx) => {
      const [proj] = await tx
        .insert(projects)
        .values({
          workspaceId: data.workspaceId,
          name: data.project.name,
          description: data.project.description,
          createdBy: data.userId,
        })
        .returning();

      await tx.insert(projectMembers).values({
        projectId: proj.id,
        userId: data.userId,
        role: "owner",
        canEdit: true,
      });

      await tx.insert(branches).values({
        projectId: proj.id,
        name: "main",
        description: "Main branch",
        isMain: true,
        createdBy: data.userId,
        ownerId: data.userId,
      });

      return [proj];
    });

    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateProjectMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string; updates: { name?: string; description?: string } }) => d)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(projects)
      .set(data.updates)
      .where(eq(projects.id, data.projectId))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const deleteProjectMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data }) => {
    await db.delete(projects).where(eq(projects.id, data.projectId));

    const txid = await getCurrentTxid();
    return { success: true, txid };
  });
