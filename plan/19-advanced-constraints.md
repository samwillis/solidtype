# Phase 19: Advanced Constraints

## Prerequisites

- Phase 08: Dimension Constraints
- Phase 09: Sketch Arcs

## Goals

- Add parallel constraint
- Add perpendicular constraint  
- Add tangent constraint (line-arc, arc-arc)
- Add equal length/radius constraint
- Add symmetric constraint

---

## Constraint Types

### Parallel

Two lines remain parallel:

```typescript
interface ParallelConstraint {
  type: 'parallel';
  lines: [string, string];  // Two line entity IDs
}
```

### Perpendicular

Two lines are at 90°:

```typescript
interface PerpendicularConstraint {
  type: 'perpendicular';
  lines: [string, string];
}
```

### Tangent

Line tangent to arc, or arc tangent to arc:

```typescript
interface TangentConstraint {
  type: 'tangent';
  entities: [string, string];  // Line-arc or arc-arc
  point?: string;              // Connection point (optional)
}
```

### Equal Length

Two lines have the same length:

```typescript
interface EqualLengthConstraint {
  type: 'equalLength';
  lines: [string, string];
}
```

### Equal Radius

Two arcs have the same radius:

```typescript
interface EqualRadiusConstraint {
  type: 'equalRadius';
  arcs: [string, string];
}
```

### Symmetric

Points are symmetric about a line:

```typescript
interface SymmetricConstraint {
  type: 'symmetric';
  points: [string, string];  // Two points
  axis: string;              // Line entity ID (axis of symmetry)
}
```

---

## App UI Work

### Extended Constraint Toolbar

```typescript
<ToolbarGroup label="Constraints">
  {/* Basic constraints (existing) */}
  <ToolbarButton icon="horizontal" label="Horizontal" ... />
  <ToolbarButton icon="vertical" label="Vertical" ... />
  <ToolbarButton icon="coincident" label="Coincident" ... />
  <ToolbarButton icon="fixed" label="Fixed" ... />
  
  {/* Advanced constraints (new) */}
  <ToolbarButton 
    icon="parallel" 
    label="Parallel" 
    onClick={() => addConstraint('parallel')}
    disabled={!canAddParallel(selection)}
  />
  <ToolbarButton 
    icon="perpendicular" 
    label="Perpendicular" 
    onClick={() => addConstraint('perpendicular')}
    disabled={!canAddPerpendicular(selection)}
  />
  <ToolbarButton 
    icon="tangent" 
    label="Tangent" 
    onClick={() => addConstraint('tangent')}
    disabled={!canAddTangent(selection)}
  />
  <ToolbarButton 
    icon="equal" 
    label="Equal" 
    onClick={() => addConstraint('equal')}
    disabled={!canAddEqual(selection)}
  />
  <ToolbarButton 
    icon="symmetric" 
    label="Symmetric" 
    onClick={() => addConstraint('symmetric')}
    disabled={!canAddSymmetric(selection)}
  />
</ToolbarGroup>
```

### Selection Validation

```typescript
function canAddParallel(selection: SketchSelection): boolean {
  // Need exactly 2 lines
  const lines = selection.entities.filter(e => e.type === 'line');
  return lines.length === 2;
}

function canAddTangent(selection: SketchSelection): boolean {
  // Need line + arc, or 2 arcs
  const lines = selection.entities.filter(e => e.type === 'line');
  const arcs = selection.entities.filter(e => e.type === 'arc');
  return (lines.length === 1 && arcs.length === 1) || arcs.length === 2;
}

function canAddSymmetric(selection: SketchSelection): boolean {
  // Need 2 points + 1 line
  return selection.points.length === 2 && 
         selection.entities.filter(e => e.type === 'line').length === 1;
}
```

### Constraint Visualization

```typescript
// Parallel: show parallel symbol on both lines
function ParallelIndicator({ line1, line2 }) {
  const midpoint1 = getLineMidpoint(line1);
  const midpoint2 = getLineMidpoint(line2);
  
  return (
    <>
      <ParallelSymbol position={midpoint1} angle={getLineAngle(line1)} />
      <ParallelSymbol position={midpoint2} angle={getLineAngle(line2)} />
    </>
  );
}

// Tangent: show tangent symbol at connection point
function TangentIndicator({ entity1, entity2, point }) {
  return <TangentSymbol position={point} />;
}

// Symmetric: show symmetric axis line
function SymmetricIndicator({ point1, point2, axis }) {
  return (
    <>
      <SymmetryLine axis={axis} />
      <SymmetryMarker position={point1} />
      <SymmetryMarker position={point2} />
    </>
  );
}
```

---

## Kernel Work

### Parallel Constraint

```typescript
// In solver.ts

function parallelResidual(
  p1: Point, p2: Point,  // First line
  p3: Point, p4: Point   // Second line
): number {
  // Lines are parallel if their direction vectors are parallel
  // (cross product = 0)
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;
  
  return dx1 * dy2 - dy1 * dx2;
}
```

### Perpendicular Constraint

```typescript
function perpendicularResidual(
  p1: Point, p2: Point,
  p3: Point, p4: Point
): number {
  // Lines are perpendicular if dot product = 0
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;
  
  return dx1 * dx2 + dy1 * dy2;
}
```

### Tangent Constraint (Line-Arc)

```typescript
function tangentLineArcResidual(
  lineStart: Point, lineEnd: Point,
  arcCenter: Point, arcRadius: number
): number {
  // Line is tangent to arc if distance from center to line equals radius
  const distance = pointToLineDistance(arcCenter, lineStart, lineEnd);
  return distance - arcRadius;
}
```

### Tangent Constraint (Arc-Arc)

```typescript
function tangentArcArcResidual(
  center1: Point, radius1: number,
  center2: Point, radius2: number,
  external: boolean  // External or internal tangency
): number {
  const dist = distance(center1, center2);
  
  if (external) {
    // Circles touch externally: dist = r1 + r2
    return dist - (radius1 + radius2);
  } else {
    // Circles touch internally: dist = |r1 - r2|
    return dist - Math.abs(radius1 - radius2);
  }
}
```

### Equal Length Constraint

```typescript
function equalLengthResidual(
  p1: Point, p2: Point,  // First line
  p3: Point, p4: Point   // Second line
): number {
  const len1 = distance(p1, p2);
  const len2 = distance(p3, p4);
  return len1 - len2;
}
```

### Symmetric Constraint

```typescript
function symmetricResidual(
  point1: Point, point2: Point,
  axisStart: Point, axisEnd: Point
): number[] {
  // Midpoint of p1-p2 should lie on axis
  const mid = { x: (point1.x + point2.x) / 2, y: (point1.y + point2.y) / 2 };
  const midOnAxis = pointToLineDistance(mid, axisStart, axisEnd);
  
  // p1-p2 should be perpendicular to axis
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const axDx = axisEnd.x - axisStart.x;
  const axDy = axisEnd.y - axisStart.y;
  const perpendicular = dx * axDx + dy * axDy;
  
  return [midOnAxis, perpendicular];
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test parallel constraint
test('parallel makes lines parallel', () => {
  const sketch = new SketchModel();
  const p1 = sketch.addPoint(0, 0);
  const p2 = sketch.addPoint(10, 5);
  const p3 = sketch.addPoint(0, 10);
  const p4 = sketch.addPoint(10, 12);
  
  sketch.addLine(p1, p2);
  sketch.addLine(p3, p4);
  sketch.addConstraint(parallel([p1, p2], [p3, p4]));
  
  const result = solveSketch(sketch);
  expect(result.status).toBe('solved');
  
  // Verify lines are parallel
  const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const angle2 = Math.atan2(p4.y - p3.y, p4.x - p3.x);
  expect(angle1).toBeCloseTo(angle2);
});

// Test tangent constraint
test('tangent makes line tangent to arc', () => {
  // Create arc and line, add tangent constraint
  // Verify distance from center to line equals radius
});
```

### Integration Tests

- Select 2 lines → click Parallel → lines become parallel
- Select line + arc → click Tangent → line becomes tangent
- Drag point → constraints maintained

---

## Open Questions

1. **Tangent point** - Should tangent constraint specify connection point?
   - Decision: Optional, solver finds it if not specified

2. **Internal vs external tangent** - How to specify?
   - Decision: Infer from current positions, or add toggle

3. **Multiple solutions** - Parallel and tangent can have multiple solutions
   - Decision: Solver uses current positions as hint
