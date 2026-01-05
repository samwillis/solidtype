/**
 * Member Validators
 *
 * Zod schemas for workspace and project member management.
 */

import { z } from "zod";

// ============================================================================
// Workspace Member Schemas
// ============================================================================

export const listWorkspaceMembersSchema = z.object({
  workspaceId: z.uuid(),
});

export const addWorkspaceMemberSchema = z.object({
  workspaceId: z.uuid(),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"]),
});

export const updateWorkspaceMemberRoleSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.string().min(1, "User ID is required"),
  role: z.enum(["admin", "member"]),
});

export const removeWorkspaceMemberSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.string().min(1, "User ID is required"),
});

// ============================================================================
// Project Member Schemas
// ============================================================================

export const listProjectMembersSchema = z.object({
  projectId: z.uuid(),
});

export const addProjectMemberSchema = z.object({
  projectId: z.uuid(),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member", "guest"]),
  canEdit: z.boolean(),
});

export const updateProjectMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.string().min(1, "User ID is required"),
  role: z.enum(["admin", "member", "guest"]).optional(),
  canEdit: z.boolean().optional(),
});

export const removeProjectMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.string().min(1, "User ID is required"),
});

// ============================================================================
// Types
// ============================================================================

export type ListWorkspaceMembersInput = z.infer<typeof listWorkspaceMembersSchema>;
export type AddWorkspaceMemberInput = z.infer<typeof addWorkspaceMemberSchema>;
export type UpdateWorkspaceMemberRoleInput = z.infer<typeof updateWorkspaceMemberRoleSchema>;
export type RemoveWorkspaceMemberInput = z.infer<typeof removeWorkspaceMemberSchema>;

export type ListProjectMembersInput = z.infer<typeof listProjectMembersSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberSchema>;
export type RemoveProjectMemberInput = z.infer<typeof removeProjectMemberSchema>;
