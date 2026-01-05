/**
 * Server Functions - Project Operations
 *
 * All functions use session-based authentication via middleware.
 * No userId is accepted from client inputs.
 *
 * NOTE: Server-only modules (db, authz, repos) are imported dynamically
 * inside handlers to avoid bundling them for the client.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../server-fn-middleware";
import {
  getProjectsSchema,
  getProjectSchema,
  createProjectSchema,
  updateProjectSchema,
  deleteProjectSchema,
} from "../../validators/project";

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all projects in a workspace (requires workspace membership)
 */
export const getProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(getProjectsSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { requireWorkspaceMember } = await import("../authz");
    const projectsRepo = await import("../../repos/projects");

    // Verify workspace membership
    await requireWorkspaceMember(session, data.workspaceId);

    return projectsRepo.listForWorkspace(data.workspaceId, session.user.id);
  });

/**
 * Get a single project (requires project access)
 */
export const getProject = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(getProjectSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { projects } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { requireProjectAccess } = await import("../authz");

    const { project, canEdit, role } = await requireProjectAccess(session, data.projectId);

    // Get branches for the project
    const projectWithBranches = await db.query.projects.findFirst({
      where: eq(projects.id, data.projectId),
      with: { branches: true },
    });

    return {
      project: projectWithBranches || project,
      access: { canEdit, role },
    };
  });

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Create a new project (requires workspace membership)
 */
export const createProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createProjectSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { projects, projectMembers, branches } = await import("../../db/schema");
    const { requireWorkspaceMember } = await import("../authz");

    // Verify workspace membership
    await requireWorkspaceMember(session, data.workspaceId);

    const [project] = await db.transaction(async (tx) => {
      const [proj] = await tx
        .insert(projects)
        .values({
          workspaceId: data.workspaceId,
          name: data.name,
          description: data.description,
          createdBy: session.user.id,
        })
        .returning();

      await tx.insert(projectMembers).values({
        projectId: proj.id,
        userId: session.user.id,
        role: "owner",
        canEdit: true,
      });

      await tx.insert(branches).values({
        projectId: proj.id,
        name: "main",
        description: "Main branch",
        isMain: true,
        createdBy: session.user.id,
        ownerId: session.user.id,
      });

      return [proj];
    });

    return project;
  });

/**
 * Create project with txid for Electric reconciliation
 */
export const createProjectMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createProjectSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { projects, projectMembers, branches } = await import("../../db/schema");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireWorkspaceMember } = await import("../authz");

    // Verify workspace membership
    await requireWorkspaceMember(session, data.workspaceId);

    return await db.transaction(async (tx) => {
      const [proj] = await tx
        .insert(projects)
        .values({
          workspaceId: data.workspaceId,
          name: data.name,
          description: data.description,
          createdBy: session.user.id,
        })
        .returning();

      await tx.insert(projectMembers).values({
        projectId: proj.id,
        userId: session.user.id,
        role: "owner",
        canEdit: true,
      });

      await tx.insert(branches).values({
        projectId: proj.id,
        name: "main",
        description: "Main branch",
        isMain: true,
        createdBy: session.user.id,
        ownerId: session.user.id,
      });

      const txid = await getCurrentTxid(tx);
      return { data: proj, txid };
    });
  });

/**
 * Update a project (requires owner or admin role)
 */
export const updateProjectMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateProjectSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { projects } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireProjectRole } = await import("../authz");

    // Require owner or admin role
    await requireProjectRole(session, data.projectId, ["owner", "admin"]);

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(projects)
        .set(data.updates)
        .where(eq(projects.id, data.projectId))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  });

/**
 * Delete a project (requires owner role only)
 */
export const deleteProjectMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteProjectSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { projects } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireProjectRole } = await import("../authz");

    // Only owners can delete projects
    await requireProjectRole(session, data.projectId, ["owner"]);

    return await db.transaction(async (tx) => {
      await tx.delete(projects).where(eq(projects.id, data.projectId));

      const txid = await getCurrentTxid(tx);
      return { success: true, txid };
    });
  });
