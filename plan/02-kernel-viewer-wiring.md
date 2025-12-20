# Phase 02: Kernel-Viewer Wiring

## Prerequisites

- Phase 01: Document Model (Yjs infrastructure in place)

## Goals

- Run the CAD kernel in a Web Worker
- Sync Yjs document to worker (no serialization needed!)
- Render meshes in Three.js viewer
- Set up the rebuild pipeline
- Consider OffscreenCanvas for render worker

---

## Architecture Options

### Option A: Yjs Sync + Main Thread Rendering (Recommended Start)

```
┌────────────────────────────────────────────────────────────────┐
│                        Main Thread                             │
│  ┌──────────────┐         ┌───────────────────────────────┐    │
│  │  Y.Doc       │◀──sync──│  Y.Doc (mirror)               │    │
│  │  (primary)   │         │  (in Kernel Worker)           │    │
│  └──────────────┘         └───────────────────────────────┘    │
│         │                              │                       │
│         ▼                              ▼                       │
│  ┌──────────────┐         ┌───────────────────────────────┐    │
│  │  React UI    │         │  observe changes → rebuild    │    │
│  │  Three.js    │◀─mesh───│  SolidSession → tessellate    │    │
│  └──────────────┘         └───────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

**Key insight**: Yjs can sync between main thread and worker using `y-protocols` or a simple MessageChannel. The worker observes the synced Y.Doc directly - no serialization needed!

### Option B: Full Worker Pipeline with OffscreenCanvas (Future)

```
┌────────────────────────────────────────────────────────────────┐
│                        Main Thread                             │
│  ┌──────────────┐    ┌─────────────────────────────────────┐   │
│  │  Y.Doc       │    │  <canvas> (OffscreenCanvas handle)  │   │
│  │  (primary)   │    │  Input events → workers             │   │
│  └──────┬───────┘    └─────────────────────────────────────┘   │
│         │ sync                          ▲                      │
└─────────│───────────────────────────────│──────────────────────┘
          │                               │ renders to
          ▼                               │
┌─────────────────────┐         ┌─────────────────────┐
│   Kernel Worker     │         │   Render Worker     │
│ ┌─────────────────┐ │  mesh   │ ┌─────────────────┐ │
│ │ Y.Doc (mirror)  │ │────────▶│ │ Three.js        │ │
│ │ observe changes │ │         │ │ OffscreenCanvas │ │
│ │ rebuild model   │ │         │ │ WebGL context   │ │
│ └─────────────────┘ │         │ └─────────────────┘ │
└─────────────────────┘         └─────────────────────┘
```

This moves ALL heavy computation off main thread, keeping it 100% responsive for UI.

---

## Recommended Approach: Start with Option A, Evolve to Option B

### Phase 02a: Yjs Sync to Kernel Worker
- Kernel worker has its own Y.Doc
- Sync updates via MessageChannel
- Worker observes changes, triggers rebuild
- Meshes sent back via transferable arrays

### Phase 02b (Later): OffscreenCanvas Render Worker
- Transfer canvas to render worker
- Three.js runs in render worker
- Main thread only handles input events and UI

---

## Yjs Worker Sync

### Main Thread Setup

```typescript
// packages/app/src/worker/YjsWorkerSync.ts

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';

export class YjsWorkerSync {
  private channel: MessageChannel;
  private port: MessagePort;
  
  constructor(private doc: Y.Doc, private worker: Worker) {
    // Create dedicated channel for Yjs sync
    this.channel = new MessageChannel();
    this.port = this.channel.port1;
    
    // Send port2 to worker
    worker.postMessage({ type: 'init-sync', port: this.channel.port2 }, [this.channel.port2]);
    
    // Handle sync messages from worker
    this.port.onmessage = (event) => {
      if (event.data.type === 'sync') {
        this.handleSyncMessage(event.data.data);
      }
    };
    
    // Observe local changes and send to worker
    doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== 'worker') {
        this.port.postMessage({ type: 'update', data: update }, [update.buffer]);
      }
    });
    
    // Send initial state
    this.sendInitialState();
  }
  
  private sendInitialState(): void {
    const state = Y.encodeStateAsUpdate(this.doc);
    this.port.postMessage({ type: 'init', data: state }, [state.buffer]);
  }
  
  private handleSyncMessage(data: Uint8Array): void {
    Y.applyUpdate(this.doc, data, 'worker');
  }
}
```

### Worker Side

```typescript
// packages/app/src/worker/kernel.worker.ts

import * as Y from 'yjs';
import { SolidSession } from '@solidtype/core';

let doc: Y.Doc | null = null;
let syncPort: MessagePort | null = null;
let session: SolidSession | null = null;

// Handle initial setup
self.onmessage = (event) => {
  if (event.data.type === 'init-sync') {
    setupYjsSync(event.data.port);
  }
};

function setupYjsSync(port: MessagePort): void {
  syncPort = port;
  doc = new Y.Doc();
  
  port.onmessage = (event) => {
    const { type, data } = event.data;
    
    if (type === 'init' || type === 'update') {
      Y.applyUpdate(doc!, new Uint8Array(data), 'main');
    }
  };
  
  // Observe feature changes in worker's copy
  const features = doc.getXmlFragment('features');
  features.observeDeep(() => {
    // Debounce and trigger rebuild
    scheduleRebuild();
  });
  
  // Also observe state (for rebuild gate)
  const state = doc.getMap('state');
  state.observe(() => {
    scheduleRebuild();
  });
}

let rebuildTimeout: number | null = null;

function scheduleRebuild(): void {
  if (rebuildTimeout) {
    clearTimeout(rebuildTimeout);
  }
  rebuildTimeout = setTimeout(() => {
    rebuildTimeout = null;
    performRebuild();
  }, 16) as unknown as number; // ~60fps debounce
}

function performRebuild(): void {
  if (!doc) return;
  
  const features = doc.getXmlFragment('features');
  const state = doc.getMap('state');
  const rebuildGate = state.get('rebuildGate') as string | null;
  
  try {
    session = new SolidSession();
    const bodies: BodyInfo[] = [];
    const errors: BuildError[] = [];
    
    for (const child of features.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      
      const id = child.getAttribute('id');
      
      // Stop at rebuild gate
      if (rebuildGate && id === rebuildGate) {
        interpretFeature(session, child);
        break;
      }
      
      try {
        const result = interpretFeature(session, child);
        if (result?.body) {
          bodies.push({
            id: result.body.id,
            featureId: id,
            faceCount: result.body.getFaces().length,
          });
        }
      } catch (err) {
        errors.push({
          featureId: id,
          message: err instanceof Error ? err.message : String(err),
          code: 'BUILD_ERROR',
        });
      }
    }
    
    // Send rebuild complete
    self.postMessage({ type: 'rebuildComplete', bodies, errors });
    
    // Send meshes for all bodies
    for (const body of bodies) {
      sendMesh(body.id);
    }
    
  } catch (err) {
    self.postMessage({ 
      type: 'error', 
      message: err instanceof Error ? err.message : String(err) 
    });
  }
}

function interpretFeature(session: SolidSession, element: Y.XmlElement): any {
  const type = element.nodeName;
  
  switch (type) {
    case 'origin':
    case 'plane':
      return null; // Datum features, no geometry
    
    case 'sketch':
      // Phase 03
      return null;
    
    case 'extrude':
      // Phase 04
      return null;
    
    default:
      console.warn(`Unknown feature type: ${type}`);
      return null;
  }
}

function sendMesh(bodyId: string): void {
  if (!session) return;
  
  const body = session.getBody(bodyId);
  if (!body) return;
  
  const mesh = body.tessellate();
  
  self.postMessage(
    { 
      type: 'mesh', 
      bodyId, 
      mesh: {
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
      }
    },
    [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer]
  );
}
```

---

## React Integration

```typescript
// packages/app/src/contexts/KernelContext.tsx

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useDocument } from './DocumentContext';
import { YjsWorkerSync } from '../worker/YjsWorkerSync';

interface KernelContextValue {
  meshes: Map<string, TransferableMesh>;
  errors: BuildError[];
  isRebuilding: boolean;
}

const KernelContext = createContext<KernelContextValue | null>(null);

export function KernelProvider({ children }: { children: React.ReactNode }) {
  const { doc } = useDocument();
  const workerRef = useRef<Worker | null>(null);
  const syncRef = useRef<YjsWorkerSync | null>(null);
  const [meshes, setMeshes] = useState<Map<string, TransferableMesh>>(new Map());
  const [errors, setErrors] = useState<BuildError[]>([]);
  const [isRebuilding, setIsRebuilding] = useState(false);
  
  useEffect(() => {
    // Create kernel worker
    workerRef.current = new Worker(
      new URL('../worker/kernel.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    // Set up Yjs sync
    syncRef.current = new YjsWorkerSync(doc.ydoc, workerRef.current);
    
    // Handle messages from worker
    workerRef.current.onmessage = (event) => {
      const { type } = event.data;
      
      switch (type) {
        case 'rebuildComplete':
          setErrors(event.data.errors);
          setIsRebuilding(false);
          break;
        
        case 'mesh':
          setMeshes(prev => new Map(prev).set(event.data.bodyId, event.data.mesh));
          break;
        
        case 'error':
          console.error('Kernel error:', event.data.message);
          setIsRebuilding(false);
          break;
      }
    };
    
    return () => {
      workerRef.current?.terminate();
    };
  }, [doc]);
  
  return (
    <KernelContext.Provider value={{ meshes, errors, isRebuilding }}>
      {children}
    </KernelContext.Provider>
  );
}

export function useKernel() {
  const ctx = useContext(KernelContext);
  if (!ctx) throw new Error('useKernel must be used within KernelProvider');
  return ctx;
}
```

---

## OffscreenCanvas Render Worker (Future Enhancement)

### Why Consider This?

- Three.js rendering can be expensive
- Main thread stays 100% responsive for UI
- Better for complex models with many faces

### Implementation Sketch

```typescript
// packages/app/src/worker/render.worker.ts

import * as THREE from 'three';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

self.onmessage = (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'init':
      initRenderer(data.canvas, data.width, data.height);
      break;
    
    case 'resize':
      handleResize(data.width, data.height);
      break;
    
    case 'mesh':
      addMesh(data.bodyId, data.mesh);
      break;
    
    case 'camera':
      updateCamera(data.position, data.rotation);
      break;
  }
};

function initRenderer(canvas: OffscreenCanvas, width: number, height: number): void {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height, false);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(50, 50, 50);
  camera.lookAt(0, 0, 0);
  
  // Add lights
  scene.add(new THREE.AmbientLight(0x404040));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 20, 15);
  scene.add(directionalLight);
  
  // Start render loop
  requestAnimationFrame(render);
}

function render(): void {
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}

function addMesh(bodyId: string, meshData: TransferableMesh): void {
  if (!scene) return;
  
  // Remove existing mesh for this body
  const existing = scene.getObjectByName(bodyId);
  if (existing) scene.remove(existing);
  
  // Create new mesh
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
  
  const material = new THREE.MeshStandardMaterial({ color: 0x0078d4 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = bodyId;
  
  scene.add(mesh);
}
```

### Main Thread Setup for OffscreenCanvas

```typescript
// In Viewer.tsx
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  
  // Transfer canvas to worker
  const offscreen = canvas.transferControlToOffscreen();
  
  renderWorker.postMessage(
    { type: 'init', canvas: offscreen, width: canvas.clientWidth, height: canvas.clientHeight },
    [offscreen]
  );
  
  // Forward camera updates to worker
  // Forward mesh updates to worker
}, []);
```

### OffscreenCanvas Adoption Plan

**Trigger points** (implement OffscreenCanvas when ANY of these occur):
- Model face count exceeds 500 faces
- Frame rate drops below 30fps during orbit
- After Phase 11 (3D Selection) is complete

**Implementation trigger**: Add after selection is working (Phase 11), as selection raycasting benefits from worker-side Three.js.

**Safari Fallback**:

```typescript
// Feature detection
const supportsOffscreen = typeof OffscreenCanvas !== 'undefined' && 
  canvas.transferControlToOffscreen !== undefined;

if (supportsOffscreen) {
  // Use OffscreenCanvas render worker
  const offscreen = canvas.transferControlToOffscreen();
  renderWorker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
} else {
  // Fallback: render on main thread (current approach)
  initMainThreadRenderer(canvas);
}
```

**Considerations**:
1. **Browser support**: Chrome 69+, Firefox 105+, Safari 16.4+
2. **Event handling**: Input events (mouse, touch) forwarded to worker via postMessage
3. **Picking/selection**: Raycast in render worker, return hit info to main thread
4. **Complexity**: Adds communication overhead, justified for complex models

---

## Rebuild Strategy

### Phase 02: Full Rebuild

Initial implementation uses **full rebuild** on every change:

```typescript
function performRebuild(): void {
  // Clear all bodies
  session = new SolidSession();
  bodyMap.clear();
  
  // Rebuild all features from scratch
  for (const feature of features.toArray()) {
    if (rebuildGate && feature.id === rebuildGate) {
      interpretFeature(session, feature);
      break;
    }
    interpretFeature(session, feature);
  }
}
```

**Rationale**: Simplicity first. Full rebuild is correct and predictable.

### Future: Incremental Rebuild (Phase 12+)

Switch to incremental when:
1. Rebuild times exceed 100ms regularly
2. Models have 10+ features
3. User testing shows noticeable lag

Incremental strategy:

```typescript
// Track which features changed
features.observeDeep((events) => {
  const changedFeatureIds = new Set<string>();
  
  for (const event of events) {
    let target = event.target;
    while (target && !(target instanceof Y.XmlElement && target.parent === features)) {
      target = target.parent;
    }
    if (target instanceof Y.XmlElement) {
      changedFeatureIds.add(target.getAttribute('id'));
    }
  }
  
  // Find earliest changed feature
  const firstChangedIndex = features.toArray().findIndex(f => 
    changedFeatureIds.has(f.getAttribute('id'))
  );
  
  // Rebuild from that point forward
  scheduleRebuild({ fromIndex: firstChangedIndex });
});
```

### Rebuild Gate Acceptance Criteria

1. **UI behavior**:
   - Gate bar is visible and draggable in feature tree
   - Features below gate are visually grayed out
   - Dragging gate triggers rebuild

2. **Worker behavior**:
   - Worker stops processing at gate feature
   - Features after gate have status `'gated'`
   - Meshes for gated features are removed from scene

3. **State sync**:
   - Gate position persists in Yjs `state` map
   - Gate syncs across main thread ↔ worker

---

## Kernel Work

Minimal kernel changes needed:

1. Ensure `SolidSession` can be instantiated in Worker
2. Ensure `Body.tessellate()` returns transferable arrays
3. Add `session.getBody(id)` method if not present

---

## App UI Work

1. Create `YjsWorkerSync.ts` for Yjs synchronization
2. Create `kernel.worker.ts` with Yjs observation
3. Create `KernelContext.tsx` for React integration
4. Update `Viewer.tsx` to render meshes from kernel
5. (Optional) Create `render.worker.ts` for OffscreenCanvas

---

## Testing Plan

### Minimum Required Tests (Vitest)

```typescript
// packages/app/src/__tests__/worker-sync.test.ts

describe('YjsWorkerSync', () => {
  test('sends initial state to worker', async () => {
    const doc = new Y.Doc();
    const worker = new MockWorker();
    
    new YjsWorkerSync(doc, worker);
    
    await waitFor(() => {
      expect(worker.messages).toContainEqual(
        expect.objectContaining({ type: 'init' })
      );
    });
  });

  test('sends updates when document changes', async () => {
    const doc = new Y.Doc();
    const worker = new MockWorker();
    
    new YjsWorkerSync(doc, worker);
    
    // Make a change
    doc.getXmlFragment('features').push([new Y.XmlElement('test')]);
    
    await waitFor(() => {
      expect(worker.messages).toContainEqual(
        expect.objectContaining({ type: 'update' })
      );
    });
  });

  test('applies updates from worker', async () => {
    const doc = new Y.Doc();
    const worker = new MockWorker();
    
    const sync = new YjsWorkerSync(doc, worker);
    
    // Simulate worker sending update
    const workerUpdate = createTestUpdate();
    sync.handleWorkerMessage({ type: 'sync', data: workerUpdate });
    
    // Doc should have the change
    expect(doc.getXmlFragment('features').length).toBeGreaterThan(0);
  });
});

describe('Kernel Worker Rebuild', () => {
  test('observes feature changes and triggers rebuild', async () => {
    const { worker, doc } = await setupTestWorker();
    
    // Add a feature
    const sketch = new Y.XmlElement('sketch');
    sketch.setAttribute('id', 's1');
    doc.getXmlFragment('features').push([sketch]);
    
    // Should receive rebuild message
    await waitFor(() => {
      expect(worker.sentMessages).toContainEqual(
        expect.objectContaining({ type: 'rebuildComplete' })
      );
    });
  });

  test('respects rebuild gate', async () => {
    const { worker, doc } = await setupTestWorker();
    
    // Add features
    addTestFeatures(doc, ['s1', 'e1', 's2', 'e2']);
    
    // Set gate
    doc.getMap('state').set('rebuildGate', 'e1');
    
    await waitFor(() => {
      const result = worker.lastRebuildResult;
      expect(result.featureStatus['s1']).toBe('computed');
      expect(result.featureStatus['e1']).toBe('computed');
      expect(result.featureStatus['s2']).toBe('gated');
      expect(result.featureStatus['e2']).toBe('gated');
    });
  });

  test('sends mesh data with transferable arrays', async () => {
    const { worker, doc } = await setupTestWorker();
    
    // Add sketch and extrude
    addRectangleSketch(doc, 's1');
    addExtrude(doc, 'e1', 's1', 10);
    
    await waitFor(() => {
      const meshMsg = worker.sentMessages.find(m => m.type === 'mesh');
      expect(meshMsg).toBeDefined();
      expect(meshMsg.mesh.positions).toBeInstanceOf(Float32Array);
      expect(meshMsg.mesh.normals).toBeInstanceOf(Float32Array);
      expect(meshMsg.mesh.indices).toBeInstanceOf(Uint32Array);
    });
  });
});

describe('Error Handling', () => {
  test('reports build errors with feature ID', async () => {
    const { worker, doc } = await setupTestWorker();
    
    // Add extrude without valid sketch (will fail)
    addExtrude(doc, 'e1', 'nonexistent', 10);
    
    await waitFor(() => {
      const result = worker.lastRebuildResult;
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          featureId: 'e1',
          code: expect.any(String),
        })
      );
    });
  });
});
```

### Integration Tests

- [ ] Worker receives Yjs updates from main thread
- [ ] Rebuild triggers automatically on feature change
- [ ] Meshes appear in Three.js scene when bodies are created
- [ ] Rebuild gate stops processing at correct feature
- [ ] Error state is surfaced to UI

---

## Open Questions

1. **Yjs sync library** - Use `y-protocols` or custom implementation?
   - Decision: Start with custom MessageChannel, simpler for worker-to-worker

2. **OffscreenCanvas priority** - When to implement?
   - Decision: Phase 02a without, add as optimization when models get complex

3. **Incremental rebuild** - How sophisticated?
   - Decision: Start with full rebuild, track changed features for future optimization

---

## Vite Configuration

```typescript
export default defineConfig({
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: ['@solidtype/core', 'yjs'],
  },
});
```

---

## Benefits of This Architecture

1. **No serialization** - Yjs handles sync efficiently with binary updates
2. **Reactive rebuilds** - Worker observes changes directly
3. **Main thread stays light** - Only UI and input handling
4. **Future-proof** - Easy path to OffscreenCanvas for rendering
5. **Collaboration-ready** - Same sync mechanism can work with network providers
