/**
 * AI Chat Sessions table schema
 *
 * Stores metadata for AI chat sessions.
 * Actual message content is stored in Durable Streams for efficient streaming/resumption.
 */

import { pgTable, uuid, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./better-auth";
import { documents } from "./documents";
import { projects } from "./projects";

export const aiChatContextEnum = pgEnum("ai_chat_context", ["dashboard", "editor"]);

export const aiChatStatusEnum = pgEnum("ai_chat_status", [
  "active", // Currently in use
  "archived", // User closed/archived
  "error", // Session ended with error
]);

export const aiChatSessions = pgTable(
  "ai_chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Owner - references better-auth's user table
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Context type
    context: aiChatContextEnum("context").notNull(),

    // Optional references (depending on context)
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),

    // Status
    status: aiChatStatusEnum("status").notNull().default("active"),

    // Display metadata (denormalized for quick listing)
    title: text("title").default("New Chat"),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at"),

    // Durable Stream reference
    // Format: "ai-chat/{sessionId}"
    durableStreamId: text("durable_stream_id"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_chat_sessions_user").on(table.userId),
    index("idx_ai_chat_sessions_user_context").on(table.userId, table.context),
    index("idx_ai_chat_sessions_document").on(table.documentId),
    index("idx_ai_chat_sessions_project").on(table.projectId),
  ]
);

export const aiChatSessionsRelations = relations(aiChatSessions, ({ one }) => ({
  user: one(user, {
    fields: [aiChatSessions.userId],
    references: [user.id],
  }),
  document: one(documents, {
    fields: [aiChatSessions.documentId],
    references: [documents.id],
  }),
  project: one(projects, {
    fields: [aiChatSessions.projectId],
    references: [projects.id],
  }),
}));

// Types
export type AIChatSession = typeof aiChatSessions.$inferSelect;
export type NewAIChatSession = typeof aiChatSessions.$inferInsert;
export type AIChatContext = "dashboard" | "editor";
export type AIChatStatus = "active" | "archived" | "error";
