# Appendix: Kernel Improvements by Phase

This document catalogs all kernel work required for each phase, making it easy to track what needs to be implemented in `@solidtype/core`.

---

## Phase 02: Kernel-Viewer Wiring

### Required

- [ ] `SolidSession` instantiation works in Worker context
- [ ] `Body.tessellate()` returns transferable `Float32Array`/`Uint32Array`
- [ ] `session.getBody(id)` method for retrieving bodies by ID

### Verification

- Kernel loads in Web Worker without DOM errors
- Tessellation produces valid mesh data

---

## Phase 03: Sketch Lines

### Required

- [ ] `SketchModel.addPoint(x, y)` returns point ID
- [ ] `SketchModel.addLine(startId, endId)` creates line entity
- [ ] Point and entity ID allocation is stable

### Already Exists

- `sketch/SketchModel.ts` with point/entity management

### Verification

- Can create sketch with multiple lines
- Point/entity IDs are consistent

---

## Phase 04: Extrude Add

### Required

- [ ] `SketchModel.toProfile()` extracts closed loops
- [ ] `session.extrude(profile, options)` creates solid body
- [ ] Profile detection finds closed regions from line entities

### Already Exists

- `model/extrude.ts` with basic extrusion
- `model/sketchProfile.ts` for profile handling

### Improvements Needed

- Robust closed loop detection
- Handle multiple disconnected loops

### Verification

- Rectangle sketch → extrude → 6-face box

---

## Phase 05: Extrude Cut

### Required

- [ ] `session.subtract(target, tool)` boolean operation
- [ ] Boolean result updates body reference correctly

### Already Exists

- `model/boolean.ts` with subtract operation

### Verification

- Extrude cut creates hole in existing body

---

## Phase 06: Revolve

### Required

- [ ] `session.revolve(profile, options)` creates revolved solid
- [ ] Axis can be specified as line entity in sketch

### Already Exists

- `model/revolve.ts` with basic revolve

### Improvements Needed

- Axis validation (profile doesn't cross axis)
- Partial angle support

### Verification

- Profile + axis → revolved solid
- 90° revolve creates quarter section

---

## Phase 07: Basic Constraints

### Required

- [ ] `horizontalPoints(p1, p2)` constraint
- [ ] `verticalPoints(p1, p2)` constraint
- [ ] `coincident(p1, p2)` constraint
- [ ] `fixed(p)` constraint
- [ ] `solveSketch(sketch)` runs constraint solver

### Already Exists

- `sketch/constraints.ts` with constraint definitions
- `sketch/solver.ts` with Gauss-Newton solver

### Verification

- Adding horizontal constraint aligns points
- Solver converges for simple constraint systems

---

## Phase 08: Dimension Constraints

### Required

- [ ] `distance(p1, p2, value)` constraint
- [ ] `angle(line1, line2, value)` constraint

### Already Exists

- Distance and angle constraints in solver

### Verification

- Distance constraint sets exact point distance
- Angle constraint sets exact line angle

---

## Phase 09: Sketch Arcs

### Required

- [ ] `SketchModel.addArc(start, end, center, ccw)` creates arc entity
- [ ] Arc representation with center point and direction

### Already Exists

- Arc support in SketchModel

### Verification

- Arc created with correct geometry
- Arc direction (ccw) is respected

---

## Phase 10: Curves in Features

### Required

- [ ] `toProfile()` handles arcs in closed loops
- [ ] Extrude creates cylindrical faces for arc edges
- [ ] Revolve handles arcs (creates torus sections)
- [ ] Tessellation handles cylindrical and toroidal surfaces

### Improvements Needed

- Cylindrical surface type in geometry
- Toroidal surface type (may need to add)
- Curved surface tessellation with smooth normals

### Verification

- Extrude circle → cylinder with 3 faces
- Revolve arc → smooth torus section

---

## Phase 11: 3D Selection

### Required

- [ ] Face IDs are stable during session
- [ ] `Body.getFaces()` returns ordered face list
- [ ] Face-to-triangle mapping for raycasting

### Improvements Needed

- Tessellation returns face mapping array
- Stable face ID assignment

### Verification

- Click on face → correct face ID returned
- Face ID consistent across rebuilds

---

## Phase 12: Rebuild Gate

### Required

- [ ] Rebuild can stop at arbitrary feature
- [ ] Feature order is respected

### Already Works

- Feature interpretation order is sequential

### Verification

- Rebuild with gate returns partial model

---

## Phase 13: Properties Panel

### Required

- [ ] Parameter changes trigger full rebuild
- [ ] Rebuild is idempotent (same inputs → same output)

### Verification

- Change distance → model updates correctly

---

## Phase 14: Extrude Extents

### Required

- [ ] `extrudeToFace(profile, targetFace)` operation
- [ ] Ray-surface intersection for distance calculation
- [ ] "Through all" extent calculation

### New Work

- Implement up-to-face logic
- Calculate maximum extent for through-all

### Verification

- Extrude to face stops at correct height
- Through all penetrates entire model

---

## Phase 15: Sketch on Face

### Required

- [ ] `Face.getSurface()` returns surface with plane data
- [ ] Extract sketch plane from planar face

### Already Exists

- Face surface access

### Verification

- Sketch on top face has correct orientation

---

## Phase 16: Sketch to Geometry

### Required

- [ ] `Edge.pointAt(t)` returns point on edge at parameter
- [ ] `Vertex.position` returns 3D position
- [ ] External constraint resolution in solver

### Improvements Needed

- Constraint solver handles externally-fixed points

### Verification

- Point attached to edge follows edge movement

---

## Phase 17: Booleans UI

### Required

- [ ] `session.union(body1, body2)` merges bodies
- [ ] `session.intersect(body1, body2)` keeps overlap

### Already Exists

- Boolean operations in `model/boolean.ts`

### Verification

- Union, subtract, intersect work correctly

---

## Phase 18: STEP Export

### Required (NEW)

- [ ] STEP file writer (`export/step.ts`)
- [ ] Serialize planar surfaces
- [ ] Serialize cylindrical surfaces
- [ ] Serialize conical surfaces
- [ ] Serialize spherical surfaces
- [ ] Serialize edge loops and face bounds

### New Module

Create `packages/core/src/export/step.ts`

### Verification

- Exported STEP imports into FreeCAD/Fusion 360

---

## Phase 19: Advanced Constraints

### Required

- [ ] `parallel(line1, line2)` constraint
- [ ] `perpendicular(line1, line2)` constraint
- [ ] `tangent(entity1, entity2)` constraint (line-arc, arc-arc)
- [ ] `equalLength(line1, line2)` constraint
- [ ] `equalRadius(arc1, arc2)` constraint
- [ ] `symmetric(p1, p2, axis)` constraint

### Improvements Needed

- Add new constraint types to solver
- Tangent constraint implementation

### Verification

- Each constraint type works in solver

---

## Phase 20: Fillet and Chamfer

### Required (NEW)

- [ ] `fillet(body, edges, radius)` operation
- [ ] `chamfer(body, edges, distances)` operation
- [ ] Cylindrical fillet surface generation
- [ ] Edge offset for chamfer

### New Module

Create `packages/core/src/model/fillet.ts`
Create `packages/core/src/model/chamfer.ts`

### Verification

- Fillet creates smooth round edge
- Chamfer creates beveled edge

---

## Phase 21: Sweep and Loft

### Required (NEW)

- [ ] `sweep(profile, path)` operation
- [ ] `loft(profiles[])` operation
- [ ] Profile positioning along path
- [ ] Skinning between profiles

### New Module

Create `packages/core/src/model/sweep.ts`
Create `packages/core/src/model/loft.ts`

### Verification

- Sweep along curved path creates correct solid
- Loft between profiles creates smooth transition

---

## Phase 22: Patterns

### Required (NEW)

- [ ] `linearPattern(features, direction, count, spacing)` operation
- [ ] `circularPattern(features, axis, count, angle)` operation
- [ ] Body copying and transformation
- [ ] Boolean union of pattern instances

### New Work

- Implement pattern operations that copy and transform

### Verification

- Linear pattern creates correctly spaced copies
- Circular pattern creates correctly rotated copies

---

## Phases 23-26: AI Integration

No new kernel work required. AI integration uses existing APIs.

---

## Summary by Priority

### High Priority (Core Functionality)

1. Profile extraction from sketches (Phase 04)
2. Boolean operations (Phase 05)
3. Constraint solver stability (Phase 07-08)
4. Arc handling in profiles (Phase 10)

### Medium Priority (Enhanced Features)

5. Extrude extents (Phase 14)
6. Face/edge references (Phase 15-16)
7. Advanced constraints (Phase 19)
8. Fillet/chamfer (Phase 20)

### Lower Priority (Advanced Features)

9. Sweep/loft (Phase 21)
10. Patterns (Phase 22)
11. STEP export (Phase 18)

---

## Testing Approach

Each kernel improvement should have:

1. **Unit tests** for the specific operation
2. **Integration tests** with the full rebuild pipeline
3. **Edge case tests** for error handling
