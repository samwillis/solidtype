/**
 * Workspace Settings Dialog
 *
 * Allows workspace admins to manage workspace settings
 */

import React, { useState, useEffect, useCallback } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { useSession } from "../../lib/auth-client";
import { useLiveQuery } from "@tanstack/react-db";
import { workspacesCollection } from "../../lib/electric-collections";
import {
  updateWorkspaceMutation,
  deleteWorkspaceMutation,
  listWorkspaceMembersMutation,
  addWorkspaceMemberMutation,
  updateWorkspaceMemberRoleMutation,
  removeWorkspaceMemberMutation,
} from "../../lib/server-functions";
import { useNavigate } from "@tanstack/react-router";
import { LuTrash2, LuUserPlus, LuSettings, LuShield, LuUser, LuCrown, LuX } from "react-icons/lu";
import { z } from "zod";
import { Avatar } from "../Avatar";
import { InviteMemberDialog } from "./InviteMemberDialog";
import "./CreateDialog.css";
import "./WorkspaceSettingsDialog.css";

const workspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

interface WorkspaceMember {
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: Date;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export const WorkspaceSettingsDialog: React.FC<WorkspaceSettingsDialogProps> = ({
  open,
  onOpenChange,
  workspaceId,
}) => {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"general" | "members" | "danger">("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);

  // Load workspace data
  const { data: allWorkspaces } = useLiveQuery(() => workspacesCollection);
  const workspace = allWorkspaces?.find((w) => w.id === workspaceId);

  // Current user's role in this workspace
  const currentUserRole = members.find((m) => m.userId === session?.user?.id)?.role;
  const canManageMembers = currentUserRole === "owner" || currentUserRole === "admin";

  // Load members when members tab is active
  const loadMembers = useCallback(async () => {
    if (!workspaceId) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const result = await listWorkspaceMembersMutation({ data: { workspaceId } });
      setMembers(result.members as WorkspaceMember[]);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open && activeTab === "members") {
      loadMembers();
    }
  }, [open, activeTab, loadMembers]);

  const form = useForm({
    defaultValues: {
      name: workspace?.name || "",
      description: workspace?.description || "",
    },
    onSubmit: async ({ value }) => {
      if (!session?.user?.id || !workspaceId) return;

      setIsSubmitting(true);
      try {
        await updateWorkspaceMutation({
          data: {
            workspaceId,
            updates: {
              name: value.name,
              description: value.description || undefined,
            },
          },
        });
        onOpenChange(false);
      } catch (error) {
        console.error("Failed to update workspace:", error);
        alert("Failed to update workspace. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Update form when workspace data loads
  useEffect(() => {
    if (open && workspace) {
      form.setFieldValue("name", workspace.name);
      form.setFieldValue("description", workspace.description || "");
    }
  }, [open, workspace]);

  const handleDeleteWorkspace = async () => {
    if (!workspaceId) return;

    setIsDeleting(true);
    try {
      await deleteWorkspaceMutation({ data: { workspaceId } });
      navigate({ to: "/dashboard" });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to delete workspace:", error);
      alert("Failed to delete workspace. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleInviteMember = async (email: string, role: string) => {
    await addWorkspaceMemberMutation({
      data: {
        workspaceId,
        email,
        role: role as "admin" | "member",
      },
    });
    await loadMembers();
  };

  const handleUpdateMemberRole = async (userId: string, newRole: "admin" | "member") => {
    setMemberActionLoading(userId);
    try {
      await updateWorkspaceMemberRoleMutation({
        data: { workspaceId, userId, role: newRole },
      });
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setMemberActionLoading(null);
    }
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName} from this workspace?`)) return;

    setMemberActionLoading(userId);
    try {
      await removeWorkspaceMemberMutation({ data: { workspaceId, userId } });
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
      default:
        return <LuUser size={14} className="member-role-icon member-role-member" />;
    }
  };

  if (!workspace) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup workspace-settings-dialog">
          <Dialog.Title className="create-dialog-title">
            <LuSettings size={18} style={{ marginRight: "8px" }} />
            Workspace Settings
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
            <button
              className={`settings-tab settings-tab-danger ${activeTab === "danger" ? "active" : ""}`}
              onClick={() => setActiveTab("danger")}
            >
              Danger
            </button>
          </div>

          <div className="workspace-settings-dialog-content">
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
                      const result = workspaceSchema.shape.name.safeParse(value);
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
                            {member.userId === session?.user?.id && (
                              <span className="settings-member-you">(you)</span>
                            )}
                          </div>
                          <div className="settings-member-email">{member.userEmail}</div>
                        </div>
                        <div className="settings-member-role">
                          {getRoleIcon(member.role)}
                          {member.role === "owner" ? (
                            <span className="settings-role-label">Owner</span>
                          ) : canManageMembers && member.userId !== session?.user?.id ? (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                handleUpdateMemberRole(
                                  member.userId,
                                  e.target.value as "admin" | "member"
                                )
                              }
                              className="settings-role-select"
                              disabled={memberActionLoading === member.userId}
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                            </select>
                          ) : (
                            <span className="settings-role-label">
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </span>
                          )}
                        </div>
                        {canManageMembers &&
                          member.role !== "owner" &&
                          member.userId !== session?.user?.id && (
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
            {activeTab === "danger" && (
              <div className="settings-section settings-danger-zone">
                <h3 className="settings-section-title">Delete Workspace</h3>
                <p className="settings-warning">
                  This will permanently delete the workspace and all projects within it.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    className="settings-button settings-button-danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <LuTrash2 size={16} />
                    <span>Delete Workspace</span>
                  </button>
                ) : (
                  <div className="settings-delete-confirm">
                    <p className="settings-delete-warning">
                      Are you sure? This action cannot be undone.
                    </p>
                    <div className="settings-delete-actions">
                      <button
                        className="settings-button settings-button-secondary"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting}
                      >
                        Cancel
                      </button>
                      <button
                        className="settings-button settings-button-danger"
                        onClick={handleDeleteWorkspace}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "Delete Workspace"}
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
        entityType="workspace"
        entityName={workspace?.name || "Workspace"}
        onInvite={handleInviteMember}
      />
    </Dialog.Root>
  );
};
