/**
 * Sketch Module
 *
 * This module provides 2D sketch representation and constraint solving:
 * - SketchModel class (OO sketch data model)
 * - Constraint types (coincident, horizontal, vertical, parallel, etc.)
 * - Numeric constraint solver (Levenberg-Marquardt)
 * - Sketch-to-profile conversion for modeling operations
 */

// Types
export type {
  SketchId,
  SketchPointId,
  SketchEntityId,
  ConstraintId,
  SketchPoint,
  SketchLine,
  SketchArc,
  SketchEntity,
  SketchEntityKind,
  Sketch,
  SolveStatus,
  SolveResult,
  SolveOptions,
} from "./types.js";

export {
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
} from "./types.js";

// Constraints
export type {
  ConstraintKind,
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
  Constraint,
} from "./constraints.js";

export {
  allocateConstraintId,
  resetConstraintIdCounter,
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
  getConstraintPoints,
  getConstraintResidualCount,
  describeConstraint,
} from "./constraints.js";

// SketchModel class (primary OO API)
export { SketchModel } from "./SketchModel.js";

// Solver
export { solveSketch, analyzeDOF } from "./solver.js";

// Graph analysis and partitioning
export type { GraphNode, GraphComponent, GraphAnalysis, ConstraintConflict } from "./graph.js";

export {
  buildConstraintGraph,
  findConnectedComponents,
  getComponentConstraints,
  analyzeComponentDOF,
  detectConflicts,
  analyzeConstraintGraph,
  partitionForSolving,
  canSolve,
} from "./graph.js";

// External attachment resolution
export type {
  AttachmentType,
  ResolvedAttachment,
  AttachmentConstraintData,
  AttachmentResolutionResult,
} from "./attachment.js";

export {
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
} from "./attachment.js";

// ID allocation
export { IdAllocator, getGlobalAllocator, resetAllIds } from "./idAllocator.js";
