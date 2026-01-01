/**
 * Create Document Dialog
 *
 * Dialog for creating a new document using TanStack Form and Base UI Dialog.
 * Context-aware: can pre-select project, branch, and folder.
 */

import React, { useState, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { LuChevronDown } from "react-icons/lu";
import { useSession } from "../../lib/auth-client";
import { createDocumentMutation } from "../../lib/server-functions";
import { useLiveQuery } from "@tanstack/react-db";
import {
  projectsCollection,
  branchesCollection,
  foldersCollection,
} from "../../lib/electric-collections";
import { z } from "zod";
import "./CreateDialog.css";

const documentSchema = z.object({
  projectId: z.string().uuid("Project is required"),
  branchId: z.string().uuid("Branch is required"),
  folderId: z.string().uuid().nullable().optional(),
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  type: z.enum(["part", "assembly", "drawing", "sketch", "file", "notes"]),
});

const documentTypes = [
  { value: "part", label: "Part" },
  { value: "assembly", label: "Assembly" },
  { value: "drawing", label: "Drawing" },
  { value: "sketch", label: "Sketch" },
  { value: "file", label: "File" },
  { value: "notes", label: "Notes" },
] as const;

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedProjectId?: string;
  preselectedBranchId?: string;
  preselectedFolderId?: string | null;
  onSuccess?: () => void;
}

export const CreateDocumentDialog: React.FC<CreateDocumentDialogProps> = ({
  open,
  onOpenChange,
  preselectedProjectId,
  preselectedBranchId,
  preselectedFolderId,
  onSuccess,
}) => {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableBranches, setAvailableBranches] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }>>([]);

  // Get available projects, branches, folders from collections
  const { data: projects } = useLiveQuery(() => projectsCollection);
  const { data: allBranches } = useLiveQuery(() => branchesCollection);
  const { data: allFolders } = useLiveQuery(() => foldersCollection);

  const form = useForm({
    defaultValues: {
      projectId: preselectedProjectId || "",
      branchId: preselectedBranchId || "",
      folderId: preselectedFolderId !== undefined ? preselectedFolderId : null,
      name: "",
      type: "part" as const,
    },
    onSubmit: async ({ value }) => {
      if (!session?.user?.id) {
        console.error("User not authenticated");
        return;
      }

      setIsSubmitting(true);
      try {
        // Build document object, only including folderId if it's a valid non-empty value
        const documentData: any = {
          projectId: value.projectId,
          branchId: value.branchId,
          name: value.name,
          type: value.type,
          featureCount: 0,
          sortOrder: 0,
          createdBy: session.user.id,
        };

        // Only include folderId if it's a valid non-empty string
        if (value.folderId && typeof value.folderId === "string" && value.folderId.trim() !== "") {
          documentData.folderId = value.folderId.trim();
        }

        await createDocumentMutation({
          data: {
            document: documentData,
          },
        });

        // Reset form with preselected values
        form.setFieldValue("projectId", preselectedProjectId || "");
        form.setFieldValue("branchId", preselectedBranchId || "");
        form.setFieldValue(
          "folderId",
          preselectedFolderId !== undefined ? preselectedFolderId : null
        );
        form.setFieldValue("name", "");
        form.setFieldValue("type", "part");
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        console.error("Failed to create document:", error);
        // TODO: Show error toast/message
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Load branches when project changes
  useEffect(() => {
    const projectId = form.state.values.projectId;
    if (projectId && allBranches) {
      const filtered = allBranches.filter((b) => b.project_id === projectId);
      setAvailableBranches(filtered);
    } else if (!projectId) {
      setAvailableBranches([]);
    }
  }, [form.state.values.projectId, allBranches]);

  // Load branches for preselected project
  useEffect(() => {
    if (preselectedProjectId && allBranches) {
      const filtered = allBranches.filter((b) => b.project_id === preselectedProjectId);
      setAvailableBranches(filtered);
    }
  }, [preselectedProjectId, allBranches]);

  // Update form values when preselected values change (e.g., when dialog opens with context)
  useEffect(() => {
    if (open) {
      // Reset form when dialog opens
      if (preselectedProjectId) {
        form.setFieldValue("projectId", preselectedProjectId);
      } else {
        form.setFieldValue("projectId", "");
      }
      if (preselectedBranchId) {
        form.setFieldValue("branchId", preselectedBranchId);
      } else {
        form.setFieldValue("branchId", "");
      }
      if (preselectedFolderId !== undefined) {
        form.setFieldValue("folderId", preselectedFolderId);
      } else {
        form.setFieldValue("folderId", null);
      }
      form.setFieldValue("name", "");
    }
  }, [preselectedProjectId, preselectedBranchId, preselectedFolderId, open]); // Reset when dialog opens

  // Load folders when branch changes
  useEffect(() => {
    const projectId = form.state.values.projectId;
    const branchId = form.state.values.branchId;
    if (projectId && branchId && allFolders) {
      const filtered = allFolders.filter(
        (f) => f.project_id === projectId && f.branch_id === branchId
      );
      setAvailableFolders(filtered);
    } else {
      setAvailableFolders([]);
    }
  }, [form.state.values.projectId, form.state.values.branchId, allFolders]);

  // Reset branch and folder when project changes (unless preselected)
  useEffect(() => {
    if (form.state.values.projectId && form.state.values.projectId !== preselectedProjectId) {
      if (!preselectedBranchId) {
        form.setFieldValue("branchId", "");
      }
      form.setFieldValue("folderId", null);
    }
  }, [form.state.values.projectId, preselectedProjectId, preselectedBranchId]);

  // Reset folder when branch changes (unless preselected)
  useEffect(() => {
    if (form.state.values.branchId && form.state.values.branchId !== preselectedBranchId) {
      if (!preselectedFolderId) {
        form.setFieldValue("folderId", null);
      }
    }
  }, [form.state.values.branchId, preselectedBranchId, preselectedFolderId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup">
          <Dialog.Title className="create-dialog-title">Create Document</Dialog.Title>
          <Dialog.Description className="create-dialog-description">
            Create a new document (part, assembly, drawing, etc.).
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="create-dialog-form"
          >
            {!preselectedProjectId && (
              <form.Field
                name="projectId"
                validators={{
                  onChange: ({ value }) => {
                    const result = documentSchema.shape.projectId.safeParse(value);
                    return result.success ? undefined : result.error.issues[0]?.message;
                  },
                }}
                children={(field) => (
                  <div className="create-dialog-field">
                    <label htmlFor={field.name} className="create-dialog-label">
                      Project <span className="create-dialog-required">*</span>
                    </label>
                    <Select.Root
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value || "")}
                      disabled={isSubmitting}
                    >
                      <Select.Trigger
                        id={field.name}
                        className="create-dialog-select-trigger"
                        aria-label="Select project"
                      >
                        {projects?.find((p) => p.id === field.state.value)?.name ||
                          "Select project..."}
                        <LuChevronDown size={12} />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner className="create-dialog-select-positioner">
                          <Select.Popup className="create-dialog-select-popup">
                            {projects && projects.length > 0 ? (
                              projects.map((project) => (
                                <Select.Item
                                  key={project.id}
                                  value={project.id}
                                  className="create-dialog-select-option"
                                >
                                  {project.name}
                                </Select.Item>
                              ))
                            ) : (
                              <div className="create-dialog-select-option" style={{ opacity: 0.6 }}>
                                No projects available
                              </div>
                            )}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                      <div className="create-dialog-error">
                        {field.state.meta.errors.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              />
            )}

            {preselectedProjectId && (
              <form.Field
                name="projectId"
                children={(_field) => (
                  <div className="create-dialog-field">
                    <label className="create-dialog-label">Project</label>
                    <input
                      type="text"
                      value={projects?.find((p) => p.id === preselectedProjectId)?.name || ""}
                      className="create-dialog-input"
                      disabled
                    />
                    <input type="hidden" value={preselectedProjectId} />
                  </div>
                )}
              />
            )}

            {!preselectedBranchId && (
              <form.Field
                name="branchId"
                validators={{
                  onChange: ({ value }) => {
                    if (!form.state.values.projectId) {
                      return "Select a project first";
                    }
                    const result = documentSchema.shape.branchId.safeParse(value);
                    return result.success ? undefined : result.error.issues[0]?.message;
                  },
                }}
                children={(field) => (
                  <div className="create-dialog-field">
                    <label htmlFor={field.name} className="create-dialog-label">
                      Branch <span className="create-dialog-required">*</span>
                    </label>
                    <Select.Root
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value || "")}
                      disabled={isSubmitting || !form.state.values.projectId}
                    >
                      <Select.Trigger
                        id={field.name}
                        className="create-dialog-select-trigger"
                        aria-label="Select branch"
                      >
                        {availableBranches.find((b) => b.id === field.state.value)?.name ||
                          "Select branch..."}
                        <LuChevronDown size={12} />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner className="create-dialog-select-positioner">
                          <Select.Popup className="create-dialog-select-popup">
                            {availableBranches.map((branch) => (
                              <Select.Item
                                key={branch.id}
                                value={branch.id}
                                className="create-dialog-select-option"
                              >
                                {branch.name} {branch.is_main ? "(main)" : ""}
                              </Select.Item>
                            ))}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                      <div className="create-dialog-error">
                        {field.state.meta.errors.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              />
            )}

            {preselectedBranchId && (
              <form.Field
                name="branchId"
                children={(_field) => (
                  <div className="create-dialog-field">
                    <label className="create-dialog-label">Branch</label>
                    <input
                      type="text"
                      value={
                        availableBranches.find((b) => b.id === preselectedBranchId)?.name ||
                        allBranches?.find((b) => b.id === preselectedBranchId)?.name ||
                        "Loading..."
                      }
                      className="create-dialog-input"
                      disabled
                    />
                    <input type="hidden" value={preselectedBranchId} />
                  </div>
                )}
              />
            )}

            {preselectedFolderId === undefined ? (
              <form.Field
                name="folderId"
                validators={{
                  onChange: () => {
                    // Folder is optional
                    return undefined;
                  },
                }}
                children={(field) => (
                  <div className="create-dialog-field">
                    <label htmlFor={field.name} className="create-dialog-label">
                      Folder
                    </label>
                    <Select.Root
                      value={field.state.value || ""}
                      onValueChange={(value) =>
                        field.handleChange(value === "" ? null : value || null)
                      }
                      disabled={isSubmitting || !form.state.values.branchId}
                    >
                      <Select.Trigger
                        id={field.name}
                        className="create-dialog-select-trigger"
                        aria-label="Select folder (optional)"
                      >
                        {field.state.value === null || field.state.value === ""
                          ? "Root (no folder)"
                          : availableFolders.find((f) => f.id === field.state.value)?.name ||
                            "Select folder..."}
                        <LuChevronDown size={12} />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner className="create-dialog-select-positioner">
                          <Select.Popup className="create-dialog-select-popup">
                            <Select.Item value="" className="create-dialog-select-option">
                              Root (no folder)
                            </Select.Item>
                            {availableFolders.map((folder) => (
                              <Select.Item
                                key={folder.id}
                                value={folder.id}
                                className="create-dialog-select-option"
                              >
                                {folder.name}
                              </Select.Item>
                            ))}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                )}
              />
            ) : (
              <form.Field
                name="folderId"
                children={(_field) => (
                  <div className="create-dialog-field">
                    <label className="create-dialog-label">Folder</label>
                    <input
                      type="text"
                      value={
                        allFolders?.find((f) => f.id === preselectedFolderId)?.name || "Loading..."
                      }
                      className="create-dialog-input"
                      disabled
                    />
                    <input type="hidden" value={preselectedFolderId || ""} />
                  </div>
                )}
              />
            )}

            <form.Field
              name="type"
              children={(field) => (
                <div className="create-dialog-field">
                  <label htmlFor={field.name} className="create-dialog-label">
                    Type <span className="create-dialog-required">*</span>
                  </label>
                  <Select.Root
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value as typeof field.state.value)}
                    disabled={isSubmitting}
                  >
                    <Select.Trigger
                      id={field.name}
                      className="create-dialog-select-trigger"
                      aria-label="Select document type"
                    >
                      {documentTypes.find((t) => t.value === field.state.value)?.label ||
                        "Select type..."}
                      <LuChevronDown size={12} />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Positioner className="create-dialog-select-positioner">
                        <Select.Popup className="create-dialog-select-popup">
                          {documentTypes.map((type) => (
                            <Select.Item
                              key={type.value}
                              value={type.value}
                              className="create-dialog-select-option"
                            >
                              {type.label}
                            </Select.Item>
                          ))}
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>
                </div>
              )}
            />

            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => {
                  const result = documentSchema.shape.name.safeParse(value);
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
                    placeholder="My Document"
                    disabled={isSubmitting}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <div className="create-dialog-error">{field.state.meta.errors.join(", ")}</div>
                  )}
                </div>
              )}
            />

            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit]) => (
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
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isSubmitting ? "Creating..." : "Create Document"}
                  </button>
                </div>
              )}
            />
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
