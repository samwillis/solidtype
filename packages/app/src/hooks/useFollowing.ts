/**
 * Hook for following other users in real-time
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { UserAwarenessState } from "../lib/awareness-state";
import type { SolidTypeAwareness } from "../lib/awareness-provider";

interface UseFollowingOptions {
  awareness: SolidTypeAwareness | null;
  onCameraChange?: (camera: NonNullable<UserAwarenessState["viewer"]>) => void;
}

export function useFollowing({ awareness, onCameraChange }: UseFollowingOptions) {
  const [connectedUsers, setConnectedUsers] = useState<UserAwarenessState[]>([]);
  const [followers, setFollowers] = useState<UserAwarenessState[]>([]);
  // Read followingUserId from awareness local state so all components share it
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);

  // Track if we should ignore camera changes (when we initiated them)
  const ignoreCameraChangeRef = useRef(false);

  // Update connected users list and track local following state
  useEffect(() => {
    if (!awareness) {
      setConnectedUsers([]);
      setFollowingUserId(null);
      return;
    }

    const updateUsers = (_users: UserAwarenessState[]) => {
      const users = awareness.getConnectedUsers();
      setConnectedUsers(users);
      // Also read our local following state
      const localState = awareness.getLocalState();
      const newFollowingId = localState?.following?.userId ?? null;
      setFollowingUserId(newFollowingId);
    };

    // Initial update
    setConnectedUsers(awareness.getConnectedUsers());
    const localState = awareness.getLocalState();
    setFollowingUserId(localState?.following?.userId ?? null);

    // Subscribe to changes
    const unsubscribe = awareness.onUsersChange(updateUsers);
    return unsubscribe;
  }, [awareness]);

  // Update followers list
  useEffect(() => {
    if (!awareness) {
      setFollowers([]);
      return;
    }

    const updateFollowers = (newFollowers: UserAwarenessState[]) => {
      setFollowers(newFollowers);
    };

    // Initial update
    setFollowers(awareness.getFollowers());

    // Subscribe to changes
    const unsubscribe = awareness.onFollowersChange(updateFollowers);
    return unsubscribe;
  }, [awareness]);

  // Follow a user - broadcasts to awareness
  const followUser = useCallback(
    (userId: string) => {
      awareness?.startFollowing(userId);
      // Update local state immediately for instant UI response
      setFollowingUserId(userId);
    },
    [awareness]
  );

  // Stop following - broadcasts to awareness
  const stopFollowing = useCallback(() => {
    awareness?.stopFollowing();
    // Update local state immediately for instant UI response
    setFollowingUserId(null);
  }, [awareness]);

  // Apply followed user's camera state
  useEffect(() => {
    if (!followingUserId || !onCameraChange) return;

    const followedUser = connectedUsers.find((u) => u.user.id === followingUserId);
    if (!followedUser?.viewer) return;

    // Mark that we're applying a camera change from following
    ignoreCameraChangeRef.current = true;
    onCameraChange(followedUser.viewer);

    // Reset after a short delay to allow the camera update to complete
    setTimeout(() => {
      ignoreCameraChangeRef.current = false;
    }, 100);
  }, [followingUserId, connectedUsers, onCameraChange]);

  // Check if followed user left
  useEffect(() => {
    if (!followingUserId) return;

    const followedUser = connectedUsers.find((u) => u.user.id === followingUserId);
    if (!followedUser) {
      // User left, stop following
      awareness?.stopFollowing();
    }
  }, [followingUserId, connectedUsers, awareness]);

  // Clean up following state on unmount
  useEffect(() => {
    return () => {
      awareness?.stopFollowing();
    };
  }, [awareness]);

  return {
    connectedUsers,
    followers,
    followingUserId,
    followUser,
    stopFollowing,
    isFollowing: followingUserId !== null,
    hasFollowers: followers.length > 0,
    // Helper to check if camera change should be ignored (for avoiding feedback loops)
    shouldIgnoreCameraChange: () => ignoreCameraChangeRef.current,
  };
}
