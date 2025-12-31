/**
 * Create Branch Dialog
 * 
 * Dialog for creating a new branch from an existing branch.
 * Copies all documents and folders from the parent branch.
 */

import React, { useState, useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { Dialog } from '@base-ui/react/dialog';
import { Select } from '@base-ui/react/select';
import { LuChevronDown } from 'react-icons/lu';
import { useSession } from '../../lib/auth-client';
import { createBranchWithContentMutation } from '../../lib/server-functions';
import { useLiveQuery, eq, createCollection, liveQueryCollectionOptions } from '@tanstack/react-db';
import { branchesCollection } from '../../lib/electric-collections';
import { z } from 'zod';
import './CreateDialog.css';

const branchSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  parentBranchId: z.string().uuid('Parent branch is required'),
});

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  parentBranchId?: string;
  onSuccess?: (newBranchId: string) => void;
}

export const CreateBranchDialog: React.FC<CreateBranchDialogProps> = ({
  open,
  onOpenChange,
  projectId,
  parentBranchId,
  onSuccess,
}) => {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get available branches for this project
  const { data: allBranches } = useLiveQuery(() => {
    const projectBranchesCollection = createCollection(
      liveQueryCollectionOptions({
        query: (q) =>
          q
            .from({ branches: branchesCollection })
            .where(({ branches: b }) => eq(b.project_id, projectId))
            .orderBy(({ branches: b }) => b.is_main, 'desc')
            .orderBy(({ branches: b }) => b.created_at, 'desc'),
      })
    );
    return projectBranchesCollection;
  });

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      parentBranchId: parentBranchId || '',
    },
    onSubmit: async ({ value }) => {
      if (!session?.user?.id) {
        console.error('User not authenticated');
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await createBranchWithContentMutation({
          data: {
            projectId,
            parentBranchId: value.parentBranchId,
            name: value.name,
            description: value.description || null,
          },
        });

        form.reset();
        onOpenChange(false);
        onSuccess?.(result.data.branch.id);
      } catch (error) {
        console.error('Failed to create branch:', error);
        // TODO: Show error toast/message
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Update parent branch when prop changes
  useEffect(() => {
    if (open && parentBranchId) {
      form.setFieldValue('parentBranchId', parentBranchId);
    }
  }, [open, parentBranchId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.setFieldValue('name', '');
      form.setFieldValue('description', '');
      if (parentBranchId) {
        form.setFieldValue('parentBranchId', parentBranchId);
      }
    }
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup">
          <Dialog.Title className="create-dialog-title">Create Branch</Dialog.Title>
          <Dialog.Description className="create-dialog-description">
            Create a new branch from an existing branch. All documents and folders will be copied.
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
              name="parentBranchId"
              validators={{
                onChange: ({ value }) => {
                  const result = branchSchema.shape.parentBranchId.safeParse(value);
                  return result.success ? undefined : result.error.issues[0]?.message;
                },
              }}
              children={(field) => (
                <div className="create-dialog-field">
                  <label htmlFor={field.name} className="create-dialog-label">
                    Parent Branch <span className="create-dialog-required">*</span>
                  </label>
                  <Select.Root
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value || '')}
                    disabled={isSubmitting}
                  >
                    <Select.Trigger
                      id={field.name}
                      className="create-dialog-select-trigger"
                      aria-label="Select parent branch"
                    >
                      {allBranches?.find((b) => b.id === field.state.value)?.name || 'Select branch...'}
                      <LuChevronDown size={12} />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Positioner className="create-dialog-select-positioner">
                        <Select.Popup className="create-dialog-select-popup">
                          {allBranches && allBranches.length > 0 ? (
                            allBranches.map((branch) => (
                              <Select.Item
                                key={branch.id}
                                value={branch.id}
                                className="create-dialog-select-option"
                              >
                                {branch.name} {branch.is_main ? '(main)' : ''}
                              </Select.Item>
                            ))
                          ) : (
                            <div className="create-dialog-select-option" style={{ opacity: 0.6 }}>
                              No branches available
                            </div>
                          )}
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <div className="create-dialog-error">
                      {field.state.meta.errors.join(', ')}
                    </div>
                  )}
                </div>
              )}
            />

            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => {
                  const result = branchSchema.shape.name.safeParse(value);
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
                    placeholder="feature/my-feature"
                    disabled={isSubmitting}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <div className="create-dialog-error">
                      {field.state.meta.errors.join(', ')}
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
                    placeholder="Optional description of this branch..."
                    rows={3}
                    disabled={isSubmitting}
                  />
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
                    {isSubmitting ? 'Creating...' : 'Create Branch'}
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
