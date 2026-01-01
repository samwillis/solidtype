# Phase 05: Extrude Cut

## Prerequisites

- Phase 04: Extrude Add

## Goals

- Cut (subtract) material using extrude
- Create holes and pockets in existing bodies
- Establish pattern for boolean operations

---

## User Workflow

1. User has an existing body (from extrude add)
2. User creates a new sketch on the same plane (or top face - later)
3. User draws a closed profile (e.g., circle for a hole)
4. User clicks "Extrude" → selects "Cut" operation
5. Extrude subtracts from existing body
6. Hole/pocket appears in 3D view

---

## Document Model Changes

### Cut Extrude

Same structure as add, with `op="cut"`:

```xml
<extrude
  id="e2"
  name="Cut1"
  sketch="s2"
  distance="15"
  op="cut"
  direction="reverse"
/>
```

The `direction="reverse"` means cut goes in the opposite direction from the sketch plane normal.

### Target Body (Implicit vs Explicit)

For now, cut operations target **all existing bodies** (implicit). Later we can add explicit target selection:

```xml
<!-- Future: explicit target -->
<extrude id="e2" sketch="s2" distance="15" op="cut" target="e1" />
```

---

## App UI Work

### Extended Extrude Dialog

```typescript
export function ExtrudeDialog({ sketchId, onConfirm, onCancel }: ExtrudeDialogProps) {
  const [distance, setDistance] = useState(10);
  const [direction, setDirection] = useState<'normal' | 'reverse'>('normal');
  const [operation, setOperation] = useState<'add' | 'cut'>('add');

  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Extrude</DialogTitle>
      <DialogContent>
        <ToggleGroup
          label="Operation"
          value={operation}
          onChange={setOperation}
          options={[
            { value: 'add', label: 'Add', icon: 'plus' },
            { value: 'cut', label: 'Cut', icon: 'minus' },
          ]}
        />
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
        <Button onClick={() => onConfirm(distance, direction, operation)} variant="primary">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Preview Differentiation

- **Add**: Preview shown in blue/normal color
- **Cut**: Preview shown in red/orange to indicate subtraction

```typescript
<PreviewMesh
  color={operation === 'cut' ? 0xff4444 : 0x4488ff}
  opacity={0.5}
/>
```

---

## Kernel Work

### Boolean Integration

Cut extrude is essentially:

1. Create extrude body (same as add)
2. Subtract from existing bodies

```typescript
// In kernel.worker.ts

case 'extrude':
  const op = feature.attributes.op as 'add' | 'cut';

  // Create the extrusion body
  const extrudeResult = session.extrude(profile, {
    distance: distance * direction,
    plane,
    operation: 'add',  // Always create body first
  });

  if (!extrudeResult.ok) {
    throw new Error(extrudeResult.error.message);
  }

  if (op === 'cut') {
    // Subtract from all existing bodies
    const targetBodies = Array.from(bodyMap.values());

    for (const targetBody of targetBodies) {
      const boolResult = session.subtract(targetBody, extrudeResult.body);

      if (boolResult.ok) {
        // Update the target body reference
        bodyMap.set(getBodyFeatureId(targetBody), boolResult.body);
      }
    }

    // The tool body is consumed, not tracked
    return { body: null };
  } else {
    bodyMap.set(feature.id, extrudeResult.body);
    return { body: extrudeResult.body };
  }
```

### Error Handling

- **No intersection**: Cut doesn't intersect any body
  - Warning, not error (operation succeeds but has no effect)
- **Complete consumption**: Cut removes entire body
  - Body is removed from model
  - Feature tree updates

---

## Visual Feedback

### During Cut Preview

```typescript
// Show what will be removed
function CutPreview({ toolMesh, targetMeshes }) {
  return (
    <>
      {/* Tool body in red */}
      <Mesh geometry={toolMesh} color={0xff4444} opacity={0.7} />

      {/* Intersection regions highlighted */}
      {targetMeshes.map(mesh => (
        <IntersectionHighlight key={mesh.id} target={mesh} tool={toolMesh} />
      ))}
    </>
  );
}
```

### After Cut

- Hole/pocket visible in body
- Cut faces have same material as body
- Internal faces are visible (hollow look for through-holes)

---

## Testing Plan

### Unit Tests

```typescript
// Test cut extrude creation
test("cut extrude removes material", () => {
  const session = new SolidSession();

  // Create base box
  const boxSketch = createRectangleSketch(session, 20, 20);
  session.extrude(boxSketch.toProfile(), { distance: 10, operation: "add" });

  // Create hole
  const holeSketch = createCircleSketch(session, 5); // radius 5
  const cutResult = session.extrude(holeSketch.toProfile(), {
    distance: 10,
    operation: "cut",
  });

  expect(cutResult.ok).toBe(true);
  // Should have more faces now (cylinder hole adds faces)
  expect(cutResult.body.getFaces().length).toBeGreaterThan(6);
});
```

### Integration Tests

- Create box via extrude add
- Create circle sketch on same plane
- Extrude cut → hole appears
- Feature tree shows both extrudes

---

## Persistent Naming Checklist

> See [appendix/naming-strategy.md](appendix/naming-strategy.md) for full strategy.

Boolean operations (subtract) create complex topology changes. Before completing this phase:

- [ ] **Track face evolution**: When boolean splits a face, record the mapping
  - Original face → resulting face(s)
  - New faces from tool body get their own selectors
- [ ] **Handle face merging**: When faces merge, record which originals combined
- [ ] **Cut face selectors**: Faces created by cut get selectors like `cut:0`, `cut:1`
- [ ] **Test reference survival**: References to original body faces must resolve after cut

```typescript
// Example verification test
test("face reference survives cut operation", () => {
  // Create box
  const box = session.extrudeAdd(rectangleProfile, 10);
  const topRef = session.naming.createFaceRef(box.getTopFace(), "e1");

  // Cut hole (doesn't touch top face)
  const hole = session.extrudeCut(circleProfile, 10);

  // Top face reference should still resolve
  const resolved = session.naming.resolveFaceRef(topRef);
  expect(resolved).not.toBeNull();
});

test("split face returns multiple results", () => {
  // Create box, cut that splits a face
  // Original face ref should return 'split' with multiple faces
});
```

---

## Open Questions

1. **Multiple bodies** - What if there are multiple bodies?
   - Decision: Cut from all bodies (like SolidWorks default)
   - Future: Add body selection option

2. **Partial cuts** - What if cut only partially intersects?
   - Decision: Valid operation, creates pocket

3. **Through all** - Cut through entire body?
   - Decision: Phase 14 (extrude extents)
