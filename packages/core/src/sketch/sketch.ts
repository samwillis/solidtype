/**
 * Sketch Creation and Manipulation - Backward Compatibility Layer
 * 
 * This module provides functional wrappers around the SketchModel class
 * for backward compatibility with existing code.
 * 
 * New code should use the SketchModel class directly from ./SketchModel.js
 */

import type { Vec2 } from '../num/vec2.js';
import type { DatumPlane } from '../model/planes.js';
import type { SketchProfile } from '../model/sketchProfile.js';
import type { PersistentRef } from '../naming/types.js';
import type {
  Sketch,
  SketchId,
  SketchPointId,
  SketchEntityId,
  SketchPoint,
} from './types.js';
import { SketchModel } from './SketchModel.js';

// Re-export SketchModel as the primary API
export { SketchModel } from './SketchModel.js';

// ============================================================================
// Sketch ID Allocation
// ============================================================================

import { getGlobalAllocator, resetAllIds } from './idAllocator.js';

/**
 * Allocate a new sketch ID
 * 
 * @deprecated Use new SketchModel(plane) instead
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
 * @deprecated Use new SketchModel(plane, name) instead
 */
export function createSketch(plane: DatumPlane, name?: string): Sketch {
  return new SketchModel(plane, name);
}

// ============================================================================
// Point Operations
// ============================================================================

/**
 * Add a point to a sketch
 * 
 * @deprecated Use sketch.addPoint() instead
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
  if (sketch instanceof SketchModel) {
    return sketch.addPoint(x, y, options);
  }
  // Fallback for plain objects
  const { asSketchPointId } = require('./types.js');
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
 * @deprecated Use sketch.addFixedPoint() instead
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
 * @deprecated Use sketch.setPointPosition() instead
 */
export function setPointPosition(
  sketch: Sketch,
  pointId: SketchPointId,
  x: number,
  y: number
): void {
  if (sketch instanceof SketchModel) {
    sketch.setPointPosition(pointId, x, y);
    return;
  }
  const point = sketch.points.get(pointId);
  if (point) {
    point.x = x;
    point.y = y;
  }
}

/**
 * Set whether a point is fixed
 * 
 * @deprecated Use sketch.setPointFixed() instead
 */
export function setPointFixed(
  sketch: Sketch,
  pointId: SketchPointId,
  fixed: boolean
): void {
  if (sketch instanceof SketchModel) {
    sketch.setPointFixed(pointId, fixed);
    return;
  }
  const point = sketch.points.get(pointId);
  if (point) {
    point.fixed = fixed;
  }
}

/**
 * Attach a point to an external model reference
 * 
 * @deprecated Use sketch.attachPointToRef() instead
 */
export function attachPointToRef(
  sketch: Sketch,
  pointId: SketchPointId,
  ref: PersistentRef
): void {
  if (sketch instanceof SketchModel) {
    sketch.attachPointToRef(pointId, ref);
    return;
  }
  const point = sketch.points.get(pointId);
  if (point) {
    point.externalRef = ref;
  }
}

/**
 * Remove a point and any entities/constraints referencing it
 * 
 * @deprecated Use sketch.removePoint() instead
 */
export function removePoint(sketch: Sketch, pointId: SketchPointId): boolean {
  if (sketch instanceof SketchModel) {
    return sketch.removePoint(pointId);
  }
  // Fallback for plain objects
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
 * @deprecated Use sketch.addLine() instead
 */
export function addLine(
  sketch: Sketch,
  startId: SketchPointId,
  endId: SketchPointId,
  options?: { construction?: boolean }
): SketchEntityId {
  if (sketch instanceof SketchModel) {
    return sketch.addLine(startId, endId, options);
  }
  const { asSketchEntityId } = require('./types.js');
  const id = asSketchEntityId(sketch.nextEntityId++);
  const line = {
    kind: 'line' as const,
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
 * @deprecated Use sketch.addLineByCoords() instead
 */
export function addLineByCoords(
  sketch: Sketch,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options?: { construction?: boolean }
): { start: SketchPointId; end: SketchPointId; line: SketchEntityId } {
  if (sketch instanceof SketchModel) {
    return sketch.addLineByCoords(x1, y1, x2, y2, options);
  }
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
 * @deprecated Use sketch.addArc() instead
 */
export function addArc(
  sketch: Sketch,
  startId: SketchPointId,
  endId: SketchPointId,
  centerId: SketchPointId,
  ccw: boolean = true,
  options?: { construction?: boolean }
): SketchEntityId {
  if (sketch instanceof SketchModel) {
    return sketch.addArc(startId, endId, centerId, ccw, options);
  }
  const { asSketchEntityId } = require('./types.js');
  const id = asSketchEntityId(sketch.nextEntityId++);
  const arc = {
    kind: 'arc' as const,
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
 * @deprecated Use sketch.addArcByCoords() instead
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
  if (sketch instanceof SketchModel) {
    return sketch.addArcByCoords(startX, startY, endX, endY, centerX, centerY, ccw, options);
  }
  const start = addPoint(sketch, startX, startY);
  const end = addPoint(sketch, endX, endY);
  const center = addPoint(sketch, centerX, centerY);
  const arc = addArc(sketch, start, end, center, ccw, options);
  return { start, end, center, arc };
}

/**
 * Add a full circle (arc from 0 to 2π)
 * 
 * @deprecated Use sketch.addCircle() instead
 */
export function addCircle(
  sketch: Sketch,
  centerX: number,
  centerY: number,
  radius: number,
  options?: { construction?: boolean }
): { center: SketchPointId; arc: SketchEntityId } {
  if (sketch instanceof SketchModel) {
    return sketch.addCircle(centerX, centerY, radius, options);
  }
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
 * @deprecated Use sketch.removeEntity() instead
 */
export function removeEntity(sketch: Sketch, entityId: SketchEntityId): boolean {
  if (sketch instanceof SketchModel) {
    return sketch.removeEntity(entityId);
  }
  return sketch.entities.delete(entityId);
}

/**
 * Get the line direction vector (unnormalized)
 * 
 * @deprecated Use sketch.getLineDirection() instead
 */
export function getLineDirection(sketch: Sketch, entityId: SketchEntityId): Vec2 | null {
  if (sketch instanceof SketchModel) {
    return sketch.getLineDirection(entityId);
  }
  const entity = sketch.entities.get(entityId);
  if (!entity || entity.kind !== 'line') return null;
  
  const start = sketch.points.get(entity.start);
  const end = sketch.points.get(entity.end);
  if (!start || !end) return null;
  
  return [end.x - start.x, end.y - start.y];
}

/**
 * Get the arc radius
 * 
 * @deprecated Use sketch.getArcRadius() instead
 */
export function getArcRadius(sketch: Sketch, entityId: SketchEntityId): number | null {
  if (sketch instanceof SketchModel) {
    return sketch.getArcRadius(entityId);
  }
  const entity = sketch.entities.get(entityId);
  if (!entity || entity.kind !== 'arc') return null;
  
  const start = sketch.points.get(entity.start);
  const center = sketch.points.get((entity as any).center);
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
 * 
 * @deprecated Use sketch.clone() instead
 */
export function cloneSketch(sketch: Sketch): Sketch {
  if (sketch instanceof SketchModel) {
    return sketch.clone();
  }
  const cloned: Sketch = {
    id: sketch.id,
    plane: { ...sketch.plane },
    points: new Map(),
    entities: new Map(),
    nextPointId: sketch.nextPointId,
    nextEntityId: sketch.nextEntityId,
    name: sketch.name,
  };
  
  for (const [id, point] of sketch.points) {
    cloned.points.set(id, { ...point });
  }
  
  for (const [id, entity] of sketch.entities) {
    cloned.entities.set(id, { ...entity });
  }
  
  return cloned;
}

/**
 * Get all positions from a sketch as a flat array
 * 
 * @deprecated Use sketch.getState() instead
 */
export function getSketchState(sketch: Sketch): number[] {
  if (sketch instanceof SketchModel) {
    return sketch.getState();
  }
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
 * 
 * @deprecated Use sketch.setState() instead
 */
export function setSketchState(sketch: Sketch, state: number[]): void {
  if (sketch instanceof SketchModel) {
    sketch.setState(state);
    return;
  }
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
 * 
 * @deprecated Use sketch.getPointStateIndices() instead
 */
export function getPointStateIndices(sketch: Sketch): Map<SketchPointId, number> {
  if (sketch instanceof SketchModel) {
    return sketch.getPointStateIndices();
  }
  const indices = new Map<SketchPointId, number>();
  let idx = 0;
  for (const point of sketch.points.values()) {
    if (!point.fixed) {
      indices.set(point.id, idx);
      idx += 2;
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
 * @deprecated Use sketch.toProfile() instead
 */
export function sketchToProfile(
  sketch: Sketch,
  entityIds?: SketchEntityId[]
): SketchProfile | null {
  if (sketch instanceof SketchModel) {
    return sketch.toProfile(entityIds);
  }
  // For plain objects, create a temporary SketchModel and convert
  const temp = new SketchModel(sketch.plane, sketch.name);
  (temp as any).id = sketch.id;
  temp.nextPointId = sketch.nextPointId;
  temp.nextEntityId = sketch.nextEntityId;
  for (const [id, point] of sketch.points) {
    temp.points.set(id, { ...point });
  }
  for (const [id, entity] of sketch.entities) {
    temp.entities.set(id, { ...entity });
  }
  return temp.toProfile(entityIds);
}

// ============================================================================
// Common Sketch Patterns
// ============================================================================

/**
 * Create a rectangle in a sketch
 * 
 * @deprecated Use sketch.addRectangle() instead
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
  if (sketch instanceof SketchModel) {
    return sketch.addRectangle(x, y, width, height);
  }
  const hw = width / 2;
  const hh = height / 2;
  
  const p0 = addPoint(sketch, x - hw, y - hh);
  const p1 = addPoint(sketch, x + hw, y - hh);
  const p2 = addPoint(sketch, x + hw, y + hh);
  const p3 = addPoint(sketch, x - hw, y + hh);
  
  const l0 = addLine(sketch, p0, p1);
  const l1 = addLine(sketch, p1, p2);
  const l2 = addLine(sketch, p2, p3);
  const l3 = addLine(sketch, p3, p0);
  
  return {
    corners: [p0, p1, p2, p3],
    sides: [l0, l1, l2, l3],
  };
}

/**
 * Create an equilateral triangle in a sketch
 * 
 * @deprecated Use sketch.addTriangle() instead
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
  if (sketch instanceof SketchModel) {
    return sketch.addTriangle(x, y, size);
  }
  const h = size * Math.sqrt(3) / 2;
  const r = h / 3;
  
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
 * @deprecated Use sketch.addPolygon() instead
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
  if (sketch instanceof SketchModel) {
    return sketch.addPolygon(x, y, radius, sides);
  }
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
