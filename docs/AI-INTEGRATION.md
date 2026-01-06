# AI Integration Architecture

SolidType's AI integration provides chat-based modeling assistance with durable, resumable sessions and multi-tab coordination.

---

## 1. Overview

The AI system enables users to interact with SolidType through natural language in two contexts:

| Context       | Location            | Capabilities                                        |
| ------------- | ------------------- | --------------------------------------------------- |
| **Dashboard** | Floating chat panel | Workspace, project, document, and branch management |
| **Editor**    | Right panel         | Sketch creation, 3D modeling, feature editing       |

### Design Principles

1. **Durable & Resumable** – Chat sessions persist across page refreshes and reconnections
2. **Multi-Tab Safe** – Run coordination prevents duplicate LLM calls across browser tabs
3. **Session Isolation** – Each session gets its own SharedWorker with isolated OCCT kernel
4. **Local Tool Execution** – CAD operations run off the main thread in the session's worker
5. **Undoable** – All model changes are undoable via Yjs undo manager

---

## 2. Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  User clicks "Send"                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SharedWorker                                                        │
│  - Checks: is there already a run in progress for this session?      │
│  - If yes: queue or reject                                           │
│  - If no: POST /api/ai/sessions/${sessionId}/run                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Server /run endpoint                                                │
│  - Preloads StreamDB (catches up with existing transcript)           │
│  - Builds history from messages + chunks                             │
│  - Appends: run record, user message, assistant placeholder          │
│  - Streams chat() and writes chunks as they arrive                   │
│  - On complete: updates assistant message status, run status         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Durable Stream (JSON events)                                        │
│  - Stream ID: ai-chat/${sessionId}                                   │
│  - Event types: message, chunk, run                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Client StreamDB (live queries)                                      │
│  - Observes messages, chunks, runs                                   │
│  - Hydrates assistant content: join chunks by messageId, sort by seq │
│  - UI updates automatically as events arrive                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Roles

| Component                    | Responsibility                                                           |
| ---------------------------- | ------------------------------------------------------------------------ |
| **Postgres/Electric**        | Session metadata (`ai_chat_sessions` table)                              |
| **Durable Streams**          | Chat transcript storage (messages, chunks, runs)                         |
| **Server /run endpoint**     | Runs `@tanstack/ai` chat(), writes events to Durable State               |
| **Client UI**                | Renders transcript via Durable State live queries                        |
| **Per-Session SharedWorker** | Isolated OCCT kernel per session, run coordination, local tool execution |

---

## 3. Durable State Schema

Chat transcripts are stored in Durable Streams using three collections:

### 3.1 Messages

| Field              | Type                                                                           | Notes                                                            |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `id`               | `string` (uuid)                                                                | Primary key                                                      |
| `runId`            | `string` (uuid)                                                                | Links to the run this message belongs to                         |
| `role`             | `"system" \| "user" \| "assistant" \| "tool_call" \| "tool_result" \| "error"` | Message type                                                     |
| `status`           | `"streaming" \| "complete" \| "pending" \| "running" \| "error"`               | Lifecycle state                                                  |
| `content`          | `string?`                                                                      | Present for user/system/error; derived from chunks for assistant |
| `parentMessageId`  | `string?`                                                                      | tool_call/tool_result point to assistant message                 |
| `toolName`         | `string?`                                                                      | For tool_call messages                                           |
| `toolArgs`         | `unknown?`                                                                     | For tool_call messages                                           |
| `toolCallId`       | `string?`                                                                      | Correlation ID for tool_call ↔ tool_result                       |
| `toolResult`       | `unknown?`                                                                     | For tool_result messages                                         |
| `requiresApproval` | `boolean?`                                                                     | For tool_call: does this need user approval?                     |
| `createdAt`        | `string` (ISO)                                                                 |                                                                  |
| `updatedAt`        | `string?` (ISO)                                                                |                                                                  |

### 3.2 Chunks (Insert-Only)

| Field       | Type            | Notes                                                        |
| ----------- | --------------- | ------------------------------------------------------------ |
| `id`        | `string`        | `${messageId}:${seq}` — deterministic for idempotent retries |
| `messageId` | `string` (uuid) | Links to assistant message                                   |
| `seq`       | `number`        | Monotonic sequence within message                            |
| `delta`     | `string`        | The text fragment                                            |
| `createdAt` | `string` (ISO)  |                                                              |

### 3.3 Runs

| Field                | Type                                 | Notes                                  |
| -------------------- | ------------------------------------ | -------------------------------------- |
| `id`                 | `string` (uuid)                      | Primary key                            |
| `status`             | `"running" \| "complete" \| "error"` | Run lifecycle                          |
| `userMessageId`      | `string` (uuid)                      | The user message that started this run |
| `assistantMessageId` | `string` (uuid)                      | The assistant message being generated  |
| `startedAt`          | `string` (ISO)                       |                                        |
| `endedAt`            | `string?` (ISO)                      |                                        |
| `error`              | `string?`                            | Error message if status is error       |

**Key design principle:** Each Durable Stream corresponds to exactly one chat session. The stream URL encodes the session identity (`/api/ai/sessions/${sessionId}/stream`), so `sessionId` is not stored on individual records.

---

## 4. Tool System

### 4.1 Tool Categories

| Category            | Context              | Execution Location |
| ------------------- | -------------------- | ------------------ |
| **Dashboard Tools** | Dashboard            | Server             |
| **Sketch Tools**    | Editor (sketch mode) | Server + Yjs       |
| **Modeling Tools**  | Editor (3D mode)     | Server + Yjs       |

### 4.2 Dashboard Tools

Workspace, project, document, and branch management:

- `listWorkspaces`, `createWorkspace`, `getWorkspace`
- `listProjects`, `createProject`, `openProject`, `getProject`
- `listDocuments`, `createDocument`, `openDocument`, `renameDocument`, `moveDocument`, `deleteDocument`
- `listBranches`, `createBranch`, `switchBranch`, `mergeBranch`, `deleteBranch`
- `listFolders`, `createFolder`, `renameFolder`, `deleteFolder`
- `searchDocuments`, `searchProjects`

### 4.3 Sketch Tools (Planned)

Geometry creation and constraint management:

- **Lifecycle**: `createSketch`, `enterSketch`, `exitSketch`, `getSketchStatus`
- **Geometry**: `addLine`, `addCircle`, `addArc`, `addRectangle`, `addPolygon`, `addSlot`
- **Points**: `movePoint`, `mergePoints`
- **Constraints**: `addConstraint`, `removeConstraint`, `modifyConstraintValue`
- **Deletion**: `deleteEntity`, `deletePoint`

### 4.4 Modeling Tools (Planned)

Feature creation and modification:

- **Query**: `getCurrentSelection`, `getModelContext`, `findFaces`, `findEdges`, `measureDistance`, `getBoundingBox`
- **Features**: `createExtrude`, `createRevolve`, `createFillet`, `createChamfer`, `createLinearPattern`, `createCircularPattern`
- **Modify**: `modifyFeature`, `deleteFeature`, `reorderFeature`, `suppressFeature`, `renameFeature`
- **Helpers**: `createBox`, `createCylinder`, `createHole`, `createPocket`, `createBoss`, `createShell`

### 4.5 Tool Approval

| Tool Category            | Default Approval          |
| ------------------------ | ------------------------- |
| Read operations          | `auto`                    |
| Create/modify operations | `auto` (undoable via Yjs) |
| Delete operations        | `confirm` (destructive)   |

Users can override via:

- **YOLO mode** – auto-approve everything including deletions
- **Per-tool "always allow"** – bypass confirmation for specific tools

---

## 5. Per-Session SharedWorkers

Each AI chat session gets its own **named SharedWorker** with an isolated OCCT kernel. This architecture ensures:

1. **Complete Isolation** – Multiple AI agents can work on different documents simultaneously without conflicts
2. **Multi-Tab Coordination** – Same session across browser tabs shares one worker (SharedWorker behavior)
3. **No Blocking** – Two agents running CAD operations on different documents don't interfere
4. **Automatic Cleanup** – Workers self-terminate after 3 minutes of inactivity

### Architecture

```
┌────────────────────────────────┐  ┌────────────────────────────────┐
│  SharedWorker                  │  │  SharedWorker                  │
│  "ai-chat-worker-session-A"    │  │  "ai-chat-worker-session-B"    │
│  ┌────────────────────────┐    │  │  ┌────────────────────────┐    │
│  │ OCCT Kernel (A only)   │    │  │  │ OCCT Kernel (B only)   │    │
│  └────────────────────────┘    │  │  └────────────────────────┘    │
│  Session state, run tracking   │  │  Session state, run tracking   │
└────────────────────────────────┘  └────────────────────────────────┘
         ↑         ↑                         ↑         ↑
     Tab 1     Tab 2                     Tab 3     Tab 4
   (same session A)                    (same session B)
```

Workers are named by session ID: `ai-chat-worker-${sessionId}`. This means:

- Multiple tabs viewing the same chat session connect to the **same** worker
- Different chat sessions get **completely isolated** workers with their own OCCT kernels

### Memory Considerations

Each worker loads its own OCCT WASM instance (~50-100MB). The idle timeout mitigates memory usage by cleaning up unused workers after 3 minutes.

### Worker Commands

| Command              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `init-session`       | Initialize session with documentId/projectId |
| `terminate-session`  | Clean up session resources                   |
| `start-run`          | Begin a new chat run                         |
| `run-complete`       | Mark run as finished                         |
| `execute-local-tool` | Execute a CAD tool locally                   |
| `ping`               | Health check                                 |

### Client API

```typescript
// Get a client for a specific session
const client = getAIChatWorkerClient(sessionId);

// Initialize session (connects to session-specific worker)
await client.initSession(sessionId, { documentId, projectId });

// Execute a local CAD tool
const result = await client.executeLocalTool(sessionId, "addLine", args);

// Clean up when session is terminated
disposeAIChatWorkerClient(sessionId);
```

---

## 6. Session Management

### Session Lifecycle

1. **Create** – User opens chat; session created in `ai_chat_sessions` table
2. **Connect** – Client creates StreamDB for session's Durable Stream
3. **Run** – User sends message → SharedWorker → Server → LLM → Durable Stream
4. **Reconnect** – On page refresh, client reconnects and catches up from Durable Stream
5. **Resume** – Stale runs (>5 min) are marked as error; user can send new message

### Session Metadata (Postgres via Electric)

| Field             | Type                      | Notes                             |
| ----------------- | ------------------------- | --------------------------------- |
| `id`              | `uuid`                    | Primary key                       |
| `userId`          | `uuid`                    | Owner                             |
| `context`         | `"dashboard" \| "editor"` | Context type                      |
| `documentId`      | `uuid?`                   | For editor context                |
| `projectId`       | `uuid?`                   | For scoped context                |
| `title`           | `string?`                 | Auto-generated from first message |
| `durableStreamId` | `string?`                 | Stream ID for Durable Streams     |
| `messageCount`    | `number`                  | For display                       |
| `lastMessageAt`   | `timestamp`               | For sorting                       |

---

## 7. Client Integration

### Dashboard

- Floating action button (FAB) opens chat dialog
- Chat persists across navigation within dashboard
- Tools can navigate to projects/documents

### Editor

- Right panel shows chat history
- Context includes document structure, selection, kernel state
- Tools modify Yjs document directly
- Optional: spawn background agent for autonomous modeling

---

## 8. Local Tool Execution Bridge

For tools that need to run locally (CAD operations):

1. Server writes `tool_call` message with `status: "pending"`
2. Server waits for `tool_result` message to appear
3. SharedWorker observes the pending tool_call
4. Worker requests approval (or auto-approves based on rules)
5. Worker executes the tool locally (using CAD kernel)
6. Worker writes `tool_result` message
7. Server receives result and continues LLM conversation

This keeps tool execution within TanStack AI's tool architecture while using Durable State as the transport mechanism.

---

## 9. File Organization

```
packages/app/src/lib/ai/
├── state/
│   ├── schema.ts          # Durable State schema (messages, chunks, runs)
│   ├── db.ts              # createChatStreamDB() helper
│   ├── hydrate.ts         # Utilities for building transcript from chunks
│   └── types.ts           # Shared types
├── prompts/
│   ├── dashboard.ts       # Dashboard system prompt
│   ├── editor.ts          # Editor system prompt
│   └── sketch.ts          # Sketch mode system prompt
├── tools/
│   ├── dashboard.ts       # Dashboard tool definitions
│   ├── dashboard-impl.ts  # Dashboard tool implementations
│   ├── sketch.ts          # Sketch tool definitions
│   ├── sketch-impl.ts     # Sketch tool implementations
│   ├── modeling-query.ts  # Modeling query tools
│   ├── modeling-features.ts # Feature creation tools
│   ├── modeling-modify.ts # Feature modification tools
│   ├── modeling-helpers.ts # High-level geometry helpers
│   └── modeling-impl.ts   # Modeling tool implementations
├── runtime/
│   ├── ai-chat-worker.ts  # SharedWorker implementation
│   ├── ai-chat-worker-client.ts # Client for SharedWorker
│   └── types.ts           # Worker message types
├── context/
│   ├── sketch-context.ts  # Serialize active sketch for AI
│   └── editor-context.ts  # Editor context assembly
├── apply/
│   └── apply-changes.ts   # Yjs change application with rollback
└── approval.ts            # Tool approval configuration
```

---

## 10. API Routes

```
/api/ai/sessions/
  $sessionId/stream        # Durable Streams proxy for chat transcript
  $sessionId/run           # Start a new chat run
```

---

## Related Documents

- [../plan/23-ai-core-infrastructure.md](../plan/23-ai-core-infrastructure.md) – Phase 23 implementation plan
- [../plan/24-ai-dashboard.md](../plan/24-ai-dashboard.md) – Dashboard tools plan
- [../plan/25-ai-sketch.md](../plan/25-ai-sketch.md) – Sketch tools plan
- [../plan/26-ai-modeling.md](../plan/26-ai-modeling.md) – Modeling tools plan
