/**
 * Modeling Tool Implementations
 *
 * Implementations for 3D modeling tools that operate on the Yjs document.
 * These are executed in the SharedWorker where the OCCT kernel is available.
 */

import type { ModelingToolContext } from "../runtime/modeling-tool-executor";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";

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
  const features = featureOrder.map((id) => {
    const feature = doc.featuresById.get(id);
    if (!feature) return null;
    return {
      id,
      type: feature.get("type") as string,
      name: (feature.get("name") as string) || null,
      status: "ok" as const, // TODO: Get actual status from kernel
    };
  }).filter(Boolean);

  return {
    documentName: doc.metadata.get("name") || "Untitled",
    units: doc.metadata.get("units") || "mm",
    featureCount: features.length,
    features,
    errors: [], // TODO: Get actual errors from kernel
  };
}

export function findFacesImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement when OCCT face query is available
  return [];
}

export function findEdgesImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
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
    min: [0, 0, 0],
    max: [0, 0, 0],
    size: [0, 0, 0],
    center: [0, 0, 0],
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

  // Create extrude feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "extrude");
  featureMap.set("name", name || `Extrude ${op === "cut" ? "Cut" : ""}`);
  featureMap.set("sketchId", sketchId);
  featureMap.set("distance", distance);
  featureMap.set("operation", op);
  featureMap.set("direction", direction || "normal");

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
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

  // Create revolve feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "revolve");
  featureMap.set("name", name || `Revolve ${op === "cut" ? "Cut" : ""}`);
  featureMap.set("sketchId", sketchId);
  featureMap.set("axisLineId", axisLineId);
  featureMap.set("angle", angle);
  featureMap.set("operation", op);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createLoftImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { sketchIds, op, name } = args as {
    sketchIds: string[];
    op: "add" | "cut";
    name?: string;
  };

  // Verify all sketches exist
  for (const sketchId of sketchIds) {
    const sketchFeature = doc.featuresById.get(sketchId);
    if (!sketchFeature || sketchFeature.get("type") !== "sketch") {
      return { featureId: "", status: "error", error: `Sketch ${sketchId} not found` };
    }
  }

  // Create loft feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "loft");
  featureMap.set("name", name || "Loft");
  featureMap.set("sketchIds", sketchIds);
  featureMap.set("operation", op);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createSweepImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { profileSketchId, pathSketchId, pathEntityId, op, name } = args as {
    profileSketchId: string;
    pathSketchId: string;
    pathEntityId: string;
    op: "add" | "cut";
    name?: string;
  };

  // Create sweep feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "sweep");
  featureMap.set("name", name || "Sweep");
  featureMap.set("profileSketchId", profileSketchId);
  featureMap.set("pathSketchId", pathSketchId);
  featureMap.set("pathEntityId", pathEntityId);
  featureMap.set("operation", op);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createFilletImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { edgeRefs, radius, name } = args as {
    edgeRefs: string[];
    radius: number;
    name?: string;
  };

  // Create fillet feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "fillet");
  featureMap.set("name", name || "Fillet");
  featureMap.set("edgeRefs", edgeRefs);
  featureMap.set("radius", radius);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
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

  // Create chamfer feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "chamfer");
  featureMap.set("name", name || "Chamfer");
  featureMap.set("edgeRefs", edgeRefs);
  featureMap.set("distance", distance);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createDraftImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { faceRefs, angle, pullDirection, name } = args as {
    faceRefs: string[];
    angle: number;
    pullDirection: [number, number, number];
    name?: string;
  };

  // Create draft feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "draft");
  featureMap.set("name", name || "Draft");
  featureMap.set("faceRefs", faceRefs);
  featureMap.set("angle", angle);
  featureMap.set("pullDirection", pullDirection);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createLinearPatternImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureIds, direction, count, spacing, name } = args as {
    featureIds: string[];
    direction: [number, number, number];
    count: number;
    spacing: number;
    name?: string;
  };

  // Create linear pattern feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "linearPattern");
  featureMap.set("name", name || "Linear Pattern");
  featureMap.set("sourceFeatures", featureIds);
  featureMap.set("direction", direction);
  featureMap.set("count", count);
  featureMap.set("spacing", spacing);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createCircularPatternImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureIds, axis, axisPoint, count, totalAngle, name } = args as {
    featureIds: string[];
    axis: [number, number, number];
    axisPoint: [number, number, number];
    count: number;
    totalAngle: number;
    name?: string;
  };

  // Create circular pattern feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "circularPattern");
  featureMap.set("name", name || "Circular Pattern");
  featureMap.set("sourceFeatures", featureIds);
  featureMap.set("axis", axis);
  featureMap.set("axisPoint", axisPoint);
  featureMap.set("count", count);
  featureMap.set("totalAngle", totalAngle);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createMirrorImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureIds, planeRef, name } = args as {
    featureIds: string[];
    planeRef: string;
    name?: string;
  };

  // Create mirror feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "mirror");
  featureMap.set("name", name || "Mirror");
  featureMap.set("sourceFeatures", featureIds);
  featureMap.set("planeRef", planeRef);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

// ============ Modify Tool Implementations ============

export function modifyFeatureImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { featureId, changes } = args as {
    featureId: string;
    changes: Record<string, unknown>;
  };

  const feature = doc.featuresById.get(featureId);
  if (!feature) {
    return { success: false, rebuildStatus: "error", error: `Feature ${featureId} not found` };
  }

  doc.ydoc.transact(() => {
    for (const [key, value] of Object.entries(changes)) {
      feature.set(key, value);
    }
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
  const { featureId, changes, insertAfter } = args as {
    featureId: string;
    changes?: Record<string, unknown>;
    insertAfter?: string;
  };

  const feature = doc.featuresById.get(featureId);
  if (!feature) {
    return { success: false, error: `Feature ${featureId} not found` };
  }

  const newFeatureId = uuid();
  const newFeature = new Y.Map();

  // Copy all properties (deep clone to avoid Y.Map reference issues)
  const featureJson = feature.toJSON();
  for (const [key, value] of Object.entries(featureJson)) {
    // Skip nested Y types - they need special handling
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // For nested objects like 'data' or 'plane', convert to plain object
      newFeature.set(key, JSON.parse(JSON.stringify(value)));
    } else {
      newFeature.set(key, value);
    }
  }

  // Apply changes
  if (changes) {
    for (const [key, value] of Object.entries(changes)) {
      newFeature.set(key, value);
    }
  }

  // Rename to indicate it's a copy
  const originalName = (featureJson.name as string) || "Feature";
  newFeature.set("name", `${originalName} (Copy)`);

  doc.ydoc.transact(() => {
    doc.featuresById.set(newFeatureId, newFeature);

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

  // Create sketch with rectangle
  const sketchId = uuid();
  const sketchFeature = new Y.Map();
  sketchFeature.set("type", "sketch");
  sketchFeature.set("name", name ? `${name} Sketch` : "Box Sketch");
  sketchFeature.set("plane", { kind: "datumRole", ref: sketchPlane });

  // Create sketch data with rectangle
  const sketchData = new Y.Map();
  const pointsById = new Y.Map();
  const entitiesById = new Y.Map();
  const constraintsById = new Y.Map();

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

  // Create 4 corner points
  const p1 = uuid(), p2 = uuid(), p3 = uuid(), p4 = uuid();
  pointsById.set(p1, { id: p1, x: x1, y: y1 });
  pointsById.set(p2, { id: p2, x: x2, y: y1 });
  pointsById.set(p3, { id: p3, x: x2, y: y2 });
  pointsById.set(p4, { id: p4, x: x1, y: y2 });

  // Create 4 lines
  const l1 = uuid(), l2 = uuid(), l3 = uuid(), l4 = uuid();
  entitiesById.set(l1, { id: l1, type: "line", start: p1, end: p2 });
  entitiesById.set(l2, { id: l2, type: "line", start: p2, end: p3 });
  entitiesById.set(l3, { id: l3, type: "line", start: p3, end: p4 });
  entitiesById.set(l4, { id: l4, type: "line", start: p4, end: p1 });

  sketchData.set("pointsById", pointsById);
  sketchData.set("entitiesById", entitiesById);
  sketchData.set("constraintsById", constraintsById);
  sketchFeature.set("data", sketchData);

  // Create extrude
  const extrudeId = uuid();
  const extrudeFeature = new Y.Map();
  extrudeFeature.set("type", "extrude");
  extrudeFeature.set("name", name || "Box");
  extrudeFeature.set("sketchId", sketchId);
  extrudeFeature.set("distance", height);
  extrudeFeature.set("operation", "add");
  extrudeFeature.set("direction", "normal");

  doc.ydoc.transact(() => {
    doc.featuresById.set(sketchId, sketchFeature);
    doc.featuresById.set(extrudeId, extrudeFeature);
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

  // Create sketch with circle
  const sketchId = uuid();
  const sketchFeature = new Y.Map();
  sketchFeature.set("type", "sketch");
  sketchFeature.set("name", name ? `${name} Sketch` : "Cylinder Sketch");
  sketchFeature.set("plane", { kind: "datumRole", ref: sketchPlane });

  // Create sketch data with circle
  const sketchData = new Y.Map();
  const pointsById = new Y.Map();
  const entitiesById = new Y.Map();
  const constraintsById = new Y.Map();

  const centerId = uuid();
  const cx = isCentered ? 0 : radius;
  const cy = isCentered ? 0 : radius;
  pointsById.set(centerId, { id: centerId, x: cx, y: cy });

  const circleId = uuid();
  entitiesById.set(circleId, { id: circleId, type: "circle", center: centerId, radius });

  sketchData.set("pointsById", pointsById);
  sketchData.set("entitiesById", entitiesById);
  sketchData.set("constraintsById", constraintsById);
  sketchFeature.set("data", sketchData);

  // Create extrude
  const extrudeId = uuid();
  const extrudeFeature = new Y.Map();
  extrudeFeature.set("type", "extrude");
  extrudeFeature.set("name", name || "Cylinder");
  extrudeFeature.set("sketchId", sketchId);
  extrudeFeature.set("distance", height);
  extrudeFeature.set("operation", "add");
  extrudeFeature.set("direction", "normal");

  doc.ydoc.transact(() => {
    doc.featuresById.set(sketchId, sketchFeature);
    doc.featuresById.set(extrudeId, extrudeFeature);
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

export function createConeImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement cone (triangle + revolve)
  return { sketchId: "", revolveId: "" };
}

export function createHoleImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
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

export function createBossImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
  // TODO: Implement boss (sketch on face + add extrude)
  return { sketchId: "", featureId: "" };
}

export function createShellImpl(
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  const { doc } = ctx;
  const { thickness, openFaces, name } = args as {
    thickness: number;
    openFaces?: string[];
    name?: string;
  };

  // Create shell feature
  const featureId = uuid();
  const featureMap = new Y.Map();
  featureMap.set("type", "shell");
  featureMap.set("name", name || "Shell");
  featureMap.set("thickness", thickness);
  featureMap.set("openFaces", openFaces || []);

  doc.ydoc.transact(() => {
    doc.featuresById.set(featureId, featureMap);
    doc.featureOrder.push([featureId]);
  });

  return { featureId, status: "ok" };
}

export function createRibImpl(
  _args: Record<string, unknown>,
  _ctx: ModelingToolContext
): unknown {
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
