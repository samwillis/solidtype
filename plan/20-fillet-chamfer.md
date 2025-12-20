# Phase 20: Fillet and Chamfer

## Prerequisites

- Phase 19: Advanced Constraints
- Phase 11: 3D Selection

## Goals

- Add fillet (rounded edge) operation
- Add chamfer (beveled edge) operation
- Select edges to apply treatment
- Support variable radius (future)

---

## User Workflow

### Fillet

1. User clicks "Fillet" tool
2. User selects one or more edges
3. Fillet dialog appears with radius input
4. Preview shows rounded edges
5. User confirms

### Chamfer

1. User clicks "Chamfer" tool
2. User selects edges
3. Chamfer dialog shows:
   - Distance (single value) OR
   - Two distances (asymmetric)
4. Preview shows beveled edges
5. User confirms

---

## Document Model Changes

### Fillet Feature

```xml
<fillet 
  id="f1" 
  name="Fillet1"
  edges="edge:e1:side:0,edge:e1:side:1,edge:e1:side:2"
  radius="2"
/>
```

### Chamfer Feature

```xml
<chamfer 
  id="c1" 
  name="Chamfer1"
  edges="edge:e1:top:0"
  distance1="1"
  distance2="1"
/>
```

### TypeScript Types

```typescript
export interface FilletFeature extends FeatureBase {
  type: 'fillet';
  edges: string[];  // Array of edge persistent refs
  radius: number;
}

export interface ChamferFeature extends FeatureBase {
  type: 'chamfer';
  edges: string[];
  distance1: number;
  distance2?: number;  // If asymmetric
}
```

---

## App UI Work

### Fillet Dialog

```typescript
export function FilletDialog({ onConfirm, onCancel }) {
  const [edges, setEdges] = useState<string[]>([]);
  const [radius, setRadius] = useState(1);
  const [selecting, setSelecting] = useState(true);
  
  useEffect(() => {
    if (selecting) {
      const unsubscribe = onEdgeSelected((edgeRef) => {
        setEdges(prev => [...prev, edgeRef]);
      });
      return unsubscribe;
    }
  }, [selecting]);
  
  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Fillet</DialogTitle>
      <DialogContent>
        <div className="selected-edges">
          <h4>Selected Edges ({edges.length})</h4>
          {edges.map((edge, i) => (
            <div key={i} className="edge-item">
              {formatEdgeRef(edge)}
              <IconButton onClick={() => removeEdge(i)}>
                <Icon name="remove" />
              </IconButton>
            </div>
          ))}
          <Button onClick={() => setSelecting(true)}>
            {selecting ? 'Click edges to select...' : 'Add More Edges'}
          </Button>
        </div>
        
        <NumberInput
          label="Radius"
          value={radius}
          onChange={setRadius}
          min={0.1}
          unit="mm"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button 
          onClick={() => onConfirm(edges, radius)}
          variant="primary"
          disabled={edges.length === 0}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Edge Selection Mode

```typescript
// Highlight edges on hover, allow multi-select
function EdgeSelectionMode({ onSelect, selectedEdges }) {
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  
  return (
    <>
      {/* Highlight hovered edge */}
      {hoveredEdge && (
        <EdgeHighlight edgeRef={hoveredEdge} color={0x00ff00} />
      )}
      
      {/* Highlight selected edges */}
      {selectedEdges.map(edge => (
        <EdgeHighlight key={edge} edgeRef={edge} color={0x0088ff} />
      ))}
    </>
  );
}
```

---

## Kernel Work

### Fillet Operation

```typescript
// In model/fillet.ts

export interface FilletOptions {
  edges: Edge[];
  radius: number;
}

export function fillet(body: Body, options: FilletOptions): FilletResult {
  const { edges, radius } = options;
  
  for (const edge of edges) {
    // For each edge, create fillet geometry
    const filletFaces = createFilletFaces(edge, radius);
    
    // Replace adjacent faces with trimmed versions
    const face1 = edge.getFace1();
    const face2 = edge.getFace2();
    
    const trimmedFace1 = trimFaceForFillet(face1, edge, radius);
    const trimmedFace2 = trimFaceForFillet(face2, edge, radius);
    
    // Update body topology
    body.replaceFace(face1.id, trimmedFace1);
    body.replaceFace(face2.id, trimmedFace2);
    body.addFaces(filletFaces);
  }
  
  return { ok: true, body };
}

function createFilletFaces(edge: Edge, radius: number): Face[] {
  // Fillet surface is a rolling ball of given radius
  // Surface type depends on adjacent face types:
  // - Plane + Plane → Cylindrical fillet
  // - Plane + Cylinder → Torus or blend surface
  // - Cylinder + Cylinder → Complex blend
  
  const face1Surface = edge.getFace1().getSurface();
  const face2Surface = edge.getFace2().getSurface();
  
  if (face1Surface.kind === 'plane' && face2Surface.kind === 'plane') {
    return createPlanePlaneFillet(edge, radius);
  }
  
  // More complex cases...
  throw new Error('Fillet between these surface types not yet supported');
}
```

### Chamfer Operation

```typescript
// In model/chamfer.ts

export interface ChamferOptions {
  edges: Edge[];
  distance1: number;
  distance2?: number;
}

export function chamfer(body: Body, options: ChamferOptions): ChamferResult {
  const { edges, distance1, distance2 = distance1 } = options;
  
  for (const edge of edges) {
    // Chamfer creates a planar face connecting offset curves
    const chamferFace = createChamferFace(edge, distance1, distance2);
    
    // Trim adjacent faces
    // Update topology
  }
  
  return { ok: true, body };
}
```

### Edge Chain Selection

For multiple connected edges:

```typescript
function getConnectedEdges(startEdge: Edge, body: Body): Edge[] {
  // Find edges that share vertices with startEdge
  // Allow user to select entire edge chain with one click
}
```

---

## Fillet Geometry

### Plane-Plane Fillet

When two planar faces meet:
- Fillet is a cylindrical surface
- Axis is parallel to the edge
- Radius is the fillet radius

```typescript
function createPlanePlaneFillet(edge: Edge, radius: number): Face[] {
  const plane1 = edge.getFace1().getSurface() as PlaneSurface;
  const plane2 = edge.getFace2().getSurface() as PlaneSurface;
  
  // Calculate fillet center line (offset from both planes by radius)
  const normal1 = plane1.normal;
  const normal2 = plane2.normal;
  const edgeDir = edge.getDirection();
  
  // Fillet center is offset from edge by radius in bisector direction
  const bisector = normalize(add(normal1, normal2));
  const offset = radius / Math.sin(angleBetween(normal1, normal2) / 2);
  
  // Create cylindrical surface
  const cylinder: CylinderSurface = {
    kind: 'cylinder',
    origin: add(edge.getMidpoint(), scale(bisector, offset)),
    axis: edgeDir,
    radius: radius,
  };
  
  // Trim to correct arc angle
  // Create face with proper bounds
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test fillet creation
test('fillet creates cylindrical face', () => {
  const session = new SolidSession();
  const body = createBox(session, 10, 10, 10);
  
  // Get an edge
  const edge = body.getEdges()[0];
  
  const result = fillet(body, { edges: [edge], radius: 1 });
  
  expect(result.ok).toBe(true);
  
  // Should have cylindrical fillet face
  const cylinderFaces = result.body.getFaces()
    .filter(f => f.getSurface().kind === 'cylinder');
  expect(cylinderFaces.length).toBeGreaterThan(0);
});
```

### Integration Tests

- Click Fillet → select edge → preview shows
- Adjust radius → preview updates
- Confirm → model updates
- Undo → fillet removed

---

## Open Questions

1. **Variable radius** - Support varying radius along edge?
   - Decision: Future enhancement, constant radius for now

2. **Fillet propagation** - Auto-select connected edges?
   - Decision: Yes, with "Select Chain" option

3. **Fillet failure** - What if radius is too large?
   - Decision: Error with message "Radius too large for edge"
