/**
 * Server Functions - AI Chat Session Operations
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
import { aiChatSessions } from "../../db/schema";
import { requireChatSessionOwner } from "../authz";
import { getCurrentTxid } from "./db-helpers";
import { normalizeNullableUuid } from "./helpers";
import {
  createChatSessionSchema,
  createChatSessionDirectSchema,
  updateChatSessionSchema,
  deleteChatSessionSchema,
} from "../../validators/ai-chat";

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Create a chat session via Electric collection
 */
export const createChatSessionMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createChatSessionSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    return await db.transaction(async (tx) => {
      // Use client-provided ID for optimistic updates, or generate a new one
      const sessionId = data.session.id || crypto.randomUUID();
      const durableStreamId = `ai-chat/${sessionId}`;

      const [created] = await tx
        .insert(aiChatSessions)
        .values({
          id: sessionId,
          userId: session.user.id, // Use session user ID, not client input
          context: data.session.context,
          documentId: normalizeNullableUuid(data.session.document_id),
          projectId: normalizeNullableUuid(data.session.project_id),
          title: data.session.title || "New Chat",
          durableStreamId,
        })
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: created, txid };
    });
  });

/**
 * Update a chat session (requires ownership)
 */
export const updateChatSessionMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateChatSessionSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Ensure user owns the session
    await requireChatSessionOwner(session, data.sessionId);

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(aiChatSessions)
        .set({
          ...data.updates,
          updatedAt: new Date(),
        })
        .where(eq(aiChatSessions.id, data.sessionId))
        .returning();

      const txid = await getCurrentTxid(tx);
      return { data: updated, txid };
    });
  });

/**
 * Delete a chat session (requires ownership)
 */
export const deleteChatSessionMutation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteChatSessionSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    // Ensure user owns the session
    await requireChatSessionOwner(session, data.sessionId);

    return await db.transaction(async (tx) => {
      await tx.delete(aiChatSessions).where(eq(aiChatSessions.id, data.sessionId));

      const txid = await getCurrentTxid(tx);
      return { data: { id: data.sessionId }, txid };
    });
  });

/**
 * Create a new AI chat session directly (not through Electric collection).
 * This is used when starting a new chat to ensure the session exists on the server
 * before trying to use the stream endpoint.
 */
export const createChatSessionDirect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createChatSessionDirectSchema)
  .handler(async ({ context, data }) => {
    const { session } = context;

    const sessionId = crypto.randomUUID();
    const durableStreamId = `ai-chat/${sessionId}`;

    const [created] = await db
      .insert(aiChatSessions)
      .values({
        id: sessionId,
        userId: session.user.id,
        context: data.context,
        documentId: normalizeNullableUuid(data.documentId),
        projectId: normalizeNullableUuid(data.projectId),
        title: data.title || "New Chat",
        durableStreamId,
      })
      .returning();

    return {
      id: created.id,
      userId: created.userId,
      context: created.context,
      documentId: created.documentId,
      projectId: created.projectId,
      status: created.status,
      title: created.title,
      messageCount: created.messageCount,
      lastMessageAt: created.lastMessageAt?.toISOString() || null,
      durableStreamId: created.durableStreamId,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  });
