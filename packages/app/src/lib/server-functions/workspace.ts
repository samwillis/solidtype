/**
 * Server Functions - Workspace Operations
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
  getWorkspacesSchema,
  getWorkspaceSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  deleteWorkspaceSchema,
} from "../../validators/workspace";

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all workspaces for the authenticated user
 */
export const getWorkspaces = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(getWorkspacesSchema)
  .handler(async ({ context }) => {
    const { session } = context;
    const workspacesRepo = await import("../../repos/workspaces");
    return workspacesRepo.listForUser(session.user.id);
  });

/**
 * Get a single workspace (requires membership)
 */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(getWorkspaceSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { requireWorkspaceMember } = await import("../authz");
    const workspacesRepo = await import("../../repos/workspaces");

    const membership = await requireWorkspaceMember(session, data.workspaceId);

    const workspace = await workspacesRepo.findById(data.workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    return { workspace, role: membership.role };
  });

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Create a new workspace (any authenticated user can create)
 */
export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createWorkspaceSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { workspaces, workspaceMembers } = await import("../../db/schema");

    const [workspace] = await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({
          name: data.name,
          slug: data.slug,
          description: data.description,
          createdBy: session.user.id,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: session.user.id,
        role: "owner",
      });

      return [ws];
    });

    return workspace;
  });

/**
 * Create workspace with txid for Electric reconciliation
 */
export const createWorkspaceMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createWorkspaceSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { workspaces, workspaceMembers } = await import("../../db/schema");
    const { getCurrentTxid } = await import("./db-helpers");

    return await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({
          name: data.name,
          slug: data.slug,
          description: data.description,
          createdBy: session.user.id,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: session.user.id,
        role: "owner",
      });

      const txid = await getCurrentTxid(tx);
      return { data: ws, txid };
    });
  });

/**
 * Update a workspace (requires owner or admin role)
 */
export const updateWorkspaceMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateWorkspaceSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { workspaces } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireWorkspaceRole } = await import("../authz");

    // Require owner or admin role for updates
    await requireWorkspaceRole(session, data.workspaceId, ["owner", "admin"]);

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workspaces)
        .set(data.updates)
        .where(eq(workspaces.id, data.workspaceId))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  });

/**
 * Delete a workspace (requires owner role only)
 */
export const deleteWorkspaceMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteWorkspaceSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;
    const { db } = await import("../db");
    const { workspaces } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentTxid } = await import("./db-helpers");
    const { requireWorkspaceRole } = await import("../authz");

    // Only owners can delete workspaces
    await requireWorkspaceRole(session, data.workspaceId, ["owner"]);

    return await db.transaction(async (tx) => {
      await tx.delete(workspaces).where(eq(workspaces.id, data.workspaceId));

      const txid = await getCurrentTxid(tx);
      return { success: true, txid };
    });
  });
