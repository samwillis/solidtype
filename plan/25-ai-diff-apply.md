# Phase 25: AI Diff and Apply

## Prerequisites

- Phase 24: AI Tools

## Goals

- Parse AI response (modified XML or structured changes)
- Diff against current Yjs state
- Apply changes as Yjs transactions (undoable)
- Validate before committing
- Handle errors gracefully

---

## AI Response Formats

The AI can respond with:

### 1. Full Modified XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<model>
  <features>
    <!-- Modified feature tree -->
  </features>
</model>
```

### 2. Structured Changes (Preferred)

```json
{
  "changes": [
    {
      "type": "modify",
      "featureId": "e1",
      "attributes": {
        "distance": "20"
      }
    },
    {
      "type": "add",
      "afterFeatureId": "e1",
      "feature": {
        "type": "fillet",
        "id": "f1",
        "edges": "edge:e1:top:0,edge:e1:top:1",
        "radius": "2"
      }
    },
    {
      "type": "remove",
      "featureId": "s2"
    }
  ]
}
```

---

## Implementation

### Parse AI Response

```typescript
// packages/app/src/ai/parseResponse.ts

export type AIChange =
  | { type: "modify"; featureId: string; attributes: Record<string, string> }
  | { type: "add"; afterFeatureId: string | null; feature: FeatureDefinition }
  | { type: "remove"; featureId: string }
  | { type: "reorder"; featureId: string; afterFeatureId: string | null };

export function parseAIResponse(response: string): AIChange[] {
  // Try parsing as JSON first (structured changes)
  try {
    const parsed = JSON.parse(response);
    if (parsed.changes && Array.isArray(parsed.changes)) {
      return parsed.changes;
    }
  } catch (e) {
    // Not JSON, try XML
  }

  // Try parsing as XML
  if (response.includes("<?xml") || response.includes("<model>")) {
    return diffXmlAgainstCurrent(response);
  }

  throw new Error("Could not parse AI response as JSON or XML");
}
```

### Diff XML Against Current

```typescript
// packages/app/src/ai/diffXml.ts

export function diffXmlAgainstCurrent(newXml: string, currentDoc: SolidTypeDoc): AIChange[] {
  const changes: AIChange[] = [];

  // Parse new XML
  const parser = new DOMParser();
  const newDoc = parser.parseFromString(newXml, "text/xml");
  const newFeatures = newDoc.querySelectorAll("features > *");

  // Get current features
  const currentFeatures = new Map<string, Y.XmlElement>();
  for (const child of currentDoc.features.toArray()) {
    if (child instanceof Y.XmlElement) {
      const id = child.getAttribute("id");
      if (id) currentFeatures.set(id, child);
    }
  }

  // Track which features we've seen in new doc
  const seenIds = new Set<string>();

  let prevFeatureId: string | null = null;

  for (const newFeature of newFeatures) {
    const id = newFeature.getAttribute("id");
    if (!id) continue;

    seenIds.add(id);

    if (currentFeatures.has(id)) {
      // Feature exists - check for modifications
      const current = currentFeatures.get(id)!;
      const modifications = diffAttributes(current, newFeature);

      if (Object.keys(modifications).length > 0) {
        changes.push({
          type: "modify",
          featureId: id,
          attributes: modifications,
        });
      }
    } else {
      // New feature
      changes.push({
        type: "add",
        afterFeatureId: prevFeatureId,
        feature: xmlToFeatureDefinition(newFeature),
      });
    }

    prevFeatureId = id;
  }

  // Check for removed features
  for (const [id] of currentFeatures) {
    if (!seenIds.has(id) && !isBuiltInFeature(id)) {
      changes.push({
        type: "remove",
        featureId: id,
      });
    }
  }

  return changes;
}

function diffAttributes(current: Y.XmlElement, newElement: Element): Record<string, string> {
  const modifications: Record<string, string> = {};

  // Get all attributes from new element
  for (const attr of newElement.attributes) {
    const currentValue = current.getAttribute(attr.name);
    if (currentValue !== attr.value) {
      modifications[attr.name] = attr.value;
    }
  }

  return modifications;
}
```

### Apply Changes to Yjs

```typescript
// packages/app/src/ai/applyChanges.ts

export function applyChanges(changes: AIChange[], doc: SolidTypeDoc): ApplyResult {
  // Wrap in transaction for atomicity
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
    }
  });

  return { ok: true };
}

function applyModify(change: ModifyChange, doc: SolidTypeDoc): void {
  const feature = findFeatureById(doc.features, change.featureId);
  if (!feature) {
    throw new Error(`Feature not found: ${change.featureId}`);
  }

  for (const [key, value] of Object.entries(change.attributes)) {
    feature.setAttribute(key, value);
  }
}

function applyAdd(change: AddChange, doc: SolidTypeDoc): void {
  const newElement = createYjsElement(change.feature);

  if (change.afterFeatureId) {
    // Find position and insert after
    const features = doc.features.toArray();
    const index = features.findIndex(
      (f) => f instanceof Y.XmlElement && f.getAttribute("id") === change.afterFeatureId
    );

    if (index >= 0) {
      doc.features.insert(index + 1, [newElement]);
    } else {
      doc.features.push([newElement]);
    }
  } else {
    // Insert at beginning (after built-in features)
    const firstNonBuiltIn = findFirstNonBuiltInIndex(doc.features);
    doc.features.insert(firstNonBuiltIn, [newElement]);
  }
}

function applyRemove(change: RemoveChange, doc: SolidTypeDoc): void {
  const features = doc.features.toArray();
  const index = features.findIndex(
    (f) => f instanceof Y.XmlElement && f.getAttribute("id") === change.featureId
  );

  if (index >= 0) {
    doc.features.delete(index, 1);
  }
}

function createYjsElement(feature: FeatureDefinition): Y.XmlElement {
  const element = new Y.XmlElement(feature.type);

  for (const [key, value] of Object.entries(feature)) {
    if (key !== "type" && value !== undefined) {
      element.setAttribute(key, String(value));
    }
  }

  return element;
}
```

---

## Validation Before Apply

```typescript
// packages/app/src/ai/validateChanges.ts

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export function validateChanges(changes: AIChange[], doc: SolidTypeDoc): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Simulate the changes to check validity
  const simulatedState = simulateChanges(changes, doc);

  // Check for reference validity
  for (const feature of simulatedState.features) {
    if (feature.type === "extrude") {
      const sketchRef = feature.sketch;
      if (!simulatedState.hasFeature(sketchRef)) {
        errors.push({
          type: "invalid_reference",
          message: `Extrude ${feature.id} references non-existent sketch: ${sketchRef}`,
        });
      }
    }

    // More validation rules...
  }

  // Check for ID conflicts
  const ids = new Set<string>();
  for (const feature of simulatedState.features) {
    if (ids.has(feature.id)) {
      errors.push({
        type: "duplicate_id",
        message: `Duplicate feature ID: ${feature.id}`,
      });
    }
    ids.add(feature.id);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## Undo Support

Changes are automatically undoable via Yjs UndoManager:

```typescript
// In DocumentContext
const undoManager = useMemo(() => {
  return new Y.UndoManager(doc.features, {
    trackedOrigins: new Set(["ai-change", "user-change"]),
  });
}, [doc]);

// When applying AI changes
doc.ydoc.transact(() => {
  // ... apply changes ...
}, "ai-change");

// Undo AI changes
function undoLastAIChange() {
  undoManager.undo();
}
```

---

## Error Recovery

```typescript
export async function applyAIChangesWithRecovery(
  changes: AIChange[],
  doc: SolidTypeDoc
): Promise<ApplyResult> {
  // Validate first
  const validation = validateChanges(changes, doc);

  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors,
      message: "Changes failed validation",
    };
  }

  // Save current state for potential rollback
  const snapshot = Y.snapshot(doc.ydoc);

  try {
    // Apply changes
    applyChanges(changes, doc);

    // Trigger rebuild to verify
    const rebuildResult = await kernel.rebuild();

    if (!rebuildResult.ok) {
      // Rollback on rebuild failure
      Y.applySnapshot(doc.ydoc, snapshot);

      return {
        ok: false,
        errors: rebuildResult.errors,
        message: "Changes caused rebuild errors, rolled back",
      };
    }

    return { ok: true };
  } catch (error) {
    // Rollback on any error
    Y.applySnapshot(doc.ydoc, snapshot);

    return {
      ok: false,
      message: `Error applying changes: ${error.message}`,
    };
  }
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test parsing structured changes
test("parseAIResponse parses JSON changes", () => {
  const response = JSON.stringify({
    changes: [{ type: "modify", featureId: "e1", attributes: { distance: "20" } }],
  });

  const changes = parseAIResponse(response);
  expect(changes).toHaveLength(1);
  expect(changes[0].type).toBe("modify");
});

// Test XML diffing
test("diffXml detects modifications", () => {
  const doc = createDocument();
  addExtrudeFeature(doc, "e1", "s1", 10, "add");

  const newXml = `<model><features>
    <extrude id="e1" sketch="s1" distance="20" op="add" />
  </features></model>`;

  const changes = diffXmlAgainstCurrent(newXml, doc);

  expect(changes).toContainEqual({
    type: "modify",
    featureId: "e1",
    attributes: { distance: "20" },
  });
});

// Test apply with rollback
test("applyChanges rolls back on error", async () => {
  const doc = createDocument();
  const originalDistance = "10";

  // Apply invalid changes
  const result = await applyAIChangesWithRecovery(
    [{ type: "modify", featureId: "nonexistent", attributes: {} }],
    doc
  );

  expect(result.ok).toBe(false);
  // Document unchanged
});
```

---

## Open Questions

1. **Conflict resolution** - What if user edits while AI is processing?
   - Decision: Show conflict dialog, let user choose

2. **Partial apply** - Apply successful changes if some fail?
   - Decision: All or nothing (atomic transaction)

3. **Change preview** - Show diff before applying?
   - Decision: Yes, show summary of changes for user approval
