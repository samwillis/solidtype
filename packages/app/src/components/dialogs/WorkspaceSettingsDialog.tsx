/**
 * Workspace Settings Dialog
 *
 * Allows workspace admins to manage workspace settings
 */

import React, { useState, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { useSession } from "../../lib/auth-client";
import { useLiveQuery } from "@tanstack/react-db";
import { workspacesCollection } from "../../lib/electric-collections";
import { updateWorkspaceMutation, deleteWorkspaceMutation } from "../../lib/server-functions";
import { useNavigate } from "@tanstack/react-router";
import { LuTrash2, LuUserPlus, LuSettings } from "react-icons/lu";
import { z } from "zod";
import "./CreateDialog.css";
import "./WorkspaceSettingsDialog.css";

const workspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

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

  // Load workspace data
  const { data: allWorkspaces } = useLiveQuery(() => workspacesCollection);
  const workspace = allWorkspaces?.find((w) => w.id === workspaceId);

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
              description: value.description || null,
              updatedAt: new Date(),
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
                <div className="settings-members-list">
                  <p className="settings-empty">Member management coming soon</p>
                  <p className="settings-hint">
                    You&apos;ll be able to invite users, manage roles, and remove members.
                  </p>
                </div>
                <button className="settings-button settings-button-secondary" disabled>
                  <LuUserPlus size={16} />
                  <span>Invite Member</span>
                </button>
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
    </Dialog.Root>
  );
};
