/**
 * Delete Confirmation Dialog
 * 
 * Dialog for confirming deletion of documents or folders
 */

import React, { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { LuTrash2, LuCircleAlert } from 'react-icons/lu';
import './CreateDialog.css';
import './DeleteConfirmDialog.css';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: 'document' | 'folder';
  itemName: string;
  onConfirm: () => Promise<void>;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  onOpenChange,
  itemType,
  itemName,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to delete:', error);
      // Error is already handled in the parent component
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup delete-confirm-dialog">
          <Dialog.Title className="create-dialog-title">
            Delete {itemType === 'document' ? 'Document' : 'Folder'}
          </Dialog.Title>
          <Dialog.Description className="create-dialog-description">
            Are you sure you want to delete "{itemName}"? This action cannot be undone.
          </Dialog.Description>
          
          <div className="delete-confirm-content">
            <div className="delete-confirm-warning">
              <LuCircleAlert size={20} />
              <span>
                {itemType === 'folder' 
                  ? 'All items in this folder will also be deleted.'
                  : 'This document will be permanently deleted.'}
              </span>
            </div>
            
            <div className="create-dialog-actions">
              <button
                type="button"
                className="create-dialog-button create-dialog-button-cancel"
                onClick={() => onOpenChange(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="create-dialog-button delete-confirm-button-danger"
                onClick={handleConfirm}
                disabled={isDeleting}
              >
                <LuTrash2 size={16} />
                <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
