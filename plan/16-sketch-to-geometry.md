# Phase 16: Sketch to Geometry Constraints

**Status: ⚠️ PARTIALLY IMPLEMENTED**

## Prerequisites

- Phase 15: Sketch on Face
- Phase 08: Dimension Constraints

## Implementation Notes

### What's Done:
- `document.ts` - SketchPoint now has `attachedTo`, `param`, and `attachmentBroken` fields
- `kernel.worker.ts` - `resolveAttachment()` function to resolve edge/vertex references to world coordinates
- `kernel.worker.ts` - `projectToSketchPlane()` function for projecting world points to sketch 2D
- `kernel.worker.ts` - `interpretSketch()` updated to resolve attachments when adding points
- Attachment formats: `edge:featureId:edgeIndex` and `vertex:featureId:vertexIndex`
- Attached points are automatically treated as fixed constraints

### What's NOT Done:
- Snap detection UI during point dragging
- Visual feedback for snap targets (edge/vertex indicators)
- Context menu for "Attach to Edge" / "Detach"
- Broken attachment visual indicator

### Future Work:
1. Add snap detection when dragging points near edges/vertices
2. Visual overlay showing available snap targets
3. Context menu actions for manual attachment
4. Broken attachment warning in properties panel

## Goals

- Constrain sketch points to existing model edges
- Constrain sketch points to existing vertices
- External references update when model changes
- Enable fully parametric sketch relationships

---

## User Workflow

### Point on Edge

1. User is editing a sketch
2. User draws a line
3. User selects an endpoint
4. User clicks "Attach to Edge" or drags point onto edge
5. Point snaps to edge and stays there
6. If edge moves, point follows

### Point at Vertex

1. User drags a sketch point near a model vertex
2. Point snaps to vertex (coincident)
3. Point is now locked to that vertex position

---

## Document Model Changes

### Attached Points

```xml
<sketch id="s2" plane="face:e1:top">
  <points>
    [
      { "id": "p1", "x": 0, "y": 0 },
      { "id": "p2", "x": 10, "y": 0, "attachedTo": "edge:e1:side:0", "param": 0.5 },
      { "id": "p3", "x": 10, "y": 10, "attachedTo": "vertex:e1:corner:2" }
    ]
  </points>
</sketch>
```

### Attachment Types

```typescript
interface SketchPoint {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
  
  // External attachment
  attachedTo?: string;  // Edge or vertex reference
  param?: number;       // Parameter on edge (0-1)
}

// Attachment reference format
type AttachmentRef = 
  | `edge:${featureId}:${selector}`   // Point on edge
  | `vertex:${featureId}:${selector}` // Point at vertex
  ;
```

---

## App UI Work

### Snap Detection

```typescript
// When dragging point, check for snap targets
function checkSnapTargets(
  screenPos: { x: number; y: number },
  sketchPlane: DatumPlane
): SnapTarget | null {
  // Raycast to find nearby edges/vertices
  const hits = raycastForSnap(screenPos);
  
  for (const hit of hits) {
    // Check if close to an edge
    if (hit.type === 'edge' && hit.distance < SNAP_THRESHOLD) {
      return {
        type: 'edge',
        ref: hit.edgeRef,
        param: hit.param,
        position: hit.position,
      };
    }
    
    // Check if close to a vertex
    if (hit.type === 'vertex' && hit.distance < SNAP_THRESHOLD) {
      return {
        type: 'vertex',
        ref: hit.vertexRef,
        position: hit.position,
      };
    }
  }
  
  return null;
}
```

### Visual Feedback

```typescript
// Show snap indicator when near edge/vertex
function SnapIndicator({ snapTarget }: { snapTarget: SnapTarget | null }) {
  if (!snapTarget) return null;
  
  return (
    <div 
      className="snap-indicator"
      style={{ 
        left: snapTarget.screenX, 
        top: snapTarget.screenY 
      }}
    >
      {snapTarget.type === 'edge' ? (
        <EdgeSnapIcon />
      ) : (
        <VertexSnapIcon />
      )}
    </div>
  );
}
```

### Attachment UI

```typescript
// Context menu for point
<ContextMenu>
  <MenuItem onClick={() => startAttachToEdge(pointId)}>
    <Icon name="attach-edge" />
    Attach to Edge
  </MenuItem>
  <MenuItem onClick={() => detachPoint(pointId)}>
    <Icon name="detach" />
    Detach
  </MenuItem>
</ContextMenu>

// Manual attachment mode
function AttachToEdgeMode({ pointId }) {
  const handleEdgeClick = (edgeRef: string, param: number) => {
    attachPointToEdge(pointId, edgeRef, param);
    exitAttachMode();
  };
  
  return <EdgeSelectionOverlay onSelect={handleEdgeClick} />;
}
```

---

## Kernel Work

### Resolving Attachments

```typescript
// In kernel.worker.ts

function resolveAttachment(
  attachment: AttachmentRef,
  session: SolidSession
): { x: number; y: number } {
  
  if (attachment.startsWith('edge:')) {
    const edge = resolveEdgeRef(attachment.ref, session);
    if (!edge) throw new Error(`Cannot resolve edge: ${attachment.ref}`);
    
    // Get point on edge at parameter
    const worldPos = edge.pointAt(attachment.param ?? 0.5);
    
    // Project to sketch plane
    return projectToSketchPlane(worldPos, sketchPlane);
  }
  
  if (attachment.startsWith('vertex:')) {
    const vertex = resolveVertexRef(attachment.ref, session);
    if (!vertex) throw new Error(`Cannot resolve vertex: ${attachment.ref}`);
    
    // Project to sketch plane
    return projectToSketchPlane(vertex.position, sketchPlane);
  }
  
  throw new Error(`Invalid attachment: ${attachment}`);
}
```

### Constraint Integration

External attachments work like fixed constraints:

```typescript
function buildSketchConstraints(sketch: SketchData): Constraint[] {
  const constraints: Constraint[] = [];
  
  for (const point of sketch.points) {
    if (point.attachedTo) {
      // Resolve attachment to get target position
      const targetPos = resolveAttachment(point.attachedTo);
      
      // Add as fixed constraint at resolved position
      constraints.push({
        type: 'fixed',
        point: point.id,
        x: targetPos.x,
        y: targetPos.y,
      });
    }
  }
  
  // Add other constraints
  constraints.push(...sketch.constraints);
  
  return constraints;
}
```

### Sliding on Edge

For "point on edge" (not fixed position), allow the point to slide:

```typescript
// Point can be anywhere on edge, solver finds optimal position
constraints.push({
  type: 'pointOnCurve',
  point: point.id,
  curve: edgeToCurve(edge),
});
```

This requires the solver to support curve constraints.

---

## Error Handling

### Missing Reference

If the referenced edge/vertex no longer exists:

```typescript
function handleMissingAttachment(point: SketchPoint): void {
  console.warn(`Attachment ${point.attachedTo} not found`);
  
  // Options:
  // 1. Keep point at last known position (current x, y)
  // 2. Mark sketch as having errors
  // 3. Prompt user to re-attach
  
  // For now: keep position, mark as broken
  point.attachmentBroken = true;
}
```

### Visual Indication

```typescript
// Show broken attachment indicator
{point.attachmentBroken && (
  <BrokenAttachmentIcon position={point} />
)}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test attachment resolution
test('resolveAttachment returns correct position', () => {
  const session = new SolidSession();
  createBox(session);
  
  // Get an edge
  const edge = getEdge(session, 'e1:side:0');
  const edgeRef = createEdgeRef(edge);
  
  // Resolve at parameter 0.5
  const pos = resolveAttachment(`edge:${edgeRef}`, { param: 0.5 });
  
  // Should be at midpoint of edge
  expect(pos.x).toBeCloseTo(5);
});

// Test attachment update
test('attached point moves with edge', () => {
  // Create box, attach point to edge
  // Change box size
  // Verify point moved
});
```

### Integration Tests

- Drag point near edge → snap indicator appears
- Release → point attaches
- Edit underlying feature → point moves with edge
- Delete edge → broken attachment shown

---

## Open Questions

1. **Slide vs fixed** - Should attached points be fixed or slide on edge?
   - Decision: Start with fixed (at parameter), add sliding later

2. **Projection** - What if edge doesn't lie in sketch plane?
   - Decision: Project edge point onto sketch plane

3. **Multiple attachments** - Can one point have multiple attachments?
   - Decision: No, one attachment per point
