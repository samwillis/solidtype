/**
 * Modeling Tool Implementations
 *
 * Implementations for 3D modeling tools that operate on the Yjs document.
 * These are executed in the SharedWorker where the OCCT kernel is available.
 */

import type { ModelingToolContext } from "../runtime/modeling-tool-executor";
import type { SolidTypeDoc } from "../../../editor/document/createDocument";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";

/**
 * Helper to create a feature and add it to the document.
 * Properties MUST be set AFTER the map is integrated for proper sync.
 */
function createFeature(doc: SolidTypeDoc, props: Record<string, unknown>): string {
  const featureId = uuid();
  const featureMap = new Y.Map<unknown>();

  doc.ydoc.transact(() => {
    // First, integrate the map into the document
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);

    // Set the id property (required for parseFeature to work)
    featureMap.set("id", featureId);

    // Then set properties (AFTER integration for proper sync tracking)
    for (const [key, value] of Object.entries(props)) {
      if (value !== undefined) {
        featureMap.set(key, value);
      }
    }
  });

  return featureId;
}

// ============ Query Tool Implementations ============

export function getCurrentSelectionImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement when selection state is available in worker
  return {
    type: "none",
    items: [],
  };
}

export function getModelContextImpl(
  _args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const featureOrder = doc.featureOrder.toArray();
  const features = featureOrder
    .map((id) => {
      const feature = doc.featuresById.get(id);
      if (!feature) return null;
      return {
        id,
        type: feature.get("type") as string,
        name: (feature.get("name") as string) || null,
        status: "ok" as const, // TODO: Get actual status from kernel
      };
    })
    .filter(Boolean);

  return {
    documentName: doc.metadata.get("name") || "Untitled",
    units: doc.metadata.get("units") || "mm",
    featureCount: features.length,
    features,
    errors: [], // TODO: Get actual errors from kernel
  };
}

export function findFacesImpl(_args: Record<string, unknown>, _ctx: ModelingToolContext): unknown {
  // TODO: Implement when OCCT face query is available
  return [];
}

export function findEdgesImpl(_args: Record<string, unknown>, _ctx: ModelingToolContext): unknown {
  // TODO: Implement when OCCT edge query is available
  return [];
}

export function measureDistanceImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement when OCCT measurement is available
  return { distance: 0, type: "minimum" };
}

export function getBoundingBoxImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement when OCCT bounding box query is available
  return {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
    sizeX: 0,
    sizeY: 0,
    sizeZ: 0,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
  };
}

export function measureAngleImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement when OCCT angle measurement is available
  return { angleDegrees: 0, angleRadians: 0 };
}

// ============ Feature Tool Implementations ============

export function createExtrudeImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { sketchId, distance, op, direction, name } = args as {
    sketchId: string;
    distance: number;
    op: "add" | "cut";
    direction?: string;
    name?: string;
  };

  // Verify sketch exists
  const sketchFeature = doc.featuresById.get(sketchId);
  if (!sketchFeature || sketchFeature.get("type") !== "sketch") {
    return { featureId: "", status: "error", error: `Sketch ${sketchId} not found` };
  }

  // Hide the referenced sketch if it's currently visible
  if (sketchFeature.get("visible") === true) {
    sketchFeature.set("visible", false);
  }

  // Create extrude feature using helper (ensures proper sync)
  const featureId = createFeature(doc, {
    type: "extrude",
    name: name || `Extrude ${op === "cut" ? "Cut" : ""}`,
    sketch: sketchId, // Note: field name is "sketch" to match featureHelpers.ts
    distance,
    op: op,
    direction: direction || "normal",
  });

  return { featureId, status: "ok" };
}

export function createRevolveImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { sketchId, axisLineId, angle, op, name } = args as {
    sketchId: string;
    axisLineId: string;
    angle: number;
    op: "add" | "cut";
    name?: string;
  };

  // Verify sketch exists
  const sketchFeature = doc.featuresById.get(sketchId);
  if (!sketchFeature || sketchFeature.get("type") !== "sketch") {
    return { featureId: "", status: "error", error: `Sketch ${sketchId} not found` };
  }

  // Hide the referenced sketch if it's currently visible
  if (sketchFeature.get("visible") === true) {
    sketchFeature.set("visible", false);
  }

  // Create revolve feature using helper
  const featureId = createFeature(doc, {
    type: "revolve",
    name: name || `Revolve ${op === "cut" ? "Cut" : ""}`,
    sketch: sketchId,
    axis: axisLineId,
    angle,
    op,
  });

  return { featureId, status: "ok" };
}

export function createLoftImpl(args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  const { doc } = ctx;
  const { sketchIds, op, name } = args as {
    sketchIds: string[];
    op: "add" | "cut";
    name?: string;
  };

  // Verify all sketches exist and hide them if visible
  for (const sketchId of sketchIds) {
    const sketchFeature = doc.featuresById.get(sketchId);
    if (!sketchFeature || sketchFeature.get("type") !== "sketch") {
      return { featureId: "", status: "error", error: `Sketch ${sketchId} not found` };
    }
    // Hide the referenced sketch if it's currently visible
    if (sketchFeature.get("visible") === true) {
      sketchFeature.set("visible", false);
    }
  }

  // Create loft feature using helper
  const featureId = createFeature(doc, {
    type: "loft",
    name: name || "Loft",
    sketches: sketchIds,
    op,
  });

  return { featureId, status: "ok" };
}

export function createSweepImpl(args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  const { doc } = ctx;
  const { profileSketchId, pathSketchId, pathEntityId, op, name } = args as {
    profileSketchId: string;
    pathSketchId: string;
    pathEntityId: string;
    op: "add" | "cut";
    name?: string;
  };

  // Hide the referenced sketches if they're currently visible
  const profileSketch = doc.featuresById.get(profileSketchId);
  if (profileSketch && profileSketch.get("visible") === true) {
    profileSketch.set("visible", false);
  }
  const pathSketch = doc.featuresById.get(pathSketchId);
  if (pathSketch && pathSketch.get("visible") === true) {
    pathSketch.set("visible", false);
  }

  // Create sweep feature using helper
  const featureId = createFeature(doc, {
    type: "sweep",
    name: name || "Sweep",
    profileSketch: profileSketchId,
    pathSketch: pathSketchId,
    pathEntity: pathEntityId,
    op,
  });

  return { featureId, status: "ok" };
}

export function createFilletImpl(args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  const { doc } = ctx;
  const { edgeRefs, radius, name } = args as {
    edgeRefs: string[];
    radius: number;
    name?: string;
  };

  // Create fillet feature using helper
  const featureId = createFeature(doc, {
    type: "fillet",
    name: name || "Fillet",
    edges: edgeRefs,
    radius,
  });

  return { featureId, status: "ok" };
}

export function createChamferImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { edgeRefs, distance, name } = args as {
    edgeRefs: string[];
    distance: number;
    name?: string;
  };

  // Create chamfer feature using helper
  const featureId = createFeature(doc, {
    type: "chamfer",
    name: name || "Chamfer",
    edges: edgeRefs,
    distance,
  });

  return { featureId, status: "ok" };
}

export function createDraftImpl(args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  const { doc } = ctx;
  const { faceRefs, angle, pullDirectionX, pullDirectionY, pullDirectionZ, name } = args as {
    faceRefs: string[];
    angle: number;
    pullDirectionX: number;
    pullDirectionY: number;
    pullDirectionZ: number;
    name?: string;
  };

  // Create draft feature using helper
  const featureId = createFeature(doc, {
    type: "draft",
    name: name || "Draft",
    faces: faceRefs,
    angle,
    pullDirection: [pullDirectionX, pullDirectionY, pullDirectionZ],
  });

  return { featureId, status: "ok" };
}

export function createLinearPatternImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureIds, directionX, directionY, directionZ, count, spacing, name } = args as {
    featureIds: string[];
    directionX: number;
    directionY: number;
    directionZ: number;
    count: number;
    spacing: number;
    name?: string;
  };

  // Create linear pattern feature using helper
  const featureId = createFeature(doc, {
    type: "linearPattern",
    name: name || "Linear Pattern",
    sourceFeatures: featureIds,
    direction: [directionX, directionY, directionZ],
    count,
    spacing,
  });

  return { featureId, status: "ok" };
}

export function createCircularPatternImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const {
    featureIds,
    axisX,
    axisY,
    axisZ,
    axisPointX,
    axisPointY,
    axisPointZ,
    count,
    totalAngle,
    name,
  } = args as {
    featureIds: string[];
    axisX: number;
    axisY: number;
    axisZ: number;
    axisPointX: number;
    axisPointY: number;
    axisPointZ: number;
    count: number;
    totalAngle: number;
    name?: string;
  };

  // Create circular pattern feature using helper
  const featureId = createFeature(doc, {
    type: "circularPattern",
    name: name || "Circular Pattern",
    sourceFeatures: featureIds,
    axis: [axisX, axisY, axisZ],
    axisPoint: [axisPointX, axisPointY, axisPointZ],
    count,
    totalAngle,
  });

  return { featureId, status: "ok" };
}

export function createMirrorImpl(args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  const { doc } = ctx;
  const { featureIds, planeRef, name } = args as {
    featureIds: string[];
    planeRef: string;
    name?: string;
  };

  // Create mirror feature using helper
  const featureId = createFeature(doc, {
    type: "mirror",
    name: name || "Mirror",
    sourceFeatures: featureIds,
    plane: planeRef,
  });

  return { featureId, status: "ok" };
}

// ============ Modify Tool Implementations ============

export function modifyFeatureImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureId, parameterName, stringValue, numberValue, booleanValue } = args as {
    featureId: string;
    parameterName: string;
    stringValue?: string | null;
    numberValue?: number | null;
    booleanValue?: boolean | null;
  };

  const feature = doc.featuresById.get(featureId);
  if (!feature) {
    return { success: false, rebuildStatus: "error", error: `Feature ${featureId} not found` };
  }

  // Determine the value to set
  let value: unknown;
  if (stringValue !== undefined && stringValue !== null) {
    value = stringValue;
  } else if (numberValue !== undefined && numberValue !== null) {
    value = numberValue;
  } else if (booleanValue !== undefined && booleanValue !== null) {
    value = booleanValue;
  } else {
    return { success: false, rebuildStatus: "error", error: "No value provided" };
  }

  doc.ydoc.transact(() => {
    feature.set(parameterName, value);
  });

  return { success: true, rebuildStatus: "ok" };
}

export function deleteFeatureImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureId, deleteChildren } = args as {
    featureId: string;
    deleteChildren?: boolean;
  };

  const feature = doc.featuresById.get(featureId);
  if (!feature) {
    return { success: false, deletedIds: [], error: `Feature ${featureId} not found` };
  }

  const deletedIds: string[] = [featureId];

  // TODO: If deleteChildren, find and delete dependent features
  if (deleteChildren) {
    // Placeholder for dependency analysis
  }

  doc.ydoc.transact(() => {
    for (const id of deletedIds) {
      doc.featuresById.delete(id);
      // Remove from feature order
      const index = doc.featureOrder.toArray().indexOf(id);
      if (index !== -1) {
        doc.featureOrder.delete(index, 1);
      }
    }
  });

  return { success: true, deletedIds };
}

export function reorderFeatureImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureId, afterFeatureId } = args as {
    featureId: string;
    afterFeatureId: string | null;
  };

  const featureOrder = doc.featureOrder.toArray();
  const currentIndex = featureOrder.indexOf(featureId);
  if (currentIndex === -1) {
    return { success: false, rebuildStatus: "error", error: `Feature ${featureId} not found` };
  }

  let targetIndex: number;
  if (afterFeatureId === null) {
    targetIndex = 0;
  } else {
    const afterIndex = featureOrder.indexOf(afterFeatureId);
    if (afterIndex === -1) {
      return {
        success: false,
        rebuildStatus: "error",
        error: `Feature ${afterFeatureId} not found`,
      };
    }
    targetIndex = afterIndex + 1;
  }

  doc.ydoc.transact(() => {
    doc.featureOrder.delete(currentIndex, 1);
    // Adjust target index if we deleted before it
    const adjustedTarget = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    doc.featureOrder.insert(adjustedTarget, [featureId]);
  });

  return { success: true, rebuildStatus: "ok" };
}

export function suppressFeatureImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureId, suppressed } = args as {
    featureId: string;
    suppressed: boolean;
  };

  const feature = doc.featuresById.get(featureId);
  if (!feature) {
    return { success: false };
  }

  doc.ydoc.transact(() => {
    feature.set("suppressed", suppressed);
  });

  return { success: true };
}

export function renameFeatureImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureId, name } = args as {
    featureId: string;
    name: string;
  };

  const feature = doc.featuresById.get(featureId);
  if (!feature) {
    return { success: false };
  }

  doc.ydoc.transact(() => {
    feature.set("name", name);
  });

  return { success: true };
}

export function duplicateFeatureImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureId, newName, insertAfter } = args as {
    featureId: string;
    newName?: string | null;
    insertAfter?: string | null;
  };

  const feature = doc.featuresById.get(featureId);
  if (!feature) {
    return { success: false, error: `Feature ${featureId} not found` };
  }

  const newFeatureId = uuid();
  const featureJson = feature.toJSON();
  const originalName = (featureJson.name as string) || "Feature";

  // Build properties object for the new feature
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(featureJson)) {
    // Deep clone nested objects
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      props[key] = JSON.parse(JSON.stringify(value));
    } else {
      props[key] = value;
    }
  }
  // Set new name
  props["name"] = newName || `${originalName} (Copy)`;

  // Create the feature and add to document properly
  const newFeature = new Y.Map<unknown>();
  doc.ydoc.transact(() => {
    // First integrate into document
    doc.featuresById.set(newFeatureId, newFeature);

    // Set the id property (must be the new ID, not the copied one)
    newFeature.set("id", newFeatureId);

    // Then set properties (AFTER integration for proper sync)
    for (const [key, value] of Object.entries(props)) {
      if (value !== undefined && key !== "id") {
        // Skip id since we already set it above
        newFeature.set(key, value);
      }
    }

    // Insert at correct position
    const featureOrder = doc.featureOrder.toArray();
    const afterId = insertAfter || featureId;
    const afterIndex = featureOrder.indexOf(afterId);
    if (afterIndex !== -1) {
      doc.featureOrder.insert(afterIndex + 1, [newFeatureId]);
    } else {
      doc.featureOrder.push([newFeatureId]);
    }
  });

  return { success: true, newFeatureId };
}

export function undoImpl(_args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  // TODO: Implement using UndoManager
  const { doc } = ctx;
  const undoManager = doc.undoManager;
  if (undoManager && undoManager.canUndo()) {
    undoManager.undo();
    return { success: true, undoneAction: "last action" };
  }
  return { success: false };
}

export function redoImpl(_args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  // TODO: Implement using UndoManager
  const { doc } = ctx;
  const undoManager = doc.undoManager;
  if (undoManager && undoManager.canRedo()) {
    undoManager.redo();
    return { success: true, redoneAction: "last undone action" };
  }
  return { success: false };
}

// ============ Helper Tool Implementations ============

export function createBoxImpl(args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  const { doc } = ctx;
  const { width, height, depth, centered, plane, name } = args as {
    width: number;
    height: number;
    depth: number;
    centered?: boolean;
    plane?: string;
    name?: string;
  };

  const isCentered = centered ?? true;
  const sketchPlane = plane || "xy";

  // Calculate rectangle corners based on centering
  let x1: number, y1: number, x2: number, y2: number;
  if (isCentered) {
    x1 = -width / 2;
    y1 = -depth / 2;
    x2 = width / 2;
    y2 = depth / 2;
  } else {
    x1 = 0;
    y1 = 0;
    x2 = width;
    y2 = depth;
  }

  // Prepare IDs
  const sketchId = uuid();
  const extrudeId = uuid();
  const p1 = uuid(),
    p2 = uuid(),
    p3 = uuid(),
    p4 = uuid();
  const l1 = uuid(),
    l2 = uuid(),
    l3 = uuid(),
    l4 = uuid();

  // Prepare data as plain objects (will be set after integration)
  const pointsData = {
    [p1]: { id: p1, x: x1, y: y1 },
    [p2]: { id: p2, x: x2, y: y1 },
    [p3]: { id: p3, x: x2, y: y2 },
    [p4]: { id: p4, x: x1, y: y2 },
  };
  const entitiesData = {
    [l1]: { id: l1, type: "line", start: p1, end: p2 },
    [l2]: { id: l2, type: "line", start: p2, end: p3 },
    [l3]: { id: l3, type: "line", start: p3, end: p4 },
    [l4]: { id: l4, type: "line", start: p4, end: p1 },
  };

  doc.ydoc.transact(() => {
    // Create and integrate sketch feature first
    const sketchFeature = new Y.Map<unknown>();
    doc.featuresById.set(sketchId, sketchFeature);

    // Now set properties AFTER integration
    sketchFeature.set("id", sketchId);
    sketchFeature.set("type", "sketch");
    sketchFeature.set("name", name ? `${name} Sketch` : "Box Sketch");
    sketchFeature.set("plane", { kind: "datumRole", ref: sketchPlane });
    sketchFeature.set("visible", false); // Hide sketch since it's used by extrude

    // Create nested Y.Maps for sketch data (must also set AFTER integration)
    const sketchData = new Y.Map<unknown>();
    sketchFeature.set("data", sketchData);

    const pointsById = new Y.Map<unknown>();
    const entitiesById = new Y.Map<unknown>();
    const constraintsById = new Y.Map<unknown>();
    sketchData.set("pointsById", pointsById);
    sketchData.set("entitiesById", entitiesById);
    sketchData.set("constraintsById", constraintsById);

    // Set point and entity data
    for (const [id, pt] of Object.entries(pointsData)) {
      pointsById.set(id, pt);
    }
    for (const [id, ent] of Object.entries(entitiesData)) {
      entitiesById.set(id, ent);
    }

    // Create and integrate extrude feature
    const extrudeFeature = new Y.Map<unknown>();
    doc.featuresById.set(extrudeId, extrudeFeature);
    extrudeFeature.set("id", extrudeId);
    extrudeFeature.set("type", "extrude");
    extrudeFeature.set("name", name || "Box");
    extrudeFeature.set("sketch", sketchId);
    extrudeFeature.set("distance", height);
    extrudeFeature.set("op", "add");
    extrudeFeature.set("direction", "normal");

    doc.featureOrder.push([sketchId, extrudeId]);
  });

  return { sketchId, extrudeId };
}

export function createCylinderImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { radius, height, centered, plane, name } = args as {
    radius: number;
    height: number;
    centered?: boolean;
    plane?: string;
    name?: string;
  };

  const isCentered = centered ?? true;
  const sketchPlane = plane || "xy";

  // Prepare IDs
  const sketchId = uuid();
  const extrudeId = uuid();
  const centerId = uuid();
  const circleId = uuid();

  const cx = isCentered ? 0 : radius;
  const cy = isCentered ? 0 : radius;

  doc.ydoc.transact(() => {
    // Create and integrate sketch feature first
    const sketchFeature = new Y.Map<unknown>();
    doc.featuresById.set(sketchId, sketchFeature);

    // Set properties AFTER integration
    sketchFeature.set("id", sketchId);
    sketchFeature.set("type", "sketch");
    sketchFeature.set("name", name ? `${name} Sketch` : "Cylinder Sketch");
    sketchFeature.set("plane", { kind: "datumRole", ref: sketchPlane });
    sketchFeature.set("visible", false); // Hide sketch since it's used by extrude

    // Create nested Y.Maps for sketch data
    const sketchData = new Y.Map<unknown>();
    sketchFeature.set("data", sketchData);

    const pointsById = new Y.Map<unknown>();
    const entitiesById = new Y.Map<unknown>();
    const constraintsById = new Y.Map<unknown>();
    sketchData.set("pointsById", pointsById);
    sketchData.set("entitiesById", entitiesById);
    sketchData.set("constraintsById", constraintsById);

    // Set point and entity data
    pointsById.set(centerId, { id: centerId, x: cx, y: cy });
    entitiesById.set(circleId, { id: circleId, type: "circle", center: centerId, radius });

    // Create and integrate extrude feature
    const extrudeFeature = new Y.Map<unknown>();
    doc.featuresById.set(extrudeId, extrudeFeature);
    extrudeFeature.set("id", extrudeId);
    extrudeFeature.set("type", "extrude");
    extrudeFeature.set("name", name || "Cylinder");
    extrudeFeature.set("sketch", sketchId);
    extrudeFeature.set("distance", height);
    extrudeFeature.set("op", "add");
    extrudeFeature.set("direction", "normal");

    doc.featureOrder.push([sketchId, extrudeId]);
  });

  return { sketchId, extrudeId };
}

export function createSphereImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement sphere (semicircle + revolve)
  return { sketchId: "", revolveId: "" };
}

export function createConeImpl(_args: Record<string, unknown>, _ctx: ModelingToolContext): unknown {
  // TODO: Implement cone (triangle + revolve)
  return { sketchId: "", revolveId: "" };
}

export function createHoleImpl(_args: Record<string, unknown>, _ctx: ModelingToolContext): unknown {
  // TODO: Implement hole (sketch on face + cut extrude)
  return { sketchId: "", featureId: "" };
}

export function createPocketImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement pocket (sketch on face + cut extrude + optional fillet)
  return { sketchId: "", featureId: "" };
}

export function createBossImpl(_args: Record<string, unknown>, _ctx: ModelingToolContext): unknown {
  // TODO: Implement boss (sketch on face + add extrude)
  return { sketchId: "", featureId: "" };
}

export function createShellImpl(args: Record<string, unknown>, ctx: ModelingToolContext): unknown {
  const { doc } = ctx;
  const { thickness, openFaces, name } = args as {
    thickness: number;
    openFaces?: string[];
    name?: string;
  };

  // Create shell feature using helper
  const featureId = createFeature(doc, {
    type: "shell",
    name: name || "Shell",
    thickness,
    openFaces: openFaces || [],
  });

  return { featureId, status: "ok" };
}

export function createRibImpl(_args: Record<string, unknown>, _ctx: ModelingToolContext): unknown {
  // TODO: Implement rib
  return { featureId: "", status: "error", error: "Not implemented" };
}

export function filletAllEdgesImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement fillet all edges (requires OCCT edge enumeration)
  return { featureId: "", filletedEdgeCount: 0, status: "error", error: "Not implemented" };
}
