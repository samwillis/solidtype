# Phase 12: Rebuild Gate

## Prerequisites

- Phase 11: 3D Selection

## Goals

- Implement rollback bar in feature tree (like SolidWorks)
- Allow user to "go back in time" to any feature
- Model rebuilds only up to gate position
- Features after gate are grayed out

---

## User Workflow

1. User sees a horizontal bar in feature tree (between features)
2. User drags the bar up or down
3. Model rebuilds to show state at that point
4. Features below the bar are grayed out (not computed)
5. User can still edit features above the bar
6. Dragging bar back down rebuilds remaining features

---

## Document Model

### Gate State

```typescript
// In Yjs state map
state.set('rebuildGate', 'e1');  // Stop after feature 'e1'
state.set('rebuildGate', null);  // Rebuild all features
```

### Feature Status

Each feature gets a computed status (not stored in Yjs):

```typescript
type FeatureStatus = 
  | 'computed'      // Above gate, successfully built
  | 'error'         // Above gate, failed to build
  | 'suppressed'    // Explicitly suppressed by user
  | 'gated'         // Below rebuild gate
  ;
```

---

## App UI Work

### Rebuild Gate Component

```typescript
// packages/app/src/components/RebuildGate.tsx

interface RebuildGateProps {
  position: number;  // Index in feature list
  onDrag: (newPosition: number) => void;
}

export function RebuildGate({ position, onDrag }: RebuildGateProps) {
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragY(e.clientY);
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    
    // Calculate new position based on Y delta
    const delta = e.clientY - dragY;
    const newPosition = calculateNewPosition(position, delta);
    onDrag(newPosition);
    setDragY(e.clientY);
  };
  
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', () => setDragging(false));
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', () => setDragging(false));
      };
    }
  }, [dragging]);
  
  return (
    <div 
      className={`rebuild-gate ${dragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="rebuild-gate-line" />
      <div className="rebuild-gate-handle">
        <Icon name="gate" />
      </div>
    </div>
  );
}
```

### Feature Tree Integration

```typescript
// packages/app/src/components/FeatureTree.tsx

export function FeatureTree() {
  const { doc, rebuildGate, setRebuildGate } = useDocument();
  const features = useFeatures(doc);
  
  // Find gate position (index after the gated feature)
  const gateIndex = rebuildGate 
    ? features.findIndex(f => f.id === rebuildGate) + 1
    : features.length;
  
  return (
    <div className="feature-tree">
      <ul>
        {features.map((feature, index) => (
          <React.Fragment key={feature.id}>
            <FeatureTreeItem 
              feature={feature}
              gated={index >= gateIndex}
            />
            {index === gateIndex - 1 && (
              <RebuildGate 
                position={gateIndex}
                onDrag={(newPos) => {
                  const newGateFeature = features[newPos - 1]?.id ?? null;
                  setRebuildGate(newGateFeature);
                }}
              />
            )}
          </React.Fragment>
        ))}
        {gateIndex === features.length && (
          <RebuildGate 
            position={features.length}
            onDrag={(newPos) => {
              const newGateFeature = features[newPos - 1]?.id ?? null;
              setRebuildGate(newGateFeature);
            }}
          />
        )}
      </ul>
    </div>
  );
}
```

### Gated Feature Styling

```css
/* packages/app/src/components/FeatureTree.css */

.feature-item.gated {
  opacity: 0.5;
  color: var(--text-muted);
}

.feature-item.gated .feature-icon {
  filter: grayscale(100%);
}

.rebuild-gate {
  display: flex;
  align-items: center;
  padding: 2px 0;
  cursor: ns-resize;
}

.rebuild-gate-line {
  flex: 1;
  height: 2px;
  background: var(--accent-color);
}

.rebuild-gate-handle {
  width: 16px;
  height: 16px;
  background: var(--accent-color);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rebuild-gate.dragging {
  background: var(--accent-color-light);
}
```

---

## Kernel Work

### Rebuild Strategy

At this phase, determine whether to use **full rebuild** or **incremental rebuild**:

| Approach | When to Use | Trade-offs |
|----------|-------------|------------|
| Full rebuild | < 10 features, rebuild < 100ms | Simple, always correct |
| Incremental | > 10 features, rebuild > 100ms | Complex, needs cache management |

**Decision**: Start with full rebuild, measure performance, add incremental if needed.

### Partial Rebuild (Gate)

The kernel respects the rebuild gate (from Phase 02):

```typescript
// In kernel.worker.ts handleRebuild()

for (const feature of features) {
  // Stop at rebuild gate
  if (rebuildGate && feature.id === rebuildGate) {
    // Include this feature, then stop
    buildFeature(feature);
    break;
  }
  
  buildFeature(feature);
}

// Mark remaining features as gated
for (const feature of remainingFeatures) {
  featureStatus[feature.id] = 'gated';
}
```

### Returning Feature Status

```typescript
// Worker returns status for each feature
interface RebuildResult {
  bodies: BodyInfo[];
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
}

type FeatureStatus = 'computed' | 'error' | 'suppressed' | 'gated';

interface BuildError {
  featureId: string;
  code: string;
  message: string;
}

// Example response
{
  bodies: [...],
  featureStatus: {
    's1': 'computed',
    'e1': 'computed',
    's2': 'gated',
    'e2': 'gated',
  },
  errors: []
}
```

---

## Acceptance Criteria

### UI Behavior

- [ ] Gate bar visible at bottom of feature tree (default position)
- [ ] Gate bar draggable up/down between features
- [ ] Features below gate are grayed out (opacity: 0.5)
- [ ] Gate position updates in real-time as dragged
- [ ] Double-click on gated feature moves gate to include it

### Worker Behavior

- [ ] Worker stops processing at gate feature
- [ ] `featureStatus` correctly marks features as `gated`
- [ ] Meshes for gated features are removed from response
- [ ] Subsequent features after gate are not computed

### State Synchronization

- [ ] Gate position stored in Yjs `state.rebuildGate`
- [ ] Gate syncs from main thread to worker via Yjs
- [ ] Gate persists across page reloads (via Yjs persistence)
- [ ] Clearing gate (set to null) rebuilds all features
```

---

## Interaction Behaviors

### Editing Gated Features

- **Click gated feature** → Prompt to move gate to include it
- **Double-click** → Move gate and edit feature
- **Right-click** → "Roll to here" option

### Adding Features Below Gate

- New features are always added at gate position (not below)
- Or: prompt user that adding here will move the gate

### Gate Persistence

- Gate position is stored in Yjs `state` map
- Persists across sessions and collaborators
- Each user could have independent gate (future enhancement)

---

## Testing Plan

### Unit Tests

```typescript
// Test gate position storage
test('setRebuildGate updates Yjs state', () => {
  const doc = createDocument();
  doc.state.set('rebuildGate', 'e1');
  
  expect(doc.state.get('rebuildGate')).toBe('e1');
});

// Test partial rebuild
test('rebuild stops at gate', () => {
  const features = [
    { id: 's1', type: 'sketch' },
    { id: 'e1', type: 'extrude' },
    { id: 's2', type: 'sketch' },
    { id: 'e2', type: 'extrude' },
  ];
  
  const result = rebuild(features, 'e1');
  
  expect(result.featureStatus['s1']).toBe('computed');
  expect(result.featureStatus['e1']).toBe('computed');
  expect(result.featureStatus['s2']).toBe('gated');
  expect(result.featureStatus['e2']).toBe('gated');
});
```

### Integration Tests

- Drag gate up → features below gray out
- Drag gate down → features rebuild
- 3D view updates to show model at gate position
- Feature status indicators update

---

## Open Questions

1. **Gate for each user?** - In collaboration, should each user have their own gate?
   - Decision: Shared gate for now, per-user later

2. **Performance** - Should we cache intermediate states?
   - Decision: Not initially, optimize if needed

3. **Error recovery** - If feature above gate errors?
   - Decision: Show error, allow editing, don't move gate automatically
