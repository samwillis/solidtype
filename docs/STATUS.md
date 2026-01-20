# SolidType Status

**Last Updated:** 2026-01-20

This document tracks the current implementation status of SolidType.

---

## Current Phase

**CAD Pipeline Rework** – ✅ Phases 0-7 Complete (Phase 8 deferred)

---

## Phase Summary

| Phase | Name                      | Status             | Notes                        |
| ----- | ------------------------- | ------------------ | ---------------------------- |
| 01    | Document Model (Yjs)      | ✅ Complete        |                              |
| 02    | Kernel-Viewer Wiring      | ✅ Complete        |                              |
| 03    | Sketch with Lines         | ✅ Complete        |                              |
| 04    | Extrude Add               | ✅ Complete        |                              |
| 05    | Extrude Cut               | ✅ Complete        |                              |
| 06    | Revolve                   | ✅ Complete        |                              |
| 07    | Basic Constraints         | ✅ Complete        |                              |
| 08    | Dimension Constraints     | ✅ Complete        |                              |
| 09    | Sketch Arcs               | ✅ Complete        |                              |
| 10    | Curves in Features        | ✅ Complete        |                              |
| 11    | 3D Selection              | ⚠️ Mostly Complete | Edge selection missing       |
| 12    | Rebuild Gate              | ✅ Complete        |                              |
| 13    | Properties Panel          | ✅ Complete        |                              |
| 14    | Extrude Extents           | ⚠️ Mostly Complete | toVertex/toFace stubbed      |
| 15    | Sketch on Face            | ✅ Complete        |                              |
| 16    | Sketch to Geometry        | ✅ Complete        |                              |
| 17    | Booleans                  | ✅ Complete        |                              |
| 18    | STL/STEP Export           | ✅ Complete        |                              |
| 19    | Advanced Constraints      | ⏳ Planned         |                              |
| 20    | Fillet/Chamfer            | ⏳ Planned         | Kernel ready, no UI          |
| 21    | Sweep/Loft                | ⏳ Planned         |                              |
| 22    | Patterns                  | ⏳ Planned         |                              |
| 23    | AI Core Infrastructure    | ✅ Complete        | Durable Streams architecture |
| 24    | AI Dashboard              | ✅ Complete        | Dashboard tools working      |
| 25    | AI Sketch                 | ⚠️ In Progress     | Tool defs & impls complete   |
| 26    | AI Modeling               | ⏳ Planned         |                              |
| 27    | User System & Persistence | ✅ Complete        |                              |

---

## CAD Pipeline Rework Summary

The CAD Pipeline Rework (documented in `CAD-PIPELINE-REWORK.md`) delivers a unified architecture for UI and AI mutations with merge-safe topological naming.

### Phase 0: Regression Tests ✅
- `commands-invariants.test.ts` ensuring UI/AI produce identical Yjs state

### Phase 1: Commands Layer ✅
- Unified command API in `editor/commands/`
- All mutations go through `createSketch`, `createExtrude`, etc.
- Both UI tools and AI tools use the same commands

### Phase 2: PersistentRef V1 ✅
- CRDT-safe reference format (`stref:v1:...`)
- `editor/naming/persistentRef.ts` with encoding/decoding

### Phase 3: ReferenceIndex ✅
- Rebuild-time mapping of mesh indices to PersistentRefs
- `editor/kernel/referenceIndex.ts` with fingerprint computation

### Phase 4: KernelEngine Extraction ✅
- Reusable `KernelEngine` class in `editor/kernel/KernelEngine.ts`
- No worker-specific APIs, works in UI worker and AI worker

### Phase 5: KernelEngine in AI Worker ✅
- Local KernelEngine in `WorkerChatController`
- Auto-rebuild on Yjs changes (debounced)
- `getModelSnapshot` tool with `snapshotRenderer.ts`
- Geometry query tools: `findFaces`, `getBoundingBox`, `getModelSnapshot`

### Phase 6: PersistentRef Resolution & Repair ✅
- `resolvePersistentRef.ts` with found/ambiguous/notFound states
- `commands/repair.ts` for reference repair

### Phase 7: Constraint Solver Feedback ✅
- `getSketchSolveReport` tool exposes solver DOF and status
- AI can check if sketch is over-constrained

### Phase 8: OCCT History (Deferred)
- Progressive optimization for later
- Will improve ref accuracy using OCCT operation history

---

## Phase 27 Completion Summary

Phase 27 delivered the complete user system and persistence infrastructure:

### 27a: Database & Auth ✅

- Drizzle ORM with PostgreSQL
- better-auth integration
- Login/signup UI

### 27b: Workspaces & Projects ✅

- Full CRUD for workspaces, projects, folders, documents
- Member management with roles (owner, admin, member)
- Permission checking

### 27c: Electric Sync ✅

- Real-time metadata sync via ElectricSQL
- TanStack DB integration with live queries
- Optimistic mutations

### 27d: Durable Streams for Yjs ✅

- Yjs document persistence
- Proper long-polling with stream headers
- Sync status indicators

### 27e: Branching ✅

- Create/merge branches
- "Edit wins" merge strategy
- Branch visualization

### 27f: Following & Presence ✅

- User avatars and presence
- Camera sync when following
- 3D/2D cursor display
- Followers badge

---

## Known Gaps

### Requires Kernel Work

| Gap                       | Phase | Complexity | Notes                                |
| ------------------------- | ----- | ---------- | ------------------------------------ |
| Edge selection highlights | 11    | High       | Needs edge tessellation + raycasting |
| Edge selection workflow   | 11    | Medium     | Code exists but no visual feedback   |
| toVertex extent           | 14    | Medium     | Requires vertex reference resolution |
| toFace extent             | 14    | Medium     | Similar to toVertex                  |

### Blocks Future Features

- **Edge selection** → Required for Fillet/Chamfer UI (Phase 20)
- ~~**Topological naming**~~ → ✅ Implemented (CAD Pipeline Rework Phases 2-3, 6)

---

## Recent Changes

### 2026-01-20: CAD Pipeline Rework (Phases 0-7)

| Change                     | Impact                                            |
| -------------------------- | ------------------------------------------------- |
| Unified commands layer     | UI and AI mutations use identical code paths      |
| PersistentRef V1           | Merge-safe topological references (stref:v1:...)  |
| ReferenceIndex             | Rebuild-time face/edge fingerprinting             |
| KernelEngine extraction    | Reusable kernel rebuild logic                     |
| AI worker kernel           | Geometry queries work without UI tab              |
| getModelSnapshot tool      | AI can "see" the model via rendered snapshots     |
| Resolver + repair commands | References can be resolved and repaired           |
| Solver feedback tools      | AI can check constraint DOF and solve status      |

### 2026-01-05: Phase 25 AI Sketch Tools

| Change                       | Impact                                        |
| ---------------------------- | --------------------------------------------- |
| Sketch context serialization | Yjs sketch data → AI-friendly context         |
| Sketch system prompt         | Context-aware prompts for sketch editing      |
| Sketch tool definitions      | 19 tools for geometry, constraints, lifecycle |
| Sketch helper tools          | 7 high-level convenience tools                |
| Sketch tool implementations  | Full local implementations using Yjs          |
| Execution registry update    | All sketch tools marked as local (browser)    |
| Unit tests                   | 41 tests passing                              |

### 2026-01-01: Phase 1-18 Gap Fixes

| Fix                          | Impact                                          |
| ---------------------------- | ----------------------------------------------- |
| 3D face selection highlights | Blue=selected, green=hover                      |
| Construction/draft lines     | Toggle with 'X' key, dashed orange              |
| Revolve axis selection       | Friendly labels, construction lines prioritized |
| Offset plane creation        | Dropdown with presets                           |
| Configurable grid size       | Toggle with 'G' key, 0.5-10mm                   |
| Snap-to-geometry indicators  | Diamond indicator at snap points                |
| Body visibility toggle       | Eye icon in feature tree                        |

---

## Next Up

### Short Term

1. Edge selection system (unblocks Fillet/Chamfer)
2. Fillet/Chamfer UI
3. AI Sketch integration (Phase 25)

### Medium Term

1. Advanced constraints (Phase 19)
2. Sweep/Loft (Phase 21)
3. Patterns (Phase 22)
4. AI Modeling integration (Phase 26)

### Future

1. OCCT history for improved naming (Phase 8 of CAD Pipeline Rework)
2. Assemblies and mates
3. NURBS/spline surfaces

---

## Technical Infrastructure

### Docker Services

| Service         | Port  | Purpose         |
| --------------- | ----- | --------------- |
| Postgres        | 54321 | Database        |
| Electric        | 3100  | Real-time sync  |
| Durable Streams | 3200  | Yjs persistence |
| Caddy           | 3010  | HTTPS proxy     |

### Key Architecture Documents

- [OVERVIEW.md](OVERVIEW.md) – Vision and goals
- [ARCHITECTURE.md](ARCHITECTURE.md) – Package structure
- [DOCUMENT-MODEL.md](DOCUMENT-MODEL.md) – Yjs schema
- [TOPOLOGICAL-NAMING.md](TOPOLOGICAL-NAMING.md) – Naming system design
- [AI-INTEGRATION.md](AI-INTEGRATION.md) – AI system architecture
- [CAD-UX-SPEC.md](CAD-UX-SPEC.md) – UX specification

---

## Testing Status

- Unit tests: ✅ Passing
- Integration tests: ⚠️ Need multi-user testing
- E2E tests: ⏳ Not implemented

### Recommended Testing

- [ ] Full workflow end-to-end with multiple users
- [ ] Branch merge with concurrent edits
- [ ] Following across network conditions
- [ ] Offline/reconnect scenarios
