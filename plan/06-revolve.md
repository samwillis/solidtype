# Phase 06: Revolve

## Prerequisites

- Phase 05: Extrude Cut (boolean operations working)

## Goals

- Create solids of revolution (cylinders, cones, spheres, etc.)
- Revolve add and revolve cut
- Axis selection within sketch

---

## User Workflow

### Revolve Add

1. User creates a sketch with a profile and an axis line
2. User selects the profile (closed loop)
3. User clicks "Revolve"
4. User selects the axis (line in sketch or edge)
5. User sets angle (default: 360°)
6. User confirms → solid of revolution created

### Revolve Cut

Same as above, but cuts from existing body instead of adding.

---

## Document Model Changes

### Revolve Feature

```xml
<revolve 
  id="r1" 
  name="Revolve1"
  sketch="s1"
  axis="l1"
  angle="360"
  op="add"
/>
```

Attributes:
- `sketch` - Sketch containing the profile
- `axis` - Entity ID within sketch (line) or external reference
- `angle` - Revolution angle in degrees
- `op` - `add` or `cut`

### TypeScript Types

```typescript
export interface RevolveFeature extends FeatureBase {
  type: 'revolve';
  sketch: string;
  axis: string;          // Line ID in sketch
  angle: number;         // Degrees
  op: 'add' | 'cut';
}
```

---

## App UI Work

### Revolve Dialog

```typescript
export function RevolveDialog({ sketchId, onConfirm, onCancel }) {
  const [axis, setAxis] = useState<string | null>(null);
  const [angle, setAngle] = useState(360);
  const [operation, setOperation] = useState<'add' | 'cut'>('add');
  
  const sketchData = useSketchData(sketchId);
  const lines = sketchData.entities.filter(e => e.type === 'line');
  
  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Revolve</DialogTitle>
      <DialogContent>
        <ToggleGroup
          label="Operation"
          value={operation}
          onChange={setOperation}
          options={[
            { value: 'add', label: 'Add' },
            { value: 'cut', label: 'Cut' },
          ]}
        />
        
        <Select
          label="Axis"
          value={axis}
          onChange={setAxis}
          options={lines.map(l => ({
            value: l.id,
            label: `Line ${l.id}`,
          }))}
          placeholder="Select axis line"
        />
        
        <NumberInput
          label="Angle"
          value={angle}
          onChange={setAngle}
          min={1}
          max={360}
          step={15}
          unit="°"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button 
          onClick={() => onConfirm(axis, angle, operation)} 
          variant="primary"
          disabled={!axis}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Axis Visualization

```typescript
// Highlight axis line during selection
function AxisHighlight({ sketchId, axisId }) {
  // Render axis line in different color (yellow/orange)
  // Show rotation preview arc
}
```

### Preview

```typescript
// Show revolve preview with transparency
function RevolvePreview({ sketch, axis, angle, operation }) {
  const { previewRevolve, clearPreview } = useKernel();
  useEffect(() => {
    previewRevolve({ sketchId: sketch.id, axis, angle, op: operation });
    return () => clearPreview();
  }, [sketch.id, axis, angle, operation]);
  // Render with appropriate color (blue=add, red=cut) based on preview mesh id
}
```

---

## Kernel Work

### Revolve Implementation

The kernel already has `revolve.ts`. Integration:

```typescript
// In kernel.worker.ts

case 'revolve':
  const sketchId = feature.attributes.sketch;
  const axisId = feature.attributes.axis;
  const angle = parseFloat(feature.attributes.angle);
  const op = feature.attributes.op as 'add' | 'cut';
  
  const sketch = sketchMap.get(sketchId);
  if (!sketch) throw new Error(`Sketch not found: ${sketchId}`);
  
  const profile = sketch.toProfile();
  if (!profile) throw new Error('No closed profile found');
  
  // Get axis from sketch
  const axisLine = sketch.getEntity(axisId);
  if (!axisLine || axisLine.type !== 'line') {
    throw new Error('Invalid axis selection');
  }
  
  // Convert to 3D axis
  const axisStart = sketch.pointToWorld(axisLine.start);
  const axisEnd = sketch.pointToWorld(axisLine.end);
  
  const result = session.revolve(profile, {
    axisOrigin: axisStart,
    axisDirection: normalize(subtract(axisEnd, axisStart)),
    angle: (angle * Math.PI) / 180,  // Convert to radians
    operation: 'add',
  });
  
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  
  if (op === 'cut') {
    // Boolean subtract from existing bodies
    // (same pattern as extrude cut)
  } else {
    bodyMap.set(feature.id, result.body);
  }
  
  return { body: result.body };
```

### Profile Validation

- Profile must not cross the axis
- Profile should be on one side of the axis
- Axis should not intersect the profile

---

## Common Use Cases

### Cylinder

```
Profile: Rectangle (one edge on axis)
Angle: 360°
Result: Cylinder
```

### Cone

```
Profile: Right triangle (one leg on axis)
Angle: 360°
Result: Cone
```

### Sphere

```
Profile: Semicircle (diameter on axis)
Angle: 360°
Result: Sphere
```

### Partial Revolution

```
Profile: Any closed shape
Angle: 90°
Result: Quarter section
```

---

## Testing Plan

### Unit Tests

```typescript
// Test revolve cylinder
test('revolve rectangle creates cylinder', () => {
  const session = new SolidSession();
  const sketch = createSketchWithRectangleAndAxis(session);
  
  const result = session.revolve(sketch.toProfile(), {
    axisOrigin: [0, 0, 0],
    axisDirection: [0, 1, 0],
    angle: Math.PI * 2,
    operation: 'add',
  });
  
  expect(result.ok).toBe(true);
  // Cylinder: 2 circular faces + 1 cylindrical face
  expect(result.body.getFaces().length).toBe(3);
});

// Test partial revolve
test('revolve 90 degrees creates quarter', () => {
  // Similar setup, angle = PI/2
  // Should have 5 faces (2 end caps + 3 surfaces)
});
```

### Integration Tests

- Create L-shaped profile with axis line
- Revolve 360° → creates solid
- Feature tree shows revolve
- Edit angle → preview updates

---

## Persistent Naming Checklist

> See [appendix/naming-strategy.md](appendix/naming-strategy.md) for full strategy.

Revolve creates curved surfaces with different topology than extrude. Before completing:

- [ ] **Revolve face selectors assigned**:
  - `start` for start cap (if angle < 360°)
  - `end` for end cap (if angle < 360°)
  - `outer` for outer cylindrical/curved surface
  - `inner` for inner surface (if profile has inner loop)
- [ ] **Handle full revolution**: 360° revolve has no start/end caps
- [ ] **Profile-derived selectors**: Side faces derived from profile edges get `profile:0`, `profile:1`, etc.
- [ ] **Cut evolution tracking**: Same as Phase 05 for revolve cut

```typescript
// Example verification test
test('revolve face selectors are correct', () => {
  const body = session.revolve(profile, {
    axis: [0, 1, 0],
    angle: Math.PI / 2,  // 90 degrees
  });
  
  const faces = body.getFaces();
  const selectors = faces.map(f => f.localSelector);
  
  expect(selectors).toContain('start');
  expect(selectors).toContain('end');
  expect(selectors).toContain('outer');
});

test('full revolve has no caps', () => {
  const body = session.revolve(profile, {
    axis: [0, 1, 0],
    angle: Math.PI * 2,  // 360 degrees
  });
  
  const faces = body.getFaces();
  const selectors = faces.map(f => f.localSelector);
  
  expect(selectors).not.toContain('start');
  expect(selectors).not.toContain('end');
});
```

---

## Open Questions

1. **Axis from edge** - Allow selecting model edges as axis?
   - Decision: Phase 16 (after selection works)

2. **Self-intersecting revolve** - Profile crosses axis
   - Decision: Error with clear message

3. **Thin revolve** - Very small angles (<1°)
   - Decision: Allow, but warn about potential issues
