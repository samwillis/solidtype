# Phase 01: Document Model (Yjs)

## Prerequisites

- None (this is the foundation)

## Goals

- Define the Yjs document structure that will hold all model state
- Establish conventions for feature representation as XML
- Implement the rebuild gate mechanism
- Set up Yjs in the app with proper typing

---

## Document Model Architecture

### Why Yjs?

Yjs provides:
1. **CRDT-based collaboration** - Real-time multi-user editing without conflicts
2. **Built-in undo/redo** - UndoManager tracks all changes
3. **XML support** - Natural fit for hierarchical feature trees
4. **Offline-first** - Works without network, syncs when available
5. **AI-friendly** - XML can be serialized for LLM context and diffed for changes

### Document Structure

```typescript
// Y.Doc structure
interface SolidTypeDocument {
  meta: Y.Map<string>;           // Document metadata
  state: Y.Map<unknown>;         // Editing state (rebuild gate, etc.)
  features: Y.XmlFragment;       // Feature tree as XML
}
```

---

## Schema Definition

### meta (Y.Map)

Document-level metadata:

```typescript
interface DocumentMeta {
  name: string;           // Document name
  created: number;        // Timestamp
  modified: number;       // Last modified timestamp
  version: number;        // Schema version for migrations
}
```

### state (Y.Map)

Editing state that should be persisted:

```typescript
interface DocumentState {
  rebuildGate: string | null;    // Feature ID to rebuild up to (null = all)
  // Future: selected feature ID, view state, etc.
}
```

### features (Y.XmlFragment)

The feature tree as XML elements. Initial structure:

```xml
<origin id="origin" />
<plane id="xy" name="XY Plane" normal="0,0,1" origin="0,0,0" xDir="1,0,0" />
<plane id="xz" name="XZ Plane" normal="0,1,0" origin="0,0,0" xDir="1,0,0" />
<plane id="yz" name="YZ Plane" normal="1,0,0" origin="0,0,0" xDir="0,1,0" />
```

---

## Feature XML Schema

### Common Attributes

All features have:
- `id` - Unique identifier (e.g., "s1", "e1")
- `name` - Display name (optional, auto-generated if not provided)
- `suppressed` - Whether feature is suppressed (not computed)

### Feature Types

Features will be added incrementally. Initial set:

```xml
<!-- Datum features (built-in) -->
<origin id="origin" />
<plane id="xy" name="XY Plane" normal="0,0,1" origin="0,0,0" xDir="1,0,0" />

<!-- Sketch (Phase 03) -->
<sketch id="s1" plane="xy" name="Sketch1">
  <!-- Child elements for points, entities, constraints -->
</sketch>

<!-- Extrude (Phase 04) -->
<extrude id="e1" sketch="s1" distance="10" op="add" name="Extrude1" />

<!-- More features added in later phases -->
```

### Sketch Internal Structure

Sketches contain child data structures:

```xml
<sketch
  id="s1"
  plane="xy"
  points='[{"id":"pt1","x":0,"y":0},{"id":"pt2","x":10,"y":0}]'
  entities='[{"id":"ln1","type":"line","start":"pt1","end":"pt2"}]'
  constraints='[{"id":"cn1","type":"horizontal","points":["pt1","pt2"]}]'
/>
```

**Pinned implementation note**: In the current codebase, sketch lists are stored as **JSON strings in attributes** on the `<sketch>` element (`points`, `entities`, `constraints`). This keeps sketch edits as single-attribute updates (nice for undo/redo and syncing) and avoids managing nested XML text nodes.

---

## Rebuild Gate

### Concept

The rebuild gate (like SolidWorks' rollback bar) allows users to:
- Drag a marker in the feature tree to any position
- Model rebuilds only up to that point
- Features after the gate are not computed
- Useful for debugging and editing earlier features

### Implementation

```typescript
// In state (Y.Map)
state.set('rebuildGate', 'e1');  // Rebuild up to and including feature 'e1'
state.set('rebuildGate', null);  // Rebuild all features
```

### UI Behavior

1. Feature tree shows a draggable bar between features
2. Dragging the bar updates `state.rebuildGate`
3. Kernel receives rebuild command with gate position
4. Features after gate are grayed out in the UI
5. 3D view shows model state at gate position

---

## TypeScript Types

### Core Types

```typescript
// packages/app/src/types/document.ts

import * as Y from 'yjs';

// Feature base interface
export interface FeatureBase {
  id: string;
  name?: string;
  suppressed?: boolean;
}

// Specific feature types (expanded in later phases)
export interface OriginFeature extends FeatureBase {
  type: 'origin';
}

export interface PlaneFeature extends FeatureBase {
  type: 'plane';
  normal: [number, number, number];
  origin: [number, number, number];
  xDir: [number, number, number];
}

export interface SketchFeature extends FeatureBase {
  type: 'sketch';
  plane: string;  // Reference to plane ID or face ref
  // Points, entities, constraints stored as child data
}

export interface ExtrudeFeature extends FeatureBase {
  type: 'extrude';
  sketch: string;
  distance: number;
  op: 'add' | 'cut';
}

export type Feature = 
  | OriginFeature 
  | PlaneFeature 
  | SketchFeature 
  | ExtrudeFeature;
  // More types added in later phases
```

### Document Access

```typescript
// packages/app/src/hooks/useDocument.ts

import * as Y from 'yjs';

export interface SolidTypeDoc {
  ydoc: Y.Doc;
  meta: Y.Map<string>;
  state: Y.Map<unknown>;
  features: Y.XmlFragment;
}

export function createDocument(): SolidTypeDoc {
  const ydoc = new Y.Doc();
  const meta = ydoc.getMap('meta');
  const state = ydoc.getMap('state');
  const features = ydoc.getXmlFragment('features');
  
  // Initialize meta
  meta.set('name', 'Untitled');
  meta.set('created', Date.now());
  meta.set('modified', Date.now());
  meta.set('version', 1);
  
  // Initialize state
  state.set('rebuildGate', null);
  
  // Initialize default features
  initializeDefaultFeatures(features);
  
  return { ydoc, meta, state, features };
}

function initializeDefaultFeatures(features: Y.XmlFragment): void {
  // Add origin
  const origin = new Y.XmlElement('origin');
  origin.setAttribute('id', 'origin');
  features.push([origin]);
  
  // Add XY plane
  const xyPlane = new Y.XmlElement('plane');
  xyPlane.setAttribute('id', 'xy');
  xyPlane.setAttribute('name', 'XY Plane');
  xyPlane.setAttribute('normal', '0,0,1');
  xyPlane.setAttribute('origin', '0,0,0');
  xyPlane.setAttribute('xDir', '1,0,0');
  features.push([xyPlane]);
  
  // Add XZ plane
  const xzPlane = new Y.XmlElement('plane');
  xzPlane.setAttribute('id', 'xz');
  xzPlane.setAttribute('name', 'XZ Plane');
  xzPlane.setAttribute('normal', '0,1,0');
  xzPlane.setAttribute('origin', '0,0,0');
  xzPlane.setAttribute('xDir', '1,0,0');
  features.push([xzPlane]);
  
  // Add YZ plane
  const yzPlane = new Y.XmlElement('plane');
  yzPlane.setAttribute('id', 'yz');
  yzPlane.setAttribute('name', 'YZ Plane');
  yzPlane.setAttribute('normal', '1,0,0');
  yzPlane.setAttribute('origin', '0,0,0');
  yzPlane.setAttribute('xDir', '0,1,0');
  features.push([yzPlane]);
}
```

---

## React Integration

### Context Provider

```typescript
// packages/app/src/contexts/DocumentContext.tsx

import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { SolidTypeDoc, createDocument } from '../hooks/useDocument';

interface DocumentContextValue {
  doc: SolidTypeDoc;
  rebuildGate: string | null;
  setRebuildGate: (featureId: string | null) => void;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const doc = useMemo(() => createDocument(), []);
  const [rebuildGate, setRebuildGateState] = useState<string | null>(null);
  
  // Sync rebuild gate from Yjs
  useEffect(() => {
    const state = doc.state;
    const updateGate = () => {
      setRebuildGateState(state.get('rebuildGate') as string | null);
    };
    updateGate();
    state.observe(updateGate);
    return () => state.unobserve(updateGate);
  }, [doc]);
  
  const setRebuildGate = (featureId: string | null) => {
    doc.state.set('rebuildGate', featureId);
  };
  
  return (
    <DocumentContext.Provider value={{ doc, rebuildGate, setRebuildGate }}>
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocument() {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error('useDocument must be used within DocumentProvider');
  return ctx;
}
```

---

## Kernel Work

None for this phase - this is purely app-side document infrastructure.

---

## App UI Work

1. **Add Yjs dependency** to packages/app
2. **Create DocumentContext** provider
3. **Update FeatureTree** to read from Yjs instead of mock data
4. **Add rebuild gate UI** (draggable bar in feature tree)
5. **Wire up undo/redo** using Y.UndoManager

---

## User Workflow

At the end of this phase, users can:
1. Open the app and see the default feature tree (origin, planes)
2. Drag the rebuild gate bar (though it has no effect yet)
3. Use undo/redo (though no features to edit yet)

---

## Testing Plan

### Minimum Required Tests (Vitest)

All tests must pass before phase is complete:

```typescript
// packages/app/src/__tests__/document.test.ts

describe('Document Creation', () => {
  test('createDocument initializes with default features', () => {
    const doc = createDocument();
    const features = Array.from(doc.features.toArray());
    expect(features).toHaveLength(4); // origin + 3 planes
  });

  test('default features have correct structure', () => {
    const doc = createDocument();
    const features = doc.features.toArray();
    
    // Origin
    expect(features[0].nodeName).toBe('origin');
    expect(features[0].getAttribute('id')).toBe('origin');
    
    // XY Plane
    expect(features[1].nodeName).toBe('plane');
    expect(features[1].getAttribute('id')).toBe('xy');
    expect(features[1].getAttribute('normal')).toBe('0,0,1');
  });

  test('meta is initialized correctly', () => {
    const doc = createDocument();
    expect(doc.meta.get('name')).toBe('Untitled');
    expect(doc.meta.get('version')).toBe(1);
    expect(typeof doc.meta.get('created')).toBe('number');
  });
});

describe('Rebuild Gate', () => {
  test('setRebuildGate updates state', () => {
    const doc = createDocument();
    doc.state.set('rebuildGate', 'e1');
    expect(doc.state.get('rebuildGate')).toBe('e1');
  });

  test('rebuildGate defaults to null', () => {
    const doc = createDocument();
    expect(doc.state.get('rebuildGate')).toBeNull();
  });
});

describe('Undo/Redo', () => {
  test('UndoManager tracks feature additions', () => {
    const doc = createDocument();
    const undoManager = new Y.UndoManager(doc.features);
    
    const sketch = new Y.XmlElement('sketch');
    sketch.setAttribute('id', 's1');
    doc.features.push([sketch]);
    
    expect(doc.features.length).toBe(5);
    
    undoManager.undo();
    expect(doc.features.length).toBe(4);
    
    undoManager.redo();
    expect(doc.features.length).toBe(5);
  });

  test('UndoManager tracks attribute changes', () => {
    const doc = createDocument();
    const undoManager = new Y.UndoManager(doc.features);
    
    const sketch = new Y.XmlElement('sketch');
    sketch.setAttribute('id', 's1');
    sketch.setAttribute('plane', 'xy');
    doc.features.push([sketch]);
    
    // Change attribute
    sketch.setAttribute('plane', 'xz');
    expect(sketch.getAttribute('plane')).toBe('xz');
    
    undoManager.undo();
    expect(sketch.getAttribute('plane')).toBe('xy');
  });
});

describe('ID Generation', () => {
  test('generateId increments counter', () => {
    const counters = { s: 0, e: 0 };
    expect(generateId('sketch', counters)).toBe('s1');
    expect(generateId('sketch', counters)).toBe('s2');
    expect(generateId('extrude', counters)).toBe('e1');
  });
});

describe('Vector Parsing', () => {
  test('parseVector handles comma-separated strings', () => {
    expect(parseVector('0,0,1')).toEqual([0, 0, 1]);
    expect(parseVector('1.5,-2.5,3')).toEqual([1.5, -2.5, 3]);
  });

  test('serializeVector produces comma-separated string', () => {
    expect(serializeVector([0, 0, 1])).toBe('0,0,1');
  });
});
```

### Integration Tests

- [ ] Feature tree renders from Yjs data
- [ ] Rebuild gate bar is visible and draggable
- [ ] Undo/redo shortcuts work (Cmd+Z, Cmd+Shift+Z)
- [ ] Document persists default features on creation

---

## Schema Decisions (Pinned)

These decisions are **locked** to avoid migrations. Document them here before implementation:

### 1. Vector/Array Serialization

**Decision**: Comma-separated strings for simple vectors, JSON for complex structures.

```xml
<!-- Simple vectors: comma-separated (3-6 numbers) -->
<plane normal="0,0,1" origin="0,0,0" xDir="1,0,0" />

<!-- Complex arrays: JSON in attributes (current implementation) -->
<sketch
  id="s1"
  plane="xy"
  points='[{"id":"pt1","x":0,"y":0},{"id":"pt2","x":10,"y":0}]'
  entities='[{"id":"ln1","type":"line","start":"pt1","end":"pt2"}]'
  constraints='[{"id":"cn1","type":"horizontal","points":["pt1","pt2"]}]'
/>
```

**Rationale**:
- Comma-separated is more readable for simple vectors
- JSON allows complex nested structures without XML verbosity
- Both are easy to parse and serialize

### 2. Feature ID Generation

**Decision**: Type prefix + global counter per document.

```typescript
interface IdCounters {
  s: number;  // sketches: s1, s2, s3
  e: number;  // extrudes: e1, e2, e3
  r: number;  // revolves: r1, r2, r3
  f: number;  // fillets: f1, f2, f3
  // etc.
}

function generateId(type: string, counters: IdCounters): string {
  const prefix = type[0].toLowerCase();
  const count = ++counters[prefix];
  return `${prefix}${count}`;
}
```

**Rationale**:
- Short, readable IDs
- Easy to reference in UI and AI context
- Counter stored in `meta` Y.Map for persistence

**Implementation note**: The current app stores counters in a dedicated top-level `counters` Y.Map (`ydoc.getMap('counters')`) rather than inside `meta`. This keeps `meta` strictly for metadata and avoids mixing numeric counters with user-facing strings.

### 3. Sketch Child Storage

**Decision (current implementation)**: JSON in `<sketch>` attributes (`points`, `entities`, `constraints`).

```xml
<sketch
  id="s1"
  plane="xy"
  points='[{"id":"pt1","x":0,"y":0,"fixed":true}]'
  entities='[{"id":"ln1","type":"line","start":"pt1","end":"pt2"}]'
  constraints='[{"id":"cn1","type":"horizontal","points":["pt1","pt2"]}]'
/>
```

**Rationale**:
- Avoids nested XML list management
- Single-attribute updates are compact and undo-friendly
- Easy to deserialize with `JSON.parse()`
- AI can still understand and modify directly

### 4. Boolean/Number Attribute Encoding

**Decision**: String representation, parsed on read.

```xml
<extrude distance="10.5" />  <!-- number as string -->
<point fixed="true" />        <!-- boolean as string -->
```

```typescript
// Parsing
const distance = parseFloat(element.getAttribute('distance'));
const fixed = element.getAttribute('fixed') === 'true';
```

---

## Feature Suppression and Error State

### Suppression

Features can be suppressed (skipped during rebuild):

```xml
<extrude id="e1" suppressed="true" ... />
```

Suppressed features:
- Are not computed during rebuild
- Appear grayed out in feature tree
- Do not contribute geometry to the model
- Can be unsuppressed to restore

### Error State

Build errors are **not stored in Yjs** (they're transient). Instead:

```typescript
// Worker sends error state with rebuild result
interface RebuildResult {
  bodies: BodyInfo[];
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
}

interface BuildError {
  featureId: string;
  code: 'NO_CLOSED_PROFILE' | 'SELF_INTERSECTING' | 'INVALID_REFERENCE' | 'BUILD_ERROR';
  message: string;
}

type FeatureStatus = 'computed' | 'error' | 'suppressed' | 'gated';
```

Error display contract:
- Feature tree shows error icon for features with `status === 'error'`
- Properties panel shows error message when error feature is selected
- AI context includes errors in current build state

---

## Open Questions

1. ~~**Attribute serialization**~~ → Decided above
2. ~~**Feature IDs**~~ → Decided above
3. **Yjs provider** - Which provider to use for sync?
   - Decision: Start without a provider (local only), add y-indexeddb for persistence later

---

## Dependencies

Add to packages/app/package.json:

```json
{
  "dependencies": {
    "yjs": "^13.6.0"
  }
}
```
