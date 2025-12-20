/**
 * Sketch wrapper class
 * 
 * Provides an object-oriented interface for creating and manipulating 2D sketches.
 * Wraps the core sketch functions.
 */

import type { DatumPlane } from '../model/planes.js';
import type { SketchProfile } from '../model/sketchProfile.js';
import type {
  Sketch as CoreSketch,
  SketchPointId,
  SketchEntityId,
  SketchPoint,
  SketchEntity,
  SolveResult,
  SolveOptions,
} from '../sketch/types.js';
import type { Constraint, ConstraintId } from '../sketch/constraints.js';
import {
  createSketch as coreCreateSketch,
  addPoint as coreAddPoint,
  addFixedPoint as coreAddFixedPoint,
  addLine as coreAddLine,
  addArc as coreAddArc,
  addCircle as coreAddCircle,
  addRectangle as coreAddRectangle,
  setPointPosition,
  setPointFixed,
  removePoint as coreRemovePoint,
  removeEntity as coreRemoveEntity,
  sketchToProfile,
} from '../sketch/sketch.js';
import {
  getSketchPoint,
  getSketchEntity,
  getAllSketchPoints,
  getAllSketchEntities,
} from '../sketch/types.js';
import { solveSketch, analyzeDOF } from '../sketch/solver.js';

/**
 * Sketch wrapper class
 * 
 * Provides an object-oriented interface for creating and manipulating 2D sketches.
 */
export class Sketch {
  private readonly coreSketch: CoreSketch;
  private constraints: Constraint[] = [];
  
  constructor(plane: DatumPlane, name?: string) {
    this.coreSketch = coreCreateSketch(plane, name);
  }
  
  /**
   * Get the underlying core sketch
   * @internal For advanced use only
   */
  getCoreSketch(): CoreSketch {
    return this.coreSketch;
  }
  
  /**
   * Get the plane this sketch is on
   */
  getPlane(): DatumPlane {
    return this.coreSketch.plane;
  }
  
  /**
   * Add a point to the sketch
   */
  addPoint(x: number, y: number, options?: { fixed?: boolean; name?: string }): SketchPointId {
    if (options?.fixed) {
      return coreAddFixedPoint(this.coreSketch, x, y, options.name);
    }
    return coreAddPoint(this.coreSketch, x, y, options);
  }
  
  /**
   * Add a fixed point to the sketch
   */
  addFixedPoint(x: number, y: number, name?: string): SketchPointId {
    return coreAddFixedPoint(this.coreSketch, x, y, name);
  }
  
  /**
   * Add a line between two points
   */
  addLine(start: SketchPointId, end: SketchPointId, options?: { construction?: boolean }): SketchEntityId {
    return coreAddLine(this.coreSketch, start, end, options);
  }
  
  /**
   * Add a line by coordinates (creates points automatically)
   */
  addLineByCoords(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: { construction?: boolean }
  ): { start: SketchPointId; end: SketchPointId; line: SketchEntityId } {
    const start = coreAddPoint(this.coreSketch, x1, y1);
    const end = coreAddPoint(this.coreSketch, x2, y2);
    const line = coreAddLine(this.coreSketch, start, end, options);
    return { start, end, line };
  }
  
  /**
   * Add an arc
   */
  addArc(
    start: SketchPointId,
    end: SketchPointId,
    center: SketchPointId,
    ccw?: boolean,
    options?: { construction?: boolean }
  ): SketchEntityId {
    return coreAddArc(this.coreSketch, start, end, center, ccw, options);
  }
  
  /**
   * Add a circle
   */
  addCircle(
    centerX: number,
    centerY: number,
    radius: number,
    options?: { construction?: boolean }
  ): { center: SketchPointId; arc: SketchEntityId } {
    return coreAddCircle(this.coreSketch, centerX, centerY, radius, options);
  }
  
  /**
   * Add a rectangle
   */
  addRectangle(
    x: number,
    y: number,
    width: number,
    height: number
  ): {
    corners: [SketchPointId, SketchPointId, SketchPointId, SketchPointId];
    sides: [SketchEntityId, SketchEntityId, SketchEntityId, SketchEntityId];
  } {
    return coreAddRectangle(this.coreSketch, x, y, width, height);
  }
  
  /**
   * Set the position of a point
   */
  setPointPosition(pointId: SketchPointId, x: number, y: number): void {
    setPointPosition(this.coreSketch, pointId, x, y);
  }
  
  /**
   * Set whether a point is fixed
   */
  setPointFixed(pointId: SketchPointId, fixed: boolean): void {
    setPointFixed(this.coreSketch, pointId, fixed);
  }
  
  /**
   * Remove a point (and any entities referencing it)
   */
  removePoint(pointId: SketchPointId): boolean {
    return coreRemovePoint(this.coreSketch, pointId);
  }
  
  /**
   * Remove an entity
   */
  removeEntity(entityId: SketchEntityId): boolean {
    return coreRemoveEntity(this.coreSketch, entityId);
  }
  
  /**
   * Get a point by ID
   */
  getPoint(pointId: SketchPointId): SketchPoint | undefined {
    return getSketchPoint(this.coreSketch, pointId);
  }
  
  /**
   * Get an entity by ID
   */
  getEntity(entityId: SketchEntityId): SketchEntity | undefined {
    return getSketchEntity(this.coreSketch, entityId);
  }
  
  /**
   * Get all points
   */
  getAllPoints(): SketchPoint[] {
    return getAllSketchPoints(this.coreSketch);
  }
  
  /**
   * Get all entities
   */
  getAllEntities(): SketchEntity[] {
    return getAllSketchEntities(this.coreSketch);
  }
  
  /**
   * Add a constraint
   */
  addConstraint(constraint: Constraint): void {
    this.constraints.push(constraint);
  }
  
  /**
   * Add multiple constraints
   */
  addConstraints(constraints: Constraint[]): void {
    this.constraints.push(...constraints);
  }
  
  /**
   * Remove a constraint by ID
   */
  removeConstraint(constraintId: ConstraintId): boolean {
    const idx = this.constraints.findIndex(c => c.id === constraintId);
    if (idx >= 0) {
      this.constraints.splice(idx, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Get all constraints
   */
  getConstraints(): Constraint[] {
    return [...this.constraints];
  }
  
  /**
   * Clear all constraints
   */
  clearConstraints(): void {
    this.constraints = [];
  }
  
  /**
   * Solve the sketch constraints
   */
  solve(options?: SolveOptions): SolveResult {
    return solveSketch(this.coreSketch, this.constraints, options);
  }
  
  /**
   * Analyze degrees of freedom
   */
  analyzeDOF(): {
    totalDOF: number;
    constrainedDOF: number;
    remainingDOF: number;
    isFullyConstrained: boolean;
    isOverConstrained: boolean;
  } {
    return analyzeDOF(this.coreSketch, this.constraints);
  }
  
  /**
   * Convert to a SketchProfile for use in modeling operations
   */
  toProfile(): SketchProfile | null {
    return sketchToProfile(this.coreSketch);
  }
}
