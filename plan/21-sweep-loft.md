# Phase 21: Sweep and Loft

## Prerequisites

- Phase 20: Fillet and Chamfer
- Phase 09: Sketch Arcs (for curved paths)

## Goals

- Sweep profile along a path
- Loft between multiple profiles
- Foundation for complex organic shapes

---

## Sweep

### User Workflow

1. User creates profile sketch
2. User creates path sketch (or selects model edge)
3. User clicks "Sweep"
4. User selects profile, then path
5. Preview shows swept solid
6. User confirms

### Document Model

```xml
<sweep
  id="sw1"
  name="Sweep1"
  profile="s1"
  path="s2:l1"
  op="add"
  orientation="normal"
/>
```

Attributes:

- `profile` - Sketch ID containing the profile
- `path` - Sketch ID + entity ID for path curve, or edge ref
- `op` - `add` or `cut`
- `orientation` - How profile orients along path

### Implementation

```typescript
export interface SweepOptions {
  profile: SketchProfile;
  path: Curve3D;
  operation: "add" | "cut";
  orientation: "normal" | "parallel" | "perpendicular";
}

export function sweep(session: SolidSession, options: SweepOptions): SweepResult {
  const { profile, path, orientation } = options;

  // Sample path at intervals
  const segments = discretizePath(path, SWEEP_TOLERANCE);

  // For each segment, position and orient the profile
  const profiles: PositionedProfile[] = [];

  for (const t of segments) {
    const point = evaluateCurve(path, t);
    const tangent = curveTangent(path, t);
    const frame = computeFrenetFrame(path, t);

    const transform = computeProfileTransform(point, tangent, frame, orientation);
    profiles.push(transformProfile(profile, transform));
  }

  // Skin the profiles to create faces
  const faces = skinProfiles(profiles);

  // Add end caps
  faces.push(createCapFace(profiles[0]));
  faces.push(createCapFace(profiles[profiles.length - 1]));

  // Build solid from faces
  const body = buildSolidFromFaces(faces);

  return { ok: true, body };
}
```

---

## Loft

### User Workflow

1. User creates multiple profile sketches on different planes
2. User clicks "Loft"
3. User selects profiles in order
4. Preview shows smooth transition between profiles
5. User confirms

### Document Model

```xml
<loft
  id="lf1"
  name="Loft1"
  profiles="s1,s2,s3"
  op="add"
  closed="false"
/>
```

Attributes:

- `profiles` - Comma-separated list of sketch IDs
- `closed` - Whether to close the loft (loop back to first profile)

### Implementation

```typescript
export interface LoftOptions {
  profiles: SketchProfile[];
  operation: "add" | "cut";
  closed: boolean;
}

export function loft(session: SolidSession, options: LoftOptions): LoftResult {
  const { profiles, closed } = options;

  if (profiles.length < 2) {
    throw new Error("Loft requires at least 2 profiles");
  }

  // Ensure profiles have same number of segments
  // (or interpolate/subdivide to match)
  const normalizedProfiles = normalizeProfileCounts(profiles);

  // Create ruled surfaces between adjacent profiles
  const faces: Face[] = [];

  for (let i = 0; i < normalizedProfiles.length - 1; i++) {
    const p1 = normalizedProfiles[i];
    const p2 = normalizedProfiles[i + 1];

    // Create skinned surface between profiles
    const skinnedFaces = createSkinnedFaces(p1, p2);
    faces.push(...skinnedFaces);
  }

  if (closed) {
    // Connect last profile back to first
    const lastFaces = createSkinnedFaces(
      normalizedProfiles[normalizedProfiles.length - 1],
      normalizedProfiles[0]
    );
    faces.push(...lastFaces);
  } else {
    // Add end caps
    faces.push(createCapFace(normalizedProfiles[0]));
    faces.push(createCapFace(normalizedProfiles[normalizedProfiles.length - 1]));
  }

  const body = buildSolidFromFaces(faces);
  return { ok: true, body };
}
```

---

## App UI Work

### Sweep Dialog

```typescript
export function SweepDialog({ onConfirm, onCancel }) {
  const [profile, setProfile] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [operation, setOperation] = useState<'add' | 'cut'>('add');

  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Sweep</DialogTitle>
      <DialogContent>
        <SketchSelector
          label="Profile Sketch"
          value={profile}
          onChange={setProfile}
        />

        <PathSelector
          label="Path"
          value={path}
          onChange={setPath}
          allowEdges={true}
        />

        <ToggleGroup
          label="Operation"
          value={operation}
          onChange={setOperation}
          options={[
            { value: 'add', label: 'Add' },
            { value: 'cut', label: 'Cut' },
          ]}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => onConfirm({ profile, path, operation })}
          disabled={!profile || !path}
          variant="primary"
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Loft Dialog

```typescript
export function LoftDialog({ onConfirm, onCancel }) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(true);

  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Loft</DialogTitle>
      <DialogContent>
        <div className="profile-list">
          <h4>Profiles (in order)</h4>
          {profiles.map((p, i) => (
            <div key={i} className="profile-item">
              <span>{i + 1}. {p}</span>
              <IconButton onClick={() => removeProfile(i)}>
                <Icon name="remove" />
              </IconButton>
            </div>
          ))}
        </div>

        <Button onClick={() => setSelecting(true)}>
          {selecting ? 'Click sketches in order...' : 'Add Profile'}
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => onConfirm(profiles)}
          disabled={profiles.length < 2}
          variant="primary"
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

## Surface Types

### Ruled Surface

For straight-line transitions between profile edges:

```typescript
function createRuledSurface(curve1: Curve3D, curve2: Curve3D): Surface {
  // Parametric surface: P(u,v) = (1-v) * C1(u) + v * C2(u)
  return {
    kind: "ruled",
    curve1,
    curve2,
  };
}
```

### Swept Surface

For profile swept along path:

```typescript
function createSweptSurface(
  profileEdge: Curve2D,
  path: Curve3D,
  orientation: SweepOrientation
): Surface {
  return {
    kind: "swept",
    profile: profileEdge,
    path,
    orientation,
  };
}
```

---

## Testing Plan

### Unit Tests

```typescript
// Test sweep
test("sweep creates swept solid", () => {
  const session = new SolidSession();

  // Create circular profile
  const profile = createCircleSketch(session, 2);

  // Create path (quarter circle)
  const path = createArcPath(session, 10, 90);

  const result = sweep(session, {
    profile: profile.toProfile(),
    path,
    operation: "add",
  });

  expect(result.ok).toBe(true);
  // Should be a torus section
});

// Test loft
test("loft between two profiles", () => {
  // Create two different-sized rectangles on parallel planes
  // Loft should create tapered solid
});
```

### Integration Tests

- Create profile and path sketches
- Click Sweep → select profile → select path → preview shows
- Confirm → swept solid created

---

## Open Questions

1. **Guide curves** - Support for guide curves to control shape?
   - Decision: Future enhancement

2. **Twist** - Allow twist along sweep path?
   - Decision: Add twist parameter later

3. **Profile alignment** - How to match vertices between profiles?
   - Decision: Start with same vertex count requirement
