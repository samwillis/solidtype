/**
 * Workspaces table schema
 *
 * Workspaces are the top-level organizational unit.
 * Users belong to workspaces, and workspaces contain projects.
 */

import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./better-auth";
import { workspaceMembers } from "./workspace-members";
import { projects } from "./projects";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Reference to better-auth's user table
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
});

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  creator: one(user, {
    fields: [workspaces.createdBy],
    references: [user.id],
  }),
  members: many(workspaceMembers),
  projects: many(projects),
}));

// Types
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
