/**
 * SolidType awareness provider
 *
 * Wraps Yjs awareness with SolidType-specific state management.
 */

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { DurableStreamsProvider } from "./vendor/y-durable-streams";
import { type UserAwarenessState, generateUserColor } from "./awareness-state";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

export class SolidTypeAwareness {
  private doc: Y.Doc;
  private awareness: Awareness;
  private provider: DurableStreamsProvider | null = null;
  private localState: UserAwarenessState;
  private listeners: Set<(users: UserAwarenessState[]) => void> = new Set();
  private documentId: string;

  constructor(
    doc: Y.Doc,
    documentId: string,
    branchId: string,
    user: { id: string; name: string }
  ) {
    this.doc = doc;
    this.documentId = documentId;
    this.awareness = new Awareness(doc);

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

  async connect() {
    // Create provider with combined doc + awareness streams
    const docStreamUrl = `${API_BASE}/api/docs/${this.documentId}/stream`;
    const awarenessStreamUrl = `${API_BASE}/api/docs/${this.documentId}/awareness`;

    this.provider = new DurableStreamsProvider({
      doc: this.doc,
      documentStream: {
        url: docStreamUrl,
      },
      awarenessStream: {
        url: awarenessStreamUrl,
        protocol: this.awareness,
      },
    });

    // Wait for initial sync
    await new Promise<void>((resolve) => {
      if (this.provider?.synced) {
        resolve();
      } else {
        this.provider?.once("synced", () => resolve());
      }
    });
  }

  disconnect() {
    this.provider?.destroy();
    this.provider = null;
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
   * Get all connected users (excluding self)
   */
  getConnectedUsers(): UserAwarenessState[] {
    const states: UserAwarenessState[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.awareness.clientID && state) {
        states.push(state as UserAwarenessState);
      }
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
