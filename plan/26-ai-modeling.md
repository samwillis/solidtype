# Phase 26: AI 3D Modeling Integration

> **Status:** ⏳ **PLANNED**
> 
> This phase has not been started. Depends on Phase 25 (AI Sketch) completion.

## Prerequisites

- Phase 23: AI Core Infrastructure
- Phase 25: AI 2D Sketch Integration
- Phase 04-06, 10, 17, 20-22: 3D modeling features implemented

## Goals

- Enable AI to create and modify 3D features via natural language
- Implement feature creation tools (extrude, revolve, fillet, chamfer, pattern)
- Implement geometry query tools (find faces, edges, measure)
- Implement feature modification and deletion tools
- Build high-level geometry helpers for common operations
- Handle Yjs document mutations with validation and rollback

---

## 1. Editor Context Assembly

```typescript
// packages/app/src/lib/ai/context/editor-context.ts

export interface EditorAIContext {
  document: SerializedDocument;
  documentText: string;
  selection: SelectionContext;
  buildState: BuildStateContext;
  screenshot?: string;
  activeSketch?: SketchAIContext;
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
  return {
    document: serializeDocument(doc),
    documentText: serializeDocumentToText(doc),
    selection: serializeSelection(selection),
    buildState: serializeBuildState(kernelState),
    screenshot: renderer ? await captureScreenshot(renderer, scene, camera) : undefined,
    activeSketch: activeSketchId ? serializeSketchContext(doc, activeSketchId) : undefined,
  };
}
```

---

## 2. Editor System Prompt

```typescript
// packages/app/src/lib/ai/prompts/editor.ts

export function buildEditorSystemPrompt(context: EditorAIContext): string {
  return `
You are a CAD modeling assistant for SolidType.

## Current Model
${context.documentText}

## Selection
${JSON.stringify(context.selection, null, 2)}

## Build State
Status: ${context.buildState.status}
Errors: ${context.buildState.errors.map((e) => `${e.featureId}: ${e.message}`).join("\n") || "None"}

## Guidelines
1. Use tool calls to perform actions - don't describe, execute
2. Break complex geometry into steps: sketch → extrude → add details
3. Use persistent references for faces/edges (e.g., "face:e1:top")
4. Check build state after operations
5. If errors occur, diagnose and suggest fixes

## Dimension Heuristics (when not specified)
- Standard holes: M3=3.4mm, M4=4.5mm, M5=5.5mm, M6=6.6mm
- Wall thickness: 2-5mm for plastic, 1-3mm for sheet metal
- Fillet radii: 0.5-2mm for aesthetic, larger for structural
`;
}
```

---

## 3. Geometry Query Tools

```typescript
// packages/app/src/lib/ai/tools/modeling-query.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const getCurrentSelectionDef = toolDefinition({
  name: "getCurrentSelection",
  description: "Get the currently selected faces, edges, or features",
  inputSchema: z.object({}),
  outputSchema: z.object({
    type: z.enum(["none", "feature", "face", "edge", "vertex"]),
    items: z.array(
      z.object({
        persistentRef: z.string(),
        featureId: z.string(),
        geometryInfo: z
          .object({
            surfaceType: z.string().optional(),
            curveType: z.string().optional(),
            area: z.number().optional(),
            length: z.number().optional(),
          })
          .optional(),
      })
    ),
  }),
});

export const getModelContextDef = toolDefinition({
  name: "getModelContext",
  description: "Get current model state including features and build status",
  inputSchema: z.object({}),
  outputSchema: z.object({
    documentName: z.string(),
    units: z.string(),
    featureCount: z.number(),
    features: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        name: z.string().optional(),
        status: z.enum(["ok", "error", "pending"]),
      })
    ),
    errors: z.array(
      z.object({
        featureId: z.string(),
        code: z.string(),
        message: z.string(),
      })
    ),
  }),
});

export const findFacesDef = toolDefinition({
  name: "findFaces",
  description: "Find faces matching criteria",
  inputSchema: z.object({
    surfaceType: z.enum(["plane", "cylinder", "cone", "sphere", "torus", "any"]).optional(),
    orientation: z.enum(["top", "bottom", "front", "back", "left", "right", "any"]).optional(),
    featureId: z.string().optional(),
    minArea: z.number().optional(),
  }),
  outputSchema: z.array(
    z.object({
      persistentRef: z.string(),
      featureId: z.string(),
      surfaceType: z.string(),
      area: z.number(),
      normal: z.tuple([z.number(), z.number(), z.number()]),
    })
  ),
});

export const findEdgesDef = toolDefinition({
  name: "findEdges",
  description: "Find edges matching criteria",
  inputSchema: z.object({
    curveType: z.enum(["line", "circle", "arc", "any"]).optional(),
    faceRef: z.string().optional(),
    featureId: z.string().optional(),
    convexity: z.enum(["convex", "concave", "any"]).optional(),
  }),
  outputSchema: z.array(
    z.object({
      persistentRef: z.string(),
      curveType: z.string(),
      length: z.number(),
      convexity: z.enum(["convex", "concave", "unknown"]),
    })
  ),
});

export const measureDistanceDef = toolDefinition({
  name: "measureDistance",
  description: "Measure distance between two geometry references",
  inputSchema: z.object({
    ref1: z.string(),
    ref2: z.string(),
  }),
  outputSchema: z.object({
    distance: z.number(),
    type: z.enum(["minimum", "center-to-center"]),
  }),
});

export const getBoundingBoxDef = toolDefinition({
  name: "getBoundingBox",
  description: "Get bounding box of model or feature",
  inputSchema: z.object({ featureId: z.string().optional() }),
  outputSchema: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
    size: z.tuple([z.number(), z.number(), z.number()]),
  }),
});

export const modelingQueryToolDefs = [
  getCurrentSelectionDef,
  getModelContextDef,
  findFacesDef,
  findEdgesDef,
  measureDistanceDef,
  getBoundingBoxDef,
];
```

---

## 4. Feature Creation Tools

```typescript
// packages/app/src/lib/ai/tools/modeling-features.ts

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
  description: "Revolve a sketch profile around an axis",
  inputSchema: z.object({
    sketchId: z.string(),
    axisLineId: z.string(),
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

export const createLinearPatternDef = toolDefinition({
  name: "createLinearPattern",
  description: "Create a linear pattern of features",
  inputSchema: z.object({
    featureIds: z.array(z.string()).min(1),
    direction: z.tuple([z.number(), z.number(), z.number()]),
    count: z.number().int().min(2),
    spacing: z.number().positive(),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
  }),
});

export const createCircularPatternDef = toolDefinition({
  name: "createCircularPattern",
  description: "Create a circular pattern of features",
  inputSchema: z.object({
    featureIds: z.array(z.string()).min(1),
    axis: z.tuple([z.number(), z.number(), z.number()]),
    axisPoint: z.tuple([z.number(), z.number(), z.number()]),
    count: z.number().int().min(2),
    totalAngle: z.number().default(360),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
  }),
});

export const featureToolDefs = [
  createExtrudeDef,
  createRevolveDef,
  createFilletDef,
  createChamferDef,
  createLinearPatternDef,
  createCircularPatternDef,
];
```

---

## 5. Feature Modification Tools

```typescript
// packages/app/src/lib/ai/tools/modeling-modify.ts

export const modifyFeatureDef = toolDefinition({
  name: "modifyFeature",
  description: "Change parameters of an existing feature",
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
  description: "Move feature in the tree (affects rebuild order)",
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
  description: "Suppress or unsuppress a feature",
  inputSchema: z.object({
    featureId: z.string(),
    suppressed: z.boolean(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

export const renameFeatureDef = toolDefinition({
  name: "renameFeature",
  description: "Rename a feature",
  inputSchema: z.object({
    featureId: z.string(),
    name: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

export const modifyToolDefs = [
  modifyFeatureDef,
  deleteFeatureDef,
  reorderFeatureDef,
  suppressFeatureDef,
  renameFeatureDef,
];
```

---

## 6. High-Level Geometry Helpers

```typescript
// packages/app/src/lib/ai/tools/modeling-helpers.ts

export const createBoxDef = toolDefinition({
  name: "createBox",
  description: "Create a box primitive",
  inputSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
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
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    extrudeId: z.string(),
  }),
});

export const createHoleDef = toolDefinition({
  name: "createHole",
  description: "Create a hole on a face",
  inputSchema: z.object({
    faceRef: z.string(),
    diameter: z.number().positive(),
    depth: z.number().positive().or(z.literal("through")),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
  }),
});

export const createPocketDef = toolDefinition({
  name: "createPocket",
  description: "Create a rectangular pocket on a face",
  inputSchema: z.object({
    faceRef: z.string(),
    width: z.number().positive(),
    length: z.number().positive(),
    depth: z.number().positive(),
    cornerRadius: z.number().min(0).default(0),
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
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
  }),
});

export const createShellDef = toolDefinition({
  name: "createShell",
  description: "Hollow out a solid",
  inputSchema: z.object({
    thickness: z.number().positive(),
    openFaces: z.array(z.string()).optional(),
    name: z.string().optional(),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
  }),
});

export const helperToolDefs = [
  createBoxDef,
  createCylinderDef,
  createHoleDef,
  createPocketDef,
  createBossDef,
  createShellDef,
];
```

---

## 7. Yjs Change Application

```typescript
// packages/app/src/lib/ai/apply/apply-changes.ts

export interface AIChange {
  type: "modify" | "add" | "remove" | "reorder";
  featureId?: string;
  changes?: Record<string, unknown>;
  afterFeatureId?: string | null;
  feature?: { type: string; id: string; attributes: Record<string, unknown> };
}

export function applyChanges(
  changes: AIChange[],
  doc: SolidTypeDoc,
  origin = "ai-change"
): { ok: boolean; appliedChanges: number; errors?: string[] } {
  const validation = validateChanges(changes, doc);
  if (!validation.valid) {
    return { ok: false, appliedChanges: 0, errors: validation.errors.map((e) => e.message) };
  }

  let appliedChanges = 0;

  doc.ydoc.transact(() => {
    for (const change of changes) {
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
    }
  }, origin);

  return { ok: true, appliedChanges };
}

export async function applyChangesWithRecovery(
  changes: AIChange[],
  doc: SolidTypeDoc,
  triggerRebuild: () => Promise<{ ok: boolean; errors?: string[] }>
) {
  const snapshot = Y.snapshot(doc.ydoc);

  try {
    const result = applyChanges(changes, doc);
    if (!result.ok) return result;

    const rebuildResult = await triggerRebuild();
    if (!rebuildResult.ok) {
      // Rollback
      const snapshotDoc = Y.createDocFromSnapshot(doc.ydoc, snapshot);
      Y.applyUpdate(doc.ydoc, Y.encodeStateAsUpdate(snapshotDoc));
      return { ok: false, appliedChanges: 0, errors: rebuildResult.errors, rolledBack: true };
    }

    return result;
  } catch (error) {
    // Rollback on error
    const snapshotDoc = Y.createDocFromSnapshot(doc.ydoc, snapshot);
    Y.applyUpdate(doc.ydoc, Y.encodeStateAsUpdate(snapshotDoc));
    return { ok: false, appliedChanges: 0, message: String(error), rolledBack: true };
  }
}
```

---

## 8. Tool Approval Rules

**Note:** Modeling tool approval rules are defined in the unified registry in Phase 23 (`packages/app/src/lib/ai/approval.ts`).

**Default behavior:** All modeling tools auto-execute without confirmation.

| Tool               | Approval Level   |
| ------------------ | ---------------- |
| All modeling tools | `auto` (default) |

**Rationale:** All modeling operations are undoable via Yjs, so there's no need for confirmation dialogs. Users can always undo any AI-made changes with Ctrl+Z.

See Phase 23 `MODELING_TOOL_APPROVAL` for the authoritative source.

---

## 9. Editor AI Panel Integration

The AI panel uses the same `AIChat` component, but the editor context (selection, kernel state) is accessed via React Context on the server side, not passed as props.

```typescript
// packages/app/src/editor/components/AIPanel.tsx
import { useDocument } from "../contexts/DocumentContext";
import { AIChat } from "../../components/ai/AIChat";
import { AgentStatus } from "../../components/ai/AgentStatus";
import { useAgent } from "../../hooks/useAgent";
import "./AIPanel.css";

export function AIPanel() {
  const { documentId, projectId, awareness } = useDocument();

  // Optional: spawn an agent for background modeling
  const agent = useAgent({
    sessionId: `editor-${documentId}`,
    documentId,
    projectId,
    awareness,
  });

  return (
    <div className="editor-ai-panel">
      {/* Agent status indicator (shows when agent is spawned) */}
      {agent.isSpawned && (
        <AgentStatus
          identity={agent.identity}
          state={agent.state}
          onTerminate={agent.terminate}
        />
      )}

      {/* Main chat interface - userId handled via auth context */}
      <AIChat
        context="editor"
        documentId={documentId}
        projectId={projectId}
      />

      {/* Agent spawn button (when not active) */}
      {!agent.isSpawned && (
        <button
          className="ai-panel-spawn-agent"
          onClick={agent.spawn}
        >
          Start AI Agent
        </button>
      )}
    </div>
  );
}
```

### Editor Context Provider for AI

The server-side tools access editor state via a context provider:

```typescript
// packages/app/src/lib/ai/editor-context.ts
import { AsyncLocalStorage } from "async_hooks";

interface EditorContext {
  documentId: string;
  selection: string[];
  kernelState: "ready" | "busy" | "error";
}

// AsyncLocalStorage for server-side context
export const editorContextStorage = new AsyncLocalStorage<EditorContext>();

/**
 * Run a function with editor context available
 */
export function withEditorContext<T>(
  context: EditorContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return editorContextStorage.run(context, fn);
}

/**
 * Get current editor context (for use in tool implementations)
 */
export function getEditorContext(): EditorContext | undefined {
  return editorContextStorage.getStore();
}
```

---

## 10. Export All Modeling Tools

```typescript
// packages/app/src/lib/ai/tools/modeling-impl.ts
import { getEditorContext } from "../editor-context";
import { loadDocument } from "../../document-loader";

export const modelingToolDefs = [
  ...modelingQueryToolDefs,
  ...featureToolDefs,
  ...modifyToolDefs,
  ...helperToolDefs,
];

/**
 * Factory function to create modeling server tools.
 * Called from /api/ai/chat with documentId.
 * Loads document and accesses kernel state via editor context.
 */
export async function getModelingTools(documentId: string) {
  const doc = await loadDocument(documentId);
  const editorContext = getEditorContext(); // From AsyncLocalStorage

  return modelingToolDefs.map((def) => {
    // Implementation uses doc and editorContext from closure
    return def.server(/* implementation */);
  });
}
```

---

## Testing

```typescript
describe("Modeling AI Tools", () => {
  test("createExtrude creates feature", async () => {
    const doc = createTestDocument();
    createTestSketch(doc, "s1");
    const tools = await getModelingTools(doc, mockKernelState);
    const extrude = tools.find((t) => t.name === "createExtrude");

    const result = await extrude.execute({
      sketchId: "s1",
      distance: 10,
      op: "add",
    });

    expect(result.featureId).toBeDefined();
    expect(result.status).toBe("ok");
  });

  test("createBox creates sketch and extrude", async () => {
    const doc = createTestDocument();
    const tools = await getModelingTools(doc, mockKernelState);
    const box = tools.find((t) => t.name === "createBox");

    const result = await box.execute({
      width: 50,
      height: 30,
      depth: 20,
    });

    expect(result.sketchId).toBeDefined();
    expect(result.extrudeId).toBeDefined();
  });

  test("findFaces returns matching faces", async () => {
    const doc = createTestDocumentWithBox();
    const tools = await getModelingTools(doc, mockKernelState);
    const find = tools.find((t) => t.name === "findFaces");

    const result = await find.execute({
      surfaceType: "plane",
      orientation: "top",
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].surfaceType).toBe("plane");
  });
});

describe("Modeling AI Integration", () => {
  test("AI can create a bracket with holes", async () => {
    const session = createTestChatSession("editor");

    await session.sendMessage("Create a 100x50x10mm bracket with two M6 holes 20mm from each end");

    const doc = session.getDocument();
    expect(doc.features.filter((f) => f.type === "extrude").length).toBeGreaterThanOrEqual(3);
  });
});
```

---

## Deliverables

- [ ] Editor context assembly
- [ ] Editor system prompt
- [ ] Geometry query tools (selection, find faces/edges, measure, bounding box)
- [ ] Feature creation tools (extrude, revolve, fillet, chamfer, patterns)
- [ ] Feature modification tools (modify, delete, reorder, suppress, rename)
- [ ] High-level geometry helpers (box, cylinder, hole, pocket, boss, shell)
- [ ] Yjs change application with validation and rollback
- [ ] Tool approval rules
- [ ] Editor AI panel integration
- [ ] Tests passing
