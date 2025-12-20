# Phase 15: Sketch on Face

**Status: IMPLEMENTED**

## Prerequisites

- Phase 14: Extrude Extents
- Phase 11: 3D Selection

## Implementation Notes

Sketch on face is supported in the document model and worker:
- `document.ts` - Updated `SketchFeature.plane` documentation to support face references
- `kernel.worker.ts` - Added `getSketchPlane()` function that:
  - Resolves datum plane IDs (`xy`, `xz`, `yz`)
  - Parses face references (`face:{featureId}:{selector}`)
  - Extracts plane from planar body faces
- Unit tests added for face reference in plane attribute

Face reference format: `face:{featureId}:{selector}`
- Example: `face:e1:top` - Top face of extrude feature e1

## Goals

- Create sketches on model faces (not just datum planes)
- Automatically derive sketch plane from face
- Sketch updates when face moves
- Foundation for more complex multi-body workflows

---

## User Workflow

1. User clicks "New Sketch"
2. User is prompted to select a plane or face
3. User clicks on a model face
4. View aligns to that face
5. User draws sketch in 2D
6. Sketch plane is tied to the face via persistent reference

---

## Document Model Changes

### Sketch Plane Reference

```xml
<!-- Sketch on datum plane (existing) -->
<sketch id="s1" plane="xy">

<!-- Sketch on model face -->
<sketch id="s2" plane="face:e1:top">
```

The `plane` attribute can now be:
- Datum plane ID: `"xy"`, `"xz"`, `"yz"`
- Face reference: `"face:{featureId}:{selector}"`

### TypeScript Types

```typescript
export interface SketchFeature extends FeatureBase {
  type: 'sketch';
  plane: string;  // Datum ID or face reference
  // points, entities, constraints...
}

// Parsed plane reference
type PlaneReference = 
  | { type: 'datum'; id: 'xy' | 'xz' | 'yz' }
  | { type: 'face'; ref: PersistentRef }
  ;
```

---

## App UI Work

### Plane/Face Selection

```typescript
// packages/app/src/components/PlaneSelector.tsx

interface PlaneSelectorProps {
  onSelect: (plane: string) => void;
  onCancel: () => void;
}

export function PlaneSelector({ onSelect, onCancel }: PlaneSelectorProps) {
  const [selecting, setSelecting] = useState<'datum' | 'face'>('datum');
  
  // Listen for face selection in 3D view
  useEffect(() => {
    if (selecting === 'face') {
      const unsubscribe = onFaceSelected((face) => {
        // Create face reference string
        const planeRef = `face:${face.persistentRef}`;
        onSelect(planeRef);
      });
      return unsubscribe;
    }
  }, [selecting]);
  
  return (
    <div className="plane-selector">
      <div className="plane-selector-header">Select Sketch Plane</div>
      
      <div className="datum-planes">
        <Button onClick={() => onSelect('xy')}>XY Plane (Top)</Button>
        <Button onClick={() => onSelect('xz')}>XZ Plane (Front)</Button>
        <Button onClick={() => onSelect('yz')}>YZ Plane (Right)</Button>
      </div>
      
      <div className="divider">or</div>
      
      <Button 
        onClick={() => setSelecting('face')}
        variant={selecting === 'face' ? 'primary' : 'secondary'}
      >
        {selecting === 'face' ? 'Click a face...' : 'Select Model Face'}
      </Button>
      
      <Button onClick={onCancel} variant="text">Cancel</Button>
    </div>
  );
}
```

### Camera Alignment to Face

```typescript
function alignCameraToFace(face: Face): void {
  // Get face normal and center
  const center = face.getCentroid();
  const normal = face.getNormal();
  
  // Calculate camera position
  const distance = camera.position.distanceTo(targetRef.current);
  camera.position.copy(center).add(normal.clone().multiplyScalar(distance));
  
  // Look at face center
  targetRef.current.copy(center);
  camera.lookAt(center);
  
  // Set up vector (perpendicular to normal, preferring world Y)
  const up = calculateUpVector(normal);
  camera.up.copy(up);
}
```

### Sketch Plane Visualization

```typescript
// Show the sketch plane as semi-transparent quad
function SketchPlaneIndicator({ planeRef }: { planeRef: string }) {
  const plane = usePlane(planeRef);
  
  if (!plane) return null;
  
  return (
    <mesh position={plane.origin} quaternion={planeQuaternion(plane)}>
      <planeGeometry args={[10, 10]} />
      <meshBasicMaterial 
        color={0x4488ff} 
        transparent 
        opacity={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
```

---

## Kernel Work

### Resolving Face to Plane

```typescript
// In kernel.worker.ts

function getSketchPlane(planeRef: string): DatumPlane {
  if (planeRef === 'xy' || planeRef === 'xz' || planeRef === 'yz') {
    return getDatumPlane(planeRef);
  }
  
  if (planeRef.startsWith('face:')) {
    const face = resolveFaceRef(planeRef, session);
    if (!face) throw new Error(`Cannot resolve face plane: ${planeRef}`);
    
    return faceToPlane(face);
  }
  
  throw new Error(`Invalid plane reference: ${planeRef}`);
}

function faceToPlane(face: Face): DatumPlane {
  const surface = face.getSurface();
  
  if (surface.kind !== 'plane') {
    throw new Error('Can only sketch on planar faces');
  }
  
  return {
    origin: surface.origin,
    normal: surface.normal,
    xDir: surface.xDir,
    yDir: cross(surface.normal, surface.xDir),
  };
}
```

### Non-Planar Faces

Initially, only support planar faces:

```typescript
function validateSketchPlane(face: Face): void {
  if (face.getSurface().kind !== 'plane') {
    throw new Error(
      'Sketching on non-planar faces is not supported. ' +
      'Please select a planar face or datum plane.'
    );
  }
}
```

Future enhancement: Project sketch onto curved surfaces.

---

## Face Movement Handling

When the referenced face moves (due to parameter changes):

```typescript
// During rebuild, sketch plane is re-resolved
function processSketch(feature: SketchFeature): void {
  const plane = getSketchPlane(feature.plane);
  
  // Sketch geometry is relative to plane
  // When plane moves, sketch moves with it
  
  const worldPoints = feature.points.map(p => 
    planeToWorld(p.x, p.y, plane)
  );
}
```

This means:
- Sketch stays attached to the face
- If face rotates, sketch rotates with it
- If face is deleted, sketch errors

---

## Testing Plan

### Unit Tests

```typescript
// Test face plane extraction
test('faceToPlane extracts correct plane', () => {
  const session = new SolidSession();
  const body = createBox(session);
  
  const topFace = body.getFaces().find(f => isTopFace(f));
  const plane = faceToPlane(topFace);
  
  expect(plane.normal).toEqual([0, 0, 1]);
  expect(plane.origin[2]).toBeCloseTo(10); // Box height
});

// Test sketch on face
test('sketch on face moves with face', () => {
  // Create box, sketch on top face
  // Change box height
  // Verify sketch moved up
});
```

### Integration Tests

- Click "New Sketch" → Select face → camera aligns
- Draw on face → sketch plane matches face
- Edit underlying feature → sketch moves with face
- Delete face → sketch shows error

---

## Open Questions

1. **Non-planar faces** - Allow sketching on cylinders, spheres?
   - Decision: Not in this phase, requires projection/unwrapping

2. **Face orientation** - Which direction is "up" on the face?
   - Decision: Use face's U direction, can add flip option later

3. **Offset planes** - Sketch on plane offset from face?
   - Decision: Future enhancement, add offset parameter
