/**
 * Helper functions for working with features in the Yjs document
 *
 * Uses Y.Map-based model (no XML). See DOCUMENT-MODEL.md.
 */

import * as Y from "yjs";
import type { SolidTypeDoc } from "./createDocument";
import { parsePlaneRef } from "./createDocument";
import {
  uuid,
  createFeatureMap,
  setMapProperties,
  createSketchDataMap,
  getPointsById,
  getEntitiesById,
  getConstraintsById,
  sketchDataMapToObject,
} from "./yjs";
import type {
  Feature,
  SketchFeature,
  ExtrudeFeature,
  RevolveFeature,
  BooleanFeature,
  OriginFeature,
  PlaneFeature,
  DatumPlaneFeature,
  AxisFeature,
  SketchData,
  SketchPoint,
  SketchEntity,
  SketchConstraint,
  SketchPlaneRef,
  DatumPlaneRole,
} from "./schema";

// ============================================================================
// Type for constraint creation (no id yet)
// ============================================================================

type WithoutId<T> = T extends { id: string } ? Omit<T, "id"> : never;
export type NewSketchConstraint = WithoutId<SketchConstraint>;

// ============================================================================
// Feature Insertion Helper
// ============================================================================

/**
 * Insert a feature ID into the feature order at the appropriate position.
 * If rebuildGate is set, inserts after the gate position; otherwise appends to end.
 * Also updates the rebuild gate to point to the newly inserted feature.
 */
export function insertFeatureAtGate(doc: SolidTypeDoc, featureId: string): void {
  const state = doc.ydoc.getMap("root").get("state") as Y.Map<unknown>;
  const rebuildGate = state.get("rebuildGate") as string | null;

  if (rebuildGate) {
    // Find the position of the rebuild gate
    const gateIndex = doc.featureOrder.toArray().indexOf(rebuildGate);
    if (gateIndex !== -1) {
      // Insert after the gate position
      doc.featureOrder.insert(gateIndex + 1, [featureId]);
      // Move the rebuild gate to the newly inserted feature
      state.set("rebuildGate", featureId);
      return;
    }
  }

  // No gate or gate not found - append to end
  doc.featureOrder.push([featureId]);
}

// ============================================================================
// Feature Finding
// ============================================================================

/**
 * Find a feature by ID
 */
export function findFeature(
  featuresById: Y.Map<Y.Map<unknown>>,
  id: string
): Y.Map<unknown> | null {
  return featuresById.get(id) ?? null;
}

/**
 * Get all feature IDs from the document (in order)
 */
export function getFeatureIds(featureOrder: Y.Array<string>): string[] {
  return featureOrder.toArray();
}

/**
 * Get features array in order
 */
export function getFeaturesArray(doc: SolidTypeDoc): Y.Map<unknown>[] {
  const result: Y.Map<unknown>[] = [];
  for (const id of doc.featureOrder.toArray()) {
    const feature = doc.featuresById.get(id);
    if (feature) {
      result.push(feature);
    }
  }
  return result;
}

// ============================================================================
// Feature Creation
// ============================================================================

/**
 * Create a new sketch feature
 */
export function addSketchFeature(doc: SolidTypeDoc, planeIdOrRole: string, name?: string): string {
  const id = uuid();

  // Parse the plane reference
  const planeRef = parsePlaneRef(doc, planeIdOrRole);

  doc.ydoc.transact(() => {
    // Create the feature map and integrate it first
    const sketch = createFeatureMap();
    doc.featuresById.set(id, sketch);

    // Create sketch data map
    const data = createSketchDataMap();

    // Set all properties
    setMapProperties(sketch, {
      id,
      type: "sketch",
      name: name ?? `Sketch${doc.featureOrder.length}`,
      plane: planeRef,
      visible: false,
      data,
    });

    // Insert at rebuild gate position (or end if no gate)
    insertFeatureAtGate(doc, id);
  });

  return id;
}

/**
 * Options for creating an extrude feature
 */
export interface ExtrudeFeatureOptions {
  sketchId: string;
  distance?: number;
  op?: "add" | "cut";
  direction?: "normal" | "reverse";
  extent?: "blind" | "toFace" | "toVertex" | "throughAll";
  extentRef?: string;
  name?: string;
  // Multi-body merge options
  mergeScope?: "auto" | "new" | "specific";
  targetBodies?: string[];
  resultBodyName?: string;
  resultBodyColor?: string;
}

/**
 * Create a new extrude feature
 */
export function addExtrudeFeature(
  doc: SolidTypeDoc,
  sketchIdOrOptions: string | ExtrudeFeatureOptions,
  distance?: number,
  op: "add" | "cut" = "add",
  direction: "normal" | "reverse" = "normal",
  name?: string
): string {
  // Support both old and new API
  const options: ExtrudeFeatureOptions =
    typeof sketchIdOrOptions === "string"
      ? { sketchId: sketchIdOrOptions, distance, op, direction, name }
      : sketchIdOrOptions;

  const id = uuid();
  const extent = options.extent ?? "blind";

  doc.ydoc.transact(() => {
    const extrude = createFeatureMap();
    doc.featuresById.set(id, extrude);

    const props: Record<string, unknown> = {
      id,
      type: "extrude",
      name: options.name ?? `Extrude${doc.featureOrder.length}`,
      sketch: options.sketchId,
      op: options.op ?? "add",
      direction: options.direction ?? "normal",
      extent,
    };

    if (extent === "blind") {
      props.distance = options.distance ?? 10;
    } else if (extent === "toFace" || extent === "toVertex") {
      if (options.extentRef) {
        props.extentRef = options.extentRef;
      }
      props.distance = options.distance ?? 10;
    }
    // throughAll doesn't need distance

    // Multi-body merge options
    if (options.mergeScope) {
      props.mergeScope = options.mergeScope;
    }
    if (options.targetBodies && options.targetBodies.length > 0) {
      props.targetBodies = options.targetBodies;
    }
    if (options.resultBodyName) {
      props.resultBodyName = options.resultBodyName;
    }
    if (options.resultBodyColor) {
      props.resultBodyColor = options.resultBodyColor;
    }

    setMapProperties(extrude, props);
    // Insert at rebuild gate position (or end if no gate)
    insertFeatureAtGate(doc, id);
  });

  return id;
}

/**
 * Options for creating a revolve feature
 */
export interface RevolveFeatureOptions {
  sketchId: string;
  axis: string;
  angle?: number;
  op?: "add" | "cut";
  name?: string;
  // Multi-body merge options
  mergeScope?: "auto" | "new" | "specific";
  targetBodies?: string[];
  resultBodyName?: string;
  resultBodyColor?: string;
}

/**
 * Create a new revolve feature
 */
export function addRevolveFeature(
  doc: SolidTypeDoc,
  sketchIdOrOptions: string | RevolveFeatureOptions,
  axis?: string,
  angle: number = 360,
  op: "add" | "cut" = "add",
  name?: string
): string {
  // Support both old and new API
  const options: RevolveFeatureOptions =
    typeof sketchIdOrOptions === "string"
      ? { sketchId: sketchIdOrOptions, axis: axis!, angle, op, name }
      : sketchIdOrOptions;

  const id = uuid();

  doc.ydoc.transact(() => {
    const revolve = createFeatureMap();
    doc.featuresById.set(id, revolve);

    const props: Record<string, unknown> = {
      id,
      type: "revolve",
      name: options.name ?? `Revolve${doc.featureOrder.length}`,
      sketch: options.sketchId,
      axis: options.axis,
      angle: options.angle ?? 360,
      op: options.op ?? "add",
    };

    // Multi-body merge options
    if (options.mergeScope) {
      props.mergeScope = options.mergeScope;
    }
    if (options.targetBodies && options.targetBodies.length > 0) {
      props.targetBodies = options.targetBodies;
    }
    if (options.resultBodyName) {
      props.resultBodyName = options.resultBodyName;
    }
    if (options.resultBodyColor) {
      props.resultBodyColor = options.resultBodyColor;
    }

    setMapProperties(revolve, props);
    // Insert at rebuild gate position (or end if no gate)
    insertFeatureAtGate(doc, id);
  });

  return id;
}

/**
 * Options for creating a boolean feature
 */
export interface BooleanFeatureOptions {
  operation: "union" | "subtract" | "intersect";
  target: string;
  tool: string;
  name?: string;
}

/**
 * Create a new boolean feature
 */
export function addBooleanFeature(doc: SolidTypeDoc, options: BooleanFeatureOptions): string {
  const id = uuid();

  doc.ydoc.transact(() => {
    const boolean = createFeatureMap();
    doc.featuresById.set(id, boolean);

    const opName = options.operation.charAt(0).toUpperCase() + options.operation.slice(1);
    setMapProperties(boolean, {
      id,
      type: "boolean",
      name: options.name ?? `${opName}${doc.featureOrder.length}`,
      operation: options.operation,
      target: options.target,
      tool: options.tool,
    });

    // Insert at rebuild gate position (or end if no gate)
    insertFeatureAtGate(doc, id);
  });

  return id;
}

/**
 * Options for creating an offset plane
 */
export interface OffsetPlaneOptions {
  /** Reference to the base plane or face */
  baseRef: SketchPlaneRef;
  /** Offset distance (positive = along normal, negative = opposite) */
  offset: number;
  /** Optional name */
  name?: string;
  /** Optional plane dimensions */
  width?: number;
  height?: number;
}

/**
 * Create a new offset plane from a datum plane or face
 */
export function addOffsetPlane(doc: SolidTypeDoc, options: OffsetPlaneOptions): string {
  const id = uuid();
  const DEFAULT_WIDTH = 100;
  const DEFAULT_HEIGHT = 100;

  // Get base plane normal and origin
  let normal: [number, number, number] = [0, 0, 1];
  let origin: [number, number, number] = [0, 0, 0];
  let xDir: [number, number, number] = [1, 0, 0];

  // Determine the definition type based on baseRef
  let definition: Record<string, unknown>;

  if (options.baseRef.kind === "planeFeatureId") {
    // Get from existing plane feature
    const basePlane = doc.featuresById.get(options.baseRef.ref);
    if (basePlane) {
      const baseNormal = basePlane.get("normal") as [number, number, number] | undefined;
      const baseOrigin = basePlane.get("origin") as [number, number, number] | undefined;
      const baseXDir = basePlane.get("xDir") as [number, number, number] | undefined;
      if (baseNormal) normal = baseNormal;
      if (baseOrigin) origin = baseOrigin;
      if (baseXDir) xDir = baseXDir;
    }
    definition = {
      kind: "offsetPlane",
      basePlaneId: options.baseRef.ref,
      distance: options.offset,
    };
  } else if (options.baseRef.kind === "faceRef") {
    // Face offset - will be resolved at runtime by the kernel
    definition = {
      kind: "offsetFace",
      faceRef: options.baseRef.ref,
      distance: options.offset,
    };
  } else {
    // Custom or unknown - default to offset plane with no base
    definition = {
      kind: "offsetPlane",
      basePlaneId: "",
      distance: options.offset,
    };
  }

  // Calculate offset origin
  const offsetOrigin: [number, number, number] = [
    origin[0] + normal[0] * options.offset,
    origin[1] + normal[1] * options.offset,
    origin[2] + normal[2] * options.offset,
  ];

  doc.ydoc.transact(() => {
    const plane = createFeatureMap();
    doc.featuresById.set(id, plane);

    setMapProperties(plane, {
      id,
      type: "plane",
      name: options.name ?? `Offset Plane ${doc.featureOrder.length}`,
      // Definition (source of truth for how plane is defined)
      definition,
      // Computed geometry (cached, updated when definition changes)
      normal,
      origin: offsetOrigin,
      xDir,
      // Display properties
      visible: true,
      width: options.width ?? DEFAULT_WIDTH,
      height: options.height ?? DEFAULT_HEIGHT,
    });

    // Insert at rebuild gate position (or end if no gate)
    insertFeatureAtGate(doc, id);
  });

  return id;
}

// ============================================================================
// Axis Feature Creation
// ============================================================================

/**
 * Options for creating an axis feature
 */
export interface AxisFeatureOptions {
  /** How the axis is defined */
  definition:
    | {
        kind: "datum";
        role: "x" | "y" | "z";
      }
    | {
        kind: "twoPoints";
        point1Ref: string;
        point2Ref: string;
      }
    | {
        kind: "sketchLine";
        sketchId: string;
        lineId: string;
      }
    | {
        kind: "edge";
        edgeRef: string;
      }
    | {
        kind: "surfaceNormal";
        faceRef: string;
        pointRef?: string;
      };
  /** Optional name */
  name?: string;
  /** Display length */
  length?: number;
  /** Display offset (position along axis direction) */
  displayOffset?: number;
}

const DEFAULT_AXIS_LENGTH = 100;

/**
 * Create a new axis feature
 */
export function addAxisFeature(doc: SolidTypeDoc, options: AxisFeatureOptions): string {
  const id = uuid();

  // Calculate origin and direction based on definition
  let origin: [number, number, number] = [0, 0, 0];
  let direction: [number, number, number] = [1, 0, 0];

  if (options.definition.kind === "datum") {
    // Datum axes go through origin
    origin = [0, 0, 0];
    switch (options.definition.role) {
      case "x":
        direction = [1, 0, 0];
        break;
      case "y":
        direction = [0, 1, 0];
        break;
      case "z":
        direction = [0, 0, 1];
        break;
    }
  }
  // For other definition types, the kernel will compute origin/direction

  doc.ydoc.transact(() => {
    const axis = createFeatureMap();
    doc.featuresById.set(id, axis);

    setMapProperties(axis, {
      id,
      type: "axis",
      name: options.name ?? `Axis ${doc.featureOrder.length}`,
      definition: options.definition,
      origin,
      direction,
      length: options.length ?? DEFAULT_AXIS_LENGTH,
      displayOffset: options.displayOffset ?? 0,
      visible: true,
    });

    // Insert at rebuild gate position (or end if no gate)
    insertFeatureAtGate(doc, id);
  });

  return id;
}

// ============================================================================
// Sketch Data Manipulation
// ============================================================================

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
 * Sketch data in the legacy array format (for compatibility with existing code)
 */
export interface SketchDataArrays {
  points: SketchPoint[];
  entities: SketchEntity[];
  constraints: SketchConstraint[];
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

// ============================================================================
// Feature Parsing
// ============================================================================

/**
 * Parse a feature map into a Feature object
 */
export function parseFeature(featureMap: Y.Map<unknown>): Feature | null {
  const type = featureMap.get("type") as string;
  const id = featureMap.get("id") as string;

  if (!id || !type) return null;

  const name = featureMap.get("name") as string | undefined;
  const suppressed = featureMap.get("suppressed") as boolean | undefined;

  switch (type) {
    case "origin":
      return {
        type: "origin",
        id,
        name,
        suppressed,
        visible: featureMap.get("visible") as boolean | undefined,
      } as OriginFeature;

    case "plane": {
      const role = featureMap.get("role") as DatumPlaneRole | undefined;
      let definition = featureMap.get("definition") as
        | { kind: string; [key: string]: unknown }
        | undefined;

      // Backward compatibility: synthesize definition from legacy role field
      if (!definition && role) {
        definition = { kind: "datum", role };
      }

      const base = {
        type: "plane" as const,
        id,
        name,
        suppressed,
        normal: featureMap.get("normal") as [number, number, number],
        origin: featureMap.get("origin") as [number, number, number],
        xDir: featureMap.get("xDir") as [number, number, number],
        visible: featureMap.get("visible") as boolean | undefined,
        width: featureMap.get("width") as number | undefined,
        height: featureMap.get("height") as number | undefined,
        offsetX: featureMap.get("offsetX") as number | undefined,
        offsetY: featureMap.get("offsetY") as number | undefined,
        displayOffsetX: featureMap.get("displayOffsetX") as number | undefined,
        displayOffsetY: featureMap.get("displayOffsetY") as number | undefined,
        color: featureMap.get("color") as string | undefined,
        definition,
      };

      if (role) {
        return { ...base, role } as DatumPlaneFeature;
      }
      return base as PlaneFeature;
    }

    case "axis": {
      const definition = featureMap.get("definition") as
        | { kind: string; [key: string]: unknown }
        | undefined;

      return {
        type: "axis",
        id,
        name,
        suppressed,
        definition,
        origin: featureMap.get("origin") as [number, number, number],
        direction: featureMap.get("direction") as [number, number, number],
        length: featureMap.get("length") as number | undefined,
        displayOffset: featureMap.get("displayOffset") as number | undefined,
        color: featureMap.get("color") as string | undefined,
        visible: featureMap.get("visible") as boolean | undefined,
      } as AxisFeature;
    }

    case "sketch": {
      const planeValue = featureMap.get("plane");
      let plane: SketchPlaneRef;

      if (typeof planeValue === "object" && planeValue !== null) {
        plane = planeValue as SketchPlaneRef;
      } else {
        // Legacy support - shouldn't happen with new docs
        plane = { kind: "custom", ref: String(planeValue) };
      }

      return {
        type: "sketch",
        id,
        name,
        suppressed,
        plane,
        visible: featureMap.get("visible") as boolean | undefined,
        data: getSketchData(featureMap),
      } as SketchFeature;
    }

    case "extrude": {
      const targetBodies = featureMap.get("targetBodies") as string[] | undefined;
      return {
        type: "extrude",
        id,
        name,
        suppressed,
        sketch: featureMap.get("sketch") as string,
        op: (featureMap.get("op") ?? "add") as "add" | "cut",
        direction: (featureMap.get("direction") ?? "normal") as "normal" | "reverse",
        extent: (featureMap.get("extent") ?? "blind") as
          | "blind"
          | "toFace"
          | "toVertex"
          | "throughAll",
        distance: featureMap.get("distance") as number | undefined,
        extentRef: featureMap.get("extentRef") as string | undefined,
        mergeScope: featureMap.get("mergeScope") as "auto" | "new" | "specific" | undefined,
        targetBodies,
        resultBodyName: featureMap.get("resultBodyName") as string | undefined,
        resultBodyColor: featureMap.get("resultBodyColor") as string | undefined,
      } as ExtrudeFeature;
    }

    case "revolve": {
      const targetBodies = featureMap.get("targetBodies") as string[] | undefined;
      return {
        type: "revolve",
        id,
        name,
        suppressed,
        sketch: featureMap.get("sketch") as string,
        axis: featureMap.get("axis") as string,
        angle: (featureMap.get("angle") ?? 360) as number,
        op: (featureMap.get("op") ?? "add") as "add" | "cut",
        mergeScope: featureMap.get("mergeScope") as "auto" | "new" | "specific" | undefined,
        targetBodies,
        resultBodyName: featureMap.get("resultBodyName") as string | undefined,
        resultBodyColor: featureMap.get("resultBodyColor") as string | undefined,
      } as RevolveFeature;
    }

    case "boolean":
      return {
        type: "boolean",
        id,
        name,
        suppressed,
        operation: (featureMap.get("operation") ?? "union") as "union" | "subtract" | "intersect",
        target: featureMap.get("target") as string,
        tool: featureMap.get("tool") as string,
      } as BooleanFeature;

    default:
      return null;
  }
}

/**
 * Get all features as parsed objects (in order)
 */
export function getAllFeatures(doc: SolidTypeDoc): Feature[] {
  const features: Feature[] = [];
  for (const id of doc.featureOrder.toArray()) {
    const featureMap = doc.featuresById.get(id);
    if (featureMap) {
      const parsed = parseFeature(featureMap);
      if (parsed) {
        features.push(parsed);
      }
    }
  }
  return features;
}

// ============================================================================
// Feature Deletion
// ============================================================================

/**
 * Delete a feature by ID
 * Returns true if deleted, false if not found or not deletable
 */
export function deleteFeature(doc: SolidTypeDoc, id: string): boolean {
  const feature = doc.featuresById.get(id);
  if (!feature) return false;

  const type = feature.get("type");
  const role = feature.get("role");

  // Don't allow deleting origin or datum planes
  if (type === "origin" || (type === "plane" && role)) {
    return false;
  }

  doc.ydoc.transact(() => {
    // Remove from featuresById
    doc.featuresById.delete(id);

    // Remove from featureOrder
    const orderArray = doc.featureOrder.toArray();
    const index = orderArray.indexOf(id);
    if (index !== -1) {
      doc.featureOrder.delete(index, 1);
    }
  });

  return true;
}

/**
 * Rename a feature
 */
export function renameFeature(doc: SolidTypeDoc, id: string, name: string): boolean {
  const feature = doc.featuresById.get(id);
  if (!feature) return false;

  feature.set("name", name);
  return true;
}

/**
 * Toggle the visibility of a feature (for hiding/showing bodies, sketches, etc.)
 */
export function toggleFeatureVisibility(doc: SolidTypeDoc, id: string): boolean {
  const feature = doc.featuresById.get(id);
  if (!feature) return false;

  const currentVisible = feature.get("visible") as boolean | undefined;
  // Default to visible if not set, then toggle
  feature.set("visible", currentVisible === false ? true : false);
  return true;
}

/**
 * Set the visibility of a feature explicitly
 */
export function setFeatureVisibility(doc: SolidTypeDoc, id: string, visible: boolean): boolean {
  const feature = doc.featuresById.get(id);
  if (!feature) return false;

  feature.set("visible", visible);
  return true;
}
