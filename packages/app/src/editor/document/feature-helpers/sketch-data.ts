/**
 * Sketch Data Manipulation
 *
 * Functions for working with sketch data in Yjs maps:
 * - Reading/writing sketch points, entities, and constraints
 * - Converting between record-based and array-based formats
 */

import * as Y from "yjs";
import {
  uuid,
  getPointsById,
  getEntitiesById,
  getConstraintsById,
  sketchDataMapToObject,
} from "../yjs";
import type {
  SketchData,
  SketchPoint,
  SketchEntity,
  SketchConstraint,
} from "../schema";

// Type for constraint creation (no id yet)
type WithoutId<T> = T extends { id: string } ? Omit<T, "id"> : never;
export type NewSketchConstraint = WithoutId<SketchConstraint>;

/**
 * Sketch data in the legacy array format (for compatibility with existing code)
 */
export interface SketchDataArrays {
  points: SketchPoint[];
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

/**
 * Get sketch data from a sketch feature map
 */
export function getSketchData(sketchMap: Y.Map<unknown>): SketchData {
  const dataMap = sketchMap.get("data") as Y.Map<unknown> | undefined;

  if (!dataMap) {
    return {
      pointsById: {},
      entitiesById: {},
      constraintsById: {},
    };
  }

  const { pointsById, entitiesById, constraintsById } = sketchDataMapToObject(dataMap);

  return {
    pointsById: pointsById as Record<string, SketchPoint>,
    entitiesById: entitiesById as Record<string, SketchEntity>,
    constraintsById: constraintsById as Record<string, SketchConstraint>,
  };
}

/**
 * Get sketch data as arrays (for compatibility with existing code)
 */
export function getSketchDataAsArrays(sketchMap: Y.Map<unknown>): SketchDataArrays {
  const data = getSketchData(sketchMap);
  return {
    points: Object.values(data.pointsById),
    entities: Object.values(data.entitiesById),
    constraints: Object.values(data.constraintsById),
  };
}

/**
 * Convert array-based sketch data back to record-based (for saving)
 */
export function sketchDataFromArrays(arrays: SketchDataArrays): SketchData {
  const pointsById: Record<string, SketchPoint> = {};
  const entitiesById: Record<string, SketchEntity> = {};
  const constraintsById: Record<string, SketchConstraint> = {};

  for (const point of arrays.points) {
    pointsById[point.id] = point;
  }
  for (const entity of arrays.entities) {
    entitiesById[entity.id] = entity;
  }
  for (const constraint of arrays.constraints) {
    constraintsById[constraint.id] = constraint;
  }

  return { pointsById, entitiesById, constraintsById };
}

/**
 * Add a point to a sketch
 */
export function addPointToSketch(
  sketchMap: Y.Map<unknown>,
  x: number,
  y: number,
  fixed?: boolean
): string {
  const id = uuid();

  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const pointsById = getPointsById(dataMap);

  // Create point map and integrate first
  const point = new Y.Map();
  pointsById.set(id, point);

  // Set properties after integration
  point.set("id", id);
  point.set("x", x);
  point.set("y", y);
  if (fixed !== undefined) {
    point.set("fixed", fixed);
  }

  return id;
}

/**
 * Add a line to a sketch
 */
export function addLineToSketch(
  sketchMap: Y.Map<unknown>,
  startId: string,
  endId: string,
  construction?: boolean
): string {
  const id = uuid();

  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const entitiesById = getEntitiesById(dataMap);

  const line = new Y.Map();
  entitiesById.set(id, line);

  line.set("id", id);
  line.set("type", "line");
  line.set("start", startId);
  line.set("end", endId);
  if (construction) {
    line.set("construction", true);
  }

  return id;
}

/**
 * Toggle construction mode on a sketch entity (line or arc)
 */
export function toggleEntityConstruction(
  sketchMap: Y.Map<unknown>,
  entityId: string
): boolean | null {
  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const entitiesById = getEntitiesById(dataMap);
  const entity = entitiesById.get(entityId) as Y.Map<unknown> | undefined;
  if (!entity) return null;

  const current = entity.get("construction") as boolean | undefined;
  const newValue = !current;
  if (newValue) {
    entity.set("construction", true);
  } else {
    entity.delete("construction");
  }
  return newValue;
}

/**
 * Add an arc to a sketch
 */
export function addArcToSketch(
  sketchMap: Y.Map<unknown>,
  startId: string,
  endId: string,
  centerId: string,
  ccw: boolean = true
): string {
  const id = uuid();

  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const entitiesById = getEntitiesById(dataMap);

  const arc = new Y.Map();
  entitiesById.set(id, arc);

  arc.set("id", id);
  arc.set("type", "arc");
  arc.set("start", startId);
  arc.set("end", endId);
  arc.set("center", centerId);
  arc.set("ccw", ccw);

  return id;
}

/**
 * Add a circle to a sketch (center point + radius, no edge point needed)
 */
export function addCircleToSketch(
  sketchMap: Y.Map<unknown>,
  centerId: string,
  radius: number
): string {
  const id = uuid();

  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const entitiesById = getEntitiesById(dataMap);

  const circle = new Y.Map();
  entitiesById.set(id, circle);

  circle.set("id", id);
  circle.set("type", "circle");
  circle.set("center", centerId);
  circle.set("radius", radius);

  return id;
}

/**
 * Add a constraint to a sketch
 */
export function addConstraintToSketch(
  sketchMap: Y.Map<unknown>,
  constraint: NewSketchConstraint
): string {
  const id = uuid();

  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const constraintsById = getConstraintsById(dataMap);

  const constraintMap = new Y.Map();
  constraintsById.set(id, constraintMap);

  constraintMap.set("id", id);
  constraintMap.set("type", constraint.type);

  // Set constraint-specific properties
  if ("points" in constraint) {
    constraintMap.set("points", constraint.points);
  }
  if ("point" in constraint) {
    constraintMap.set("point", constraint.point);
  }
  if ("lines" in constraint) {
    constraintMap.set("lines", constraint.lines);
  }
  if ("value" in constraint) {
    constraintMap.set("value", constraint.value);
  }
  if ("offsetX" in constraint) {
    constraintMap.set("offsetX", constraint.offsetX);
  }
  if ("offsetY" in constraint) {
    constraintMap.set("offsetY", constraint.offsetY);
  }
  if ("line" in constraint) {
    constraintMap.set("line", constraint.line);
  }
  if ("arc" in constraint) {
    constraintMap.set("arc", constraint.arc);
  }
  if ("connectionPoint" in constraint) {
    constraintMap.set("connectionPoint", constraint.connectionPoint);
  }
  if ("axis" in constraint) {
    constraintMap.set("axis", constraint.axis);
  }

  return id;
}

/**
 * Update a point's position in a sketch
 */
export function updatePointPosition(
  sketchMap: Y.Map<unknown>,
  pointId: string,
  x: number,
  y: number
): void {
  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const pointsById = getPointsById(dataMap);
  const point = pointsById.get(pointId);

  if (point) {
    point.set("x", x);
    point.set("y", y);
  }
}

/**
 * Update sketch data with solved positions
 * Called by solver writeback
 */
export function updateSketchPointPositions(
  sketchMap: Y.Map<unknown>,
  updates: Array<{ id: string; x: number; y: number }>
): void {
  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const pointsById = getPointsById(dataMap);

  for (const { id, x, y } of updates) {
    const point = pointsById.get(id);
    if (point) {
      point.set("x", x);
      point.set("y", y);
    }
  }
}

/**
 * Set complete sketch data (replaces existing)
 */
export function setSketchData(
  sketchMap: Y.Map<unknown>,
  data: {
    points: SketchPoint[];
    entities: SketchEntity[];
    constraints: SketchConstraint[];
  }
): void {
  const dataMap = sketchMap.get("data") as Y.Map<unknown>;

  // Clear existing data
  const pointsById = getPointsById(dataMap);
  const entitiesById = getEntitiesById(dataMap);
  const constraintsById = getConstraintsById(dataMap);

  pointsById.clear();
  entitiesById.clear();
  constraintsById.clear();

  // Add points
  for (const point of data.points) {
    const pointMap = new Y.Map();
    pointsById.set(point.id, pointMap);
    pointMap.set("id", point.id);
    pointMap.set("x", point.x);
    pointMap.set("y", point.y);
    if (point.fixed !== undefined) {
      pointMap.set("fixed", point.fixed);
    }
    if (point.attachedTo !== undefined) {
      pointMap.set("attachedTo", point.attachedTo);
    }
    if (point.param !== undefined) {
      pointMap.set("param", point.param);
    }
  }

  // Add entities
  for (const entity of data.entities) {
    const entityMap = new Y.Map();
    entitiesById.set(entity.id, entityMap);
    entityMap.set("id", entity.id);
    entityMap.set("type", entity.type);

    if (entity.type === "line") {
      entityMap.set("start", entity.start);
      entityMap.set("end", entity.end);
    } else if (entity.type === "arc") {
      entityMap.set("start", entity.start);
      entityMap.set("end", entity.end);
      entityMap.set("center", entity.center);
      entityMap.set("ccw", entity.ccw);
    }
  }

  // Add constraints
  for (const constraint of data.constraints) {
    const constraintMap = new Y.Map();
    constraintsById.set(constraint.id, constraintMap);
    constraintMap.set("id", constraint.id);
    constraintMap.set("type", constraint.type);

    // Set all other properties from the constraint
    for (const [key, value] of Object.entries(constraint)) {
      if (key !== "id" && key !== "type" && value !== undefined) {
        constraintMap.set(key, value);
      }
    }
  }
}
