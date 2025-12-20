/**
 * Sketch wrapper class
 * 
 * Provides an object-oriented interface for creating and manipulating 2D sketches.
 * Uses the SketchModel class directly.
 */

import type { DatumPlane } from '../model/planes.js';
import type { SketchProfile } from '../model/sketchProfile.js';
import type {
  SketchPointId,
  SketchEntityId,
  SketchPoint,
  SketchEntity,
  SolveResult,
  SolveOptions,
} from '../sketch/types.js';
import type { Constraint } from '../sketch/constraints.js';
import type { ConstraintId } from '../sketch/types.js';
import { SketchModel } from '../sketch/SketchModel.js';
import { solveSketch, analyzeDOF } from '../sketch/solver.js';

/**
 * Sketch wrapper class
 * 
 * Provides an object-oriented interface for creating and manipulating 2D sketches.
 */
export class Sketch {
  private readonly sketchModel: SketchModel;
  private constraints: Constraint[] = [];
  
  constructor(plane: DatumPlane, name?: string) {
    this.sketchModel = new SketchModel(plane, name);
  }
  
  /**
   * Get the underlying sketch model
   * @internal For advanced use only
   */
  getCoreSketch(): SketchModel {
    return this.sketchModel;
  }
  
  /**
   * Get the plane this sketch is on
   */
  getPlane(): DatumPlane {
    return this.sketchModel.plane;
  }
  
  /**
   * Add a point to the sketch
   */
  addPoint(x: number, y: number, options?: { fixed?: boolean; name?: string }): SketchPointId {
    return this.sketchModel.addPoint(x, y, options);
  }
  
  /**
   * Add a fixed point to the sketch
   */
  addFixedPoint(x: number, y: number, name?: string): SketchPointId {
    return this.sketchModel.addFixedPoint(x, y, name);
  }
  
  /**
   * Add a line between two points
   */
  addLine(start: SketchPointId, end: SketchPointId, options?: { construction?: boolean }): SketchEntityId {
    return this.sketchModel.addLine(start, end, options);
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
    return this.sketchModel.addLineByCoords(x1, y1, x2, y2, options);
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
    return this.sketchModel.addArc(start, end, center, ccw, options);
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
    return this.sketchModel.addCircle(centerX, centerY, radius, options);
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
    return this.sketchModel.addRectangle(x, y, width, height);
  }
  
  /**
   * Set the position of a point
   */
  setPointPosition(pointId: SketchPointId, x: number, y: number): void {
    this.sketchModel.setPointPosition(pointId, x, y);
  }
  
  /**
   * Set whether a point is fixed
   */
  setPointFixed(pointId: SketchPointId, fixed: boolean): void {
    this.sketchModel.setPointFixed(pointId, fixed);
  }
  
  /**
   * Remove a point (and any entities referencing it)
   */
  removePoint(pointId: SketchPointId): boolean {
    return this.sketchModel.removePoint(pointId);
  }
  
  /**
   * Remove an entity
   */
  removeEntity(entityId: SketchEntityId): boolean {
    return this.sketchModel.removeEntity(entityId);
  }
  
  /**
   * Get a point by ID
   */
  getPoint(pointId: SketchPointId): SketchPoint | undefined {
    return this.sketchModel.getPoint(pointId);
  }
  
  /**
   * Get an entity by ID
   */
  getEntity(entityId: SketchEntityId): SketchEntity | undefined {
    return this.sketchModel.getEntity(entityId);
  }
  
  /**
   * Get all points
   */
  getAllPoints(): SketchPoint[] {
    return this.sketchModel.getAllPoints();
  }
  
  /**
   * Get all entities
   */
  getAllEntities(): SketchEntity[] {
    return this.sketchModel.getAllEntities();
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
    return solveSketch(this.sketchModel, this.constraints, options);
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
    return analyzeDOF(this.sketchModel, this.constraints);
  }
  
  /**
   * Convert to a SketchProfile for use in modeling operations
   */
  toProfile(): SketchProfile | null {
    return this.sketchModel.toProfile();
  }
}
