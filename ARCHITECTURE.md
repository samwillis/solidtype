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
* `@solidtype/app` – the main React application with full CAD UI.
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
* `mesh` – tessellation (BREP → triangle meshes) and STL export.
* `export` – file format exporters (STL).
* `api` – object-oriented wrappers that delegate to the internal modules.

The `@solidtype/app` and `@solidtype/viewer` use the OO API from core to provide real-time modeling and visual debugging.

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

* CGAL's "exact predicates / inexact constructions" kernels set the pattern: use doubles for constructions, but invest in robust predicates.
* J.R. Shewchuk's work on adaptive precision floating-point predicates.

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

* Handle types (branded IDs for type safety):

  ```ts
  type BodyId   = number & { __brand: "BodyId" };
  type FaceId   = number & { __brand: "FaceId" };
  type EdgeId   = number & { __brand: "EdgeId" };
  type VertexId = number & { __brand: "VertexId" };
  type LoopId   = number & { __brand: "LoopId" };
  type HalfEdgeId = number & { __brand: "HalfEdgeId" };
  ```

* Internal storage uses struct-of-arrays for performance:

  * `VertexTable`: `x`, `y`, `z` as `Float64Array`.
  * `EdgeTable`: `vStart`, `vEnd`, `curveIndex`, flags.
  * `FaceTable`: `surfaceIndex`, shell reference, orientation.
  * `Loop` & `HalfEdge` tables: capture boundary cycles and adjacency.

**Object-Oriented API**

The `TopoModel` class encapsulates the BREP data and exposes methods for all operations:

```ts
class TopoModel {
  // Entity creation
  addVertex(x: number, y: number, z: number): VertexId;
  addEdge(vStart: VertexId, vEnd: VertexId): EdgeId;
  addHalfEdge(edge: EdgeId, direction: 1 | -1): HalfEdgeId;
  addLoop(firstHalfEdge: HalfEdgeId): LoopId;
  addFace(surfaceIndex: SurfaceIndex): FaceId;
  addShell(): ShellId;
  addBody(): BodyId;
  
  // Queries
  getVertexPosition(id: VertexId): Vec3;
  getEdgeStartVertex(id: EdgeId): VertexId;
  getFaceLoops(id: FaceId): LoopId[];
  iterateBodies(): Iterable<BodyId>;
  
  // Geometry storage
  addSurface(surface: Surface): SurfaceIndex;
  addCurve(curve: Curve3D): Curve3DIndex;
}
```

This design provides:
* Clean encapsulation with methods instead of raw data access.
* Type-safe operations using branded handle IDs.
* Internal struct-of-arrays storage for performance-critical operations.

**Validation and healing**

* `validateModel(model, ctx)` returns a structured report of:

  * Non-manifold edges.
  * Cracks (edges with <2 or >2 incident faces in solids).
  * Degenerate entities (zero-area faces, very short edges).
* `healModel(model, ctx, options)` applies modest, deterministic healing:

  * Merge vertices within tolerance.
  * Remove edges/faces below size thresholds.
  * Reorient shells if needed.

SolidType aims for the **"moderate but explicit"** healing strategy found in industrial kernels: try small repairs but prefer clear failure over silent corruption.

---

### 3.4 `mesh` – Tessellation & Export

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

**STL Export**

The `export/stl.ts` module provides STL file generation:

```ts
function writeStlBinary(mesh: Mesh): ArrayBuffer;
function writeStlAscii(mesh: Mesh, name?: string): string;
```

---

### 3.5 `model` – Modeling Operators

**Responsibility**

* Implement modeling operations on top of `geom` + `topo`:

  * Primitives (boxes, cylinders for tests).
  * Sketch-based extrude (add/cut) with extent types.
  * Sketch-based revolve (add/cut).
  * Solid–solid booleans (union, subtract, intersect).

**Sketch planes & profiles**

* Planes:

  * Fundamentals: global XY, YZ, ZX.
  * Offsets from faces, custom datum planes.
  * Face-derived planes (sketch on face).
* Sketch profiles:

  * Closed 2D loops (lines + arcs) on a plane.
  * Converted to `SketchProfile` objects, validated for closure.

**Extrude & revolve**

Operations:

* `extrude(profile, distance, direction, op)`:

  * Build top & bottom caps from profile.
  * Sweep edges to form side faces.
  * Build a new body (for `add`) or tool body (for `cut`).
  * Extent types: `blind`, `throughAll`, `toFace`, `toVertex`.
* `revolve(profile, axis, angle, op)`:

  * Revolve edges around axis to create analytic surfaces of revolution.
  * Construct faces & shells accordingly.

Both operations allocate a `FeatureId` and register named subshapes with `naming` (see below).

**Solid–solid booleans**

SolidType goes directly for BREP booleans (no mesh booleans):

* Intersect candidate faces (planar-only currently).
* Build intersection curves/edges.
* Classify faces by inside/outside tests using predicates.
* Assemble result bodies by trimming and stitching.
* Run validation + limited healing.

Booleans are explicitly staged: start with **simple cases (e.g. convex boxes)**, then generalise.

**Current limitations:**
* Boolean operations currently only support planar faces.
* Curved face support (cylinders, cones from revolves) is planned.

---

### 3.6 `naming` – Persistent Naming

**Responsibility**

* Provide **persistently stable references** to faces/edges/vertices through parametric edits and modeling operations.
* Allow constraints, dimensions, and later features (fillets, chamfers) to refer to model entities without breaking on rebuild.

**Background**

The design is influenced by:

* **Kripac's mechanism** for persistently naming topological entities.
* **OpenCascade's OCAF** topological naming and shape evolution.
* **FreeCAD's topological naming improvements** (realthunder), which use graph-based and geometry-aware matching rather than pure positional indices.
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

**SketchModel class**

The `SketchModel` class provides an object-oriented API for creating and manipulating 2D sketches:

```ts
class SketchModel {
  // Point operations
  addPoint(x: number, y: number, options?): SketchPointId;
  addFixedPoint(x: number, y: number): SketchPointId;
  getPoint(pointId: SketchPointId): SketchPoint | undefined;
  setPointPosition(pointId: SketchPointId, x: number, y: number): void;
  removePoint(pointId: SketchPointId): boolean;
  
  // Entity operations
  addLine(startId: SketchPointId, endId: SketchPointId): SketchEntityId;
  addArc(startId, endId, centerId, ccw?): SketchEntityId;
  addCircle(centerX, centerY, radius): { center, arc };
  addRectangle(x, y, width, height): { corners, sides };
  
  // Profile conversion
  toProfile(): SketchProfile | null;
}
```

**Sketch entities**

* Points with coordinates `(x, y)` in sketch plane space.
* Entities:

  * `SketchLine` (start + end point).
  * `SketchArc` (start, end, centre).
* Constraints:

  * Geometric: `coincident`, `horizontal`, `vertical`, `parallel`, `perpendicular`, `equalLength`, `fixed`, `tangent`, `symmetric`.
  * Dimensional: `distance`, `angle`.
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

## 5. `@solidtype/app` – Full CAD Application

**Responsibility**

* Provide a complete, production-ready CAD application.
* Implement feature-based parametric modeling workflow.
* Offer a SolidWorks-like user experience with sketching, features, and multi-body support.

### 5.1 Application Architecture

The app is built with **React** and uses a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
│  (Toolbar, FeatureTree, PropertiesPanel, Viewer, etc.)      │
├─────────────────────────────────────────────────────────────┤
│                     React Contexts                           │
│  (Document, Kernel, Selection, Sketch, FeatureEdit)         │
├─────────────────────────────────────────────────────────────┤
│                   Document Model (Yjs)                       │
│  (Features, Sketches, Constraints, Undo/Redo)               │
├─────────────────────────────────────────────────────────────┤
│                     Web Worker                               │
│  (Kernel execution, mesh generation, rebuild)               │
├─────────────────────────────────────────────────────────────┤
│                   @solidtype/core                            │
│  (BREP kernel, solver, boolean operations)                  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Document Model

The document model uses **Yjs** for collaborative editing and undo/redo. The complete specification is in [`DOCUMENT-MODEL.md`](DOCUMENT-MODEL.md).

```ts
interface SolidTypeDoc {
  ydoc: Y.Doc;
  root: Y.Map<unknown>;              // Single root container
  meta: Y.Map<unknown>;              // Document metadata
  state: Y.Map<unknown>;             // Transient state (rebuild gate)
  featuresById: Y.Map<Y.Map>;        // UUID → feature record
  featureOrder: Y.Array<string>;     // Ordered list of feature UUIDs
}
```

**Key Design Principles:**

* **UUID identifiers** – All features and sketch elements use UUID v4
* **Y.Map records** – All records are `Y.Map` instances (never plain JS objects)
* **Single root** – All state lives under `ydoc.getMap('root')`
* **Zod validation** – Schema defined in [`schema.ts`](packages/app/src/document/schema.ts), validated on load
* **Deterministic rebuild** – Worker iterates in sorted order for reproducibility

**Schema & Validation:**

The document model is formally defined using **Zod schemas** in `packages/app/src/document/schema.ts`:

* `DocSnapshotSchema` – validates the complete `root.toJSON()` snapshot
* `FeatureSchema` – discriminated union of all feature types
* `SketchDataSchema` – validates sketch points, entities, and constraints
* Runtime invariants are checked via `validateInvariants()` in `validate.ts`

**Feature Types:**

| Type | Description |
|------|-------------|
| `origin` | Coordinate origin reference (exactly one) |
| `plane` | Datum planes with `role: 'xy'\|'xz'\|'yz'`, or custom planes |
| `sketch` | 2D sketches with points, entities, and constraints |
| `extrude` | Linear extrusion with extent types and multi-body options |
| `revolve` | Rotational sweep with multi-body options |
| `boolean` | Explicit union/subtract/intersect operations |

**Sketch Data:**

Sketches store geometry in three unordered maps (`pointsById`, `entitiesById`, `constraintsById`), each keyed by UUID. Constraints include:

* **Geometric:** coincident, horizontal, vertical, parallel, perpendicular, equalLength, tangent, symmetric, fixed
* **Dimensional:** distance, angle (with `offsetX`/`offsetY` for label positioning)

**Invariants:**

* Origin + datum planes are pinned to the start of `featureOrder`
* All feature/sketch element IDs must match their map keys
* Reference integrity is enforced (sketch refs, plane refs, constraint refs)

### 5.3 React Contexts

The app uses React Context for global state management:

| Context | Responsibility |
|---------|----------------|
| `DocumentContext` | Yjs document, features, undo/redo, feature helpers |
| `KernelContext` | Worker communication, meshes, bodies, rebuild status |
| `SelectionContext` | Selected features, faces, edges; selection mode |
| `SketchContext` | Active sketch, sketch mode, constraint application |
| `FeatureEditContext` | Feature creation/editing mode, form state |
| `ViewerContext` | Three.js scene, camera, renderer references |
| `ThemeContext` | Light/dark theme switching |

### 5.4 Component Structure

**Main Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│                        Toolbar                               │
├──────────────┬──────────────────────────┬───────────────────┤
│  FeatureTree │        Viewer            │ PropertiesPanel   │
│  (left panel)│   (3D viewport with      │ (right panel)     │
│              │    ViewCube, grid,       │                   │
│              │    sketch overlay)       │                   │
├──────────────┴──────────────────────────┴───────────────────┤
│                       StatusBar                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**

* `Toolbar` – Mode-aware toolbar with feature creation, sketch tools, and constraints
* `FeatureTree` – Hierarchical feature list with rename, suppress, delete actions
* `PropertiesPanel` – Zod-validated forms for feature editing via Tanstack Form
* `Viewer` – Three.js scene with:
  * 3D mesh rendering with per-body colors
  * CSS2D dimension annotations (draggable, editable)
  * Sketch entity visualization
  * Raycasting for 3D selection
* `ViewCube` – Interactive orientation widget
* `StatusBar` – Rebuild status, selection info, coordinate display

### 5.5 Properties Panel & Feature Editing

The properties panel uses **Zod schemas** for validation and **Tanstack Form** for state management:

```ts
// Example schema (featureSchemas.ts)
export const extrudeFormSchema = z.object({
  name: z.string().min(1),
  sketch: z.string().min(1),
  op: z.enum(['add', 'cut']),
  direction: z.enum(['normal', 'reverse']),
  extent: z.enum(['blind', 'toFace', 'toVertex', 'throughAll']),
  distance: z.number().min(0.1),
  // Multi-body options
  mergeScope: z.enum(['auto', 'new', 'specific']).optional(),
  targetBodies: z.array(z.string()).optional(),
  resultBodyName: z.string().optional(),
  resultBodyColor: z.string().optional(),
});
```

**Feature Creation Workflow:**

1. User clicks feature button (Extrude, Revolve) in toolbar
2. `FeatureEditContext` enters edit mode with default form data
3. Properties panel shows validated form with live preview
4. On Accept: feature is added to document, rebuild triggers
5. On Cancel: edit mode exits, no changes

### 5.6 Multi-Body Support

The app implements SolidWorks-like multi-body part design:

**Merge Scope Options:**

* `auto` – Automatically union with any overlapping body
* `new` – Always create a separate body
* `specific` – Union with user-selected bodies

**Body Properties:**

* **Name** – User-assignable body name (e.g., "Main Housing")
* **Color** – Per-body color displayed in 3D view

**Implementation:**

```ts
// Worker maintains body registry
interface BodyEntry {
  body: Body;
  name: string;
  color: string;
  sourceFeatureId: string;
}

const bodyMap = new Map<string, BodyEntry>();
```

### 5.7 Sketch Mode

Sketch mode provides a specialized editing environment:

* **Entry:** Double-click sketch in tree, or create new sketch on plane/face
* **Tools:** Point, Line, Rectangle, Circle, Arc tools
* **Constraints:** Coincident, horizontal, vertical, parallel, perpendicular, distance, angle, tangent, symmetric, equal length
* **Dimension Annotations:**
  * Visual display with extension lines
  * Draggable labels with persisted positions (`offsetX`, `offsetY`)
  * Double-click for inline value editing
* **Exit:** Ctrl+Enter to accept, Escape to cancel

### 5.8 Worker Integration

The kernel runs in a **Web Worker** for non-blocking UI:

```ts
// Message types (worker/types.ts)
type WorkerMessage =
  | { type: 'init'; payload: { docState: Uint8Array } }
  | { type: 'sync'; payload: { update: Uint8Array } }
  | { type: 'rebuild' }
  | { type: 'export-stl'; payload: { binary: boolean } };

type WorkerResponse =
  | { type: 'mesh'; payload: { bodyId, positions, normals, indices, color? } }
  | { type: 'bodies'; payload: BodyInfo[] }
  | { type: 'rebuild-complete' }
  | { type: 'stl-data'; payload: { data: ArrayBuffer | string } }
  | { type: 'error'; payload: { message: string } };
```

**Synchronization:**

* `YjsWorkerSync` handles Yjs document sync between main thread and worker
* Document changes trigger automatic rebuild
* Meshes and body info are sent back to main thread for rendering

---

## 6. `@solidtype/viewer` – Demo Viewer

**Responsibility**

* Provide a lightweight **WebGL/three.js**-based viewer.
* Serve as a test bed and demo for the kernel.
* Demonstrate how to run the kernel in a **Web Worker**.

**Viewer**

* Vite + TS + three.js app.
* Uses `@solidtype/core`'s OO API for modeling operations.
* Code-driven examples:

  * "Create a sketch on XY, draw rectangle, extrude, boolean union with another box."
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

## 7. Testing & Quality

**TDD-first**:

* Unit tests at each layer:

  * `num` and `geom` thoroughly unit-tested for correctness.
  * `topo` tested for invariants and healing behaviour.
  * `model` tested on canonical examples (e.g. extrude a rectangle, boolean two boxes).
  * `naming` tested on simple edit scenarios where identity must persist.
  * `sketch` tested on small constrained sketches with known solutions.
  * `app` tested for document model operations and feature helpers.

**Property-based tests (selective)**:

* For specific modules where randomisation adds clear value:

  * e.g. random small boxes for boolean classification, random simple sketches.

**Viewer/manual tests**:

* Example models in `@solidtype/viewer` serve as visual regression checks.
* Scripts that sweep parameters and verify:

  * No crashes.
  * `PersistentRef` resolution remains stable in simple param-edit scenarios.

---

## 8. Future Extensions & Open Hooks

The architecture is designed to support future work without major rewrites:

* **Geometry**:

  * Add Bezier/NURBS curves & surfaces as new `geom` types.
* **Modeling**:

  * Sweeps, lofts, shell, fillet, chamfer operations in `model`.
  * Curved face boolean support.
* **Naming**:

  * Alternative `NamingStrategy` implementations for research and comparison.
* **Numerics**:

  * Introduce exact/interval arithmetic for selected predicates.
* **Persistence**:

  * CRDT-backed model format for collaborative editing (partially implemented with Yjs).
* **High-level API**:

  * A JSX-style composition layer on top of `@solidtype/core` for declarative models.
* **AI Integration**:

  * AI-assisted modeling via chat interface and tool calling.

SolidType's core constraint is: **keep the internal data-oriented modules clean, explicit, and well-tested**, so the OO API and future research can safely build on them.
