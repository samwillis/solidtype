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
    color: string;  // Assigned color for cursor/highlights
  };
  
  // Current location in the app
  location: {
    documentId: string | null;
    branchId: string;
  };
  
  // 3D Viewer state (when in document)
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
    cursorPosition: [number, number];  // 2D sketch coordinates
    activeToolId: string | null;
  };
  
  // Timestamp for staleness detection
  lastUpdated: number;
}

/**
 * Generate a consistent color for a user based on their ID
 */
export function generateUserColor(userId: string): string {
  // Hash the user ID to get a consistent hue
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use the hash to generate a hue (0-360)
  const hue = Math.abs(hash) % 360;
  
  // Return a saturated, bright color
  return `hsl(${hue}, 70%, 60%)`;
}
