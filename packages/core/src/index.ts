/**
 * @solidtype/core - TypeScript CAD Kernel
 * 
 * This package provides the SolidType CAD kernel powered by OpenCascade.js:
 * 
 * ## Primary API (Object-Oriented)
 * - SolidSession: Main entry point for modeling operations
 * - Sketch: 2D sketch with constraint solving
 * - BodyId, FaceId, EdgeId: Opaque handles for topological entities
 * 
 * ## Internal Modules (for advanced use)
 * - num: numeric utilities, tolerances, predicates
 * - geom: curves & surfaces (2D)
 * - sketch: sketch representation & constraint solver
 * - naming: persistent naming (kept for future use)
 * 
 * Note: The kernel module (kernel/) is internal and not exported.
 * All CAD operations should go through SolidSession.
 */

// =============================================================================
// Primary Object-Oriented API
// =============================================================================
export * from './api/index.js';

// =============================================================================
// Re-export commonly used types and utilities
// =============================================================================

// Numeric types and utilities
export { vec2, type Vec2 } from './num/vec2.js';
export { vec3, type Vec3, normalize3, add3, sub3, mul3, dot3, cross3, length3 } from './num/vec3.js';
export { type NumericContext, createNumericContext, type Tolerances } from './num/tolerance.js';

// Datum planes
export { XY_PLANE, YZ_PLANE, ZX_PLANE, createDatumPlane, createDatumPlaneFromNormal, planeToWorld, type DatumPlane } from './model/planes.js';

// Sketch types and constraint creators
export type {
  SketchPointId,
  SketchEntityId,
  SketchPoint,
  SketchEntity,
  Sketch as CoreSketch,
  SolveResult,
  SolveOptions,
} from './sketch/types.js';

export type {
  Constraint,
  ConstraintKind,
} from './sketch/constraints.js';

export type { ConstraintId } from './sketch/types.js';

export {
  coincident,
  horizontalPoints,
  horizontalLine,
  verticalPoints,
  verticalLine,
  parallel,
  perpendicular,
  equalLength,
  fixed,
  distance,
  angle,
  tangent,
  pointOnLine,
  pointOnArc,
  equalRadius,
  concentric,
  symmetric,
  midpoint,
  arcArcTangent,
  radiusDimension,
  pointToLineDistance,
} from './sketch/constraints.js';

// Graph analysis
export { analyzeConstraintGraph, canSolve, type GraphAnalysis, type ConstraintConflict } from './sketch/graph.js';

// Naming types (kept for future persistent naming integration with OCCT)
export type {
  PersistentRef,
  ResolveResult,
  SubshapeRef,
  FeatureId,
} from './naming/types.js';

// Profile types
export type { SketchProfile, ProfileLoop, ProfileId } from './model/sketchProfile.js';
export { 
  createRectangleProfile, 
  createCircleProfile, 
  createPolygonProfile,
  createEmptyProfile,
  addLoopToProfile,
} from './model/sketchProfile.js';

// =============================================================================
// Internal modules (for advanced/low-level use)
// =============================================================================

// num: numeric backbone & tolerances
export * from './num/vec2.js';
export * from './num/vec3.js';
export * from './num/mat4.js';
export * from './num/tolerance.js';
export * from './num/predicates.js';
export * from './num/rootFinding.js';

// geom: 2D curves & surfaces (for sketch construction)
export * from './geom/curve2d.js';
export * from './geom/intersect2d.js';

// sketch: sketch representation & constraint solver
export {
  // SketchModel class (core OO API)
  SketchModel,
  // ID types and casts
  asSketchId,
  asSketchPointId,
  asSketchEntityId,
  asConstraintId,
  getSketchPointPosition,
  setSketchPointPosition,
  getEntityPointIds,
  getSketchPoint,
  getSketchEntity,
  getAllSketchPoints,
  getAllSketchEntities,
  getFreePoints,
  countBaseDOF,
  DEFAULT_SOLVE_OPTIONS,
  // Solver
  solveSketch,
  analyzeDOF,
  // Constraints
  allocateConstraintId,
  resetConstraintIdCounter,
  getConstraintPoints,
  getConstraintResidualCount,
  describeConstraint,
  // Graph analysis
  buildConstraintGraph,
  findConnectedComponents,
  getComponentConstraints,
  analyzeComponentDOF,
  detectConflicts,
  partitionForSolving,
  // Attachment
  projectToSketchPlane,
  sketchToWorld,
  getEdgeEndpoints,
  getEdgePointAtParameter,
  projectPointOntoEdge,
  resolveAttachment,
  resolveAllAttachments,
  applyResolvedAttachments,
  hasExternalAttachments,
  getAttachedPoints,
  createAttachmentConstraints,
  // ID allocator
  IdAllocator,
  getGlobalAllocator,
  resetAllIds,
} from './sketch/index.js';

// Re-export sketch types (excluding Sketch to avoid conflict)
export type {
  SketchId,
  SketchLine,
  SketchArc,
  SketchEntityKind,
  SolveStatus,
} from './sketch/types.js';

export type {
  BaseConstraint,
  CoincidentConstraint,
  HorizontalPointsConstraint,
  VerticalPointsConstraint,
  HorizontalLineConstraint,
  VerticalLineConstraint,
  HorizontalConstraint,
  VerticalConstraint,
  ParallelConstraint,
  PerpendicularConstraint,
  EqualLengthConstraint,
  FixedConstraint,
  DistancePointsConstraint,
  DistanceConstraint,
  AngleConstraint,
  TangentConstraint,
  PointOnLineConstraint,
  PointOnArcConstraint,
  EqualRadiusConstraint,
  ConcentricConstraint,
  SymmetricConstraint,
  MidpointConstraint,
  ArcArcTangentConstraint,
  RadiusDimensionConstraint,
  PointToLineDistanceConstraint,
} from './sketch/constraints.js';

export type {
  GraphNode,
  GraphComponent,
} from './sketch/graph.js';

export type {
  AttachmentType,
  ResolvedAttachment,
  AttachmentConstraintData,
  AttachmentResolutionResult,
} from './sketch/attachment.js';

// Export module (Phase 18) - STL export still works with new mesh format
export { exportMeshesToStl, isStlBinary, type StlExportOptions } from './export/stl.js';
