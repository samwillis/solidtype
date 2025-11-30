# SolidType – Implementation & Testing Plan (TypeScript CAD Kernel)

## High-level architecture & packages

Monorepo (pnpm), ESM-only, with a **small number of packages**:

* `@solidtype/core` – functional, data-oriented kernel:

  * `num` – math, tolerances, predicates.
  * `geom` – curves/surfaces, evaluators.
  * `topo` – BREP representation, validation, healing.
  * `model` – modeling ops: primitives, extrude, revolve, booleans.
  * `sketch` – 2D sketch entities + constraint graph + solver.
  * `naming` – persistent naming, evolution graph, fingerprints.
  * `mesh` – tessellation to triangle meshes.
* `@solidtype/oo` – thin OO façade:

  * `SolidSession`, `Body`, `Face`, `Edge`, `Sketch` etc. wrapping core.
* `@solidtype/viewer` – WebGL/three.js demo app:

  * Code-driven examples, parameter sliders, basic inspection.

Tooling:

* **Tests**: Vitest in each package, `strict` TS.
* **Build**: tsdown for `@solidtype/core` and `@solidtype/oo`.
* **App**: Vite for `@solidtype/viewer`.

Multi-threading later: `@solidtype/core` is pure TS without DOM deps and uses serialisable data; `@solidtype/oo` / `@solidtype/viewer` provide worker wrappers later.

---

## Phase 0 – Monorepo & Tooling Skeleton

### Goals

* Set up SolidType repo with baseline tooling.
* Ensure everything is ready for TDD and later workerisation.

### Implementation

1. **pnpm workspace**

   * Root `package.json` with `"type": "module"` and `pnpm-workspace.yaml`.
   * Packages:

     * `packages/core`
     * `packages/oo`
     * `packages/viewer`

2. **Shared TS config**

   * Root `tsconfig.base.json` with `strict: true`.
   * Each package/app extends the base, sets appropriate `module`, `target`, and `paths` for internal imports.

3. **Vitest setup**

   * Add Vitest config to `@solidtype/core` and `@solidtype/oo`.
   * Ensure `pnpm test` runs all tests across the workspace.

4. **Build tooling**

   * Configure tsdown for `@solidtype/core` and `@solidtype/oo`:

     * ESM output only.
     * Preserve source maps for debugging.

5. **Vite + three.js starter**

   * In `@solidtype/viewer`, create a basic Vite app using TS.
   * Add `three` as dependency.
   * Start with a minimal scene: a spinning cube, orbit controls.

### Testing

* Basic “smoke” tests:

  * `expect(true).toBe(true)` style tests in each package to confirm Vitest wiring.
* Add a CI script (`pnpm lint && pnpm test`) to ensure future steps keep all tests green.

### Risks

* Low risk. Main risk is overcomplicating the initial structure; keep packages minimal.

---

## Phase 1 – Numeric Backbone & Tolerances (`num`)

### Goals

* Establish math primitives and a **tolerance model** based on Float64.
* Prepare for robust predicates later by centralising numerical routines.

### Implementation

1. **Vector & matrix types**

   * `@solidtype/core/src/num/vec2.ts`, `vec3.ts`, `mat4.ts`:

     * Represent vectors as small fixed tuples or small typed arrays (`[number, number]` / `Float64Array` length 3).
     * Provide basic ops: add, sub, dot, cross, scalar multiply, length, normalise.
   * Keep them **pure functions** (no classes) for hot-path friendliness.

2. **Tolerance context**

   * `@solidtype/core/src/num/tolerance.ts`:

     ```ts
     export interface Tolerances {
       length: number;  // model-space
       angle: number;   // radians
     }

     export interface NumericContext {
       tol: Tolerances;
     }
     ```
   * Provide helpers: `isZero`, `eqLength`, `eqAngle`, `clampToZero`, etc.

3. **Predicates (scaffolding)**

   * `num/predicates.ts`:

     * `orient2D`, `orient3D` (for now simple float versions).
     * Point-plane classification, distance checks.
   * Design with an eye to later upgrading to more robust versions:

     * Single entry points for important predicates.

4. **Root-finding utilities (simple)**

   * `num/rootFinding.ts`:

     * 1D Newton method and bisection for curve/surface param solving.

### Testing

* **Unit tests (strict TDD)**:

  * vec2/vec3 functions: check basic vector identities.
  * tolerance helpers: edge cases (exact, just within tol, just outside).
  * predicates: simple geometry (points on/left/right of segment, etc.).

* **Light property tests (optional)**:

  * For vectors: generate random vectors, verify `||normalize(v)|| ≈ 1`, etc.
  * For predicates: random triangles where orientation is known.

### Risks

* Relatively low. Key risk is burying tolerances directly in code; mitigate by **always using numeric helper functions** rather than naked comparisons.

---

## Phase 2 – Core Geometry Representations (`geom`)

### Goals

* Implement analytic 2D/3D curves and surfaces:

  * 2D: lines, arcs.
  * 3D: plane, cylinder, cone, sphere (torus later).
* Provide a uniform evaluation API.

### Implementation

1. **2D geometries**

   * `geom/curve2d.ts`:

     ```ts
     export type Curve2DType = "line" | "arc";

     export interface Line2D {
       kind: "line";
       p0: Vec2;
       p1: Vec2;
     }

     export interface Arc2D {
       kind: "arc";
       center: Vec2;
       radius: number;
       startAngle: number;
       endAngle: number;
       ccw: boolean;
     }

     export type Curve2D = Line2D | Arc2D;
     ```
   * Functions:

     * `evalCurve2D(curve, t: number)` (t ∈ [0,1] for lines, angle-normalised for arcs).
     * `curveTangent2D`, `curveLength2D`, `closestPointOnCurve2D`.

2. **2D line/arc intersection**

   * `geom/intersect2d.ts`:

     * Line-line intersection with tolerance.
     * Line-arc, arc-arc intersections (initially for common cases).

3. **3D surfaces**

   * `geom/surface.ts`:

     ```ts
     export type SurfaceType = "plane" | "cylinder" | "cone" | "sphere";

     export interface PlaneSurface {
       kind: "plane";
       origin: Vec3;
       normal: Vec3;
       xDir: Vec3; // defines local u-axis
       yDir: Vec3; // orthonormal to xDir, normal
     }

     // Cylinder, Cone, Sphere: centre, axis, radius(s), etc.
     ```
   * `evalSurface(surface, u, v)` → `Vec3`.
   * `surfaceNormal(surface, u, v)`.

4. **3D curves (basic)**

   * `geom/curve3d.ts`: lines and circles.
   * Evaluate, tangent, length, closest point similar to 2D.

5. **Parameterisation conventions**

   * Document parameter ranges for each surface type:

     * Plane: unbounded (we’ll clamp by trimming),
     * Cylinder: u along height, v around circumference [0, 2π),
     * Sphere: polar coords etc.

### Testing

* **Unit tests** for every evaluator:

  * Evaluate endpoints match definitions.
  * Known points on surfaces give expected normals.
  * Intersection tests for simple configurations.

* **Property-style** tests for 2D curves (light):

  * sample t from [0,1], ensure `length` approximates integral by sampling.

### Risks

* Moderate complexity; ensure **clear, documented param ranges** or later code will get messy.

---

## Phase 3 – Topology Model (BREP) & Bodies (`topo`)

### Goals

* Implement a BREP topology layer supporting:

  * Vertices, edges, half-edges, loops, faces, shells, bodies.
  * Multiple bodies per model.
  * Both open shells (surfaces) and closed solids.
* Data-oriented: **handles + tables**, not object graphs.

### Implementation

1. **Handle types**

   * In `topo/handles.ts`:

     ```ts
     export type BodyId = number & { __brand: "BodyId" };
     export type FaceId = number & { __brand: "FaceId" };
     export type EdgeId = number & { __brand: "EdgeId" };
     export type VertexId = number & { __brand: "VertexId" };
     export type LoopId = number & { __brand: "LoopId" };
     export type HalfEdgeId = number & { __brand: "HalfEdgeId" };
     ```

2. **Struct-of-arrays BREP store**

   * `topo/model.ts` with a `TopoModel` structure:

     ```ts
     interface VertexTable {
       x: Float64Array;
       y: Float64Array;
       z: Float64Array;
       // maybe reference count / flags
     }

     interface EdgeTable {
       vStart: Int32Array;
       vEnd: Int32Array;
       curveIndex: Int32Array; // index into geom curve array
       // ...
     }

     interface FaceTable {
       surfaceIndex: Int32Array;
       firstLoop: Int32Array;
       loopCount: Int32Array;
       // orientation, shell, flags...
     }

     // Similarly for loops & half-edges; loops reference a cycle of half-edges.
     ```
   * `TopoModel` includes:

     * Arrays for vertices, edges, faces, loops, half-edges, shells, bodies.
     * Arrays of `Surface` and `Curve3D` for underlying geometry or references to a separate `geomStore`.

3. **Creation & mutation API (functional core)**

   * `createEmptyModel(): TopoModel`.
   * `createBody`, `createFace`, `createEdge`, `createVertex` etc.:

     * Manage free-lists for deleted entries to avoid growth.
   * Ensure operations return **new handles** but mutate underlying arrays (for perf).

4. **Validity & invariants**

   * `topo/validate.ts`:

     * Checks:

       * Half-edge pairs are consistent.
       * Loops are closed cycles.
       * Face loops oriented consistently.
       * Solid detection: closed shells and 2-manifold property (basic check).

5. **Surface/curve storage**

   * Decide whether surfaces/curves live inside `TopoModel` or in a separate `GeomStore`.
   * For now: embed in `TopoModel` with arrays of surfaces and curves.

### Testing

* **Unit tests**:

  * Construct simple bodies (cube from 6 planar faces), verify topological invariants.
  * Ensure loops and half-edges form consistent cycles.

* **Validation tests**:

  * Deliberately construct an invalid model, expect `validateModel` to report specific issues.

### Risks

* Designing the BREP once; mistakes are sticky. Keep **APIs small and clear**, expect some refactoring but try to preserve the handle-based approach.

---

## Phase 4 – Tessellation & Early WebGL Viewer (`mesh` + `viewer`)

### Goals

* Get **something on screen quickly**, even without full sketches/constraints.
* Provide a robust path from BREP → triangle meshes → three.js.

### Implementation

1. **Face tessellation**

   * `mesh/tessellateFace.ts`:

     * For planar faces with polygon boundaries (loops of edges):

       * Project to 2D (plane local coordinates).
       * Use a polygon triangulation algorithm (ear clipping or library) to produce 2D triangles.
       * Map back to 3D via plane basis.
     * For simple analytic surfaces (cylinders, spheres):

       * Parameter-space gridding: sample u/v grid based on curvature + tolerance.
       * Construct triangle strips/quads.

   * Start with planar faces only, add cylindrical/spherical later.

2. **Body tessellation**

   * `mesh/tessellateBody(model, bodyId, options)`:

     * Calls `tessellateFace` for each face.
     * Outputs:

       ```ts
       interface Mesh {
         positions: Float32Array;
         normals: Float32Array;
         indices: Uint32Array;
       }
       ```

3. **Three.js integration**

   * In `@solidtype/viewer`:

     * Add a `MeshAdapter` that converts `Mesh` into `THREE.BufferGeometry`.
     * Basic viewer:

       * `SolidScene` React component (or plain TS) that:

         * Creates a scene, camera, lights.
         * Adds a mesh from a callback `buildDemoModel(coreAPI)`.

4. **Early demo: primitive box**

   * Implement a simple “box” creation op in `model/primitives.ts`:

     * Creates 6 planar faces + body directly in BREP.
   * Viewer calls `createBox` and tessellates it.

### Testing

* **Unit tests**:

  * Tessellate a simple square plane → 2 triangles.
  * Normals are outward and unit-length.

* **Visual sanity**:

  * Manual inspection in the viewer: a nicely lit cube, no cracks.

### Risks

* Tessellation complexity. Mitigate by starting with **only planar faces** and simple polygons.

---

## Phase 5 – Modeling Operators: Sketch Planes, Extrude, Revolve, Booleans (`model`)

### Goals

* Introduce sketch planes and profiles.
* Implement core 3D modeling ops:

  * Sketch-based extrude (add and cut).
  * Revolve (add and cut).
  * Solid–solid booleans (union, subtract, intersect).
* Still code-driven (no sketch UI yet).

### Implementation

1. **Datum planes & positioning**

   * `model/planes.ts`:

     * Represent planes as `PlaneSurface` plus named references (`PlaneId`).
     * Functions to:

       * Create planes fixed in world space.
       * Create planes offset from faces (later).
   * For now, support global XY, YZ, ZX planes for early tests.

2. **Sketch profiles (without solver)**

   * In `model/sketchProfile.ts` (or under `sketch` but initially solver-free):

     * Define a `SketchProfile` with:

       * Plane reference.
       * Ordered chain(s) of `Curve2D` segments closing into loops.
     * Provide helpers to:

       * Create a profile from code: `createRectangleProfile(width, height, plane)`.
       * Validate closure (end of each segment coincident with start of next within tol).

3. **Extrude**

   * `model/extrude.ts`:

     * Input: `SketchProfile`, distance, direction, and operation (`add`/`cut`).
   * Implementation:

     * For each loop in the profile:

       * Lift its vertices into 3D via plane’s basis.
       * Create side faces by connecting top and bottom loops.
       * Create end-cap faces.
       * Stitch into a new body (add) or a cutting tool (for cut).
     * For `cut`, call boolean subtract between target body and extruded volume.

4. **Revolve**

   * `model/revolve.ts`:

     * Input: profile, axis (in plane or 3D), angle, operation.
   * Implementation:

     * Generate surface of revolution (cylindrical/conical/spherical segments).
     * Build topology similar to extrude but revolving edges around axis.

5. **Solid–solid booleans**

   * `model/boolean.ts`:

     * Start with **planar-only booleans** (bodies made from planar faces).
     * High-level algorithm:

       * Compute face–face intersections where bounding boxes overlap.
       * Build intersection curves as 3D edges.
       * Classify faces (inside/outside/overlapping) via point classification using `predicates`.
       * Construct result BREP: select and trim faces accordingly, then stitch.
   * Data flow:

     * This will be the most complex part; initially limit supported cases to keep implementation feasible (e.g. convex vs convex, closed solids only).

### Testing

* **Unit tests**:

  * Extrude a rectangle to a box; validate number of faces, shells, closedness.
  * Cut one box from another; check volume roughly matches expectation (approximate checks).
  * Simple revolve test: profile of a rectangle rotated to yield a cylinder.

* **Behaviour tests (integration)**:

  * Code-level demos (in `@solidtype/viewer`) that call these operations, then render.

### Risks

* **Booleans** are high-risk: numerical issues, topology stitching.

  * Mitigation:

    * Start with simplest cases (axis-aligned boxes).
    * Assert invariants aggressively, fail loudly on unsupported configurations.
    * Build tests around known-good configurations.

---

## Phase 6 – Persistent Naming Subsystem (`naming`)

### Goals

* Implement a **first-class persistent naming system** that:

  * Associates semantic identities with created faces/edges.
  * Tracks evolution of subshapes through modeling steps.
  * Exposes `PersistentRef` handles for external consumers (constraints, later fillets).

### Implementation

1. **Core types**

   * `naming/types.ts`:

     ```ts
     export interface SubshapeRef {
       body: BodyId;
       type: "face" | "edge" | "vertex";
       id: FaceId | EdgeId | VertexId;
     }

     export type FeatureId = number & { __brand: "FeatureId" };

     export interface FeatureLocalSelector {
       kind: string; // e.g. "extrude.side", "extrude.topCap"
       data: Record<string, number>;
     }

     export interface GeometryTopologyFingerprint {
       centroid: Vec3;
       approxAreaOrLength: number;
       normal?: Vec3;
       // adjacency hints later
     }

     export interface PersistentRef {
       originFeatureId: FeatureId;
       localSelector: FeatureLocalSelector;
       fingerprint?: GeometryTopologyFingerprint;
     }
     ```

2. **Evolution graph**

   * `naming/evolution.ts`:

     ```ts
     export interface EvolutionMapping {
       old: SubshapeRef | null;
       news: SubshapeRef[];  // split, merge, birth
     }

     export interface NamingStrategy {
       recordBirth(featureId: FeatureId, selector: FeatureLocalSelector, subshape: SubshapeRef, fingerprint?: GeometryTopologyFingerprint): PersistentRef;
       recordEvolution(stepId: number, mappings: EvolutionMapping[]): void;
       resolve(ref: PersistentRef, model: TopoModel): SubshapeRef | null | "ambiguous";
     }
     ```
   * Implementation:

     * Store per-feature births.
     * Store per-step evolution edges.
     * When resolving:

       * Start from birth subshape(s).
       * Walk evolution steps forward.
       * Use fingerprint similarity when splits produce multiple candidates.

3. **Feature integration**

   * In `model/extrude.ts` and `revolve.ts`:

     * Each feature call gets a new `FeatureId`.
     * For each created face/edge, define a `FeatureLocalSelector`:

       * E.g. `kind: "extrude.side"`, `data: { loop: 0, segment: 2 }`.
     * Call `namingStrategy.recordBirth(...)` to obtain `PersistentRef`s for faces/edges if the caller wants them.

4. **Boolean integration**

   * When performing booleans, after classifying and constructing the new body:

     * Build `EvolutionMapping` array relating old subshapes to new ones where obvious.
     * Register them via `recordEvolution(stepId, mappings)`.

5. **OO façade hooks**

   * In `@solidtype/oo`:

     * `Body.selectFaceByRay(...)` returns `PersistentRef`.
     * `Body.resolve(ref)` returns an OO `Face` or `null`.
   * Constraints and other app-level features hold onto `PersistentRef`.

### Testing

* **Unit tests**:

  * Simple extrude:

    * Create feature, get `PersistentRef` for top face and a side edge.
    * Change height parameter, rebuild, resolve refs → still find corresponding subshapes.
  * Boolean:

    * Extrude body A, extrude body B, subtract.
    * Track a specific side face from A, ensure its descendant exists in the result.

* **Error cases**:

  * Force splits so one `PersistentRef` maps to multiple candidates → `resolve` can return `"ambiguous"`; ensure behaviour is deterministic and documented.

### Risks

* Matching heuristics can become intricate.

  * Mitigation: start with simple heuristics and clear semantics:

    * Guarantee stability for **param changes without topology events**.
    * Best-effort only for more drastic changes, but fail gracefully (not crash) and surface ambiguity.

---

## Phase 7 – Sketch Representation & 2D Constraint Solver (`sketch`)

### Goals

* Represent 2D sketches on planes.
* Implement a **robust, interactive 2D constraint solver** supporting:

  * coincident, H/V, parallel, perpendicular, equal length, fixed, distance/angle dimensions, tangency.
  * Attachments to model edges via `PersistentRef`.
* Prepare solver to run interactively (later in worker).

### Implementation

1. **Sketch data model**

   * `sketch/types.ts`:

     ```ts
     export type SketchEntityId = number & { __brand: "SketchEntityId" };
     export type SketchPointId = number & { __brand: "SketchPointId" };

     interface SketchPoint {
       x: number;
       y: number;
       fixed?: boolean;
       externalRef?: PersistentRef; // attachment to model
     }

     interface SketchLine {
       kind: "line";
       start: SketchPointId;
       end: SketchPointId;
     }

     interface SketchArc {
       kind: "arc";
       start: SketchPointId;
       end: SketchPointId;
       center: SketchPointId;
     }

     export type SketchEntity = SketchLine | SketchArc;
     ```

   * `Sketch` structure: arrays of points & entities, reference to a `PlaneSurface`.

2. **Constraint types**

   * `sketch/constraints.ts`:

     ```ts
     export type ConstraintKind =
       | "coincident"
       | "horizontal" | "vertical"
       | "parallel" | "perpendicular"
       | "equalLength"
       | "fixed"
       | "distance"
       | "angle"
       | "tangent";

     interface BaseConstraint { id: number; kind: ConstraintKind; weight?: number; }

     // e.g.:
     interface CoincidentConstraint extends BaseConstraint {
       kind: "coincident";
       p1: SketchPointId;
       p2: SketchPointId;
     }

     // similarly for others...
     ```

   * Constraints can reference **external points** derived from `PersistentRef` (for attachment).

3. **Variable graph & DOF**

   * Represent each sketch point’s coordinates as unknowns: `(x_i, y_i)`.
   * Build a **constraint graph**:

     * Nodes: points, groups.
     * Edges: constraints.
   * Partition sketch into solvable groups (connected components).

4. **Numeric solver**

   * Implement a numeric solver in `sketch/solver.ts` with:

     * Assemble equations `f(x) = 0` for constraints.
     * Use Gauss–Newton / Levenberg–Marquardt:

       * Approximate Jacobian via finite differences (start simple).
       * Iteratively minimise sum of squared constraint errors.
     * Iteration limits and convergence thresholds based on tolerances.
   * For **interactivity**:

     * Allow passing “driven” points (user dragging) and treat their coords as constraints with higher weight.
     * Solve incrementally from previous solution as initial guess.

5. **External edge attachment**

   * For a point attached to a model edge:

     * `SketchPoint.externalRef` holds a `PersistentRef`.
     * During solving:

       * Resolve the ref to a current `SubshapeRef`.
       * Compute the target point on the edge (projection) as a function (non-linear).
       * Encode that as a constraint equation (“point lies on projected location of edge”).

6. **Integration with modeling**

   * Add helper in `@solidtype/oo`:

     * `session.createSketch(plane)` → returns an OO `Sketch`.
     * `Sketch.addLine`, `Sketch.addArc`, `Sketch.addConstraint`.
     * `Sketch.solve()` → calls core solver, updates positions.

   * Modify `model/extrude.ts` to accept `Sketch` instead of raw `SketchProfile`:

     * Use final solved geometry (lines/arcs) at extrude time.

### Testing

* **Unit tests for each constraint type**:

  * Tiny sketches with known solutions (e.g. an isosceles triangle, a rectangle).
  * Verify solver converges and constraint errors are below tolerance.

* **Small composite sketches**:

  * Constrained rectangle with diagonals, parallel/perp constraints, dimensions.
  * Move one point and re-solve; ensure shapes behave as expected.

* **External attachments**:

  * Build a simple body, create a sketch on a face, attach a line endpoint to an edge via `PersistentRef`.
  * Modify body parameters slightly, rebuild, re-solve sketch; attachment remains consistent.

### Risks

* Solver convergence & stability:

  * Mitigate by:

    * Starting with small constraint sets.
    * Implementing good initial placement heuristics (e.g. keep old solution as start).
    * Clear diagnostic messages when solver fails to converge.

---

## Phase 8 – Robustness: Validation & Healing

### Goals

* Ensure models don’t “fall over completely” when edited.
* Implement moderate, explicit healing and strong validation.

### Implementation

1. **Validation API**

   * Extend `topo/validate.ts`:

     * Checks for:

       * Cracks: edges with only one face in a supposed solid.
       * Non-manifold edges: >2 faces.
       * Zero-area faces, zero-length edges.
     * Return a structured `ValidationReport`:

       ```ts
       interface ValidationIssue {
         kind: "nonManifoldEdge" | "crack" | "zeroAreaFace" | "sliverFace" | ...;
         subshape: SubshapeRef;
         details?: string;
       }
       ```

2. **Healing strategies**

   * `topo/heal.ts`:

     * Functions to:

       * Merge vertices closer than `tol.length`.
       * Collapse edges shorter than some multiple of tolerance.
       * Drop faces with area below threshold.
       * Re-orient shells to be consistently outward if possible.

   * Integrate into modeling ops:

     * After booleans and other heavy ops, call `healModel` with modest options.
     * If healing fails to produce valid solids, return a failure with diagnostics.

3. **Error handling**

   * The high-level modeling API returns:

     ```ts
     type ModelingResult<T> = { ok: true; value: T } | { ok: false; error: ModelingError };
     ```
   * `ModelingError` includes:

     * The operation (extrude, boolean, etc.).
     * Validation report.
     * Hints for UI (e.g. “intersecting edges”, “tolerance too tight”).

### Testing

* **Constructed invalid models**:

  * Create intentionally bad topologies, run validator → issues identified.

* **Healing tests**:

  * Merge near-coincident vertices → confirm fewer vertices, topology still valid.
  * Introduce very short edges and check they are removed.

* **Regression tests**:

  * For each modeling op, test that the combination of op + heal yields a valid model or a clear error, never silently corrupts.

### Risks

* Over-aggressive healing can break models.

  * Mitigate by:

    * Keeping healing minimal and well-documented.
    * Prefer returning `ok: false` with diagnostic over “heroic” auto-fix.

---

## Phase 9 – Multithreading & Web Workers

### Goals

* Ensure SolidType can run heavy modeling/solving off the UI thread.
* Provide a straightforward worker API.

### Implementation

1. **Core purity & serialisability**

   * Audit `@solidtype/core` to confirm:

     * No DOM or `window` references.
     * Primary data structures are plain objects, arrays, typed arrays.

2. **Worker host in viewer**

   * In `@solidtype/viewer`, create a `KernelWorker` module:

     * A Web Worker bundle running a mini RPC:

       * `initModel`, `runScript(code)`, `updateParam`, `getMesh`, `solveSketch`, etc.
     * Use `postMessage` with serialised commands/responses (no extra deps).

3. **API boundary**

   * Define message schema:

     ```ts
     type WorkerCommand =
       | { kind: "buildDemoModel"; params: { ... } }
       | { kind: "updateParam"; id: string; value: number }
       | { kind: "getMesh"; bodyId: number }
       | { kind: "solveSketch"; sketchId: number; dragPoint?: ... }
       ;
     ```
   * Worker responds with meshes, status, errors.

4. **Threading for solver**

   * When interactive editing is introduced:

     * The sketch UI will send “drag events” to worker.
     * Worker runs solver, returns updated sketch geometry.

### Testing

* **Worker unit tests (node’s worker_threads or jsdom)**:

  * Spin up worker, send commands, ensure responses are correct.
* **Latency tests**:

  * Measure simple operations to ensure worker overhead is acceptable.

### Risks

* Complexity of RPC. Mitigate by starting with a **very small command set** and only widening as needed.

---

## Phase 10 – Performance Tuning, Documentation, & Future Extensions

### Goals

* Tighten hot paths where easy.
* Document architecture and module boundaries.
* Outline extensions: sweeps, fillets, Beziers, CRDT, JSX layer.

### Implementation

1. **Performance profiling**

   * Add benchmarks in `@solidtype/core/bench`:

     * Rebuild a parametric model with 10s–100s of faces.
     * Solve sketches with 10s–100s of constraints.
   * Simple Node/Browser timings.

2. **Low-hanging optimisations**

   * Check numeric hot spots (e.g. tessellation, intersection).
   * Ensure typed arrays are used in tight loops.
   * Avoid unnecessary object allocation in inner loops.

3. **Documentation**

   * `docs/architecture.md`:

     * Overview of packages and layers.
     * Explanation of numeric model, BREP design, naming strategy, solver.
   * `docs/testing.md`:

     * Testing strategy, examples, how to add new tests.

4. **Future work roadmap (not implemented yet)**

   * **Phase 11+ ideas:**

     * Sweeps & lofts.
     * Fillets & chamfers (edge-following, tangency).
     * Bezier/NURBS curves/surfaces (v1.2+).
     * Richer robust predicates and maybe partial exact arithmetic.
     * CRDT-based model representation for collaboration.
     * JSX composition layer (`<Sketch>` / `<Extrude>` components) as application-level API.

### Testing

* Ensure performance benchmarks are part of CI (but not gating for early phases, just informative).
* Validate examples and demos still pass all tests after optimisation.

---

## Risk & Complexity Summary

**Hardest parts & strategy to stage them:**

1. **Solid–solid booleans**

   * Stage: start planar-only, convex/simple cases.
   * Heavy use of validation + healing.
   * Add complexity gradually (curved surfaces, more arbitrary shapes).

2. **Persistent naming**

   * Stage: guarantee stability for simple param edits first.
   * Add robust evolution mapping and fingerprints as usage expands (e.g. from constraints to fillets).

3. **2D constraint solver**

   * Stage: small constraint sets & simple sketches.
   * Only afterwards, wire into interactive UI / worker.
   * Keep solver modular to swap/improve algorithm if needed.

4. **Numerical robustness**

   * Stage: Float64 + tolerances from day one.
   * Centralise predicates to later introduce robust variants without wide code changes.

5. **Threading**

   * Stage: whole kernel in a worker first (chunky tasks).
   * Defer fine-grained multithreading until there’s a real need and profiling data.

---

## Bottom line

SolidType’s path is: **clear functional core → BREP + tessellation → early viewer → core modeling ops → persistent naming → serious sketch solver → robustness + workers**, all in pure TypeScript with TDD at each step, designed from the outset to grow into a genuinely world-class kernel rather than a toy.
