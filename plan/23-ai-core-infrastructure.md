# Phase 23: AI Core Infrastructure

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
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./better-auth";
import { documents } from "./documents";
import { projects } from "./projects";

export const aiChatContextEnum = pgEnum("ai_chat_context", ["dashboard", "editor"]);

export const aiChatStatusEnum = pgEnum("ai_chat_status", [
  "active",    // Currently in use
  "archived",  // User closed/archived
  "error",     // Session ended with error
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
export type { AIChatSession, NewAIChatSession, AIChatContext, AIChatStatus } from "./ai-chat-sessions";
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

```typescript
// packages/app/src/lib/ai/session-functions.ts
import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { aiChatSessions } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";

// List user's chat sessions
export const listChatSessions = createServerFn({ method: "GET" })
  .inputValidator((d: { userId: string; context?: "dashboard" | "editor"; limit?: number }) => d)
  .handler(async ({ data }) => {
    const conditions = [eq(aiChatSessions.userId, data.userId)];
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

// Create a new chat session
export const createChatSession = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      userId: string;
      context: "dashboard" | "editor";
      documentId?: string;
      projectId?: string;
      title?: string;
    }) => d
  )
  .handler(async ({ data }) => {
    const sessionId = crypto.randomUUID();
    const durableStreamId = `ai-chat/${sessionId}`;

    const [session] = await db
      .insert(aiChatSessions)
      .values({
        id: sessionId,
        userId: data.userId,
        context: data.context,
        documentId: data.documentId,
        projectId: data.projectId,
        title: data.title || "New Chat",
        durableStreamId,
      })
      .returning();

    return session;
  });

// Update session metadata (title, message count, etc.)
export const updateChatSession = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      sessionId: string;
      userId: string;
      title?: string;
      messageCount?: number;
      status?: "active" | "archived" | "error";
    }) => d
  )
  .handler(async ({ data }) => {
    const updates: Partial<typeof aiChatSessions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) updates.title = data.title;
    if (data.messageCount !== undefined) {
      updates.messageCount = data.messageCount;
      updates.lastMessageAt = new Date();
    }
    if (data.status !== undefined) updates.status = data.status;

    const [session] = await db
      .update(aiChatSessions)
      .set(updates)
      .where(
        and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, data.userId))
      )
      .returning();

    return session;
  });

// Archive/delete a chat session
export const archiveChatSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    await db
      .update(aiChatSessions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(eq(aiChatSessions.id, data.sessionId), eq(aiChatSessions.userId, data.userId))
      );

    return { success: true };
  });

// Get a specific session
export const getChatSession = createServerFn({ method: "GET" })
  .inputValidator((d: { sessionId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const session = await db.query.aiChatSessions.findFirst({
      where: and(
        eq(aiChatSessions.id, data.sessionId),
        eq(aiChatSessions.userId, data.userId)
      ),
    });

    if (!session) {
      throw new Error("Session not found");
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

```typescript
// packages/app/src/lib/ai/persistence.ts
import { getChatStreamId } from "./session";
import * as encoding from "lib0/encoding";

const DURABLE_STREAMS_URL = import.meta.env.VITE_DURABLE_STREAMS_URL || "http://localhost:8787";

export async function persistToDurableStream(
  sessionId: string,
  stream: ReadableStream<StreamChunk>
): Promise<void> {
  const streamId = getChatStreamId(sessionId);
  const reader = stream.getReader();

  const encoder = encoding.createEncoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Encode chunk as JSON with framing
      const chunkJson = JSON.stringify({
        ...value,
        timestamp: new Date().toISOString(),
      });
      encoding.writeVarString(encoder, chunkJson);
    }

    const data = encoding.toUint8Array(encoder);

    // Write to Durable Stream
    await fetch(`${DURABLE_STREAMS_URL}/v1/stream/${streamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: data,
    });
  } catch (error) {
    console.error("Failed to persist chat to Durable Stream:", error);
  }
}

export async function loadChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const streamId = getChatStreamId(sessionId);

  try {
    const response = await fetch(`${DURABLE_STREAMS_URL}/v1/stream/${streamId}?offset=-1`);

    if (!response.ok) {
      if (response.status === 404) {
        return []; // New session
      }
      throw new Error(`Failed to load chat history: ${response.statusText}`);
    }

    const data = await response.json();
    const messages: ChatMessage[] = [];

    // Reconstruct messages from chunks
    // ... decode and aggregate chunks into messages

    return messages;
  } catch (error) {
    console.error("Failed to load chat history:", error);
    return [];
  }
}
```

---

## 6. Server API Route

```typescript
// packages/app/src/routes/api/ai/chat.ts
import { json, createAPIFileRoute } from "@tanstack/react-start/api";
import { chat, toServerSentEventsStream, toServerSentEventsResponse } from "@tanstack/ai";
import { getAdapter } from "../../../lib/ai/adapter";
import { getDashboardTools, getEditorTools } from "../../../lib/ai/tools";
import { buildSystemPrompt } from "../../../lib/ai/prompts";
import { persistToDurableStream } from "../../../lib/ai/persistence";

export const Route = createAPIFileRoute("/api/ai/chat")({
  POST: async ({ request }) => {
    const { sessionId, messages, context, documentId } = await request.json();

    // Get appropriate tools based on context
    const tools =
      context === "dashboard" ? await getDashboardTools() : await getEditorTools(documentId);

    // Create chat stream with agentic loop
    const stream = await chat({
      adapter: getAdapter(),
      messages,
      tools,
      system: await buildSystemPrompt(context, documentId),
    });

    // Tee stream: one for response, one for persistence
    const [responseStream, persistenceStream] = stream.tee();

    // Persist to Durable Stream (fire and forget)
    persistToDurableStream(sessionId, persistenceStream).catch(console.error);

    // Return SSE response
    return toServerSentEventsResponse(responseStream);
  },
});
```

---

## 7. Tool Registry Pattern

```typescript
// packages/app/src/lib/ai/tools/index.ts
import { toolDefinition, type ServerTool } from "@tanstack/ai";
import { dashboardTools } from "./dashboard";
import { sketchTools } from "./sketch";
import { modelingTools } from "./modeling";

export async function getDashboardTools(): Promise<ServerTool[]> {
  return dashboardTools.map((def) => def.server(/* implementation */));
}

export async function getEditorTools(documentId?: string): Promise<ServerTool[]> {
  return [...sketchTools, ...modelingTools].map((def) =>
    def.server(/* implementation with documentId context */)
  );
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
  id: string;           // Unique agent instance ID
  userId: string;       // Synthetic user ID for awareness
  name: string;         // Display name (e.g., "AI Assistant")
  color: string;        // Cursor/avatar color
  type: "browser" | "edge" | "durable-object";
}

/**
 * Agent state exposed to main thread
 */
export interface AgentState {
  status: "initializing" | "ready" | "busy" | "error" | "terminated";
  currentTask?: string;
  progress?: number;    // 0-100 for long operations
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
        this.worker = new SharedWorker(
          new URL("./agent-worker.ts", import.meta.url),
          { type: "module", name: `ai-agent-${config.sessionId}` }
        );
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
      this.worker = new Worker(
        new URL("./agent-worker.ts", import.meta.url),
        { type: "module", name: `ai-agent-${config.sessionId}` }
      );
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
import type {
  IAgentRuntime,
  AgentIdentity,
  AgentConfig,
  AgentEvent,
} from "./types";

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
export function registerAgentPresence(
  awareness: Awareness,
  agent: AgentIdentity
): () => void {
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

import type { IAgentRuntime, AgentIdentity, AgentState, AgentConfig, AgentCommand, AgentEvent } from "./types";

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

  get identity() { return this._identity; }
  get state() { return this._state; }

  async initialize(config: AgentConfig): Promise<void> {
    // Connect to remote agent endpoint via WebSocket
    const endpoint = this.runtimeType === "durable-object"
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
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
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

## 9. React Hook: useAIChat

```typescript
// packages/app/src/hooks/useAIChat.ts
import { useChat } from "@tanstack/ai-react";
import { useMemo, useCallback, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createDurableStreamAdapter } from "../lib/ai/durable-stream-adapter";
import { loadChatHistory } from "../lib/ai/persistence";
import {
  listChatSessions,
  createChatSession,
  updateChatSession,
  archiveChatSession,
} from "../lib/ai/session-functions";
import type { AIChatSession } from "../db/schema";
import { v4 as uuid } from "uuid";

interface UseAIChatOptions {
  userId: string;
  context: "dashboard" | "editor";
  documentId?: string;
  projectId?: string;
}

/**
 * Hook for managing chat session list (metadata from PostgreSQL)
 */
export function useAIChatSessions(options: { userId: string; context?: "dashboard" | "editor" }) {
  const queryClient = useQueryClient();

  // List sessions for this user and context
  const sessionsQuery = useQuery({
    queryKey: ["ai-chat-sessions", options.userId, options.context],
    queryFn: () =>
      listChatSessions({ data: { userId: options.userId, context: options.context } }),
  });

  // Create new session mutation
  const createMutation = useMutation({
    mutationFn: (data: { title?: string; documentId?: string; projectId?: string }) =>
      createChatSession({
        data: {
          userId: options.userId,
          context: options.context || "dashboard",
          ...data,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-chat-sessions", options.userId] });
    },
  });

  // Archive session mutation
  const archiveMutation = useMutation({
    mutationFn: (sessionId: string) =>
      archiveChatSession({ data: { sessionId, userId: options.userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-chat-sessions", options.userId] });
    },
  });

  return {
    sessions: sessionsQuery.data || [],
    isLoading: sessionsQuery.isLoading,
    createSession: createMutation.mutateAsync,
    archiveSession: archiveMutation.mutateAsync,
    refetch: sessionsQuery.refetch,
  };
}

/**
 * Main chat hook - integrates PostgreSQL sessions with Durable Stream messages
 */
export function useAIChat(options: UseAIChatOptions) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    sessions,
    isLoading: sessionsLoading,
    createSession,
    archiveSession,
    refetch: refetchSessions,
  } = useAIChatSessions({ userId: options.userId, context: options.context });

  // Get or create active session
  const ensureSession = useCallback(async () => {
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
  }, [sessions, options.documentId, options.projectId, createSession]);

  // Durable stream adapter for message content
  const adapter = useMemo(
    () => (activeSessionId ? createDurableStreamAdapter(activeSessionId) : null),
    [activeSessionId]
  );

  // TanStack AI chat hook
  const chat = useChat({
    adapter: adapter!,
    // Don't start until we have a session
    enabled: !!activeSessionId,
    // Client tools for navigation
    tools: options.context === "dashboard" ? dashboardClientTools : editorClientTools,
  });

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
  const sendMessage = useCallback(
    async (content: string) => {
      // Ensure we have a session before sending
      const session = activeSessionId ? { id: activeSessionId } : await ensureSession();

      await chat.submit({
        messages: [...chat.messages, { role: "user", content }],
        context: options.context,
        documentId: options.documentId,
        sessionId: session.id,
      });

      // Update message count in PostgreSQL
      await updateChatSession({
        data: {
          sessionId: session.id,
          userId: options.userId,
          messageCount: chat.messages.length + 2, // +2 for user + assistant
        },
      });

      // Auto-generate title from first message
      if (chat.messages.length === 0) {
        const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
        await updateChatSession({
          data: { sessionId: session.id, userId: options.userId, title },
        });
        refetchSessions();
      }
    },
    [chat, options, activeSessionId, ensureSession, refetchSessions]
  );

  // Start new chat
  const startNewChat = useCallback(async () => {
    const newSession = await createSession({
      documentId: options.documentId,
      projectId: options.projectId,
    });
    setActiveSessionId(newSession.id);
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
    // Session management
    sessions,
    sessionsLoading,
    activeSessionId,
    // Actions
    sendMessage,
    startNewChat,
    switchToSession,
    archiveSession,
    ensureSession,
  };
}
```

---

## 9. Shared AIChat Component

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
  userId: string;
  context: "dashboard" | "editor";
  documentId?: string;
  projectId?: string;
  onClose?: () => void;
}

export function AIChat({ userId, context, documentId, projectId, onClose }: AIChatProps) {
  const {
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
    ensureSession,
    // Tool approval
    toolApprovalRequests,
    approveToolCall,
    rejectToolCall,
  } = useAIChat({ userId, context, documentId, projectId });

  const [input, setInput] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Ensure we have a session on mount
  useEffect(() => {
    ensureSession();
  }, []);

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
          disabled={isLoading}
          placeholder={
            context === "dashboard"
              ? "Ask about projects, documents, workspaces..."
              : "Describe what you want to create or modify..."
        }
      />
    </div>
  );
}
```

---

## 10. Tool Approval Flow

### Approval Categories

```typescript
// packages/app/src/lib/ai/approval.ts

export type ApprovalLevel = "auto" | "notify" | "confirm";

export const TOOL_APPROVAL_RULES: Record<string, ApprovalLevel> = {
  // Auto-execute (read-only, safe)
  listWorkspaces: "auto",
  listProjects: "auto",
  listDocuments: "auto",
  getCurrentSelection: "auto",
  findFaces: "auto",
  findEdges: "auto",
  getGeometry: "auto",

  // Notify (creates things, but non-destructive)
  createWorkspace: "notify",
  createProject: "notify",
  createSketch: "notify",
  createExtrude: "notify",

  // Confirm (modifies or deletes)
  modifyFeature: "confirm",
  deleteFeature: "confirm",

  // Navigation (auto)
  openProject: "auto",
  openDocument: "auto",
};

export function getApprovalLevel(toolName: string): ApprovalLevel {
  return TOOL_APPROVAL_RULES[toolName] || "confirm";
}
```

### Approval UI Component

```typescript
// packages/app/src/components/ai/ToolApprovalPanel.tsx
import { LuAlertTriangle, LuCheck, LuX } from "react-icons/lu";
import "./ToolApprovalPanel.css";

interface ToolApprovalRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ToolApprovalPanelProps {
  requests: ToolApprovalRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export function ToolApprovalPanel({ requests, onApprove, onReject }: ToolApprovalPanelProps) {
  return (
    <div className="tool-approval-panel">
      <div className="tool-approval-header">
        <LuAlertTriangle size={16} />
        <span>AI wants to perform actions</span>
      </div>

      {requests.map((request) => (
        <div key={request.id} className="tool-approval-item">
          <div className="tool-approval-name">{formatToolName(request.toolName)}</div>
          <div className="tool-approval-params">
            <pre>{JSON.stringify(request.input, null, 2)}</pre>
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

---

## 12. File Structure

After implementing this phase, the file structure should be:

```
packages/app/src/
├── db/
│   └── schema/
│       ├── ai-chat-sessions.ts  # NEW: Chat sessions table
│       └── index.ts             # Updated: export new schema
├── lib/
│   └── ai/
│       ├── adapter.ts           # LLM adapter configuration
│       ├── session.ts           # Session types and helpers
│       ├── session-functions.ts # Server functions for CRUD
│       ├── durable-stream-adapter.ts  # Connection adapter
│       ├── persistence.ts       # Durable Stream persistence
│       ├── approval.ts          # Tool approval rules
│       ├── prompts/
│       │   └── index.ts         # System prompt builder (stub)
│       ├── tools/
│       │   └── index.ts         # Tool registry (stub)
│       └── runtime/             # NEW: Agent runtime system
│           ├── types.ts         # Runtime interfaces
│           ├── browser-runtime.ts   # SharedWorker/Worker runtime
│           ├── agent-worker.ts  # Worker implementation
│           ├── agent-client.ts  # Main thread client
│           ├── presence.ts      # Awareness integration
│           └── remote-runtime.ts  # Edge/DO runtime (stub)
├── hooks/
│   ├── useAIChat.ts             # React hook for chat
│   └── useAgent.ts              # React hook for agent lifecycle
├── components/
│   └── ai/
│       ├── AIChat.tsx           # Main chat component
│       ├── AIChat.css
│       ├── AIChatMessages.tsx   # Message list
│       ├── AIChatInput.tsx      # Input area
│       ├── ChatSessionList.tsx  # Session history sidebar
│       ├── AgentStatus.tsx      # Agent state indicator
│       ├── AgentStatus.css
│       ├── ToolApprovalPanel.tsx
│       └── ToolApprovalPanel.css
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

## Deliverables

### Core Chat Infrastructure
- [ ] TanStack AI packages installed
- [ ] AI adapter configuration working
- [ ] `ai_chat_sessions` PostgreSQL table created (migration)
- [ ] Session CRUD server functions working
- [ ] Durable Stream integration for message content
- [ ] `/api/ai/chat` endpoint returning SSE stream
- [ ] `useAIChat` hook functional with session management
- [ ] `AIChat` component rendering
- [ ] `ChatSessionList` component for session history
- [ ] Tool approval UI working

### Agent Runtime System
- [ ] `IAgentRuntime` interface defined
- [ ] `BrowserAgentRuntime` using SharedWorker (Worker fallback)
- [ ] `agent-worker.ts` with modeling kernel initialization
- [ ] `AgentClient` for main thread communication
- [ ] `useAgent` React hook for agent lifecycle
- [ ] Presence integration (agents appear in awareness)
- [ ] `AgentStatus` component showing agent state
- [ ] `RemoteAgentRuntime` stub for future edge/DO implementations

### Testing
- [ ] Basic session management tests passing
- [ ] Agent spawn/terminate tests passing
- [ ] Worker message protocol tests passing
