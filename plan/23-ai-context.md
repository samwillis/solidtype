# Phase 23: AI Context Assembly

## Prerequisites

- Phase 22: Patterns (most features implemented)
- Phase 11: 3D Selection

### Schema Stability Requirements

Before starting AI integration, the following must be **stable and frozen**:

| Component | Status | Notes |
|-----------|--------|-------|
| Feature XML structure | Must be stable | AI prompts depend on exact format |
| Attribute naming | Must be stable | `distance`, `op`, `sketch`, etc. |
| Selection/reference format | Must be stable | `face:e1:top`, `edge:e1:top:0` |
| Sketch JSON format | Must be stable | Points, entities, constraints arrays |
| Error code taxonomy | Must be stable | `NO_CLOSED_PROFILE`, etc. |

**If any of these change after Phase 23**, AI tooling will need updates:
- System prompts
- Schema documentation
- Diff/apply logic
- Validation tools

### Pre-Phase Checklist

- [ ] All Phase 01-22 features use consistent XML structure
- [ ] Persistent reference format is final (`type:featureId:selector`)
- [ ] No planned schema migrations remain
- [ ] Error codes are documented and stable
- [ ] Sketch JSON schema is documented

## Goals

- Serialize Yjs document to XML for AI context
- Include current selection information
- Capture screenshot for visual context
- Define document schema for AI understanding

---

## AI Integration Overview

The AI integration uses the Yjs XML DOM as the interface:

```
User prompt → Context Assembly → LLM → Diff/Apply → Rebuild
```

This phase focuses on **Context Assembly** - preparing the information the AI needs to understand and modify the model.

---

## Context Components

### 1. Document XML

Serialize the Yjs feature tree to clean XML:

```typescript
// packages/app/src/ai/serializeDocument.ts

export function serializeDocumentToXml(doc: SolidTypeDoc): string {
  const features = doc.features;
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<model>\n';
  xml += '  <meta>\n';
  xml += `    <name>${doc.meta.get('name')}</name>\n`;
  xml += `    <version>${doc.meta.get('version')}</version>\n`;
  xml += '  </meta>\n';
  xml += '  <features>\n';
  
  for (const child of features.toArray()) {
    if (child instanceof Y.XmlElement) {
      xml += serializeElement(child, 4);
    }
  }
  
  xml += '  </features>\n';
  xml += '</model>';
  
  return xml;
}

function serializeElement(element: Y.XmlElement, indent: number): string {
  const spaces = ' '.repeat(indent);
  const tagName = element.nodeName;
  const attrs = Array.from(element.getAttributes())
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(' ');
  
  const children = element.toArray();
  
  if (children.length === 0) {
    return `${spaces}<${tagName} ${attrs} />\n`;
  }
  
  let xml = `${spaces}<${tagName} ${attrs}>\n`;
  
  for (const child of children) {
    if (child instanceof Y.XmlElement) {
      xml += serializeElement(child, indent + 2);
    } else if (child instanceof Y.XmlText) {
      xml += `${spaces}  ${child.toString()}\n`;
    }
  }
  
  xml += `${spaces}</${tagName}>\n`;
  return xml;
}
```

### Example Output

```xml
<?xml version="1.0" encoding="UTF-8"?>
<model>
  <meta>
    <name>Bracket</name>
    <version>1</version>
  </meta>
  <features>
    <origin id="origin" />
    <plane id="xy" name="XY Plane" normal="0,0,1" origin="0,0,0" xDir="1,0,0" />
    <plane id="xz" name="XZ Plane" normal="0,1,0" origin="0,0,0" xDir="1,0,0" />
    <plane id="yz" name="YZ Plane" normal="1,0,0" origin="0,0,0" xDir="0,1,0" />
    <sketch id="s1" plane="xy" name="Base Sketch">
      <points>[{"id":"p1","x":0,"y":0},{"id":"p2","x":50,"y":0},...]</points>
      <entities>[{"id":"l1","type":"line","start":"p1","end":"p2"},...]</entities>
      <constraints>[{"id":"c1","type":"horizontal","points":["p1","p2"]}]</constraints>
    </sketch>
    <extrude id="e1" sketch="s1" distance="10" op="add" name="Base Extrude" />
    <sketch id="s2" plane="face:e1:top" name="Hole Sketch">
      ...
    </sketch>
    <extrude id="e2" sketch="s2" distance="15" op="cut" name="Center Hole" />
  </features>
</model>
```

---

### 2. Selection Context

Include information about what the user has selected:

```typescript
// packages/app/src/ai/serializeSelection.ts

export interface SelectionContext {
  type: 'none' | 'feature' | 'face' | 'edge';
  featureId?: string;
  persistentRef?: string;
  geometryInfo?: {
    surfaceType?: string;
    area?: number;
    centroid?: [number, number, number];
    normal?: [number, number, number];
  };
}

export function serializeSelection(selection: Selection): SelectionContext {
  if (selection.faces.length > 0) {
    const face = selection.faces[0];
    return {
      type: 'face',
      featureId: face.featureId,
      persistentRef: face.persistentRef.toString(),
      geometryInfo: {
        surfaceType: face.surfaceType,
        area: face.area,
        centroid: face.centroid,
        normal: face.normal,
      },
    };
  }
  
  if (selection.edges.length > 0) {
    const edge = selection.edges[0];
    return {
      type: 'edge',
      featureId: edge.featureId,
      persistentRef: edge.persistentRef.toString(),
    };
  }
  
  if (selection.feature) {
    return {
      type: 'feature',
      featureId: selection.feature,
    };
  }
  
  return { type: 'none' };
}
```

---

### 3. Screenshot

Capture the current 3D view:

```typescript
// packages/app/src/ai/captureScreenshot.ts

export async function captureScreenshot(renderer: THREE.WebGLRenderer): Promise<string> {
  // Render the current frame
  renderer.render(scene, camera);
  
  // Get canvas data as base64
  const canvas = renderer.domElement;
  const dataUrl = canvas.toDataURL('image/png');
  
  // Return base64 data (strip prefix for API)
  return dataUrl.replace('data:image/png;base64,', '');
}
```

---

### 4. Schema Reference

Provide the AI with the document schema:

```typescript
export const DOCUMENT_SCHEMA = `
## SolidType Document Schema

### Feature Types

<origin id="..." />
  - Built-in origin point

<plane id="..." name="..." normal="x,y,z" origin="x,y,z" xDir="x,y,z" />
  - Datum plane for sketching

<sketch id="..." plane="..." name="...">
  <points>[array of {id, x, y, fixed?, attachedTo?}]</points>
  <entities>[array of {id, type, ...}]</entities>
  <constraints>[array of {id, type, ...}]</constraints>
</sketch>
  - plane: datum plane ID or "face:featureId:selector"

<extrude id="..." sketch="..." distance="..." op="add|cut" name="..." />
  - op: "add" creates material, "cut" removes material

<revolve id="..." sketch="..." axis="..." angle="..." op="add|cut" name="..." />
  - axis: line entity ID in sketch

<fillet id="..." edges="..." radius="..." name="..." />
  - edges: comma-separated persistent edge references

<chamfer id="..." edges="..." distance1="..." distance2="..." name="..." />

<boolean id="..." operation="union|subtract|intersect" target="..." tool="..." name="..." />

### Entity Types (in sketch)
- line: { id, type: "line", start: pointId, end: pointId }
- arc: { id, type: "arc", start: pointId, end: pointId, center: pointId, ccw: boolean }

### Constraint Types
- horizontal, vertical, coincident, fixed
- distance, angle
- parallel, perpendicular, tangent, equalLength, equalRadius, symmetric

### Persistent References
- Faces: "face:featureId:selector" (e.g., "face:e1:top", "face:e1:side:0")
- Edges: "edge:featureId:selector" (e.g., "edge:e1:top:0")
- Vertices: "vertex:featureId:selector"
`;
```

---

## Full Context Assembly

```typescript
// packages/app/src/ai/assembleContext.ts

export interface AIContext {
  documentXml: string;
  selection: SelectionContext;
  screenshot: string;  // Base64
  schema: string;
}

export async function assembleAIContext(
  doc: SolidTypeDoc,
  selection: Selection,
  renderer: THREE.WebGLRenderer
): Promise<AIContext> {
  const [documentXml, screenshot] = await Promise.all([
    serializeDocumentToXml(doc),
    captureScreenshot(renderer),
  ]);
  
  return {
    documentXml,
    selection: serializeSelection(selection),
    screenshot,
    schema: DOCUMENT_SCHEMA,
  };
}
```

---

## System Prompt Template

```typescript
export const AI_SYSTEM_PROMPT = `
You are a CAD modeling assistant for SolidType. You help users create and modify 3D models by editing the document structure.

## Your Capabilities
- Modify existing feature parameters
- Add new features (sketches, extrudes, revolves, fillets, etc.)
- Remove or reorder features
- Add sketch geometry and constraints

## Document Format
${DOCUMENT_SCHEMA}

## Rules
1. When returning changes, output the modified XML or a structured diff
2. Preserve feature IDs unless removing features
3. Generate unique IDs for new features (format: type + number, e.g., "s3", "e4")
4. Ensure references are valid (sketches exist before extrudes reference them)
5. Use persistent references for face/edge selections

## Current Context
Document XML:
\`\`\`xml
{{documentXml}}
\`\`\`

Current Selection: {{selection}}

User's request: {{userPrompt}}
`;
```

---

## Testing Plan

### Unit Tests

```typescript
// Test XML serialization
test('serializeDocumentToXml produces valid XML', () => {
  const doc = createDocument();
  addSketchFeature(doc, 's1', 'xy');
  addExtrudeFeature(doc, 'e1', 's1', 10, 'add');
  
  const xml = serializeDocumentToXml(doc);
  
  expect(xml).toContain('<sketch id="s1"');
  expect(xml).toContain('<extrude id="e1"');
  // Validate XML is parseable
  const parser = new DOMParser();
  const parsed = parser.parseFromString(xml, 'text/xml');
  expect(parsed.querySelector('parsererror')).toBeNull();
});

// Test selection serialization
test('serializeSelection includes geometry info', () => {
  const selection = { faces: [mockFace], edges: [] };
  const ctx = serializeSelection(selection);
  
  expect(ctx.type).toBe('face');
  expect(ctx.geometryInfo).toBeDefined();
});
```

---

## Build State and Errors in Context

AI needs to understand the current build state, including errors:

```typescript
export interface BuildStateContext {
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
  rebuildGate: string | null;
}

// Include in AI context
export async function assembleAIContext(...): Promise<AIContext> {
  return {
    documentXml,
    selection: serializeSelection(selection),
    screenshot,
    schema: DOCUMENT_SCHEMA,
    buildState: {
      featureStatus: kernelState.featureStatus,
      errors: kernelState.errors,
      rebuildGate: doc.state.get('rebuildGate'),
    },
  };
}
```

### Error Format for AI

```typescript
// Consistent error format AI can understand
interface BuildError {
  featureId: string;
  code: 'NO_CLOSED_PROFILE' | 'SELF_INTERSECTING' | 'INVALID_REFERENCE' | 
        'AXIS_INTERSECTS_PROFILE' | 'BUILD_ERROR';
  message: string;
  suggestion?: string;  // Optional fix suggestion
}
```

AI system prompt includes:

```
## Current Build State
Feature Status: {{featureStatus}}
Errors: {{errors}}
Rebuild Gate: {{rebuildGate}}

When errors are present, consider:
1. Can the error be fixed by modifying the failing feature?
2. Is there a missing dependency (sketch, reference)?
3. Should the feature be suppressed while user fixes it?
```

---

## Open Questions

1. **Context size limits** - What if document is too large for context?
   - Decision: Truncate old features, summarize, or use tools to query

2. **Screenshot resolution** - What resolution for screenshot?
   - Decision: 512x512 or 1024x1024, balance quality vs tokens

3. ~~**Sketch data format**~~ - Decided in Phase 01: JSON in element content
