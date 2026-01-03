# Refactoring AI Chat to a Durable, Resumable, Multi-Tab Architecture

We're refactoring the AI integration so that **chat streaming, tool calls, and session state are durable and resumable**, and so that the "local" parts of the agent (especially CAD operations) can run **off the main thread** and be **shared across tabs**.

Today, the UI consumes an SSE stream directly and reconstructs assistant output in-memory as it arrives. That works for a single tab, but it has three major drawbacks for where we're heading:

- **Fragile streaming transport**: if the connection drops or the tab reloads mid-response, we lose the in-flight stream unless we bolt on bespoke resume logic.
- **No single shared runtime**: multiple tabs can duplicate work, and we can't safely run CAD-level agent actions in a coordinated way.
- **Tooling doesn't have a durable "event log"**: approvals, tool calls, and tool results aren't first-class durable state, which makes recovery and multi-tab behaviour hard.

This refactor moves us to a "local-first" architecture where the **Durable Stream is the streaming transport** and the **Durable State Protocol is the canonical chat transcript store**.

---

## 0. Target Architecture

### Persistent Truth

| Layer                               | Stores                                      |
| ----------------------------------- | ------------------------------------------- |
| **Postgres/Electric (TanStack DB)** | Session metadata (`ai_chat_sessions` table) |
| **Durable Streams + Durable State** | Chat transcript: messages, chunks, runs     |

**Key insight**: Each Durable Stream corresponds to exactly one chat session. The stream URL encodes the session identity (`/api/ai/sessions/${sessionId}/stream`), so we do **not** store `sessionId` on individual records within the stream.

### Roles

| Component                               | Responsibility                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Server** (`/api/ai/sessions/:id/run`) | Runs `@tanstack/ai` `chat()`, writes transcript events to Durable State (messages + chunks), bridges local tools   |
| **Client UI**                           | Does **not** consume SSE. Uses Durable State live queries to render transcript. Sends input via SharedWorker       |
| **SharedWorker (singleton)**            | Coordinates runs across tabs, enforces "single run at a time per session", hosts local tool execution (CAD kernel) |

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  User clicks "Send"                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SharedWorker                                                       │
│  - Checks: is there already a run in progress for this session?     │
│  - If yes: queue or reject                                          │
│  - If no: POST /api/ai/sessions/${sessionId}/run                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Server /run endpoint                                               │
│  - Preloads StreamDB (catches up with existing transcript)          │
│  - Builds history from messages + chunks                            │
│  - Appends: run record, user message, assistant placeholder         │
│  - Streams chat() and writes chunks as they arrive                  │
│  - On complete: updates assistant message status, run status        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Durable Stream (JSON events, application/json)                     │
│  - Stream ID: ai-chat/${sessionId}                                  │
│  - Event types: message, chunk, run                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Client StreamDB (live queries)                                     │
│  - Observes messages, chunks, runs                                  │
│  - Hydrates assistant content: join chunks by messageId, sort by seq│
│  - UI updates automatically as events arrive                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Dependency + Folder Layout

### Add Dependency

In `packages/app/package.json`:

```json
{
  "dependencies": {
    "@durable-streams/state": "^x.x.x"
  }
}
```

(You already have `@durable-streams/client` and `@durable-streams/server`.)

### New Folder Structure

```
packages/app/src/lib/ai/state/
  schema.ts      # Durable State schema (messages, chunks, runs)
  db.ts          # createChatStreamDB() helper
  hydrate.ts     # Utilities for building transcript from chunks
  types.ts       # Shared types
```

---

## 2. Durable State Schema

Using `createStateSchema` from `@durable-streams/state`. See [README][1] for full API.

**Design principles:**

- **No `sessionId`** on records — the stream itself represents the session
- **Chunks are insert-only** — never update, just append
- **Messages have lifecycle status** — `streaming` → `complete` or `error`
- **Runs track exchange boundaries** — one run = user message + assistant response + tool calls

### Collections

#### `messages`

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

#### `chunks` (insert-only)

| Field       | Type            | Notes                                                        |
| ----------- | --------------- | ------------------------------------------------------------ |
| `id`        | `string`        | `${messageId}:${seq}` — deterministic for idempotent retries |
| `messageId` | `string` (uuid) | Links to assistant message                                   |
| `seq`       | `number`        | Monotonic sequence within message                            |
| `delta`     | `string`        | The text fragment                                            |
| `createdAt` | `string` (ISO)  |                                                              |

#### `runs`

| Field                | Type                                 | Notes                                  |
| -------------------- | ------------------------------------ | -------------------------------------- |
| `id`                 | `string` (uuid)                      | Primary key                            |
| `status`             | `"running" \| "complete" \| "error"` | Run lifecycle                          |
| `userMessageId`      | `string` (uuid)                      | The user message that started this run |
| `assistantMessageId` | `string` (uuid)                      | The assistant message being generated  |
| `startedAt`          | `string` (ISO)                       |                                        |
| `endedAt`            | `string?` (ISO)                      |                                        |
| `error`              | `string?`                            | Error message if status is error       |

### Schema Implementation

```typescript
// lib/ai/state/schema.ts
import { createStateSchema } from "@durable-streams/state";
import { z } from "zod";

const messageSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  role: z.enum(["system", "user", "assistant", "tool_call", "tool_result", "error"]),
  status: z.enum(["streaming", "complete", "pending", "running", "error"]),
  content: z.string().optional(),
  parentMessageId: z.string().uuid().optional(),
  toolName: z.string().optional(),
  toolArgs: z.unknown().optional(),
  toolCallId: z.string().optional(),
  toolResult: z.unknown().optional(),
  requiresApproval: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const chunkSchema = z.object({
  id: z.string(), // ${messageId}:${seq}
  messageId: z.string().uuid(),
  seq: z.number(),
  delta: z.string(),
  createdAt: z.string(),
});

const runSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["running", "complete", "error"]),
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  error: z.string().optional(),
});

export const chatStateSchema = createStateSchema({
  messages: {
    schema: messageSchema,
    type: "message",
    primaryKey: "id",
  },
  chunks: {
    schema: chunkSchema,
    type: "chunk",
    primaryKey: "id",
  },
  runs: {
    schema: runSchema,
    type: "run",
    primaryKey: "id",
  },
});

export type Message = z.infer<typeof messageSchema>;
export type Chunk = z.infer<typeof chunkSchema>;
export type Run = z.infer<typeof runSchema>;
```

---

## 3. Stream Proxy Route

Following the pattern from `/api/docs/$docId/stream.ts`.

### New Route

Create: `packages/app/src/routes/api/ai/sessions/$sessionId/stream.ts`

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../../lib/auth-middleware";
import { proxyToDurableStream } from "../../../../lib/durable-stream-proxy";
import { db } from "../../../../lib/db";
import { aiChatSessions } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { getChatStreamId } from "../../../../lib/ai/session";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Stream-Next-Offset, Stream-Cursor, Stream-Up-To-Date, ETag, Content-Type",
};

export const Route = createFileRoute("/api/ai/sessions/$sessionId/stream")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      },

      GET: async ({ request, params }) => {
        const session = await requireAuth(request);
        const { sessionId } = params;

        // Load session and verify ownership
        const chatSession = await db.query.aiChatSessions.findFirst({
          where: eq(aiChatSessions.id, sessionId),
        });

        if (!chatSession || chatSession.userId !== session.user.id) {
          return new Response("Forbidden", { status: 403 });
        }

        // Ensure durableStreamId is set
        let streamId = chatSession.durableStreamId;
        if (!streamId) {
          streamId = getChatStreamId(sessionId);
          await db
            .update(aiChatSessions)
            .set({ durableStreamId: streamId })
            .where(eq(aiChatSessions.id, sessionId));
        }

        return proxyToDurableStream(request, streamId);
      },

      POST: async ({ request, params }) => {
        const session = await requireAuth(request);
        const { sessionId } = params;

        const chatSession = await db.query.aiChatSessions.findFirst({
          where: eq(aiChatSessions.id, sessionId),
        });

        if (!chatSession || chatSession.userId !== session.user.id) {
          return new Response("Forbidden", { status: 403 });
        }

        let streamId = chatSession.durableStreamId;
        if (!streamId) {
          streamId = getChatStreamId(sessionId);
          await db
            .update(aiChatSessions)
            .set({ durableStreamId: streamId })
            .where(eq(aiChatSessions.id, sessionId));
        }

        return proxyToDurableStream(request, streamId);
      },

      PUT: async ({ request, params }) => {
        const session = await requireAuth(request);
        const { sessionId } = params;

        const chatSession = await db.query.aiChatSessions.findFirst({
          where: eq(aiChatSessions.id, sessionId),
        });

        if (!chatSession || chatSession.userId !== session.user.id) {
          return new Response("Forbidden", { status: 403 });
        }

        let streamId = chatSession.durableStreamId;
        if (!streamId) {
          streamId = getChatStreamId(sessionId);
          await db
            .update(aiChatSessions)
            .set({ durableStreamId: streamId })
            .where(eq(aiChatSessions.id, sessionId));
        }

        return proxyToDurableStream(request, streamId);
      },
    },
  },
});
```

---

## 4. Server "Run" Endpoint

### New Route

Create: `packages/app/src/routes/api/ai/sessions/$sessionId/run.ts`

**Input**: `{ content: string }`

**Output**: `{ runId, userMessageId, assistantMessageId }`

### Server Algorithm

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../../lib/auth-middleware";
import { chat } from "@tanstack/ai";
import { getAdapter } from "../../../../lib/ai/adapter";
import { getDashboardTools } from "../../../../lib/ai/tools/dashboard-impl";
import { buildDashboardSystemPrompt } from "../../../../lib/ai/prompts/dashboard";
import { buildEditorSystemPrompt } from "../../../../lib/ai/prompts/editor";
import { createChatStreamDB } from "../../../../lib/ai/state/db";
import { chatStateSchema } from "../../../../lib/ai/state/schema";
import { hydrateTranscript } from "../../../../lib/ai/state/hydrate";
import { db } from "../../../../lib/db";
import { aiChatSessions } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export const Route = createFileRoute("/api/ai/sessions/$sessionId/run")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const authSession = await requireAuth(request);
        const { sessionId } = params;

        // 1. Load session and verify ownership
        const chatSession = await db.query.aiChatSessions.findFirst({
          where: eq(aiChatSessions.id, sessionId),
        });

        if (!chatSession || chatSession.userId !== authSession.user.id) {
          return new Response("Forbidden", { status: 403 });
        }

        const body = await request.json();
        const { content } = body;

        // 2. Create StreamDB for this session
        const streamDb = await createChatStreamDB(sessionId);
        await streamDb.preload();

        // 3. Check for stale runs and recover
        const now = new Date();
        for (const run of streamDb.collections.runs.values()) {
          if (run.status === "running") {
            const startedAt = new Date(run.startedAt);
            if (now.getTime() - startedAt.getTime() > STALE_RUN_THRESHOLD_MS) {
              // Mark stale run as error
              await streamDb.stream.append(
                chatStateSchema.runs.update({
                  value: { ...run, status: "error", error: "Timeout", endedAt: now.toISOString() },
                  oldValue: run,
                })
              );
              // Also mark the assistant message as error
              const assistantMsg = streamDb.collections.messages.get(run.assistantMessageId);
              if (assistantMsg && assistantMsg.status === "streaming") {
                await streamDb.stream.append(
                  chatStateSchema.messages.update({
                    value: { ...assistantMsg, status: "error", updatedAt: now.toISOString() },
                    oldValue: assistantMsg,
                  })
                );
              }
            }
          }
        }

        // 4. Check if there's already an active run
        const activeRun = Array.from(streamDb.collections.runs.values()).find(
          (r) => r.status === "running"
        );
        if (activeRun) {
          streamDb.close();
          return new Response(
            JSON.stringify({ error: "Run already in progress", runId: activeRun.id }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }

        // 5. Build history for model
        const transcript = hydrateTranscript(streamDb);
        const modelMessages = transcript.map((m) => ({
          role: m.role === "tool_result" ? "tool" : m.role,
          content: m.content || "",
        }));

        // 6. Generate IDs
        const runId = uuid();
        const userMessageId = uuid();
        const assistantMessageId = uuid();
        const timestamp = now.toISOString();

        // 7. Append run + user message + assistant placeholder
        await streamDb.stream.append(
          chatStateSchema.runs.insert({
            value: {
              id: runId,
              status: "running",
              userMessageId,
              assistantMessageId,
              startedAt: timestamp,
            },
          })
        );

        await streamDb.stream.append(
          chatStateSchema.messages.insert({
            value: {
              id: userMessageId,
              runId,
              role: "user",
              status: "complete",
              content,
              createdAt: timestamp,
            },
          })
        );

        await streamDb.stream.append(
          chatStateSchema.messages.insert({
            value: {
              id: assistantMessageId,
              runId,
              role: "assistant",
              status: "streaming",
              createdAt: timestamp,
            },
          })
        );

        // 8. Get tools and system prompt
        let tools;
        let systemPrompt: string;

        if (chatSession.context === "dashboard") {
          tools = await getDashboardTools(authSession.user.id);
          systemPrompt = buildDashboardSystemPrompt(authSession.user.id, chatSession.projectId);
        } else {
          tools = [];
          systemPrompt = await buildEditorSystemPrompt(chatSession.documentId);
        }

        // 9. Start streaming
        let seq = 0;

        try {
          const stream = await chat({
            adapter: getAdapter(),
            messages: [...modelMessages, { role: "user", content }],
            tools,
            system: systemPrompt,
            onToolCall: async (toolCall) => {
              const toolCallId = toolCall.id;
              await streamDb.stream.append(
                chatStateSchema.messages.insert({
                  value: {
                    id: uuid(),
                    runId,
                    role: "tool_call",
                    status: "pending",
                    parentMessageId: assistantMessageId,
                    toolName: toolCall.name,
                    toolArgs: toolCall.arguments,
                    toolCallId,
                    requiresApproval: false, // TODO: check approval preferences
                    createdAt: new Date().toISOString(),
                  },
                })
              );
            },
            onToolResult: async (toolResult) => {
              await streamDb.stream.append(
                chatStateSchema.messages.insert({
                  value: {
                    id: uuid(),
                    runId,
                    role: "tool_result",
                    status: "complete",
                    parentMessageId: assistantMessageId,
                    toolCallId: toolResult.toolCallId,
                    toolResult: toolResult.result,
                    createdAt: new Date().toISOString(),
                  },
                })
              );
            },
          });

          for await (const chunk of stream) {
            if (chunk.type === "content" && chunk.delta) {
              await streamDb.stream.append(
                chatStateSchema.chunks.insert({
                  value: {
                    id: `${assistantMessageId}:${seq}`,
                    messageId: assistantMessageId,
                    seq: seq++,
                    delta: chunk.delta,
                    createdAt: new Date().toISOString(),
                  },
                })
              );
            }
          }

          // 10. Mark complete
          const endTime = new Date().toISOString();

          await streamDb.stream.append(
            chatStateSchema.messages.update({
              value: {
                id: assistantMessageId,
                runId,
                role: "assistant",
                status: "complete",
                createdAt: timestamp,
                updatedAt: endTime,
              },
            })
          );

          await streamDb.stream.append(
            chatStateSchema.runs.update({
              value: {
                id: runId,
                status: "complete",
                userMessageId,
                assistantMessageId,
                startedAt: timestamp,
                endedAt: endTime,
              },
            })
          );

          // 11. Update session metadata in Postgres
          await db
            .update(aiChatSessions)
            .set({
              messageCount: chatSession.messageCount + 2,
              lastMessageAt: endTime,
              updatedAt: endTime,
              // Auto-generate title from first message
              ...(chatSession.messageCount === 0
                ? { title: content.slice(0, 50) + (content.length > 50 ? "..." : "") }
                : {}),
            })
            .where(eq(aiChatSessions.id, sessionId));

          streamDb.close();

          return new Response(JSON.stringify({ runId, userMessageId, assistantMessageId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          // 12. Handle error
          const endTime = new Date().toISOString();

          await streamDb.stream.append(
            chatStateSchema.messages.insert({
              value: {
                id: uuid(),
                runId,
                role: "error",
                status: "complete",
                content: error instanceof Error ? error.message : String(error),
                createdAt: endTime,
              },
            })
          );

          await streamDb.stream.append(
            chatStateSchema.messages.update({
              value: {
                id: assistantMessageId,
                runId,
                role: "assistant",
                status: "error",
                createdAt: timestamp,
                updatedAt: endTime,
              },
            })
          );

          await streamDb.stream.append(
            chatStateSchema.runs.update({
              value: {
                id: runId,
                status: "error",
                userMessageId,
                assistantMessageId,
                startedAt: timestamp,
                endedAt: endTime,
                error: error instanceof Error ? error.message : String(error),
              },
            })
          );

          streamDb.close();

          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
```

### StreamDB Helper

```typescript
// lib/ai/state/db.ts
import { createStreamDB } from "@durable-streams/state";
import { chatStateSchema } from "./schema";

const getApiBase = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
};

export function createChatStreamDB(sessionId: string) {
  return createStreamDB({
    streamOptions: {
      url: `${getApiBase()}/api/ai/sessions/${sessionId}/stream`,
      contentType: "application/json",
    },
    state: chatStateSchema,
  });
}
```

### Hydration Helper

```typescript
// lib/ai/state/hydrate.ts
import type { StreamDB } from "@durable-streams/state";
import type { Message, Chunk } from "./schema";

interface HydratedMessage {
  id: string;
  runId: string;
  role: Message["role"];
  status: Message["status"];
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolCallId?: string;
  toolResult?: unknown;
  createdAt: string;
}

export function hydrateTranscript(db: StreamDB): HydratedMessage[] {
  const messages = Array.from(db.collections.messages.values());
  const chunks = Array.from(db.collections.chunks.values());

  // Group chunks by messageId
  const chunksByMessage = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const existing = chunksByMessage.get(chunk.messageId) || [];
    existing.push(chunk);
    chunksByMessage.set(chunk.messageId, existing);
  }

  // Hydrate messages
  const hydrated: HydratedMessage[] = messages
    .filter((m) => m.role !== "error") // Exclude error pseudo-messages from history
    .map((m) => {
      let content = m.content || "";

      // For assistant messages, concatenate chunks
      if (m.role === "assistant") {
        const messageChunks = chunksByMessage.get(m.id) || [];
        messageChunks.sort((a, b) => a.seq - b.seq);
        content = messageChunks.map((c) => c.delta).join("");
      }

      return {
        id: m.id,
        runId: m.runId,
        role: m.role,
        status: m.status,
        content,
        toolName: m.toolName,
        toolArgs: m.toolArgs,
        toolCallId: m.toolCallId,
        toolResult: m.toolResult,
        createdAt: m.createdAt,
      };
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return hydrated;
}
```

---

## 5. Client UI: Live Queries from Durable State

### Replace `useAIChat.ts` Streaming Path

**Current behaviour:**

- Sends `fetch('/api/ai/chat')`
- Reads SSE
- `setMessages([...])` as chunks arrive
- Persists chunks client-side via `persistChunk()`

**New behaviour:**

- Creates StreamDB for active session
- Renders via live queries (messages + chunks)
- Sends messages via SharedWorker

### Implementation

```typescript
// hooks/useAIChat.ts (revised core logic)

import { useState, useCallback, useEffect, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { eq } from "@tanstack/db";
import { createChatStreamDB } from "../lib/ai/state/db";
import { hydrateTranscript } from "../lib/ai/state/hydrate";
import { getAIChatWorkerClient } from "../lib/ai/runtime/ai-chat-worker-client";
import { aiChatSessionsCollection } from "../lib/electric-collections";

export function useAIChat(options: UseAIChatOptions) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streamDb, setStreamDb] = useState<StreamDB | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // ... session management code (unchanged) ...

  // Create StreamDB when session changes
  useEffect(() => {
    if (!activeSessionId) {
      setStreamDb(null);
      return;
    }

    let db: StreamDB | null = null;
    let cancelled = false;

    (async () => {
      db = await createChatStreamDB(activeSessionId);
      await db.preload();
      if (!cancelled) {
        setStreamDb(db);
      }
    })();

    return () => {
      cancelled = true;
      db?.close();
    };
  }, [activeSessionId]);

  // Live query messages
  const messagesQuery = useLiveQuery(
    () =>
      streamDb ? streamDb.collections.messages.query().orderBy((m) => m.createdAt, "asc") : null,
    [streamDb]
  );

  // Live query chunks
  const chunksQuery = useLiveQuery(
    () => (streamDb ? streamDb.collections.chunks.query().orderBy((c) => c.seq, "asc") : null),
    [streamDb]
  );

  // Live query active run
  const activeRunQuery = useLiveQuery(
    () =>
      streamDb
        ? streamDb.collections.runs
            .query()
            .where((r) => eq(r.status, "running"))
            .findOne()
        : null,
    [streamDb]
  );

  // Hydrate transcript
  const transcript = useMemo(() => {
    if (!messagesQuery.data || !chunksQuery.data) return [];

    const messages = messagesQuery.data;
    const chunks = chunksQuery.data;

    // Group chunks by messageId
    const chunksByMessage = new Map<string, Chunk[]>();
    for (const chunk of chunks) {
      const existing = chunksByMessage.get(chunk.messageId) || [];
      existing.push(chunk);
      chunksByMessage.set(chunk.messageId, existing);
    }

    return messages
      .filter((m) => m.role !== "error")
      .map((m) => {
        let content = m.content || "";
        if (m.role === "assistant") {
          const messageChunks = chunksByMessage.get(m.id) || [];
          messageChunks.sort((a, b) => a.seq - b.seq);
          content = messageChunks.map((c) => c.delta).join("");
        }
        return { ...m, content };
      });
  }, [messagesQuery.data, chunksQuery.data]);

  const isStreaming = activeRunQuery.data !== undefined;

  // Send message via worker
  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeSessionId) {
        const session = await ensureSession();
        setActiveSessionId(session.id);
      }

      const workerClient = getAIChatWorkerClient();
      await workerClient.connect();

      try {
        await workerClient.startRun(activeSessionId!, content);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [activeSessionId, ensureSession]
  );

  // Derive pending tool approvals from messages
  const pendingToolApprovals = useMemo(() => {
    if (!messagesQuery.data) return [];
    return messagesQuery.data.filter(
      (m) => m.role === "tool_call" && m.status === "pending" && m.requiresApproval
    );
  }, [messagesQuery.data]);

  return {
    messages: transcript,
    isLoading: isStreaming,
    error,
    pendingToolApprovals,
    sendMessage,
    // ... other returns unchanged ...
  };
}
```

### Files to Delete

- `lib/ai/persistence.ts`
- `lib/ai/persistence-types.ts`

Remove all calls to `persistChunk()` and `loadChatHistory()` from UI code.

---

## 6. SharedWorker (Singleton with Run Coordination)

Keep the existing singleton pattern, but add run coordination.

### Worker Types

```typescript
// lib/ai/runtime/types.ts (additions)

export interface AIChatWorkerCommand {
  type:
    | "init-session"
    | "terminate-session"
    | "start-run"
    | "run-complete"
    | "execute-local-tool"
    | "ping";
  sessionId?: string;
  documentId?: string;
  projectId?: string;
  content?: string;
  toolName?: string;
  args?: Record<string, unknown>;
}

export interface AIChatWorkerEvent {
  type:
    | "session-ready"
    | "kernel-initialized"
    | "run-started"
    | "run-complete"
    | "run-rejected"
    | "run-error"
    | "tool-result"
    | "error"
    | "pong";
  sessionId?: string;
  runId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  reason?: string;
  error?: string;
  toolName?: string;
  result?: unknown;
  message?: string;
}
```

### Worker Implementation

```typescript
// lib/ai/runtime/ai-chat-worker.ts (revised)

/// <reference lib="webworker" />

import { SolidSession, setOC } from "@solidtype/core";
import { initOCCTBrowser } from "../../../editor/worker/occt-init";
import type { AIChatWorkerCommand, AIChatWorkerEvent } from "./types";

declare const self: SharedWorkerGlobalScope | DedicatedWorkerGlobalScope;

interface SessionState {
  sessionId: string;
  documentId?: string;
  projectId?: string;
  kernelInitialized: boolean;
  activeRunId: string | null;
}

const sessions = new Map<string, SessionState>();
const ports = new Set<MessagePort>();

let kernelSession: SolidSession | null = null;
let kernelInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Idle shutdown
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
let lastActivity = Date.now();

setInterval(() => {
  if (ports.size === 0 && Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    console.log("[AI Chat Worker] Idle timeout, shutting down");
    if (kernelSession) {
      kernelSession.dispose();
    }
    self.close();
  }
}, 30_000);

function broadcast(event: AIChatWorkerEvent) {
  for (const port of ports) {
    try {
      port.postMessage(event);
    } catch (e) {
      console.error("[AI Chat Worker] Error posting to port:", e);
    }
  }
}

async function ensureKernelInitialized(): Promise<void> {
  if (kernelInitialized && kernelSession) return;
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    console.log("[AI Chat Worker] Initializing CAD kernel...");
    const oc = await initOCCTBrowser();
    setOC(oc);
    kernelSession = new SolidSession();
    await kernelSession.init();
    kernelInitialized = true;
    console.log("[AI Chat Worker] CAD kernel initialized");
  })();

  await initializationPromise;
}

async function handleCommand(command: AIChatWorkerCommand) {
  lastActivity = Date.now();

  try {
    switch (command.type) {
      case "init-session": {
        const { sessionId, documentId, projectId } = command;
        sessions.set(sessionId!, {
          sessionId: sessionId!,
          documentId,
          projectId,
          kernelInitialized: false,
          activeRunId: null,
        });

        if (documentId) {
          await ensureKernelInitialized();
          const session = sessions.get(sessionId!);
          if (session) session.kernelInitialized = true;
          broadcast({ type: "kernel-initialized", sessionId });
        }

        broadcast({ type: "session-ready", sessionId });
        break;
      }

      case "start-run": {
        const { sessionId, content } = command;
        const session = sessions.get(sessionId!);

        if (!session) {
          broadcast({ type: "run-rejected", sessionId, reason: "session-not-initialized" });
          return;
        }

        if (session.activeRunId) {
          broadcast({ type: "run-rejected", sessionId, reason: "already-running" });
          return;
        }

        // Call server /run endpoint
        try {
          const response = await fetch(`/api/ai/sessions/${sessionId}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });

          if (response.status === 409) {
            // Run already in progress (detected server-side)
            const data = await response.json();
            session.activeRunId = data.runId;
            broadcast({ type: "run-rejected", sessionId, reason: "already-running" });
            return;
          }

          if (!response.ok) {
            const errorText = await response.text();
            broadcast({ type: "run-error", sessionId, error: errorText });
            return;
          }

          const { runId, userMessageId, assistantMessageId } = await response.json();
          session.activeRunId = runId;
          broadcast({ type: "run-started", sessionId, runId, userMessageId, assistantMessageId });

          // Run completion is detected by observing Durable State
          // The UI will call run-complete when it sees the run status change
        } catch (err) {
          broadcast({
            type: "run-error",
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "run-complete": {
        const { sessionId } = command;
        const session = sessions.get(sessionId!);
        if (session) {
          session.activeRunId = null;
        }
        broadcast({ type: "run-complete", sessionId });
        break;
      }

      case "terminate-session": {
        const { sessionId } = command;
        sessions.delete(sessionId!);

        if (sessions.size === 0 && kernelSession) {
          kernelSession.dispose();
          kernelSession = null;
          kernelInitialized = false;
          initializationPromise = null;
        }
        break;
      }

      case "execute-local-tool": {
        if (!kernelInitialized || !kernelSession) {
          await ensureKernelInitialized();
        }
        // TODO: Implement tool execution (Phase D)
        broadcast({
          type: "tool-result",
          toolName: command.toolName,
          result: { message: "Local tool execution not yet implemented" },
        });
        break;
      }

      case "ping": {
        broadcast({ type: "pong" });
        break;
      }
    }
  } catch (error) {
    console.error("[AI Chat Worker] Error handling command:", error);
    broadcast({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      sessionId: command.sessionId,
    });
  }
}

// SharedWorker connection handler
if (typeof self !== "undefined" && "onconnect" in self) {
  (self as SharedWorkerGlobalScope).onconnect = (e: MessageEvent) => {
    const port = e.ports[0];
    ports.add(port);

    port.onmessage = (msg: MessageEvent<AIChatWorkerCommand>) => {
      handleCommand(msg.data);
    };

    port.onmessageerror = () => {
      ports.delete(port);
    };

    port.start();

    // Send current state to new connection
    for (const session of sessions.values()) {
      port.postMessage({ type: "session-ready", sessionId: session.sessionId });
      if (session.kernelInitialized) {
        port.postMessage({ type: "kernel-initialized", sessionId: session.sessionId });
      }
    }
  };
} else {
  // Regular Worker fallback
  (self as DedicatedWorkerGlobalScope).onmessage = (msg: MessageEvent<AIChatWorkerCommand>) => {
    handleCommand(msg.data);
  };
}

console.log("[AI Chat Worker] Worker initialized");
```

### Worker Client Addition

```typescript
// lib/ai/runtime/ai-chat-worker-client.ts (add method)

async startRun(sessionId: string, content: string): Promise<void> {
  await this.connect();
  this.sendCommand({ type: "start-run", sessionId, content });

  // Wait for response
  return new Promise((resolve, reject) => {
    const handler = (event: AIChatWorkerEvent) => {
      if (event.sessionId !== sessionId) return;

      if (event.type === "run-started") {
        this.eventHandlers.delete(handler);
        resolve();
      } else if (event.type === "run-rejected" || event.type === "run-error") {
        this.eventHandlers.delete(handler);
        reject(new Error(event.reason || event.error || "Run failed"));
      }
    };
    this.eventHandlers.add(handler);

    // Timeout
    setTimeout(() => {
      this.eventHandlers.delete(handler);
      reject(new Error("Start run timeout"));
    }, 30000);
  });
}

notifyRunComplete(sessionId: string): void {
  if (!this.connected) return;
  this.sendCommand({ type: "run-complete", sessionId });
}
```

---

## 7. Tool Approvals from Durable State

### Phase C: Persist Tool Calls with Approval Status

Tool calls are already persisted as messages with `role: "tool_call"` and `status: "pending"`.

To approve a tool call:

1. **UI** calls worker: `workerClient.approveToolCall(sessionId, toolCallId)`
2. **Worker** updates the message status in Durable State
3. **Worker** (or server) executes the tool
4. **Worker** writes `tool_result` message

### Phase D: Local Tool Execution Bridge

For "local" tools (CAD operations), the server's tool implementation becomes a bridge:

1. Server writes `tool_call` message with `status: "pending"`
2. Server waits for `tool_result` message to appear (poll or subscribe)
3. Worker observes the pending tool_call
4. Worker requests approval (or auto-approves)
5. Worker executes the tool locally
6. Worker writes `tool_result` message
7. Server receives result and continues

This keeps tool execution within TanStack AI's tool architecture while using Durable State as transport.

---

## 8. Migration Notes

### Breaking Change: Binary → JSON Encoding

**Existing streams use lib0 binary encoding** (via `lib0/encoding`). The new Durable State layer uses **JSON** with `Content-Type: application/json`.

**Impact**: Existing chat sessions will not be readable by the new system.

**Recommendation**: Treat this as a clean break. New sessions use the new format; old sessions can be archived or migrated separately if needed.

### Deprecation Checklist

After this refactor is complete, delete:

- `lib/ai/persistence.ts`
- `lib/ai/persistence-types.ts`
- All calls to `persistChunk()`
- All calls to `loadChatHistory()`
- The old `/api/ai/chat.ts` route (replace with `/api/ai/sessions/$sessionId/run.ts`)

---

## 9. Implementation Checklist

### Phase A — Durable State Transcript

1. [ ] Add `@durable-streams/state` to `packages/app`
2. [ ] Create `lib/ai/state/schema.ts` with messages, chunks, runs
3. [ ] Create `lib/ai/state/db.ts` with `createChatStreamDB()`
4. [ ] Create `lib/ai/state/hydrate.ts` with `hydrateTranscript()`
5. [ ] Create `/api/ai/sessions/$sessionId/stream.ts` proxy route
6. [ ] Create `/api/ai/sessions/$sessionId/run.ts` endpoint
7. [ ] Refactor `useAIChat.ts`:
   - Remove SSE parsing
   - Create StreamDB for active session
   - Live query messages/chunks/runs
   - Hydrate transcript via chunk concatenation
   - Send via worker `start-run`
8. [ ] Delete `lib/ai/persistence.ts` and `lib/ai/persistence-types.ts`
9. [ ] Delete or deprecate `/api/ai/chat.ts`

**Definition of Done (Phase A):**

- Refresh tab mid-stream: transcript resumes from Durable State
- Open second tab: shows same transcript (no SSE dependence)
- Connection drop: reconnects and catches up automatically

### Phase B — SharedWorker Run Coordination

10. [ ] Add run coordination to singleton worker
11. [ ] Add idle shutdown (3 minute timeout)
12. [ ] Add `startRun()` and `notifyRunComplete()` to worker client
13. [ ] UI notifies worker when run completes (observed via live query)

**Definition of Done (Phase B):**

- Two tabs, same session: only one run starts
- Close all tabs, reopen: worker recreates, transcript resumes
- Worker shuts down after 3 minutes of inactivity

### Phase C — Tool Call Persistence + Approvals

14. [ ] Persist tool_call/tool_result in Durable State (already done in Phase A)
15. [ ] Derive `pendingToolApprovals` from live query
16. [ ] Refactor `ToolApprovalPanel` to use Durable State
17. [ ] Add approval/rejection flow via worker

**Definition of Done (Phase C):**

- Tool calls appear as durable events
- Approval UI survives page refresh
- Multi-tab: approval in one tab reflects in others

### Phase D — Local Tool Execution Bridge

18. [ ] Mark tools as `execution: "server" | "local"` in registry
19. [ ] Implement server-side bridge: emit tool_call → wait tool_result → return
20. [ ] Worker observes pending tool_calls, requests approval, executes locally
21. [ ] Worker writes tool_result to Durable State

**Definition of Done (Phase D):**

- Local tool called by LLM
- Result returns to LLM and visible in transcript
- Works across tab refresh and reconnect

---

## 10. Future: TanStack AI Connection Adapter

The Durable State schema is designed to be compatible with a future TanStack AI Connection Adapter:

- `runs` collection maps to TanStack AI's "run" concept
- `chunks` with `seq` ordering can be replayed as `StreamChunk`s
- Tool call/result messages preserve all required fields

A generic `durableStateConnectionAdapter()` could:

- `send(messages)` → POST `/run`
- `connect(runId)` → tail Durable State, yield `StreamChunk`s

This is the cleanest "eventually pull out as a library" path.

---

## References

[1]: https://raw.githubusercontent.com/durable-streams/durable-streams/refs/heads/main/packages/state/README.md "@durable-streams/state README"
[2]: https://tanstack.com/ai/latest/docs/guides/streaming "TanStack AI Streaming"
[3]: https://tanstack.com/ai/latest/docs/guides/connection-adapters "TanStack AI Connection Adapters"
