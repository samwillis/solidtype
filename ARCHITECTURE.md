# SolidType Architecture

## 1. Purpose & Goals

SolidType is a **TypeScript CAD application** powered by OpenCascade.js, aimed at delivering a **world-class parametric CAD experience** in the JS/TS ecosystem (Node + browser), with:

- History-capable **parametric modeling** (sketch + feature driven).
- Robust **BREP operations** via OpenCascade.js (battle-tested C++ kernel compiled to WebAssembly).
- Strong, research-informed **persistent naming** (planned integration with OCCT).
- A serious, interactive **2D sketch constraint solver** (pure TypeScript).
- Modern **AI integration** for intelligent modeling assistance.
- Good **developer ergonomics** (clean layers, TDD, small number of packages).

This document explains how the kernel is structured, how data flows, and where major responsibilities live.

---

## 2. High-Level Layout

SolidType is a pnpm monorepo with a **small number of packages**:

- `@solidtype/core` – the CAD kernel wrapper with an object-oriented API.
- `@solidtype/app` – the main React application with full CAD UI.

Everything is ESM-only. `@solidtype/core` has no DOM/browser dependencies and is designed to run in **Node** or in a **Web Worker**.

### 2.1 Public API (Object-Oriented)

`@solidtype/core` exposes an ergonomic, class-based API as the primary interface:

- `SolidSession` – main entry point for modeling operations (wraps OCCT).
- `Sketch` – 2D sketch with constraint solving (pure TypeScript).
- `BodyId`, `FaceId`, `EdgeId` – opaque handles for topological entities.

**Key principle: The app consumes our clean API, not OCCT directly.**

### 2.2 Internal Modules

Inside `@solidtype/core` we have logical submodules:

- `api/` – **PUBLIC API** - SolidSession, Sketch, and types exported to app.
- `kernel/` – **INTERNAL** - OpenCascade.js wrappers (not exported from package).
- `num/` – numeric utilities, tolerances, predicates, root-finding.
- `geom/` – 2D curves for sketch construction.
- `sketch/` – 2D sketch entities + constraint system + solver (pure TypeScript).
- `naming/` – persistent naming & evolution graph (for future OCCT integration).
- `model/` – datum planes, sketch profiles.
- `export/` – file format exporters (STL, STEP via OCCT).

The `@solidtype/app` uses only the public API from core to provide real-time modeling.

### 2.3 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      @solidtype/app                          │
│   React UI • Feature Tree • Sketch Editor • AI Chat          │
│   Three.js Viewer • Collaboration • File Management          │
│                                                              │
│   Uses ONLY: SolidSession, Sketch, SketchProfile, etc.       │
│   Does NOT know about: OCCT, TopoDS_Shape, BRepAlgoAPI       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      @solidtype/core                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PUBLIC API (api/)                        │   │
│  │                                                       │   │
│  │  SolidSession        - Main modeling session          │   │
│  │  Sketch, Constraint  - 2D sketch system               │   │
│  │  BodyId, FaceId      - Opaque handles                 │   │
│  │  Mesh                - Tessellated output             │   │
│  │                                                       │   │
│  │  This is the ONLY layer the app imports from core.    │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              INTERNAL: kernel/ (private)              │   │
│  │                                                       │   │
│  │  init.ts             - OCCT WASM initialization       │   │
│  │  Shape.ts            - Wrapper with memory mgmt       │   │
│  │  primitives.ts       - Box, cylinder, sphere          │   │
│  │  operations.ts       - Extrude, revolve, boolean      │   │
│  │  tessellate.ts       - Shape → Mesh conversion        │   │
│  │  sketch-to-wire.ts   - SketchProfile → OCCT Face      │   │
│  │  io.ts               - STEP/BREP import/export        │   │
│  │                                                       │   │
│  │  NOT exported from @solidtype/core package.           │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              OUR CODE (pure TypeScript)               │   │
│  │                                                       │   │
│  │  sketch/             - 2D sketch & constraints        │   │
│  │  naming/             - Persistent naming system       │   │
│  │  num/                - Numeric utilities              │   │
│  │  geom/               - 2D geometry for sketches       │   │
│  │  model/              - Planes, profiles               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  opencascade.js (WASM)                       │
│     npm package: opencascade.js                              │
│     Production B-Rep kernel with 30+ years of development    │
│                                                              │
│     Hidden behind kernel/ layer - app never touches this.   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. `@solidtype/core` – Functional Kernel

### 3.1 `num` – Numeric Layer & Tolerances

**Responsibility**

- Provide basic linear algebra, root-finding, and **tolerance-aware** comparison.
- Centralise **geometric predicates** (orientation tests, classification) so they can be upgraded to robust algorithms later.

**Key design choices**

- All geometry uses **Float64** (`number`), not arbitrary-precision.
- Each model has a **tolerance context**:

  ```ts
  interface Tolerances {
    length: number; // absolute distance tolerance
    angle: number; // radians
  }

  interface NumericContext {
    tol: Tolerances;
  }
  ```

- All equality / near-equality decisions go through helper functions:
  - `isZero`, `eqLength`, `eqAngle`, etc.

- Predicates (e.g. `orient2D`, point-vs-plane) live in `num/predicates.ts`:
  - Start as straightforward Float64 implementations.
  - Architecture allows later replacement with **robust predicates** (e.g. Shewchuk-style adaptive arithmetic).

**References / inspiration**

- CGAL's "exact predicates / inexact constructions" kernels set the pattern: use doubles for constructions, but invest in robust predicates.
- J.R. Shewchuk's work on adaptive precision floating-point predicates.

---

### 3.2 `geom` – Curves & Surfaces

**Responsibility**

- Represent analytic 2D/3D curves and 3D surfaces.
- Evaluate positional and differential quantities (points, tangents, normals).
- Provide basic intersection kernels for simple cases.

**Initial geometry set**

- 2D:
  - `Line2D` (segment defined by endpoints).
  - `Arc2D` (circle arc defined by centre, radius, angle span).

- 3D curves:
  - `Line3D`.
  - `Circle3D`.

- 3D surfaces:
  - `PlaneSurface`.
  - `CylinderSurface`.
  - `ConeSurface`.
  - `SphereSurface`.

**API style**

- Types are plain objects (no classes).
- Evaluators are pure functions:

  ```ts
  function evalCurve2D(c: Curve2D, t: number): Vec2;
  function evalCurve3D(c: Curve3D, t: number): Vec3;
  function evalSurface(s: Surface, u: number, v: number): Vec3;
  function surfaceNormal(s: Surface, u: number, v: number): Vec3;
  ```

- Intersection helpers:
  - 2D: line–line, line–arc, arc–arc.
  - 3D: ray–plane, ray–sphere, etc., expanding as needed.

**Why separate from topology?**

This keeps geometry:

- **Testable** in isolation (no BREP involved).
- **Reusable** if topology representation changes.
- Easier to later add new surface types (e.g. NURBS) without touching BREP or modeling operators.

---

### 3.3 `kernel/` – OpenCascade.js Integration (Internal)

**Responsibility**

- Wrap OpenCascade.js (OCCT) for all B-Rep operations.
- Handle WASM initialization and memory management.
- Provide a clean internal API that `SolidSession` uses.

**Why OCCT?**

OpenCascade is a production-grade B-Rep kernel with 30+ years of development:

- Battle-tested boolean operations that work on all geometry orientations.
- Support for complex surface types (NURBS, sweeps, lofts).
- Used by FreeCAD, KiCad, and commercial products.
- Frees us to focus on SolidType's differentiators: AI, UX, parametrics.

**Module structure (internal - not exported)**

```
kernel/
├── init.ts             # OCCT WASM initialization
├── Shape.ts            # TopoDS_Shape wrapper with memory management
├── primitives.ts       # Box, cylinder, sphere, cone, torus
├── operations.ts       # Boolean ops, extrude, revolve, fillet, chamfer
├── sketch-to-wire.ts   # SketchProfile → OCCT Face conversion
├── tessellate.ts       # Shape → Mesh for Three.js rendering
├── io.ts               # STEP/BREP import/export
└── opencascade.d.ts    # Type declarations for opencascade.js
```

**Memory management**

OCCT objects must be manually deleted to prevent memory leaks:

```ts
class Shape {
  private _shape: TopoDS_Shape;
  private _disposed = false;

  dispose(): void {
    if (!this._disposed) {
      this._shape.delete();
      this._disposed = true;
    }
  }
}
```

**Key design principle**

The kernel layer is an implementation detail. The app never imports from `kernel/` - all access goes through `SolidSession` in `api/`.

---

### 3.4 Tessellation & Export

**Tessellation**

OCCT's `BRepMesh_IncrementalMesh` handles tessellation with quality controls:

```ts
session.tessellate(bodyId, "low" | "medium" | "high");
```

Quality presets control linear and angular deflection:

- `low` - Fast, coarse mesh for preview
- `medium` - Balanced quality for interactive use
- `high` - Fine mesh for export and rendering

**Output format**

```ts
interface Mesh {
  positions: Float32Array; // xyzxyz...
  normals: Float32Array; // same length as positions
  indices: Uint32Array; // triangle indices
}
```

**Export formats**

- **STL** - Via `export/stl.ts` (binary and ASCII)
- **STEP** - Via OCCT's STEPControl_Writer (native CAD exchange)

---

### 3.5 `model/` – Profiles & Planes

**Responsibility**

- Define datum planes for sketch placement.
- Define sketch profiles for extrusion/revolution.
- Convert between our 2D sketch representation and OCCT faces.

**Datum planes**

Standard planes and custom plane creation:

```ts
// Standard planes
XY_PLANE, YZ_PLANE, ZX_PLANE

// Custom planes
session.createDatumPlane(origin, normal, xDir?);
```

**Sketch profiles**

Closed 2D loops for modeling operations:

```ts
interface SketchProfile {
  plane: DatumPlane;
  loops: ProfileLoop[]; // First = outer, rest = holes
}
```

**Modeling operations (via OCCT)**

All B-Rep operations are now handled by OpenCascade.js:

- **Primitives**: `BRepPrimAPI_MakeBox`, `MakeCylinder`, `MakeSphere`
- **Extrude**: `BRepPrimAPI_MakePrism`
- **Revolve**: `BRepPrimAPI_MakeRevol`
- **Booleans**: `BRepAlgoAPI_Fuse`, `BRepAlgoAPI_Cut`, `BRepAlgoAPI_Common`
- **Fillet**: `BRepFilletAPI_MakeFillet`
- **Chamfer**: `BRepFilletAPI_MakeChamfer`

This replaces our custom boolean implementation which had numerical stability issues with tilted geometry.

---

### 3.6 `naming` – Persistent Naming

> **📘 Comprehensive Implementation Plan**: See [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md) for detailed algorithm specification, data structures, and phased implementation plan based on FreeCAD's approach.

**Responsibility**

- Provide **persistently stable references** to faces/edges/vertices through parametric edits and modeling operations.
- Allow constraints, dimensions, and later features (fillets, chamfers) to refer to model entities without breaking on rebuild.

**Background**

The design is influenced by:

- **Kripac's mechanism** for persistently naming topological entities.
- **OpenCascade's OCAF** topological naming and shape evolution.
- **FreeCAD's topological naming improvements** (realthunder), which use graph-based and geometry-aware matching rather than pure positional indices.
- Surveyed research recommending **hybrid topology+geometry** approaches.

**Core abstractions**

- `SubshapeRef` – ephemeral handle (body + type + id).
- `FeatureId` – identifies a modeling feature (extrude, revolve, boolean…).
- `FeatureLocalSelector` – feature-specific path to a sub-entity:
  - e.g. `{ kind: "extrude.side", data: { loop: 0, segment: 2 } }`.

- `GeometryTopologyFingerprint` – compact descriptor:
  - approximate centroid, area/length, normal, adjacency hints.

- `PersistentRef` – stable handle exposed to callers:

  ```ts
  interface PersistentRef {
    originFeatureId: FeatureId;
    localSelector: FeatureLocalSelector;
    fingerprint?: GeometryTopologyFingerprint;
  }
  ```

**Evolution graph**

- Modeling ops provide `EvolutionMapping` records:

  ```ts
  interface EvolutionMapping {
    old: SubshapeRef | null; // null = birth
    news: SubshapeRef[];
  }
  ```

- A `NamingStrategy` interface encapsulates:
  - `recordBirth(featureId, localSelector, subshape, fingerprint?)`.
  - `recordEvolution(stepId, mappings)`.
  - `resolve(ref, model): SubshapeRef | "ambiguous" | null`.

**Usage**

- Feature creation:
  - When extrude/revolve creates faces/edges, they declare their semantic role and register births.

- Booleans:
  - Register old→new subshape correspondences per step.

- Consumers (constraints, dimensions, UI):
  - Store only `PersistentRef`.
  - On rebuild, call `resolve` to find the current `SubshapeRef`.

The strategy is intentionally **pluggable** to allow experimentation with different algorithms and heuristics.

---

### 3.7 `sketch` – Sketch Representation & 2D Constraint Solver

**Responsibility**

- Represent 2D sketches on planes.
- Provide a **constraint system and numeric solver** for interactive sketching.

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
  addCircle(centerX, centerY, radius): { center; arc };
  addRectangle(x, y, width, height): { corners; sides };

  // Profile conversion
  toProfile(): SketchProfile | null;
}
```

**Sketch entities**

- Points with coordinates `(x, y)` in sketch plane space.
- Entities:
  - `SketchLine` (start + end point).
  - `SketchArc` (start, end, centre).

- Constraints:
  - Geometric: `coincident`, `horizontal`, `vertical`, `parallel`, `perpendicular`, `equalLength`, `fixed`, `tangent`, `symmetric`.
  - Dimensional: `distance`, `angle`.

- Attachments:
  - A point can hold an `externalRef: PersistentRef` linking it to a model edge/vertex.

**Solver**

- Build a **constraint graph**:
  - Nodes: points / groups.
  - Edges: constraints.

- Partition into connected components for independent solving.
- Numeric approach:
  - Nonlinear least-squares (Gauss–Newton / Levenberg–Marquardt style).
  - Equations defined per constraint; residuals minimised against tolerance thresholds.
  - Use previous solution as initial guess for incremental changes (interactivity).

This roughly aligns with how industrial 2D constraint modules (e.g. Siemens D-Cubed 2D DCM) behave: general-purpose nonlinear solver, constraint graph decomposition, and DOF analysis.

The solver is intended to run in a **worker** for responsive UI.

---

## 4. Public API (in `@solidtype/core/api`)

**Responsibility**

- Provide an ergonomic, class-based API as the primary interface for applications.
- Completely hide the underlying OCCT implementation.
- Provide clean TypeScript types for all operations.

**SolidSession - Main Entry Point**

```ts
class SolidSession {
  // Lifecycle
  async init(): Promise<void>; // Load OCCT WASM
  dispose(): void; // Free all resources

  // Primitives
  createBox(width, height, depth, centered?): BodyId;
  createCylinder(radius, height): BodyId;
  createSphere(radius): BodyId;

  // Sketch-based operations
  createSketch(plane: DatumPlane): Sketch;
  extrude(profile, options): OperationResult<BodyId>;
  revolve(profile, options): OperationResult<BodyId>;

  // Boolean operations
  union(bodyA, bodyB): OperationResult<BodyId>;
  subtract(bodyA, bodyB): OperationResult<BodyId>;
  intersect(bodyA, bodyB): OperationResult<BodyId>;

  // Modifications
  fillet(bodyId, options): OperationResult<void>;
  chamfer(bodyId, distance): OperationResult<void>;

  // Query
  tessellate(bodyId, quality?): Mesh;
  getBoundingBox(bodyId): BoundingBox;

  // Import/Export
  exportSTEP(bodyId): Uint8Array;
  importSTEP(data): OperationResult<BodyId>;
}
```

**Sketch - 2D Constraint Solving (Pure TypeScript)**

```ts
class Sketch {
  addPoint(x: number, y: number): SketchPointId;
  addLine(start: SketchPointId, end: SketchPointId): SketchEntityId;
  addArc(start, end, center, ccw?): SketchEntityId;
  addRectangle(x, y, width, height): { corners; sides };
  addConstraint(constraint: Constraint): void;
  solve(): SolveResult;
  toProfile(): SketchProfile | null;
}
```

**Opaque Handles**

Bodies, faces, and edges are identified by opaque branded IDs:

```ts
type BodyId = number & { readonly __brand: "BodyId" };
type FaceId = number & { readonly __brand: "FaceId" };
type EdgeId = number & { readonly __brand: "EdgeId" };
```

**Result Types**

Operations return typed results:

```ts
type OperationResult<T> = { success: true; value: T } | { success: false; error: ModelingError };
```

**Why This Design?**

- **Swappable implementation**: OCCT could be replaced without app changes.
- **Clean types**: Simple TypeScript, not C++ conventions.
- **Testable**: Kernel can be mocked for unit tests.
- **Stable interface**: OCCT API changes don't break the app.

---

## 5. `@solidtype/app` – Full CAD Application

**Responsibility**

- Provide a complete, production-ready CAD application.
- Implement feature-based parametric modeling workflow.
- Offer a SolidWorks-like user experience with sketching, features, and multi-body support.

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
  root: Y.Map<unknown>; // Single root container
  meta: Y.Map<unknown>; // Document metadata
  state: Y.Map<unknown>; // Transient state (rebuild gate)
  featuresById: Y.Map<Y.Map>; // UUID → feature record
  featureOrder: Y.Array<string>; // Ordered list of feature UUIDs
}
```

**Key Design Principles:**

- **UUID identifiers** – All features and sketch elements use UUID v4
- **Y.Map records** – All records are `Y.Map` instances (never plain JS objects)
- **Single root** – All state lives under `ydoc.getMap('root')`
- **Zod validation** – Schema defined in [`schema.ts`](packages/app/src/document/schema.ts), validated on load
- **Deterministic rebuild** – Worker iterates in sorted order for reproducibility

**Schema & Validation:**

The document model is formally defined using **Zod schemas** in `packages/app/src/document/schema.ts`:

- `DocSnapshotSchema` – validates the complete `root.toJSON()` snapshot
- `FeatureSchema` – discriminated union of all feature types
- `SketchDataSchema` – validates sketch points, entities, and constraints
- Runtime invariants are checked via `validateInvariants()` in `validate.ts`

**Feature Types:**

| Type      | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `origin`  | Coordinate origin reference (exactly one)                    |
| `plane`   | Datum planes with `role: 'xy'\|'xz'\|'yz'`, or custom planes |
| `sketch`  | 2D sketches with points, entities, and constraints           |
| `extrude` | Linear extrusion with extent types and multi-body options    |
| `revolve` | Rotational sweep with multi-body options                     |
| `boolean` | Explicit union/subtract/intersect operations                 |

**Sketch Data:**

Sketches store geometry in three unordered maps (`pointsById`, `entitiesById`, `constraintsById`), each keyed by UUID. Constraints include:

- **Geometric:** coincident, horizontal, vertical, parallel, perpendicular, equalLength, tangent, symmetric, fixed
- **Dimensional:** distance, angle (with `offsetX`/`offsetY` for label positioning)

**Invariants:**

- Origin + datum planes are pinned to the start of `featureOrder`
- All feature/sketch element IDs must match their map keys
- Reference integrity is enforced (sketch refs, plane refs, constraint refs)

### 5.3 React Contexts

The app uses React Context for global state management:

| Context              | Responsibility                                       |
| -------------------- | ---------------------------------------------------- |
| `DocumentContext`    | Yjs document, features, undo/redo, feature helpers   |
| `KernelContext`      | Worker communication, meshes, bodies, rebuild status |
| `SelectionContext`   | Selected features, faces, edges; selection mode      |
| `SketchContext`      | Active sketch, sketch mode, constraint application   |
| `FeatureEditContext` | Feature creation/editing mode, form state            |
| `ViewerContext`      | Three.js scene, camera, renderer references          |
| `ThemeContext`       | Light/dark theme switching                           |

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

- `Toolbar` – Mode-aware toolbar with feature creation, sketch tools, and constraints
- `FeatureTree` – Hierarchical feature list with rename, suppress, delete actions
- `PropertiesPanel` – Zod-validated forms for feature editing via Tanstack Form
- `Viewer` – Three.js scene with:
  - 3D mesh rendering with per-body colors
  - CSS2D dimension annotations (draggable, editable)
  - Sketch entity visualization
  - Raycasting for 3D selection
- `ViewCube` – Interactive orientation widget
- `StatusBar` – Rebuild status, selection info, coordinate display

### 5.5 Properties Panel & Feature Editing

The properties panel uses **Zod schemas** for validation and **Tanstack Form** for state management:

```ts
// Example schema (featureSchemas.ts)
export const extrudeFormSchema = z.object({
  name: z.string().min(1),
  sketch: z.string().min(1),
  op: z.enum(["add", "cut"]),
  direction: z.enum(["normal", "reverse"]),
  extent: z.enum(["blind", "toFace", "toVertex", "throughAll"]),
  distance: z.number().min(0.1),
  // Multi-body options
  mergeScope: z.enum(["auto", "new", "specific"]).optional(),
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

- `auto` – Automatically union with any overlapping body
- `new` – Always create a separate body
- `specific` – Union with user-selected bodies

**Body Properties:**

- **Name** – User-assignable body name (e.g., "Main Housing")
- **Color** – Per-body color displayed in 3D view

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

- **Entry:** Double-click sketch in tree, or create new sketch on plane/face
- **Tools:** Point, Line, Rectangle, Circle, Arc tools
- **Constraints:** Coincident, horizontal, vertical, parallel, perpendicular, distance, angle, tangent, symmetric, equal length
- **Dimension Annotations:**
  - Visual display with extension lines
  - Draggable labels with persisted positions (`offsetX`, `offsetY`)
  - Double-click for inline value editing
- **Exit:** Ctrl+Enter to accept, Escape to cancel

### 5.8 Worker Integration

The kernel runs in a **Web Worker** for non-blocking UI:

```ts
// Message types (worker/types.ts)
type WorkerMessage =
  | { type: "init"; payload: { docState: Uint8Array } }
  | { type: "sync"; payload: { update: Uint8Array } }
  | { type: "rebuild" }
  | { type: "export-stl"; payload: { binary: boolean } };

type WorkerResponse =
  | { type: "mesh"; payload: { bodyId; positions; normals; indices; color? } }
  | { type: "bodies"; payload: BodyInfo[] }
  | { type: "rebuild-complete" }
  | { type: "stl-data"; payload: { data: ArrayBuffer | string } }
  | { type: "error"; payload: { message: string } };
```

**Synchronization:**

- `YjsWorkerSync` handles Yjs document sync between main thread and worker
- Document changes trigger automatic rebuild
- Meshes and body info are sent back to main thread for rendering

---

## 6. Testing & Quality

**TDD-first**:

- Unit tests at each layer:
  - `num` and `geom` thoroughly unit-tested for correctness.
  - `topo` tested for invariants and healing behaviour.
  - `model` tested on canonical examples (e.g. extrude a rectangle, boolean two boxes).
  - `naming` tested on simple edit scenarios where identity must persist.
  - `sketch` tested on small constrained sketches with known solutions.
  - `app` tested for document model operations and feature helpers.

**Property-based tests (selective)**:

- For specific modules where randomisation adds clear value:
  - e.g. random small boxes for boolean classification, random simple sketches.

**Manual tests**:

- Example models in `@solidtype/app` serve as visual regression checks.
- Scripts that sweep parameters and verify:
  - No crashes.
  - `PersistentRef` resolution remains stable in simple param-edit scenarios.

---

## 7. Future Extensions & Open Hooks

The architecture is designed to support future work without major rewrites:

- **Geometry**:
  - Add Bezier/NURBS curves & surfaces as new `geom` types.

- **Modeling**:
  - Sweeps, lofts, shell, fillet, chamfer operations in `model`.
  - Curved face boolean support.

- **Naming**:
  - Alternative `NamingStrategy` implementations for research and comparison.

- **Numerics**:
  - Introduce exact/interval arithmetic for selected predicates.

- **Persistence**:
  - CRDT-backed model format for collaborative editing (partially implemented with Yjs).

- **High-level API**:
  - A JSX-style composition layer on top of `@solidtype/core` for declarative models.

- **AI Integration**:
  - AI-assisted modeling via chat interface and tool calling.

SolidType's core constraint is: **keep the internal data-oriented modules clean, explicit, and well-tested**, so the OO API and future research can safely build on them.
