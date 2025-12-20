# Phase 09: Sketch Arcs

## Prerequisites

- Phase 08: Dimension Constraints

## Goals

- Add arc drawing tool to sketches
- Add circle drawing tool (as a special case)
- Support arc constraints (tangent, equal radius)
- Enable curved profiles for extrude/revolve

---

## User Workflow

### Drawing an Arc (3-Point)

1. User selects "Arc" tool
2. User clicks start point
3. User clicks end point
4. User moves mouse to define curvature, clicks to confirm
5. Arc is created

### Drawing a Circle

1. User selects "Circle" tool
2. User clicks center point
3. User drags to set radius, clicks to confirm
4. Circle is created (full 360° arc)

---

## Document Model Changes

### Arc Entity

```xml
<entities>
  [
    { "id": "a1", "type": "arc", "start": "p1", "end": "p2", "center": "p3", "ccw": true }
  ]
</entities>
```

### Circle as Special Arc

A circle is represented as an arc with coincident start/end points:

```xml
<entities>
  [
    { "id": "a1", "type": "arc", "start": "p1", "end": "p1", "center": "p2", "ccw": true }
  ]
</entities>
```

### TypeScript Types

```typescript
export interface SketchArc {
  id: string;
  type: 'arc';
  start: string;    // Point ID (on arc)
  end: string;      // Point ID (on arc)
  center: string;   // Point ID (center)
  ccw: boolean;     // Counter-clockwise direction
}
```

---

## App UI Work

### Arc Tool

```typescript
// packages/app/src/components/sketch/ArcTool.tsx

function ArcTool() {
  const [stage, setStage] = useState<'start' | 'end' | 'curve'>('start');
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  
  const handleClick = (pos: Point) => {
    switch (stage) {
      case 'start':
        setStartPoint(pos);
        setStage('end');
        break;
      case 'end':
        setEndPoint(pos);
        setStage('curve');
        break;
      case 'curve':
        // Calculate center from three points
        const center = calculateArcCenter(startPoint, endPoint, pos);
        createArc(startPoint, endPoint, center);
        reset();
        break;
    }
  };
  
  const handleMouseMove = (pos: Point) => {
    if (stage === 'curve') {
      // Preview arc with current mouse position
      previewArc(startPoint, endPoint, pos);
    }
  };
  
  return <SketchInteractionLayer onClick={handleClick} onMouseMove={handleMouseMove} />;
}
```

### Circle Tool

```typescript
function CircleTool() {
  const [center, setCenter] = useState<Point | null>(null);
  
  const handleClick = (pos: Point) => {
    if (!center) {
      setCenter(pos);
    } else {
      const radius = distance(center, pos);
      createCircle(center, radius);
      setCenter(null);
    }
  };
  
  const handleMouseMove = (pos: Point) => {
    if (center) {
      const radius = distance(center, pos);
      previewCircle(center, radius);
    }
  };
  
  return <SketchInteractionLayer onClick={handleClick} onMouseMove={handleMouseMove} />;
}
```

### Arc Rendering

```typescript
function renderArc(arc: SketchArc, points: Map<string, Point>): Path {
  const start = points.get(arc.start);
  const end = points.get(arc.end);
  const center = points.get(arc.center);
  
  const radius = distance(center, start);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  
  // SVG arc path
  const largeArc = shouldUseLargeArc(startAngle, endAngle, arc.ccw);
  const sweep = arc.ccw ? 0 : 1;
  
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}
```

### Toolbar Updates

```typescript
<ToolbarGroup label="Draw">
  <ToolbarButton icon="line" label="Line" ... />
  <ToolbarButton icon="arc" label="Arc" onClick={() => setTool('arc')} />
  <ToolbarButton icon="circle" label="Circle" onClick={() => setTool('circle')} />
</ToolbarGroup>
```

---

## Kernel Work

### Arc Entity Support

The kernel already has `SketchArc` support. Verify:

```typescript
// In SketchModel
addArc(startId: SketchPointId, endId: SketchPointId, centerId: SketchPointId, ccw = true): SketchEntityId {
  // Validate points
  // Store arc entity
  // Return entity ID
}
```

### Arc Constraints

Add tangent constraint for arcs:

```typescript
// Arc tangent to line at endpoint
sketch.addConstraint(tangent(arcId, lineId));
```

### Profile with Arcs

The `toProfile()` method needs to handle arcs:

```typescript
// In SketchModel.toProfile()
for (const entity of this.entities) {
  if (entity.type === 'line') {
    curves.push(createLine2D(startPos, endPos));
  } else if (entity.type === 'arc') {
    curves.push(createArc2D(startPos, endPos, centerPos, entity.ccw));
  }
}
```

---

## Arc Geometry Utilities

### Calculate Arc Center from 3 Points

```typescript
function calculateArcCenter(p1: Point, p2: Point, p3: Point): Point {
  // p3 is a point on the arc between p1 and p2
  // Find the circumcenter of the triangle p1-p2-p3
  
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;
  
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  
  const ux = ((ax * ax + ay * ay) * (by - cy) + 
              (bx * bx + by * by) * (cy - ay) + 
              (cx * cx + cy * cy) * (ay - by)) / d;
  
  const uy = ((ax * ax + ay * ay) * (cx - bx) + 
              (bx * bx + by * by) * (ax - cx) + 
              (cx * cx + cy * cy) * (bx - ax)) / d;
  
  return { x: ux, y: uy };
}
```

### Determine Arc Direction

```typescript
function isCounterClockwise(start: Point, end: Point, thirdPoint: Point): boolean {
  // Use cross product to determine winding
  const v1 = { x: end.x - start.x, y: end.y - start.y };
  const v2 = { x: thirdPoint.x - start.x, y: thirdPoint.y - start.y };
  return (v1.x * v2.y - v1.y * v2.x) > 0;
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test arc creation
test('addArc creates arc entity', () => {
  const sketch = new SketchModel();
  const p1 = sketch.addPoint(0, 0);
  const p2 = sketch.addPoint(10, 0);
  const center = sketch.addPoint(5, 0);
  
  const arcId = sketch.addArc(p1, p2, center, true);
  expect(arcId).toBeDefined();
});

// Test profile with arc
test('toProfile includes arcs', () => {
  const sketch = createSketchWithArc();
  const profile = sketch.toProfile();
  
  expect(profile).not.toBeNull();
  expect(profile.curves.some(c => c.kind === 'arc')).toBe(true);
});
```

### Integration Tests

- Select Arc tool → click 3 points → arc appears
- Select Circle tool → click center and radius → circle appears
- Create closed profile with arc → can extrude

---

## Open Questions

1. **Arc input methods** - 3-point vs center-start-end?
   - Decision: Start with 3-point (more intuitive), add center-radius later

2. **Tangent continuation** - Auto-tangent when continuing from line/arc?
   - Decision: Not in this phase, manual tangent constraints

3. **Ellipse** - Support elliptical arcs?
   - Decision: Future work, not in this phase
