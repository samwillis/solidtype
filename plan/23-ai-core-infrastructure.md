# Phase 23: AI Core Infrastructure

> **Status:** ✅ **COMPLETE**
>
> This phase has been implemented using the Durable Streams architecture. See [AI-INTEGRATION.md](/AI-INTEGRATION.md) for the design documentation.
>
> **Key changes from original plan:**
>
> - Uses Durable Streams + Durable State for chat persistence (not direct SSE)
> - SharedWorker coordinates runs across tabs
> - Tool approvals integrated into Durable State schema

## Prerequisites

- Phase 27: User System & Persistence (auth, workspaces, projects)
- Durable Streams infrastructure (already in place for Yjs sync)

## Goals

- Set up TanStack AI packages and adapter configuration
- Implement chat session management (PostgreSQL metadata + Durable Stream content)
- Create the server API route for AI chat
- Build the shared React hooks and UI components
- Establish the tool definition patterns
- Implement Agent Runtime abstraction for background execution
  - SharedWorker with Worker fallback for browser
  - Modeling kernel (OCCT) runs in worker thread
  - Agents appear in presence/awareness system
  - Generic interface for future remote execution (edge, Durable Objects)

---

## 1. Package Setup

```bash
pnpm add @tanstack/ai @tanstack/ai-client @tanstack/ai-react @tanstack/ai-anthropic
```

---

## 2. AI Adapter Configuration

```typescript
// packages/app/src/lib/ai/adapter.ts
import { anthropicText } from "@tanstack/ai-anthropic";

// Primary adapter
export const aiAdapter = anthropicText("claude-sonnet-4-20250514");

// Model options for future expansion
export type AIModel = "claude-sonnet" | "claude-opus" | "gpt-4o";

export function getAdapter(model: AIModel = "claude-sonnet") {
  switch (model) {
    case "claude-sonnet":
      return anthropicText("claude-sonnet-4-20250514");
    case "claude-opus":
      return anthropicText("claude-opus-4-20250514");
    // case "gpt-4o":
    //   return openaiText("gpt-4o");
    default:
      return anthropicText("claude-sonnet-4-20250514");
  }
}
```

---

## 3. Chat Session Management

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chat Session Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PostgreSQL (ai_chat_sessions table)                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Session metadata (id, userId, context, status)        │   │
│  │ • References (documentId, projectId)                    │   │
│  │ • Timestamps (createdAt, updatedAt)                     │   │
│  │ • Display info (title, messageCount)                    │   │
│  │ → Used for: listing sessions, querying, UI display      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              │ sessionId                        │
│                              ▼                                  │
│  Durable Streams (ai-chat/{sessionId})                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Actual message content (streaming chunks)             │   │
│  │ • Tool calls and results                                │   │
│  │ • Full conversation history                             │   │
│  │ → Used for: streaming, resumption, message replay       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema

```typescript
// packages/app/src/db/schema/ai-chat-sessions.ts
import { pgTable, uuid, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./better-auth";
import { documents } from "./documents";
import { projects } from "./projects";

export const aiChatContextEnum = pgEnum("ai_chat_context", ["dashboard", "editor"]);

export const aiChatStatusEnum = pgEnum("ai_chat_status", [
  "active", // Currently in use
  "archived", // User closed/archived
  "error", // Session ended with error
]);

export const aiChatSessions = pgTable(
  "ai_chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Owner
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Context type
    context: aiChatContextEnum("context").notNull(),

    // Optional references (depending on context)
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),

    // Status
    status: aiChatStatusEnum("status").notNull().default("active"),

    // Display metadata (denormalized for quick listing)
    title: text("title").default("New Chat"),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at"),

    // Durable Stream reference
    // Format: "ai-chat/{sessionId}"
    durableStreamId: text("durable_stream_id"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_chat_sessions_user").on(table.userId),
    index("idx_ai_chat_sessions_user_context").on(table.userId, table.context),
    index("idx_ai_chat_sessions_document").on(table.documentId),
    index("idx_ai_chat_sessions_project").on(table.projectId),
  ]
);

export const aiChatSessionsRelations = relations(aiChatSessions, ({ one }) => ({
  user: one(user, {
    fields: [aiChatSessions.userId],
    references: [user.id],
  }),
  document: one(documents, {
    fields: [aiChatSessions.documentId],
    references: [documents.id],
  }),
  project: one(projects, {
    fields: [aiChatSessions.projectId],
    references: [projects.id],
  }),
}));

// Types
export type AIChatSession = typeof aiChatSessions.$inferSelect;
export type NewAIChatSession = typeof aiChatSessions.$inferInsert;
export type AIChatContext = "dashboard" | "editor";
export type AIChatStatus = "active" | "archived" | "error";
```

### Update schema/index.ts

```typescript
// Add to packages/app/src/db/schema/index.ts
export {
  aiChatSessions,
  aiChatSessionsRelations,
  aiChatContextEnum,
  aiChatStatusEnum,
} from "./ai-chat-sessions";
export type {
  AIChatSession,
  NewAIChatSession,
  AIChatContext,
  AIChatStatus,
} from "./ai-chat-sessions";
```

### Session Helper Types

```typescript
// packages/app/src/lib/ai/session.ts
import { z } from "zod";

// Zod schemas for runtime validation
export const ChatSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  context: z.enum(["dashboard", "editor"]),
  documentId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  status: z.enum(["active", "archived", "error"]),
  title: z.string().nullable(),
  messageCount: z.number(),
  lastMessageAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ChatSession = z.infer<typeof ChatSessionSchema>;

// Message schema (stored in Durable Stream, not PostgreSQL)
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.record(z.unknown()),
      })
    )
    .optional(),
  toolResults: z
    .array(
      z.object({
        toolCallId: z.string(),
        result: z.unknown(),
      })
    )
    .optional(),
  timestamp: z.string().datetime(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// Stream ID format for Durable Streams
export function getChatStreamId(sessionId: string): string {
  return `ai-chat/${sessionId}`;
}
```

### Session Server Functions

**Important:** All session functions derive `userId` from server-side auth context, never from client input. This prevents users from accessing other users' sessions.

```typescript
// packages/app/src/lib/ai/session-functions.ts
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { auth } from "../../lib/auth"; // better-auth instance
import { db } from "../db";
import { aiChatSessions } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Helper to get authenticated user ID from request.
 * Throws if not authenticated.
 */
async function getAuthUserId(): Promise<string> {
  const request = getWebRequest();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    throw new Error("Unauthorized: No authenticated session");
  }

  return session.user.id;
}

// List user's chat sessions (userId derived from auth, not input)
export const listChatSessions = createServerFn({ method: "GET" })
  .inputValidator((d: { context?: "dashboard" | "editor"; limit?: number }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const conditions = [eq(aiChatSessions.userId, userId)];
    if (data.context) {
      conditions.push(eq(aiChatSessions.context, data.context));
    }

    const sessions = await db.query.aiChatSessions.findMany({
      where: and(...conditions),
      orderBy: desc(aiChatSessions.updatedAt),
      limit: data.limit || 50,
    });

    return sessions;
  });

// Create a new chat session (userId derived from auth)
export const createChatSession = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      context: "dashboard" | "editor";
      documentId?: string;
      projectId?: string;
      title?: string;
    }) => d
  )
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();
    const sessionId = crypto.randomUUID();
    const durableStreamId = `ai-chat/${sessionId}`;

    const [session] = await db
      .insert(aiChatSessions)
      .values({
        id: sessionId,
        userId,
        context: data.context,
        documentId: data.documentId,
        projectId: data.projectId,
        title: data.title || "New Chat",
        durableStreamId,
      })
      .returning();

    return session;
  });

// Update session metadata (userId derived from auth, ownership verified)
export const updateChatSession = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      sessionId: string;
      title?: string;
      messageCount?: number;
      status?: "active" | "archived" | "error";
    }) => d
  )
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const updates: Partial<typeof aiChatSessions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) updates.title = data.title;
    if (data.messageCount !== undefined) {
      updates.messageCount = data.messageCount;
      updates.lastMessageAt = new Date();
    }
    if (data.status !== undefined) updates.status = data.status;

    // WHERE clause includes userId to ensure ownership
    const [session] = await db
      .update(aiChatSessions)
      .set(updates)
      .where(and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, userId)))
      .returning();

    if (!session) {
      throw new Error("Session not found or access denied");
    }

    return session;
  });

// Archive a chat session (userId derived from auth)
export const archiveChatSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const result = await db
      .update(aiChatSessions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error("Session not found or access denied");
    }

    return { success: true };
  });

// Get a specific session (userId derived from auth)
export const getChatSession = createServerFn({ method: "GET" })
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthUserId();

    const session = await db.query.aiChatSessions.findFirst({
      where: and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, userId)),
    });

    if (!session) {
      throw new Error("Session not found or access denied");
    }

    return session;
  });
```

---

## 4. Durable Stream Connection Adapter

```typescript
// packages/app/src/lib/ai/durable-stream-adapter.ts
import type { ConnectionAdapter } from "@tanstack/ai-client";
import { getChatStreamId } from "./session";

const DURABLE_STREAMS_URL = import.meta.env.VITE_DURABLE_STREAMS_URL || "http://localhost:8787";

export function createDurableStreamAdapter(sessionId: string): ConnectionAdapter {
  return {
    async connect(options) {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messages: options.messages,
          context: options.context,
          documentId: options.documentId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.statusText}`);
      }

      // Return SSE stream for TanStack AI to consume
      return response;
    },

    // Resume from Durable Stream offset
    async resume(offset: string) {
      const streamId = getChatStreamId(sessionId);
      return fetch(`/api/ai/session/${sessionId}?offset=${offset}&live=long-poll`);
    },
  };
}
```

---

## 5. Durable Stream Persistence

The persistence layer uses lib0 binary encoding for efficient storage, with proper round-trip support.

### Message Types

```typescript
// packages/app/src/lib/ai/persistence-types.ts
import { z } from "zod";

/**
 * Stream chunk types stored in Durable Stream
 */
export const StreamChunkSchema = z.discriminatedUnion("type", [
  // User message
  z.object({
    type: z.literal("user-message"),
    id: z.string(),
    content: z.string(),
    timestamp: z.string().datetime(),
  }),
  // Assistant text chunk (streaming)
  z.object({
    type: z.literal("assistant-chunk"),
    messageId: z.string(),
    content: z.string(),
    timestamp: z.string().datetime(),
  }),
  // Assistant message complete
  z.object({
    type: z.literal("assistant-complete"),
    messageId: z.string(),
    timestamp: z.string().datetime(),
  }),
  // Tool call
  z.object({
    type: z.literal("tool-call"),
    id: z.string(),
    messageId: z.string(),
    name: z.string(),
    arguments: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  }),
  // Tool result
  z.object({
    type: z.literal("tool-result"),
    toolCallId: z.string(),
    messageId: z.string(),
    result: z.unknown(),
    error: z.string().optional(),
    timestamp: z.string().datetime(),
  }),
]);

export type StreamChunk = z.infer<typeof StreamChunkSchema>;
```

### Encoding/Decoding

```typescript
// packages/app/src/lib/ai/persistence.ts
import { getChatStreamId, type ChatMessage } from "./session";
import { StreamChunkSchema, type StreamChunk } from "./persistence-types";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const DURABLE_STREAMS_URL = import.meta.env.VITE_DURABLE_STREAMS_URL || "http://localhost:8787";

/**
 * Encode a single chunk to binary
 */
function encodeChunk(chunk: StreamChunk): Uint8Array {
  const encoder = encoding.createEncoder();
  const json = JSON.stringify(chunk);
  encoding.writeVarString(encoder, json);
  return encoding.toUint8Array(encoder);
}

/**
 * Decode chunks from binary data
 */
function decodeChunks(data: Uint8Array): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  const decoder = decoding.createDecoder(data);

  while (decoder.pos < data.length) {
    try {
      const json = decoding.readVarString(decoder);
      const parsed = JSON.parse(json);
      const result = StreamChunkSchema.safeParse(parsed);
      if (result.success) {
        chunks.push(result.data);
      } else {
        console.warn("Invalid chunk in stream:", result.error);
      }
    } catch (e) {
      // End of valid data
      break;
    }
  }

  return chunks;
}

/**
 * Persist a single chunk to the Durable Stream
 */
export async function persistChunk(sessionId: string, chunk: StreamChunk): Promise<void> {
  const streamId = getChatStreamId(sessionId);
  const data = encodeChunk(chunk);

  await fetch(`${DURABLE_STREAMS_URL}/v1/stream/${streamId}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
}

/**
 * Persist streaming response chunks as they arrive
 */
export async function persistStreamingResponse(
  sessionId: string,
  messageId: string,
  stream: ReadableStream<string>
): Promise<void> {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await persistChunk(sessionId, {
        type: "assistant-chunk",
        messageId,
        content: value,
        timestamp: new Date().toISOString(),
      });
    }

    await persistChunk(sessionId, {
      type: "assistant-complete",
      messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to persist streaming response:", error);
    throw error;
  }
}

/**
 * Load and reconstruct chat history from Durable Stream
 */
export async function loadChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const streamId = getChatStreamId(sessionId);

  try {
    const response = await fetch(`${DURABLE_STREAMS_URL}/v1/stream/${streamId}?offset=-1`, {
      headers: { Accept: "application/octet-stream" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return []; // New session
      }
      throw new Error(`Failed to load chat history: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const chunks = decodeChunks(data);

    // Reconstruct messages from chunks
    return reconstructMessages(chunks);
  } catch (error) {
    console.error("Failed to load chat history:", error);
    return [];
  }
}

/**
 * Reconstruct ChatMessage array from stream chunks
 */
function reconstructMessages(chunks: StreamChunk[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const assistantMessages = new Map<string, { content: string; toolCalls: any[] }>();

  for (const chunk of chunks) {
    switch (chunk.type) {
      case "user-message":
        messages.push({
          id: chunk.id,
          role: "user",
          content: chunk.content,
          timestamp: chunk.timestamp,
        });
        break;

      case "assistant-chunk": {
        const existing = assistantMessages.get(chunk.messageId) || { content: "", toolCalls: [] };
        existing.content += chunk.content;
        assistantMessages.set(chunk.messageId, existing);
        break;
      }

      case "assistant-complete": {
        const msg = assistantMessages.get(chunk.messageId);
        if (msg) {
          messages.push({
            id: chunk.messageId,
            role: "assistant",
            content: msg.content,
            toolCalls: msg.toolCalls.length > 0 ? msg.toolCalls : undefined,
            timestamp: chunk.timestamp,
          });
          assistantMessages.delete(chunk.messageId);
        }
        break;
      }

      case "tool-call": {
        const msg = assistantMessages.get(chunk.messageId) || { content: "", toolCalls: [] };
        msg.toolCalls.push({
          id: chunk.id,
          name: chunk.name,
          arguments: chunk.arguments,
        });
        assistantMessages.set(chunk.messageId, msg);
        break;
      }

      case "tool-result":
        messages.push({
          id: chunk.toolCallId,
          role: "tool",
          content: JSON.stringify(chunk.result),
          toolResults: [{ toolCallId: chunk.toolCallId, result: chunk.result }],
          timestamp: chunk.timestamp,
        });
        break;
    }
  }

  return messages;
}
```

---

## 6. Server API Route

The API route handles authentication, sets up editor context for tools, and persists messages properly.

```typescript
// packages/app/src/routes/api/ai/chat.ts
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { getWebRequest } from "@tanstack/react-start/server";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { auth } from "../../../lib/auth";
import { getAdapter } from "../../../lib/ai/adapter";
import { getDashboardTools } from "../../../lib/ai/tools/dashboard-impl";
import { getSketchTools } from "../../../lib/ai/tools/sketch-impl";
import { getModelingTools } from "../../../lib/ai/tools/modeling-impl";
import { buildDashboardSystemPrompt } from "../../../lib/ai/prompts/dashboard";
import { buildEditorSystemPrompt } from "../../../lib/ai/prompts/editor";
import { persistChunk, persistStreamingResponse } from "../../../lib/ai/persistence";
import { withEditorContext } from "../../../lib/ai/editor-context";
import type { StreamChunk } from "../../../lib/ai/persistence-types";
import { v4 as uuid } from "uuid";

export const Route = createAPIFileRoute("/api/ai/chat")({
  POST: async ({ request }) => {
    // Get authenticated user from session
    const webRequest = getWebRequest();
    const session = await auth.api.getSession({ headers: webRequest.headers });

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;
    const { sessionId, messages, context, documentId, projectId } = await request.json();

    // Persist user message first
    const userMessage = messages[messages.length - 1];
    if (userMessage?.role === "user") {
      await persistChunk(sessionId, {
        type: "user-message",
        id: uuid(),
        content: userMessage.content,
        timestamp: new Date().toISOString(),
      });
    }

    // Get appropriate tools and system prompt based on context
    let tools;
    let systemPrompt;

    if (context === "dashboard") {
      tools = await getDashboardTools(userId);
      systemPrompt = buildDashboardSystemPrompt(userId, projectId);
    } else {
      // Editor context - combine sketch and modeling tools
      const sketchTools = await getSketchTools(documentId);
      const modelingTools = await getModelingTools(documentId);
      tools = [...sketchTools, ...modelingTools];
      systemPrompt = await buildEditorSystemPrompt(documentId);
    }

    // Wrap in editor context for tool implementations
    const runChat = async () => {
      const messageId = uuid();

      // Create chat stream with agentic loop
      const stream = await chat({
        adapter: getAdapter(),
        messages,
        tools,
        system: systemPrompt,
        onToolCall: async (toolCall) => {
          // Persist tool call
          await persistChunk(sessionId, {
            type: "tool-call",
            id: toolCall.id,
            messageId,
            name: toolCall.name,
            arguments: toolCall.arguments as Record<string, unknown>,
            timestamp: new Date().toISOString(),
          });
        },
        onToolResult: async (toolResult) => {
          // Persist tool result
          await persistChunk(sessionId, {
            type: "tool-result",
            toolCallId: toolResult.toolCallId,
            messageId,
            result: toolResult.result,
            error: toolResult.error,
            timestamp: new Date().toISOString(),
          });
        },
      });

      // Tee stream: one for response, one for persistence
      const [responseStream, persistenceStream] = stream.tee();

      // Persist assistant response chunks (fire and forget)
      persistStreamingResponse(sessionId, messageId, persistenceStream).catch(console.error);

      // Return SSE response
      return toServerSentEventsResponse(responseStream);
    };

    // Run with editor context if in editor mode
    if (context === "editor" && documentId) {
      return withEditorContext(
        {
          documentId,
          selection: [], // Will be passed from client in future
          kernelState: "ready",
        },
        runChat
      );
    }

    return runChat();
  },
});
```

---

## 7. Tool Registry Pattern

Tool definitions are in phase-specific files. The registry re-exports and provides factory functions that inject context.

```typescript
// packages/app/src/lib/ai/tools/index.ts
// Re-export tool definition types and factories

// Tool definitions (schemas only)
export { dashboardToolDefs } from "./dashboard";
export { sketchToolDefs } from "./sketch";
export { modelingToolDefs } from "./modeling";

// Tool implementations (server-side)
export { getDashboardTools } from "./dashboard-impl";
export { getSketchTools } from "./sketch-impl";
export { getModelingTools } from "./modeling-impl";

// Client tools (browser-side navigation/UI)
export { dashboardClientTools, editorClientTools } from "./client-tools";
```

### Tool Implementation Pattern

Each phase defines:

1. `*ToolDefs` - Zod schemas and tool definitions (shared)
2. `get*Tools(context)` - Factory that creates server tool implementations

```typescript
// Example pattern from dashboard-impl.ts (Phase 24)
import { dashboardToolDefs } from "./dashboard";
import type { ServerTool } from "@tanstack/ai";

export async function getDashboardTools(userId: string): Promise<ServerTool[]> {
  return dashboardToolDefs.map((def) => {
    switch (def.name) {
      case "listWorkspaces":
        return def.server(async () => {
          // Implementation uses userId from closure
          // ...
        });
      // ... other tools
    }
  });
}
```

---

## 8. Agent Runtime Architecture

Agents can run in multiple environments with a unified abstraction. This enables:

- **Browser execution** via SharedWorker (with Worker fallback)
- **Future remote execution** via Cloudflare Workers, Durable Objects, or edge functions
- **Background modeling** without blocking the UI thread
- **Presence integration** so agents appear as collaborators

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Agent Runtime Architecture                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Main Thread                          Agent Runtime (Worker/Remote)          │
│  ┌────────────────────┐              ┌────────────────────────────────┐     │
│  │  AgentClient       │◄────────────►│  AgentRuntime                  │     │
│  │  • spawn()         │   Messages   │  • Modeling Kernel (OCCT)      │     │
│  │  • terminate()     │              │  • LLM Connection              │     │
│  │  • sendMessage()   │              │  • Tool Execution              │     │
│  │  • onToolCall()    │              │  • Document Sync               │     │
│  └────────────────────┘              └────────────────────────────────┘     │
│           │                                        │                         │
│           │                                        │                         │
│           ▼                                        ▼                         │
│  ┌────────────────────┐              ┌────────────────────────────────┐     │
│  │  Awareness/Yjs     │◄────────────►│  Awareness Client              │     │
│  │  (presence)        │    Sync      │  (agent appears as user)       │     │
│  └────────────────────┘              └────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Runtime Options:
┌─────────────────────────┐  ┌─────────────────────────┐  ┌────────────────────┐
│  BrowserAgentRuntime    │  │  EdgeAgentRuntime       │  │  DOAgentRuntime    │
│  • SharedWorker         │  │  • Cloudflare Worker    │  │  • Durable Object  │
│  • Worker fallback      │  │  • Vercel Edge          │  │  • Stateful        │
│  • Local OCCT kernel    │  │  • Remote kernel        │  │  • Persistent      │
└─────────────────────────┘  └─────────────────────────┘  └────────────────────┘
```

### Agent Runtime Interface

```typescript
// packages/app/src/lib/ai/runtime/types.ts
import type { ChatMessage } from "../session";

/**
 * Agent identity for presence system
 */
export interface AgentIdentity {
  id: string; // Unique agent instance ID
  userId: string; // Synthetic user ID for awareness
  name: string; // Display name (e.g., "AI Assistant")
  color: string; // Cursor/avatar color
  type: "browser" | "edge" | "durable-object";
}

/**
 * Agent state exposed to main thread
 */
export interface AgentState {
  status: "initializing" | "ready" | "busy" | "error" | "terminated";
  currentTask?: string;
  progress?: number; // 0-100 for long operations
  error?: string;
}

/**
 * Messages from main thread to agent
 */
export type AgentCommand =
  | { type: "init"; config: AgentConfig }
  | { type: "chat"; sessionId: string; message: ChatMessage }
  | { type: "execute-tool"; toolName: string; args: Record<string, unknown> }
  | { type: "sync-document"; updates: Uint8Array }
  | { type: "terminate" };

/**
 * Messages from agent to main thread
 */
export type AgentEvent =
  | { type: "state-change"; state: AgentState }
  | { type: "chat-response"; chunk: string; done: boolean }
  | { type: "tool-call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool-result"; id: string; result: unknown; error?: string }
  | { type: "document-update"; updates: Uint8Array }
  | { type: "awareness-update"; state: Record<string, unknown> }
  | { type: "error"; message: string; fatal: boolean };

/**
 * Configuration for agent initialization
 */
export interface AgentConfig {
  identity: AgentIdentity;
  sessionId: string;
  documentId?: string;
  projectId?: string;
  // Connection info for presence
  awarenessStreamId?: string;
  documentStreamId?: string;
  // LLM configuration
  model?: string;
  systemPrompt?: string;
}

/**
 * Abstract agent runtime - implement for different environments
 */
export interface IAgentRuntime {
  readonly identity: AgentIdentity;
  readonly state: AgentState;

  // Lifecycle
  initialize(config: AgentConfig): Promise<void>;
  terminate(): Promise<void>;

  // Communication
  sendCommand(command: AgentCommand): void;
  onEvent(handler: (event: AgentEvent) => void): () => void;

  // Presence
  updateAwareness(state: Record<string, unknown>): void;
}
```

### Browser Agent Runtime (SharedWorker)

```typescript
// packages/app/src/lib/ai/runtime/browser-runtime.ts
import type {
  IAgentRuntime,
  AgentIdentity,
  AgentState,
  AgentConfig,
  AgentCommand,
  AgentEvent,
} from "./types";

/**
 * Browser-based agent runtime using SharedWorker (with Worker fallback)
 */
export class BrowserAgentRuntime implements IAgentRuntime {
  private worker: SharedWorker | Worker | null = null;
  private port: MessagePort | null = null;
  private eventHandlers: Set<(event: AgentEvent) => void> = new Set();
  private _state: AgentState = { status: "initializing" };
  private _identity: AgentIdentity;

  constructor(identity: Omit<AgentIdentity, "type">) {
    this._identity = { ...identity, type: "browser" };
  }

  get identity() {
    return this._identity;
  }

  get state() {
    return this._state;
  }

  async initialize(config: AgentConfig): Promise<void> {
    // Try SharedWorker first (allows sharing kernel across tabs)
    if (typeof SharedWorker !== "undefined") {
      try {
        this.worker = new SharedWorker(new URL("./agent-worker.ts", import.meta.url), {
          type: "module",
          name: `ai-agent-${config.sessionId}`,
        });
        this.port = this.worker.port;
        this.port.start();
        this.setupMessageHandler(this.port);
      } catch (e) {
        console.warn("SharedWorker not available, falling back to Worker", e);
        this.worker = null;
      }
    }

    // Fallback to regular Worker
    if (!this.worker) {
      this.worker = new Worker(new URL("./agent-worker.ts", import.meta.url), {
        type: "module",
        name: `ai-agent-${config.sessionId}`,
      });
      this.setupMessageHandler(this.worker);
    }

    // Send init command
    this.sendCommand({ type: "init", config });

    // Wait for ready state
    await this.waitForState("ready");
  }

  async terminate(): Promise<void> {
    this.sendCommand({ type: "terminate" });

    if (this.port) {
      this.port.close();
    }

    if (this.worker instanceof Worker) {
      this.worker.terminate();
    }
    // SharedWorker can't be terminated from a single tab

    this._state = { status: "terminated" };
    this.worker = null;
    this.port = null;
  }

  sendCommand(command: AgentCommand): void {
    const target = this.port || this.worker;
    if (target) {
      target.postMessage(command);
    }
  }

  onEvent(handler: (event: AgentEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  updateAwareness(state: Record<string, unknown>): void {
    this.sendCommand({
      type: "execute-tool",
      toolName: "_internal_awareness",
      args: state,
    });
  }

  private setupMessageHandler(target: MessagePort | Worker): void {
    const handler = (e: MessageEvent<AgentEvent>) => {
      const event = e.data;

      // Update internal state
      if (event.type === "state-change") {
        this._state = event.state;
      }

      // Notify all handlers
      for (const h of this.eventHandlers) {
        h(event);
      }
    };

    target.addEventListener("message", handler);
  }

  private waitForState(status: AgentState["status"]): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Agent init timeout")), 30000);

      const unsubscribe = this.onEvent((event) => {
        if (event.type === "state-change" && event.state.status === status) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
        if (event.type === "error" && event.fatal) {
          clearTimeout(timeout);
          unsubscribe();
          reject(new Error(event.message));
        }
      });
    });
  }
}
```

### Agent Worker Implementation

```typescript
// packages/app/src/lib/ai/runtime/agent-worker.ts
import type { AgentCommand, AgentEvent, AgentConfig, AgentState } from "./types";

// Worker globals
let config: AgentConfig | null = null;
let kernel: any = null; // SolidSession from @solidtype/core
let state: AgentState = { status: "initializing" };

// Message handling
const ports: Set<MessagePort> = new Set();

function broadcast(event: AgentEvent) {
  for (const port of ports) {
    port.postMessage(event);
  }
  // Also post to self if regular Worker
  if (typeof self !== "undefined" && "postMessage" in self && ports.size === 0) {
    self.postMessage(event);
  }
}

function updateState(newState: Partial<AgentState>) {
  state = { ...state, ...newState };
  broadcast({ type: "state-change", state });
}

// SharedWorker connection handler
if (typeof self !== "undefined" && "onconnect" in self) {
  (self as SharedWorkerGlobalScope).onconnect = (e: MessageEvent) => {
    const port = e.ports[0];
    ports.add(port);
    port.onmessage = (msg) => handleCommand(msg.data);
    port.start();

    // Send current state to new connection
    port.postMessage({ type: "state-change", state });
  };
} else {
  // Regular Worker
  self.onmessage = (msg) => handleCommand(msg.data);
}

async function handleCommand(command: AgentCommand) {
  switch (command.type) {
    case "init":
      await initializeAgent(command.config);
      break;

    case "chat":
      await handleChatMessage(command.sessionId, command.message);
      break;

    case "execute-tool":
      await executeTool(command.toolName, command.args);
      break;

    case "sync-document":
      await syncDocument(command.updates);
      break;

    case "terminate":
      await cleanup();
      break;
  }
}

async function initializeAgent(cfg: AgentConfig) {
  try {
    config = cfg;
    updateState({ status: "initializing", currentTask: "Loading modeling kernel..." });

    // Initialize OpenCascade.js kernel
    const { SolidSession } = await import("@solidtype/core");
    kernel = new SolidSession();
    await kernel.waitForReady();

    // Connect to document stream if provided
    if (config.documentStreamId) {
      await connectToDocument(config.documentStreamId);
    }

    // Connect to awareness stream for presence
    if (config.awarenessStreamId) {
      await connectToAwareness(config.awarenessStreamId);
    }

    updateState({ status: "ready", currentTask: undefined });
  } catch (error) {
    updateState({ status: "error", error: String(error) });
    broadcast({ type: "error", message: String(error), fatal: true });
  }
}

async function handleChatMessage(sessionId: string, message: any) {
  updateState({ status: "busy", currentTask: "Processing..." });

  try {
    // This would connect to the LLM and stream responses
    // The actual LLM call happens via fetch to the server API
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        messages: [message],
        context: "editor",
        documentId: config?.documentId,
        agentId: config?.identity.id,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        broadcast({ type: "chat-response", chunk: "", done: true });
        break;
      }
      const chunk = decoder.decode(value);
      broadcast({ type: "chat-response", chunk, done: false });
    }

    updateState({ status: "ready", currentTask: undefined });
  } catch (error) {
    updateState({ status: "error", error: String(error) });
    broadcast({ type: "error", message: String(error), fatal: false });
  }
}

async function executeTool(toolName: string, args: Record<string, unknown>) {
  updateState({ status: "busy", currentTask: `Executing ${toolName}...` });

  try {
    // Handle internal awareness updates
    if (toolName === "_internal_awareness") {
      await updateAgentAwareness(args);
      updateState({ status: "ready", currentTask: undefined });
      return;
    }

    // Execute modeling tools on the kernel
    const result = await executeModelingTool(toolName, args);

    broadcast({ type: "tool-result", id: toolName, result });
    updateState({ status: "ready", currentTask: undefined });
  } catch (error) {
    broadcast({
      type: "tool-result",
      id: toolName,
      result: null,
      error: String(error),
    });
    updateState({ status: "ready", currentTask: undefined });
  }
}

async function executeModelingTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!kernel) throw new Error("Kernel not initialized");

  // Map tool names to kernel operations
  switch (toolName) {
    case "create_sketch":
      return kernel.createSketch(args.plane as string);

    case "add_line":
      return kernel.addLine(args);

    case "add_arc":
      return kernel.addArc(args);

    case "extrude":
      return kernel.extrude(args.sketchId as string, args.distance as number);

    case "revolve":
      return kernel.revolve(args.sketchId as string, args.axis as string, args.angle as number);

    case "fillet":
      return kernel.fillet(args.edges as string[], args.radius as number);

    // ... more operations

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function syncDocument(updates: Uint8Array) {
  // Apply Yjs updates from main thread
  // This keeps the agent's document in sync
  // TODO: Implement Yjs sync in worker
}

async function connectToDocument(streamId: string) {
  // Connect to Durable Stream for document sync
  // TODO: Implement document connection
}

async function connectToAwareness(streamId: string) {
  // Connect to awareness stream for presence
  // TODO: Implement awareness connection
}

async function updateAgentAwareness(state: Record<string, unknown>) {
  // Update agent's presence in the awareness system
  // This makes the agent visible as a cursor in the editor
  broadcast({
    type: "awareness-update",
    state: {
      user: {
        id: config?.identity.userId,
        name: config?.identity.name,
        color: config?.identity.color,
      },
      cursor: state.cursor,
      selection: state.selection,
      ...state,
    },
  });
}

async function cleanup() {
  if (kernel) {
    kernel.dispose();
    kernel = null;
  }
  updateState({ status: "terminated" });
}
```

### Agent Client (Main Thread)

```typescript
// packages/app/src/lib/ai/runtime/agent-client.ts
import { BrowserAgentRuntime } from "./browser-runtime";
import type { IAgentRuntime, AgentIdentity, AgentConfig, AgentEvent } from "./types";

/**
 * High-level client for managing agent instances
 */
export class AgentClient {
  private runtime: IAgentRuntime | null = null;
  private eventHandlers: Map<AgentEvent["type"], Set<(event: AgentEvent) => void>> = new Map();

  /**
   * Spawn a new agent in a SharedWorker (or Worker fallback)
   */
  async spawn(config: Omit<AgentConfig, "identity"> & { name?: string }): Promise<AgentIdentity> {
    // Generate agent identity
    const identity: Omit<AgentIdentity, "type"> = {
      id: crypto.randomUUID(),
      userId: `agent-${crypto.randomUUID()}`,
      name: config.name || "AI Assistant",
      color: this.generateAgentColor(),
    };

    // Create browser runtime
    this.runtime = new BrowserAgentRuntime(identity);

    // Setup event forwarding
    this.runtime.onEvent((event) => {
      const handlers = this.eventHandlers.get(event.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(event);
        }
      }
    });

    // Initialize
    await this.runtime.initialize({
      ...config,
      identity: { ...identity, type: "browser" },
    });

    return this.runtime.identity;
  }

  /**
   * Terminate the current agent
   */
  async terminate(): Promise<void> {
    if (this.runtime) {
      await this.runtime.terminate();
      this.runtime = null;
    }
  }

  /**
   * Send a chat message to the agent
   */
  sendMessage(sessionId: string, content: string): void {
    if (!this.runtime) throw new Error("No agent running");

    this.runtime.sendCommand({
      type: "chat",
      sessionId,
      message: { role: "user", content, id: crypto.randomUUID() },
    });
  }

  /**
   * Execute a tool directly on the agent's kernel
   */
  executeTool(toolName: string, args: Record<string, unknown>): void {
    if (!this.runtime) throw new Error("No agent running");

    this.runtime.sendCommand({
      type: "execute-tool",
      toolName,
      args,
    });
  }

  /**
   * Sync document updates to the agent
   */
  syncDocument(updates: Uint8Array): void {
    if (!this.runtime) throw new Error("No agent running");

    this.runtime.sendCommand({
      type: "sync-document",
      updates,
    });
  }

  /**
   * Subscribe to agent events
   */
  on<T extends AgentEvent["type"]>(
    eventType: T,
    handler: (event: Extract<AgentEvent, { type: T }>) => void
  ): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler as any);
    return () => this.eventHandlers.get(eventType)?.delete(handler as any);
  }

  /**
   * Get current agent state
   */
  get state() {
    return this.runtime?.state ?? null;
  }

  /**
   * Get agent identity
   */
  get identity() {
    return this.runtime?.identity ?? null;
  }

  private generateAgentColor(): string {
    // Distinct colors for AI agents (purple/violet family)
    const colors = ["#8b5cf6", "#a855f7", "#7c3aed", "#6366f1", "#818cf8"];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// Singleton for easy access
export const agentClient = new AgentClient();
```

### Presence Integration

```typescript
// packages/app/src/lib/ai/runtime/presence.ts
import type { Awareness } from "y-protocols/awareness";
import type { AgentIdentity } from "./types";

/**
 * Integrate agent into Yjs awareness for presence
 */
export function registerAgentPresence(awareness: Awareness, agent: AgentIdentity): () => void {
  // Create a local state entry for the agent
  // This will be synced to other clients via the awareness protocol
  const agentState = {
    user: {
      id: agent.userId,
      name: agent.name,
      color: agent.color,
      isAgent: true, // Flag to identify AI agents in UI
    },
    cursor: null,
    selection: null,
    status: "active",
  };

  // We use a synthetic client ID for the agent
  // This is separate from the real user's awareness
  const agentClientId = hashString(agent.id) % 0xffffffff;

  // Store the agent state
  awareness.setLocalStateField("agents", {
    ...(awareness.getLocalState()?.agents || {}),
    [agent.id]: agentState,
  });

  // Cleanup function
  return () => {
    const agents = { ...(awareness.getLocalState()?.agents || {}) };
    delete agents[agent.id];
    awareness.setLocalStateField("agents", agents);
  };
}

/**
 * Update agent cursor position (called when agent "looks at" something)
 */
export function updateAgentCursor(
  awareness: Awareness,
  agentId: string,
  cursor: { x: number; y: number; z: number } | null,
  selection?: string[] // Selected entity IDs
): void {
  const agents = { ...(awareness.getLocalState()?.agents || {}) };
  if (agents[agentId]) {
    agents[agentId] = {
      ...agents[agentId],
      cursor,
      selection: selection || null,
    };
    awareness.setLocalStateField("agents", agents);
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
```

### React Hook: useAgent

```typescript
// packages/app/src/hooks/useAgent.ts
import { useState, useEffect, useCallback } from "react";
import { agentClient } from "../lib/ai/runtime/agent-client";
import { registerAgentPresence, updateAgentCursor } from "../lib/ai/runtime/presence";
import type { AgentState, AgentEvent } from "../lib/ai/runtime/types";
import type { Awareness } from "y-protocols/awareness";

interface UseAgentOptions {
  sessionId: string;
  documentId?: string;
  projectId?: string;
  awareness?: Awareness;
}

export function useAgent(options: UseAgentOptions) {
  const [isSpawned, setIsSpawned] = useState(false);
  const [state, setState] = useState<AgentState | null>(null);
  const [response, setResponse] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Spawn agent
  const spawn = useCallback(async () => {
    const identity = await agentClient.spawn({
      sessionId: options.sessionId,
      documentId: options.documentId,
      projectId: options.projectId,
    });

    // Register in presence if awareness is available
    if (options.awareness) {
      registerAgentPresence(options.awareness, identity);
    }

    setIsSpawned(true);
    return identity;
  }, [options]);

  // Terminate agent
  const terminate = useCallback(async () => {
    await agentClient.terminate();
    setIsSpawned(false);
    setState(null);
  }, []);

  // Send message
  const sendMessage = useCallback(
    (content: string) => {
      setResponse("");
      setIsStreaming(true);
      agentClient.sendMessage(options.sessionId, content);
    },
    [options.sessionId]
  );

  // Event handlers
  useEffect(() => {
    const unsubState = agentClient.on("state-change", (e) => {
      setState(e.state);
    });

    const unsubChat = agentClient.on("chat-response", (e) => {
      if (e.done) {
        setIsStreaming(false);
      } else {
        setResponse((prev) => prev + e.chunk);
      }
    });

    const unsubAwareness = agentClient.on("awareness-update", (e) => {
      if (options.awareness && agentClient.identity) {
        updateAgentCursor(
          options.awareness,
          agentClient.identity.id,
          e.state.cursor as any,
          e.state.selection as any
        );
      }
    });

    return () => {
      unsubState();
      unsubChat();
      unsubAwareness();
    };
  }, [options.awareness]);

  return {
    isSpawned,
    state,
    identity: agentClient.identity,
    response,
    isStreaming,
    spawn,
    terminate,
    sendMessage,
    executeTool: agentClient.executeTool.bind(agentClient),
    syncDocument: agentClient.syncDocument.bind(agentClient),
  };
}
```

### Future: Remote Agent Runtime Interface

```typescript
// packages/app/src/lib/ai/runtime/remote-runtime.ts
// Stub for future remote agent implementations

import type {
  IAgentRuntime,
  AgentIdentity,
  AgentState,
  AgentConfig,
  AgentCommand,
  AgentEvent,
} from "./types";

/**
 * Remote agent runtime - connects to edge worker or Durable Object
 * This is a stub for future implementation
 */
export class RemoteAgentRuntime implements IAgentRuntime {
  private ws: WebSocket | null = null;
  private eventHandlers: Set<(event: AgentEvent) => void> = new Set();
  private _state: AgentState = { status: "initializing" };
  private _identity: AgentIdentity;

  constructor(
    identity: Omit<AgentIdentity, "type">,
    private runtimeType: "edge" | "durable-object"
  ) {
    this._identity = { ...identity, type: runtimeType };
  }

  get identity() {
    return this._identity;
  }
  get state() {
    return this._state;
  }

  async initialize(config: AgentConfig): Promise<void> {
    // Connect to remote agent endpoint via WebSocket
    const endpoint =
      this.runtimeType === "durable-object"
        ? `/api/agent/do/${config.sessionId}`
        : `/api/agent/edge/${config.sessionId}`;

    this.ws = new WebSocket(`wss://${window.location.host}${endpoint}`);

    return new Promise((resolve, reject) => {
      this.ws!.onopen = () => {
        this.sendCommand({ type: "init", config });
      };

      this.ws!.onmessage = (e) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === "state-change") {
          this._state = event.state;
          if (event.state.status === "ready") resolve();
          if (event.state.status === "error") reject(new Error(event.state.error));
        }
        for (const handler of this.eventHandlers) {
          handler(event);
        }
      };

      this.ws!.onerror = () => reject(new Error("WebSocket error"));
    });
  }

  async terminate(): Promise<void> {
    this.sendCommand({ type: "terminate" });
    this.ws?.close();
    this.ws = null;
    this._state = { status: "terminated" };
  }

  sendCommand(command: AgentCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    }
  }

  onEvent(handler: (event: AgentEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  updateAwareness(state: Record<string, unknown>): void {
    this.sendCommand({
      type: "execute-tool",
      toolName: "_internal_awareness",
      args: state,
    });
  }
}
```

### Agent Status Component

```typescript
// packages/app/src/components/ai/AgentStatus.tsx
import React from "react";
import type { AgentState, AgentIdentity } from "../../lib/ai/runtime/types";
import "./AgentStatus.css";

interface AgentStatusProps {
  identity: AgentIdentity | null;
  state: AgentState | null;
  onSpawn?: () => void;
  onTerminate?: () => void;
}

export function AgentStatus({ identity, state, onSpawn, onTerminate }: AgentStatusProps) {
  if (!state) {
    return (
      <div className="agent-status agent-status--inactive">
        <div className="agent-status-indicator" />
        <span className="agent-status-text">Agent Inactive</span>
        {onSpawn && (
          <button className="agent-status-action" onClick={onSpawn}>
            Start Agent
          </button>
        )}
      </div>
    );
  }

  const statusClass = `agent-status--${state.status}`;
  const statusText = {
    initializing: "Starting...",
    ready: "Ready",
    busy: state.currentTask || "Working...",
    error: state.error || "Error",
    terminated: "Stopped",
  }[state.status];

  return (
    <div className={`agent-status ${statusClass}`}>
      <div
        className="agent-status-indicator"
        style={{ backgroundColor: identity?.color }}
      />
      <div className="agent-status-info">
        <span className="agent-status-name">{identity?.name || "AI Agent"}</span>
        <span className="agent-status-text">{statusText}</span>
        {state.progress !== undefined && (
          <div className="agent-status-progress">
            <div
              className="agent-status-progress-bar"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        )}
      </div>
      {state.status === "ready" && onTerminate && (
        <button className="agent-status-action" onClick={onTerminate}>
          Stop
        </button>
      )}
    </div>
  );
}
```

```css
/* packages/app/src/components/ai/AgentStatus.css */
.agent-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--surface-secondary);
  font-size: 13px;
}

.agent-status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
}

.agent-status--ready .agent-status-indicator {
  background: var(--color-success);
  box-shadow: 0 0 4px var(--color-success);
}

.agent-status--busy .agent-status-indicator {
  background: var(--color-warning);
  animation: pulse 1s ease-in-out infinite;
}

.agent-status--error .agent-status-indicator {
  background: var(--color-error);
}

.agent-status--initializing .agent-status-indicator {
  background: var(--color-info);
  animation: pulse 0.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.agent-status-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.agent-status-name {
  font-weight: 500;
  color: var(--text-primary);
}

.agent-status-text {
  color: var(--text-secondary);
  font-size: 12px;
}

.agent-status-progress {
  height: 3px;
  background: var(--surface-tertiary);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
}

.agent-status-progress-bar {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.3s ease;
}

.agent-status-action {
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--surface-tertiary);
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
}

.agent-status-action:hover {
  background: var(--surface-hover);
}
```

---

## 9. Auth Context Hook

The AI chat system gets the authenticated user from context, not props. This ensures:

- No userId can be spoofed from client
- Consistent auth handling across dashboard and editor

```typescript
// packages/app/src/hooks/useAuth.ts
import { useSession } from "../lib/auth-client"; // better-auth React hooks

/**
 * Hook to get current authenticated user.
 * Returns null if not authenticated.
 */
export function useAuth() {
  const { data: session, isPending } = useSession();

  return {
    user: session?.user ?? null,
    userId: session?.user?.id ?? null,
    isAuthenticated: !!session?.user,
    isLoading: isPending,
  };
}
```

---

## 10. Client Tools (Dashboard + Editor)

```typescript
// packages/app/src/lib/ai/tools/client-tools.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============ Dashboard Client Tools ============

export const navigateToProjectClient = toolDefinition({
  name: "navigateToProject",
  description: "Navigate the user to a specific project",
  inputSchema: z.object({ projectId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({ projectId }, { navigate }) => {
  navigate({ to: `/dashboard/projects/${projectId}` });
  return { success: true };
});

export const navigateToDocumentClient = toolDefinition({
  name: "navigateToDocument",
  description: "Open a document in the editor",
  inputSchema: z.object({ documentId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({ documentId }, { navigate }) => {
  navigate({ to: "/editor", search: { doc: documentId } });
  return { success: true };
});

export const dashboardClientTools = [navigateToProjectClient, navigateToDocumentClient];

// ============ Editor Client Tools ============

export const panToEntityClient = toolDefinition({
  name: "panToEntity",
  description: "Pan the 3D view to focus on a specific entity",
  inputSchema: z.object({
    entityId: z.string(),
    zoom: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({ entityId, zoom }, { editor }) => {
  editor.view.panToEntity(entityId, { zoom: zoom ?? true });
  return { success: true };
});

export const selectEntityClient = toolDefinition({
  name: "selectEntity",
  description: "Select an entity in the editor",
  inputSchema: z.object({
    entityId: z.string(),
    addToSelection: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({ entityId, addToSelection }, { editor }) => {
  if (addToSelection) {
    editor.selection.add(entityId);
  } else {
    editor.selection.set([entityId]);
  }
  return { success: true };
});

export const enterSketchModeClient = toolDefinition({
  name: "enterSketchMode",
  description: "Enter sketch editing mode for a specific sketch",
  inputSchema: z.object({ sketchId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({ sketchId }, { editor }) => {
  editor.enterSketchMode(sketchId);
  return { success: true };
});

export const exitSketchModeClient = toolDefinition({
  name: "exitSketchMode",
  description: "Exit sketch editing mode",
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({}, { editor }) => {
  editor.exitSketchMode();
  return { success: true };
});

export const setViewOrientationClient = toolDefinition({
  name: "setViewOrientation",
  description: "Set the 3D view orientation",
  inputSchema: z.object({
    orientation: z.enum(["front", "back", "top", "bottom", "left", "right", "iso"]),
  }),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({ orientation }, { editor }) => {
  editor.view.setOrientation(orientation);
  return { success: true };
});

export const undoClient = toolDefinition({
  name: "undo",
  description: "Undo the last operation",
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({}, { editor }) => {
  editor.undo();
  return { success: true };
});

export const redoClient = toolDefinition({
  name: "redo",
  description: "Redo the last undone operation",
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({}, { editor }) => {
  editor.redo();
  return { success: true };
});

export const editorClientTools = [
  panToEntityClient,
  selectEntityClient,
  enterSketchModeClient,
  exitSketchModeClient,
  setViewOrientationClient,
  undoClient,
  redoClient,
];
```

---

## 11. React Hook: useAIChat

```typescript
// packages/app/src/hooks/useAIChat.ts
import { useChat, type ToolApprovalRequest } from "@tanstack/ai-react";
import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { createDurableStreamAdapter, createNoopAdapter } from "../lib/ai/durable-stream-adapter";
import { loadChatHistory } from "../lib/ai/persistence";
import {
  listChatSessions,
  createChatSession,
  updateChatSession,
  archiveChatSession,
} from "../lib/ai/session-functions";
import { dashboardClientTools, editorClientTools } from "../lib/ai/tools/client-tools";
import { getApprovalLevel } from "../lib/ai/approval";
import { useToolApprovalPrefs } from "./useToolApprovalPrefs";
import type { AIChatSession } from "../db/schema";

interface UseAIChatOptions {
  context: "dashboard" | "editor";
  documentId?: string;
  projectId?: string;
}

/**
 * Hook for managing chat session list (metadata from PostgreSQL)
 * userId is derived from auth context on server, not passed as prop
 */
export function useAIChatSessions(options: { context?: "dashboard" | "editor" }) {
  const queryClient = useQueryClient();

  // List sessions for current user (auth handled server-side)
  const sessionsQuery = useQuery({
    queryKey: ["ai-chat-sessions", options.context],
    queryFn: () => listChatSessions({ data: { context: options.context } }),
  });

  // Create new session mutation
  const createMutation = useMutation({
    mutationFn: (data: { title?: string; documentId?: string; projectId?: string }) =>
      createChatSession({
        data: {
          context: options.context || "dashboard",
          ...data,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-chat-sessions"] });
    },
  });

  // Archive session mutation
  const archiveMutation = useMutation({
    mutationFn: (sessionId: string) => archiveChatSession({ data: { sessionId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-chat-sessions"] });
    },
  });

  return {
    sessions: sessionsQuery.data || [],
    isLoading: sessionsQuery.isLoading,
    isSuccess: sessionsQuery.isSuccess,
    createSession: createMutation.mutateAsync,
    archiveSession: archiveMutation.mutateAsync,
    refetch: sessionsQuery.refetch,
  };
}

/**
 * Main chat hook - integrates PostgreSQL sessions with Durable Stream messages
 * userId is derived from auth context, not passed as prop
 */
export function useAIChat(options: UseAIChatOptions) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const approvalPrefs = useToolApprovalPrefs();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [toolApprovalRequests, setToolApprovalRequests] = useState<ToolApprovalRequest[]>([]);
  const queryClient = useQueryClient();
  const sessionInitialized = useRef(false);

  const {
    sessions,
    isLoading: sessionsLoading,
    isSuccess: sessionsLoaded,
    createSession,
    archiveSession,
    refetch: refetchSessions,
  } = useAIChatSessions({ context: options.context });

  // Get or create active session - only after sessions have loaded
  const ensureSession = useCallback(async () => {
    if (!sessionsLoaded) {
      throw new Error("Sessions not loaded yet");
    }

    // Find existing active session for this context
    const activeSession = sessions.find(
      (s) => s.status === "active" && s.documentId === options.documentId
    );

    if (activeSession) {
      setActiveSessionId(activeSession.id);
      return activeSession;
    }

    // Create new session
    const newSession = await createSession({
      documentId: options.documentId,
      projectId: options.projectId,
    });
    setActiveSessionId(newSession.id);
    return newSession;
  }, [sessions, sessionsLoaded, options.documentId, options.projectId, createSession]);

  // Auto-initialize session once sessions are loaded
  useEffect(() => {
    if (sessionsLoaded && !sessionInitialized.current && !activeSessionId) {
      sessionInitialized.current = true;
      ensureSession().catch(console.error);
    }
  }, [sessionsLoaded, activeSessionId, ensureSession]);

  // Durable stream adapter - use noop adapter until session exists
  const adapter = useMemo(
    () => (activeSessionId ? createDurableStreamAdapter(activeSessionId) : createNoopAdapter()),
    [activeSessionId]
  );

  // Get client tools based on context
  const clientTools = useMemo(
    () => (options.context === "dashboard" ? dashboardClientTools : editorClientTools),
    [options.context]
  );

  // TanStack AI chat hook with tool approval
  const chat = useChat({
    adapter,
    enabled: !!activeSessionId && isAuthenticated,
    tools: clientTools,
    onToolCall: (toolCall) => {
      // Get approval level, respecting user preferences (YOLO mode, always-allow list)
      const level = getApprovalLevel(toolCall.name, options.context, approvalPrefs);

      if (level === "auto") {
        return true; // Auto-approve (includes YOLO mode and always-allow)
      }

      if (level === "notify") {
        // Notify user but continue
        console.log(`Tool executed: ${toolCall.name}`);
        return true;
      }

      // "confirm" - require user approval
      return new Promise((resolve) => {
        setToolApprovalRequests((prev) => [
          ...prev,
          {
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            resolve,
          },
        ]);
      });
    },
  });

  // Tool approval handlers
  const approveToolCall = useCallback((requestId: string) => {
    setToolApprovalRequests((prev) => {
      const request = prev.find((r) => r.id === requestId);
      if (request) {
        request.resolve(true);
      }
      return prev.filter((r) => r.id !== requestId);
    });
  }, []);

  const rejectToolCall = useCallback((requestId: string) => {
    setToolApprovalRequests((prev) => {
      const request = prev.find((r) => r.id === requestId);
      if (request) {
        request.resolve(false);
      }
      return prev.filter((r) => r.id !== requestId);
    });
  }, []);

  // Load history from Durable Stream when session changes
  useEffect(() => {
    if (activeSessionId) {
      loadChatHistory(activeSessionId).then((history) => {
        if (history.length > 0) {
          chat.setMessages(history);
        }
      });
    }
  }, [activeSessionId]);

  // Update session metadata after each message
  // Computed ready state
  const isReady = isAuthenticated && !!activeSessionId && sessionsLoaded;

  const sendMessage = useCallback(
    async (content: string) => {
      // Guard: don't send if not ready
      if (!isAuthenticated) {
        throw new Error("Not authenticated");
      }

      if (!sessionsLoaded) {
        throw new Error("Sessions not loaded yet");
      }

      // Ensure we have a session before sending
      const session = activeSessionId ? { id: activeSessionId } : await ensureSession();

      await chat.submit({
        messages: [...chat.messages, { role: "user", content }],
        context: options.context,
        documentId: options.documentId,
        sessionId: session.id,
      });

      // Update message count in PostgreSQL (userId handled server-side)
      await updateChatSession({
        data: {
          sessionId: session.id,
          messageCount: chat.messages.length + 2,
        },
      });

      // Auto-generate title from first message
      if (chat.messages.length === 0) {
        const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
        await updateChatSession({
          data: { sessionId: session.id, title },
        });
        refetchSessions();
      }
    },
    [
      chat,
      options,
      activeSessionId,
      ensureSession,
      refetchSessions,
      isAuthenticated,
      sessionsLoaded,
    ]
  );

  // Start new chat
  const startNewChat = useCallback(async () => {
    const newSession = await createSession({
      documentId: options.documentId,
      projectId: options.projectId,
    });
    setActiveSessionId(newSession.id);
    sessionInitialized.current = true;
    chat.setMessages([]);
    return newSession;
  }, [createSession, options.documentId, options.projectId, chat]);

  // Switch to existing session
  const switchToSession = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      const history = await loadChatHistory(sessionId);
      chat.setMessages(history);
    },
    [chat]
  );

  return {
    ...chat,
    // Auth state
    isAuthenticated,
    isReady, // Computed above: isAuthenticated && !!activeSessionId && sessionsLoaded
    // Session management
    sessions,
    sessionsLoading: sessionsLoading || authLoading,
    activeSessionId,
    // Tool approval
    toolApprovalRequests,
    approveToolCall,
    rejectToolCall,
    // Actions
    sendMessage,
    startNewChat,
    switchToSession,
    archiveSession,
    ensureSession,
  };
}
```

### Noop Adapter for Pre-Session State

```typescript
// Add to packages/app/src/lib/ai/durable-stream-adapter.ts

/**
 * No-op adapter used before a session is created.
 * Prevents null reference errors.
 */
export function createNoopAdapter(): ConnectionAdapter {
  return {
    async connect() {
      throw new Error("No active session - cannot send messages");
    },
    async resume() {
      return new Response("", { status: 204 });
    },
  };
}
```

---

## 12. Shared AIChat Component

```typescript
// packages/app/src/components/ai/ChatSessionList.tsx
import React from "react";
import type { AIChatSession } from "../../db/schema";
import "./ChatSessionList.css";

interface ChatSessionListProps {
  sessions: AIChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onArchiveSession: (sessionId: string) => void;
}

export function ChatSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onArchiveSession,
}: ChatSessionListProps) {
  const activeSessions = sessions.filter((s) => s.status === "active");

  return (
    <div className="chat-session-list">
      <div className="chat-session-list-header">
        <span>Sessions</span>
        <button onClick={onNewChat} className="chat-session-new-btn" aria-label="New chat">
          +
        </button>
      </div>

      <div className="chat-session-list-items">
        {activeSessions.map((session) => (
          <div
            key={session.id}
            className={`chat-session-item ${session.id === activeSessionId ? "active" : ""}`}
            onClick={() => onSelectSession(session.id)}
          >
            <span className="chat-session-title">{session.title || "New Chat"}</span>
            <div className="chat-session-meta">
              <span className="chat-session-count">{session.messageCount} msgs</span>
              <button
                className="chat-session-archive"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchiveSession(session.id);
                }}
                aria-label="Archive"
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {activeSessions.length === 0 && (
          <div className="chat-session-empty">No chat sessions</div>
        )}
      </div>
    </div>
  );
}
```

```typescript
// packages/app/src/components/ai/AIChat.tsx
import React, { useState, useRef, useEffect } from "react";
import { useAIChat } from "../../hooks/useAIChat";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatInput } from "./AIChatInput";
import { ChatSessionList } from "./ChatSessionList";
import { ToolApprovalPanel } from "./ToolApprovalPanel";
import "./AIChat.css";

interface AIChatProps {
  // userId is derived from auth context, not passed as prop
  context: "dashboard" | "editor";
  documentId?: string;
  projectId?: string;
  onClose?: () => void;
}

export function AIChat({ context, documentId, projectId, onClose }: AIChatProps) {
  const {
    // Auth and ready state
    isAuthenticated,
    isReady,
    // Chat state
    messages,
    isLoading,
    error,
    // Session management (from PostgreSQL)
    sessions,
    sessionsLoading,
    activeSessionId,
    // Actions
    sendMessage,
    startNewChat,
    switchToSession,
    archiveSession,
    // Tool approval
    toolApprovalRequests,
    approveToolCall,
    rejectToolCall,
  } = useAIChat({ context, documentId, projectId });

  const [input, setInput] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Session is auto-initialized by useAIChat hook when sessions load
  // No need for manual ensureSession() call

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput("");
    await sendMessage(message);
  };

  return (
    <div className="ai-chat">
      {/* Session sidebar (collapsible) */}
      {showSessions && (
        <ChatSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            switchToSession(id);
            setShowSessions(false);
          }}
          onNewChat={() => {
            startNewChat();
            setShowSessions(false);
          }}
          onArchiveSession={archiveSession}
        />
      )}

      <div className="ai-chat-main">
        <div className="ai-chat-header">
          <button
            className="ai-chat-sessions-toggle"
            onClick={() => setShowSessions(!showSessions)}
            aria-label="Toggle sessions"
          >
            ☰
          </button>
          <h3>AI Assistant</h3>
          {onClose && (
            <button className="ai-chat-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        <div className="ai-chat-messages">
          <AIChatMessages messages={messages} isLoading={isLoading} />

          {toolApprovalRequests.length > 0 && (
            <ToolApprovalPanel
              requests={toolApprovalRequests}
              onApprove={approveToolCall}
              onReject={rejectToolCall}
            />
          )}

          {error && (
            <div className="ai-chat-error">
              <strong>Error:</strong> {error.message}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <AIChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={!isReady || isLoading}
          placeholder={
            !isReady
              ? "Loading..."
              : context === "dashboard"
                ? "Ask about projects, documents, workspaces..."
                : "Describe what you want to create or modify..."
        }
      />
    </div>
  );
}
```

---

## 13. Tool Approval Flow

The approval system has three layers:

1. **Default rules** - Built-in per-tool approval levels
2. **User preferences** - Per-tool overrides stored in localStorage
3. **YOLO mode** - Global override to auto-approve everything

### User Preferences Storage

```typescript
// packages/app/src/lib/ai/approval-preferences.ts
import { z } from "zod";

/**
 * User's tool approval preferences
 */
export const ToolApprovalPreferencesSchema = z.object({
  // YOLO mode - auto-approve all tools without confirmation
  yoloMode: z.boolean().default(false),

  // Per-tool overrides: tools in this list skip confirmation
  alwaysAllow: z.array(z.string()).default([]),

  // Tools that always require confirmation (overrides defaults)
  alwaysConfirm: z.array(z.string()).default([]),
});

export type ToolApprovalPreferences = z.infer<typeof ToolApprovalPreferencesSchema>;

const STORAGE_KEY = "solidtype:ai-tool-preferences";

/**
 * Load preferences from localStorage
 */
export function loadApprovalPreferences(): ToolApprovalPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { yoloMode: false, alwaysAllow: [], alwaysConfirm: [] };
    return ToolApprovalPreferencesSchema.parse(JSON.parse(stored));
  } catch {
    return { yoloMode: false, alwaysAllow: [], alwaysConfirm: [] };
  }
}

/**
 * Save preferences to localStorage
 */
export function saveApprovalPreferences(prefs: ToolApprovalPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Add a tool to the "always allow" list
 */
export function addAlwaysAllow(toolName: string): void {
  const prefs = loadApprovalPreferences();
  if (!prefs.alwaysAllow.includes(toolName)) {
    prefs.alwaysAllow.push(toolName);
    prefs.alwaysConfirm = prefs.alwaysConfirm.filter((t) => t !== toolName);
    saveApprovalPreferences(prefs);
  }
}

/**
 * Remove a tool from the "always allow" list
 */
export function removeAlwaysAllow(toolName: string): void {
  const prefs = loadApprovalPreferences();
  prefs.alwaysAllow = prefs.alwaysAllow.filter((t) => t !== toolName);
  saveApprovalPreferences(prefs);
}
```

### React Hook for Preferences

```typescript
// packages/app/src/hooks/useToolApprovalPrefs.ts
import { useState, useCallback, useEffect } from "react";
import {
  loadApprovalPreferences,
  saveApprovalPreferences,
  type ToolApprovalPreferences,
} from "../lib/ai/approval-preferences";

/**
 * React hook for managing tool approval preferences
 */
export function useToolApprovalPrefs() {
  const [prefs, setPrefs] = useState<ToolApprovalPreferences>(() => loadApprovalPreferences());

  // Sync with localStorage changes (e.g., from other tabs)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "solidtype:ai-tool-preferences") {
        setPrefs(loadApprovalPreferences());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setYoloMode = useCallback((enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, yoloMode: enabled };
      saveApprovalPreferences(next);
      return next;
    });
  }, []);

  const toggleAlwaysAllow = useCallback((toolName: string) => {
    setPrefs((prev) => {
      const isAllowed = prev.alwaysAllow.includes(toolName);
      const next = {
        ...prev,
        alwaysAllow: isAllowed
          ? prev.alwaysAllow.filter((t) => t !== toolName)
          : [...prev.alwaysAllow, toolName],
      };
      saveApprovalPreferences(next);
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    const defaults = { yoloMode: false, alwaysAllow: [], alwaysConfirm: [] };
    saveApprovalPreferences(defaults);
    setPrefs(defaults);
  }, []);

  return {
    ...prefs,
    setYoloMode,
    toggleAlwaysAllow,
    resetPreferences,
  };
}
```

### Unified Approval Registry

The approval system uses context-specific rule sets, merged with user preferences:

```typescript
// packages/app/src/lib/ai/approval.ts
import { loadApprovalPreferences, type ToolApprovalPreferences } from "./approval-preferences";

export type ApprovalLevel = "auto" | "notify" | "confirm";
export type AIChatContext = "dashboard" | "editor";

/**
 * Dashboard tool approval rules
 *
 * Default: auto for everything except destructive operations
 * Only deletions require confirmation
 */
export const DASHBOARD_TOOL_APPROVAL: Record<string, ApprovalLevel> = {
  // Destructive operations - require confirmation
  deleteDocument: "confirm",
  deleteFolder: "confirm",
  deleteBranch: "confirm",
  deleteWorkspace: "confirm",
  deleteProject: "confirm",

  // All other dashboard tools auto-execute by default
  // (reads, creates, renames, moves, navigation, etc.)
};

/**
 * Dashboard default level for unlisted tools
 */
export const DASHBOARD_DEFAULT_LEVEL: ApprovalLevel = "auto";

/**
 * Sketch tool approval rules
 *
 * Default: auto for all sketch tools
 * Sketch operations are easily undoable, so no confirmation needed
 */
export const SKETCH_TOOL_APPROVAL: Record<string, ApprovalLevel> = {
  // All sketch tools auto-execute - everything is undoable
};

/**
 * Sketch default level for unlisted tools
 */
export const SKETCH_DEFAULT_LEVEL: ApprovalLevel = "auto";

/**
 * 3D Modeling tool approval rules
 *
 * Default: auto for all modeling tools
 * Modeling operations are undoable via Yjs, so no confirmation needed
 */
export const MODELING_TOOL_APPROVAL: Record<string, ApprovalLevel> = {
  // All modeling tools auto-execute - everything is undoable
};

/**
 * Modeling default level for unlisted tools
 */
export const MODELING_DEFAULT_LEVEL: ApprovalLevel = "auto";

/**
 * Get approval level for a tool in a given context.
 *
 * Priority order:
 * 1. YOLO mode -> always "auto"
 * 2. User's "alwaysAllow" list -> "auto"
 * 3. User's "alwaysConfirm" list -> "confirm"
 * 4. Default context-specific rules
 * 5. Unknown tool -> "confirm" (safe default)
 */
export function getApprovalLevel(
  toolName: string,
  context: AIChatContext,
  userPrefs?: ToolApprovalPreferences
): ApprovalLevel {
  // Load preferences if not provided
  const prefs = userPrefs ?? loadApprovalPreferences();

  // YOLO mode: auto-approve everything
  if (prefs.yoloMode) {
    return "auto";
  }

  // User has explicitly allowed this tool
  if (prefs.alwaysAllow.includes(toolName)) {
    return "auto";
  }

  // User has explicitly required confirmation for this tool
  if (prefs.alwaysConfirm.includes(toolName)) {
    return "confirm";
  }

  // Check context-specific default rules
  if (context === "dashboard") {
    // Dashboard: only destructive ops require confirmation
    if (toolName in DASHBOARD_TOOL_APPROVAL) {
      return DASHBOARD_TOOL_APPROVAL[toolName];
    }
    return DASHBOARD_DEFAULT_LEVEL; // "auto" for non-destructive
  } else {
    // Editor context: all sketch/modeling ops are auto (undoable)
    if (toolName in SKETCH_TOOL_APPROVAL) {
      return SKETCH_TOOL_APPROVAL[toolName];
    }
    if (toolName in MODELING_TOOL_APPROVAL) {
      return MODELING_TOOL_APPROVAL[toolName];
    }
    // Default to auto for editor tools (everything is undoable)
    return SKETCH_DEFAULT_LEVEL; // "auto"
  }
}

/**
 * Get the default approval level (ignoring user preferences)
 */
export function getDefaultApprovalLevel(toolName: string, context: AIChatContext): ApprovalLevel {
  if (context === "dashboard") {
    return DASHBOARD_TOOL_APPROVAL[toolName] ?? DASHBOARD_DEFAULT_LEVEL;
  }
  return SKETCH_TOOL_APPROVAL[toolName] ?? MODELING_TOOL_APPROVAL[toolName] ?? SKETCH_DEFAULT_LEVEL;
}

/**
 * Check if a tool requires any form of user awareness
 */
export function requiresUserAwareness(
  toolName: string,
  context: AIChatContext,
  userPrefs?: ToolApprovalPreferences
): boolean {
  const level = getApprovalLevel(toolName, context, userPrefs);
  return level !== "auto";
}
```

### Approval UI Component

```typescript
// packages/app/src/components/ai/ToolApprovalPanel.tsx
import { LuAlertTriangle, LuCheck, LuX, LuShieldCheck } from "react-icons/lu";
import { addAlwaysAllow } from "../../lib/ai/approval-preferences";
import "./ToolApprovalPanel.css";

/**
 * Tool approval request from useAIChat hook.
 * Properties match TanStack AI's ToolCall type.
 */
interface ToolApprovalRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

interface ToolApprovalPanelProps {
  requests: ToolApprovalRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export function ToolApprovalPanel({ requests, onApprove, onReject }: ToolApprovalPanelProps) {
  if (requests.length === 0) return null;

  const handleAlwaysAllow = (request: ToolApprovalRequest) => {
    // Add to always-allow list and approve this request
    addAlwaysAllow(request.name);
    onApprove(request.id);
  };

  return (
    <div className="tool-approval-panel">
      <div className="tool-approval-header">
        <LuAlertTriangle size={16} />
        <span>AI wants to perform actions</span>
      </div>

      {requests.map((request) => (
        <div key={request.id} className="tool-approval-item">
          <div className="tool-approval-name">{formatToolName(request.name)}</div>
          <div className="tool-approval-params">
            <pre>{JSON.stringify(request.arguments, null, 2)}</pre>
          </div>
          <div className="tool-approval-actions">
            <button
              onClick={() => onReject(request.id)}
              className="tool-approval-reject"
              aria-label="Reject"
            >
              <LuX size={14} />
              Reject
            </button>
            <button
              onClick={() => handleAlwaysAllow(request)}
              className="tool-approval-always"
              aria-label="Always Allow"
              title="Approve and always allow this tool in the future"
            >
              <LuShieldCheck size={14} />
              Always
            </button>
            <button
              onClick={() => onApprove(request.id)}
              className="tool-approval-approve"
              aria-label="Approve"
            >
              <LuCheck size={14} />
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
```

### YOLO Mode Toggle

Add a settings toggle for YOLO mode in the AI chat header or settings:

```typescript
// packages/app/src/components/ai/AISettingsMenu.tsx
import { Menu } from "@base-ui/react/menu";
import { LuSettings, LuZap, LuShield, LuRotateCcw } from "react-icons/lu";
import { useToolApprovalPrefs } from "../../hooks/useToolApprovalPrefs";
import "./AISettingsMenu.css";

export function AISettingsMenu() {
  const { yoloMode, alwaysAllow, setYoloMode, resetPreferences } = useToolApprovalPrefs();

  return (
    <Menu.Root>
      <Menu.Trigger className="ai-settings-trigger" aria-label="AI Settings">
        <LuSettings size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8}>
          <Menu.Popup className="ai-settings-menu">
            <Menu.Group>
              <Menu.GroupLabel className="ai-settings-label">Tool Approval</Menu.GroupLabel>

              {/* YOLO Mode Toggle */}
              <Menu.Item
                className={`ai-settings-item ${yoloMode ? "active" : ""}`}
                onClick={() => setYoloMode(!yoloMode)}
              >
                <LuZap size={14} className={yoloMode ? "yolo-active" : ""} />
                <span>YOLO Mode</span>
                {yoloMode && <span className="ai-settings-badge">ON</span>}
              </Menu.Item>

              {/* Show count of always-allowed tools */}
              {alwaysAllow.length > 0 && (
                <div className="ai-settings-info">
                  <LuShield size={12} />
                  <span>{alwaysAllow.length} tools always allowed</span>
                </div>
              )}

              {/* Reset preferences */}
              <Menu.Item
                className="ai-settings-item ai-settings-reset"
                onClick={resetPreferences}
              >
                <LuRotateCcw size={14} />
                <span>Reset to Defaults</span>
              </Menu.Item>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
```

```css
/* packages/app/src/components/ai/AISettingsMenu.css */

.ai-settings-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-muted);
}

.ai-settings-trigger:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.ai-settings-menu {
  min-width: 180px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ai-settings-label {
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.ai-settings-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text);
  font-size: 13px;
}

.ai-settings-item:hover {
  background: var(--color-bg-hover);
}

.ai-settings-item.active {
  background: var(--color-accent-subtle);
}

.ai-settings-badge {
  margin-left: auto;
  padding: 2px 6px;
  background: var(--color-accent);
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
}

.yolo-active {
  color: var(--color-warning);
}

.ai-settings-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.ai-settings-reset {
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border);
  margin-top: 4px;
  padding-top: 8px;
}

/* ToolApprovalPanel additions */
.tool-approval-always {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 12px;
}

.tool-approval-always:hover {
  background: var(--color-accent-subtle);
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

---

## 14. File Structure

After implementing this phase, the file structure should be:

```
packages/app/src/
├── db/
│   └── schema/
│       ├── ai-chat-sessions.ts  # NEW: Chat sessions table
│       └── index.ts             # Updated: export new schema
├── lib/
│   ├── auth-client.ts           # better-auth React hooks
│   └── ai/
│       ├── adapter.ts           # LLM adapter configuration
│       ├── session.ts           # Session types and helpers
│       ├── session-functions.ts # Server functions (auth from context)
│       ├── durable-stream-adapter.ts  # Connection adapter + noop
│       ├── persistence.ts       # Durable Stream persistence
│       ├── persistence-types.ts # Stream chunk schemas
│       ├── approval.ts          # Unified tool approval registry
│       ├── approval-preferences.ts  # User preferences (YOLO mode, always-allow)
│       ├── editor-context.ts    # AsyncLocalStorage for editor state
│       ├── prompts/
│       │   └── index.ts         # System prompt builder (stub)
│       ├── tools/
│       │   ├── index.ts         # Tool registry
│       │   └── client-tools.ts  # Dashboard + Editor client tools
│       └── runtime/             # Agent runtime system
│           ├── types.ts         # Runtime interfaces
│           ├── browser-runtime.ts   # SharedWorker/Worker runtime
│           ├── agent-worker.ts  # Worker implementation
│           ├── agent-client.ts  # Main thread client
│           ├── presence.ts      # Awareness integration
│           └── remote-runtime.ts  # Edge/DO runtime (stub)
├── hooks/
│   ├── useAuth.ts               # Auth context hook
│   ├── useAIChat.ts             # React hook for chat
│   ├── useAgent.ts              # React hook for agent lifecycle
│   └── useToolApprovalPrefs.ts  # Tool approval preferences hook
├── components/
│   ├── ai/                      # AI helper components
│   │   ├── ToolApprovalPanel.tsx   # Tool confirmation UI
│   │   ├── ToolApprovalPanel.css
│   │   ├── AISettingsMenu.tsx      # YOLO mode toggle
│   │   └── AISettingsMenu.css
│   └── DashboardAIChat.tsx      # Dashboard FAB + dialog wrapper
├── editor/
│   └── components/
│       ├── AIPanel.tsx          # Main AI chat UI (wired to useAIChat)
│       ├── AIPanel.css          # Existing styles (unchanged)
│       └── PropertiesPanel.tsx  # Renders AIPanel when chat toggled
└── routes/
    └── api/
        └── ai/
            ├── chat.ts          # Chat API route (streaming)
            ├── session/
            │   └── $sessionId.ts  # Session stream proxy
            └── agent/           # Future: remote agent endpoints
                ├── edge/
                │   └── $sessionId.ts
                └── do/
                    └── $sessionId.ts
```

---

## Testing

```typescript
// Test session management
describe("Chat Session", () => {
  test("getChatStreamId formats correctly", () => {
    expect(getChatStreamId("abc-123")).toBe("ai-chat/abc-123");
  });

  test("ChatSessionSchema validates", () => {
    const result = ChatSessionSchema.safeParse({
      id: "uuid",
      userId: "uuid",
      context: "dashboard",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

// Test adapter
describe("Durable Stream Adapter", () => {
  test("connect sends POST request", async () => {
    const adapter = createDurableStreamAdapter("session-1");
    // Mock fetch and test
  });
});
```

---

## 15. UI Integration

The AI chat uses the **existing `AIPanel` component** (`packages/app/src/editor/components/AIPanel.tsx`) - the same UI in both contexts. The existing design with tab bar, history dropdown, messages, and input area is exactly what we want.

### Existing UI Structure

The current `AIPanel.tsx` already has:

- **Tab bar** with session tabs (active sessions as tabs)
- **History dropdown** for closed/archived sessions
- **Empty state** with AI assistant icon
- **Message list** for conversation display
- **Input area** with textarea and send button

This UI will be used identically in both dashboard and editor contexts.

### Wiring to Backend

The existing `AIPanel` component needs to be connected to the real backend:

```typescript
// packages/app/src/editor/components/AIPanel.tsx
// Wire up the existing UI to the backend

import React, { useState, useCallback } from "react";
import { useAIChat } from "../../hooks/useAIChat";
import { useDocument } from "../contexts/DocumentContext";
import "./AIPanel.css";

interface AIPanelProps {
  context?: "dashboard" | "editor";
}

const AIPanel: React.FC<AIPanelProps> = ({ context = "editor" }) => {
  const { documentId, projectId } = useDocument();
  const [showHistory, setShowHistory] = useState(false);

  // Connect to backend via useAIChat hook
  const {
    sessions,
    activeSessionId,
    messages,
    isLoading,
    isReady,
    sendMessage,
    startNewChat,
    switchToSession,
    archiveSession,
    toolApprovalRequests,
    approveToolCall,
    rejectToolCall,
  } = useAIChat({
    context,
    documentId,
    projectId,
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const archivedSessions = sessions.filter((s) => s.status === "archived");

  const handleSend = useCallback(() => {
    const input = document.querySelector(".ai-panel-input") as HTMLTextAreaElement;
    if (input?.value.trim() && isReady) {
      sendMessage(input.value.trim());
      input.value = "";
    }
  }, [sendMessage, isReady]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="ai-panel">
      {/* Tab bar - same as existing */}
      <div className="ai-panel-tabs">
        <div className="ai-panel-tabs-list">
          {sessions
            .filter((s) => s.status === "active")
            .map((session) => (
              <div
                key={session.id}
                className={`ai-panel-tab ${session.id === activeSessionId ? "active" : ""}`}
                onClick={() => switchToSession(session.id)}
              >
                <span className="ai-panel-tab-title">{session.title || "New Chat"}</span>
                <button
                  className="ai-panel-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveSession(session.id);
                  }}
                  aria-label="Close tab"
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          <button className="ai-panel-new-tab" onClick={startNewChat} aria-label="New chat">
            <PlusIcon />
          </button>
        </div>
        <div className="ai-panel-tabs-actions">
          <button
            className="ai-panel-history-btn"
            onClick={() => setShowHistory(!showHistory)}
            aria-label="Session history"
          >
            <HistoryIcon />
          </button>
          {showHistory && (
            <div className="ai-panel-history-dropdown">
              <div className="ai-panel-history-header">Previous Sessions</div>
              {archivedSessions.length > 0 ? (
                archivedSessions.map((session) => (
                  <button
                    key={session.id}
                    className="ai-panel-history-item"
                    onClick={() => {
                      switchToSession(session.id);
                      setShowHistory(false);
                    }}
                  >
                    <span>{session.title || "Untitled"}</span>
                    <span className="ai-panel-history-date">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))
              ) : (
                <div className="ai-panel-history-empty">No previous sessions</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat content - same as existing */}
      <div className="ai-panel-content">
        {messages.length === 0 ? (
          <div className="ai-panel-empty">
            <AgentIcon />
            <div className="ai-panel-empty-title">AI Assistant</div>
            <div className="ai-panel-empty-hint">
              Start a conversation to get help with your design
            </div>
          </div>
        ) : (
          <div className="ai-panel-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`ai-panel-message ai-panel-message-${msg.role}`}>
                {msg.content}
              </div>
            ))}
          </div>
        )}

        {/* Tool approval requests */}
        {toolApprovalRequests.length > 0 && (
          <ToolApprovalPanel
            requests={toolApprovalRequests}
            onApprove={approveToolCall}
            onReject={rejectToolCall}
          />
        )}
      </div>

      {/* Input area - same as existing */}
      <div className="ai-panel-input-area">
        <div className="ai-panel-input-wrapper">
          <textarea
            className="ai-panel-input"
            placeholder={isReady ? "Ask the AI assistant..." : "Loading..."}
            rows={2}
            disabled={!isReady}
            onKeyDown={handleKeyDown}
          />
          <button
            className="ai-panel-send"
            aria-label="Send message"
            onClick={handleSend}
            disabled={!isReady || isLoading}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

// Icons remain the same as existing...
```

### Usage in PropertiesPanel

The existing PropertiesPanel already renders `<AIPanel />` when chat is toggled - no changes needed:

```typescript
// In PropertiesPanel.tsx (already implemented)
const content = showAIChat ? <AIPanel /> : renderProperties();
```

### Usage in Dashboard

For the dashboard, the same `AIPanel` component is used inside a dialog:

```typescript
// packages/app/src/components/DashboardAIChat.tsx
import { Dialog } from "@base-ui/react/dialog";
import AIPanel from "../editor/components/AIPanel";

export function DashboardAIChat() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button className="dashboard-ai-fab" onClick={() => setIsOpen(true)}>
        <AIIcon />
      </button>

      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="dashboard-ai-backdrop" />
          <Dialog.Popup className="dashboard-ai-popup">
            <AIPanel context="dashboard" />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
```

---

## Deliverables

### Core Chat Infrastructure

- [ ] TanStack AI packages installed (`@tanstack/ai`, `@tanstack/ai-react`)
- [ ] AI adapter configuration (`packages/app/src/lib/ai/adapter.ts`)
- [ ] `ai_chat_sessions` PostgreSQL table + migration
- [ ] Session CRUD server functions (`packages/app/src/lib/ai/session-functions.ts`)
- [ ] Durable Stream persistence (`packages/app/src/lib/ai/persistence.ts`)
- [ ] `/api/ai/chat` endpoint with SSE streaming
- [ ] `useAuth` hook for authenticated user context
- [ ] `useAIChat` hook with session management
- [ ] Tool approval system with unified registry (`packages/app/src/lib/ai/approval.ts`)
- [ ] User preferences storage (`packages/app/src/lib/ai/approval-preferences.ts`)
- [ ] `useToolApprovalPrefs` hook for preference management
- [ ] YOLO mode support (auto-approve all tools)
- [ ] Per-tool "always allow" functionality

### UI Components

- [ ] Wire existing `AIPanel.tsx` to `useAIChat` hook (keep existing UI exactly)
- [ ] Add `context` prop to `AIPanel` ("dashboard" | "editor")
- [ ] Add `ToolApprovalPanel.tsx` - inline in AIPanel for confirmations
- [ ] Add `AISettingsMenu.tsx` - YOLO mode toggle (in AIPanel header)
- [ ] Create `DashboardAIChat.tsx` - FAB + Dialog wrapper around `AIPanel`
- [ ] Existing `AIPanel.css` styles unchanged

### Agent Runtime System

- [ ] `IAgentRuntime` interface defined
- [ ] `BrowserAgentRuntime` using SharedWorker (Worker fallback)
- [ ] `agent-worker.ts` with modeling kernel initialization
- [ ] `AgentClient` for main thread communication
- [ ] `useAgent` React hook for agent lifecycle
- [ ] Presence integration (agents appear in Yjs awareness)
- [ ] `RemoteAgentRuntime` stub for future implementations

### Testing

- [ ] Session management tests passing
- [ ] Hook state management tests passing
- [ ] Agent spawn/terminate tests passing
- [ ] Worker message protocol tests passing
- [ ] Tool approval flow tests passing
