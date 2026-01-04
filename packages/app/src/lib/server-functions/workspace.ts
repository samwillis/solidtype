/**
 * Server Functions - Workspace Operations
 */

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { workspaces, workspaceMembers } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentTxid } from "./helpers";

// ============================================================================
// Types
// ============================================================================

interface CreateWorkspaceInput {
  name: string;
  slug: string;
  description?: string;
  userId: string;
}

interface GetWorkspaceInput {
  workspaceId: string;
  userId: string;
}

// ============================================================================
// Query Functions
// ============================================================================

export const getWorkspaces = createServerFn({ method: "GET" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const userWorkspaces = await db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, data.userId));

    return userWorkspaces;
  });

export const getWorkspace = createServerFn({ method: "GET" })
  .inputValidator((d: GetWorkspaceInput) => d)
  .handler(async ({ data }) => {
    // Verify membership
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, data.workspaceId),
        eq(workspaceMembers.userId, data.userId)
      ),
    });

    if (!membership) {
      throw new Error("Forbidden");
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, data.workspaceId),
    });

    if (!workspace) {
      throw new Error("Not found");
    }

    return { workspace, role: membership.role };
  });

// ============================================================================
// Mutation Functions
// ============================================================================

export const createWorkspace = createServerFn({ method: "POST" })
  .inputValidator((d: CreateWorkspaceInput) => d)
  .handler(async ({ data }) => {
    const [workspace] = await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({
          name: data.name,
          slug: data.slug,
          description: data.description,
          createdBy: data.userId,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: data.userId,
        role: "owner",
      });

      return [ws];
    });

    return workspace;
  });

export const createWorkspaceMutation = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { workspace: { name: string; slug: string; description?: string }; userId: string }) => d
  )
  .handler(async ({ data }) => {
    const [created] = await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({
          name: data.workspace.name,
          slug: data.workspace.slug,
          description: data.workspace.description,
          createdBy: data.userId,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: data.userId,
        role: "owner",
      });

      return [ws];
    });

    const txid = await getCurrentTxid();
    return { data: created, txid };
  });

export const updateWorkspaceMutation = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { workspaceId: string; updates: { name?: string; description?: string } }) => d
  )
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(workspaces)
      .set(data.updates)
      .where(eq(workspaces.id, data.workspaceId))
      .returning();

    const txid = await getCurrentTxid();
    return { data: updated, txid };
  });

export const deleteWorkspaceMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data }) => {
    await db.delete(workspaces).where(eq(workspaces.id, data.workspaceId));

    const txid = await getCurrentTxid();
    return { success: true, txid };
  });
