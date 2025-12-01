/**
 * Sketch Module
 * 
 * This module provides 2D sketch representation and constraint solving:
 * - Sketch data model (points, lines, arcs)
 * - Constraint types (coincident, horizontal, vertical, parallel, etc.)
 * - Numeric constraint solver (Levenberg-Marquardt)
 * - Sketch-to-profile conversion for modeling operations
 * 
 * The sketch system is designed for interactive CAD:
 * - Uses the previous solution as initial guess for fast incremental solving
 * - Supports "driven" points for drag operations
 * - Provides DOF analysis for constraint status feedback
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
} from './types.js';

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
} from './types.js';

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
  Constraint,
} from './constraints.js';

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
  getConstraintPoints,
  getConstraintResidualCount,
  describeConstraint,
} from './constraints.js';

// Sketch creation and manipulation
export {
  allocateSketchId,
  resetSketchIdCounter,
  createSketch,
  addPoint,
  addFixedPoint,
  setPointPosition,
  setPointFixed,
  attachPointToRef,
  removePoint,
  addLine,
  addLineByCoords,
  addArc,
  addArcByCoords,
  addCircle,
  removeEntity,
  getLineDirection,
  getArcRadius,
  cloneSketch,
  getSketchState,
  setSketchState,
  getPointStateIndices,
  sketchToProfile,
  addRectangle,
  addTriangle,
  addPolygon,
} from './sketch.js';

// Solver
export {
  solveSketch,
  analyzeDOF,
} from './solver.js';
