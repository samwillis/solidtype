## CAD Pipeline Rework

### What we're building

We're turning SolidType's modelling and AI systems into a single, coherent CAD pipeline where:

- The **Yjs document is the shared, collaborative "source program"** (feature tree + sketches + parameters).
- There is **one canonical command layer** that mutates that program (used by both the UI tools and the AI agent).
- The **OCCT-based kernel is the compiler/runtime** that deterministically rebuilds geometry from the Yjs program.
- A **merge-safe topological naming system** ("PersistentRef") lets both humans and the AI refer to faces/edges/surfaces in a way that survives edits, rebuilds, and—critically—**Yjs fork/merge**.

This enables the AI agent to operate both:

- **synchronously** (while the user is in the document, with extra context like current selection), and
- **asynchronously** in the background (running its own kernel instance, doing long tasks, generating snapshots, and syncing results back via Yjs).

### Why we're doing it

We're addressing four structural risks that grow as SolidType becomes a serious CAD system:

1. **Tool drift between UI and AI**
   Today, UI CAD tools and AI modelling tools can diverge because they each implement their own Yjs mutations. That's a long-term correctness trap: features evolve, schemas change, and one path breaks silently. A unified command layer eliminates this class of bugs.
2. **AI needs grounded model understanding, not just doc edits**
   To reliably answer requests like "fillet that edge" or "sketch on the top face", the AI needs access to the _current built geometry_, selection context, and visual snapshots—not just the feature list. Running the kernel alongside the AI enables this, even when no tab is open.
3. **Topological naming must survive collaboration and merges**
   In a CRDT world, users can fork documents, make changes in parallel, and merge. Topological naming must be **conflict-free and merge-safe** so the document remains buildable and repairable post-merge. We explicitly design references as stable, versioned identifiers with graceful degradation (found / ambiguous / not found) and repair workflows.
4. **Sketching is constraint-driven and the AI must see solver feedback**
   We already have a TS constraint solver; the AI should use it as an oracle when adding geometry/constraints ("did that overconstrain the sketch?"). Exposing solver reports as first-class query tools makes AI sketching reliable rather than guessy.

### Where it lives in the architecture

This plan clarifies the roles of each major subsystem:

- **Yjs document**
  The durable, collaborative representation of the model: feature tree + sketches + parameters + references.
- **Commands layer (new canonical API)**
  The only code allowed to mutate the Yjs model. UI interactions and AI tool calls both dispatch the same commands.
- **KernelEngine (extracted/reused)**
  A shared module that rebuilds OCCT geometry from the Yjs program and produces:
  - meshes/edges for rendering,
  - build status/errors,
  - a **ReferenceIndex** mapping transient topology indices → stable refs,
  - queryable geometry info (bbox, measurements, candidate faces/edges).
- **UI kernel worker**
  Uses KernelEngine to rebuild and stream render data to the app.
- **AI worker (background agent runtime)**
  Runs its own KernelEngine instance against the same Yjs doc to:
  - answer modelling/geometry queries,
  - generate snapshots for multimodal reasoning,
  - perform long-running tasks without blocking the UI,
  - sync results and progress back via Yjs/presence.

### Worker architecture

The KernelEngine is designed to be **deployment-flexible**:

- **Development/Browser**: Kernel can run in a dedicated Web Worker (for UI) and optionally a separate instance in the AI worker.
- **Future/Edge**: Both UI rebuilds and AI can share a single-threaded runtime (e.g., Cloudflare Durable Object) where the kernel runs inline.

To support both patterns:

1. `KernelEngine` is a **plain class** with no worker-specific APIs (no `postMessage`, no `self`).
2. Worker glue code wraps `KernelEngine` and handles messaging.
3. The AI worker can either:

- Instantiate its own `KernelEngine` (separate rebuild, separate memory)
- Or share one via message-passing (deferred, not in V1)

For V1, we run **separate KernelEngine instances** in UI worker and AI worker. This is simpler and allows independent rebuilds. The abstraction supports consolidation later.

### How we'll do it

We'll first eliminate drift by introducing a single commands layer and refactoring both UI tools and AI tools to use it. Next, we'll introduce a **merge-safe PersistentRef V1** format (versioned, string-encoded, CRDT-friendly) and teach the kernel rebuild to produce a **ReferenceIndex** so selections and feature parameters store stable references instead of ephemeral face/edge indices. We'll then add a resolver that can map PersistentRefs back onto current topology (found/ambiguous/not found), surfacing broken refs as non-fatal diagnostics with explicit repair commands. Finally, we'll extract the rebuild pipeline into a reusable KernelEngine used by both the UI worker and the AI worker, enabling background geometry-aware tool calls and worker-generated snapshots, and we'll expose sketch solver feedback as query tools so AI sketching can be constraint-aware. Over time, we'll progressively replace heuristic matching with OCCT history where available.

### Alignment with `TOPOLOGICAL-NAMING.md` (FreeCAD-style naming)

This rework plan intentionally **does not replace** the FreeCAD-style naming design. It provides a CRDT-safe storage and rebuild pipeline that the naming system plugs into:

- **Yjs storage (CRDT-safe)**: store only immutable reference strings (`stref:v1:...`) or small candidate sets (`PersistentRefSet`). Never store ephemeral indices like `Face7`, `faceIndex`, `edgeIndex`, or tessellation indices.
- **Derived rebuild outputs**: `ReferenceIndex` is a rebuild artifact (an app-facing view similar in spirit to an ElementMap) and is **recomputed every rebuild**, not persisted in Yjs.
- **Robustness path**: when available, prefer **OCCT operation history** to generate selectors; use fingerprints only as fallback.

See `docs/TOPOLOGICAL-NAMING.md` for the long-term naming algorithm (`ElementMap`/`MappedName` internally) and the CRDT-safe storage rules (RefSets, deterministic tags).

---

## Phase 0 — Baseline audit and guardrails

### 0.1 Current state (for reference)

**AI tool mutations:**

- `packages/app/src/lib/ai/tools/modeling-impl.ts` — uses bespoke `createFeature()` helper
- `packages/app/src/lib/ai/runtime/worker-chat-controller.ts` — routes tools to executors

**UI tool mutations:**

- `packages/app/src/editor/contexts/DocumentContext.tsx` — calls `featureHelpers.ts`
- `packages/app/src/editor/document/featureHelpers.ts` — has `addExtrudeFeature()` etc.

**Key divergence identified:**

- AI's `createFeature()` does NOT call `insertFeatureAtGate()` — features append to end
- AI's helper doesn't use `createFeatureMap()` / `setMapProperties()` from `yjs.ts`

**Kernel build:**

- `packages/app/src/editor/worker/kernel.worker.ts` — rebuilds Yjs → SolidSession → tessellation
- Selection uses ephemeral `faceIndex` / `edgeIndex` from `faceMap` / `edgeMap`

### 0.2 Regression tests (must-have before refactoring)

Create `packages/app/tests/integration/commands-invariants.test.ts`:

```typescript
// Invariant A: UI and AI produce identical Yjs state
test("createExtrude via UI and AI produces identical doc state", () => {
  const docA = createTestDocument();
  const docB = createTestDocument();
  const sketchId = addTestSketch(docA); // also in docB

  // UI path
  addExtrudeFeature(docA, sketchId, 10, "add");

  // AI path (after refactor, both call commands.createExtrude)
  createExtrudeImpl({ sketchId, distance: 10, op: "add" }, { doc: docB });

  // State vectors should match (ignoring timestamps)
  expect(normalizeYjsState(docA.ydoc)).toEqual(normalizeYjsState(docB.ydoc));
});

// Invariant B: PersistentRefs always parse
test("all stored refs are valid PersistentRef strings", () => {
  const doc = createTestDocument();
  // ... create features with refs ...
  for (const ref of extractAllRefs(doc)) {
    expect(decodePersistentRef(ref).ok).toBe(true);
  }
});

// Invariant C: Fork+merge doesn't crash rebuild
test("document remains buildable after Yjs fork and merge", async () => {
  const docA = createTestDocument();
  // Add sketch + extrude
  const docB = Y.Doc.from(Y.encodeStateAsUpdate(docA.ydoc));

  // Divergent edits
  modifyInDocA(docA);
  modifyInDocB(docB);

  // Merge
  Y.applyUpdate(docA.ydoc, Y.encodeStateAsUpdate(docB));

  // Rebuild should not throw
  const engine = new KernelEngine();
  await engine.rebuild(docA);
  expect(engine.errors.every((e) => e.code !== "CRASH")).toBe(true);
});
```

---

## Phase 1 — Unify UI + AI mutations into a single command layer

### 1.1 Scope

**In scope (Phase 1):**

- Feature-level operations: `createSketch`, `createExtrude`, `createRevolve`, `createBoolean`
- Feature modification: `modifyFeatureParam`, `deleteFeature`, `reorderFeature`, `renameFeature`, `suppressFeature`

**Deferred (later phases):**

- Sketch geometry operations (addLine, addCircle, etc.) — already shared via `sketch-impl.ts`
- Sketch constraint operations — already shared

### 1.2 Create the commands module

```
packages/app/src/editor/commands/
├── index.ts           # Re-exports all commands
├── types.ts           # Shared types (CommandResult, etc.)
├── modeling.ts        # Feature creation/modification
└── sketch.ts          # Sketch lifecycle (create, delete)
```

**Design principles:**

1. Commands accept `(doc: SolidTypeDoc, args: T)` and return `CommandResult<R>`.
2. Commands wrap mutations in `doc.ydoc.transact()`.
3. Commands call existing helpers internally (don't rewrite logic).
4. Commands are pure functions (no React hooks, no worker APIs).

**Example command signature:**

```typescript
// packages/app/src/editor/commands/types.ts
export type CommandResult<T> = { ok: true; value: T } | { ok: false; error: string };

// packages/app/src/editor/commands/modeling.ts
export interface CreateExtrudeArgs {
  sketchId: string;
  distance: number;
  op?: "add" | "cut";
  direction?: "normal" | "reverse";
  name?: string;
}

export function createExtrude(
  doc: SolidTypeDoc,
  args: CreateExtrudeArgs
): CommandResult<{ featureId: string }> {
  // Validate
  const sketch = doc.featuresById.get(args.sketchId);
  if (!sketch || sketch.get("type") !== "sketch") {
    return { ok: false, error: `Sketch ${args.sketchId} not found` };
  }

  // Execute (calls existing helper internally)
  const featureId = addExtrudeFeature(doc, {
    sketchId: args.sketchId,
    distance: args.distance,
    op: args.op ?? "add",
    direction: args.direction ?? "normal",
    name: args.name,
  });

  return { ok: true, value: { featureId } };
}
```

### 1.3 Refactor consumers

**DocumentContext.tsx:**

```typescript
// Before
const addExtrude = useCallback(
  (sketchId, distance, op, direction) => {
    return addExtrudeFeature(doc, sketchId, distance, op, direction);
  },
  [doc]
);

// After
const addExtrude = useCallback(
  (sketchId, distance, op, direction) => {
    const result = commands.createExtrude(doc, { sketchId, distance, op, direction });
    if (!result.ok) throw new Error(result.error);
    return result.value.featureId;
  },
  [doc]
);
```

**modeling-impl.ts:**

```typescript
// Before
export function createExtrudeImpl(args, ctx) {
  const featureId = createFeature(doc, { type: "extrude", ... });
  return { featureId, status: "ok" };
}

// After
export function createExtrudeImpl(args, ctx) {
  const result = commands.createExtrude(ctx.doc, {
    sketchId: args.sketchId,
    distance: args.distance,
    op: args.op,
    direction: args.direction,
    name: args.name,
  });
  if (!result.ok) {
    return { featureId: "", status: "error", error: result.error };
  }
  return { featureId: result.value.featureId, status: "ok" };
}
```

### 1.4 Acceptance criteria

- `createExtrude` from UI and AI produce identical Yjs diffs
- Rebuild gate is respected by both paths
- Undo/redo works identically for both
- All existing tests pass
- `modeling-impl.ts` no longer contains `Y.Map` manipulation

---

## Phase 2 — Define merge-safe PersistentRef format

### 2.1 PersistentRef V1 (simplified)

Create `packages/app/src/editor/naming/persistentRef.ts`:

```typescript
/**
 * PersistentRef V1 — merge-safe topological reference
 *
 * Design goals:
 * - Survives Yjs fork/merge (uses UUIDs, not sequential IDs)
 * - Portable across tool calls (string-encoded)
 * - Progressive enhancement (fingerprints optional, semantic hints deferred)
 */

export interface PersistentRefV1 {
  /** Version for forward compatibility */
  v: 1;

  /** Expected subshape type */
  expectedType: "face" | "edge" | "vertex";

  /** UUID of the feature that created this subshape */
  originFeatureId: string;

  /** Feature-local selector (how to find within the feature) */
  localSelector: {
    /** Selector kind (e.g., "extrude.topCap", "extrude.side", "revolve.side") */
    kind: string;
    /** Disambiguation data */
    data: Record<string, string | number>;
  };

  /** Geometry fingerprint for fallback matching */
  fingerprint?: {
    /** Approximate centroid [x, y, z] */
    centroid: [number, number, number];
    /** Approximate area (faces) or length (edges) */
    size: number;
    /** Surface normal for faces [nx, ny, nz] */
    normal?: [number, number, number];
  };
}

/**
 * PersistentRefSet — optional multi-candidate reference.
 *
 * Most of the time this contains exactly one candidate. It grows only when:
 * - a merge introduces competing repairs, or
 * - resolution is ambiguous and we record a small shortlist, or
 * - we later learn a stronger candidate (e.g. OCCT-history-backed) and keep
 *   the older fallback for safety.
 */
export interface PersistentRefSet {
  /** Optional preferred candidate (must also exist in `candidates`) */
  preferred?: string;
  /** Ordered list of candidate stref strings (deduped + capped, e.g. 3–5) */
  candidates: string[];
}

/** Encode to portable string: stref:v1:<base64url> */
export function encodePersistentRef(ref: PersistentRefV1): string {
  // NOTE: Use canonical JSON (stable key ordering recursively), not vanilla JSON.stringify.
  // This ensures deterministic `stref` strings across environments and CRDT merges.
  const json = canonicalJsonStringify(ref);
  const base64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `stref:v1:${base64}`;
}

/**
 * canonicalJsonStringify (required)
 *
 * This helper MUST:
 * - sort object keys recursively,
 * - produce stable output for arrays/primitives,
 * - avoid any locale-dependent formatting.
 *
 * Implementation options:
 * - Implement a tiny local helper (preferred; no dependency), or
 * - use a small library like `json-stable-stringify` (acceptable if already aligned with repo deps).
 *
 * Without this, two clients can encode the same PersistentRef into different strings, which defeats
 * the CRDT-safe “immutable string handle” goal.
 */
declare function canonicalJsonStringify(value: unknown): string;

/** Decode from string */
export function decodePersistentRef(
  s: string
): { ok: true; ref: PersistentRefV1 } | { ok: false; error: string } {
  if (!s.startsWith("stref:v1:")) {
    return { ok: false, error: "Invalid prefix" };
  }
  try {
    const base64 = s.slice(9).replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const ref = JSON.parse(json) as PersistentRefV1;
    // Basic validation
    if (ref.v !== 1 || !ref.expectedType || !ref.originFeatureId || !ref.localSelector) {
      return { ok: false, error: "Missing required fields" };
    }
    return { ok: true, ref };
  } catch (e) {
    return { ok: false, error: `Parse error: ${e}` };
  }
}
```

### 2.2 Local selector kinds (initial set)

| Kind                 | Data                                    | Description                                              |
| -------------------- | --------------------------------------- | -------------------------------------------------------- |
| `extrude.topCap`     | `{ loopId: string }`                    | Top cap face of extrude                                  |
| `extrude.bottomCap`  | `{ loopId: string }`                    | Bottom cap face                                          |
| `extrude.side`       | `{ loopId: string, segmentId: string }` | Side face from profile segment (stable IDs, not indices) |
| `extrude.topEdge`    | `{ loopId: string, segmentId: string }` | Edge on top cap                                          |
| `extrude.bottomEdge` | `{ loopId: string, segmentId: string }` | Edge on bottom cap                                       |
| `extrude.sideEdge`   | `{ loopId: string, vertexId: string }`  | Vertical edge (stable vertex/entity ID)                  |
| `revolve.side`       | `{ segmentId: string }`                 | Side face from profile segment (stable ID)               |
| `revolve.startCap`   | `{}`                                    | Start cap (if < 360°)                                    |
| `revolve.endCap`     | `{}`                                    | End cap (if < 360°)                                      |

**CRDT requirement:** selector data must be keyed by **stable IDs**, not array positions.
For extrude/revolve selectors this means using sketch/profile **entity UUIDs** (or deterministic IDs derived from them), not `segment: 2`.

#### 2.2.1 What are `segmentId`, `vertexId`, and `loopId`?

To keep refs merge-safe, these IDs must come from the Yjs document’s stable identifiers (or be deterministic functions of them):

- `segmentId`: **the sketch entity UUID** (the key in `sketch.data.entitiesById`). For line/arc/circle entities this is already a UUID string.
- `vertexId`: **the sketch point UUID** (the key in `sketch.data.pointsById`) when an edge/face can be tied to a specific point, otherwise omitted.
- `loopId`: a **deterministic loop identifier derived from stable IDs**, not a loop index.
  - For V1, define `loopId` as a stable hash of the set/order of segment entity IDs that form the closed profile loop.
  - Use a canonicalization that is invariant to rotation (loop start point) and stable across clients:
    - compute the cyclic order of segment IDs around the loop,
    - rotate so the lexicographically smallest ID comes first,
    - join with a delimiter, then hash (or base64url) to produce a short `loopId` string.

This lets two clients who independently create the same loop (with the same entity UUIDs) compute the same `loopId` after merge, without persisting any positional indices.

**Implementation note (where this lives):**

- Add a small pure function in app code that computes profile loops from sketch data:
  - suggested location: `packages/app/src/editor/sketch/profileLoops.ts`
  - inputs: sketch `pointsById`, `entitiesById`
  - outputs: `profileLoops: Array<{ loopId: string; entityIds: string[] }>`
- KernelEngine uses this when rebuilding an extrude/revolve from a sketch so it can pass `SketchInfo.profileLoops`
  into `generateFaceRef(...)`.

Semantic hints (e.g., `"top" | "bottom" | "front"`) are **deferred to V2** — they require more sophisticated heuristics.

### 2.3 Storage in Yjs

Rules for feature parameters that reference geometry:

- **Single ref**: Store `string` (`stref:v1:...`) in the common case.
- **Robust ref** (recommended): Store as `PersistentRefSet` (preferred + candidates).
- **Multi-ref** (e.g., fillet edges): Store as `Y.Array<string | PersistentRefSet>` for merge-friendly unions.

CRDT rule: **never store ephemeral topology indices** (faceIndex/edgeIndex, triangle index, “Face7”).

**Minimal adoption order (so we don’t draw out implementation):**

1. Convert `extentRef` (extrude “to face/to vertex”) to store `string | PersistentRefSet`.
2. Convert “sketch on face” plane refs (face references used for sketch planes) to use `string | PersistentRefSet`.
3. Convert multi-select params (e.g. fillet edges) later as needed.

Example in extrude feature:

```typescript
{
  type: "extrude",
  sketch: "uuid-of-sketch",  // sketch reference (not a PersistentRef)
  // Face reference for "to face" extent (prefer PersistentRefSet for robustness)
  extentRef: {
    preferred: "stref:v1:...",
    candidates: ["stref:v1:..."],
  },
}
```

### 2.4 Tests

Create `packages/app/tests/unit/persistentRef.test.ts`:

```typescript
test("round-trip encode/decode", () => {
  const ref: PersistentRefV1 = {
    v: 1,
    expectedType: "face",
    originFeatureId: "abc-123",
    localSelector: { kind: "extrude.topCap", data: { loopId: "loop:..." } },
  };
  const encoded = encodePersistentRef(ref);
  const decoded = decodePersistentRef(encoded);
  expect(decoded.ok).toBe(true);
  expect(decoded.ref).toEqual(ref);
});

test("encoded string is valid after JSON stringify (for Yjs storage)", () => {
  const ref = {
    /* ... */
  };
  const encoded = encodePersistentRef(ref);
  const stored = JSON.parse(JSON.stringify(encoded));
  expect(stored).toBe(encoded);
});

test("fingerprint is optional", () => {
  const refWithout = {
    v: 1,
    expectedType: "face",
    originFeatureId: "x",
    localSelector: { kind: "a", data: {} },
  };
  const refWith = { ...refWithout, fingerprint: { centroid: [0, 0, 0], size: 1 } };
  expect(decodePersistentRef(encodePersistentRef(refWithout)).ok).toBe(true);
  expect(decodePersistentRef(encodePersistentRef(refWith)).ok).toBe(true);
});
```

---

## Phase 3 — Build ReferenceIndex in the kernel rebuild

### 3.1 Compute fingerprints from tessellation

After tessellating each body in `kernel.worker.ts`, compute per-face and per-edge fingerprints:

```typescript
interface FaceFingerprint {
  centroid: [number, number, number];
  size: number; // approximate area
  normal: [number, number, number];
}

interface EdgeFingerprint {
  centroid: [number, number, number]; // midpoint
  size: number; // length
}

function computeFaceFingerprints(mesh: Mesh): FaceFingerprint[] {
  const fingerprints: FaceFingerprint[] = [];
  const faceCount = Math.max(...mesh.faceMap) + 1;

  for (let faceIdx = 0; faceIdx < faceCount; faceIdx++) {
    // Collect triangles for this face
    const triangles = getTrianglesForFace(mesh, faceIdx);

    // Compute area-weighted centroid and total area
    const { centroid, area, normal } = computeFaceStats(triangles, mesh);

    fingerprints.push({ centroid, size: area, normal });
  }

  return fingerprints;
}
```

### 3.2 Generate PersistentRefs for each face/edge

For each face, determine its `localSelector` based on feature type and position:

```typescript
function generateFaceRef(
  featureId: string,
  featureType: string,
  faceIdx: number,
  fingerprint: FaceFingerprint,
  sketchData?: SketchInfo
): PersistentRefV1 {
  let localSelector: { kind: string; data: Record<string, string | number> };

  if (featureType === "extrude") {
    // Use normal direction to determine cap vs side
    const normal = fingerprint.normal;
    const isTopCap = normal[2] > 0.9; // Pointing up
    const isBottomCap = normal[2] < -0.9; // Pointing down

    if (isTopCap) {
      const loopId = sketchData?.profileLoops?.[0]?.loopId ?? "loop:unknown";
      localSelector = { kind: "extrude.topCap", data: { loopId } };
    } else if (isBottomCap) {
      const loopId = sketchData?.profileLoops?.[0]?.loopId ?? "loop:unknown";
      localSelector = { kind: "extrude.bottomCap", data: { loopId } };
    } else {
      // Side face — CRDT-safe selector must use stable IDs, not segment indices.
      // Match to a generating sketch/profile entity UUID if available; otherwise keep selector coarse
      // and rely on fingerprint fallback + later OCCT history refinement (Phase 8).
      const match = matchToSketchEntity(fingerprint, sketchData);
      if (match) {
        localSelector = {
          kind: "extrude.side",
          data: { loopId: match.loopId, segmentId: match.entityId },
        };
      } else {
        const loopId = sketchData?.profileLoops?.[0]?.loopId ?? "loop:unknown";
        localSelector = { kind: "extrude.side", data: { loopId } };
      }
    }
  } else {
    // Generic fallback — DO NOT store faceIdx/edgeIdx in selector data (ephemeral).
    localSelector = { kind: "face.unknown", data: {} };
  }

  return {
    v: 1,
    expectedType: "face",
    originFeatureId: featureId,
    localSelector,
    fingerprint: {
      centroid: fingerprint.centroid,
      size: fingerprint.size,
      normal: fingerprint.normal,
    },
  };
}
```

### 3.3 Publish ReferenceIndex

Extend `WorkerToMainMessage` in `types.ts`:

```typescript
interface RebuildCompleteMessage {
  type: "rebuild-complete";
  bodies: BodyInfo[];
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];

  /** Map from bodyKey to arrays of encoded PersistentRef strings */
  referenceIndex: {
    [bodyKey: string]: {
      faces: string[]; // Indexed by faceIndex
      edges: string[]; // Indexed by edgeIndex
    };
  };
}
```

#### 3.3.1 Deterministic selector inputs (required for CRDT)

`SketchInfo` must carry deterministic, ID-based loop/segment information so selector generation never depends on iteration order:

- `profileLoops: Array<{ loopId: string; entityIds: string[] }>` where `entityIds` are sketch entity UUIDs in canonical loop order.
- Any mapping from faces/edges back to generating sketch entities must be based on these stable IDs.

**Clarification: where does `SketchInfo` come from during rebuild?**

- When rebuilding a sketch feature, KernelEngine already parses sketch data to construct the kernel sketch.
- At the same time (from the same parsed sketch data), compute `profileLoops` and keep it in an in-memory
  `SketchInfo` map keyed by `sketchId`.
- When rebuilding an extrude/revolve that references a sketch, look up that `SketchInfo` and pass it into
  `generateFaceRef(...)` so selectors can include `loopId/segmentId` when available.

#### 3.3.2 Handling unknown loopId (avoid false matches)

`loop:unknown` is allowed as an internal sentinel, but it must not produce “confident” resolution:

- If a selector contains `loopId: "loop:unknown"`, treat selector matching as _coarse_:
  - prefer OCCT history match (Phase 8),
  - otherwise rely on fingerprint scoring and return `ambiguous` if multiple candidates are plausible.
- Never treat two refs with `loop:unknown` as an exact selector match by itself.

Add a test case in Phase 6: two side faces with `loop:unknown` should resolve to `ambiguous`, not `found`.

### 3.4 Update selection pipeline

In the viewer/selection code, when a face is picked:

```typescript
function handleFaceClick(bodyKey: string, faceIndex: number) {
  const refString = referenceIndex[bodyKey]?.faces[faceIndex];

  selectFace({
    bodyId: bodyKey,
    faceIndex,
    featureId: getFeatureIdForBody(bodyKey),
    persistentRef: refString, // Now populated!
  });
}
```

### 3.5 Acceptance criteria

- Clicking a face yields a valid `stref:v1:...` string
- The same face has the same ref after rebuild (without edits)
- The same face has the same ref after undo/redo
- Ref survives Yjs sync to another client

---

## Phase 4 — Extract KernelEngine for reuse

### 4.1 Create KernelEngine class

```typescript
// packages/app/src/editor/kernel/KernelEngine.ts

export interface KernelEngineOptions {
  /** Whether to compute meshes (false for headless/query-only mode) */
  computeMeshes?: boolean;
}

export interface RebuildResult {
  bodies: BodyInfo[];
  meshes: Map<string, TransferableMesh>;
  referenceIndex: ReferenceIndex;
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
  sketchSolveResults: Map<string, SketchSolveResult>;
}

export class KernelEngine {
  private session: SolidSession | null = null;
  private options: KernelEngineOptions;

  constructor(options: KernelEngineOptions = {}) {
    this.options = { computeMeshes: true, ...options };
  }

  async init(): Promise<void> {
    const oc = await initOCCT();
    setOC(oc);
    this.session = new SolidSession();
    await this.session.init();
  }

  async rebuildFromYDoc(ydoc: Y.Doc): Promise<RebuildResult> {
    // Extract feature tree from Yjs
    const root = ydoc.getMap("root");
    const featuresById = root.get("featuresById") as Y.Map<Y.Map<unknown>>;
    const featureOrder = root.get("featureOrder") as Y.Array<string>;
    const state = root.get("state") as Y.Map<unknown>;
    const rebuildGate = state?.get("rebuildGate") as string | null;

    // Run rebuild loop (extracted from kernel.worker.ts)
    return this.rebuild(featuresById, featureOrder, rebuildGate);
  }

  private async rebuild(
    featuresById: Y.Map<Y.Map<unknown>>,
    featureOrder: Y.Array<string>,
    rebuildGate: string | null
  ): Promise<RebuildResult> {
    // ... existing rebuild logic from kernel.worker.ts ...
  }

  // Geometry query methods
  getFacePlane(bodyId: BodyId, faceIndex: number): FacePlane | null {
    /* ... */
  }
  getBoundingBox(): BoundingBox {
    /* ... */
  }
  measureDistance(ref1: string, ref2: string): number {
    /* ... */
  }

  dispose(): void {
    this.session?.dispose();
    this.session = null;
  }
}
```

### 4.2 Refactor kernel.worker.ts

```typescript
// packages/app/src/editor/worker/kernel.worker.ts

let engine: KernelEngine | null = null;

async function performRebuild(): Promise<void> {
  if (!doc || !engine) return;

  self.postMessage({ type: "rebuild-start" });

  try {
    const result = await engine.rebuildFromYDoc(doc);

    self.postMessage({
      type: "rebuild-complete",
      bodies: result.bodies,
      featureStatus: result.featureStatus,
      errors: result.errors,
      referenceIndex: result.referenceIndex,
    });

    // Send meshes
    for (const [bodyKey, mesh] of result.meshes) {
      sendMesh(bodyKey, mesh);
    }

    // Send sketch solve results
    for (const [sketchId, solveResult] of result.sketchSolveResults) {
      self.postMessage({ type: "sketch-solved", sketchId, ...solveResult });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
}
```

### 4.3 Acceptance criteria

- UI rebuild produces identical results to before
- Unit tests can instantiate KernelEngine directly (no worker)
- Rebuild performance is unchanged (±10%)

---

## Phase 5 — KernelEngine in AI worker

### 5.1 Add KernelEngine to WorkerChatController

```typescript
// packages/app/src/lib/ai/runtime/worker-chat-controller.ts

export class WorkerChatController {
  // ... existing fields ...

  private kernelEngine: KernelEngine | null = null;
  private lastRebuildResult: RebuildResult | null = null;
  private rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(): Promise<void> {
    // ... existing init ...

    // Initialize kernel engine for geometry queries
    if (this.documentId) {
      this.kernelEngine = new KernelEngine({ computeMeshes: false });
      await this.kernelEngine.init();

      // Observe Yjs changes and trigger rebuilds
      this.ydoc?.on("update", () => this.scheduleRebuild());
    }
  }

  private scheduleRebuild(): void {
    if (this.rebuildDebounceTimer) {
      clearTimeout(this.rebuildDebounceTimer);
    }
    this.rebuildDebounceTimer = setTimeout(async () => {
      if (this.kernelEngine && this.ydoc) {
        this.lastRebuildResult = await this.kernelEngine.rebuildFromYDoc(this.ydoc);
      }
    }, 100);
  }

  // Exposed to tool implementations
  getRebuildResult(): RebuildResult | null {
    return this.lastRebuildResult;
  }

  getKernelEngine(): KernelEngine | null {
    return this.kernelEngine;
  }
}
```

### 5.2 Implement geometry query tools

```typescript
// packages/app/src/lib/ai/tools/modeling-impl.ts

export function findFacesImpl(
  args: {
    featureId?: string;
    normalFilter?: { x: number; y: number; z: number; tolerance?: number };
  },
  ctx: ModelingToolContext
): unknown {
  const result = ctx.getRebuildResult?.();
  if (!result) {
    return { faces: [], error: "No rebuild result available" };
  }

  const faces: Array<{ ref: string; featureId: string; normal: number[]; area: number }> = [];

  for (const [bodyKey, refIndex] of Object.entries(result.referenceIndex)) {
    for (let i = 0; i < refIndex.faces.length; i++) {
      const refString = refIndex.faces[i];
      const decoded = decodePersistentRef(refString);
      if (!decoded.ok) continue;

      const ref = decoded.ref;

      // Filter by feature if specified
      if (args.featureId && ref.originFeatureId !== args.featureId) continue;

      // Filter by normal if specified
      if (args.normalFilter && ref.fingerprint?.normal) {
        const dot =
          ref.fingerprint.normal[0] * args.normalFilter.x +
          ref.fingerprint.normal[1] * args.normalFilter.y +
          ref.fingerprint.normal[2] * args.normalFilter.z;
        const tolerance = args.normalFilter.tolerance ?? 0.1;
        if (dot < 1 - tolerance) continue;
      }

      faces.push({
        ref: refString,
        featureId: ref.originFeatureId,
        normal: ref.fingerprint?.normal ?? [0, 0, 0],
        area: ref.fingerprint?.size ?? 0,
      });
    }
  }

  return { faces };
}

export function getBoundingBoxImpl(
  args: { featureId?: string },
  ctx: ModelingToolContext
): unknown {
  const engine = ctx.getKernelEngine?.();
  if (!engine) {
    return { error: "Kernel not available" };
  }

  return engine.getBoundingBox(args.featureId);
}
```

### 5.3 Add getModelSnapshot tool

```typescript
// packages/app/src/editor/kernel/snapshotRenderer.ts

export interface SnapshotOptions {
  view: "iso" | "top" | "front" | "right";
  width?: number;
  height?: number;
}

export function renderSnapshot(
  rebuildResult: RebuildResult,
  options: SnapshotOptions
): { pngBase64: string; width: number; height: number } {
  const width = options.width ?? 512;
  const height = options.height ?? 512;

  // Use OffscreenCanvas if available
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  // Get camera transform for view
  const camera = getCameraForView(options.view, rebuildResult.boundingBox);

  // Draw edges as black lines
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;

  for (const [_, mesh] of rebuildResult.meshes) {
    if (!mesh.edges) continue;

    for (let i = 0; i < mesh.edges.length; i += 6) {
      const p1 = projectPoint([mesh.edges[i], mesh.edges[i + 1], mesh.edges[i + 2]], camera);
      const p2 = projectPoint([mesh.edges[i + 3], mesh.edges[i + 4], mesh.edges[i + 5]], camera);

      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }
  }

  // Convert to base64
  const blob = canvas.convertToBlob({ type: "image/png" });
  // ... convert blob to base64 ...

  return { pngBase64, width, height };
}
```

Tool implementation:

```typescript
export function getModelSnapshotImpl(
  args: { view?: "iso" | "top" | "front" | "right" },
  ctx: ModelingToolContext
): unknown {
  const result = ctx.getRebuildResult?.();
  if (!result) {
    return { error: "No rebuild result available" };
  }

  const snapshot = renderSnapshot(result, { view: args.view ?? "iso" });

  return {
    view: args.view ?? "iso",
    width: snapshot.width,
    height: snapshot.height,
    pngBase64: snapshot.pngBase64,
    bodyCount: result.bodies.length,
  };
}
```

### 5.4 Acceptance criteria

- AI can call `findFaces` and get actual face refs
- AI can call `getBoundingBox` and get real dimensions
- AI can call `getModelSnapshot` and receive a PNG
- All above work even if no UI tab is rendering

---

## Phase 6 — PersistentRef resolution and repair

### 6.1 Implement resolver

```typescript
// packages/app/src/editor/naming/resolvePersistentRef.ts

export type ResolveResult =
  | { status: "found"; bodyKey: string; index: number }
  | { status: "ambiguous"; candidates: Array<{ bodyKey: string; index: number; score: number }> }
  | { status: "not_found"; reason: string };

export function resolvePersistentRef(
  ref: string | { preferred?: string; candidates: string[] },
  referenceIndex: ReferenceIndex,
  rebuildResult: RebuildResult
): ResolveResult {
  const candidates = typeof ref === "string" ? [ref] : ref.candidates;
  // Try candidates in order (preferred first if present)
  const ordered =
    typeof ref === "string"
      ? candidates
      : ref.preferred
        ? [ref.preferred, ...candidates.filter((c) => c !== ref.preferred)]
        : candidates;

  for (const refString of ordered) {
    const decoded = decodePersistentRef(refString);
    if (!decoded.ok) continue;
    const parsed = decoded.ref;

    const hits: Array<{ bodyKey: string; index: number; score: number }> = [];

    for (const [bodyKey, refIndex] of Object.entries(referenceIndex)) {
      const refs = parsed.expectedType === "face" ? refIndex.faces : refIndex.edges;

      for (let i = 0; i < refs.length; i++) {
        const candidateDecoded = decodePersistentRef(refs[i]);
        if (!candidateDecoded.ok) continue;

        const candidate = candidateDecoded.ref;

        // Match by feature ID first
        if (candidate.originFeatureId !== parsed.originFeatureId) continue;

        // Match by selector kind
        if (candidate.localSelector.kind !== parsed.localSelector.kind) continue;

        // Score by selector data + fingerprint similarity
        const score = computeScore(parsed, candidate);
        hits.push({ bodyKey, index: i, score });
      }
    }

    if (hits.length === 0) continue;

    hits.sort((a, b) => a.score - b.score);
    if (hits.length === 1 || hits[0].score < hits[1].score * 0.5) {
      return { status: "found", bodyKey: hits[0].bodyKey, index: hits[0].index };
    }
    return { status: "ambiguous", candidates: hits.slice(0, 5) };
  }

  return { status: "not_found", reason: "No candidate reference could be resolved" };
}

function computeScore(ref: PersistentRefV1, candidate: PersistentRefV1): number {
  let score = 0;

  // Selector data match
  for (const [key, value] of Object.entries(ref.localSelector.data)) {
    if (candidate.localSelector.data[key] !== value) {
      score += 10;
    }
  }

  // Fingerprint distance
  if (ref.fingerprint && candidate.fingerprint) {
    const dx = ref.fingerprint.centroid[0] - candidate.fingerprint.centroid[0];
    const dy = ref.fingerprint.centroid[1] - candidate.fingerprint.centroid[1];
    const dz = ref.fingerprint.centroid[2] - candidate.fingerprint.centroid[2];
    score += Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (ref.fingerprint.normal && candidate.fingerprint.normal) {
      const dot =
        ref.fingerprint.normal[0] * candidate.fingerprint.normal[0] +
        ref.fingerprint.normal[1] * candidate.fingerprint.normal[1] +
        ref.fingerprint.normal[2] * candidate.fingerprint.normal[2];
      score += (1 - dot) * 10;
    }
  }

  return score;
}
```

### 6.2 Surface unresolved refs as build diagnostics

In KernelEngine rebuild, after computing referenceIndex:

```typescript
// Validate all refs in feature parameters
for (const [featureId, feature] of featuresById) {
  const extentRef = feature.get("extentRef") as unknown;
  if (extentRef) {
    const result = resolvePersistentRef(extentRef as any, referenceIndex, rebuildResult);
    if (result.status !== "found") {
      errors.push({
        featureId,
        code: "INVALID_REFERENCE",
        message: `Cannot resolve extentRef: ${result.status === "ambiguous" ? "ambiguous" : result.reason}`,
        data: { paramName: "extentRef", ref: extentRef, resolution: result },
      });
    }
  }
}
```

### 6.3 Add repair command

```typescript
// packages/app/src/editor/commands/repair.ts

export interface RepairReferenceArgs {
  featureId: string;
  paramName: string;
  newRef: string;
}

export function repairReference(doc: SolidTypeDoc, args: RepairReferenceArgs): CommandResult<void> {
  const feature = doc.featuresById.get(args.featureId);
  if (!feature) {
    return { ok: false, error: `Feature ${args.featureId} not found` };
  }

  // Validate the new ref
  const decoded = decodePersistentRef(args.newRef);
  if (!decoded.ok) {
    return { ok: false, error: `Invalid ref: ${decoded.error}` };
  }

  doc.ydoc.transact(() => {
    feature.set(args.paramName, args.newRef);
  });

  return { ok: true, value: undefined };
}
```

### 6.4 Behavior on ambiguous refs during rebuild

When a feature references an ambiguous ref:

1. **Continue rebuild** — don't stop the entire model
2. **Use first candidate** — deterministic, allows model to render
3. **Surface warning** — add to `errors` with code `"AMBIGUOUS_REFERENCE"`
4. **Mark feature status** — set to `"warning"` not `"error"`

This ensures the model is always buildable, just possibly not exactly as intended.

### 6.5 Tests

```typescript
test("resolve finds exact match", () => {
  const ref = encodePersistentRef({
    /* ... */
  });
  const index = { body1: { faces: [ref], edges: [] } };
  const result = resolvePersistentRef(ref, index, mockRebuild);
  expect(result.status).toBe("found");
});

test("resolve returns ambiguous for multiple matches", () => {
  const ref1 = encodePersistentRef({
    v: 1,
    originFeatureId: "f1",
    localSelector: { kind: "extrude.side", data: { loopId: "loop:...", segmentId: "seg-a" } },
    expectedType: "face",
  });
  const ref2 = encodePersistentRef({
    v: 1,
    originFeatureId: "f1",
    localSelector: { kind: "extrude.side", data: { loopId: "loop:...", segmentId: "seg-b" } },
    expectedType: "face",
  });

  // Search for a ref that matches both (same selector kind, no disambiguation)
  const searchRef = encodePersistentRef({
    v: 1,
    originFeatureId: "f1",
    localSelector: { kind: "extrude.side", data: { loopId: "loop:..." } },
    expectedType: "face",
  });

  const index = { body1: { faces: [ref1, ref2], edges: [] } };
  const result = resolvePersistentRef(searchRef, index, mockRebuild);
  expect(result.status).toBe("ambiguous");
});

test("repair command updates feature parameter", () => {
  const doc = createTestDocument();
  const featureId = createTestExtrude(doc);

  const result = repairReference(doc, {
    featureId,
    paramName: "extentRef",
    newRef: "stref:v1:...",
  });

  expect(result.ok).toBe(true);
  expect(doc.featuresById.get(featureId)?.get("extentRef")).toBe("stref:v1:...");
});
```

---

## Phase 7 — Constraint solver feedback for AI

### 7.1 Extract solver into shared module

```typescript
// packages/app/src/editor/sketch/solveSketch.ts

export interface SketchSolveResult {
  status: "ok" | "underconstrained" | "overconstrained" | "failed";
  dof: number;
  /** Points with their solved positions */
  solvedPoints: Array<{ id: string; x: number; y: number }>;
  /** Constraints that couldn't be satisfied */
  failedConstraints: string[];
}

export function solveSketch(
  sketchData: SketchData,
  plane: DatumPlane
): SketchSolveResult {
  const sketch = new CoreSketch(plane);

  // Add points, entities, constraints (existing logic from kernel.worker.ts)
  // ...

  const result = sketch.solve();
  const dof = sketch.analyzeDOF();

  // Extract solved positions
  const solvedPoints = /* ... */;

  return {
    status: result.status === "ok" ? (dof === 0 ? "ok" : "underconstrained") : result.status,
    dof,
    solvedPoints,
    failedConstraints: result.failedConstraints ?? [],
  };
}
```

### 7.2 Use in KernelEngine

```typescript
// In KernelEngine.rebuild()
for (const feature of sketches) {
  const sketchData = parseSketchData(feature);
  const plane = getSketchPlane(feature.get("plane"), featuresById);

  const solveResult = solveSketch(sketchData, plane);
  sketchSolveResults.set(feature.get("id"), solveResult);

  // Update feature status based on solve result
  if (solveResult.status === "overconstrained") {
    featureStatus[feature.get("id")] = "error";
    errors.push({
      featureId: feature.get("id"),
      code: "OVERCONSTRAINED",
      message: "Sketch is overconstrained",
    });
  }
}
```

### 7.3 Add AI tool

```typescript
// packages/app/src/lib/ai/tools/sketch.ts

export const getSketchSolveReportTool = {
  name: "getSketchSolveReport",
  description: "Get the constraint solver status for a sketch",
  parameters: z.object({
    sketchId: z.string().describe("ID of the sketch to analyze"),
  }),
  execute: "client",
};

// packages/app/src/lib/ai/tools/sketch-impl.ts

export function getSketchSolveReportImpl(
  ctx: SketchToolContext,
  input: { sketchId: string }
): SketchSolveResult {
  const rebuildResult = ctx.getRebuildResult?.();
  if (!rebuildResult) {
    return { status: "failed", dof: -1, solvedPoints: [], failedConstraints: [] };
  }

  return (
    rebuildResult.sketchSolveResults.get(input.sketchId) ?? {
      status: "failed",
      dof: -1,
      solvedPoints: [],
      failedConstraints: [],
    }
  );
}
```

### 7.4 Acceptance criteria

- AI can query solve status before/after adding constraints
- AI receives accurate DOF count
- AI sees which constraints failed (if any)
- Result matches what UI kernel worker reports

---

## Phase 8 — Progressive OCCT history integration

### 8.0 Required: mesh index ↔ kernel topology handle mapping

OCCT history APIs and core naming work in terms of **kernel topology handles** (`FaceId`, `EdgeId`). The viewer/selection pipeline works in terms of **mesh indices** (`faceIndex`, `edgeIndex`) derived from tessellation.

To connect these layers, KernelEngine must have (for each rebuilt body) a mapping for _this rebuild_:

- `faceIndexToFaceId: FaceId[]` where `faceIndex` (as used by `mesh.faceMap`) maps to the kernel face handle
- `edgeIndexToEdgeId: EdgeId[]` where `edgeIndex` (as used by `mesh.edgeMap`) maps to the kernel edge handle

This mapping is **internal to KernelEngine** (not persisted in Yjs). It can be included in `RebuildResult` for internal use, but does not need to be posted to the main thread.

If the current `SolidSession.tessellate()` API cannot provide this, add a companion API (or extend the mesh payload) to return these arrays deterministically alongside `faceMap`/`edgeMap`.

**Phase dependency note:** This mapping is only strictly required once we start consuming OCCT history (Phase 8),
but it is harmless to add earlier. If an agent is implementing Phase 3 and already has access to kernel `FaceId`/`EdgeId`
for each tessellated face/edge, implementing the mapping in Phase 3 will simplify Phase 8 later.

### 8.1 Extend core ops to return generated shapes

When OCCT operations provide history (e.g., `BRepPrimAPI_MakePrism::Generated`), capture it:

```typescript
// packages/core/src/api/SolidSession.ts

interface ExtrudeResult {
  bodyId: BodyId;
  generatedFaces?: {
    topCap: FaceId[];
    bottomCap: FaceId[];
    // CRDT-safe: tie sides to generating sketch/profile entity IDs (UUIDs), not positional indices
    sides: Array<{ segmentId: string; faceId: FaceId }>;
  };
}

extrude(profile: Profile, options: ExtrudeOptions): OperationResult<ExtrudeResult> {
  // ... existing extrude logic ...

  // Extract generated face mappings from OCCT
  const generatedFaces = this.extractGeneratedFaces(prism);

  return {
    success: true,
    value: { bodyId, generatedFaces },
  };
}
```

### 8.2 Use OCCT history in ReferenceIndex generation

```typescript
function generateFaceRef(
  featureId: string,
  featureType: string,
  faceIdx: number,
  fingerprint: FaceFingerprint,
  occtHistory?: ExtrudeResult["generatedFaces"]
): PersistentRefV1 {
  // If OCCT history available, use it for accurate selectors
  if (occtHistory && featureType === "extrude") {
    // NOTE: OCCT history yields FaceId/EdgeId (kernel handles), not mesh face indices.
    // KernelEngine must provide a mapping from mesh faceIndex -> FaceId for this rebuild.
    const faceId = meshFaceIndexToFaceId(faceIdx);
    if (occtHistory.topCap.includes(faceId)) {
      return {
        /* topCap selector */
      };
    }
    const sideMatch = occtHistory.sides.find((s) => s.faceId === faceId);
    if (sideMatch) {
      return {
        v: 1,
        expectedType: "face",
        originFeatureId: featureId,
        localSelector: {
          kind: "extrude.side",
          data: { loopId: "loop:...", segmentId: sideMatch.segmentId },
        },
        fingerprint: {
          /* ... */
        },
      };
    }
  }

  // Fall back to heuristic matching
  return heuristicFaceRef(featureId, featureType, faceIdx, fingerprint);
}
```

### 8.3 Add sketch entity IDs to selectors

For extrude side faces, include the sketch entity UUID for merge-safe matching:

```typescript
localSelector: {
  kind: "extrude.side",
  data: {
    loopId: "loop:...",
    segmentId: "abc-123-def",
  },
}
```

This makes selectors robust to sketch entity reordering.

### 8.4 Acceptance criteria

- When OCCT history is available, selectors are more accurate
- Fallback to heuristics works when history unavailable
- Sketch entity IDs survive sketch reordering

---

## Deliverable Summary

| Phase | Deliverable       | Key Files                                                     |
| ----- | ----------------- | ------------------------------------------------------------- |
| 0     | Regression tests  | `tests/integration/commands-invariants.test.ts`               |
| 1     | Commands layer    | `editor/commands/*.ts`                                        |
| 2     | PersistentRef V1  | `editor/naming/persistentRef.ts`                              |
| 3     | ReferenceIndex    | `editor/kernel/referenceIndex.ts`, `worker/types.ts`          |
| 4     | KernelEngine      | `editor/kernel/KernelEngine.ts`                               |
| 5     | AI geometry tools | `lib/ai/tools/modeling-impl.ts`, `kernel/snapshotRenderer.ts` |
| 6     | Resolver + repair | `editor/naming/resolvePersistentRef.ts`, `commands/repair.ts` |
| 7     | Solver feedback   | `editor/sketch/solveSketch.ts`, `lib/ai/tools/sketch-impl.ts` |
| 8     | OCCT history      | `core/src/api/SolidSession.ts`                                |

---

## Milestones

| Milestone | Phases | Goal                                           |
| --------- | ------ | ---------------------------------------------- |
| **M1**    | 0-1    | Unified command layer, no more UI/AI drift     |
| **M2**    | 2-3    | Merge-safe refs generated for all faces/edges  |
| **M3**    | 4-5    | AI has geometry awareness (queries, snapshots) |
| **M4**    | 6      | Refs can be resolved and repaired              |
| **M5**    | 7      | AI sketching is constraint-aware               |
| **M6**    | 8      | OCCT history improves ref accuracy             |

---

## Testing Strategy

Each phase includes specific tests:

```
packages/app/tests/
├── integration/
│   ├── commands-invariants.test.ts    # Phase 0
│   ├── reference-persistence.test.ts  # Phase 3
│   ├── ai-geometry-queries.test.ts    # Phase 5
│   ├── fork-merge-refs.test.ts        # Phase 6
│   └── solver-feedback.test.ts        # Phase 7
└── unit/
    ├── persistentRef.test.ts          # Phase 2
    ├── referenceIndex.test.ts         # Phase 3
    ├── KernelEngine.test.ts           # Phase 4
    ├── resolvePersistentRef.test.ts   # Phase 6
    └── solveSketch.test.ts            # Phase 7
```

All tests must pass before merging each phase's PR.

Add to `fork-merge-refs.test.ts` (Phase 6):

```typescript
test("two clients compute identical loopId for same loop (CRDT merge-safe)", () => {
  const docA = createTestDocument();
  const docB = createTestDocument();

  // Both clients create the same sketch entities (same UUIDs) and constraints.
  // (Use a helper that builds sketch data deterministically by ID.)
  const sketchId = addDeterministicRectangleSketch(docA, {
    id: "sk1",
    lineIds: ["l1", "l2", "l3", "l4"],
  });
  addDeterministicRectangleSketch(docB, { id: "sk1", lineIds: ["l1", "l2", "l3", "l4"] });

  // Both compute loopId locally during rebuild/profile extraction
  const loopA = computeProfileLoops(getSketchData(docA, sketchId))[0].loopId;
  const loopB = computeProfileLoops(getSketchData(docB, sketchId))[0].loopId;
  expect(loopA).toBe(loopB);

  // After merge, loopId is still stable and selectors encoded into stref strings match.
});
```
