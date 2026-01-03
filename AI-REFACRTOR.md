### Refactoring AI Chat to a Durable, Resumable, Multi-Tab Architecture

We’re refactoring the AI integration so that **chat streaming, tool calls, and session state are durable and resumable**, and so that the “local” parts of the agent (especially CAD operations) can run **off the main thread** and be **shared across tabs**.

Today, the UI consumes an SSE stream directly and reconstructs assistant output in-memory as it arrives. That works for a single tab, but it has three major drawbacks for where we’re heading:

- **Fragile streaming transport**: if the connection drops or the tab reloads mid-response, we lose the in-flight stream unless we bolt on bespoke resume logic.
- **No single shared runtime**: multiple tabs can duplicate work, and we can’t safely run CAD-level agent actions in a coordinated way.
- **Tooling doesn’t have a durable “event log”**: approvals, tool calls, and tool results aren’t first-class durable state, which makes recovery and multi-tab behaviour hard.

This refactor moves us to a “local-first” architecture where the **Durable Stream is the streaming transport** and the **Durable State Protocol is the canonical chat transcript store**.

#### The new model

- **Server writes the model output to a Durable Stream** as it is generated.
  - The LLM response is persisted as **insert-only chunk records**, rather than mutating message rows per token.
  - Each assistant message starts as `status=streaming` and is updated once at the end to `status=complete` (or `error`).

- **Clients render by reading Durable State**, not by parsing SSE from the model endpoint.
  - The UI performs live queries over `messages` and `chunks`.
  - Assistant text is derived by concatenating `chunks` for each message in `(messageId, seq)` order.
  - Because the stream is durable and offset-resumable, reloads and connection drops are naturally recoverable.

- **One SharedWorker per chat session** hosts the local runtime.
  - The worker is keyed by session id, so all tabs viewing the same session share a single agent runtime.
  - The worker coordinates “start run” commands (to prevent duplicate runs across tabs).
  - Over time, the worker becomes the home for **local tool execution** (CAD model inspection/mutation) on a separate thread.
  - Workers go idle / shut down after inactivity; resuming a session is just re-attaching and rehydrating from Durable State.

#### Data sources and responsibilities

- **Postgres / ElectricSQL / TanStack DB** continue to store _session metadata_ (session list, titles, project association, timestamps, durable stream id, etc.).
- **Durable Streams + Durable State** store the _event log and transcript_:
  - `messages`: one record per user/assistant/system/tool message, updated only for coarse lifecycle transitions (streaming → complete, pending → complete, etc.).
  - `chunks`: insert-only streaming deltas linked to an assistant message (and later also tool-call/tool-result events if needed).
  - (Optional) `runs`: a small coordination record to describe an in-flight generation run.

#### Why we’re doing it this way

This architecture gives us:

- **Resumable streaming by design** (offset replay / reconnect): no bespoke “resume SSE” logic.
- **Shared multi-tab behaviour**: one session runtime, one tool executor, one place to coordinate concurrent actions.
- **A durable, queryable transcript** that naturally supports:
  - “open a chat in another tab”
  - “refresh mid response”
  - “replay/inspect tool calls”
  - “audit what happened”

- A clean path to “agent can act on the CAD model” without blocking the UI, by running local tools inside the worker and persisting everything as durable events.

The rest of this plan describes the concrete steps to implement the Durable State schema, add the stream proxy + run endpoints, refactor the UI to render from live queries, introduce per-session SharedWorkers with idle shutdown, and then layer in durable tool calling and local tool execution.

## 0) Target architecture (what we’re building)

### Persistent truth

- **Postgres/Electric (TanStack DB + ElectricSQL):** session metadata (`ai_chat_sessions` table).
- **Durable Streams + Durable State:** chat transcript + streaming chunks + tool events.

### Roles

- **Server** (`/api/ai/sessions/:id/run`):
  - runs `@tanstack/ai` `chat()` as an `AsyncIterable<StreamChunk>` ([TanStack][1])
  - **writes transcript events into Durable State** (messages + chunks)
  - optionally bridges “local tools” by emitting a tool-call record and waiting for a tool-result record (later phase).

- **Client UI**:
  - does **not** consume SSE.
  - uses **Durable State live queries** to show transcript by concatenating chunks.
  - sends user input by telling the SharedWorker “start a run”.

- **SharedWorker (per session)**:
  - coordinates “local agent / local tools” and multi-tab orchestration.
  - enforces “single run at a time per session” across tabs.
  - idles out (shuts down) after inactivity, and resumes from Durable State when re-created.

---

## 1) Dependency + folder layout changes

### Add dependency

In `packages/app/package.json` add:

- `@durable-streams/state`

(You already have `@durable-streams/client` and `@durable-streams/server`.)

### New folder for chat durable-state

Create:

```
packages/app/src/lib/ai/state/
  schema.ts
  db.ts
  hydrate.ts
  types.ts
```

---

## 2) Durable State schema (message + chunk + optional run)

You want:

- **No “update message per token”**
- **Chunks are insert-only**
- **Message has streaming state, updated at end**

### Collections

Implement with `createStateSchema` (from `@durable-streams/state`) ([GitHub][2])

**messages**

- `id: string` (uuid)
- `sessionId: string`
- `role: "system" | "user" | "assistant" | "tool_call" | "tool_result" | "error"`
- `status: "streaming" | "complete" | "pending" | "running" | "error"` (at minimum)
- `content?: string` (present for user/system/error; optional for assistant final snapshot)
- `parentMessageId?: string` (tool_call/result can point at the assistant message)
- tool fields (only when role is tool\_\*):
  - `toolName?: string`
  - `toolArgs?: unknown`
  - `toolCallId?: string`
  - `toolResult?: unknown`

- timestamps:
  - `createdAt: string` (ISO)
  - `updatedAt?: string`

- `runId?: string` (useful for transport-to-TanStack-AI later)

**chunks** (insert-only)

- `id: string` (recommend deterministic: `${messageId}:${seq}` to make retries idempotent)
- `sessionId: string`
- `messageId: string`
- `seq: number` (monotonic per message, created by the writer)
- `delta: string`
- `createdAt: string`
- `runId?: string`

**runs** (optional but recommended; simplifies UI + worker coordination)

- `id: string` (uuid)
- `sessionId: string`
- `status: "running" | "complete" | "error"`
- `userMessageId: string`
- `assistantMessageId: string`
- `startedAt: string`
- `endedAt?: string`
- `error?: string`

Why add `runs`?

- Your UI and worker don’t have to infer “is streaming” by scanning messages.
- It becomes your “transport primitive” if you later build a TanStack AI connection adapter from Durable State.

---

## 3) Durable Stream proxy route for chat sessions (like docs)

Right now, docs have a first-class durable-stream proxy:

- `packages/app/src/routes/api/docs/$docId/stream.ts` (GET/POST/PUT/OPTIONS)
- which uses `proxyToDurableStream()` from `lib/durable-stream-proxy.ts`

Do the same for chat sessions.

### New route

Create:

`packages/app/src/routes/api/ai/sessions/$sessionId/stream.ts`

Responsibilities:

1. `requireAuth()`
2. load `ai_chat_sessions` by `sessionId`
3. enforce `session.userId === auth.user.id`
4. ensure `durableStreamId` is set:
   - if null, set to `getChatStreamId(sessionId)` (already exists in `lib/ai/session.ts`)
   - persist via drizzle update (or via TanStack DB mutation if you prefer consistency)

5. call `proxyToDurableStream({ request, streamId })`

This gives you:

- same-origin endpoints the browser/worker can connect to
- a single place to add auth later (even if it’s relaxed for demo today)

---

## 4) Server “run” endpoint: write TanStack AI stream into Durable State

### New route (don’t overload existing `/api/ai/chat.ts`)

Create:

`packages/app/src/routes/api/ai/sessions/$sessionId/run.ts`

**Input**

- `{ content: string }`
- optionally include `{ contextOverride?: ..., documentId?, projectId? }` (but you already store these on session rows)

**Output**

- `{ runId, userMessageId, assistantMessageId }`

### Server algorithm

1. `requireAuth()`
2. load session (`ai_chat_sessions`)
3. create (or open) Durable State DB for this session:
   - use `createStreamDB({ streamOptions: { url: `/api/ai/sessions/${sessionId}/stream`, contentType: "application/json" }, state: schema, actions: ... })` ([GitHub][2])
   - `await db.preload()`

4. build history for model:
   - query messages + chunks from the state DB
   - build assistant text by `chunks.sort(seq).map(delta).join("")`
   - convert to TanStack AI `messages` format (simple: user/assistant text turns; optionally inject tool results as plain text context)

5. append **run start** records to Durable State:
   - `runs.insert({status:"running"...})`
   - `messages.insert(user message)`
   - `messages.insert(assistant placeholder status:"streaming")`

6. start TanStack AI streaming:
   - `for await (const chunk of chat({ adapter: ..., messages: historyPlusNewUser, tools, system })) { ... }` ([TanStack][1])

7. for each streamed chunk:
   - if `chunk.type === "content"`:
     - append **chunk insert**: `chunks.insert({ id: `${assistantMsgId}:${seq}`, seq: seq++, delta: chunk.delta, ... })`

   - if `chunk.type === "tool_call"`:
     - append `messages.insert({ role:"tool_call", toolName, toolArgs, toolCallId, status:"pending", parentMessageId: assistantMsgId, ... })`
     - (Phase 1 can just persist it; Phase 3 will actually execute/bridge)

   - if `chunk.type === "tool_result"`:
     - append `messages.insert({ role:"tool_result", toolCallId, toolResult, status:"complete", parentMessageId: assistantMsgId, ... })`

8. on completion:
   - append `messages.update(assistantMsgId, { status:"complete", updatedAt })`
   - append `runs.update(runId, { status:"complete", endedAt })`
   - update session metadata in Postgres/Electric:
     - `messageCount += 1` (or recompute)
     - `lastMessageAt = now`
     - optionally update `title` if null (e.g. first user message)

9. on error:
   - append `messages.insert({ role:"error", content: err.message, status:"complete" })`
   - update assistant message to `status:"error"`
   - update run to `status:"error"`

### Important implementation detail

**DO NOT** persist assistant streaming from the browser anymore.

Right now `useAIChat.ts` parses SSE and calls `persistChunk(...)` repeatedly (client write path). That must be removed. After this change:

- only the **server** writes assistant chunks
- clients only read and render

This is exactly what you want for resumable streaming.

---

## 5) Client UI: replace SSE with Durable State live query + chunk concat

### Replace `useAIChat.ts` streaming path

Current behaviour in `packages/app/src/hooks/useAIChat.ts`:

- sends `fetch('/api/ai/chat')`
- reads SSE
- `setMessages([...])` as chunks arrive
- also persists chunks client-side via `persistChunk(...)`

New behaviour:

- create/open a Durable State DB for the active session
- render by live query, concatenating chunks

**Implementation sketch**

1. Ensure there is always an active session:
   - On mount, if no sessions, create one via `aiChatSessionsCollection.insert({...})`
   - Set `activeSessionId`

2. Create `chatDb` for the active session:
   - `createChatStreamDB(sessionId)` in `lib/ai/state/db.ts` pointing at `/api/ai/sessions/${sessionId}/stream`
   - `await preload()` once per session open

3. Live query:
   - `messages = useLiveQuery(q => q.from({m: chatDb.collections.messages}).orderBy(({m})=>m.createdAt,'asc'))`
   - `chunks = useLiveQuery(q => q.from({c: chatDb.collections.chunks}).orderBy(({c})=>c.seq,'asc'))`

4. Hydrate into UI transcript:
   - group chunks by `messageId`
   - for assistant messages, `content = join(deltas)`
   - for tool_call/tool_result, render dedicated UI blocks (later) or JSON blob

5. Send message:
   - instead of calling `/api/ai/chat` directly, call the SharedWorker (next section), which calls `/run`
   - optimistic UI is optional; you’ll see the user message appear as soon as the run endpoint appends it

### Remove / deprecate current persistence helpers

- `packages/app/src/lib/ai/persistence.ts`
- `packages/app/src/lib/ai/persistence-types.ts`

Replace with new `lib/ai/state/*` helpers.

---

## 6) SharedWorker per chat session (lifecycle + orchestration)

You already have a placeholder worker:

- `packages/app/src/lib/ai/runtime/ai-chat-worker.ts`
- and a singleton client:
- `packages/app/src/lib/ai/runtime/ai-chat-worker-client.ts`

You now want **one worker per session**, not one global.

### Worker naming

SharedWorkers are keyed by `(scriptURL, name)`. Keep a single script, but vary `name`:

- `name = "ai-chat:" + sessionId`
- `new SharedWorker(new URL("./ai-chat-worker.ts", import.meta.url), { name })`

### Worker responsibilities (Phase 1 minimal)

- accepts `init(sessionId)`
- serialises “start run” calls across tabs:
  - if a run is already active, queue the message or reject

- calls `POST /api/ai/sessions/${sessionId}/run`

### Worker idle shutdown

In `ai-chat-worker.ts`:

- track `ports: Set<MessagePort>`
- track `lastActivity = Date.now()`
- on `port.onmessage`, update `lastActivity`
- set `setInterval(() => { if (ports.size===0 && Date.now()-lastActivity > IDLE_MS) close() }, 30_000)`
- also on explicit `disconnect` message, remove port

This meets your “go to sleep” requirement; state is resumed by reading Durable State when the UI comes back.

### Worker client refactor

Replace singleton with per-session cache:

`lib/ai/runtime/ai-chat-worker-client.ts`

- export `getChatWorkerClient(sessionId)` which memoises by sessionId
- methods:
  - `startRun({ content })`
  - (later) `approveToolCall({ toolCallId })`, `submitToolResult(...)`

### UI integration

In `useAIChat.ts`:

- when `activeSessionId` changes, get worker client for that session
- `sendMessage()` calls `workerClient.startRun({ content })`

---

## 7) Tool-calls + approvals (Durable State as the transport)

You _can_ make this fully “Durable State only” and still “use TanStack AI as much as possible”.

### Phase 2: Persist tool calls/results in Durable State (no execution yet)

From the server run loop:

- persist `tool_call` chunk as a `messages.insert(role:"tool_call"... status:"pending")`
- persist `tool_result` as `messages.insert(role:"tool_result"... status:"complete")`

Update `ToolApprovalPanel` wiring:

- instead of `requests` coming from in-memory `useAIChat` state, derive from:
  - `messages.where(role==="tool_call" && status==="pending" && requiresApproval===true)` (add field if needed)

### Phase 3: Local tool execution bridge (the “real” architecture)

This is the key bit if you want the worker to do CAD operations.

**Pattern**

- Server runs `chat()` with tools.
- For “local tools”, the server tool implementation is a _bridge_:
  1. write tool_call message to Durable State
  2. wait for tool_result message to appear
  3. return that result back into the `chat()` stream

That keeps tool execution inside TanStack AI’s tool architecture while using your Durable State stream as transport.

**What to implement**

1. Mark tools as `execution: "server" | "local"` in your tool registry.
2. For local tools on the server:
   - `toolDefinition.server(async (args) => await waitForLocalToolResult(...))`

3. In SharedWorker:
   - observe Durable State for new `tool_call` messages where `execution==="local"` and `status==="pending"`
   - request approval via `postMessage` to UI ports (or auto-approve via sent preferences)
   - execute local tool (CAD model ops; later)
   - append `tool_result` message to Durable State
   - update the tool_call message to `status:"complete"`

**Waiting for a tool result (server)**
Use a Durable State DB on the server:

- preload once (or at least from “now”)
- poll/live listen for the tool_result record by `toolCallId`

Do it initially with a simple poll + timeout (pragmatic), then improve to an event-driven subscription once you confirm TanStack DB collection subscription APIs.

---

## 8) Answering your “TanStack AI transport” question in implementable terms

TanStack AI _does_ have a pluggable client transport: **Connection Adapters** ([TanStack][3]). It’s designed so you can swap the streaming protocol (SSE / HTTP streaming / custom) without rewriting the chat UI.

Your Durable State approach is essentially a **new Connection Adapter**:

- `send(messages)` → calls `/run` (non-streaming HTTP request)
- `connect(runId)` → tails Durable State and yields `StreamChunk`s as they appear

You _don’t have to ship this adapter in Phase 1_, but you should shape your Durable State records so it’s easy later:

- store `runId` on messages/chunks
- store tool_call fields (`toolCallId`, `toolName`, `toolArgs`) in a lossless way
- store content as deltas in `chunks`

Then you can publish a generic `durableStateAdapter()` that:

- reads state (messages + chunks)
- re-emits them as TanStack AI `StreamChunk`s

This is the cleanest “eventually pull out as a library” path, and it keeps you maximally aligned with TanStack AI’s intended extension point.

---

## 9) Concrete step-by-step checklist for the coding agent

### Phase A — Durable State transcript (no worker tools yet)

1. **Add `@durable-streams/state`** to `packages/app`.
2. Implement `lib/ai/state/schema.ts` with `messages/chunks/runs`.
3. Implement `lib/ai/state/db.ts`:
   - `createChatStreamDB(sessionId)` pointing to `/api/ai/sessions/${sessionId}/stream`

4. Add `/api/ai/sessions/$sessionId/stream.ts` proxy route (auth + `durable_stream_id` ensure).
5. Add `/api/ai/sessions/$sessionId/run.ts`:
   - preload history
   - append user msg + assistant placeholder + run record
   - iterate `for await (const chunk of chat(...))` and write chunk inserts
   - update assistant status + run status on finish

6. Refactor `useAIChat.ts`:
   - remove SSE parsing
   - create StreamDB + live query messages/chunks
   - hydrate transcript via chunk concat
   - send via worker client (or direct run endpoint at first)

7. Delete/retire:
   - `lib/ai/persistence.ts`
   - `lib/ai/persistence-types.ts`
   - any calls to `persistChunk()` and `loadChatHistory()` in the UI path

**DoD**

- Refresh the tab mid-stream: transcript resumes from Durable State.
- Open second tab: it shows the same transcript (resumable, no SSE dependence).

### Phase B — SharedWorker per session (orchestration + idle shutdown)

8. Refactor worker client: per-session cache, name includes sessionId.
9. Implement worker idle shutdown.
10. Route all “send message” actions through the worker to avoid multi-tab double-runs.

**DoD**

- Two tabs, same session: only one run starts even if both click send quickly.
- Close all tabs, reopen: worker recreates and transcript resumes.

### Phase C — Tool-call persistence + approvals

11. Persist tool_call/tool_result into Durable State from server stream.
12. Change `ToolApprovalPanel` to derive pending requests from Durable State.

**DoD**

- Tool calls appear as durable events; approval UI survives refresh.

### Phase D — Local tool execution bridge

13. Implement “local tool bridge” server wrapper: emit tool_call → wait tool_result → return.
14. Worker observes tool_call, asks approval, executes local tool, writes tool_result.

**DoD**

- A “local tool” can be called by the LLM; result returns to the LLM _and_ is visible in the transcript; reconnect works.

[1]: https://tanstack.com/ai/latest/docs/guides/streaming?utm_source=chatgpt.com "Streaming | TanStack AI Docs"
[2]: https://raw.githubusercontent.com/durable-streams/durable-streams/refs/heads/main/packages/state/README.md "raw.githubusercontent.com"
[3]: https://tanstack.com/ai/latest/docs/guides/connection-adapters?utm_source=chatgpt.com "Connection Adapters | TanStack AI Docs"
