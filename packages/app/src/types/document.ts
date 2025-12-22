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
  /** External attachment reference (Phase 16)
   * - Edge: "edge:{featureId}:{edgeIndex}"
   * - Vertex: "vertex:{featureId}:{vertexIndex}"
   */
  attachedTo?: string;
  /** Parameter on edge (0-1) for edge attachments */
  param?: number;
  /** True if attachment reference is broken (e.g., edge was deleted) */
  attachmentBroken?: boolean;
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
  | { id: string; type: 'distance'; points: [string, string]; value: number; offsetX?: number; offsetY?: number }
  | { id: string; type: 'angle'; lines: [string, string]; value: number; offsetX?: number; offsetY?: number }
  // Advanced constraints (Phase 19)
  | { id: string; type: 'parallel'; lines: [string, string] }
  | { id: string; type: 'perpendicular'; lines: [string, string] }
  | { id: string; type: 'equalLength'; lines: [string, string] }
  | { id: string; type: 'tangent'; line: string; arc: string; connectionPoint: string }
  | { id: string; type: 'symmetric'; points: [string, string]; axis: string };

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

/** 
 * Merge scope for add operations - SolidWorks-like multi-body support
 * - 'auto': Merge with any body the new geometry interacts with
 * - 'new': Create a new separate body
 * - 'specific': Merge with specifically selected bodies
 */
export type MergeScope = 'auto' | 'new' | 'specific';

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
  
  /** Merge scope for 'add' operations (default: 'auto') */
  mergeScope?: MergeScope;
  /** Body IDs to merge with when mergeScope is 'specific' */
  targetBodies?: string[];
  /** Name for the resulting body (used when creating new body or first extrude) */
  resultBodyName?: string;
  /** Color for the resulting body (hex string like "#ff0000") */
  resultBodyColor?: string;
}

export interface RevolveFeature extends FeatureBase {
  type: 'revolve';
  sketch: string;
  /** Line entity id within the sketch used as the revolution axis */
  axis: string;
  angle: number;
  op: 'add' | 'cut';
  
  /** Merge scope for 'add' operations (default: 'auto') */
  mergeScope?: MergeScope;
  /** Body IDs to merge with when mergeScope is 'specific' */
  targetBodies?: string[];
  /** Name for the resulting body (used when creating new body or first revolve) */
  resultBodyName?: string;
  /** Color for the resulting body (hex string like "#ff0000") */
  resultBodyColor?: string;
}

/** Boolean operation type (Phase 17) */
export type BooleanOperation = 'union' | 'subtract' | 'intersect';

export interface BooleanFeature extends FeatureBase {
  type: 'boolean';
  /** Boolean operation type */
  operation: BooleanOperation;
  /** Feature ID of the target body (the one that gets modified) */
  target: string;
  /** Feature ID of the tool body (consumed in the operation) */
  tool: string;
}

// ============================================================================
// Union Type
// ============================================================================

export type Feature =
  | OriginFeature
  | PlaneFeature
  | SketchFeature
  | ExtrudeFeature
  | RevolveFeature
  | BooleanFeature;

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
  /** Display name for the body */
  name?: string;
  /** Display color for the body (hex string like "#ff0000") */
  color?: string;
}
