# SolidType Status

**Last Updated:** 2026-01-04

This document tracks the current implementation status of SolidType.

---

## Current Phase

**Phase 27: User System & Persistence** – ✅ Complete

---

## Phase Summary

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 01 | Document Model (Yjs) | ✅ Complete | |
| 02 | Kernel-Viewer Wiring | ✅ Complete | |
| 03 | Sketch with Lines | ✅ Complete | |
| 04 | Extrude Add | ✅ Complete | |
| 05 | Extrude Cut | ✅ Complete | |
| 06 | Revolve | ✅ Complete | |
| 07 | Basic Constraints | ✅ Complete | |
| 08 | Dimension Constraints | ✅ Complete | |
| 09 | Sketch Arcs | ✅ Complete | |
| 10 | Curves in Features | ✅ Complete | |
| 11 | 3D Selection | ⚠️ Mostly Complete | Edge selection missing |
| 12 | Rebuild Gate | ✅ Complete | |
| 13 | Properties Panel | ✅ Complete | |
| 14 | Extrude Extents | ⚠️ Mostly Complete | toVertex/toFace stubbed |
| 15 | Sketch on Face | ✅ Complete | |
| 16 | Sketch to Geometry | ✅ Complete | |
| 17 | Booleans | ✅ Complete | |
| 18 | STL/STEP Export | ✅ Complete | |
| 19 | Advanced Constraints | ⏳ Planned | |
| 20 | Fillet/Chamfer | ⏳ Planned | Kernel ready, no UI |
| 21 | Sweep/Loft | ⏳ Planned | |
| 22 | Patterns | ⏳ Planned | |
| 23 | AI Core Infrastructure | ✅ Complete | Durable Streams architecture |
| 24 | AI Dashboard | ✅ Complete | Dashboard tools working |
| 25 | AI Sketch | ⏳ Planned | |
| 26 | AI Modeling | ⏳ Planned | |
| 27 | User System & Persistence | ✅ Complete | |

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

| Gap | Phase | Complexity | Notes |
|-----|-------|------------|-------|
| Edge selection highlights | 11 | High | Needs edge tessellation + raycasting |
| Edge selection workflow | 11 | Medium | Code exists but no visual feedback |
| toVertex extent | 14 | Medium | Requires vertex reference resolution |
| toFace extent | 14 | Medium | Similar to toVertex |

### Blocks Future Features

- **Edge selection** → Required for Fillet/Chamfer UI (Phase 20)
- **Topological naming** → Required for robust face/edge references

---

## Recent Changes

### 2026-01-01: Phase 1-18 Gap Fixes

| Fix | Impact |
|-----|--------|
| 3D face selection highlights | Blue=selected, green=hover |
| Construction/draft lines | Toggle with 'X' key, dashed orange |
| Revolve axis selection | Friendly labels, construction lines prioritized |
| Offset plane creation | Dropdown with presets |
| Configurable grid size | Toggle with 'G' key, 0.5-10mm |
| Snap-to-geometry indicators | Diamond indicator at snap points |
| Body visibility toggle | Eye icon in feature tree |

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
1. Topological naming implementation
2. Assemblies and mates
3. NURBS/spline surfaces

---

## Technical Infrastructure

### Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| Postgres | 54321 | Database |
| Electric | 3100 | Real-time sync |
| Durable Streams | 3200 | Yjs persistence |
| Caddy | 3010 | HTTPS proxy |

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
