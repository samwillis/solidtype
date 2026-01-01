# Phase 27 Implementation Status

**Last Updated:** 2026-01-01

## Summary

Phase 27 is approximately **70% complete**. The major infrastructure is in place (database, auth, Electric sync, branching logic), but the critical document loading flow is not implemented, blocking the end-to-end workflow.

---

## ✅ Phase 27a: Database & Auth Foundation - COMPLETE

- ✅ Drizzle ORM with PostgreSQL configured (`lib/db.ts`, `db/schema/*`)
- ✅ All database schemas defined (users, workspaces, projects, branches, documents, folders)
- ✅ better-auth integrated with Drizzle adapter (`lib/auth.ts`, `lib/auth-client.ts`)
- ✅ Auth routes and middleware (`routes/api/auth/$.ts`, `lib/auth-middleware.ts`)
- ✅ Login/signup UI pages working (`routes/login.tsx`, `routes/signup.tsx`)
- ✅ Protected routes require authentication
- ✅ Auto-create "main" branch when creating projects (in transaction)
- ✅ Docker Compose with Postgres, Electric, and Durable Streams

---

## ✅ Phase 27b: Workspaces & Projects - MOSTLY COMPLETE

- ✅ Workspace CRUD server functions (`lib/server-functions.ts`)
- ✅ Project CRUD server functions
- ✅ Folder CRUD server functions
- ✅ Document CRUD server functions
- ✅ Workspace and project list UIs (dashboard)
- ✅ Permission checking utilities (`lib/permissions.ts`)
- ✅ Create dialogs for all entities (workspace, project, folder, document)
- ✅ Delete dialogs and functionality (`DeleteConfirmDialog.tsx`)
- ✅ Move dialog for documents/folders (`MoveDialog.tsx`)
- ⚠️ Edit dialogs are stubs only (WorkspaceSettingsDialog, ProjectSettingsDialog say "coming soon")
- ❌ Permission/member management UI not started

---

## ✅ Phase 27c: Electric Sync Integration - COMPLETE

- ✅ Electric container configured (`docker-compose.yml`)
- ✅ Electric shapes for all collections (`lib/electric-collections.ts`)
- ✅ TanStack DB integrated with Electric collections
- ✅ Live queries working for workspaces, projects, branches, documents, folders
- ✅ Optimistic mutations via server functions with txid reconciliation
- ✅ Shape proxy routes (`routes/api/shapes/*`)
- ✅ Subquery-based authorization in shape WHERE clauses

---

## ⚠️ Phase 27d: Durable Streams for Yjs - PARTIAL (BLOCKING)

**What's Done:**
- ✅ Durable Streams container configured (`docker-compose.yml` - port 3200)
- ✅ y-durable-streams provider vendored (`lib/vendor/y-durable-streams/provider.ts`)
- ✅ `yjs-sync.ts` helper with `createDocumentSync()` function
- ✅ `SolidTypeAwareness` provider (`lib/awareness-provider.ts`)
- ✅ `durableStreamId` field in documents table with proper format

**What's Missing (CRITICAL):**
- ❌ **API routes for document streams** - `/api/docs/:docId/stream` does not exist
- ❌ **API routes for awareness** - `/api/docs/:docId/awareness` does not exist
- ❌ **Document loading in DocumentProvider** - currently ignores `documentId` prop
- ❌ **Durable Streams proxy** - `lib/durable-stream-proxy.ts` exists but routes don't use it

**The Gap:**
```typescript
// DocumentContext.tsx line 77 - always creates new doc, ignores documentId
const doc = useMemo(() => createDocument(), []);
```

Should load from database and sync with Durable Streams when `documentId` is provided.

---

## ⚠️ Phase 27e: Branching - PARTIAL

**What's Done:**
- ✅ Branch table and schema (`db/schema/branches.ts`)
- ✅ Branch CRUD server functions
- ✅ `createBranchWithContentMutation` - copies folders/documents to new branch
- ✅ `createBranch` function with folder/document copying (`lib/branching.ts`)
- ✅ `mergeBranch` function with "edit wins" strategy
- ✅ `forkDurableStream` and `mergeYjsDocument` logic
- ✅ `CreateBranchDialog` component
- ✅ `BranchVisualization` component (tree view)
- ✅ Branch dropdown in project view

**What's Missing:**
- ⚠️ Create branch button in UI (dialog exists but not accessible from main UI)
- ❌ Merge branch UI/button
- ❌ Branch stream forking untested (depends on working stream routes)

---

## ⚠️ Phase 27f: Following & Presence - PARTIAL

**What's Done:**
- ✅ `UserAwarenessState` type definition (`lib/awareness-state.ts`)
- ✅ `generateUserColor` utility
- ✅ `SolidTypeAwareness` class with full API
- ✅ `useFollowing` hook

**What's Missing:**
- ❌ `UserPresence` component (avatar bar)
- ❌ `UserCursors3D` component
- ❌ `SketchCursors` component
- ❌ Integration with viewer (camera sync, selection highlighting)
- ❌ Awareness stream routes

---

## ❌ Phase 27g: Full Integration - BLOCKED

Cannot complete until Phase 27d is done. The critical path is:

1. Implement `/api/docs/:docId/stream` route
2. Implement `/api/docs/:docId/awareness` route  
3. Update `DocumentProvider` to:
   - Accept `documentId` prop
   - Load document metadata from database
   - Connect to Durable Streams for Yjs sync
   - Connect awareness provider

---

## What Works Now (End User Perspective)

1. ✅ Sign up / log in / log out
2. ✅ View workspaces in dashboard
3. ✅ Create workspaces
4. ✅ View projects in workspace
5. ✅ Create projects (auto-creates main branch)
6. ✅ View branches in project
7. ✅ View files/folders in branch
8. ✅ Create folders
9. ✅ Create documents
10. ✅ Delete documents/folders
11. ✅ Move documents/folders
12. ✅ Switch between branches (dropdown)
13. ✅ View branch visualization (tree)
14. ✅ Click document → navigate to editor (but shows blank doc)

**What's Broken:**
- ❌ Editor always shows blank document (doesn't load saved content)
- ❌ Changes in editor are not persisted
- ❌ Multi-user collaboration doesn't work
- ❌ Presence indicators don't appear

---

## Next Priority Tasks

### 1. Critical Path (Unblock Document Loading)

```
[ ] Create /api/docs/$docId/stream.ts route
    - GET: proxy to Durable Streams for reading
    - POST: proxy to Durable Streams for writing
    - Verify document access permissions
    
[ ] Create /api/docs/$docId/awareness.ts route
    - Same pattern as stream route
    
[ ] Update DocumentProvider to load documents
    - When documentId is provided:
      1. Load document metadata from DB (via server function)
      2. Create Y.Doc
      3. Connect to Durable Streams via yjs-sync
      4. Wait for initial sync
      5. Use loaded doc for editing
    - When no documentId:
      - Create new local-only document (current behavior)
```

### 2. Medium Priority (Complete Core Features)

```
[ ] Wire up Create Branch button in project view UI
[ ] Add Merge Branch button and confirmation dialog
[ ] Implement workspace/project settings dialogs (edit name, description)
[ ] Add member management UI (invite, roles)
```

### 3. Lower Priority (Polish)

```
[ ] Implement UserPresence component
[ ] Implement UserCursors3D
[ ] Implement SketchCursors
[ ] Camera sync when following user
[ ] Selection highlighting for other users
```

---

## Technical Notes

### Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| Postgres | 54321 (host) → 5432 (container) | Database |
| Electric | 3100 (host) → 3000 (container) | Real-time sync |
| Durable Streams | 3200 | Yjs document persistence |

### Key Files

| File | Purpose |
|------|---------|
| `lib/server-functions.ts` | All CRUD operations |
| `lib/electric-collections.ts` | TanStack DB + Electric collections |
| `lib/vendor/y-durable-streams/provider.ts` | Yjs sync provider |
| `lib/yjs-sync.ts` | High-level Yjs sync helpers |
| `lib/awareness-provider.ts` | Presence/awareness wrapper |
| `lib/branching.ts` | Branch create/merge logic |
| `editor/contexts/DocumentContext.tsx` | **Needs update for loading** |

### API Routes Structure

```
/api/auth/$           - better-auth handler
/api/shapes/
  workspaces/         - Electric shape for workspaces
  projects/           - Electric shape for projects  
  branches/           - Electric shape for branches
  documents/          - Electric shape for documents
  folders/            - Electric shape for folders
/api/docs/            - **MISSING: Durable Streams proxy**
  $docId/stream       - Document stream (not implemented)
  $docId/awareness    - Awareness stream (not implemented)
```

---

## Estimate to Complete

| Phase | Effort | Blockers |
|-------|--------|----------|
| 27d (Durable Streams) | 4-6 hours | None |
| 27e (Branching UI) | 2-3 hours | None |
| 27f (Presence UI) | 4-6 hours | Requires 27d |
| 27g (Integration) | 2-4 hours | Requires 27d |
| Settings/Members UI | 4-6 hours | None |

**Total remaining: ~16-25 hours of development work**
