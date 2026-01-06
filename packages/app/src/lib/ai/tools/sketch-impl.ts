/**
 * Sketch Tool Implementations
 *
 * Local implementations for sketch tools. These execute in the browser/worker
 * where the Yjs document is available. Each tool receives the document and
 * sketch context to perform operations.
 */

import * as Y from "yjs";
import type { SolidTypeDoc } from "../../../editor/document";
import {
  addPointToSketch,
  addLineToSketch,
  addArcToSketch,
  addCircleToSketch,
  addConstraintToSketch,
  updatePointPosition,
  getSketchData,
  getSketchDataAsArrays,
  setSketchData,
  toggleEntityConstruction,
  type NewSketchConstraint,
} from "../../../editor/document/feature-helpers/sketch-data";
import { addSketchFeature } from "../../../editor/document/featureHelpers";
import { findDatumPlaneByRole } from "../../../editor/document/createDocument";
import { serializeSketchContext } from "../context/sketch-context";
import type { SketchConstraint } from "../../../editor/document/schema";

/**
 * Context passed to sketch tool implementations
 */
export interface SketchToolContext {
  doc: SolidTypeDoc;
  activeSketchId: string | null;
  /** Callback to enter sketch mode (for UI sync) */
  onEnterSketch?: (sketchId: string, planeId: string) => void;
  /** Callback to exit sketch mode (for UI sync) */
  onExitSketch?: () => void;
}

/**
 * Helper to get the active sketch Y.Map
 */
function getActiveSketchMap(ctx: SketchToolContext): Y.Map<unknown> | null {
  if (!ctx.activeSketchId) return null;
  return ctx.doc.featuresById.get(ctx.activeSketchId) ?? null;
}

/**
 * Calculate solver status based on degrees of freedom (simplified)
 */
function calculateSolverStatus(
  sketch: Y.Map<unknown>
): "solved" | "underconstrained" | "overconstrained" | "inconsistent" {
  const data = getSketchDataAsArrays(sketch);
  const pointCount = data.points.length;
  const constraintCount = data.constraints.length;
  const estimatedDOF = Math.max(0, pointCount * 2 - constraintCount);

  if (estimatedDOF === 0) return "solved";
  if (estimatedDOF < 0) return "overconstrained";
  return "underconstrained";
}

// ============ Lifecycle Tool Implementations ============

export function createSketchImpl(
  ctx: SketchToolContext,
  input: {
    planeType: "planeFeatureId" | "faceRef" | "datumRole";
    planeRef: string;
    name?: string;
    enterSketch?: boolean;
  }
): { sketchId: string; entered: boolean } {
  let planeIdOrRole: string;

  if (input.planeType === "datumRole") {
    // Use the role directly (e.g., "xy", "xz", "yz")
    planeIdOrRole = input.planeRef;
  } else if (input.planeType === "planeFeatureId") {
    planeIdOrRole = input.planeRef;
  } else {
    // faceRef - pass through
    planeIdOrRole = input.planeRef;
  }

  const sketchId = addSketchFeature(ctx.doc, planeIdOrRole, input.name);
  const entered = input.enterSketch !== false;

  if (entered && ctx.onEnterSketch) {
    // Resolve the actual plane ID for UI
    let planeId = planeIdOrRole;
    if (input.planeType === "datumRole") {
      const resolved = findDatumPlaneByRole(ctx.doc, input.planeRef as "xy" | "xz" | "yz");
      if (resolved) planeId = resolved;
    }
    ctx.onEnterSketch(sketchId, planeId);
  }

  return { sketchId, entered };
}

export function enterSketchImpl(
  ctx: SketchToolContext,
  input: { sketchId: string }
): { success: boolean; sketchId: string } {
  const sketch = ctx.doc.featuresById.get(input.sketchId);
  if (!sketch || sketch.get("type") !== "sketch") {
    return { success: false, sketchId: input.sketchId };
  }

  const plane = sketch.get("plane") as { kind: string; ref: string } | undefined;
  const planeId = plane?.ref || "";

  if (ctx.onEnterSketch) {
    ctx.onEnterSketch(input.sketchId, planeId);
  }

  return { success: true, sketchId: input.sketchId };
}

export function exitSketchImpl(ctx: SketchToolContext): {
  success: boolean;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
} {
  const sketch = getActiveSketchMap(ctx);
  const solverStatus = sketch ? calculateSolverStatus(sketch) : "underconstrained";

  if (ctx.onExitSketch) {
    ctx.onExitSketch();
  }

  return { success: true, solverStatus };
}

export function getSketchStatusImpl(ctx: SketchToolContext): {
  sketchId: string;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
  degreesOfFreedom: number;
  pointCount: number;
  entityCount: number;
  constraintCount: number;
} {
  if (!ctx.activeSketchId) {
    return {
      sketchId: "",
      solverStatus: "underconstrained",
      degreesOfFreedom: 0,
      pointCount: 0,
      entityCount: 0,
      constraintCount: 0,
    };
  }

  const context = serializeSketchContext(ctx.doc, ctx.activeSketchId);
  if (!context) {
    return {
      sketchId: ctx.activeSketchId,
      solverStatus: "underconstrained",
      degreesOfFreedom: 0,
      pointCount: 0,
      entityCount: 0,
      constraintCount: 0,
    };
  }

  return {
    sketchId: context.sketchId,
    solverStatus: context.solverStatus,
    degreesOfFreedom: context.degreesOfFreedom,
    pointCount: context.points.length,
    entityCount: context.entities.length,
    constraintCount: context.constraints.length,
  };
}

// ============ Geometry Creation Implementations ============

export function addLineImpl(
  ctx: SketchToolContext,
  input: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    startPointId?: string;
    endPointId?: string;
    construction?: boolean;
  }
): { lineId: string; startPointId: string; endPointId: string } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  ctx.doc.ydoc.transact(() => {
    // Create or reuse start point
    const startPtId = input.startPointId || addPointToSketch(sketch, input.start.x, input.start.y);

    // Create or reuse end point
    const endPtId = input.endPointId || addPointToSketch(sketch, input.end.x, input.end.y);

    // Create line
    const lineId = addLineToSketch(sketch, startPtId, endPtId, input.construction);

    return { lineId, startPointId: startPtId, endPointId: endPtId };
  });

  // Re-execute outside transaction to get final IDs
  const startPtId = input.startPointId || "";
  const endPtId = input.endPointId || "";

  // Get the actual IDs from the sketch data
  const data = getSketchDataAsArrays(sketch);
  const lines = data.entities.filter((e) => e.type === "line");
  const lastLine = lines[lines.length - 1];

  if (lastLine && lastLine.type === "line") {
    return {
      lineId: lastLine.id,
      startPointId: lastLine.start,
      endPointId: lastLine.end,
    };
  }

  return { lineId: "", startPointId: startPtId, endPointId: endPtId };
}

export function addCircleImpl(
  ctx: SketchToolContext,
  input: {
    center: { x: number; y: number };
    radius: number;
    centerPointId?: string;
    construction?: boolean;
  }
): { circleId: string; centerPointId: string } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  let centerPtId: string;
  let circleId: string;

  ctx.doc.ydoc.transact(() => {
    centerPtId = input.centerPointId || addPointToSketch(sketch, input.center.x, input.center.y);
    circleId = addCircleToSketch(sketch, centerPtId, input.radius);
  });

  // Get the actual IDs
  const data = getSketchDataAsArrays(sketch);
  const circles = data.entities.filter((e) => e.type === "circle");
  const lastCircle = circles[circles.length - 1];

  if (lastCircle && lastCircle.type === "circle") {
    return {
      circleId: lastCircle.id,
      centerPointId: lastCircle.center,
    };
  }

  return { circleId: "", centerPointId: "" };
}

export function addArcImpl(
  ctx: SketchToolContext,
  input: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    center: { x: number; y: number };
    ccw?: boolean;
    startPointId?: string;
    endPointId?: string;
    centerPointId?: string;
    construction?: boolean;
  }
): { arcId: string; startPointId: string; endPointId: string; centerPointId: string } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  ctx.doc.ydoc.transact(() => {
    const startPtId = input.startPointId || addPointToSketch(sketch, input.start.x, input.start.y);
    const endPtId = input.endPointId || addPointToSketch(sketch, input.end.x, input.end.y);
    const centerPtId =
      input.centerPointId || addPointToSketch(sketch, input.center.x, input.center.y);
    addArcToSketch(sketch, startPtId, endPtId, centerPtId, input.ccw !== false);
  });

  // Get the actual IDs
  const data = getSketchDataAsArrays(sketch);
  const arcs = data.entities.filter((e) => e.type === "arc");
  const lastArc = arcs[arcs.length - 1];

  if (lastArc && lastArc.type === "arc") {
    return {
      arcId: lastArc.id,
      startPointId: lastArc.start,
      endPointId: lastArc.end,
      centerPointId: lastArc.center,
    };
  }

  return { arcId: "", startPointId: "", endPointId: "", centerPointId: "" };
}

export function addRectangleImpl(
  ctx: SketchToolContext,
  input: {
    corner1: { x: number; y: number };
    corner2: { x: number; y: number };
    centered?: boolean;
    construction?: boolean;
  }
): { lineIds: string[]; pointIds: string[]; constraintIds: string[] } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  const lineIds: string[] = [];
  const pointIds: string[] = [];
  const constraintIds: string[] = [];

  ctx.doc.ydoc.transact(() => {
    let x1: number, y1: number, x2: number, y2: number;

    if (input.centered) {
      // corner1 is center, corner2 is half-size
      x1 = input.corner1.x - Math.abs(input.corner2.x);
      y1 = input.corner1.y - Math.abs(input.corner2.y);
      x2 = input.corner1.x + Math.abs(input.corner2.x);
      y2 = input.corner1.y + Math.abs(input.corner2.y);
    } else {
      x1 = Math.min(input.corner1.x, input.corner2.x);
      y1 = Math.min(input.corner1.y, input.corner2.y);
      x2 = Math.max(input.corner1.x, input.corner2.x);
      y2 = Math.max(input.corner1.y, input.corner2.y);
    }

    // Create 4 corner points
    const p1 = addPointToSketch(sketch, x1, y1); // bottom-left
    const p2 = addPointToSketch(sketch, x2, y1); // bottom-right
    const p3 = addPointToSketch(sketch, x2, y2); // top-right
    const p4 = addPointToSketch(sketch, x1, y2); // top-left

    pointIds.push(p1, p2, p3, p4);

    // Create 4 lines
    const l1 = addLineToSketch(sketch, p1, p2, input.construction); // bottom
    const l2 = addLineToSketch(sketch, p2, p3, input.construction); // right
    const l3 = addLineToSketch(sketch, p3, p4, input.construction); // top
    const l4 = addLineToSketch(sketch, p4, p1, input.construction); // left

    lineIds.push(l1, l2, l3, l4);

    // Add horizontal/vertical constraints
    const c1 = addConstraintToSketch(sketch, { type: "horizontal", points: [p1, p2] });
    const c2 = addConstraintToSketch(sketch, { type: "vertical", points: [p2, p3] });
    const c3 = addConstraintToSketch(sketch, { type: "horizontal", points: [p3, p4] });
    const c4 = addConstraintToSketch(sketch, { type: "vertical", points: [p4, p1] });

    constraintIds.push(c1, c2, c3, c4);
  });

  return { lineIds, pointIds, constraintIds };
}

export function addPolygonImpl(
  ctx: SketchToolContext,
  input: {
    center: { x: number; y: number };
    radius: number;
    sides: number;
    rotation?: number;
    construction?: boolean;
  }
): { lineIds: string[]; pointIds: string[] } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  const lineIds: string[] = [];
  const pointIds: string[] = [];

  ctx.doc.ydoc.transact(() => {
    const { center, radius, sides, rotation = 0 } = input;
    const angleStep = (2 * Math.PI) / sides;
    const startAngle = (rotation * Math.PI) / 180;

    // Create vertices
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + i * angleStep;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      const pointId = addPointToSketch(sketch, x, y);
      pointIds.push(pointId);
    }

    // Create edges
    for (let i = 0; i < sides; i++) {
      const startId = pointIds[i];
      const endId = pointIds[(i + 1) % sides];
      const lineId = addLineToSketch(sketch, startId, endId, input.construction);
      lineIds.push(lineId);
    }
  });

  return { lineIds, pointIds };
}

export function addSlotImpl(
  ctx: SketchToolContext,
  input: {
    center: { x: number; y: number };
    length: number;
    width: number;
    angle?: number;
    construction?: boolean;
  }
): { lineIds: string[]; arcIds: string[]; pointIds: string[] } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  const lineIds: string[] = [];
  const arcIds: string[] = [];
  const pointIds: string[] = [];

  ctx.doc.ydoc.transact(() => {
    const { center, length, width, angle = 0 } = input;
    const halfLength = length / 2;
    const halfWidth = width / 2;
    const rad = (angle * Math.PI) / 180;

    // Direction vectors
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const nx = -dy; // Normal (perpendicular)
    const ny = dx;

    // Calculate key points
    // Arc centers at ends
    const leftCenterX = center.x - (halfLength - halfWidth) * dx;
    const leftCenterY = center.y - (halfLength - halfWidth) * dy;
    const rightCenterX = center.x + (halfLength - halfWidth) * dx;
    const rightCenterY = center.y + (halfLength - halfWidth) * dy;

    // Arc endpoints
    const p1x = leftCenterX + halfWidth * nx;
    const p1y = leftCenterY + halfWidth * ny;
    const p2x = rightCenterX + halfWidth * nx;
    const p2y = rightCenterY + halfWidth * ny;
    const p3x = rightCenterX - halfWidth * nx;
    const p3y = rightCenterY - halfWidth * ny;
    const p4x = leftCenterX - halfWidth * nx;
    const p4y = leftCenterY - halfWidth * ny;

    // Create points
    const p1 = addPointToSketch(sketch, p1x, p1y); // top-left
    const p2 = addPointToSketch(sketch, p2x, p2y); // top-right
    const p3 = addPointToSketch(sketch, p3x, p3y); // bottom-right
    const p4 = addPointToSketch(sketch, p4x, p4y); // bottom-left
    const leftCenter = addPointToSketch(sketch, leftCenterX, leftCenterY);
    const rightCenter = addPointToSketch(sketch, rightCenterX, rightCenterY);

    pointIds.push(p1, p2, p3, p4, leftCenter, rightCenter);

    // Create top and bottom lines
    const topLine = addLineToSketch(sketch, p1, p2, input.construction);
    const bottomLine = addLineToSketch(sketch, p3, p4, input.construction);
    lineIds.push(topLine, bottomLine);

    // Create arcs at ends
    const rightArc = addArcToSketch(sketch, p2, p3, rightCenter, true);
    const leftArc = addArcToSketch(sketch, p4, p1, leftCenter, true);
    arcIds.push(rightArc, leftArc);
  });

  return { lineIds, arcIds, pointIds };
}

// ============ Point Manipulation Implementations ============

export function addPointImpl(
  ctx: SketchToolContext,
  input: { x: number; y: number; fixed?: boolean }
): { pointId: string } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  const pointId = addPointToSketch(sketch, input.x, input.y, input.fixed);
  return { pointId };
}

export function movePointImpl(
  ctx: SketchToolContext,
  input: { pointId: string; x: number; y: number }
): {
  success: boolean;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
} {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { success: false, solverStatus: "underconstrained" };
  }

  updatePointPosition(sketch, input.pointId, input.x, input.y);
  const solverStatus = calculateSolverStatus(sketch);

  return { success: true, solverStatus };
}

export function mergePointsImpl(
  ctx: SketchToolContext,
  input: { keepPointId: string; removePointId: string }
): { success: boolean; constraintId: string } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { success: false, constraintId: "" };
  }

  // Add a coincident constraint between the two points
  const constraintId = addConstraintToSketch(sketch, {
    type: "coincident",
    points: [input.keepPointId, input.removePointId],
  });

  return { success: true, constraintId };
}

// ============ Constraint Implementations ============

// Flattened constraint input (OpenAI doesn't support oneOf/discriminatedUnion)
type ConstraintInput = {
  type: string;
  points?: string[]; // Now array instead of tuple for OpenAI compatibility
  point?: string;
  lines?: string[]; // Now array instead of tuple for OpenAI compatibility
  line?: string;
  arc?: string;
  arcs?: string[]; // Now array instead of tuple for OpenAI compatibility
  axis?: string;
  value?: number;
};

export function addConstraintImpl(
  ctx: SketchToolContext,
  input: ConstraintInput // Now flat, not nested in { constraint: ... }
): {
  constraintId: string;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
} {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { constraintId: "", solverStatus: "underconstrained" };
  }

  // Convert arrays to tuples for the sketch helper
  const constraint: NewSketchConstraint = {
    type: input.type,
    points: input.points as [string, string] | undefined,
    point: input.point,
    lines: input.lines as [string, string] | undefined,
    line: input.line,
    arc: input.arc,
    arcs: input.arcs as [string, string] | undefined,
    axis: input.axis,
    value: input.value,
  };

  const constraintId = addConstraintToSketch(sketch, constraint);
  const solverStatus = calculateSolverStatus(sketch);

  return { constraintId, solverStatus };
}

export function removeConstraintImpl(
  ctx: SketchToolContext,
  input: { constraintId: string }
): {
  success: boolean;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
} {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { success: false, solverStatus: "underconstrained" };
  }

  ctx.doc.ydoc.transact(() => {
    const data = getSketchDataAsArrays(sketch);
    const constraints = data.constraints.filter((c) => c.id !== input.constraintId);
    setSketchData(sketch, {
      points: data.points,
      entities: data.entities,
      constraints,
    });
  });

  const solverStatus = calculateSolverStatus(sketch);
  return { success: true, solverStatus };
}

export function modifyConstraintValueImpl(
  ctx: SketchToolContext,
  input: { constraintId: string; value: number }
): {
  success: boolean;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
} {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { success: false, solverStatus: "underconstrained" };
  }

  const dataMap = sketch.get("data") as Y.Map<unknown>;
  const constraintsById = dataMap.get("constraintsById") as Y.Map<Y.Map<unknown>>;
  const constraint = constraintsById.get(input.constraintId);

  if (constraint) {
    constraint.set("value", input.value);
  }

  const solverStatus = calculateSolverStatus(sketch);
  return { success: constraint !== undefined, solverStatus };
}

// ============ Deletion Implementations ============

export function deleteEntityImpl(
  ctx: SketchToolContext,
  input: { entityId: string }
): { success: boolean; deletedConstraints: string[] } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { success: false, deletedConstraints: [] };
  }

  const deletedConstraints: string[] = [];

  ctx.doc.ydoc.transact(() => {
    const data = getSketchDataAsArrays(sketch);

    // Find constraints that reference this entity
    const constraintsToKeep = data.constraints.filter((c) => {
      const shouldDelete =
        ("line" in c && c.line === input.entityId) ||
        ("arc" in c && c.arc === input.entityId) ||
        ("lines" in c && c.lines?.includes(input.entityId)) ||
        ("arcs" in c && c.arcs?.includes(input.entityId)) ||
        ("axis" in c && c.axis === input.entityId);

      if (shouldDelete) {
        deletedConstraints.push(c.id);
        return false;
      }
      return true;
    });

    // Remove the entity
    const entitiesFiltered = data.entities.filter((e) => e.id !== input.entityId);

    setSketchData(sketch, {
      points: data.points,
      entities: entitiesFiltered,
      constraints: constraintsToKeep,
    });
  });

  return { success: true, deletedConstraints };
}

export function deletePointImpl(
  ctx: SketchToolContext,
  input: { pointId: string }
): { success: boolean; deletedEntities: string[]; deletedConstraints: string[] } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { success: false, deletedEntities: [], deletedConstraints: [] };
  }

  const deletedEntities: string[] = [];
  const deletedConstraints: string[] = [];

  ctx.doc.ydoc.transact(() => {
    const data = getSketchDataAsArrays(sketch);

    // Find entities that reference this point
    const entitiesToKeep = data.entities.filter((e) => {
      let usesPoint = false;
      if (e.type === "line") {
        usesPoint = e.start === input.pointId || e.end === input.pointId;
      } else if (e.type === "arc") {
        usesPoint =
          e.start === input.pointId || e.end === input.pointId || e.center === input.pointId;
      } else if (e.type === "circle") {
        usesPoint = e.center === input.pointId;
      }

      if (usesPoint) {
        deletedEntities.push(e.id);
        return false;
      }
      return true;
    });

    // Get set of deleted entity IDs for constraint filtering
    const deletedEntitySet = new Set(deletedEntities);

    // Find constraints that reference this point or deleted entities
    const constraintsToKeep = data.constraints.filter((c) => {
      const shouldDelete =
        ("point" in c && c.point === input.pointId) ||
        ("points" in c && c.points?.includes(input.pointId)) ||
        ("line" in c && deletedEntitySet.has(c.line)) ||
        ("arc" in c && deletedEntitySet.has(c.arc)) ||
        ("lines" in c && c.lines?.some((l) => deletedEntitySet.has(l))) ||
        ("arcs" in c && c.arcs?.some((a) => deletedEntitySet.has(a))) ||
        ("axis" in c && deletedEntitySet.has(c.axis));

      if (shouldDelete) {
        deletedConstraints.push(c.id);
        return false;
      }
      return true;
    });

    // Remove the point
    const pointsFiltered = data.points.filter((p) => p.id !== input.pointId);

    setSketchData(sketch, {
      points: pointsFiltered,
      entities: entitiesToKeep,
      constraints: constraintsToKeep,
    });
  });

  return { success: true, deletedEntities, deletedConstraints };
}

// ============ Construction Geometry Implementation ============

export function toggleConstructionImpl(
  ctx: SketchToolContext,
  input: { entityId: string }
): { success: boolean; isConstruction: boolean } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    return { success: false, isConstruction: false };
  }

  const result = toggleEntityConstruction(sketch, input.entityId);
  if (result === null) {
    return { success: false, isConstruction: false };
  }

  return { success: true, isConstruction: result };
}

// ============ Helper Tool Implementations ============

export function createCenteredRectangleImpl(
  ctx: SketchToolContext,
  input: { width: number; height: number; centerX?: number; centerY?: number }
): { lineIds: string[]; pointIds: string[]; constraintIds: string[] } {
  const { width, height, centerX = 0, centerY = 0 } = input;
  const halfW = width / 2;
  const halfH = height / 2;

  return addRectangleImpl(ctx, {
    corner1: { x: centerX - halfW, y: centerY - halfH },
    corner2: { x: centerX + halfW, y: centerY + halfH },
    centered: false,
  });
}

export function createCircleWithRadiusImpl(
  ctx: SketchToolContext,
  input: { radius: number; centerX?: number; centerY?: number }
): { circleId: string; centerPointId: string; constraintIds: string[] } {
  const { radius, centerX = 0, centerY = 0 } = input;
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  const constraintIds: string[] = [];

  const result = addCircleImpl(ctx, {
    center: { x: centerX, y: centerY },
    radius,
  });

  // Add a fixed constraint to the center if at origin
  if (centerX === 0 && centerY === 0) {
    const cId = addConstraintToSketch(sketch, {
      type: "fixed",
      point: result.centerPointId,
    });
    constraintIds.push(cId);
  }

  return { ...result, constraintIds };
}

export function createCenterlinesAtOriginImpl(
  ctx: SketchToolContext,
  input: { length?: number }
): { horizontalLineId: string; verticalLineId: string; centerPointId: string } {
  const sketch = getActiveSketchMap(ctx);
  if (!sketch) {
    throw new Error("No active sketch");
  }

  const length = input.length || 100;
  const halfLen = length / 2;

  let centerPointId: string;
  let horizontalLineId: string;
  let verticalLineId: string;

  ctx.doc.ydoc.transact(() => {
    // Create center point at origin
    centerPointId = addPointToSketch(sketch, 0, 0);

    // Create horizontal line endpoints
    const hLeft = addPointToSketch(sketch, -halfLen, 0);
    const hRight = addPointToSketch(sketch, halfLen, 0);

    // Create vertical line endpoints
    const vBottom = addPointToSketch(sketch, 0, -halfLen);
    const vTop = addPointToSketch(sketch, 0, halfLen);

    // Create construction lines
    horizontalLineId = addLineToSketch(sketch, hLeft, hRight, true);
    verticalLineId = addLineToSketch(sketch, vBottom, vTop, true);

    // Add constraints
    addConstraintToSketch(sketch, { type: "fixed", point: centerPointId });
    addConstraintToSketch(sketch, { type: "horizontal", points: [hLeft, hRight] });
    addConstraintToSketch(sketch, { type: "vertical", points: [vBottom, vTop] });
    addConstraintToSketch(sketch, {
      type: "pointOnLine",
      point: centerPointId,
      line: horizontalLineId,
    });
    addConstraintToSketch(sketch, {
      type: "pointOnLine",
      point: centerPointId,
      line: verticalLineId,
    });
  });

  return {
    horizontalLineId: horizontalLineId!,
    verticalLineId: verticalLineId!,
    centerPointId: centerPointId!,
  };
}
