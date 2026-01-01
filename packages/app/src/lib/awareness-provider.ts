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
  private userId: string;

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
   */
  updateViewerState(viewer: UserAwarenessState["viewer"]) {
    this.localState = {
      ...this.localState,
      viewer,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
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
   * Get all connected users (excluding self by user ID, deduplicated)
   *
   * Each browser tab has a unique clientId, but the same user may have
   * multiple tabs open. We filter by user.id and deduplicate.
   */
  getConnectedUsers(): UserAwarenessState[] {
    const seenUserIds = new Set<string>();
    const states: UserAwarenessState[] = [];

    // Add our own user ID to the "seen" set so we exclude ourselves
    seenUserIds.add(this.userId);

    this.awareness.getStates().forEach((state) => {
      if (!state) return;

      const userState = state as UserAwarenessState;
      const stateUserId = userState.user?.id;

      // Skip if no user ID or if we've already seen this user
      if (!stateUserId || seenUserIds.has(stateUserId)) {
        return;
      }

      seenUserIds.add(stateUserId);
      states.push(userState);
    });

    return states;
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
