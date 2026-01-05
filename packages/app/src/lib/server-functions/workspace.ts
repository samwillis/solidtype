/**
 * Server Functions - Workspace Operations
 *
 * All functions use session-based authentication via middleware.
 * No userId is accepted from client inputs.
 *
 * TanStack Start automatically code-splits server function handlers
 * so top-level imports of server-only modules are safe here.
 */

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../server-fn-middleware";
import { db } from "../db";
import { workspaces, workspaceMembers } from "../../db/schema";
import { requireWorkspaceMember, requireWorkspaceRole } from "../authz";
import * as workspacesRepo from "../../repos/workspaces";
import { getCurrentTxid } from "./db-helpers";
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

    // Only owners can delete workspaces
    await requireWorkspaceRole(session, data.workspaceId, ["owner"]);

    return await db.transaction(async (tx) => {
      await tx.delete(workspaces).where(eq(workspaces.id, data.workspaceId));

      const txid = await getCurrentTxid(tx);
      return { success: true, txid };
    });
  });
