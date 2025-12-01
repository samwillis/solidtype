/**
 * Sketch Creation and Manipulation
 * 
 * This module provides functions for creating and modifying sketches:
 * - Creating empty sketches on datum planes
 * - Adding points and entities
 * - Managing constraints
 * - Converting sketches to profiles for modeling operations
 */

import type { Vec2 } from '../num/vec2.js';
import type { DatumPlane } from '../model/planes.js';
import type { Curve2D, Line2D, Arc2D } from '../geom/curve2d.js';
import type { SketchProfile, ProfileLoop } from '../model/sketchProfile.js';
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
import type { Constraint } from './constraints.js';
import {
  asSketchId,
  asSketchPointId,
  asSketchEntityId,
  getSketchPoint,
  getSketchEntity,
  getAllSketchPoints,
  getAllSketchEntities,
} from './types.js';
import { vec2 } from '../num/vec2.js';
import { createEmptyProfile, addLoopToProfile } from '../model/sketchProfile.js';

// ============================================================================
// Sketch ID Allocation
// ============================================================================

import { getGlobalAllocator, resetAllIds } from './idAllocator.js';

/**
 * Allocate a new sketch ID
 * 
 * Uses the global allocator. For session-scoped allocation,
 * use an IdAllocator instance directly.
 */
export function allocateSketchId(): SketchId {
  return getGlobalAllocator().allocateSketchId();
}

/**
 * Reset sketch ID counter (for testing)
 * @internal
 * @deprecated Use resetAllIds() for full reset
 */
export function resetSketchIdCounter(): void {
  resetAllIds();
}

// ============================================================================
// Sketch Creation
// ============================================================================

/**
 * Create an empty sketch on a datum plane
 * 
 * @param plane The datum plane for the sketch
 * @param name Optional name for the sketch
 * @returns A new empty sketch
 */
export function createSketch(plane: DatumPlane, name?: string): Sketch {
  return {
    id: allocateSketchId(),
    plane,
    points: new Map(),
    entities: new Map(),
    nextPointId: 0,
    nextEntityId: 0,
    name,
  };
}

// ============================================================================
// Point Operations
// ============================================================================

/**
 * Add a point to a sketch
 * 
 * @param sketch The sketch to modify
 * @param x X coordinate
 * @param y Y coordinate
 * @param options Optional settings (fixed, externalRef, name)
 * @returns The ID of the new point
 */
export function addPoint(
  sketch: Sketch,
  x: number,
  y: number,
  options?: {
    fixed?: boolean;
    externalRef?: PersistentRef;
    name?: string;
  }
): SketchPointId {
  const id = asSketchPointId(sketch.nextPointId++);
  const point: SketchPoint = {
    id,
    x,
    y,
    fixed: options?.fixed ?? false,
    externalRef: options?.externalRef,
    name: options?.name,
  };
  sketch.points.set(id, point);
  return id;
}

/**
 * Add a fixed point to a sketch
 * 
 * @param sketch The sketch to modify
 * @param x X coordinate
 * @param y Y coordinate
 * @param name Optional name
 * @returns The ID of the new point
 */
export function addFixedPoint(
  sketch: Sketch,
  x: number,
  y: number,
  name?: string
): SketchPointId {
  return addPoint(sketch, x, y, { fixed: true, name });
}

/**
 * Update the position of a point
 * 
 * @param sketch The sketch
 * @param pointId The point to update
 * @param x New X coordinate
 * @param y New Y coordinate
 */
export function setPointPosition(
  sketch: Sketch,
  pointId: SketchPointId,
  x: number,
  y: number
): void {
  const point = getSketchPoint(sketch, pointId);
  if (point) {
    point.x = x;
    point.y = y;
  }
}

/**
 * Set whether a point is fixed
 * 
 * @param sketch The sketch
 * @param pointId The point to update
 * @param fixed Whether the point should be fixed
 */
export function setPointFixed(
  sketch: Sketch,
  pointId: SketchPointId,
  fixed: boolean
): void {
  const point = getSketchPoint(sketch, pointId);
  if (point) {
    point.fixed = fixed;
  }
}

/**
 * Attach a point to an external model reference
 * 
 * @param sketch The sketch
 * @param pointId The point to attach
 * @param ref The persistent reference to attach to
 */
export function attachPointToRef(
  sketch: Sketch,
  pointId: SketchPointId,
  ref: PersistentRef
): void {
  const point = getSketchPoint(sketch, pointId);
  if (point) {
    point.externalRef = ref;
  }
}

/**
 * Remove a point and any entities/constraints referencing it
 * 
 * @param sketch The sketch to modify
 * @param pointId The point to remove
 * @returns True if the point was removed
 */
export function removePoint(sketch: Sketch, pointId: SketchPointId): boolean {
  // Remove any entities that reference this point
  for (const [entityId, entity] of sketch.entities) {
    if (entity.kind === 'line') {
      if (entity.start === pointId || entity.end === pointId) {
        sketch.entities.delete(entityId);
      }
    } else if (entity.kind === 'arc') {
      if (entity.start === pointId || entity.end === pointId || entity.center === pointId) {
        sketch.entities.delete(entityId);
      }
    }
  }
  
  return sketch.points.delete(pointId);
}

// ============================================================================
// Line Operations
// ============================================================================

/**
 * Add a line entity to a sketch
 * 
 * @param sketch The sketch to modify
 * @param startId Start point ID
 * @param endId End point ID
 * @param options Optional settings
 * @returns The ID of the new line
 */
export function addLine(
  sketch: Sketch,
  startId: SketchPointId,
  endId: SketchPointId,
  options?: { construction?: boolean }
): SketchEntityId {
  const id = asSketchEntityId(sketch.nextEntityId++);
  const line: SketchLine = {
    kind: 'line',
    id,
    start: startId,
    end: endId,
    construction: options?.construction,
  };
  sketch.entities.set(id, line);
  return id;
}

/**
 * Add a line by coordinates (creates points automatically)
 * 
 * @param sketch The sketch to modify
 * @param x1 Start X
 * @param y1 Start Y
 * @param x2 End X
 * @param y2 End Y
 * @param options Optional settings
 * @returns Object with point IDs and line ID
 */
export function addLineByCoords(
  sketch: Sketch,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options?: { construction?: boolean }
): { start: SketchPointId; end: SketchPointId; line: SketchEntityId } {
  const start = addPoint(sketch, x1, y1);
  const end = addPoint(sketch, x2, y2);
  const line = addLine(sketch, start, end, options);
  return { start, end, line };
}

// ============================================================================
// Arc Operations
// ============================================================================

/**
 * Add an arc entity to a sketch
 * 
 * @param sketch The sketch to modify
 * @param startId Start point ID
 * @param endId End point ID
 * @param centerId Center point ID
 * @param ccw Counter-clockwise direction
 * @param options Optional settings
 * @returns The ID of the new arc
 */
export function addArc(
  sketch: Sketch,
  startId: SketchPointId,
  endId: SketchPointId,
  centerId: SketchPointId,
  ccw: boolean = true,
  options?: { construction?: boolean }
): SketchEntityId {
  const id = asSketchEntityId(sketch.nextEntityId++);
  const arc: SketchArc = {
    kind: 'arc',
    id,
    start: startId,
    end: endId,
    center: centerId,
    ccw,
    construction: options?.construction,
  };
  sketch.entities.set(id, arc);
  return id;
}

/**
 * Add an arc by coordinates (creates points automatically)
 * 
 * @param sketch The sketch to modify
 * @param startX Start X
 * @param startY Start Y
 * @param endX End X
 * @param endY End Y
 * @param centerX Center X
 * @param centerY Center Y
 * @param ccw Counter-clockwise direction
 * @param options Optional settings
 * @returns Object with point IDs and arc ID
 */
export function addArcByCoords(
  sketch: Sketch,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  centerX: number,
  centerY: number,
  ccw: boolean = true,
  options?: { construction?: boolean }
): { start: SketchPointId; end: SketchPointId; center: SketchPointId; arc: SketchEntityId } {
  const start = addPoint(sketch, startX, startY);
  const end = addPoint(sketch, endX, endY);
  const center = addPoint(sketch, centerX, centerY);
  const arc = addArc(sketch, start, end, center, ccw, options);
  return { start, end, center, arc };
}

/**
 * Add a full circle (arc from 0 to 2π)
 * 
 * @param sketch The sketch to modify
 * @param centerX Center X
 * @param centerY Center Y
 * @param radius Circle radius
 * @param options Optional settings
 * @returns Object with center point ID and arc ID
 */
export function addCircle(
  sketch: Sketch,
  centerX: number,
  centerY: number,
  radius: number,
  options?: { construction?: boolean }
): { center: SketchPointId; arc: SketchEntityId } {
  // For a full circle, start and end are at the same point
  const center = addPoint(sketch, centerX, centerY);
  const startEnd = addPoint(sketch, centerX + radius, centerY);
  const arc = addArc(sketch, startEnd, startEnd, center, true, options);
  return { center, arc };
}

// ============================================================================
// Entity Operations
// ============================================================================

/**
 * Remove an entity from a sketch
 * 
 * @param sketch The sketch to modify
 * @param entityId The entity to remove
 * @returns True if the entity was removed
 */
export function removeEntity(sketch: Sketch, entityId: SketchEntityId): boolean {
  return sketch.entities.delete(entityId);
}

/**
 * Get the line direction vector (unnormalized)
 */
export function getLineDirection(sketch: Sketch, entityId: SketchEntityId): Vec2 | null {
  const entity = getSketchEntity(sketch, entityId);
  if (!entity || entity.kind !== 'line') return null;
  
  const start = getSketchPoint(sketch, entity.start);
  const end = getSketchPoint(sketch, entity.end);
  if (!start || !end) return null;
  
  return [end.x - start.x, end.y - start.y];
}

/**
 * Get the arc radius
 */
export function getArcRadius(sketch: Sketch, entityId: SketchEntityId): number | null {
  const entity = getSketchEntity(sketch, entityId);
  if (!entity || entity.kind !== 'arc') return null;
  
  const start = getSketchPoint(sketch, entity.start);
  const center = getSketchPoint(sketch, entity.center);
  if (!start || !center) return null;
  
  const dx = start.x - center.x;
  const dy = start.y - center.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================
// Sketch Utilities
// ============================================================================

/**
 * Clone a sketch (deep copy)
 */
export function cloneSketch(sketch: Sketch): Sketch {
  const cloned: Sketch = {
    id: sketch.id,
    plane: { ...sketch.plane },
    points: new Map(),
    entities: new Map(),
    nextPointId: sketch.nextPointId,
    nextEntityId: sketch.nextEntityId,
    name: sketch.name,
  };
  
  // Clone points
  for (const [id, point] of sketch.points) {
    cloned.points.set(id, { ...point });
  }
  
  // Clone entities
  for (const [id, entity] of sketch.entities) {
    cloned.entities.set(id, { ...entity });
  }
  
  return cloned;
}

/**
 * Get all positions from a sketch as a flat array [x0, y0, x1, y1, ...]
 * Only includes non-fixed points (the solver's unknowns)
 */
export function getSketchState(sketch: Sketch): number[] {
  const state: number[] = [];
  for (const point of sketch.points.values()) {
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
export function setSketchState(sketch: Sketch, state: number[]): void {
  let idx = 0;
  for (const point of sketch.points.values()) {
    if (!point.fixed) {
      point.x = state[idx++];
      point.y = state[idx++];
    }
  }
}

/**
 * Get a mapping from point IDs to state indices
 */
export function getPointStateIndices(sketch: Sketch): Map<SketchPointId, number> {
  const indices = new Map<SketchPointId, number>();
  let idx = 0;
  for (const point of sketch.points.values()) {
    if (!point.fixed) {
      indices.set(point.id, idx);
      idx += 2; // Each point contributes x and y
    }
  }
  return indices;
}

// ============================================================================
// Profile Conversion
// ============================================================================

/**
 * Convert a sketch to a SketchProfile for use in modeling operations
 * 
 * This extracts closed loops of entities from the sketch and converts
 * them to Curve2D segments suitable for extrusion/revolution.
 * 
 * @param sketch The sketch to convert
 * @param entityIds Optional specific entities to include (defaults to all non-construction)
 * @returns A SketchProfile, or null if no valid closed loops found
 */
export function sketchToProfile(
  sketch: Sketch,
  entityIds?: SketchEntityId[]
): SketchProfile | null {
  // Get entities to consider
  const entities: SketchEntity[] = entityIds
    ? entityIds.map(id => getSketchEntity(sketch, id)).filter((e): e is SketchEntity => e !== undefined)
    : Array.from(sketch.entities.values()).filter(e => !e.construction);
  
  if (entities.length === 0) return null;
  
  // Find closed loops (simple case: assume all entities form one loop in order)
  // A more sophisticated implementation would use graph traversal
  const loops = findClosedLoops(sketch, entities);
  if (loops.length === 0) return null;
  
  // Convert to profile
  const profile = createEmptyProfile(sketch.plane);
  
  for (let i = 0; i < loops.length; i++) {
    const loop = loops[i];
    const curves = loop.map(entity => entityToCurve(sketch, entity));
    // First loop is outer, rest are holes
    addLoopToProfile(profile, curves, i === 0);
  }
  
  return profile;
}

/**
 * Find closed loops in a set of entities
 * 
 * Uses a simple algorithm that tries to chain entities by matching endpoints.
 * Returns arrays of entities forming each closed loop.
 */
function findClosedLoops(sketch: Sketch, entities: SketchEntity[]): SketchEntity[][] {
  const loops: SketchEntity[][] = [];
  const used = new Set<SketchEntityId>();
  const tolerance = 1e-8;
  
  // Helper to get endpoint positions
  function getEndpoints(entity: SketchEntity): [Vec2, Vec2] {
    if (entity.kind === 'line') {
      const start = getSketchPoint(sketch, entity.start)!;
      const end = getSketchPoint(sketch, entity.end)!;
      return [[start.x, start.y], [end.x, end.y]];
    } else {
      const start = getSketchPoint(sketch, entity.start)!;
      const end = getSketchPoint(sketch, entity.end)!;
      return [[start.x, start.y], [end.x, end.y]];
    }
  }
  
  // Helper to check if two points are close
  function pointsClose(a: Vec2, b: Vec2): boolean {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy < tolerance * tolerance;
  }
  
  // Try to build loops starting from each unused entity
  for (const startEntity of entities) {
    if (used.has(startEntity.id)) continue;
    
    const loop: SketchEntity[] = [startEntity];
    used.add(startEntity.id);
    
    const [, loopEnd] = getEndpoints(startEntity);
    const [loopStart] = getEndpoints(startEntity);
    let currentEnd = loopEnd;
    
    // Try to extend the loop
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
          // Need to traverse in reverse - for now, just add as-is
          // A more complete implementation would flip the entity
          loop.push(entity);
          used.add(entity.id);
          currentEnd = eStart;
          foundNext = true;
          break;
        }
      }
    }
    
    // Check if loop is closed
    if (loop.length > 0 && pointsClose(currentEnd, loopStart)) {
      loops.push(loop);
    } else {
      // Not a closed loop, mark entities as unused
      for (const entity of loop) {
        used.delete(entity.id);
      }
    }
  }
  
  return loops;
}

/**
 * Convert a sketch entity to a Curve2D
 */
function entityToCurve(sketch: Sketch, entity: SketchEntity): Curve2D {
  if (entity.kind === 'line') {
    const start = getSketchPoint(sketch, entity.start)!;
    const end = getSketchPoint(sketch, entity.end)!;
    return {
      kind: 'line',
      p0: vec2(start.x, start.y),
      p1: vec2(end.x, end.y),
    };
  } else {
    const start = getSketchPoint(sketch, entity.start)!;
    const end = getSketchPoint(sketch, entity.end)!;
    const center = getSketchPoint(sketch, entity.center)!;
    
    // Compute radius and angles
    const dx1 = start.x - center.x;
    const dy1 = start.y - center.y;
    const radius = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    
    const startAngle = Math.atan2(dy1, dx1);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    
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

// ============================================================================
// Common Sketch Patterns
// ============================================================================

/**
 * Create a rectangle in a sketch
 * 
 * @param sketch The sketch to modify
 * @param x Center X
 * @param y Center Y
 * @param width Rectangle width
 * @param height Rectangle height
 * @returns Object with point and line IDs
 */
export function addRectangle(
  sketch: Sketch,
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
  
  const p0 = addPoint(sketch, x - hw, y - hh);
  const p1 = addPoint(sketch, x + hw, y - hh);
  const p2 = addPoint(sketch, x + hw, y + hh);
  const p3 = addPoint(sketch, x - hw, y + hh);
  
  const l0 = addLine(sketch, p0, p1); // bottom
  const l1 = addLine(sketch, p1, p2); // right
  const l2 = addLine(sketch, p2, p3); // top
  const l3 = addLine(sketch, p3, p0); // left
  
  return {
    corners: [p0, p1, p2, p3],
    sides: [l0, l1, l2, l3],
  };
}

/**
 * Create an equilateral triangle in a sketch
 * 
 * @param sketch The sketch to modify
 * @param x Center X
 * @param y Center Y
 * @param size Side length
 * @returns Object with point and line IDs
 */
export function addTriangle(
  sketch: Sketch,
  x: number,
  y: number,
  size: number
): {
  corners: [SketchPointId, SketchPointId, SketchPointId];
  sides: [SketchEntityId, SketchEntityId, SketchEntityId];
} {
  const h = size * Math.sqrt(3) / 2;
  const r = h / 3; // Distance from center to centroid
  
  // Points positioned so centroid is at (x, y)
  const p0 = addPoint(sketch, x, y + 2 * r);
  const p1 = addPoint(sketch, x - size / 2, y - r);
  const p2 = addPoint(sketch, x + size / 2, y - r);
  
  const l0 = addLine(sketch, p0, p1);
  const l1 = addLine(sketch, p1, p2);
  const l2 = addLine(sketch, p2, p0);
  
  return {
    corners: [p0, p1, p2],
    sides: [l0, l1, l2],
  };
}

/**
 * Create a regular polygon in a sketch
 * 
 * @param sketch The sketch to modify
 * @param x Center X
 * @param y Center Y
 * @param radius Distance from center to vertices
 * @param sides Number of sides
 * @returns Object with point and line IDs
 */
export function addPolygon(
  sketch: Sketch,
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
    corners.push(addPoint(sketch, px, py));
  }
  
  for (let i = 0; i < sides; i++) {
    edges.push(addLine(sketch, corners[i], corners[(i + 1) % sides]));
  }
  
  return { corners, edges };
}
