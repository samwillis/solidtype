# Implementation Sequence: Sketch Tools + Topological Naming

This document defines the order of implementation for sketch tool improvements and topological naming. It identifies dependencies and indicates when to switch between work streams.

---

## Executive Summary

**Good news:** Most sketch improvements can proceed **immediately** without topological naming.

| Work Stream | Dependency on Naming | Can Start Now? |
|-------------|---------------------|----------------|
| Sketch tool UX (line chain, auto-constraints) | ❌ None | ✅ Yes |
| Sketch multi-select, previews | ❌ None | ✅ Yes |
| Rectangle/Arc/Circle improvements | ❌ None | ✅ Yes |
| Face selection feedback (visual only) | ❌ None | ✅ Yes |
| Sketch on Face (basic) | ⚠️ Needs face indices | ✅ Yes (fragile) |
| Sketch on Face (robust) | ✅ Needs naming Phase 1-5 | ❌ After naming |
| Fillet/Chamfer UI | ✅ Needs naming + edge selection | ❌ After naming |

---

## Part 1: Immediate Work (No Naming Required)

These sketch improvements are **entirely 2D** and operate within the sketch coordinate system. They have **zero dependency** on topological naming.

### Batch 1A: Line Tool Chain Mode

From [CAD-UX-SPEC.md § 20 Task A](/CAD-UX-SPEC.md):

| Task | Description |
|------|-------------|
| A1 | Add `chainLastEndpoint` state to track chain continuation |
| A2 | Modify line click handler to use chain endpoint as start |
| A3 | Add right-click to end chain (stay in tool) |
| A4 | Clear chain on tool change or Escape |
| A5 | Update preview line for chain mode |

**Verification:**
- [ ] Click-click-click creates connected polyline
- [ ] Right-click ends chain without exiting tool
- [ ] Escape clears chain and selection

### Batch 1B: Auto-Constraints on Line Creation

From [CAD-UX-SPEC.md § 20 Task B](/CAD-UX-SPEC.md):

| Task | Description |
|------|-------------|
| B1 | Add `isNearHorizontal()` and `isNearVertical()` functions |
| B2 | Add `autoConstraints` toggle to ViewerContext |
| B3 | Apply H/V constraints in line creation when near-axis |
| B4 | Add inference visual overlay (H/V indicator) |

**Verification:**
- [ ] Drawing near-horizontal line shows "H" indicator
- [ ] Line created with horizontal constraint
- [ ] Ctrl key suppresses auto-constraints

### Batch 1C: Multi-Select in Sketch

From [CAD-UX-SPEC.md § 20 Task C](/CAD-UX-SPEC.md):

| Task | Description |
|------|-------------|
| C0 | Fix `togglePointSelection`/`toggleLineSelection` to not clear other types |
| C1 | Modify click handler for Ctrl+click (toggle) and Shift+click (add) |
| C2 | Update SketchContext toggle functions |

**Verification:**
- [ ] Ctrl+click toggles selection
- [ ] Shift+click adds to selection
- [ ] Plain click clears and selects one item

### Batch 1D: Rectangle with Auto-Constraints

From [CAD-UX-SPEC.md § 20 Task D](/CAD-UX-SPEC.md):

| Task | Description |
|------|-------------|
| D1 | Modify `addRectangle` to apply H/V constraints to edges |

**Verification:**
- [ ] Created rectangle has horizontal/vertical constraints
- [ ] Dragging corner maintains rectangle shape

### Batch 1E: Arc Tool Improvements

From [CAD-UX-SPEC.md § 20 Task E](/CAD-UX-SPEC.md):

| Task | Description |
|------|-------------|
| E1 | Add arc mode state (3-point, centerpoint, tangent) |
| E2 | Implement centerpoint arc sequence (center → start → end) |
| E3 | Add tangent arc detection in line tool |

**Verification:**
- [ ] Centerpoint arc works with 3 clicks
- [ ] Arc direction follows cursor position

---

## Part 2: Face Selection Feedback (No Naming Required)

These improvements make face selection **visible** to users. They use current tessellation indices (fragile, but functional for UI feedback).

### Batch 2A: Face Selection UI Feedback

From [CAD-UX-SPEC.md § 26](/CAD-UX-SPEC.md):

| Task | Description |
|------|-------------|
| 2A1 | Add selection info to Properties Panel ("1 Face selected") |
| 2A2 | Improve face highlight visibility (color/opacity) |
| 2A3 | Add face selection count to status bar or panel |

**Verification:**
- [ ] Clicking face shows "1 Face selected" in Properties Panel
- [ ] Selected face has visible highlight
- [ ] User knows their click registered

### Batch 2B: Basic "Sketch on Face" (Fragile)

This allows sketching on model faces but references are **fragile** (will break on rebuild). Acceptable for initial testing.

| Task | Description |
|------|-------------|
| 2B1 | Wire face selection to sketch plane creation |
| 2B2 | Store face reference as `face:<featureId>:<faceIndex>` (temporary) |
| 2B3 | Orient view to selected face |

**Known Limitation:** References use tessellation indices. They will break when upstream features change. This is a **placeholder** until naming is implemented.

---

## Part 3: Topological Naming Foundation

**When to start this:** After completing Batches 1A-1E and 2A-2B, OR when you need robust face/edge references.

### Naming Phase 1: Core Data Structures

From [TOPOLOGICAL-NAMING.md § 9](/TOPOLOGICAL-NAMING.md):

| Task | Description |
|------|-------------|
| N1.1 | Create `naming/types.ts` with `IndexedName`, `MappedName`, `ElementMap` |
| N1.2 | Implement `FeatureTagRegistry` with serialize/deserialize |
| N1.3 | Add `ElementMap` bidirectional mapping |
| N1.4 | Add `IndexedName` parsing utilities |

**Tests:**
- ElementMap set/get works correctly
- Registry persists tags across serialize/deserialize

### Naming Phase 2: History Mapper Layer

| Task | Description |
|------|-------------|
| N2.1 | Create `naming/mapper.ts` with `HistoryMapper` interface |
| N2.2 | Implement `MapperMaker` for `BRepBuilderAPI_MakeShape` |
| N2.3 | Implement `MapperBoolOp` for `BRepAlgoAPI_BooleanOperation` |
| N2.4 | Add `ShapeIndexCache` for efficient lookups |

**Tests:**
- Extrude mapper returns generated faces
- Boolean mapper returns modified/generated shapes

### Naming Phase 3: Naming Algorithm

| Task | Description |
|------|-------------|
| N3.1 | Implement `makESHAPE()` main function |
| N3.2 | Stage 1: Copy unchanged elements |
| N3.3 | Stage 2: Apply history-based naming |
| N3.4 | Stage 3: Upper element fallback |
| N3.5 | Stage 4: Lower element fallback |
| N3.6 | Add deterministic ordering (`elementNameCompare`) |

**Tests:**
- Basic extrude produces expected mapped names
- Boolean operation names faces correctly
- Ordering is deterministic

### Naming Phase 4: Integration with Operations

| Task | Description |
|------|-------------|
| N4.1 | Add naming to `extrude()` |
| N4.2 | Add naming to `revolve()` |
| N4.3 | Add naming to boolean operations |
| N4.4 | Add naming to `fillet()`/`chamfer()` |
| N4.5 | Update `SolidSession` with `resolveRef()` and `faceToRef()` APIs |

**Tests:**
- End-to-end: create box, extrude, change box size, references stable
- Fillet edge reference survives parameter change

### Naming Phase 5: Reference Storage & Resolution

| Task | Description |
|------|-------------|
| N5.1 | Update document schema for PersistentRef storage |
| N5.2 | Implement `resolveRef()` → opaque handles |
| N5.3 | Implement `faceToRef()` / `edgeToRef()` |
| N5.4 | Add fingerprint storage (separate field) |
| N5.5 | Implement fallback resolution strategies |

**Tests:**
- "Sketch on Face" survives upstream edits
- "Extrude to Face" resolves correctly
- Missing reference reported with display name

---

## Part 4: Features Requiring Naming

**When to start this:** Only after completing Naming Phases 1-5.

### Batch 4A: Robust "Sketch on Face"

| Task | Description |
|------|-------------|
| 4A1 | Replace fragile face index with PersistentRef |
| 4A2 | Resolve face reference at rebuild time |
| 4A3 | Handle missing face with user-friendly error |

**Verification:**
- [ ] Sketch on face survives when extrude height changes
- [ ] Sketch on face survives when upstream sketch changes
- [ ] Missing face shows helpful error message

### Batch 4B: Edge Selection System

From [CAD-UX-SPEC.md § 26](/CAD-UX-SPEC.md):

| Task | Description |
|------|-------------|
| 4B1 | Add edge tessellation to kernel (`tessellateEdges()`) |
| 4B2 | Add edge mesh to worker message |
| 4B3 | Render edge lines in viewer |
| 4B4 | Add edge picking with screen-space threshold |
| 4B5 | Store edge selection with PersistentRef |
| 4B6 | Add edge highlight rendering |

**Verification:**
- [ ] Visible edges rendered on all bodies
- [ ] Hover near edge shows highlight
- [ ] Click selects edge
- [ ] Selected edge shows in Properties Panel

### Batch 4C: Fillet/Chamfer UI

| Task | Description |
|------|-------------|
| 4C1 | Add Fillet/Chamfer buttons to toolbar |
| 4C2 | Create PropertyManager dialog for Fillet |
| 4C3 | Edge selection box with multi-select |
| 4C4 | Store edge references using PersistentRef |
| 4C5 | Live preview of fillet result |
| 4C6 | Same for Chamfer |

**Verification:**
- [ ] Select edges → enter radius → preview shows fillet
- [ ] Fillet survives when upstream feature changes
- [ ] Edge references resolve after rebuild

---

## Implementation Order Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    IMMEDIATE (No Naming)                         │
├─────────────────────────────────────────────────────────────────┤
│  Batch 1A: Line Chain Mode                                       │
│  Batch 1B: Auto-Constraints                                      │
│  Batch 1C: Multi-Select                                          │
│  Batch 1D: Rectangle Constraints                                 │
│  Batch 1E: Arc Improvements                                      │
│  Batch 2A: Face Selection Feedback                               │
│  Batch 2B: Basic Sketch on Face (fragile)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NAMING FOUNDATION                             │
├─────────────────────────────────────────────────────────────────┤
│  Naming Phase 1: Core Data Structures                            │
│  Naming Phase 2: History Mapper Layer                            │
│  Naming Phase 3: Naming Algorithm                                │
│  Naming Phase 4: Integration with Operations                     │
│  Naming Phase 5: Reference Storage & Resolution                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FEATURES REQUIRING NAMING                     │
├─────────────────────────────────────────────────────────────────┤
│  Batch 4A: Robust Sketch on Face                                 │
│  Batch 4B: Edge Selection System                                 │
│  Batch 4C: Fillet/Chamfer UI                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Decision Points

### When to switch from sketch improvements to naming?

**Switch to naming when:**
1. You've completed Batches 1A-1E (core sketch feel)
2. You want "Sketch on Face" to be robust (not break on rebuild)
3. You need edge selection for Fillet/Chamfer

**Stay on sketch improvements if:**
- You're still iterating on basic sketch UX
- Users aren't hitting the "reference broke" problem yet
- You want more immediate user-visible progress

### Can I do naming phases in parallel with sketch work?

**Yes, with care:**
- Naming Phases 1-3 are kernel-only and don't touch app code
- Sketch improvements (Batch 1) are app-only and don't touch kernel
- They can be developed in parallel by different agents

**Merge point:** Naming Phase 4-5 touches `SolidSession` API, which affects how features store references. Complete this before Batch 4A.

---

## Files Modified by Each Batch

| Batch | Primary Files |
|-------|---------------|
| 1A-1E | `Viewer.tsx`, `SketchContext.tsx`, `ViewerContext.tsx` |
| 2A-2B | `PropertiesPanel.tsx`, `SelectionContext.tsx`, `Viewer.tsx` |
| N1-N5 | `packages/core/src/naming/*`, `SolidSession.ts`, `kernel.worker.ts` |
| 4A | `SketchContext.tsx`, `schema.ts`, `featureHelpers.ts` |
| 4B | `Viewer.tsx`, `tessellate.ts`, `kernel.worker.ts` |
| 4C | `FloatingToolbar.tsx`, `PropertiesPanel.tsx`, new dialog components |

---

## Related Documents

- [CAD-UX-SPEC.md](/CAD-UX-SPEC.md) — Full sketch tool specifications
- [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md) — Naming algorithm details
- [ARCHITECTURE.md](/ARCHITECTURE.md) — Package boundaries
