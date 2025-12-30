/**
 * Project members table schema
 * 
 * Tracks which users have access to which projects and their roles.
 */

import { pgTable, uuid, text, timestamp, pgEnum, primaryKey, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './better-auth';
import { projects } from './projects';

export const projectRoleEnum = pgEnum('project_role', ['owner', 'admin', 'member', 'guest']);

export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  // Reference to better-auth's user table
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: projectRoleEnum('role').notNull().default('member'),
  canEdit: boolean('can_edit').notNull().default(true), // false = read-only
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }),
]);

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(user, {
    fields: [projectMembers.userId],
    references: [user.id],
  }),
}));

// Types
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ProjectRole = 'owner' | 'admin' | 'member' | 'guest';
