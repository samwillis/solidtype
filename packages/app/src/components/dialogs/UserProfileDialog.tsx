/**
 * User Profile Dialog
 * 
 * Displays user profile information and settings
 */

import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useSession, signOut } from '../../lib/auth-client';
import { generateAvatarColor, getInitials } from '../../lib/user-avatar';
import './CreateDialog.css';
import './UserProfileDialog.css';

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const UserProfileDialog: React.FC<UserProfileDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { data: session } = useSession();
  
  if (!session?.user) {
    return null;
  }
  
  const user = session.user;
  const initials = getInitials(user.name, user.email);
  const avatarColor = generateAvatarColor(user.email || user.id);
  
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="create-dialog-backdrop" />
        <Dialog.Popup className="create-dialog-popup user-profile-dialog">
          <Dialog.Title className="create-dialog-title">
            Profile
          </Dialog.Title>
          
          <div className="user-profile-dialog-content">
            <div className="user-profile-header">
              <div
                className="user-profile-avatar-large"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div className="user-profile-info">
                <h3 className="user-profile-name">{user.name || 'User'}</h3>
                <p className="user-profile-email">{user.email}</p>
              </div>
            </div>
            
            <div className="user-profile-actions">
              <button
                className="user-profile-button user-profile-button-danger"
                onClick={async () => {
                  await signOut();
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
