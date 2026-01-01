# Appendix: Constraint Solver Roadmap

This document describes the evolution of the 2D constraint solver across phases.

> **Reference**: See also [OVERVIEW.md § 6. Sketching & Constraint Solving](/OVERVIEW.md) for the architectural vision and solver design principles.

---

## Design Philosophy

From the project overview:

> SolidType includes a **serious 2D sketch constraint solver**, not a toy.

The solver aims roughly at the class of constraints handled by commercial 2D DCM components (e.g. Siemens' D-Cubed 2D DCM), widely used in professional CAD for parametric sketching.

---

## Sketch Model

Each sketch:

- Lives on a **plane** (datum or model face)
- Owns:
  - A set of **points** (unknowns: `x`, `y` in plane coordinates)
  - A set of **entities**: lines and arcs referencing these points
  - A set of **constraints** linking points and entities
- May attach some points to external model edges via `PersistentRef` (for "point on edge" / projection constraints)

---

## Solver Architecture

We treat the sketch as a **nonlinear system**:

- **Variables**: Coordinates of free points (and potentially parameters like radii)
- **Equations**: Constraint residuals (length differences, angle differences, distance to a line, etc.)

### Solving Algorithm

1. **Partition into connected components** (constraint graph analysis)
2. **Gauss–Newton / Levenberg–Marquardt style iterative solver**:
   - Finite-difference Jacobian initially (upgradeable to analytic later)
   - Tolerance-based convergence
   - Iteration caps for safety
3. **Use the previous solution as initial guess** for interactive edits

The solver is designed to run in a **worker** for responsiveness, but architecturally it's just a pure function:

```typescript
function solveSketch(sketch: SketchModel, context?: SolveContext): SolveResult;
```

---

## Current State

The kernel has a Gauss-Newton/Levenberg-Marquardt style solver in `sketch/solver.ts`:

### Existing Capabilities

- Point position variables
- Basic residual computation
- Iterative solving with convergence check
- Under/over-constrained detection

### Existing Constraint Types

- Horizontal (points share Y)
- Vertical (points share X)
- Coincident (points share position)
- Fixed (point at specific position)
- Distance (point-to-point distance)
- Angle (line-to-line angle)

---

## Constraint Set (Target)

The target constraint set from the overview:

| Category    | Constraints                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Geometric   | `coincident`, `horizontal`, `vertical`, `parallel`, `perpendicular`, `equal length`, `tangent` |
| Structural  | `fixed` points                                                                                 |
| Dimensional | distances and angles between points/lines                                                      |

---

## Phase 07: Basic Constraints

### Focus

Get the existing solver working reliably with basic constraints.

### Tasks

- [ ] Verify horizontal/vertical constraints work
- [ ] Verify coincident constraint works
- [ ] Verify fixed constraint works
- [ ] Add clear error messages for conflicts

### Testing

```typescript
// Simple rectangle with constraints
const sketch = new SketchModel();
const p1 = sketch.addPoint(0, 0);
const p2 = sketch.addPoint(10, 1); // Slightly off
const p3 = sketch.addPoint(11, 9);
const p4 = sketch.addPoint(-1, 10);

// Add lines
sketch.addLine(p1, p2);
sketch.addLine(p2, p3);
sketch.addLine(p3, p4);
sketch.addLine(p4, p1);

// Add constraints to make it a rectangle
sketch.addConstraint(horizontal(p1, p2));
sketch.addConstraint(vertical(p2, p3));
sketch.addConstraint(horizontal(p3, p4));
sketch.addConstraint(vertical(p4, p1));
sketch.addConstraint(fixed(p1));

// Solve
const result = solveSketch(sketch);
expect(result.status).toBe("solved");
```

---

## Phase 08: Dimension Constraints

### Focus

Add parametric dimensions that can be edited.

### Tasks

- [ ] Verify distance constraint works
- [ ] Verify angle constraint works
- [ ] Handle dimension updates (re-solve)

### Implementation Notes

Distance constraint residual:

```typescript
function distanceResidual(p1: Point, p2: Point, targetDistance: number): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const currentDistance = Math.sqrt(dx * dx + dy * dy);
  return currentDistance - targetDistance;
}
```

Angle constraint residual:

```typescript
function angleResidual(
  line1: [Point, Point],
  line2: [Point, Point],
  targetAngle: number // radians
): number {
  const angle1 = Math.atan2(line1[1].y - line1[0].y, line1[1].x - line1[0].x);
  const angle2 = Math.atan2(line2[1].y - line2[0].y, line2[1].x - line2[0].x);

  let diff = angle2 - angle1;
  // Normalize to [-π, π]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  return diff - targetAngle;
}
```

---

## Phase 09: Arc Constraints

### Focus

Handle arcs as first-class entities.

### New Variables

- Arc center point (x, y)
- Arc radius (derived or constrained)

### New Constraints

- **Point on arc**: Point lies on arc curve
- **Arc radius**: Arc has specific radius
- **Concentric**: Two arcs share center

### Implementation

```typescript
function pointOnArcResidual(point: Point, center: Point, radius: number): number {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance - radius;
}
```

---

## Phase 19: Advanced Constraints

### New Constraint Types

#### Parallel

```typescript
function parallelResidual(
  p1: Point,
  p2: Point, // Line 1
  p3: Point,
  p4: Point // Line 2
): number {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;

  // Cross product = 0 for parallel
  return dx1 * dy2 - dy1 * dx2;
}
```

#### Perpendicular

```typescript
function perpendicularResidual(p1: Point, p2: Point, p3: Point, p4: Point): number {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;

  // Dot product = 0 for perpendicular
  return dx1 * dx2 + dy1 * dy2;
}
```

#### Tangent (Line-Arc)

```typescript
function tangentLineArcResidual(
  lineStart: Point,
  lineEnd: Point,
  arcCenter: Point,
  arcRadius: number
): number {
  // Distance from center to line = radius
  const dist = pointToLineDistance(arcCenter, lineStart, lineEnd);
  return dist - arcRadius;
}
```

#### Tangent (Arc-Arc)

```typescript
function tangentArcArcResidual(
  center1: Point,
  radius1: number,
  center2: Point,
  radius2: number,
  external: boolean
): number {
  const dist = distance(center1, center2);

  if (external) {
    return dist - (radius1 + radius2);
  } else {
    return dist - Math.abs(radius1 - radius2);
  }
}
```

#### Equal Length

```typescript
function equalLengthResidual(p1: Point, p2: Point, p3: Point, p4: Point): number {
  const len1 = distance(p1, p2);
  const len2 = distance(p3, p4);
  return len1 - len2;
}
```

#### Symmetric

```typescript
function symmetricResidual(
  point1: Point,
  point2: Point,
  axisStart: Point,
  axisEnd: Point
): [number, number] {
  // Midpoint lies on axis
  const mid = {
    x: (point1.x + point2.x) / 2,
    y: (point1.y + point2.y) / 2,
  };
  const midOnAxis = pointToLineDistance(mid, axisStart, axisEnd);

  // p1-p2 perpendicular to axis
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const axDx = axisEnd.x - axisStart.x;
  const axDy = axisEnd.y - axisStart.y;
  const perp = dx * axDx + dy * axDy;

  return [midOnAxis, perp];
}
```

---

## Solver Improvements

### Convergence Issues

Current solver may struggle with:

- Poor initial guesses
- Constraint conflicts
- Under-constrained systems
- Singular Jacobians

### Planned Improvements

1. **Better initialization**
   - Use current point positions as starting guess
   - Apply simple constraints (fixed, horizontal, vertical) first
   - Pre-solve analytically where possible

2. **Damping (Levenberg-Marquardt)**
   - Adaptive damping for stability
   - Trust region approach
   - Better handling of near-singular systems

3. **Singular Jacobian handling**
   - Detect rank-deficient Jacobian
   - Report which constraints are redundant
   - SVD-based regularization

4. **Constraint graph partitioning**
   - Detect independent subproblems
   - Solve smaller systems in parallel
   - Better performance for large sketches

---

## Degrees of Freedom Analysis

### Current

Simple DOF count: `2N - C` where N = points, C = constraint equations

### Improved (Future)

```typescript
interface DOFAnalysis {
  totalDOF: number;
  status: "under" | "fully" | "over";
  pointDOF: Map<PointId, 0 | 1 | 2>; // Per-point freedom
  redundantConstraints: ConstraintId[];
  suggestedConstraints?: Constraint[]; // For under-constrained
}

function analyzeDOF(sketch: SketchModel): DOFAnalysis {
  // Build constraint graph
  // Compute Jacobian rank
  // Identify under/over-constrained regions
}
```

### UI Integration

- Color-code points by DOF (green = fixed, yellow = 1 DOF, red = free)
- Highlight redundant constraints
- Suggest constraints to fully constrain

---

## External Constraints

Sketches can reference external model geometry:

```typescript
interface ExternalPointConstraint {
  type: "pointOnEdge";
  point: PointId;
  edgeRef: PersistentRef;
  parameter?: number; // 0-1 along edge, or free to slide
}
```

During solve:

1. Resolve `PersistentRef` to current model edge
2. Project edge onto sketch plane
3. Add constraint equation: point lies on projected curve

---

## Performance Considerations

### Current Approach

- Dense Jacobian matrix
- Full solve each iteration
- Finite-difference Jacobian

### Potential Optimizations

1. **Sparse Jacobian** for large sketches
   - Most constraints are local (2-4 points)
   - Use sparse matrix solvers

2. **Analytic Jacobian**
   - Compute derivatives symbolically
   - Faster than finite differences

3. **Incremental solve**
   - When one dimension changes, only re-solve affected region
   - Cache factorized matrices

4. **WebAssembly**
   - Port hot loops to WASM for speed
   - Matrix operations in native code

---

## Error Messages

Clear error messages for users:

| Situation               | Message                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| Over-constrained        | "Sketch is over-constrained. Remove a constraint or change a dimension."    |
| Conflicting constraints | "Constraint conflict: Horizontal on L1 conflicts with Angle=45° on L1"      |
| Failed to converge      | "Could not solve sketch. Try removing some constraints and re-adding them." |
| Redundant constraint    | "Constraint is redundant and has no effect."                                |
| Lost reference          | "Cannot find referenced edge. The model geometry may have changed."         |

---

## Testing Strategy

### Unit Tests

- Each constraint type in isolation
- Pairs of constraints (e.g., horizontal + vertical)
- Known-good sketch configurations
- Edge cases (degenerate geometry)

### Stress Tests

- Many points (50+)
- Many constraints
- Complex interdependencies
- Random perturbations

### Regression Tests

- Previously failing cases
- User-reported bugs
- Known problematic configurations

### Benchmarks

- Track solve time vs sketch complexity
- Memory usage
- Convergence iteration counts
