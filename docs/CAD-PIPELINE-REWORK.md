## CAD pipeline rework

### What we’re building

We’re turning SolidType’s modelling and AI systems into a single, coherent CAD pipeline where:

* The **Yjs document is the shared, collaborative “source program”** (feature tree + sketches + parameters).
* There is **one canonical command layer** that mutates that program (used by both the UI tools and the AI agent).
* The **OCCT-based kernel is the compiler/runtime** that deterministically rebuilds geometry from the Yjs program in workers.
* A **merge-safe topological naming system** (“PersistentRef”) lets both humans and the AI refer to faces/edges/surfaces in a way that survives edits, rebuilds, and—critically—**Yjs fork/merge**.

This enables the AI agent to operate both:

* **synchronously** (while the user is in the document, with extra context like current selection), and
* **asynchronously** in the background (running its own kernel/model copy in a SharedWorker, doing long tasks, generating snapshots, and syncing results back via Yjs).

### Why we’re doing it

We’re addressing four structural risks that grow as SolidType becomes a serious CAD system:

1. **Tool drift between UI and AI**
   Today, UI CAD tools and AI modelling tools can diverge because they each implement their own Yjs mutations. That’s a long-term correctness trap: features evolve, schemas change, and one path breaks silently. A unified command layer eliminates this class of bugs.

2. **AI needs grounded model understanding, not just doc edits**
   To reliably answer requests like “fillet that edge” or “sketch on the top face”, the AI needs access to the *current built geometry*, selection context, and visual snapshots—not just the feature list. Running the kernel inside the SharedWorker provides that, even when no tab is open.

3. **Topological naming must survive collaboration and merges**
   In a CRDT world, users can fork documents, make changes in parallel, and merge. Topological naming must be **conflict-free and merge-safe** so the document remains buildable and repairable post-merge. We explicitly design references as stable, versioned identifiers with graceful degradation (found / ambiguous / not found) and repair workflows.

4. **Sketching is constraint-driven and the AI must see solver feedback**
   We already have a TS constraint solver; the AI should use it as an oracle when adding geometry/constraints (“did that overconstrain the sketch?”). Exposing solver reports as first-class query tools makes AI sketching reliable rather than guessy.

### Where it lives in the architecture

This plan clarifies the roles of each major subsystem:

* **Yjs document**
  The durable, collaborative representation of the model: feature tree + sketches + parameters + references.

* **Commands layer (new canonical API)**
  The only code allowed to mutate the Yjs model. UI interactions and AI tool calls both dispatch the same commands.

* **KernelEngine (extracted/reused)**
  A shared module that rebuilds OCCT geometry from the Yjs program and produces:

  * meshes/edges for rendering,
  * build status/errors,
  * a **ReferenceIndex** mapping transient topology indices → stable refs,
  * queryable geometry info (bbox, measurements, candidate faces/edges).

* **Dedicated kernel worker (UI)**
  Uses KernelEngine to rebuild and stream render data to the app.

* **AI SharedWorker (background agent runtime)**
  Runs its own KernelEngine instance against the same Yjs doc to:

  * answer modelling/geometry queries,
  * generate snapshots for multimodal reasoning,
  * perform long-running tasks without blocking the UI,
  * sync results and progress back via Yjs/presence.

### How we’ll do it (approach in one paragraph)

We’ll first eliminate drift by introducing a single commands layer and refactoring both UI tools and AI tools to use it. Next, we’ll introduce a **merge-safe PersistentRef V1** format (versioned, string-encoded, CRDT-friendly) and teach the kernel rebuild to produce a **ReferenceIndex** so selections and feature parameters store stable references instead of ephemeral face/edge indices. We’ll then add a resolver that can map PersistentRefs back onto current topology (found/ambiguous/not found), surfacing broken refs as non-fatal diagnostics with explicit repair commands. Finally, we’ll extract the rebuild pipeline into a reusable KernelEngine used by both the UI worker and the AI SharedWorker, enabling background geometry-aware tool calls and worker-generated snapshots, and we’ll expose sketch solver feedback as query tools so AI sketching can be constraint-aware. Over time, we’ll progressively replace heuristic matching with OCCT history where available, keeping the abstraction thin and OCCT-aligned.

If you want it even tighter for the very top of the doc, here’s a 3-sentence version:

SolidType will treat the Yjs document as the collaborative “feature program”, compiled by OCCT in workers into geometry. We’ll unify UI and AI through a single command layer and add merge-safe topological naming (PersistentRef) so references remain meaningful across edits, rebuilds, and CRDT fork/merge, with graceful ambiguity and repair. The AI will run its own kernel/model copy in a SharedWorker for background tasks, geometry queries, and snapshots, and will use the sketch constraint solver’s feedback to drive reliable AI sketching.

---

## Phase 0 — Baseline audit and guardrails (small, fast, unblock everything)

### 0.1 Map what exists today (repo-guided checklist)

**AI tool mutations (Yjs direct):**

* `packages/app/src/lib/ai/tools/modeling-impl.ts` creates features via bespoke `createFeature()`.
* `packages/app/src/lib/ai/runtime/worker-chat-controller.ts` routes tools to `executeModelingTool()` / `executeSketchTool()`.

**UI tool mutations (Yjs via helpers):**

* `packages/app/src/editor/contexts/DocumentContext.tsx` calls `packages/app/src/editor/document/featureHelpers.ts`.

**Kernel build (OCCT in dedicated worker):**

* `packages/app/src/editor/worker/kernel.worker.ts` rebuilds from Yjs → `SolidSession` → tessellation.
* Viewer selection currently uses `faceIndex` from `faceMap` and has placeholder persistent refs (strings).

### 0.2 Add “don’t regress” invariants (tests + runtime asserts)

Add a tiny test suite and runtime checks so refactors don’t silently diverge:

* **Invariant A:** UI command and AI command produce **byte-identical Yjs updates** for the same high-level action (at least for sketch/extrude/revolve initially).
* **Invariant B:** “PersistentRef” strings/objects always parse; never store ephemeral indices.
* **Invariant C:** After Yjs fork+merge, the doc is still valid and rebuild does not crash; unresolved refs are surfaced, not fatal.

Implementation notes:

* Add `packages/app/src/editor/naming/__tests__/persistentRef.test.ts`
* Add `packages/app/src/editor/naming/__tests__/yjsMergeRefs.test.ts` (see Phase 4.3 for exact scenarios)

---

## Phase 1 — Unify UI + AI mutations into a single command layer

### 1.1 Introduce a shared “commands” module (the one place that mutates the Yjs doc)

Create:

* `packages/app/src/editor/commands/index.ts`
* `packages/app/src/editor/commands/modeling.ts`
* `packages/app/src/editor/commands/sketch.ts`

Design goals:

* Commands accept `(doc: SolidTypeDoc, args)` and mutate within `doc.ydoc.transact()`.
* Commands return structured results `{ ok: true, ... } | { ok: false, error }`.
* Commands internally call existing helper functions where they already exist (so we don’t rewrite logic).

Example (initial set to implement fully):

* `createSketch`
* `createExtrude`
* `createRevolve`
* `modifyFeatureParam`
* `deleteFeature`
* `reorderFeature`
* sketch primitives + constraints that are already stable

**Concrete refactor steps**

1. Move the “feature creation” logic out of `modeling-impl.ts` and into `editor/commands/modeling.ts`.
2. In `DocumentContext.tsx`, replace direct calls to `addExtrudeFeature(...)` etc with `commands.modeling.createExtrude(...)` (the command can still call `addExtrudeFeature` internally at first).
3. In `packages/app/src/lib/ai/tools/modeling-impl.ts`, replace bespoke `createFeature()` with calls into `editor/commands/*`.

**Acceptance criteria**

* For extrude/revolve/sketch creation, UI and AI both produce the same shape in the doc.
* `packages/app/src/lib/ai/tools/modeling-impl.ts` no longer contains any low-level Y.Map integration rules (no duplicated “integrate then set props” knowledge).

---

## Phase 2 — Define a merge-safe PersistentRef format (CRDT-safe topological naming)

You already have a strong start in core (`packages/core/src/naming/*`), but it uses **numeric FeatureId**, which is **not fork/merge stable** in a Yjs world. We’ll create an **App-level PersistentRef V1** that is explicitly CRDT/merge friendly.

### 2.1 PersistentRef V1 (app-level) — stable under Yjs fork/merge

Create:

* `packages/app/src/editor/naming/persistentRef.ts`

Define a versioned JSON payload (string-encoded for tool schemas and easy storage):

```ts
export type PersistentRefV1 = {
  v: 1;
  expectedType: "face" | "edge" | "vertex";
  originFeatureId: string; // Yjs feature UUID (merge-safe)
  localSelector: {
    kind: string;          // e.g. "extrude.cap", "extrude.side", "face.semantic", "edge.semantic"
    data: Record<string, string | number>;
  };
  fingerprint?: {
    centroid: [number, number, number];
    approxAreaOrLength: number;
    normal?: [number, number, number];
    adjacencyHint?: number;
  };
};
```

And stable encode/decode helpers:

* `encodePersistentRef(ref: PersistentRefV1): string`
* `decodePersistentRef(s: string): PersistentRefV1 | { error: string }`

**Encoding rule**

* Use canonical JSON (stable key sort) then base64url (no padding) with a prefix:

  * `stref:v1:<base64url(canon_json)>`
    This makes refs:
* portable across tool calls
* safe to store in Yjs as atomic strings
* resilient to merges (strings always valid)

### 2.2 CRDT merge behaviour (what we guarantee)

We **do not** promise the merged model always makes geometric sense. We promise:

* Persistent refs remain **well-formed** after merge.
* Kernel resolution returns:

  * `found`
  * `ambiguous` (with candidates)
  * `not_found` (with reason)
* Unresolved refs become **repairable state**, not a crash.

### 2.3 Store refs in the doc in CRDT-friendly shapes

Rules for feature parameters that reference geometry:

* Single ref: store a single `string` (PersistentRef V1).
* Multi-ref (fillet edges etc, later): store a `Y.Array<string>` so merges tend to union rather than last-write-wins.

(If you later need “conflict-preserving single ref”, store `{ chosen: string, candidates: Y.Array<string> }`, but don’t start there.)

---

## Phase 3 — Build a ReferenceIndex in the kernel worker (turn faceIndex/edgeIndex into PersistentRefs)

Right now selection uses:

* triangle → `faceMap` → `faceIndex`
* edge segment → `edgeMap` → `edgeIndex`
  These indices are ephemeral. We’ll keep them internal, and publish stable PersistentRefs.

### 3.1 Extend kernel rebuild to compute per-face/per-edge fingerprints

In `packages/app/src/editor/worker/kernel.worker.ts` after tessellation:

* For each body (currently keyed by `featureId`), compute:

  * face fingerprints: approx centroid/area/normal
  * edge fingerprints: midpoint/length

Implementation approach (cheap, works today):

* Use tessellated triangles + `faceMap` to aggregate:

  * area-weighted centroid
  * averaged normal
  * approx area
* Use sampled edge segments to aggregate:

  * total polyline length
  * midpoint (or average of segment midpoints)

### 3.2 Produce PersistentRef V1 for each face/edge

For each face:

* `originFeatureId = bodyFeatureId` (today bodies are mostly created per feature; good enough initially)
* `localSelector.kind = "face.semantic"`
* `localSelector.data` should include at least:

  * `orientation`: `"top" | "bottom" | "front" | "back" | "left" | "right" | "other"` (based on normal)
  * `rank`: a stable-ish ordinal within that orientation bucket (sort by centroid projected into view plane)
* `fingerprint` filled from aggregates

Same for edges:

* `localSelector.kind = "edge.semantic"`
* `data`: `{ orientationHint?: "...", rank: number }`
* `fingerprint`: midpoint/length

**Why this works for merge-safety**

* Nothing depends on ephemeral faceIndex being stable.
* When the model changes after merge, we can re-resolve by fingerprint + semantic hints.

### 3.3 Publish ReferenceIndex to the main thread

Extend `WorkerToMainMessage` in `packages/app/src/editor/worker/types.ts`:

* Add to `rebuild-complete`:

  * `referenceIndex?: { [bodyKey: string]: { faces: string[]; edges: string[] } }`
    Where arrays are indexed by `faceIndex` / `edgeIndex` and values are PersistentRef strings.

Update the viewer pipeline:

* When raycasting yields `(bodyKey, faceIndex)`, lookup:

  * `persistentRef = referenceIndex[bodyKey].faces[faceIndex]`
* Populate `SelectionContext` with that `persistentRef`.

Update `SelectionContext` types if needed, but you can keep it as `persistentRef?: string`.

**Acceptance criteria**

* Clicking a face/edge yields a non-empty `persistentRef` string.
* The `persistentRef` survives:

  * rebuild
  * undo/redo
  * remote updates
  * fork+merge (it might become unresolved later; that’s fine)

---

## Phase 4 — Make PersistentRef resolution robust (including fork+merge degradation)

### 4.1 Add a resolver that can answer “what does this ref mean in the current build?”

Create:

* `packages/app/src/editor/naming/resolvePersistentRef.ts`

Inputs:

* `refString: string`
* current kernel build artifacts (face/edge fingerprint tables per body)

Outputs:

* `{ status: "found", bodyKey, faceIndex | edgeIndex }`
* `{ status: "ambiguous", candidates: Array<{ bodyKey, index, score }> }`
* `{ status: "not_found", reason }`

Resolution algorithm (V1; simple but reliable):

1. Parse ref; if invalid → `not_found`.
2. Narrow search space:

   * same `originFeatureId` body first (if present)
   * same `expectedType`
3. Score candidates by:

   * centroid distance (primary)
   * normal similarity (faces)
   * area/length similarity
   * semantic match (orientation/rank bucket)
4. Choose:

   * best score under threshold → `found`
   * multiple close scores → `ambiguous`
   * none → `not_found`

### 4.2 Surface unresolved refs as non-fatal build diagnostics

Extend build status in kernel worker:

* After rebuild, scan all feature parameters that contain persistent refs (start with `extentRef`, sketch-on-face, etc).
* Attempt to resolve; if unresolved/ambiguous, add a `BuildError` with code `"INVALID_REFERENCE"` including the feature id + parameter name.

This is how merges become “repairable”:

* The model might build partially.
* The UI can highlight broken references and offer “repair”.

### 4.3 Automated fork+merge tests (must-have)

Add tests in `vitest` that do:

1. Create doc A. Add sketch + extrude.
2. Fork to doc B via Yjs updates.
3. In A: modify extrude distance.
4. In B: add second extrude or tweak sketch.
5. Merge updates both ways.
6. Assert:

   * doc loads (no exceptions)
   * all stored refs still parse (`decodePersistentRef` ok)
   * kernel rebuild returns either found/ambiguous/not_found, but never crashes

---

## Phase 5 — Give the AI SharedWorker its own kernel build + screenshot pipeline (background-safe)

Right now, the AI worker can mutate the doc, but it **does not** maintain a model build suitable for:

* `findFaces`, `findEdges`, measurements
* generating screenshots
* long-running background tasks with progress

### 5.1 Extract kernel rebuild logic into a reusable “KernelEngine”

Goal: one build pipeline used by:

* dedicated kernel worker (`kernel.worker.ts`)
* AI shared worker runtime

Create:

* `packages/app/src/editor/kernel/KernelEngine.ts`

Responsibilities:

* Own a `SolidSession` instance and rebuild it from a `Y.Doc`.
* Produce:

  * tessellated meshes (optional, for UI worker)
  * `referenceIndex` (required)
  * `buildErrors`, `featureStatus`
  * optional `snapshot` images

Refactor steps:

1. Move “rebuild from features” core loop out of `kernel.worker.ts` into `KernelEngine.rebuildFromYDoc(ydoc)`.
2. Keep worker-specific messaging in `kernel.worker.ts`, but call into the engine.

### 5.2 Instantiate KernelEngine inside the AI SharedWorker

In `packages/app/src/lib/ai/runtime/worker-chat-controller.ts`:

* Create `this.kernelEngine = new KernelEngine({ mode: "headless" })`
* Observe Yjs doc changes (the same wrapped doc / ydoc already exists there) and trigger rebuild debounce.

Key requirement: **AI worker uses its own session + model copy**, not the UI’s.

* That satisfies background tasks and independent screenshots.
* It also allows AI to ask geometry queries even when UI thread is busy.

### 5.3 Add a “getModelSnapshot” tool for multimodal context

Add tool definition + implementation:

* `packages/app/src/lib/ai/tools/modeling-query.ts`: `getModelSnapshot`
* `packages/app/src/lib/ai/tools/modeling-impl.ts`: `getModelSnapshotImpl`

Implementation (pragmatic and worker-compatible):

* Use `mesh.edges` (already B-Rep edge polylines) and render a **line-drawing** in an `OffscreenCanvas` 2D context:

  * Choose a canonical camera: `"iso" | "top" | "front" | "right"`
  * Fit bounding box to frame
  * Project segments to 2D
  * Draw black lines on white background
* Output:

  * `{ width, height, view, pngBase64, bbox, bodyCount }`

This avoids WebGL-in-worker issues and is “good enough” for an LLM to infer intent.

**Acceptance criteria**

* AI can call `getModelSnapshot` and receive a PNG base64 string.
* Works even if no UI tab is actively rendering.

---

## Phase 6 — Constraint solver feedback becomes first-class AI context

You want AI sketching to get feedback from the TS constraint solver, and to remain consistent with the kernel worker’s solve behaviour.

### 6.1 Add “getSketchSolveReport” tool

Add:

* `packages/app/src/lib/ai/tools/sketch.ts`: tool definition
* `packages/app/src/lib/ai/tools/sketch-impl.ts`: implementation

Report should include:

* DOF summary (already in `SketchSolvedMessage` shape)
* list of violated/overconstrained constraints (if available)
* last solve status (“ok / under / over / failed”)

### 6.2 Share the solver code path

Don’t create a second solver implementation.
Instead:

* Extract the “solve sketch” function currently embedded in `kernel.worker.ts` (where it uses the core constraint functions) into a shared module, e.g.:

  * `packages/app/src/editor/sketch/solveSketch.ts`
* Kernel worker uses it during rebuild.
* AI worker uses it on demand for tool calls.

**Acceptance criteria**

* AI can ask “is this sketch fully constrained?” and get an accurate, consistent answer.
* When AI adds constraints, it can immediately see if it overconstrained the sketch and backtrack.

---

## Phase 7 — Repair workflow for broken refs (the merge-friendly “it could work” guarantee)

Fork+merge inevitably breaks some semantic intent. We need explicit repair primitives.

### 7.1 Represent “unresolved ref” as a state the system can carry

* Do **not** delete broken refs automatically.
* Keep the string, report it as unresolved, and allow user/AI to repair.

### 7.2 Add “repairReference” command + UI hook

Create command:

* `commands/repairReference({ featureId, paramName, oldRef, newRef })`

UI:

* When build errors include `"INVALID_REFERENCE"`, show:

  * “Select replacement face/edge”
  * update the parameter to the newly selected `persistentRef`

AI:

* Provide a tool that can accept a list of candidates from `resolvePersistentRef(... status:"ambiguous")` and choose one based on the user’s natural language (“the top face”, “the outer edge”).

**Acceptance criteria**

* After a fork+merge that causes ambiguity, the model doesn’t brick.
* The user can repair references without manual JSON hacking.

---

## Phase 8 — OCCT-first evolution: thinner abstractions, better naming, FreeCAD lessons

This phase is explicitly “make it more OCCT-like over time” and reduces the amount of heuristic matching.

### 8.1 Move from heuristic fingerprints → OCCT history when available

In core, operations like prism/revolve/boolean often expose history via OCCT APIs (e.g. generated/modified shapes).
Plan:

* Extend `@solidtype/core` operations to optionally return:

  * created faces/edges for a feature (top cap/bottom cap/side faces)
  * evolution mapping when modifying geometry
* Feed that into the existing `packages/core/src/naming/*` subsystem.

Even if OpenCascade.js bindings are incomplete, structure the API so you can swap implementations later.

### 8.2 Align selectors to sketch entity IDs (strongest merge-safe naming)

Upgrade local selectors for extrudes/revolves to reference **sketch entity ids** rather than segment ordinals:

* Example:

  * `extrude.side` with `{ sketchEntityId: "line-uuid" }`
    This is extremely merge friendly because sketch entity IDs are already CRDT-native.

### 8.3 Consider FreeCAD-style “TopoNaming repair” (longer-term)

FreeCAD’s experience (and the “topo naming problem”) suggests you want:

* stable identifiers when possible (history)
* fallback heuristics (fingerprints)
* explicit repair workflow

Your architecture above deliberately supports all three.

---

## Deliverable sequencing (what to implement in what order)

If you want the shortest path that unlocks everything:

1. **Phase 1** (commands) → kills UI/AI duplication risk immediately.
2. **Phase 2 + 3** (PersistentRef V1 + ReferenceIndex publish) → selection + refs exist and are merge-safe.
3. **Phase 5** (KernelEngine in AI worker + snapshot tool) → AI becomes genuinely geometry-aware and background-capable.
4. **Phase 4 + 7** (resolver + repair) → fork/merge story becomes robust.
5. **Phase 6** (solver report tool) → AI sketching becomes constraint-aware.
6. **Phase 8** (OCCT history/naming upgrades) → progressively replace heuristics with OCCT-derived truth.

---

# 🧭 High-Level Milestones

| Milestone | Goal                                                                     |
| --------- | ------------------------------------------------------------------------ |
| **M1**    | Unify UI + AI mutations (shared command layer).                          |
| **M2**    | Introduce merge-safe PersistentRef V1 and helpers.                       |
| **M3**    | Generate & publish ReferenceIndex from kernel rebuild.                   |
| **M4**    | Implement resolver + non-fatal reference repair flow.                    |
| **M5**    | Extract KernelEngine and use it in both kernel worker & AI SharedWorker. |
| **M6**    | Add AI snapshot & model-query tools (background-safe).                   |
| **M7**    | Expose constraint-solver feedback to both UI + AI.                       |
| **M8**    | Extend to OCCT history naming & sketch-entity-based selectors.           |

---

## **M1 – Unify Mutations (UI + AI)**

### PR-1 – Create `commands/` Layer

**Goal:** One canonical API for Yjs mutations.
**Files**

* `packages/app/src/editor/commands/index.ts` *(new)*
* `packages/app/src/editor/commands/modeling.ts`
* `packages/app/src/editor/commands/sketch.ts`
* update imports in

  * `editor/contexts/DocumentContext.tsx`
  * `lib/ai/tools/modeling-impl.ts`

**Tasks**

1. Implement `createExtrude`, `createRevolve`, `createSketch`, `modifyFeatureParam`.
2. Each wraps `ydoc.transact()` → `featureHelpers` → returns `{ok:true,id}`.
3. Replace direct mutations in both UI + AI.

**Acceptance**

* `createExtrude` from UI and from AI produce identical Yjs diffs (`diffYjsDocs` helper).
* Undo/redo works identically.

**Tests**

* `packages/app/__tests__/commands.modeling.test.ts`.

---

## **M2 – PersistentRef V1**

### PR-2 – Add PersistentRef Schema & Helpers

**Goal:** Merge-safe, versioned, portable refs.
**Files**

* `packages/app/src/editor/naming/persistentRef.ts` *(new)*
* `packages/app/src/editor/naming/__tests__/persistentRef.test.ts`

**Tasks**

1. Define `PersistentRefV1` JSON → `stref:v1:<base64url(canon_json)>`.
2. Add `encodePersistentRef`, `decodePersistentRef`, runtime validator.
3. Add Vitest coverage for round-trip + merge stability.

**Acceptance**

* 100 % decode success after random merge strings.
* Stable string order (canonical JSON).

---

## **M3 – ReferenceIndex Generation**

### PR-3 – Extend Kernel Rebuild

**Goal:** Publish stable refs for every face/edge.
**Files**

* `editor/worker/kernel.worker.ts`
* `editor/kernel/utils/referenceIndex.ts` *(new)*
* `editor/worker/types.ts`
* `editor/contexts/SelectionContext.tsx`

**Tasks**

1. Aggregate centroid/normal/area for faces from tessellation.
2. Compute `PersistentRefV1` for each.
3. Build `referenceIndex` and append to `rebuild-complete` message.
4. Replace `faceIndex`→`persistentRef` lookup in selection.

**Acceptance**

* Clicking a face logs a valid `stref:v1…`.
* Undo/redo and remote update keep same ref.

**Tests**

* `__tests__/referenceIndex.test.ts`: deterministic mapping for a static cube.

---

## **M4 – Resolver + Repair Flow**

### PR-4 – Implement `resolvePersistentRef` Utility

**Goal:** Turn PersistentRef → current topology (+diagnostics).
**Files**

* `editor/naming/resolvePersistentRef.ts` *(new)*
* `editor/worker/kernel.worker.ts` (call resolver)
* `editor/ui/errors/BuildErrorPanel.tsx` (show repair button)

**Tasks**

1. Implement centroid/normal/area matching scorer.
2. Return `{found|ambiguous|not_found}`.
3. Kernel worker runs resolver for all refs → emits diagnostics.
4. Add `INVALID_REFERENCE` errors to feature status.

**Acceptance**

* Corrupted ref → build succeeds but flagged as invalid.
* UI “Repair” opens selection tool.

**Tests**

* `resolvePersistentRef.test.ts` with perturbed geometry.

### PR-5 – Add `commands/repairReference`

**Goal:** One repair entrypoint.
**Files**

* `editor/commands/repair.ts` *(new)*
* integrate into BuildErrorPanel.

**Acceptance**

* Repair replaces ref string → rebuild clears error.

---

## **M5 – KernelEngine Extraction**

### PR-6 – Create `KernelEngine`

**Goal:** Reuse rebuild/query logic in both workers.
**Files**

* `editor/kernel/KernelEngine.ts` *(new)*
* refactor `editor/worker/kernel.worker.ts` to call it.

**Tasks**

1. Move Yjs → SolidSession → mesh logic into class with hooks:

   * `applyUpdate()`
   * `rebuild()`
   * `getReferenceIndex()`
2. Emit events for `buildComplete`.

**Acceptance**

* UI rebuild identical speed/results.
* Unit test: `KernelEngine` rebuild matches worker output bit-for-bit.

---

## **M6 – AI Worker Snapshot & Model Query**

### PR-7 – Use KernelEngine in AI SharedWorker

**Goal:** Independent background kernel.
**Files**

* `lib/ai/runtime/worker-chat-controller.ts`
* `lib/ai/runtime/ai-worker.ts` *(if exists)*
* `lib/ai/tools/modeling-query.ts`

**Tasks**

1. Instantiate `new KernelEngine({mode:"headless"})`.
2. Mirror Yjs doc updates (already synced).
3. Add debounce rebuild.

### PR-8 – Add `getModelSnapshot` Tool

**Goal:** Low-res 2D render inside worker.
**Files**

* `lib/ai/tools/modeling-query.ts`
* `lib/ai/tools/modeling-impl.ts`
* `editor/kernel/snapshotRenderer.ts` *(new)*

**Tasks**

1. Render via `OffscreenCanvas` if available, else software renderer.
2. Project iso/top/front.
3. Return `{pngBase64, bbox}`.

**Acceptance**

* Tool returns valid PNG string (<100 KB).
* Works with no UI tab open.

---

## **M7 – Constraint Solver Feedback**

### PR-9 – Expose Solver API

**Goal:** AI + UI share solver reports.
**Files**

* `editor/sketch/solveSketch.ts` *(extracted)*
* `editor/worker/kernel.worker.ts`
* `lib/ai/tools/sketch-impl.ts`

**Tasks**

1. Extract solver from worker into pure function.
2. Add `getSketchSolveReport(sketchId)` tool.
3. Include DOF, over/under/failed.

**Acceptance**

* AI call matches UI solver output exactly.

**Tests**

* `sketchSolver.test.ts`: known sketch → DOF count stable.

---

## **M8 – OCCT History & Sketch Entity Refs**

### PR-10 – Use OCCT Generated/Modified Mapping

**Goal:** Replace heuristics when data available.
**Files**

* `@solidtype/core/src/ops/*`
* `editor/kernel/utils/referenceIndex.ts`

**Tasks**

1. Extend core ops to return `GeneratedShapes` lists (faces/edges).
2. Build PersistentRefs using that when present.
3. Fallback to heuristic fingerprints.

**Acceptance**

* OCCT history produces same ref after local edit; heuristic path unchanged otherwise.

### PR-11 – Attach Sketch Entity IDs

**Goal:** Merge-stable selectors for sides.
**Files**

* `editor/naming/persistentRef.ts`
* `core/ops/extrude.ts`, `revolve.ts`

**Tasks**

1. Populate `localSelector.data.sketchEntityId` where available.
2. Update resolver to prioritise matching by sketchEntityId.
3. Update tests for stability across sketch reorder.

---

# 🧪 Integration & Regression Tests

Add under `packages/app/__tests__/integration/`:

| Test                           | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `merge_persistentRefs.test.ts` | Create A/B forks, merge, ensure decode + no crash. |
| `background_rebuild.test.ts`   | Run AI worker rebuild while UI busy; both stable.  |
| `repair_reference.test.ts`     | Break ref, rebuild non-fatal, repair clears.       |
| `solver_feedback.test.ts`      | Compare AI vs UI DOF counts.                       |

---

# ✅ Final Deliverables

After **PR 11**, the system supports:

* **Unified Command Layer** for deterministic Yjs mutation.
* **Merge-safe PersistentRef V1** identifiers.
* **ReferenceIndex + Resolver** pipeline (UI ↔ AI).
* **Background KernelEngine** inside SharedWorker.
* **Snapshot + Query tools** for multimodal AI.
* **Constraint-solver feedback loop**.
* **Progressive OCCT history integration** for topo naming stability.
* **User/AI repair flow** for merge conflicts.

