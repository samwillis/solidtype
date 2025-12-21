# Phase 10: Curves in Features

## Prerequisites

- Phase 09: Sketch Arcs

## Goals

- Extrude profiles with curved edges (arcs)
- Revolve profiles with curved edges
- Proper tessellation of curved surfaces (cylinders, etc.)

---

## What Changes

With arcs in sketches, extrude and revolve now produce:

### Extrude with Arcs

| Profile Edge | Resulting Surface |
|--------------|-------------------|
| Line | Planar face |
| Arc | Cylindrical face |

### Revolve with Arcs

| Profile Edge | Axis Relation | Resulting Surface |
|--------------|---------------|-------------------|
| Line parallel to axis | Cylindrical face |
| Line not parallel | Conical face |
| Arc | Toroidal face (torus section) |

---

## Kernel Work

### Profile with Mixed Curves

The profile now contains both lines and arcs:

```typescript
interface SketchProfile {
  curves: (Line2D | Arc2D)[];
  plane: DatumPlane;
}
```

### Extrude Implementation

Update extrude to handle arcs:

```typescript
// In model/extrude.ts

function extrudeProfile(profile: SketchProfile, distance: number): ExtrudeResult {
  const model = new TopoModel();
  
  // Create bottom face
  const bottomFace = createPlanarFace(profile.curves, profile.plane);
  
  // Create top face (offset by distance)
  const topFace = createOffsetPlanarFace(profile.curves, profile.plane, distance);
  
  // Create side faces
  for (const curve of profile.curves) {
    if (curve.kind === 'line') {
      // Planar side face
      const sideFace = createPlanarSideFace(curve, distance);
      model.addFace(sideFace);
    } else if (curve.kind === 'arc') {
      // Cylindrical side face
      const cylinderFace = createCylindricalSideFace(curve, distance, profile.plane);
      model.addFace(cylinderFace);
    }
  }
  
  // Stitch faces into solid
  return stitchIntoSolid(model);
}

function createCylindricalSideFace(arc: Arc2D, distance: number, plane: DatumPlane): FaceId {
  // Arc center and radius define the cylinder
  const center3D = planeToWorld(arc.center, plane);
  const axis = plane.normal;  // Cylinder axis is extrusion direction
  const radius = arcRadius(arc);
  
  // Create cylindrical surface
  const surface: CylinderSurface = {
    kind: 'cylinder',
    origin: center3D,
    axis: axis,
    radius: radius,
  };
  
  // Trim by arc angles and extrusion distance
  // ... trimming logic ...
  
  return model.addFace(surface, loops);
}
```

### Revolve Implementation

Update revolve to handle arcs (toroidal surfaces):

**Status (implemented):**
- `packages/core/src/geom/surface.ts` now includes `TorusSurface` (`kind: 'torus'`) and evaluators.
- `packages/core/src/model/revolve.ts` assigns analytic side surfaces (`cylinder`/`cone`/`sphere`/`torus`) based on the profile segment.
- `packages/core/src/mesh/tessellateFace.ts` tessellates `cone`, `sphere`, and `torus` faces (in addition to `plane`/`cylinder`).

```typescript
// In model/revolve.ts

function revolveProfile(profile: SketchProfile, axis: Axis, angle: number): RevolveResult {
  for (const curve of profile.curves) {
    if (curve.kind === 'line') {
      // Line revolves to cone or cylinder
      const surface = revolveLineToSurface(curve, axis, angle);
    } else if (curve.kind === 'arc') {
      // Arc revolves to torus section
      const surface = revolveArcToTorus(curve, axis, angle);
    }
  }
}

function revolveArcToTorus(arc: Arc2D, axis: Axis, angle: number): Surface {
  // Major radius: distance from arc center to revolution axis
  // Minor radius: arc radius
  const majorRadius = distanceToAxis(arc.center, axis);
  const minorRadius = arcRadius(arc);
  
  return {
    kind: 'torus',
    // Use the closest point on the axis to the arc center (keeps params stable)
    center: projectPointOntoAxis(arc.center, axis),
    axis: axis.direction,
    majorRadius,
    minorRadius,
  };
}
```

---

## Tessellation Updates

### Cylindrical Face Tessellation

```typescript
// In mesh/tessellateFace.ts

function tessellateCylinder(face: CylinderFace, options: TessellationOptions): Mesh {
  const { angularTolerance, chordTolerance } = options;
  
  // Determine number of segments based on arc angle and tolerance
  const arcAngle = face.endAngle - face.startAngle;
  const segments = Math.ceil(arcAngle / angularTolerance);
  
  // Generate vertices along cylinder
  const vertices: number[] = [];
  const normals: number[] = [];
  
  for (let i = 0; i <= segments; i++) {
    const angle = face.startAngle + (arcAngle * i) / segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Bottom vertex
    vertices.push(
      face.origin.x + face.radius * cos * face.xDir.x + face.radius * sin * face.yDir.x,
      face.origin.y + face.radius * cos * face.xDir.y + face.radius * sin * face.yDir.y,
      face.origin.z + face.radius * cos * face.xDir.z + face.radius * sin * face.yDir.z
    );
    
    // Top vertex
    vertices.push(
      // ... offset by height ...
    );
    
    // Normal (radial direction)
    normals.push(cos * face.xDir.x + sin * face.yDir.x, ...);
  }
  
  // Generate triangle indices
  const indices = generateCylinderIndices(segments);
  
  return { positions: new Float32Array(vertices), normals: new Float32Array(normals), indices };
}
```

### Toroidal Face Tessellation

```typescript
function tessellateTorus(face: TorusFace, options: TessellationOptions): Mesh {
  // Torus requires 2D grid sampling
  // u: around the tube (minor circle)
  // v: around the torus (major circle)
  
  const uSegments = calculateSegments(face.minorRadius, options);
  const vSegments = calculateSegments(face.majorRadius, options);
  
  // Generate vertex grid
  for (let v = 0; v <= vSegments; v++) {
    const majorAngle = (v / vSegments) * face.majorArcAngle;
    
    for (let u = 0; u <= uSegments; u++) {
      const minorAngle = (u / uSegments) * face.minorArcAngle;
      
      // Calculate 3D position on torus
      const pos = evaluateTorus(face, majorAngle, minorAngle);
      const normal = torusNormal(face, majorAngle, minorAngle);
      
      vertices.push(...pos);
      normals.push(...normal);
    }
  }
  
  return { ... };
}
```

---

## Visual Quality

### Smooth Shading

For curved surfaces, normals should be interpolated:

```typescript
// Per-vertex normals for smooth shading
// NOT per-face normals (which would look faceted)
```

### Tessellation Options

```typescript
interface TessellationOptions {
  angularTolerance: number;   // Max angle per segment (radians)
  chordTolerance: number;     // Max deviation from true curve (mm)
  minSegments: number;        // Minimum segments per curve
}

const DEFAULT_OPTIONS: TessellationOptions = {
  angularTolerance: Math.PI / 18,  // 10 degrees
  chordTolerance: 0.1,             // 0.1mm
  minSegments: 8,
};
```

---

## Testing Plan

### Unit Tests

```typescript
// Test extrude with arc
test('extrude arc profile creates cylinder face', () => {
  const session = new SolidSession();
  const sketch = createSemicircleSketch(session);
  
  const result = session.extrude(sketch.toProfile(), { distance: 10 });
  
  expect(result.ok).toBe(true);
  
  // Should have cylindrical face
  const faces = result.body.getFaces();
  const cylinderFace = faces.find(f => f.getSurface().kind === 'cylinder');
  expect(cylinderFace).toBeDefined();
});

// Test revolve with arc
test('revolve arc creates torus', () => {
  // Similar test for toroidal surfaces
});
```

### Visual Tests

- Extrude circle → smooth cylinder
- Revolve arc around axis → smooth torus section
- No visible faceting at default tessellation settings

---

## Open Questions

1. **Torus support in kernel** - Implemented (`TorusSurface` + revolve side surfaces + tessellation).
   - Check current kernel, add if missing

2. **Tessellation quality** - What's the right default?
   - Decision: Start with 10° angular tolerance, can be adjusted

3. **G1 continuity** - Ensure smooth shading across curved surfaces
   - Decision: Use vertex normals, not face normals
