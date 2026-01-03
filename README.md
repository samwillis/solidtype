# SolidType

A modern, history-capable, parametric CAD application.

## 🚀 Demo Showcase

**SolidType is also a comprehensive demonstration of modern local-first sync technologies:**

- **Electric SQL** - Real-time Postgres sync for structured metadata
- **Durable Streams** - Append-only streams for Yjs document persistence
- **TanStack DB** - Client-side embedded database with live queries

This project showcases how to build a production-ready collaborative application using Electric + Durable Streams for different data types (structured vs. CRDT-based documents).

## Overview

SolidType is a collaborative CAD platform featuring:

- **Parametric 3D modeling** powered by OpenCascade.js (OCCT)
- **2D sketching with constraint solving** for interactive design
- **Real-time collaboration** via Electric SQL Durable Streams and Yjs
- **Multi-user workspaces and projects** with branching support
- **AI-assisted modeling** through chat-based tool calling
- **Conflict-free merging** of CAD models using Yjs (CRDTs)

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0
- **Docker** and **Docker Compose** (for local development)
- **PostgreSQL** 14+ (optional if using Docker)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd solidtype
pnpm install
```

### 2. Environment Setup

Create a `.env` file in `packages/app/` (optional - defaults are provided):

```bash
cd packages/app
cat > .env << EOF
# Database connection (for host connections)
DATABASE_URL=postgresql://solidtype:solidtype@localhost:54321/solidtype

# Electric SQL (optional - for Electric Cloud)
# ELECTRIC_SOURCE_ID=your_source_id
# ELECTRIC_SOURCE_SECRET=your_source_secret

# Durable Streams (defaults to http://localhost:3200)
# DURABLE_STREAMS_URL=http://localhost:3200

# API base URL (defaults to http://localhost:3000)
# VITE_API_URL=http://localhost:3000
EOF
```

### 3. Start Docker Services

SolidType requires three services running via Docker Compose:

```bash
# From the project root
docker-compose up -d
```

This starts:

- **PostgreSQL** on port `54321` (host) → `5432` (container)
  - Configured with `wal_level=logical` for Electric SQL replication
  - Config file: `postgres.conf` (mounted in container)
- **Electric SQL** on port `3100` (sync engine for real-time metadata)
- **Durable Streams** on port `3200` (Yjs document persistence)

Verify services are running:

```bash
docker-compose ps
```

You should see all three services in "Up" state.

### 4. Database Setup

#### Run Migrations

Since we're using the Drizzle adapter with better-auth, all tables (including better-auth's `user`, `session`, `account`, `verification` tables) are included in our Drizzle schema. Simply run:

```bash
cd packages/app
pnpm db:push
```

This creates all database tables, including:

- Application tables (workspaces, projects, documents, etc.)
- Better Auth tables (`user`, `session`, `account`, `verification`)

**Note:** The better-auth schema is included in our Drizzle instance, so `db:push` handles everything.

Alternatively, generate migration files:

```bash
pnpm db:generate  # Generate migration files
pnpm db:migrate   # Apply migrations
```

#### Open Database Studio (Optional)

```bash
pnpm db:studio
```

Opens Drizzle Studio at `http://localhost:4983` for database inspection.

### 5. Run the Application

```bash
cd packages/app
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Development Workflow

### Project Structure

```
solidtype/
├── packages/
│   ├── core/          # CAD kernel (OpenCascade.js wrapper)
│   └── app/           # React application
│       ├── src/
│       │   ├── db/           # Database schema & migrations
│       │   ├── editor/       # CAD editor UI
│       │   ├── lib/          # Utilities (auth, sync, etc.)
│       │   ├── routes/       # TanStack Router routes
│       │   └── hooks/        # React hooks
│       └── drizzle.config.ts # Drizzle configuration
├── docker-compose.yml  # Local services
└── plan/              # Implementation phases
```

### Available Scripts

#### Root Level

```bash
pnpm build          # Build all packages
pnpm typecheck      # Type-check all packages
pnpm test           # Run tests across packages
```

#### App Package (`packages/app`)

```bash
pnpm dev            # Start development server
pnpm build          # Build for production
pnpm preview        # Preview production build
pnpm typecheck      # Type-check TypeScript
pnpm test           # Run tests

# Database
pnpm db:generate    # Generate migration files
pnpm db:migrate     # Run migrations
pnpm db:push        # Push schema directly (dev only) - includes better-auth tables
pnpm db:studio      # Open Drizzle Studio
```

### Services

#### PostgreSQL

- **Host port**: `54321`
- **Container port**: `5432`
- **User**: `solidtype`
- **Password**: `solidtype` (default)
- **Database**: `solidtype`

Connect from host:

```bash
psql postgresql://solidtype:solidtype@localhost:54321/solidtype
```

#### Electric SQL

- **URL**: `http://localhost:3100`
- Syncs metadata (documents, folders, branches) from Postgres to clients
- Uses logical replication from Postgres

#### Durable Streams

- **URL**: `http://localhost:3200`
- Persists Yjs documents (CAD model data)
- Stores data in LMDB (Docker volume)

### Development Tips

1. **Database Changes**: After modifying schema in `packages/app/src/db/schema/`, run `pnpm db:generate` and `pnpm db:push`

2. **Service Logs**: View logs for any service:

   ```bash
   docker-compose logs -f postgres
   docker-compose logs -f electric
   docker-compose logs -f durable-streams
   ```

3. **Reset Database**: To start fresh (required if WAL level was changed):

   ```bash
   docker-compose down -v  # Remove volumes (⚠️ deletes all data)
   docker-compose up -d     # Recreate services with new config
   cd packages/app
   pnpm db:push            # Recreate all tables (including better-auth tables)
   ```

   **Note**: If you're adding `wal_level=logical` to an existing database, you must recreate the volume. WAL level changes require a fresh database.

4. **Hot Reload**: The dev server supports HMR. Changes to React components and most code will hot-reload automatically.

## Architecture

SolidType uses a modern local-first architecture, **serving as a production example** of Electric SQL and Durable Streams working together, with integrated AI assistance:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Client (Browser)                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  TanStack DB         │  │  Yjs + Durable       │  │  AI Chat System  │  │
│  │  (Electric sync)     │  │  Streams             │  │                  │  │
│  │  - Live queries      │  │  - Document content  │  │  - Chat UI       │  │
│  │  - Optimistic writes │  │  - CRDT-based sync   │  │  - Tool approval │  │
│  │  - Metadata cache    │  │  - Awareness/presence│  │  - Agent runtime │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
│           │                         │                          │           │
│           │                         │                          │           │
│           │                         │                          │           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    Web Worker (Modeling Kernel)                    │    │
│  │  - OpenCascade.js (OCCT) - B-Rep operations                        │    │
│  │  - Document rebuild from Yjs                                       │    │
│  │  - Mesh generation for Three.js                                    │    │
│  │  - Agent runtime (SharedWorker) for AI tool execution              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
           │                         │                          │
       HTTP/SSE                  HTTP/SSE                   HTTP/SSE
           │                         │                          │
           ▼                         ▼                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    Server (TanStack Start)                                 │
│                                                                            │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  Electric Proxy      │  │  Durable Streams     │  │  AI Chat API     │  │
│  │  - Auth + shapes     │  │  Proxy (auth)        │  │  - SSE streaming │  │
│  │  - Authorization     │  │  - Document streams  │  │  - Tool execution│  │
│  └──────────────────────┘  └──────────────────────┘  │  - Persistence   │  │
│                                                      └──────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Server Functions (API Routes)                     │  │
│  │  - Session management (PostgreSQL)                                   │  │
│  │  - Document operations                                               │  │
│  │  - Tool implementations (dashboard, sketch, modeling)                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
           │                         │                          │
           ▼                         ▼                          ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
│  PostgreSQL          │  │  Electric SQL        │  │  Durable Streams │
│  (primary database)  │  │  (sync engine)       │  │  (LMDB storage)  │
│                      │  │                      │  │                  │
│  • Metadata tables   │  │  • Real-time sync    │  │  • Document      │
│  • Workspaces        │  │  • Logical repl      │  │    streams       │
│  • Projects          │  │  • Authorization     │  │  • Chat streams  │
│  • Documents         │  │  • Optimistic txns   │  │  • Awareness     │
│  • Chat sessions     │  │                      │  │    streams       │
│  • User auth         │  │                      │  │                  │
└──────────────────────┘  └──────────────────────┘  └──────────────────┘
```

### Data Flow Architecture

**This architecture demonstrates three distinct data synchronization patterns:**

#### 1. Structured Metadata (Electric SQL + PostgreSQL)

**Electric SQL** handles structured, relational metadata with real-time Postgres sync:

- **Data types**: Workspaces, projects, documents, folders, branches, chat session metadata
- **Sync mechanism**: PostgreSQL logical replication → Electric SQL → TanStack DB (client)
- **Features**:
  - Real-time bidirectional sync
  - Authorization via server proxy (shapes)
  - Optimistic mutations with transaction ID reconciliation
  - Live queries that update automatically
- **Use case**: Perfect for hierarchical, relational data that needs querying and filtering

**Example flow:**
```
User creates project → Server writes to PostgreSQL → Electric syncs → 
TanStack DB updates → UI re-renders automatically
```

#### 2. Unstructured Document Content (Durable Streams + Yjs)

**Durable Streams** handles unstructured, CRDT-based document content:

- **Data types**: CAD model features, sketches, constraints, undo/redo history
- **Sync mechanism**: Yjs CRDT → Durable Streams (append-only) → WebSocket/SSE → Other clients
- **Features**:
  - Conflict-free merging (CRDTs)
  - Append-only persistence (LMDB)
  - Awareness/presence (cursors, selections)
  - Deterministic rebuild order
- **Use case**: Perfect for collaborative editing where order matters and conflicts must merge automatically

**Example flow:**
```
User adds sketch point → Yjs update → Durable Stream append → 
Other clients receive update → CRDT merge → UI updates
```

#### 3. AI Chat Sessions (Hybrid: PostgreSQL + Durable Streams)

**AI chat uses a hybrid approach** combining both systems:

- **PostgreSQL** stores session metadata:
  - Session ID, user ID, context (dashboard/editor)
  - Document/project references
  - Status, title, message count
  - Timestamps
  - **Purpose**: Fast listing, querying, UI display

- **Durable Streams** stores message content:
  - Stream ID: `ai-chat/{sessionId}`
  - Actual message content (streaming chunks)
  - Tool calls and results
  - Full conversation history
  - **Purpose**: Streaming, resumption, message replay

**Example flow:**
```
User sends message → Server persists to Durable Stream → 
LLM streams response → Chunks persisted to stream → 
Client receives SSE → UI updates in real-time
```

### AI Integration Architecture

#### Chat Session Management

```
┌────────────────────────────────────────────────────────────────┐
│                     Chat Session Architecture                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  PostgreSQL (ai_chat_sessions table)                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Session metadata (id, userId, context, status)        │   │
│  │ • References (documentId, projectId)                    │   │
│  │ • Timestamps (createdAt, updatedAt)                     │   │
│  │ • Display info (title, messageCount)                    │   │
│  │ → Used for: listing sessions, querying, UI display      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              │ sessionId                       │
│                              ▼                                 │
│  Durable Streams (ai-chat/{sessionId})                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Actual message content (streaming chunks)             │   │
│  │ • Tool calls and results                                │   │
│  │ • Full conversation history                             │   │
│  │ → Used for: streaming, resumption, message replay       │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

#### Tool System

AI tools are organized by context:

- **Dashboard tools**: List workspaces, create projects, navigate documents
- **Sketch tools**: Add points, lines, arcs, apply constraints
- **Modeling tools**: Extrude, revolve, boolean operations, fillet/chamfer
- **Client tools**: Navigation, selection, view manipulation (run in browser)

Tools execute in two modes:
1. **Server-side**: Modeling operations that modify the document (via Yjs updates)
2. **Client-side**: UI operations like navigation and selection

#### Agent Runtime System

Agents can run in multiple environments with a unified abstraction:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Agent Runtime Architecture                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Main Thread                          Agent Runtime (Worker/Remote)         │
│  ┌────────────────────┐              ┌────────────────────────────────┐     │
│  │  AgentClient       │◄────────────►│  AgentRuntime                  │     │
│  │  • spawn()         │   Messages   │  • Modeling Kernel (OCCT)      │     │
│  │  • terminate()     │              │  • LLM Connection              │     │
│  │  • sendMessage()   │              │  • Tool Execution              │     │
│  │  • onToolCall()    │              │  • Document Sync               │     │
│  └────────────────────┘              └────────────────────────────────┘     │
│           │                                        │                        │
│           │                                        │                        │
│           ▼                                        ▼                        │
│  ┌────────────────────┐              ┌────────────────────────────────┐     │
│  │  Awareness/Yjs     │◄────────────►│  Awareness Client              │     │
│  │  (presence)        │    Sync      │  (agent appears as user)       │     │
│  └────────────────────┘              └────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Runtime Options:
┌─────────────────────────┐  ┌─────────────────────────┐  ┌────────────────────┐
│  BrowserAgentRuntime    │  │  EdgeAgentRuntime       │  │  DOAgentRuntime    │
│  • SharedWorker         │  │  • Cloudflare Worker    │  │  • Durable Object  │
│  • Worker fallback      │  │  • Vercel Edge          │  │  • Stateful        │
│  • Local OCCT kernel    │  │  • Remote kernel        │  │  • Persistent      │
└─────────────────────────┘  └─────────────────────────┘  └────────────────────┘
```

**Current implementation**: Browser runtime using SharedWorker (with Worker fallback)
- Modeling kernel (OCCT) runs in worker thread
- Agents appear in presence/awareness system
- Generic interface for future remote execution (edge, Durable Objects)

#### Tool Approval System

Three-layer approval system:

1. **Default rules**: Built-in per-tool approval levels
   - Dashboard: Auto for reads, confirm for destructive operations
   - Editor: Auto for all operations (everything is undoable via Yjs)

2. **User preferences**: Per-tool overrides stored in localStorage
   - "Always allow" list (skip confirmation)
   - "Always confirm" list (require confirmation)

3. **YOLO mode**: Global override to auto-approve everything

### Component Integration

#### How Components Slot Together

1. **User creates a document**:
   - Metadata → PostgreSQL (via Electric sync)
   - Document content → Durable Stream (Yjs)

2. **User opens AI chat**:
   - Session created → PostgreSQL (metadata)
   - Messages → Durable Stream (`ai-chat/{sessionId}`)

3. **AI executes a tool**:
   - Tool call → Server API route
   - Tool implementation → Modifies Yjs document
   - Document update → Durable Stream → All clients sync
   - Worker rebuilds → Mesh sent to UI

4. **Multiple users collaborate**:
   - Electric syncs metadata changes (project structure)
   - Durable Streams syncs document changes (CRDT merge)
   - Awareness syncs presence (cursors, selections)
   - AI agents appear in awareness system

### Key Design Principles

- **Separation of concerns**: Different sync technologies for different data types
- **Local-first**: All data is available locally, sync happens in background
- **Conflict-free**: CRDTs ensure automatic merging without conflicts
- **Real-time**: Changes propagate instantly to all connected clients
- **Undoable**: All operations are reversible via Yjs undo/redo
- **Secure**: Authorization enforced at server proxy layer
- **Extensible**: Agent runtime abstraction supports multiple execution environments

See [`packages/app/src/lib/electric-proxy.ts`](./packages/app/src/lib/electric-proxy.ts) and [`packages/app/src/lib/electric-collections.ts`](./packages/app/src/lib/electric-collections.ts) for Electric integration examples.

See [`plan/23-ai-core-infrastructure.md`](./plan/23-ai-core-infrastructure.md) for detailed AI architecture specification.

### Key Technologies

**Core Framework:**
- **TanStack Start**: Full-stack React framework
- **TanStack DB**: Client-side embedded database with live queries
- **Drizzle ORM**: Type-safe database queries and migrations

**Sync & Collaboration:**
- **Electric SQL**: Real-time Postgres sync for structured metadata
- **Durable Streams**: Append-only streams for Yjs document persistence
- **Yjs**: CRDT-based collaborative editing

**CAD Kernel:**
- **OpenCascade.js**: B-Rep kernel (WASM) for 3D geometry operations

**AI Integration:**
- **TanStack AI**: Unified AI interface with tool calling support
- **Anthropic Claude**: LLM for chat-based modeling assistance
- **Agent Runtime**: Background execution system (SharedWorker/Worker)

## Troubleshooting

### Services Won't Start

1. **Check Docker**: Ensure Docker Desktop is running

   ```bash
   docker ps
   ```

2. **Check Ports**: Ensure ports 54321, 3100, 3200 are available

   ```bash
   lsof -i :54321
   lsof -i :3100
   lsof -i :3200
   ```

3. **View Logs**: Check service logs for errors
   ```bash
   docker-compose logs
   ```

### Database Connection Issues

1. **Verify Postgres is running**:

   ```bash
   docker-compose ps postgres
   ```

2. **Check connection string**: Ensure `DATABASE_URL` uses port `54321` for host connections

3. **Reset database**:
   ```bash
   docker-compose down -v
   docker-compose up -d
   cd packages/app
   pnpm db:push
   ```

### Better Auth Tables Missing

If you see errors like "relation 'user' does not exist":

Run the database push command to create all tables (including better-auth tables):

```bash
cd packages/app
pnpm db:push
```

This creates all required tables including better-auth's authentication tables (`user`, `session`, `account`, `verification`).

### Electric SQL Not Syncing

1. **Check Electric logs**:

   ```bash
   docker-compose logs electric
   ```

2. **Verify Postgres logical replication**:
   - Electric requires `wal_level=logical` in Postgres
   - This is configured in `postgres.conf` and mounted in the container
   - If you see "logical decoding requires wal_level >= logical", ensure the config file is mounted correctly

3. **Check Electric proxy routes**: Ensure API routes are proxying Electric requests correctly

### Type Errors

```bash
# Clean and rebuild types
cd packages/app
rm -rf node_modules .next dist
pnpm install
pnpm typecheck
```

## Next Steps

### For SolidType Development

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture
- Read [OVERVIEW.md](./OVERVIEW.md) for project goals and design decisions
- Check [plan/](./plan/) for implementation phases
- Read [AGENTS.md](./AGENTS.md) for contributor guidelines

### Learning Electric SQL & Durable Streams

This project is an excellent reference implementation for:

- **[Electric SQL](https://electric-sql.com)** - See how to:
  - Set up Electric with Postgres logical replication
  - Create secure proxy routes with authorization
  - Use TanStack DB collections with Electric shapes
  - Implement optimistic mutations with txid reconciliation
  - Reference: [Electric SQL AGENTS.md](https://electric-sql.com/AGENTS.md)

- **[Durable Streams](https://github.com/durable-streams/durable-streams)** - See how to:
  - Integrate Yjs with Durable Streams for document persistence
  - Set up append-only streams for CRDT sync
  - Handle awareness/presence via separate streams
  - Implement reconnection and error handling
  - Check out `packages/app/src/lib/vendor/y-durable-streams/` for the provider implementation

### Learning AI Integration Architecture

This project demonstrates a production-ready AI integration pattern:

- **Hybrid Storage**: PostgreSQL for metadata + Durable Streams for content
  - Session metadata in PostgreSQL (fast queries, listing)
  - Message content in Durable Streams (streaming, resumption)
  - See `packages/app/src/lib/ai/session-functions.ts` and `persistence.ts`

- **Tool System**: Context-aware tool definitions
  - Dashboard tools: Project/document management
  - Sketch tools: 2D geometry creation
  - Modeling tools: 3D feature operations
  - Client tools: UI navigation and selection
  - See `packages/app/src/lib/ai/tools/` for implementations

- **Agent Runtime**: Unified abstraction for multiple execution environments
  - Browser runtime (SharedWorker/Worker) - current implementation
  - Edge runtime (Cloudflare Workers) - future
  - Durable Objects runtime - future
  - See `packages/app/src/lib/ai/runtime/` for the abstraction

- **Tool Approval**: Three-layer approval system
  - Default rules per context
  - User preferences (localStorage)
  - YOLO mode (global override)
  - See `packages/app/src/lib/ai/approval.ts` for the registry

- **TanStack AI Integration**: See how to:
  - Set up TanStack AI with custom adapters
  - Implement tool calling with server/client split
  - Handle streaming responses with SSE
  - Integrate with existing document model (Yjs)
  - Reference: [TanStack AI Documentation](https://tanstack.com/ai/latest)

## License

MIT
