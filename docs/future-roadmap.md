# SolidType Future Roadmap

This document outlines potential future extensions and research directions for SolidType beyond the current implementation plan.

## Table of Contents

1. [Near-Term Extensions (Phase 11+)](#near-term-extensions)
2. [Medium-Term Goals (v1.1–v1.2)](#medium-term-goals)
3. [Long-Term Vision (v2.0+)](#long-term-vision)
4. [Research Directions](#research-directions)

---

## Near-Term Extensions

### Sweeps & Lofts

**Goal**: Extend modeling operations beyond simple extrude/revolve.

**Sweep Operation**:
- Sweep a 2D profile along a 3D curve (path)
- Support for:
  - Fixed orientation (profile stays parallel to initial position)
  - Frenet frame (profile follows curve tangent/normal)
  - Guide curves for controlling orientation

**Loft Operation**:
- Connect multiple 2D profiles with smooth surfaces
- Support for:
  - Linear interpolation (ruled surface)
  - Smooth interpolation (spline surfaces)
  - Guide curves for shape control

**Implementation Notes**:
- Requires extending `geom/` with B-spline surfaces
- Need robust correspondence between profile vertices
- Consider using approximation for complex curves

---

### Fillets & Chamfers

**Goal**: Add edge-following blend operations.

**Fillet**:
- Constant radius blend along selected edges
- Variable radius blend (radius varies along edge)
- Face-face fillet (blend between adjacent faces)

**Chamfer**:
- Symmetric chamfer (equal distance from edge)
- Asymmetric chamfer (different distances on each face)

**Implementation Challenges**:
- Reliable edge following with persistent naming
- Handling corners where multiple edges meet
- Tangent transitions at blend boundaries

**Approach**:
```typescript
interface FilletOptions {
  edges: PersistentRef[];  // Edges to fillet
  radius: number | ((t: number) => number);  // Constant or variable
}

function fillet(model: TopoModel, options: FilletOptions): FilletResult;
```

---

### Shell Operation

**Goal**: Create thin-walled solids from existing bodies.

**Features**:
- Specify wall thickness
- Select faces to remove (become openings)
- Handle intersections when thickness exceeds geometry

---

### Draft Angles

**Goal**: Add taper to vertical faces for moldability.

**Features**:
- Apply draft to selected faces
- Specify draft angle and direction
- Handle face splitting when necessary

---

## Medium-Term Goals

### Bezier/NURBS Curves & Surfaces (v1.2)

**Goal**: Extend geometric capabilities beyond analytic surfaces.

**New Geometry Types**:

```typescript
interface BezierCurve2D {
  kind: 'bezier2d';
  controlPoints: Vec2[];  // n+1 points for degree n
}

interface BSplineCurve3D {
  kind: 'bspline3d';
  degree: number;
  controlPoints: Vec3[];
  knots: number[];
  weights?: number[];  // Optional for NURBS
}

interface BSplineSurface {
  kind: 'bspline';
  degreeU: number;
  degreeV: number;
  controlPoints: Vec3[][];  // Grid of control points
  knotsU: number[];
  knotsV: number[];
  weights?: number[][];
}
```

**Required Infrastructure**:
- De Casteljau evaluation for Bezier
- de Boor's algorithm for B-spline
- Surface-surface intersection for NURBS
- Tessellation with adaptive subdivision

---

### Robust Predicates

**Goal**: Upgrade geometric predicates for numerical robustness.

**Approach**:
- Implement Shewchuk-style adaptive arithmetic
- Automatic precision escalation when needed
- Maintain performance for non-degenerate cases

**Predicates to Upgrade**:
```typescript
// Current (Float64)
function orient2D(a: Vec2, b: Vec2, c: Vec2): number;

// Robust version
function orient2DExact(a: Vec2, b: Vec2, c: Vec2): -1 | 0 | 1;
```

**References**:
- Shewchuk's "Adaptive Precision Floating-Point Arithmetic"
- CGAL's exact kernel design

---

### Improved Boolean Operations

**Goal**: Extend booleans to handle curved surfaces.

**Phases**:
1. Planar faces only (current)
2. Planar + cylindrical faces
3. General analytic surfaces
4. NURBS surfaces

**Technical Requirements**:
- Surface-surface intersection algorithms
- Robust trimming curve computation
- Handle tangent and near-tangent cases

---

### Undo/Redo System

**Goal**: Enable history-based editing.

**Design**:
```typescript
interface ModelHistory {
  stack: HistoryEntry[];
  position: number;
  
  push(entry: HistoryEntry): void;
  undo(): boolean;
  redo(): boolean;
}

interface HistoryEntry {
  featureId: FeatureId;
  operation: string;
  params: Record<string, unknown>;
  inverseOperation?: () => void;
}
```

---

## Long-Term Vision

### Assemblies & Mates

**Goal**: Support multi-body assemblies with constraints.

**Components**:
- Assembly structure (tree of components)
- Component instances (transforms)
- Mate constraints (coincident, concentric, etc.)
- Assembly solver for positioning

```typescript
interface Assembly {
  id: AssemblyId;
  root: Component;
  mates: Mate[];
}

interface Component {
  id: ComponentId;
  body: BodyId | Assembly;  // Part or sub-assembly
  transform: Mat4;
  children: Component[];
}

interface Mate {
  kind: 'coincident' | 'concentric' | 'parallel' | 'distance';
  componentA: ComponentId;
  refA: PersistentRef;
  componentB: ComponentId;
  refB: PersistentRef;
  params?: Record<string, number>;
}
```

---

### CRDT-Based Model Format

**Goal**: Enable real-time collaborative editing.

**Approach**:
- Represent model as a CRDT (Conflict-free Replicated Data Type)
- Operations as commutative/idempotent transforms
- Automatic merge of concurrent edits

**Considerations**:
- Feature tree operations may conflict (reordering)
- Persistent naming helps identify corresponding elements
- May need conflict resolution UI for some cases

**References**:
- Automerge, Yjs for CRDT implementations
- Research on CAD collaboration systems

---

### JSX Composition Layer

**Goal**: Declarative component-based modeling API.

**Example**:
```tsx
function Bracket({ width, height, thickness }: BracketProps) {
  return (
    <Union>
      <Extrude distance={thickness}>
        <Sketch plane="XY">
          <Rectangle width={width} height={height} />
        </Sketch>
      </Extrude>
      <Extrude distance={thickness * 2}>
        <Sketch plane="XZ">
          <Circle radius={width / 4} center={[width/2, 0]} />
        </Sketch>
      </Extrude>
    </Union>
  );
}

const model = render(<Bracket width={10} height={8} thickness={2} />);
```

**Benefits**:
- Familiar syntax for web developers
- Composable, reusable components
- Type-safe parameter passing
- Reactive updates when props change

---

### Web-Based Sketch UI

**Goal**: Interactive 2D sketch editor in the browser.

**Features**:
- Canvas-based drawing tools
- Real-time constraint solver feedback
- DOF visualization
- Dimension input dialogs
- Gesture support for touch devices

**Architecture**:
- Sketch state in worker (solver runs in background)
- UI in main thread (immediate feedback)
- Message passing for state sync

---

## Research Directions

### Alternative Solver Algorithms

**Current**: Levenberg-Marquardt with finite-difference Jacobian

**Research Options**:
- Analytic Jacobian for common constraints
- Graph-based decomposition (solve subproblems independently)
- Symbolic solving for simple constraint patterns
- Machine learning for initial guess improvement

---

### Improved Persistent Naming

**Current**: Feature-local selectors + geometry fingerprints

**Research Options**:
- Learning-based matching for complex topological changes
- User intent inference from edit patterns
- Probabilistic reference resolution with confidence scores
- Interactive disambiguation for ambiguous cases

---

### Performance Optimization

**Areas of Interest**:
- WebGPU acceleration for tessellation
- Spatial indexing (BVH, octree) for large models
- Incremental update algorithms (avoid full rebuild)
- Memory-mapped storage for very large models

---

### Alternative Representations

**Dual Representations**:
- Maintain both BREP and mesh for different operations
- Use mesh for visualization, BREP for editing
- Automatic synchronization

**Implicit Surfaces**:
- Signed distance functions for smooth blends
- Hybrid BREP + SDF for specific operations

---

## Implementation Priority

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| Fillets/Chamfers | Medium | High | 1 |
| Sweeps | Medium | High | 2 |
| Shell | Low | Medium | 3 |
| NURBS surfaces | High | High | 4 |
| Robust predicates | Medium | Medium | 5 |
| Assemblies | High | High | 6 |
| JSX layer | Medium | Medium | 7 |
| CRDT format | High | Medium | 8 |

---

## Contributing

Interested in working on any of these features? See:
- [AGENTS.md](../AGENTS.md) – Guidelines for contributors
- [docs/architecture.md](./architecture.md) – Technical architecture
- [docs/testing.md](./testing.md) – Testing requirements

All contributions should follow the existing code style and include comprehensive tests.
