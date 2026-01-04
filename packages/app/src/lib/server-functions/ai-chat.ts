/**
 * Server Functions - AI Chat Session Operations
 */

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { aiChatSessions } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../auth-middleware";
import { normalizeNullableUuid } from "./helpers";
import { getCurrentTxid } from "./db-helpers";

// ============================================================================
// Mutation Functions
// ============================================================================

export const createChatSessionMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { session: any }) => d)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    return await db.transaction(async (tx) => {
      // Use client-provided ID for optimistic updates, or generate a new one
      const sessionId = data.session.id || crypto.randomUUID();
      const durableStreamId = `ai-chat/${sessionId}`;

      const [created] = await tx
        .insert(aiChatSessions)
        .values({
          id: sessionId,
          userId: session.user.id, // Override with session user ID for security
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

export const updateChatSessionMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; updates: any }) => d)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Ensure user owns the session
    const existing = await db.query.aiChatSessions.findFirst({
      where: and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, session.user.id)),
    });

    if (!existing) {
      throw new Error("Session not found or access denied");
    }

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

export const deleteChatSessionMutation = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string }) => d)
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

    // Ensure user owns the session
    const existing = await db.query.aiChatSessions.findFirst({
      where: and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, session.user.id)),
    });

    if (!existing) {
      throw new Error("Session not found or access denied");
    }

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
  .inputValidator(
    (d: {
      context: "dashboard" | "editor";
      documentId?: string | null;
      projectId?: string | null;
      title?: string;
    }) => d
  )
  // @ts-expect-error - request is provided at runtime by TanStack Start
  .handler(async ({ data, request }) => {
    const session = await requireAuth(request);

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
