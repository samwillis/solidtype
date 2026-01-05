/**
 * Kernel Web Worker
 *
 * Runs the CAD kernel in a separate thread and syncs with the Yjs document.
 * Uses Y.Map/Y.Array model (no XML). See DOCUMENT-MODEL.md.
 *
 * Updated to use the new OCCT-based SolidSession API.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCascade WASM bindings use dynamic types */
/// <reference lib="webworker" />

import * as Y from "yjs";
import {
  SolidSession,
  setOC,
  type BodyId,
  type OperationResult,
  XY_PLANE,
  YZ_PLANE,
  ZX_PLANE,
  createDatumPlane,
  type DatumPlane,
  planeToWorld,
  sub3,
  vec2,
  coincident,
  horizontalPoints,
  verticalPoints,
  fixed,
  distance,
  angle,
  // Advanced constraints (Phase 19)
  parallel,
  perpendicular,
  equalLength,
  tangent,
  symmetric,
  pointOnLine,
  pointOnArc,
  exportMeshesToStl,
  type Mesh,
} from "@solidtype/core";

// Browser-specific OpenCascade.js initialization with static imports
import { initOCCTBrowser } from "./occt-init";
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  TransferableMesh,
  BodyInfo,
  BuildError,
  FeatureStatus,
} from "./types";
import {
  getRoot,
  getMeta as _getMeta,
  getState,
  getFeaturesById,
  getFeatureOrder,
  mapToObject,
  getSortedKeys as _getSortedKeys,
} from "../document/yjs";
import type { SketchPlaneRef, DatumPlaneRole } from "../document/schema";

// Declare self as a worker global scope
declare const self: DedicatedWorkerGlobalScope;

// Global error handler for the worker
self.onerror = (event) => {
  console.error("[Worker] Unhandled error:", event);
  return false;
};

self.onunhandledrejection = (event) => {
  console.error("[Worker] Unhandled promise rejection:", event.reason);
};

console.log("[Worker] Kernel worker starting...");
const WORKER_BUILD_TAG = "occt-refactor-2025-01-30";
console.log("[Worker] Build tag:", WORKER_BUILD_TAG);

// ============================================================================
// Worker State
// ============================================================================

let doc: Y.Doc | null = null;
let syncPort: MessagePort | null = null;
let session: SolidSession | null = null;
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Body entry in the bodyMap - stores body ID with metadata
 */
interface BodyEntry {
  bodyId: BodyId;
  name: string;
  color: string;
  /** Feature ID that created this body (for reference tracking) */
  sourceFeatureId: string;
}

// Map of feature IDs to their body entries
const bodyMap = new Map<string, BodyEntry>();

/** Default body colors - cycle through these for new bodies */
const DEFAULT_BODY_COLORS = [
  "#6699cc", // blue-gray
  "#99cc99", // green
  "#cc9999", // red
  "#cccc99", // yellow
  "#cc99cc", // purple
  "#99cccc", // cyan
];

let bodyColorIndex = 0;

function getNextBodyColor(): string {
  const color = DEFAULT_BODY_COLORS[bodyColorIndex % DEFAULT_BODY_COLORS.length];
  bodyColorIndex++;
  return color;
}

function resetBodyColorIndex(): void {
  bodyColorIndex = 0;
}

// ============================================================================
// Session Initialization
// ============================================================================

/**
 * Initialize the OCCT session asynchronously
 */
async function initializeSession(): Promise<SolidSession> {
  if (session && session.isInitialized()) {
    return session;
  }

  if (initializationPromise) {
    await initializationPromise;
    return session!;
  }

  initializationPromise = (async () => {
    // Initialize OpenCascade.js using browser-specific static imports
    // This uses Vite-compatible imports from occt-init.ts
    console.log("[Worker] Initializing OpenCascade.js...");
    const oc = await initOCCTBrowser();

    // Set the OC instance in the core package so SolidSession can use it
    setOC(oc);
    console.log("[Worker] OpenCascade.js initialized and set in core");

    // Create and initialize the session
    session = new SolidSession();
    await session.init();
    console.log("[Worker] OCCT session initialized");
  })();

  await initializationPromise;
  return session!;
}

// ============================================================================
// Yjs Sync Setup
// ============================================================================

let observersSetUp = false;

function setupObservers(): void {
  if (observersSetUp || !doc) return;

  const root = getRoot(doc);
  const featuresById = root.get("featuresById") as Y.Map<Y.Map<unknown>> | undefined;
  const featureOrder = root.get("featureOrder") as Y.Array<string> | undefined;
  const state = root.get("state") as Y.Map<unknown> | undefined;

  // Only set up observers once all required fields exist
  if (!featuresById || !featureOrder || !state) {
    console.log("[Worker] Document structure not ready yet, waiting for sync...");
    return;
  }

  observersSetUp = true;
  console.log("[Worker] Setting up Yjs observers");

  // Observe feature changes
  featuresById.observeDeep(() => {
    scheduleRebuild();
  });

  featureOrder.observe(() => {
    scheduleRebuild();
  });

  // Also observe state (for rebuild gate)
  state.observe(() => {
    scheduleRebuild();
  });

  // Trigger initial rebuild
  scheduleRebuild();
}

function setupYjsSync(port: MessagePort): void {
  syncPort = port;
  doc = new Y.Doc();
  observersSetUp = false;

  port.onmessage = (event) => {
    const { type, data } = event.data;

    if (type === "yjs-init" || type === "yjs-update") {
      Y.applyUpdate(doc!, new Uint8Array(data), "main");

      // Try to set up observers after each update (will only succeed once structure exists)
      if (!observersSetUp) {
        setupObservers();
      }
    }
  };

  // Signal ready and trigger initial rebuild
  console.log("[Worker] Yjs sync setup complete, signaling ready");
  self.postMessage({ type: "ready" } as WorkerToMainMessage);

  // Trigger an initial rebuild now that we have data
  scheduleRebuild();
}

// ============================================================================
// Rebuild Scheduling
// ============================================================================

function scheduleRebuild(): void {
  if (rebuildTimeout) {
    clearTimeout(rebuildTimeout);
  }
  // Debounce rebuilds for ~60fps
  rebuildTimeout = setTimeout(() => {
    rebuildTimeout = null;
    performRebuild();
  }, 16);
}

// ============================================================================
// Datum Plane Helpers
// ============================================================================

/**
 * Cache of datum plane IDs by role
 */
let datumPlaneCache: {
  xy: string | null;
  xz: string | null;
  yz: string | null;
} | null = null;

/**
 * Find datum plane ID by role from featuresById
 */
function findDatumPlaneByRole(
  featuresById: Y.Map<Y.Map<unknown>>,
  role: DatumPlaneRole
): string | null {
  let foundId: string | null = null;
  featuresById.forEach((featureMap, id) => {
    if (featureMap.get("type") === "plane" && featureMap.get("role") === role) {
      foundId = id;
    }
  });
  return foundId;
}

/**
 * Build datum plane cache
 */
function buildDatumPlaneCache(featuresById: Y.Map<Y.Map<unknown>>): void {
  datumPlaneCache = {
    xy: findDatumPlaneByRole(featuresById, "xy"),
    xz: findDatumPlaneByRole(featuresById, "xz"),
    yz: findDatumPlaneByRole(featuresById, "yz"),
  };
  void datumPlaneCache; // suppress unused read warning - cache for future use
}

/**
 * Get DatumPlane from a plane feature map
 */
function getDatumPlaneFromFeature(featureMap: Y.Map<unknown>): DatumPlane | null {
  const type = featureMap.get("type");
  if (type !== "plane") return null;

  const role = featureMap.get("role") as DatumPlaneRole | undefined;
  const normal = featureMap.get("normal") as [number, number, number];
  const origin = featureMap.get("origin") as [number, number, number];
  const xDir = featureMap.get("xDir") as [number, number, number];

  // For datum planes with standard roles, use predefined planes
  if (role === "xy") return XY_PLANE;
  if (role === "xz") return ZX_PLANE;
  if (role === "yz") return YZ_PLANE;

  // For custom planes, create from vectors
  const yDir = [
    normal[1] * xDir[2] - normal[2] * xDir[1],
    normal[2] * xDir[0] - normal[0] * xDir[2],
    normal[0] * xDir[1] - normal[1] * xDir[0],
  ] as [number, number, number];

  return createDatumPlane("custom", {
    kind: "plane",
    origin,
    normal,
    xDir,
    yDir,
  });
}

/**
 * Get sketch plane from a SketchPlaneRef
 * Supports datum plane references and face references.
 */
function getSketchPlane(
  planeRef: SketchPlaneRef,
  featuresById: Y.Map<Y.Map<unknown>>
): DatumPlane | null {
  if (planeRef.kind === "planeFeatureId") {
    const planeFeature = featuresById.get(planeRef.ref);
    if (!planeFeature) return null;
    return getDatumPlaneFromFeature(planeFeature);
  }

  if (planeRef.kind === "faceRef") {
    // Parse face reference: "face:featureId:faceIndex"
    const parts = planeRef.ref.split(":");
    if (parts.length !== 3 || parts[0] !== "face") {
      console.warn(`[Worker] Invalid face reference format: ${planeRef.ref}`);
      return null;
    }

    const featureId = parts[1];
    const faceIndex = parseInt(parts[2], 10);

    if (isNaN(faceIndex)) {
      console.warn(`[Worker] Invalid face index in reference: ${planeRef.ref}`);
      return null;
    }

    // Find the body entry for this feature
    const bodyEntry = bodyMap.get(featureId);
    if (!bodyEntry || !session) {
      console.warn(`[Worker] Body not found for feature: ${featureId}`);
      return null;
    }

    // Get face plane data from the session
    const facePlane = session.getFacePlane(bodyEntry.bodyId, faceIndex);
    if (!facePlane) {
      console.warn(`[Worker] Could not extract plane from face ${faceIndex} of body ${featureId}`);
      return null;
    }

    // Create a datum plane from the face plane data
    return createDatumPlane(`face-${featureId}-${faceIndex}`, {
      kind: "plane",
      origin: facePlane.origin,
      normal: facePlane.normal,
      xDir: facePlane.xDir,
      yDir: facePlane.yDir,
    });
  }

  return null;
}

// ============================================================================
// Feature Interpretation
// ============================================================================

interface SketchData {
  pointsById: Record<
    string,
    {
      id: string;
      x: number;
      y: number;
      fixed?: boolean;
      attachedTo?: string;
      param?: number;
    }
  >;
  entitiesById: Record<
    string,
    {
      id: string;
      type: string;
      start?: string;
      end?: string;
      center?: string;
      ccw?: boolean;
    }
  >;
  constraintsById: Record<string, any>;
}

function parseSketchData(sketchMap: Y.Map<unknown>): SketchData {
  const dataMap = sketchMap.get("data") as Y.Map<unknown> | undefined;

  if (!dataMap) {
    return { pointsById: {}, entitiesById: {}, constraintsById: {} };
  }

  const pointsById: Record<string, any> = {};
  const entitiesById: Record<string, any> = {};
  const constraintsById: Record<string, any> = {};

  const pointsMap = dataMap.get("pointsById") as Y.Map<Y.Map<unknown>> | undefined;
  if (pointsMap) {
    pointsMap.forEach((pointMap, id) => {
      pointsById[id] = mapToObject(pointMap);
    });
  }

  const entitiesMap = dataMap.get("entitiesById") as Y.Map<Y.Map<unknown>> | undefined;
  if (entitiesMap) {
    entitiesMap.forEach((entityMap, id) => {
      entitiesById[id] = mapToObject(entityMap);
    });
  }

  const constraintsMap = dataMap.get("constraintsById") as Y.Map<Y.Map<unknown>> | undefined;
  if (constraintsMap) {
    constraintsMap.forEach((constraintMap, id) => {
      constraintsById[id] = mapToObject(constraintMap);
    });
  }

  return { pointsById, entitiesById, constraintsById };
}

interface SketchInfo {
  planeRef: SketchPlaneRef;
  plane: DatumPlane;
  data: SketchData;
}

// Map of sketch IDs to their parsed data
const sketchCache = new Map<string, SketchInfo>();

/**
 * Calculate extrude distance based on extent type (Phase 14)
 */
function calculateExtrudeDistance(
  featureMap: Y.Map<unknown>,
  direction: number,
  _sketchPlane?: DatumPlane
): number {
  const extent = (featureMap.get("extent") as string) || "blind";
  const baseDistance = (featureMap.get("distance") as number) || 10;

  switch (extent) {
    case "blind":
      return baseDistance * direction;

    case "throughAll":
      return 1000 * direction;

    case "toFace": {
      // TODO: Implement toFace extent in OCCT API
      console.warn("[Worker] toFace extent is not yet supported in the OCCT API");
      return baseDistance * direction;
    }

    case "toVertex":
      return baseDistance * direction;

    default:
      return baseDistance * direction;
  }
}

function interpretSketch(
  currentSession: SolidSession,
  sketchMap: Y.Map<unknown>,
  featuresById: Y.Map<Y.Map<unknown>>
): void {
  const id = sketchMap.get("id") as string;
  const planeRef = sketchMap.get("plane") as SketchPlaneRef;

  const plane = getSketchPlane(planeRef, featuresById);
  if (!plane) {
    throw new Error(`Cannot resolve sketch plane`);
  }

  const data = parseSketchData(sketchMap);

  // Build a kernel sketch
  const sketch = currentSession.createSketch(plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  // Sort keys for deterministic iteration
  const sortedPointIds = Object.keys(data.pointsById).sort();
  for (const pointId of sortedPointIds) {
    const point = data.pointsById[pointId];
    const x = point.x;
    const y = point.y;
    const isFixed = point.fixed;

    const pid = sketch.addPoint(x, y, { fixed: isFixed });
    pointIdMap.set(point.id, pid);
  }

  const sortedEntityIds = Object.keys(data.entitiesById).sort();
  for (const entityId of sortedEntityIds) {
    const entity = data.entitiesById[entityId];
    if (entity.type === "line" && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        const eid = sketch.addLine(startId, endId);
        entityIdMap.set(entity.id, eid);
      }
    }
    if (entity.type === "arc" && entity.start && entity.end && entity.center) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      const centerId = pointIdMap.get(entity.center);
      if (startId !== undefined && endId !== undefined && centerId !== undefined) {
        const eid = sketch.addArc(startId, endId, centerId, entity.ccw ?? true);
        entityIdMap.set(entity.id, eid);
      }
    }
    // Circle: center + radius (no edge point needed)
    // In the kernel, we represent this as a full arc (360°) by creating a point on the circle
    // and using it as both start and end of the arc.
    if (
      entity.type === "circle" &&
      entity.center &&
      "radius" in entity &&
      (entity as { radius: number }).radius > 0
    ) {
      const centerId = pointIdMap.get(entity.center);
      if (centerId !== undefined) {
        // Get center point position
        const centerPoint = data.pointsById[entity.center];
        if (centerPoint) {
          // Create a point on the circle circumference (at angle 0)
          const radius = (entity as { radius: number }).radius;
          const edgeX = centerPoint.x + radius;
          const edgeY = centerPoint.y;
          const edgePointId = sketch.addPoint(edgeX, edgeY);

          // Create a full arc (circle) using the same start/end point
          const eid = sketch.addArc(edgePointId, edgePointId, centerId, true);
          entityIdMap.set(entity.id, eid);
        }
      }
    }
  }

  // Apply constraints (sorted for determinism)
  const sortedConstraintIds = Object.keys(data.constraintsById).sort();
  for (const constraintId of sortedConstraintIds) {
    const c = data.constraintsById[constraintId];
    if (!c || typeof c !== "object") continue;

    switch (c.type) {
      case "coincident": {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        if (p1 !== undefined && p2 !== undefined) {
          sketch.addConstraint(coincident(p1, p2));
        }
        break;
      }
      case "horizontal": {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        if (p1 !== undefined && p2 !== undefined) {
          sketch.addConstraint(horizontalPoints(p1, p2));
        }
        break;
      }
      case "vertical": {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        if (p1 !== undefined && p2 !== undefined) {
          sketch.addConstraint(verticalPoints(p1, p2));
        }
        break;
      }
      case "fixed": {
        const pointId = c.point;
        const pid = pointIdMap.get(pointId);
        const p = data.pointsById[pointId];
        if (pid !== undefined && p) {
          sketch.addConstraint(fixed(pid, vec2(p.x, p.y)));
        }
        break;
      }
      case "distance": {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        const val = typeof c.value === "number" ? c.value : Number(c.value);
        if (p1 !== undefined && p2 !== undefined && Number.isFinite(val)) {
          sketch.addConstraint(distance(p1, p2, val));
        }
        break;
      }
      case "angle": {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        const valDeg = typeof c.value === "number" ? c.value : Number(c.value);
        if (e1 !== undefined && e2 !== undefined && Number.isFinite(valDeg)) {
          sketch.addConstraint(angle(e1, e2, (valDeg * Math.PI) / 180));
        }
        break;
      }
      case "parallel": {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        if (e1 !== undefined && e2 !== undefined) {
          sketch.addConstraint(parallel(e1, e2));
        }
        break;
      }
      case "perpendicular": {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        if (e1 !== undefined && e2 !== undefined) {
          sketch.addConstraint(perpendicular(e1, e2));
        }
        break;
      }
      case "equalLength": {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        if (e1 !== undefined && e2 !== undefined) {
          sketch.addConstraint(equalLength(e1, e2));
        }
        break;
      }
      case "tangent": {
        const lineId = entityIdMap.get(c.line);
        const arcId = entityIdMap.get(c.arc);
        if (lineId !== undefined && arcId !== undefined) {
          sketch.addConstraint(tangent(lineId, arcId, "end", "start"));
        }
        break;
      }
      case "symmetric": {
        const [pt1, pt2] = c.points ?? [];
        const p1 = pointIdMap.get(pt1);
        const p2 = pointIdMap.get(pt2);
        const axisId = entityIdMap.get(c.axis);
        if (p1 !== undefined && p2 !== undefined && axisId !== undefined) {
          sketch.addConstraint(symmetric(p1, p2, axisId));
        }
        break;
      }
      case "pointOnLine": {
        const pid = pointIdMap.get(c.point);
        const lid = entityIdMap.get(c.line);
        if (pid !== undefined && lid !== undefined) {
          sketch.addConstraint(pointOnLine(pid, lid));
        }
        break;
      }
      case "pointOnArc": {
        const pid = pointIdMap.get(c.point);
        const arcId = entityIdMap.get(c.arc);
        if (pid !== undefined && arcId !== undefined) {
          sketch.addConstraint(pointOnArc(pid, arcId));
        }
        break;
      }
      default:
        break;
    }
  }

  const before = new Map<string, { x: number; y: number }>();
  for (const [pid, p] of Object.entries(data.pointsById)) {
    before.set(pid, { x: p.x, y: p.y });
  }

  const solveResult = sketch.solve();
  const dof = sketch.analyzeDOF();

  // Update sketch data with solved positions
  let maxDelta = 0;
  for (const [pid, p] of Object.entries(data.pointsById)) {
    const kernelPid = pointIdMap.get(pid);
    if (kernelPid === undefined) continue;
    const solved = sketch.getPoint(kernelPid);
    if (!solved) continue;

    const prev = before.get(pid);
    if (prev) {
      const dx = solved.x - prev.x;
      const dy = solved.y - prev.y;
      maxDelta = Math.max(maxDelta, Math.hypot(dx, dy));
    }

    p.x = solved.x;
    p.y = solved.y;
  }

  // Notify main thread of solve status
  const { origin, xDir, yDir, normal } = plane.surface;
  const pointsArray = Object.values(data.pointsById);
  self.postMessage({
    type: "sketch-solved",
    sketchId: id,
    points: maxDelta > 1e-9 ? pointsArray.map((p) => ({ id: p.id, x: p.x, y: p.y })) : [],
    status: solveResult.status,
    planeTransform: {
      origin: origin as [number, number, number],
      xDir: xDir as [number, number, number],
      yDir: yDir as [number, number, number],
      normal: normal as [number, number, number],
    },
    dof,
  } as WorkerToMainMessage);

  // Store for downstream features
  sketchCache.set(id, { planeRef, plane, data });
}

/**
 * Result from interpretExtrude/interpretRevolve with metadata
 */
interface FeatureInterpretResult {
  bodyId: BodyId | null;
  bodyEntryId: string | null;
  bodyName?: string;
  bodyColor?: string;
}

function interpretExtrude(
  currentSession: SolidSession,
  featureMap: Y.Map<unknown>,
  featureId: string,
  _featuresById: Y.Map<Y.Map<unknown>>
): FeatureInterpretResult {
  const sketchId = featureMap.get("sketch") as string;
  const op = (featureMap.get("op") as string) || "add";
  const direction = (featureMap.get("direction") as string) || "normal";
  const mergeScope = (featureMap.get("mergeScope") as string) || "auto";
  const targetBodies = (featureMap.get("targetBodies") as string[]) || [];
  const resultBodyName = (featureMap.get("resultBodyName") as string) || "";
  const resultBodyColor = (featureMap.get("resultBodyColor") as string) || "";

  if (!sketchId) {
    throw new Error("Extrude requires a sketch reference");
  }

  const sketchInfo = sketchCache.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  // Create sketch and add entities
  const sketch = currentSession.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();

  // Add points (sorted for determinism)
  const sortedPointIds = Object.keys(sketchInfo.data.pointsById).sort();
  for (const pid of sortedPointIds) {
    const point = sketchInfo.data.pointsById[pid];
    const kernelPid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
    pointIdMap.set(point.id, kernelPid);
  }

  // Add entities
  const sortedEntityIds = Object.keys(sketchInfo.data.entitiesById).sort();
  for (const eid of sortedEntityIds) {
    const entity = sketchInfo.data.entitiesById[eid];
    if (entity.type === "line" && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        sketch.addLine(startId, endId);
      }
    }
    if (entity.type === "arc" && entity.start && entity.end && entity.center) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      const centerId = pointIdMap.get(entity.center);
      if (startId !== undefined && endId !== undefined && centerId !== undefined) {
        sketch.addArc(startId, endId, centerId, entity.ccw ?? true);
      }
    }
  }

  const profile = sketch.toProfile();
  if (!profile) {
    throw new Error("Sketch does not contain a closed profile");
  }

  const dirMultiplier = direction === "reverse" ? -1 : 1;
  const finalDistance = calculateExtrudeDistance(featureMap, dirMultiplier, sketchInfo.plane);

  // Extrude to create new body
  const result = currentSession.extrude(profile, {
    operation: "new",
    distance: finalDistance,
  });

  if (!result.success) {
    throw new Error(result.error?.message || "Extrude failed");
  }

  const extrudedBodyId = result.value;

  // Handle cut operation
  if (op === "cut") {
    console.log("[Worker] Extrude CUT operation");

    let anySuccess = false;
    let lastError: string | undefined;
    for (const [existingId, entry] of bodyMap) {
      console.log(`[Worker] Subtracting from body ${existingId}`);

      const boolResult = currentSession.subtract(entry.bodyId, extrudedBodyId);
      console.log(`[Worker] Subtract result: success=${boolResult.success}`);
      if (boolResult.success) {
        // Update the body entry with the new body ID from the boolean result
        bodyMap.set(existingId, { ...entry, bodyId: boolResult.value });
        anySuccess = true;
      } else {
        lastError = boolResult.error?.message;
        console.error(`[Worker] Boolean subtract failed: ${lastError}`);
      }
    }

    // Delete the tool body
    currentSession.deleteBody(extrudedBodyId);

    if (!anySuccess && bodyMap.size > 0 && lastError) {
      throw new Error(`Cut operation failed: ${lastError}`);
    }
    return { bodyId: null, bodyEntryId: null };
  }

  // Handle add operation with merge logic
  const finalBodyName = resultBodyName || `Body${bodyMap.size + 1}`;
  const finalBodyColor = resultBodyColor || getNextBodyColor();

  if (mergeScope === "new" || bodyMap.size === 0) {
    return {
      bodyId: extrudedBodyId,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  if (mergeScope === "specific" && targetBodies.length > 0) {
    let currentBodyId = extrudedBodyId;
    let mergedIntoId: string | null = null;
    let mergedEntry: BodyEntry | null = null;

    for (const targetId of targetBodies) {
      const targetEntry = bodyMap.get(targetId);
      if (targetEntry) {
        const unionResult = currentSession.union(targetEntry.bodyId, currentBodyId);
        if (unionResult.success) {
          // Delete old bodies if they're different from result
          if (currentBodyId !== unionResult.value) {
            currentSession.deleteBody(currentBodyId);
          }
          if (targetEntry.bodyId !== unionResult.value) {
            currentSession.deleteBody(targetEntry.bodyId);
          }
          currentBodyId = unionResult.value;
          if (!mergedIntoId) {
            mergedIntoId = targetId;
            mergedEntry = targetEntry;
          }
        }
      }
    }

    if (mergedIntoId && mergedEntry) {
      bodyMap.set(mergedIntoId, { ...mergedEntry, bodyId: currentBodyId });
      return {
        bodyId: null,
        bodyEntryId: mergedIntoId,
        bodyName: mergedEntry.name,
        bodyColor: mergedEntry.color,
      };
    }

    return {
      bodyId: currentBodyId,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  // mergeScope === 'auto'
  console.log("[Worker] Extrude ADD with auto merge");
  let currentBodyId = extrudedBodyId;
  let mergedIntoId: string | null = null;
  let mergedEntry: BodyEntry | null = null;
  const mergeWarnings: string[] = [];

  for (const [existingId, entry] of bodyMap) {
    console.log(`[Worker] Union with body ${existingId}`);
    const unionResult = currentSession.union(entry.bodyId, currentBodyId);
    console.log(`[Worker] Union result: success=${unionResult.success}`);
    if (unionResult.success) {
      // Delete old bodies if they're different from result
      if (currentBodyId !== unionResult.value) {
        currentSession.deleteBody(currentBodyId);
      }
      if (entry.bodyId !== unionResult.value) {
        currentSession.deleteBody(entry.bodyId);
      }
      currentBodyId = unionResult.value;
      if (!mergedIntoId) {
        mergedIntoId = existingId;
        mergedEntry = entry;
      }
    } else if (unionResult.error) {
      // Log warning but continue - bodies will remain separate
      console.warn(
        `[Worker] Union failed (bodies will remain separate): ${unionResult.error.message}`
      );
      mergeWarnings.push(`Union with existing body failed: ${unionResult.error.message}`);
    }
  }

  if (mergedIntoId && mergedEntry) {
    console.log(`[Worker] Merged into ${mergedIntoId}`);
    bodyMap.set(mergedIntoId, { ...mergedEntry, bodyId: currentBodyId });
    return {
      bodyId: null,
      bodyEntryId: mergedIntoId,
      bodyName: mergedEntry.name,
      bodyColor: mergedEntry.color,
    };
  }

  // No successful merge - return as separate body
  if (mergeWarnings.length > 0) {
    console.warn(
      `[Worker] Creating separate body due to merge failures: ${mergeWarnings.join("; ")}`
    );
  }
  return {
    bodyId: currentBodyId,
    bodyEntryId: featureId,
    bodyName: finalBodyName,
    bodyColor: finalBodyColor,
  };
}

function interpretRevolve(
  currentSession: SolidSession,
  featureMap: Y.Map<unknown>,
  featureId: string,
  _featuresById: Y.Map<Y.Map<unknown>>
): FeatureInterpretResult {
  const sketchId = featureMap.get("sketch") as string;
  const axisId = (featureMap.get("axis") as string) || "";
  const angleDeg = (featureMap.get("angle") as number) || 360;
  const op = (featureMap.get("op") as string) || "add";
  const mergeScope = (featureMap.get("mergeScope") as string) || "auto";
  const targetBodies = (featureMap.get("targetBodies") as string[]) || [];
  const resultBodyName = (featureMap.get("resultBodyName") as string) || "";
  const resultBodyColor = (featureMap.get("resultBodyColor") as string) || "";

  if (!sketchId) {
    throw new Error("Revolve requires a sketch reference");
  }
  if (!axisId) {
    throw new Error("Revolve requires an axis line selection");
  }

  const sketchInfo = sketchCache.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const axisEntity = sketchInfo.data.entitiesById[axisId];
  if (!axisEntity || axisEntity.type !== "line" || !axisEntity.start || !axisEntity.end) {
    throw new Error("Invalid axis selection");
  }

  const axisStart2d = sketchInfo.data.pointsById[axisEntity.start];
  const axisEnd2d = sketchInfo.data.pointsById[axisEntity.end];
  if (!axisStart2d || !axisEnd2d) {
    throw new Error("Axis references missing sketch points");
  }

  const sketch = currentSession.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  const sortedPointIds = Object.keys(sketchInfo.data.pointsById).sort();
  for (const pid of sortedPointIds) {
    const point = sketchInfo.data.pointsById[pid];
    const kernelPid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
    pointIdMap.set(point.id, kernelPid);
  }

  const sortedEntityIds = Object.keys(sketchInfo.data.entitiesById).sort();
  for (const eid of sortedEntityIds) {
    const entity = sketchInfo.data.entitiesById[eid];
    if (entity.type === "line" && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        const isAxis = entity.id === axisId;
        const kernelEid = sketch.addLine(startId, endId, { construction: isAxis });
        entityIdMap.set(entity.id, kernelEid);
      }
    }
    if (entity.type === "arc" && entity.start && entity.end && entity.center) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      const centerId = pointIdMap.get(entity.center);
      if (startId !== undefined && endId !== undefined && centerId !== undefined) {
        const kernelEid = sketch.addArc(startId, endId, centerId, entity.ccw ?? true);
        entityIdMap.set(entity.id, kernelEid);
      }
    }
  }

  const profileEntityIds: any[] = [];
  for (const eid of sortedEntityIds) {
    if (eid === axisId) continue;
    const kernelEid = entityIdMap.get(eid);
    if (kernelEid !== undefined) profileEntityIds.push(kernelEid);
  }

  const profile = sketch.getCoreSketch().toProfile(profileEntityIds);
  if (!profile) {
    throw new Error("Sketch does not contain a closed profile");
  }

  const axisStartWorld = planeToWorld(sketchInfo.plane, axisStart2d.x, axisStart2d.y);
  const axisEndWorld = planeToWorld(sketchInfo.plane, axisEnd2d.x, axisEnd2d.y);
  const axisDir = sub3(axisEndWorld, axisStartWorld);

  const result = currentSession.revolve(profile, {
    operation: "new",
    axis: { origin: axisStartWorld, direction: axisDir },
    angleDegrees: angleDeg,
  });

  if (!result.success) {
    throw new Error(result.error?.message || "Revolve failed");
  }

  const revolvedBodyId = result.value;

  // Handle cut operation
  if (op === "cut") {
    for (const [existingId, entry] of bodyMap) {
      const boolResult = currentSession.subtract(entry.bodyId, revolvedBodyId);
      if (boolResult.success) {
        bodyMap.set(existingId, { ...entry, bodyId: boolResult.value });
      }
    }
    currentSession.deleteBody(revolvedBodyId);
    return { bodyId: null, bodyEntryId: null };
  }

  // Handle add (same merge logic as extrude)
  const finalBodyName = resultBodyName || `Body${bodyMap.size + 1}`;
  const finalBodyColor = resultBodyColor || getNextBodyColor();

  if (mergeScope === "new" || bodyMap.size === 0) {
    return {
      bodyId: revolvedBodyId,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  if (mergeScope === "specific" && targetBodies.length > 0) {
    let currentBodyId = revolvedBodyId;
    let mergedIntoId: string | null = null;
    let mergedEntry: BodyEntry | null = null;

    for (const targetId of targetBodies) {
      const targetEntry = bodyMap.get(targetId);
      if (targetEntry) {
        const unionResult = currentSession.union(targetEntry.bodyId, currentBodyId);
        if (unionResult.success) {
          if (currentBodyId !== unionResult.value) {
            currentSession.deleteBody(currentBodyId);
          }
          if (targetEntry.bodyId !== unionResult.value) {
            currentSession.deleteBody(targetEntry.bodyId);
          }
          currentBodyId = unionResult.value;
          if (!mergedIntoId) {
            mergedIntoId = targetId;
            mergedEntry = targetEntry;
          }
        }
      }
    }

    if (mergedIntoId && mergedEntry) {
      bodyMap.set(mergedIntoId, { ...mergedEntry, bodyId: currentBodyId });
      return {
        bodyId: null,
        bodyEntryId: mergedIntoId,
        bodyName: mergedEntry.name,
        bodyColor: mergedEntry.color,
      };
    }

    return {
      bodyId: currentBodyId,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  // auto merge
  let currentBodyId = revolvedBodyId;
  let mergedIntoId: string | null = null;
  let mergedEntry: BodyEntry | null = null;

  for (const [existingId, entry] of bodyMap) {
    const unionResult = currentSession.union(entry.bodyId, currentBodyId);
    if (unionResult.success) {
      if (currentBodyId !== unionResult.value) {
        currentSession.deleteBody(currentBodyId);
      }
      if (entry.bodyId !== unionResult.value) {
        currentSession.deleteBody(entry.bodyId);
      }
      currentBodyId = unionResult.value;
      if (!mergedIntoId) {
        mergedIntoId = existingId;
        mergedEntry = entry;
      }
    }
  }

  if (mergedIntoId && mergedEntry) {
    bodyMap.set(mergedIntoId, { ...mergedEntry, bodyId: currentBodyId });
    return {
      bodyId: null,
      bodyEntryId: mergedIntoId,
      bodyName: mergedEntry.name,
      bodyColor: mergedEntry.color,
    };
  }

  return {
    bodyId: currentBodyId,
    bodyEntryId: featureId,
    bodyName: finalBodyName,
    bodyColor: finalBodyColor,
  };
}

function interpretBoolean(
  currentSession: SolidSession,
  featureMap: Y.Map<unknown>
): FeatureInterpretResult {
  const operation = (featureMap.get("operation") as string) || "union";
  const targetId = featureMap.get("target") as string;
  const toolId = featureMap.get("tool") as string;

  if (!targetId || !toolId) {
    throw new Error("Boolean requires target and tool body references");
  }

  const targetEntry = bodyMap.get(targetId);
  const toolEntry = bodyMap.get(toolId);

  if (!targetEntry) {
    throw new Error(`Target body not found: ${targetId}`);
  }
  if (!toolEntry) {
    throw new Error(`Tool body not found: ${toolId}`);
  }

  let result: OperationResult<BodyId>;
  switch (operation) {
    case "union":
      result = currentSession.union(targetEntry.bodyId, toolEntry.bodyId);
      break;
    case "subtract":
      result = currentSession.subtract(targetEntry.bodyId, toolEntry.bodyId);
      break;
    case "intersect":
      result = currentSession.intersect(targetEntry.bodyId, toolEntry.bodyId);
      break;
    default:
      throw new Error(`Unknown boolean operation: ${operation}`);
  }

  if (!result.success) {
    throw new Error(result.error?.message || "Boolean operation failed");
  }

  // Delete old bodies and update map
  currentSession.deleteBody(targetEntry.bodyId);
  currentSession.deleteBody(toolEntry.bodyId);
  bodyMap.delete(toolId);
  bodyMap.set(targetId, { ...targetEntry, bodyId: result.value });

  return {
    bodyId: null,
    bodyEntryId: targetId,
    bodyName: targetEntry.name,
    bodyColor: targetEntry.color,
  };
}

// ============================================================================
// Rebuild Logic
// ============================================================================

async function performRebuild(): Promise<void> {
  if (!doc) return;

  const root = getRoot(doc);
  const featuresById = getFeaturesById(root);
  const featureOrder = getFeatureOrder(root);
  const state = getState(root);
  const rebuildGate = state.get("rebuildGate") as string | null;

  self.postMessage({ type: "rebuild-start" } as WorkerToMainMessage);

  try {
    // Initialize session (async)
    const currentSession = await initializeSession();

    // Clear previous state
    currentSession.dispose();
    session = new SolidSession();
    await session.init();

    bodyMap.clear();
    sketchCache.clear();
    resetBodyColorIndex();

    // Build datum plane cache
    buildDatumPlaneCache(featuresById);

    const bodies: BodyInfo[] = [];
    const errors: BuildError[] = [];
    const featureStatus: Record<string, FeatureStatus> = {};

    let reachedGate = false;

    // Iterate in featureOrder (array of UUIDs)
    for (const id of featureOrder.toArray()) {
      const featureMap = featuresById.get(id);
      if (!featureMap) continue;

      const type = featureMap.get("type") as string;
      const suppressed = featureMap.get("suppressed") === true;

      // Check if we've passed the rebuild gate
      if (reachedGate) {
        featureStatus[id] = "gated";
        continue;
      }

      if (suppressed) {
        featureStatus[id] = "suppressed";
        continue;
      }

      try {
        let result: FeatureInterpretResult | null = null;

        switch (type) {
          case "origin":
          case "plane":
            featureStatus[id] = "computed";
            break;

          case "sketch":
            interpretSketch(session!, featureMap, featuresById);
            featureStatus[id] = "computed";
            break;

          case "extrude":
            result = interpretExtrude(session!, featureMap, id, featuresById);
            featureStatus[id] = "computed";

            // Check for bodyId !== null (not just truthy) because bodyId can be 0
            if (result.bodyId !== null && result.bodyEntryId !== null) {
              const entry: BodyEntry = {
                bodyId: result.bodyId,
                name: result.bodyName || `Body${bodyMap.size + 1}`,
                color: result.bodyColor || getNextBodyColor(),
                sourceFeatureId: id,
              };
              bodyMap.set(result.bodyEntryId, entry);
            }
            break;

          case "revolve":
            result = interpretRevolve(session!, featureMap, id, featuresById);
            featureStatus[id] = "computed";

            // Check for bodyId !== null (not just truthy) because bodyId can be 0
            if (result.bodyId !== null && result.bodyEntryId !== null) {
              const entry: BodyEntry = {
                bodyId: result.bodyId,
                name: result.bodyName || `Body${bodyMap.size + 1}`,
                color: result.bodyColor || getNextBodyColor(),
                sourceFeatureId: id,
              };
              bodyMap.set(result.bodyEntryId, entry);
            }
            break;

          case "boolean":
            result = interpretBoolean(session!, featureMap);
            featureStatus[id] = "computed";
            break;

          default:
            featureStatus[id] = "computed";
            break;
        }
      } catch (err) {
        errors.push({
          featureId: id,
          code: "BUILD_ERROR",
          message: err instanceof Error ? err.message : String(err),
        });
        featureStatus[id] = "error";
      }

      if (rebuildGate && id === rebuildGate) {
        reachedGate = true;
      }
    }

    // Build bodies list from bodyMap
    for (const [entryId, entry] of bodyMap) {
      bodies.push({
        id: String(entry.bodyId),
        featureId: entryId,
        faceCount: 0, // Face count not available in new API without topology access
        name: entry.name,
        color: entry.color,
      });
    }

    self.postMessage({
      type: "rebuild-complete",
      bodies,
      featureStatus,
      errors,
    } as WorkerToMainMessage);

    // Send meshes for all bodies
    for (const [featureId, entry] of bodyMap) {
      sendMesh(session!, featureId, entry.bodyId, entry.color);
    }
  } catch (err) {
    console.error("[Worker] Rebuild failed:", err);
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } as WorkerToMainMessage);
  }
}

function sendMesh(
  currentSession: SolidSession,
  featureId: string,
  bodyId: BodyId,
  color?: string
): void {
  try {
    console.log(`[Worker] sendMesh for ${featureId}`);

    const mesh = currentSession.tessellate(bodyId);

    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const indices = new Uint32Array(mesh.indices);
    const faceMap = mesh.faceMap ? new Uint32Array(mesh.faceMap) : undefined;
    const edges = mesh.edges ? new Float32Array(mesh.edges) : undefined;
    const edgeMap = mesh.edgeMap ? new Uint32Array(mesh.edgeMap) : undefined;

    console.log(
      `[Worker] Mesh stats: ${positions.length / 3} vertices, ${indices.length / 3} triangles, ${faceMap?.length ?? 0} faces, ${edges ? edges.length / 6 : 0} edge segments, ${edgeMap?.length ?? 0} unique edges`
    );

    const transferableMesh: TransferableMesh = {
      positions,
      normals,
      indices,
      faceMap,
      edges,
      edgeMap,
    };

    const transferBuffers: ArrayBuffer[] = [positions.buffer, normals.buffer, indices.buffer];
    if (faceMap) {
      transferBuffers.push(faceMap.buffer);
    }
    if (edges) {
      transferBuffers.push(edges.buffer);
    }
    if (edgeMap) {
      transferBuffers.push(edgeMap.buffer);
    }

    self.postMessage(
      {
        type: "mesh",
        bodyId: featureId,
        mesh: transferableMesh,
        color,
      } as WorkerToMainMessage,
      { transfer: transferBuffers }
    );
  } catch (err) {
    console.error("Failed to tessellate body:", err);
  }
}

// ============================================================================
// Preview Functions
// ============================================================================

async function performPreviewExtrude(
  sketchId: string,
  distance: number,
  direction: string,
  _op: string
): Promise<BodyId | null> {
  const previewSession = new SolidSession();
  await previewSession.init();

  const sketchInfo = sketchCache.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const sketch = previewSession.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();

  for (const [, point] of Object.entries(sketchInfo.data.pointsById)) {
    const p = point as any;
    const kernelPid = sketch.addPoint(p.x, p.y, { fixed: p.fixed });
    pointIdMap.set(p.id, kernelPid);
  }

  for (const [, entity] of Object.entries(sketchInfo.data.entitiesById)) {
    const e = entity as any;
    if (e.type === "line" && e.start && e.end) {
      const startId = pointIdMap.get(e.start);
      const endId = pointIdMap.get(e.end);
      if (startId !== undefined && endId !== undefined) {
        sketch.addLine(startId, endId);
      }
    }
    if (e.type === "arc" && e.start && e.end && e.center) {
      const startId = pointIdMap.get(e.start);
      const endId = pointIdMap.get(e.end);
      const centerId = pointIdMap.get(e.center);
      if (startId !== undefined && endId !== undefined && centerId !== undefined) {
        sketch.addArc(startId, endId, centerId, e.ccw ?? true);
      }
    }
  }

  const profile = sketch.toProfile();
  if (!profile) {
    throw new Error("Sketch does not contain a closed profile");
  }

  const dirMultiplier = direction === "reverse" ? -1 : 1;
  const finalDistance = distance * dirMultiplier;

  const result = previewSession.extrude(profile, {
    operation: "new",
    distance: finalDistance,
  });

  if (!result.success) {
    throw new Error(result.error?.message || "Extrude failed");
  }

  // Tessellate and send mesh
  const mesh = previewSession.tessellate(result.value);
  const positions = new Float32Array(mesh.positions);
  const normals = new Float32Array(mesh.normals);
  const indices = new Uint32Array(mesh.indices);

  const transferableMesh: TransferableMesh = {
    positions,
    normals,
    indices,
  };

  self.postMessage(
    {
      type: "mesh",
      bodyId: `__preview_extrude_${_op}`,
      mesh: transferableMesh,
    } as WorkerToMainMessage,
    { transfer: [positions.buffer, normals.buffer, indices.buffer] }
  );

  previewSession.dispose();
  return result.value;
}

async function performPreviewRevolve(
  sketchId: string,
  axisId: string,
  angleDeg: number,
  _op: string
): Promise<BodyId | null> {
  const previewSession = new SolidSession();
  await previewSession.init();

  const sketchInfo = sketchCache.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const axisEntity = sketchInfo.data.entitiesById[axisId];
  if (!axisEntity || axisEntity.type !== "line" || !axisEntity.start || !axisEntity.end) {
    throw new Error("Invalid axis selection");
  }

  const axisStart2d = sketchInfo.data.pointsById[axisEntity.start];
  const axisEnd2d = sketchInfo.data.pointsById[axisEntity.end];
  if (!axisStart2d || !axisEnd2d) {
    throw new Error("Axis references missing sketch points");
  }

  const sketch = previewSession.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  for (const [, point] of Object.entries(sketchInfo.data.pointsById)) {
    const p = point as any;
    const kernelPid = sketch.addPoint(p.x, p.y, { fixed: p.fixed });
    pointIdMap.set(p.id, kernelPid);
  }

  for (const [, entity] of Object.entries(sketchInfo.data.entitiesById)) {
    const e = entity as any;
    if (e.type === "line" && e.start && e.end) {
      const startId = pointIdMap.get(e.start);
      const endId = pointIdMap.get(e.end);
      if (startId !== undefined && endId !== undefined) {
        const isAxis = e.id === axisId;
        const kernelEid = sketch.addLine(startId, endId, { construction: isAxis });
        entityIdMap.set(e.id, kernelEid);
      }
    }
    if (e.type === "arc" && e.start && e.end && e.center) {
      const startId = pointIdMap.get(e.start);
      const endId = pointIdMap.get(e.end);
      const centerId = pointIdMap.get(e.center);
      if (startId !== undefined && endId !== undefined && centerId !== undefined) {
        const kernelEid = sketch.addArc(startId, endId, centerId, e.ccw ?? true);
        entityIdMap.set(e.id, kernelEid);
      }
    }
  }

  const profileEntityIds: any[] = [];
  for (const [eid, _] of Object.entries(sketchInfo.data.entitiesById)) {
    if (eid === axisId) continue;
    const kernelEid = entityIdMap.get(eid);
    if (kernelEid !== undefined) profileEntityIds.push(kernelEid);
  }

  const profile = sketch.getCoreSketch().toProfile(profileEntityIds);
  if (!profile) {
    throw new Error("Sketch does not contain a closed profile");
  }

  const axisStartWorld = planeToWorld(sketchInfo.plane, axisStart2d.x, axisStart2d.y);
  const axisEndWorld = planeToWorld(sketchInfo.plane, axisEnd2d.x, axisEnd2d.y);
  const axisDir = sub3(axisEndWorld, axisStartWorld);

  const result = previewSession.revolve(profile, {
    operation: "new",
    axis: { origin: axisStartWorld, direction: axisDir },
    angleDegrees: angleDeg,
  });

  if (!result.success) {
    throw new Error(result.error?.message || "Revolve failed");
  }

  // Tessellate and send mesh
  const mesh = previewSession.tessellate(result.value);
  const positions = new Float32Array(mesh.positions);
  const normals = new Float32Array(mesh.normals);
  const indices = new Uint32Array(mesh.indices);

  const transferableMesh: TransferableMesh = {
    positions,
    normals,
    indices,
  };

  self.postMessage(
    {
      type: "mesh",
      bodyId: `__preview_revolve_${_op}`,
      mesh: transferableMesh,
    } as WorkerToMainMessage,
    { transfer: [positions.buffer, normals.buffer, indices.buffer] }
  );

  previewSession.dispose();
  return result.value;
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
  const { type } = event.data;

  switch (type) {
    case "init-sync":
      setupYjsSync(event.data.port);
      break;

    case "yjs-init":
    case "yjs-update":
      if (syncPort && doc) {
        Y.applyUpdate(doc, new Uint8Array(event.data.data), "main");
      }
      break;

    case "clear-preview":
      break;

    case "preview-extrude": {
      try {
        if (!doc) throw new Error("Worker not ready");
        const { sketchId, distance, direction, op } = event.data;

        // Ensure we have sketch data
        const root = getRoot(doc);
        const featuresById = getFeaturesById(root);
        const sketchMap = featuresById.get(sketchId);
        if (!sketchMap) throw new Error(`Sketch not found: ${sketchId}`);

        // Build sketch info for preview if not cached
        if (!sketchCache.has(sketchId)) {
          const previewSession = new SolidSession();
          await previewSession.init();
          interpretSketch(previewSession, sketchMap, featuresById);
          previewSession.dispose();
        }

        await performPreviewExtrude(sketchId, distance, direction, op);
      } catch (err) {
        self.postMessage({
          type: "preview-error",
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }

    case "preview-revolve": {
      try {
        if (!doc) throw new Error("Worker not ready");
        const { sketchId, axis, angle, op } = event.data;

        const root = getRoot(doc);
        const featuresById = getFeaturesById(root);
        const sketchMap = featuresById.get(sketchId);
        if (!sketchMap) throw new Error(`Sketch not found: ${sketchId}`);

        // Build sketch info for preview if not cached
        if (!sketchCache.has(sketchId)) {
          const previewSession = new SolidSession();
          await previewSession.init();
          interpretSketch(previewSession, sketchMap, featuresById);
          previewSession.dispose();
        }

        await performPreviewRevolve(sketchId, axis, angle, op);
      } catch (err) {
        self.postMessage({
          type: "preview-error",
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }

    case "export-stl": {
      try {
        const { binary = true, name = "model" } = event.data;

        if (!session) {
          throw new Error("No session available");
        }

        // Collect meshes from all bodies
        const meshes: Mesh[] = [];
        for (const [, entry] of bodyMap) {
          const mesh = session.tessellate(entry.bodyId);
          meshes.push(mesh);
        }

        if (meshes.length === 0) {
          throw new Error("No bodies to export");
        }

        const result = exportMeshesToStl(meshes, { binary, name });

        if (binary && result instanceof ArrayBuffer) {
          self.postMessage({ type: "stl-exported", buffer: result } as WorkerToMainMessage, [
            result,
          ]);
        } else if (typeof result === "string") {
          self.postMessage({ type: "stl-exported", content: result } as WorkerToMainMessage);
        }
      } catch (err) {
        self.postMessage({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }

    case "export-json": {
      try {
        if (!doc) {
          throw new Error("Worker not ready");
        }
        const root = getRoot(doc);
        const json = mapToObject(root);
        const content = JSON.stringify(json, null, 2);
        self.postMessage({ type: "json-exported", content } as WorkerToMainMessage);
      } catch (err) {
        self.postMessage({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }

    case "export-step": {
      try {
        if (!session) {
          throw new Error("No session available");
        }

        // Get all body IDs
        const bodyIds = Array.from(bodyMap.values()).map((entry) => entry.bodyId);

        if (bodyIds.length === 0) {
          throw new Error("No bodies to export");
        }

        // Export first body for now (TODO: support compound/assembly)
        const stepData = session.exportSTEP(bodyIds[0]);

        // Convert Uint8Array to ArrayBuffer for transfer
        const buffer = stepData.buffer.slice(
          stepData.byteOffset,
          stepData.byteOffset + stepData.byteLength
        );

        self.postMessage({ type: "step-exported", buffer } as WorkerToMainMessage, [buffer]);
      } catch (err) {
        self.postMessage({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }
  }
};
