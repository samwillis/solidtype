# SolidType Architecture

This document provides a detailed technical overview of SolidType's architecture, package structure, and module responsibilities.

## Table of Contents

1. [Package Structure](#package-structure)
2. [Core Package Modules](#core-package-modules)
3. [Data Flow](#data-flow)
4. [Key Design Decisions](#key-design-decisions)
5. [Performance Considerations](#performance-considerations)

---

## Package Structure

SolidType is organized as a pnpm monorepo with three main packages:

```
packages/
├── core/           # Functional kernel (no DOM dependencies)
│   ├── src/
│   │   ├── num/    # Numeric utilities & tolerances
│   │   ├── geom/   # Curves & surfaces
│   │   ├── topo/   # BREP topology
│   │   ├── model/  # Modeling operations
│   │   ├── naming/ # Persistent naming
│   │   ├── sketch/ # 2D sketch & solver
│   │   └── mesh/   # Tessellation
│   └── bench/      # Performance benchmarks
├── oo/             # Object-oriented façade
│   └── src/
└── viewer/         # WebGL demo application
    └── src/
        └── worker/ # Web Worker integration
```

### Package Dependencies

```
@solidtype/viewer
    └── @solidtype/oo
            └── @solidtype/core
```

- `@solidtype/core` has **no dependencies** other than dev tools
- `@solidtype/oo` depends only on `@solidtype/core`
- `@solidtype/viewer` uses both plus `three.js` for rendering

---

## Core Package Modules

### `num` – Numeric Backbone

**Purpose**: Provide foundational math utilities, tolerance management, and geometric predicates.

**Key files**:
- `vec2.ts`, `vec3.ts` – 2D/3D vector operations as pure functions
- `mat4.ts` – 4x4 matrix operations for transformations
- `tolerance.ts` – Tolerance context and comparison functions
- `predicates.ts` – Geometric predicates (orientation tests, classification)
- `rootFinding.ts` – Numerical root finding (Newton, bisection)

**Design principles**:
- All operations use `Float64` (JavaScript `number`)
- Tolerance-aware comparisons via helper functions (`isZero`, `eqLength`, etc.)
- Predicates isolated for future robust arithmetic upgrades
- Pure functions, no mutable state

**Example usage**:
```typescript
import { vec3, normalize3, dot3 } from '@solidtype/core';
import { isZero } from '@solidtype/core';

const v = vec3(1, 2, 3);
const n = normalize3(v);
const d = dot3(n, vec3(0, 0, 1));

if (isZero(d, ctx)) {
  // Perpendicular within tolerance
}
```

---

### `geom` – Geometry Representations

**Purpose**: Define analytic curves and surfaces with evaluation functions.

**Key files**:
- `curve2d.ts` – 2D curves (Line2D, Arc2D)
- `curve3d.ts` – 3D curves (Line3D, Circle3D)
- `surface.ts` – 3D surfaces (Plane, Cylinder, Cone, Sphere)
- `intersect2d.ts` – 2D intersection algorithms

**Geometry types**:

| Type | Parameters | Description |
|------|------------|-------------|
| `Line2D` | `p0`, `p1` | Line segment |
| `Arc2D` | `center`, `radius`, `startAngle`, `endAngle`, `ccw` | Circular arc |
| `Line3D` | `origin`, `direction`, `t0`, `t1` | Line segment in 3D |
| `Circle3D` | `center`, `normal`, `radius`, `startAngle`, `endAngle` | Circular arc in 3D |
| `PlaneSurface` | `origin`, `normal`, `xDir`, `yDir` | Infinite plane |
| `CylinderSurface` | `origin`, `axis`, `radius` | Cylindrical surface |
| `SphereSurface` | `center`, `radius` | Spherical surface |

**Evaluation API**:
```typescript
function evalCurve2D(curve: Curve2D, t: number): Vec2;
function evalCurve3D(curve: Curve3D, t: number): Vec3;
function evalSurface(surface: Surface, u: number, v: number): Vec3;
function surfaceNormal(surface: Surface, u: number, v: number): Vec3;
```

---

### `topo` – BREP Topology

**Purpose**: Maintain boundary representation data structures with struct-of-arrays layout.

**Key files**:
- `handles.ts` – Branded type IDs (BodyId, FaceId, EdgeId, etc.)
- `model.ts` – TopoModel structure and operations
- `validate.ts` – Model validation routines
- `heal.ts` – Topology healing functions

**Hierarchy**:
```
Body
 └── Shell (closed = solid, open = surface)
      └── Face (bounded region on a surface)
           └── Loop (closed sequence of half-edges)
                └── HalfEdge (directed edge usage)
                     └── Edge (geometry shared by half-edges)
                          └── Vertex (point where edges meet)
```

**Struct-of-Arrays Layout**:
```typescript
interface VertexTable {
  x: Float64Array;     // X coordinates
  y: Float64Array;     // Y coordinates  
  z: Float64Array;     // Z coordinates
  flags: Uint8Array;   // Status flags
  count: number;       // Allocated entries
  liveCount: number;   // Non-deleted entries
}
```

**Handle-based API**:
```typescript
// Creating entities
const v = addVertex(model, x, y, z);
const e = addEdge(model, v1, v2);
const f = addFace(model, surfaceIndex, reversed);

// Querying
const pos = getVertexPosition(model, v);
const faces = getShellFaces(model, shellId);
```

---

### `model` – Modeling Operations

**Purpose**: Implement high-level modeling operations on BREP.

**Key files**:
- `primitives.ts` – Box creation
- `planes.ts` – Datum plane management
- `sketchProfile.ts` – 2D profile definitions
- `extrude.ts` – Sketch extrusion
- `revolve.ts` – Sketch revolution
- `boolean.ts` – Solid-solid boolean operations

**Operation flow**:
1. Create a sketch profile on a datum plane
2. Apply modeling operation (extrude, revolve)
3. Optionally perform booleans (union, subtract, intersect)
4. Validate and heal result

**Example**:
```typescript
const plane = createDatumPlane({ origin: [0,0,0], normal: [0,0,1] });
const profile = createRectangleProfile(10, 8, plane);
const result = extrude(model, profile, { 
  operation: 'add', 
  distance: 5 
});
```

---

### `naming` – Persistent Naming

**Purpose**: Provide stable references to topology elements across parametric edits.

**Key files**:
- `types.ts` – Core types (PersistentRef, SubshapeRef, etc.)
- `evolution.ts` – Evolution tracking and naming strategy

**Key concepts**:

| Concept | Description |
|---------|-------------|
| `SubshapeRef` | Ephemeral handle (body + type + id) |
| `FeatureId` | Identifies a modeling feature |
| `FeatureLocalSelector` | Feature-specific path (e.g., "extrude.side.loop0.seg2") |
| `PersistentRef` | Stable external reference |
| `EvolutionMapping` | Tracks old → new shape correspondence |

**Usage**:
```typescript
// During extrusion, faces are born with names
const ref = namingStrategy.recordBirth(
  featureId,
  extrudeSideSelector(loopIdx, segIdx),
  faceRef(body, faceId),
  fingerprint
);

// After parameter change, resolve ref to current face
const resolved = namingStrategy.resolve(ref, model);
```

---

### `sketch` – 2D Sketch System

**Purpose**: Represent and solve constrained 2D sketches.

**Key files**:
- `types.ts` – Sketch data structures
- `sketch.ts` – Sketch creation and manipulation
- `constraints.ts` – Constraint type definitions
- `solver.ts` – Levenberg-Marquardt constraint solver
- `graph.ts` – Constraint graph analysis
- `attachment.ts` – External edge attachment

**Supported constraints**:
- Geometric: coincident, horizontal, vertical, parallel, perpendicular, tangent
- Dimensional: distance, angle, radius
- Structural: fixed, equal length, symmetric, midpoint

**Solver algorithm**:
1. Build system of equations from constraints
2. Compute Jacobian via finite differences
3. Iterate using Levenberg-Marquardt
4. Return converged positions or error

---

### `mesh` – Tessellation

**Purpose**: Convert BREP bodies to triangle meshes for rendering.

**Key files**:
- `types.ts` – Mesh data structures
- `triangulate.ts` – Ear-clipping polygon triangulation
- `tessellateFace.ts` – Per-face tessellation
- `tessellateBody.ts` – Full body tessellation

**Output format**:
```typescript
interface Mesh {
  positions: Float32Array;  // xyz, xyz, ...
  normals: Float32Array;    // xyz, xyz, ...
  indices: Uint32Array;     // triangle indices
}
```

---

## Data Flow

### Model Creation Flow

```
User Code
    │
    ▼
┌─────────────────┐
│  @solidtype/oo  │  OO façade (classes)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  model/         │  Modeling operations
├─────────────────┤
│  topo/          │  BREP topology
├─────────────────┤
│  geom/          │  Geometry definitions
├─────────────────┤
│  num/           │  Numeric primitives
└─────────────────┘
```

### Rendering Flow

```
TopoModel
    │
    ▼
┌─────────────────┐
│  tessellateBody │  mesh/
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Mesh           │  positions, normals, indices
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MeshAdapter    │  viewer/
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  THREE.js       │  WebGL rendering
└─────────────────┘
```

---

## Key Design Decisions

### 1. Struct-of-Arrays for BREP

**Why**: Cache efficiency for large models, easier serialization.

```typescript
// Instead of:
const vertices: Vertex[] = [{ x, y, z }, ...];

// We use:
const vertices = {
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
};
```

### 2. Branded Type IDs

**Why**: Prevent mixing different handle types at compile time.

```typescript
type FaceId = number & { __brand: "FaceId" };
type EdgeId = number & { __brand: "EdgeId" };

// Compiler error: cannot assign EdgeId to FaceId
```

### 3. Pure Functions in Core

**Why**: Easier testing, better parallelization potential.

```typescript
// Functions don't maintain hidden state
const result = extrude(model, profile, options);
// model is mutated, but function is referentially transparent
// for same inputs
```

### 4. Tolerance Context

**Why**: Centralized tolerance management for consistency.

```typescript
// All comparisons use context
if (isZero(distance, ctx)) { ... }
if (eqAngle(a1, a2, ctx)) { ... }
```

---

## Performance Considerations

### Benchmarks

Run benchmarks with:
```bash
cd packages/core
pnpm bench              # All benchmarks
pnpm bench:model        # Model building
pnpm bench:tessellation # Tessellation
pnpm bench:solver       # Constraint solving
```

### Hot Paths

1. **Tessellation**: Face triangulation and mesh merging
2. **Constraint Solver**: Jacobian computation, linear system solving
3. **Boolean Operations**: Face classification, intersection detection

### Optimization Strategies

- Use TypedArrays for bulk numeric data
- Avoid object allocation in inner loops
- Cache computed values (fingerprints, centroids)
- Pre-allocate arrays when size is known

### Memory Considerations

- BREP tables grow dynamically but can be pre-sized
- Mesh data uses Float32Array (half the memory of Float64)
- Consider pooling for frequently created/destroyed objects

---

## See Also

- [OVERVIEW.md](../OVERVIEW.md) – Project goals and scope
- [PLAN.md](../PLAN.md) – Implementation phases
- [docs/testing.md](./testing.md) – Testing strategy
- [docs/future-roadmap.md](./future-roadmap.md) – Future extensions
