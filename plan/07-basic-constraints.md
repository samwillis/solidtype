# Phase 07: Basic Constraints

## Prerequisites

- Phase 06: Revolve (basic modeling workflow complete)

## Goals

- Add constraint system UI to sketches
- Implement horizontal, vertical, coincident, and fixed constraints
- Show constraint status (under/over-constrained)
- Solve constraints when sketch is edited

---

## User Workflow

### Adding Constraints

1. User is in sketch edit mode
2. User selects one or more points/lines
3. User clicks constraint button in toolbar OR right-click → Add Constraint
4. Constraint is added
5. Sketch updates to satisfy constraint (solver runs)

### Constraint Types (This Phase)

| Constraint | Selection | Effect |
|------------|-----------|--------|
| Horizontal | 2 points OR 1 line | Points share Y coordinate |
| Vertical | 2 points OR 1 line | Points share X coordinate |
| Coincident | 2 points | Points share same location |
| Fixed | 1 point | Point cannot move |

---

## Document Model Changes

### Constraints Array

```xml
<sketch
  id="s1"
  plane="xy"
  points='[ ... ]'
  entities='[ ... ]'
  constraints='[
    { "id": "c1", "type": "horizontal", "points": ["p1", "p2"] },
    { "id": "c2", "type": "vertical", "points": ["p3", "p4"] },
    { "id": "c3", "type": "coincident", "points": ["p2", "p3"] },
    { "id": "c4", "type": "fixed", "point": "p1" }
  ]'
/>
```

### TypeScript Types

```typescript
// packages/app/src/types/document.ts (SketchConstraint union)

export interface HorizontalConstraint {
  id: string;
  type: 'horizontal';
  points: [string, string];  // Two point IDs
}

export interface VerticalConstraint {
  id: string;
  type: 'vertical';
  points: [string, string];
}

export interface CoincidentConstraint {
  id: string;
  type: 'coincident';
  points: [string, string];
}

export interface FixedConstraint {
  id: string;
  type: 'fixed';
  point: string;
}

export type BasicConstraint = 
  | HorizontalConstraint 
  | VerticalConstraint 
  | CoincidentConstraint 
  | FixedConstraint;
```

---

## App UI Work

### Constraint Toolbar

```typescript
// In sketch mode toolbar
<ToolbarGroup label="Constraints">
  <ToolbarButton
    icon="horizontal"
    label="Horizontal"
    onClick={() => addConstraint('horizontal')}
    disabled={!canAddHorizontal(selection)}
  />
  <ToolbarButton
    icon="vertical"
    label="Vertical"
    onClick={() => addConstraint('vertical')}
    disabled={!canAddVertical(selection)}
  />
  <ToolbarButton
    icon="coincident"
    label="Coincident"
    onClick={() => addConstraint('coincident')}
    disabled={!canAddCoincident(selection)}
  />
  <ToolbarButton
    icon="fixed"
    label="Fixed"
    onClick={() => addConstraint('fixed')}
    disabled={!canAddFixed(selection)}
  />
</ToolbarGroup>
```

### Selection Logic

```typescript
function canAddHorizontal(selection: SketchSelection): boolean {
  // 2 points selected
  if (selection.points.length === 2) return true;
  // 1 line selected (use its endpoints)
  if (selection.entities.length === 1 && selection.entities[0].type === 'line') return true;
  return false;
}

function canAddCoincident(selection: SketchSelection): boolean {
  return selection.points.length === 2;
}

function canAddFixed(selection: SketchSelection): boolean {
  return selection.points.length === 1;
}
```

### Constraint Visualization

```typescript
// Draw constraint indicators in sketch view

function ConstraintIndicators({ constraints, points }) {
  return (
    <>
      {constraints.map(c => {
        switch (c.type) {
          case 'horizontal':
            return <HorizontalIndicator key={c.id} points={getPoints(c.points)} />;
          case 'vertical':
            return <VerticalIndicator key={c.id} points={getPoints(c.points)} />;
          case 'coincident':
            return <CoincidentIndicator key={c.id} point={getPoint(c.points[0])} />;
          case 'fixed':
            return <FixedIndicator key={c.id} point={getPoint(c.point)} />;
        }
      })}
    </>
  );
}

// Horizontal: small "H" icon or horizontal line symbol
// Vertical: small "V" icon or vertical line symbol
// Coincident: small dot/circle at the point
// Fixed: small anchor/pin icon
```

### Constraint Status

```typescript
// Show DOF (degrees of freedom) status

function ConstraintStatus({ sketch }) {
  const { dof, status } = analyzeConstraints(sketch);
  
  return (
    <StatusIndicator 
      status={status}
      message={
        status === 'under' ? `Under-constrained (${dof} DOF)` :
        status === 'over' ? 'Over-constrained' :
        'Fully constrained'
      }
    />
  );
}
```

---

## Kernel Work

### Solver Integration

The kernel has a constraint solver. We need to call it:

```typescript
// In kernel.worker.ts, when processing sketch

function processSketch(feature: SerializedFeature): void {
  const sketchData = parseSketchData(feature);
  
  // Create SketchModel
  const sketch = new SketchModel();
  
  // Add points
  const pointMap = new Map<string, SketchPointId>();
  for (const p of sketchData.points) {
    const id = sketch.addPoint(p.x, p.y, { fixed: p.fixed });
    pointMap.set(p.id, id);
  }
  
  // Add entities
  for (const e of sketchData.entities) {
    if (e.type === 'line') {
      sketch.addLine(pointMap.get(e.start)!, pointMap.get(e.end)!);
    }
  }
  
  // Add constraints
  for (const c of sketchData.constraints) {
    switch (c.type) {
      case 'horizontal':
        sketch.addConstraint(horizontalPoints(
          pointMap.get(c.points[0])!,
          pointMap.get(c.points[1])!
        ));
        break;
      case 'vertical':
        sketch.addConstraint(verticalPoints(
          pointMap.get(c.points[0])!,
          pointMap.get(c.points[1])!
        ));
        break;
      case 'coincident':
        sketch.addConstraint(coincident(
          pointMap.get(c.points[0])!,
          pointMap.get(c.points[1])!
        ));
        break;
      case 'fixed':
        sketch.addConstraint(fixed(pointMap.get(c.point)!));
        break;
    }
  }
  
  // Solve
  const result = solveSketch(sketch);
  
  if (result.status === 'solved') {
    // Update point positions from solution
    // Send back to main thread
  } else if (result.status === 'over_constrained') {
    // Report error
  }
}
```

### Returning Solved Positions

```typescript
// Worker sends back solved positions
self.postMessage({
  type: 'sketchSolved',
  sketchId: feature.id,
  points: Array.from(pointMap.entries()).map(([docId, kernelId]) => ({
    id: docId,
    x: sketch.getPoint(kernelId).x,
    y: sketch.getPoint(kernelId).y,
  })),
  status: result.status,
  dof: result.dof,
});
```

### Main Thread Updates Yjs

```typescript
// In KernelContext
kernel.onSketchSolved((sketchId, points, status) => {
  if (status === 'solved') {
    // Update Yjs with solved positions
    updateSketchPoints(doc, sketchId, points);
  }
  
  setSketchStatus(sketchId, { status, dof: result.dof });
});
```

---

## Constraint Feedback

### Visual States

| State | Color | Meaning |
|-------|-------|---------|
| Satisfied | Green | Constraint is met |
| Unsatisfied | Red | Constraint cannot be met (conflict) |
| Redundant | Yellow | Constraint is redundant |

### Error Messages

```typescript
// Over-constrained example
"Cannot satisfy constraint: Horizontal on p1-p2 conflicts with existing Vertical constraint"

// Redundant example  
"Constraint is redundant: p1 is already fixed"
```

---

## Testing Plan

### Unit Tests

```typescript
// Test constraint addition
test('addHorizontalConstraint creates constraint', () => {
  const doc = createDocument();
  addSketchWithPoints(doc, 's1', [
    { id: 'p1', x: 0, y: 0 },
    { id: 'p2', x: 10, y: 5 },
  ]);
  
  addConstraint(doc, 's1', { type: 'horizontal', points: ['p1', 'p2'] });
  
  const constraints = getSketchConstraints(doc, 's1');
  expect(constraints).toHaveLength(1);
});

// Test solver
test('horizontal constraint aligns points', () => {
  const sketch = new SketchModel();
  const p1 = sketch.addPoint(0, 0);
  const p2 = sketch.addPoint(10, 5);
  
  sketch.addConstraint(horizontalPoints(p1, p2));
  const result = solveSketch(sketch);
  
  expect(result.status).toBe('solved');
  expect(sketch.getPoint(p1).y).toBeCloseTo(sketch.getPoint(p2).y);
});
```

### Integration Tests

- Select 2 points → click Horizontal → points align
- Add conflicting constraints → error shown
- DOF indicator updates correctly

---

## Open Questions

1. **Auto-constraints** - Add constraints automatically when drawing?
   - Decision: Not in this phase, manual only

2. **Constraint deletion** - How to delete constraints?
   - Decision: Select constraint indicator → Delete key or right-click → Delete

3. **Undo** - Should constraint operations be undoable?
   - Decision: Yes, via Yjs UndoManager
