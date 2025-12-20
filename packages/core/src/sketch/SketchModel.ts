/**
 * SketchModel - Object-Oriented 2D Sketch API
 * 
 * This module provides the core class for representing 2D sketches.
 * Sketches live on planes and contain points, entities (lines/arcs),
 * and constraints that define their geometry.
 * 
 * Design influences:
 * - Siemens D-Cubed 2D DCM constraint system
 * - Parametric CAD sketch systems (SolidWorks, Fusion 360)
 */

import type { Vec2 } from '../num/vec2.js';
import { vec2 } from '../num/vec2.js';
import type { DatumPlane } from '../model/planes.js';
import type { Curve2D } from '../geom/curve2d.js';
import type { SketchProfile } from '../model/sketchProfile.js';
import type { PersistentRef } from '../naming/types.js';
import type {
  Sketch,
  SketchId,
  SketchPointId,
  SketchEntityId,
  SketchPoint,
  SketchLine,
  SketchArc,
  SketchEntity,
} from './types.js';
import {
  asSketchPointId,
  asSketchEntityId,
} from './types.js';
import { createEmptyProfile, addLoopToProfile } from '../model/sketchProfile.js';
import { getGlobalAllocator } from './idAllocator.js';

/**
 * SketchModel - Object-Oriented 2D Sketch
 * 
 * Contains:
 * - Reference to the plane it lives on
 * - A set of points (unknowns for the solver)
 * - A set of entities (lines, arcs) that reference points
 */
export class SketchModel implements Sketch {
  /** Unique identifier */
  readonly id: SketchId;
  /** The plane this sketch lives on */
  readonly plane: DatumPlane;
  /** Points indexed by ID */
  readonly points: Map<SketchPointId, SketchPoint>;
  /** Entities indexed by ID */
  readonly entities: Map<SketchEntityId, SketchEntity>;
  /** Next point ID to allocate */
  nextPointId: number;
  /** Next entity ID to allocate */
  nextEntityId: number;
  /** Optional name for the sketch */
  name?: string;
  
  constructor(plane: DatumPlane, name?: string) {
    this.id = getGlobalAllocator().allocateSketchId();
    this.plane = plane;
    this.points = new Map();
    this.entities = new Map();
    this.nextPointId = 0;
    this.nextEntityId = 0;
    this.name = name;
  }
  
  // ==========================================================================
  // Point Operations
  // ==========================================================================
  
  /**
   * Add a point to the sketch
   */
  addPoint(
    x: number,
    y: number,
    options?: {
      fixed?: boolean;
      externalRef?: PersistentRef;
      name?: string;
    }
  ): SketchPointId {
    const id = asSketchPointId(this.nextPointId++);
    const point: SketchPoint = {
      id,
      x,
      y,
      fixed: options?.fixed ?? false,
      externalRef: options?.externalRef,
      name: options?.name,
    };
    this.points.set(id, point);
    return id;
  }
  
  /**
   * Add a fixed point to the sketch
   */
  addFixedPoint(x: number, y: number, name?: string): SketchPointId {
    return this.addPoint(x, y, { fixed: true, name });
  }
  
  /**
   * Get a point by ID
   */
  getPoint(pointId: SketchPointId): SketchPoint | undefined {
    return this.points.get(pointId);
  }
  
  /**
   * Update the position of a point
   */
  setPointPosition(pointId: SketchPointId, x: number, y: number): void {
    const point = this.points.get(pointId);
    if (point) {
      point.x = x;
      point.y = y;
    }
  }
  
  /**
   * Set whether a point is fixed
   */
  setPointFixed(pointId: SketchPointId, fixed: boolean): void {
    const point = this.points.get(pointId);
    if (point) {
      point.fixed = fixed;
    }
  }
  
  /**
   * Attach a point to an external model reference
   */
  attachPointToRef(pointId: SketchPointId, ref: PersistentRef): void {
    const point = this.points.get(pointId);
    if (point) {
      point.externalRef = ref;
    }
  }
  
  /**
   * Remove a point and any entities referencing it
   */
  removePoint(pointId: SketchPointId): boolean {
    // Remove any entities that reference this point
    for (const [entityId, entity] of this.entities) {
      if (entity.kind === 'line') {
        if (entity.start === pointId || entity.end === pointId) {
          this.entities.delete(entityId);
        }
      } else if (entity.kind === 'arc') {
        if (entity.start === pointId || entity.end === pointId || entity.center === pointId) {
          this.entities.delete(entityId);
        }
      }
    }
    
    return this.points.delete(pointId);
  }
  
  /**
   * Get all points as an array
   */
  getAllPoints(): SketchPoint[] {
    return Array.from(this.points.values());
  }
  
  /**
   * Get all non-fixed points (free variables for the solver)
   */
  getFreePoints(): SketchPoint[] {
    return this.getAllPoints().filter(p => !p.fixed);
  }
  
  // ==========================================================================
  // Line Operations
  // ==========================================================================
  
  /**
   * Add a line entity to the sketch
   */
  addLine(
    startId: SketchPointId,
    endId: SketchPointId,
    options?: { construction?: boolean }
  ): SketchEntityId {
    const id = asSketchEntityId(this.nextEntityId++);
    const line: SketchLine = {
      kind: 'line',
      id,
      start: startId,
      end: endId,
      construction: options?.construction,
    };
    this.entities.set(id, line);
    return id;
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
    const start = this.addPoint(x1, y1);
    const end = this.addPoint(x2, y2);
    const line = this.addLine(start, end, options);
    return { start, end, line };
  }
  
  /**
   * Get the line direction vector (unnormalized)
   */
  getLineDirection(entityId: SketchEntityId): Vec2 | null {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== 'line') return null;
    
    const start = this.points.get(entity.start);
    const end = this.points.get(entity.end);
    if (!start || !end) return null;
    
    return [end.x - start.x, end.y - start.y];
  }
  
  // ==========================================================================
  // Arc Operations
  // ==========================================================================
  
  /**
   * Add an arc entity to the sketch
   */
  addArc(
    startId: SketchPointId,
    endId: SketchPointId,
    centerId: SketchPointId,
    ccw: boolean = true,
    options?: { construction?: boolean }
  ): SketchEntityId {
    const id = asSketchEntityId(this.nextEntityId++);
    const arc: SketchArc = {
      kind: 'arc',
      id,
      start: startId,
      end: endId,
      center: centerId,
      ccw,
      construction: options?.construction,
    };
    this.entities.set(id, arc);
    return id;
  }
  
  /**
   * Add an arc by coordinates (creates points automatically)
   */
  addArcByCoords(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    centerX: number,
    centerY: number,
    ccw: boolean = true,
    options?: { construction?: boolean }
  ): { start: SketchPointId; end: SketchPointId; center: SketchPointId; arc: SketchEntityId } {
    const start = this.addPoint(startX, startY);
    const end = this.addPoint(endX, endY);
    const center = this.addPoint(centerX, centerY);
    const arc = this.addArc(start, end, center, ccw, options);
    return { start, end, center, arc };
  }
  
  /**
   * Add a full circle (arc from 0 to 2π)
   */
  addCircle(
    centerX: number,
    centerY: number,
    radius: number,
    options?: { construction?: boolean }
  ): { center: SketchPointId; arc: SketchEntityId } {
    const center = this.addPoint(centerX, centerY);
    const startEnd = this.addPoint(centerX + radius, centerY);
    const arc = this.addArc(startEnd, startEnd, center, true, options);
    return { center, arc };
  }
  
  /**
   * Get the arc radius
   */
  getArcRadius(entityId: SketchEntityId): number | null {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== 'arc') return null;
    
    const start = this.points.get(entity.start);
    const center = this.points.get(entity.center);
    if (!start || !center) return null;
    
    const dx = start.x - center.x;
    const dy = start.y - center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // ==========================================================================
  // Entity Operations
  // ==========================================================================
  
  /**
   * Get an entity by ID
   */
  getEntity(entityId: SketchEntityId): SketchEntity | undefined {
    return this.entities.get(entityId);
  }
  
  /**
   * Remove an entity from the sketch
   */
  removeEntity(entityId: SketchEntityId): boolean {
    return this.entities.delete(entityId);
  }
  
  /**
   * Get all entities as an array
   */
  getAllEntities(): SketchEntity[] {
    return Array.from(this.entities.values());
  }
  
  // ==========================================================================
  // Common Sketch Patterns
  // ==========================================================================
  
  /**
   * Create a rectangle in the sketch
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
    const hw = width / 2;
    const hh = height / 2;
    
    const p0 = this.addPoint(x - hw, y - hh);
    const p1 = this.addPoint(x + hw, y - hh);
    const p2 = this.addPoint(x + hw, y + hh);
    const p3 = this.addPoint(x - hw, y + hh);
    
    const l0 = this.addLine(p0, p1); // bottom
    const l1 = this.addLine(p1, p2); // right
    const l2 = this.addLine(p2, p3); // top
    const l3 = this.addLine(p3, p0); // left
    
    return {
      corners: [p0, p1, p2, p3],
      sides: [l0, l1, l2, l3],
    };
  }
  
  /**
   * Create an equilateral triangle in the sketch
   */
  addTriangle(
    x: number,
    y: number,
    size: number
  ): {
    corners: [SketchPointId, SketchPointId, SketchPointId];
    sides: [SketchEntityId, SketchEntityId, SketchEntityId];
  } {
    const h = size * Math.sqrt(3) / 2;
    const r = h / 3;
    
    const p0 = this.addPoint(x, y + 2 * r);
    const p1 = this.addPoint(x - size / 2, y - r);
    const p2 = this.addPoint(x + size / 2, y - r);
    
    const l0 = this.addLine(p0, p1);
    const l1 = this.addLine(p1, p2);
    const l2 = this.addLine(p2, p0);
    
    return {
      corners: [p0, p1, p2],
      sides: [l0, l1, l2],
    };
  }
  
  /**
   * Create a regular polygon in the sketch
   */
  addPolygon(
    x: number,
    y: number,
    radius: number,
    sides: number
  ): {
    corners: SketchPointId[];
    edges: SketchEntityId[];
  } {
    const corners: SketchPointId[] = [];
    const edges: SketchEntityId[] = [];
    
    for (let i = 0; i < sides; i++) {
      const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      corners.push(this.addPoint(px, py));
    }
    
    for (let i = 0; i < sides; i++) {
      edges.push(this.addLine(corners[i], corners[(i + 1) % sides]));
    }
    
    return { corners, edges };
  }
  
  // ==========================================================================
  // Utilities
  // ==========================================================================
  
  /**
   * Clone this sketch (deep copy)
   */
  clone(): SketchModel {
    const cloned = new SketchModel({ ...this.plane }, this.name);
    // Copy internal state (bypass ID allocation for the copy)
    (cloned as { id: SketchId }).id = this.id;
    cloned.nextPointId = this.nextPointId;
    cloned.nextEntityId = this.nextEntityId;
    
    // Clone points
    for (const [id, point] of this.points) {
      cloned.points.set(id, { ...point });
    }
    
    // Clone entities
    for (const [id, entity] of this.entities) {
      cloned.entities.set(id, { ...entity });
    }
    
    return cloned;
  }
  
  /**
   * Get all positions as a flat array [x0, y0, x1, y1, ...]
   * Only includes non-fixed points (the solver's unknowns)
   */
  getState(): number[] {
    const state: number[] = [];
    for (const point of this.points.values()) {
      if (!point.fixed) {
        state.push(point.x, point.y);
      }
    }
    return state;
  }
  
  /**
   * Set all positions from a flat array
   * Only updates non-fixed points
   */
  setState(state: number[]): void {
    let idx = 0;
    for (const point of this.points.values()) {
      if (!point.fixed) {
        point.x = state[idx++];
        point.y = state[idx++];
      }
    }
  }
  
  /**
   * Get a mapping from point IDs to state indices
   */
  getPointStateIndices(): Map<SketchPointId, number> {
    const indices = new Map<SketchPointId, number>();
    let idx = 0;
    for (const point of this.points.values()) {
      if (!point.fixed) {
        indices.set(point.id, idx);
        idx += 2;
      }
    }
    return indices;
  }
  
  /**
   * Count base degrees of freedom (before constraints)
   * Each non-fixed point contributes 2 DOF (x and y)
   */
  countBaseDOF(): number {
    return this.getFreePoints().length * 2;
  }
  
  // ==========================================================================
  // Profile Conversion
  // ==========================================================================
  
  /**
   * Convert the sketch to a SketchProfile for use in modeling operations
   * 
   * Extracts closed loops of entities and converts them to Curve2D segments.
   * 
   * @param entityIds Optional specific entities to include (defaults to all non-construction)
   * @returns A SketchProfile, or null if no valid closed loops found
   */
  toProfile(entityIds?: SketchEntityId[]): SketchProfile | null {
    // Get entities to consider
    const entities: SketchEntity[] = entityIds
      ? entityIds.map(id => this.entities.get(id)).filter((e): e is SketchEntity => e !== undefined)
      : Array.from(this.entities.values()).filter(e => !e.construction);
    
    if (entities.length === 0) return null;
    
    // Find closed loops
    const loops = this.findClosedLoops(entities);
    if (loops.length === 0) return null;
    
    // Convert to profile
    const profile = createEmptyProfile(this.plane);
    
    for (let i = 0; i < loops.length; i++) {
      const loop = loops[i];
      const curves = loop.map(entity => this.entityToCurve(entity));
      // First loop is outer, rest are holes
      addLoopToProfile(profile, curves, i === 0);
    }
    
    return profile;
  }
  
  /**
   * Find closed loops in a set of entities
   * @internal
   */
  private findClosedLoops(entities: SketchEntity[]): SketchEntity[][] {
    const loops: SketchEntity[][] = [];
    const used = new Set<SketchEntityId>();
    const tolerance = 1e-8;
    
    const getEndpoints = (entity: SketchEntity): [Vec2, Vec2] => {
      if (entity.kind === 'line') {
        const start = this.points.get(entity.start)!;
        const end = this.points.get(entity.end)!;
        return [[start.x, start.y], [end.x, end.y]];
      } else {
        const start = this.points.get(entity.start)!;
        const end = this.points.get(entity.end)!;
        return [[start.x, start.y], [end.x, end.y]];
      }
    };
    
    const pointsClose = (a: Vec2, b: Vec2): boolean => {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      return dx * dx + dy * dy < tolerance * tolerance;
    };
    
    for (const startEntity of entities) {
      if (used.has(startEntity.id)) continue;
      
      const loop: SketchEntity[] = [startEntity];
      used.add(startEntity.id);
      
      const [, loopEnd] = getEndpoints(startEntity);
      const [loopStart] = getEndpoints(startEntity);
      let currentEnd = loopEnd;
      
      let foundNext = true;
      while (foundNext) {
        foundNext = false;
        
        for (const entity of entities) {
          if (used.has(entity.id)) continue;
          
          const [eStart, eEnd] = getEndpoints(entity);
          
          if (pointsClose(currentEnd, eStart)) {
            loop.push(entity);
            used.add(entity.id);
            currentEnd = eEnd;
            foundNext = true;
            break;
          } else if (pointsClose(currentEnd, eEnd)) {
            loop.push(entity);
            used.add(entity.id);
            currentEnd = eStart;
            foundNext = true;
            break;
          }
        }
      }
      
      if (loop.length > 0 && pointsClose(currentEnd, loopStart)) {
        loops.push(loop);
      } else {
        for (const entity of loop) {
          used.delete(entity.id);
        }
      }
    }
    
    return loops;
  }
  
  /**
   * Convert a sketch entity to a Curve2D
   * @internal
   */
  private entityToCurve(entity: SketchEntity): Curve2D {
    if (entity.kind === 'line') {
      const start = this.points.get(entity.start)!;
      const end = this.points.get(entity.end)!;
      return {
        kind: 'line',
        p0: vec2(start.x, start.y),
        p1: vec2(end.x, end.y),
      };
    } else {
      const start = this.points.get(entity.start)!;
      const end = this.points.get(entity.end)!;
      const center = this.points.get(entity.center)!;
      
      const dx1 = start.x - center.x;
      const dy1 = start.y - center.y;
      const radius = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      
      const startAngle = Math.atan2(dy1, dx1);
      let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      
      // Special case: start and end points coincide -> full circle.
      // This matches SketchModel.addCircle(), which creates an arc with start=end.
      const dxSE = start.x - end.x;
      const dySE = start.y - end.y;
      if (dxSE * dxSE + dySE * dySE < 1e-16) {
        endAngle = startAngle + (entity.ccw ? 2 * Math.PI : -2 * Math.PI);
      }
      
      return {
        kind: 'arc',
        center: vec2(center.x, center.y),
        radius,
        startAngle,
        endAngle,
        ccw: entity.ccw,
      };
    }
  }
}
