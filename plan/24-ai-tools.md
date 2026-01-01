# Phase 24: AI Tools

## Prerequisites

- Phase 23: AI Context Assembly

## Goals

- Define tool API for AI to query model
- Implement selection resolution tools
- Implement geometry query tools
- Enable AI to gather information before making changes

---

## Why Tools?

The Yjs XML provides the document structure, but the AI often needs to:

1. **Resolve what's selected** - "The face I'm pointing at"
2. **Find geometry** - "The top faces", "edges longer than 10mm"
3. **Query properties** - "What's the area of this face?"
4. **Validate changes** - "Is this XML valid?"

Tools let the AI ask questions and get precise answers.

---

## Tool Definitions

### 1. get_current_selection

Returns information about the currently selected face/edge:

```typescript
const getSelectionTool = {
  name: "get_current_selection",
  description: "Get information about the currently selected face, edge, or feature",
  parameters: {},
  execute: async (context: AIContext): Promise<SelectionInfo> => {
    return {
      type: context.selection.type,
      persistentRef: context.selection.persistentRef,
      featureId: context.selection.featureId,
      geometry: context.selection.geometryInfo,
    };
  },
};
```

### 2. find_faces

Find faces matching criteria:

```typescript
const findFacesTool = {
  name: "find_faces",
  description: "Find faces matching the given criteria",
  parameters: {
    type: "object",
    properties: {
      surfaceType: {
        type: "string",
        enum: ["plane", "cylinder", "cone", "sphere", "any"],
        description: "Type of surface",
      },
      orientation: {
        type: "string",
        enum: ["top", "bottom", "side", "front", "back", "any"],
        description: "Approximate orientation",
      },
      featureId: {
        type: "string",
        description: "Only faces from this feature",
      },
      minArea: {
        type: "number",
        description: "Minimum face area",
      },
    },
  },
  execute: async (params, context): Promise<FaceInfo[]> => {
    const allFaces = getAllFaces(context.session);

    return allFaces
      .filter((f) => matchesCriteria(f, params))
      .map((f) => ({
        persistentRef: f.persistentRef.toString(),
        featureId: f.originFeature,
        surfaceType: f.surface.kind,
        area: f.area,
        centroid: f.centroid,
        normal: f.normal,
      }));
  },
};
```

### 3. find_edges

Find edges matching criteria:

```typescript
const findEdgesTool = {
  name: "find_edges",
  description: "Find edges matching the given criteria",
  parameters: {
    type: "object",
    properties: {
      curveType: {
        type: "string",
        enum: ["line", "circle", "arc", "any"],
      },
      faceRef: {
        type: "string",
        description: "Only edges of this face",
      },
      minLength: {
        type: "number",
      },
      convexity: {
        type: "string",
        enum: ["convex", "concave", "any"],
        description: "Edge convexity (for fillet candidates)",
      },
    },
  },
  execute: async (params, context): Promise<EdgeInfo[]> => {
    // Find and filter edges
  },
};
```

### 4. get_geometry

Get detailed geometry for a face or edge:

```typescript
const getGeometryTool = {
  name: "get_geometry",
  description: "Get detailed geometric properties of a face or edge",
  parameters: {
    type: "object",
    properties: {
      ref: {
        type: "string",
        description: 'Persistent reference (e.g., "face:e1:top")',
        required: true,
      },
    },
  },
  execute: async (params, context): Promise<GeometryInfo> => {
    const { ref } = params;

    if (ref.startsWith("face:")) {
      const face = resolveFaceRef(ref, context.session);
      return {
        type: "face",
        surfaceType: face.surface.kind,
        area: computeArea(face),
        centroid: computeCentroid(face),
        normal: computeNormal(face),
        boundingBox: computeBoundingBox(face),
      };
    }

    if (ref.startsWith("edge:")) {
      const edge = resolveEdgeRef(ref, context.session);
      return {
        type: "edge",
        curveType: edge.curve.kind,
        length: computeLength(edge),
        startPoint: edge.startPoint,
        endPoint: edge.endPoint,
        midPoint: edge.midPoint,
      };
    }

    throw new Error(`Invalid reference: ${ref}`);
  },
};
```

### 5. validate_xml

Validate proposed XML before applying:

```typescript
const validateXmlTool = {
  name: "validate_xml",
  description: "Validate proposed document XML for correctness",
  parameters: {
    type: "object",
    properties: {
      xml: {
        type: "string",
        description: "The proposed XML document",
        required: true,
      },
    },
  },
  execute: async (params): Promise<ValidationResult> => {
    const { xml } = params;

    // Parse XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    const errors: string[] = [];

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      errors.push(`XML parse error: ${parseError.textContent}`);
      return { valid: false, errors };
    }

    // Validate structure
    const features = doc.querySelectorAll("features > *");
    const featureIds = new Set<string>();

    for (const feature of features) {
      const id = feature.getAttribute("id");

      // Check for duplicate IDs
      if (featureIds.has(id)) {
        errors.push(`Duplicate feature ID: ${id}`);
      }
      featureIds.add(id);

      // Validate references
      if (feature.tagName === "extrude") {
        const sketchRef = feature.getAttribute("sketch");
        if (!featureIds.has(sketchRef)) {
          errors.push(`Extrude ${id} references non-existent sketch: ${sketchRef}`);
        }
      }

      // More validation...
    }

    return { valid: errors.length === 0, errors };
  },
};
```

### 6. preview_change

Generate a preview of proposed changes:

```typescript
const previewChangeTool = {
  name: "preview_change",
  description: "Preview the result of applying XML changes",
  parameters: {
    type: "object",
    properties: {
      xml: {
        type: "string",
        description: "The proposed XML document",
        required: true,
      },
    },
  },
  execute: async (params, context): Promise<PreviewResult> => {
    // Parse XML and attempt rebuild in sandbox
    // Return success/failure and any errors
  },
};
```

---

## Tool Registry

```typescript
// packages/app/src/ai/tools.ts

export const AI_TOOLS = [
  getSelectionTool,
  findFacesTool,
  findEdgesTool,
  getGeometryTool,
  validateXmlTool,
  previewChangeTool,
];

export function getToolDefinitions() {
  return AI_TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export async function executeTool(name: string, params: any, context: AIContext): Promise<any> {
  const tool = AI_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(params, context);
}
```

---

## Integration with LLM

```typescript
// packages/app/src/ai/chat.ts

export async function processUserMessage(message: string, context: AIContext): Promise<AIResponse> {
  // Initial request with tools
  let response = await callLLM({
    messages: [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: message },
    ],
    tools: getToolDefinitions(),
  });

  // Handle tool calls
  while (response.toolCalls && response.toolCalls.length > 0) {
    const toolResults = await Promise.all(
      response.toolCalls.map(async (call) => ({
        toolCallId: call.id,
        result: await executeTool(call.name, call.arguments, context),
      }))
    );

    // Continue conversation with tool results
    response = await callLLM({
      messages: [
        ...previousMessages,
        { role: "assistant", toolCalls: response.toolCalls },
        ...toolResults.map((r) => ({ role: "tool", ...r })),
      ],
      tools: getToolDefinitions(),
    });
  }

  return response;
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test find_faces tool
test("find_faces returns matching faces", async () => {
  const context = createTestContext();

  const result = await findFacesTool.execute({ surfaceType: "plane", orientation: "top" }, context);

  expect(result.length).toBeGreaterThan(0);
  expect(result[0].surfaceType).toBe("plane");
});

// Test validate_xml tool
test("validate_xml catches missing references", async () => {
  const result = await validateXmlTool.execute({
    xml: '<model><features><extrude id="e1" sketch="nonexistent" /></features></model>',
  });

  expect(result.valid).toBe(false);
  expect(result.errors).toContain("references non-existent sketch");
});
```

---

## Open Questions

1. **Tool call limits** - Max number of tool calls per request?
   - Decision: Limit to 10 tool calls, then force response

2. **Caching** - Cache tool results during conversation?
   - Decision: Yes, cache for duration of conversation

3. **Permissions** - Should some tools require confirmation?
   - Decision: preview_change should show user before applying
