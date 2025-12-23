/**
 * Kernel Web Worker
 * 
 * Runs the CAD kernel in a separate thread and syncs with the Yjs document.
 * Uses Y.Map/Y.Array model (no XML). See DOCUMENT-MODEL.md.
 */

/// <reference lib="webworker" />

import * as Y from 'yjs';
import {
  SolidSession,
  Body,
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
  exportMeshesToStl,
} from '@solidtype/core';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  TransferableMesh,
  BodyInfo,
  BuildError,
  FeatureStatus,
} from './types';
import {
  getRoot,
  getMeta as _getMeta,
  getState,
  getFeaturesById,
  getFeatureOrder,
  mapToObject,
  getSortedKeys as _getSortedKeys,
} from '../document/yjs';
import type { SketchPlaneRef, DatumPlaneRole } from '../document/schema';

// Declare self as a worker global scope
declare const self: DedicatedWorkerGlobalScope;

// Global error handler for the worker
self.onerror = (event) => {
  console.error('[Worker] Unhandled error:', event);
  return false;
};

self.onunhandledrejection = (event) => {
  console.error('[Worker] Unhandled promise rejection:', event.reason);
};

console.log('[Worker] Kernel worker starting...');

// ============================================================================
// Worker State
// ============================================================================

let doc: Y.Doc | null = null;
let syncPort: MessagePort | null = null;
let session: SolidSession | null = null;
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Body entry in the bodyMap - stores body with metadata
 */
interface BodyEntry {
  body: Body;
  name: string;
  color: string;
  /** Feature ID that created this body (for reference tracking) */
  sourceFeatureId: string;
}

// Map of body IDs to their entries (body + metadata)
// Key is the feature ID that created/owns the body
const bodyMap = new Map<string, BodyEntry>();

/** Default body colors - cycle through these for new bodies */
const DEFAULT_BODY_COLORS = [
  '#6699cc', // blue-gray
  '#99cc99', // green
  '#cc9999', // red
  '#cccc99', // yellow
  '#cc99cc', // purple
  '#99cccc', // cyan
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
// Yjs Sync Setup
// ============================================================================

let observersSetUp = false;

function setupObservers(): void {
  if (observersSetUp || !doc) return;
  
  const root = getRoot(doc);
  const featuresById = root.get('featuresById') as Y.Map<Y.Map<unknown>> | undefined;
  const featureOrder = root.get('featureOrder') as Y.Array<string> | undefined;
  const state = root.get('state') as Y.Map<unknown> | undefined;
  
  // Only set up observers once all required fields exist
  if (!featuresById || !featureOrder || !state) {
    console.log('[Worker] Document structure not ready yet, waiting for sync...');
    return;
  }
  
  observersSetUp = true;
  console.log('[Worker] Setting up Yjs observers');

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

    if (type === 'yjs-init' || type === 'yjs-update') {
      Y.applyUpdate(doc!, new Uint8Array(data), 'main');
      
      // Try to set up observers after each update (will only succeed once structure exists)
      if (!observersSetUp) {
        setupObservers();
      }
    }
  };

  // Signal ready and trigger initial rebuild
  console.log('[Worker] Yjs sync setup complete, signaling ready');
  self.postMessage({ type: 'ready' } as WorkerToMainMessage);

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
    if (featureMap.get('type') === 'plane' && featureMap.get('role') === role) {
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
    xy: findDatumPlaneByRole(featuresById, 'xy'),
    xz: findDatumPlaneByRole(featuresById, 'xz'),
    yz: findDatumPlaneByRole(featuresById, 'yz'),
  };
  void datumPlaneCache; // suppress unused read warning - cache for future use
}

/**
 * Get DatumPlane from a plane feature map
 */
function getDatumPlaneFromFeature(featureMap: Y.Map<unknown>): DatumPlane | null {
  const type = featureMap.get('type');
  if (type !== 'plane') return null;

  const role = featureMap.get('role') as DatumPlaneRole | undefined;
  const normal = featureMap.get('normal') as [number, number, number];
  const origin = featureMap.get('origin') as [number, number, number];
  const xDir = featureMap.get('xDir') as [number, number, number];

  // For datum planes with standard roles, use predefined planes
  if (role === 'xy') return XY_PLANE;
  if (role === 'xz') return ZX_PLANE;
  if (role === 'yz') return YZ_PLANE;

  // For custom planes, create from vectors
  const yDir = [
    normal[1] * xDir[2] - normal[2] * xDir[1],
    normal[2] * xDir[0] - normal[0] * xDir[2],
    normal[0] * xDir[1] - normal[1] * xDir[0],
  ] as [number, number, number];

  return createDatumPlane('custom', {
    kind: 'plane',
    origin,
    normal,
    xDir,
    yDir,
  });
}

/**
 * Get sketch plane from a SketchPlaneRef
 */
function getSketchPlane(
  planeRef: SketchPlaneRef,
  featuresById: Y.Map<Y.Map<unknown>>
): DatumPlane | null {
  if (planeRef.kind === 'planeFeatureId') {
    const planeFeature = featuresById.get(planeRef.ref);
    if (!planeFeature) return null;
    return getDatumPlaneFromFeature(planeFeature);
  }

  if (planeRef.kind === 'faceRef') {
    // Parse face reference: face:featureId:faceIndex
    const parts = planeRef.ref.split(':');
    if (parts.length < 3 || parts[0] !== 'face') return null;

    const [, featureId, faceIndexStr] = parts;
    const faceIndex = parseInt(faceIndexStr, 10);

    // Find the body for this feature
    const targetEntry = bodyMap.get(featureId);
    if (!targetEntry || !session) return null;

    // Get the face from the body
    const faces = targetEntry.body.getFaces();
    if (faceIndex < 0 || faceIndex >= faces.length) return null;

    const face = faces[faceIndex];

    // Get the face surface from the model
    const model = session.getModel();
    const surfaceIdx = model.getFaceSurfaceIndex(face.id);
    const surface = model.getSurface(surfaceIdx);

    // Only planar faces can be used as sketch planes
    if (surface.kind !== 'plane') return null;

    // Adjust normal direction based on face orientation
    let normal = surface.normal;
    if (model.isFaceReversed(face.id)) {
      normal = [-normal[0], -normal[1], -normal[2]] as typeof normal;
    }

    return createDatumPlane(`Face:${featureId}:${faceIndex}`, {
      kind: 'plane',
      origin: surface.origin,
      normal,
      xDir: surface.xDir,
      yDir: surface.yDir,
    });
  }

  return null;
}

// ============================================================================
// Feature Interpretation
// ============================================================================

function _getSketchFeatureById(
  featuresById: Y.Map<Y.Map<unknown>>,
  sketchId: string
): Y.Map<unknown> | null {
  const feature = featuresById.get(sketchId);
  if (!feature || feature.get('type') !== 'sketch') return null;
  return feature;
}
void _getSketchFeatureById; // suppress unused warning

interface SketchData {
  pointsById: Record<string, { 
    id: string; 
    x: number; 
    y: number; 
    fixed?: boolean;
    attachedTo?: string;
    param?: number;
  }>;
  entitiesById: Record<string, { 
    id: string; 
    type: string; 
    start?: string; 
    end?: string; 
    center?: string; 
    ccw?: boolean;
  }>;
  constraintsById: Record<string, any>;
}

function parseSketchData(sketchMap: Y.Map<unknown>): SketchData {
  const dataMap = sketchMap.get('data') as Y.Map<unknown> | undefined;

  if (!dataMap) {
    return { pointsById: {}, entitiesById: {}, constraintsById: {} };
  }

  const pointsById: Record<string, any> = {};
  const entitiesById: Record<string, any> = {};
  const constraintsById: Record<string, any> = {};

  const pointsMap = dataMap.get('pointsById') as Y.Map<Y.Map<unknown>> | undefined;
  if (pointsMap) {
    pointsMap.forEach((pointMap, id) => {
      pointsById[id] = mapToObject(pointMap);
    });
  }

  const entitiesMap = dataMap.get('entitiesById') as Y.Map<Y.Map<unknown>> | undefined;
  if (entitiesMap) {
    entitiesMap.forEach((entityMap, id) => {
      entitiesById[id] = mapToObject(entityMap);
    });
  }

  const constraintsMap = dataMap.get('constraintsById') as Y.Map<Y.Map<unknown>> | undefined;
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
const _sketchMap = new Map<string, SketchInfo>();
void _sketchMap; // suppress unused warning

/**
 * Calculate extrude distance based on extent type (Phase 14)
 */
function calculateExtrudeDistance(
  featureMap: Y.Map<unknown>,
  direction: number,
  sketchPlane?: DatumPlane
): number {
  const extent = (featureMap.get('extent') as string) || 'blind';
  const baseDistance = (featureMap.get('distance') as number) || 10;

  switch (extent) {
    case 'blind':
      return baseDistance * direction;

    case 'throughAll':
      return 1000 * direction;

    case 'toFace': {
      const extentRef = featureMap.get('extentRef') as string | undefined;
      if (!extentRef) {
        throw new Error('toFace extent requires extentRef');
      }

      const parts = extentRef.split(':');
      if (parts.length < 3 || parts[0] !== 'face') {
        throw new Error(`Invalid face reference: ${extentRef}`);
      }
      const [, featureId, faceIndexStr] = parts;
      const faceIndex = parseInt(faceIndexStr, 10);

      const targetEntry = bodyMap.get(featureId);
      if (!targetEntry || !session || !sketchPlane) {
        console.warn(`Cannot resolve toFace reference: ${extentRef}`);
        return baseDistance * direction;
      }

      const faces = targetEntry.body.getFaces();
      if (faceIndex < 0 || faceIndex >= faces.length) {
        console.warn(`Face index out of range: ${faceIndex}`);
        return baseDistance * direction;
      }

      const targetFace = faces[faceIndex];
      const faceCentroid = targetFace.getCentroid();

      const planeNormal = sketchPlane.surface.normal;
      const planeOrigin = sketchPlane.surface.origin;

      const dx = faceCentroid[0] - planeOrigin[0];
      const dy = faceCentroid[1] - planeOrigin[1];
      const dz = faceCentroid[2] - planeOrigin[2];
      const dist = dx * planeNormal[0] + dy * planeNormal[1] + dz * planeNormal[2];

      return Math.abs(dist) * direction;
    }

    case 'toVertex':
      return baseDistance * direction;

    default:
      return baseDistance * direction;
  }
}

/**
 * Resolve an attachment reference to world coordinates (Phase 16)
 */
function resolveAttachment(
  attachedTo: string,
  param: number = 0.5
): { x: number; y: number; z: number } | null {
  if (!session) return null;

  if (attachedTo.startsWith('edge:')) {
    const parts = attachedTo.split(':');
    if (parts.length < 3) return null;

    const [, featureId, edgeIndexStr] = parts;
    const edgeIndex = parseInt(edgeIndexStr, 10);

    const entry = bodyMap.get(featureId);
    if (!entry) return null;

    const model = session.getModel();
    const shells = model.getBodyShells(entry.body.id);

    const allEdges: Array<{ id: unknown; startVertex: unknown; endVertex: unknown }> = [];
    for (const shellId of shells) {
      const faces = model.getShellFaces(shellId);
      for (const faceId of faces) {
        const loops = model.getFaceLoops(faceId);
        for (const loopId of loops) {
          for (const he of model.iterateLoopHalfEdges(loopId)) {
            const edgeId = model.getHalfEdgeEdge(he);
            if (!allEdges.some((e) => e.id === edgeId)) {
              const startVertex = model.getHalfEdgeStartVertex(he);
              const endVertex = model.getHalfEdgeEndVertex(he);
              allEdges.push({ id: edgeId, startVertex, endVertex });
            }
          }
        }
      }
    }

    if (edgeIndex < 0 || edgeIndex >= allEdges.length) return null;

    const edge = allEdges[edgeIndex];
    const startPos = model.getVertexPosition(
      edge.startVertex as Parameters<typeof model.getVertexPosition>[0]
    );
    const endPos = model.getVertexPosition(
      edge.endVertex as Parameters<typeof model.getVertexPosition>[0]
    );

    const t = Math.max(0, Math.min(1, param));
    return {
      x: startPos[0] + t * (endPos[0] - startPos[0]),
      y: startPos[1] + t * (endPos[1] - startPos[1]),
      z: startPos[2] + t * (endPos[2] - startPos[2]),
    };
  }

  if (attachedTo.startsWith('vertex:')) {
    const parts = attachedTo.split(':');
    if (parts.length < 3) return null;

    const [, featureId, vertexIndexStr] = parts;
    const vertexIndex = parseInt(vertexIndexStr, 10);

    const entry = bodyMap.get(featureId);
    if (!entry) return null;

    const model = session.getModel();
    const shells = model.getBodyShells(entry.body.id);

    const allVertices: unknown[] = [];
    for (const shellId of shells) {
      const faces = model.getShellFaces(shellId);
      for (const faceId of faces) {
        const loops = model.getFaceLoops(faceId);
        for (const loopId of loops) {
          for (const he of model.iterateLoopHalfEdges(loopId)) {
            const vertexId = model.getHalfEdgeStartVertex(he);
            if (!allVertices.includes(vertexId)) {
              allVertices.push(vertexId);
            }
          }
        }
      }
    }

    if (vertexIndex < 0 || vertexIndex >= allVertices.length) return null;

    const pos = model.getVertexPosition(
      allVertices[vertexIndex] as Parameters<typeof model.getVertexPosition>[0]
    );
    return { x: pos[0], y: pos[1], z: pos[2] };
  }

  return null;
}

/**
 * Project a world point onto a sketch plane
 */
function projectToSketchPlane(
  worldPos: { x: number; y: number; z: number },
  plane: DatumPlane
): { x: number; y: number } {
  const { origin, xDir, yDir } = plane.surface;

  const dx = worldPos.x - origin[0];
  const dy = worldPos.y - origin[1];
  const dz = worldPos.z - origin[2];

  const x = dx * xDir[0] + dy * xDir[1] + dz * xDir[2];
  const y = dx * yDir[0] + dy * yDir[1] + dz * yDir[2];

  return { x, y };
}

function interpretSketch(
  session: SolidSession,
  sketchMap: Y.Map<unknown>,
  featuresById: Y.Map<Y.Map<unknown>>
): void {
  const id = sketchMap.get('id') as string;
  const planeRef = sketchMap.get('plane') as SketchPlaneRef;

  const plane = getSketchPlane(planeRef, featuresById);
  if (!plane) {
    throw new Error(`Cannot resolve sketch plane`);
  }

  const data = parseSketchData(sketchMap);

  // Build a kernel sketch
  const sketch = session.createSketch(plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  // Sort keys for deterministic iteration
  const sortedPointIds = Object.keys(data.pointsById).sort();
  for (const pointId of sortedPointIds) {
    const point = data.pointsById[pointId];
    let x = point.x;
    let y = point.y;
    let isFixed = point.fixed;

    // Resolve external attachment if present (Phase 16)
    if (point.attachedTo) {
      const worldPos = resolveAttachment(point.attachedTo, point.param);
      if (worldPos) {
        const projected = projectToSketchPlane(worldPos, plane);
        x = projected.x;
        y = projected.y;
        isFixed = true;
      }
    }

    const pid = sketch.addPoint(x, y, { fixed: isFixed });
    pointIdMap.set(point.id, pid);
  }

  const sortedEntityIds = Object.keys(data.entitiesById).sort();
  for (const entityId of sortedEntityIds) {
    const entity = data.entitiesById[entityId];
    if (entity.type === 'line' && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        const eid = sketch.addLine(startId, endId);
        entityIdMap.set(entity.id, eid);
      }
    }
    if (entity.type === 'arc' && entity.start && entity.end && entity.center) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      const centerId = pointIdMap.get(entity.center);
      if (startId !== undefined && endId !== undefined && centerId !== undefined) {
        const eid = sketch.addArc(startId, endId, centerId, entity.ccw ?? true);
        entityIdMap.set(entity.id, eid);
      }
    }
  }

  // Apply constraints (sorted for determinism)
  const sortedConstraintIds = Object.keys(data.constraintsById).sort();
  for (const constraintId of sortedConstraintIds) {
    const c = data.constraintsById[constraintId];
    if (!c || typeof c !== 'object') continue;

    switch (c.type) {
      case 'coincident': {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        if (p1 !== undefined && p2 !== undefined) {
          sketch.addConstraint(coincident(p1, p2));
        }
        break;
      }
      case 'horizontal': {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        if (p1 !== undefined && p2 !== undefined) {
          sketch.addConstraint(horizontalPoints(p1, p2));
        }
        break;
      }
      case 'vertical': {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        if (p1 !== undefined && p2 !== undefined) {
          sketch.addConstraint(verticalPoints(p1, p2));
        }
        break;
      }
      case 'fixed': {
        const pointId = c.point;
        const pid = pointIdMap.get(pointId);
        const p = data.pointsById[pointId];
        if (pid !== undefined && p) {
          sketch.addConstraint(fixed(pid, vec2(p.x, p.y)));
        }
        break;
      }
      case 'distance': {
        const [a, b] = c.points ?? [];
        const p1 = pointIdMap.get(a);
        const p2 = pointIdMap.get(b);
        const val = typeof c.value === 'number' ? c.value : Number(c.value);
        if (p1 !== undefined && p2 !== undefined && Number.isFinite(val)) {
          sketch.addConstraint(distance(p1, p2, val));
        }
        break;
      }
      case 'angle': {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        const valDeg = typeof c.value === 'number' ? c.value : Number(c.value);
        if (e1 !== undefined && e2 !== undefined && Number.isFinite(valDeg)) {
          sketch.addConstraint(angle(e1, e2, (valDeg * Math.PI) / 180));
        }
        break;
      }
      case 'parallel': {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        if (e1 !== undefined && e2 !== undefined) {
          sketch.addConstraint(parallel(e1, e2));
        }
        break;
      }
      case 'perpendicular': {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        if (e1 !== undefined && e2 !== undefined) {
          sketch.addConstraint(perpendicular(e1, e2));
        }
        break;
      }
      case 'equalLength': {
        const [l1, l2] = c.lines ?? [];
        const e1 = entityIdMap.get(l1);
        const e2 = entityIdMap.get(l2);
        if (e1 !== undefined && e2 !== undefined) {
          sketch.addConstraint(equalLength(e1, e2));
        }
        break;
      }
      case 'tangent': {
        const lineId = entityIdMap.get(c.line);
        const arcId = entityIdMap.get(c.arc);
        if (lineId !== undefined && arcId !== undefined) {
          sketch.addConstraint(tangent(lineId, arcId, 'end', 'start'));
        }
        break;
      }
      case 'symmetric': {
        const [pt1, pt2] = c.points ?? [];
        const p1 = pointIdMap.get(pt1);
        const p2 = pointIdMap.get(pt2);
        const axisId = entityIdMap.get(c.axis);
        if (p1 !== undefined && p2 !== undefined && axisId !== undefined) {
          sketch.addConstraint(symmetric(p1, p2, axisId));
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
    type: 'sketch-solved',
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
  (globalThis as any).__sketchMap = (globalThis as any).__sketchMap || new Map();
  (globalThis as any).__sketchMap.set(id, { planeRef, plane, data });
}

/**
 * Result from interpretExtrude/interpretRevolve with metadata
 */
interface FeatureInterpretResult {
  body: Body | null;
  bodyEntryId: string | null;
  bodyName?: string;
  bodyColor?: string;
}

function interpretExtrude(
  session: SolidSession,
  featureMap: Y.Map<unknown>,
  featureId: string,
  _featuresById: Y.Map<Y.Map<unknown>>
): FeatureInterpretResult {
  const sketchId = featureMap.get('sketch') as string;
  const op = (featureMap.get('op') as string) || 'add';
  const direction = (featureMap.get('direction') as string) || 'normal';
  const mergeScope = (featureMap.get('mergeScope') as string) || 'auto';
  const targetBodies = (featureMap.get('targetBodies') as string[]) || [];
  const resultBodyName = (featureMap.get('resultBodyName') as string) || '';
  const resultBodyColor = (featureMap.get('resultBodyColor') as string) || '';

  if (!sketchId) {
    throw new Error('Extrude requires a sketch reference');
  }

  const sketchInfo = (globalThis as any).__sketchMap?.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  // Create sketch and add entities
  const sketch = session.createSketch(sketchInfo.plane);
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
    if (entity.type === 'line' && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        sketch.addLine(startId, endId);
      }
    }
    if (entity.type === 'arc' && entity.start && entity.end && entity.center) {
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
    throw new Error('Sketch does not contain a closed profile');
  }

  const dirMultiplier = direction === 'reverse' ? -1 : 1;
  const finalDistance = calculateExtrudeDistance(featureMap, dirMultiplier, sketchInfo.plane);

  const result = session.extrude(profile, {
    operation: 'add',
    distance: finalDistance,
  });

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Extrude failed');
  }

  // Handle cut operation
  if (op === 'cut') {
    console.log('[Worker] Extrude CUT operation');
    console.log(`[Worker] Tool body has ${result.body.getFaces().length} faces`);
    for (const [existingId, entry] of bodyMap) {
      console.log(`[Worker] Subtracting from body ${existingId}, faces before: ${entry.body.getFaces().length}`);
      const boolResult = session.subtract(entry.body, result.body);
      console.log(`[Worker] Subtract result: success=${boolResult.success}, error=${boolResult.error || 'none'}`);
      if (boolResult.success && boolResult.body) {
        console.log(`[Worker] After subtract: ${boolResult.body.getFaces().length} faces`);
        bodyMap.set(existingId, { ...entry, body: boolResult.body });
      }
    }
    return { body: null, bodyEntryId: null };
  }

  // Handle add operation with merge logic
  let finalBodyName = resultBodyName || `Body${bodyMap.size + 1}`;
  let finalBodyColor = resultBodyColor || getNextBodyColor();

  if (mergeScope === 'new' || bodyMap.size === 0) {
    return {
      body: result.body,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  if (mergeScope === 'specific' && targetBodies.length > 0) {
    let mergedBody = result.body;
    let mergedIntoId: string | null = null;
    let mergedEntry: BodyEntry | null = null;

    for (const targetId of targetBodies) {
      const targetEntry = bodyMap.get(targetId);
      if (targetEntry) {
        const unionResult = session.union(targetEntry.body, mergedBody);
        if (unionResult.success && unionResult.body) {
          mergedBody = unionResult.body;
          if (!mergedIntoId) {
            mergedIntoId = targetId;
            mergedEntry = targetEntry;
          }
        }
      }
    }

    if (mergedIntoId && mergedEntry) {
      bodyMap.set(mergedIntoId, { ...mergedEntry, body: mergedBody });
      return {
        body: null,
        bodyEntryId: mergedIntoId,
        bodyName: mergedEntry.name,
        bodyColor: mergedEntry.color,
      };
    }

    return {
      body: result.body,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  // mergeScope === 'auto'
  console.log('[Worker] Extrude ADD with auto merge');
  console.log(`[Worker] New extrusion has ${result.body.getFaces().length} faces`);
  let mergedBody = result.body;
  let mergedIntoId: string | null = null;
  let mergedEntry: BodyEntry | null = null;

  for (const [existingId, entry] of bodyMap) {
    console.log(`[Worker] Union with body ${existingId}, faces: ${entry.body.getFaces().length}`);
    const unionResult = session.union(entry.body, mergedBody);
    console.log(`[Worker] Union result: success=${unionResult.success}, error=${unionResult.error || 'none'}`);
    if (unionResult.success && unionResult.body) {
      console.log(`[Worker] After union: ${unionResult.body.getFaces().length} faces`);
      mergedBody = unionResult.body;
      if (!mergedIntoId) {
        mergedIntoId = existingId;
        mergedEntry = entry;
      }
    }
  }

  if (mergedIntoId && mergedEntry) {
    console.log(`[Worker] Merged into ${mergedIntoId}, final faces: ${mergedBody.getFaces().length}`);
    bodyMap.set(mergedIntoId, { ...mergedEntry, body: mergedBody });
    return {
      body: null,
      bodyEntryId: mergedIntoId,
      bodyName: mergedEntry.name,
      bodyColor: mergedEntry.color,
    };
  }

  return {
    body: result.body,
    bodyEntryId: featureId,
    bodyName: finalBodyName,
    bodyColor: finalBodyColor,
  };
}

function interpretRevolve(
  session: SolidSession,
  featureMap: Y.Map<unknown>,
  featureId: string,
  _featuresById: Y.Map<Y.Map<unknown>>
): FeatureInterpretResult {
  const sketchId = featureMap.get('sketch') as string;
  const axisId = (featureMap.get('axis') as string) || '';
  const angleDeg = (featureMap.get('angle') as number) || 360;
  const op = (featureMap.get('op') as string) || 'add';
  const mergeScope = (featureMap.get('mergeScope') as string) || 'auto';
  const targetBodies = (featureMap.get('targetBodies') as string[]) || [];
  const resultBodyName = (featureMap.get('resultBodyName') as string) || '';
  const resultBodyColor = (featureMap.get('resultBodyColor') as string) || '';

  if (!sketchId) {
    throw new Error('Revolve requires a sketch reference');
  }
  if (!axisId) {
    throw new Error('Revolve requires an axis line selection');
  }

  const sketchInfo = (globalThis as any).__sketchMap?.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const axisEntity = sketchInfo.data.entitiesById[axisId];
  if (!axisEntity || axisEntity.type !== 'line' || !axisEntity.start || !axisEntity.end) {
    throw new Error('Invalid axis selection');
  }

  const axisStart2d = sketchInfo.data.pointsById[axisEntity.start];
  const axisEnd2d = sketchInfo.data.pointsById[axisEntity.end];
  if (!axisStart2d || !axisEnd2d) {
    throw new Error('Axis references missing sketch points');
  }

  const sketch = session.createSketch(sketchInfo.plane);
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
    if (entity.type === 'line' && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        const isAxis = entity.id === axisId;
        const kernelEid = sketch.addLine(startId, endId, { construction: isAxis });
        entityIdMap.set(entity.id, kernelEid);
      }
    }
    if (entity.type === 'arc' && entity.start && entity.end && entity.center) {
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
    throw new Error('Sketch does not contain a closed profile');
  }

  const axisStartWorld = planeToWorld(sketchInfo.plane, axisStart2d.x, axisStart2d.y);
  const axisEndWorld = planeToWorld(sketchInfo.plane, axisEnd2d.x, axisEnd2d.y);
  const axisDir = sub3(axisEndWorld, axisStartWorld);

  const angleRad = (angleDeg * Math.PI) / 180;
  const result = session.revolve(profile, {
    operation: 'add',
    axis: { origin: axisStartWorld, direction: axisDir },
    angle: angleRad,
  });

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Revolve failed');
  }

  // Handle cut operation
  if (op === 'cut') {
    for (const [existingId, entry] of bodyMap) {
      const boolResult = session.subtract(entry.body, result.body);
      if (boolResult.success && boolResult.body) {
        bodyMap.set(existingId, { ...entry, body: boolResult.body });
      }
    }
    return { body: null, bodyEntryId: null };
  }

  // Handle add (same merge logic as extrude)
  let finalBodyName = resultBodyName || `Body${bodyMap.size + 1}`;
  let finalBodyColor = resultBodyColor || getNextBodyColor();

  if (mergeScope === 'new' || bodyMap.size === 0) {
    return {
      body: result.body,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  if (mergeScope === 'specific' && targetBodies.length > 0) {
    let mergedBody = result.body;
    let mergedIntoId: string | null = null;
    let mergedEntry: BodyEntry | null = null;

    for (const targetId of targetBodies) {
      const targetEntry = bodyMap.get(targetId);
      if (targetEntry) {
        const unionResult = session.union(targetEntry.body, mergedBody);
        if (unionResult.success && unionResult.body) {
          mergedBody = unionResult.body;
          if (!mergedIntoId) {
            mergedIntoId = targetId;
            mergedEntry = targetEntry;
          }
        }
      }
    }

    if (mergedIntoId && mergedEntry) {
      bodyMap.set(mergedIntoId, { ...mergedEntry, body: mergedBody });
      return {
        body: null,
        bodyEntryId: mergedIntoId,
        bodyName: mergedEntry.name,
        bodyColor: mergedEntry.color,
      };
    }

    return {
      body: result.body,
      bodyEntryId: featureId,
      bodyName: finalBodyName,
      bodyColor: finalBodyColor,
    };
  }

  // auto merge
  let mergedBody = result.body;
  let mergedIntoId: string | null = null;
  let mergedEntry: BodyEntry | null = null;

  for (const [existingId, entry] of bodyMap) {
    const unionResult = session.union(entry.body, mergedBody);
    if (unionResult.success && unionResult.body) {
      mergedBody = unionResult.body;
      if (!mergedIntoId) {
        mergedIntoId = existingId;
        mergedEntry = entry;
      }
    }
  }

  if (mergedIntoId && mergedEntry) {
    bodyMap.set(mergedIntoId, { ...mergedEntry, body: mergedBody });
    return {
      body: null,
      bodyEntryId: mergedIntoId,
      bodyName: mergedEntry.name,
      bodyColor: mergedEntry.color,
    };
  }

  return {
    body: result.body,
    bodyEntryId: featureId,
    bodyName: finalBodyName,
    bodyColor: finalBodyColor,
  };
}

function interpretBoolean(
  session: SolidSession,
  featureMap: Y.Map<unknown>
): FeatureInterpretResult {
  const operation = (featureMap.get('operation') as string) || 'union';
  const targetId = featureMap.get('target') as string;
  const toolId = featureMap.get('tool') as string;

  if (!targetId || !toolId) {
    throw new Error('Boolean requires target and tool body references');
  }

  const targetEntry = bodyMap.get(targetId);
  const toolEntry = bodyMap.get(toolId);

  if (!targetEntry) {
    throw new Error(`Target body not found: ${targetId}`);
  }
  if (!toolEntry) {
    throw new Error(`Tool body not found: ${toolId}`);
  }

  let result;
  switch (operation) {
    case 'union':
      result = session.union(targetEntry.body, toolEntry.body);
      break;
    case 'subtract':
      result = session.subtract(targetEntry.body, toolEntry.body);
      break;
    case 'intersect':
      result = session.intersect(targetEntry.body, toolEntry.body);
      break;
    default:
      throw new Error(`Unknown boolean operation: ${operation}`);
  }

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Boolean operation failed');
  }

  bodyMap.delete(toolId);
  bodyMap.set(targetId, { ...targetEntry, body: result.body });

  return {
    body: null,
    bodyEntryId: targetId,
    bodyName: targetEntry.name,
    bodyColor: targetEntry.color,
  };
}

// ============================================================================
// Rebuild Logic
// ============================================================================

function performRebuild(): void {
  if (!doc) return;

  const root = getRoot(doc);
  const featuresById = getFeaturesById(root);
  const featureOrder = getFeatureOrder(root);
  const state = getState(root);
  const rebuildGate = state.get('rebuildGate') as string | null;

  self.postMessage({ type: 'rebuild-start' } as WorkerToMainMessage);

  // Reset state
  session = new SolidSession();
  bodyMap.clear();
  (globalThis as any).__sketchMap = new Map();
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

    const type = featureMap.get('type') as string;
    const suppressed = featureMap.get('suppressed') === true;

    // Check if we've passed the rebuild gate
    if (reachedGate) {
      featureStatus[id] = 'gated';
      continue;
    }

    if (suppressed) {
      featureStatus[id] = 'suppressed';
      continue;
    }

    try {
      let result: FeatureInterpretResult | null = null;

      switch (type) {
        case 'origin':
        case 'plane':
          featureStatus[id] = 'computed';
          break;

        case 'sketch':
          interpretSketch(session!, featureMap, featuresById);
          featureStatus[id] = 'computed';
          break;

        case 'extrude':
          result = interpretExtrude(session!, featureMap, id, featuresById);
          featureStatus[id] = 'computed';

          if (result.body && result.bodyEntryId) {
            const entry: BodyEntry = {
              body: result.body,
              name: result.bodyName || `Body${bodyMap.size + 1}`,
              color: result.bodyColor || getNextBodyColor(),
              sourceFeatureId: id,
            };
            bodyMap.set(result.bodyEntryId, entry);
          }
          break;

        case 'revolve':
          result = interpretRevolve(session!, featureMap, id, featuresById);
          featureStatus[id] = 'computed';

          if (result.body && result.bodyEntryId) {
            const entry: BodyEntry = {
              body: result.body,
              name: result.bodyName || `Body${bodyMap.size + 1}`,
              color: result.bodyColor || getNextBodyColor(),
              sourceFeatureId: id,
            };
            bodyMap.set(result.bodyEntryId, entry);
          }
          break;

        case 'boolean':
          result = interpretBoolean(session!, featureMap);
          featureStatus[id] = 'computed';
          break;

        default:
          featureStatus[id] = 'computed';
          break;
      }
    } catch (err) {
      errors.push({
        featureId: id,
        code: 'BUILD_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
      featureStatus[id] = 'error';
    }

    if (rebuildGate && id === rebuildGate) {
      reachedGate = true;
    }
  }

  // Build bodies list from bodyMap
  for (const [entryId, entry] of bodyMap) {
    bodies.push({
      id: String(entry.body.id),
      featureId: entryId,
      faceCount: entry.body.getFaces().length,
      name: entry.name,
      color: entry.color,
    });
  }

  self.postMessage({
    type: 'rebuild-complete',
    bodies,
    featureStatus,
    errors,
  } as WorkerToMainMessage);

  // Send meshes for all bodies
  for (const [featureId, entry] of bodyMap) {
    sendMesh(featureId, entry.body, entry.color);
  }
}

function sendMesh(featureId: string, body: Body, color?: string): void {
  try {
    // Debug: Log body info before tessellation
    const faces = body.getFaces();
    console.log(`[Worker] sendMesh for ${featureId}: ${faces.length} faces`);
    
    const mesh = body.tessellate();

    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const indices = new Uint32Array(mesh.indices);
    
    // Debug: Log mesh stats
    console.log(`[Worker] Mesh stats: ${positions.length / 3} vertices, ${indices.length / 3} triangles`);
    
    // Debug: Check for NaN/Infinity in positions
    let hasInvalidPositions = false;
    for (let i = 0; i < positions.length; i++) {
      if (!Number.isFinite(positions[i])) {
        hasInvalidPositions = true;
        console.error(`[Worker] Invalid position at index ${i}: ${positions[i]}`);
        break;
      }
    }
    if (!hasInvalidPositions) {
      console.log('[Worker] All positions are valid');
    }

    const transferableMesh: TransferableMesh = {
      positions,
      normals,
      indices,
    };

    self.postMessage(
      {
        type: 'mesh',
        bodyId: featureId,
        mesh: transferableMesh,
        color,
      } as WorkerToMainMessage,
      { transfer: [positions.buffer, normals.buffer, indices.buffer] }
    );
  } catch (err) {
    console.error('Failed to tessellate body:', err);
  }
}

// ============================================================================
// Preview Functions
// ============================================================================

function performPreviewExtrude(
  session: SolidSession,
  sketchId: string,
  distance: number,
  direction: string,
  _op: string
): Body | null {
  const sketchInfo = (globalThis as any).__sketchMap?.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const sketch = session.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();

  for (const [, point] of Object.entries(sketchInfo.data.pointsById)) {
    const p = point as any;
    const kernelPid = sketch.addPoint(p.x, p.y, { fixed: p.fixed });
    pointIdMap.set(p.id, kernelPid);
  }

  for (const [, entity] of Object.entries(sketchInfo.data.entitiesById)) {
    const e = entity as any;
    if (e.type === 'line' && e.start && e.end) {
      const startId = pointIdMap.get(e.start);
      const endId = pointIdMap.get(e.end);
      if (startId !== undefined && endId !== undefined) {
        sketch.addLine(startId, endId);
      }
    }
    if (e.type === 'arc' && e.start && e.end && e.center) {
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
    throw new Error('Sketch does not contain a closed profile');
  }

  const dirMultiplier = direction === 'reverse' ? -1 : 1;
  const finalDistance = distance * dirMultiplier;

  const result = session.extrude(profile, {
    operation: 'add',
    distance: finalDistance,
  });

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Extrude failed');
  }

  return result.body;
}

function performPreviewRevolve(
  session: SolidSession,
  sketchId: string,
  axisId: string,
  angleDeg: number,
  _op: string
): Body | null {
  const sketchInfo = (globalThis as any).__sketchMap?.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const axisEntity = sketchInfo.data.entitiesById[axisId];
  if (!axisEntity || axisEntity.type !== 'line' || !axisEntity.start || !axisEntity.end) {
    throw new Error('Invalid axis selection');
  }

  const axisStart2d = sketchInfo.data.pointsById[axisEntity.start];
  const axisEnd2d = sketchInfo.data.pointsById[axisEntity.end];
  if (!axisStart2d || !axisEnd2d) {
    throw new Error('Axis references missing sketch points');
  }

  const sketch = session.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  for (const [, point] of Object.entries(sketchInfo.data.pointsById)) {
    const p = point as any;
    const kernelPid = sketch.addPoint(p.x, p.y, { fixed: p.fixed });
    pointIdMap.set(p.id, kernelPid);
  }

  for (const [, entity] of Object.entries(sketchInfo.data.entitiesById)) {
    const e = entity as any;
    if (e.type === 'line' && e.start && e.end) {
      const startId = pointIdMap.get(e.start);
      const endId = pointIdMap.get(e.end);
      if (startId !== undefined && endId !== undefined) {
        const isAxis = e.id === axisId;
        const kernelEid = sketch.addLine(startId, endId, { construction: isAxis });
        entityIdMap.set(e.id, kernelEid);
      }
    }
    if (e.type === 'arc' && e.start && e.end && e.center) {
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
    throw new Error('Sketch does not contain a closed profile');
  }

  const axisStartWorld = planeToWorld(sketchInfo.plane, axisStart2d.x, axisStart2d.y);
  const axisEndWorld = planeToWorld(sketchInfo.plane, axisEnd2d.x, axisEnd2d.y);
  const axisDir = sub3(axisEndWorld, axisStartWorld);

  const angleRad = (angleDeg * Math.PI) / 180;
  const result = session.revolve(profile, {
    operation: 'add',
    axis: { origin: axisStartWorld, direction: axisDir },
    angle: angleRad,
  });

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Revolve failed');
  }

  return result.body;
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const { type } = event.data;

  switch (type) {
    case 'init-sync':
      setupYjsSync(event.data.port);
      break;

    case 'yjs-init':
    case 'yjs-update':
      if (syncPort && doc) {
        Y.applyUpdate(doc, new Uint8Array(event.data.data), 'main');
      }
      break;

    case 'clear-preview':
      break;

    case 'preview-extrude': {
      try {
        if (!doc) throw new Error('Worker not ready');
        const { sketchId, distance, direction, op } = event.data;

        const previewSession = new SolidSession();

        // Get sketch info from current rebuild state
        const root = getRoot(doc);
        const featuresById = getFeaturesById(root);
        const sketchMap = featuresById.get(sketchId);
        if (!sketchMap) throw new Error(`Sketch not found: ${sketchId}`);

        // Build sketch info for preview
        (globalThis as any).__sketchMap = (globalThis as any).__sketchMap || new Map();
        interpretSketch(previewSession, sketchMap, featuresById);

        const body = performPreviewExtrude(previewSession, sketchId, distance, direction, op);
        if (!body) {
          const tool = performPreviewExtrude(previewSession, sketchId, distance, direction, 'add');
          if (!tool) throw new Error('Preview failed');
          sendMesh(`__preview_extrude_${op}`, tool);
        } else {
          sendMesh(`__preview_extrude_${op}`, body);
        }
      } catch (err) {
        self.postMessage({
          type: 'preview-error',
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }

    case 'preview-revolve': {
      try {
        if (!doc) throw new Error('Worker not ready');
        const { sketchId, axis, angle, op } = event.data;

        const previewSession = new SolidSession();

        const root = getRoot(doc);
        const featuresById = getFeaturesById(root);
        const sketchMap = featuresById.get(sketchId);
        if (!sketchMap) throw new Error(`Sketch not found: ${sketchId}`);

        (globalThis as any).__sketchMap = (globalThis as any).__sketchMap || new Map();
        interpretSketch(previewSession, sketchMap, featuresById);

        const body = performPreviewRevolve(previewSession, sketchId, axis, angle, op);
        if (!body) {
          const tool = performPreviewRevolve(previewSession, sketchId, axis, angle, 'add');
          if (!tool) throw new Error('Preview failed');
          sendMesh(`__preview_revolve_${op}`, tool);
        } else {
          sendMesh(`__preview_revolve_${op}`, body);
        }
      } catch (err) {
        self.postMessage({
          type: 'preview-error',
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }

    case 'export-stl': {
      try {
        const { binary = true, name = 'model' } = event.data;

        const meshes = Array.from(bodyMap.values()).map((entry) => entry.body.tessellate());

        if (meshes.length === 0) {
          throw new Error('No bodies to export');
        }

        const result = exportMeshesToStl(meshes, { binary, name });

        if (binary && result instanceof ArrayBuffer) {
          self.postMessage({ type: 'stl-exported', buffer: result } as WorkerToMainMessage, [
            result,
          ]);
        } else if (typeof result === 'string') {
          self.postMessage({ type: 'stl-exported', content: result } as WorkerToMainMessage);
        }
      } catch (err) {
        self.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        } as WorkerToMainMessage);
      }
      break;
    }
  }
};
