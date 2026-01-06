# Phase 25: AI 2D Sketch Integration

> **Status:** ⚠️ **IN PROGRESS**
>
> Tool definitions and implementations are complete. Integration with the AI chat UI and worker execution loop is pending.

## Prerequisites

- Phase 23: AI Core Infrastructure
- Phase 03-09: Sketch functionality implemented

## Goals

- Enable AI to create and edit 2D sketches via natural language
- Implement sketch geometry tools (lines, arcs, circles, rectangles, polygons)
- Implement constraint tools (geometric and dimensional)
- Integrate with the sketch context and solver
- Handle sketch entry/exit

---

## 1. Sketch Context for AI

### Serialize Active Sketch

```typescript
// packages/app/src/lib/ai/context/sketch-context.ts
import * as Y from "yjs";
import type { SolidTypeDoc } from "../../../editor/document";

export interface SketchAIContext {
  sketchId: string;
  planeName: string;
  points: Array<{
    id: string;
    x: number;
    y: number;
    fixed: boolean;
  }>;
  entities: Array<{
    id: string;
    type: string;
    points: string[];
    properties: Record<string, unknown>;
  }>;
  constraints: Array<{
    id: string;
    type: string;
    targets: string[];
    value?: number;
  }>;
  solverStatus: "solved" | "underconstrained" | "overconstrained" | "inconsistent";
  degreesOfFreedom: number;
}

export function serializeSketchContext(
  doc: SolidTypeDoc,
  sketchId: string
): SketchAIContext | null {
  const sketchFeature = doc.featuresById.get(sketchId);
  if (!sketchFeature || sketchFeature.get("type") !== "sketch") {
    return null;
  }

  const data = sketchFeature.get("data") as Y.Map<unknown>;
  if (!data) return null;

  const pointsById = (data.get("pointsById") as Y.Map<unknown>)?.toJSON() || {};
  const entitiesById = (data.get("entitiesById") as Y.Map<unknown>)?.toJSON() || {};
  const constraintsById = (data.get("constraintsById") as Y.Map<unknown>)?.toJSON() || {};

  const points = Object.values(pointsById).map((p: any) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    fixed: p.fixed || false,
  }));

  const entities = Object.values(entitiesById).map((e: any) => {
    const points: string[] = [];
    if (e.start) points.push(e.start);
    if (e.end) points.push(e.end);
    if (e.center) points.push(e.center);
    return {
      id: e.id,
      type: e.type,
      points,
      properties: e,
    };
  });

  const constraints = Object.values(constraintsById).map((c: any) => {
    const targets: string[] = [];
    if (c.points) targets.push(...c.points);
    if (c.lines) targets.push(...c.lines);
    if (c.point) targets.push(c.point);
    if (c.line) targets.push(c.line);
    if (c.arc) targets.push(c.arc);
    if (c.axis) targets.push(c.axis);
    return {
      id: c.id,
      type: c.type,
      targets,
      value: c.value,
    };
  });

  const plane = sketchFeature.get("plane") as any;
  const planeName = plane?.kind === "planeFeatureId" ? plane.ref : "custom";

  return {
    sketchId,
    planeName,
    points,
    entities,
    constraints,
    solverStatus: "underconstrained", // TODO: Get from solver
    degreesOfFreedom: 0, // TODO: Calculate
  };
}
```

### Sketch System Prompt

```typescript
// packages/app/src/lib/ai/prompts/sketch.ts

export function buildSketchSystemPrompt(sketchContext: SketchAIContext): string {
  return `
You are editing a 2D sketch in SolidType.

## Current Sketch: ${sketchContext.sketchId}
- Plane: ${sketchContext.planeName}
- Solver Status: ${sketchContext.solverStatus}
- Degrees of Freedom: ${sketchContext.degreesOfFreedom}

## Geometry
Points (${sketchContext.points.length}):
${sketchContext.points.map((p) => `  - ${p.id}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${p.fixed ? " [FIXED]" : ""}`).join("\n")}

Entities (${sketchContext.entities.length}):
${sketchContext.entities.map((e) => `  - ${e.id}: ${e.type} (${e.points.join(", ")})`).join("\n")}

Constraints (${sketchContext.constraints.length}):
${sketchContext.constraints.map((c) => `  - ${c.id}: ${c.type} on [${c.targets.join(", ")}]${c.value !== undefined ? ` = ${c.value}` : ""}`).join("\n")}

## Coordinate System
- Origin is at (0, 0)
- X increases to the right
- Y increases upward
- All dimensions are in the document units (usually mm)

## Guidelines
1. Use descriptive IDs for geometry (e.g., "bottom-left", "center-hole")
2. Add constraints to define design intent
3. Aim for a fully constrained sketch (0 degrees of freedom)
4. Connect geometry by using the same point IDs
5. For closed profiles, ensure all endpoints connect

## Common Patterns
- Rectangle: 4 lines with coincident corners, horizontal/vertical constraints
- Circle: center point + circle entity
- Slot: 2 parallel lines + 2 arcs
- Symmetric: use symmetric constraint about a centerline
`;
}
```

---

## 2. Sketch Tool Definitions

### Sketch Lifecycle Tools

```typescript
// packages/app/src/lib/ai/tools/sketch.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const createSketchDef = toolDefinition({
  name: "createSketch",
  description: "Create a new 2D sketch on a plane or face",
  inputSchema: z.object({
    plane: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("planeFeatureId"), ref: z.string() }),
      z.object({ kind: z.literal("faceRef"), ref: z.string() }),
    ]),
    name: z.string().optional(),
    enterSketch: z.boolean().default(true),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    entered: z.boolean(),
  }),
});

export const enterSketchDef = toolDefinition({
  name: "enterSketch",
  description: "Enter an existing sketch for editing",
  inputSchema: z.object({
    sketchId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    sketchId: z.string(),
  }),
});

export const exitSketchDef = toolDefinition({
  name: "exitSketch",
  description: "Exit sketch editing mode and return to 3D view",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const getSketchStatusDef = toolDefinition({
  name: "getSketchStatus",
  description: "Get the current sketch status including solver state and degrees of freedom",
  inputSchema: z.object({}),
  outputSchema: z.object({
    sketchId: z.string(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
    degreesOfFreedom: z.number(),
    pointCount: z.number(),
    entityCount: z.number(),
    constraintCount: z.number(),
  }),
});
```

### Geometry Creation Tools

```typescript
export const addLineDef = toolDefinition({
  name: "addLine",
  description: "Add a line to the current sketch",
  inputSchema: z.object({
    start: z.object({ x: z.number(), y: z.number() }),
    end: z.object({ x: z.number(), y: z.number() }),
    startPointId: z.string().optional().describe("Reuse existing point by ID"),
    endPointId: z.string().optional().describe("Reuse existing point by ID"),
  }),
  outputSchema: z.object({
    lineId: z.string(),
    startPointId: z.string(),
    endPointId: z.string(),
  }),
});

export const addCircleDef = toolDefinition({
  name: "addCircle",
  description: "Add a circle to the current sketch",
  inputSchema: z.object({
    center: z.object({ x: z.number(), y: z.number() }),
    radius: z.number().positive(),
    centerPointId: z.string().optional().describe("Reuse existing point by ID"),
  }),
  outputSchema: z.object({
    circleId: z.string(),
    centerPointId: z.string(),
  }),
});

export const addArcDef = toolDefinition({
  name: "addArc",
  description: "Add an arc to the current sketch",
  inputSchema: z.object({
    start: z.object({ x: z.number(), y: z.number() }),
    end: z.object({ x: z.number(), y: z.number() }),
    center: z.object({ x: z.number(), y: z.number() }),
    ccw: z.boolean().default(true).describe("Counter-clockwise direction"),
    startPointId: z.string().optional(),
    endPointId: z.string().optional(),
    centerPointId: z.string().optional(),
  }),
  outputSchema: z.object({
    arcId: z.string(),
    startPointId: z.string(),
    endPointId: z.string(),
    centerPointId: z.string(),
  }),
});

export const addRectangleDef = toolDefinition({
  name: "addRectangle",
  description: "Add a rectangle (4 connected lines) to the current sketch",
  inputSchema: z.object({
    corner1: z.object({ x: z.number(), y: z.number() }),
    corner2: z.object({ x: z.number(), y: z.number() }),
    centered: z.boolean().default(false).describe("If true, corners define center and size"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
  }),
});

export const addPolygonDef = toolDefinition({
  name: "addPolygon",
  description: "Add a regular polygon to the current sketch",
  inputSchema: z.object({
    center: z.object({ x: z.number(), y: z.number() }),
    radius: z.number().positive(),
    sides: z.number().int().min(3).max(100),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
  }),
});

export const addSlotDef = toolDefinition({
  name: "addSlot",
  description: "Add a slot (rounded rectangle) to the current sketch",
  inputSchema: z.object({
    center: z.object({ x: z.number(), y: z.number() }),
    length: z.number().positive(),
    width: z.number().positive(),
    angle: z.number().default(0).describe("Rotation angle in degrees"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    arcIds: z.array(z.string()),
    pointIds: z.array(z.string()),
  }),
});
```

### Point Manipulation Tools

```typescript
export const movePointDef = toolDefinition({
  name: "movePoint",
  description: "Move a point to a new location",
  inputSchema: z.object({
    pointId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const mergePointsDef = toolDefinition({
  name: "mergePoints",
  description: "Merge two points into one (adds coincident constraint)",
  inputSchema: z.object({
    keepPointId: z.string(),
    removePointId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    constraintId: z.string(),
  }),
});
```

### Constraint Tools

```typescript
export const addConstraintDef = toolDefinition({
  name: "addConstraint",
  description: "Add a constraint to sketch elements",
  inputSchema: z.object({
    constraint: z.discriminatedUnion("type", [
      // Point constraints
      z.object({
        type: z.literal("horizontal"),
        points: z.tuple([z.string(), z.string()]),
      }),
      z.object({
        type: z.literal("vertical"),
        points: z.tuple([z.string(), z.string()]),
      }),
      z.object({
        type: z.literal("coincident"),
        points: z.tuple([z.string(), z.string()]),
      }),
      z.object({
        type: z.literal("fixed"),
        point: z.string(),
      }),
      // Dimensional constraints
      z.object({
        type: z.literal("distance"),
        points: z.tuple([z.string(), z.string()]),
        value: z.number().positive(),
      }),
      z.object({
        type: z.literal("horizontalDistance"),
        points: z.tuple([z.string(), z.string()]),
        value: z.number(),
      }),
      z.object({
        type: z.literal("verticalDistance"),
        points: z.tuple([z.string(), z.string()]),
        value: z.number(),
      }),
      z.object({
        type: z.literal("angle"),
        lines: z.tuple([z.string(), z.string()]),
        value: z.number(),
      }),
      z.object({
        type: z.literal("radius"),
        arc: z.string(),
        value: z.number().positive(),
      }),
      // Line constraints
      z.object({
        type: z.literal("parallel"),
        lines: z.tuple([z.string(), z.string()]),
      }),
      z.object({
        type: z.literal("perpendicular"),
        lines: z.tuple([z.string(), z.string()]),
      }),
      z.object({
        type: z.literal("equalLength"),
        lines: z.tuple([z.string(), z.string()]),
      }),
      z.object({
        type: z.literal("collinear"),
        lines: z.tuple([z.string(), z.string()]),
      }),
      // Arc constraints
      z.object({
        type: z.literal("tangent"),
        line: z.string(),
        arc: z.string(),
      }),
      z.object({
        type: z.literal("equalRadius"),
        arcs: z.tuple([z.string(), z.string()]),
      }),
      z.object({
        type: z.literal("concentric"),
        arcs: z.tuple([z.string(), z.string()]),
      }),
      // Symmetry
      z.object({
        type: z.literal("symmetric"),
        points: z.tuple([z.string(), z.string()]),
        axis: z.string(),
      }),
      // Point on entity
      z.object({
        type: z.literal("pointOnLine"),
        point: z.string(),
        line: z.string(),
      }),
      z.object({
        type: z.literal("pointOnArc"),
        point: z.string(),
        arc: z.string(),
      }),
      z.object({
        type: z.literal("midpoint"),
        point: z.string(),
        line: z.string(),
      }),
    ]),
  }),
  outputSchema: z.object({
    constraintId: z.string(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const removeConstraintDef = toolDefinition({
  name: "removeConstraint",
  description: "Remove a constraint from the sketch",
  inputSchema: z.object({
    constraintId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const modifyConstraintValueDef = toolDefinition({
  name: "modifyConstraintValue",
  description: "Change the value of a dimensional constraint",
  inputSchema: z.object({
    constraintId: z.string(),
    value: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});
```

### Geometry Deletion Tools

```typescript
export const deleteEntityDef = toolDefinition({
  name: "deleteEntity",
  description: "Delete a geometry entity (line, arc, circle) and its associated constraints",
  inputSchema: z.object({
    entityId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedConstraints: z.array(z.string()),
  }),
});

export const deletePointDef = toolDefinition({
  name: "deletePoint",
  description: "Delete a point and all entities/constraints that reference it",
  inputSchema: z.object({
    pointId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedEntities: z.array(z.string()),
    deletedConstraints: z.array(z.string()),
  }),
});
```

### Export All Sketch Tools

```typescript
export const sketchToolDefs = [
  // Lifecycle
  createSketchDef,
  enterSketchDef,
  exitSketchDef,
  getSketchStatusDef,
  // Geometry
  addLineDef,
  addCircleDef,
  addArcDef,
  addRectangleDef,
  addPolygonDef,
  addSlotDef,
  // Points
  movePointDef,
  mergePointsDef,
  // Constraints
  addConstraintDef,
  removeConstraintDef,
  modifyConstraintValueDef,
  // Deletion
  deleteEntityDef,
  deletePointDef,
];
```

---

## 3. Tool Implementations

The tool implementation factory takes `documentId` and loads the document + editor context as needed.

```typescript
// packages/app/src/lib/ai/tools/sketch-impl.ts
import { sketchToolDefs } from "./sketch";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { getEditorContext } from "../editor-context";
import { loadDocument } from "../../document-loader";

/**
 * Factory function to create sketch server tools.
 * Called from /api/ai/chat with documentId.
 */
export async function getSketchTools(documentId: string) {
  const doc = await loadDocument(documentId);
  const editorContext = getEditorContext(); // From AsyncLocalStorage

  return sketchToolDefs.map((def) => {
    switch (def.name) {
      case "addLine":
        return def.server(async ({ start, end, startPointId, endPointId }) => {
          // Get active sketch from editor context or find it in document
          const activeSketchId = editorContext?.activeSketchId;
          const sketchData = getActiveSketchData(doc, activeSketchId);

          // Create or reuse points
          const startPt = startPointId || uuid();
          const endPt = endPointId || uuid();

          if (!startPointId) {
            sketchData.pointsById.set(startPt, { id: startPt, x: start.x, y: start.y });
          }
          if (!endPointId) {
            sketchData.pointsById.set(endPt, { id: endPt, x: end.x, y: end.y });
          }

          // Create line
          const lineId = uuid();
          sketchData.entitiesById.set(lineId, {
            id: lineId,
            type: "line",
            start: startPt,
            end: endPt,
          });

          return { lineId, startPointId: startPt, endPointId: endPt };
        });

      case "addRectangle":
        return def.server(async ({ corner1, corner2, centered }) => {
          const sketchData = getActiveSketchData(doc, sketchContext.activeSketchId);

          let x1, y1, x2, y2;
          if (centered) {
            // corner1 is center, corner2 is half-size
            x1 = corner1.x - corner2.x;
            y1 = corner1.y - corner2.y;
            x2 = corner1.x + corner2.x;
            y2 = corner1.y + corner2.y;
          } else {
            x1 = Math.min(corner1.x, corner2.x);
            y1 = Math.min(corner1.y, corner2.y);
            x2 = Math.max(corner1.x, corner2.x);
            y2 = Math.max(corner1.y, corner2.y);
          }

          // Create 4 corner points
          const p1 = uuid(),
            p2 = uuid(),
            p3 = uuid(),
            p4 = uuid();
          sketchData.pointsById.set(p1, { id: p1, x: x1, y: y1 });
          sketchData.pointsById.set(p2, { id: p2, x: x2, y: y1 });
          sketchData.pointsById.set(p3, { id: p3, x: x2, y: y2 });
          sketchData.pointsById.set(p4, { id: p4, x: x1, y: y2 });

          // Create 4 lines
          const l1 = uuid(),
            l2 = uuid(),
            l3 = uuid(),
            l4 = uuid();
          sketchData.entitiesById.set(l1, { id: l1, type: "line", start: p1, end: p2 });
          sketchData.entitiesById.set(l2, { id: l2, type: "line", start: p2, end: p3 });
          sketchData.entitiesById.set(l3, { id: l3, type: "line", start: p3, end: p4 });
          sketchData.entitiesById.set(l4, { id: l4, type: "line", start: p4, end: p1 });

          // Add horizontal/vertical constraints
          const c1 = uuid(),
            c2 = uuid(),
            c3 = uuid(),
            c4 = uuid();
          sketchData.constraintsById.set(c1, { id: c1, type: "horizontal", points: [p1, p2] });
          sketchData.constraintsById.set(c2, { id: c2, type: "vertical", points: [p2, p3] });
          sketchData.constraintsById.set(c3, { id: c3, type: "horizontal", points: [p3, p4] });
          sketchData.constraintsById.set(c4, { id: c4, type: "vertical", points: [p4, p1] });

          return {
            lineIds: [l1, l2, l3, l4],
            pointIds: [p1, p2, p3, p4],
          };
        });

      case "addConstraint":
        return def.server(async ({ constraint }) => {
          const sketchData = getActiveSketchData(doc, sketchContext.activeSketchId);

          const constraintId = uuid();
          sketchData.constraintsById.set(constraintId, {
            id: constraintId,
            ...constraint,
          });

          // Run solver
          const solverResult = await runSolver(sketchData);

          return {
            constraintId,
            solverStatus: solverResult.status,
          };
        });

      // ... implement remaining tools

      default:
        throw new Error(`Unimplemented tool: ${def.name}`);
    }
  });
}
```

---

## 4. High-Level Sketch Helpers

```typescript
// packages/app/src/lib/ai/tools/sketch-helpers.ts

export const createCenteredRectangleDef = toolDefinition({
  name: "createCenteredRectangle",
  description: "Create a fully constrained centered rectangle",
  inputSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
    constraintIds: z.array(z.string()),
  }),
});

export const createCircleWithRadiusDef = toolDefinition({
  name: "createCircleWithRadius",
  description: "Create a circle at origin with specified radius, fully constrained",
  inputSchema: z.object({
    radius: z.number().positive(),
    centerX: z.number().default(0),
    centerY: z.number().default(0),
  }),
  outputSchema: z.object({
    circleId: z.string(),
    centerPointId: z.string(),
    constraintIds: z.array(z.string()),
  }),
});

export const createSymmetricProfileDef = toolDefinition({
  name: "createSymmetricProfile",
  description: "Create a profile that is symmetric about the Y axis",
  inputSchema: z.object({
    halfProfile: z.array(
      z.object({
        x: z.number().min(0),
        y: z.number(),
      })
    ),
    closed: z.boolean().default(true),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
    symmetryConstraintIds: z.array(z.string()),
  }),
});
```

---

## 5. Tool Approval Rules

**Note:** Sketch tool approval rules are defined in the unified registry in Phase 23 (`packages/app/src/lib/ai/approval.ts`).

**Default behavior:** All sketch tools auto-execute without confirmation.

| Tool             | Approval Level   |
| ---------------- | ---------------- |
| All sketch tools | `auto` (default) |

**Rationale:** All sketch operations are undoable via Yjs, so there's no need for confirmation dialogs. Users can always undo any AI-made changes.

See Phase 23 `SKETCH_TOOL_APPROVAL` for the authoritative source.

---

## Testing

```typescript
describe("Sketch AI Tools", () => {
  test("addRectangle creates 4 lines and 4 points", async () => {
    const doc = createTestDocument();
    const tools = getSketchTools(doc, { activeSketchId: "s1" });
    const addRect = tools.find((t) => t.name === "addRectangle");

    const result = await addRect.execute({
      corner1: { x: 0, y: 0 },
      corner2: { x: 100, y: 50 },
      centered: false,
    });

    expect(result.lineIds).toHaveLength(4);
    expect(result.pointIds).toHaveLength(4);
  });

  test("addConstraint updates solver status", async () => {
    const doc = createTestDocument();
    createTestSketchWithLine(doc, "s1");
    const tools = getSketchTools(doc, { activeSketchId: "s1" });
    const addConstraint = tools.find((t) => t.name === "addConstraint");

    const result = await addConstraint.execute({
      constraint: {
        type: "horizontal",
        points: ["p1", "p2"],
      },
    });

    expect(result.constraintId).toBeDefined();
    expect(result.solverStatus).toBeDefined();
  });
});

describe("Sketch AI Integration", () => {
  test("AI can create a constrained rectangle", async () => {
    const session = createTestChatSession("editor");

    await session.sendMessage("Create a 50x30mm rectangle centered at the origin on the XY plane");

    const doc = session.getDocument();
    const sketch = getLatestSketch(doc);

    expect(sketch.entities.length).toBe(4);
    expect(sketch.constraints.some((c) => c.type === "horizontal")).toBe(true);
  });
});
```

---

## Deliverables

- [x] Sketch context serialization
- [x] Sketch system prompt
- [x] Sketch lifecycle tools (create, enter, exit, status)
- [x] Geometry creation tools (line, circle, arc, rectangle, polygon, slot)
- [x] Point manipulation tools (move, merge)
- [x] Constraint tools (all constraint types)
- [x] Geometry deletion tools
- [x] High-level helpers (centered rectangle, etc.)
- [x] Tool implementations with solver integration
- [x] Tool approval rules
- [x] Tests passing (41 tests)
- [ ] Integration with AI chat worker
- [ ] End-to-end testing with LLM
