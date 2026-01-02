# Phase 23: AI Integration (Unified Plan)

> **This document supersedes the previous phases 23-26 and the draft phase 28.**
> It provides a comprehensive, unified plan for AI chat features using TanStack AI and Durable Streams.

## Prerequisites

- Phase 22: Patterns (most CAD features implemented)
- Phase 27: User System & Persistence (auth, workspaces, projects)
- Durable Streams infrastructure (already in place for Yjs sync)

### Schema Stability Requirements

Before starting AI integration, the following must be **stable and frozen**:

| Component                  | Status         | Notes                                |
| -------------------------- | -------------- | ------------------------------------ |
| Feature Y.Map structure    | Must be stable | AI tools depend on exact format      |
| Attribute naming           | Must be stable | `distance`, `op`, `sketch`, etc.     |
| Selection/reference format | Must be stable | `face:e1:top`, `edge:e1:top:0`       |
| Sketch data format         | Must be stable | Points, entities, constraints maps   |
| Error code taxonomy        | Must be stable | `NO_CLOSED_PROFILE`, etc.            |

---

## Goals

1. **Dashboard AI**: Natural language control of all dashboard operations
2. **Editor AI**: Construct and modify CAD geometry via AI
3. **TanStack AI**: Type-safe tool calling with streaming responses
4. **Durable Streams**: Persistent chat sessions with resumable streaming
5. **Complex Geometry**: Enable AI to create sophisticated CAD models

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI Chat System                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                    ┌──────────────────────────────┐  │
│  │   Dashboard AI   │                    │        Editor AI             │  │
│  │                  │                    │                              │  │
│  │  • Workspaces    │                    │  • Context Assembly          │  │
│  │  • Projects      │                    │  • Sketch Construction       │  │
│  │  • Documents     │                    │  • Feature Operations        │  │
│  │  • Navigation    │                    │  • Geometry Queries          │  │
│  └────────┬─────────┘                    └──────────────┬───────────────┘  │
│           │                                             │                   │
│           └─────────────────────┬───────────────────────┘                   │
│                                 │                                           │
│  ┌──────────────────────────────▼───────────────────────────────────────┐  │
│  │                        Shared AI Core                                │  │
│  │                                                                      │  │
│  │   @tanstack/ai        - Adapter, chat(), toolDefinition()           │  │
│  │   @tanstack/ai-client - Connection adapters, message management     │  │
│  │   @tanstack/ai-react  - useChat hook                                │  │
│  └────────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
├───────────────────────────────────┼─────────────────────────────────────────┤
│                         Server API Layer                                    │
│                                   │                                         │
│   POST /api/ai/chat ──────────────┼──► TanStack AI chat() + tools          │
│                                   │            │                            │
│                                   │            ▼                            │
│                                   │    LLM (Claude/GPT-4o)                  │
│                                   │            │                            │
│   GET /api/ai/session/$id ◄───────┼────────────┘                            │
│        (Durable Stream)           │    Persistence + Resume                 │
│                                   │                                         │
└───────────────────────────────────┴─────────────────────────────────────────┘
```

---

## Part 1: Core Infrastructure

### 1.1 Package Setup

```bash
pnpm add @tanstack/ai @tanstack/ai-client @tanstack/ai-react @tanstack/ai-anthropic
```

### 1.2 AI Adapter Configuration

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

### 1.3 Chat Session Management

```typescript
// packages/app/src/lib/ai/session.ts
import { z } from "zod";

export const ChatSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  context: z.enum(["dashboard", "editor"]),
  documentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ChatSession = z.infer<typeof ChatSessionSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  toolCalls: z.array(z.object({
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.unknown()),
  })).optional(),
  toolResults: z.array(z.object({
    toolCallId: z.string(),
    result: z.unknown(),
  })).optional(),
  timestamp: z.string().datetime(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// Stream ID format for Durable Streams
export function getChatStreamId(sessionId: string): string {
  return `ai-chat/${sessionId}`;
}
```

### 1.4 Durable Stream Connection Adapter

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

### 1.5 Server API Route

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
    const tools = context === "dashboard"
      ? await getDashboardTools()
      : await getEditorTools(documentId);

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

## Part 2: Context Assembly (Editor)

### 2.1 Document Serialization

The AI needs a clear representation of the document structure.

```typescript
// packages/app/src/lib/ai/context/serialize-document.ts
import * as Y from "yjs";
import type { SolidTypeDoc } from "../../../editor/document";

export interface SerializedFeature {
  id: string;
  type: string;
  name?: string;
  suppressed?: boolean;
  attributes: Record<string, unknown>;
}

export interface SerializedDocument {
  meta: {
    name: string;
    version: number;
    units: string;
  };
  features: SerializedFeature[];
}

export function serializeDocument(doc: SolidTypeDoc): SerializedDocument {
  const meta = doc.meta.toJSON();
  const featuresById = doc.featuresById;
  const featureOrder = doc.featureOrder.toArray();

  const features: SerializedFeature[] = [];

  for (const id of featureOrder) {
    const feature = featuresById.get(id);
    if (!feature) continue;

    const featureJson = feature.toJSON();
    features.push({
      id: featureJson.id,
      type: featureJson.type,
      name: featureJson.name,
      suppressed: featureJson.suppressed,
      attributes: featureJson,
    });
  }

  return {
    meta: {
      name: meta.name || "Untitled",
      version: meta.schemaVersion || 2,
      units: meta.units || "mm",
    },
    features,
  };
}

// For system prompt - compact text representation
export function serializeDocumentToText(doc: SolidTypeDoc): string {
  const serialized = serializeDocument(doc);
  let text = `Document: ${serialized.meta.name}\n`;
  text += `Units: ${serialized.meta.units}\n\n`;
  text += `Features (${serialized.features.length}):\n`;

  for (const feature of serialized.features) {
    const suppressed = feature.suppressed ? " [SUPPRESSED]" : "";
    const name = feature.name ? ` "${feature.name}"` : "";
    text += `  - ${feature.type} (${feature.id})${name}${suppressed}\n`;

    // Include key attributes
    const attrs = feature.attributes;
    if (attrs.sketch) text += `      sketch: ${attrs.sketch}\n`;
    if (attrs.distance) text += `      distance: ${attrs.distance}\n`;
    if (attrs.op) text += `      op: ${attrs.op}\n`;
    if (attrs.plane) text += `      plane: ${JSON.stringify(attrs.plane)}\n`;
  }

  return text;
}
```

### 2.2 Selection Context

```typescript
// packages/app/src/lib/ai/context/serialize-selection.ts
import type { Selection } from "../../../editor/contexts/SelectionContext";

export interface SelectionContext {
  type: "none" | "feature" | "face" | "edge" | "vertex";
  items: SelectionItem[];
}

export interface SelectionItem {
  persistentRef: string;
  featureId: string;
  geometryInfo?: {
    surfaceType?: string;
    curveType?: string;
    area?: number;
    length?: number;
    centroid?: [number, number, number];
    normal?: [number, number, number];
  };
}

export function serializeSelection(selection: Selection): SelectionContext {
  if (selection.faces.length > 0) {
    return {
      type: "face",
      items: selection.faces.map((face) => ({
        persistentRef: face.persistentRef,
        featureId: face.featureId,
        geometryInfo: {
          surfaceType: face.surfaceType,
          area: face.area,
          centroid: face.centroid,
          normal: face.normal,
        },
      })),
    };
  }

  if (selection.edges.length > 0) {
    return {
      type: "edge",
      items: selection.edges.map((edge) => ({
        persistentRef: edge.persistentRef,
        featureId: edge.featureId,
        geometryInfo: {
          curveType: edge.curveType,
          length: edge.length,
        },
      })),
    };
  }

  if (selection.featureId) {
    return {
      type: "feature",
      items: [{ persistentRef: selection.featureId, featureId: selection.featureId }],
    };
  }

  return { type: "none", items: [] };
}
```

### 2.3 Build State Context

```typescript
// packages/app/src/lib/ai/context/serialize-build-state.ts

export interface BuildStateContext {
  status: "idle" | "building" | "error";
  featureStatus: Record<string, "ok" | "error" | "pending">;
  errors: BuildError[];
  rebuildGate: string | null;
}

export interface BuildError {
  featureId: string;
  code: string;
  message: string;
  suggestion?: string;
}

export function serializeBuildState(kernelState: KernelState): BuildStateContext {
  return {
    status: kernelState.status,
    featureStatus: kernelState.featureStatus,
    errors: kernelState.errors.map((e) => ({
      featureId: e.featureId,
      code: e.code,
      message: e.message,
      suggestion: getSuggestionForError(e.code),
    })),
    rebuildGate: kernelState.rebuildGate,
  };
}

function getSuggestionForError(code: string): string | undefined {
  const suggestions: Record<string, string> = {
    NO_CLOSED_PROFILE: "Ensure all sketch lines form a closed loop",
    SELF_INTERSECTING: "Check for overlapping sketch geometry",
    INVALID_REFERENCE: "The referenced feature may have been deleted or renamed",
    AXIS_INTERSECTS_PROFILE: "Move the revolve axis outside the profile",
  };
  return suggestions[code];
}
```

### 2.4 Screenshot Capture

```typescript
// packages/app/src/lib/ai/context/capture-screenshot.ts
import * as THREE from "three";

export interface ScreenshotOptions {
  resolution: "low" | "medium" | "high";
  format: "png" | "jpeg";
}

const RESOLUTIONS = {
  low: { width: 256, height: 256 },
  medium: { width: 512, height: 512 },
  high: { width: 1024, height: 1024 },
};

export async function captureScreenshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: ScreenshotOptions = { resolution: "medium", format: "png" }
): Promise<string> {
  const { width, height } = RESOLUTIONS[options.resolution];

  // Create offscreen render target
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  // Render to target
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  // Read pixels
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

  // Convert to canvas and base64
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);

  // Flip Y axis (WebGL is bottom-up)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = ((height - 1 - y) * width + x) * 4;
      imageData.data[dstIdx] = pixels[srcIdx];
      imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
      imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
      imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Cleanup
  renderTarget.dispose();

  return canvas.toDataURL(`image/${options.format}`).split(",")[1];
}
```

### 2.5 Full Context Assembly

```typescript
// packages/app/src/lib/ai/context/assemble.ts

export interface EditorAIContext {
  document: SerializedDocument;
  documentText: string;
  selection: SelectionContext;
  buildState: BuildStateContext;
  screenshot?: string;
  activeSketch?: {
    id: string;
    pointCount: number;
    entityCount: number;
    constraintCount: number;
  };
}

export async function assembleEditorContext(
  doc: SolidTypeDoc,
  selection: Selection,
  kernelState: KernelState,
  renderer?: THREE.WebGLRenderer,
  scene?: THREE.Scene,
  camera?: THREE.Camera,
  activeSketchId?: string
): Promise<EditorAIContext> {
  const context: EditorAIContext = {
    document: serializeDocument(doc),
    documentText: serializeDocumentToText(doc),
    selection: serializeSelection(selection),
    buildState: serializeBuildState(kernelState),
  };

  // Capture screenshot if renderer available
  if (renderer && scene && camera) {
    try {
      context.screenshot = await captureScreenshot(renderer, scene, camera);
    } catch (e) {
      console.warn("Failed to capture screenshot:", e);
    }
  }

  // Include active sketch info
  if (activeSketchId) {
    const sketch = doc.featuresById.get(activeSketchId);
    if (sketch) {
      const data = sketch.get("data") as Y.Map<unknown>;
      context.activeSketch = {
        id: activeSketchId,
        pointCount: (data.get("pointsById") as Y.Map<unknown>)?.size || 0,
        entityCount: (data.get("entitiesById") as Y.Map<unknown>)?.size || 0,
        constraintCount: (data.get("constraintsById") as Y.Map<unknown>)?.size || 0,
      };
    }
  }

  return context;
}
```

---

## Part 3: Tool Definitions (TanStack AI Pattern)

### 3.1 Tool Definition Helpers

```typescript
// packages/app/src/lib/ai/tools/index.ts
import { toolDefinition, type ServerTool } from "@tanstack/ai";
import { dashboardTools } from "./dashboard";
import { editorQueryTools } from "./editor-query";
import { editorMutationTools } from "./editor-mutation";
import { complexGeometryTools } from "./complex-geometry";

export async function getDashboardTools(): Promise<ServerTool[]> {
  return dashboardTools.map((def) => def.server(/* implementation */));
}

export async function getEditorTools(documentId?: string): Promise<ServerTool[]> {
  return [
    ...editorQueryTools,
    ...editorMutationTools,
    ...complexGeometryTools,
  ].map((def) => def.server(/* implementation with documentId context */));
}
```

### 3.2 Dashboard Tools

```typescript
// packages/app/src/lib/ai/tools/dashboard.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============================================================================
// Workspace Tools
// ============================================================================

export const listWorkspacesDef = toolDefinition({
  name: "listWorkspaces",
  description: "List all workspaces the user has access to",
  inputSchema: z.object({}),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: z.enum(["owner", "admin", "member"]),
  })),
});

export const createWorkspaceDef = toolDefinition({
  name: "createWorkspace",
  description: "Create a new workspace",
  inputSchema: z.object({
    name: z.string().min(1).max(100),
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().max(500).optional(),
  }),
  outputSchema: z.object({
    workspaceId: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
});

// ============================================================================
// Project Tools
// ============================================================================

export const listProjectsDef = toolDefinition({
  name: "listProjects",
  description: "List projects, optionally filtered by workspace",
  inputSchema: z.object({
    workspaceId: z.string().optional(),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    workspaceId: z.string(),
    workspaceName: z.string(),
    updatedAt: z.string(),
  })),
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

// ============================================================================
// Document Tools
// ============================================================================

export const listDocumentsDef = toolDefinition({
  name: "listDocuments",
  description: "List documents in a project branch",
  inputSchema: z.object({
    projectId: z.string(),
    branchId: z.string().optional(),
    folderId: z.string().optional(),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["part", "assembly"]),
    updatedAt: z.string(),
    folderId: z.string().optional(),
  })),
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

// ============================================================================
// Branch Tools
// ============================================================================

export const listBranchesDef = toolDefinition({
  name: "listBranches",
  description: "List branches in a project",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    isMain: z.boolean(),
    createdAt: z.string(),
  })),
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

// ============================================================================
// Search Tools
// ============================================================================

export const searchDocumentsDef = toolDefinition({
  name: "searchDocuments",
  description: "Search for documents by name across all accessible projects",
  inputSchema: z.object({
    query: z.string().min(1),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    workspaceName: z.string(),
  })),
});

// Export all dashboard tool definitions
export const dashboardToolDefs = [
  listWorkspacesDef,
  createWorkspaceDef,
  listProjectsDef,
  createProjectDef,
  openProjectDef,
  listDocumentsDef,
  createDocumentDef,
  openDocumentDef,
  listBranchesDef,
  createBranchDef,
  searchDocumentsDef,
];
```

### 3.3 Editor Query Tools

```typescript
// packages/app/src/lib/ai/tools/editor-query.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============================================================================
// Selection & Context Tools
// ============================================================================

export const getCurrentSelectionDef = toolDefinition({
  name: "getCurrentSelection",
  description: "Get information about the currently selected face, edge, or feature",
  inputSchema: z.object({}),
  outputSchema: z.object({
    type: z.enum(["none", "feature", "face", "edge", "vertex"]),
    items: z.array(z.object({
      persistentRef: z.string(),
      featureId: z.string(),
      geometryInfo: z.object({
        surfaceType: z.string().optional(),
        curveType: z.string().optional(),
        area: z.number().optional(),
        length: z.number().optional(),
        centroid: z.tuple([z.number(), z.number(), z.number()]).optional(),
        normal: z.tuple([z.number(), z.number(), z.number()]).optional(),
      }).optional(),
    })),
  }),
});

export const getModelContextDef = toolDefinition({
  name: "getModelContext",
  description: "Get the current state of the CAD model including features and build status",
  inputSchema: z.object({}),
  outputSchema: z.object({
    documentName: z.string(),
    units: z.string(),
    featureCount: z.number(),
    features: z.array(z.object({
      id: z.string(),
      type: z.string(),
      name: z.string().optional(),
      status: z.enum(["ok", "error", "pending"]),
    })),
    errors: z.array(z.object({
      featureId: z.string(),
      code: z.string(),
      message: z.string(),
    })),
  }),
});

// ============================================================================
// Geometry Query Tools
// ============================================================================

export const findFacesDef = toolDefinition({
  name: "findFaces",
  description: "Find faces matching specific criteria",
  inputSchema: z.object({
    surfaceType: z.enum(["plane", "cylinder", "cone", "sphere", "torus", "any"]).optional(),
    orientation: z.enum(["top", "bottom", "front", "back", "left", "right", "any"]).optional(),
    featureId: z.string().optional(),
    minArea: z.number().optional(),
    maxArea: z.number().optional(),
  }),
  outputSchema: z.array(z.object({
    persistentRef: z.string(),
    featureId: z.string(),
    surfaceType: z.string(),
    area: z.number(),
    centroid: z.tuple([z.number(), z.number(), z.number()]),
    normal: z.tuple([z.number(), z.number(), z.number()]),
  })),
});

export const findEdgesDef = toolDefinition({
  name: "findEdges",
  description: "Find edges matching specific criteria",
  inputSchema: z.object({
    curveType: z.enum(["line", "circle", "arc", "ellipse", "spline", "any"]).optional(),
    faceRef: z.string().optional(),
    featureId: z.string().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    convexity: z.enum(["convex", "concave", "any"]).optional(),
  }),
  outputSchema: z.array(z.object({
    persistentRef: z.string(),
    featureId: z.string(),
    curveType: z.string(),
    length: z.number(),
    convexity: z.enum(["convex", "concave", "unknown"]),
  })),
});

export const getGeometryDef = toolDefinition({
  name: "getGeometry",
  description: "Get detailed geometric properties of a face or edge by persistent reference",
  inputSchema: z.object({
    ref: z.string().describe("Persistent reference like 'face:e1:top' or 'edge:e1:top:0'"),
  }),
  outputSchema: z.object({
    type: z.enum(["face", "edge"]),
    properties: z.record(z.unknown()),
  }),
});

export const measureDistanceDef = toolDefinition({
  name: "measureDistance",
  description: "Measure the distance between two geometry references",
  inputSchema: z.object({
    ref1: z.string(),
    ref2: z.string(),
  }),
  outputSchema: z.object({
    distance: z.number(),
    type: z.enum(["minimum", "center-to-center", "point-to-point"]),
  }),
});

export const getBoundingBoxDef = toolDefinition({
  name: "getBoundingBox",
  description: "Get the bounding box of the entire model or a specific feature",
  inputSchema: z.object({
    featureId: z.string().optional(),
  }),
  outputSchema: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
    size: z.tuple([z.number(), z.number(), z.number()]),
    center: z.tuple([z.number(), z.number(), z.number()]),
  }),
});

// Export all query tool definitions
export const editorQueryToolDefs = [
  getCurrentSelectionDef,
  getModelContextDef,
  findFacesDef,
  findEdgesDef,
  getGeometryDef,
  measureDistanceDef,
  getBoundingBoxDef,
];
```

### 3.4 Editor Mutation Tools

```typescript
// packages/app/src/lib/ai/tools/editor-mutation.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============================================================================
// Sketch Tools
// ============================================================================

export const createSketchDef = toolDefinition({
  name: "createSketch",
  description: "Create a new 2D sketch on a plane or face",
  inputSchema: z.object({
    plane: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("planeFeatureId"), ref: z.string() }),
      z.object({ kind: z.literal("faceRef"), ref: z.string() }),
    ]),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    entered: z.boolean(),
  }),
});

export const addSketchGeometryDef = toolDefinition({
  name: "addSketchGeometry",
  description: "Add geometry (lines, arcs, circles, rectangles) to a sketch",
  inputSchema: z.object({
    sketchId: z.string(),
    geometry: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("line"),
        start: z.object({ x: z.number(), y: z.number() }),
        end: z.object({ x: z.number(), y: z.number() }),
      }),
      z.object({
        type: z.literal("rectangle"),
        corner1: z.object({ x: z.number(), y: z.number() }),
        corner2: z.object({ x: z.number(), y: z.number() }),
        centered: z.boolean().default(false),
      }),
      z.object({
        type: z.literal("circle"),
        center: z.object({ x: z.number(), y: z.number() }),
        radius: z.number().positive(),
      }),
      z.object({
        type: z.literal("arc"),
        start: z.object({ x: z.number(), y: z.number() }),
        end: z.object({ x: z.number(), y: z.number() }),
        center: z.object({ x: z.number(), y: z.number() }),
        ccw: z.boolean().default(true),
      }),
      z.object({
        type: z.literal("polygon"),
        center: z.object({ x: z.number(), y: z.number() }),
        radius: z.number().positive(),
        sides: z.number().int().min(3).max(100),
      }),
    ]),
  }),
  outputSchema: z.object({
    entityIds: z.array(z.string()),
    pointIds: z.array(z.string()),
  }),
});

export const addSketchConstraintsDef = toolDefinition({
  name: "addSketchConstraints",
  description: "Add geometric or dimensional constraints to sketch elements",
  inputSchema: z.object({
    sketchId: z.string(),
    constraints: z.array(z.discriminatedUnion("type", [
      z.object({ type: z.literal("horizontal"), points: z.tuple([z.string(), z.string()]) }),
      z.object({ type: z.literal("vertical"), points: z.tuple([z.string(), z.string()]) }),
      z.object({ type: z.literal("coincident"), points: z.tuple([z.string(), z.string()]) }),
      z.object({ type: z.literal("fixed"), point: z.string() }),
      z.object({ type: z.literal("distance"), points: z.tuple([z.string(), z.string()]), value: z.number() }),
      z.object({ type: z.literal("angle"), lines: z.tuple([z.string(), z.string()]), value: z.number() }),
      z.object({ type: z.literal("parallel"), lines: z.tuple([z.string(), z.string()]) }),
      z.object({ type: z.literal("perpendicular"), lines: z.tuple([z.string(), z.string()]) }),
      z.object({ type: z.literal("equalLength"), lines: z.tuple([z.string(), z.string()]) }),
      z.object({ type: z.literal("tangent"), line: z.string(), arc: z.string() }),
      z.object({ type: z.literal("symmetric"), points: z.tuple([z.string(), z.string()]), axis: z.string() }),
    ])),
  }),
  outputSchema: z.object({
    constraintIds: z.array(z.string()),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const exitSketchDef = toolDefinition({
  name: "exitSketch",
  description: "Exit sketch editing mode",
  inputSchema: z.object({
    sketchId: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

// ============================================================================
// Feature Tools
// ============================================================================

export const createExtrudeDef = toolDefinition({
  name: "createExtrude",
  description: "Extrude a sketch profile to create or cut 3D geometry",
  inputSchema: z.object({
    sketchId: z.string(),
    distance: z.number().positive(),
    op: z.enum(["add", "cut"]),
    direction: z.enum(["normal", "reverse", "symmetric"]).default("normal"),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().optional(),
  }),
});

export const createRevolveDef = toolDefinition({
  name: "createRevolve",
  description: "Revolve a sketch profile around an axis line",
  inputSchema: z.object({
    sketchId: z.string(),
    axisLineId: z.string().describe("ID of a line entity in the sketch to use as axis"),
    angle: z.number().min(0).max(360),
    op: z.enum(["add", "cut"]),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().optional(),
  }),
});

export const createFilletDef = toolDefinition({
  name: "createFillet",
  description: "Add rounded fillets to edges",
  inputSchema: z.object({
    edgeRefs: z.array(z.string()).min(1),
    radius: z.number().positive(),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().optional(),
  }),
});

export const createChamferDef = toolDefinition({
  name: "createChamfer",
  description: "Add angled chamfers to edges",
  inputSchema: z.object({
    edgeRefs: z.array(z.string()).min(1),
    distance: z.number().positive(),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().optional(),
  }),
});

export const createPatternDef = toolDefinition({
  name: "createPattern",
  description: "Create a linear or circular pattern of features",
  inputSchema: z.object({
    featureIds: z.array(z.string()).min(1),
    type: z.enum(["linear", "circular"]),
    // Linear pattern
    direction: z.tuple([z.number(), z.number(), z.number()]).optional(),
    count: z.number().int().min(2).optional(),
    spacing: z.number().positive().optional(),
    // Circular pattern
    axis: z.tuple([z.number(), z.number(), z.number()]).optional(),
    axisPoint: z.tuple([z.number(), z.number(), z.number()]).optional(),
    totalAngle: z.number().optional(),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().optional(),
  }),
});

export const modifyFeatureDef = toolDefinition({
  name: "modifyFeature",
  description: "Modify parameters of an existing feature",
  inputSchema: z.object({
    featureId: z.string(),
    changes: z.record(z.union([z.string(), z.number(), z.boolean()])),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rebuildStatus: z.enum(["ok", "error"]),
    error: z.string().optional(),
  }),
});

export const deleteFeatureDef = toolDefinition({
  name: "deleteFeature",
  description: "Delete a feature from the model",
  inputSchema: z.object({
    featureId: z.string(),
    deleteChildren: z.boolean().default(false),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedIds: z.array(z.string()),
  }),
});

export const reorderFeatureDef = toolDefinition({
  name: "reorderFeature",
  description: "Move a feature to a different position in the feature tree",
  inputSchema: z.object({
    featureId: z.string(),
    afterFeatureId: z.string().nullable(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rebuildStatus: z.enum(["ok", "error"]),
  }),
});

export const suppressFeatureDef = toolDefinition({
  name: "suppressFeature",
  description: "Suppress or unsuppress a feature (skip during rebuild)",
  inputSchema: z.object({
    featureId: z.string(),
    suppressed: z.boolean(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

// Export all mutation tool definitions
export const editorMutationToolDefs = [
  createSketchDef,
  addSketchGeometryDef,
  addSketchConstraintsDef,
  exitSketchDef,
  createExtrudeDef,
  createRevolveDef,
  createFilletDef,
  createChamferDef,
  createPatternDef,
  modifyFeatureDef,
  deleteFeatureDef,
  reorderFeatureDef,
  suppressFeatureDef,
];
```

### 3.5 Complex Geometry Helper Tools

```typescript
// packages/app/src/lib/ai/tools/complex-geometry.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

/**
 * High-level geometry helpers that compose multiple operations.
 * These make it easier for the AI to create common shapes without
 * manually constructing every sketch element.
 */

export const createBoxDef = toolDefinition({
  name: "createBox",
  description: "Create a box primitive with specified dimensions",
  inputSchema: z.object({
    width: z.number().positive().describe("Size along X axis"),
    height: z.number().positive().describe("Size along Y axis (extrusion direction)"),
    depth: z.number().positive().describe("Size along Z axis"),
    origin: z.object({
      x: z.number().default(0),
      y: z.number().default(0),
      z: z.number().default(0),
    }).default({ x: 0, y: 0, z: 0 }),
    centered: z.boolean().default(true),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    extrudeId: z.string(),
  }),
});

export const createCylinderDef = toolDefinition({
  name: "createCylinder",
  description: "Create a cylinder primitive",
  inputSchema: z.object({
    radius: z.number().positive(),
    height: z.number().positive(),
    center: z.object({
      x: z.number().default(0),
      y: z.number().default(0),
    }).default({ x: 0, y: 0 }),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    extrudeId: z.string(),
  }),
});

export const createHoleDef = toolDefinition({
  name: "createHole",
  description: "Create a hole (cut) on a face",
  inputSchema: z.object({
    faceRef: z.string().describe("Persistent reference to the target face"),
    diameter: z.number().positive(),
    depth: z.number().positive().or(z.literal("through")),
    position: z.object({
      u: z.number().describe("Position on face U parameter (0-1)").default(0.5),
      v: z.number().describe("Position on face V parameter (0-1)").default(0.5),
    }).default({ u: 0.5, v: 0.5 }),
    type: z.enum(["simple", "counterbore", "countersink"]).default("simple"),
    // Counterbore params
    counterboreDiameter: z.number().optional(),
    counterboreDepth: z.number().optional(),
    // Countersink params
    countersinkDiameter: z.number().optional(),
    countersinkAngle: z.number().optional(),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
  }),
});

export const createSlotDef = toolDefinition({
  name: "createSlot",
  description: "Create a slot (elongated hole) feature",
  inputSchema: z.object({
    faceRef: z.string(),
    width: z.number().positive(),
    length: z.number().positive(),
    depth: z.number().positive(),
    position: z.object({ u: z.number(), v: z.number() }).default({ u: 0.5, v: 0.5 }),
    angle: z.number().default(0).describe("Rotation angle in degrees"),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
  }),
});

export const createPocketDef = toolDefinition({
  name: "createPocket",
  description: "Create a rectangular pocket (cut) on a face",
  inputSchema: z.object({
    faceRef: z.string(),
    width: z.number().positive(),
    length: z.number().positive(),
    depth: z.number().positive(),
    cornerRadius: z.number().min(0).default(0),
    centered: z.boolean().default(true),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
    filletId: z.string().optional(),
  }),
});

export const createBossDef = toolDefinition({
  name: "createBoss",
  description: "Create a raised boss on a face",
  inputSchema: z.object({
    faceRef: z.string(),
    shape: z.enum(["circle", "rectangle"]),
    diameter: z.number().optional(),
    width: z.number().optional(),
    length: z.number().optional(),
    height: z.number().positive(),
    draftAngle: z.number().min(0).max(45).default(0),
    centered: z.boolean().default(true),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
  }),
});

export const createShellDef = toolDefinition({
  name: "createShell",
  description: "Hollow out a solid leaving walls of specified thickness",
  inputSchema: z.object({
    thickness: z.number().positive(),
    openFaces: z.array(z.string()).optional().describe("Face refs to remove (leave open)"),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
  }),
});

// Export all complex geometry tool definitions
export const complexGeometryToolDefs = [
  createBoxDef,
  createCylinderDef,
  createHoleDef,
  createSlotDef,
  createPocketDef,
  createBossDef,
  createShellDef,
];
```

---

## Part 4: Diff and Apply (Yjs Mutations)

### 4.1 Change Types

```typescript
// packages/app/src/lib/ai/apply/types.ts
import { z } from "zod";

export const AIChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("modify"),
    featureId: z.string(),
    changes: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("add"),
    afterFeatureId: z.string().nullable(),
    feature: z.object({
      type: z.string(),
      id: z.string(),
      attributes: z.record(z.unknown()),
    }),
  }),
  z.object({
    type: z.literal("remove"),
    featureId: z.string(),
  }),
  z.object({
    type: z.literal("reorder"),
    featureId: z.string(),
    afterFeatureId: z.string().nullable(),
  }),
]);

export type AIChange = z.infer<typeof AIChangeSchema>;
```

### 4.2 Validation

```typescript
// packages/app/src/lib/ai/apply/validate.ts
import type { AIChange } from "./types";
import type { SolidTypeDoc } from "../../../editor/document";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: string;
  message: string;
  featureId?: string;
}

export interface ValidationWarning {
  type: string;
  message: string;
}

export function validateChanges(changes: AIChange[], doc: SolidTypeDoc): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const existingIds = new Set(doc.featureOrder.toArray());
  const addedIds = new Set<string>();
  const removedIds = new Set<string>();

  for (const change of changes) {
    switch (change.type) {
      case "modify":
        if (!existingIds.has(change.featureId)) {
          errors.push({
            type: "FEATURE_NOT_FOUND",
            message: `Cannot modify non-existent feature: ${change.featureId}`,
            featureId: change.featureId,
          });
        }
        break;

      case "add":
        if (existingIds.has(change.feature.id) || addedIds.has(change.feature.id)) {
          errors.push({
            type: "DUPLICATE_ID",
            message: `Feature ID already exists: ${change.feature.id}`,
            featureId: change.feature.id,
          });
        }
        addedIds.add(change.feature.id);

        // Validate references
        if (change.feature.attributes.sketch) {
          const sketchRef = change.feature.attributes.sketch as string;
          if (!existingIds.has(sketchRef) && !addedIds.has(sketchRef)) {
            errors.push({
              type: "INVALID_REFERENCE",
              message: `Feature references non-existent sketch: ${sketchRef}`,
              featureId: change.feature.id,
            });
          }
        }
        break;

      case "remove":
        if (!existingIds.has(change.featureId)) {
          warnings.push({
            type: "FEATURE_NOT_FOUND",
            message: `Cannot remove non-existent feature: ${change.featureId}`,
          });
        }
        removedIds.add(change.featureId);
        break;

      case "reorder":
        if (!existingIds.has(change.featureId)) {
          errors.push({
            type: "FEATURE_NOT_FOUND",
            message: `Cannot reorder non-existent feature: ${change.featureId}`,
            featureId: change.featureId,
          });
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### 4.3 Apply Changes

```typescript
// packages/app/src/lib/ai/apply/apply-changes.ts
import * as Y from "yjs";
import type { AIChange } from "./types";
import type { SolidTypeDoc } from "../../../editor/document";
import { validateChanges } from "./validate";

export interface ApplyResult {
  ok: boolean;
  appliedChanges: number;
  errors?: string[];
  message?: string;
}

export function applyChanges(
  changes: AIChange[],
  doc: SolidTypeDoc,
  origin: string = "ai-change"
): ApplyResult {
  // Validate first
  const validation = validateChanges(changes, doc);
  if (!validation.valid) {
    return {
      ok: false,
      appliedChanges: 0,
      errors: validation.errors.map((e) => e.message),
      message: "Validation failed",
    };
  }

  let appliedChanges = 0;

  // Apply all changes in a single transaction
  doc.ydoc.transact(() => {
    for (const change of changes) {
      try {
        switch (change.type) {
          case "modify":
            applyModify(change, doc);
            break;
          case "add":
            applyAdd(change, doc);
            break;
          case "remove":
            applyRemove(change, doc);
            break;
          case "reorder":
            applyReorder(change, doc);
            break;
        }
        appliedChanges++;
      } catch (error) {
        console.error(`Failed to apply change:`, change, error);
        throw error; // Abort transaction
      }
    }
  }, origin);

  return { ok: true, appliedChanges };
}

function applyModify(change: { featureId: string; changes: Record<string, unknown> }, doc: SolidTypeDoc) {
  const feature = doc.featuresById.get(change.featureId);
  if (!feature) throw new Error(`Feature not found: ${change.featureId}`);

  for (const [key, value] of Object.entries(change.changes)) {
    if (value === undefined) {
      feature.delete(key);
    } else {
      feature.set(key, value);
    }
  }
}

function applyAdd(
  change: { afterFeatureId: string | null; feature: { type: string; id: string; attributes: Record<string, unknown> } },
  doc: SolidTypeDoc
) {
  const newFeature = new Y.Map();

  // Set all attributes
  newFeature.set("id", change.feature.id);
  newFeature.set("type", change.feature.type);
  for (const [key, value] of Object.entries(change.feature.attributes)) {
    if (key !== "id" && key !== "type") {
      newFeature.set(key, value);
    }
  }

  // Add to featuresById
  doc.featuresById.set(change.feature.id, newFeature);

  // Add to featureOrder at correct position
  if (change.afterFeatureId) {
    const order = doc.featureOrder.toArray();
    const idx = order.indexOf(change.afterFeatureId);
    if (idx >= 0) {
      doc.featureOrder.insert(idx + 1, [change.feature.id]);
    } else {
      doc.featureOrder.push([change.feature.id]);
    }
  } else {
    // Insert at first non-built-in position (after origin and planes)
    const order = doc.featureOrder.toArray();
    const insertIdx = Math.min(4, order.length); // After origin + 3 planes
    doc.featureOrder.insert(insertIdx, [change.feature.id]);
  }
}

function applyRemove(change: { featureId: string }, doc: SolidTypeDoc) {
  // Remove from featuresById
  doc.featuresById.delete(change.featureId);

  // Remove from featureOrder
  const order = doc.featureOrder.toArray();
  const idx = order.indexOf(change.featureId);
  if (idx >= 0) {
    doc.featureOrder.delete(idx, 1);
  }
}

function applyReorder(
  change: { featureId: string; afterFeatureId: string | null },
  doc: SolidTypeDoc
) {
  const order = doc.featureOrder.toArray();
  const currentIdx = order.indexOf(change.featureId);
  if (currentIdx < 0) throw new Error(`Feature not found in order: ${change.featureId}`);

  // Remove from current position
  doc.featureOrder.delete(currentIdx, 1);

  // Insert at new position
  if (change.afterFeatureId) {
    const newOrder = doc.featureOrder.toArray();
    const afterIdx = newOrder.indexOf(change.afterFeatureId);
    if (afterIdx >= 0) {
      doc.featureOrder.insert(afterIdx + 1, [change.featureId]);
    } else {
      doc.featureOrder.push([change.featureId]);
    }
  } else {
    const insertIdx = Math.min(4, doc.featureOrder.length);
    doc.featureOrder.insert(insertIdx, [change.featureId]);
  }
}
```

### 4.4 Recovery and Rollback

```typescript
// packages/app/src/lib/ai/apply/recovery.ts
import * as Y from "yjs";
import type { AIChange } from "./types";
import type { SolidTypeDoc } from "../../../editor/document";
import { applyChanges, type ApplyResult } from "./apply-changes";

export async function applyChangesWithRecovery(
  changes: AIChange[],
  doc: SolidTypeDoc,
  triggerRebuild: () => Promise<{ ok: boolean; errors?: string[] }>
): Promise<ApplyResult & { rolledBack?: boolean }> {
  // Take snapshot before applying
  const snapshot = Y.snapshot(doc.ydoc);

  try {
    // Apply changes
    const applyResult = applyChanges(changes, doc);
    if (!applyResult.ok) {
      return applyResult;
    }

    // Trigger kernel rebuild
    const rebuildResult = await triggerRebuild();

    if (!rebuildResult.ok) {
      // Rollback on rebuild failure
      const currentDoc = Y.createDocFromSnapshot(doc.ydoc, snapshot);
      Y.applyUpdate(doc.ydoc, Y.encodeStateAsUpdate(currentDoc));

      return {
        ok: false,
        appliedChanges: 0,
        errors: rebuildResult.errors,
        message: "Changes caused rebuild errors, rolled back",
        rolledBack: true,
      };
    }

    return applyResult;
  } catch (error) {
    // Rollback on any error
    try {
      const currentDoc = Y.createDocFromSnapshot(doc.ydoc, snapshot);
      Y.applyUpdate(doc.ydoc, Y.encodeStateAsUpdate(currentDoc));
    } catch (rollbackError) {
      console.error("Failed to rollback:", rollbackError);
    }

    return {
      ok: false,
      appliedChanges: 0,
      message: `Error applying changes: ${error instanceof Error ? error.message : String(error)}`,
      rolledBack: true,
    };
  }
}
```

---

## Part 5: System Prompts

### 5.1 Document Schema Reference

```typescript
// packages/app/src/lib/ai/prompts/schema.ts

export const DOCUMENT_SCHEMA = `
## SolidType Document Schema

### Feature Types

**Origin** - Coordinate system origin (exactly one per document)
  - id: string

**Plane** - Datum plane for sketching
  - id: string
  - role?: "xy" | "xz" | "yz" (for built-in planes)
  - normal: [x, y, z]
  - origin: [x, y, z]
  - xDir: [x, y, z]

**Sketch** - 2D sketch with geometry and constraints
  - id: string
  - name?: string
  - plane: { kind: "planeFeatureId" | "faceRef", ref: string }
  - data: { pointsById, entitiesById, constraintsById }

**Extrude** - Linear extrusion of sketch profile
  - id: string
  - sketch: string (sketch ID)
  - distance: number
  - op: "add" | "cut"
  - direction?: "normal" | "reverse"

**Revolve** - Rotational sweep of sketch profile
  - id: string
  - sketch: string
  - axis: string (line entity ID)
  - angle: number (degrees)
  - op: "add" | "cut"

**Fillet** - Rounded edges
  - id: string
  - edges: string[] (persistent edge refs)
  - radius: number

**Chamfer** - Angled edges
  - id: string
  - edges: string[]
  - distance: number

### Sketch Elements

**Points**: { id, x, y, fixed?, attachedTo?, param? }
**Line**: { id, type: "line", start, end }
**Arc**: { id, type: "arc", start, end, center, ccw }

### Constraints
- Geometric: horizontal, vertical, coincident, fixed, parallel, perpendicular, tangent, equalLength, symmetric
- Dimensional: distance (with value), angle (with value)

### Persistent References
- Faces: "face:<featureId>:<selector>" e.g., "face:e1:top"
- Edges: "edge:<featureId>:<selector>:<index>" e.g., "edge:e1:top:0"
- Vertices: "vertex:<featureId>:<selector>"
`;
```

### 5.2 Dashboard System Prompt

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

### 5.3 Editor System Prompt

```typescript
// packages/app/src/lib/ai/prompts/editor.ts
import { DOCUMENT_SCHEMA } from "./schema";

export function buildEditorSystemPrompt(
  documentText: string,
  selectionContext: string,
  buildErrors: string,
  activeSketch?: string
): string {
  return `
You are an AI CAD modeling assistant for SolidType.

## Your Role
You help users create and modify 3D CAD models through tool calls. You can:
- Create and edit sketches with geometry and constraints
- Add features like extrudes, revolves, fillets, and chamfers
- Query model geometry to understand the current state
- Fix build errors and optimize designs

## Document Schema
${DOCUMENT_SCHEMA}

## Complex Geometry Guidelines

When creating complex geometry:
1. **Start with base shapes** - Create primary profiles first
2. **Add detail features** - Holes, fillets, pockets incrementally
3. **Use constraints** - Ensure design intent with proper constraints
4. **Check build state** - Verify each step succeeds before continuing

### Common Patterns

**Box with holes:**
1. Create rectangle sketch on XY plane
2. Extrude to height
3. Create hole sketches on top face
4. Cut-extrude holes

**Cylinder with features:**
1. Create circle sketch
2. Extrude
3. Add fillets to edges

### Dimension Heuristics (when not specified)
- Standard holes: M3=3.4mm, M4=4.5mm, M5=5.5mm, M6=6.6mm
- Wall thickness: 2-5mm (plastic), 1-3mm (sheet metal)
- Fillet radii: 0.5-2mm (aesthetic), larger for structural
- Draft angles: 1-3° for injection molding

## Current Model State

${documentText}

## Current Selection
${selectionContext}

## Build Errors
${buildErrors || "No errors"}

${activeSketch ? `## Active Sketch\nCurrently editing sketch: ${activeSketch}` : ""}

## Rules
1. Always use tool calls - don't describe actions, execute them
2. If a tool fails, explain the error and suggest how to fix it
3. For complex geometry, break into multiple sequential tool calls
4. Confirm successful operations with a brief summary
5. If dimensions aren't specified, ask or use reasonable defaults
6. When errors occur, try to diagnose and offer solutions
`;
}
```

### 5.4 Prompt Builder

```typescript
// packages/app/src/lib/ai/prompts/index.ts

export async function buildSystemPrompt(
  context: "dashboard" | "editor",
  documentId?: string
): Promise<string> {
  if (context === "dashboard") {
    // Get current user context
    const userId = await getCurrentUserId();
    const workspaceId = await getCurrentWorkspaceId();
    return buildDashboardSystemPrompt(userId, workspaceId);
  }

  if (context === "editor" && documentId) {
    // Get document and editor context
    const doc = await getDocument(documentId);
    const documentText = serializeDocumentToText(doc);
    const selection = await getCurrentSelection(documentId);
    const selectionContext = JSON.stringify(selection);
    const buildState = await getBuildState(documentId);
    const buildErrors = buildState.errors.map((e) => `${e.featureId}: ${e.message}`).join("\n");
    const activeSketch = await getActiveSketch(documentId);

    return buildEditorSystemPrompt(documentText, selectionContext, buildErrors, activeSketch);
  }

  return "You are an AI assistant for SolidType, a collaborative CAD application.";
}
```

---

## Part 6: Durable Stream Persistence

### 6.1 Session Persistence

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

## Part 7: React Integration

### 7.1 useAIChat Hook

```typescript
// packages/app/src/hooks/useAIChat.ts
import { useChat } from "@tanstack/ai-react";
import { useMemo, useCallback } from "react";
import { createDurableStreamAdapter } from "../lib/ai/durable-stream-adapter";
import { v4 as uuid } from "uuid";

interface UseAIChatOptions {
  context: "dashboard" | "editor";
  documentId?: string;
  sessionId?: string;
}

export function useAIChat(options: UseAIChatOptions) {
  const sessionId = useMemo(() => options.sessionId || uuid(), [options.sessionId]);

  const adapter = useMemo(
    () => createDurableStreamAdapter(sessionId),
    [sessionId]
  );

  const chat = useChat({
    adapter,
    // Client tools for navigation
    tools: options.context === "dashboard" ? dashboardClientTools : editorClientTools,
  });

  const sendMessage = useCallback(
    async (content: string) => {
      await chat.submit({
        messages: [
          ...chat.messages,
          { role: "user", content },
        ],
        context: options.context,
        documentId: options.documentId,
      });
    },
    [chat, options.context, options.documentId]
  );

  return {
    ...chat,
    sessionId,
    sendMessage,
  };
}
```

### 7.2 Shared AIChat Component

```typescript
// packages/app/src/components/ai/AIChat.tsx
import React, { useState, useRef, useEffect } from "react";
import { useAIChat } from "../../hooks/useAIChat";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatInput } from "./AIChatInput";
import { ToolApprovalPanel } from "./ToolApprovalPanel";
import "./AIChat.css";

interface AIChatProps {
  context: "dashboard" | "editor";
  documentId?: string;
  sessionId?: string;
  onClose?: () => void;
}

export function AIChat({ context, documentId, sessionId, onClose }: AIChatProps) {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    toolApprovalRequests,
    approveToolCall,
    rejectToolCall,
  } = useAIChat({ context, documentId, sessionId });

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      <div className="ai-chat-header">
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

### 7.3 Dashboard AI Integration

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

### 7.4 Editor AI Panel

```typescript
// packages/app/src/editor/components/AIPanel.tsx
import { useDocument } from "../contexts/DocumentContext";
import { AIChat } from "../../components/ai/AIChat";
import "./AIPanel.css";

export function AIPanel() {
  const { documentId } = useDocument();

  return (
    <div className="editor-ai-panel">
      <AIChat context="editor" documentId={documentId} />
    </div>
  );
}
```

---

## Part 8: Tool Approval Flow

### 8.1 Approval Categories

```typescript
// packages/app/src/lib/ai/approval.ts

export type ApprovalLevel = "auto" | "notify" | "confirm";

export const TOOL_APPROVAL_RULES: Record<string, ApprovalLevel> = {
  // Auto-execute (read-only, safe)
  listWorkspaces: "auto",
  listProjects: "auto",
  listDocuments: "auto",
  listBranches: "auto",
  searchDocuments: "auto",
  getCurrentSelection: "auto",
  getModelContext: "auto",
  findFaces: "auto",
  findEdges: "auto",
  getGeometry: "auto",
  measureDistance: "auto",
  getBoundingBox: "auto",

  // Notify (creates things, but non-destructive)
  createWorkspace: "notify",
  createProject: "notify",
  createDocument: "notify",
  createBranch: "notify",
  createSketch: "notify",
  addSketchGeometry: "notify",
  addSketchConstraints: "notify",
  exitSketch: "auto",
  createExtrude: "notify",
  createRevolve: "notify",
  createFillet: "notify",
  createChamfer: "notify",
  createPattern: "notify",
  createBox: "notify",
  createCylinder: "notify",
  createHole: "notify",
  createSlot: "notify",
  createPocket: "notify",
  createBoss: "notify",
  createShell: "notify",

  // Confirm (modifies or deletes)
  modifyFeature: "confirm",
  deleteFeature: "confirm",
  reorderFeature: "confirm",
  suppressFeature: "confirm",

  // Navigation (auto with notification)
  openProject: "auto",
  openDocument: "auto",
};

export function getApprovalLevel(toolName: string): ApprovalLevel {
  return TOOL_APPROVAL_RULES[toolName] || "confirm";
}
```

### 8.2 Approval UI Component

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
  // Convert camelCase to Title Case
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
```

---

## Part 9: Implementation Phases

### Phase 23a: Core Infrastructure (1 week)

**Tasks:**
1. Install TanStack AI packages
2. Create AI adapter configuration
3. Implement chat session management
4. Create Durable Stream connection adapter
5. Implement server API route for chat

**Deliverables:**
- Working `/api/ai/chat` endpoint
- Basic streaming response
- Session creation and persistence

### Phase 23b: Context Assembly (1 week)

**Tasks:**
1. Implement document serialization
2. Implement selection context
3. Implement build state context
4. Implement screenshot capture
5. Create full context assembly function

**Deliverables:**
- `assembleEditorContext()` function
- Context passed to AI on each request

### Phase 23c: Dashboard AI (1 week)

**Tasks:**
1. Implement all dashboard tool definitions
2. Implement server-side tool handlers
3. Create dashboard system prompt
4. Create DashboardAIChat component
5. Test all dashboard operations

**Deliverables:**
- Working dashboard AI chat
- All CRUD operations via AI

### Phase 23d: Editor Query Tools (1 week)

**Tasks:**
1. Implement geometry query tools (findFaces, findEdges, etc.)
2. Implement selection tools
3. Implement measurement tools
4. Integrate with kernel worker

**Deliverables:**
- AI can query model geometry
- AI understands current selection

### Phase 23e: Editor Mutation Tools (1 week)

**Tasks:**
1. Implement sketch tools
2. Implement feature tools (extrude, revolve, etc.)
3. Implement modification tools
4. Implement complex geometry helpers

**Deliverables:**
- AI can create complete models
- AI can modify existing features

### Phase 23f: Apply & Recovery (1 week)

**Tasks:**
1. Implement change validation
2. Implement Yjs transaction application
3. Implement rollback on failure
4. Integrate with undo manager

**Deliverables:**
- Safe change application
- Automatic rollback on errors
- Undo support for AI changes

### Phase 23g: Tool Approval & Polish (1 week)

**Tasks:**
1. Implement tool approval flow
2. Create approval UI components
3. Session recovery and resumption
4. Error handling and user feedback
5. Performance optimization

**Deliverables:**
- Complete approval flow
- Robust error handling
- Production-ready AI chat

---

## Part 10: Testing Strategy

### 10.1 Unit Tests

```typescript
// Test tool definitions
describe("Dashboard Tools", () => {
  test("createProject validates input", async () => {
    const result = createProjectDef.inputSchema.safeParse({
      workspaceId: "not-a-uuid",
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

// Test context assembly
describe("Context Assembly", () => {
  test("serializeDocument includes all features", () => {
    const doc = createTestDocument();
    addSketchFeature(doc, "s1", "xy");
    addExtrudeFeature(doc, "e1", "s1", 10, "add");

    const serialized = serializeDocument(doc);
    expect(serialized.features).toHaveLength(6); // origin + 3 planes + sketch + extrude
  });
});
```

### 10.2 Integration Tests

```typescript
// Test complete AI flows
describe("AI Chat Integration", () => {
  test("AI can create a box", async () => {
    const session = createTestChatSession("editor");
    
    await session.sendMessage("Create a 50x30x20mm box");
    
    const doc = session.getDocument();
    expect(doc.features.some(f => f.type === "extrude")).toBe(true);
  });

  test("AI can navigate to project", async () => {
    const session = createTestChatSession("dashboard");
    const navigate = vi.fn();
    
    await session.sendMessage("Open the Test Project", { navigate });
    
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining("/dashboard/projects/") })
    );
  });
});
```

### 10.3 E2E Tests

```typescript
// Browser-based tests
test("dashboard AI creates project", async ({ page }) => {
  await page.goto("/dashboard");
  await page.click('[aria-label="Open AI Assistant"]');
  
  await page.fill('textarea', 'Create a new project called "My Test Project"');
  await page.click('[aria-label="Send message"]');
  
  // Wait for response
  await expect(page.locator('.ai-message-assistant')).toContainText("created");
  
  // Verify project appears
  await page.goto("/dashboard");
  await expect(page.locator('.dashboard-card')).toContainText("My Test Project");
});
```

---

## Part 11: Open Questions & Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Model selection? | Claude Sonnet default, add selector later | Start simple, expand as needed |
| Token limits for large docs? | Summarize features, use tools for detail | Keep context reasonable |
| Message history length? | Last 20 messages + all tool results | Balance context vs tokens |
| Cost management? | Per-user daily limits | Prevent abuse |
| Offline fallback? | Queue requests, notify user | Graceful degradation |
| Conflict during AI edit? | Show conflict dialog | User decides |
| Partial tool success? | Atomic transactions | All or nothing |
| Vision model usage? | Optional screenshot for complex queries | Only when needed |

---

## Summary

This unified plan consolidates the AI features into a single coherent implementation:

1. **TanStack AI** provides type-safe tool definitions and streaming
2. **Durable Streams** persist chat sessions and enable resumption
3. **Dashboard AI** handles workspace/project/document management
4. **Editor AI** constructs and modifies CAD geometry
5. **Context Assembly** gives the AI understanding of the model state
6. **Tool Approval** keeps users in control of destructive operations
7. **Apply & Recovery** ensures safe document modifications

The phased implementation allows incremental delivery while maintaining a coherent architecture throughout.
