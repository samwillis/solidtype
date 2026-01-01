/**
 * Document type definitions for SolidType
 *
 * Re-exports types from the document schema module.
 * This file exists for backward compatibility - prefer importing from document/schema.ts directly.
 */

// Re-export all types from schema
export type {
  DocumentMeta,
  DocumentState,
  SketchPlaneRef,
  SketchPoint,
  SketchLine,
  SketchArc,
  SketchEntity,
  SketchConstraint,
  SketchData,
  OriginFeature,
  DatumPlaneRole,
  DatumPlaneFeature,
  UserPlaneFeature,
  PlaneFeature,
  SketchFeature,
  ExtrudeExtent,
  ExtrudeDirection,
  MergeScope,
  ExtrudeFeature,
  RevolveFeature,
  BooleanOperation,
  BooleanFeature,
  Feature,
  DocSnapshot,
} from "../document/schema";

// Re-export NewSketchConstraint from featureHelpers
export type { NewSketchConstraint } from "../document/featureHelpers";

// ============================================================================
// Legacy type aliases for backward compatibility
// ============================================================================

/** Supported unit systems */
export type DocumentUnits = "mm" | "cm" | "m" | "in" | "ft";

/** Feature type discriminator */
export type FeatureType = "origin" | "plane" | "sketch" | "extrude" | "revolve" | "boolean";

// ============================================================================
// Build State Types (transient, not stored in Yjs)
// ============================================================================

export type FeatureStatus = "computed" | "error" | "suppressed" | "gated";

export interface BuildError {
  featureId: string;
  code: "NO_CLOSED_PROFILE" | "SELF_INTERSECTING" | "INVALID_REFERENCE" | "BUILD_ERROR";
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
