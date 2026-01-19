# Phase 27: User System, Workspaces, Projects & Persistence

## Prerequisites

- Phases 01-17 substantially complete (document model, kernel-viewer wiring, sketches, extrudes, revolves, constraints, arcs, selection, rebuild gate, properties panel, extrude extents, sketch-on-face, booleans)
- Core CAD features working and stable

## Goals

- Implement multi-user authentication and authorization
- Create workspace and project organization hierarchy
- Enable real-time sync of metadata and document lists
- Persist Yjs documents to durable streams
- Support fine-grained permissions at the project level
- Enable offline-first operation with sync-on-reconnect
- **Branching**: Allow users to work on isolated branches and merge changes back
- **Following**: Let users follow another user's cursor/viewport in real-time

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Client (Browser)                                  │
├──────────────────────────┬──────────────────────────────────────────────────┤
│      React App           │               TanStack DB                         │
│  - TanStack Router/Start │  - Electric Collection (documents, folders)       │
│  - TanStack Form         │  - Live queries, optimistic mutations             │
│  - better-auth client    │  - Local-first sync                               │
├──────────────────────────┴──────────────────────────────────────────────────┤
│                                  Yjs                                         │
│  - Y.Doc per document                                                        │
│  - Synced via Durable Streams (not Electric)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP / WebSocket / SSE
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Server (TanStack Start)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  - Server routes (REST API endpoints)                                        │
│  - Server functions (RPC for internal operations)                            │
│  - better-auth middleware (session management)                               │
│  - Drizzle ORM (database access)                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
        ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
        │   PostgreSQL  │  │  ElectricSQL  │  │Durable Streams│
        │   (primary)   │  │  (sync layer) │  │  (Yjs docs)   │
        └───────────────┘  └───────────────┘  └───────────────┘
```

---

## Technology Stack

| Layer                | Technology                                                             | Purpose                                   |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| **Database**         | PostgreSQL                                                             | Primary datastore for all structured data |
| **ORM/Migrations**   | Drizzle                                                                | Type-safe schema, migrations, queries     |
| **Server Framework** | TanStack Start                                                         | Server routes, server functions, SSR      |
| **Authentication**   | better-auth                                                            | User auth, sessions, OAuth providers      |
| **Real-time Sync**   | ElectricSQL                                                            | Postgres → client sync for metadata       |
| **Local State**      | TanStack DB                                                            | Client-side reactive store with Electric  |
| **Document Sync**    | Durable Streams (`@durable-streams/client`, `@durable-streams/server`) | Yjs document persistence and sync         |
| **Containerization** | Docker                                                                 | Local dev and production deployment       |

---

## Data Model

### Entity Relationship Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   users     │────<│ workspace_members│>────│ workspaces  │
└─────────────┘     └──────────────────┘     └─────────────┘
                                                    │
                                                    │ 1:N
                                                    ▼
                    ┌──────────────────┐     ┌─────────────┐
                    │ project_members  │>────│  projects   │
                    └──────────────────┘     └─────────────┘
                            │                       │
                            │                       │ 1:N
                            ▼                       ▼
                    ┌─────────────┐           ┌─────────────┐
                    │   users     │           │  branches   │ ◄── "main" is default
                    └─────────────┘           └─────────────┘
                                                    │
                                                    │ 1:N (folders & documents
                                                    │      scoped to branch)
                                                    ▼
                                              ┌─────────────┐
                                              │   folders   │◄──┐
                                              └─────────────┘   │
                                                    │           │
                                                    │ 1:N     parent_id
                                                    ▼           │
                                              ┌─────────────┐   │
                                              │  documents  │───┘
                                              └─────────────┘
                                                    │
                                                    │ 1:1 (optional)
                                                    ▼
                                              ┌─────────────────┐
                                              │ durable_stream  │
                                              │ (Yjs doc)       │
                                              └─────────────────┘
```

---

## Database Schema (Drizzle)

### Users Table

```typescript
// packages/app/src/db/schema/users.ts
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// better-auth will manage sessions, accounts, etc.
```

### Workspaces Table

```typescript
// packages/app/src/db/schema/workspaces.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
});
```

### Workspace Members Table

```typescript
// packages/app/src/db/schema/workspace-members.ts
import { pgTable, uuid, timestamp, pgEnum, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const workspaceRoleEnum = pgEnum("workspace_role", ["owner", "admin", "member"]);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  })
);
```

### Projects Table

```typescript
// packages/app/src/db/schema/projects.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
});

// Index for Electric sync filtering
// CREATE INDEX idx_projects_workspace ON projects(workspace_id);
```

### Project Members Table

```typescript
// packages/app/src/db/schema/project-members.ts
import { pgTable, uuid, timestamp, pgEnum, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { projects } from "./projects";

export const projectRoleEnum = pgEnum("project_role", ["owner", "admin", "member", "guest"]);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRoleEnum("role").notNull().default("member"),
    canEdit: boolean("can_edit").notNull().default(true), // false = read-only
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
  })
);
```

### Branches Table

```typescript
// packages/app/src/db/schema/branches.ts
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),

  // Branch metadata
  name: text("name").notNull(), // e.g., "main", "feature-new-part", "john-wip"
  description: text("description"), // Optional description of what this branch is for
  isMain: boolean("is_main").notNull().default(false), // Only one branch per project can be main

  // Fork point - which branch this was created from (null for main)
  parentBranchId: uuid("parent_branch_id").references(() => branches.id),
  forkedAt: timestamp("forked_at"), // When this branch was created from parent

  // Ownership
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id), // Who "owns" this branch

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // Merge status
  mergedAt: timestamp("merged_at"), // When this branch was merged back
  mergedBy: uuid("merged_by").references(() => users.id),
  mergedIntoBranchId: uuid("merged_into_branch_id").references(() => branches.id),
});

// Indexes
// CREATE UNIQUE INDEX idx_branches_main ON branches(project_id) WHERE is_main = true;
// CREATE INDEX idx_branches_project ON branches(project_id);
```

### Folders Table

```typescript
// packages/app/src/db/schema/folders.ts
import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { branches } from "./branches";
import { users } from "./users";

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Denormalized: both project_id and branch_id for easy filtering
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),

  parentId: uuid("parent_id").references(() => folders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
});

// Indexes for Electric sync filtering
// CREATE INDEX idx_folders_project ON folders(project_id);
// CREATE INDEX idx_folders_branch ON folders(branch_id);
// CREATE INDEX idx_folders_project_branch ON folders(project_id, branch_id);
```

### Documents Table

```typescript
// packages/app/src/db/schema/documents.ts
import { pgTable, uuid, text, timestamp, integer, pgEnum, boolean } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { branches } from "./branches";
import { folders } from "./folders";
import { users } from "./users";

export const documentTypeEnum = pgEnum("document_type", [
  "part", // CAD part (current focus)
  "assembly", // Future: assembly of parts
  "drawing", // Future: 2D drawings
  "sketch", // Future: standalone sketch
  "file", // Future: attached files
  "notes", // Future: rich text notes
]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Denormalized: both project_id and branch_id for easy filtering
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),

  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: documentTypeEnum("type").notNull().default("part"),

  // Durable Stream reference for Yjs document
  // Denormalized: includes project_id, document_id, and branch_id for easy identification
  // Format: "project/{projectId}/doc/{documentId}/branch/{branchId}"
  durableStreamId: text("durable_stream_id"),

  // For branching: soft delete flag (restored on merge if edited in branch)
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: uuid("deleted_by").references(() => users.id),

  // Metadata for quick display (without loading full Yjs doc)
  featureCount: integer("feature_count").default(0),
  lastEditedBy: uuid("last_edited_by").references(() => users.id),

  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
});

// Indexes for Electric sync filtering
// CREATE INDEX idx_documents_project ON documents(project_id);
// CREATE INDEX idx_documents_branch ON documents(branch_id);
// CREATE INDEX idx_documents_project_branch ON documents(project_id, branch_id);
```

---

## Authentication (better-auth)

better-auth supports multiple database backends. We use the **Postgres adapter** directly for simplicity, or the **Drizzle adapter** if you want better-auth to use your existing Drizzle instance.

### Server Setup (Option A: Direct Postgres)

```typescript
// packages/app/src/lib/auth.ts
import { betterAuth } from "better-auth";
import { Pool } from "pg";

// Use the same Postgres connection as the rest of the app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },
});
```

### Server Setup (Option B: Drizzle Adapter)

If you prefer to use your Drizzle instance (for consistency with the rest of the app):

```typescript
// packages/app/src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },
});
```

**Recommendation:** Use the direct Postgres adapter (Option A) for simplicity - it uses the same `DATABASE_URL` and doesn't require additional adapter setup.

### Client Setup

```typescript
// packages/app/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
});

export const { useSession, signIn, signUp, signOut } = authClient;
```

---

## ElectricSQL Integration

### Electric Authorization Proxy

**All Electric shape requests are proxied through our API** for authentication. The server:

1. Authenticates the user via session cookie
2. Verifies the user has access to the requested project/branch
3. Constructs the WHERE clause server-side with proper authorization
4. Proxies the request to Electric with the secure WHERE clause

This prevents clients from constructing arbitrary WHERE clauses to access data they shouldn't see.

### API URL Design

We use semantic, resource-oriented URLs that represent the data, not the underlying technology:

| Resource         | URL                                                    | Description                              |
| ---------------- | ------------------------------------------------------ | ---------------------------------------- |
| Project branches | `GET /api/projects/:projectId/sync`                    | Electric shape stream for branches       |
| Branch content   | `GET /api/projects/:projectId/branches/:branchId/sync` | Electric shape stream for docs & folders |
| Document stream  | `GET/POST /api/docs/:docId/stream`                     | Durable stream for Yjs doc               |
| Awareness stream | `GET/POST /api/docs/:docId/awareness`                  | Durable stream for presence              |

### Server-Side Shape Proxy

```typescript
// packages/app/src/routes/api/projects/[projectId]/sync.ts
import { createAPIFileRoute } from "@tanstack/start/api";
import { requireAuth } from "../../../../lib/auth-middleware";

// GET /api/projects/:projectId/sync - Stream project branches
export const Route = createAPIFileRoute("/api/projects/$projectId/sync")({
  GET: async ({ request, params }) => {
    const session = await requireAuth(request);
    const { projectId } = params;

    // Verify user has access to this project via subquery in WHERE
    const whereClause = `
      project_id = '${projectId}'
      AND project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = '${session.user.id}'
      )
    `;

    return proxyToElectric(request, "branches", whereClause);
  },
});
```

```typescript
// packages/app/src/routes/api/projects/[projectId]/branches/[branchId]/sync.ts
import { createAPIFileRoute } from "@tanstack/start/api";
import { requireAuth } from "../../../../../../lib/auth-middleware";

// GET /api/projects/:projectId/branches/:branchId/sync - Stream branch documents & folders
export const Route = createAPIFileRoute("/api/projects/$projectId/branches/$branchId/sync")({
  GET: async ({ request, params }) => {
    const session = await requireAuth(request);
    const { projectId, branchId } = params;
    const url = new URL(request.url);
    const table = url.searchParams.get("table") || "documents"; // 'documents' or 'folders'

    // Verify access via subquery
    const whereClause = `
      branch_id = '${branchId}'
      AND project_id = '${projectId}'
      ${table === "documents" ? "AND is_deleted = false" : ""}
      AND project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = '${session.user.id}'
      )
    `;

    return proxyToElectric(request, table, whereClause);
  },
});
```

```typescript
// packages/app/src/lib/electric-proxy.ts
export async function proxyToElectric(
  request: Request,
  table: string,
  whereClause: string
): Promise<Response> {
  const url = new URL(request.url);

  const electricUrl = new URL("/v1/shape", process.env.ELECTRIC_URL);
  electricUrl.searchParams.set("table", table);
  electricUrl.searchParams.set("where", whereClause);

  // Forward Electric-specific params (offset, live, handle, etc.)
  for (const [key, value] of url.searchParams) {
    if (!["table"].includes(key)) {
      electricUrl.searchParams.set(key, value);
    }
  }

  const response = await fetch(electricUrl.toString(), {
    headers: { Accept: request.headers.get("Accept") || "application/json" },
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Cache-Control": response.headers.get("Cache-Control") || "no-cache",
    },
  });
}
```

### Client Shape Configuration

```typescript
// packages/app/src/lib/electric.ts
import { ShapeStream, Shape } from "@electric-sql/client";

const API_BASE = import.meta.env.VITE_API_URL;

// GET /api/projects/:projectId/sync - branches for project
export const createProjectBranchesShape = (projectId: string) => ({
  url: new URL(`/api/projects/${projectId}/sync`, API_BASE),
});

// GET /api/projects/:projectId/branches/:branchId/sync?table=documents
export const createBranchDocumentsShape = (projectId: string, branchId: string) => ({
  url: new URL(`/api/projects/${projectId}/branches/${branchId}/sync`, API_BASE),
  params: { table: "documents" },
});

// GET /api/projects/:projectId/branches/:branchId/sync?table=folders
export const createBranchFoldersShape = (projectId: string, branchId: string) => ({
  url: new URL(`/api/projects/${projectId}/branches/${branchId}/sync`, API_BASE),
  params: { table: "folders" },
});
```

### Electric Sync Strategy

When a user opens a project:

1. **Subscribe to branches shape** for the project's branch list
2. **Determine active branch** (default to main, or user's last selected)
3. **Subscribe to document/folder shapes** filtered by the active branch
4. **TanStack DB** receives shape data and populates local collections
5. **Optimistic mutations** update locally first, then sync to Postgres
6. **Electric** pushes Postgres changes to all connected clients
7. **On branch switch**, unsubscribe old shapes and subscribe to new branch

```typescript
// packages/app/src/hooks/useBranchSync.ts
import { useElectricQuery } from "@tanstack/db-react";
import {
  createBranchDocumentsShape,
  createBranchFoldersShape,
  createProjectBranchesShape,
} from "../lib/electric";

export function useBranchSync(projectId: string, branchId: string) {
  // GET /api/projects/:projectId/sync - branches for project
  const branches = useElectricQuery({
    shape: createProjectBranchesShape(projectId),
  });

  // GET /api/projects/:projectId/branches/:branchId/sync?table=documents
  const documents = useElectricQuery({
    shape: createBranchDocumentsShape(projectId, branchId),
  });

  // GET /api/projects/:projectId/branches/:branchId/sync?table=folders
  const folders = useElectricQuery({
    shape: createBranchFoldersShape(projectId, branchId),
  });

  return { branches, documents, folders };
}
```

---

## TanStack DB Integration

### Database Setup

```typescript
// packages/app/src/lib/tanstack-db.ts
import { createDB } from "@tanstack/db";
import { createElectricCollection } from "@tanstack/db-electric";
import { documentsSchema, foldersSchema } from "./schemas";

export const db = createDB({
  collections: {
    documents: createElectricCollection({
      name: "documents",
      schema: documentsSchema,
    }),
    folders: createElectricCollection({
      name: "folders",
      schema: foldersSchema,
    }),
  },
});
```

### Optimistic Mutations

```typescript
// packages/app/src/hooks/useDocuments.ts
import { db } from "../lib/tanstack-db";

export function useDocuments(projectId: string) {
  // Live query - automatically updates when data changes
  const documents = db.documents.useQuery({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  });

  // Optimistic mutation - updates locally immediately
  const createDocument = async (data: CreateDocumentInput) => {
    const doc = await db.documents.insert({
      ...data,
      projectId,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return doc;
  };

  const updateDocument = async (id: string, data: UpdateDocumentInput) => {
    await db.documents.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  };

  const deleteDocument = async (id: string) => {
    await db.documents.delete({ where: { id } });
  };

  return { documents, createDocument, updateDocument, deleteDocument };
}
```

---

## Durable Streams (Yjs Document Persistence)

### Why Durable Streams for Yjs?

| Requirement         | ElectricSQL   | Durable Streams          |
| ------------------- | ------------- | ------------------------ |
| Structured metadata | ✅ Great fit  | ❌ Not designed for this |
| Yjs binary updates  | ❌ Not suited | ✅ Perfect fit           |
| Append-only log     | ❌ Row-based  | ✅ Native concept        |
| Resume from offset  | ❌ Polling    | ✅ Built-in              |
| Presence/awareness  | ❌ No         | ✅ Via separate stream   |

### Durable Stream Per Document Per Branch

Each Yjs document on each branch has its own durable stream. This allows branches to diverge independently.

Stream paths are denormalized with `projectId`, `documentId`, and `branchId` for easy identification and access control:

```
/stream/project/{projectId}/doc/{documentId}/branch/{branchId}        <- Yjs document updates
/stream/project/{projectId}/doc/{documentId}/branch/{branchId}/aware  <- Awareness/presence
```

This denormalized path structure enables:

- **Easy access control**: Check project permissions before allowing stream access
- **Simple identification**: Stream path tells you exactly what it contains
- **Consistent naming**: Same pattern as document table's durableStreamId field

When a branch is created, the Yjs stream is "forked" - the current state from the parent branch is copied as the initial state of the new branch's stream. From that point, edits on each branch append to their respective streams independently.

### Durable Streams Authorization Proxy

**All Durable Streams requests are proxied through our API** for authentication. The server:

1. Authenticates the user via session cookie
2. Verifies the user has access to the project
3. Checks write permissions for POST requests
4. Proxies to the Durable Streams server

```typescript
// packages/app/src/routes/api/docs/[docId]/stream.ts
import { createAPIFileRoute } from "@tanstack/start/api";
import { requireAuth } from "../../../../lib/auth-middleware";
import { verifyDocumentAccess } from "../../../../lib/permissions";

// GET/POST /api/docs/:docId/stream - Yjs document stream
export const Route = createAPIFileRoute("/api/docs/$docId/stream")({
  ALL: async ({ request, params }) => {
    const session = await requireAuth(request);
    const { docId } = params;

    // Verify user has access to the document's project
    // verifyDocumentAccess looks up the doc, finds its project,
    // and checks project_members for this user
    const access = await verifyDocumentAccess(session.user.id, docId);
    if (!access) {
      return new Response("Forbidden", { status: 403 });
    }

    // Check write permissions for POST
    if (request.method === "POST" && !access.canEdit) {
      return new Response("Read-only access", { status: 403 });
    }

    // Map to internal durable stream path (docId is globally unique)
    return proxyToDurableStream(request, `docs/${docId}`);
  },
});
```

```typescript
// packages/app/src/routes/api/docs/[docId]/awareness.ts
import { createAPIFileRoute } from "@tanstack/start/api";
import { requireAuth } from "../../../../lib/auth-middleware";
import { verifyDocumentAccess } from "../../../../lib/permissions";

// GET/POST /api/docs/:docId/awareness - presence stream
export const Route = createAPIFileRoute("/api/docs/$docId/awareness")({
  ALL: async ({ request, params }) => {
    const session = await requireAuth(request);
    const { docId } = params;

    const access = await verifyDocumentAccess(session.user.id, docId);
    if (!access) {
      return new Response("Forbidden", { status: 403 });
    }

    // Awareness is always writable if user has any access
    return proxyToDurableStream(request, `docs/${docId}/awareness`);
  },
});
```

```typescript
// packages/app/src/lib/durable-stream-proxy.ts
export async function proxyToDurableStream(
  request: Request,
  streamPath: string
): Promise<Response> {
  const url = new URL(request.url);

  const durableUrl = new URL(`/v1/stream/${streamPath}`, process.env.DURABLE_STREAMS_URL);

  // Forward query params (offset, live, etc.)
  for (const [key, value] of url.searchParams) {
    durableUrl.searchParams.set(key, value);
  }

  const response = await fetch(durableUrl.toString(), {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/octet-stream",
      Accept: request.headers.get("Accept") || "*/*",
    },
    body: request.method === "POST" ? request.body : undefined,
    // @ts-expect-error duplex is needed for streaming request bodies
    duplex: "half",
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
      "Cache-Control": response.headers.get("Cache-Control") || "no-cache",
    },
  });
}
```

### y-durable-streams Provider

We use the official `@durable-streams/y-durable-streams` package ([npm](https://www.npmjs.com/package/@durable-streams/y-durable-streams)) which provides a Yjs provider for Durable Streams.

See `packages/app/src/lib/yjs-sync.ts` for usage.

---

## Branching

Branching allows users to work on isolated copies of a project and later merge their changes back. This is similar to Git branches but designed for real-time collaborative CAD documents.

### Branch Concepts

| Concept            | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| **Main branch**    | The default branch for every project, named "main"               |
| **Feature branch** | A branch created from main (or another branch) for isolated work |
| **Fork point**     | The moment a branch was created; used for merge calculations     |
| **Merge**          | Combining a branch's changes back into another branch            |

### Branch Data Model

Each branch has:

- **name**: Short identifier (e.g., "main", "johns-experiment", "feature-fillet")
- **description**: Optional explanation of the branch's purpose
- **owner**: The user who owns/maintains this branch
- **parent branch**: Which branch it was forked from
- **fork timestamp**: When the branch was created

### How Branching Works with Yjs

When a user creates a branch:

1. **Create branch record** in Postgres with metadata
2. **Copy document records** - duplicate all documents and folders for the new branch
3. **Fork Yjs streams** - for each document:
   - Create a new Durable Stream for the branch
   - Copy the current Yjs state from parent branch's stream to new stream
   - From this point, the branch's stream diverges

```typescript
// Durable stream naming with branches
/stream/doc/{documentId}/branch/{branchId}        <- Yjs updates for this branch
/stream/doc/{documentId}/branch/{branchId}/aware  <- Awareness for this branch
```

### Branch Creation

```typescript
// packages/app/src/lib/branching.ts
import * as Y from "yjs";
import { DurableStreamHandle } from "@durable-streams/client";

export async function createBranch(
  projectId: string,
  parentBranchId: string,
  branchName: string,
  description?: string
): Promise<Branch> {
  // 1. Create branch record
  const branch = await db
    .insert(branches)
    .values({
      projectId,
      parentBranchId,
      name: branchName,
      description,
      forkedAt: new Date(),
      createdBy: session.user.id,
      ownerId: session.user.id,
    })
    .returning();

  // 2. Copy folders and documents to new branch
  const parentFolders = await db.select().from(folders).where(eq(folders.branchId, parentBranchId));

  for (const folder of parentFolders) {
    await db.insert(folders).values({
      ...folder,
      id: crypto.randomUUID(),
      branchId: branch.id,
    });
  }

  const parentDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.branchId, parentBranchId));

  for (const doc of parentDocs) {
    // Create new document record for this branch
    const newDoc = await db
      .insert(documents)
      .values({
        ...doc,
        id: doc.id, // Keep same document ID for merge tracking
        branchId: branch.id,
        durableStreamId: `project/${projectId}/doc/${doc.id}/branch/${branch.id}`,
      })
      .returning();

    // 3. Fork the Yjs stream - copy current state
    await forkDurableStream(
      `project/${projectId}/doc/${doc.id}/branch/${parentBranchId}`,
      `project/${projectId}/doc/${doc.id}/branch/${branch.id}`
    );
  }

  return branch;
}

async function forkDurableStream(sourceStreamId: string, targetStreamId: string) {
  const DURABLE_STREAMS_URL = process.env.DURABLE_STREAMS_URL!;

  // Read full state from source stream
  const sourceHandle = new DurableStreamHandle({
    url: `${DURABLE_STREAMS_URL}/v1/stream/${sourceStreamId}`,
  });

  // Get full Yjs state by replaying all updates
  const doc = new Y.Doc();
  const res = await sourceHandle.stream({ offset: "-1", live: false });
  const items = await res.json();

  for (const item of items) {
    const update =
      typeof item === "string"
        ? Uint8Array.from(atob(item), (c) => c.charCodeAt(0))
        : new Uint8Array(item);
    Y.applyUpdate(doc, update);
  }

  // Create new stream and write full state as first entry
  const targetHandle = new DurableStreamHandle({
    url: `${DURABLE_STREAMS_URL}/v1/stream/${targetStreamId}`,
  });

  // Write full document state as initial entry
  const fullState = Y.encodeStateAsUpdate(doc);
  await targetHandle.append(fullState);
}
```

### Merging Branches

Merging uses Yjs's built-in CRDT merge capabilities. The key insight is that Yjs documents can be merged by simply applying all updates from one document to another.

**Merge Strategy: "Edit Wins"**

When merging branch A into branch B:

- Documents edited in A are brought into B with their A state
- Documents deleted in B but edited in A are **restored** (edit wins over delete)
- Documents deleted in both are deleted
- Documents created in A are added to B
- Conflicts within a document are resolved by Yjs (concurrent edits merge)

```typescript
// packages/app/src/lib/branching.ts

export async function mergeBranch(
  sourceBranchId: string,
  targetBranchId: string
): Promise<MergeResult> {
  const sourceBranch = await db
    .select()
    .from(branches)
    .where(eq(branches.id, sourceBranchId))
    .limit(1);

  const sourceDocsMap = new Map(
    (await db.select().from(documents).where(eq(documents.branchId, sourceBranchId))).map((d) => [
      d.id,
      d,
    ])
  );

  const targetDocsMap = new Map(
    (await db.select().from(documents).where(eq(documents.branchId, targetBranchId))).map((d) => [
      d.id,
      d,
    ])
  );

  const mergeResults: MergeDocResult[] = [];

  // Process each document in source branch
  for (const [docId, sourceDoc] of sourceDocsMap) {
    const targetDoc = targetDocsMap.get(docId);

    if (!targetDoc) {
      // Document created in source branch - add to target
      await copyDocumentToBranch(sourceDoc, targetBranchId);
      mergeResults.push({ docId, action: "created" });
    } else if (targetDoc.isDeleted && !sourceDoc.isDeleted) {
      // Deleted in target but exists in source - RESTORE (edit wins)
      await restoreDocument(targetDoc.id, targetBranchId);
      await mergeYjsDocument(sourceDoc.durableStreamId!, targetDoc.durableStreamId!);
      mergeResults.push({ docId, action: "restored" });
    } else if (!sourceDoc.isDeleted) {
      // Both exist - merge Yjs states
      await mergeYjsDocument(sourceDoc.durableStreamId!, targetDoc.durableStreamId!);
      mergeResults.push({ docId, action: "merged" });
    }
  }

  // Mark source branch as merged
  await db
    .update(branches)
    .set({
      mergedAt: new Date(),
      mergedBy: session.user.id,
      mergedIntoBranchId: targetBranchId,
    })
    .where(eq(branches.id, sourceBranchId));

  return { branch: sourceBranch, results: mergeResults };
}

async function mergeYjsDocument(sourceStreamId: string, targetStreamId: string) {
  const DURABLE_STREAMS_URL = process.env.DURABLE_STREAMS_URL!;

  // Load source document state
  const sourceDoc = new Y.Doc();
  const sourceHandle = new DurableStreamHandle({
    url: `${DURABLE_STREAMS_URL}/v1/stream/${sourceStreamId}`,
  });
  const sourceRes = await sourceHandle.stream({ offset: "-1", live: false });
  const sourceItems = await sourceRes.json();
  for (const item of sourceItems) {
    const update =
      typeof item === "string"
        ? Uint8Array.from(atob(item), (c) => c.charCodeAt(0))
        : new Uint8Array(item);
    Y.applyUpdate(sourceDoc, update);
  }

  // Load target document state
  const targetDoc = new Y.Doc();
  const targetHandle = new DurableStreamHandle({
    url: `${DURABLE_STREAMS_URL}/v1/stream/${targetStreamId}`,
  });
  const targetRes = await targetHandle.stream({ offset: "-1", live: false });
  const targetItems = await targetRes.json();
  for (const item of targetItems) {
    const update =
      typeof item === "string"
        ? Uint8Array.from(atob(item), (c) => c.charCodeAt(0))
        : new Uint8Array(item);
    Y.applyUpdate(targetDoc, update);
  }

  // Compute the diff: changes in source that target doesn't have
  const diff = Y.encodeStateAsUpdate(sourceDoc, Y.encodeStateVector(targetDoc));

  // Append the diff to target stream (if there are changes)
  if (diff.length > 0) {
    await targetHandle.append(diff);
  }
}
```

### Branch UI

The UI should show:

1. **Branch selector** in the project header (dropdown showing current branch)
2. **Branch list panel** showing all branches with:
   - Branch name and description
   - Owner avatar
   - Created date
   - Status (active / merged)
3. **Create branch button** with name/description form
4. **Merge button** on non-main branches (merge into parent or main)
5. **Branch indicator** next to document names when on non-main branch

```tsx
// packages/app/src/components/BranchSelector.tsx
export function BranchSelector({ projectId, currentBranchId }: Props) {
  const branches = useBranches(projectId);
  const currentBranch = branches.find((b) => b.id === currentBranchId);

  return (
    <Select value={currentBranchId} onValueChange={switchBranch}>
      <SelectTrigger>
        <BranchIcon />
        <span>{currentBranch?.name ?? "main"}</span>
      </SelectTrigger>
      <SelectContent>
        {branches.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            <span>{branch.name}</span>
            {branch.isMain && <Badge>main</Badge>}
            {branch.mergedAt && <Badge variant="muted">merged</Badge>}
          </SelectItem>
        ))}
        <Separator />
        <Button onClick={openCreateBranchDialog}>
          <PlusIcon /> Create branch
        </Button>
      </SelectContent>
    </Select>
  );
}
```

---

## Following Users

The "follow" feature allows a user to follow another user's cursor, selection, and viewport in real-time. This uses Yjs Awareness for presence information.

### Awareness State Structure

```typescript
// packages/app/src/lib/awareness-state.ts

interface UserAwarenessState {
  // User identity
  user: {
    id: string;
    name: string;
    color: string; // Assigned color for cursor/highlights
  };

  // Current location in the app
  location: {
    documentId: string | null;
    branchId: string;
  };

  // 3D Viewer state (when in document)
  viewer?: {
    // Camera position and orientation
    cameraPosition: [number, number, number];
    cameraTarget: [number, number, number];
    cameraUp: [number, number, number];
    zoom: number;
  };

  // Selection state
  selection?: {
    featureIds: string[];
    faceRefs: string[];
    edgeRefs: string[];
  };

  // Sketch state (when in sketch mode)
  sketch?: {
    sketchId: string;
    cursorPosition: [number, number]; // 2D sketch coordinates
    activeToolId: string | null;
  };

  // Timestamp for staleness detection
  lastUpdated: number;
}
```

### Awareness Provider

```typescript
// packages/app/src/lib/awareness-provider.ts
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { DurableStreamsProvider } from "@durable-streams/y-durable-streams";

export class SolidTypeAwareness {
  private awareness: Awareness;
  private provider: DurableStreamAwarenessProvider;
  private localState: UserAwarenessState;

  constructor(doc: Y.Doc, documentId: string, branchId: string, user: User) {
    this.awareness = new Awareness(doc);

    // Simple URL - server handles auth and project lookup
    const awarenessUrl = `${import.meta.env.VITE_API_URL}/api/docs/${documentId}/awareness`;
    this.provider = new DurableStreamAwarenessProvider(awarenessUrl, this.awareness);

    // Set initial local state
    this.localState = {
      user: {
        id: user.id,
        name: user.name,
        color: generateUserColor(user.id),
      },
      location: {
        documentId,
        branchId,
      },
      lastUpdated: Date.now(),
    };

    this.awareness.setLocalState(this.localState);
  }

  // Update viewer state (called on camera change)
  updateViewerState(viewer: UserAwarenessState["viewer"]) {
    this.localState = {
      ...this.localState,
      viewer,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  // Update selection state
  updateSelection(selection: UserAwarenessState["selection"]) {
    this.localState = {
      ...this.localState,
      selection,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  // Update sketch cursor
  updateSketchCursor(sketch: UserAwarenessState["sketch"]) {
    this.localState = {
      ...this.localState,
      sketch,
      lastUpdated: Date.now(),
    };
    this.awareness.setLocalState(this.localState);
  }

  // Get all connected users
  getConnectedUsers(): UserAwarenessState[] {
    const states: UserAwarenessState[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.awareness.clientID && state) {
        states.push(state as UserAwarenessState);
      }
    });
    return states;
  }

  // Subscribe to awareness changes
  onUsersChange(callback: (users: UserAwarenessState[]) => void) {
    this.awareness.on("change", () => {
      callback(this.getConnectedUsers());
    });
  }
}
```

### Following Implementation

```typescript
// packages/app/src/hooks/useFollowing.ts
import { useState, useEffect, useCallback } from "react";
import { useAwareness } from "../contexts/AwarenessContext";
import { useViewer } from "../contexts/ViewerContext";

export function useFollowing() {
  const awareness = useAwareness();
  const viewer = useViewer();
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<UserAwarenessState[]>([]);

  // Update connected users list
  useEffect(() => {
    if (!awareness) return;

    const updateUsers = () => {
      setConnectedUsers(awareness.getConnectedUsers());
    };

    awareness.onUsersChange(updateUsers);
    updateUsers();
  }, [awareness]);

  // Follow a user - sync camera to their view
  const followUser = useCallback((userId: string) => {
    setFollowingUserId(userId);
  }, []);

  const stopFollowing = useCallback(() => {
    setFollowingUserId(null);
  }, []);

  // Apply followed user's camera state
  useEffect(() => {
    if (!followingUserId || !viewer) return;

    const followedUser = connectedUsers.find((u) => u.user.id === followingUserId);
    if (!followedUser?.viewer) return;

    // Smoothly animate camera to followed user's position
    viewer.animateCameraTo({
      position: followedUser.viewer.cameraPosition,
      target: followedUser.viewer.cameraTarget,
      up: followedUser.viewer.cameraUp,
      duration: 300,
    });
  }, [followingUserId, connectedUsers, viewer]);

  // Stop following if user moves camera manually
  useEffect(() => {
    if (!followingUserId || !viewer) return;

    const handleUserInteraction = () => {
      // Only stop if user actively moved camera
      if (viewer.isUserInteracting) {
        stopFollowing();
      }
    };

    viewer.controls.addEventListener("change", handleUserInteraction);
    return () => {
      viewer.controls.removeEventListener("change", handleUserInteraction);
    };
  }, [followingUserId, viewer, stopFollowing]);

  return {
    connectedUsers,
    followingUserId,
    followUser,
    stopFollowing,
    isFollowing: followingUserId !== null,
  };
}
```

### Following UI

```tsx
// packages/app/src/components/UserPresence.tsx
export function UserPresence() {
  const { connectedUsers, followingUserId, followUser, stopFollowing } = useFollowing();

  return (
    <div className="user-presence">
      {connectedUsers.map((user) => (
        <Tooltip key={user.user.id} content={user.user.name}>
          <button
            className={cn("user-avatar", followingUserId === user.user.id && "following")}
            style={{ borderColor: user.user.color }}
            onClick={() =>
              followingUserId === user.user.id ? stopFollowing() : followUser(user.user.id)
            }
          >
            <Avatar fallback={user.user.name[0]} />
            {followingUserId === user.user.id && <EyeIcon className="following-indicator" />}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
```

### Visual Indicators for Other Users

Show other users' cursors and selections in the viewer:

```tsx
// packages/app/src/components/UserCursors3D.tsx
import { useFollowing } from "../hooks/useFollowing";
import { Html } from "@react-three/drei";

export function UserCursors3D() {
  const { connectedUsers } = useFollowing();

  return (
    <>
      {connectedUsers.map((user) => (
        <group key={user.user.id}>
          {/* Show user's camera position as a small indicator */}
          {user.viewer && (
            <Html
              position={user.viewer.cameraPosition}
              distanceFactor={10}
              className="user-camera-indicator"
            >
              <div className="user-marker" style={{ backgroundColor: user.user.color }}>
                <span>{user.user.name}</span>
              </div>
            </Html>
          )}

          {/* Highlight user's selected faces/edges */}
          {user.selection?.faceRefs.map((ref) => (
            <FaceHighlight key={ref} faceRef={ref} color={user.user.color} opacity={0.3} />
          ))}
        </group>
      ))}
    </>
  );
}
```

### Sketch Mode Cursors

In sketch mode, show other users' 2D cursors:

```tsx
// packages/app/src/components/SketchCursors.tsx
export function SketchCursors() {
  const { connectedUsers } = useFollowing();
  const { sketchId } = useSketchContext();

  // Filter to users in the same sketch
  const usersInSketch = connectedUsers.filter((u) => u.sketch?.sketchId === sketchId);

  return (
    <svg className="sketch-cursors-overlay">
      {usersInSketch.map((user) => (
        <g
          key={user.user.id}
          transform={`translate(${user.sketch!.cursorPosition[0]}, ${user.sketch!.cursorPosition[1]})`}
        >
          <circle r="4" fill={user.user.color} />
          <text x="8" y="4" fill={user.user.color} fontSize="12">
            {user.user.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
```

---

## TanStack Start Server Routes

### Authentication Routes

```typescript
// packages/app/src/routes/api/auth/[...auth].ts
import { createAPIFileRoute } from "@tanstack/start/api";
import { auth } from "../../../lib/auth";

export const Route = createAPIFileRoute("/api/auth/$")({
  GET: async ({ request }) => {
    return auth.handler(request);
  },
  POST: async ({ request }) => {
    return auth.handler(request);
  },
});
```

### Workspace Routes

```typescript
// packages/app/src/routes/api/workspaces.ts
import { createAPIFileRoute } from "@tanstack/start/api";
import { db } from "../../lib/db";
import { workspaces, workspaceMembers } from "../../db/schema";
import { requireAuth } from "../../lib/auth-middleware";

export const Route = createAPIFileRoute("/api/workspaces")({
  GET: async ({ request }) => {
    const session = await requireAuth(request);

    // Get workspaces user is a member of
    const userWorkspaces = await db
      .select()
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, session.user.id));

    return Response.json(userWorkspaces);
  },

  POST: async ({ request }) => {
    const session = await requireAuth(request);
    const body = await request.json();

    // Create workspace and add creator as owner
    const [workspace] = await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({
          name: body.name,
          slug: body.slug,
          createdBy: session.user.id,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: session.user.id,
        role: "owner",
      });

      return [ws];
    });

    return Response.json(workspace, { status: 201 });
  },
});
```

### Project Routes

```typescript
// packages/app/src/routes/api/workspaces/[workspaceId]/projects.ts
import { createAPIFileRoute } from "@tanstack/start/api";
import { db } from "../../../../lib/db";
import { projects, projectMembers } from "../../../../db/schema";
import { requireWorkspaceMember } from "../../../../lib/auth-middleware";

export const Route = createAPIFileRoute("/api/workspaces/$workspaceId/projects")({
  GET: async ({ request, params }) => {
    const session = await requireWorkspaceMember(request, params.workspaceId);

    // Get projects user has access to in this workspace
    const userProjects = await db
      .select()
      .from(projects)
      .leftJoin(projectMembers, eq(projects.id, projectMembers.projectId))
      .where(
        and(
          eq(projects.workspaceId, params.workspaceId),
          or(
            eq(projectMembers.userId, session.user.id)
            // Workspace admins/owners see all projects
            // ... additional access logic
          )
        )
      );

    return Response.json(userProjects);
  },

  POST: async ({ request, params }) => {
    const session = await requireWorkspaceMember(request, params.workspaceId);
    const body = await request.json();

    const [project] = await db.transaction(async (tx) => {
      const [proj] = await tx
        .insert(projects)
        .values({
          workspaceId: params.workspaceId,
          name: body.name,
          createdBy: session.user.id,
        })
        .returning();

      // Creator is project owner
      await tx.insert(projectMembers).values({
        projectId: proj.id,
        userId: session.user.id,
        role: "owner",
        canEdit: true,
      });

      return [proj];
    });

    return Response.json(project, { status: 201 });
  },
});
```

### Server Functions (RPC)

```typescript
// packages/app/src/lib/server-functions.ts
import { createServerFn } from "@tanstack/start";
import { db } from "./db";
import { documents } from "../db/schema";

// Server function for creating a document with Durable Stream
export const createDocument = createServerFn(
  "POST",
  async (input: { projectId: string; name: string; type: "part" | "assembly" | "drawing" }) => {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    // Verify project access
    const hasAccess = await verifyProjectAccess(session.user.id, input.projectId);
    if (!hasAccess) throw new Error("Forbidden");

    const documentId = crypto.randomUUID();

    // Create the Durable Stream for this document
    const durableStreamId = `doc/${documentId}`;
    await createDurableStream(durableStreamId);

    // Create document record
    const [doc] = await db
      .insert(documents)
      .values({
        id: documentId,
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        durableStreamId,
        createdBy: session.user.id,
      })
      .returning();

    return doc;
  }
);
```

---

## Permissions Model

### Role Hierarchy

```
Workspace Level:
  owner   → Full control of workspace, can delete it
  admin   → Manage members, create/delete projects
  member  → Create projects, join projects they're invited to

Project Level:
  owner   → Full control of project, can delete it
  admin   → Manage project members, all documents
  member  → View and edit all documents (if canEdit=true)
  guest   → View-only access to project (canEdit=false)
```

### Permission Checking

```typescript
// packages/app/src/lib/permissions.ts

export type Permission =
  | "workspace:read"
  | "workspace:write"
  | "workspace:delete"
  | "workspace:manage_members"
  | "project:read"
  | "project:write"
  | "project:delete"
  | "project:manage_members"
  | "document:read"
  | "document:write"
  | "document:delete";

const workspacePermissions: Record<WorkspaceRole, Permission[]> = {
  owner: ["workspace:read", "workspace:write", "workspace:delete", "workspace:manage_members"],
  admin: ["workspace:read", "workspace:write", "workspace:manage_members"],
  member: ["workspace:read"],
};

const projectPermissions: Record<ProjectRole, (canEdit: boolean) => Permission[]> = {
  owner: () => [
    "project:read",
    "project:write",
    "project:delete",
    "project:manage_members",
    "document:read",
    "document:write",
    "document:delete",
  ],
  admin: () => [
    "project:read",
    "project:write",
    "project:manage_members",
    "document:read",
    "document:write",
    "document:delete",
  ],
  member: (canEdit) =>
    canEdit
      ? ["project:read", "document:read", "document:write"]
      : ["project:read", "document:read"],
  guest: (canEdit) =>
    canEdit
      ? ["project:read", "document:read", "document:write"]
      : ["project:read", "document:read"],
};

export async function checkPermission(
  userId: string,
  permission: Permission,
  context: { workspaceId?: string; projectId?: string }
): Promise<boolean> {
  // Implementation checks user's role in workspace/project
  // and returns whether they have the requested permission
}

// Used by stream proxy routes - looks up doc to find project, then checks access
export async function verifyDocumentAccess(
  userId: string,
  documentId: string
): Promise<{ canEdit: boolean } | null> {
  // Look up document to get projectId
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    columns: { projectId: true },
  });

  if (!doc) return null;

  // Check project membership
  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, doc.projectId), eq(projectMembers.userId, userId)),
  });

  if (!membership) return null;

  return { canEdit: membership.canEdit };
}

// Used by project-level routes
export async function verifyProjectAccess(
  userId: string,
  projectId: string
): Promise<{ canEdit: boolean; role: string } | null> {
  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  });

  if (!membership) return null;

  return { canEdit: membership.canEdit, role: membership.role };
}
```

### Row-Level Security for Electric

Electric shapes need to respect permissions. Configure PostgreSQL RLS policies:

```sql
-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Documents policy: user must have project access
CREATE POLICY documents_select ON documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM project_members
    WHERE project_members.project_id = documents.project_id
    AND project_members.user_id = current_user_id()
  )
);

-- Similar policies for INSERT, UPDATE, DELETE with canEdit check
```

---

## Docker Configuration

### docker-compose.yml

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: solidtype
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: solidtype
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U solidtype"]
      interval: 10s
      timeout: 5s
      retries: 5

  electric:
    image: electricsql/electric:latest
    environment:
      DATABASE_URL: postgresql://solidtype:${POSTGRES_PASSWORD}@postgres:5432/solidtype
      ELECTRIC_WRITE_TO_PG_MODE: direct_writes
      AUTH_MODE: insecure # Configure properly for production
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy

  durable-streams:
    build:
      context: ./services/durable-streams
      dockerfile: Dockerfile
    environment:
      PORT: 4437
      STORAGE_PATH: /data/streams
    volumes:
      - streams_data:/data/streams
    ports:
      - "4437:4437"

volumes:
  postgres_data:
  streams_data:
```

### Durable Streams Server

We run `@durable-streams/server` as a simple Node.js service with file-based storage:

```typescript
// services/durable-streams/server.ts
import { DurableStreamTestServer } from "@durable-streams/server";

const port = parseInt(process.env.PORT || "4437");
const host = process.env.HOST || "0.0.0.0";

const server = new DurableStreamTestServer({
  port,
  host,
  // File-based storage - streams are persisted to disk
  // The server stores each stream as files in the working directory
});

await server.start();
console.log(`Durable Streams server running on ${server.baseUrl}`);
```

```dockerfile
# services/durable-streams/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy server code
COPY . .

# Create data directory
RUN mkdir -p /data/streams
WORKDIR /data/streams

# Run server
CMD ["node", "--loader", "ts-node/esm", "/app/server.ts"]
```

```json
// services/durable-streams/package.json
{
  "name": "solidtype-durable-streams",
  "type": "module",
  "dependencies": {
    "@durable-streams/server": "^0.1.0"
  },
  "devDependencies": {
    "ts-node": "^10.9.0",
    "typescript": "^5.3.0"
  }
}
```

### Development Setup

```bash
# Start services
docker-compose up -d

# Run migrations
pnpm drizzle-kit push

# Start app in dev mode
pnpm dev
```

### Local Development (without Docker)

For local development, you can run the durable streams server directly:

```bash
# In a separate terminal
cd services/durable-streams
pnpm install
pnpm start
```

Or use the test server programmatically in your dev setup:

```typescript
// packages/app/scripts/dev-streams.ts
import { DurableStreamTestServer } from "@durable-streams/server";

const server = new DurableStreamTestServer({
  port: 4437,
  host: "127.0.0.1",
});

await server.start();
console.log(`Dev streams server: ${server.baseUrl}`);
```

---

## Sync Flow Diagrams

### Opening a Project

```
User                    App                    Electric             Postgres
  │                      │                        │                    │
  │  Open Project        │                        │                    │
  ├─────────────────────>│                        │                    │
  │                      │                        │                    │
  │                      │  Subscribe to shapes   │                    │
  │                      │  (documents, folders)  │                    │
  │                      ├───────────────────────>│                    │
  │                      │                        │                    │
  │                      │                        │   Initial sync     │
  │                      │                        │<──────────────────>│
  │                      │                        │                    │
  │                      │  Shape data (SSE)      │                    │
  │                      │<───────────────────────│                    │
  │                      │                        │                    │
  │  Render doc list     │                        │                    │
  │<─────────────────────│                        │                    │
  │                      │                        │                    │
```

### Opening a Document

```
User                    App                  Durable Stream         Postgres
  │                      │                        │                    │
  │  Open Document       │                        │                    │
  ├─────────────────────>│                        │                    │
  │                      │                        │                    │
  │                      │  Create Y.Doc          │                    │
  │                      ├─────────┐              │                    │
  │                      │<────────┘              │                    │
  │                      │                        │                    │
  │                      │  Stream (offset=-1)    │                    │
  │                      ├───────────────────────>│                    │
  │                      │                        │                    │
  │                      │  Yjs updates (catch-up)│                    │
  │                      │<───────────────────────│                    │
  │                      │                        │                    │
  │                      │  Apply updates to Y.Doc│                    │
  │                      ├─────────┐              │                    │
  │                      │<────────┘              │                    │
  │                      │                        │                    │
  │  Render CAD view     │                        │                    │
  │<─────────────────────│                        │                    │
  │                      │                        │                    │
  │                      │  Live updates (SSE)    │                    │
  │                      │<───────────────────────│ (continuous)       │
```

### Editing a Document

```
User                    App                  Durable Stream      Other Client
  │                      │                        │                    │
  │  Edit (e.g. extrude) │                        │                    │
  ├─────────────────────>│                        │                    │
  │                      │                        │                    │
  │                      │  Y.Doc update (local)  │                    │
  │                      ├─────────┐              │                    │
  │                      │<────────┘              │                    │
  │                      │                        │                    │
  │                      │  Append update         │                    │
  │                      ├───────────────────────>│                    │
  │                      │                        │                    │
  │                      │                        │  Stream update     │
  │                      │                        ├───────────────────>│
  │                      │                        │                    │
  │                      │                        │                    │  Apply & render
  │                      │                        │                    ├─────────┐
  │                      │                        │                    │<────────┘
```

---

## Implementation Phases

### Phase 27a: Database & Auth Foundation

1. Set up Drizzle with PostgreSQL
2. Define all database schemas
3. Implement Drizzle migrations
4. Set up better-auth
5. Create auth routes and middleware
6. Add login/signup UI pages

**Deliverables:**

- [ ] Docker compose with Postgres running
- [ ] All schema tables created
- [ ] Auth flow working (email/password)
- [ ] Protected routes require authentication

### Phase 27b: Workspaces & Projects

1. Implement workspace CRUD
2. Implement project CRUD
3. Add workspace/project member management
4. Create workspace and project list UIs
5. Set up permission checking

**Deliverables:**

- [ ] Create/list/update/delete workspaces
- [ ] Create/list/update/delete projects
- [ ] Invite users to workspaces/projects
- [ ] Permission checks on all operations

### Phase 27c: Electric Sync Integration

1. Set up Electric container
2. Configure Electric shapes for documents/folders
3. Integrate TanStack DB with Electric
4. Implement document/folder list with live queries
5. Add optimistic mutations

**Deliverables:**

- [ ] Electric syncing documents/folders
- [ ] Real-time updates across clients
- [ ] Offline-capable document list

### Phase 27d: Durable Streams for Yjs

1. Set up Durable Streams container
2. Implement YjsDurableStreamProvider
3. Migrate from current Yjs setup to Durable Streams
4. Add awareness/presence streaming
5. Handle reconnection and offline queue

**Deliverables:**

- [ ] Yjs documents persisted to Durable Streams
- [ ] Multi-user real-time editing works
- [ ] Presence indicators show active users
- [ ] Offline edits sync on reconnect

### Phase 27e: Branching

1. Implement branches table and CRUD operations
2. Create branch forking logic (copy docs + fork streams)
3. Implement branch merge with "edit wins" strategy
4. Add branch selector UI in project header
5. Add branch list panel with metadata display
6. Handle merge conflicts and UI feedback

**Deliverables:**

- [ ] Create branch from main or other branch
- [ ] Switch between branches
- [ ] Merge branch into target with edit-wins strategy
- [ ] Branch list shows name, description, owner, status
- [ ] Deleted docs restored when edited version is merged

### Phase 27f: Following & Presence

1. Implement SolidTypeAwareness provider
2. Add camera/selection/cursor state to awareness
3. Create useFollowing hook
4. Add UserPresence component (avatar bar)
5. Implement UserCursors3D for 3D view
6. Implement SketchCursors for 2D sketch mode
7. Add smooth camera animation when following

**Deliverables:**

- [ ] See other users' avatars when in same document
- [ ] Click user avatar to follow their view
- [ ] Camera smoothly tracks followed user
- [ ] Manual interaction stops following
- [ ] Other users' selections highlighted in viewer
- [ ] Other users' cursors visible in sketch mode

### Phase 27g: Full Integration & Polish

1. Connect all pieces together
2. Add document creation flow with branch awareness
3. Implement folder management
4. Polish UI and error handling
5. Performance optimization for large projects

**Deliverables:**

- [ ] Full end-to-end workflow working
- [ ] Create document → edit → save → share
- [ ] Multi-user collaboration tested
- [ ] Branching workflow tested end-to-end
- [ ] Following works smoothly
- [ ] Error states handled gracefully

---

## Migration Path

### From Current Local-Only State

The current app uses a single local Yjs document. Migration steps:

1. **Add auth UI** without requiring login initially
2. **Add "save to cloud" action** that:
   - Creates a document record in Postgres
   - Creates a Durable Stream
   - Pushes current Yjs state to stream
3. **Add workspace/project picker** before document creation
4. **Eventually require auth** for cloud features

### Preserving Local-Only Mode

Keep a "local mode" for:

- Demo/playground without account
- Offline-first new documents
- Export/import for data portability

---

## Testing Plan

### Unit Tests

```typescript
describe("Permissions", () => {
  test("workspace owner has all permissions", () => {
    // ...
  });

  test("project guest cannot edit documents", () => {
    // ...
  });
});

describe("Electric Sync", () => {
  test("documents shape filters by branch_id", () => {
    // ...
  });
});

describe("Durable Streams", () => {
  test("Yjs updates are persisted", () => {
    // ...
  });

  test("reconnection resumes from last offset", () => {
    // ...
  });
});

describe("Branching", () => {
  test("createBranch copies all documents to new branch", () => {
    // ...
  });

  test("createBranch forks Yjs streams correctly", () => {
    // ...
  });

  test("mergeBranch applies source changes to target", () => {
    // ...
  });

  test("mergeBranch restores deleted docs that were edited (edit wins)", () => {
    // 1. Create doc in main
    // 2. Branch to feature
    // 3. Delete doc in main
    // 4. Edit doc in feature
    // 5. Merge feature → main
    // 6. Doc should be restored with feature edits
  });

  test("mergeBranch handles concurrent Yjs edits", () => {
    // Yjs CRDT merge should work correctly
  });
});

describe("Following", () => {
  test("awareness state includes user info", () => {
    // ...
  });

  test("following user updates camera position", () => {
    // ...
  });

  test("user interaction stops following", () => {
    // ...
  });
});
```

### Integration Tests

- [ ] Auth flow (signup → login → logout)
- [ ] Workspace CRUD with permissions
- [ ] Project CRUD with permissions
- [ ] Document sync across two clients
- [ ] Presence updates visible to collaborators
- [ ] Branch creation copies documents and streams
- [ ] Branch merge applies changes correctly
- [ ] Edit-wins: deleted doc restored when merged from branch where edited
- [ ] Following user syncs camera smoothly
- [ ] Following stops on manual interaction

### Manual Testing

- [ ] Two browsers, same document, real-time edits visible
- [ ] Offline edit → reconnect → sync successful
- [ ] Permission denied shows appropriate error
- [ ] Large document (1000+ features) syncs correctly
- [ ] Create branch → make changes → merge back to main
- [ ] Delete doc in main, edit in branch, merge → doc restored
- [ ] Multiple concurrent merges don't corrupt data
- [ ] Following works across 3D view navigation
- [ ] Following works in sketch mode with cursor display
- [ ] User avatars show color-coded presence

---

## Open Questions

### 1. Electric Authorization

~~ElectricSQL shapes need to respect permissions. Options:~~

**Decision:** Proxy all Electric shape requests through our API. The server constructs the WHERE clause after authenticating the user. Electric supports subqueries in WHERE clauses, so we can filter by project membership.

See the [Electric Shapes section](#electric-authorization-proxy) for implementation details.

### 2. Durable Streams Server Scaling

We use `@durable-streams/server` with file-based storage for simplicity. For production:

- **File storage** - Simple, works well for moderate scale
- **Shared storage** - For horizontal scaling, would need shared filesystem (NFS, EFS)
- **Custom backend** - Could implement database-backed storage for better scaling

**Current thinking:** File storage is fine for initial launch. Monitor and optimize later.

### 3. Large Document Handling

For documents with many features:

- **Lazy loading** - load Yjs incrementally?
- **Pagination** - not really applicable to Yjs
- **Compression** - Yjs supports encoding

**Current thinking:** Yjs handles this well; monitor performance.

### 4. Branch Merge Conflicts

When merging, Yjs handles most conflicts automatically (CRDT), but CAD-specific issues remain:

- **Broken references** - if a feature references another feature that was deleted on one branch
- **Impossible geometry** - concurrent edits could create invalid models
- **Parameter conflicts** - same parameter changed to different values

**Current thinking:**

- Trust Yjs for merge; let the CAD kernel fail gracefully on rebuild
- Show clear error messages when merged model has issues
- Future: pre-merge validation that warns about potential conflicts

### 5. Branch Cleanup

What happens to old branches?

- **Keep forever** - simple but clutters the list
- **Auto-archive after merge** - hide but don't delete
- **Manual delete** - user must explicitly clean up
- **Retention policy** - delete after X days/weeks

**Current thinking:** Auto-archive merged branches; show "archived" filter toggle.

### 6. Long-Running Branches

If a branch lives for weeks, main may diverge significantly:

- **Rebase** - complex with Yjs (would need to replay edits)
- **Merge main into branch periodically** - keeps branch up-to-date
- **Conflict preview** - show what would conflict before merge

**Current thinking:** Support "update from main" operation that merges main into branch.

---

## Dependencies

### New packages for app

```json
{
  "dependencies": {
    "@electric-sql/client": "^0.x.x",
    "@tanstack/db": "^0.x.x",
    "@tanstack/db-react": "^0.x.x",
    "@durable-streams/client": "^0.x.x",
    "better-auth": "^1.x.x",
    "drizzle-orm": "^0.x.x",
    "pg": "^8.x.x"
  },
  "devDependencies": {
    "@types/pg": "^8.x.x",
    "drizzle-kit": "^0.x.x"
  }
}
```

### Environment Variables

```bash
# .env
DATABASE_URL=postgresql://solidtype:password@localhost:5432/solidtype
VITE_API_URL=http://localhost:3001
VITE_ELECTRIC_URL=http://localhost:3000
VITE_DURABLE_STREAMS_URL=http://localhost:4437

# OAuth (optional)
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

---

## Related Documents

- [DOCUMENT-MODEL.md](/DOCUMENT-MODEL.md) - Current Yjs document structure
- [ARCHITECTURE.md](/ARCHITECTURE.md) - Overall app architecture
- [01-document-model.md](01-document-model.md) - Yjs setup details

---

## References

- [ElectricSQL Documentation](https://electric-sql.com/docs) - Real-time Postgres sync
- [TanStack DB Documentation](https://tanstack.com/db/latest) - Client-side reactive store
- [Durable Streams Protocol](https://github.com/durable-streams/durable-streams/blob/main/PROTOCOL.md) - Stream protocol spec
- [better-auth Documentation](https://better-auth.com) - Authentication library
- [Drizzle ORM Documentation](https://orm.drizzle.team) - TypeScript ORM
