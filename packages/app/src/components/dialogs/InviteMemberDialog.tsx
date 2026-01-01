/**
 * Invite Member Dialog
 *
 * Dialog for inviting users to a workspace or project by email
 */

import React, { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Dialog } from "@base-ui/react/dialog";
import { z } from "zod";
import "./CreateDialog.css";

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "member", "guest"]),
  canEdit: z.boolean().optional(),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "workspace" | "project";
  entityName: string;
  onInvite: (email: string, role: string, canEdit?: boolean) => Promise<void>;
}

export const InviteMemberDialog: React.FC<InviteMemberDialogProps> = ({
  open,
  onOpenChange,
  entityType,
  entityName,
  onInvite,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      role: entityType === "project" ? "member" : "member",
      canEdit: true,
    } as InviteFormValues,
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);

      try {
        await onInvite(value.email, value.role, value.canEdit);
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to invite member");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const roleOptions =
    entityType === "workspace"
      ? [
          { value: "admin", label: "Admin", description: "Can manage members and settings" },
          { value: "member", label: "Member", description: "Can view and edit content" },
        ]
      : [
          { value: "admin", label: "Admin", description: "Can manage project settings" },
          { value: "member", label: "Member", description: "Full project access" },
          { value: "guest", label: "Guest", description: "Limited access" },
        ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup">
          <Dialog.Title className="create-dialog-title">Invite to {entityName}</Dialog.Title>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="create-dialog-form"
          >
            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) => {
                  const result = inviteSchema.shape.email.safeParse(value);
                  return result.success ? undefined : result.error.issues[0]?.message;
                },
              }}
              children={(field) => (
                <div className="create-dialog-field">
                  <label htmlFor={field.name} className="create-dialog-label">
                    Email Address <span className="create-dialog-required">*</span>
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="colleague@example.com"
                    className="create-dialog-input"
                    disabled={isSubmitting}
                    autoFocus
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <div className="create-dialog-error">{field.state.meta.errors.join(", ")}</div>
                  )}
                </div>
              )}
            />

            <form.Field
              name="role"
              children={(field) => (
                <div className="create-dialog-field">
                  <label htmlFor={field.name} className="create-dialog-label">
                    Role
                  </label>
                  <select
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as "admin" | "member" | "guest")
                    }
                    className="create-dialog-select"
                    disabled={isSubmitting}
                  >
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} - {option.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            />

            {entityType === "project" && (
              <form.Field
                name="canEdit"
                children={(field) => (
                  <div className="create-dialog-field">
                    <label className="create-dialog-checkbox-label">
                      <input
                        type="checkbox"
                        checked={field.state.value}
                        onChange={(e) => field.handleChange(e.target.checked)}
                        disabled={isSubmitting}
                      />
                      <span>Can edit documents</span>
                    </label>
                    <p className="create-dialog-hint">
                      Uncheck for read-only access to project documents
                    </p>
                  </div>
                )}
              />
            )}

            {error && <div className="create-dialog-error">{error}</div>}

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
                {isSubmitting ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
