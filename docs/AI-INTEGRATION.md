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
│  User clicks "Send"                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SharedWorker (WorkerChatController)                                │
│  - Generates runId locally                                          │
│  - POST /api/ai/sessions/${sessionId}/run with runId                │
│  - Starts observing Durable Stream for new chunks                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Server /run endpoint                                               │
│  - Preloads StreamDB (catches up with existing transcript)          │
│  - Builds history from messages (includes tool_call/tool_result)    │
│  - Appends: run record, user message, assistant placeholder         │
│  - Registers tools:                                                 │
│    • Server tools: execute directly                                 │
│    • Local tools: bridge wrappers that wait for worker              │
│  - Streams chat() and writes chunks as they arrive                  │
│  - For local tools: writes tool_call, waits for tool_result         │
│  - On complete: updates assistant message status, run status        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Durable Stream (JSON events)                                       │
│  - Stream ID: ai-chat/${sessionId}                                  │
│  - Event types: message, chunk, run                                 │
│  - tool_call messages: written by server, observed by worker        │
│  - tool_result messages: written by worker, observed by server      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌──────────────────────────────────┐  ┌────────────────────────────────────┐
│  SharedWorker (Durable Stream    │  │  Client UI (StreamDB)              │
│  Adapter)                        │  │  - Observes messages, chunks, runs │
│  - Polls StreamDB for new chunks │  │  - Hydrates assistant content      │
│  - Converts to TanStack AI       │  │  - UI updates automatically        │
│    StreamChunks                  │  │                                    │
│  - Routes tool_call chunks to    │  │                                    │
│    executeClientTool()           │  │                                    │
│  - Executes tools on Yjs doc     │  │                                    │
│  - Writes tool_result messages   │  │                                    │
└──────────────────────────────────┘  └────────────────────────────────────┘
```

### Component Roles

| Component                    | Responsibility                                                           |
| ---------------------------- | ------------------------------------------------------------------------ |
| **Postgres/Electric**        | Session metadata (`ai_chat_sessions` table)                              |
| **Durable Streams**          | Chat transcript storage (messages, chunks, runs)                         |
| **Server /run endpoint**     | Runs `@tanstack/ai` chat(), writes events to Durable State, coordinates local tool execution via bridge pattern |
| **Client UI**                | Renders transcript via Durable State live queries                        |
| **Per-Session SharedWorker** | Isolated OCCT kernel per session, observes Durable Stream via custom adapter, executes local tools, writes results |
| **WorkerChatController**     | Manages TanStack AI chat loop in worker, routes tool calls, executes on Yjs document |
| **DurableStreamAdapter**     | Custom TanStack AI adapter that polls StreamDB and converts records to StreamChunks |

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

| Category            | Context              | Execution Location | Registry |
| ------------------- | -------------------- | ------------------ | -------- |
| **Dashboard Tools** | Dashboard            | Server             | `execution-registry.ts` |
| **Sketch Tools**    | Editor (sketch mode) | SharedWorker + Yjs | `execution-registry.ts` |
| **Modeling Tools**  | Editor (3D mode)     | SharedWorker + Yjs | `execution-registry.ts` |

All tools are registered in `execution-registry.ts` with their execution mode (`"server"` or `"local"`). The server uses this registry to determine which tools need bridge wrappers for local execution.

### 4.2 Dashboard Tools

Workspace, project, document, and branch management:

- `listWorkspaces`, `createWorkspace`, `getWorkspace`
- `listProjects`, `createProject`, `openProject`, `getProject`
- `listDocuments`, `createDocument`, `openDocument`, `renameDocument`, `moveDocument`, `deleteDocument`
- `listBranches`, `createBranch`, `switchBranch`, `mergeBranch`, `deleteBranch`
- `listFolders`, `createFolder`, `renameFolder`, `deleteFolder`
- `searchDocuments`, `searchProjects`

### 4.3 Sketch Tools (Implemented)

Geometry creation and constraint management:

- **Lifecycle**: `createSketch`, `enterSketch`, `exitSketch`, `getSketchStatus`
- **Geometry**: `addLine`, `addCircle`, `addArc`, `addRectangle`, `addPolygon`, `addSlot`
- **Points**: `addPoint`, `movePoint`, `mergePoints`
- **Constraints**: `addConstraint`, `removeConstraint`, `modifyConstraintValue`
- **Deletion**: `deleteEntity`, `deletePoint`
- **Helpers**: `createCenteredRectangle`, `createCircleWithRadius`, `createSymmetricProfile`, `createBoltCircle`, `createCenterlinesAtOrigin`, `createChamferedRectangle`, `createRoundedRectangle`
- **Construction**: `toggleConstruction`

All sketch tools execute locally in the SharedWorker where the Yjs document is available.

### 4.4 Modeling Tools (Implemented)

Feature creation and modification:

- **Query**: `getCurrentSelection`, `getModelContext`, `findFaces`, `findEdges`, `measureDistance`, `getBoundingBox`, `measureAngle`
- **Features**: `createExtrude`, `createRevolve`, `createLoft`, `createSweep`, `createFillet`, `createChamfer`, `createDraft`, `createLinearPattern`, `createCircularPattern`, `createMirror`
- **Modify**: `modifyFeature`, `deleteFeature`, `reorderFeature`, `suppressFeature`, `renameFeature`, `duplicateFeature`, `undo`, `redo`
- **Helpers**: `createBox`, `createCylinder`, `createSphere`, `createCone`, `createHole`, `createPocket`, `createBoss`, `createShell`, `createRib`, `filletAllEdges`

All modeling tools execute locally in the SharedWorker where the OCCT kernel is available.

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

### Worker Architecture

Each SharedWorker contains:

1. **WorkerChatController**: Manages the TanStack AI chat loop
   - Initializes StreamDB connection to Durable Stream
   - Syncs Yjs document for tool execution
   - Observes stream via `DurableStreamAdapter`
   - Routes tool calls to `executeClientTool()`
   - Writes tool results back to Durable Stream
   - Broadcasts UI events to main thread

2. **DurableStreamAdapter**: Custom TanStack AI stream adapter
   - Polls StreamDB collections (messages, chunks, runs)
   - Converts Durable Stream records to TanStack AI `StreamChunk` types
   - Handles `content`, `tool_call`, `tool_result`, `done`, `error` chunks
   - Enables resilient streaming that survives browser/worker closure

3. **OCCT Kernel**: Isolated CAD kernel instance
   - Loaded per worker for modeling tool execution
   - Used by `executeModelingTool()` for 3D operations

### Worker Commands

| Command              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `init-session`       | Initialize session with documentId/projectId |
| `terminate-session`  | Clean up session resources                   |
| `send-message`       | Send a new user message (starts new run)     |
| `ping`               | Health check                                 |

### Client API

```typescript
// Get a client for a specific session
const client = getAIChatWorkerClient(sessionId);

// Initialize session (connects to session-specific worker)
await client.initSession(sessionId, { documentId, projectId });

// Send a message (worker handles run coordination and tool execution)
await client.sendMessage(sessionId, "Create a sketch with a circle");

// Clean up when session is terminated
client.disconnect();
```

---

## 6. Session Management

### Session Lifecycle

1. **Create** – User opens chat; session created in `ai_chat_sessions` table
2. **Connect** – Client creates StreamDB for session's Durable Stream
3. **Initialize Worker** – SharedWorker initializes, connects to StreamDB, syncs Yjs document if needed
4. **Run** – User sends message → Worker generates `runId` → Worker POSTs to `/run` → Server runs LLM → Writes to Durable Stream → Worker observes stream → Executes tools → Writes results
5. **Reconnect** – On page refresh, client reconnects and catches up from Durable Stream
6. **Resume** – Worker checks for active runs on initialization and resumes if found

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

For tools that need to run locally (CAD operations), the system uses a bridge pattern that coordinates between the server's LLM loop and the worker's tool execution:

### Architecture

1. **Tool Registration**: Server registers all tools (both server and local) with TanStack AI
   - Server tools: Direct implementations that execute on the server
   - Local tools: Bridge wrappers created by `getEditorToolsWithWorkerBridge()`

2. **Bridge Implementation**: For local tools, the server creates a wrapper that:
   - Writes `tool_call` message to Durable Stream (via `processStream`)
   - Polls StreamDB for a matching `tool_result` message
   - Returns the result to TanStack AI so the conversation continues

3. **Worker Execution**: The SharedWorker's `WorkerChatController`:
   - Observes Durable Stream via `DurableStreamAdapter` (custom TanStack AI adapter)
   - Receives `tool_call` chunks from the stream
   - Routes to `executeClientTool()` which calls `executeSketchTool()` or `executeModelingTool()`
   - Executes tool on Yjs document (with OCCT kernel for modeling tools)
   - Writes `tool_result` message back to Durable Stream

4. **Coordination**: The bridge pattern ensures:
   - Server's LLM loop can use TanStack AI's standard tool calling API
   - Worker executes tools in isolation with access to Yjs document
   - Durable Streams provides the transport layer for coordination
   - All tool calls and results are persisted for resumability

### Tool Execution Registry

Tools are registered in `execution-registry.ts` with their execution mode:
- `"server"`: Execute on server (database operations, API calls)
- `"local"`: Execute in SharedWorker (CAD operations on Yjs document)

The registry is used by the server to determine which tools need bridge wrappers.

---

## 9. Durable Stream Adapter

The `DurableStreamAdapter` is a custom TanStack AI stream adapter that enables the worker to consume Durable Streams as an `AsyncIterable<StreamChunk>`. This provides:

### Key Features

1. **Resilient Streaming**: Stream survives browser/worker closure and reconnects automatically
2. **Multi-Tab Sync**: All tabs observing the same session see updates in real-time
3. **Server-Side Persistence**: LLM responses are persisted on the server before worker consumes them
4. **Tool Coordination**: Tool calls and results flow through the same stream

### Implementation

The adapter:
- Polls `StreamDB.collections` (messages, chunks, runs) at configurable intervals
- Converts Durable Stream records to TanStack AI `StreamChunk` types:
  - `content`: Text chunks from assistant messages
  - `tool_call`: Tool invocation requests from LLM
  - `tool_result`: Tool execution results from worker
  - `done`: Stream completion signal
  - `error`: Error conditions
- Handles deduplication to prevent processing the same chunk twice
- Tracks state (last chunk sequence, seen tool calls/results) across polls

### Usage

```typescript
// In WorkerChatController
const stream = streamChunksFromDurableStream({
  sessionId: this.sessionId,
  documentId: this.documentId,
  projectId: this.projectId,
});

for await (const chunk of stream) {
  await this.handleChunk(chunk, runId);
}
```

---

## 10. File Organization

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
│   ├── worker-chat-controller.ts # Manages TanStack AI chat loop in worker
│   ├── durable-stream-adapter.ts # Custom TanStack AI adapter for Durable Streams
│   ├── sketch-tool-executor.ts # Routes sketch tool names to implementations
│   ├── modeling-tool-executor.ts # Routes modeling tool names to implementations
│   └── types.ts           # Worker message types
├── context/
│   ├── sketch-context.ts  # Serialize active sketch for AI
│   └── editor-context.ts  # Editor context assembly
├── apply/
│   └── apply-changes.ts   # Yjs change application with rollback
└── approval.ts            # Tool approval configuration
```

---

## 11. API Routes

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
