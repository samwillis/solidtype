/**
 * SolidType awareness provider
 *
 * Wraps Yjs awareness with SolidType-specific state management.
 * This is a wrapper around an existing Awareness instance from the document sync provider.
 */

import { Awareness } from "y-protocols/awareness";
import { type UserAwarenessState, generateUserColor } from "./awareness-state";

export class SolidTypeAwareness {
  private awareness: Awareness;
  private localState: UserAwarenessState;
  private listeners: Set<(users: UserAwarenessState[]) => void> = new Set();
  private followersListeners: Set<(followers: UserAwarenessState[]) => void> = new Set();
  private userId: string;

  // Cached state for conditional broadcasting
  private pendingViewerState: UserAwarenessState["viewer"] | undefined;
  private pendingCursor3D: UserAwarenessState["cursor3D"] | undefined;

  /**
   * Create a SolidType awareness wrapper.
   *
   * @param awareness - The Awareness instance from the document sync provider (NOT a new one)
   * @param documentId - The document ID
   * @param branchId - The branch ID
   * @param user - The current user info
   */
  constructor(
    awareness: Awareness,
    documentId: string,
    branchId: string,
    user: { id: string; name: string }
  ) {
    this.awareness = awareness;
    this.userId = user.id;

    // Set initial local state
    this.localState = {
      user: {
        id: user.id,
        name: user.name,
        color: generateUserColor(user.id),
      },
      location: {
        documentId,
        branchId,
      },
      lastUpdated: Date.now(),
    };

    this.awareness.setLocalState(this.localState);

    // Forward awareness changes to listeners
    this.awareness.on("change", () => {
      this.notifyListeners();
      this.notifyFollowersListeners();
      // Check if we need to start/stop broadcasting camera/cursor
      this.updateBroadcastState();
    });
  }

  /**
   * Connect is now a no-op since the awareness is managed by the document sync provider.
   * Kept for API compatibility.
   */
  connect(): void {
    // No-op - the document sync provider handles connection
  }

  /**
   * Disconnect clears local state but doesn't destroy the awareness.
   * The document sync provider manages the actual connection.
   */
  disconnect(): void {
    this.listeners.clear();
  }

  /**
   * Update viewer state (called on camera change)
   * This is cached and only sent when someone is following us
   */
  updateViewerState(viewer: UserAwarenessState["viewer"]) {
    this.pendingViewerState = viewer;

    const followersCount = this.getFollowers().length;

    // Only broadcast if we have followers
    if (followersCount > 0) {
      this.localState = {
        ...this.localState,
        viewer,
        lastUpdated: Date.now(),
      };
      this.awareness.setLocalState(this.localState);
    }
  }

  /**
   * Update selection state
   */
  updateSelection(selection: UserAwarenessState["selection"]) {
    this.localState = {
      ...this.localState,
      selection,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  /**
   * Update sketch cursor
   */
  updateSketchCursor(sketch: UserAwarenessState["sketch"]) {
    this.localState = {
      ...this.localState,
      sketch,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  /**
   * Clear sketch state (when exiting sketch mode)
   */
  clearSketchState() {
    this.localState = {
      ...this.localState,
      sketch: undefined,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  /**
   * Start following a user
   */
  startFollowing(userId: string) {
    this.localState = {
      ...this.localState,
      following: { userId },
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  /**
   * Stop following
   */
  stopFollowing() {
    this.localState = {
      ...this.localState,
      following: undefined,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  /**
   * Update 3D cursor position
   * Always broadcast so all users can see each other's cursors
   */
  updateCursor3D(cursor: UserAwarenessState["cursor3D"]) {
    this.pendingCursor3D = cursor;
    this.localState = {
      ...this.localState,
      cursor3D: cursor,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  /**
   * Update 2D cursor position (screen coordinates, for when not over 3D model)
   * Always broadcast so followers can see cursor position
   */
  updateCursor2D(cursor: UserAwarenessState["cursor2D"]) {
    this.localState = {
      ...this.localState,
      cursor2D: cursor,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  // Track if we previously had followers to detect when we gain them
  private hadFollowers = false;

  /**
   * Check if we have followers and update broadcast state accordingly
   */
  private updateBroadcastState() {
    const followers = this.getFollowers();
    const hasFollowers = followers.length > 0;
    const justGainedFollowers = hasFollowers && !this.hadFollowers;
    this.hadFollowers = hasFollowers;

    if (hasFollowers) {
      // Always broadcast pending state when we have followers
      // This ensures new followers immediately get the camera state
      let needsUpdate = false;

      if (this.pendingViewerState) {
        // Always update viewer state from pending when we have followers
        this.localState.viewer = this.pendingViewerState;
        needsUpdate = true;
      }
      if (this.pendingCursor3D) {
        this.localState.cursor3D = this.pendingCursor3D;
        needsUpdate = true;
      }

      // If we just gained followers, force a broadcast even if nothing changed
      // This ensures the new follower gets our current state immediately
      if (justGainedFollowers) {
        needsUpdate = true;
      }

      if (needsUpdate) {
        this.localState.lastUpdated = Date.now();
        this.awareness.setLocalState(this.localState);
      }
    } else {
      // Stop broadcasting viewer if no followers (but keep cursor for everyone)
      if (this.localState.viewer) {
        this.localState = {
          ...this.localState,
          viewer: undefined,
          lastUpdated: Date.now(),
        };
        this.awareness.setLocalState(this.localState);
      }
    }
  }

  /**
   * Get users who are following the local user
   */
  getFollowers(): UserAwarenessState[] {
    const followers: UserAwarenessState[] = [];

    this.awareness.getStates().forEach((state) => {
      if (!state) return;
      const userState = state as UserAwarenessState;

      // Check if this user is following us
      if (userState.following?.userId === this.userId) {
        followers.push(userState);
      }
    });

    return followers;
  }

  /**
   * Subscribe to followers changes
   */
  onFollowersChange(callback: (followers: UserAwarenessState[]) => void): () => void {
    this.followersListeners.add(callback);
    return () => {
      this.followersListeners.delete(callback);
    };
  }

  private notifyFollowersListeners() {
    const followers = this.getFollowers();
    for (const listener of this.followersListeners) {
      listener(followers);
    }
  }

  /**
   * Get all connected users (excluding self by user ID, deduplicated)
   *
   * Each browser tab has a unique clientId, but the same user may have
   * multiple tabs open (or stale sessions). We filter by user.id and keep
   * the NEWEST entry for each user (by lastUpdated timestamp).
   */
  getConnectedUsers(): UserAwarenessState[] {
    const userStates = new Map<string, UserAwarenessState>();

    this.awareness.getStates().forEach((state) => {
      if (!state) return;

      const userState = state as UserAwarenessState;
      const stateUserId = userState.user?.id;

      // Skip if no user ID or if it's ourselves
      if (!stateUserId || stateUserId === this.userId) {
        return;
      }

      // Keep the newest entry for each user (by lastUpdated)
      const existing = userStates.get(stateUserId);
      if (!existing || (userState.lastUpdated ?? 0) > (existing.lastUpdated ?? 0)) {
        userStates.set(stateUserId, userState);
      }
    });

    return Array.from(userStates.values());
  }

  /**
   * Get the local user's state
   */
  getLocalState(): UserAwarenessState {
    return this.localState;
  }

  /**
   * Subscribe to awareness changes
   */
  onUsersChange(callback: (users: UserAwarenessState[]) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    const users = this.getConnectedUsers();
    for (const listener of this.listeners) {
      listener(users);
    }
  }
}
