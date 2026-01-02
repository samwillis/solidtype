# Appendix: Persistent Naming Strategy

This document describes the persistent naming system that maintains stable references to topological entities across parametric edits.

> **Reference**: See also:
> - [OVERVIEW.md § 5. Persistent Naming & Edit Robustness](/OVERVIEW.md) for the architectural vision and research background.
> - **[TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md)** — Comprehensive implementation plan with FreeCAD-style algorithm details, data structures, and phased rollout.

---

## The Core Requirement

From the project overview:

> **You can build a model, edit parameters, and your references don't all explode.**

This is the single most important requirement for a parametric CAD system.

---

## Research Background

SolidType's naming design draws on several strands of prior work:

- **Kripac's Topological ID System** — Ties entity identity to the _construction history_ (feature + local context), not just "Face27"
- **OpenCascade's OCAF** (`TNaming_NamedShape`) — Records "old → new" shape pairs across operations to track sub-shape evolution
- **FreeCAD's topological naming problem and realthunder's improvements** — Highlights the pitfalls of naïve "Face1/Edge2" naming and introduces graph-based, history-aware naming schemes
- **CAD literature surveys** — Conclude that hybrid topology+geometry approaches dominate in production systems

---

## The Problem

In parametric CAD, the model is rebuilt when parameters change. This creates a challenge:

1. User selects "top face" of a box for a sketch
2. User changes box height
3. Box is rebuilt → all faces get new internal IDs
4. **Question**: How do we know which face is still the "top face"?

Without persistent naming:

- Sketch loses its plane reference
- Fillet loses its edge selection
- Extrude-to-face loses its target

---

## Layered Identity Model

SolidType distinguishes two types of identifiers:

### Ephemeral IDs

Numeric handles (`FaceId`, `EdgeId`, …) valid only within a single build:

```typescript
type FaceId = number & { __brand: "FaceId" };
type EdgeId = number & { __brand: "EdgeId" };
```

These are fast for internal use but **never stored externally**.

### Persistent References

`PersistentRef` objects that describe how an entity was created:

```typescript
interface PersistentRef {
  originFeatureId: string; // Which feature introduced the entity
  localSelector: LocalSelector; // Feature-specific path (e.g., "side face from loop 0, segment 2")
  fingerprint?: string; // Optional geometry/topology fingerprint
}
```

**External systems (constraints, dimensions, fillets) never hold raw face indices; they always hold `PersistentRef`.**

---

## Local Selectors

Different features generate different entity types with predictable selectors:

| Feature | Entity Type  | Selector Examples                           |
| ------- | ------------ | ------------------------------------------- |
| Extrude | Top face     | `top`                                       |
| Extrude | Bottom face  | `bottom`                                    |
| Extrude | Side face    | `side:0`, `side:1`, ... (from profile edge) |
| Extrude | Top edge     | `top:0`, `top:1`, ...                       |
| Extrude | Bottom edge  | `bottom:0`, `bottom:1`, ...                 |
| Extrude | Lateral edge | `lateral:0`, `lateral:1`, ...               |
| Revolve | Start face   | `start`                                     |
| Revolve | End face     | `end`                                       |
| Revolve | Outer face   | `outer`                                     |
| Fillet  | Fillet face  | `fillet:0`, `fillet:1`, ...                 |

### String Format

```
face:e1:top
edge:e1:top:0
vertex:e1:corner:0
```

### Feature-Domain Naming

Where possible, SolidType keeps references in **feature space**:

> "Cylindrical side face of Extrude#5 from profile edge #2" is much more stable than "Face19 of Body3"

For sketches attached to edges, we resolve selections into feature-local selectors and only translate them to final BREP entities on demand.

---

## Evolution Graph

Each modeling step (extrude, revolve, boolean, etc.) produces an **evolution mapping**:

```typescript
interface EntityEvolution {
  old: PersistentRef | null; // null for births
  news: PersistentRef[]; // zero, one, or many descendants
  operation: "split" | "merge" | "unchanged" | "deleted" | "created";
}
```

Over time, SolidType maintains a graph similar to OCAF's "old/new shape" pairs.

### Resolution Algorithm

When resolving a `PersistentRef`:

1. Start from the originating feature's subshape(s)
2. Walk forward along evolution mappings to the current model
3. Use fingerprints as tie-breakers in splits/merges
4. Return:
   - A unique subshape if found
   - `"ambiguous"` when multiple candidates exist
   - `"lost"` when identity can't be recovered

```typescript
function resolveWithEvolution(ref: PersistentRef, session: SolidSession): ResolveResult {
  // Direct resolution
  const directResult = resolvePersistentRef(ref, session);
  if (directResult) {
    return { type: "found", face: directResult };
  }

  // Check evolution history
  const evolution = session.getEvolution(ref);

  if (evolution) {
    switch (evolution.operation) {
      case "deleted":
        return { type: "deleted" };
      case "split":
        return {
          type: "split",
          faces: evolution.news.map((r) => resolvePersistentRef(r, session)),
        };
      case "merge":
        return {
          type: "merged",
          face: resolvePersistentRef(evolution.news[0], session),
        };
    }
  }

  return { type: "not_found" };
}
```

---

## Fingerprints

Geometric fingerprints help disambiguate when topology alone isn't enough:

```typescript
interface FaceFingerprint {
  surfaceType: "plane" | "cylinder" | "cone" | "sphere" | "torus";
  approximateArea: number;
  centroid: [number, number, number];
  normal: [number, number, number]; // For planar faces
  adjacentFaceCount: number;
}

function computeFaceFingerprint(face: Face): FaceFingerprint {
  return {
    surfaceType: face.getSurface().kind,
    approximateArea: face.getArea(),
    centroid: face.getCentroid(),
    normal: face.getNormal(),
    adjacentFaceCount: face.getAdjacentFaces().length,
  };
}
```

---

## Implementation

### During Feature Creation

```typescript
function createExtrudeBody(profile: Profile, distance: number): Body {
  const body = new Body();

  // Create bottom face with selector
  const bottomFace = createPlanarFace(profile);
  bottomFace.localSelector = "bottom";
  body.addFace(bottomFace);

  // Create top face with selector
  const topFace = createPlanarFace(offsetProfile(profile, distance));
  topFace.localSelector = "top";
  body.addFace(topFace);

  // Create side faces with indexed selectors
  let sideIndex = 0;
  for (const edge of profile.edges) {
    const sideFace = createRuledFace(edge, distance);
    sideFace.localSelector = `side:${sideIndex++}`;
    body.addFace(sideFace);
  }

  return body;
}
```

### Recording Evolution

```typescript
// After boolean operation
session.naming.recordEvolution({
  operation: "boolean:subtract",
  inputRefs: [targetRef, toolRef],
  outputs: resultBody.getAllEntities().map((e) => ({
    ref: createRef(e),
    derivedFrom: findAncestors(e, targetRef, toolRef),
  })),
});
```

---

## Edge and Vertex Naming

### Edge Naming

Edges are named by their adjacent faces:

```typescript
interface EdgeSelector {
  face1: string; // First adjacent face selector
  face2: string; // Second adjacent face selector
  index?: number; // If multiple edges between same faces
}

// Example: "edge:e1:top-side:0"
// Edge between top face and side:0 face
```

### Vertex Naming

Vertices are named by their adjacent edges:

```typescript
interface VertexSelector {
  edges: string[]; // Adjacent edge selectors
  index?: number;
}

// Example: "vertex:e1:corner:0"
```

---

## Pluggable Architecture

The naming system is intentionally **pluggable**:

```typescript
interface NamingStrategy {
  createRef(entity: Entity, featureId: string): PersistentRef;
  resolve(ref: PersistentRef, session: SolidSession): Entity | "ambiguous" | null;
  recordEvolution(evolution: EvolutionEvent): void;
}
```

This makes it straightforward to experiment with alternative algorithms inspired by research papers or FreeCAD/realthunder's approach.

---

## Naming Module Structure

```typescript
// packages/core/src/naming/

// types.ts
export interface PersistentRef { ... }
export interface LocalSelector { ... }
export interface EntityEvolution { ... }

// evolution.ts
export class EvolutionTracker {
  recordCreation(feature: FeatureId, entities: Entity[]): void;
  recordBoolean(operation: BooleanOp, result: Body): void;
  getEvolution(ref: PersistentRef): EntityEvolution | null;
}

// resolve.ts
export function resolveFaceRef(ref: string, session: SolidSession): Face | null;
export function resolveEdgeRef(ref: string, session: SolidSession): Edge | null;
export function resolveVertexRef(ref: string, session: SolidSession): Vertex | null;

// create.ts
export function createFaceRef(face: Face, featureId: string): string;
export function createEdgeRef(edge: Edge, featureId: string): string;
export function createVertexRef(vertex: Vertex, featureId: string): string;
```

---

## Integration Points

### Reference Storage (in Yjs)

```xml
<extrude id="e2" extent="toFace" extentRef="face:e1:top" />
<sketch id="s2" plane="face:e1:top" />
<fillet id="f1" edges="edge:e1:top:0,edge:e1:top:1" />
```

### Resolution During Rebuild

```typescript
const targetFace = session.naming.resolveFaceRef(feature.extentRef);
if (targetFace === null) {
  throw new BuildError("Referenced face not found", feature.id);
}
if (targetFace === "ambiguous") {
  throw new BuildError("Referenced face is ambiguous after edit", feature.id);
}
```

---

## Testing Strategy

### Unit Tests

```typescript
test("createFaceRef generates correct format", () => {
  const face = mockFace({ localSelector: "top" });
  const ref = createFaceRef(face, "e1");
  expect(ref).toBe("face:e1:top");
});

test("resolveFaceRef finds matching face", () => {
  const session = createSessionWithBox();
  const face = resolveFaceRef("face:e1:top", session);
  expect(face).not.toBeNull();
  expect(face.localSelector).toBe("top");
});

test("reference survives parameter change", () => {
  // Create box, get ref to top face
  // Change box height
  // Resolve reference - should still work
});

test("split face returns ambiguous or multiple", () => {
  // Create face, boolean that splits it
  // Original ref should report split
});
```

---

## Known Limitations

1. **Complex booleans** - Some operations create hard-to-track topology changes
2. **Fillet/chamfer** - New faces may not map clearly to original edges
3. **Import geometry** - No creation history for imported models

### Mitigation

- Fall back to fingerprint matching
- Prompt user to re-select when reference is lost
- Clear error messages explaining what happened
