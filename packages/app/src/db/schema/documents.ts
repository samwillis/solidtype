/**
 * Documents table schema
 *
 * Documents are the actual CAD files (parts, assemblies, etc).
 * Each document has a Yjs document synced via Durable Streams.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./better-auth";
import { projects } from "./projects";
import { branches } from "./branches";
import { folders } from "./folders";

export const documentTypeEnum = pgEnum("document_type", [
  "part", // CAD part (current focus)
  "assembly", // Future: assembly of parts
  "drawing", // Future: 2D drawings
  "sketch", // Future: standalone sketch
  "file", // Future: attached files
  "notes", // Future: rich text notes
]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // For branching: tracks sibling documents across branches.
    // When first created, baseDocumentId = id. When copied to a branch,
    // the new doc gets a new id but keeps the same baseDocumentId.
    baseDocumentId: uuid("base_document_id"),

    // Denormalized: both project_id and branch_id for easy filtering
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),

    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: documentTypeEnum("type").notNull().default("part"),

    // Durable Stream reference for Yjs document
    // Format: "project/{projectId}/doc/{documentId}/branch/{branchId}"
    durableStreamId: text("durable_stream_id"),

    // For branching: soft delete flag (restored on merge if edited in branch)
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    // Reference to better-auth's user table
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),

    // Metadata for quick display (without loading full Yjs doc)
    featureCount: integer("feature_count").default(0),
    lastEditedBy: text("last_edited_by").references(() => user.id, { onDelete: "set null" }),

    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    // Indexes for Electric sync filtering
    index("idx_documents_project").on(table.projectId),
    index("idx_documents_branch").on(table.branchId),
    index("idx_documents_project_branch").on(table.projectId, table.branchId),
  ]
);

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
  branch: one(branches, {
    fields: [documents.branchId],
    references: [branches.id],
  }),
  folder: one(folders, {
    fields: [documents.folderId],
    references: [folders.id],
  }),
  creator: one(user, {
    fields: [documents.createdBy],
    references: [user.id],
    relationName: "documentCreator",
  }),
  lastEditor: one(user, {
    fields: [documents.lastEditedBy],
    references: [user.id],
    relationName: "documentLastEditor",
  }),
  deletedByUser: one(user, {
    fields: [documents.deletedBy],
    references: [user.id],
    relationName: "documentDeleter",
  }),
}));

// Types
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentType = "part" | "assembly" | "drawing" | "sketch" | "file" | "notes";
