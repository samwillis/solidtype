# SolidType – Project Overview

## 1. What SolidType Is

SolidType is a **modern, history-capable, parametric CAD application** powered by OpenCascade.js (OCCT), designed to deliver a world-class CAD experience in the JS/TS ecosystem (browser + Node).

At its core, SolidType is:

* A **parametric modeling system** using the battle-tested OpenCascade.js B-Rep kernel (WASM).
* A **2D sketch + 3D feature** system: sketches on planes, extrude/cut/revolve from profiles.
* A **pure TypeScript constraint solver** for interactive 2D sketching.
* A platform for **AI-assisted modeling** through chat-based tool calling.
* A foundation for **persistent naming** and robust editing.

**Why OpenCascade.js?**

After extensive development of a custom TypeScript B-Rep kernel, we made the strategic decision to integrate OpenCascade.js:

* **Proven reliability**: OCCT has 30+ years of development, used by FreeCAD, KiCad, and commercial products.
* **Numerical stability**: Our custom boolean operations had issues with tilted/angled geometry; OCCT handles all cases correctly.
* **Focus on differentiators**: This frees us to focus on SolidType's unique value: AI integration, modern UX, and the 2D constraint solver.

---

## 2. Scope and Non-Goals (for v1 / 1.x)

### In scope (early)

* Analytic geometry only:

  * 2D: lines, circular arcs.
  * 3D: planes, cylinders, cones, spheres (torus later).
* BREP representation:

  * Vertices, edges, half-edges, loops, faces, shells, bodies.
  * Both surface bodies (open shells) and closed solids, multiple bodies per model.
* Modeling operations:

  * Sketches on planes (code-driven at first).
  * Extrude (add / cut).
  * Revolve (add / cut).
  * Solid–solid booleans (planar/simpler cases first, then extended).
  * Primitive creation (box, cylinder, etc.).
* Sketch & constraints:

  * 2D sketch entities: points, lines, arcs.
  * Constraints: coincident, horizontal/vertical, parallel, perpendicular, equal length, fixed, distance/angle dimensions, tangency.
  * Attachments from sketch points to model edges (via persistent naming).
  * Interactive solving (suitable for “drag a point and watch it move”).
* Persistent naming:

  * Strong emphasis on naming that survives parametric edits and simple topology changes, inspired by the best available research (Kripac, OCAF, FreeCAD/realthunder, etc.). ([ScienceDirect][1])
* Environments:

  * Runs in **Node** and **browser**.
  * First-class support for running in a **Web Worker** to avoid blocking the UI.
* App:

  * A **three.js**-based React app with full CAD UI as the first “consumer” of the kernel.
  * Feature-based parametric modeling with visual mesh output.
  * Optional STL export.

### Out of scope (for now)

* Assemblies and mates.
* NURBS / full spline surfaces (Bezier/NURBS planned for v1.2+).
* Expression language for parameters (use JS/TS expressions at app level instead).
* Full-blown file format / CRDT-based sync (explicitly future work).
* Feature tree UI and history editing (these sit above the kernel).

---

## 3. Architectural Layers & Packages

SolidType uses a **small number of packages**, each with clear responsibilities:

1. `@solidtype/core` – the CAD kernel wrapper:

   * **Public API** (`api/`):
     * `SolidSession` – main entry point for modeling operations.
     * `Sketch` – 2D sketch with constraint solving.
     * `BodyId`, `FaceId`, `EdgeId` – opaque handles for topology.
   
   * **Internal Kernel** (`kernel/` - not exported):
     * Wraps OpenCascade.js (OCCT WASM)
     * Handles memory management for OCCT objects
     * Converts between our types and OCCT types
   
   * **Pure TypeScript Modules**:
     * `sketch/` – 2D sketch entities + constraint solver.
     * `naming/` – persistent naming (for future OCCT integration).
     * `num/` – numeric helpers, tolerances.
     * `geom/` – 2D curves for sketch construction.
     * `model/` – datum planes, sketch profiles.
     * `export/` – STL export.

2. `@solidtype/app` – the CAD application:

   * React-based UI with feature tree and properties panel.
   * Three.js 3D viewer with sketch overlay.
   * AI chat interface for modeling assistance.
   * Yjs document model for undo/redo and collaboration.

Everything is ESM-only, with **Vitest** for tests, **tsdown** for library builds, and **pnpm** for monorepo management.

---

## 4. Geometry & Topology Foundations

### 4.1 Numeric model and tolerances

SolidType uses **Float64 everywhere** for stored geometry, but with an explicit **tolerance model**:

* Model-level tolerances:

  * `tol.length` for distances.
  * `tol.angle` for angles (radians).
* All comparisons go through helpers (e.g. `eqLength`, `isZero`, `eqAngle`) rather than raw `===` or arbitrary `1e-9`.

This follows the mainstream practice in industrial kernels (Parasolid, ACIS, etc.), which rely on double precision plus carefully managed tolerances rather than full arbitrary-precision everywhere. A parallel in open CG libraries is CGAL’s idea of *exact predicates, inexact constructions* kernels: **predicates are made robust, but constructions still use floats**. ([doc.cgal.org][2])

We deliberately isolate **geometric predicates** (orientation tests, point/plane classification, etc.) in a dedicated `num/predicates` module. This makes it possible to:

* Start with straightforward Float64 implementations.
* Later upgrade to **Shewchuk-style robust predicates** (adaptive precision, exact sign of determinants) without rewriting the rest of the kernel. ([people.eecs.berkeley.edu][3])

References / inspiration:

* CGAL kernel documentation on exact predicates / inexact constructions. ([doc.cgal.org][2])
* Shewchuk’s “Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates”. ([people.eecs.berkeley.edu][3])

### 4.2 Analytic geometry (v1)

We initially support **analytic** curve/surface types only:

* 2D: lines, circular arcs.
* 3D curves: lines, circles.
* 3D surfaces: plane, cylinder, cone, sphere.

Each type has a clear parameterisation (`t` for curves, `(u,v)` for surfaces) and an evaluator:

* `evalCurve2D(curve, t)` → point.
* `evalSurface(surface, u, v)` → point, plus `surfaceNormal(surface, u, v)`.

These live in `geom/*` modules and are independent of topology, making them easy to unit-test in isolation.

### 4.3 BREP topology

Topology is managed by the `TopoModel` class, which provides an object-oriented API while using internal struct-of-arrays storage for performance:

* Branded handle types: `BodyId`, `FaceId`, `EdgeId`, `VertexId`, `LoopId`, `HalfEdgeId`.
* OO methods for all operations:
  * `model.addVertex(x, y, z)` → `VertexId`
  * `model.addEdge(vStart, vEnd)` → `EdgeId`
  * `model.getVertexPosition(id)` → `Vec3`
  * `model.getFaceLoops(id)` → `LoopId[]`
  * `model.iterateBodies()` → iteration over all bodies

Internal storage uses TypedArrays (`Float64Array`, `Int32Array`) for cache-friendly access during heavy operations like tessellation and validation.

We support:

* Multiple bodies per model.
* Open shells (surface bodies) and closed shells (solids).
* Validation routines to check for:

  * Closed loops, consistent half-edge pairing.
  * Non-manifold edges, zero-area faces, etc.

---

## 5. Persistent Naming & Edit Robustness

The overarching requirement is: **you can build a model, edit parameters, and your references don’t all explode**.

SolidType’s naming design draws on several strands of prior work:

* **Kripac’s Topological ID System**, which ties entity identity to the *construction history* (feature + local context), not just “Face27”. ([ScienceDirect][1])
* **OpenCascade’s OCAF** (`TNaming_NamedShape`), which records “old → new” shape pairs across operations to track sub-shape evolution. ([dev.opencascade.org][4])
* **FreeCAD’s topological naming problem and realthunder’s improvements**, which highlight the pitfalls of naïve “Face1/Edge2” naming and introduce graph-based, history-aware naming schemes. ([wiki.freecad.org][5])
* A broader **survey of persistent naming mechanisms** in CAD literature, which concludes that hybrid topology+geometry approaches dominate. ([ScienceDirect][6])

### 5.1 Layered identity model

SolidType distinguishes:

* **Ephemeral IDs**: numeric handles (`FaceId`, `EdgeId`, …) valid within a single build.
* **Persistent references**: `PersistentRef` objects with:

  * `originFeatureId` – which feature introduced the entity.
  * `localSelector` – feature-specific path like “side face from loop 0, segment 2”.
  * Optional geometry/topology fingerprint (centroid, approximate area/length, normal, adjacency hints).

External systems (constraints, dimensions, later fillets) never hold raw face indices; they always hold `PersistentRef`.

### 5.2 Evolution graph

Each modeling step (extrude, revolve, boolean, etc.) produces an **evolution mapping**:

* For each subshape:

  * `old` (or `null` for births),
  * `news[]` (zero, one, many descendants).

Over time, SolidType maintains a graph similar to OCAF’s “old/new shape” pairs. ([dev.opencascade.org][7])
When resolving a `PersistentRef`, we:

1. Start from the originating feature’s subshape(s).
2. Walk forward along evolution mappings to the current model.
3. Use fingerprints as tie-breakers in splits/merges; return:

   * A unique subshape if found,
   * `"ambiguous"` or `"lost"` when identity can’t be recovered reliably.

### 5.3 Feature-domain naming

Where possible, SolidType keeps references in **feature space**:

* “Cylindrical side face of Extrude#5 from profile edge #2” is much more stable than “Face19 of Body3”.
* For sketches attached to edges, we resolve selections into feature-local selectors and only translate them to final BREP entities on demand.

This architecture is intentionally **pluggable**: `NamingStrategy` is an interface, making it straightforward to experiment with alternative algorithms inspired by research papers or FreeCAD/realthunder’s approach.

---

## 6. Sketching & Constraint Solving

SolidType includes a **serious 2D sketch constraint solver**, not a toy.

### 6.1 Sketch model

Each sketch:

* Lives on a **plane** (datum or model face).
* Owns:

  * A set of points (unknowns: `x`, `y` in plane coordinates).
  * A set of entities: lines and arcs referencing these points.
  * A set of constraints linking points and entities.
* May attach some points to external model edges via `PersistentRef` (for “point on edge” / projection constraints).

### 6.2 Constraint set (v1)

Supported constraints:

* geometric: `coincident`, `horizontal`, `vertical`, `parallel`, `perpendicular`, `equal length`, `tangent`.
* structural: `fixed` points.
* dimensional: distances and angles between points/lines.

This aims roughly at the class of constraints handled by commercial 2D DCM components (e.g. Siemens’ D-Cubed 2D DCM), widely used in professional CAD for parametric sketching. ([Siemens Digital Industries Software][8])

### 6.3 Solver design

We treat the sketch as a **nonlinear system**:

* Variables: coordinates of free points (and potentially parameters like radii).
* Equations: constraint residuals (length differences, angle differences, distance to a line, etc.).
* Solving:

  * Partition into connected components (constraint graph).
  * Use a Gauss–Newton / Levenberg–Marquardt style iterative solver:

    * Finite-difference Jacobian initially (upgradeable later).
    * Tolerance-based convergence; iteration caps.
  * Use the previous solution as the initial guess for **interactive edits**.

The solver is designed to run in a **worker** for responsiveness, but architecturally it’s just a pure function `solveSketch(sketch, context) → updated positions`.

---

## 7. Modeling Operations

SolidType’s geometric operators build directly on `geom`, `topo`, `naming`, and (for sketch-driven features) `sketch`.

### 7.1 Sketch planes & profiles

* Datum planes:

  * World planes (XY, YZ, ZX).
  * Later: planes offset from faces or oriented by axes.
* Sketch profiles:

  * Closed loops of lines/arcs in 2D.
  * Lifted into 3D via plane basis for extrusion/revolution.

### 7.2 Extrude / revolve

* **Extrude**:

  * Take a solved sketch profile on a plane.
  * Generate:

    * Side faces (swept edges).
    * Top & bottom caps.
  * Output:

    * New body (`add`) or cutting tool (`cut`) used in a boolean subtract.

* **Revolve**:

  * Revolve sketch around an axis to create:

    * Cylindrical, conical, spherical segments.
  * Similar topological pattern: swept edges → surfaces of revolution; caps where needed.

Each feature allocates a `FeatureId` and registers semantic births with the `NamingStrategy` so faces/edges can be tracked across edits.

### 7.3 Solid–solid booleans

SolidType goes straight to **BREP booleans**, not mesh booleans:

* Intersect candidate faces (initially planar).
* Build intersection curves and edges.
* Classify faces (inside/outside) using robust predicates.
* Construct result bodies by trimming and stitching faces.
* Run validation + modest healing:

  * Merge near-duplicate vertices.
  * Remove vanishingly small edges/faces.
  * Check manifoldness.

Early versions will have **explicit limitations** (e.g. simple convex solids, planar faces only) but share the same architecture as more general booleans.

---

## 8. Environments, Worker Model, and Viewer

### 8.1 Environments

SolidType is designed to run:

* In **Node.js**, for batch processing, tests, and CLI tools.
* In the **browser**, in main thread or Web Worker.
* With no DOM dependencies in `@solidtype/core`.

The typical front-end integration:

* A worker hosts a `SolidSession`.
* UI sends modeling / parameter-change / sketch-edit commands.
* Worker responds with updated meshes and metadata.

### 8.2 App

The first consumer is `@solidtype/app`:

* Vite + React + three.js app.
* Feature-based parametric modeling with full CAD UI.
* Sketch canvas (2D overlay) driven by the same sketch model and solver.
* Interactive selection returning `PersistentRef`s.

---

## 9. Testing Philosophy

SolidType is built with **TDD as default**:

* Unit tests for:

  * `num` and `geom` primitives (vectors, curves, surfaces, predicates).
  * `topo` invariants (valid shells, loop orientation).
  * `model` ops (extrude/revolve/booleans on small canonical examples).
  * `sketch` solver (small constrained sketches).
  * `naming` (edit scenarios where refs must remain valid).

* Light, targeted property tests where they clearly pay off:

  * e.g. random simple booleans with boxes, random small sketches with a few constraints.

* Visual/manual checks:

  * Example models rendered in the app.
  * Scripts that rebuild models with parameter sweeps to test persistent naming stability.

Property-based testing is used **sparingly**: correctness is primarily driven by precise, curated unit tests that double as documentation for expected behaviour.

---

## 10. Inspirations & References (for further reading)

A non-exhaustive list of useful references you (or an LLM) can consult for concepts and design inspiration:

* **Persistent naming & topological IDs**

  * J. Kripac, *“A mechanism for persistently naming topological entities in history-based parametric solid models”*, Computer-Aided Design 29(2), 1997. ([ScienceDirect][1])
  * S.H. Farjana, S. Han, *“Mechanisms of Persistent Identification of Topological Entities in CAD Systems: A Review”*, 2018. ([ScienceDirect][6])
  * OpenCascade OCAF and `TNaming_NamedShape` documentation (shape evolution graphs). ([dev.opencascade.org][4])
  * FreeCAD documentation and realthunder’s wiki on the topological naming problem and his algorithm. ([wiki.freecad.org][5])

* **Numerical robustness & predicates**

  * CGAL kernel docs: exact predicates / inexact constructions. ([doc.cgal.org][2])
  * J.R. Shewchuk, *“Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates.”* ([people.eecs.berkeley.edu][3])

* **Constraint solving**

  * Siemens D-Cubed 2D DCM – widely used commercial 2D sketch constraint solver (for understanding industrial expectations of a “serious” solver). ([Siemens Digital Industries Software][8])

These are not dependencies; they’re **reference points** SolidType can learn from and aim to match or improve upon.

---

If you’d like, I can now turn this into an actual `overview.md` + a matching `architecture.md` skeleton with headings and TODOs that an LLM agent can fill out module by module.

[1]: https://www.sciencedirect.com/science/article/pii/S0010448596000401?utm_source=chatgpt.com "A mechanism for persistently naming topological entities in ..."
[2]: https://doc.cgal.org/latest/Kernel_23/classCGAL_1_1Exact__predicates__inexact__constructions__kernel.html?utm_source=chatgpt.com "Exact_predicates_inexact_constr..."
[3]: https://people.eecs.berkeley.edu/~jrs/papers/robust-predicates.pdf?utm_source=chatgpt.com "Robust Adaptive Floating-Point Geometric Predicates"
[4]: https://dev.opencascade.org/doc/refman/html/class_t_naming___named_shape.html?utm_source=chatgpt.com "TNaming_NamedShape Class Reference"
[5]: https://wiki.freecad.org/Topological_naming_problem?utm_source=chatgpt.com "Topological naming problem"
[6]: https://www.sciencedirect.com/science/article/pii/S1110016818300814?utm_source=chatgpt.com "Mechanisms of Persistent Identification of Topological ..."
[7]: https://dev.opencascade.org/doc/occt-6.9.1/refman/html/class_t_naming___named_shape.html?utm_source=chatgpt.com "TNaming_NamedShape Class Reference"
[8]: https://plm.sw.siemens.com/en-US/plm-components/d-cubed/2d-dcm/?utm_source=chatgpt.com "D-Cubed 2D DCM"
