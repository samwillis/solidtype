/**
 * Sketch Types
 * 
 * This module defines the core types for the 2D sketch representation.
 * Sketches live on planes and contain points, entities (lines/arcs),
 * and constraints that define their geometry.
 * 
 * Design influences:
 * - Siemens D-Cubed 2D DCM constraint system
 * - Parametric CAD sketch systems (SolidWorks, Fusion 360)
 */

import type { Vec2 } from '../num/vec2.js';
import type { PersistentRef } from '../naming/types.js';
import type { DatumPlane } from '../model/planes.js';

// ============================================================================
// Branded IDs
// ============================================================================

/**
 * Unique identifier for a sketch
 */
export type SketchId = number & { __brand: 'SketchId' };

/**
 * Unique identifier for a sketch point
 */
export type SketchPointId = number & { __brand: 'SketchPointId' };

/**
 * Unique identifier for a sketch entity (line, arc, etc.)
 */
export type SketchEntityId = number & { __brand: 'SketchEntityId' };

/**
 * Unique identifier for a constraint
 */
export type ConstraintId = number & { __brand: 'ConstraintId' };

/**
 * Cast a number to a SketchId
 * @internal
 */
export function asSketchId(id: number): SketchId {
  return id as SketchId;
}

/**
 * Cast a number to a SketchPointId
 * @internal
 */
export function asSketchPointId(id: number): SketchPointId {
  return id as SketchPointId;
}

/**
 * Cast a number to a SketchEntityId
 * @internal
 */
export function asSketchEntityId(id: number): SketchEntityId {
  return id as SketchEntityId;
}

/**
 * Cast a number to a ConstraintId
 * @internal
 */
export function asConstraintId(id: number): ConstraintId {
  return id as ConstraintId;
}

// ============================================================================
// Sketch Points
// ============================================================================

/**
 * A point in a sketch
 * 
 * Points are the fundamental unknowns in the constraint solver.
 * Their (x, y) coordinates are variables that the solver adjusts
 * to satisfy constraints.
 */
export interface SketchPoint {
  /** Unique identifier for this point */
  id: SketchPointId;
  /** X coordinate in sketch plane space */
  x: number;
  /** Y coordinate in sketch plane space */
  y: number;
  /** Whether this point is fixed (not movable by solver) */
  fixed: boolean;
  /** Optional reference to a model edge/vertex for attachment */
  externalRef?: PersistentRef;
  /** Optional name for the point */
  name?: string;
}

/**
 * Get the position of a sketch point as a Vec2
 */
export function getSketchPointPosition(point: SketchPoint): Vec2 {
  return [point.x, point.y];
}

/**
 * Set the position of a sketch point from a Vec2
 */
export function setSketchPointPosition(point: SketchPoint, pos: Vec2): void {
  point.x = pos[0];
  point.y = pos[1];
}

// ============================================================================
// Sketch Entities
// ============================================================================

/**
 * Type tag for sketch entity kinds
 */
export type SketchEntityKind = 'line' | 'arc';

/**
 * A line entity in a sketch
 * 
 * Defined by two points (start and end).
 */
export interface SketchLine {
  kind: 'line';
  /** Unique identifier */
  id: SketchEntityId;
  /** Start point ID */
  start: SketchPointId;
  /** End point ID */
  end: SketchPointId;
  /** Optional construction flag (for reference geometry) */
  construction?: boolean;
}

/**
 * An arc entity in a sketch
 * 
 * Defined by three points: start, end, and center.
 * The radius is implicit from center to start (and center to end should match).
 */
export interface SketchArc {
  kind: 'arc';
  /** Unique identifier */
  id: SketchEntityId;
  /** Start point ID */
  start: SketchPointId;
  /** End point ID */
  end: SketchPointId;
  /** Center point ID */
  center: SketchPointId;
  /** Whether the arc is counter-clockwise */
  ccw: boolean;
  /** Optional construction flag */
  construction?: boolean;
}

/**
 * Union type for all sketch entities
 */
export type SketchEntity = SketchLine | SketchArc;

/**
 * Get all point IDs referenced by an entity
 */
export function getEntityPointIds(entity: SketchEntity): SketchPointId[] {
  if (entity.kind === 'line') {
    return [entity.start, entity.end];
  } else {
    return [entity.start, entity.end, entity.center];
  }
}

// ============================================================================
// Sketch Data Structure
// ============================================================================

/**
 * A 2D sketch on a plane
 * 
 * Contains:
 * - Reference to the plane it lives on
 * - A set of points (unknowns for the solver)
 * - A set of entities (lines, arcs) that reference points
 * - A set of constraints that define relationships
 */
export interface Sketch {
  /** Unique identifier */
  id: SketchId;
  /** The plane this sketch lives on */
  plane: DatumPlane;
  /** Points indexed by ID */
  points: Map<SketchPointId, SketchPoint>;
  /** Entities indexed by ID */
  entities: Map<SketchEntityId, SketchEntity>;
  /** Next point ID to allocate */
  nextPointId: number;
  /** Next entity ID to allocate */
  nextEntityId: number;
  /** Optional name for the sketch */
  name?: string;
}

/**
 * Get a point from a sketch by ID
 */
export function getSketchPoint(sketch: Sketch, id: SketchPointId): SketchPoint | undefined {
  return sketch.points.get(id);
}

/**
 * Get an entity from a sketch by ID
 */
export function getSketchEntity(sketch: Sketch, id: SketchEntityId): SketchEntity | undefined {
  return sketch.entities.get(id);
}

/**
 * Get all points in a sketch as an array
 */
export function getAllSketchPoints(sketch: Sketch): SketchPoint[] {
  return Array.from(sketch.points.values());
}

/**
 * Get all entities in a sketch as an array
 */
export function getAllSketchEntities(sketch: Sketch): SketchEntity[] {
  return Array.from(sketch.entities.values());
}

/**
 * Get all non-fixed points (the free variables for the solver)
 */
export function getFreePoints(sketch: Sketch): SketchPoint[] {
  return getAllSketchPoints(sketch).filter(p => !p.fixed);
}

/**
 * Count degrees of freedom (DOF) for a sketch before constraints
 * Each non-fixed point contributes 2 DOF (x and y)
 */
export function countBaseDOF(sketch: Sketch): number {
  return getFreePoints(sketch).length * 2;
}

// ============================================================================
// Solver State
// ============================================================================

/**
 * Status of a solve operation
 */
export type SolveStatus = 
  | 'success'           // Converged to a solution
  | 'converged'         // Same as success
  | 'under_constrained' // More DOF than constraints
  | 'over_constrained'  // More constraints than DOF
  | 'not_converged'     // Failed to converge within iterations
  | 'invalid_sketch'    // Sketch has structural issues
  | 'singular';         // Jacobian is singular

/**
 * Result of a solve operation
 */
export interface SolveResult {
  /** Status of the solve */
  status: SolveStatus;
  /** Number of iterations performed */
  iterations: number;
  /** Final residual (sum of squared constraint errors) */
  residual: number;
  /** Whether the solution satisfies all constraints within tolerance */
  satisfied: boolean;
  /** Message with additional details */
  message?: string;
  /** Degrees of freedom remaining after constraints */
  remainingDOF?: number;
}

/**
 * Options for the solver
 */
export interface SolveOptions {
  /** Maximum number of iterations (default: 100) */
  maxIterations?: number;
  /** Convergence tolerance for residual (default: 1e-10) */
  tolerance?: number;
  /** Damping factor for Levenberg-Marquardt (default: 1e-3) */
  lambda?: number;
  /** Points being dragged (treat as soft constraints) */
  drivenPoints?: Map<SketchPointId, Vec2>;
  /** Weight for driven point constraints (default: 1000) */
  drivenWeight?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Default solve options
 */
export const DEFAULT_SOLVE_OPTIONS: Required<Omit<SolveOptions, 'drivenPoints' | 'verbose'>> = {
  maxIterations: 100,
  tolerance: 1e-10,
  lambda: 1e-3,
  drivenWeight: 1000,
};
