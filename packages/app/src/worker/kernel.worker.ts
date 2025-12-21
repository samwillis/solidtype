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
 * Get sketch plane - supports both datum planes and face references (Phase 15)
 */
function getSketchPlane(planeRef: string): DatumPlane | null {
  // Try datum plane first
  const datum = getDatumPlane(planeRef);
  if (datum) return datum;
  
  // Check for face reference (Phase 15)
  if (planeRef.startsWith('face:')) {
    // Parse face:featureId:selector format
    const parts = planeRef.split(':');
    if (parts.length >= 3) {
      const featureId = parts[1];
      const selector = parts.slice(2).join(':');
      
      // Get the body from the feature
      const body = bodyMap.get(featureId);
      if (!body) {
        throw new Error(`Cannot resolve face reference: body for feature ${featureId} not found`);
      }
      
      // Try to find the face - for now use a simple selector approach
      // In a full implementation, this would use the persistent naming system
      const faces = body.getFaces();
      if (faces.length === 0) {
        throw new Error(`Body has no faces`);
      }
      
      // Simple selector parsing for top/bottom/side
      if (selector === 'top' && faces.length > 0) {
        // Find the top face (highest Z normal or based on extrude direction)
        const topFace = faces[0]; // Simplified - in reality would analyze normals
        const surface = topFace.getSurface();
        if (surface.kind !== 'plane') {
          throw new Error('Cannot sketch on non-planar face');
        }
        return {
          surface: {
            kind: 'plane',
            origin: surface.origin,
            normal: surface.normal,
            xDir: surface.xDir,
            yDir: surface.yDir,
          },
        };
      }
      
      // Default to first planar face
      for (const face of faces) {
        const surface = face.getSurface();
        if (surface.kind === 'plane') {
          return {
            surface: {
              kind: 'plane',
              origin: surface.origin,
              normal: surface.normal,
              xDir: surface.xDir,
              yDir: surface.yDir,
            },
          };
        }
      }
      
      throw new Error('No planar face found for sketch');
    }
  }
  
  return null;
}

/**
 * Calculate extrude distance based on extent type (Phase 14)
 */
function calculateExtrudeDistance(
  element: Y.XmlElement,
  direction: number
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
      
      // For now, use a simplified approach - in full implementation
      // we'd intersect rays with the target face
      // TODO: Implement proper face intersection
      return baseDistance * direction;
    }
      
    case 'toVertex': {
      const extentRef = element.getAttribute('extentRef');
      if (!extentRef) {
        throw new Error('toVertex extent requires extentRef');
      }
      // TODO: Implement vertex reference resolution
      return baseDistance * direction;
    }
      
    default:
      return baseDistance * direction;
  }
}

interface SketchData {
  points: Array<{ id: string; x: number; y: number; fixed?: boolean }>;
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
    const pid = sketch.addPoint(point.x, point.y, { fixed: point.fixed });
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
  const finalDistance = calculateExtrudeDistance(element, dirMultiplier);

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

        const tmp = new Y.XmlElement('extrude');
        tmp.setAttribute('sketch', sketchId);
        tmp.setAttribute('distance', String(distance));
        tmp.setAttribute('direction', direction);
        tmp.setAttribute('op', op);

        const body = interpretExtrude(previewSession, tmp);
        if (!body) {
          // cut previews: show tool body only by extruding as add
          tmp.setAttribute('op', 'add');
          const tool = interpretExtrude(previewSession, tmp);
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

        const tmp = new Y.XmlElement('revolve');
        tmp.setAttribute('sketch', sketchId);
        tmp.setAttribute('axis', axis);
        tmp.setAttribute('angle', String(angle));
        tmp.setAttribute('op', op);

        const body = interpretRevolve(previewSession, tmp);
        if (!body) {
          tmp.setAttribute('op', 'add');
          const tool = interpretRevolve(previewSession, tmp);
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
  }
};
