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
}

export interface PlaneFeature extends FeatureBase {
  type: 'plane';
  normal: [number, number, number];
  origin: [number, number, number];
  xDir: [number, number, number];
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

export interface SketchConstraint {
  id: string;
  type: string;
  // Additional fields based on constraint type
  [key: string]: unknown;
}

export interface SketchData {
  points: SketchPoint[];
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

export interface SketchFeature extends FeatureBase {
  type: 'sketch';
  plane: string; // Reference to plane ID or face ref
  data?: SketchData;
}

// ============================================================================
// Modeling Features
// ============================================================================

export interface ExtrudeFeature extends FeatureBase {
  type: 'extrude';
  sketch: string;
  distance: number;
  op: 'add' | 'cut';
  direction: 'normal' | 'reverse' | [number, number, number];
}

export interface RevolveFeature extends FeatureBase {
  type: 'revolve';
  sketch: string;
  angle: number;
  op: 'add' | 'cut';
  axisStart: [number, number];
  axisEnd: [number, number];
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

export interface DocumentMeta {
  name: string;
  created: number;
  modified: number;
  version: number;
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
