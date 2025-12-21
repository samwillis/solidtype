# Phase 03: Sketch with Straight Lines

**Status: ✅ IMPLEMENTED (Enhanced)**

## Prerequisites

- Phase 01: Document Model (Yjs)
- Phase 02: Kernel-Viewer Wiring

## Goals

- Create sketches on datum planes (XY, XZ, YZ)
- Draw straight lines in 2D sketch mode
- Direct manipulation (drag points freely, no constraints yet)
- Store sketch data in Yjs document

---

## User Workflow

> **Enhanced from original plan** with improved sketch mode handling

### Creating a New Sketch
1. User **selects a datum plane** in feature tree or 3D view
2. User clicks "New Sketch" in toolbar (enabled when plane is selected)
3. View switches to 2D sketch mode (camera aligned to plane)
4. Toolbar shows sketch tools (Line, Arc, Circle, Rectangle, Constraints)
5. **Feature tree is disabled** during sketch editing

### Drawing
1. User selects "Line" tool
2. User clicks to place start point, clicks again for end point
3. User can continue adding lines or switch tools
4. Selection highlights render **in the 3D view** (not 2D overlay)

### Finishing/Canceling
1. **Cmd/Ctrl+Enter** to accept sketch, or click "Finish Sketch"
2. **Escape** to cancel sketch:
   - If new sketch: sketch is **deleted**
   - If editing existing sketch: changes are **reverted** via undo
3. Sketch appears in feature tree

### Editing Existing Sketch
1. **Double-click** sketch in feature tree to enter edit mode
2. Changes can be reverted with Escape

---

## Document Model Changes

### Sketch Feature

```xml
<sketch
  id="s1"
  plane="xy"
  name="Sketch1"
  points='[{"id":"pt1","x":0,"y":0},{"id":"pt2","x":10,"y":0},{"id":"pt3","x":10,"y":10},{"id":"pt4","x":0,"y":10}]'
  entities='[{"id":"ln1","type":"line","start":"pt1","end":"pt2"},{"id":"ln2","type":"line","start":"pt2","end":"pt3"},{"id":"ln3","type":"line","start":"pt3","end":"pt4"},{"id":"ln4","type":"line","start":"pt4","end":"pt1"}]'
  constraints='[]'
/>
```

### TypeScript Types

```typescript
// packages/app/src/types/document.ts

export interface SketchPoint {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
  attachedTo?: string;  // For Phase 16
}

export interface SketchLine {
  id: string;
  type: 'line';
  start: string;  // Point ID
  end: string;    // Point ID
}

export interface SketchArc {
  id: string;
  type: 'arc';
  start: string;
  end: string;
  center: string;
  ccw: boolean;
}

export type SketchEntity = SketchLine | SketchArc;

export interface SketchData {
  points: SketchPoint[];
  entities: SketchEntity[];
  constraints: any[];  // Defined in Phase 07
}
```

---

## App UI Work

### Sketch Mode State

```typescript
// packages/app/src/contexts/SketchContext.tsx

interface SketchModeState {
  active: boolean;
  sketchId: string | null;
  planeId: string | null;
  activeTool: 'select' | 'line' | 'arc' | null;
  tempPoints: { x: number; y: number }[];  // For in-progress drawing
}

export function SketchProvider({ children }) {
  const [mode, setMode] = useState<SketchModeState>({
    active: false,
    sketchId: null,
    planeId: null,
    activeTool: null,
    tempPoints: [],
  });
  
  const startSketch = (planeId: string) => {
    // Create new sketch in Yjs
    const sketchId = generateId('s');
    addSketchFeature(doc, sketchId, planeId);
    
    setMode({
      active: true,
      sketchId,
      planeId,
      activeTool: 'line',
      tempPoints: [],
    });
    
    // Align camera to plane
    alignCameraToPlane(planeId);
  };
  
  const finishSketch = () => {
    setMode({
      active: false,
      sketchId: null,
      planeId: null,
      activeTool: null,
      tempPoints: [],
    });
    
    // Restore 3D view
    restoreCamera();
  };
  
  // ... tool selection, point adding, etc.
}
```

### SketchCanvas Component

A 2D overlay for sketch editing:

```typescript
// packages/app/src/components/SketchCanvas.tsx

export function SketchCanvas() {
  const { mode, addPoint, addLine } = useSketch();
  const { doc } = useDocument();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  if (!mode.active) return null;
  
  const handleClick = (e: React.MouseEvent) => {
    const pos = screenToSketch(e.clientX, e.clientY);
    
    if (mode.activeTool === 'line') {
      if (mode.tempPoints.length === 0) {
        // First click: start point
        setTempPoint(pos);
      } else {
        // Second click: end point, create line
        const startPoint = addPoint(mode.tempPoints[0].x, mode.tempPoints[0].y);
        const endPoint = addPoint(pos.x, pos.y);
        addLine(startPoint, endPoint);
        clearTempPoints();
      }
    }
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    // Preview line while drawing
    if (mode.activeTool === 'line' && mode.tempPoints.length === 1) {
      const pos = screenToSketch(e.clientX, e.clientY);
      renderPreviewLine(mode.tempPoints[0], pos);
    }
  };
  
  return (
    <canvas
      ref={canvasRef}
      className="sketch-canvas"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    />
  );
}
```

### Toolbar Updates

```typescript
// Add sketch tools to Toolbar
<ToolbarButton
  icon="sketch"
  label="New Sketch"
  onClick={() => showPlaneSelector()}
/>

// When in sketch mode:
<ToolbarButton
  icon="line"
  label="Line"
  active={mode.activeTool === 'line'}
  onClick={() => setTool('line')}
/>
<ToolbarButton
  icon="finish"
  label="Finish Sketch"
  onClick={finishSketch}
/>
```

### Camera Alignment

```typescript
// packages/app/src/utils/camera.ts

export function alignCameraToPlane(
  camera: THREE.Camera,
  planeId: string
): void {
  const planeNormals: Record<string, THREE.Vector3> = {
    xy: new THREE.Vector3(0, 0, 1),
    xz: new THREE.Vector3(0, 1, 0),
    yz: new THREE.Vector3(1, 0, 0),
  };
  
  const normal = planeNormals[planeId];
  if (!normal) return;
  
  // Position camera looking at origin along normal
  const distance = camera.position.length();
  camera.position.copy(normal.clone().multiplyScalar(distance));
  camera.lookAt(0, 0, 0);
  
  // Set appropriate up vector
  if (planeId === 'xy') {
    camera.up.set(0, 1, 0);
  } else if (planeId === 'xz') {
    camera.up.set(0, 0, -1);
  } else {
    camera.up.set(0, 1, 0);
  }
}
```

---

## Kernel Work

The kernel already has `SketchModel` class. We need to:

1. **Feature interpreter** understands sketch features:

```typescript
// In kernel.worker.ts interpretFeature()

case 'sketch':
  const sketchData = parseSketchData(feature);
  const plane = getPlane(feature.attributes.plane);
  
  // Create SketchModel from data
  const sketch = session.createSketch(plane);
  
  for (const point of sketchData.points) {
    sketch.addPoint(point.x, point.y);
  }
  
  for (const entity of sketchData.entities) {
    if (entity.type === 'line') {
      sketch.addLine(
        pointIdMap.get(entity.start),
        pointIdMap.get(entity.end)
      );
    }
  }
  
  // Store sketch for later use by extrude
  sketchMap.set(feature.id, sketch);
  return null;  // Sketches don't produce bodies
```

2. **Sketch-to-profile conversion** (for Phase 04):

```typescript
// Get closed profiles from sketch
const profiles = sketch.toProfiles();
```

---

## Visual Rendering

### Sketch Preview in 3D View

Even when not editing, sketches should be visible:

```typescript
// Render sketch entities as lines in 3D
function renderSketchIn3D(sketch: SketchData, plane: PlaneInfo): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  
  for (const entity of sketch.entities) {
    if (entity.type === 'line') {
      const start = sketch.points.find(p => p.id === entity.start);
      const end = sketch.points.find(p => p.id === entity.end);
      
      if (start && end) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
          ...planeToWorld(start.x, start.y, plane),
          ...planeToWorld(end.x, end.y, plane),
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        group.add(new THREE.Line(geometry, material));
      }
    }
  }
  
  return group;
}
```

### Point Handles

```typescript
// Render draggable point handles
function renderPointHandles(sketch: SketchData, plane: PlaneInfo): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.1);
  const material = new THREE.MeshBasicMaterial({ color: 0x0088ff });
  
  for (const point of sketch.points) {
    const mesh = new THREE.Mesh(geometry, material);
    const worldPos = planeToWorld(point.x, point.y, plane);
    mesh.position.set(...worldPos);
    mesh.userData.pointId = point.id;
    group.add(mesh);
  }
  
  return group;
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test sketch creation in Yjs
test('addSketchFeature creates sketch element', () => {
  const doc = createDocument();
  addSketchFeature(doc, 's1', 'xy');
  
  const sketch = findFeature(doc.features, 's1');
  expect(sketch).toBeDefined();
  expect(sketch.getAttribute('plane')).toBe('xy');
});

// Test point/line adding
test('addPoint adds point to sketch', () => {
  const doc = createDocument();
  addSketchFeature(doc, 's1', 'xy');
  
  addPointToSketch(doc, 's1', 'p1', 5, 10);
  
  const sketchData = getSketchData(doc, 's1');
  expect(sketchData.points).toHaveLength(1);
  expect(sketchData.points[0].x).toBe(5);
});
```

### Integration Tests

- Click "New Sketch" → plane selector appears
- Select XY plane → camera aligns to top view
- Line tool is active by default
- Click twice → line is created
- Line appears in sketch preview
- Finish sketch → returns to 3D view

---

## Open Questions

1. **Snap to grid?** - Should points snap to grid in sketch mode?
   - Decision: Optional, start without, add as setting later

2. **Point merging** - Should clicking near existing point reuse it?
   - Decision: Yes, with tolerance (important for closed loops)

3. **2D vs 3D editing** - Should sketch editing be in 2D overlay or in 3D?
   - Decision: 2D overlay for now (simpler), can add 3D later

---

## CSS

```css
/* packages/app/src/components/SketchCanvas.css */

.sketch-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  cursor: crosshair;
}

.sketch-canvas.tool-select {
  cursor: default;
}
```
