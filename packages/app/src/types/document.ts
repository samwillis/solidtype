/**
 * Document type definitions for SolidType
 * 
 * These types define the structure of features stored in the Yjs document.
 */

// ============================================================================
// Feature Base
// ============================================================================

export interface FeatureBase {
  id: string;
  name?: string;
  suppressed?: boolean;
}

// ============================================================================
// Datum Features
// ============================================================================

export interface OriginFeature extends FeatureBase {
  type: 'origin';
  /** Whether the origin is visible in the 3D view */
  visible?: boolean;
}

export interface PlaneFeature extends FeatureBase {
  type: 'plane';
  normal: [number, number, number];
  origin: [number, number, number];
  xDir: [number, number, number];
  /** Whether the plane is visible in the 3D view (default: true) */
  visible?: boolean;
  /** Width of the plane visual in document units (default: 100) */
  width?: number;
  /** Height of the plane visual in document units (default: 100) */
  height?: number;
  /** Offset of plane center along X direction */
  offsetX?: number;
  /** Offset of plane center along Y direction (plane local Y, not world Y) */
  offsetY?: number;
  /** Custom color for the plane (hex string like "#ff0000", or null for default) */
  color?: string;
}

// ============================================================================
// Sketch Types
// ============================================================================

export interface SketchPoint {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
  attachedTo?: string; // For Phase 16
}

export interface SketchLine {
  id: string;
  type: 'line';
  start: string; // Point ID
  end: string;   // Point ID
}

export interface SketchArc {
  id: string;
  type: 'arc';
  start: string;
  end: string;
  center: string;
  ccw: boolean;
}

export type SketchEntity = SketchLine | SketchArc;

export type SketchConstraint =
  | { id: string; type: 'horizontal'; points: [string, string] }
  | { id: string; type: 'vertical'; points: [string, string] }
  | { id: string; type: 'coincident'; points: [string, string] }
  | { id: string; type: 'fixed'; point: string }
  | { id: string; type: 'distance'; points: [string, string]; value: number }
  | { id: string; type: 'angle'; lines: [string, string]; value: number };

/**
 * A sketch constraint payload for creation (no `id` yet).
 *
 * Note: `Omit<SketchConstraint, "id">` does NOT distribute over unions, so we
 * use a distributive conditional type here.
 */
type WithoutId<T> = T extends any ? Omit<T, 'id'> : never;
export type NewSketchConstraint = WithoutId<SketchConstraint>;

export interface SketchData {
  points: SketchPoint[];
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

export interface SketchFeature extends FeatureBase {
  type: 'sketch';
  /** 
   * Reference to sketch plane. Can be:
   * - Datum plane ID: "xy", "xz", "yz"
   * - Face reference: "face:{featureId}:{selector}" (Phase 15)
   */
  plane: string;
  data?: SketchData;
  /** Whether the sketch is visible in the 3D view when not being edited (default: false) */
  visible?: boolean;
}

// ============================================================================
// Modeling Features
// ============================================================================

/** Extent type for extrude operations (Phase 14) */
export type ExtrudeExtent = 'blind' | 'toFace' | 'toVertex' | 'throughAll';

export interface ExtrudeFeature extends FeatureBase {
  type: 'extrude';
  sketch: string;
  op: 'add' | 'cut';
  direction: 'normal' | 'reverse' | [number, number, number];
  
  /** Extent type - how far to extrude (Phase 14) */
  extent?: ExtrudeExtent;
  /** Distance for 'blind' extent (default) */
  distance?: number;
  /** Persistent reference to target face or vertex for 'toFace' or 'toVertex' extent */
  extentRef?: string;
}

export interface RevolveFeature extends FeatureBase {
  type: 'revolve';
  sketch: string;
  /** Line entity id within the sketch used as the revolution axis */
  axis: string;
  angle: number;
  op: 'add' | 'cut';
}

// ============================================================================
// Union Type
// ============================================================================

export type Feature =
  | OriginFeature
  | PlaneFeature
  | SketchFeature
  | ExtrudeFeature
  | RevolveFeature;

export type FeatureType = Feature['type'];

// ============================================================================
// Document State Types
// ============================================================================

/** Supported unit systems */
export type DocumentUnits = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface DocumentMeta {
  name: string;
  created: number;
  modified: number;
  version: number;
  units: DocumentUnits;
}

export interface DocumentState {
  rebuildGate: string | null;
}

/**
 * ID counters for generating unique IDs
 */
export interface IdCounters {
  [prefix: string]: number;
}

// ============================================================================
// Build State Types (transient, not stored in Yjs)
// ============================================================================

export type FeatureStatus = 'computed' | 'error' | 'suppressed' | 'gated';

export interface BuildError {
  featureId: string;
  code: 'NO_CLOSED_PROFILE' | 'SELF_INTERSECTING' | 'INVALID_REFERENCE' | 'BUILD_ERROR';
  message: string;
}

export interface RebuildResult {
  bodies: BodyInfo[];
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
}

export interface BodyInfo {
  id: string;
  featureId: string;
  faceCount: number;
}
