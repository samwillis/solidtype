# Phase 17: Boolean Operations UI

**Status: ✅ IMPLEMENTED**

## Prerequisites

- Phase 16: Sketch to Geometry Constraints
- Phase 11: 3D Selection

## Implementation Notes

### What's Done:
- `document.ts` - `BooleanFeature` type with `operation`, `target`, `tool` fields
- `featureSchemas.ts` - Zod validation schema for boolean operations
- `featureHelpers.ts` - `addBooleanFeature()` helper function
- `DocumentContext.tsx` - `addBoolean()` function exposed via context
- `kernel.worker.ts` - `interpretBoolean()` function handles union/subtract/intersect
- `Toolbar.tsx` - Boolean dropdown with Union, Subtract, Intersect options

### Key Implementation Details:
1. **Toolbar Dropdown** - Boolean button shows dropdown with 3 operations
2. **Body Detection** - Checks for features that create bodies (extrude, revolve)
3. **Auto-Selection** - Uses last two body-creating features as target/tool
4. **Worker Integration** - Calls `session.union()`, `session.subtract()`, `session.intersect()`
5. **Body Consumption** - Tool body is removed from bodyMap after operation

### Future Enhancements:
- Body selection UI to choose specific target and tool
- Body visibility toggle in feature tree
- Multi-body result handling

## Goals

- Explicit boolean operations (union, subtract, intersect)
- Select two bodies to combine
- Create combined or separate bodies
- UI for managing multiple bodies

---

## User Workflow

### Union (Combine)

1. User has two separate bodies
2. User selects first body
3. User clicks "Boolean → Union"
4. User selects second body
5. Bodies merge into one

### Subtract

1. User selects the body to keep (tool)
2. User clicks "Boolean → Subtract"
3. User selects the body to remove (target)
4. Target is subtracted from tool

### Intersect

1. User selects first body
2. User clicks "Boolean → Intersect"
3. User selects second body
4. Result is only the overlapping region

---

## Document Model Changes

### Boolean Feature

```xml
<boolean 
  id="b1" 
  name="Boolean1"
  operation="union"
  target="e1"
  tool="e2"
/>
```

Attributes:
- `operation` - `union`, `subtract`, or `intersect`
- `target` - First body (or body that gets modified)
- `tool` - Second body (consumed in operation)

### TypeScript Types

```typescript
export interface BooleanFeature extends FeatureBase {
  type: 'boolean';
  operation: 'union' | 'subtract' | 'intersect';
  target: string;  // Feature ID that created target body
  tool: string;    // Feature ID that created tool body
}
```

---

## App UI Work

### Boolean Command

```typescript
// packages/app/src/components/BooleanDialog.tsx

interface BooleanDialogProps {
  operation: 'union' | 'subtract' | 'intersect';
  onConfirm: (target: string, tool: string) => void;
  onCancel: () => void;
}

export function BooleanDialog({ operation, onConfirm, onCancel }: BooleanDialogProps) {
  const [stage, setStage] = useState<'target' | 'tool'>('target');
  const [target, setTarget] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  
  useEffect(() => {
    // Listen for body selection
    const unsubscribe = onBodySelected((bodyId, featureId) => {
      if (stage === 'target') {
        setTarget(featureId);
        setStage('tool');
      } else {
        setTool(featureId);
      }
    });
    return unsubscribe;
  }, [stage]);
  
  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>
        {operation === 'union' && 'Union Bodies'}
        {operation === 'subtract' && 'Subtract Bodies'}
        {operation === 'intersect' && 'Intersect Bodies'}
      </DialogTitle>
      <DialogContent>
        <div className="boolean-selection">
          <div className={`selection-step ${stage === 'target' ? 'active' : ''}`}>
            <span className="step-label">
              {operation === 'subtract' ? 'Keep Body:' : 'First Body:'}
            </span>
            <span className="step-value">
              {target || 'Click to select...'}
            </span>
          </div>
          <div className={`selection-step ${stage === 'tool' ? 'active' : ''}`}>
            <span className="step-label">
              {operation === 'subtract' ? 'Remove Body:' : 'Second Body:'}
            </span>
            <span className="step-value">
              {tool || 'Click to select...'}
            </span>
          </div>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button 
          onClick={() => onConfirm(target!, tool!)}
          variant="primary"
          disabled={!target || !tool}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Toolbar/Menu

```typescript
// Boolean submenu
<ToolbarDropdown label="Boolean" icon="boolean">
  <MenuItem onClick={() => startBoolean('union')}>
    <Icon name="union" />
    Union
  </MenuItem>
  <MenuItem onClick={() => startBoolean('subtract')}>
    <Icon name="subtract" />
    Subtract
  </MenuItem>
  <MenuItem onClick={() => startBoolean('intersect')}>
    <Icon name="intersect" />
    Intersect
  </MenuItem>
</ToolbarDropdown>
```

### Body Selection Mode

```typescript
// Highlight bodies on hover during selection
function BodySelectionMode({ onSelect }: { onSelect: (featureId: string) => void }) {
  const [hoveredBody, setHoveredBody] = useState<string | null>(null);
  
  const handleMouseMove = (e: MouseEvent) => {
    const hit = raycast(e);
    setHoveredBody(hit?.bodyId ?? null);
  };
  
  const handleClick = (e: MouseEvent) => {
    const hit = raycast(e);
    if (hit?.bodyId) {
      const featureId = getFeatureForBody(hit.bodyId);
      onSelect(featureId);
    }
  };
  
  return (
    <>
      {/* Hover highlight */}
      {hoveredBody && <BodyHighlight bodyId={hoveredBody} color={0x00ff00} />}
      
      {/* Event capture */}
      <div 
        className="body-selection-overlay"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
    </>
  );
}
```

---

## Kernel Work

### Boolean Operations

The kernel already has boolean operations. Ensure proper integration:

```typescript
// In kernel.worker.ts

case 'boolean':
  const operation = feature.attributes.operation as 'union' | 'subtract' | 'intersect';
  const targetId = feature.attributes.target;
  const toolId = feature.attributes.tool;
  
  const targetBody = bodyMap.get(targetId);
  const toolBody = bodyMap.get(toolId);
  
  if (!targetBody || !toolBody) {
    throw new Error('Bodies not found for boolean operation');
  }
  
  let result: BooleanResult;
  
  switch (operation) {
    case 'union':
      result = session.union(targetBody, toolBody);
      break;
    case 'subtract':
      result = session.subtract(targetBody, toolBody);
      break;
    case 'intersect':
      result = session.intersect(targetBody, toolBody);
      break;
  }
  
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  
  // Replace target body with result
  bodyMap.set(feature.id, result.body);
  
  // Remove tool body (consumed)
  bodyMap.delete(toolId);
  
  return { body: result.body };
```

### Error Handling

```typescript
// Handle common boolean errors
if (result.error) {
  switch (result.error.code) {
    case 'NO_INTERSECTION':
      throw new Error('Bodies do not intersect');
    case 'COINCIDENT_FACES':
      throw new Error('Bodies have coincident faces - try moving one slightly');
    case 'TOPOLOGY_ERROR':
      throw new Error('Boolean operation failed due to topology issues');
  }
}
```

---

## Multiple Bodies Management

### Bodies Folder in Feature Tree

```typescript
// Feature tree shows "Bodies" folder with current bodies
<TreeNode type="folder" name="Bodies">
  {bodies.map(body => (
    <TreeNode 
      key={body.id}
      type="body"
      name={body.name}
      onClick={() => selectBody(body.id)}
    />
  ))}
</TreeNode>
```

### Body Visibility Toggle

```typescript
// Toggle body visibility
<TreeNode 
  type="body"
  name={body.name}
  visible={body.visible}
  onToggleVisibility={() => toggleBodyVisibility(body.id)}
/>
```

---

## Testing Plan

### Unit Tests

```typescript
// Test union
test('boolean union combines bodies', () => {
  const session = new SolidSession();
  
  const box1 = createBox(session, 10, 10, 10);
  const box2 = createBox(session, 10, 10, 10, { offset: [5, 0, 0] });
  
  const result = session.union(box1, box2);
  
  expect(result.ok).toBe(true);
  // Combined volume should be less than 2 boxes (overlap)
});

// Test subtract
test('boolean subtract removes material', () => {
  // Create box, subtract smaller box
  // Verify hole created
});

// Test intersect
test('boolean intersect keeps overlap', () => {
  // Create two overlapping boxes
  // Intersect should only keep overlap region
});
```

### Integration Tests

- Click Union → select two bodies → they merge
- Click Subtract → select bodies → hole created
- Undo → bodies separate again

---

## Open Questions

1. **Body naming** - What happens to body names after boolean?
   - Decision: Result takes target body's name

2. **Feature tree order** - Where does boolean appear?
   - Decision: After both input features

3. **Multi-body result** - What if result is multiple bodies?
   - Decision: Create multiple bodies, name them sequentially
