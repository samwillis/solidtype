/**
 * Document creation and initialization
 *
 * Uses Y.Map and Y.Array for the persisted model (no XML).
 * See DOCUMENT-MODEL.md for specification.
 */

import * as Y from "yjs";
import {
  uuid,
  getRoot,
  getMeta,
  getState,
  getFeaturesById,
  getFeatureOrder,
  createFeatureMap,
  setMapProperties,
  assertNoGhostState,
} from "./yjs";
import type { DatumPlaneRole, SketchPlaneRef } from "./schema";

// ============================================================================
// Document Interface
// ============================================================================

export interface SolidTypeDoc {
  ydoc: Y.Doc;
  root: Y.Map<unknown>;
  meta: Y.Map<unknown>;
  state: Y.Map<unknown>;
  featuresById: Y.Map<Y.Map<unknown>>;
  featureOrder: Y.Array<string>;
}

// ============================================================================
// Default Plane Dimensions
// ============================================================================

const DEFAULT_PLANE_WIDTH = 100;
const DEFAULT_PLANE_HEIGHT = 100;

// ============================================================================
// Document Creation
// ============================================================================

/**
 * Create a new SolidType document with default features
 *
 * Layout:
 * - root: Y.Map
 *   - meta: Y.Map (schemaVersion, name, created, modified, units)
 *   - state: Y.Map (rebuildGate)
 *   - featuresById: Y.Map<uuid, Y.Map> (feature records)
 *   - featureOrder: Y.Array<uuid> (feature ordering)
 */
export function createDocument(): SolidTypeDoc {
  const ydoc = new Y.Doc();

  // Create root and all required submaps in a single transaction
  ydoc.transact(() => {
    const root = ydoc.getMap("root");

    // Create meta map
    const meta = new Y.Map();
    root.set("meta", meta);
    meta.set("schemaVersion", 2);
    meta.set("name", "Untitled");
    meta.set("created", Date.now());
    meta.set("modified", Date.now());
    meta.set("units", "mm");

    // Create state map
    const state = new Y.Map();
    root.set("state", state);
    state.set("rebuildGate", null);

    // Create features maps
    const featuresById = new Y.Map<Y.Map<unknown>>();
    root.set("featuresById", featuresById);

    const featureOrder = new Y.Array<string>();
    root.set("featureOrder", featureOrder);

    // Create default features (origin + 3 datum planes)
    initializeDefaultFeatures(featuresById, featureOrder);
  });

  const root = getRoot(ydoc);

  // Dev-only: Check for ghost state
  if (import.meta.env?.DEV) {
    assertNoGhostState(ydoc);
  }

  return {
    ydoc,
    root,
    meta: getMeta(root),
    state: getState(root),
    featuresById: getFeaturesById(root),
    featureOrder: getFeatureOrder(root),
  };
}

/**
 * Initialize the default datum features (origin + planes)
 * Must be called within a transaction after featuresById is integrated
 */
function initializeDefaultFeatures(
  featuresById: Y.Map<Y.Map<unknown>>,
  featureOrder: Y.Array<string>
): void {
  // Generate UUIDs for default features
  const originId = uuid();
  const xyPlaneId = uuid();
  const xzPlaneId = uuid();
  const yzPlaneId = uuid();

  // Add origin
  const origin = createFeatureMap();
  featuresById.set(originId, origin);
  setMapProperties(origin, {
    id: originId,
    type: "origin",
    name: "Origin",
    visible: false,
  });

  // Add XY plane
  const xyPlane = createFeatureMap();
  featuresById.set(xyPlaneId, xyPlane);
  setMapProperties(xyPlane, {
    id: xyPlaneId,
    type: "plane",
    name: "XY Plane",
    role: "xy" as DatumPlaneRole,
    normal: [0, 0, 1],
    origin: [0, 0, 0],
    xDir: [1, 0, 0],
    visible: true,
    width: DEFAULT_PLANE_WIDTH,
    height: DEFAULT_PLANE_HEIGHT,
    offsetX: 0,
    offsetY: 0,
  });

  // Add XZ plane
  const xzPlane = createFeatureMap();
  featuresById.set(xzPlaneId, xzPlane);
  setMapProperties(xzPlane, {
    id: xzPlaneId,
    type: "plane",
    name: "XZ Plane",
    role: "xz" as DatumPlaneRole,
    normal: [0, 1, 0],
    origin: [0, 0, 0],
    xDir: [1, 0, 0],
    visible: true,
    width: DEFAULT_PLANE_WIDTH,
    height: DEFAULT_PLANE_HEIGHT,
    offsetX: 0,
    offsetY: 0,
  });

  // Add YZ plane
  const yzPlane = createFeatureMap();
  featuresById.set(yzPlaneId, yzPlane);
  setMapProperties(yzPlane, {
    id: yzPlaneId,
    type: "plane",
    name: "YZ Plane",
    role: "yz" as DatumPlaneRole,
    normal: [1, 0, 0],
    origin: [0, 0, 0],
    xDir: [0, 1, 0],
    visible: true,
    width: DEFAULT_PLANE_WIDTH,
    height: DEFAULT_PLANE_HEIGHT,
    offsetX: 0,
    offsetY: 0,
  });

  // Pinned order: [origin, xy, xz, yz]
  featureOrder.push([originId, xyPlaneId, xzPlaneId, yzPlaneId]);
}

// ============================================================================
// Document Loading (from existing Y.Doc)
// ============================================================================

/**
 * Load a SolidTypeDoc from an existing Y.Doc
 * Use this when loading from a provider or sync
 */
export function loadDocument(ydoc: Y.Doc): SolidTypeDoc {
  const root = getRoot(ydoc);

  // Dev-only: Check for ghost state
  if (import.meta.env?.DEV) {
    assertNoGhostState(ydoc);
  }

  return {
    ydoc,
    root,
    meta: getMeta(root),
    state: getState(root),
    featuresById: getFeaturesById(root),
    featureOrder: getFeatureOrder(root),
  };
}

// ============================================================================
// Datum Plane Helpers
// ============================================================================

/**
 * Find datum plane ID by role
 */
export function findDatumPlaneByRole(doc: SolidTypeDoc, role: DatumPlaneRole): string | null {
  let foundId: string | null = null;
  doc.featuresById.forEach((featureMap, id) => {
    if (featureMap.get("type") === "plane" && featureMap.get("role") === role) {
      foundId = id;
    }
  });
  return foundId;
}

/**
 * Get all datum plane IDs in role order (xy, xz, yz)
 */
export function getDatumPlaneIds(doc: SolidTypeDoc): {
  origin: string | null;
  xy: string | null;
  xz: string | null;
  yz: string | null;
} {
  let origin: string | null = null;
  let xy: string | null = null;
  let xz: string | null = null;
  let yz: string | null = null;

  doc.featuresById.forEach((featureMap, id) => {
    const type = featureMap.get("type");
    if (type === "origin") {
      origin = id;
    } else if (type === "plane") {
      const role = featureMap.get("role") as DatumPlaneRole | undefined;
      if (role === "xy") xy = id;
      else if (role === "xz") xz = id;
      else if (role === "yz") yz = id;
    }
  });

  return { origin, xy, xz, yz };
}

/**
 * Create a SketchPlaneRef for a datum plane role
 */
export function makePlaneRef(doc: SolidTypeDoc, role: DatumPlaneRole): SketchPlaneRef {
  const planeId = findDatumPlaneByRole(doc, role);
  if (!planeId) {
    throw new Error(`Datum plane with role '${role}' not found`);
  }
  return { kind: "planeFeatureId", ref: planeId };
}

/**
 * Create a SketchPlaneRef for a face reference
 */
export function makeFaceRef(faceRefString: string): SketchPlaneRef {
  return { kind: "faceRef", ref: faceRefString };
}

/**
 * Create a SketchPlaneRef from a legacy plane ID string
 * Converts 'xy', 'xz', 'yz' to proper planeFeatureId refs
 * Or converts 'face:...' to faceRef
 */
export function parsePlaneRef(doc: SolidTypeDoc, planeString: string): SketchPlaneRef {
  // Check for legacy datum plane roles
  if (planeString === "xy" || planeString === "xz" || planeString === "yz") {
    return makePlaneRef(doc, planeString);
  }

  // Check for face reference
  if (planeString.startsWith("face:")) {
    return makeFaceRef(planeString);
  }

  // Check if it's already a UUID (plane feature ID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(planeString)) {
    return { kind: "planeFeatureId", ref: planeString };
  }

  // Custom plane reference
  return { kind: "custom", ref: planeString };
}
