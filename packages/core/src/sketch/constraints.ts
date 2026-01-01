/**
 * Sketch Constraints
 *
 * This module defines all constraint types supported by the sketch solver.
 * Each constraint type represents a geometric relationship between points
 * or entities in the sketch.
 *
 * Constraints are converted to residual equations for the numeric solver.
 * The solver minimizes the sum of squared residuals to satisfy constraints.
 *
 * Supported constraints:
 * - coincident: Two points are at the same location
 * - horizontal: A line or two points are horizontal (same Y)
 * - vertical: A line or two points are vertical (same X)
 * - parallel: Two lines are parallel
 * - perpendicular: Two lines are perpendicular
 * - equalLength: Two lines have equal length
 * - fixed: A point is at a specific position
 * - distance: Distance between two points or point-to-line
 * - angle: Angle between two lines
 * - tangent: A line is tangent to an arc
 * - pointOnLine: A point lies on a line
 * - pointOnArc: A point lies on an arc
 * - equalRadius: Two arcs have equal radius
 * - concentric: Two arcs share the same center
 */

import type { Vec2 } from "../num/vec2.js";
import type { SketchPointId, SketchEntityId, ConstraintId, Sketch } from "./types.js";
import { getSketchEntity } from "./types.js";

// ============================================================================
// Constraint Kinds
// ============================================================================

/**
 * All supported constraint kinds
 */
export type ConstraintKind =
  | `coincident`
  | `horizontal`
  | `vertical`
  | `parallel`
  | `perpendicular`
  | `equalLength`
  | `fixed`
  | `distance`
  | `angle`
  | `tangent`
  | `pointOnLine`
  | `pointOnArc`
  | `equalRadius`
  | `concentric`
  | `symmetric`
  | `midpoint`
  | `arcArcTangent`
  | `radiusDimension`
  | `pointToLineDistance`;

// ============================================================================
// Base Constraint Interface
// ============================================================================

/**
 * Base interface for all constraints
 */
export interface BaseConstraint {
  /** Unique identifier */
  id: ConstraintId;
  /** Kind of constraint */
  kind: ConstraintKind;
  /** Optional weight for soft constraints (default: 1) */
  weight?: number;
  /** Optional name */
  name?: string;
  /** Whether this constraint is currently active */
  active?: boolean;
}

// ============================================================================
// Point-Point Constraints
// ============================================================================

/**
 * Coincident constraint: two points are at the same location
 *
 * Residuals: [p1.x - p2.x, p1.y - p2.y]
 */
export interface CoincidentConstraint extends BaseConstraint {
  kind: `coincident`;
  /** First point */
  p1: SketchPointId;
  /** Second point */
  p2: SketchPointId;
}

/**
 * Horizontal constraint: two points have the same Y coordinate
 *
 * Residual: [p1.y - p2.y]
 */
export interface HorizontalPointsConstraint extends BaseConstraint {
  kind: `horizontal`;
  /** First point */
  p1: SketchPointId;
  /** Second point */
  p2: SketchPointId;
}

/**
 * Vertical constraint: two points have the same X coordinate
 *
 * Residual: [p1.x - p2.x]
 */
export interface VerticalPointsConstraint extends BaseConstraint {
  kind: `vertical`;
  /** First point */
  p1: SketchPointId;
  /** Second point */
  p2: SketchPointId;
}

/**
 * Distance constraint: two points are a specific distance apart
 *
 * Residual: [distance(p1, p2) - target]
 */
export interface DistancePointsConstraint extends BaseConstraint {
  kind: `distance`;
  /** First point */
  p1: SketchPointId;
  /** Second point */
  p2: SketchPointId;
  /** Target distance */
  distance: number;
}

// ============================================================================
// Line Constraints (using entity references)
// ============================================================================

/**
 * Horizontal line constraint: a line entity is horizontal
 *
 * Residual: [line.start.y - line.end.y]
 */
export interface HorizontalLineConstraint extends BaseConstraint {
  kind: `horizontal`;
  /** Line entity */
  line: SketchEntityId;
}

/**
 * Vertical line constraint: a line entity is vertical
 *
 * Residual: [line.start.x - line.end.x]
 */
export interface VerticalLineConstraint extends BaseConstraint {
  kind: `vertical`;
  /** Line entity */
  line: SketchEntityId;
}

/**
 * Union type for horizontal constraints
 */
export type HorizontalConstraint = HorizontalPointsConstraint | HorizontalLineConstraint;

/**
 * Union type for vertical constraints
 */
export type VerticalConstraint = VerticalPointsConstraint | VerticalLineConstraint;

// ============================================================================
// Line-Line Constraints
// ============================================================================

/**
 * Parallel constraint: two lines are parallel
 *
 * Residual: [cross(dir1, dir2)] where dir is normalized direction
 */
export interface ParallelConstraint extends BaseConstraint {
  kind: `parallel`;
  /** First line entity */
  line1: SketchEntityId;
  /** Second line entity */
  line2: SketchEntityId;
}

/**
 * Perpendicular constraint: two lines are perpendicular
 *
 * Residual: [dot(dir1, dir2)]
 */
export interface PerpendicularConstraint extends BaseConstraint {
  kind: `perpendicular`;
  /** First line entity */
  line1: SketchEntityId;
  /** Second line entity */
  line2: SketchEntityId;
}

/**
 * Equal length constraint: two lines have equal length
 *
 * Residual: [length1 - length2]
 */
export interface EqualLengthConstraint extends BaseConstraint {
  kind: `equalLength`;
  /** First line entity */
  line1: SketchEntityId;
  /** Second line entity */
  line2: SketchEntityId;
}

/**
 * Angle constraint: angle between two lines
 *
 * Residual: [actualAngle - targetAngle]
 */
export interface AngleConstraint extends BaseConstraint {
  kind: `angle`;
  /** First line entity */
  line1: SketchEntityId;
  /** Second line entity */
  line2: SketchEntityId;
  /** Target angle in radians */
  angle: number;
}

// ============================================================================
// Point Constraints
// ============================================================================

/**
 * Fixed constraint: a point is at a specific location
 *
 * Residuals: [p.x - target.x, p.y - target.y]
 */
export interface FixedConstraint extends BaseConstraint {
  kind: `fixed`;
  /** Point to fix */
  point: SketchPointId;
  /** Target position */
  position: Vec2;
}

/**
 * Point on line constraint: a point lies on a line
 *
 * Residual: [signed distance from point to line]
 */
export interface PointOnLineConstraint extends BaseConstraint {
  kind: `pointOnLine`;
  /** Point */
  point: SketchPointId;
  /** Line entity */
  line: SketchEntityId;
}

/**
 * Point on arc constraint: a point lies on an arc
 *
 * Residual: [distance from point to arc center - radius]
 */
export interface PointOnArcConstraint extends BaseConstraint {
  kind: `pointOnArc`;
  /** Point */
  point: SketchPointId;
  /** Arc entity */
  arc: SketchEntityId;
}

// ============================================================================
// Arc Constraints
// ============================================================================

/**
 * Tangent constraint: a line is tangent to an arc
 *
 * This requires:
 * 1. The connection point lies on both the line and arc
 * 2. The line direction is perpendicular to the radius at connection
 */
export interface TangentConstraint extends BaseConstraint {
  kind: `tangent`;
  /** Line entity */
  line: SketchEntityId;
  /** Arc entity */
  arc: SketchEntityId;
  /** Which endpoint of the line connects to the arc: 'start' or 'end' */
  lineEndpoint: `start` | `end`;
  /** Which endpoint of the arc connects to the line: 'start' or 'end' */
  arcEndpoint: `start` | `end`;
}

/**
 * Equal radius constraint: two arcs have equal radius
 *
 * Residual: [radius1 - radius2]
 */
export interface EqualRadiusConstraint extends BaseConstraint {
  kind: `equalRadius`;
  /** First arc entity */
  arc1: SketchEntityId;
  /** Second arc entity */
  arc2: SketchEntityId;
}

/**
 * Concentric constraint: two arcs share the same center
 *
 * Residuals: [center1.x - center2.x, center1.y - center2.y]
 */
export interface ConcentricConstraint extends BaseConstraint {
  kind: `concentric`;
  /** First arc entity */
  arc1: SketchEntityId;
  /** Second arc entity */
  arc2: SketchEntityId;
}

// ============================================================================
// Additional Constraints
// ============================================================================

/**
 * Symmetric constraint: two points are symmetric about a line
 *
 * Residuals:
 * - Midpoint of p1-p2 lies on the symmetry line
 * - Line p1-p2 is perpendicular to the symmetry line
 */
export interface SymmetricConstraint extends BaseConstraint {
  kind: `symmetric`;
  /** First point */
  p1: SketchPointId;
  /** Second point */
  p2: SketchPointId;
  /** Symmetry line entity */
  symmetryLine: SketchEntityId;
}

/**
 * Midpoint constraint: a point is at the midpoint of a line
 *
 * Residuals: [p.x - (start.x + end.x)/2, p.y - (start.y + end.y)/2]
 */
export interface MidpointConstraint extends BaseConstraint {
  kind: `midpoint`;
  /** Point to constrain */
  point: SketchPointId;
  /** Line entity */
  line: SketchEntityId;
}

/**
 * Arc-Arc tangent constraint: two arcs are tangent to each other
 *
 * For external tangency: distance between centers = r1 + r2
 * For internal tangency: distance between centers = |r1 - r2|
 */
export interface ArcArcTangentConstraint extends BaseConstraint {
  kind: `arcArcTangent`;
  /** First arc entity */
  arc1: SketchEntityId;
  /** Second arc entity */
  arc2: SketchEntityId;
  /** Whether tangency is internal (one arc inside the other) */
  internal: boolean;
}

/**
 * Radius dimension constraint: an arc has a specific radius
 *
 * Residual: [actual_radius - target_radius]
 */
export interface RadiusDimensionConstraint extends BaseConstraint {
  kind: `radiusDimension`;
  /** Arc entity */
  arc: SketchEntityId;
  /** Target radius */
  radius: number;
}

/**
 * Point to line distance constraint: distance from a point to a line
 *
 * Residual: [actual_distance - target_distance]
 */
export interface PointToLineDistanceConstraint extends BaseConstraint {
  kind: `pointToLineDistance`;
  /** Point */
  point: SketchPointId;
  /** Line entity */
  line: SketchEntityId;
  /** Target distance */
  distance: number;
}

// ============================================================================
// Union type for all constraints
// ============================================================================

/**
 * Union type for distance constraints
 */
export type DistanceConstraint = DistancePointsConstraint;

/**
 * Union of all constraint types
 */
export type Constraint =
  | CoincidentConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | EqualLengthConstraint
  | FixedConstraint
  | DistanceConstraint
  | AngleConstraint
  | TangentConstraint
  | PointOnLineConstraint
  | PointOnArcConstraint
  | EqualRadiusConstraint
  | ConcentricConstraint
  | SymmetricConstraint
  | MidpointConstraint
  | ArcArcTangentConstraint
  | RadiusDimensionConstraint
  | PointToLineDistanceConstraint;

// ============================================================================
// Constraint Creation Helpers
// ============================================================================

import { getGlobalAllocator, resetAllIds } from "./idAllocator.js";

/**
 * Allocate a new constraint ID
 *
 * Uses the global allocator. For session-scoped allocation,
 * use an IdAllocator instance directly.
 */
export function allocateConstraintId(): ConstraintId {
  return getGlobalAllocator().allocateConstraintId();
}

/**
 * Reset constraint ID counter (for testing)
 * @internal
 * @deprecated Use resetAllIds() for full reset
 */
export function resetConstraintIdCounter(): void {
  // For backward compatibility, this still works but only resets constraints
  // In practice, tests should use resetAllIds()
  resetAllIds();
}

/**
 * Create a coincident constraint
 */
export function coincident(p1: SketchPointId, p2: SketchPointId): CoincidentConstraint {
  return {
    id: allocateConstraintId(),
    kind: `coincident`,
    p1,
    p2,
  };
}

/**
 * Create a horizontal constraint for two points
 */
export function horizontalPoints(p1: SketchPointId, p2: SketchPointId): HorizontalPointsConstraint {
  return {
    id: allocateConstraintId(),
    kind: `horizontal`,
    p1,
    p2,
  };
}

/**
 * Create a horizontal constraint for a line
 */
export function horizontalLine(line: SketchEntityId): HorizontalLineConstraint {
  return {
    id: allocateConstraintId(),
    kind: `horizontal`,
    line,
  };
}

/**
 * Create a vertical constraint for two points
 */
export function verticalPoints(p1: SketchPointId, p2: SketchPointId): VerticalPointsConstraint {
  return {
    id: allocateConstraintId(),
    kind: `vertical`,
    p1,
    p2,
  };
}

/**
 * Create a vertical constraint for a line
 */
export function verticalLine(line: SketchEntityId): VerticalLineConstraint {
  return {
    id: allocateConstraintId(),
    kind: `vertical`,
    line,
  };
}

/**
 * Create a parallel constraint
 */
export function parallel(line1: SketchEntityId, line2: SketchEntityId): ParallelConstraint {
  return {
    id: allocateConstraintId(),
    kind: `parallel`,
    line1,
    line2,
  };
}

/**
 * Create a perpendicular constraint
 */
export function perpendicular(
  line1: SketchEntityId,
  line2: SketchEntityId
): PerpendicularConstraint {
  return {
    id: allocateConstraintId(),
    kind: `perpendicular`,
    line1,
    line2,
  };
}

/**
 * Create an equal length constraint
 */
export function equalLength(line1: SketchEntityId, line2: SketchEntityId): EqualLengthConstraint {
  return {
    id: allocateConstraintId(),
    kind: `equalLength`,
    line1,
    line2,
  };
}

/**
 * Create a fixed constraint
 */
export function fixed(point: SketchPointId, position: Vec2): FixedConstraint {
  return {
    id: allocateConstraintId(),
    kind: `fixed`,
    point,
    position,
  };
}

/**
 * Create a distance constraint between two points
 */
export function distance(
  p1: SketchPointId,
  p2: SketchPointId,
  dist: number
): DistancePointsConstraint {
  return {
    id: allocateConstraintId(),
    kind: `distance`,
    p1,
    p2,
    distance: dist,
  };
}

/**
 * Create an angle constraint
 */
export function angle(
  line1: SketchEntityId,
  line2: SketchEntityId,
  angleRad: number
): AngleConstraint {
  return {
    id: allocateConstraintId(),
    kind: `angle`,
    line1,
    line2,
    angle: angleRad,
  };
}

/**
 * Create a tangent constraint
 */
export function tangent(
  line: SketchEntityId,
  arc: SketchEntityId,
  lineEndpoint: `start` | `end`,
  arcEndpoint: `start` | `end`
): TangentConstraint {
  return {
    id: allocateConstraintId(),
    kind: `tangent`,
    line,
    arc,
    lineEndpoint,
    arcEndpoint,
  };
}

/**
 * Create a point on line constraint
 */
export function pointOnLine(point: SketchPointId, line: SketchEntityId): PointOnLineConstraint {
  return {
    id: allocateConstraintId(),
    kind: `pointOnLine`,
    point,
    line,
  };
}

/**
 * Create a point on arc constraint
 */
export function pointOnArc(point: SketchPointId, arc: SketchEntityId): PointOnArcConstraint {
  return {
    id: allocateConstraintId(),
    kind: `pointOnArc`,
    point,
    arc,
  };
}

/**
 * Create an equal radius constraint
 */
export function equalRadius(arc1: SketchEntityId, arc2: SketchEntityId): EqualRadiusConstraint {
  return {
    id: allocateConstraintId(),
    kind: `equalRadius`,
    arc1,
    arc2,
  };
}

/**
 * Create a concentric constraint
 */
export function concentric(arc1: SketchEntityId, arc2: SketchEntityId): ConcentricConstraint {
  return {
    id: allocateConstraintId(),
    kind: `concentric`,
    arc1,
    arc2,
  };
}

/**
 * Create a symmetric constraint
 */
export function symmetric(
  p1: SketchPointId,
  p2: SketchPointId,
  symmetryLine: SketchEntityId
): SymmetricConstraint {
  return {
    id: allocateConstraintId(),
    kind: `symmetric`,
    p1,
    p2,
    symmetryLine,
  };
}

/**
 * Create a midpoint constraint
 */
export function midpoint(point: SketchPointId, line: SketchEntityId): MidpointConstraint {
  return {
    id: allocateConstraintId(),
    kind: `midpoint`,
    point,
    line,
  };
}

/**
 * Create an arc-arc tangent constraint
 */
export function arcArcTangent(
  arc1: SketchEntityId,
  arc2: SketchEntityId,
  internal: boolean = false
): ArcArcTangentConstraint {
  return {
    id: allocateConstraintId(),
    kind: `arcArcTangent`,
    arc1,
    arc2,
    internal,
  };
}

/**
 * Create a radius dimension constraint
 */
export function radiusDimension(arc: SketchEntityId, radius: number): RadiusDimensionConstraint {
  return {
    id: allocateConstraintId(),
    kind: `radiusDimension`,
    arc,
    radius,
  };
}

/**
 * Create a point to line distance constraint
 */
export function pointToLineDistance(
  point: SketchPointId,
  line: SketchEntityId,
  dist: number
): PointToLineDistanceConstraint {
  return {
    id: allocateConstraintId(),
    kind: `pointToLineDistance`,
    point,
    line,
    distance: dist,
  };
}

// ============================================================================
// Constraint Evaluation
// ============================================================================

/**
 * Get the points involved in a constraint
 */
export function getConstraintPoints(constraint: Constraint, sketch: Sketch): SketchPointId[] {
  const points: SketchPointId[] = [];

  switch (constraint.kind) {
    case `coincident`:
      points.push(constraint.p1, constraint.p2);
      break;
    case `horizontal`:
    case `vertical`:
      if (`p1` in constraint && `p2` in constraint) {
        points.push(constraint.p1, constraint.p2);
      } else if (`line` in constraint) {
        const entity = getSketchEntity(sketch, constraint.line);
        if (entity && entity.kind === `line`) {
          points.push(entity.start, entity.end);
        }
      }
      break;
    case `parallel`:
    case `perpendicular`:
    case `equalLength`:
    case `angle`: {
      const e1 = getSketchEntity(sketch, constraint.line1);
      const e2 = getSketchEntity(sketch, constraint.line2);
      if (e1 && e1.kind === `line`) {
        points.push(e1.start, e1.end);
      }
      if (e2 && e2.kind === `line`) {
        points.push(e2.start, e2.end);
      }
      break;
    }
    case `fixed`:
      points.push(constraint.point);
      break;
    case `distance`:
      points.push(constraint.p1, constraint.p2);
      break;
    case `tangent`: {
      const line = getSketchEntity(sketch, constraint.line);
      const arc = getSketchEntity(sketch, constraint.arc);
      if (line && line.kind === `line`) {
        points.push(line.start, line.end);
      }
      if (arc && arc.kind === `arc`) {
        points.push(arc.start, arc.end, arc.center);
      }
      break;
    }
    case `pointOnLine`: {
      points.push(constraint.point);
      const line = getSketchEntity(sketch, constraint.line);
      if (line && line.kind === `line`) {
        points.push(line.start, line.end);
      }
      break;
    }
    case `pointOnArc`: {
      points.push(constraint.point);
      const arc = getSketchEntity(sketch, constraint.arc);
      if (arc && arc.kind === `arc`) {
        points.push(arc.center);
      }
      break;
    }
    case `equalRadius`:
    case `concentric`: {
      const a1 = getSketchEntity(sketch, constraint.arc1);
      const a2 = getSketchEntity(sketch, constraint.arc2);
      if (a1 && a1.kind === `arc`) {
        points.push(a1.start, a1.center);
      }
      if (a2 && a2.kind === `arc`) {
        points.push(a2.start, a2.center);
      }
      break;
    }
    case `symmetric`: {
      points.push(constraint.p1, constraint.p2);
      const line = getSketchEntity(sketch, constraint.symmetryLine);
      if (line && line.kind === `line`) {
        points.push(line.start, line.end);
      }
      break;
    }
    case `midpoint`: {
      points.push(constraint.point);
      const line = getSketchEntity(sketch, constraint.line);
      if (line && line.kind === `line`) {
        points.push(line.start, line.end);
      }
      break;
    }
    case `arcArcTangent`: {
      const a1 = getSketchEntity(sketch, constraint.arc1);
      const a2 = getSketchEntity(sketch, constraint.arc2);
      if (a1 && a1.kind === `arc`) {
        points.push(a1.start, a1.center);
      }
      if (a2 && a2.kind === `arc`) {
        points.push(a2.start, a2.center);
      }
      break;
    }
    case `radiusDimension`: {
      const arc = getSketchEntity(sketch, constraint.arc);
      if (arc && arc.kind === `arc`) {
        points.push(arc.start, arc.center);
      }
      break;
    }
    case `pointToLineDistance`: {
      points.push(constraint.point);
      const line = getSketchEntity(sketch, constraint.line);
      if (line && line.kind === `line`) {
        points.push(line.start, line.end);
      }
      break;
    }
  }

  return points;
}

/**
 * Count the number of residual equations a constraint produces
 */
export function getConstraintResidualCount(constraint: Constraint): number {
  switch (constraint.kind) {
    case `coincident`:
      return 2; // dx, dy
    case `horizontal`:
    case `vertical`:
      return 1;
    case `parallel`:
    case `perpendicular`:
    case `equalLength`:
    case `angle`:
      return 1;
    case `fixed`:
      return 2; // dx, dy
    case `distance`:
      return 1;
    case `tangent`:
      return 1; // perpendicularity of line to radius
    case `pointOnLine`:
      return 1;
    case `pointOnArc`:
      return 1;
    case `equalRadius`:
      return 1;
    case `concentric`:
      return 2; // dx, dy of centers
    case `symmetric`:
      return 2; // midpoint on line + perpendicularity
    case `midpoint`:
      return 2; // dx, dy from midpoint
    case `arcArcTangent`:
      return 1; // distance between centers = sum/diff of radii
    case `radiusDimension`:
      return 1; // radius difference
    case `pointToLineDistance`:
      return 1; // distance difference
    default:
      return 0;
  }
}

/**
 * Get a human-readable description of a constraint
 */
export function describeConstraint(constraint: Constraint): string {
  switch (constraint.kind) {
    case `coincident`:
      return `Coincident(${constraint.p1}, ${constraint.p2})`;
    case `horizontal`:
      if (`line` in constraint) {
        return `Horizontal(line ${constraint.line})`;
      }
      return `Horizontal(${constraint.p1}, ${constraint.p2})`;
    case `vertical`:
      if (`line` in constraint) {
        return `Vertical(line ${constraint.line})`;
      }
      return `Vertical(${constraint.p1}, ${constraint.p2})`;
    case `parallel`:
      return `Parallel(${constraint.line1}, ${constraint.line2})`;
    case `perpendicular`:
      return `Perpendicular(${constraint.line1}, ${constraint.line2})`;
    case `equalLength`:
      return `EqualLength(${constraint.line1}, ${constraint.line2})`;
    case `fixed`:
      return `Fixed(${constraint.point} at [${constraint.position[0].toFixed(2)}, ${constraint.position[1].toFixed(2)}])`;
    case `distance`:
      return `Distance(${constraint.p1}, ${constraint.p2}, ${constraint.distance.toFixed(2)})`;
    case `angle`:
      return `Angle(${constraint.line1}, ${constraint.line2}, ${((constraint.angle * 180) / Math.PI).toFixed(1)}°)`;
    case `tangent`:
      return `Tangent(line ${constraint.line}, arc ${constraint.arc})`;
    case `pointOnLine`:
      return `PointOnLine(${constraint.point}, line ${constraint.line})`;
    case `pointOnArc`:
      return `PointOnArc(${constraint.point}, arc ${constraint.arc})`;
    case `equalRadius`:
      return `EqualRadius(${constraint.arc1}, ${constraint.arc2})`;
    case `concentric`:
      return `Concentric(${constraint.arc1}, ${constraint.arc2})`;
    case `symmetric`:
      return `Symmetric(${constraint.p1}, ${constraint.p2}, line ${constraint.symmetryLine})`;
    case `midpoint`:
      return `Midpoint(${constraint.point}, line ${constraint.line})`;
    case `arcArcTangent`:
      return `ArcArcTangent(${constraint.arc1}, ${constraint.arc2}, ${constraint.internal ? `internal` : `external`})`;
    case `radiusDimension`:
      return `RadiusDimension(arc ${constraint.arc}, ${constraint.radius.toFixed(2)})`;
    case `pointToLineDistance`:
      return `PointToLineDistance(${constraint.point}, line ${constraint.line}, ${constraint.distance.toFixed(2)})`;
    default:
      return `Unknown constraint`;
  }
}
