/**
 * Folders table schema
 * 
 * Folders provide hierarchical organization within a branch.
 */

import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './better-auth';
import { projects } from './projects';
import { branches } from './branches';
import { documents } from './documents';

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Denormalized: both project_id and branch_id for easy filtering
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
  
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Reference to better-auth's user table
  createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'restrict' }),
}, (table) => [
  // Indexes for Electric sync filtering
  index('idx_folders_project').on(table.projectId),
  index('idx_folders_branch').on(table.branchId),
  index('idx_folders_project_branch').on(table.projectId, table.branchId),
]);

export const foldersRelations = relations(folders, ({ one, many }) => ({
  project: one(projects, {
    fields: [folders.projectId],
    references: [projects.id],
  }),
  branch: one(branches, {
    fields: [folders.branchId],
    references: [branches.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'parentFolder',
  }),
  children: many(folders, { relationName: 'parentFolder' }),
  creator: one(user, {
    fields: [folders.createdBy],
    references: [user.id],
  }),
  documents: many(documents),
}));

// Types
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
