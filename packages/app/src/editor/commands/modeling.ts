/**
 * Modeling Commands
 *
 * Commands for feature creation, modification, and lifecycle management.
 * These are the canonical entry points for all feature mutations - both UI and AI
 * call these functions to ensure consistent behavior.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 1
 */

import type { SolidTypeDoc } from "../document/createDocument";
import type { CommandResult } from "./types";
import { ok, err } from "./types";
import {
  addSketchFeature as addSketchFeatureHelper,
  addExtrudeFeature as addExtrudeFeatureHelper,
  addRevolveFeature as addRevolveFeatureHelper,
  addBooleanFeature as addBooleanFeatureHelper,
  addOffsetPlane as addOffsetPlaneHelper,
  addPlaneFeature as addPlaneFeatureHelper,
  addAxisFeature as addAxisFeatureHelper,
  deleteFeature as deleteFeatureHelper,
  renameFeature as renameFeatureHelper,
  toggleFeatureVisibility as toggleFeatureVisibilityHelper,
  setFeatureVisibility as setFeatureVisibilityHelper,
  type ExtrudeFeatureOptions,
  type RevolveFeatureOptions,
  type BooleanFeatureOptions,
  type OffsetPlaneOptions,
  type PlaneFeatureOptions,
  type AxisFeatureOptions,
} from "../document/featureHelpers";
import type { SketchPlaneRef } from "../document/schema";
import { findDatumPlaneByRole } from "../document/createDocument";
import {
  createMidplane as computeMidplane,
  create3PointPlane as compute3PointPlane,
  createAnglePlane as computeAnglePlane,
} from "@solidtype/core";
import { cross, normalize } from "../lib/reference-geometry";

// ============================================================================
// Sketch Commands
// ============================================================================

export interface CreateSketchArgs {
  /** Plane reference - can be a datum plane role ("xy", "xz", "yz"), plane feature ID, or face reference */
  planeRef: string;
  /** Optional name for the sketch */
  name?: string;
}

/**
 * Create a new sketch feature.
 *
 * @param doc - The SolidType document
 * @param args - Sketch creation arguments
 * @returns CommandResult with the new sketch feature ID
 */
export function createSketch(
  doc: SolidTypeDoc,
  args: CreateSketchArgs
): CommandResult<{ featureId: string }> {
  try {
    const featureId = addSketchFeatureHelper(doc, args.planeRef, args.name);
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

// ============================================================================
// Extrude Commands
// ============================================================================

export interface CreateExtrudeArgs {
  /** ID of the sketch to extrude */
  sketchId: string;
  /** Distance to extrude (for blind extent) */
  distance?: number;
  /** Operation type: add material or cut material */
  op?: "add" | "cut";
  /** Extrusion direction relative to sketch plane */
  direction?: "normal" | "reverse";
  /** Extent type */
  extent?: "blind" | "toFace" | "toVertex" | "throughAll";
  /** Reference for toFace/toVertex extents (PersistentRef string) */
  extentRef?: string;
  /** Optional name for the feature */
  name?: string;
  /** Multi-body merge scope */
  mergeScope?: "auto" | "new" | "specific";
  /** Specific target body IDs for merge (when mergeScope is "specific") */
  targetBodies?: string[];
  /** Name for the result body */
  resultBodyName?: string;
  /** Color for the result body (hex string) */
  resultBodyColor?: string;
}

/**
 * Create a new extrude feature.
 *
 * @param doc - The SolidType document
 * @param args - Extrude creation arguments
 * @returns CommandResult with the new feature ID
 */
export function createExtrude(
  doc: SolidTypeDoc,
  args: CreateExtrudeArgs
): CommandResult<{ featureId: string }> {
  // Validate sketch exists
  const sketch = doc.featuresById.get(args.sketchId);
  if (!sketch || sketch.get("type") !== "sketch") {
    return err(`Sketch ${args.sketchId} not found`);
  }

  try {
    const options: ExtrudeFeatureOptions = {
      sketchId: args.sketchId,
      distance: args.distance ?? 10,
      op: args.op ?? "add",
      direction: args.direction ?? "normal",
      extent: args.extent ?? "blind",
      extentRef: args.extentRef,
      name: args.name,
      mergeScope: args.mergeScope,
      targetBodies: args.targetBodies,
      resultBodyName: args.resultBodyName,
      resultBodyColor: args.resultBodyColor,
    };

    const featureId = addExtrudeFeatureHelper(doc, options);
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

// ============================================================================
// Revolve Commands
// ============================================================================

export interface CreateRevolveArgs {
  /** ID of the sketch to revolve */
  sketchId: string;
  /** ID of the axis line (sketch entity ID) */
  axisId: string;
  /** Angle in degrees (default: 360) */
  angle?: number;
  /** Operation type: add material or cut material */
  op?: "add" | "cut";
  /** Optional name for the feature */
  name?: string;
  /** Multi-body merge scope */
  mergeScope?: "auto" | "new" | "specific";
  /** Specific target body IDs for merge */
  targetBodies?: string[];
  /** Name for the result body */
  resultBodyName?: string;
  /** Color for the result body (hex string) */
  resultBodyColor?: string;
}

/**
 * Create a new revolve feature.
 *
 * @param doc - The SolidType document
 * @param args - Revolve creation arguments
 * @returns CommandResult with the new feature ID
 */
export function createRevolve(
  doc: SolidTypeDoc,
  args: CreateRevolveArgs
): CommandResult<{ featureId: string }> {
  // Validate sketch exists
  const sketch = doc.featuresById.get(args.sketchId);
  if (!sketch || sketch.get("type") !== "sketch") {
    return err(`Sketch ${args.sketchId} not found`);
  }

  // Validate axis is provided
  if (!args.axisId) {
    return err("Revolve requires an axis line selection");
  }

  try {
    const options: RevolveFeatureOptions = {
      sketchId: args.sketchId,
      axis: args.axisId,
      angle: args.angle ?? 360,
      op: args.op ?? "add",
      name: args.name,
      mergeScope: args.mergeScope,
      targetBodies: args.targetBodies,
      resultBodyName: args.resultBodyName,
      resultBodyColor: args.resultBodyColor,
    };

    const featureId = addRevolveFeatureHelper(doc, options);
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

// ============================================================================
// Boolean Commands
// ============================================================================

export interface CreateBooleanArgs {
  /** Boolean operation type */
  operation: "union" | "subtract" | "intersect";
  /** Target body feature ID */
  target: string;
  /** Tool body feature ID */
  tool: string;
  /** Optional name for the feature */
  name?: string;
}

/**
 * Create a new boolean feature.
 *
 * @param doc - The SolidType document
 * @param args - Boolean creation arguments
 * @returns CommandResult with the new feature ID
 */
export function createBoolean(
  doc: SolidTypeDoc,
  args: CreateBooleanArgs
): CommandResult<{ featureId: string }> {
  try {
    const options: BooleanFeatureOptions = {
      operation: args.operation,
      target: args.target,
      tool: args.tool,
      name: args.name,
    };

    const featureId = addBooleanFeatureHelper(doc, options);
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

// ============================================================================
// Offset Plane Commands
// ============================================================================

export interface CreateOffsetPlaneArgs {
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
 * Create a new offset plane from a datum plane or face.
 *
 * @param doc - The SolidType document
 * @param args - Offset plane creation arguments
 * @returns CommandResult with the new feature ID
 */
export function createOffsetPlane(
  doc: SolidTypeDoc,
  args: CreateOffsetPlaneArgs
): CommandResult<{ featureId: string }> {
  try {
    const options: OffsetPlaneOptions = {
      baseRef: args.baseRef,
      offset: args.offset,
      name: args.name,
      width: args.width,
      height: args.height,
    };

    const featureId = addOffsetPlaneHelper(doc, options);
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

// ============================================================================
// Plane Commands (Phase 28)
// ============================================================================

export interface CreatePlaneArgs extends PlaneFeatureOptions {}

export function createPlane(
  doc: SolidTypeDoc,
  args: CreatePlaneArgs
): CommandResult<{ featureId: string }> {
  try {
    const featureId = addPlaneFeatureHelper(doc, args);
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export interface CreateMidplaneArgs {
  plane1Ref: string;
  plane2Ref: string;
  name?: string;
  width?: number;
  height?: number;
}

export function createMidplane(
  doc: SolidTypeDoc,
  args: CreateMidplaneArgs
): CommandResult<{ featureId: string }> {
  const plane1 = resolvePlaneSurface(doc, args.plane1Ref);
  const plane2 = resolvePlaneSurface(doc, args.plane2Ref);
  if (!plane1 || !plane2) {
    return err("Midplane references must be valid plane features or datum planes.");
  }
  try {
    const mid = computeMidplane(plane1, plane2, args.name ?? "Midplane");
    const featureId = addPlaneFeatureHelper(doc, {
      name: args.name,
      definition: {
        kind: "midplane",
        plane1Ref: args.plane1Ref,
        plane2Ref: args.plane2Ref,
      },
      origin: mid.surface.origin,
      normal: mid.surface.normal,
      xDir: mid.surface.xDir,
      width: args.width,
      height: args.height,
    });
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export interface Create3PointPlaneArgs {
  p1: [number, number, number];
  p2: [number, number, number];
  p3: [number, number, number];
  name?: string;
  width?: number;
  height?: number;
}

export function create3PointPlane(
  doc: SolidTypeDoc,
  args: Create3PointPlaneArgs
): CommandResult<{ featureId: string }> {
  try {
    const plane = compute3PointPlane(args.p1, args.p2, args.p3, args.name ?? "3-Point Plane");
    const pointRef = (p: [number, number, number]) => `point:${p[0]},${p[1]},${p[2]}`;
    const featureId = addPlaneFeatureHelper(doc, {
      name: args.name,
      definition: {
        kind: "threePoints",
        point1Ref: pointRef(args.p1),
        point2Ref: pointRef(args.p2),
        point3Ref: pointRef(args.p3),
      },
      origin: plane.surface.origin,
      normal: plane.surface.normal,
      xDir: plane.surface.xDir,
      width: args.width,
      height: args.height,
    });
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export interface CreateAnglePlaneArgs {
  basePlaneRef: string;
  axisRef: string;
  angle: number;
  name?: string;
  width?: number;
  height?: number;
}

export function createAnglePlane(
  doc: SolidTypeDoc,
  args: CreateAnglePlaneArgs
): CommandResult<{ featureId: string }> {
  const base = resolvePlaneSurface(doc, args.basePlaneRef);
  const axisFeature = doc.featuresById.get(args.axisRef);
  if (!base || !axisFeature || axisFeature.get("type") !== "axis") {
    return err("Angle plane requires a base plane and axis feature.");
  }
  const axisOrigin = axisFeature.get("origin") as [number, number, number];
  const axisDirection = axisFeature.get("direction") as [number, number, number];
  try {
    const plane = computeAnglePlane(base, { origin: axisOrigin, direction: axisDirection }, args.angle);
    const featureId = addPlaneFeatureHelper(doc, {
      name: args.name,
      definition: {
        kind: "axisAngle",
        axisRef: args.axisRef,
        angle: args.angle,
        basePlaneRef: args.basePlaneRef,
      },
      origin: plane.surface.origin,
      normal: plane.surface.normal,
      xDir: plane.surface.xDir,
      width: args.width,
      height: args.height,
    });
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

function resolvePlaneSurface(
  doc: SolidTypeDoc,
  ref: string
): {
  kind: "plane";
  origin: [number, number, number];
  normal: [number, number, number];
  xDir: [number, number, number];
} | null {
  if (ref === "xy" || ref === "xz" || ref === "yz") {
    const planeId = findDatumPlaneByRole(doc, ref);
    if (!planeId) return null;
    ref = planeId;
  }
  const plane = doc.featuresById.get(ref);
  if (!plane || plane.get("type") !== "plane") return null;
  const origin = plane.get("origin") as [number, number, number];
  const normal = plane.get("normal") as [number, number, number];
  let xDir = plane.get("xDir") as [number, number, number] | undefined;
  if (!xDir) {
    const crossX = cross(normal, [0, 0, 1]);
    xDir = normalize(crossX[0] === 0 && crossX[1] === 0 && crossX[2] === 0 ? [1, 0, 0] : crossX);
  }
  return { kind: "plane", origin, normal, xDir };
}

// ============================================================================
// Axis Commands
// ============================================================================

export interface CreateAxisArgs extends AxisFeatureOptions {}

/**
 * Create a new axis feature.
 *
 * @param doc - The SolidType document
 * @param args - Axis creation arguments
 * @returns CommandResult with the new feature ID
 */
export function createAxis(
  doc: SolidTypeDoc,
  args: CreateAxisArgs
): CommandResult<{ featureId: string }> {
  try {
    const featureId = addAxisFeatureHelper(doc, args);
    return ok({ featureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

// ============================================================================
// Feature Modification Commands
// ============================================================================

export interface ModifyFeatureParamArgs {
  /** Feature ID to modify */
  featureId: string;
  /** Parameter name to change */
  paramName: string;
  /** New value (string, number, boolean, or object) */
  value: unknown;
}

/**
 * Modify a single parameter on a feature.
 *
 * @param doc - The SolidType document
 * @param args - Modification arguments
 * @returns CommandResult indicating success
 */
export function modifyFeatureParam(
  doc: SolidTypeDoc,
  args: ModifyFeatureParamArgs
): CommandResult<void> {
  const feature = doc.featuresById.get(args.featureId);
  if (!feature) {
    return err(`Feature ${args.featureId} not found`);
  }

  try {
    doc.ydoc.transact(() => {
      feature.set(args.paramName, args.value);
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export interface DeleteFeatureArgs {
  /** Feature ID to delete */
  featureId: string;
}

/**
 * Delete a feature from the document.
 * Cannot delete origin or datum planes.
 *
 * @param doc - The SolidType document
 * @param args - Deletion arguments
 * @returns CommandResult indicating success
 */
export function deleteFeature(doc: SolidTypeDoc, args: DeleteFeatureArgs): CommandResult<void> {
  const deleted = deleteFeatureHelper(doc, args.featureId);
  if (!deleted) {
    return err(`Cannot delete feature ${args.featureId} (not found or protected)`);
  }
  return ok(undefined);
}

export interface RenameFeatureArgs {
  /** Feature ID to rename */
  featureId: string;
  /** New name */
  name: string;
}

/**
 * Rename a feature.
 *
 * @param doc - The SolidType document
 * @param args - Rename arguments
 * @returns CommandResult indicating success
 */
export function renameFeature(doc: SolidTypeDoc, args: RenameFeatureArgs): CommandResult<void> {
  const renamed = renameFeatureHelper(doc, args.featureId, args.name);
  if (!renamed) {
    return err(`Feature ${args.featureId} not found`);
  }
  return ok(undefined);
}

export interface SuppressFeatureArgs {
  /** Feature ID to suppress/unsuppress */
  featureId: string;
  /** Whether to suppress (true) or unsuppress (false) */
  suppressed: boolean;
}

/**
 * Suppress or unsuppress a feature.
 * Suppressed features are skipped during rebuild.
 *
 * @param doc - The SolidType document
 * @param args - Suppress arguments
 * @returns CommandResult indicating success
 */
export function suppressFeature(doc: SolidTypeDoc, args: SuppressFeatureArgs): CommandResult<void> {
  const feature = doc.featuresById.get(args.featureId);
  if (!feature) {
    return err(`Feature ${args.featureId} not found`);
  }

  doc.ydoc.transact(() => {
    feature.set("suppressed", args.suppressed);
  });

  return ok(undefined);
}

export interface ReorderFeatureArgs {
  /** Feature ID to move */
  featureId: string;
  /** Feature ID to insert after, or null to move to start */
  afterFeatureId: string | null;
}

/**
 * Reorder a feature in the feature tree.
 *
 * @param doc - The SolidType document
 * @param args - Reorder arguments
 * @returns CommandResult indicating success
 */
export function reorderFeature(doc: SolidTypeDoc, args: ReorderFeatureArgs): CommandResult<void> {
  const featureOrder = doc.featureOrder.toArray();
  const currentIndex = featureOrder.indexOf(args.featureId);

  if (currentIndex === -1) {
    return err(`Feature ${args.featureId} not found`);
  }

  // Count pinned features (origin + datum planes at start)
  let pinnedCount = 0;
  for (const id of featureOrder) {
    const feature = doc.featuresById.get(id);
    if (!feature) continue;
    const type = feature.get("type") as string;
    if (type === "origin" || type === "plane") {
      // Check if it's a datum plane (has role at top level or in definition)
      if (type === "origin") {
        pinnedCount++;
      } else {
        const topLevelRole = feature.get("role");
        const definition = feature.get("definition") as { kind?: string } | undefined;
        if (topLevelRole || definition?.kind === "datum") {
          pinnedCount++;
        } else {
          break; // Non-datum plane, stop counting
        }
      }
    } else {
      break; // Non-pinned feature found, stop counting
    }
  }

  let targetIndex: number;
  if (args.afterFeatureId === null) {
    // Move to start (but after pinned features)
    targetIndex = pinnedCount;
  } else {
    const afterIndex = featureOrder.indexOf(args.afterFeatureId);
    if (afterIndex === -1) {
      return err(`Feature ${args.afterFeatureId} not found`);
    }
    targetIndex = afterIndex + 1;
  }

  // Don't allow moving into pinned region
  if (targetIndex < pinnedCount) {
    targetIndex = pinnedCount;
  }

  doc.ydoc.transact(() => {
    doc.featureOrder.delete(currentIndex, 1);
    // Adjust target index if we deleted before it
    let adjustedTarget = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    // Clamp to valid range
    const maxIndex = doc.featureOrder.length;
    if (adjustedTarget > maxIndex) {
      adjustedTarget = maxIndex;
    }
    doc.featureOrder.insert(adjustedTarget, [args.featureId]);
  });

  return ok(undefined);
}

export interface SetVisibilityArgs {
  /** Feature ID */
  featureId: string;
  /** Whether the feature should be visible */
  visible: boolean;
}

/**
 * Set the visibility of a feature.
 *
 * @param doc - The SolidType document
 * @param args - Visibility arguments
 * @returns CommandResult indicating success
 */
export function setVisibility(doc: SolidTypeDoc, args: SetVisibilityArgs): CommandResult<void> {
  const success = setFeatureVisibilityHelper(doc, args.featureId, args.visible);
  if (!success) {
    return err(`Feature ${args.featureId} not found`);
  }
  return ok(undefined);
}

export interface ToggleVisibilityArgs {
  /** Feature ID */
  featureId: string;
}

/**
 * Toggle the visibility of a feature.
 *
 * @param doc - The SolidType document
 * @param args - Toggle visibility arguments
 * @returns CommandResult indicating success
 */
export function toggleVisibility(
  doc: SolidTypeDoc,
  args: ToggleVisibilityArgs
): CommandResult<void> {
  const success = toggleFeatureVisibilityHelper(doc, args.featureId);
  if (!success) {
    return err(`Feature ${args.featureId} not found`);
  }
  return ok(undefined);
}
