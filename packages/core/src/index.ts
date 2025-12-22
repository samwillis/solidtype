/**
 * @solidtype/core - TypeScript CAD Kernel
 * 
 * This package provides the SolidType CAD kernel with an object-oriented API:
 * 
 * ## Primary API (Object-Oriented)
 * - SolidSession: Main entry point for modeling operations
 * - Body, Face, Edge: Wrappers for topological entities  
 * - Sketch: 2D sketch with constraint solving
 * 
 * ## Internal Modules (for advanced use)
 * - num: numeric utilities, tolerances, predicates
 * - geom: curves & surfaces
 * - topo: BREP topology (TopoModel class)
 * - model: modeling operators
 * - naming: persistent naming
 * - sketch: sketch representation & constraint solver (SketchModel class)
 * - mesh: tessellation
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
export { XY_PLANE, YZ_PLANE, ZX_PLANE, createDatumPlane, createDatumPlaneFromNormal, type DatumPlane } from './model/planes.js';

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

// Naming types
export type {
  PersistentRef,
  ResolveResult,
  SubshapeRef,
  FeatureId,
} from './naming/types.js';

// Mesh types
export type { Mesh, TessellationOptions } from './mesh/types.js';

// Model result types
export type { ExtrudeResult, ExtrudeOptions } from './model/extrude.js';
export type { RevolveResult, RevolveOptions } from './model/revolve.js';
export type { BooleanResult, BooleanOptions } from './model/boolean.js';
export type { SketchProfile } from './model/sketchProfile.js';

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

// geom: curves & surfaces
export * from './geom/curve2d.js';
export * from './geom/intersect2d.js';
export * from './geom/curve3d.js';
export * from './geom/surface.js';
export * from './geom/surfaceUv.js';

// topo: BREP topology (OO TopoModel class)
export * from './topo/index.js';

// mesh: tessellation
export * from './mesh/index.js';

// model: modeling operators
export * from './model/index.js';

// naming: persistent naming subsystem
export * from './naming/index.js';

// sketch: sketch representation & constraint solver (OO SketchModel class)
// Note: We don't use `export *` here to avoid re-exporting the core `Sketch` type
// which would conflict with the OO `Sketch` class from the api module.
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

// Export module (Phase 18)
export { exportMeshesToStl, isStlBinary, type StlExportOptions } from './export/stl.js';
