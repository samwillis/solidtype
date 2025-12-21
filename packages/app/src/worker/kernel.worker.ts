/**
 * Kernel Web Worker
 * 
 * Runs the CAD kernel in a separate thread and syncs with the Yjs document.
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

// Map of feature IDs to their created bodies
const bodyMap = new Map<string, Body>();

// ============================================================================
// Yjs Sync Setup
// ============================================================================

function setupYjsSync(port: MessagePort): void {
  syncPort = port;
  doc = new Y.Doc();

  port.onmessage = (event) => {
    const { type, data } = event.data;

    if (type === 'yjs-init' || type === 'yjs-update') {
      Y.applyUpdate(doc!, new Uint8Array(data), 'main');
    }
  };

  // Observe feature changes in worker's copy
  const features = doc.getXmlFragment('features');
  features.observeDeep(() => {
    scheduleRebuild();
  });

  // Also observe state (for rebuild gate)
  const state = doc.getMap('state');
  state.observe(() => {
    scheduleRebuild();
  });

  // Signal ready
  console.log('[Worker] Yjs sync setup complete, signaling ready');
  self.postMessage({ type: 'ready' } as WorkerToMainMessage);
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
// Feature Interpretation
// ============================================================================

function getSketchElementById(sketchId: string): Y.XmlElement | null {
  if (!doc) return null;
  const features = doc.getXmlFragment('features');
  for (let i = 0; i < features.length; i++) {
    const child = features.get(i);
    if (child instanceof Y.XmlElement && child.nodeName === 'sketch' && child.getAttribute('id') === sketchId) {
      return child;
    }
  }
  return null;
}

function getDatumPlane(planeId: string): DatumPlane | null {
  switch (planeId) {
    case 'xy':
      return XY_PLANE;
    case 'xz':
      return ZX_PLANE;
    case 'yz':
      return YZ_PLANE;
    default:
      return null;
  }
}

/**
 * Get sketch plane - supports datum planes and face references (Phase 15)
 */
function getSketchPlane(planeRef: string): DatumPlane | null {
  // Try datum plane first
  const datum = getDatumPlane(planeRef);
  if (datum) return datum;
  
  // Face references (Phase 15)
  if (planeRef.startsWith('face:')) {
    // Parse face reference: face:featureId:faceIndex
    const parts = planeRef.split(':');
    if (parts.length < 3) {
      throw new Error(`Invalid face reference: ${planeRef}`);
    }
    const [, featureId, faceIndexStr] = parts;
    const faceIndex = parseInt(faceIndexStr, 10);
    
    // Find the body for this feature
    const targetBody = bodyMap.get(featureId);
    if (!targetBody || !session) {
      throw new Error(`Cannot find body for face reference: ${planeRef}`);
    }
    
    // Get the face from the body
    const faces = targetBody.getFaces();
    if (faceIndex < 0 || faceIndex >= faces.length) {
      throw new Error(`Face index out of range: ${faceIndex} (body has ${faces.length} faces)`);
    }
    
    const face = faces[faceIndex];
    
    // Get the face surface from the model
    const model = session.getModel();
    const surfaceIdx = model.getFaceSurfaceIndex(face.id);
    const surface = model.getSurface(surfaceIdx);
    
    // Only planar faces can be used as sketch planes
    if (surface.kind !== 'plane') {
      throw new Error('Cannot create sketch on non-planar face');
    }
    
    // Adjust normal direction based on face orientation
    let normal = surface.normal;
    if (model.isFaceReversed(face.id)) {
      normal = [-normal[0], -normal[1], -normal[2]] as typeof normal;
    }
    
    // Create a datum plane from the face's planar surface
    // Use the face's surface directly but flip normal if needed
    const planeSurface = {
      kind: 'plane' as const,
      origin: surface.origin,
      normal,
      xDir: surface.xDir,
      yDir: surface.yDir,
    };
    
    return createDatumPlane(`Face:${featureId}:${faceIndex}`, planeSurface);
  }
  
  return null;
}

/**
 * Calculate extrude distance based on extent type (Phase 14)
 */
function calculateExtrudeDistance(
  element: Y.XmlElement,
  direction: number,
  sketchPlane?: DatumPlane
): number {
  const extent = element.getAttribute('extent') || 'blind';
  const baseDistance = parseFloat(element.getAttribute('distance') || '10');
  
  switch (extent) {
    case 'blind':
      return baseDistance * direction;
      
    case 'throughAll':
      // Use a large distance to ensure we go through everything
      // In a full implementation, we'd calculate the actual bounding box
      return 1000 * direction;
      
    case 'toFace': {
      // Parse extent reference and calculate distance to face
      const extentRef = element.getAttribute('extentRef');
      if (!extentRef) {
        throw new Error('toFace extent requires extentRef');
      }
      
      // Parse face reference: face:featureId:faceIndex
      const parts = extentRef.split(':');
      if (parts.length < 3 || parts[0] !== 'face') {
        throw new Error(`Invalid face reference: ${extentRef}`);
      }
      const [, featureId, faceIndexStr] = parts;
      const faceIndex = parseInt(faceIndexStr, 10);
      
      // Find the body for this feature
      const targetBody = bodyMap.get(featureId);
      if (!targetBody || !session || !sketchPlane) {
        // Fallback to base distance if body not found
        console.warn(`Cannot resolve toFace reference: ${extentRef}`);
        return baseDistance * direction;
      }
      
      // Get the face from the body
      const faces = targetBody.getFaces();
      if (faceIndex < 0 || faceIndex >= faces.length) {
        console.warn(`Face index out of range: ${faceIndex}`);
        return baseDistance * direction;
      }
      
      const targetFace = faces[faceIndex];
      const faceCentroid = targetFace.getCentroid();
      
      // Calculate distance along extrude direction
      // The extrude direction is the sketch plane normal
      const planeNormal = sketchPlane.surface.normal;
      const planeOrigin = sketchPlane.surface.origin;
      
      // Distance = (faceCentroid - planeOrigin) · planeNormal
      const dx = faceCentroid[0] - planeOrigin[0];
      const dy = faceCentroid[1] - planeOrigin[1];
      const dz = faceCentroid[2] - planeOrigin[2];
      const dist = dx * planeNormal[0] + dy * planeNormal[1] + dz * planeNormal[2];
      
      // Take absolute value and apply direction
      return Math.abs(dist) * direction;
    }
      
    case 'toVertex': {
      const extentRef = element.getAttribute('extentRef');
      if (!extentRef) {
        throw new Error('toVertex extent requires extentRef');
      }
      // TODO: Implement vertex reference resolution
      // Would need vertex selection UI first
      return baseDistance * direction;
    }
      
    default:
      return baseDistance * direction;
  }
}

interface SketchData {
  points: Array<{ 
    id: string; 
    x: number; 
    y: number; 
    fixed?: boolean;
    /** External attachment (Phase 16) */
    attachedTo?: string;
    /** Parameter on edge (0-1) */
    param?: number;
  }>;
  entities: Array<{ id: string; type: string; start?: string; end?: string; center?: string; ccw?: boolean }>;
  constraints: any[];
}

function parseSketchData(element: Y.XmlElement): SketchData {
  const pointsJson = element.getAttribute('points') || '[]';
  const entitiesJson = element.getAttribute('entities') || '[]';
  const constraintsJson = element.getAttribute('constraints') || '[]';

  return {
    points: JSON.parse(pointsJson),
    entities: JSON.parse(entitiesJson),
    constraints: JSON.parse(constraintsJson),
  };
}

interface SketchInfo {
  planeId: string;
  plane: DatumPlane;
  data: SketchData;
}

// Map of sketch IDs to their parsed data
const sketchMap = new Map<string, SketchInfo>();

/**
 * Resolve an attachment reference to world coordinates (Phase 16)
 * @returns World position or null if reference cannot be resolved
 */
function resolveAttachment(
  attachedTo: string,
  param: number = 0.5
): { x: number; y: number; z: number } | null {
  if (!session) return null;
  
  if (attachedTo.startsWith('edge:')) {
    // Format: edge:featureId:edgeIndex
    const parts = attachedTo.split(':');
    if (parts.length < 3) return null;
    
    const [, featureId, edgeIndexStr] = parts;
    const edgeIndex = parseInt(edgeIndexStr, 10);
    
    const body = bodyMap.get(featureId);
    if (!body) {
      console.warn(`Cannot resolve edge attachment: body not found for ${featureId}`);
      return null;
    }
    
    // Get edge from body (need to get edges from the model)
    const model = session.getModel();
    const shells = model.getBodyShells(body.id);
    
    // Collect all edges from the body (using any for branded types)
    const allEdges: Array<{ id: unknown; startVertex: unknown; endVertex: unknown }> = [];
    for (const shellId of shells) {
      const faces = model.getShellFaces(shellId);
      for (const faceId of faces) {
        const loops = model.getFaceLoops(faceId);
        for (const loopId of loops) {
          for (const he of model.iterateLoopHalfEdges(loopId)) {
            const edgeId = model.getHalfEdgeEdge(he);
            // Avoid duplicates
            if (!allEdges.some(e => e.id === edgeId)) {
              const startVertex = model.getHalfEdgeStartVertex(he);
              const endVertex = model.getHalfEdgeEndVertex(he);
              allEdges.push({ id: edgeId, startVertex, endVertex });
            }
          }
        }
      }
    }
    
    if (edgeIndex < 0 || edgeIndex >= allEdges.length) {
      console.warn(`Edge index out of range: ${edgeIndex}`);
      return null;
    }
    
    const edge = allEdges[edgeIndex];
    // Cast back to expected types for model methods
    const startPos = model.getVertexPosition(edge.startVertex as Parameters<typeof model.getVertexPosition>[0]);
    const endPos = model.getVertexPosition(edge.endVertex as Parameters<typeof model.getVertexPosition>[0]);
    
    // Interpolate along edge based on param
    const t = Math.max(0, Math.min(1, param));
    return {
      x: startPos[0] + t * (endPos[0] - startPos[0]),
      y: startPos[1] + t * (endPos[1] - startPos[1]),
      z: startPos[2] + t * (endPos[2] - startPos[2]),
    };
  }
  
  if (attachedTo.startsWith('vertex:')) {
    // Format: vertex:featureId:vertexIndex
    const parts = attachedTo.split(':');
    if (parts.length < 3) return null;
    
    const [, featureId, vertexIndexStr] = parts;
    const vertexIndex = parseInt(vertexIndexStr, 10);
    
    const body = bodyMap.get(featureId);
    if (!body) {
      console.warn(`Cannot resolve vertex attachment: body not found for ${featureId}`);
      return null;
    }
    
    // Get vertex from body
    const model = session.getModel();
    const shells = model.getBodyShells(body.id);
    
    // Collect all vertices from the body (using unknown for branded types)
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
    
    if (vertexIndex < 0 || vertexIndex >= allVertices.length) {
      console.warn(`Vertex index out of range: ${vertexIndex}`);
      return null;
    }
    
    // Cast back to expected type for model method
    const pos = model.getVertexPosition(allVertices[vertexIndex] as Parameters<typeof model.getVertexPosition>[0]);
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
  
  // Vector from plane origin to world point
  const dx = worldPos.x - origin[0];
  const dy = worldPos.y - origin[1];
  const dz = worldPos.z - origin[2];
  
  // Project onto plane axes
  const x = dx * xDir[0] + dy * xDir[1] + dz * xDir[2];
  const y = dx * yDir[0] + dy * yDir[1] + dz * yDir[2];
  
  return { x, y };
}

function interpretSketch(
  session: SolidSession,
  element: Y.XmlElement
): void {
  const planeId = element.getAttribute('plane') || 'xy';
  const plane = getSketchPlane(planeId);
  
  if (!plane) {
    throw new Error(`Unknown plane: ${planeId}`);
  }
  
  const data = parseSketchData(element);
  const id = element.getAttribute('id')!;

  // Build a kernel sketch so we can solve constraints and feed solved geometry
  // into downstream features (extrude/revolve) within the same rebuild.
  const sketch = session.createSketch(plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  for (const point of data.points) {
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
        // Attached points are treated as fixed
        isFixed = true;
      }
      // If attachment cannot be resolved, use stored x/y as fallback
    }
    
    const pid = sketch.addPoint(x, y, { fixed: isFixed });
    pointIdMap.set(point.id, pid);
  }

  for (const entity of data.entities) {
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

  // Apply constraints
  for (const c of data.constraints) {
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
        const p = data.points.find((pt) => pt.id === pointId);
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
      default:
        break;
    }
  }

  const before = new Map<string, { x: number; y: number }>();
  for (const p of data.points) {
    before.set(p.id, { x: p.x, y: p.y });
  }

  const solveResult = sketch.solve();
  const dof = sketch.analyzeDOF();

  // Update sketch data with solved positions
  let maxDelta = 0;
  for (const p of data.points) {
    const pid = pointIdMap.get(p.id);
    if (pid === undefined) continue;
    const solved = sketch.getPoint(pid);
    if (!solved) continue;

    const prev = before.get(p.id);
    if (prev) {
      const dx = solved.x - prev.x;
      const dy = solved.y - prev.y;
      maxDelta = Math.max(maxDelta, Math.hypot(dx, dy));
    }

    p.x = solved.x;
    p.y = solved.y;
  }

  // Always notify the main thread of solve status/DOF.
  // Only include points when the solver actually moved them to avoid churn.
  self.postMessage({
    type: 'sketch-solved',
    sketchId: id,
    points: maxDelta > 1e-9 ? data.points.map((p) => ({ id: p.id, x: p.x, y: p.y })) : [],
    status: solveResult.status,
    dof,
  } as WorkerToMainMessage);

  sketchMap.set(id, { planeId, plane, data });
}

function interpretExtrude(
  session: SolidSession,
  element: Y.XmlElement
): Body | null {
  const sketchId = element.getAttribute('sketch');
  const op = element.getAttribute('op') || 'add';
  const direction = element.getAttribute('direction') || 'normal';

  if (!sketchId) {
    throw new Error('Extrude requires a sketch reference');
  }

  const sketchInfo = sketchMap.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  // Create sketch and add entities
  const sketch = session.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();

  // Add points
  for (const point of sketchInfo.data.points) {
    const pid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
    pointIdMap.set(point.id, pid);
  }

  // Add lines
  for (const entity of sketchInfo.data.entities) {
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

  // Attempt to get a profile from the sketch
  const profile = sketch.toProfile();
  if (!profile) {
    throw new Error('Sketch does not contain a closed profile');
  }

  // Calculate direction multiplier and extent-based distance (Phase 14)
  const dirMultiplier = direction === 'reverse' ? -1 : 1;
  const finalDistance = calculateExtrudeDistance(element, dirMultiplier, sketchInfo.plane);

  // Perform extrusion - always use 'add' operation and handle cut separately
  const result = session.extrude(profile, {
    operation: 'add',
    distance: finalDistance,
  });

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Extrude failed');
  }

  // Handle cut operation
  if (op === 'cut') {
    // Subtract from all existing bodies
    for (const [existingId, existingBody] of bodyMap) {
      const boolResult = session.subtract(existingBody, result.body);
      if (boolResult.success && boolResult.body) {
        bodyMap.set(existingId, boolResult.body);
      }
    }
    // Tool body is consumed, return null
    return null;
  }

  return result.body;
}

/**
 * Perform preview extrusion without using Yjs elements
 * This avoids the "Invalid access" error when creating temporary Yjs elements
 */
function performPreviewExtrude(
  session: SolidSession,
  sketchId: string,
  distance: number,
  direction: string,
  _op: string
): Body | null {
  const sketchInfo = sketchMap.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  // Create sketch and add entities
  const sketch = session.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();

  // Add points
  for (const point of sketchInfo.data.points) {
    const pid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
    pointIdMap.set(point.id, pid);
  }

  // Add lines and arcs
  for (const entity of sketchInfo.data.entities) {
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

  // Attempt to get a profile from the sketch
  const profile = sketch.toProfile();
  if (!profile) {
    throw new Error('Sketch does not contain a closed profile');
  }

  // Calculate direction multiplier
  const dirMultiplier = direction === 'reverse' ? -1 : 1;
  const finalDistance = distance * dirMultiplier;

  // Perform extrusion
  const result = session.extrude(profile, {
    operation: 'add',
    distance: finalDistance,
  });

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Extrude failed');
  }

  // For preview, we don't actually do boolean operations on existing bodies
  // Just return the tool body
  return result.body;
}

/**
 * Perform preview revolve without using Yjs elements
 */
function performPreviewRevolve(
  session: SolidSession,
  sketchId: string,
  axisId: string,
  angleDeg: number,
  _op: string
): Body | null {
  const sketchInfo = sketchMap.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const axisEntity = sketchInfo.data.entities.find((e) => e.id === axisId);
  if (!axisEntity || axisEntity.type !== 'line' || !axisEntity.start || !axisEntity.end) {
    throw new Error('Invalid axis selection');
  }

  const axisStart2d = sketchInfo.data.points.find((p) => p.id === axisEntity.start);
  const axisEnd2d = sketchInfo.data.points.find((p) => p.id === axisEntity.end);
  if (!axisStart2d || !axisEnd2d) {
    throw new Error('Axis references missing sketch points');
  }

  // Create sketch and add entities
  const sketch = session.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  for (const point of sketchInfo.data.points) {
    const pid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
    pointIdMap.set(point.id, pid);
  }

  for (const entity of sketchInfo.data.entities) {
    if (entity.type === 'line' && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        const isAxis = entity.id === axisId;
        const eid = sketch.addLine(startId, endId, { construction: isAxis });
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

  const profileEntityIds: any[] = [];
  for (const entity of sketchInfo.data.entities) {
    if (entity.id === axisId) continue;
    const eid = entityIdMap.get(entity.id);
    if (eid !== undefined) profileEntityIds.push(eid);
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

  // For preview, just return the tool body
  return result.body;
}

function interpretRevolve(
  session: SolidSession,
  element: Y.XmlElement
): Body | null {
  const sketchId = element.getAttribute('sketch');
  const axisId = element.getAttribute('axis') || '';
  const angleDeg = parseFloat(element.getAttribute('angle') || '360');
  const op = element.getAttribute('op') || 'add';

  if (!sketchId) {
    throw new Error('Revolve requires a sketch reference');
  }
  if (!axisId) {
    throw new Error('Revolve requires an axis line selection');
  }

  const sketchInfo = sketchMap.get(sketchId);
  if (!sketchInfo) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }

  const axisEntity = sketchInfo.data.entities.find((e) => e.id === axisId);
  if (!axisEntity || axisEntity.type !== 'line' || !axisEntity.start || !axisEntity.end) {
    throw new Error('Invalid axis selection');
  }

  const axisStart2d = sketchInfo.data.points.find((p) => p.id === axisEntity.start);
  const axisEnd2d = sketchInfo.data.points.find((p) => p.id === axisEntity.end);
  if (!axisStart2d || !axisEnd2d) {
    throw new Error('Axis references missing sketch points');
  }

  // Create sketch and add entities (mark axis as construction so it doesn't affect profile extraction)
  const sketch = session.createSketch(sketchInfo.plane);
  const pointIdMap = new Map<string, any>();
  const entityIdMap = new Map<string, any>();

  for (const point of sketchInfo.data.points) {
    const pid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
    pointIdMap.set(point.id, pid);
  }

  for (const entity of sketchInfo.data.entities) {
    if (entity.type === 'line' && entity.start && entity.end) {
      const startId = pointIdMap.get(entity.start);
      const endId = pointIdMap.get(entity.end);
      if (startId !== undefined && endId !== undefined) {
        const isAxis = entity.id === axisId;
        const eid = sketch.addLine(startId, endId, { construction: isAxis });
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

  const profileEntityIds: any[] = [];
  for (const entity of sketchInfo.data.entities) {
    if (entity.id === axisId) continue;
    const eid = entityIdMap.get(entity.id);
    if (eid !== undefined) profileEntityIds.push(eid);
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

  if (op === 'cut') {
    for (const [existingId, existingBody] of bodyMap) {
      const boolResult = session.subtract(existingBody, result.body);
      if (boolResult.success && boolResult.body) {
        bodyMap.set(existingId, boolResult.body);
      }
    }
    return null;
  }

  return result.body;
}

/**
 * Interpret a boolean feature (Phase 17)
 */
function interpretBoolean(
  session: SolidSession,
  element: Y.XmlElement
): Body | null {
  const operation = element.getAttribute('operation') || 'union';
  const targetId = element.getAttribute('target');
  const toolId = element.getAttribute('tool');

  if (!targetId || !toolId) {
    throw new Error('Boolean requires target and tool body references');
  }

  const targetBody = bodyMap.get(targetId);
  const toolBody = bodyMap.get(toolId);

  if (!targetBody) {
    throw new Error(`Target body not found: ${targetId}`);
  }
  if (!toolBody) {
    throw new Error(`Tool body not found: ${toolId}`);
  }

  let result;
  
  switch (operation) {
    case 'union':
      result = session.union(targetBody, toolBody);
      break;
    case 'subtract':
      result = session.subtract(targetBody, toolBody);
      break;
    case 'intersect':
      result = session.intersect(targetBody, toolBody);
      break;
    default:
      throw new Error(`Unknown boolean operation: ${operation}`);
  }

  if (!result.success || !result.body) {
    throw new Error(result.error || 'Boolean operation failed');
  }

  // Remove the tool body from bodyMap (it's consumed)
  bodyMap.delete(toolId);

  // Update the target body entry with the result
  bodyMap.set(targetId, result.body);

  return result.body;
}

// ============================================================================
// Rebuild Logic
// ============================================================================

function performRebuild(): void {
  if (!doc) return;

  const features = doc.getXmlFragment('features');
  const state = doc.getMap('state');
  const rebuildGate = state.get('rebuildGate') as string | null;

  self.postMessage({ type: 'rebuild-start' } as WorkerToMainMessage);

  // Reset state
  session = new SolidSession();
  bodyMap.clear();
  sketchMap.clear();

  const bodies: BodyInfo[] = [];
  const errors: BuildError[] = [];
  const featureStatus: Record<string, FeatureStatus> = {};

  let reachedGate = false;

  for (let i = 0; i < features.length; i++) {
    const child = features.get(i);
    if (!(child instanceof Y.XmlElement)) continue;

    const id = child.getAttribute('id');
    const type = child.nodeName;
    const suppressed = child.getAttribute('suppressed') === 'true';

    if (!id) continue;

    // Check if we've passed the rebuild gate
    if (reachedGate) {
      featureStatus[id] = 'gated';
      continue;
    }

    // Check for suppressed features
    if (suppressed) {
      featureStatus[id] = 'suppressed';
      continue;
    }

    try {
      let body: Body | null = null;

      switch (type) {
        case 'origin':
        case 'plane':
          // Datum features, no geometry
          featureStatus[id] = 'computed';
          break;

        case 'sketch':
          interpretSketch(session!, child);
          featureStatus[id] = 'computed';
          break;

        case 'extrude':
          body = interpretExtrude(session!, child);
          featureStatus[id] = 'computed';
          
          if (body) {
            bodyMap.set(id, body);
            bodies.push({
              id: String(body.id),
              featureId: id,
              faceCount: body.getFaces().length,
            });
          }
          break;

        case 'revolve':
          body = interpretRevolve(session!, child);
          featureStatus[id] = 'computed';
          if (body) {
            bodyMap.set(id, body);
            bodies.push({
              id: String(body.id),
              featureId: id,
              faceCount: body.getFaces().length,
            });
          }
          break;

        case 'boolean':
          body = interpretBoolean(session!, child);
          featureStatus[id] = 'computed';
          if (body) {
            bodyMap.set(id, body);
            bodies.push({
              id: String(body.id),
              featureId: id,
              faceCount: body.getFaces().length,
            });
          }
          break;

        default:
          // Unknown feature type, skip
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

    // Check if this is the rebuild gate
    if (rebuildGate && id === rebuildGate) {
      reachedGate = true;
    }
  }

  // Send rebuild complete message
  self.postMessage({
    type: 'rebuild-complete',
    bodies,
    featureStatus,
    errors,
  } as WorkerToMainMessage);

  // Send meshes for all bodies
  for (const [featureId, body] of bodyMap) {
    sendMesh(featureId, body);
  }
}

function sendMesh(featureId: string, body: Body): void {
  try {
    const mesh = body.tessellate();
    
    // Convert to Float32Array for transfer
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
        type: 'mesh',
        bodyId: featureId,
        mesh: transferableMesh,
      } as WorkerToMainMessage,
      { transfer: [positions.buffer, normals.buffer, indices.buffer] }
    );
  } catch (err) {
    console.error('Failed to tessellate body:', err);
  }
}

function sendPreviewMesh(previewKey: string, body: Body): void {
  sendMesh(previewKey, body);
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
      // These are handled via the sync port
      if (syncPort) {
        // Forward to sync port handler
        if (doc) {
          Y.applyUpdate(doc, new Uint8Array(event.data.data), 'main');
        }
      }
      break;

    case 'clear-preview':
      // Main thread removes preview meshes; nothing else needed.
      break;

    case 'preview-extrude': {
      try {
        if (!doc) throw new Error('Worker not ready');
        const { sketchId, distance, direction, op } = event.data;
        const sketchEl = getSketchElementById(sketchId);
        if (!sketchEl) throw new Error(`Sketch not found: ${sketchId}`);

        const previewSession = new SolidSession();

        // Build a sketch map entry for this preview
        sketchMap.clear();
        interpretSketch(previewSession, sketchEl);

        // Perform preview extrusion directly without using Yjs elements
        const body = performPreviewExtrude(previewSession, sketchId, distance, direction, op);
        if (!body) {
          // cut previews: show tool body only by extruding as add
          const tool = performPreviewExtrude(previewSession, sketchId, distance, direction, 'add');
          if (!tool) throw new Error('Preview failed');
          sendPreviewMesh(`__preview_extrude_${op}`, tool);
        } else {
          sendPreviewMesh(`__preview_extrude_${op}`, body);
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
        const sketchEl = getSketchElementById(sketchId);
        if (!sketchEl) throw new Error(`Sketch not found: ${sketchId}`);

        const previewSession = new SolidSession();
        sketchMap.clear();
        interpretSketch(previewSession, sketchEl);

        // Perform preview revolve directly without using Yjs elements
        const body = performPreviewRevolve(previewSession, sketchId, axis, angle, op);
        if (!body) {
          const tool = performPreviewRevolve(previewSession, sketchId, axis, angle, 'add');
          if (!tool) throw new Error('Preview failed');
          sendPreviewMesh(`__preview_revolve_${op}`, tool);
        } else {
          sendPreviewMesh(`__preview_revolve_${op}`, body);
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
        
        // Collect all meshes from bodies
        const meshes = Array.from(bodyMap.values()).map(body => body.tessellate());
        
        if (meshes.length === 0) {
          throw new Error('No bodies to export');
        }
        
        const result = exportMeshesToStl(meshes, { binary, name });
        
        if (binary && result instanceof ArrayBuffer) {
          self.postMessage(
            { type: 'stl-exported', buffer: result } as WorkerToMainMessage,
            [result] // Transfer the ArrayBuffer
          );
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
