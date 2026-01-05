/**
 * Create Project Dialog
 *
 * Dialog for creating a new project using TanStack Form and Base UI Dialog.
 */

import React, { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { LuChevronDown } from "react-icons/lu";
import { useSession } from "../../lib/auth-client";
import { createProjectMutation } from "../../lib/server-functions";
import { useLiveQuery } from "@tanstack/react-db";
import { workspacesCollection } from "../../lib/electric-collections";
import { z } from "zod";
import "./CreateDialog.css";

const projectFormSchema = z.object({
  workspaceId: z.uuid("Workspace is required"),
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedWorkspaceId?: string;
  onSuccess?: () => void;
}

export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({
  open,
  onOpenChange,
  preselectedWorkspaceId,
  onSuccess,
}) => {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get available workspaces
  const { data: workspaces } = useLiveQuery(workspacesCollection);

  const form = useForm({
    defaultValues: {
      workspaceId: preselectedWorkspaceId || "",
      name: "",
      description: "",
    },
    onSubmit: async ({ value }) => {
      if (!session?.user?.id) {
        console.error("User not authenticated");
        return;
      }

      setIsSubmitting(true);
      try {
        await createProjectMutation({
          data: {
            workspaceId: value.workspaceId,
            name: value.name,
            description: value.description || undefined,
          },
        });

        form.reset();
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        console.error("Failed to create project:", error);
        // TODO: Show error toast/message
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup">
          <Dialog.Title className="create-dialog-title">Create Project</Dialog.Title>
          <Dialog.Description className="create-dialog-description">
            Create a new project in {preselectedWorkspaceId ? "this workspace" : "a workspace"}.
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="create-dialog-form"
          >
            {!preselectedWorkspaceId && (
              <form.Field
                name="workspaceId"
                validators={{
                  onChange: ({ value }) => {
                    const result = projectFormSchema.shape.workspaceId.safeParse(value);
                    return result.success ? undefined : result.error.issues[0]?.message;
                  },
                }}
                children={(field) => (
                  <div className="create-dialog-field">
                    <label htmlFor={field.name} className="create-dialog-label">
                      Workspace <span className="create-dialog-required">*</span>
                    </label>
                    <Select.Root
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value || "")}
                      disabled={isSubmitting}
                    >
                      <Select.Trigger
                        id={field.name}
                        className="create-dialog-select-trigger"
                        aria-label="Select workspace"
                      >
                        {workspaces?.find((w) => w.id === field.state.value)?.name ||
                          "Select workspace..."}
                        <LuChevronDown size={12} />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner className="create-dialog-select-positioner">
                          <Select.Popup className="create-dialog-select-popup">
                            {workspaces && workspaces.length > 0 ? (
                              workspaces.map((workspace) => (
                                <Select.Item
                                  key={workspace.id}
                                  value={workspace.id}
                                  className="create-dialog-select-option"
                                >
                                  {workspace.name}
                                </Select.Item>
                              ))
                            ) : (
                              <div className="create-dialog-select-option" style={{ opacity: 0.6 }}>
                                No workspaces available
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

            {preselectedWorkspaceId && (
              <form.Field
                name="workspaceId"
                children={() => (
                  <div className="create-dialog-field">
                    <label className="create-dialog-label">Workspace</label>
                    <input
                      type="text"
                      value={workspaces?.find((w) => w.id === preselectedWorkspaceId)?.name || ""}
                      className="create-dialog-input"
                      disabled
                    />
                    <input type="hidden" value={preselectedWorkspaceId} />
                  </div>
                )}
              />
            )}

            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => {
                  const result = projectFormSchema.shape.name.safeParse(value);
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
                    placeholder="My Project"
                    disabled={isSubmitting}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <div className="create-dialog-error">{field.state.meta.errors.join(", ")}</div>
                  )}
                </div>
              )}
            />

            <form.Field
              name="description"
              validators={{
                onChange: ({ value }) => {
                  if (!value) return undefined;
                  const result = projectFormSchema.shape.description.safeParse(value);
                  return result.success ? undefined : result.error.issues[0]?.message;
                },
              }}
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
                    placeholder="Optional description"
                    rows={3}
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
                    {isSubmitting ? "Creating..." : "Create Project"}
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
