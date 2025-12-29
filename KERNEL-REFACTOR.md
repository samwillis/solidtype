# KERNAL REFACTOR

## Overview

This refactor is a deliberate “kernel reset” to get SolidType onto a real, robust B-Rep foundation. Today we have surfaces, topology, and tessellation that can make solids *look* right, but the kernel lacks the two things a production CAD kernel is built on: **UV-first trimming (p-curves)** and a **boundary-evaluation boolean pipeline**. Without those, curved faces can’t be trimmed reliably, booleans can’t split faces/edges correctly, and downstream operations become fragile.

The refactor is organised as **three big landings** (no backward compatibility, and `packages/viewer` is removed — only `packages/app` and `packages/core` remain):

1. **Foundation:** make the B-Rep structurally correct by promoting `Curve2D` into `TopoModel`, adding **p-curves per halfedge**, enforcing **SameParameter/SameRange** (with validation), and switching tessellation to be **trim-driven** (UV loops → triangulation with holes → lift to surface). This forces correctness early and makes rendering reflect the true model.
2. **Planar Booleans:** replace the boolean stub with a real **planar boundary-evaluation** implementation (intersect → imprint/split via planar arrangement → classify → select → stitch/merge/heal → validate) backed by **robust predicates** (Shewchuk-grade) so results are watertight and stable.
3. **Curved Booleans:** extend the same pipeline to curved faces by generating **surface intersection curves** (stored initially as polylines with matched UV samples), imprinting them in UV using the same arrangement code, and classifying via BVH ray casting for pragmatic robustness. This unlocks high-value workflows like drilling holes and slicing cylinders/spheres.

The key design choice that keeps this tractable is a v1 parameter convention: **all edge segments use `t ∈ [0,1]`**, and splitting creates new curve records (no subranges yet). Combined with direction-aware halfedge sampling, this makes SameParameter checks, UV loop assembly, tessellation, and boolean stitching far simpler to implement and test.

## Core kernel laws (invariants)
These are non-negotiable; encode them as validators early.

### Law 1 — Segment-local parameter: `t ∈ [0,1]` everywhere (v1)
Your current `evalCurve2D/3D` uses normalised `t`. We keep that and **codify**:
- Every *topological Edge is one parametric segment* with `tStart=0`, `tEnd=1`.
- When splitting edges, create **new curve records** (each with its own 0..1), rather than using subranges on shared curves.
This avoids parameter convention fights and simplifies SameParameter and tessellation.

### Law 2 — Each HalfEdge has a p-curve on its Face (UV trimming)
- Edge has 3D curve `C(t)`.
- Each HalfEdge on a Face has a **p-curve** `P(t)` in that Face’s `(u,v)` domain.
- p-curve uses the *same* `t` parameter as the edge curve (“SameParameter” discipline).

This is exactly how mature kernels treat curve-on-surface / pcurves. :contentReference[oaicite:1]{index=1}

### Law 3 — SameParameter + SameRange are enforced (validate now, fix later)
For sampled `t`:
- `C(t)` must coincide with `S(P(t))` within tolerance.
- edge range and pcurve range must match (in v1 both are [0,1]).

OCCT makes this an explicit analysis/fix concern (`ShapeAnalysis_Edge`, `ShapeFix_Edge::FixSameParameter`). :contentReference[oaicite:2]{index=2}

### Law 4 — Faces are UV-first trimmed surfaces
Face boundary = loops of pcurves in UV. Any 3D vertices are derived/validated.

### Law 5 — Booleans follow boundary evaluation
Pipeline:
1) intersect
2) imprint/split
3) classify pieces IN/OUT/ON
4) select by op
5) stitch/merge/heal
6) validate

This is the classic “boundary evaluation and merging” approach (PADL) and BOOLE’s “compute boundaries of the result” approach. :contentReference[oaicite:3]{index=3}

### Law 6 — Robust predicates are mandatory for imprinting
Planar arrangements need robust `orient2d`/segment intersection or you’ll get cracks/slivers. Shewchuk predicates are the canonical reference. :contentReference[oaicite:4]{index=4}

---

# STEP 0 — Repo hygiene: remove viewer
**Outcome:** only `packages/app` is the UI. No split-brain maintenance.

- Delete `packages/viewer/`.
- Remove from workspace config and any root scripts.
- Fix any imports in `packages/app` that referenced viewer types/components.
- Ensure CI builds:
  - `packages/core`
  - `packages/app`

---

# STEP 1 — Foundation landing
**Outcome:** UV-trimmed B-Rep foundation: p-curves everywhere, SameParameter validation, trim-driven tessellation (holes supported), and modelling ops produce analytic edges/pcurves. App runs on new mesh output.

## 1.1 Refactor module layout (single canonical home)
You’re already close. Make it explicit and remove duplicates:

```
packages/core/src/
topo/
TopoModel.ts
validate.ts
heal.ts
geom/
curve2d.ts
curve3d.ts
surface.ts
surfaceUv.ts
mesh/
tessellateFace.ts
triangulateUv.ts
model/
extrude.ts
revolve.ts
```

## 1.2 Promote Curve2D to TopoModel + add PCurve + HalfEdge.pcurveId
### 1.2.1 Data additions
- `TopoModel._curves2d: Curve2D[]`
- `TopoModel._pcurves: PCurveTable`
- `HalfEdgeTable.pcurve: Int32Array`

### 1.2.2 Use existing curve tags; add polyline kinds now
**Add early** so Step 3 can land cleanly without “tiny line segment spam”.

```ts
// geom/curve2d.ts
export type Curve2D =
  | { kind: 'line'; a: Vec2; b: Vec2 }
  | { kind: 'arc'; center: Vec2; r: number; a0: number; a1: number; ccw: boolean }
  | { kind: 'polyline'; pts: Vec2[] };

// geom/curve3d.ts
export type Curve3D =
  | { kind: 'line'; a: Vec3; b: Vec3 }
  | { kind: 'circle'; center: Vec3; n: Vec3; r: number; xAxis?: Vec3 } // (store basis if helpful)
  | { kind: 'polyline'; pts: Vec3[] };
````

**Polyline eval rule (important):**

* Interpret `t` by arc-length parameterisation across segments.
* Cache cumulative lengths for speed.

## 1.3 SameParameter validation suite (expanded)

OCCT treats “edge curve + pcurve + vertices consistency” as a primary validity axis. ([Open CASCADE][1])
Implement three checks:

### 1.3.1 Check A — max deviation (23 samples)

```ts
// t samples: i/22 for i=0..22
maxDev = max(|evalCurve3D(C,t) - evalSurface(S, evalCurve2D(P,t))|)
assert(maxDev <= tol.sameParameter)
```

### 1.3.2 Check B — curve endpoints match vertex positions

```ts
assertClose(vertex(edge.v0), evalCurve3D(C, 0), tol.vertexOnCurve)
assertClose(vertex(edge.v1), evalCurve3D(C, 1), tol.vertexOnCurve)
```

### 1.3.3 Check C — UV loop closure at shared vertices (direction-aware)

HalfEdge direction already exists; use it.

```ts
function uvStart(he): Vec2 { return evalCurve2D(P, he.dir > 0 ? 0 : 1); }
function uvEnd(he): Vec2   { return evalCurve2D(P, he.dir > 0 ? 1 : 0); }

for each loop:
  for each consecutive he, heNext:
    assertClose(uvEnd(he), uvStart(heNext), tol.uvJoin)
```

## 1.4 Direction-aware sampling helper (no duplicate endpoints!)

This is a classic triangulation killer; enforce a single helper and reuse everywhere.

```ts
function sampleHalfEdgeUv(model, heId, chordTol): Vec2[] {
  const pcId = model.getHalfEdgePCurve(heId);
  if (!pcId) throw new Error('Missing pcurve');

  const dir = model.getHalfEdgeDirection(heId); // +1 or -1
  const pc = model.getPCurve(pcId);
  const c2 = model.getCurve2D(pc.curve2dIndex);

  let pts = sampleCurve2D(c2, chordTol); // includes both endpoints, t=0..1
  if (dir < 0) pts = pts.reverse();

  pts.pop(); // IMPORTANT: avoid dup endpoints across halfedges
  return pts;
}
```

## 1.5 Canonical surface inverse mapping (`surfacePointToUV`)

You can’t do UV-first trimming reliably without this.
Create `geom/surfaceUv.ts` with analytic inverses for:

* plane
* cylinder
* cone
* sphere
  (torus later)

Implementation notes:

* For periodic surfaces (cylinder/sphere param seam), return **unwrapped u** when needed.
* Add `canonicalizeUV(surface, uv)` for display only; do not canonicalise stored pcurves.

## 1.6 Tessellation becomes trim-driven and must support holes in Step 1

Because Step 2 booleans will introduce holes, tessellation must support polygon-with-holes *before* booleans land.

### 1.6.1 Triangulation choice: Earcut (recommended)

Earcut handles holes robustly and is commonly used; vendor it and wrap it.

### 1.6.2 Tessellation pipeline (UV → triangles → lift)

```ts
loopsUv = face.loops.map(loop => sampleLoop(loop))
{ outer, holes } = classifyOuterAndHoles(loopsUv)
tri = triangulateUv(outer, holes) // earcut
verts3 = tri.uvs.map(uv => evalSurface(S, uv.u, uv.v))
```

Where:

* `sampleLoop` walks halfedges, uses `sampleHalfEdgeUv`, closes once at end.
* `classifyOuterAndHoles` uses signed area in UV to separate outer boundary and holes.

## 1.7 Modelling ops: produce analytic edges and pcurves (big refactor)

Today extrude/revolve “polygonise” sketch curves into vertices. Step 1 flips that:

### Rule: one sketch segment → one topological Edge

* Sketch line → `Curve3D.line`
* Sketch arc → `Curve3D.circle` (or arc-on-circle encoded by endpoints; still segment-local)

Attach pcurves:

* Planar faces: pcurves are the sketch curves in plane UV
* Cylindrical side faces: boundary circle edges get *UV line* pcurves (constant v, varying u)

This matches the pcurve-per-face model used in kernels like OCCT. ([Open CASCADE][1])

## 1.8 App changes required in Step 1 (since viewer removed)

* Update `packages/app/src/worker/kernel.worker.ts` to the refactored core APIs.
* Ensure worker never silently ignores failures; emit feature errors.
* Update any rendering assumptions (mesh topology will change due to UV-driven triangulation).

## 1.9 Step 1 tests (must pass)

**Core:**

* `validate_box_has_pcurves_everywhere`
* `validate_sameparameter_max_dev`
* `validate_edge_endpoints_match_curve`
* `validate_uv_loop_closure_direction_aware`
* `tessellate_supports_holes_smoke` (synthetic face with a hole)
* `extrude_polygon_emits_analytic_edges_and_pcurves`

**App:**

* Open doc, extrude, revolve — viewport shows meshes, no NaNs.

---

# STEP 2 — Key improvements landing: real planar booleans

**Outcome:** Replace boolean stub with true planar boundary evaluation booleans (imprint/classify/select/merge), using robust predicates and explicit topology stitching. CUT works for planar polyhedra, preview matches final.

**Current Status (Dec 2024):** ✅ Axis-aligned geometry works correctly. ⚠️ Tilted geometry produces non-manifold edges due to floating-point precision issues in UV projection. See section 2.11 for details and next steps.

This step follows the classic boundary evaluation + merging architecture (PADL boundary evaluation) and matches BOOLE’s approach of computing trimmed surface boundaries as the result. ([UR Research][2])

## 2.1 Robust predicates behind your existing `num/predicates.ts`

Planar imprinting requires robust `orient2d` and robust segment intersection. Shewchuk is canonical. ([EECS Berkeley][3])
Pragmatic choice: vendor `mourner/robust-predicates` and expose wrappers from `num/predicates.ts`.

Minimum API:

* `orient2d(a,b,c): number` (robust sign)
* `segSegHit(...) -> none | point | overlap`

**Status (Dec 2024):** ✅ Implemented. `mourner/robust-predicates` integrated into `num/predicates.ts`. Used in `intersect.ts` for `orient2DRobust`, `pointInPolygon`, `clipLineToPolygon`, and segment intersection detection. However, robust predicates alone don't solve tilted geometry issues—the problem is floating-point errors in coordinate transformations (UV projection/unprojection), not in the geometric tests themselves.

## 2.2 Planar boolean pipeline modules

Create:

```
packages/core/src/boolean/planar/
  intersect.ts
  imprint/
    splitSegments.ts
    dcel.ts
    extractLoops.ts
  classify.ts
  select.ts
  stitch.ts
  heal.ts
```

## 2.3 Intersection (planar): plane-plane line + clipping

For face pair (A,B):

* If planes not parallel: compute intersection line.
* Clip line against each face polygon (in local plane 2D).
* Overlap the clipped intervals → intersection segment(s).

This provides “imprint segments” to split each face.

## 2.4 Imprint: DCEL-lite planar arrangement

Use DCEL-like planar subdivision to:

* split segments at intersections
* build directed halfedges with twins
* sort outgoing edges around each vertex
* set `next` pointers via “turn-left” rule
* extract bounded cycles (outer + holes)

DCEL is the standard representation for planar subdivisions/arrangements.

Key pseudocode for `next`:

```ts
for each halfedge h:
  ht = twin(h)
  v = org(ht) // destination vertex of h
  out = sortedOutgoing(v)
  idx = indexOf(out, ht)
  next = out[(idx - 1 + out.length) % out.length] // turn-left
  h.next = next
  next.prev = h
```

## 2.5 Classification: point membership (planar)

Boundary evaluation relies on set membership classification. ([UR Research][2])

For each split face piece:

* pick an interior point (triangulate 2D region; take triangle centroid)
* offset along face normal slightly (avoid ON ambiguity)
* ray cast against the other solid’s faces (odd-even)
* if within tolerance of boundary plane and inside polygon → ON

## 2.6 Selection rules

* UNION: keep OUT pieces from both
* INTERSECT: keep IN pieces from both
* SUBTRACT A\B: keep A OUT; keep B IN but flip orientation

Document ON/coplanar rules explicitly as regularised booleans (discard dangling lower-dimensional artifacts). ([UR Research][2])

## 2.7 **Stitching pass** (explicit and non-optional)

After imprinting A and B, you will have coincident edges/verts duplicated. Without stitching, manifold validation fails.

### 2.7.1 Edge match key (planar v1)

Key by:

* snapped endpoint positions (3D)
* adjacent plane ids (since planar only)
* (optional) edge direction-agnostic signature

Then unify:

* redirect halfedges from duplicate edge → canonical edge
* delete duplicate edge record

This step is part of "merging" in boundary evaluation literature. ([UR Research][2])

**Status (Dec 2024):** ✅ Implemented in `stitch.ts` via `setupTwinsByPosition`. Uses position-based matching with tolerance to find twin half-edges. Works correctly for axis-aligned geometry. ⚠️ For tilted geometry, floating-point errors in UV unprojection cause intersection segment endpoints from different faces to not coincide, leaving half-edges without twins. Added `snapIntersectionEndpoints` in `planarBoolean.ts` as a mitigation, but full fix requires computing intersection endpoints in 3D before projecting to UV (see section 2.11).

## 2.8 Heal/validate

* weld vertices within `tol.mergeVertex`
* merge colinear edges (angle+distance tol)
* delete sliver faces
* validate manifoldness (each edge has 2 incident halfedges)

Shape healing as a first-class phase is heavily emphasised in OCCT docs. ([Open Cascade][4])

## 2.9 App changes required in Step 2

* Worker CUT preview should run subtract (planar) and preview resulting mesh.
* Feature errors should be shown in UI consistently.

## 2.10 Step 2 tests (must pass)

**Core:**

* `union_overlapping_boxes_creates_new_faces_edges`
* `subtract_boxes_is_manifold_after_stitch`
* `intersect_boxes_is_closed`
* `coplanar_overlap_regularised`
* fuzz: random jittered boxes (N=50–200) → manifold OR explicit diagnostic failure dump

**App:**

* box then cut with another extrude → preview and final match visually (bbox/tri count checks).

---

## 2.11 Tilted Geometry Robustness (Current Status + Next Steps)

**Status:** Planar booleans work correctly for axis-aligned geometry. Non-axis-aligned (tilted) geometry produces non-manifold edges and incorrect results.

### 2.11.1 Root Causes Identified

1. **Floating-point errors in UV projection/unprojection**
   - `projectToPlane` and `unprojectFromPlane` use floating-point arithmetic
   - When intersection segments are computed on face A and face B separately, the endpoints don't perfectly coincide in 3D
   - This causes twin matching to fail in `setupTwinsByPosition`, leaving unpaired half-edges

2. **Endpoint snapping is insufficient**
   - We added `snapIntersectionEndpoints` to cluster and average nearby intersection segment endpoints
   - This helps but doesn't fully resolve the issue because snapping happens too late (after projection errors accumulate)

3. **Sutherland-Hodgman polygon clipping limitations**
   - `clipPolygonToPolygon` uses Sutherland-Hodgman algorithm
   - This algorithm only works correctly for **convex** clipping polygons
   - Concave tool profiles will produce incorrect intersection segments

4. **Tolerance propagation**
   - Different stages use different tolerances (`ctx.tol`, vertex welding tolerance, twin matching tolerance)
   - Tolerances that work for axis-aligned geometry are too tight for tilted geometry where floating-point errors accumulate

### 2.11.2 Next Steps (Priority Order)

**Step A: 3D-space intersection computation (highest priority)**
- Compute intersection segment endpoints in 3D space first
- Snap endpoints to a consistent 3D position before projecting to UV
- This ensures both faces see exactly the same segment endpoints

```ts
// Conceptual approach:
function computeFaceIntersectionRobust(faceA, faceB) {
  // 1. Compute plane-plane intersection line in 3D
  const line3D = intersectPlanes(planeA, planeB);
  
  // 2. Clip line to both faces in 3D (not UV)
  const segA = clipLineToFace3D(line3D, faceA);
  const segB = clipLineToFace3D(line3D, faceB);
  
  // 3. Intersect intervals in 3D → single canonical segment
  const seg3D = intersectSegments3D(segA, segB);
  
  // 4. Project canonical 3D endpoints to UV for each face
  const segUvA = projectSegmentToUV(seg3D, faceA);
  const segUvB = projectSegmentToUV(seg3D, faceB);
}
```

**Step B: Canonical plane basis generation**
- Ensure `projectToPlane` uses a deterministic, numerically stable basis
- Consider using the plane equation coefficients directly to generate basis vectors
- Avoid cross-products with arbitrary vectors that can produce different results for nearly-parallel inputs

**Step C: Replace Sutherland-Hodgman with robust polygon clipping**
- Options:
  - Weiler-Atherton algorithm (handles concave polygons)
  - Martinez et al. polygon clipping (robust, handles all cases)
  - Use the DCEL arrangement machinery directly for clipping
- Must use robust predicates throughout

**Step D: Vertex welding in 3D before stitching**
- After computing all intersection segments, weld nearby 3D positions globally
- This creates a consistent vertex set across all faces
- Then project welded vertices to UV for each face

**Step E: Tolerance strategy**
- Define a single "model tolerance" that propagates through all stages
- Scale tolerance based on model bounding box for robustness
- Consider using exact rational arithmetic for intersection computations (more complex but eliminates floating-point issues)

### 2.11.3 Testing Tilted Geometry

Add these test cases once fixed:

* `tilted_box_subtract_produces_valid_mesh` — tool at 20° angle
* `diagonal_cut_through_box_produces_watertight_mesh` — 45° cut
* `arbitrary_angle_union_is_manifold` — two boxes at random orientations
* fuzz: random rotation matrices applied to boxes → manifold

---

# STEP 3 — Curved B-Rep + curved booleans

**Outcome:** Curved surfaces participate in booleans via intersection curves + UV imprinting. Start with plane cuts of quadrics (cylinder/sphere/cone).

This step keeps the exact same boolean architecture as Step 2; only intersection generation changes. This is consistent with BOOLE-style and boundary-evaluation pipelines for sculptured solids. ([Bren School of ICS][5])

## 3.1 Surface inverses must be solid

Ensure `surfacePointToUV` is correct for:

* plane
* cylinder
* cone
* sphere
  Torus later.

## 3.2 Intersection curve representation (polyline + UV samples)

Use the polyline curve kinds added in Step 1:

* store 3D intersection as `Curve3D.polyline`
* store each face pcurve as `Curve2D.polyline`

This prevents “thousands of tiny edges” and keeps trimming coherent.

## 3.3 Surface pair priority

Implement in this order:

1. plane–cylinder
2. plane–sphere
3. plane–cone
   Then optionally:
4. cylinder–cylinder

## 3.4 Intersection generation method (v1)

Prefer analytic+sampling for plane–quadric:

* compute intersection conic/circle in 3D
* sample points along it
* compute UV samples on each surface via `surfacePointToUV`
* build polyline curve records

For harder pairs later, consider marching/tracing, but start analytic.

If you want “exact curved booleans” later, look at systems like ESOLID (exact boundary evaluation for low-degree curved solids) as inspiration for why exactness is expensive. ([Gamma Web][6])

## 3.5 Imprint in UV (reuse the same DCEL machinery)

Convert `Curve2D.polyline` into UV segments and run the same DCEL/arrangement splitting and loop extraction—now in UV space.

## 3.6 Seams and unwrapped UV

* do not canonicalise U while trimming
* store unwrapped U in pcurves
* ensure earcut and DCEL tolerate large U

## 3.7 Classification (v1 pragmatic)

For curved bodies, ray cast against a BVH built over tessellation triangles for membership classification. Upgrade to analytic ray-surface later if needed.

## 3.8 Healing upgrades

If SameParameter deviation grows (polyline drift), implement a mild fix:

* project sampled 3D points back to surface → rebuild UV polyline pcurve
  This mirrors the “analyse then fix” shape-healing model. ([Open CASCADE][7])

## 3.9 App changes required in Step 3

* enable arc-based cut workflows (drill holes)
* optional capability messaging

## 3.10 Step 3 tests (must pass)

**Core:**

* `box_subtract_cylinder_drill` (cyl hole, circular trims)
* `sphere_plane_cap` (cap + disk)
* seam-crossing cylinder trim doesn’t break tessellation
* manifold + SameParameter validations pass after heal

**App:**

* circular sketch extrude cut through box works; preview matches final.

---

## Appendix: why these references matter

* **Shewchuk** provides the robust sign computations you need for planar arrangements and segment intersection classification. ([EECS Berkeley][3])
* **Requicha & Voelcker (PADL)** describes the boundary evaluation pipeline and emphasises the “delicate modules” are splitting/classification/merging. ([UR Research][2])
* **BOOLE** is an explicit boundary evaluation system for Boolean combinations producing trimmed B-reps, matching the “compute intersection → trim → merge” architecture. ([Bren School of ICS][5])
* **OCCT ShapeAnalysis/ShapeFix** documents the practical reality: SameParameter/SameRange violations happen, and tooling exists to analyse and fix. That informs our validation + heal phases. ([Open CASCADE][1])
* **DCEL references** describe the canonical data structure and traversal rules for planar subdivisions used in imprinting.
* **Earcut** provides a small, reliable polygon-with-holes triangulation, required as soon as booleans produce holes.
* **ESOLID** is useful as a cautionary reference for exact curved boundary evaluation complexity (helps guide “polyline v1” decisions). ([Gamma Web][6])

[1]: https://dev.opencascade.org/doc/refman/html/class_shape_analysis___edge.html?utm_source=chatgpt.com "ShapeAnalysis_Edge Class Reference"
[2]: https://urresearch.rochester.edu/fileDownloadForInstitutionalItem.action?itemFileId=1173&itemId=990&utm_source=chatgpt.com "boolean operations in solid modelling: boundary evaluation ..."
[3]: https://people.eecs.berkeley.edu/~jrs/papers/robustr.pdf?utm_source=chatgpt.com "Adaptive Precision Floating-Point Arithmetic and Fast ..."
[4]: https://old.opencascade.com/doc/occt-7.5.0/overview/html/occt_user_guides__shape_healing.html?utm_source=chatgpt.com "Open CASCADE Technology: Shape Healing"
[5]: https://www.ics.uci.edu/~gopi/PAPERS/BOOLE.pdf?utm_source=chatgpt.com "BOOLE: A Boundary Evaluation System for Boolean ..."
[6]: https://gamma-web.iacs.umd.edu/papers/documents/articles/2003/keyser03b.pdf?utm_source=chatgpt.com "ESOLID – A System for Exact Boundary Evaluation"
[7]: https://dev.opencascade.org/doc/refman/html/class_shape_fix___edge.html?utm_source=chatgpt.com "ShapeFix_Edge Class Reference"
