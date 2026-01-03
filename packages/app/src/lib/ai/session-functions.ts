/**
 * Chat Session Server Functions
 *
 * CRUD operations for AI chat sessions.
 * All functions derive userId from server-side auth context, never from client input.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "../auth";
import { db } from "../db";
import { aiChatSessions } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Helper to get authenticated user ID from request.
 * Throws if not authenticated.
 */
async function getAuthUserId(): Promise<string> {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    throw new Error("Unauthorized: No authenticated session");
  }

  return session.user.id;
}

// List user's chat sessions (userId derived from auth, not input)
export const listChatSessions = createServerFn({ method: "GET" })
  .inputValidator((d: { context?: "dashboard" | "editor"; limit?: number }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const conditions = [eq(aiChatSessions.userId, userId)];
    if (data.context) {
      conditions.push(eq(aiChatSessions.context, data.context));
    }

    const sessions = await db.query.aiChatSessions.findMany({
      where: and(...conditions),
      orderBy: desc(aiChatSessions.updatedAt),
      limit: data.limit || 50,
    });

    return sessions;
  });

// Create a new chat session (userId derived from auth)
export const createChatSession = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      context: "dashboard" | "editor";
      documentId?: string;
      projectId?: string;
      title?: string;
    }) => d
  )
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();
    const sessionId = crypto.randomUUID();
    const durableStreamId = `ai-chat/${sessionId}`;

    const [session] = await db
      .insert(aiChatSessions)
      .values({
        id: sessionId,
        userId,
        context: data.context,
        documentId: data.documentId,
        projectId: data.projectId,
        title: data.title || "New Chat",
        durableStreamId,
      })
      .returning();

    return session;
  });

// Update session metadata (userId derived from auth, ownership verified)
export const updateChatSession = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      sessionId: string;
      title?: string;
      messageCount?: number;
      status?: "active" | "archived" | "error";
    }) => d
  )
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const updates: Partial<typeof aiChatSessions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) updates.title = data.title;
    if (data.messageCount !== undefined) {
      updates.messageCount = data.messageCount;
      updates.lastMessageAt = new Date();
    }
    if (data.status !== undefined) updates.status = data.status;

    // WHERE clause includes userId to ensure ownership
    const [session] = await db
      .update(aiChatSessions)
      .set(updates)
      .where(and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, userId)))
      .returning();

    if (!session) {
      throw new Error("Session not found or access denied");
    }

    return session;
  });

// Archive a chat session (userId derived from auth)
export const archiveChatSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const result = await db
      .update(aiChatSessions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error("Session not found or access denied");
    }

    return { success: true };
  });

// Get a specific session (userId derived from auth)
export const getChatSession = createServerFn({ method: "GET" })
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const session = await db.query.aiChatSessions.findFirst({
      where: and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, userId)),
    });

    if (!session) {
      throw new Error("Session not found or access denied");
    }

    return session;
  });

// Permanently delete a chat session (userId derived from auth)
export const deleteChatSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const result = await db
      .delete(aiChatSessions)
      .where(and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error("Session not found or access denied");
    }

    return { success: true };
  });
