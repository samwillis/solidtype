/**
 * Hook for following other users in real-time
 */

import { useState, useEffect, useCallback } from "react";
import type { UserAwarenessState } from "../lib/awareness-state";
import type { SolidTypeAwareness } from "../lib/awareness-provider";

interface UseFollowingOptions {
  awareness: SolidTypeAwareness | null;
  onCameraChange?: (camera: NonNullable<UserAwarenessState["viewer"]>) => void;
}

export function useFollowing({ awareness, onCameraChange }: UseFollowingOptions) {
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<UserAwarenessState[]>([]);

  // Update connected users list
  useEffect(() => {
    if (!awareness) {
      setConnectedUsers([]);
      return;
    }

    const updateUsers = (users: UserAwarenessState[]) => {
      setConnectedUsers(users);
    };

    // Initial update
    setConnectedUsers(awareness.getConnectedUsers());

    // Subscribe to changes
    const unsubscribe = awareness.onUsersChange(updateUsers);
    return unsubscribe;
  }, [awareness]);

  // Follow a user
  const followUser = useCallback((userId: string) => {
    setFollowingUserId(userId);
  }, []);

  const stopFollowing = useCallback(() => {
    setFollowingUserId(null);
  }, []);

  // Apply followed user's camera state
  useEffect(() => {
    if (!followingUserId || !onCameraChange) return;

    const followedUser = connectedUsers.find((u) => u.user.id === followingUserId);
    if (!followedUser?.viewer) return;

    onCameraChange(followedUser.viewer);
  }, [followingUserId, connectedUsers, onCameraChange]);

  // Check if followed user left
  useEffect(() => {
    if (!followingUserId) return;

    const followedUser = connectedUsers.find((u) => u.user.id === followingUserId);
    if (!followedUser) {
      // User left, stop following
      setFollowingUserId(null);
    }
  }, [followingUserId, connectedUsers]);

  return {
    connectedUsers,
    followingUserId,
    followUser,
    stopFollowing,
    isFollowing: followingUserId !== null,
  };
}
