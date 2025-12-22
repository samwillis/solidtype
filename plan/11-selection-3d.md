# Phase 11: 3D Selection

**Status: ✅ IMPLEMENTED**

## Prerequisites

- Phase 10: Curves in Features (complete modeling workflow)

## Implementation Notes

The following components have been implemented:
- `SelectionContext.tsx` - Full face/edge selection with:
  - `SelectedFace` and `SelectedEdge` types with persistent references
  - `selectFace()` and `selectEdge()` with multi-select support
  - `HoverState` for 3D highlighting
  - `SelectionMode` for operation-specific selection (e.g., `selectFace` mode)
  - Callbacks for selection completion (`onFaceSelected`)
- `useRaycast.ts` hook - Raycasting implementation with:
  - NDC coordinate conversion
  - Mesh intersection via Three.js Raycaster
  - `getFaceId()` using faceMap for triangle→face mapping
- `Viewer.tsx` - Click/hover handlers (lines ~1340-1395):
  - Click to select face with raycast
  - Ctrl/Cmd+click for multi-select
  - Mouse move for hover highlighting
  - Click empty space to clear selection
- Face selection highlights rendered in 3D view
- Selected feature syncs with feature tree and properties panel

## Goals

- Click on faces and edges in 3D viewer to select them
- Highlight hovered/selected geometry
- Return persistent references for selected entities
- Foundation for geometry-referencing features

---

## User Workflow

### Selecting a Face

1. User hovers over a face → face highlights
2. User clicks → face is selected
3. Selected face shown in different color
4. Properties panel shows face info

### Selecting an Edge

1. User hovers near an edge → edge highlights
2. User clicks → edge is selected
3. Edge shown highlighted
4. Can be used for fillet, chamfer, etc.

### Multi-Selection

1. Hold Shift and click to add to selection
2. Hold Ctrl/Cmd and click to toggle selection
3. Click empty space to clear selection

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     3D Viewer                               │
│  ┌───────────────┐     ┌──────────────────────────────────┐ │
│  │  Raycaster    │────▶│  Hit Test                        │ │
│  │  (Three.js)   │     │  - Find intersected mesh         │ │
│  └───────────────┘     │  - Find face index               │ │
│                        │  - Map to kernel face/edge       │ │
│                        └──────────────┬───────────────────┘ │
└───────────────────────────────────────│─────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Selection State                           │
│  {                                                          │
│    faces: [{ bodyId, faceId, persistentRef }],             │
│    edges: [{ bodyId, edgeId, persistentRef }],             │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Raycasting

```typescript
// packages/app/src/hooks/useRaycast.ts

export function useRaycast(
  camera: THREE.Camera,
  scene: THREE.Scene
) {
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  
  const raycast = useCallback((screenX: number, screenY: number) => {
    // Convert to normalized device coordinates
    const ndc = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );
    
    raycaster.setFromCamera(ndc, camera);
    
    // Get all body meshes
    const meshes = scene.children.filter(c => c.userData.bodyId);
    const intersects = raycaster.intersectObjects(meshes);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        bodyId: hit.object.userData.bodyId,
        faceIndex: hit.faceIndex,
        point: hit.point,
        normal: hit.face?.normal,
      };
    }
    
    return null;
  }, [camera, scene]);
  
  return raycast;
}
```

### Face Index to Face ID

The mesh stores a mapping from triangle indices to face IDs:

```typescript
// When creating mesh in worker
interface MeshWithMapping {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  faceMap: Uint32Array;  // Triangle index → Face ID
}

// In tessellateBody
function tessellateBody(body: Body): MeshWithMapping {
  const faceMap: number[] = [];
  
  for (const face of body.getFaces()) {
    const faceTriangles = tessellateFace(face);
    const triangleCount = faceTriangles.indices.length / 3;
    
    // Map each triangle to this face
    for (let i = 0; i < triangleCount; i++) {
      faceMap.push(face.id);
    }
    
    // Append triangles to main mesh
    // ...
  }
  
  return { ..., faceMap: new Uint32Array(faceMap) };
}
```

### Selection Context

```typescript
// packages/app/src/contexts/SelectionContext.tsx

interface Selection {
  faces: SelectedFace[];
  edges: SelectedEdge[];
}

interface SelectedFace {
  bodyId: string;
  faceId: number;
  persistentRef: PersistentRef;
}

interface SelectedEdge {
  bodyId: string;
  edgeId: number;
  persistentRef: PersistentRef;
}

export function SelectionProvider({ children }) {
  const [selection, setSelection] = useState<Selection>({ faces: [], edges: [] });
  const [hover, setHover] = useState<{ type: 'face' | 'edge'; id: any } | null>(null);
  
  const selectFace = (bodyId: string, faceId: number, persistentRef: PersistentRef, multi: boolean) => {
    setSelection(prev => {
      if (multi) {
        // Add to selection
        return { ...prev, faces: [...prev.faces, { bodyId, faceId, persistentRef }] };
      } else {
        // Replace selection
        return { faces: [{ bodyId, faceId, persistentRef }], edges: [] };
      }
    });
  };
  
  const clearSelection = () => {
    setSelection({ faces: [], edges: [] });
  };
  
  return (
    <SelectionContext.Provider value={{ selection, hover, selectFace, clearSelection, setHover }}>
      {children}
    </SelectionContext.Provider>
  );
}
```

### Highlight Rendering

```typescript
// packages/app/src/components/SelectionHighlight.tsx

export function SelectionHighlight({ meshes, selection, hover }) {
  // Create highlight geometry for selected faces
  
  return (
    <>
      {/* Hover highlight - lighter */}
      {hover && (
        <mesh>
          <bufferGeometry attach="geometry">
            {/* Geometry of hovered face */}
          </bufferGeometry>
          <meshBasicMaterial 
            color={0x00ff00} 
            transparent 
            opacity={0.2} 
            depthTest={false}
          />
        </mesh>
      )}
      
      {/* Selection highlight - stronger */}
      {selection.faces.map(face => (
        <mesh key={`${face.bodyId}-${face.faceId}`}>
          {/* Geometry of selected face */}
          <meshBasicMaterial 
            color={0x0088ff} 
            transparent 
            opacity={0.4}
            depthTest={false}
          />
        </mesh>
      ))}
    </>
  );
}
```

### Edge Selection

Edge selection requires finding edges near the click point:

```typescript
function findNearestEdge(hit: RaycastHit, body: Body): EdgeId | null {
  // Get the hit face
  const face = body.getFace(hit.faceId);
  
  // Get edges of this face
  const edges = face.getEdges();
  
  // Find edge closest to hit point
  let nearestEdge: EdgeId | null = null;
  let nearestDistance = Infinity;
  
  for (const edge of edges) {
    const distance = distanceToEdge(hit.point, edge);
    if (distance < nearestDistance && distance < EDGE_SELECTION_THRESHOLD) {
      nearestDistance = distance;
      nearestEdge = edge.id;
    }
  }
  
  return nearestEdge;
}
```

---

## Persistent References

When selecting a face/edge, get its persistent reference:

```typescript
// In kernel worker
function getPersistentRef(bodyId: string, faceId: number): PersistentRef {
  const body = bodyMap.get(bodyId);
  const face = body.getFace(faceId);
  
  // Get persistent ref from naming system
  return session.namingStrategy.getRef(face);
}
```

This persistent reference can be stored in feature attributes for later use (extrude to face, sketch on face, etc.).

---

## Kernel Work

### Face/Edge ID Stability

Ensure face and edge IDs are stable during a session:

```typescript
// In TopoModel or Body
getFace(id: FaceId): Face | null;
getEdge(id: EdgeId): Edge | null;
```

### Persistent Reference Generation

```typescript
// In naming module
function getRefForFace(face: Face): PersistentRef {
  return {
    originFeatureId: face.originFeature,
    localSelector: face.localSelector,
    fingerprint: computeFaceFingerprint(face),
  };
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test face selection
test('raycast returns face ID', () => {
  const mesh = createBoxMesh();
  const hit = raycast(mesh, cameraLookingAtFront);
  
  expect(hit).not.toBeNull();
  expect(hit.faceIndex).toBeDefined();
});

// Test face mapping
test('faceMap maps triangles to faces', () => {
  const body = createBox();
  const mesh = tessellateBody(body);
  
  // All triangles should map to one of 6 faces
  for (const faceId of mesh.faceMap) {
    expect(faceId).toBeGreaterThanOrEqual(0);
    expect(faceId).toBeLessThan(6);
  }
});
```

### Integration Tests

- Hover over face → highlight appears
- Click face → selection state updates
- Click different face → selection changes
- Shift+click → multi-select
- Click empty → selection clears

---

## Persistent Naming Checklist

> See [appendix/naming-strategy.md](appendix/naming-strategy.md) for full strategy.

Selection is where persistent naming becomes critical. Before completing:

- [ ] **Selection returns PersistentRef**: Every selection includes a persistent reference, not just ephemeral IDs
- [ ] **References stored correctly**: When selection is used (e.g., stored in feature), it stores the persistent ref string
- [ ] **Fingerprints computed**: Each selected face/edge has fingerprint for disambiguation
- [ ] **Test ref survival**: Selected face ref resolves after parameter change

```typescript
// Example verification test
test('selected face has valid persistent ref', () => {
  const selection = selectFace(bodyMesh, hitPoint);
  
  expect(selection.persistentRef).toBeDefined();
  expect(selection.persistentRef.originFeatureId).toBe('e1');
  expect(selection.persistentRef.localSelector).toBe('top');
});

test('persistent ref resolves after rebuild', () => {
  // Select a face
  const selection = selectFace(bodyMesh, hitPoint);
  const ref = selection.persistentRef;
  
  // Change extrude distance (triggers rebuild)
  doc.features.get('e1').setAttribute('distance', '20');
  await waitForRebuild();
  
  // Ref should still resolve
  const resolved = resolveFaceRef(ref, session);
  expect(resolved).not.toBeNull();
});
```

---

## Open Questions

1. **Edge selection precision** - How close to edge to select it?
   - Decision: 5 pixels or 0.5mm in model space, whichever is larger

2. **Vertex selection** - Should we support vertex selection?
   - Decision: Not in this phase, add later if needed

3. **Box selection** - Drag to select multiple?
   - Decision: Future enhancement, not in this phase
