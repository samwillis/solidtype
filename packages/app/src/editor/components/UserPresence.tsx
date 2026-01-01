/**
 * User presence indicators - shows connected users and allows following
 */

import { useFollowing } from "../../hooks/useFollowing";
import type { SolidTypeAwareness } from "../../lib/awareness-provider";
import type { UserAwarenessState } from "../../lib/awareness-state";
import { Avatar } from "../../components/Avatar";
import "./UserPresence.css";

interface UserPresenceProps {
  awareness: SolidTypeAwareness | null;
  onCameraChange?: (camera: NonNullable<UserAwarenessState["viewer"]>) => void;
}

export function UserPresence({ awareness, onCameraChange }: UserPresenceProps) {
  const { connectedUsers, followers, followingUserId, followUser, stopFollowing } = useFollowing({
    awareness,
    onCameraChange,
  });

  if (connectedUsers.length === 0 && followers.length === 0) {
    return null;
  }

  return (
    <div className="user-presence">
      {/* Show followers indicator if someone is following us */}
      {followers.length > 0 && (
        <div className="user-presence-followers" title={getFollowersTooltip(followers)}>
          <EyeIcon />
          <span className="followers-count">{followers.length}</span>
        </div>
      )}

      {/* Show connected users */}
      {connectedUsers.map((userState) => {
        const isFollowing = followingUserId === userState.user.id;
        const isFollowingUs = followers.some((f) => f.user.id === userState.user.id);

        return (
          <div
            key={userState.user.id}
            className={`user-presence-item ${isFollowing ? "following" : ""} ${isFollowingUs ? "following-us" : ""}`}
          >
            <Avatar
              user={{
                id: userState.user.id,
                name: userState.user.name,
                color: userState.user.color,
              }}
              size={32}
              highlighted={isFollowing}
              highlightColor={userState.user.color}
              onClick={() => (isFollowing ? stopFollowing() : followUser(userState.user.id))}
              title={getUserTooltip(userState, isFollowing, isFollowingUs)}
            />
            {isFollowing && (
              <span className="following-indicator">
                <EyeIcon />
              </span>
            )}
            {isFollowingUs && !isFollowing && (
              <span className="following-us-indicator">
                <EyeIcon />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getUserTooltip(
  userState: UserAwarenessState,
  isFollowing: boolean,
  isFollowingUs: boolean
): string {
  let tooltip = userState.user.name;
  if (isFollowing) tooltip += " (you are following)";
  if (isFollowingUs) tooltip += " (following you)";
  return tooltip;
}

function getFollowersTooltip(followers: UserAwarenessState[]): string {
  if (followers.length === 1) {
    return `${followers[0].user.name} is following you`;
  }
  const names = followers.map((f) => f.user.name);
  if (followers.length === 2) {
    return `${names.join(" and ")} are following you`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are following you`;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
      <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
      <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
    </svg>
  );
}
