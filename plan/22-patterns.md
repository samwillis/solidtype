# Phase 22: Patterns

## Prerequisites

- Phase 21: Sweep and Loft

## Goals

- Linear pattern (repeat features in a line)
- Circular pattern (repeat features around an axis)
- Pattern of bodies or features
- Parametric count and spacing

---

## Linear Pattern

### User Workflow

1. User selects features to pattern (or bodies)
2. User clicks "Linear Pattern"
3. User specifies:
   - Direction (axis or edge)
   - Count
   - Spacing (or total distance)
4. Preview shows repeated instances
5. User confirms

### Document Model

```xml
<linearPattern 
  id="lp1" 
  name="LinearPattern1"
  features="e2,f1"
  direction="1,0,0"
  count="5"
  spacing="10"
/>
```

---

## Circular Pattern

### User Workflow

1. User selects features to pattern
2. User clicks "Circular Pattern"
3. User specifies:
   - Axis (datum axis or edge)
   - Count
   - Total angle (or per-instance angle)
4. Preview shows rotated instances
5. User confirms

### Document Model

```xml
<circularPattern 
  id="cp1" 
  name="CircularPattern1"
  features="e3"
  axisOrigin="0,0,0"
  axisDirection="0,0,1"
  count="6"
  totalAngle="360"
/>
```

---

## TypeScript Types

```typescript
export interface LinearPatternFeature extends FeatureBase {
  type: 'linearPattern';
  features: string[];     // Feature IDs to pattern
  direction: [number, number, number];
  count: number;
  spacing: number;
}

export interface CircularPatternFeature extends FeatureBase {
  type: 'circularPattern';
  features: string[];
  axisOrigin: [number, number, number];
  axisDirection: [number, number, number];
  count: number;
  totalAngle: number;     // Degrees
}
```

---

## Implementation

### Linear Pattern

```typescript
export function linearPattern(
  session: SolidSession,
  options: LinearPatternOptions
): PatternResult {
  const { features, direction, count, spacing } = options;
  
  const patternBodies: Body[] = [];
  
  for (let i = 1; i < count; i++) {
    // Calculate offset for this instance
    const offset = scale(normalize(direction), spacing * i);
    
    // For each feature, create a translated copy
    for (const featureId of features) {
      const originalBody = getBodyForFeature(featureId);
      const copiedBody = copyBody(originalBody);
      translateBody(copiedBody, offset);
      patternBodies.push(copiedBody);
    }
  }
  
  // Union all pattern instances with original bodies
  for (const patternBody of patternBodies) {
    session.union(getMainBody(), patternBody);
  }
  
  return { ok: true };
}
```

### Circular Pattern

```typescript
export function circularPattern(
  session: SolidSession,
  options: CircularPatternOptions
): PatternResult {
  const { features, axisOrigin, axisDirection, count, totalAngle } = options;
  
  const angleStep = (totalAngle * Math.PI / 180) / count;
  
  for (let i = 1; i < count; i++) {
    const angle = angleStep * i;
    
    // Create rotation transform around axis
    const transform = createRotationTransform(axisOrigin, axisDirection, angle);
    
    for (const featureId of features) {
      const originalBody = getBodyForFeature(featureId);
      const copiedBody = copyBody(originalBody);
      transformBody(copiedBody, transform);
      patternBodies.push(copiedBody);
    }
  }
  
  // Union all instances
  // ...
}
```

---

## App UI Work

### Linear Pattern Dialog

```typescript
export function LinearPatternDialog({ onConfirm, onCancel }) {
  const [features, setFeatures] = useState<string[]>([]);
  const [direction, setDirection] = useState<'x' | 'y' | 'z' | 'custom'>('x');
  const [customDirection, setCustomDirection] = useState([1, 0, 0]);
  const [count, setCount] = useState(3);
  const [spacing, setSpacing] = useState(10);
  
  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Linear Pattern</DialogTitle>
      <DialogContent>
        <FeatureSelector
          label="Features to Pattern"
          value={features}
          onChange={setFeatures}
          multi={true}
        />
        
        <Select
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'x', label: 'X Axis' },
            { value: 'y', label: 'Y Axis' },
            { value: 'z', label: 'Z Axis' },
            { value: 'custom', label: 'Custom...' },
          ]}
        />
        
        <NumberInput label="Count" value={count} onChange={setCount} min={2} />
        <NumberInput label="Spacing" value={spacing} onChange={setSpacing} min={0.1} unit="mm" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onConfirm(...)} variant="primary">OK</Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Pattern Preview

```typescript
// Show ghost instances during preview
function PatternPreview({ originalBodies, transforms }) {
  return (
    <>
      {transforms.map((transform, i) => (
        <TransformedBodyPreview
          key={i}
          bodies={originalBodies}
          transform={transform}
          opacity={0.5}
        />
      ))}
    </>
  );
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test linear pattern
test('linear pattern creates correct number of instances', () => {
  const session = new SolidSession();
  createBox(session, 5, 5, 5);
  
  linearPattern(session, {
    features: ['e1'],
    direction: [10, 0, 0],
    count: 3,
    spacing: 10,
  });
  
  // Should have 3 bodies (or 1 merged body)
  // Check bounding box spans expected range
});

// Test circular pattern
test('circular pattern places instances correctly', () => {
  // Create instance, circular pattern around Z axis
  // Verify instances are at correct angles
});
```

---

## Open Questions

1. **Pattern editing** - Should editing original update all instances?
   - Decision: Yes, pattern references original feature

2. **Instance suppression** - Allow suppressing individual instances?
   - Decision: Future enhancement

3. **Seed only** - Pattern just the selected features or entire tree below?
   - Decision: Just selected features
