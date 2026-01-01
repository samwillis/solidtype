/**
 * Project Settings Dialog
 *
 * Allows project admins to manage project settings, members, and delete the project
 */

import React, { useState, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { useSession } from "../../lib/auth-client";
import { useLiveQuery } from "@tanstack/react-db";
import { projectsCollection } from "../../lib/electric-collections";
import { updateProjectMutation, deleteProjectMutation } from "../../lib/server-functions";
import { useNavigate } from "@tanstack/react-router";
import { LuTrash2, LuUserPlus, LuSettings } from "react-icons/lu";
import { z } from "zod";
import "./CreateDialog.css";
import "./ProjectSettingsDialog.css";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

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

  // Load project data
  const { data: allProjects } = useLiveQuery(() => projectsCollection);
  const project = allProjects?.find((p) => p.id === projectId);

  const currentUserId = session?.user?.id;
  const isAdmin = !!currentUserId; // Simplified for now

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
              description: value.description || null,
              updatedAt: new Date(),
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
              <div className="project-settings-section">
                <div className="project-settings-members-list">
                  <p className="project-settings-empty">Member management coming soon</p>
                  <p className="project-settings-hint">
                    You&apos;ll be able to invite users, manage roles (owner, admin, member, guest),
                    and set edit permissions.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    className="project-settings-button project-settings-button-secondary"
                    disabled
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
    </Dialog.Root>
  );
};
