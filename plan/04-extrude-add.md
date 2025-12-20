# Phase 04: Extrude Add

## Prerequisites

- Phase 03: Sketch with Straight Lines

## Goals

- Create 3D solid from closed sketch profile
- Extrude in positive direction (add material)
- First visible 3D geometry in the app
- Store extrude parameters in Yjs

---

## User Workflow

1. User has a closed sketch (e.g., rectangle)
2. User clicks "Extrude" in toolbar (or right-click sketch → Extrude)
3. Extrude dialog appears with:
   - Distance input (default: 10mm)
   - Direction preview arrow
4. User adjusts distance
5. User clicks "OK"
6. 3D body appears in viewer
7. Extrude feature appears in feature tree under the sketch

---

## Document Model Changes

### Extrude Feature

```xml
<extrude 
  id="e1" 
  name="Extrude1"
  sketch="s1" 
  distance="10" 
  op="add"
  direction="normal"
/>
```

Attributes:
- `sketch` - Reference to sketch feature ID
- `distance` - Extrusion distance (number)
- `op` - Operation type: `add` (this phase), `cut` (Phase 05)
- `direction` - `normal` (default), `reverse`, or custom vector

### TypeScript Types

```typescript
export interface ExtrudeFeature extends FeatureBase {
  type: 'extrude';
  sketch: string;          // Sketch ID reference
  distance: number;
  op: 'add' | 'cut';
  direction: 'normal' | 'reverse' | [number, number, number];
}
```

---

## App UI Work

### Extrude Dialog

```typescript
// packages/app/src/components/dialogs/ExtrudeDialog.tsx

interface ExtrudeDialogProps {
  sketchId: string;
  onConfirm: (distance: number, direction: 'normal' | 'reverse') => void;
  onCancel: () => void;
}

export function ExtrudeDialog({ sketchId, onConfirm, onCancel }: ExtrudeDialogProps) {
  const [distance, setDistance] = useState(10);
  const [direction, setDirection] = useState<'normal' | 'reverse'>('normal');
  
  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Extrude</DialogTitle>
      <DialogContent>
        <NumberInput
          label="Distance"
          value={distance}
          onChange={setDistance}
          min={0.1}
          step={1}
          unit="mm"
        />
        <Select
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'reverse', label: 'Reverse' },
          ]}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onConfirm(distance, direction)} variant="primary">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Preview During Editing

```typescript
// Show extrude preview while dialog is open
function ExtrudePreview({ sketchId, distance, direction }) {
  const { doc } = useDocument();
  const sketch = getSketchData(doc, sketchId);
  
  // Request preview mesh from kernel
  useEffect(() => {
    kernel.previewExtrude(sketchId, distance, direction);
  }, [sketchId, distance, direction]);
  
  // Kernel sends preview mesh, rendered semi-transparent
  return <PreviewMesh opacity={0.5} />;
}
```

### Toolbar Updates

```typescript
// Add extrude button
<ToolbarButton
  icon="extrude"
  label="Extrude"
  disabled={!canExtrude}
  onClick={startExtrude}
/>
```

### Feature Tree Context Menu

```typescript
// Right-click on sketch shows "Extrude" option
<ContextMenu>
  <MenuItem onClick={startExtrude}>
    <Icon name="extrude" />
    Extrude
  </MenuItem>
</ContextMenu>
```

---

## Kernel Work

### Feature Interpreter

```typescript
// In kernel.worker.ts

case 'extrude':
  const sketchId = feature.attributes.sketch;
  const sketch = sketchMap.get(sketchId);
  
  if (!sketch) {
    throw new Error(`Sketch not found: ${sketchId}`);
  }
  
  // Get closed profile from sketch
  const profile = sketch.toProfile();
  if (!profile) {
    throw new Error('Sketch does not contain a closed profile');
  }
  
  // Get plane from sketch
  const plane = getPlaneForSketch(sketchId);
  
  // Create extrude
  const distance = parseFloat(feature.attributes.distance);
  const direction = feature.attributes.direction === 'reverse' ? -1 : 1;
  
  const result = session.extrude(profile, {
    distance: distance * direction,
    plane,
    operation: 'add',
  });
  
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  
  // Track body
  bodyMap.set(feature.id, result.body);
  
  return {
    body: {
      id: feature.id,
      faceCount: result.body.getFaces().length,
    }
  };
```

### Profile Extraction

The kernel needs to convert sketch lines into a closed profile:

```typescript
// In @solidtype/core, SketchModel or similar

toProfile(): SketchProfile | null {
  // Find closed loops in the sketch
  const loops = this.findClosedLoops();
  
  if (loops.length === 0) {
    return null;
  }
  
  // Use outer loop as profile boundary
  // (inner loops would be holes - future work)
  const outerLoop = this.getOuterLoop(loops);
  
  return {
    curves: this.loopToCurves(outerLoop),
    plane: this.plane,
  };
}
```

---

## Kernel Improvements Needed

1. **Sketch → Profile conversion**
   - Find closed loops from line/arc entities
   - Determine outer vs inner loops (winding)
   - Convert to `SketchProfile` format expected by extrude

2. **Error handling**
   - Clear error if sketch has no closed profile
   - Clear error if extrude fails (self-intersecting, etc.)

---

## Persistent Naming Checklist

> See [appendix/naming-strategy.md](appendix/naming-strategy.md) for full strategy.

Before completing this phase, ensure:

- [ ] **Local selectors assigned**: Extrude assigns selectors to all created faces
  - `top` for top face
  - `bottom` for bottom face  
  - `side:0`, `side:1`, ... for side faces (indexed by profile edge)
- [ ] **Edge selectors assigned**: 
  - `top:0`, `top:1`, ... for top edges
  - `bottom:0`, `bottom:1`, ... for bottom edges
  - `lateral:0`, `lateral:1`, ... for vertical edges
- [ ] **Feature ID recorded**: Each face/edge knows its `originFeatureId`
- [ ] **Test persistence**: Verify selectors survive parameter changes

```typescript
// Example verification test
test('extrude face selectors survive parameter change', () => {
  const session = new SolidSession();
  
  // Create initial extrude
  const body1 = session.extrude(profile, { distance: 10 });
  const topRef = session.naming.createFaceRef(body1.getTopFace(), 'e1');
  
  // Change parameter, rebuild
  const body2 = session.extrude(profile, { distance: 20 });
  const resolved = session.naming.resolveFaceRef(topRef, body2);
  
  expect(resolved).not.toBeNull();
  expect(resolved.localSelector).toBe('top');
});
```

---

## Testing Plan

### Unit Tests

```typescript
// Test extrude feature creation
test('addExtrudeFeature creates extrude element', () => {
  const doc = createDocument();
  addSketchFeature(doc, 's1', 'xy');
  addExtrudeFeature(doc, 'e1', 's1', 10, 'add');
  
  const extrude = findFeature(doc.features, 'e1');
  expect(extrude).toBeDefined();
  expect(extrude.getAttribute('distance')).toBe('10');
});

// Test kernel extrude
test('extrude creates body from rectangle sketch', () => {
  const session = new SolidSession();
  const sketch = createRectangleSketch(session, 10, 20);
  
  const result = session.extrude(sketch.toProfile(), {
    distance: 5,
    operation: 'add',
  });
  
  expect(result.ok).toBe(true);
  expect(result.body.getFaces().length).toBe(6); // box has 6 faces
});
```

### Integration Tests

- Create rectangle sketch
- Click Extrude → dialog appears
- Enter distance → preview updates
- Confirm → 3D box appears
- Feature tree shows sketch and extrude

---

## User Feedback

### Success Case
- Solid body appears in 3D view
- Body is shaded with lighting
- Feature tree updates with extrude node

### Error Cases

1. **No closed profile**
   - Message: "Sketch does not contain a closed profile"
   - Sketch highlights open endpoints

2. **Self-intersecting profile**
   - Message: "Profile is self-intersecting"
   - Problem edges highlighted

---

## Open Questions

1. **Default distance** - What should it be?
   - Decision: 10 (unitless for now, assume mm)

2. **Live preview** - Should preview update as user types?
   - Decision: Yes, debounced (100ms)

3. **Two-direction extrude** - Both directions at once?
   - Decision: Not in this phase, add later as "symmetric" option
