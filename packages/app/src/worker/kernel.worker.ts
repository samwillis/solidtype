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

interface SketchData {
  points: Array<{ id: string; x: number; y: number; fixed?: boolean }>;
  entities: Array<{ id: string; type: string; start?: string; end?: string; center?: string; ccw?: boolean }>;
  constraints: Array<{ id: string; type: string }>;
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
  _session: SolidSession,
  element: Y.XmlElement
): void {
  const planeId = element.getAttribute('plane') || 'xy';
  const plane = getDatumPlane(planeId);
  
  if (!plane) {
    throw new Error(`Unknown plane: ${planeId}`);
  }
  
  const data = parseSketchData(element);
  const id = element.getAttribute('id')!;
  
  sketchMap.set(id, { planeId, plane, data });
}

function interpretExtrude(
  session: SolidSession,
  element: Y.XmlElement
): Body | null {
  const sketchId = element.getAttribute('sketch');
  const distance = parseFloat(element.getAttribute('distance') || '10');
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
    // TODO: Add arc support
  }

  // Attempt to get a profile from the sketch
  const profile = sketch.toProfile();
  if (!profile) {
    throw new Error('Sketch does not contain a closed profile');
  }

  // Calculate direction multiplier
  const dirMultiplier = direction === 'reverse' ? -1 : 1;

  // Perform extrusion - always use 'add' operation and handle cut separately
  const result = session.extrude(profile, {
    operation: 'add',
    distance: distance * dirMultiplier,
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
  }
};
