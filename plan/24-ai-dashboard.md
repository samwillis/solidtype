# Phase 24: AI Dashboard Integration

> **Status:** ✅ **COMPLETE**
>
> Dashboard AI tools are implemented and working. See [AI-INTEGRATION.md](/AI-INTEGRATION.md) for architecture details.

## Prerequisites

- Phase 23: AI Core Infrastructure

## Goals

- Enable AI to perform all dashboard operations via natural language
- Implement workspace, project, document, and branch management tools
- Create the dashboard AI chat UI integration
- Build the dashboard-specific system prompt

---

## 1. Dashboard System Prompt

```typescript
// packages/app/src/lib/ai/prompts/dashboard.ts

export function buildDashboardSystemPrompt(userId: string, workspaceId?: string): string {
  return `
You are an AI assistant for SolidType, a collaborative CAD application.

## Your Role
You help users manage their workspaces, projects, documents, and branches through natural language.

## Available Actions
Use the provided tools to:
- List and create workspaces
- List and create projects within workspaces
- List and create documents (CAD parts and assemblies)
- List and create branches for version control
- Create and organize folders
- Open projects and documents
- Search across all content

## Guidelines
1. Be concise and action-oriented
2. When creating items, confirm the action was successful with the details
3. When listing items, format them clearly and ask if the user wants to take action
4. If the user wants to work on a specific document, offer to open it in the editor
5. For ambiguous requests, ask clarifying questions
6. When navigating, confirm where you're taking the user

## User Context
- User ID: ${userId}
${workspaceId ? `- Current Workspace: ${workspaceId}` : "- No workspace selected"}
`;
}
```

---

## 2. Dashboard Tool Definitions

### Workspace Tools

```typescript
// packages/app/src/lib/ai/tools/dashboard.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const listWorkspacesDef = toolDefinition({
  name: "listWorkspaces",
  description: "List all workspaces the user has access to",
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(["owner", "admin", "member"]),
    })
  ),
});

export const createWorkspaceDef = toolDefinition({
  name: "createWorkspace",
  description: "Create a new workspace",
  inputSchema: z.object({
    name: z.string().min(1).max(100),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().max(500).optional(),
  }),
  outputSchema: z.object({
    workspaceId: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
});

export const getWorkspaceDef = toolDefinition({
  name: "getWorkspace",
  description: "Get details about a specific workspace",
  inputSchema: z.object({
    workspaceId: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    memberCount: z.number(),
    projectCount: z.number(),
  }),
});
```

### Project Tools

```typescript
export const listProjectsDef = toolDefinition({
  name: "listProjects",
  description: "List projects, optionally filtered by workspace",
  inputSchema: z.object({
    workspaceId: z.string().optional(),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      workspaceId: z.string(),
      workspaceName: z.string(),
      updatedAt: z.string(),
    })
  ),
});

export const createProjectDef = toolDefinition({
  name: "createProject",
  description: "Create a new project in a workspace",
  inputSchema: z.object({
    workspaceId: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    name: z.string(),
  }),
});

export const openProjectDef = toolDefinition({
  name: "openProject",
  description: "Navigate to a project to view its contents",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    url: z.string(),
    navigated: z.boolean(),
  }),
});

export const getProjectDef = toolDefinition({
  name: "getProject",
  description: "Get details about a specific project",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    workspaceId: z.string(),
    workspaceName: z.string(),
    branchCount: z.number(),
    documentCount: z.number(),
    updatedAt: z.string(),
  }),
});
```

### Document Tools

```typescript
export const listDocumentsDef = toolDefinition({
  name: "listDocuments",
  description: "List documents in a project branch",
  inputSchema: z.object({
    projectId: z.string(),
    branchId: z.string().optional(),
    folderId: z.string().optional(),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["part", "assembly"]),
      updatedAt: z.string(),
      folderId: z.string().optional(),
    })
  ),
});

export const createDocumentDef = toolDefinition({
  name: "createDocument",
  description: "Create a new CAD document (part or assembly)",
  inputSchema: z.object({
    branchId: z.string(),
    name: z.string().min(1).max(100),
    type: z.enum(["part", "assembly"]).default("part"),
    folderId: z.string().optional(),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    name: z.string(),
  }),
});

export const openDocumentDef = toolDefinition({
  name: "openDocument",
  description: "Open a document in the CAD editor",
  inputSchema: z.object({
    documentId: z.string(),
  }),
  outputSchema: z.object({
    url: z.string(),
    navigated: z.boolean(),
  }),
});

export const renameDocumentDef = toolDefinition({
  name: "renameDocument",
  description: "Rename a document",
  inputSchema: z.object({
    documentId: z.string(),
    newName: z.string().min(1).max(100),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    name: z.string(),
  }),
});

export const moveDocumentDef = toolDefinition({
  name: "moveDocument",
  description: "Move a document to a different folder",
  inputSchema: z.object({
    documentId: z.string(),
    folderId: z.string().nullable(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

export const deleteDocumentDef = toolDefinition({
  name: "deleteDocument",
  description: "Delete a document (requires confirmation)",
  inputSchema: z.object({
    documentId: z.string(),
    confirm: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});
```

### Branch Tools

```typescript
export const listBranchesDef = toolDefinition({
  name: "listBranches",
  description: "List branches in a project",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isMain: z.boolean(),
      createdAt: z.string(),
    })
  ),
});

export const createBranchDef = toolDefinition({
  name: "createBranch",
  description: "Create a new branch from an existing branch",
  inputSchema: z.object({
    projectId: z.string(),
    parentBranchId: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
  }),
  outputSchema: z.object({
    branchId: z.string(),
    name: z.string(),
  }),
});

export const switchBranchDef = toolDefinition({
  name: "switchBranch",
  description: "Switch to a different branch",
  inputSchema: z.object({
    branchId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branchName: z.string(),
  }),
});

export const mergeBranchDef = toolDefinition({
  name: "mergeBranch",
  description: "Merge a source branch into a target branch. Returns conflicts if any exist.",
  inputSchema: z.object({
    sourceBranchId: z.string(),
    targetBranchId: z.string(),
    dryRun: z.boolean().optional().describe("If true, only check for conflicts without merging"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    merged: z.boolean(),
    conflicts: z.array(
      z.object({
        documentId: z.string(),
        documentName: z.string(),
        type: z.enum(["modified-both", "deleted-modified", "modified-deleted"]),
      })
    ),
    mergedDocumentCount: z.number(),
  }),
});

export const resolveMergeConflictDef = toolDefinition({
  name: "resolveMergeConflict",
  description: "Resolve a merge conflict by choosing which version to keep",
  inputSchema: z.object({
    sourceBranchId: z.string(),
    targetBranchId: z.string(),
    documentId: z.string(),
    resolution: z.enum(["keep-source", "keep-target", "keep-both"]),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    documentName: z.string(),
  }),
});

export const getBranchDiffDef = toolDefinition({
  name: "getBranchDiff",
  description: "Get a summary of differences between two branches",
  inputSchema: z.object({
    sourceBranchId: z.string(),
    targetBranchId: z.string(),
  }),
  outputSchema: z.object({
    added: z.array(z.object({ id: z.string(), name: z.string() })),
    modified: z.array(z.object({ id: z.string(), name: z.string() })),
    deleted: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const deleteBranchDef = toolDefinition({
  name: "deleteBranch",
  description: "Delete a branch (cannot delete main branch)",
  inputSchema: z.object({
    branchId: z.string(),
    confirm: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branchName: z.string(),
  }),
});
```

### Folder Tools

```typescript
export const listFoldersDef = toolDefinition({
  name: "listFolders",
  description: "List folders in a branch",
  inputSchema: z.object({
    branchId: z.string(),
    parentFolderId: z.string().optional(),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      parentId: z.string().optional(),
    })
  ),
});

export const createFolderDef = toolDefinition({
  name: "createFolder",
  description: "Create a folder to organize documents",
  inputSchema: z.object({
    branchId: z.string(),
    name: z.string().min(1).max(100),
    parentFolderId: z.string().optional(),
  }),
  outputSchema: z.object({
    folderId: z.string(),
    name: z.string(),
  }),
});

export const renameFolderDef = toolDefinition({
  name: "renameFolder",
  description: "Rename a folder",
  inputSchema: z.object({
    folderId: z.string(),
    newName: z.string().min(1).max(100),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    name: z.string(),
  }),
});

export const deleteFolderDef = toolDefinition({
  name: "deleteFolder",
  description: "Delete an empty folder",
  inputSchema: z.object({
    folderId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});
```

### Search Tools

```typescript
export const searchDocumentsDef = toolDefinition({
  name: "searchDocuments",
  description: "Search for documents by name across all accessible projects",
  inputSchema: z.object({
    query: z.string().min(1),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      projectId: z.string(),
      projectName: z.string(),
      workspaceName: z.string(),
    })
  ),
});

export const searchProjectsDef = toolDefinition({
  name: "searchProjects",
  description: "Search for projects by name",
  inputSchema: z.object({
    query: z.string().min(1),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      workspaceId: z.string(),
      workspaceName: z.string(),
    })
  ),
});
```

### Export All Dashboard Tools

```typescript
export const dashboardToolDefs = [
  // Workspaces
  listWorkspacesDef,
  createWorkspaceDef,
  getWorkspaceDef,
  // Projects
  listProjectsDef,
  createProjectDef,
  openProjectDef,
  getProjectDef,
  // Documents
  listDocumentsDef,
  createDocumentDef,
  openDocumentDef,
  renameDocumentDef,
  moveDocumentDef,
  deleteDocumentDef,
  // Branches
  listBranchesDef,
  createBranchDef,
  switchBranchDef,
  mergeBranchDef,
  resolveMergeConflictDef,
  getBranchDiffDef,
  deleteBranchDef,
  // Folders
  listFoldersDef,
  createFolderDef,
  renameFolderDef,
  deleteFolderDef,
  // Search
  searchDocumentsDef,
  searchProjectsDef,
];
```

---

## 3. Tool Implementations

```typescript
// packages/app/src/lib/ai/tools/dashboard-impl.ts
import { dashboardToolDefs } from "./dashboard";
import { db } from "../../db";
import { workspaces, projects, documents, branches, folders } from "../../../db/schema";
import { eq, and, ilike } from "drizzle-orm";

export async function getDashboardTools(userId: string) {
  return dashboardToolDefs.map((def) => {
    switch (def.name) {
      case "listWorkspaces":
        return def.server(async () => {
          const result = await db.query.workspaceMembers.findMany({
            where: eq(workspaceMembers.userId, userId),
            with: { workspace: true },
          });
          return result.map((m) => ({
            id: m.workspace.id,
            name: m.workspace.name,
            slug: m.workspace.slug,
            role: m.role,
          }));
        });

      case "createWorkspace":
        return def.server(async ({ name, slug, description }) => {
          const ws = await createWorkspace({ name, slug, description, userId });
          return { workspaceId: ws.id, name: ws.name, slug: ws.slug };
        });

      case "listProjects":
        return def.server(async ({ workspaceId }) => {
          const query = workspaceId
            ? db.query.projects.findMany({
                where: eq(projects.workspaceId, workspaceId),
                with: { workspace: true },
              })
            : db.query.projects.findMany({
                with: { workspace: true },
              });
          const result = await query;
          return result.map((p) => ({
            id: p.id,
            name: p.name,
            workspaceId: p.workspaceId,
            workspaceName: p.workspace.name,
            updatedAt: p.updatedAt.toISOString(),
          }));
        });

      case "createProject":
        return def.server(async ({ workspaceId, name, description }) => {
          const proj = await createProject({ workspaceId, name, description, userId });
          return { projectId: proj.id, name: proj.name };
        });

      case "openProject":
        return def.server(async ({ projectId }) => {
          const url = `/dashboard/projects/${projectId}`;
          // Navigation happens client-side
          return { url, navigated: true };
        });

      case "listDocuments":
        return def.server(async ({ projectId, branchId, folderId }) => {
          const branch = branchId || (await getMainBranch(projectId)).id;
          const result = await db.query.documents.findMany({
            where: and(
              eq(documents.branchId, branch),
              folderId ? eq(documents.folderId, folderId) : undefined
            ),
          });
          return result.map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            updatedAt: d.updatedAt.toISOString(),
            folderId: d.folderId,
          }));
        });

      case "createDocument":
        return def.server(async ({ branchId, name, type, folderId }) => {
          const doc = await createDocument({ branchId, name, type, folderId, userId });
          return { documentId: doc.id, name: doc.name };
        });

      case "openDocument":
        return def.server(async ({ documentId }) => {
          const url = `/editor?doc=${documentId}`;
          return { url, navigated: true };
        });

      case "searchDocuments":
        return def.server(async ({ query }) => {
          const result = await db.query.documents.findMany({
            where: ilike(documents.name, `%${query}%`),
            with: {
              branch: { with: { project: { with: { workspace: true } } } },
            },
            limit: 20,
          });
          return result.map((d) => ({
            id: d.id,
            name: d.name,
            projectId: d.branch.projectId,
            projectName: d.branch.project.name,
            workspaceName: d.branch.project.workspace.name,
          }));
        });

      // ... implement remaining tools similarly

      default:
        throw new Error(`Unimplemented tool: ${def.name}`);
    }
  });
}
```

---

## 4. Client Navigation Tools

Some actions need to happen on the client (navigation):

```typescript
// packages/app/src/lib/ai/tools/dashboard-client.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

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
```

---

## 5. Dashboard AI Chat UI

```typescript
// packages/app/src/components/DashboardAIChat.tsx
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AIChat } from "./ai/AIChat";
import { LuSparkles } from "react-icons/lu";
import "./DashboardAIChat.css";

export function DashboardAIChat() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="dashboard-ai-fab"
        onClick={() => setIsOpen(true)}
        aria-label="Open AI Assistant"
      >
        <LuSparkles size={20} />
      </button>

      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="dashboard-ai-backdrop" />
          <Dialog.Popup className="dashboard-ai-popup">
            <AIChat context="dashboard" onClose={() => setIsOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
```

### CSS

```css
/* packages/app/src/components/DashboardAIChat.css */

.dashboard-ai-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-accent);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  z-index: 100;
}

.dashboard-ai-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.dashboard-ai-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.dashboard-ai-popup {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 400px;
  height: 600px;
  max-height: calc(100vh - 48px);
  background: var(--color-bg);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 1001;
}
```

---

## 6. Integration with Dashboard Layout

```typescript
// packages/app/src/routes/dashboard.tsx
import { DashboardAIChat } from "../components/DashboardAIChat";

export function DashboardLayout() {
  return (
    <div className="dashboard-layout">
      <DashboardSidebar />
      <main className="dashboard-main">
        <Outlet />
      </main>
      <DashboardAIChat />
    </div>
  );
}
```

---

## 7. Tool Approval Rules

**Note:** Dashboard tool approval rules are defined in the unified registry in Phase 23 (`packages/app/src/lib/ai/approval.ts`).

**Default behavior:** All dashboard tools auto-execute except destructive operations.

| Tool                                                                                 | Approval Level   |
| ------------------------------------------------------------------------------------ | ---------------- |
| All read, create, rename, move, navigation tools                                     | `auto` (default) |
| `deleteDocument`, `deleteFolder`, `deleteBranch`, `deleteWorkspace`, `deleteProject` | `confirm`        |

Users can override via:

- **YOLO mode** - auto-approve everything including deletions
- **Per-tool "always allow"** - bypass confirmation for specific tools

See Phase 23 `DASHBOARD_TOOL_APPROVAL` for the authoritative source.

---

## Testing

```typescript
describe("Dashboard AI Tools", () => {
  test("listWorkspaces returns user workspaces", async () => {
    const tools = await getDashboardTools("user-123");
    const listTool = tools.find((t) => t.name === "listWorkspaces");

    const result = await listTool.execute({});

    expect(result).toBeInstanceOf(Array);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
  });

  test("createProject validates input", async () => {
    const result = createProjectDef.inputSchema.safeParse({
      workspaceId: "not-a-uuid",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  test("searchDocuments limits results", async () => {
    const tools = await getDashboardTools("user-123");
    const searchTool = tools.find((t) => t.name === "searchDocuments");

    const result = await searchTool.execute({ query: "test" });

    expect(result.length).toBeLessThanOrEqual(20);
  });
});

describe("Branch Merge Tools", () => {
  test("getBranchDiff returns document changes", async () => {
    const tools = await getDashboardTools("user-123");
    const diffTool = tools.find((t) => t.name === "getBranchDiff");

    const result = await diffTool.execute({
      sourceBranchId: "feature-branch",
      targetBranchId: "main-branch",
    });

    expect(result).toHaveProperty("added");
    expect(result).toHaveProperty("modified");
    expect(result).toHaveProperty("deleted");
  });

  test("mergeBranch dry run detects conflicts", async () => {
    const tools = await getDashboardTools("user-123");
    const mergeTool = tools.find((t) => t.name === "mergeBranch");

    const result = await mergeTool.execute({
      sourceBranchId: "feature-branch",
      targetBranchId: "main-branch",
      dryRun: true,
    });

    expect(result.merged).toBe(false);
    expect(result).toHaveProperty("conflicts");
  });

  test("deleteBranch requires confirmation", () => {
    const result = deleteBranchDef.inputSchema.safeParse({
      branchId: "branch-123",
      confirm: false,
    });
    expect(result.success).toBe(true);
  });
});

// Integration test
describe("Dashboard AI Chat", () => {
  test("AI can create a project", async () => {
    const session = createTestChatSession("dashboard");

    await session.sendMessage("Create a new project called Test Project in my workspace");

    const lastMessage = session.getLastAssistantMessage();
    expect(lastMessage).toContain("created");
  });

  test("AI can merge branches with conflict handling", async () => {
    const session = createTestChatSession("dashboard");

    await session.sendMessage("Merge my feature branch into main");

    const response = session.getLastAssistantMessage();
    // Should either confirm merge or report conflicts
    expect(response).toMatch(/merged|conflict/i);
  });
});
```

---

## Deliverables

- [ ] Dashboard system prompt implemented
- [ ] All workspace tools (list, create, get)
- [ ] All project tools (list, create, open, get)
- [ ] All document tools (list, create, open, rename, move, delete)
- [ ] All branch tools (list, create, switch, merge, diff, delete)
- [ ] All folder tools (list, create, rename, delete)
- [ ] Search tools (documents, projects)
- [ ] Client navigation tools
- [ ] DashboardAIChat component with FAB
- [ ] Tool approval rules configured
- [ ] Integration with dashboard layout
- [ ] Tests passing
