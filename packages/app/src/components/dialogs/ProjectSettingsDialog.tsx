/**
 * Project Settings Dialog
 *
 * Allows project admins to manage project settings, members, and delete the project
 */

import React, { useState, useEffect, useCallback } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { useSession } from "../../lib/auth-client";
import { useLiveQuery } from "@tanstack/react-db";
import { projectsCollection } from "../../lib/electric-collections";
import {
  updateProjectMutation,
  deleteProjectMutation,
  listProjectMembersMutation,
  addProjectMemberMutation,
  updateProjectMemberMutation,
  removeProjectMemberMutation,
} from "../../lib/server-functions";
import { useNavigate } from "@tanstack/react-router";
import {
  LuTrash2,
  LuUserPlus,
  LuSettings,
  LuShield,
  LuUser,
  LuCrown,
  LuX,
  LuEye,
  LuPencil,
} from "react-icons/lu";
import { z } from "zod";
import { Avatar } from "../Avatar";
import { InviteMemberDialog } from "./InviteMemberDialog";
import "./CreateDialog.css";
import "./ProjectSettingsDialog.css";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

interface ProjectMember {
  userId: string;
  role: "owner" | "admin" | "member" | "guest";
  canEdit: boolean;
  joinedAt: Date;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export const ProjectSettingsDialog: React.FC<ProjectSettingsDialogProps> = ({
  open,
  onOpenChange,
  projectId,
}) => {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"general" | "members" | "danger">("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);

  // Load project data
  const { data: allProjects } = useLiveQuery(() => projectsCollection);
  const project = allProjects?.find((p) => p.id === projectId);

  const currentUserId = session?.user?.id;
  const currentUserRole = members.find((m) => m.userId === currentUserId)?.role;
  const canManageMembers = currentUserRole === "owner" || currentUserRole === "admin";
  const isAdmin = canManageMembers;

  // Load members when members tab is active
  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const result = await listProjectMembersMutation({ data: { projectId } });
      setMembers(result.members as ProjectMember[]);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open && activeTab === "members") {
      loadMembers();
    }
  }, [open, activeTab, loadMembers]);

  const form = useForm({
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
    },
    onSubmit: async ({ value }) => {
      if (!session?.user?.id || !projectId) return;

      setIsSubmitting(true);
      try {
        await updateProjectMutation({
          data: {
            projectId,
            updates: {
              name: value.name,
              description: value.description || undefined,
            },
          },
        });
        onOpenChange(false);
      } catch (error) {
        console.error("Failed to update project:", error);
        alert("Failed to update project. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Update form when project data loads
  useEffect(() => {
    if (open && project) {
      form.setFieldValue("name", project.name);
      form.setFieldValue("description", project.description || "");
    }
  }, [open, project]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setActiveTab("general");
      setShowDeleteConfirm(false);
    }
  }, [open]);

  const handleDeleteProject = async () => {
    if (!projectId || !currentUserId) return;

    setIsDeleting(true);
    try {
      await deleteProjectMutation({ data: { projectId } });
      navigate({ to: "/dashboard" });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert("Failed to delete project. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleInviteMember = async (email: string, role: string, canEdit?: boolean) => {
    await addProjectMemberMutation({
      data: {
        projectId,
        email,
        role: role as "admin" | "member" | "guest",
        canEdit: canEdit ?? true,
      },
    });
    await loadMembers();
  };

  const handleUpdateMemberRole = async (userId: string, newRole: "admin" | "member" | "guest") => {
    setMemberActionLoading(userId);
    try {
      await updateProjectMemberMutation({
        data: { projectId, userId, role: newRole },
      });
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setMemberActionLoading(null);
    }
  };

  const handleToggleCanEdit = async (userId: string, canEdit: boolean) => {
    setMemberActionLoading(userId);
    try {
      await updateProjectMemberMutation({
        data: { projectId, userId, canEdit },
      });
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update permissions");
    } finally {
      setMemberActionLoading(null);
    }
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName} from this project?`)) return;

    setMemberActionLoading(userId);
    try {
      await removeProjectMemberMutation({ data: { projectId, userId } });
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setMemberActionLoading(null);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <LuCrown size={14} className="member-role-icon member-role-owner" />;
      case "admin":
        return <LuShield size={14} className="member-role-icon member-role-admin" />;
      case "guest":
        return <LuEye size={14} className="member-role-icon member-role-guest" />;
      default:
        return <LuUser size={14} className="member-role-icon member-role-member" />;
    }
  };

  if (!project) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup project-settings-dialog">
          <Dialog.Title className="create-dialog-title">
            <LuSettings size={18} style={{ marginRight: "8px" }} />
            Project Settings
          </Dialog.Title>

          {/* Tabs */}
          <div className="settings-tabs">
            <button
              className={`settings-tab ${activeTab === "general" ? "active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              General
            </button>
            <button
              className={`settings-tab ${activeTab === "members" ? "active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              Members
            </button>
            {isAdmin && (
              <button
                className={`settings-tab settings-tab-danger ${activeTab === "danger" ? "active" : ""}`}
                onClick={() => setActiveTab("danger")}
              >
                Danger
              </button>
            )}
          </div>

          <div className="project-settings-dialog-content">
            {/* General Tab */}
            {activeTab === "general" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
                className="create-dialog-form"
              >
                <form.Field
                  name="name"
                  validators={{
                    onChange: ({ value }) => {
                      const result = projectSchema.shape.name.safeParse(value);
                      return result.success ? undefined : result.error.issues[0]?.message;
                    },
                  }}
                  children={(field) => (
                    <div className="create-dialog-field">
                      <label htmlFor={field.name} className="create-dialog-label">
                        Name <span className="create-dialog-required">*</span>
                      </label>
                      <input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="create-dialog-input"
                        disabled={isSubmitting}
                      />
                      {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                        <div className="create-dialog-error">
                          {field.state.meta.errors.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                />

                <form.Field
                  name="description"
                  children={(field) => (
                    <div className="create-dialog-field">
                      <label htmlFor={field.name} className="create-dialog-label">
                        Description
                      </label>
                      <textarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="create-dialog-textarea"
                        rows={3}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}
                />

                <div className="create-dialog-actions">
                  <button
                    type="button"
                    className="create-dialog-button create-dialog-button-cancel"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="create-dialog-button create-dialog-button-submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}

            {/* Members Tab */}
            {activeTab === "members" && (
              <div className="settings-section">
                {membersLoading ? (
                  <div className="settings-loading">Loading members...</div>
                ) : membersError ? (
                  <div className="settings-error">{membersError}</div>
                ) : (
                  <div className="settings-members-list">
                    {members.map((member) => (
                      <div key={member.userId} className="settings-member-item">
                        <Avatar
                          user={{
                            id: member.userId,
                            name: member.userName,
                            email: member.userEmail,
                          }}
                          size={32}
                          fontSize={12}
                        />
                        <div className="settings-member-info">
                          <div className="settings-member-name">
                            {member.userName}
                            {member.userId === currentUserId && (
                              <span className="settings-member-you">(you)</span>
                            )}
                          </div>
                          <div className="settings-member-email">{member.userEmail}</div>
                        </div>
                        <div className="settings-member-role">
                          {getRoleIcon(member.role)}
                          {member.role === "owner" ? (
                            <span className="settings-role-label">Owner</span>
                          ) : canManageMembers && member.userId !== currentUserId ? (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                handleUpdateMemberRole(
                                  member.userId,
                                  e.target.value as "admin" | "member" | "guest"
                                )
                              }
                              className="settings-role-select"
                              disabled={memberActionLoading === member.userId}
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="guest">Guest</option>
                            </select>
                          ) : (
                            <span className="settings-role-label">
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </span>
                          )}
                        </div>
                        {/* Edit permission toggle */}
                        {member.role !== "owner" && (
                          <button
                            className={`settings-permission-toggle ${member.canEdit ? "can-edit" : "read-only"}`}
                            onClick={() =>
                              canManageMembers &&
                              member.userId !== currentUserId &&
                              handleToggleCanEdit(member.userId, !member.canEdit)
                            }
                            disabled={
                              memberActionLoading === member.userId ||
                              !canManageMembers ||
                              member.userId === currentUserId
                            }
                            title={member.canEdit ? "Can edit" : "Read-only"}
                          >
                            {member.canEdit ? <LuPencil size={14} /> : <LuEye size={14} />}
                          </button>
                        )}
                        {canManageMembers &&
                          member.role !== "owner" &&
                          member.userId !== currentUserId && (
                            <button
                              className="settings-member-remove"
                              onClick={() => handleRemoveMember(member.userId, member.userName)}
                              disabled={memberActionLoading === member.userId}
                              title="Remove member"
                            >
                              <LuX size={16} />
                            </button>
                          )}
                      </div>
                    ))}
                    {members.length === 0 && <p className="settings-empty">No members found</p>}
                  </div>
                )}
                {canManageMembers && (
                  <button
                    className="settings-button settings-button-secondary"
                    onClick={() => setShowInviteDialog(true)}
                  >
                    <LuUserPlus size={16} />
                    <span>Invite Member</span>
                  </button>
                )}
              </div>
            )}

            {/* Danger Tab */}
            {activeTab === "danger" && isAdmin && (
              <div className="project-settings-section project-settings-danger-zone">
                <h3 className="project-settings-section-title">Delete Project</h3>
                <p className="project-settings-warning">
                  This will permanently delete the project and all documents within it.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    className="project-settings-button project-settings-button-danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <LuTrash2 size={16} />
                    <span>Delete Project</span>
                  </button>
                ) : (
                  <div className="project-settings-delete-confirm">
                    <p className="project-settings-delete-warning">
                      Are you sure? This action cannot be undone.
                    </p>
                    <div className="project-settings-delete-actions">
                      <button
                        className="project-settings-button project-settings-button-secondary"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting}
                      >
                        Cancel
                      </button>
                      <button
                        className="project-settings-button project-settings-button-danger"
                        onClick={handleDeleteProject}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "Delete Project"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>

      <InviteMemberDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        entityType="project"
        entityName={project?.name || "Project"}
        onInvite={handleInviteMember}
      />
    </Dialog.Root>
  );
};
