/**
 * Create Folder Dialog
 * 
 * Dialog for creating a new folder using TanStack Form and Base UI Dialog.
 * Context-aware: can pre-select project, branch, and parent folder.
 */

import React, { useState, useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { Dialog } from '@base-ui/react/dialog';
import { Select } from '@base-ui/react/select';
import { LuChevronDown } from 'react-icons/lu';
import { useSession } from '../../lib/auth-client';
import { createFolderMutation, getBranchesForProject, getFoldersForBranch } from '../../lib/server-functions';
import { useLiveQuery } from '@tanstack/react-db';
import { projectsCollection, branchesCollection } from '../../lib/electric-collections';
import { z } from 'zod';
import './CreateDialog.css';

const folderSchema = z.object({
  projectId: z.string().uuid('Project is required'),
  branchId: z.string().uuid('Branch is required'),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
});

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedProjectId?: string;
  preselectedBranchId?: string;
  preselectedParentFolderId?: string | null;
  onSuccess?: () => void;
}

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  open,
  onOpenChange,
  preselectedProjectId,
  preselectedBranchId,
  preselectedParentFolderId,
  onSuccess,
}) => {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableBranches, setAvailableBranches] = useState<any[]>([]);
  const [availableFolders, setAvailableFolders] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  
  // Get available projects
  const { data: projects } = useLiveQuery(() => projectsCollection);
  
  // Get all branches (will filter by project in form)
  const { data: allBranches } = useLiveQuery(() => branchesCollection);

  const form = useForm({
    defaultValues: {
      projectId: preselectedProjectId || '',
      branchId: preselectedBranchId || '',
      parentId: preselectedParentFolderId !== undefined ? preselectedParentFolderId : null,
      name: '',
    },
    onSubmit: async ({ value }) => {
      if (!session?.user?.id) {
        console.error('User not authenticated');
        return;
      }

      setIsSubmitting(true);
      try {
        await createFolderMutation({
          data: {
            folder: {
              projectId: value.projectId,
              branchId: value.branchId,
              parentId: value.parentId || null,
              name: value.name,
              sortOrder: 0,
              createdBy: session.user.id,
            },
          },
        });

        form.reset();
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        console.error('Failed to create folder:', error);
        // TODO: Show error toast/message
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Load branches when project changes
  useEffect(() => {
    const projectId = form.state.values.projectId;
    if (!projectId || projectId === preselectedProjectId) return;

    setLoadingBranches(true);
    getBranchesForProject({ data: { projectId } })
      .then((result) => {
        setAvailableBranches(result.data || []);
      })
      .catch((error) => {
        console.error('Failed to load branches:', error);
        setAvailableBranches([]);
      })
      .finally(() => {
        setLoadingBranches(false);
      });
  }, [form.state.values.projectId, preselectedProjectId]);

  // Also use branches from collection filtered by project
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

  // Load folders when branch changes
  useEffect(() => {
    const projectId = form.state.values.projectId;
    const branchId = form.state.values.branchId;
    if (!projectId || !branchId) {
      setAvailableFolders([]);
      return;
    }

    setLoadingFolders(true);
    getFoldersForBranch({ data: { projectId, branchId } })
      .then((result) => {
        setAvailableFolders(result.data || []);
      })
      .catch((error) => {
        console.error('Failed to load folders:', error);
        setAvailableFolders([]);
      })
      .finally(() => {
        setLoadingFolders(false);
      });
  }, [form.state.values.projectId, form.state.values.branchId]);

  // Reset branch and folder when project changes (unless preselected)
  useEffect(() => {
    if (form.state.values.projectId && form.state.values.projectId !== preselectedProjectId) {
      if (!preselectedBranchId) {
        form.setFieldValue('branchId', '');
      }
      form.setFieldValue('parentId', null);
    }
  }, [form.state.values.projectId, preselectedProjectId, preselectedBranchId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup">
            <Dialog.Title className="create-dialog-title">Create Folder</Dialog.Title>
            <Dialog.Description className="create-dialog-description">
              Create a new folder to organize documents.
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
                      const result = folderSchema.shape.projectId.safeParse(value);
                      return result.success ? undefined : result.error.errors[0]?.message;
                    },
                  }}
                  children={(field) => (
                    <div className="create-dialog-field">
                      <label htmlFor={field.name} className="create-dialog-label">
                        Project <span className="create-dialog-required">*</span>
                      </label>
                      <Select.Root
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value || '')}
                        disabled={isSubmitting}
                      >
                        <Select.Trigger
                          id={field.name}
                          className="create-dialog-select-trigger"
                          aria-label="Select project"
                        >
                          {projects?.find((p) => p.id === field.state.value)?.name || 'Select project...'}
                          <LuChevronDown size={12} />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Positioner>
                            <Select.Popup className="create-dialog-select-popup">
                              {projects?.map((project) => (
                                <Select.Item
                                  key={project.id}
                                  value={project.id}
                                  className="create-dialog-select-option"
                                >
                                  {project.name}
                                </Select.Item>
                              ))}
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
              )}

              {preselectedProjectId && (
                <form.Field
                  name="projectId"
                  children={(field) => (
                    <div className="create-dialog-field">
                      <label className="create-dialog-label">Project</label>
                      <input
                        type="text"
                        value={projects?.find((p) => p.id === preselectedProjectId)?.name || ''}
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
                        return 'Select a project first';
                      }
                      const result = folderSchema.shape.branchId.safeParse(value);
                      return result.success ? undefined : result.error.errors[0]?.message;
                    },
                  }}
                  children={(field) => (
                    <div className="create-dialog-field">
                      <label htmlFor={field.name} className="create-dialog-label">
                        Branch <span className="create-dialog-required">*</span>
                      </label>
                      <Select.Root
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value || '')}
                        disabled={isSubmitting || !form.state.values.projectId || loadingBranches}
                      >
                        <Select.Trigger
                          id={field.name}
                          className="create-dialog-select-trigger"
                          aria-label="Select branch"
                        >
                          {loadingBranches
                            ? 'Loading branches...'
                            : availableBranches.find((b) => b.id === field.state.value)?.name || 'Select branch...'}
                          <LuChevronDown size={12} />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Positioner>
                            <Select.Popup className="create-dialog-select-popup">
                              {availableBranches.map((branch) => (
                                <Select.Item
                                  key={branch.id}
                                  value={branch.id}
                                  className="create-dialog-select-option"
                                >
                                  {branch.name} {branch.is_main ? '(main)' : ''}
                                </Select.Item>
                              ))}
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
              )}

              {preselectedBranchId && (
                <form.Field
                  name="branchId"
                  children={(field) => (
                    <div className="create-dialog-field">
                      <label className="create-dialog-label">Branch</label>
                      <input
                        type="text"
                        value={availableBranches.find((b) => b.id === preselectedBranchId)?.name || allBranches?.find((b) => b.id === preselectedBranchId)?.name || 'Loading...'}
                        className="create-dialog-input"
                        disabled
                      />
                      <input type="hidden" value={preselectedBranchId} />
                    </div>
                  )}
                />
              )}

              <form.Field
                name="parentId"
                validators={{
                  onChange: ({ value }) => {
                    // Parent folder is optional
                    return undefined;
                  },
                }}
                children={(field) => (
                  <div className="create-dialog-field">
                    <label htmlFor={field.name} className="create-dialog-label">
                      Parent Folder
                    </label>
                    <Select.Root
                      value={field.state.value || ''}
                      onValueChange={(value) => field.handleChange(value === '' ? null : value || null)}
                      disabled={isSubmitting || !form.state.values.branchId || loadingFolders}
                    >
                      <Select.Trigger
                        id={field.name}
                        className="create-dialog-select-trigger"
                        aria-label="Select parent folder (optional)"
                      >
                        {loadingFolders
                          ? 'Loading folders...'
                          : field.state.value === null || field.state.value === ''
                            ? 'Root (no parent)'
                            : availableFolders.find((f) => f.id === field.state.value)?.name || 'Select folder...'}
                        <LuChevronDown size={12} />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner className="create-dialog-select-positioner">
                          <Select.Popup className="create-dialog-select-popup">
                            <Select.Item
                              value=""
                              className="create-dialog-select-option"
                            >
                              Root (no parent)
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

              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) => {
                    const result = folderSchema.shape.name.safeParse(value);
                    return result.success ? undefined : result.error.errors[0]?.message;
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
                      placeholder="My Folder"
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
                      {isSubmitting ? 'Creating...' : 'Create Folder'}
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
