# Phase 13: Properties Panel

## Prerequisites

- Phase 12: Rebuild Gate

## Goals

- Display properties of selected feature
- Edit feature parameters directly
- Trigger rebuild on parameter change
- Show feature-specific options

---

## User Workflow

1. User selects a feature in tree (or via 3D selection)
2. Properties panel shows feature parameters
3. User edits a value (e.g., extrude distance)
4. On blur/Enter, value is saved
5. Model rebuilds with new value
6. 3D view updates

---

## Feature Properties

### Common Properties

All features have:
- Name (editable)
- Type (read-only)
- ID (read-only, for debugging)

### Feature-Specific Properties

| Feature | Properties |
|---------|------------|
| Sketch | Plane, Point count, Entity count |
| Extrude | Sketch ref, Distance, Direction, Operation |
| Revolve | Sketch ref, Axis, Angle, Operation |
| (future) | Additional properties as features are added |

---

## Implementation

### Properties Panel Component

```typescript
// packages/app/src/components/PropertiesPanel.tsx

export function PropertiesPanel() {
  const { selection } = useSelection();
  const { doc } = useDocument();
  const selectedFeature = useSelectedFeature(selection, doc);
  
  if (!selectedFeature) {
    return (
      <div className="properties-panel">
        <div className="panel-header">Properties</div>
        <div className="properties-empty">
          No feature selected
        </div>
      </div>
    );
  }
  
  return (
    <div className="properties-panel">
      <div className="panel-header">Properties</div>
      <div className="properties-content">
        <FeatureProperties feature={selectedFeature} />
      </div>
    </div>
  );
}

function FeatureProperties({ feature }) {
  switch (feature.type) {
    case 'sketch':
      return <SketchProperties feature={feature} />;
    case 'extrude':
      return <ExtrudeProperties feature={feature} />;
    case 'revolve':
      return <RevolveProperties feature={feature} />;
    default:
      return <GenericProperties feature={feature} />;
  }
}
```

### Extrude Properties

```typescript
function ExtrudeProperties({ feature }) {
  const { updateFeature } = useDocument();
  
  const handleDistanceChange = (value: number) => {
    updateFeature(feature.id, { distance: value });
  };
  
  const handleOperationChange = (value: 'add' | 'cut') => {
    updateFeature(feature.id, { op: value });
  };
  
  return (
    <div className="feature-properties">
      {/* Common properties */}
      <PropertyGroup title="General">
        <PropertyRow label="Name">
          <TextInput
            value={feature.name}
            onChange={(name) => updateFeature(feature.id, { name })}
          />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="property-value readonly">Extrude</span>
        </PropertyRow>
      </PropertyGroup>
      
      {/* Extrude-specific properties */}
      <PropertyGroup title="Parameters">
        <PropertyRow label="Sketch">
          <span className="property-value readonly">{feature.sketch}</span>
        </PropertyRow>
        <PropertyRow label="Distance">
          <NumberInput
            value={feature.distance}
            onChange={handleDistanceChange}
            min={0.1}
            step={1}
            unit="mm"
          />
        </PropertyRow>
        <PropertyRow label="Operation">
          <Select
            value={feature.op}
            onChange={handleOperationChange}
            options={[
              { value: 'add', label: 'Add' },
              { value: 'cut', label: 'Cut' },
            ]}
          />
        </PropertyRow>
        <PropertyRow label="Direction">
          <Select
            value={feature.direction || 'normal'}
            onChange={(dir) => updateFeature(feature.id, { direction: dir })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'reverse', label: 'Reverse' },
            ]}
          />
        </PropertyRow>
      </PropertyGroup>
    </div>
  );
}
```

### Update Feature in Yjs

```typescript
// packages/app/src/hooks/useDocument.ts

function updateFeature(featureId: string, updates: Partial<FeatureAttributes>) {
  const features = doc.features;
  
  // Find the feature element
  for (const child of features.toArray()) {
    if (child instanceof Y.XmlElement && child.getAttribute('id') === featureId) {
      // Update attributes
      for (const [key, value] of Object.entries(updates)) {
        child.setAttribute(key, String(value));
      }
      break;
    }
  }
  
  // Yjs change triggers rebuild automatically
}
```

### Property Input Components

```typescript
// packages/app/src/components/inputs/NumberInput.tsx

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function NumberInput({ value, onChange, min, max, step, unit }: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value));
  
  // Update local value when external value changes
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);
  
  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
      onChange(clamped);
    } else {
      setLocalValue(String(value)); // Reset to original
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };
  
  return (
    <div className="number-input">
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}
```

---

## Selection Integration

### Feature Selection from Tree

```typescript
// When user clicks feature in tree
const handleFeatureClick = (featureId: string) => {
  setSelectedFeature(featureId);
  // Properties panel updates automatically
};
```

### Feature Selection from 3D

```typescript
// When user selects face in 3D
const handleFaceSelect = (bodyId: string, faceId: number, persistentRef: PersistentRef) => {
  // Find which feature created this body
  const featureId = findFeatureForBody(bodyId);
  setSelectedFeature(featureId);
};
```

---

## CSS

```css
/* packages/app/src/components/PropertiesPanel.css */

.properties-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.properties-content {
  padding: 8px;
  overflow-y: auto;
}

.property-group {
  margin-bottom: 16px;
}

.property-group-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.property-row {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.property-label {
  flex: 0 0 80px;
  font-size: 12px;
  color: var(--text-secondary);
}

.property-value {
  flex: 1;
}

.property-value.readonly {
  color: var(--text-muted);
}

.number-input {
  display: flex;
  align-items: center;
}

.number-input input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.number-input .unit {
  margin-left: 4px;
  color: var(--text-muted);
  font-size: 11px;
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test property update
test('updateFeature updates Yjs attribute', () => {
  const doc = createDocument();
  addExtrudeFeature(doc, 'e1', 's1', 10, 'add');
  
  updateFeature('e1', { distance: 20 });
  
  const feature = findFeature(doc.features, 'e1');
  expect(feature.getAttribute('distance')).toBe('20');
});
```

### Integration Tests

- Select feature → properties panel shows its properties
- Edit distance → model rebuilds with new distance
- Edit name → feature tree updates
- Edit operation → model updates (add ↔ cut)

---

## Open Questions

1. **Undo granularity** - Each property change = 1 undo step?
   - Decision: Yes, Yjs tracks each change

2. **Live preview** - Should model update while typing?
   - Decision: No, only on blur/Enter (avoid excessive rebuilds)

3. **Validation** - Show error for invalid values?
   - Decision: Show error, revert to previous value
