# SolidType Development Plan - Overview

> **Essential Reading**: Before working on SolidType, read [`OVERVIEW.md`](/OVERVIEW.md) for the foundational vision, technical approach, and research background that informs this plan.

---

## What is SolidType?

SolidType is a **modern, parametric CAD application** built on a pure TypeScript kernel (`@solidtype/core`). Unlike traditional CAD tools, SolidType is designed from the ground up for:

1. **Web-native operation** - Runs entirely in the browser, no plugins or downloads
2. **Real-time collaboration** - Built on Yjs for multi-user editing
3. **AI-assisted modeling** - Natural language interface for creating and modifying models

This plan describes the incremental development path from the current kernel and UI shell to a fully-featured CAD application.

---

## Two North Stars

Everything we build should move toward these goals:

### 1. Robust Parametric Model

A solid CAD kernel + app that reliably:
- Creates geometry from sketches and features
- Edits parameters without breaking the model
- Rebuilds the entire feature tree deterministically
- Handles edge cases gracefully with clear error messages

### 2. AI-Assisted Editing

Natural language interaction for modifying models:
- AI understands the document structure (Yjs XML DOM)
- AI can read, propose changes, and apply them via diff
- AI has tools to resolve naming/selection challenges
- Changes are undoable and validated before committing

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React App (@solidtype/app)               │
├──────────────┬──────────────┬───────────────┬───────────────────┤
│ Feature Tree │   3D Viewer  │  Sketch Canvas │    AI Panel      │
│   (Yjs XML)  │  (Three.js)  │   (2D overlay) │   (Chat UI)      │
└──────┬───────┴──────┬───────┴───────┬────────┴────────┬─────────┘
       │              │               │                 │
       ▼              ▼               ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Yjs Document (Y.Doc)                        │
│  ┌─────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │  meta   │  │    features      │  │        state           │  │
│  │ (Y.Map) │  │ (Y.XmlFragment)  │  │       (Y.Map)          │  │
│  └─────────┘  └──────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ serialize/parse
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Web Worker                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              @solidtype/core (CAD Kernel)               │    │
│  │  ┌─────┐ ┌──────┐ ┌───────┐ ┌───────┐ ┌──────┐ ┌──────┐ │    │
│  │  │ num │ │ geom │ │ topo  │ │ model │ │sketch│ │naming│ │    │
│  │  └─────┘ └──────┘ └───────┘ └───────┘ └──────┘ └──────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ tessellate
                              ▼
                    ┌──────────────────┐
                    │   Mesh Data      │
                    │ (positions,      │
                    │  normals,        │
                    │  indices)        │
                    └──────────────────┘
```

---

## Key Architectural Decisions

### Yjs Document Model

The entire document state lives in a Yjs `Y.Doc`:

- **`features`** (Y.XmlFragment) - Ordered list of features as XML elements
- **`meta`** (Y.Map) - Document metadata (name, version, etc.)
- **`state`** (Y.Map) - Editing state including rebuild gate position

This enables:
- Real-time collaboration via Yjs providers
- Undo/redo via Yjs UndoManager
- AI integration via XML serialization/diffing

### Kernel in Web Worker

The CAD kernel runs in a Web Worker to:
- Keep the UI responsive during heavy operations
- Allow incremental rebuild without blocking
- Transfer mesh data via transferable ArrayBuffers

### Point-and-Click Interface

This is NOT a code-first CAD tool. Users interact through:
- Feature tree for organization and navigation
- 3D viewer for visualization and selection
- 2D sketch canvas for drawing
- Properties panel for editing parameters
- AI chat panel for natural language commands

---

## Development Philosophy

### Architecture Can Evolve

The architecture described in this plan and in `ARCHITECTURE.md` is **not set in stone**. As we implement features and learn from real usage:

- **Refactoring is expected** - We'll discover better abstractions as we go
- **Interfaces can change** - Internal APIs should evolve to serve the implementation
- **Structure follows need** - Don't over-engineer; let the code tell us what it needs

However:

### Algorithm Correctness is Essential

While architecture can flex, **correctness in algorithms is non-negotiable**:

- **Geometric algorithms must be robust** - Tolerances, edge cases, degenerate geometry
- **Topological operations must be valid** - BREP consistency, manifold preservation
- **Constraint solving must converge** - Reliable numerical methods, clear failure modes
- **Naming must be deterministic** - Same inputs → same persistent references

When in doubt, prefer a **correct but slow** implementation over a **fast but fragile** one. Performance can be optimized later; correctness bugs are expensive to find and fix.

### Keep Documentation In Sync

If you make **architectural or plan changes**, you MUST update the documentation:

| Change Type | Update |
|-------------|--------|
| New modules, changed APIs, package structure | [`ARCHITECTURE.md`](/ARCHITECTURE.md) |
| Vision, goals, technical approach | [`OVERVIEW.md`](/OVERVIEW.md) |
| Implementation plan, phase structure | `/plan/*` documents |

The docs are the **source of truth**. If code conflicts with docs, either fix the code or update the docs—never leave them out of sync.

### Incremental Vertical Slices

Each phase delivers a **small, complete workflow** rather than building entire subsystems:

```
1. Line sketch → 2. Extrude → 3. Cut → 4. Revolve → 5. Constraints → 6. Arcs → ...
```

This means:
- Users get working features faster
- Architecture is validated incrementally
- Each phase is independently testable

### Constraints After Features

We prove the sketch → feature flow works before adding constraint solving:
- Phase 03-06: Basic sketching and modeling with direct manipulation
- Phase 07-08: Add constraints after extrude/revolve work

### Selection Before References

Selection in 3D view is foundational to geometry references:
- Phase 11: Basic face/edge selection
- Phase 14-16: Use selection for extrude extents, sketch-on-face, etc.

---

## Phase Overview

| Phases | Focus | Key Deliverables |
|--------|-------|------------------|
| 01-02 | Foundation | Yjs document model, kernel-viewer wiring |
| 03-06 | Basic Modeling | Line sketches, extrude add/cut, revolve |
| 07-08 | Constraints | Basic constraints, dimensions UI |
| 09-10 | Curved Geometry | Arcs in sketches, curved profiles |
| 11-13 | 3D Interaction | Selection, rebuild gate, properties |
| 14-16 | Geometry References | Extrude extents, sketch-on-face, external refs |
| 17-18 | Boolean & Export | Explicit booleans, STEP export |
| 19 | Advanced Constraints | Parallel, perpendicular, tangent |
| 20-22 | Advanced Modeling | Fillet, chamfer, sweep, loft, patterns |
| 23-26 | AI Integration | Context assembly, tools, diff/apply, chat UI |

---

## Current State

### Kernel (@solidtype/core)

Already implemented:
- `num/` - Vectors, matrices, tolerances, predicates, root finding
- `geom/` - 2D/3D curves, surfaces, intersection
- `topo/` - TopoModel BREP representation, validation, healing
- `model/` - Extrude, revolve, booleans, primitives, sketch profiles
- `sketch/` - SketchModel, constraints, solver, graph analysis
- `naming/` - Persistent naming evolution
- `mesh/` - Tessellation
- `api/` - OO wrappers (SolidSession, Body, Face, Edge, Sketch)

### App (@solidtype/app)

Already implemented:
- React + Three.js viewer (showing a static cube)
- Feature tree (with mock data)
- Properties panel (placeholder)
- AI panel (placeholder)
- Toolbar, Status bar
- ResizablePanel system

---

## Success Criteria

A phase is complete when:

1. **Functionality works** - User can accomplish the described workflow
2. **Tests pass** - Unit tests for kernel, integration tests for UI (see [testing-strategy.md](appendix/testing-strategy.md) for minimum requirements)
3. **No regressions** - Previous features still work
4. **Error handling** - Clear messages for failure cases
5. **Naming hooks** - Persistent naming checklist completed (if applicable)
6. **Documentation** - Phase document updated with implementation notes

---

## Pinned Decisions

These decisions are **locked** to prevent schema migrations:

| Decision | Value | See |
|----------|-------|-----|
| Vector serialization | Comma-separated strings (`"0,0,1"`) | [01-document-model.md](01-document-model.md) |
| Complex data | JSON in attributes (for sketch lists: `points`/`entities`/`constraints`) | [01-document-model.md](01-document-model.md) |
| Feature IDs | Type prefix + counter (`s1`, `e1`) | [01-document-model.md](01-document-model.md) |
| Persistent refs | `type:featureId:selector` | [appendix/naming-strategy.md](appendix/naming-strategy.md) |
| Build errors | Transient (not stored in Yjs) | [01-document-model.md](01-document-model.md) |
| Rebuild strategy | Full rebuild initially, incremental later | [02-kernel-viewer-wiring.md](02-kernel-viewer-wiring.md) |
| OffscreenCanvas | After Phase 11 or when face count > 500 | [02-kernel-viewer-wiring.md](02-kernel-viewer-wiring.md) |

**AI integration (Phases 23-26) requires all of these to be stable before starting.**

---

## Related Documents

### Foundation
- [OVERVIEW.md](/OVERVIEW.md) - **Read first** - Foundational vision and technical approach
- [ARCHITECTURE.md](/ARCHITECTURE.md) - Package structure and layer responsibilities

### Plan Documents
- [01-document-model.md](01-document-model.md) - Yjs schema details
- [appendix/kernel-improvements.md](appendix/kernel-improvements.md) - Kernel work by phase
- [appendix/solver-roadmap.md](appendix/solver-roadmap.md) - Constraint solver evolution
- [appendix/naming-strategy.md](appendix/naming-strategy.md) - Persistent naming design
- [appendix/testing-strategy.md](appendix/testing-strategy.md) - Testing approach
