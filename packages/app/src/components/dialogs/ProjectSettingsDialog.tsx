/**
 * Project Settings Dialog
 * 
 * Allows project admins to manage project settings, members, and delete the project
 */

import React, { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useSession } from '../../lib/auth-client';
import { deleteProjectMutation } from '../../lib/server-functions';
import { useNavigate } from '@tanstack/react-router';
import { LuTrash2, LuUserPlus } from 'react-icons/lu';
import './CreateDialog.css';
import './ProjectSettingsDialog.css';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // TODO: Load project members when collection is available
  // For now, assume user is admin if they're logged in
  const currentUserId = session?.user?.id;
  const isAdmin = !!currentUserId; // Simplified for now
  
  const handleDeleteProject = async () => {
    if (!projectId || !currentUserId) return;
    
    setIsDeleting(true);
    try {
      await deleteProjectMutation({ projectId });
      // Navigate to dashboard after deletion
      navigate({ to: '/dashboard' });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };
  
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup project-settings-dialog">
          <Dialog.Title className="create-dialog-title">
            Project Settings
          </Dialog.Title>
          
          <div className="project-settings-dialog-content">
            {/* Members Section */}
            <div className="project-settings-section">
              <h3 className="project-settings-section-title">Members</h3>
              <div className="project-settings-members-list">
                <p className="project-settings-empty">Member management coming soon</p>
              </div>
              {isAdmin && (
                <button className="project-settings-button project-settings-button-secondary" disabled>
                  <LuUserPlus size={16} />
                  <span>Add Member</span>
                </button>
              )}
            </div>
            
            {/* Danger Zone */}
            {isAdmin && (
              <div className="project-settings-section project-settings-danger-zone">
                <h3 className="project-settings-section-title">Danger Zone</h3>
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
                      Are you sure you want to delete this project? This action cannot be undone.
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
                        {isDeleting ? 'Deleting...' : 'Delete Project'}
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
