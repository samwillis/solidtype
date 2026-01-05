/**
 * AI Chat Repository
 *
 * Database access layer for AI chat session queries.
 * Keep this file focused on data access - no business logic.
 */

import { db } from "../lib/db";
import { aiChatSessions } from "../db/schema";
import { eq, and } from "drizzle-orm";

export interface ChatSession {
  id: string;
  userId: string;
  context: "dashboard" | "editor";
  documentId: string | null;
  projectId: string | null;
  status: "active" | "archived" | "error";
  title: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  durableStreamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Find a chat session by ID
 */
export async function findById(sessionId: string): Promise<ChatSession | null> {
  const session = await db.query.aiChatSessions.findFirst({
    where: eq(aiChatSessions.id, sessionId),
  });

  if (!session) return null;

  return {
    id: session.id,
    userId: session.userId,
    context: session.context,
    documentId: session.documentId,
    projectId: session.projectId,
    status: session.status,
    title: session.title,
    messageCount: session.messageCount,
    lastMessageAt: session.lastMessageAt,
    durableStreamId: session.durableStreamId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Find a chat session by ID and verify ownership
 */
export async function findByIdAndUser(
  sessionId: string,
  userId: string
): Promise<ChatSession | null> {
  const session = await db.query.aiChatSessions.findFirst({
    where: and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)),
  });

  if (!session) return null;

  return {
    id: session.id,
    userId: session.userId,
    context: session.context,
    documentId: session.documentId,
    projectId: session.projectId,
    status: session.status,
    title: session.title,
    messageCount: session.messageCount,
    lastMessageAt: session.lastMessageAt,
    durableStreamId: session.durableStreamId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * List chat sessions for a user
 */
export async function listForUser(userId: string): Promise<ChatSession[]> {
  const sessions = await db.query.aiChatSessions.findMany({
    where: eq(aiChatSessions.userId, userId),
  });

  return sessions.map((session) => ({
    id: session.id,
    userId: session.userId,
    context: session.context,
    documentId: session.documentId,
    projectId: session.projectId,
    status: session.status,
    title: session.title,
    messageCount: session.messageCount,
    lastMessageAt: session.lastMessageAt,
    durableStreamId: session.durableStreamId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }));
}
