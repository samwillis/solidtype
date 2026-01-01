/**
 * Branches table schema
 *
 * Branches allow users to work on isolated copies of a project.
 * Each project has a "main" branch by default.
 */

import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "./better-auth";
import { projects } from "./projects";
import { documents } from "./documents";
import { folders } from "./folders";

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    // Branch metadata
    name: text("name").notNull(), // e.g., "main", "feature-new-part", "john-wip"
    description: text("description"), // Optional description of what this branch is for
    isMain: boolean("is_main").notNull().default(false), // Only one branch per project can be main

    // Fork point - which branch this was created from (null for main)
    parentBranchId: uuid("parent_branch_id"),
    forkedAt: timestamp("forked_at"), // When this branch was created from parent

    // Ownership
    // Reference to better-auth's user table
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }), // Who "owns" this branch

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),

    // Merge status
    mergedAt: timestamp("merged_at"), // When this branch was merged back
    mergedBy: text("merged_by").references(() => user.id, { onDelete: "set null" }), // Reference to better-auth's user table
    mergedIntoBranchId: uuid("merged_into_branch_id"),
  },
  (table) => [
    // Index for project lookup
    index("idx_branches_project").on(table.projectId),
    // Unique index for main branch per project (only one main allowed)
    uniqueIndex("idx_branches_main")
      .on(table.projectId)
      .where(sql`${table.isMain} = true`),
  ]
);

export const branchesRelations = relations(branches, ({ one, many }) => ({
  project: one(projects, {
    fields: [branches.projectId],
    references: [projects.id],
  }),
  parentBranch: one(branches, {
    fields: [branches.parentBranchId],
    references: [branches.id],
    relationName: "childBranches",
  }),
  childBranches: many(branches, { relationName: "childBranches" }),
  creator: one(user, {
    fields: [branches.createdBy],
    references: [user.id],
    relationName: "branchCreator",
  }),
  owner: one(user, {
    fields: [branches.ownerId],
    references: [user.id],
    relationName: "branchOwner",
  }),
  mergedByUser: one(user, {
    fields: [branches.mergedBy],
    references: [user.id],
    relationName: "branchMerger",
  }),
  mergedIntoBranch: one(branches, {
    fields: [branches.mergedIntoBranchId],
    references: [branches.id],
    relationName: "mergedInto",
  }),
  documents: many(documents),
  folders: many(folders),
}));

// Types
export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
