# Phase 14: Extrude Extents

**Status: ✅ IMPLEMENTED**

## Prerequisites

- Phase 13: Properties Panel
- Phase 11: 3D Selection (for selecting target faces)

## Implementation Notes

### What's Done:
- `document.ts` - `ExtrudeExtent` type and `extent`, `extentRef` fields on `ExtrudeFeature`
- `featureHelpers.ts` - `addExtrudeFeature()` accepts options with extent parameters
- `PropertiesPanel.tsx` - Extent type dropdown (blind, toFace, throughAll) with `FaceSelector` component
- `kernel.worker.ts` - `calculateExtrudeDistance()` function with proper face distance calculation

### Extent Type Status:
| Type | Status | Notes |
|------|--------|-------|
| `blind` | ✅ Working | Fixed distance extrusion |
| `throughAll` | ✅ Working | Uses large distance (1000 units) |
| `toFace` | ✅ Working | Calculates distance to face centroid along extrude direction |
| `toVertex` | ❌ Stub | Falls back to base distance; needs vertex selection UI |

### Key Implementation Details:
1. **FaceSelector component** - UI for entering face selection mode, stores `face:featureId:faceIndex` reference
2. **Distance calculation** - Uses dot product of (faceCentroid - planeOrigin) · planeNormal
3. **Selection mode** - Uses `SelectionContext.setSelectionMode('selectFace')` and callback pattern
4. **CSS styling** - `.face-selector` with prompt and cancel states

## Goals

- Extrude "up to face" (stop at selected face)
- Extrude "up to vertex" (stop at selected point)
- Extrude "through all" (extend through entire model)
- Store extent references in document model

---

## User Workflow

### Up To Face

1. User creates sketch and starts extrude
2. In extrude dialog, user selects "Up to Face" extent type
3. User clicks on a face in 3D view
4. Extrude preview extends to that face
5. User confirms

### Through All

1. User selects "Through All" extent type
2. Extrude extends through entire model in that direction
3. No face selection needed

### Up To Vertex

1. User selects "Up to Vertex" extent type
2. User clicks on a vertex or point
3. Extrude extends to the plane at that point

---

## Document Model Changes

### Extent Types

```xml
<!-- Fixed distance (existing) -->
<extrude id="e1" sketch="s1" extent="blind" distance="10" op="add" />

<!-- Up to face -->
<extrude id="e2" sketch="s2" extent="toFace" extentRef="face:e1:top" op="cut" />

<!-- Through all -->
<extrude id="e3" sketch="s3" extent="throughAll" op="cut" />

<!-- Up to vertex -->
<extrude id="e4" sketch="s4" extent="toVertex" extentRef="vertex:e1:corner:0" op="add" />
```

### TypeScript Types

```typescript
export interface ExtrudeFeature extends FeatureBase {
  type: 'extrude';
  sketch: string;
  op: 'add' | 'cut';
  direction: 'normal' | 'reverse';
  
  // Extent options (mutually exclusive)
  extent: 'blind' | 'toFace' | 'toVertex' | 'throughAll';
  distance?: number;          // For 'blind'
  extentRef?: string;         // For 'toFace' or 'toVertex'
}
```

### Extent Reference Format

```typescript
// Persistent reference string format
type ExtentRef = 
  | `face:${featureId}:${localSelector}`
  | `vertex:${featureId}:${localSelector}`
  ;

// Examples:
// "face:e1:top" - top face of extrude e1
// "face:e1:side:2" - side face 2 of extrude e1
// "vertex:e1:corner:0" - corner vertex 0 of extrude e1
```

---

## App UI Work

### Extended Extrude Dialog

```typescript
export function ExtrudeDialog({ sketchId, onConfirm, onCancel }) {
  const [extent, setExtent] = useState<'blind' | 'toFace' | 'toVertex' | 'throughAll'>('blind');
  const [distance, setDistance] = useState(10);
  const [extentRef, setExtentRef] = useState<string | null>(null);
  const [selectingFace, setSelectingFace] = useState(false);
  
  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Extrude</DialogTitle>
      <DialogContent>
        {/* Operation toggle */}
        <ToggleGroup
          label="Operation"
          value={operation}
          onChange={setOperation}
          options={[
            { value: 'add', label: 'Add' },
            { value: 'cut', label: 'Cut' },
          ]}
        />
        
        {/* Extent type */}
        <Select
          label="Extent"
          value={extent}
          onChange={setExtent}
          options={[
            { value: 'blind', label: 'Distance' },
            { value: 'toFace', label: 'Up to Face' },
            { value: 'toVertex', label: 'Up to Vertex' },
            { value: 'throughAll', label: 'Through All' },
          ]}
        />
        
        {/* Distance input (for blind) */}
        {extent === 'blind' && (
          <NumberInput
            label="Distance"
            value={distance}
            onChange={setDistance}
            min={0.1}
            unit="mm"
          />
        )}
        
        {/* Face selection (for toFace) */}
        {extent === 'toFace' && (
          <div className="extent-ref-input">
            <span>{extentRef || 'No face selected'}</span>
            <Button onClick={() => setSelectingFace(true)}>
              Select Face
            </Button>
          </div>
        )}
        
        {/* Vertex selection (for toVertex) */}
        {extent === 'toVertex' && (
          <div className="extent-ref-input">
            <span>{extentRef || 'No vertex selected'}</span>
            <Button onClick={() => setSelectingVertex(true)}>
              Select Vertex
            </Button>
          </div>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button 
          onClick={() => onConfirm({ extent, distance, extentRef, operation })}
          variant="primary"
          disabled={needsRef && !extentRef}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Face Selection Mode

```typescript
// When user clicks "Select Face", enter selection mode
function handleSelectFaceClick() {
  setSelectingFace(true);
  
  // Listen for face selection
  const unsubscribe = onFaceSelected((face) => {
    setExtentRef(face.persistentRef.toString());
    setSelectingFace(false);
    unsubscribe();
  });
}
```

---

## Kernel Work

### Resolving Extent References

```typescript
// In kernel.worker.ts

function resolveExtent(
  feature: ExtrudeFeature,
  session: SolidSession
): { distance: number } | { targetFace: Face } | { throughAll: true } {
  
  switch (feature.extent) {
    case 'blind':
      return { distance: feature.distance };
      
    case 'throughAll':
      return { throughAll: true };
      
    case 'toFace':
      const face = resolveFaceRef(feature.extentRef, session);
      if (!face) throw new Error(`Cannot resolve face: ${feature.extentRef}`);
      return { targetFace: face };
      
    case 'toVertex':
      const vertex = resolveVertexRef(feature.extentRef, session);
      if (!vertex) throw new Error(`Cannot resolve vertex: ${feature.extentRef}`);
      // Convert vertex to distance
      const distance = calculateDistanceToVertex(vertex, profile, direction);
      return { distance };
  }
}
```

### Extrude to Face

```typescript
function extrudeToFace(
  profile: SketchProfile,
  targetFace: Face,
  direction: Vec3
): ExtrudeResult {
  // Calculate where profile intersects target face
  // This requires ray-surface intersection for each profile point
  
  const distances: number[] = [];
  
  for (const point of profile.boundaryPoints) {
    const ray = { origin: point, direction };
    const intersection = intersectRaySurface(ray, targetFace.getSurface());
    
    if (intersection) {
      distances.push(intersection.t);
    }
  }
  
  if (distances.length === 0) {
    throw new Error('Profile does not intersect target face');
  }
  
  // Use minimum distance to ensure we stop at the face
  const maxDistance = Math.min(...distances);
  
  // Create variable-height extrude or use max distance
  return extrudeWithDistance(profile, maxDistance);
}
```

### Through All

```typescript
function extrudeThroughAll(
  profile: SketchProfile,
  direction: Vec3,
  existingBodies: Body[]
): ExtrudeResult {
  // Find maximum extent needed to pass through all bodies
  let maxExtent = 0;
  
  for (const body of existingBodies) {
    const bbox = body.getBoundingBox();
    const extent = calculateExtentThroughBBox(profile, direction, bbox);
    maxExtent = Math.max(maxExtent, extent);
  }
  
  // Add margin to ensure complete penetration
  maxExtent += 1.0;
  
  return extrudeWithDistance(profile, maxExtent);
}
```

---

## Persistent Naming Integration

### Creating Face References

```typescript
function createFaceRef(face: Face, session: SolidSession): string {
  const ref = session.namingStrategy.getRef(face);
  return `face:${ref.originFeatureId}:${ref.localSelector}`;
}
```

### Resolving Face References

```typescript
function resolveFaceRef(refString: string, session: SolidSession): Face | null {
  const match = refString.match(/^face:(.+):(.+)$/);
  if (!match) return null;
  
  const [, featureId, selector] = match;
  
  const ref: PersistentRef = {
    originFeatureId: featureId,
    localSelector: parseSelector(selector),
  };
  
  const result = session.namingStrategy.resolve(ref);
  if (result === null || result === 'ambiguous') return null;
  
  return session.getFace(result.id);
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test up-to-face extrude
test('extrude to face stops at target', () => {
  const session = new SolidSession();
  
  // Create base body
  const baseSketch = createRectangleSketch(10, 10);
  session.extrude(baseSketch.toProfile(), { distance: 20 });
  
  // Get top face
  const topFace = session.getBody().getFaces().find(f => isTopFace(f));
  
  // Extrude second sketch to that face
  const secondSketch = createRectangleSketch(5, 5);
  const result = session.extrude(secondSketch.toProfile(), {
    extent: 'toFace',
    targetFace: topFace,
  });
  
  expect(result.ok).toBe(true);
  // Height should match base body height
  expect(result.body.getBoundingBox().maxZ).toBeCloseTo(20);
});

// Test through all
test('extrude through all penetrates body', () => {
  // Create body, then cut through all
  // Verify hole goes completely through
});
```

### Integration Tests

- Select "Up to Face" → click face → preview updates
- Confirm → extrude stops at selected face
- Edit feature later → reference still resolves

---

## Open Questions

1. **Offset from face** - Allow "up to face + offset"?
   - Decision: Future enhancement, not in this phase

2. **Multiple bodies** - What if extent face is on different body?
   - Decision: Allow it, reference works across bodies

3. **Face deletion** - What if referenced face is deleted?
   - Decision: Feature errors, user must re-select or change extent type
