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
  })
  .strict();

export type SketchArc = z.infer<typeof SketchArcSchema>;

export const SketchEntitySchema = z.discriminatedUnion("type", [SketchLineSchema, SketchArcSchema]);

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
  })
  .strict();

// ============================================================================
// Origin Feature
// ============================================================================

export const OriginFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("origin"),
  visible: z.boolean().optional(),
}).strict();

export type OriginFeature = z.infer<typeof OriginFeatureSchema>;

// ============================================================================
// Plane Features
// ============================================================================

const PlaneFields = {
  type: z.literal("plane"),
  normal: Vec3,
  origin: Vec3,
  xDir: Vec3,
  visible: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  color: z.string().optional(),
} as const;

export const DatumPlaneRoleSchema = z.enum(["xy", "xz", "yz"]);

export type DatumPlaneRole = z.infer<typeof DatumPlaneRoleSchema>;

export const DatumPlaneFeatureSchema = FeatureBaseSchema.extend({
  ...PlaneFields,
  role: DatumPlaneRoleSchema,
}).strict();

export type DatumPlaneFeature = z.infer<typeof DatumPlaneFeatureSchema>;

export const UserPlaneFeatureSchema = FeatureBaseSchema.extend({
  ...PlaneFields,
  // no role field
}).strict();

export type UserPlaneFeature = z.infer<typeof UserPlaneFeatureSchema>;

// Combined plane schema (for parsing)
export const PlaneFeatureSchema = z.union([DatumPlaneFeatureSchema, UserPlaneFeatureSchema]);

export type PlaneFeature = z.infer<typeof PlaneFeatureSchema>;

// ============================================================================
// Sketch Feature
// ============================================================================

export const SketchFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("sketch"),
  plane: SketchPlaneRefSchema,
  visible: z.boolean().optional(),
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

// Note: We can't use discriminatedUnion for plane types because both DatumPlane
// and UserPlane have type: 'plane'. We use a regular union for planes and
// build the full feature schema manually.
export const FeatureSchema = z.union([
  OriginFeatureSchema,
  DatumPlaneFeatureSchema,
  UserPlaneFeatureSchema,
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
