# SolidType Document Model Specification

This document defines the **persisted document model** for SolidType. The model uses Yjs for collaborative editing, undo/redo, and real-time synchronization.

**Implementation:** The Zod schema definitions are in [`packages/app/src/document/schema.ts`](packages/app/src/document/schema.ts).

---

## 1. Overview

The document model stores the complete state of a SolidType part:

- **Metadata** – document name, schema version, units, timestamps
- **Features** – origin, datum planes, sketches, extrudes, revolves, booleans
- **Transient state** – rebuild gate, active selections

All data is stored using Yjs shared types (`Y.Map` and `Y.Array`) under a single root map.

### 1.1 Key Design Principles

| Principle | Description |
|-----------|-------------|
| **UUID identifiers** | All features and sketch elements use UUID v4 for stable identity |
| **Y.Map records** | All records are `Y.Map` instances (never plain JS objects) |
| **Single root** | All state lives under `ydoc.getMap('root')` |
| **Zod validation** | Schema validated on load; runtime invariants enforced |
| **Deterministic rebuild** | Worker iterates in sorted order for reproducibility |

---

## 2. Document Structure

### 2.1 Root Map

```
ydoc.getMap('root')
├── meta: Y.Map           # Document metadata
├── state: Y.Map          # Transient state
├── featuresById: Y.Map   # UUID → feature Y.Map
└── featureOrder: Y.Array # Ordered list of feature UUIDs
```

### 2.2 Meta

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `2` (literal) | Document schema version |
| `name` | `string` | Document name |
| `created` | `number` | Creation timestamp (ms since epoch) |
| `modified` | `number` | Last modified timestamp |
| `units` | `'mm' \| 'cm' \| 'm' \| 'in' \| 'ft'` | Document units |

### 2.3 State

| Field | Type | Description |
|-------|------|-------------|
| `rebuildGate` | `UUID \| null` | Stop rebuild at this feature (for debugging) |

### 2.4 Features

Features are stored in `featuresById` (a `Y.Map<UUID, Y.Map>`) with ordering tracked separately in `featureOrder` (a `Y.Array<UUID>`).

A feature is "present" if and only if it exists in both `featuresById` and `featureOrder`.

---

## 3. Feature Types

### 3.1 Feature Base

All features share these base fields:

```ts
interface FeatureBase {
  id: UUID;                    // Must match the key in featuresById
  type: string;                // Feature type discriminator
  name?: string;               // Optional display name (non-unique)
  suppressed?: boolean;        // If true, skip during rebuild
}
```

### 3.2 Origin

The coordinate origin reference (exactly one per document).

```ts
interface OriginFeature extends FeatureBase {
  type: 'origin';
  visible?: boolean;
}
```

### 3.3 Datum Planes

Standard reference planes (exactly one of each role per document).

```ts
interface DatumPlaneFeature extends FeatureBase {
  type: 'plane';
  role: 'xy' | 'xz' | 'yz';    // Required for datum planes
  normal: [number, number, number];
  origin: [number, number, number];
  xDir: [number, number, number];
  visible?: boolean;
  width?: number;
  height?: number;
  color?: string;
}
```

### 3.4 User Planes

Custom reference planes (no role field).

```ts
interface UserPlaneFeature extends FeatureBase {
  type: 'plane';
  // No role field
  normal: [number, number, number];
  origin: [number, number, number];
  xDir: [number, number, number];
  visible?: boolean;
  width?: number;
  height?: number;
  color?: string;
}
```

### 3.5 Sketch

2D sketches with geometry and constraints.

```ts
interface SketchFeature extends FeatureBase {
  type: 'sketch';
  plane: SketchPlaneRef;       // Reference to sketch plane
  visible?: boolean;
  data: SketchData;            // Points, entities, constraints
}

// Sketch plane reference (discriminated union)
type SketchPlaneRef =
  | { kind: 'planeFeatureId'; ref: UUID }   // Reference to plane feature
  | { kind: 'faceRef'; ref: string }        // Reference to body face
  | { kind: 'custom'; ref: string };        // Custom plane definition
```

### 3.6 Extrude

Linear extrusion of a sketch profile.

```ts
interface ExtrudeFeature extends FeatureBase {
  type: 'extrude';
  sketch: UUID;                             // Reference to sketch feature
  op: 'add' | 'cut';
  direction: 'normal' | 'reverse' | [number, number, number];
  extent: 'blind' | 'toFace' | 'toVertex' | 'throughAll';
  distance?: number;                        // Required for 'blind'
  extentRef?: string;                       // Required for 'toFace'/'toVertex'
  // Multi-body options
  mergeScope?: 'auto' | 'new' | 'specific';
  targetBodies?: string[];
  resultBodyName?: string;
  resultBodyColor?: string;
}
```

### 3.7 Revolve

Rotational sweep of a sketch profile.

```ts
interface RevolveFeature extends FeatureBase {
  type: 'revolve';
  sketch: UUID;                // Reference to sketch feature
  axis: UUID;                  // Reference to line entity in sketch
  angle: number;               // Degrees
  op: 'add' | 'cut';
  // Multi-body options
  mergeScope?: 'auto' | 'new' | 'specific';
  targetBodies?: string[];
  resultBodyName?: string;
  resultBodyColor?: string;
}
```

### 3.8 Boolean

Explicit boolean operations between bodies.

```ts
interface BooleanFeature extends FeatureBase {
  type: 'boolean';
  operation: 'union' | 'subtract' | 'intersect';
  target: string;              // Target body ID
  tool: string;                // Tool body ID
}
```

---

## 4. Sketch Data

Sketch geometry is stored in three unordered maps:

```ts
interface SketchData {
  pointsById: Record<UUID, SketchPoint>;
  entitiesById: Record<UUID, SketchEntity>;
  constraintsById: Record<UUID, SketchConstraint>;
}
```

### 4.1 Points

```ts
interface SketchPoint {
  id: UUID;
  x: number;
  y: number;
  fixed?: boolean;
  attachedTo?: string;         // External attachment reference
  param?: number;              // Parameter on edge (0-1)
}
```

### 4.2 Entities

```ts
interface SketchLine {
  id: UUID;
  type: 'line';
  start: UUID;                 // Point ID
  end: UUID;                   // Point ID
}

interface SketchArc {
  id: UUID;
  type: 'arc';
  start: UUID;                 // Point ID
  end: UUID;                   // Point ID
  center: UUID;                // Point ID
  ccw: boolean;                // Counter-clockwise
}

type SketchEntity = SketchLine | SketchArc;
```

### 4.3 Constraints

```ts
// Geometric constraints
interface HorizontalConstraint { id: UUID; type: 'horizontal'; points: [UUID, UUID]; }
interface VerticalConstraint { id: UUID; type: 'vertical'; points: [UUID, UUID]; }
interface CoincidentConstraint { id: UUID; type: 'coincident'; points: [UUID, UUID]; }
interface FixedConstraint { id: UUID; type: 'fixed'; point: UUID; }
interface ParallelConstraint { id: UUID; type: 'parallel'; lines: [UUID, UUID]; }
interface PerpendicularConstraint { id: UUID; type: 'perpendicular'; lines: [UUID, UUID]; }
interface EqualLengthConstraint { id: UUID; type: 'equalLength'; lines: [UUID, UUID]; }
interface TangentConstraint { id: UUID; type: 'tangent'; line: UUID; arc: UUID; connectionPoint: string; }
interface SymmetricConstraint { id: UUID; type: 'symmetric'; points: [UUID, UUID]; axis: UUID; }

// Dimensional constraints
interface DistanceConstraint { id: UUID; type: 'distance'; points: [UUID, UUID]; value: number; offsetX?: number; offsetY?: number; }
interface AngleConstraint { id: UUID; type: 'angle'; lines: [UUID, UUID]; value: number; offsetX?: number; offsetY?: number; }

type SketchConstraint = HorizontalConstraint | VerticalConstraint | CoincidentConstraint 
  | FixedConstraint | DistanceConstraint | AngleConstraint | ParallelConstraint 
  | PerpendicularConstraint | EqualLengthConstraint | TangentConstraint | SymmetricConstraint;
```

---

## 5. Invariants

The document model enforces these runtime invariants:

### 5.1 Identity Consistency

- For every `(key, value)` in `featuresById`: `value.id === key`
- For sketch data: `point.id === key`, `entity.id === key`, `constraint.id === key`

### 5.2 Feature Order Agreement

- Every ID in `featureOrder` exists in `featuresById`
- Every ID in `featuresById` appears in `featureOrder`
- No duplicate IDs in `featureOrder`

### 5.3 Datum Plane Invariants

- Exactly one origin feature (type `origin`)
- Exactly one datum plane with role `xy`
- Exactly one datum plane with role `xz`
- Exactly one datum plane with role `yz`
- First 4 entries of `featureOrder` are `[origin, xy, xz, yz]`

### 5.4 Reference Integrity

- `state.rebuildGate` is null or exists in `featuresById`
- Sketch `plane.ref` (when `kind === 'planeFeatureId'`) exists and is a plane
- Extrude `sketch` exists and is a sketch
- Revolve `sketch` exists and is a sketch; `axis` exists in that sketch
- Entity endpoints exist in `pointsById`
- Constraint references exist and are correct types

---

## 6. Yjs Implementation Rules

### 6.1 Record Granularity

All records must be `Y.Map` instances:

```ts
// ✅ Correct
const feature = new Y.Map();
featuresById.set(id, feature);
feature.set('type', 'extrude');

// ❌ Incorrect
featuresById.set(id, { type: 'extrude', ... });  // Plain object!
```

### 6.2 Integration Before Mutation

New Y.Maps must be inserted into a tracked parent before setting fields:

```ts
doc.transact(() => {
  const feature = new Y.Map();
  featuresById.set(id, feature);  // Integrate first
  feature.set('id', id);          // Then mutate
  feature.set('type', 'sketch');
});
```

### 6.3 Ghost State Prevention

Only `ydoc.getMap('root')` should exist at the top level. Accessing other top-level maps (e.g., `ydoc.getMap('meta')`) is forbidden as it creates "ghost state".

A dev-only assertion checks for forbidden top-level types on document load.

### 6.4 Undo Manager Configuration

```ts
const undoManager = new Y.UndoManager([
  doc.featuresById,
  doc.featureOrder,
  doc.state
]);
```

---

## 7. Determinism Policy

### 7.1 Worker/Solver

When iterating unordered maps in the worker or solver, sort UUID keys lexicographically:

```ts
const sortedKeys = Array.from(map.keys()).sort();
for (const key of sortedKeys) {
  // Process in deterministic order
}
```

This ensures stable rebuild behavior under concurrent edits.

### 7.2 UI

UI rendering may use natural iteration order. Lexicographic sorting is not required for display purposes.

---

## 8. Validation

### 8.1 Zod Schema

The document model is formally defined using **Zod schemas** in [`packages/app/src/document/schema.ts`](packages/app/src/document/schema.ts).

Key schemas:

| Schema | Purpose |
|--------|---------|
| `DocSnapshotSchema` | Validates complete `root.toJSON()` snapshot |
| `DocumentMetaSchema` | Validates meta fields (name, version, units) |
| `DocumentStateSchema` | Validates state fields (rebuildGate) |
| `FeatureSchema` | Discriminated union of all feature types |
| `SketchDataSchema` | Validates sketch points, entities, constraints |
| `SketchPlaneRefSchema` | Discriminated union for plane references |

Example usage:

```ts
import { DocSnapshotSchema } from './schema';

const snapshot = doc.root.toJSON();
const result = DocSnapshotSchema.safeParse(snapshot);
if (!result.success) {
  console.error('Validation errors:', result.error.issues);
}
```

### 8.2 Runtime Invariants

`validateInvariants(snapshot)` in [`validate.ts`](packages/app/src/document/validate.ts) checks all invariants from §5 and returns `{ ok: boolean; errors: string[] }`.

### 8.3 Dev-Only Validation

Post-edit validation is expensive. Enable only in development via environment flag:

```ts
if (import.meta.env?.DEV) {
  validateDocument(doc.root.toJSON());
}
```

---

## 9. File Organization

Implementation files in `packages/app/src/document/`:

| File | Purpose |
|------|---------|
| `schema.ts` | Zod schemas for all feature types |
| `yjs.ts` | Yjs utilities, UUID helper, ghost state assertion |
| `createDocument.ts` | Document creation and loading |
| `featureHelpers.ts` | Feature CRUD operations |
| `validate.ts` | Schema and invariant validation |
| `index.ts` | Public exports |
