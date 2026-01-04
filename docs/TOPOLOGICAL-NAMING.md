# Topological Naming Implementation Plan

This document provides a comprehensive specification for implementing robust topological naming in SolidType. It is based on extensive research of:

- **FreeCAD/realthunder's implementation** — The most complete open-source implementation of OCCT-based topological naming
- **OpenCascade's OCAF** — Native shape evolution tracking via `TNaming_NamedShape`
- **Kripac's research** — Foundational work on persistent topological references
- **FreeCAD upstream integration** — Phased approach to element mapping (`ElementMap`, `ComplexGeoData`)

---

## Table of Contents

0. [Key Design Decisions](#0-key-design-decisions)
1. [Problem Statement](#1-problem-statement)
2. [Goals & Success Criteria](#2-goals--success-criteria)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Data Structures](#4-core-data-structures)
5. [The Naming Algorithm](#5-the-naming-algorithm)
6. [Integration with OpenCascade.js](#6-integration-with-opencascadejs)
7. [Reference Storage & Resolution](#7-reference-storage--resolution)
8. [Serialization & Persistence](#8-serialization--persistence)
9. [Implementation Phases](#9-implementation-phases)
10. [Testing Strategy](#10-testing-strategy)
11. [Known Limitations & Fallbacks](#11-known-limitations--fallbacks)
12. [Appendix: FreeCAD Code Reference](#appendix-freecad-code-reference)

---

## 0. Key Design Decisions

This section documents explicit design decisions made to align the FreeCAD-style naming approach with SolidType's existing architecture.

### 0.1 PersistentRef vs MappedName

| Aspect                      | Decision                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **External storage format** | `PersistentRef` in pinned format `type:featureId:selector` (stored in Yjs)                  |
| **Internal representation** | `MappedName` (FreeCAD-style strings like `Face1;:M;XTR;:T5`)                                |
| **Translation**             | Naming service translates between formats at read/write time                                |
| **Rationale**               | Maintains backward compatibility with pinned schema while gaining FreeCAD's algorithm power |

**MappedName is INTERNAL ONLY** — never stored in documents, never exposed to app layer.

### 0.2 API Boundary (App ↔ Core)

| Aspect                 | Decision                                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| **App sees**           | `PersistentRef` strings, opaque handles (`BodyId`, `FaceId`, `EdgeId`) |
| **App never sees**     | `TopoDS_Shape`, `MappedName`, `IndexedName`                            |
| **Selection handling** | App passes `FaceId`/`EdgeId` → Core returns `PersistentRef` string     |
| **Resolution**         | App passes `PersistentRef` string → Core returns `FaceId`/`EdgeId`     |

This maintains the architectural boundary that isolates OCCT types to the kernel layer.

### 0.3 Feature Identity: UUID vs Display Name

> **📘 See also:** [CAD-UX-SPEC.md § 14.0](CAD-UX-SPEC.md#140-feature-identity-id-vs-display-name) for UI guidelines on showing feature names.

> **✅ Schema Update**: The pinned decision in `00-overview.md` has been updated to reflect that Feature IDs are UUIDs. The short format (`s1`, `e1`) was a display convenience now replaced by the `name` field.

Features have TWO identifiers - only the internal UUID is used for stable references:

| Aspect                    | Internal ID (`id`)                                           | Display Name (`name`)               |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| **Format**                | UUID string (e.g., `"f7a8b3c2-1234-5678-9abc-def012345678"`) | Human-readable (e.g., `"Extrude1"`) |
| **Stability**             | ✅ **Immutable** - never changes                             | ❌ User can rename at any time      |
| **Use in PersistentRef**  | ✅ **Always** - this is the `featureId` component            | ❌ **Never**                        |
| **Use in UI**             | ❌ **Never show to user**                                    | ✅ **Always show to user**          |
| **Use in error messages** | ❌ Never                                                     | ✅ Always                           |

**PersistentRef uses internal UUID:**

```
face:<uuid>:top          ← CORRECT: face:f7a8b3c2-1234-5678-9abc-def012345678:top
face:<displayName>:top   ← WRONG: face:Extrude1:top (breaks if user renames)
```

**Why this matters:**

- User renames "Extrude1" to "Base" → references using UUID still work
- User renames "Extrude1" to "Base" → references using display name would break

### 0.4 Tag Stability

| Aspect             | Decision                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| **Tag allocation** | `FeatureTagRegistry` maps `FeatureId` (UUID) → `Tag`                       |
| **Persistence**    | Registry is serialized with document, tags never reset                     |
| **Tag reuse**      | Tags are NEVER reused, even after feature deletion                         |
| **Rationale**      | Ensures MappedName strings with embedded tags remain valid across sessions |

### 0.5 Fallback Behavior

| Aspect                        | Decision                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------- |
| **No mapped name found**      | Construct `PersistentRef` from origin feature UUID + local selector              |
| **Never store indexed names** | IndexedName (Face7) is NEVER stored, always converted to PersistentRef           |
| **Resolution failure**        | Return structured error with hints (using display name), never return stale data |

---

## 1. Problem Statement

### 1.1 The Core Issue

In OpenCASCADE (and any B-Rep kernel), topological entities (faces, edges, vertices) are typically referenced by:

- **Exploration order**: "Face1, Face2, Face7..." from `TopExp_Explorer`
- **Transient identity**: `TopoDS_Shape` pointers / TShape hashes

After **recompute** (when upstream features change), OCCT will often:

- **Split** faces/edges (one becomes two)
- **Merge** faces/edges (two become one)
- **Reorder** exploration order (Face7 becomes Face3)
- Generate "similar" topology with **different identity**

**Consequence**: A reference like "Face7" becomes meaningless after parametric edits.

### 1.2 User-Visible Symptoms (Without Naming)

Without robust topological naming, users experience:

1. **Sketch detachment** — A sketch on the "top face" moves to a random face
2. **Fillet failure** — Fillet on edge loses its target
3. **Extrude-to-face breaks** — "Up to face" extent can't find the target
4. **Pattern corruption** — Circular patterns lose their selected faces
5. **Dimension loss** — Dimensional constraints reference wrong geometry

These are the notorious "topological naming problem" symptoms that have plagued open-source CAD for decades.

### 1.3 Why This Is Hard

The challenge is that OCCT provides no native stable identity. We must:

1. **Track history** — Record what shapes were generated/modified by each operation
2. **Build names** — Create stable string identifiers from this history
3. **Handle splits/merges** — Design for one-to-many and many-to-one mappings
4. **Survive renames** — Indices change, but stable names must persist
5. **Balance precision vs stability** — Too precise = brittle, too vague = ambiguous

---

## 2. Goals & Success Criteria

### 2.1 Primary Goals

1. **References survive parametric edits** — Change box height, sketches on top face still work
2. **Multi-feature robustness** — 10+ feature models with interconnected references work
3. **Clear failure modes** — When a reference truly can't be resolved, report it cleanly
4. **Performance** — Naming overhead < 10% of modeling operation time

### 2.2 Success Metrics

| Scenario                                | Target                             |
| --------------------------------------- | ---------------------------------- |
| Simple box → extrude chain (5 features) | 100% reference stability           |
| Add/remove sketch holes                 | 95%+ edge references stable        |
| Boolean operations                      | 90%+ face references stable        |
| Fillet/chamfer on selected edges        | 95%+ stable after upstream edits   |
| Import/export cycle                     | References survive STEP round-trip |

### 2.3 Non-Goals (Initial Implementation)

- NURBS surface-specific naming (future)
- Assembly cross-part references (future)
- Historical query ("what was Face7 three edits ago?")
- Real-time collaborative conflict resolution on names

---

## 3. Architecture Overview

### 3.1 Layered Design

```
┌─────────────────────────────────────────────────────────────────┐
│                          App Layer                               │
│   Stores PersistentRef in features (format: type:featureId:sel) │
│   Uses opaque handles: BodyId, FaceId, EdgeId                   │
│   NEVER sees: TopoDS_Shape, MappedName, IndexedName             │
├─────────────────────────────────────────────────────────────────┤
│                     Naming Service Layer                         │
│   TopoNamingService - central orchestrator                       │
│   Translates: PersistentRef ↔ MappedName ↔ IndexedName          │
│   MappedName - INTERNAL structured stable identifier            │
│   ElementMap - bidirectional indexed ↔ mapped name mapping       │
├─────────────────────────────────────────────────────────────────┤
│                     Mapper Abstraction Layer                     │
│   HistoryMapper - wraps OCCT maker history APIs                  │
│   Handles Generated/Modified/Deleted queries                    │
├─────────────────────────────────────────────────────────────────┤
│                     OCCT Integration Layer                       │
│   Shape wrapper with attached ElementMap                         │
│   Tag/FeatureId stamping on shapes (via FeatureTagRegistry)     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Key Design Principles (from FreeCAD)

1. **Names are history-based, not geometry-based** — We use OCCT maker history (Generated/Modified) as the primary source of identity

2. **Names are strings with structured semantics** — Not opaque IDs, but parseable tokens encoding the history chain

3. **ElementMap is the central data structure** — Every shape carries a bidirectional mapping between indexed names (Face7) and mapped names (stable)

4. **Tags scope names to features** — Each feature gets a unique integer tag to prevent collisions

5. **Four-stage naming algorithm** — Copy unchanged → History-based → Upper fallback → Lower fallback

### 3.3 Alignment with SolidType Architecture

Our current `naming/` module has the right foundation:

- `PersistentRef` → **Remains the external storage format** (`type:featureId:selector`)
- `MappedName` → **Internal representation** inside the naming service (never stored in Yjs)
- `FeatureId` → Maps to `Tag` via a persistent `FeatureId → Tag` table
- `NamingStrategy` → Will become `TopoNamingService`
- `EvolutionMapping` → Will be generated from OCCT mapper history

**Key Design Decision**: MappedName vs PersistentRef

```
┌─────────────────────────────────────────────────────────────────────┐
│                        STORAGE LAYER (Yjs)                           │
│  Features store: PersistentRef strings                              │
│  Format: "type:featureId:selector" (PINNED - do not change)         │
│  Example: "face:e1:top" or "edge:e1:lateral:2"                      │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   NAMING SERVICE LAYER (Core)                        │
│  Translates between PersistentRef ↔ MappedName ↔ IndexedName        │
│  MappedName is INTERNAL ONLY - never exposed to app or stored       │
│  Uses ElementMap to resolve references at rebuild time              │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        OCCT LAYER (Internal)                         │
│  IndexedName - exploration order (Face7, Edge12)                    │
│  TopoDS_Shape - NEVER exposed outside kernel/                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Key integration point**: The `kernel/` layer will manage `Shape` objects that carry `ElementMap`. The app only sees opaque handles (`BodyId`, `FaceId`, `EdgeId`) and `PersistentRef` strings.

---

## 4. Core Data Structures

### 4.1 IndexedName

The raw OCCT-style name (unstable).

```typescript
/**
 * IndexedName - OCCT exploration order name
 * Examples: "Face7", "Edge12", "Vertex3"
 *
 * ⚠️  CRITICAL: These are valid only within a single build and MUST NEVER
 *    be stored in documents, features, or passed outside the kernel.
 *    Always convert to PersistentRef before storing or exposing to app.
 */
interface IndexedName {
  type: "Face" | "Edge" | "Vertex" | "Wire" | "Shell" | "Solid";
  index: number;
}

// String form: "Face7", "Edge12"
function indexedNameToString(name: IndexedName): string {
  return `${name.type}${name.index}`;
}

function parseIndexedName(s: string): IndexedName | null {
  const match = s.match(/^(Face|Edge|Vertex|Wire|Shell|Solid)(\d+)$/);
  if (!match) return null;
  return { type: match[1] as IndexedName["type"], index: parseInt(match[2]) };
}
```

### 4.2 MappedName

The stable name encoding history. Based on FreeCAD's string-based approach.

```typescript
/**
 * MappedName - stable element name encoding history
 *
 * Format (conceptual):
 *   <baseElementName>[;<opMarker><index>][;:T<tag>][;:H<hash>]
 *
 * Examples:
 *   - "Face1" — primitive face
 *   - "Face1;:M;XTR;:T5" — Face1 modified by extrude, feature tag 5
 *   - "Edge3;:G;XTR;:T5" — Edge3 generated by extrude, feature tag 5
 *   - "Face1;:U2" — Face1's 2nd sub-element (upper element fallback)
 *   - "(Edge1,Edge2,Edge3);:L" — Face from lower elements (edges)
 */
interface MappedName {
  /** The raw string representation */
  raw: string;

  /** Parsed tokens (cached) */
  tokens?: MappedNameToken[];
}

interface MappedNameToken {
  kind: "element" | "op" | "tag" | "hash" | "upper" | "lower" | "index" | "generated" | "modified";
  value: string | number;
}

/**
 * Operation codes (from FreeCAD's TopoShapeOpCode.h)
 */
const OpCodes = {
  EXTRUDE: "XTR",
  REVOLVE: "RVL",
  FUSE: "FUS",
  CUT: "CUT",
  COMMON: "CMN",
  FILLET: "FLT",
  CHAMFER: "CHF",
  OFFSET: "OFS",
  LOFT: "LFT",
  SWEEP: "SWP",
  PIPE: "PIP",
  COPY: "CPY",
  TRANSFORM: "XFM",
  COMPOUND: "CMP",
  BOOLEAN: "BOL",
  MAKER: "MAK",
  SOLID: "SLD",
  SHELL: "SHL",
  WIRE: "WIR",
  FACE: "FAC",
} as const;

/**
 * Postfix markers (from FreeCAD)
 */
const PostfixMarkers = {
  ELEMENT_MAP_PREFIX: ";", // Marks a mapped element name
  TAG_POSTFIX: ";:T", // Feature tag follows
  UPPER_POSTFIX: ";:U", // Upper element fallback
  LOWER_POSTFIX: ";:L", // Lower element fallback
  MODIFIED_POSTFIX: ";:M", // Element was modified
  GENERATED_POSTFIX: ";:G", // Element was generated
  MODGEN_POSTFIX: ";:MG", // Both modified and generated
  INDEX_POSTFIX: ";:I", // Array index
  MISSING_PREFIX: "?", // Missing element marker
} as const;
```

### 4.3 MappedElement

The pairing of indexed and mapped names.

```typescript
/**
 * MappedElement - associates an indexed name with its stable mapped name
 *
 * Based on FreeCAD's MappedElement class.
 */
interface MappedElement {
  indexed: IndexedName;
  mapped: MappedName;
  /** Optional string IDs for compressed/hashed portions */
  stringIds?: StringId[];
}
```

### 4.4 ElementMap

The central bidirectional mapping structure.

```typescript
/**
 * ElementMap - bidirectional mapping between indexed and mapped names
 *
 * Based on FreeCAD's ElementMap class. Key properties:
 * - One indexed name can have multiple mapped names
 * - One mapped name maps to exactly one indexed name
 * - Supports hierarchical/child maps for compounds
 * - Serializable for persistence
 */
class ElementMap {
  /** Map from indexed name string to list of mapped names */
  private indexedToMapped: Map<string, MappedName[]>;

  /** Map from mapped name string to indexed name */
  private mappedToIndexed: Map<string, IndexedName>;

  /** Child maps for compound shapes */
  private childMaps: Map<number, ElementMap>;

  /** The feature tag this map belongs to */
  private tag: number;

  /** String hasher for name compression (optional) */
  private hasher?: StringHasher;

  /**
   * Get mapped names for an indexed element
   */
  getMappedNames(indexed: IndexedName): MappedName[] {
    return this.indexedToMapped.get(indexedNameToString(indexed)) ?? [];
  }

  /**
   * Get indexed name for a mapped name
   */
  getIndexedName(mapped: MappedName): IndexedName | null {
    return this.mappedToIndexed.get(mapped.raw) ?? null;
  }

  /**
   * Set a mapping (can add multiple mapped names to same indexed)
   */
  setMapping(indexed: IndexedName, mapped: MappedName, overwrite = false): void {
    const indexedStr = indexedNameToString(indexed);
    const existingMapped = this.indexedToMapped.get(indexedStr) ?? [];

    if (overwrite) {
      // Remove old reverse mappings
      for (const old of existingMapped) {
        this.mappedToIndexed.delete(old.raw);
      }
      this.indexedToMapped.set(indexedStr, [mapped]);
    } else {
      existingMapped.push(mapped);
      this.indexedToMapped.set(indexedStr, existingMapped);
    }

    this.mappedToIndexed.set(mapped.raw, indexed);
  }

  /**
   * Copy mappings from another element map
   */
  copyFrom(other: ElementMap, postfix?: string): void {
    for (const [mappedStr, indexed] of other.mappedToIndexed) {
      const newMapped: MappedName = {
        raw: postfix ? mappedStr + postfix : mappedStr,
      };
      this.setMapping(indexed, newMapped);
    }
  }

  /**
   * Serialize to a portable format
   */
  serialize(): SerializedElementMap {
    // Implementation follows FreeCAD's ElementMap::save()
  }

  /**
   * Deserialize from portable format
   */
  static deserialize(data: SerializedElementMap): ElementMap {
    // Implementation follows FreeCAD's ElementMap::restore()
  }
}
```

### 4.5 Shape Wrapper with ElementMap

Every shape in our kernel carries its element map.

```typescript
/**
 * TopoShape - shape wrapper with element map
 *
 * Mirrors FreeCAD's Part::TopoShape which extends Data::ComplexGeoData.
 */
interface TopoShape {
  /** The underlying OCCT TopoDS_Shape */
  shape: TopoDS_Shape;

  /** Unique tag for this shape's owning feature */
  tag: number;

  /** Element name mapping */
  elementMap: ElementMap;

  /** Optional string hasher for compression */
  hasher?: StringHasher;
}
```

### 4.6 Tag/FeatureId System

Tags must be **stable across sessions** because MappedName strings embed them. Since FeatureIds are stable UUIDs (e.g., `"f7a8b3c2-1234-..."`), we derive tags deterministically from FeatureIds via a persistent registry.

```typescript
/**
 * FeatureTag - unique integer identifier for a feature
 *
 * Each feature in the model gets a unique tag. This tag is stamped
 * onto shapes created by that feature, allowing names to be scoped.
 *
 * Tag = 0 means "no mapping" / disabled.
 *
 * IMPORTANT: Tags must be STABLE across sessions. We achieve this by:
 * 1. Deriving tags from FeatureId using a persistent mapping table
 * 2. Storing the FeatureId→Tag table in the document
 * 3. Never reusing tags, even after feature deletion
 */
type FeatureTag = number;

/**
 * FeatureTagRegistry - manages stable FeatureId → Tag mapping
 *
 * This registry is persisted with the document to ensure tags are stable
 * across sessions and rebuilds. Tags are never reused.
 *
 * NOTE: FeatureId here is the internal UUID (e.g., "f7a8b3c2-1234-..."),
 * NOT the display name (e.g., "Extrude1"). This ensures stability even
 * when users rename features.
 */
class FeatureTagRegistry {
  /** Persisted mapping: FeatureId (UUID) → Tag */
  private featureToTag: Map<string, FeatureTag> = new Map();

  /** Next tag to allocate (persisted, never reset) */
  private nextTag = 1;

  /**
   * Get or allocate a tag for a feature.
   * Returns the same tag for the same featureId across sessions.
   */
  getOrAllocate(featureId: string): FeatureTag {
    const existing = this.featureToTag.get(featureId);
    if (existing !== undefined) {
      return existing;
    }

    const tag = this.nextTag++;
    this.featureToTag.set(featureId, tag);
    return tag;
  }

  /**
   * Get tag for a feature (returns undefined if not registered)
   */
  getTag(featureId: string): FeatureTag | undefined {
    return this.featureToTag.get(featureId);
  }

  /**
   * Get featureId for a tag (reverse lookup for resolution)
   */
  getFeatureId(tag: FeatureTag): string | undefined {
    for (const [fid, t] of this.featureToTag) {
      if (t === tag) return fid;
    }
    return undefined;
  }

  /**
   * Serialize for document storage
   */
  serialize(): SerializedTagRegistry {
    return {
      version: 1,
      nextTag: this.nextTag,
      mappings: Array.from(this.featureToTag.entries()).map(([fid, tag]) => ({ fid, tag })),
    };
  }

  /**
   * Restore from document
   */
  static deserialize(data: SerializedTagRegistry): FeatureTagRegistry {
    const registry = new FeatureTagRegistry();
    registry.nextTag = data.nextTag;
    for (const { fid, tag } of data.mappings) {
      registry.featureToTag.set(fid, tag);
    }
    return registry;
  }
}

interface SerializedTagRegistry {
  version: number;
  nextTag: number;
  mappings: Array<{ fid: string; tag: FeatureTag }>;
}
```

**Why not just use FeatureId as string in MappedName?**

FreeCAD uses integer tags for performance (string comparisons in hot loops are expensive). We follow the same approach but ensure stability by persisting the mapping.

---

## 5. The Naming Algorithm

This is the core of the topological naming system, based on FreeCAD's `TopoShape::makESHAPE()` function.

### 5.1 Overview: Four-Stage Naming

When a modeling operation produces a new shape, we name its elements in four stages:

1. **Copy unchanged elements** — Elements that exist identically in input and output keep their names
2. **History-based naming** — Use OCCT maker's Generated/Modified history to name elements
3. **Upper element fallback** — Name unnamed lower elements (edges/vertices) from named upper elements (faces)
4. **Lower element fallback** — Name unnamed upper elements from their named lower elements

### 5.2 Stage 0: Setup

```typescript
interface NamingContext {
  /** Result shape being named */
  resultShape: TopoDS_Shape;

  /** Input shapes with their element maps */
  inputShapes: TopoShape[];

  /** History mapper for Generated/Modified queries */
  mapper: HistoryMapper;

  /** Operation code for this step */
  opCode: string;

  /** Output element map being built */
  resultMap: ElementMap;
}

function makESHAPE(ctx: NamingContext): ElementMap {
  const { resultShape, inputShapes, mapper, opCode, resultMap } = ctx;

  // Initialize result element map
  resultMap.clear();

  if (inputShapes.length === 0) {
    // Primitive creation - no history, just return empty map
    return resultMap;
  }

  // Build index caches for result shape
  const faceCache = new ShapeIndexCache(resultShape, TopAbs_FACE);
  const edgeCache = new ShapeIndexCache(resultShape, TopAbs_EDGE);
  const vertexCache = new ShapeIndexCache(resultShape, TopAbs_VERTEX);

  // Stage 1: Copy unchanged elements
  copyUnchangedElements(ctx, faceCache, edgeCache, vertexCache);

  // Stage 2: History-based naming
  applyHistoryNaming(ctx, faceCache, edgeCache, vertexCache);

  // Stage 3: Upper element fallback (faces → edges → vertices)
  applyUpperFallback(ctx, faceCache, edgeCache, vertexCache);

  // Stage 4: Lower element fallback (edges → faces)
  applyLowerFallback(ctx, faceCache, edgeCache, vertexCache);

  return resultMap;
}
```

### 5.3 Stage 1: Copy Unchanged Elements

Elements that survive unchanged keep their existing names.

```typescript
function copyUnchangedElements(
  ctx: NamingContext,
  faceCache: ShapeIndexCache,
  edgeCache: ShapeIndexCache,
  vertexCache: ShapeIndexCache
): void {
  const { inputShapes, resultMap } = ctx;

  for (const input of inputShapes) {
    // For each element type (Face, Edge, Vertex)
    for (const cache of [faceCache, edgeCache, vertexCache]) {
      const inputCache = new ShapeIndexCache(input.shape, cache.type);

      for (let i = 1; i <= inputCache.count(); i++) {
        const inputElement = inputCache.find(i);

        // Check if this element exists in result (by OCCT identity)
        const resultIndex = cache.findByShape(inputElement);
        if (resultIndex === 0) continue; // Not in result

        // Get mapped names from input
        const indexed: IndexedName = { type: cache.typeName, index: i };
        const mappedNames = input.elementMap.getMappedNames(indexed);

        if (mappedNames.length === 0) continue;

        // Copy to result with same indexed name
        const resultIndexed: IndexedName = { type: cache.typeName, index: resultIndex };
        for (const mapped of mappedNames) {
          resultMap.setMapping(resultIndexed, mapped);
        }
      }
    }
  }
}
```

### 5.4 Stage 2: History-Based Naming (The Core)

This is where we use OCCT's `Generated()` and `Modified()` history.

```typescript
interface HistoryMapper {
  /**
   * Get shapes that were generated from an input shape
   * (e.g., face generated from edge during extrude)
   */
  generated(inputShape: TopoDS_Shape): TopoDS_Shape[];

  /**
   * Get shapes that were modified from an input shape
   * (e.g., face modified during boolean)
   */
  modified(inputShape: TopoDS_Shape): TopoDS_Shape[];
}

interface NameCandidate {
  /** The indexed name in the result */
  indexed: IndexedName;

  /** Source element's mapped name */
  sourceName: MappedName;

  /** Source feature tag */
  sourceTag: number;

  /** Index for disambiguation (1, 2, 3... for multiple outputs) */
  index: number;

  /** Whether this is generated (true) or modified (false) */
  isGenerated: boolean;

  /** Source shape type (for detecting high-level mappings) */
  sourceType: TopAbs_ShapeEnum;
}

function applyHistoryNaming(
  ctx: NamingContext,
  faceCache: ShapeIndexCache,
  edgeCache: ShapeIndexCache,
  vertexCache: ShapeIndexCache
): void {
  const { inputShapes, mapper, opCode, resultMap } = ctx;

  // Collect all naming candidates from history
  const candidates: Map<string, NameCandidate[]> = new Map();

  for (const input of inputShapes) {
    // Process faces, edges, vertices from input
    for (const cache of [faceCache, edgeCache, vertexCache]) {
      const inputCache = new ShapeIndexCache(input.shape, cache.type);

      for (let i = 1; i <= inputCache.count(); i++) {
        const inputElement = inputCache.find(i);
        const indexed: IndexedName = { type: cache.typeName, index: i };
        const mappedNames = input.elementMap.getMappedNames(indexed);

        if (mappedNames.length === 0) continue;
        const primaryName = mappedNames[0];

        // Check Modified history
        let k = 0;
        for (const modifiedShape of mapper.modified(inputElement)) {
          k++;
          const resultCache = getCacheForType(modifiedShape.ShapeType());
          const resultIndex = resultCache?.findByShape(modifiedShape);
          if (!resultIndex) continue;

          const resultIndexed: IndexedName = {
            type: resultCache!.typeName,
            index: resultIndex,
          };

          // Skip if already named
          if (resultMap.getMappedNames(resultIndexed).length > 0) continue;

          const key = indexedNameToString(resultIndexed);
          const list = candidates.get(key) ?? [];
          list.push({
            indexed: resultIndexed,
            sourceName: primaryName,
            sourceTag: input.tag,
            index: k,
            isGenerated: false,
            sourceType: cache.type,
          });
          candidates.set(key, list);
        }

        // Check Generated history
        k = 0;
        for (const generatedShape of mapper.generated(inputElement)) {
          k++;
          const resultCache = getCacheForType(generatedShape.ShapeType());
          const resultIndex = resultCache?.findByShape(generatedShape);
          if (!resultIndex) continue;

          const resultIndexed: IndexedName = {
            type: resultCache!.typeName,
            index: resultIndex,
          };

          // Skip if already named
          if (resultMap.getMappedNames(resultIndexed).length > 0) continue;

          const key = indexedNameToString(resultIndexed);
          const list = candidates.get(key) ?? [];
          list.push({
            indexed: resultIndexed,
            sourceName: primaryName,
            sourceTag: input.tag,
            index: -k, // Negative for generated (convention)
            isGenerated: true,
            sourceType: cache.type,
          });
          candidates.set(key, list);
        }
      }
    }
  }

  // Now construct actual names from candidates
  for (const [elementKey, candidateList] of candidates) {
    if (candidateList.length === 0) continue;

    // Sort candidates (prefer lower shape type mappings over higher)
    candidateList.sort((a, b) => {
      // Lower sourceType value = more specific (Vertex < Edge < Face)
      return a.sourceType - b.sourceType;
    });

    const primary = candidateList[0];

    // Build the mapped name
    let newName = primary.sourceName.raw;

    // Add operation postfix
    const postfix = primary.isGenerated
      ? PostfixMarkers.GENERATED_POSTFIX
      : PostfixMarkers.MODIFIED_POSTFIX;

    // Add index if multiple outputs from same source
    const absIndex = Math.abs(primary.index);
    const indexStr = absIndex > 1 ? absIndex.toString() : "";

    // Add tag
    const tagStr =
      primary.sourceTag !== 0 ? `${PostfixMarkers.TAG_POSTFIX}${primary.sourceTag}` : "";

    // Construct full name
    newName = `${newName}${postfix}${indexStr};${opCode}${tagStr}`;

    // If multiple sources, encode them all
    if (candidateList.length > 1) {
      const otherSources = candidateList
        .slice(1)
        .map((c) => `${c.sourceName.raw}${c.isGenerated ? ";:G" : ";:M"}`)
        .join(",");
      newName = `${newName};(${otherSources})`;
    }

    resultMap.setMapping(primary.indexed, { raw: newName });
  }
}
```

### 5.5 Stage 3: Upper Element Fallback

For unnamed lower elements, derive names from named upper elements.

```typescript
/**
 * Upper fallback: name edges/vertices from their parent faces
 *
 * If Face1 is named "F1;:M;XTR;:T5", and its edges are unnamed,
 * name them as "F1;:M;XTR;:T5;:U1", "F1;:M;XTR;:T5;:U2", etc.
 */
function applyUpperFallback(
  ctx: NamingContext,
  faceCache: ShapeIndexCache,
  edgeCache: ShapeIndexCache,
  vertexCache: ShapeIndexCache
): void {
  const { resultShape, resultMap, opCode } = ctx;

  // Process Face → Edge
  for (let faceIdx = 1; faceIdx <= faceCache.count(); faceIdx++) {
    const faceIndexed: IndexedName = { type: "Face", index: faceIdx };
    const faceMappedNames = resultMap.getMappedNames(faceIndexed);
    if (faceMappedNames.length === 0) continue;

    const face = faceCache.find(faceIdx);
    const faceEdges = new ShapeIndexCache(face, TopAbs_EDGE);

    let subIndex = 0;
    for (let localEdgeIdx = 1; localEdgeIdx <= faceEdges.count(); localEdgeIdx++) {
      const edgeShape = faceEdges.find(localEdgeIdx);
      const globalEdgeIdx = edgeCache.findByShape(edgeShape);
      if (!globalEdgeIdx) continue;

      const edgeIndexed: IndexedName = { type: "Edge", index: globalEdgeIdx };
      if (resultMap.getMappedNames(edgeIndexed).length > 0) continue;

      subIndex++;
      const faceName = faceMappedNames[0];
      const edgeName: MappedName = {
        raw: `${faceName.raw}${PostfixMarkers.UPPER_POSTFIX}${subIndex > 1 ? subIndex : ""}`,
      };
      resultMap.setMapping(edgeIndexed, edgeName);
    }
  }

  // Process Edge → Vertex (similar pattern)
  for (let edgeIdx = 1; edgeIdx <= edgeCache.count(); edgeIdx++) {
    const edgeIndexed: IndexedName = { type: "Edge", index: edgeIdx };
    const edgeMappedNames = resultMap.getMappedNames(edgeIndexed);
    if (edgeMappedNames.length === 0) continue;

    const edge = edgeCache.find(edgeIdx);
    const edgeVertices = new ShapeIndexCache(edge, TopAbs_VERTEX);

    let subIndex = 0;
    for (let localVtxIdx = 1; localVtxIdx <= edgeVertices.count(); localVtxIdx++) {
      const vtxShape = edgeVertices.find(localVtxIdx);
      const globalVtxIdx = vertexCache.findByShape(vtxShape);
      if (!globalVtxIdx) continue;

      const vtxIndexed: IndexedName = { type: "Vertex", index: globalVtxIdx };
      if (resultMap.getMappedNames(vtxIndexed).length > 0) continue;

      subIndex++;
      const edgeName = edgeMappedNames[0];
      const vtxName: MappedName = {
        raw: `${edgeName.raw}${PostfixMarkers.UPPER_POSTFIX}${subIndex > 1 ? subIndex : ""}`,
      };
      resultMap.setMapping(vtxIndexed, vtxName);
    }
  }
}
```

### 5.6 Stage 4: Lower Element Fallback

For still-unnamed upper elements, derive names from their named children.

```typescript
/**
 * Lower fallback: name faces from their boundary edges
 *
 * If a face has edges named "E1;:M;XTR", "E2;:M;XTR", "E3;:M;XTR",
 * name the face as "(E1;:M;XTR,E2;:M;XTR,E3;:M;XTR);:L"
 */
function applyLowerFallback(
  ctx: NamingContext,
  faceCache: ShapeIndexCache,
  edgeCache: ShapeIndexCache,
  vertexCache: ShapeIndexCache
): void {
  const { resultShape, resultMap, opCode } = ctx;

  // Process Edge → Face (edges define their boundary faces)
  for (let faceIdx = 1; faceIdx <= faceCache.count(); faceIdx++) {
    const faceIndexed: IndexedName = { type: "Face", index: faceIdx };
    if (resultMap.getMappedNames(faceIndexed).length > 0) continue;

    const face = faceCache.find(faceIdx);

    // Get outer wire edges only (for stability)
    const outerWire = BRepTools.OuterWire(TopoDS.Face(face));
    const wireEdges = new ShapeIndexCache(outerWire, TopAbs_EDGE);

    const edgeNames: string[] = [];
    let allNamed = true;

    for (let i = 1; i <= wireEdges.count(); i++) {
      const edgeShape = wireEdges.find(i);
      const globalEdgeIdx = edgeCache.findByShape(edgeShape);
      if (!globalEdgeIdx) {
        allNamed = false;
        break;
      }

      const edgeIndexed: IndexedName = { type: "Edge", index: globalEdgeIdx };
      const edgeMapped = resultMap.getMappedNames(edgeIndexed);
      if (edgeMapped.length === 0) {
        allNamed = false;
        break;
      }

      edgeNames.push(edgeMapped[0].raw);
    }

    if (!allNamed || edgeNames.length === 0) continue;

    // Sort for determinism
    edgeNames.sort();

    const faceName: MappedName = {
      raw: `(${edgeNames.join(",")})${PostfixMarkers.LOWER_POSTFIX}`,
    };
    resultMap.setMapping(faceIndexed, faceName);
  }

  // Process Vertex → Edge (similar pattern)
  for (let edgeIdx = 1; edgeIdx <= edgeCache.count(); edgeIdx++) {
    const edgeIndexed: IndexedName = { type: "Edge", index: edgeIdx };
    if (resultMap.getMappedNames(edgeIndexed).length > 0) continue;

    const edge = edgeCache.find(edgeIdx);
    const edgeVertices = new ShapeIndexCache(edge, TopAbs_VERTEX);

    const vtxNames: string[] = [];
    let allNamed = true;

    for (let i = 1; i <= edgeVertices.count(); i++) {
      const vtxShape = edgeVertices.find(i);
      const globalVtxIdx = vertexCache.findByShape(vtxShape);
      if (!globalVtxIdx) {
        allNamed = false;
        break;
      }

      const vtxIndexed: IndexedName = { type: "Vertex", index: globalVtxIdx };
      const vtxMapped = resultMap.getMappedNames(vtxIndexed);
      if (vtxMapped.length === 0) {
        allNamed = false;
        break;
      }

      vtxNames.push(vtxMapped[0].raw);
    }

    if (!allNamed || vtxNames.length === 0) continue;

    vtxNames.sort();

    const edgeName: MappedName = {
      raw: `(${vtxNames.join(",")})${PostfixMarkers.LOWER_POSTFIX}`,
    };
    resultMap.setMapping(edgeIndexed, edgeName);
  }
}
```

### 5.7 Deterministic Ordering

**Critical requirement**: All naming must be deterministic and NOT depend on OCCT exploration order.

```typescript
/**
 * Sort shapes deterministically for consistent naming
 *
 * FreeCAD uses ElementNameComp which:
 * 1. Decomposes name into (non-digits, digits, tail)
 * 2. Compares non-digits lexically
 * 3. Compares digits by numeric value (not string)
 *
 * This prevents "Edge10" sorting before "Edge2".
 */
function elementNameCompare(a: string, b: string): number {
  // Base case: empty strings or identical strings
  if (a === b) return 0;
  if (a === "") return -1;
  if (b === "") return 1;

  // Parse into prefix, number, suffix
  const parseElement = (s: string) => {
    const match = s.match(/^([^0-9]*)(\d*)(.*)$/);
    if (!match) return { prefix: s, num: 0, suffix: "" };
    return {
      prefix: match[1],
      num: match[2] ? parseInt(match[2]) : 0,
      suffix: match[3],
    };
  };

  const pa = parseElement(a);
  const pb = parseElement(b);

  if (pa.prefix !== pb.prefix) {
    return pa.prefix.localeCompare(pb.prefix);
  }

  if (pa.num !== pb.num) {
    return pa.num - pb.num;
  }

  // Recurse on suffix only if there is progress (suffix is shorter)
  // This prevents infinite recursion on identical strings
  if (pa.suffix === a || pb.suffix === b) {
    // No progress made - compare as strings to terminate
    return a.localeCompare(b);
  }

  return elementNameCompare(pa.suffix, pb.suffix);
}
```

---

## 6. Integration with OpenCascade.js

### 6.1 HistoryMapper Implementations

Different OCCT operations need different mapper implementations.

```typescript
/**
 * MapperMaker - wraps BRepBuilderAPI_MakeShape history
 */
class MapperMaker implements HistoryMapper {
  constructor(private maker: BRepBuilderAPI_MakeShape) {}

  generated(inputShape: TopoDS_Shape): TopoDS_Shape[] {
    const result: TopoDS_Shape[] = [];
    const list = this.maker.Generated(inputShape);
    for (let i = 1; i <= list.Extent(); i++) {
      result.push(list.Value(i));
    }
    return result;
  }

  modified(inputShape: TopoDS_Shape): TopoDS_Shape[] {
    const result: TopoDS_Shape[] = [];
    const list = this.maker.Modified(inputShape);
    for (let i = 1; i <= list.Extent(); i++) {
      result.push(list.Value(i));
    }
    return result;
  }
}

/**
 * MapperSewing - BRepOffsetAPI_Sewing needs special handling
 */
class MapperSewing implements HistoryMapper {
  constructor(private sewing: BRepOffsetAPI_Sewing) {}

  generated(inputShape: TopoDS_Shape): TopoDS_Shape[] {
    // Sewing doesn't generate
    return [];
  }

  modified(inputShape: TopoDS_Shape): TopoDS_Shape[] {
    const result: TopoDS_Shape[] = [];
    const modifiedShape = this.sewing.Modified(inputShape);
    if (!modifiedShape.IsNull()) {
      result.push(modifiedShape);
    }
    return result;
  }
}

/**
 * MapperBoolean - BRepAlgoAPI operations
 */
class MapperBoolean implements HistoryMapper {
  constructor(private algo: BRepAlgoAPI_BooleanOperation) {}

  generated(inputShape: TopoDS_Shape): TopoDS_Shape[] {
    const result: TopoDS_Shape[] = [];
    const list = this.algo.Generated(inputShape);
    for (let i = 1; i <= list.Extent(); i++) {
      result.push(list.Value(i));
    }
    return result;
  }

  modified(inputShape: TopoDS_Shape): TopoDS_Shape[] {
    const result: TopoDS_Shape[] = [];
    const list = this.algo.Modified(inputShape);
    for (let i = 1; i <= list.Extent(); i++) {
      result.push(list.Value(i));
    }
    return result;
  }
}
```

### 6.2 Shape Index Cache

Efficient caching for shape lookup by index or identity.

```typescript
/**
 * ShapeIndexCache - cached index map for a shape type
 *
 * Wraps TopTools_IndexedMapOfShape for efficient lookups.
 */
class ShapeIndexCache {
  private map: TopTools_IndexedMapOfShape;

  constructor(
    private shape: TopoDS_Shape,
    public type: TopAbs_ShapeEnum
  ) {
    this.map = new TopTools_IndexedMapOfShape();
    TopExp.MapShapes(shape, type, this.map);
  }

  get typeName(): string {
    switch (this.type) {
      case TopAbs_FACE:
        return "Face";
      case TopAbs_EDGE:
        return "Edge";
      case TopAbs_VERTEX:
        return "Vertex";
      case TopAbs_WIRE:
        return "Wire";
      case TopAbs_SHELL:
        return "Shell";
      case TopAbs_SOLID:
        return "Solid";
      default:
        return "Shape";
    }
  }

  count(): number {
    return this.map.Extent();
  }

  find(index: number): TopoDS_Shape {
    return this.map.FindKey(index);
  }

  findByShape(subshape: TopoDS_Shape): number {
    return this.map.FindIndex(subshape);
  }

  dispose(): void {
    this.map.delete();
  }
}
```

### 6.3 Integration with SolidSession

```typescript
// In kernel/operations.ts

export function extrude(
  session: SolidSession,
  profile: TopoShape,
  vector: gp_Vec,
  opCode = OpCodes.EXTRUDE
): TopoShape {
  const maker = new BRepPrimAPI_MakePrism(profile.shape, vector);
  maker.Build();

  if (!maker.IsDone()) {
    throw new Error("Extrude operation failed");
  }

  const resultShape = maker.Shape();
  const mapper = new MapperMaker(maker);

  // Apply naming algorithm
  // NOTE: Tag is allocated using the feature's UUID via the registry
  const resultMap = new ElementMap();
  resultMap.tag = session.getTagRegistry().getOrAllocate(featureId); // featureId = UUID

  makESHAPE({
    resultShape,
    inputShapes: [profile],
    mapper,
    opCode,
    resultMap,
  });

  return {
    shape: resultShape,
    tag: resultMap.tag,
    elementMap: resultMap, // Stays internal, never exposed to app
  };
}
```

---

## 7. Reference Storage & Resolution

### 7.1 Storing References in Features

Features store `PersistentRef` strings in the pinned format `type:featureId:selector`, NOT raw MappedName strings. MappedName is an internal representation used only within the naming service.

```typescript
// In document model (Yjs) - uses PINNED PersistentRef format
interface ExtrudeFeature {
  type: "extrude";
  id: string; // UUID: "f7a8b3c2-1234-5678-9abc-def012345678"
  name: string; // Display: "Extrude1"

  /** Reference to sketch profile (feature UUID) */
  sketchRef: string; // UUID of sketch feature

  /** For "up to face" extent - stored as PersistentRef */
  extentFaceRef?: string; // "face:<uuid>:top" (NOT MappedName!)

  /** Optional fingerprint stored separately (NOT in PersistentRef string) */
  extentFaceFingerprint?: GeometryFingerprint;

  direction: "normal" | "reverse" | "both";
  distance: number;
}

interface FilletFeature {
  type: "fillet";
  id: string; // UUID
  name: string; // Display name

  /** Edges to fillet - stored as PersistentRef strings */
  edgeRefs: string[]; // ["edge:<uuid>:lateral:0", "edge:<uuid>:lateral:1"]

  /** Optional fingerprints for robustness (stored separately) */
  edgeFingerprints?: GeometryFingerprint[];

  radius: number;
}
```

**PersistentRef Format (Pinned)**

```
type:featureId:selector
     ^^^^^^^^^
     This is the internal UUID, NOT the display name!
```

> **Note on Fingerprints**: Fingerprints are stored in a **separate field** (e.g., `extentFaceFingerprint`), NOT embedded in the PersistentRef string. This keeps the pinned format unchanged while allowing optional fingerprint-based fallback resolution.

**Examples:**

```
face:f7a8b3c2-1234-5678-9abc-def012345678:top        ← top face
face:f7a8b3c2-1234-5678-9abc-def012345678:side:0     ← first side face
edge:f7a8b3c2-1234-5678-9abc-def012345678:lateral:2  ← third lateral edge
edge:a1b2c3d4-5678-90ab-cdef-1234567890ab:fillet:0   ← first fillet edge
```

**NEVER use display names in PersistentRef:**

```
face:Extrude1:top   ← WRONG! Breaks if user renames feature
```

The naming service translates between this format and internal MappedName representation.

### 7.2 Reference Resolution

At rebuild time, we resolve stored `PersistentRef` to current geometry. This happens entirely within the core, returning opaque handles (not OCCT types).

```typescript
/**
 * Result of resolving a PersistentRef
 *
 * NOTE: Returns OPAQUE HANDLES, not TopoDS_Shape.
 * The app layer never sees OCCT types.
 */
type ResolveResult =
  | { status: "found"; faceId: FaceId }
  | { status: "found"; edgeId: EdgeId }
  | { status: "found"; vertexId: VertexId }
  | { status: "not_found"; reason: string; hint?: string }
  | { status: "ambiguous"; candidates: string[]; reason: string };

/**
 * Resolve a stored PersistentRef to current geometry
 *
 * This is an INTERNAL function in the naming service.
 * The app calls SolidSession.resolveRef() which wraps this.
 */
function resolveReference(
  persistentRef: string,
  bodyId: BodyId,
  session: SolidSession // Uses session to access internal shape data
): ResolveResult {
  // Parse the PersistentRef format: type:featureId:selector[:fingerprint]
  const parsed = parsePersistentRef(persistentRef);
  if (!parsed) {
    return { status: "not_found", reason: "Invalid PersistentRef format" };
  }

  // Get the internal TopoShape (never exposed to app)
  const topoShape = session._getInternalShape(bodyId);
  if (!topoShape) {
    return { status: "not_found", reason: "Body not found" };
  }

  // Convert PersistentRef to MappedName for internal lookup
  const mappedName = persistentRefToMappedName(parsed, session._getTagRegistry());
  const indexed = topoShape.elementMap.getIndexedName(mappedName);

  if (!indexed) {
    // Try fallback strategies
    return attemptFallbackResolution(parsed, topoShape, session);
  }

  // Return opaque handle based on type
  switch (indexed.type) {
    case "Face":
      return { status: "found", faceId: makeFaceId(bodyId, indexed.index) };
    case "Edge":
      return { status: "found", edgeId: makeEdgeId(bodyId, indexed.index) };
    case "Vertex":
      return { status: "found", vertexId: makeVertexId(bodyId, indexed.index) };
    default:
      return { status: "not_found", reason: `Unsupported type: ${indexed.type}` };
  }
}

/**
 * Fallback resolution when exact match fails
 */
function attemptFallbackResolution(
  parsed: ParsedPersistentRef,
  topoShape: TopoShape, // Internal - never exposed
  session: SolidSession
): ResolveResult {
  const elementMap = topoShape.elementMap;

  // Strategy 1: Check if this is a child of a still-existing element
  // (handles splits where our element is now an ;:U sub-element)

  // Strategy 2: Fingerprint matching
  // Parse the original fingerprint from the ref and match by geometry

  // Strategy 3: Report as missing but provide hints
  return {
    status: "not_found",
    reason: "Element no longer exists after parametric edit",
    hint: "The referenced face may have been split or merged",
  };
}
```

### 7.3 UI Selection to PersistentRef

When user selects geometry, we create a storable `PersistentRef` (not raw MappedName).

**IMPORTANT**: The app layer uses opaque handles (`FaceId`, `EdgeId`), not OCCT types. The `SolidSession` provides a method to convert selections to `PersistentRef` strings.

```typescript
/**
 * SolidSession public API method - converts selection to storable reference
 *
 * App calls this with opaque handles, gets back a PersistentRef string.
 * The app NEVER handles TopoDS_Shape or MappedName directly.
 */
class SolidSession {
  /**
   * Convert a face selection to a storable PersistentRef string
   */
  faceToRef(faceId: FaceId): string {
    // Internal: get the indexed name
    const { bodyId, index } = parseFaceId(faceId);
    const topoShape = this._getInternalShape(bodyId);

    const indexed: IndexedName = { type: "Face", index };

    // Get mapped name from element map
    const mappedNames = topoShape.elementMap.getMappedNames(indexed);

    if (mappedNames.length === 0) {
      // CRITICAL: Do NOT fall back to indexed name!
      // Instead, construct a PersistentRef from the feature that created this face
      return this._constructPersistentRefFromOrigin(bodyId, indexed);
    }

    // Convert internal MappedName to PersistentRef format
    return this._mappedNameToPersistentRef(mappedNames[0], bodyId);
  }

  /**
   * Convert an edge selection to a storable PersistentRef string
   */
  edgeToRef(edgeId: EdgeId): string {
    // Similar implementation to faceToRef
    const { bodyId, index } = parseEdgeId(edgeId);
    const topoShape = this._getInternalShape(bodyId);

    const indexed: IndexedName = { type: "Edge", index };
    const mappedNames = topoShape.elementMap.getMappedNames(indexed);

    if (mappedNames.length === 0) {
      return this._constructPersistentRefFromOrigin(bodyId, indexed);
    }

    return this._mappedNameToPersistentRef(mappedNames[0], bodyId);
  }

  /**
   * INTERNAL: Construct a PersistentRef when no MappedName exists
   *
   * This uses the feature-local selector approach from the existing
   * naming strategy, NOT a raw indexed name.
   */
  private _constructPersistentRefFromOrigin(bodyId: BodyId, indexed: IndexedName): string {
    // Find which feature created this element
    const originFeatureId = this._findOriginFeature(bodyId, indexed);

    // Determine the local selector (e.g., "top", "side:0", "lateral:2")
    const localSelector = this._computeLocalSelector(bodyId, indexed, originFeatureId);

    // Optional: add fingerprint for robustness
    const fingerprint = this._computeFingerprint(bodyId, indexed);

    // Return in pinned format: type:featureId:selector[:fingerprint]
    const parts = [indexed.type.toLowerCase(), originFeatureId, localSelector];
    if (fingerprint) parts.push(fingerprint);

    return parts.join(":");
  }
}
```

**Why not fall back to indexed names?**

Indexed names (Face7, Edge12) are unstable across rebuilds. If we store them, references will break when the model is rebuilt. Instead, we always construct a proper `PersistentRef` using the feature-local selector approach defined in the architecture.

---

## 8. Serialization & Persistence

### 8.1 ElementMap Serialization

```typescript
interface SerializedElementMap {
  version: number;
  tag: number;
  mappings: Array<{
    indexed: string; // "Face7"
    mapped: string[]; // ["Face1;:M;XTR;:T3"]
  }>;
  childMaps?: Array<{
    id: number;
    map: SerializedElementMap;
  }>;
  stringTable?: string[]; // For hashed/compressed names
}

class ElementMap {
  serialize(): SerializedElementMap {
    const mappings: SerializedElementMap["mappings"] = [];

    for (const [indexedStr, mappedList] of this.indexedToMapped) {
      mappings.push({
        indexed: indexedStr,
        mapped: mappedList.map((m) => m.raw),
      });
    }

    return {
      version: 1,
      tag: this.tag,
      mappings,
    };
  }

  static deserialize(data: SerializedElementMap): ElementMap {
    const map = new ElementMap();
    map.tag = data.tag;

    for (const { indexed, mapped } of data.mappings) {
      const indexedName = parseIndexedName(indexed);
      if (!indexedName) continue;

      for (const mappedStr of mapped) {
        map.setMapping(indexedName, { raw: mappedStr });
      }
    }

    return map;
  }
}
```

### 8.2 Integration with Document Model

```typescript
// In worker rebuild, we persist element maps alongside meshes

interface BodyInfo {
  id: BodyId;
  name: string;
  color: string;
  featureId: string;

  // NOTE: Element maps are INTERNAL to the worker/core.
  // They are NOT exposed to the app via KernelContext.
  // Resolution happens via SolidSession.resolveRef() API.
}

// App-facing context (NO element maps exposed)
interface KernelContextValue {
  bodies: BodyInfo[];
  meshes: Map<BodyId, Mesh>;
  // Element maps stay INSIDE the worker, not exposed here
}
```

### 8.3 StringHasher (Optional Optimization)

For complex models, mapped names can get long. FreeCAD uses a `StringHasher` to compress them.

```typescript
/**
 * StringHasher - compresses long strings to integer IDs
 *
 * Based on FreeCAD's StringHasher class.
 */
class StringHasher {
  private stringToId: Map<string, number> = new Map();
  private idToString: Map<number, string> = new Map();
  private nextId = 1;

  /**
   * Get or create ID for a string
   */
  getID(text: string): StringId {
    let id = this.stringToId.get(text);
    if (id === undefined) {
      id = this.nextId++;
      this.stringToId.set(text, id);
      this.idToString.set(id, text);
    }
    return { id, text };
  }

  /**
   * Resolve ID back to string
   */
  getText(id: number): string | undefined {
    return this.idToString.get(id);
  }

  /**
   * Serialize for persistence
   */
  serialize(): SerializedStringTable {
    return {
      entries: Array.from(this.idToString.entries()),
    };
  }
}
```

---

## 9. Implementation Phases

> **📘 Note:** Refer to the phase plan documents in `/plan/*` for implementation sequencing.

### Phase 1: Core Data Structures

**Goal**: Implement fundamental types and basic element map.

1. Create `naming/mapped-name.ts`:
   - `IndexedName` type and parser
   - `MappedName` type with token parsing
   - `OpCodes` constants
   - `PostfixMarkers` constants

2. Create `naming/element-map.ts`:
   - `ElementMap` class with bidirectional mapping
   - Serialization/deserialization
   - Basic tests for mapping operations

3. Update `naming/types.ts`:
   - Keep existing `PersistentRef` for backwards compatibility
   - Add new types that map to MappedName internally

**Tests**:

- ElementMap add/lookup/serialize roundtrip
- MappedName parsing and construction
- IndexedName parsing

### Phase 2: History Mapper Layer

**Goal**: Create abstraction over OCCT maker history APIs.

1. Create `kernel/history-mapper.ts`:
   - `HistoryMapper` interface
   - `MapperMaker` for BRepBuilderAPI_MakeShape
   - `MapperBoolean` for BRepAlgoAPI
   - `MapperSewing` for BRepOffsetAPI_Sewing

2. Create `kernel/shape-cache.ts`:
   - `ShapeIndexCache` class
   - Efficient lookup by index and by shape identity

**Tests**:

- Mapper correctly reports Generated/Modified for basic operations
- Cache correctly indexes shapes

### Phase 3: Naming Algorithm

**Goal**: Implement the four-stage naming algorithm.

1. Create `naming/make-shape.ts`:
   - `makESHAPE()` main function
   - Stage 1: `copyUnchangedElements()`
   - Stage 2: `applyHistoryNaming()`
   - Stage 3: `applyUpperFallback()`
   - Stage 4: `applyLowerFallback()`

2. Add deterministic ordering:
   - `elementNameCompare()` function
   - Consistent sorting throughout

**Tests**:

- Basic extrude produces expected names
- Boolean operation names faces correctly
- Upper/lower fallbacks work
- Ordering is deterministic

### Phase 4: Integration with Operations

**Goal**: Integrate naming into all kernel operations.

1. Update `kernel/operations.ts`:
   - Add naming to `extrude()`
   - Add naming to `revolve()`
   - Add naming to `fuse()`/`cut()`/`common()`
   - Add naming to `fillet()`/`chamfer()`

2. Update `kernel/primitives.ts`:
   - Add initial element maps to primitives
   - Use semantic names (top, bottom, side, etc.)

3. Update `api/SolidSession.ts`:
   - **Keep element maps INTERNAL** (not exposed to app)
   - Add `resolveRef(persistentRef)` → returns opaque `FaceId`/`EdgeId`
   - Add `faceToRef(faceId)` → returns `PersistentRef` string
   - Add `edgeToRef(edgeId)` → returns `PersistentRef` string

**Tests**:

- End-to-end: create box, extrude, change box size, references stable
- Fillet edge reference survives parameter change

### Phase 5: Reference Storage & Resolution

**Goal**: Enable features to store and resolve references.

1. Update document schema:
   - Features store `PersistentRef` strings (format: `type:uuid:selector`)
   - Store fingerprints in **separate fields** (not in PersistentRef string)
   - Migrate existing `sketchRef` patterns

2. Implement reference resolution in `SolidSession`:
   - `resolveRef(persistentRef)` → `FaceId | EdgeId` (opaque handles)
   - `faceToRef(faceId)` → `PersistentRef` string
   - Fallback strategies (fingerprint matching when primary fails)
   - Error reporting with display names (never UUIDs)

3. Update worker rebuild:
   - Element maps stay INTERNAL to worker
   - Resolve references via `SolidSession` API during feature execution

**Tests**:

- "Sketch on face" survives upstream edits
- "Extrude to face" resolves correctly
- Missing reference reported clearly (using display names)

### Phase 6: Optimization & Polish

**Goal**: Performance optimization and edge cases.

1. Add StringHasher:
   - Compress long names
   - Serialize/deserialize string table

2. Profile and optimize:
   - Lazy element map construction
   - Cache reuse across operations

3. Handle edge cases:
   - Compound shapes
   - Import/export (STEP)
   - Undo/redo name stability

**Tests**:

- Performance benchmarks
- Large model stress tests
- STEP round-trip preserves names

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
describe("ElementMap", () => {
  test("bidirectional mapping works", () => {
    const map = new ElementMap();
    const indexed: IndexedName = { type: "Face", index: 1 };
    const mapped: MappedName = { raw: "Face1;:M;XTR;:T5" };

    map.setMapping(indexed, mapped);

    expect(map.getMappedNames(indexed)).toContainEqual(mapped);
    expect(map.getIndexedName(mapped)).toEqual(indexed);
  });

  test("multiple mapped names per indexed", () => {
    const map = new ElementMap();
    const indexed: IndexedName = { type: "Face", index: 1 };

    map.setMapping(indexed, { raw: "Name1" });
    map.setMapping(indexed, { raw: "Name2" });

    const names = map.getMappedNames(indexed);
    expect(names).toHaveLength(2);
  });

  test("serialization roundtrip", () => {
    const map = new ElementMap();
    map.setMapping({ type: "Face", index: 1 }, { raw: "F1;:M;XTR" });
    map.setMapping({ type: "Edge", index: 3 }, { raw: "E3;:G;XTR" });

    const serialized = map.serialize();
    const restored = ElementMap.deserialize(serialized);

    expect(restored.getIndexedName({ raw: "F1;:M;XTR" })).toEqual({ type: "Face", index: 1 });
  });
});

describe("MappedName parsing", () => {
  test("parses simple element name", () => {
    const tokens = parseMappedName("Face1");
    expect(tokens).toContainEqual({ kind: "element", value: "Face1" });
  });

  test("parses modified postfix", () => {
    const tokens = parseMappedName("Face1;:M;XTR;:T5");
    expect(tokens).toContainEqual({ kind: "modified", value: true });
    expect(tokens).toContainEqual({ kind: "op", value: "XTR" });
    expect(tokens).toContainEqual({ kind: "tag", value: 5 });
  });
});
```

### 10.2 Integration Tests

```typescript
describe("Naming Algorithm Integration", () => {
  test("extrude names faces correctly", async () => {
    const session = await SolidSession.create();

    // Create a simple profile
    const sketch = session.createSketch(XY_PLANE);
    sketch.addRectangle(0, 0, 10, 10);
    const profile = sketch.toProfile();

    // Extrude
    const extrudeFeatureId = "f7a8b3c2-1234-5678-9abc-def012345678";
    const body = session.extrude(profile, { distance: 5, featureId: extrudeFeatureId });

    // Get PersistentRef for top face (app never sees MappedName)
    const topFaceId = session.getTopFace(body);
    const topFaceRef = session.faceToRef(topFaceId); // Returns: "face:<uuid>:top"
    expect(topFaceRef).toMatch(/^face:[a-f0-9-]+:top$/);

    // Resolve back to face
    const resolved = session.resolveRef(topFaceRef);
    expect(resolved.status).toBe("found");
    expect(resolved.faceId).toBeDefined();
  });

  test("reference survives parameter change", async () => {
    const session = await SolidSession.create();

    // Build initial model
    const boxFeatureId = "box-uuid-1234";
    const box = session.createBox(10, 10, 10, { featureId: boxFeatureId });

    // Get PersistentRef for top face (NOT a MappedName!)
    const topFaceId = session.getTopFace(box);
    const topFaceRef = session.faceToRef(topFaceId); // "face:<boxUuid>:top"

    // Create dependent feature
    const sketch = session.createSketch({ faceRef: topFaceRef });
    sketch.addCircle(5, 5, 2);
    const cutBody = session.extrude(sketch.toProfile(), {
      distance: 3,
      operation: "cut",
    });

    // Store the reference (PersistentRef string)
    const storedRef = topFaceRef;

    // Change box parameters (triggers rebuild)
    session.updateBox(box, { height: 20 });

    // Reference should still resolve (returns opaque FaceId, not TopoDS_Shape)
    const resolved = session.resolveRef(storedRef);
    expect(resolved.status).toBe("found");
    expect(resolved.faceId).toBeDefined();

    // Verify geometry via API (app never sees TopoDS_Shape)
    const faceInfo = session.getFaceInfo(resolved.faceId);
    expect(faceInfo.centroid.z).toBeCloseTo(20); // New height
  });
});
```

### 10.3 Scenario Tests

```typescript
describe("Classic Toponaming Scenarios", () => {
  test("Scenario A: Pad + downstream sketch", async () => {
    // 1. Create Box
    // 2. Create Sketch on top face
    // 3. Pad sketch
    // 4. Edit Box height
    // ✅ Expect: sketch attachment still resolves
  });

  test("Scenario B: Fillet edge survives", async () => {
    // 1. Create Box
    // 2. Fillet one vertical edge
    // 3. Change box width
    // ✅ Expect: fillet still on corresponding edge
  });

  test("Scenario C: Boolean cut face reference", async () => {
    // 1. Base solid + cutter solid
    // 2. Cut; store reference to cut face
    // 3. Move cutter; recompute
    // ✅ Expect: reference resolves to corresponding cut face
  });

  test("Scenario D: Add hole to sketch", async () => {
    // 1. Sketch with outer rectangle
    // 2. Extrude
    // 3. Reference to side face
    // 4. Add circle (hole) to sketch
    // ✅ Expect: side face reference still works
  });
});
```

### 10.4 Fuzz Testing

```typescript
describe("Naming Stability Fuzz Tests", () => {
  test("random dimension tweaks don't break references", async () => {
    const session = await createRandomFeatureTree(5);
    const allRefs = session.getAllStoredReferences();

    for (let i = 0; i < 20; i++) {
      // Random parameter tweak
      const feature = pickRandom(session.features);
      tweakRandomDimension(feature);

      // Rebuild
      session.rebuild();

      // Check references
      let resolved = 0;
      let failed = 0;

      for (const ref of allRefs) {
        const result = session.resolveRef(ref); // Uses PersistentRef, returns opaque handles
        if (result.status === "found") resolved++;
        else failed++;
      }

      // At least 90% should resolve
      expect(resolved / allRefs.length).toBeGreaterThan(0.9);
    }
  });
});
```

---

## 11. Known Limitations & Fallbacks

### 11.1 Inherent Limitations

1. **OCCT history isn't perfect** — Some operations don't provide complete history. We use fallbacks (upper/lower) but can't guarantee 100% coverage.

2. **Topology genuinely changes** — If user edits fundamentally change topology (remove a face, merge bodies), some references _should_ fail. This is correct behavior.

3. **Import geometry has no history** — STEP imports have no creation history. We can only name by indexed order initially.

4. **Performance overhead** — Naming adds ~5-15% overhead to operations. Acceptable for correctness.

### 11.2 Fallback Strategies

When exact resolution fails:

1. **Geometric fingerprint matching**
   - Store centroid, area, normal, adjacency count
   - Match by smallest fingerprint distance
2. **Parent element resolution** (internal to naming service)
   - If a sub-element reference fails, try resolving parent and finding children
   - This uses MappedName internally, but app only sees PersistentRef

3. **Missing element markers**
   - Mark reference status in feature schema (e.g., `refStatus: "missing"`)
   - Display in UI as "Missing reference" (using display name, not UUID)
   - Allow user to re-select

4. **Graceful degradation**
   - Feature executes with warning, not hard failure
   - Let user fix manually

### 11.3 User-Facing Error Messages

```typescript
const NamingErrorMessages = {
  ELEMENT_DELETED: "The referenced face/edge no longer exists after your edit",
  ELEMENT_SPLIT: "The referenced face was split into multiple faces - please re-select",
  ELEMENT_MERGED: "Multiple faces were merged - reference is ambiguous",
  NO_HISTORY: "This geometry was imported without construction history",
  INTERNAL_ERROR: "Internal naming error - please report this bug",
};
```

---

## Appendix: FreeCAD Code Reference

### Key Files in FreeCAD Source

| File                                 | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `src/App/ComplexGeoData.h`           | Base class with element map, postfix constants    |
| `src/App/StringHasher.h`             | String compression for long names                 |
| `src/Mod/Part/App/TopoShape.h`       | Shape wrapper with Mapper, makESHAPE declarations |
| `src/Mod/Part/App/TopoShapeEx.cpp`   | **Main implementation** of naming algorithm       |
| `src/Mod/Part/App/TopoShapeOpCode.h` | Operation code constants                          |

### FreeCAD makESHAPE Key Steps

From `TopoShapeEx.cpp` line ~3017:

1. **Initialize** — Reset element map, create caches for faces/edges/vertices
2. **mapSubElement** — Copy unchanged elements from inputs
3. **Collect candidates** — Query mapper.generated() and mapper.modified() for each input element
4. **Build names** — Construct mapped names with op codes, tags, indices
5. **Upper fallback** — Name edges from named faces (;:U postfix)
6. **Lower fallback** — Name faces from named edges (;:L postfix)

### PostfixMarkers in FreeCAD

From `ComplexGeoData.cpp`:

```cpp
const std::string &ComplexGeoData::elementMapPrefix() {
    static std::string prefix(";");
    return prefix;
}

const std::string &ComplexGeoData::tagPostfix() {
    static std::string postfix(";:T");
    return postfix;
}
```

### Operation Codes

From `TopoShapeOpCode.h`:

```cpp
#define TOPOP_EXTRUDE   "XTR"
#define TOPOP_REVOLVE   "RVL"
#define TOPOP_FUSE      "FUS"
#define TOPOP_CUT       "CUT"
#define TOPOP_FILLET    "FLT"
// ... etc
```

---

## Summary

This document provides a complete specification for implementing FreeCAD-style topological naming in SolidType. Key points:

1. **History-based naming** using OCCT maker Generated/Modified history
2. **ElementMap** as the central bidirectional mapping structure
3. **Four-stage algorithm**: Copy unchanged → History → Upper fallback → Lower fallback
4. **PersistentRef** is the storage format (`type:featureId:selector`), **MappedName** is internal only
5. **Feature identity**: Internal UUID (`id`) for references, display name (`name`) for UI only
6. **API boundary respected**: App sees opaque handles, never OCCT types
7. **Tags are stable**: `FeatureTagRegistry` persists `FeatureId → Tag` mapping
8. **Never store indexed names**: Always convert to PersistentRef before storage
9. **Phased implementation** following the six-phase plan
10. **Comprehensive testing** including classic toponaming scenarios

The design is aligned with FreeCAD's proven approach while adapted for TypeScript and OpenCascade.js. It maintains compatibility with SolidType's existing architecture (pinned PersistentRef format, API boundaries) while gaining the full power of FreeCAD's naming algorithm.
