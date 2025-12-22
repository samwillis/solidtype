# SolidType Yjs Document Model Migration

**Repo-aware, agent-executable design doc. Single-phase migration, no backward compatibility.**
This version incorporates the latest review items: top-level ghost-state prevention, datum plane role invariants/schemas, discriminated sketch plane refs, minimal field-name churn, nested-map undo rules, determinism policy, and dev-only validation.

---

## 0. Summary

Replace the legacy persisted model:

* `Y.XmlFragment('features')` as source of truth
* sketch internals stored as JSON strings in XML attributes
* counter / scan-based ID generation

…with a single canonical persisted model stored in JSON-like Yjs types:

* `root: Y.Map` containing:

  * `meta: Y.Map`
  * `state: Y.Map`
  * `featuresById: Y.Map<uuid, Y.Map>` (records as Y.Maps)
  * `featureOrder: Y.Array<uuid>`

IDs:

* All feature IDs are UUIDs
* All sketch internal IDs (points/entities/constraints) are UUIDs
* Feature display names are optional and **non-unique**

Validation:

* Zod schema defines the persisted snapshot contract (`root.toJSON()`)
* Runtime invariants enforce referential + role consistency

Migration:

* Single-phase. **No legacy read path.** Old documents not supported.

---

## 1. Hard requirements

### 1.1 Persisted model types

* Persisted model uses only `Y.Map` and `Y.Array` (and nested `Y.Map`s).
* No `Y.XmlFragment`, `Y.XmlElement`, or XML attributes in persisted model.
* No JSON strings anywhere in persisted model.

### 1.2 Record granularity (must)

**Never store plain JS objects as values in Yjs maps/arrays.**
All records are `Y.Map`s. Example:

✅ correct:

* `featuresById.set(id, featureMap)` where `featureMap` is a `Y.Map`
* then `featureMap.set('type', 'extrude')`

❌ incorrect:

* `featuresById.set(id, { type: 'extrude', ... })`

This rule applies everywhere, including sketch sub-records.

### 1.3 Root-only persisted model (must; prevents ghost state)

All model state must live under `ydoc.getMap('root')`.

**Forbidden top-level shared types:** `meta`, `state`, `features`, `counters` (and any others) must not exist at the top level.

Because Yjs will happily create a top-level shared type if any code calls e.g. `ydoc.getMap('state')`, we must add a startup/dev assert (see §8.2) to catch “ghost state” during refactor.

---

## 2. Canonical v2 persisted layout

### 2.1 Root map

`const root = ydoc.getMap('root')`

### 2.2 Root keys (all required)

* `meta: Y.Map`
* `state: Y.Map`
* `featuresById: Y.Map<string, Y.Map<any>>`
* `featureOrder: Y.Array<string>`

### 2.3 Feature identity & ordering

* Feature identity is the UUID key in `featuresById`.
* Feature ordering is `featureOrder: Y.Array<featureId>`.
* Features are “present” iff they exist in `featuresById` and appear in `featureOrder`.

### 2.4 Sketch storage (unordered sets)

Sketch feature record contains:

* `data: Y.Map`

  * `pointsById: Y.Map<uuid, Y.Map>`
  * `entitiesById: Y.Map<uuid, Y.Map>`
  * `constraintsById: Y.Map<uuid, Y.Map>`

No ordering arrays. Treat as sets.

---

## 3. Field-name policy: minimise churn (explicit rule)

To reduce agent decision surface, **keep the field names that the repo already uses**, unless there is a strong reason to rename.

**Keep existing names:**

* Extrude: `sketch` (not `sketchId`)
* Revolve: `sketch`, `axis` (not `axisEntityId`)
* Sketch: `plane` (still named `plane`, but new structured value)

This is a mechanical rule: do not introduce new property names in feature records unless unavoidable.

---

## 4. Datum planes: role + pinned ordering

### 4.1 Why

Repo currently hard-codes `'xy'|'xz'|'yz'` all over. With UUID IDs, stable identification must be separate.

### 4.2 Requirement

* Datum plane features must include `role: 'xy'|'xz'|'yz'`.
* There must exist **exactly one** plane feature with role `xy`, exactly one with `xz`, exactly one with `yz`.
* Datum planes + origin should be “always present”.

### 4.3 Ordering policy (explicit)

To avoid accidental regressions:

* **Origin + datum planes are pinned to the start of `featureOrder`.**

  * e.g. `[origin, xyPlane, xzPlane, yzPlane, ...userFeatures]`
* UI and worker may assume these exist and appear first.
* Reordering UI should either:

  * prevent moving these, or
  * allow but then update invariant/assumptions (not in scope).
    **For v2: treat them as pinned.**

---

## 5. Zod schema: persisted snapshot contract (strict)

### 5.1 Snapshot vs live Yjs types

Zod validates `root.toJSON()`.

Validation is **dev-only** except on load (see §8.1).

### 5.2 Shared primitives

```ts
import { z } from "zod";

export const UUID = z.string().uuid();
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const Units = z.enum(["mm", "cm", "m", "in", "ft"]);
```

### 5.3 Meta + state

```ts
export const DocumentMetaSchema = z.object({
  schemaVersion: z.literal(2),
  name: z.string(),
  created: z.number(),
  modified: z.number(),
  units: Units,
}).strict();

export const DocumentStateSchema = z.object({
  rebuildGate: UUID.nullable(),
}).strict();
```

### 5.4 Sketch plane ref: discriminated union (required change)

Replace the “stringly typed” `{kind, ref: string}` with a discriminated union that types the `planeFeatureId` case as UUID:

```ts
export const SketchPlaneRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("planeFeatureId"), ref: UUID }).strict(),
  z.object({ kind: z.literal("faceRef"), ref: z.string() }).strict(),
  z.object({ kind: z.literal("custom"), ref: z.string() }).strict(),
]);
```

### 5.5 Sketch internals (unordered, UUID ids)

```ts
export const SketchPointSchema = z.object({
  id: UUID,
  x: z.number(),
  y: z.number(),
  fixed: z.boolean().optional(),
  attachedTo: z.string().optional(),
}).strict();

export const SketchLineSchema = z.object({
  id: UUID,
  type: z.literal("line"),
  start: UUID,
  end: UUID,
}).strict();

export const SketchArcSchema = z.object({
  id: UUID,
  type: z.literal("arc"),
  start: UUID,
  end: UUID,
  center: UUID,
  ccw: z.boolean(),
}).strict();

export const SketchEntitySchema = z.discriminatedUnion("type", [
  SketchLineSchema,
  SketchArcSchema,
]);

export const SketchConstraintSchema = z.union([
  z.object({ id: UUID, type: z.literal("horizontal"), points: z.tuple([UUID, UUID]) }).strict(),
  z.object({ id: UUID, type: z.literal("vertical"), points: z.tuple([UUID, UUID]) }).strict(),
  z.object({ id: UUID, type: z.literal("coincident"), points: z.tuple([UUID, UUID]) }).strict(),
  z.object({ id: UUID, type: z.literal("fixed"), point: UUID }).strict(),
  z.object({ id: UUID, type: z.literal("distance"), points: z.tuple([UUID, UUID]), value: z.number() }).strict(),
  z.object({ id: UUID, type: z.literal("angle"), lines: z.tuple([UUID, UUID]), value: z.number() }).strict(),
]);

export const SketchDataSchema = z.object({
  pointsById: z.record(UUID, SketchPointSchema),
  entitiesById: z.record(UUID, SketchEntitySchema),
  constraintsById: z.record(UUID, SketchConstraintSchema),
}).strict();
```

### 5.6 Feature schema (split datum plane vs general plane)

#### 5.6.1 Feature base

```ts
export const FeatureBaseSchema = z.object({
  id: UUID,
  type: z.string(),
  name: z.string().optional(),       // non-unique display name
  suppressed: z.boolean().optional(),
}).strict();
```

#### 5.6.2 Origin

```ts
export const OriginFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("origin"),
  visible: z.boolean().optional(),
}).strict();
```

#### 5.6.3 Planes (two variants)

Datum plane: role required.
User plane: role absent.

```ts
export const PlaneFields = {
  type: z.literal("plane"),
  normal: Vec3,
  origin: Vec3,
  xDir: Vec3,
  visible: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  color: z.string().optional(),
} as const;

export const DatumPlaneFeatureSchema = FeatureBaseSchema.extend({
  ...PlaneFields,
  role: z.enum(["xy", "xz", "yz"]),
}).strict();

export const UserPlaneFeatureSchema = FeatureBaseSchema.extend({
  ...PlaneFields,
  // no role field
}).strict();
```

#### 5.6.4 Sketch (keep field name `plane`)

```ts
export const SketchFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("sketch"),
  plane: SketchPlaneRefSchema,
  visible: z.boolean().optional(),
  data: SketchDataSchema,
}).strict();
```

#### 5.6.5 Extrude (preserve Phase 14 extents; keep field names)

Repo uses `sketch` today; keep it.

```ts
export const ExtrudeExtent = z.enum(["blind", "toFace", "toVertex", "throughAll"]);

export const ExtrudeFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("extrude"),
  sketch: UUID,
  op: z.enum(["add", "cut"]),
  direction: z.union([z.enum(["normal", "reverse"]), Vec3]),
  extent: ExtrudeExtent,
  distance: z.number().optional(),
  extentRef: z.string().optional(),
}).strict();
```

#### 5.6.6 Revolve (keep `axis` name)

```ts
export const RevolveFeatureSchema = FeatureBaseSchema.extend({
  type: z.literal("revolve"),
  sketch: UUID,
  axis: UUID,      // sketch entity id
  angle: z.number(),
  op: z.enum(["add", "cut"]),
}).strict();
```

#### 5.6.7 Feature union and doc snapshot

```ts
export const FeatureSchema = z.discriminatedUnion("type", [
  OriginFeatureSchema,
  DatumPlaneFeatureSchema,
  UserPlaneFeatureSchema,
  SketchFeatureSchema,
  ExtrudeFeatureSchema,
  RevolveFeatureSchema,
]);

export const DocSnapshotSchema = z.object({
  meta: DocumentMetaSchema,
  state: DocumentStateSchema,
  featuresById: z.record(UUID, FeatureSchema),
  featureOrder: z.array(UUID),
}).strict();
```

---

## 6. Runtime invariants (must implement)

Implement `validateInvariants(snapshot): { ok: boolean; errors: string[] }`.

### 6.1 Identity consistency (map key vs record.id)

For every `featuresById` entry `(k, v)`:

* `v.id === k`

For sketches:

* for every `(k, p)` in `pointsById`: `p.id === k`
* for every `(k, e)` in `entitiesById`: `e.id === k`
* for every `(k, c)` in `constraintsById`: `c.id === k`

### 6.2 FeatureOrder ⇄ featuresById agreement (bidirectional)

* Every id in `featureOrder` exists in `featuresById`
* No duplicates in `featureOrder`
* Every id in `featuresById` appears in `featureOrder` (no dangling features)

### 6.3 Datum plane invariants

* Exactly one `plane` feature with `role === 'xy'`
* Exactly one with `role === 'xz'`
* Exactly one with `role === 'yz'`
* Origin exists and is type `origin`
* Pinned ordering:

  * first 4 entries of `featureOrder` are `[origin, xy, xz, yz]` by resolved feature ids
    (implementation: resolve feature ids for origin/datum planes and compare positions)

### 6.4 Rebuild gate

* `state.rebuildGate` is null OR exists in `featuresById`

### 6.5 Sketch plane refs

If `sketch.plane.kind === 'planeFeatureId'`:

* `ref` exists in `featuresById` and refers to a feature with `type === 'plane'`

### 6.6 Extrude invariants (Phase 14)

* `extrude.sketch` exists and is type `sketch`
* If `extent === 'blind'` → `distance` must exist
* If `extent === 'toFace'|'toVertex'` → `extentRef` must exist

### 6.7 Revolve invariants

* `revolve.sketch` exists and is type `sketch`
* `revolve.axis` exists in that sketch’s `entitiesById`

### 6.8 Sketch internal integrity

* Entity endpoints exist in `pointsById`
* Constraint refs exist and are correct type (points vs lines)

---

## 7. Determinism policy (worker/solver vs UI)

### 7.1 Worker/solver (must be deterministic)

When iterating unordered maps in worker/solver:

* sort UUID keys lexicographically:

  * `Array.from(map.keys()).sort()`

This ensures stable rebuild behaviour under concurrency.

### 7.2 UI (should not lexicographically sort by default)

For UI rendering of sketch internals:

* preserve whatever iteration order you naturally get as “best effort” (acceptable), OR
* add `createdAt` later if ordering becomes user-visible important

**Rule:** do not apply lexicographic sorting to visible lists unless it’s explicitly desired.

---

## 8. Validation and top-level ghost-state prevention

### 8.1 Zod validation hooks (dev-only)

Zod parsing (`root.toJSON()` + `DocSnapshotSchema.parse`) can be expensive.

**Requirement:**

* Always validate on load (one-time).
* After edits, validate only behind `__DEV__` or an env flag (e.g. `VITE_VALIDATE_DOC=1`).

### 8.2 Top-level shared type assertion (dev-only, but recommended on load too)

Add a dev/startup assertion to detect accidental creation of legacy top-level types:

* On init / doc load:

  * enumerate known forbidden top-level shared types:

    * `ydoc.getMap('meta')`, `ydoc.getMap('state')`, `ydoc.getXmlFragment('features')`, `ydoc.getMap('counters')`
  * **Do not call** `getMap/getXmlFragment` in the assert itself (that would create them).
  * Instead, use Yjs internal `ydoc.share` (a Map of named shared types) to check what exists.

**Invariant:** The only allowed top-level entry is `'root'` (and provider-related awareness doesn’t count—awareness isn’t stored in ydoc.share).

If forbidden names are present, throw in dev.

> Implementation note for agent: Y.Doc has `share` (Map<string, AbstractType>). Use that to check keys without creating new ones.

---

## 9. UndoManager rules with nested maps (must)

Undo tracks:

* `featureOrder`
* `featuresById`
* `state`

**Important rule for nested maps / new submaps:**

* Any newly created `Y.Map` (feature record, sketch data map, pointsById map, point record, etc.) must be **inserted into a tracked parent** inside the transaction *before* mutating its fields.

Pattern:

```ts
doc.transact(() => {
  const feature = new Y.Map();
  featuresById.set(id, feature);   // integrate first
  feature.set('id', id);
  feature.set('type', 'sketch');
  // ...
});
```

Same pattern for points/entities/constraints.

---

## 10. Worker + solver writeback changes (repo-specific)

### 10.1 Worker rebuild loop

Replace XML fragment iteration with:

* `featureOrder` array (Y.Array of UUID strings)
* `featuresById.get(id)` for each

Preserve sequential rebuild semantics + rebuildGate logic.

### 10.2 Sketch solver writeback

Refactor the current JSON-blob rewrite into field-level updates:

* solver outputs per-point updates keyed by UUID
* apply:

  * `pointsById.get(pointId).set('x', x); set('y', y);`
* do this in a single `doc.transact` call
* never replace whole maps or store plain objects

---

## 11. UUID helper (runtime + tests)

Provide one helper used everywhere:

```ts
export function uuid(): string {
  const c = globalThis.crypto as any;
  if (c?.randomUUID) return c.randomUUID();
  return require("node:crypto").randomUUID();
}
```

Use for:

* new feature IDs
* sketch point/entity/constraint IDs

---

## 12. Document creation (v2 only)

Implement `createDocumentV2()` to create a brand new doc:

* create `root`, `meta`, `state`, `featuresById`, `featureOrder`
* set meta fields explicitly (no schema defaults)
* `schemaVersion = 2`
* `rebuildGate = null`
* create pinned default features:

  * origin feature (UUID)
  * datum planes (UUID each) with roles `xy/xz/yz`
* initialise plane vectors consistent with current defaults
* ensure `featureOrder` starts with `[originId, xyId, xzId, yzId]`

---

## 13. Model layer API (required)

Create `src/model/v2/`:

* `schema.ts`
* `yjs.ts`
* `ops.ts`
* `validate.ts`

Must provide minimal operations with the “integrate submaps before mutate” rule enforced.

---

## 14. Repo-tailored file checklist (must touch)

* `packages/app/src/document/createDocument.ts` → v2 root model
* `packages/app/src/document/featureHelpers.ts` → remove XML and replace with v2 ops
* `packages/app/src/contexts/DocumentContext.tsx` → read from root; UndoManager uses v2
* `packages/app/src/contexts/SketchContext.tsx` → map-based sketch ops + solver writeback
* `packages/app/src/worker/kernel.worker.ts` → v2 rebuild iteration; preserve extrude extents/direction
* `packages/app/src/components/Viewer.tsx` → screenToSketch uses plane vectors, not hardcoded ids
* type defs in `packages/app/src/types/document.ts` updated to match schema (keeping field names)

---

## 15. Acceptance criteria

1. No persisted XML usage; no JSON blobs for sketches.
2. No top-level shared types besides `root` (dev assert catches regressions).
3. Zod schema validates new docs on load; invariants pass.
4. Extrude extents + direction union match shipped behaviour.
5. Viewer/Sketch start logic no longer depends on `'xy'|'xz'|'yz'` IDs; uses datum plane role + vectors.
6. Sketch solver writeback updates nested point maps by UUID.

---

## 16. Mechanical rules for the agent (do not deviate)

* Keep field names: `sketch`, `axis`, `plane` as in repo today.
* Use discriminated union for sketch plane refs.
* Datum planes: role required + exactly one of each + pinned order.
* All records are `Y.Map` values; no plain objects.
* Deterministic iteration (sorted IDs) in worker/solver only.
* Validation after edits is dev-only (flag-gated).
