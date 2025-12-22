# Phase 08: Dimension Constraints

**Status: ✅ IMPLEMENTED (Enhanced)**

## Prerequisites

- Phase 07: Basic Constraints

## Implementation Notes

### What's Done:
- Distance constraints (2 points or 1 line) with visual annotations
- Angle constraints (2 lines) with visual annotations
- **Visual dimension annotations** on sketch in 3D view (SolidWorks-style):
  - Distance: Green extension lines + dimension line with value label
  - Angle: Orange arc label with angle value
- **Double-click inline editing**: Click dimension label → popup input → Enter to accept
- **Drag-to-reposition**: Drag dimension labels to organize/stack them
  - Position offset stored per constraint (`offsetX`, `offsetY`)
  - Real-time visual feedback during drag
  - Position persisted to Yjs document
- Dimensions also editable in side panel overlay
- Delete button on each dimension in panel

### Visual Style:
- Distance dimensions: Green (`#00aa00`) with extension lines
- Angle dimensions: Orange (`#aa5500`) arc indicator
- Labels are CSS2DObjects (always face camera)
- Cursor changes to `move` on dimension labels
- Popup editor centered on screen with overlay

## Goals

- Add distance and angle dimension constraints
- Display dimensions with values in sketch
- Allow editing dimension values directly
- Show dimension driven vs driving status

---

## User Workflow

### Adding Distance Dimension

1. User selects two points (or one line)
2. User clicks "Distance" tool
3. Dimension appears with current distance value
4. User can:
   - Accept current value (reference dimension)
   - Enter new value (driving dimension, sketch updates)

### Adding Angle Dimension

1. User selects two lines
2. User clicks "Angle" tool
3. Angle dimension appears
4. User can edit the angle value

### Editing Dimensions

1. Double-click on dimension value
2. Input field appears
3. User enters new value
4. Sketch updates to satisfy new dimension

---

## Document Model Changes

### Dimension Constraints

```xml
<sketch
  id="s1"
  plane="xy"
  points='[ ... ]'
  entities='[ ... ]'
  constraints='[
    { "id": "d1", "type": "distance", "points": ["p1", "p2"], "value": 25 },
    { "id": "d2", "type": "angle", "lines": ["l1", "l2"], "value": 45 }
  ]'
/>
```

### TypeScript Types

```typescript
// packages/app/src/types/document.ts (SketchConstraint union)
export interface DistanceConstraint {
  id: string;
  type: 'distance';
  points: [string, string];
  value: number;         // Distance in model units
}

export interface AngleConstraint {
  id: string;
  type: 'angle';
  lines: [string, string];
  value: number;         // Angle in degrees
}

export type DimensionConstraint = DistanceConstraint | AngleConstraint;
```

---

## App UI Work

### Dimension Display

```typescript
// packages/app/src/components/sketch/DimensionDisplay.tsx

interface DimensionDisplayProps {
  constraint: DimensionConstraint;
  points: SketchPoint[];
  entities: SketchEntity[];
  onEdit: (id: string, value: number) => void;
}

export function DimensionDisplay({ constraint, points, entities, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(constraint.value));
  
  const position = calculateDimensionPosition(constraint, points, entities);
  
  const handleSubmit = () => {
    const value = parseFloat(inputValue);
    if (!isNaN(value) && value > 0) {
      onEdit(constraint.id, value);
    }
    setEditing(false);
  };
  
  return (
    <g transform={`translate(${position.x}, ${position.y})`}>
      {/* Dimension lines and arrows */}
      <DimensionLines constraint={constraint} points={points} />
      
      {/* Value display/input */}
      {editing ? (
        <foreignObject width="60" height="24" x="-30" y="-12">
          <input
            type="number"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
            className="dimension-input"
          />
        </foreignObject>
      ) : (
        <text
          className="dimension-text"
          textAnchor="middle"
          dominantBaseline="middle"
          onDoubleClick={() => setEditing(true)}
        >
          {constraint.value.toFixed(2)}
        </text>
      )}
    </g>
  );
}
```

### Distance Dimension Lines

```typescript
function DistanceDimensionLines({ p1, p2, offset = 10 }) {
  // Calculate extension lines and dimension line
  const direction = normalize({ x: p2.x - p1.x, y: p2.y - p1.y });
  const perpendicular = { x: -direction.y, y: direction.x };
  
  // Extension lines
  const ext1Start = p1;
  const ext1End = { 
    x: p1.x + perpendicular.x * offset, 
    y: p1.y + perpendicular.y * offset 
  };
  const ext2Start = p2;
  const ext2End = { 
    x: p2.x + perpendicular.x * offset, 
    y: p2.y + perpendicular.y * offset 
  };
  
  return (
    <>
      {/* Extension lines */}
      <line x1={ext1Start.x} y1={ext1Start.y} x2={ext1End.x} y2={ext1End.y} />
      <line x1={ext2Start.x} y1={ext2Start.y} x2={ext2End.x} y2={ext2End.y} />
      
      {/* Dimension line with arrows */}
      <line x1={ext1End.x} y1={ext1End.y} x2={ext2End.x} y2={ext2End.y} />
      <Arrow at={ext1End} direction={direction} />
      <Arrow at={ext2End} direction={negate(direction)} />
    </>
  );
}
```

### Angle Dimension Arc

```typescript
function AngleDimensionArc({ line1, line2, radius = 20 }) {
  // Find intersection point of two lines
  const intersection = lineIntersection(line1, line2);
  
  // Calculate start and end angles
  const angle1 = Math.atan2(line1.dy, line1.dx);
  const angle2 = Math.atan2(line2.dy, line2.dx);
  
  return (
    <path d={describeArc(intersection, radius, angle1, angle2)} />
  );
}
```

### Dimension Toolbar

```typescript
<ToolbarGroup label="Dimensions">
  <ToolbarButton
    icon="distance"
    label="Distance"
    onClick={() => setDimensionMode('distance')}
    disabled={!canAddDistance(selection)}
  />
  <ToolbarButton
    icon="angle"
    label="Angle"
    onClick={() => setDimensionMode('angle')}
    disabled={!canAddAngle(selection)}
  />
</ToolbarGroup>
```

---

## Kernel Work

### Distance Constraint

Already implemented in kernel as `distance()`:

```typescript
import { distance } from '@solidtype/core';

// Add distance constraint
sketch.addConstraint(distance(p1, p2, 25)); // 25 units
```

### Angle Constraint

Already implemented as `angle()`:

```typescript
import { angle } from '@solidtype/core';

// Add angle between two lines
sketch.addConstraint(angle(
  [p1, p2],  // First line points
  [p3, p4],  // Second line points
  45         // Degrees
));
```

### Updating Constraint Values

When user edits a dimension:

```typescript
// In main thread
function updateDimensionValue(sketchId: string, constraintId: string, value: number) {
  const sketch = findSketchFeature(doc, sketchId);
  const constraints = getConstraints(sketch);
  
  const constraint = constraints.find(c => c.id === constraintId);
  if (constraint) {
    constraint.value = value;
    setConstraints(sketch, constraints);
    // This triggers rebuild, solver runs with new value
  }
}
```

---

## Visual Design

### Dimension Colors

| State | Color | Meaning |
|-------|-------|---------|
| Satisfied | Black/Dark | Constraint is met |
| Editing | Blue | User is editing this dimension |
| Error | Red | Value cannot be achieved |
| Reference | Gray | Not driving (just measuring) |

### Dimension Placement

- Distance: Perpendicular to the measured segment
- Angle: Arc between the two lines
- Draggable to reposition (position stored in constraint data)

---

## Testing Plan

### Unit Tests

```typescript
// Test distance constraint
test('distance constraint sets point distance', () => {
  const sketch = new SketchModel();
  const p1 = sketch.addPoint(0, 0, { fixed: true });
  const p2 = sketch.addPoint(10, 0);
  
  sketch.addConstraint(distance(p1, p2, 25));
  const result = solveSketch(sketch);
  
  expect(result.status).toBe('solved');
  const finalDist = Math.hypot(
    sketch.getPoint(p2).x - sketch.getPoint(p1).x,
    sketch.getPoint(p2).y - sketch.getPoint(p1).y
  );
  expect(finalDist).toBeCloseTo(25);
});

// Test angle constraint
test('angle constraint sets line angle', () => {
  // Similar test for angle between lines
});
```

### Integration Tests

- Add distance dimension → value displays correctly
- Double-click value → input appears
- Edit value → sketch updates
- Add conflicting dimension → error shown

---

## Open Questions

1. **Dimension placement** - Should position be stored?
   - Decision: Yes, store offset in constraint data for consistent display

2. **Reference dimensions** - Read-only dimensions that just show current value?
   - Decision: Not in this phase, all dimensions are driving

3. **Units** - Show units (mm, in)?
   - Decision: Show units, default to mm, unit system is document-level setting
