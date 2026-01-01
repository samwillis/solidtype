/**
 * User Presence Component
 *
 * Displays avatars of connected users in a document.
 * Allows clicking on a user to follow their view.
 */

import React from "react";
import { Tooltip } from "@base-ui/react";
import type { UserAwarenessState } from "../lib/awareness-state";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { Avatar } from "./Avatar";
import "./UserPresence.css";

interface UserPresenceProps {
  /** Connected users (excluding self) */
  connectedUsers: UserAwarenessState[];
  /** Currently following user ID */
  followingUserId: string | null;
  /** Callback to start following a user */
  onFollowUser: (userId: string) => void;
  /** Callback to stop following */
  onStopFollowing: () => void;
  /** Optional max avatars to show before "+N more" */
  maxAvatars?: number;
}

export const UserPresence: React.FC<UserPresenceProps> = ({
  connectedUsers,
  followingUserId,
  onFollowUser,
  onStopFollowing,
  maxAvatars = 5,
}) => {
  if (connectedUsers.length === 0) {
    return null;
  }

  const visibleUsers = connectedUsers.slice(0, maxAvatars);
  const hiddenCount = connectedUsers.length - maxAvatars;

  const handleClick = (userId: string) => {
    if (followingUserId === userId) {
      onStopFollowing();
    } else {
      onFollowUser(userId);
    }
  };

  return (
    <div className="user-presence">
      <Tooltip.Provider>
        {visibleUsers.map((userState) => {
          const isFollowing = followingUserId === userState.user.id;

          return (
            <Tooltip.Root key={userState.user.id}>
              <Tooltip.Trigger
                className={`user-presence-avatar-wrapper ${isFollowing ? "following" : ""}`}
                onClick={() => handleClick(userState.user.id)}
                render={
                  <button aria-label={`${userState.user.name}${isFollowing ? " (following)" : ""}`} />
                }
              >
                <Avatar
                  user={{
                    id: userState.user.id,
                    name: userState.user.name,
                    color: userState.user.color,
                  }}
                  size={32}
                  highlighted={isFollowing}
                  highlightColor="var(--color-primary)"
                />
                {isFollowing && (
                  <span className="user-presence-following-indicator">
                    <LuEye size={10} />
                  </span>
                )}
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="bottom" sideOffset={6}>
                  <Tooltip.Popup className="user-presence-tooltip">
                    <div className="user-presence-tooltip-name">{userState.user.name}</div>
                    <div className="user-presence-tooltip-action">
                      {isFollowing ? (
                        <>
                          <LuEyeOff size={12} />
                          <span>Click to stop following</span>
                        </>
                      ) : (
                        <>
                          <LuEye size={12} />
                          <span>Click to follow</span>
                        </>
                      )}
                    </div>
                    {userState.sketch && (
                      <div className="user-presence-tooltip-status">Editing sketch</div>
                    )}
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}

        {hiddenCount > 0 && (
          <Tooltip.Root>
            <Tooltip.Trigger
              className="user-presence-avatar user-presence-more"
              render={<button aria-label={`${hiddenCount} more users`} />}
            >
              <span className="user-presence-avatar-initials">+{hiddenCount}</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="user-presence-tooltip">
                  {connectedUsers.slice(maxAvatars).map((user) => (
                    <div key={user.user.id} className="user-presence-tooltip-user">
                      <span
                        className="user-presence-tooltip-dot"
                        style={{ backgroundColor: user.user.color }}
                      />
                      {user.user.name}
                    </div>
                  ))}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        )}
      </Tooltip.Provider>
    </div>
  );
};
