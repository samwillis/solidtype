# SolidType Architecture

## 1. Purpose & Goals

SolidType is a **pure TypeScript BREP kernel** aimed at proving that a **world-class CAD kernel** can live entirely in the JS/TS ecosystem (Node + browser), with:

* History-capable **parametric modeling** (sketch + feature driven).
* Robust **BREP topology** (bodies, faces, edges, vertices, shells).
* Strong, research-informed **persistent naming**.
* A serious, interactive **2D sketch constraint solver**.
* A path to **robust numerics** (tolerances + upgradeable predicates).
* Good **developer ergonomics** (clean layers, TDD, small number of packages).

This document explains how the kernel is structured, how data flows, and where major responsibilities live.

---

## 2. High-Level Layout

SolidType is a pnpm monorepo with a **small number of packages**:

* `@solidtype/core` – the CAD kernel with an object-oriented API.
* `@solidtype/viewer` – WebGL/three.js demo app and playground.

Everything is ESM-only. `@solidtype/core` has no DOM/browser dependencies and is designed to run in **Node** or in a **Web Worker**.

### 2.1 Public API (Object-Oriented)

`@solidtype/core` exposes an ergonomic, class-based API as the primary interface:

* `SolidSession` – main entry point for modeling operations.
* `Body`, `Face`, `Edge` – wrappers for topological entities.
* `Sketch` – 2D sketch with constraint solving.

### 2.2 Internal Modules (Data-Oriented)

Inside `@solidtype/core` we have logical submodules that use data-oriented design for performance:

* `num` – numeric utilities, tolerances, predicates, root-finding.
* `geom` – curves & surfaces (analytic, v1), evaluators, intersections.
* `topo` – BREP topology (vertices/edges/faces/loops/shells/bodies).
* `model` – modeling operators (primitives, extrude, revolve, booleans).
* `naming` – persistent naming & evolution graph.
* `sketch` – 2D sketch entities + constraint system + solver.
* `mesh` – tessellation (BREP → triangle meshes).
* `api` – object-oriented wrappers that delegate to the internal modules.

The `@solidtype/viewer` uses the OO API from core to provide a real-time playground and visual debugging.

---

## 3. `@solidtype/core` – Functional Kernel

### 3.1 `num` – Numeric Layer & Tolerances

**Responsibility**

* Provide basic linear algebra, root-finding, and **tolerance-aware** comparison.
* Centralise **geometric predicates** (orientation tests, classification) so they can be upgraded to robust algorithms later.

**Key design choices**

* All geometry uses **Float64** (`number`), not arbitrary-precision.
* Each model has a **tolerance context**:

  ```ts
  interface Tolerances {
    length: number; // absolute distance tolerance
    angle: number;  // radians
  }

  interface NumericContext {
    tol: Tolerances;
  }
  ```
* All equality / near-equality decisions go through helper functions:

  * `isZero`, `eqLength`, `eqAngle`, etc.
* Predicates (e.g. `orient2D`, point-vs-plane) live in `num/predicates.ts`:

  * Start as straightforward Float64 implementations.
  * Architecture allows later replacement with **robust predicates** (e.g. Shewchuk-style adaptive arithmetic).

**References / inspiration**

* CGAL’s “exact predicates / inexact constructions” kernels set the pattern: use doubles for constructions, but invest in robust predicates.
* J.R. Shewchuk’s work on adaptive precision floating-point predicates.

---

### 3.2 `geom` – Curves & Surfaces

**Responsibility**

* Represent analytic 2D/3D curves and 3D surfaces.
* Evaluate positional and differential quantities (points, tangents, normals).
* Provide basic intersection kernels for simple cases.

**Initial geometry set**

* 2D:

  * `Line2D` (segment defined by endpoints).
  * `Arc2D` (circle arc defined by centre, radius, angle span).
* 3D curves:

  * `Line3D`.
  * `Circle3D`.
* 3D surfaces:

  * `PlaneSurface`.
  * `CylinderSurface`.
  * `ConeSurface`.
  * `SphereSurface`.

**API style**

* Types are plain objects (no classes).
* Evaluators are pure functions:

  ```ts
  function evalCurve2D(c: Curve2D, t: number): Vec2;
  function evalCurve3D(c: Curve3D, t: number): Vec3;
  function evalSurface(s: Surface, u: number, v: number): Vec3;
  function surfaceNormal(s: Surface, u: number, v: number): Vec3;
  ```
* Intersection helpers:

  * 2D: line–line, line–arc, arc–arc.
  * 3D: ray–plane, ray–sphere, etc., expanding as needed.

**Why separate from topology?**

This keeps geometry:

* **Testable** in isolation (no BREP involved).
* **Reusable** if topology representation changes.
* Easier to later add new surface types (e.g. NURBS) without touching BREP or modeling operators.

---

### 3.3 `topo` – BREP Topology & Bodies

**Responsibility**

* Maintain the boundary-representation: vertices, edges, faces, loops, shells, bodies.
* Support multiple bodies per model.
* Distinguish between open shells (surfaces) and closed solids.
* Provide validation and basic healing.

**Data model**

* Handle types:

  ```ts
  type BodyId   = number & { __brand: "BodyId" };
  type FaceId   = number & { __brand: "FaceId" };
  type EdgeId   = number & { __brand: "EdgeId" };
  type VertexId = number & { __brand: "VertexId" };
  type LoopId   = number & { __brand: "LoopId" };
  type HalfEdgeId = number & { __brand: "HalfEdgeId" };
  ```

* Struct-of-arrays tables:

  * `VertexTable`: `x`, `y`, `z` as `Float64Array`.
  * `EdgeTable`: `vStart`, `vEnd`, `curveIndex`, flags.
  * `FaceTable`: `surfaceIndex`, `firstLoop`, `loopCount`, shell, orientation.
  * `Loop` & `HalfEdge` tables: capture boundary cycles and adjacency.

**Functional API**

* `createEmptyModel(): TopoModel`.
* Mutators: `addBody`, `addFace`, `addEdge`, `addVertex`, `addLoop`, etc.
* Mutation is local to the `TopoModel` instance; handles (`FaceId`, etc.) are used instead of object references.

**Validation and healing**

* `validateModel(model, ctx)` returns a structured report of:

  * Non-manifold edges.
  * Cracks (edges with <2 or >2 incident faces in solids).
  * Degenerate entities (zero-area faces, very short edges).
* `healModel(model, ctx, options)` applies modest, deterministic healing:

  * Merge vertices within tolerance.
  * Remove edges/faces below size thresholds.
  * Reorient shells if needed.

SolidType aims for the **“moderate but explicit”** healing strategy found in industrial kernels: try small repairs but prefer clear failure over silent corruption.

---

### 3.4 `mesh` – Tessellation

**Responsibility**

* Convert BREP bodies into triangle meshes for:

  * WebGL rendering (three.js).
  * STL export.

**Approach**

* Per-face tessellation:

  * Planar faces:

    * Project boundary loops to 2D in plane coordinates.
    * Triangulate 2D polygons (ear clipping or similar).
    * Map resulting triangles back to 3D.
  * Cylindrical / spherical faces:

    * Parametric grid in `(u,v)`, resolution based on curvature and tolerance.
* Per-body tessellation:

  * Concatenate per-face meshes.
  * Share vertices/normals where possible.

**Output**

```ts
interface Mesh {
  positions: Float32Array; // xyzxyz...
  normals:   Float32Array; // same length as positions
  indices:   Uint32Array;  // triangle indices
}
```

---

### 3.5 `model` – Modeling Operators

**Responsibility**

* Implement modeling operations on top of `geom` + `topo`:

  * Primitives (boxes, cylinders for tests).
  * Sketch-based extrude (add/cut).
  * Sketch-based revolve (add/cut).
  * Solid–solid booleans (union, subtract, intersect).

**Sketch planes & profiles**

* Planes:

  * Fundamentals: global XY, YZ, ZX.
  * Later: offsets from faces, custom datum planes.
* Sketch profiles:

  * Closed 2D loops (lines + arcs) on a plane.
  * Converted to `SketchProfile` objects, validated for closure.

**Extrude & revolve**

Operations:

* `extrude(profile, distance, direction, op)`:

  * Build top & bottom caps from profile.
  * Sweep edges to form side faces.
  * Build a new body (for `add`) or tool body (for `cut`).
* `revolve(profile, axis, angle, op)`:

  * Revolve edges around axis to create analytic surfaces of revolution.
  * Construct faces & shells accordingly.

Both operations allocate a `FeatureId` and register named subshapes with `naming` (see below).

**Solid–solid booleans**

SolidType goes directly for BREP booleans (no mesh booleans):

* Intersect candidate faces (planar-only first, more later).
* Build intersection curves/edges.
* Classify faces by inside/outside tests using predicates.
* Assemble result bodies by trimming and stitching.
* Run validation + limited healing.

Booleans are explicitly staged: start with **simple cases (e.g. convex boxes)**, then generalise.

---

### 3.6 `naming` – Persistent Naming

**Responsibility**

* Provide **persistently stable references** to faces/edges/vertices through parametric edits and modeling operations.
* Allow constraints, dimensions, and later features (fillets, chamfers) to refer to model entities without breaking on rebuild.

**Background**

The design is influenced by:

* **Kripac’s mechanism** for persistently naming topological entities.
* **OpenCascade’s OCAF** topological naming and shape evolution.
* **FreeCAD’s topological naming improvements** (realthunder), which use graph-based and geometry-aware matching rather than pure positional indices.
* Surveyed research recommending **hybrid topology+geometry** approaches.

**Core abstractions**

* `SubshapeRef` – ephemeral handle (body + type + id).
* `FeatureId` – identifies a modeling feature (extrude, revolve, boolean…).
* `FeatureLocalSelector` – feature-specific path to a sub-entity:

  * e.g. `{ kind: "extrude.side", data: { loop: 0, segment: 2 } }`.
* `GeometryTopologyFingerprint` – compact descriptor:

  * approximate centroid, area/length, normal, adjacency hints.
* `PersistentRef` – stable handle exposed to callers:

  ```ts
  interface PersistentRef {
    originFeatureId: FeatureId;
    localSelector: FeatureLocalSelector;
    fingerprint?: GeometryTopologyFingerprint;
  }
  ```

**Evolution graph**

* Modeling ops provide `EvolutionMapping` records:

  ```ts
  interface EvolutionMapping {
    old: SubshapeRef | null;   // null = birth
    news: SubshapeRef[];
  }
  ```
* A `NamingStrategy` interface encapsulates:

  * `recordBirth(featureId, localSelector, subshape, fingerprint?)`.
  * `recordEvolution(stepId, mappings)`.
  * `resolve(ref, model): SubshapeRef | "ambiguous" | null`.

**Usage**

* Feature creation:

  * When extrude/revolve creates faces/edges, they declare their semantic role and register births.
* Booleans:

  * Register old→new subshape correspondences per step.
* Consumers (constraints, dimensions, UI):

  * Store only `PersistentRef`.
  * On rebuild, call `resolve` to find the current `SubshapeRef`.

The strategy is intentionally **pluggable** to allow experimentation with different algorithms and heuristics.

---

### 3.7 `sketch` – Sketch Representation & 2D Constraint Solver

**Responsibility**

* Represent 2D sketches on planes.
* Provide a **constraint system and numeric solver** for interactive sketching.

**Sketch model**

* Points with coordinates `(x, y)` in sketch plane space.
* Entities:

  * `SketchLine` (start + end point).
  * `SketchArc` (start, end, centre).
* Constraints:

  * `coincident`, `horizontal`, `vertical`, `parallel`, `perpendicular`,
  * `equalLength`, `fixed`,
  * `distance`, `angle`,
  * `tangent` (line–arc, arc–arc).
* Attachments:

  * A point can hold an `externalRef: PersistentRef` linking it to a model edge/vertex.

**Solver**

* Build a **constraint graph**:

  * Nodes: points / groups.
  * Edges: constraints.
* Partition into connected components for independent solving.
* Numeric approach:

  * Nonlinear least-squares (Gauss–Newton / Levenberg–Marquardt style).
  * Equations defined per constraint; residuals minimised against tolerance thresholds.
  * Use previous solution as initial guess for incremental changes (interactivity).

This roughly aligns with how industrial 2D constraint modules (e.g. Siemens D-Cubed 2D DCM) behave: general-purpose nonlinear solver, constraint graph decomposition, and DOF analysis.

The solver is intended to run in a **worker** for responsive UI.

---

## 4. Object-Oriented API (in `@solidtype/core/api`)

**Responsibility**

* Provide an ergonomic, class-based API as the primary interface for applications.
* Abstract away handles and low-level details for typical usage.
* Delegate to the internal data-oriented modules for actual operations.

**Key Classes**

```ts
class SolidSession {
  createSketch(plane: DatumPlane): Sketch;
  extrude(profile: SketchProfile, options: ExtrudeOptions): ExtrudeResult & { body?: Body };
  revolve(profile: SketchProfile, options: RevolveOptions): RevolveResult & { body?: Body };
  union(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body };
  subtract(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body };
  intersect(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body };
}

class Body {
  getFaces(): Face[];
  tessellate(options?): Mesh;
  selectFaceByRay(ray: Ray): FaceSelectionResult | null;
  resolve(ref: PersistentRef): Face | null;
}

class Sketch {
  addPoint(x: number, y: number): SketchPointId;
  addLine(start: SketchPointId, end: SketchPointId): SketchEntityId;
  addArc(...): SketchEntityId;
  addConstraint(constraint: Constraint): void;
  solve(): SolveResult;
  toProfile(): SketchProfile | null;
}
```

The OO layer:

* Never stores raw BREP handles directly; it keeps IDs and delegates to internal APIs.
* Provides the main host for **app-level behaviour** like scriptable models, simple history management, and selection tools.

---

## 5. `@solidtype/viewer` – Viewer & Worker Integration

**Responsibility**

* Provide a **WebGL/three.js**-based viewer.
* Serve as a test bed and demo for the kernel.
* Demonstrate how to run the kernel in a **Web Worker**.

**Viewer**

* Vite + TS + three.js app.
* Uses `@solidtype/core`'s OO API for modeling operations.
* Code-driven examples:

  * “Create a sketch on XY, draw rectangle, extrude, boolean union with another box.”
* Visual checks:

  * Animated parameter changes (sliders) to test persistent naming and rebuild stability.
  * Simple debug overlays (normals, wireframe).

**Workers**

* A worker hosts a `SolidSession` instance.
* UI sends commands:

  * `buildDemoModel`, `updateParam`, `solveSketch`, `getMesh`.
* Worker returns:

  * Mesh data (positions/normals/indices).
  * Diagnostics/errors for modeling and validation.

This avoids blocking the UI on heavy operations (booleans, solving).

---

## 6. Testing & Quality

**TDD-first**:

* Unit tests at each layer:

  * `num` and `geom` thoroughly unit-tested for correctness.
  * `topo` tested for invariants and healing behaviour.
  * `model` tested on canonical examples (e.g. extrude a rectangle, boolean two boxes).
  * `naming` tested on simple edit scenarios where identity must persist.
  * `sketch` tested on small constrained sketches with known solutions.

**Property-based tests (selective)**:

* For specific modules where randomisation adds clear value:

  * e.g. random small boxes for boolean classification, random simple sketches.

**Viewer/manual tests**:

* Example models in `@solidtype/viewer` serve as visual regression checks.
* Scripts that sweep parameters and verify:

  * No crashes.
  * `PersistentRef` resolution remains stable in simple param-edit scenarios.

---

## 7. Future Extensions & Open Hooks

The architecture is designed to support future work without major rewrites:

* **Geometry**:

  * Add Bezier/NURBS curves & surfaces as new `geom` types.
* **Modeling**:

  * Sweeps, lofts, shell, fillet, chamfer operations in `model`.
* **Naming**:

  * Alternative `NamingStrategy` implementations for research and comparison.
* **Numerics**:

  * Introduce exact/interval arithmetic for selected predicates.
* **Persistence**:

  * CRDT-backed model format for collaborative editing.
* **High-level API**:

  * A JSX-style composition layer on top of `@solidtype/core` for declarative models.

SolidType’s core constraint is: **keep the internal data-oriented modules clean, explicit, and well-tested**, so the OO API and future research can safely build on them.
