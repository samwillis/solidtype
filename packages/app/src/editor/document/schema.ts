/**
 * Document Model - Zod Schemas
 *
 * These schemas define the persisted snapshot contract for the Yjs document.
 * Validation is performed on `root.toJSON()`.
 *
 * See DOCUMENT-MODEL.md for full specification.
 */

import { z } from "zod/v4";

// ============================================================================
// Shared Primitives
// ============================================================================

export const UUID = z.string().uuid();
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const Units = z.enum(["mm", "cm", "m", "in", "ft"]);

// ============================================================================
// Meta & State
// ============================================================================

export const DocumentMetaSchema = z
  .object({
    schemaVersion: z.literal(2),
    name: z.string(),
    created: z.number(),
    modified: z.number(),
    units: Units,
  })
  .strict();

export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;

export const DocumentStateSchema = z
  .object({
    rebuildGate: UUID.nullable(),
  })
  .strict();

export type DocumentState = z.infer<typeof DocumentStateSchema>;

// ============================================================================
// Sketch Plane Reference (discriminated union)
// ============================================================================

export const SketchPlaneRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("planeFeatureId"), ref: UUID }).strict(),
  z.object({ kind: z.literal("faceRef"), ref: z.string() }).strict(),
  z.object({ kind: z.literal("custom"), ref: z.string() }).strict(),
]);

export type SketchPlaneRef = z.infer<typeof SketchPlaneRefSchema>;

// ============================================================================
// Sketch Internals (unordered, UUID ids)
// ============================================================================

export const SketchPointSchema = z
  .object({
    id: UUID,
    x: z.number(),
    y: z.number(),
    fixed: z.boolean().optional(),
    /** External attachment reference (Phase 16) */
    attachedTo: z.string().optional(),
    /** Parameter on edge (0-1) for edge attachments */
    param: z.number().optional(),
  })
  .strict();

export type SketchPoint = z.infer<typeof SketchPointSchema>;

export const SketchLineSchema = z
  .object({
    id: UUID,
    type: z.literal("line"),
    start: UUID,
    end: UUID,
    /** Whether this is construction geometry (for reference only, not part of profile) */
    construction: z.boolean().optional(),
  })
  .strict();

export type SketchLine = z.infer<typeof SketchLineSchema>;

export const SketchArcSchema = z
  .object({
    id: UUID,
    type: z.literal("arc"),
    start: UUID,
    end: UUID,
    center: UUID,
    ccw: z.boolean(),
    /** Whether this is construction geometry (for reference only, not part of profile) */
    construction: z.boolean().optional(),
  })
  .strict();

export type SketchArc = z.infer<typeof SketchArcSchema>;

export const SketchCircleSchema = z
  .object({
    id: UUID,
    type: z.literal("circle"),
    center: UUID,
    /** Radius in sketch units (mm) */
    radius: z.number().positive(),
    /** Whether this is construction geometry (for reference only, not part of profile) */
    construction: z.boolean().optional(),
  })
  .strict();

export type SketchCircle = z.infer<typeof SketchCircleSchema>;

export const SketchEntitySchema = z.discriminatedUnion("type", [
  SketchLineSchema,
  SketchArcSchema,
  SketchCircleSchema,
]);

export type SketchEntity = z.infer<typeof SketchEntitySchema>;

// Constraint schemas
export const HorizontalConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("horizontal"),
    points: z.tuple([UUID, UUID]),
  })
  .strict();

export const VerticalConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("vertical"),
    points: z.tuple([UUID, UUID]),
  })
  .strict();

export const CoincidentConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("coincident"),
    points: z.tuple([UUID, UUID]),
  })
  .strict();

export const FixedConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("fixed"),
    point: UUID,
  })
  .strict();

export const DistanceConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("distance"),
    points: z.tuple([UUID, UUID]),
    value: z.number(),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
  })
  .strict();

export const AngleConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("angle"),
    lines: z.tuple([UUID, UUID]),
    value: z.number(),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
  })
  .strict();

// Advanced constraints (Phase 19)
export const ParallelConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("parallel"),
    lines: z.tuple([UUID, UUID]),
  })
  .strict();

export const PerpendicularConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("perpendicular"),
    lines: z.tuple([UUID, UUID]),
  })
  .strict();

export const EqualLengthConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("equalLength"),
    lines: z.tuple([UUID, UUID]),
  })
  .strict();

export const TangentConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("tangent"),
    line: UUID,
    arc: UUID,
    connectionPoint: z.string(),
  })
  .strict();

export const SymmetricConstraintSchema = z
  .object({
    id: UUID,
    type: z.literal("symmetric"),
    points: z.tuple([UUID, UUID]),
    axis: UUID,
  })
  .strict();

export const SketchConstraintSchema = z.union([
  HorizontalConstraintSchema,
  VerticalConstraintSchema,
  CoincidentConstraintSchema,
  FixedConstraintSchema,
  DistanceConstraintSchema,
  AngleConstraintSchema,
  ParallelConstraintSchema,
  PerpendicularConstraintSchema,
  EqualLengthConstraintSchema,
  TangentConstraintSchema,
  SymmetricConstraintSchema,
]);

export type SketchConstraint = z.infer<typeof SketchConstraintSchema>;

export const SketchDataSchema = z
  .object({
    pointsById: z.record(UUID, SketchPointSchema),
    entitiesById: z.record(UUID, SketchEntitySchema),
    constraintsById: z.record(UUID, SketchConstraintSchema),
  })
  .strict();

export type SketchData = z.infer<typeof SketchDataSchema>;

// ============================================================================
// Feature Base
// ============================================================================

export const FeatureBaseSchema = z
  .object({
    id: UUID,
    type: z.string(),
    name: z.string().optional(),
    suppressed: z.boolean().optional(),
    visible: z.boolean().optional(),
  })
  .strict();

// ============================================================================
// Origin Feature
// ============================================================================

export const OriginFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("origin"),
}).strict();

export type OriginFeature = z.infer<typeof OriginFeatureSchema>;

// ============================================================================
// Plane Definition Types (how a plane is defined/constrained)
// ============================================================================

/** Datum plane - one of the standard XY, XZ, YZ planes */
export const DatumPlaneDefinitionSchema = z
  .object({
    kind: z.literal("datum"),
    role: z.enum(["xy", "xz", "yz"]),
  })
  .strict();

/** Offset from another plane */
export const OffsetPlaneDefinitionSchema = z
  .object({
    kind: z.literal("offsetPlane"),
    /** Reference to the base plane feature ID */
    basePlaneId: z.string(),
    /** Offset distance in mm (positive = along normal, negative = opposite) */
    distance: z.number(),
  })
  .strict();

/** Offset from a face */
export const OffsetFaceDefinitionSchema = z
  .object({
    kind: z.literal("offsetFace"),
    /** Reference to the face (format: "face:featureId:faceIndex") */
    faceRef: z.string(),
    /** Offset distance in mm */
    distance: z.number(),
  })
  .strict();

/** On a face (tangent plane at a point on the face) */
export const OnFaceDefinitionSchema = z
  .object({
    kind: z.literal("onFace"),
    /** Reference to the face */
    faceRef: z.string(),
  })
  .strict();

/** Through three points */
export const ThreePointsDefinitionSchema = z
  .object({
    kind: z.literal("threePoints"),
    /** References to three points (vertex refs, sketch point refs, etc.) */
    point1Ref: z.string(),
    point2Ref: z.string(),
    point3Ref: z.string(),
  })
  .strict();

/** Through an axis and a point */
export const AxisPointDefinitionSchema = z
  .object({
    kind: z.literal("axisPoint"),
    /** Reference to the axis */
    axisRef: z.string(),
    /** Reference to a point */
    pointRef: z.string(),
  })
  .strict();

/** Rotated around an axis from a base plane */
export const AxisAngleDefinitionSchema = z
  .object({
    kind: z.literal("axisAngle"),
    /** Reference to the rotation axis */
    axisRef: z.string(),
    /** Angle in degrees */
    angle: z.number(),
    /** Reference to the base plane to rotate from */
    basePlaneRef: z.string(),
  })
  .strict();

/** Through points in a sketch (minimum 3 points) */
export const SketchPointsDefinitionSchema = z
  .object({
    kind: z.literal("sketchPoints"),
    /** Reference to the sketch feature */
    sketchId: z.string(),
    /** References to point IDs within the sketch (minimum 3) */
    pointIds: z.array(z.string()).min(3),
  })
  .strict();

/** Through a line in a sketch and a point */
export const SketchLinePointDefinitionSchema = z
  .object({
    kind: z.literal("sketchLinePoint"),
    /** Reference to the sketch feature */
    sketchId: z.string(),
    /** Reference to a line ID within the sketch */
    lineId: z.string(),
    /** Reference to a point ID within the sketch */
    pointId: z.string(),
  })
  .strict();

/** Union of all plane definition types */
export const PlaneDefinitionSchema = z.discriminatedUnion("kind", [
  DatumPlaneDefinitionSchema,
  OffsetPlaneDefinitionSchema,
  OffsetFaceDefinitionSchema,
  OnFaceDefinitionSchema,
  ThreePointsDefinitionSchema,
  AxisPointDefinitionSchema,
  AxisAngleDefinitionSchema,
  SketchPointsDefinitionSchema,
  SketchLinePointDefinitionSchema,
]);

export type PlaneDefinition = z.infer<typeof PlaneDefinitionSchema>;
export type DatumPlaneRole = "xy" | "xz" | "yz";

// ============================================================================
// Axis Definition Types (how an axis is defined)
// ============================================================================

/** Datum axis - one of the standard X, Y, Z axes */
export const DatumAxisDefinitionSchema = z
  .object({
    kind: z.literal("datum"),
    role: z.enum(["x", "y", "z"]),
  })
  .strict();

/** Normal to a face at a point */
export const SurfaceNormalDefinitionSchema = z
  .object({
    kind: z.literal("surfaceNormal"),
    /** Reference to the face */
    faceRef: z.string(),
    /** Optional point on the face (if not specified, uses center) */
    pointRef: z.string().optional(),
  })
  .strict();

/** Between two points */
export const TwoPointsAxisDefinitionSchema = z
  .object({
    kind: z.literal("twoPoints"),
    /** Reference to the first point */
    point1Ref: z.string(),
    /** Reference to the second point */
    point2Ref: z.string(),
  })
  .strict();

/** Along a sketch line */
export const SketchLineAxisDefinitionSchema = z
  .object({
    kind: z.literal("sketchLine"),
    /** Reference to the sketch feature */
    sketchId: z.string(),
    /** Reference to a line ID within the sketch */
    lineId: z.string(),
  })
  .strict();

/** Along an edge */
export const EdgeAxisDefinitionSchema = z
  .object({
    kind: z.literal("edge"),
    /** Reference to the edge (format: "edge:featureId:edgeIndex") */
    edgeRef: z.string(),
  })
  .strict();

/** Union of all axis definition types */
export const AxisDefinitionSchema = z.discriminatedUnion("kind", [
  DatumAxisDefinitionSchema,
  SurfaceNormalDefinitionSchema,
  TwoPointsAxisDefinitionSchema,
  SketchLineAxisDefinitionSchema,
  EdgeAxisDefinitionSchema,
]);

export type AxisDefinition = z.infer<typeof AxisDefinitionSchema>;
export type DatumAxisRole = "x" | "y" | "z";

// ============================================================================
// Plane Features
// ============================================================================

/** Display properties for planes (how they appear in the viewer) */
const PlaneDisplayFields = {
  width: z.number().optional(),
  height: z.number().optional(),
  /** Display offset X (for centering the plane visualization) */
  displayOffsetX: z.number().optional(),
  /** Display offset Y (for centering the plane visualization) */
  displayOffsetY: z.number().optional(),
  color: z.string().optional(),
} as const;

/** Computed/cached geometry (updated when definition changes) */
const PlaneGeometryFields = {
  /** Computed normal vector */
  normal: Vec3,
  /** Computed origin point */
  origin: Vec3,
  /** Computed X direction for the plane */
  xDir: Vec3,
} as const;

export const PlaneFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("plane"),
  /** How this plane is defined (the source of truth) */
  definition: PlaneDefinitionSchema,
  /** Computed geometry (cached, updated when definition changes) */
  ...PlaneGeometryFields,
  /** Display properties */
  ...PlaneDisplayFields,
}).strict();

export type PlaneFeature = z.infer<typeof PlaneFeatureSchema>;

// Convenience type aliases for backward compatibility
export type DatumPlaneFeature = PlaneFeature & { definition: { kind: "datum" } };
export type UserPlaneFeature = PlaneFeature & {
  definition: { kind: Exclude<PlaneDefinition["kind"], "datum"> };
};

// ============================================================================
// Axis Features (for future use)
// ============================================================================

export const AxisFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("axis"),
  /** How this axis is defined */
  definition: AxisDefinitionSchema,
  /** Computed geometry */
  origin: Vec3,
  direction: Vec3,
  /** Display properties */
  length: z.number().optional(),
  color: z.string().optional(),
}).strict();

export type AxisFeature = z.infer<typeof AxisFeatureSchema>;

// ============================================================================
// Sketch Feature
// ============================================================================

export const SketchFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("sketch"),
  plane: SketchPlaneRefSchema,
  data: SketchDataSchema,
}).strict();

export type SketchFeature = z.infer<typeof SketchFeatureSchema>;

// ============================================================================
// Extrude Feature
// ============================================================================

export const ExtrudeExtentSchema = z.enum(["blind", "toFace", "toVertex", "throughAll"]);

export type ExtrudeExtent = z.infer<typeof ExtrudeExtentSchema>;

export const ExtrudeDirectionSchema = z.union([z.enum(["normal", "reverse"]), Vec3]);

export type ExtrudeDirection = z.infer<typeof ExtrudeDirectionSchema>;

export const MergeScopeSchema = z.enum(["auto", "new", "specific"]);

export type MergeScope = z.infer<typeof MergeScopeSchema>;

export const ExtrudeFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("extrude"),
  sketch: UUID,
  op: z.enum(["add", "cut"]),
  direction: ExtrudeDirectionSchema,
  extent: ExtrudeExtentSchema,
  distance: z.number().optional(),
  extentRef: z.string().optional(),
  // Multi-body merge options
  mergeScope: MergeScopeSchema.optional(),
  targetBodies: z.array(z.string()).optional(),
  resultBodyName: z.string().optional(),
  resultBodyColor: z.string().optional(),
}).strict();

export type ExtrudeFeature = z.infer<typeof ExtrudeFeatureSchema>;

// ============================================================================
// Revolve Feature
// ============================================================================

export const RevolveFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("revolve"),
  sketch: UUID,
  axis: UUID, // sketch entity id
  angle: z.number(),
  op: z.enum(["add", "cut"]),
  // Multi-body merge options
  mergeScope: MergeScopeSchema.optional(),
  targetBodies: z.array(z.string()).optional(),
  resultBodyName: z.string().optional(),
  resultBodyColor: z.string().optional(),
}).strict();

export type RevolveFeature = z.infer<typeof RevolveFeatureSchema>;

// ============================================================================
// Boolean Feature
// ============================================================================

export const BooleanOperationSchema = z.enum(["union", "subtract", "intersect"]);

export type BooleanOperation = z.infer<typeof BooleanOperationSchema>;

export const BooleanFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("boolean"),
  operation: BooleanOperationSchema,
  target: z.string(),
  tool: z.string(),
}).strict();

export type BooleanFeature = z.infer<typeof BooleanFeatureSchema>;

// ============================================================================
// Feature Union
// ============================================================================

export const FeatureSchema = z.union([
  OriginFeatureSchema,
  PlaneFeatureSchema,
  AxisFeatureSchema,
  SketchFeatureSchema,
  ExtrudeFeatureSchema,
  RevolveFeatureSchema,
  BooleanFeatureSchema,
]);

export type Feature = z.infer<typeof FeatureSchema>;

// ============================================================================
// Document Snapshot (for validation)
// ============================================================================

export const DocSnapshotSchema = z
  .object({
    meta: DocumentMetaSchema,
    state: DocumentStateSchema,
    featuresById: z.record(UUID, FeatureSchema),
    featureOrder: z.array(UUID),
  })
  .strict();

export type DocSnapshot = z.infer<typeof DocSnapshotSchema>;
