/**
 * Create Workspace Dialog
 *
 * Dialog for creating a new workspace using TanStack Form and Base UI Dialog.
 */

import React, { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { useSession } from "../../lib/auth-client";
import { createWorkspaceMutation } from "../../lib/server-functions";
import { z } from "zod";
import "./CreateDialog.css";

const workspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

// Generate URL-friendly slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const CreateWorkspaceDialog: React.FC<CreateWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
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
        const slug = generateSlug(value.name);

        await createWorkspaceMutation({
          data: {
            name: value.name,
            slug,
            description: value.description || undefined,
          },
        });

        form.reset();
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        console.error("Failed to create workspace:", error);
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
          <Dialog.Title className="create-dialog-title">Create Workspace</Dialog.Title>
          <Dialog.Description className="create-dialog-description">
            Create a new workspace to organize your projects.
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
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
                    placeholder="My Workspace"
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
                  const result = workspaceSchema.shape.description.safeParse(value);
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
                    {isSubmitting ? "Creating..." : "Create Workspace"}
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
