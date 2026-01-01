/**
 * Workspace Settings Dialog
 * 
 * Allows workspace admins to manage workspace settings
 */

import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import './CreateDialog.css';
import './WorkspaceSettingsDialog.css';

interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
}

export const WorkspaceSettingsDialog: React.FC<WorkspaceSettingsDialogProps> = ({
  open,
  onOpenChange,
  workspaceId,
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup workspace-settings-dialog">
          <Dialog.Title className="create-dialog-title">
            Workspace Settings
          </Dialog.Title>
          
          <div className="workspace-settings-dialog-content">
            <p className="workspace-settings-coming-soon">
              Workspace settings coming soon
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
