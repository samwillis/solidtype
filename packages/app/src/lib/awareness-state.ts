/**
 * Awareness state types for real-time collaboration
 */

/**
 * User awareness state that gets synced via Yjs awareness
 */
export interface UserAwarenessState {
  // User identity
  user: {
    id: string;
    name: string;
    color: string; // Assigned color for cursor/highlights
  };

  // Current location in the app
  location: {
    documentId: string | null;
    branchId: string;
  };

  // Following state - who this user is following (if anyone)
  following?: {
    userId: string;
  };

  // 3D cursor position (world coordinates)
  // Sent to all users so everyone can see each other's cursors
  cursor3D?: {
    position: [number, number, number];
    normal?: [number, number, number]; // Surface normal at cursor position
    visible: boolean; // Whether cursor is over the model
  };

  // 2D cursor position (normalized screen coordinates 0-1)
  // Used when user is not hovering over the 3D model
  cursor2D?: {
    x: number; // 0-1, left to right
    y: number; // 0-1, top to bottom
    visible: boolean;
  };

  // 3D Viewer state (when in document)
  // Only sent when at least one user is following this user
  viewer?: {
    // Camera position and orientation
    cameraPosition: [number, number, number];
    cameraTarget: [number, number, number];
    cameraUp: [number, number, number];
    zoom: number;
  };

  // Selection state
  selection?: {
    featureIds: string[];
    faceRefs: string[];
    edgeRefs: string[];
  };

  // Sketch state (when in sketch mode)
  sketch?: {
    sketchId: string;
    cursorPosition: [number, number]; // 2D sketch coordinates
    activeToolId: string | null;
  };

  // Timestamp for staleness detection
  lastUpdated: number;
}

// Re-export generateAvatarColor as generateUserColor for backwards compatibility
// Uses the same algorithm as user-avatar.ts to ensure consistent colors
export { generateAvatarColor as generateUserColor } from "./user-avatar";
