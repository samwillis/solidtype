# Phase 28: Reference Geometry & Sketch Tooling

**Goal:** Fully implement all reference geometry creation and all sketch tooling with complete UI and working backend.

**Prerequisites:**
- Face selection feedback must be verified working (Phase 26 fixes)
- Edge selection visual feedback must be fixed (Phase 26 fixes)

---

## Overview

This phase delivers:
1. **Reference Geometry** - All plane and axis creation modes
2. **Sketch Entity Tools** - Line, Arc, Circle, Rectangle with proper UX
3. **Sketch Modify Tools** - Trim, Extend, Offset, Mirror, Fillet, Chamfer
4. **Sketch Constraints** - All constraints with proper UI and auto-apply
5. **Inference System** - Visual preview lines during drawing

---

## Phase 28.0: Prerequisites & Foundation

Before implementing new features, fix critical blockers.

### 28.0.1: Face Selection Feedback ✅

**Status:** Working

Face hover and selection highlighting is functional:
- Hover over face → green semi-transparent overlay visible
- Click face → blue highlight clearly visible

No further work needed.

### 28.0.2: Fix Sketch on Face

**Problem:** Selecting a face and clicking "New Sketch on Face" does nothing.

**Files:**
- `floating-toolbar/FeatureModeTools.tsx`
- `contexts/SelectionContext.tsx`
- `commands/modeling.ts`

**Tasks:**
- [ ] Debug button click handler - is it being called?
- [ ] Check if selectedFaces is correctly read from SelectionContext
- [ ] Verify createSketch command is invoked with face ref
- [ ] Ensure sketch plane is correctly computed from face

**Verification:**
- [ ] Select face → click "New Sketch on Face" → enters sketch mode on that face
- [ ] Sketch plane matches face orientation

### 28.0.3: Edge Selection Feedback ✅

**Status:** Working

Edge hover and selection highlighting is functional:
- Hover near edge → edge highlights
- Click edge → edge selected with clear visual

No further work needed.

---

## Phase 28.1: Reference Geometry - Planes

### 28.1.1: Unified Plane Tool UI

**Goal:** Single tool that creates planes from multiple reference types.

**Files to create/modify:**
- `components/tools/PlaneToolPanel.tsx` (new)
- `commands/modeling.ts` (add createPlane variants)
- `document/schema.ts` (plane definition types)
- `document/featureHelpers.ts` (plane creation)

**UI Structure:**
```
┌─────────────────────────────────┐
│ Create Plane                    │
├─────────────────────────────────┤
│ Type: [Auto-detect ▼]           │
│   • Offset                      │
│   • Midplane                    │
│   • Angle                       │
│   • 3-Point                     │
├─────────────────────────────────┤
│ Reference 1: [Select...]        │
│ Reference 2: [Select...] (opt)  │
│ Reference 3: [Select...] (opt)  │
├─────────────────────────────────┤
│ Offset Distance: [____] mm      │
│ Angle: [____]°                  │
│ [Flip Normal]                   │
├─────────────────────────────────┤
│        [✓ OK]  [✗ Cancel]       │
└─────────────────────────────────┘
```

**Tasks:**
- [ ] Create PlaneToolPanel component with selection boxes
- [ ] Implement auto-detect logic based on selection:
  - 1 plane/face → Offset mode
  - 2 planes/faces → Midplane mode
  - 3 points → 3-Point mode
  - Plane + line → Angle mode
- [ ] Add offset distance input (for Offset mode)
- [ ] Add angle input (for Angle mode)
- [ ] Add Flip Normal button
- [ ] Show live preview plane in viewport
- [ ] Connect to createPlane command variants

### 28.1.2: Offset Plane (already partially working)

**Status:** Partially implemented, needs UX polish.

**Tasks:**
- [ ] Verify offset plane creation works
- [ ] Add visual preview while adjusting distance
- [ ] Allow negative offset (flip direction)

### 28.1.3: Midplane from 2 Faces

**Goal:** Create plane equidistant between two parallel faces/planes.

**Backend:**
- [ ] Add `midplane` definition kind to schema
- [ ] Implement midplane calculation in kernel
- [ ] Compute plane origin and normal from two references

**Frontend:**
- [ ] Detect midplane mode when 2 faces selected
- [ ] Show preview plane between faces
- [ ] Validate faces are parallel (show error if not)

### 28.1.4: 3-Point Plane

**Goal:** Create plane through three points/vertices.

**Backend:**
- [ ] Add `threePoints` definition kind to schema
- [ ] Implement 3-point plane calculation (cross product of vectors)

**Frontend:**
- [ ] Detect 3-point mode when 3 points selected
- [ ] Show preview plane through points
- [ ] Allow selecting sketch points or model vertices

### 28.1.5: Angle Plane

**Goal:** Create plane at angle to reference plane, rotated about an axis.

**Backend:**
- [ ] Add `angle` definition kind to schema
- [ ] Implement angle plane calculation

**Frontend:**
- [ ] Detect angle mode when plane + line selected
- [ ] Show angle input
- [ ] Show preview plane that rotates with angle value

---

## Phase 28.2: Reference Geometry - Axes

### 28.2.1: Unified Axis Tool UI

**Files to create/modify:**
- `components/tools/AxisToolPanel.tsx` (new)
- `commands/modeling.ts` (add createAxis variants)
- `document/schema.ts` (axis definition types)

**UI Structure:**
```
┌─────────────────────────────────┐
│ Create Axis                     │
├─────────────────────────────────┤
│ Definition: [Auto-detect ▼]     │
│   • From linear entity          │
│   • Two points                  │
│   • Two planes (intersection)   │
│   • From cylinder/cone          │
├─────────────────────────────────┤
│ Reference 1: [Select...]        │
│ Reference 2: [Select...] (opt)  │
├─────────────────────────────────┤
│        [✓ OK]  [✗ Cancel]       │
└─────────────────────────────────┘
```

**Tasks:**
- [ ] Create AxisToolPanel component
- [ ] Implement auto-detect logic:
  - 1 linear entity → direct axis
  - 2 points → axis through points
  - 2 planes → intersection axis
  - Cylindrical face → cylinder axis

### 28.2.2: Axis from Linear Entity

**Tasks:**
- [ ] Accept sketch line, edge, or existing axis
- [ ] Create axis along that direction
- [ ] Show preview axis

### 28.2.3: Axis from Two Points

**Tasks:**
- [ ] Accept 2 sketch points or vertices
- [ ] Create axis through both points
- [ ] Show preview axis

### 28.2.4: Axis from Two Planes (Intersection)

**Tasks:**
- [ ] Accept 2 planes or planar faces
- [ ] Compute intersection line
- [ ] Create axis along intersection
- [ ] Error if planes are parallel

### 28.2.5: Axis from Cylindrical Face

**Requires:** Edge selection working

**Tasks:**
- [ ] Accept cylindrical or conical face
- [ ] Extract axis from cylinder/cone center
- [ ] Create temporary axis

---

## Phase 28.3: Sketch Entity Tools

### 28.3.1: Line Tool Enhancement

**Status:** Mostly working, needs testing and polish.

**Tasks:**
- [ ] Verify chain mode works correctly
- [ ] Verify right-click ends chain
- [ ] Verify snap indicators display
- [ ] Test auto H/V constraint application
- [ ] Add click-drag mode (single line on release)

**Verification:**
- [ ] Chain mode: click-click-click creates connected lines
- [ ] Right-click ends chain without creating line
- [ ] Diamond indicator shows at snap points
- [ ] Near-horizontal lines get H constraint
- [ ] Near-vertical lines get V constraint

### 28.3.2: Arc Tool - 3-Point Mode

**Status:** Basic implementation exists, needs testing.

**Tasks:**
- [ ] Verify 3-click sequence: start → end → bulge
- [ ] Add live arc preview during placement
- [ ] Show radius/angle info during preview
- [ ] Auto-apply coincident at snap points

**Verification:**
- [ ] Click 3 points → arc created
- [ ] Preview shows arc shape while moving bulge point
- [ ] Arc direction follows cursor position

### 28.3.3: Arc Tool - Centerpoint Mode

**Tasks:**
- [ ] Implement center → start → end sequence
- [ ] Add toolbar toggle for arc mode (3-point vs centerpoint)
- [ ] Show radius line during preview
- [ ] Show angle during end point selection

### 28.3.4: Arc Tool - Tangent Mode

**Tasks:**
- [ ] Detect when starting from line/arc endpoint
- [ ] Show tangent arc preview when cursor in "arc intent zone"
- [ ] Auto-apply tangent constraint
- [ ] Allow flipping tangent direction

### 28.3.5: Circle Tool - Centerpoint Mode

**Status:** Basic implementation, needs preview.

**Tasks:**
- [ ] Verify center → radius click sequence
- [ ] Add live circle preview during radius selection
- [ ] Show radius value in preview
- [ ] Auto-apply coincident at snap points

### 28.3.6: Circle Tool - 3-Point Mode

**Tasks:**
- [ ] Implement 3-click sequence
- [ ] Show live circle preview after 2nd point
- [ ] Calculate circle through 3 points

### 28.3.7: Rectangle Tool - Corner Mode

**Status:** Basic implementation, needs preview and constraints.

**Tasks:**
- [ ] Verify corner → corner click sequence
- [ ] Add live rectangle preview
- [ ] Auto-apply H/V constraints on all 4 edges
- [ ] Auto-apply perpendicular at corners

### 28.3.8: Rectangle Tool - Center Mode

**Tasks:**
- [ ] Implement center → corner click sequence
- [ ] Show live rectangle preview (symmetric about center)
- [ ] Apply same constraints as corner mode

### 28.3.9: Rectangle Tool - 3-Point Mode

**Tasks:**
- [ ] Implement corner → corner → width sequence
- [ ] Show preview of tilted rectangle
- [ ] Apply appropriate constraints

### 28.3.10: Polygon Tool

**Tasks:**
- [ ] Implement center → vertex click sequence
- [ ] Add sides count input (default 6)
- [ ] Show preview polygon
- [ ] Apply equal length constraints on all sides

---

## Phase 28.4: Sketch Modify Tools

### 28.4.1: Trim Tool

**Files:**
- `viewer/hooks/useSketchTools.ts` (add trim logic)
- `contexts/SketchContext.tsx` (add trim operations)
- `floating-toolbar/SketchModeTools.tsx` (add button)

**Modes:**

| Mode | Behavior |
|------|----------|
| Power Trim | Drag across segments to trim continuously |
| Trim to Closest | Click segment portion to remove |
| Corner | Select 2 entities to trim/extend to meet |

**Tasks:**
- [ ] Add trim tool button to toolbar
- [ ] Implement intersection finding for sketch entities
- [ ] Implement Power Trim (drag-to-trim)
  - Track drag path
  - Find intersections with each entity
  - Split entities at intersections
  - Delete crossed portions
- [ ] Implement Trim to Closest
  - Click on segment portion
  - Find nearest intersections on both sides
  - Delete portion between intersections
- [ ] Implement Corner mode
  - Select 2 non-intersecting entities
  - Extend/trim to meet at corner
- [ ] Update Yjs document correctly (delete/modify entities)

### 28.4.2: Extend Tool

**Tasks:**
- [ ] Add extend tool button
- [ ] Click near entity endpoint
- [ ] Find nearest boundary (other entity)
- [ ] Extend entity to meet boundary
- [ ] Handle cases: line→line, line→arc, arc→line

### 28.4.3: Offset Tool

**Tasks:**
- [ ] Add offset tool button
- [ ] Select entity or chain
- [ ] Enter offset distance
- [ ] Show preview of offset geometry
- [ ] Choose offset side (click or flip button)
- [ ] Create new entities at offset distance
- [ ] For chains: handle end caps

**Geometry operations:**
- [ ] Line offset (parallel line)
- [ ] Arc offset (concentric arc with adjusted radius)
- [ ] Chain offset (connected offset entities)

### 28.4.4: Mirror Tool (Sketch)

**Tasks:**
- [ ] Add mirror tool button
- [ ] Select entities to mirror
- [ ] Select mirror line (construction line or axis)
- [ ] Create mirrored copies
- [ ] Apply symmetric constraints between original and copy

### 28.4.5: Sketch Fillet Tool

**Tasks:**
- [ ] Add fillet tool button
- [ ] Click corner (intersection of 2 entities)
- [ ] Enter/drag radius
- [ ] Preview fillet arc
- [ ] Trim original entities
- [ ] Create tangent arc between them

### 28.4.6: Sketch Chamfer Tool

**Tasks:**
- [ ] Add chamfer tool button
- [ ] Click corner
- [ ] Enter distance(s) or angle
- [ ] Preview chamfer line
- [ ] Trim original entities
- [ ] Create line between trim points

---

## Phase 28.5: Sketch Constraints

### 28.5.1: Constraint Menu Enhancement

**Current:** Menu buttons exist but need testing.

**Tasks:**
- [ ] Test each constraint type:
  - [ ] Coincident (point-point, point-curve)
  - [ ] Horizontal
  - [ ] Vertical
  - [ ] Parallel
  - [ ] Perpendicular
  - [ ] Tangent
  - [ ] Equal
  - [ ] Midpoint
  - [ ] Concentric
  - [ ] Symmetric
  - [ ] Fix
- [ ] Fix any broken constraints
- [ ] Add proper selection validation for each constraint type
- [ ] Show clear error if selection invalid for constraint

### 28.5.2: Auto-Constraint System

**Status:** Code exists, needs verification.

**Tasks:**
- [ ] Verify H/V auto-apply on line creation
- [ ] Verify coincident auto-apply on snap
- [ ] Add parallel/perpendicular detection
- [ ] Add collinear detection
- [ ] Ctrl key suppresses auto-constraints

### 28.5.3: Constraint Glyphs

**Tasks:**
- [ ] Show constraint icons on constrained entities
- [ ] Horizontal: "H" icon
- [ ] Vertical: "V" icon
- [ ] Parallel: "∥" icon
- [ ] Perpendicular: "⊥" icon
- [ ] Tangent: curved "T" icon
- [ ] Equal: "=" icon
- [ ] Coincident: dot icon
- [ ] Clicking glyph selects constraint

### 28.5.4: Relations Panel

**Tasks:**
- [ ] When entity selected, show list of its constraints
- [ ] Hover constraint → highlight related entities
- [ ] Delete constraint from panel
- [ ] Toggle constraint driven/driving (for dimensions)

---

## Phase 28.6: Inference System

### 28.6.1: Horizontal/Vertical Inference Lines

**Tasks:**
- [ ] While drawing, detect when cursor aligns with existing point
- [ ] Show dashed horizontal line when H-aligned
- [ ] Show dashed vertical line when V-aligned
- [ ] Show both if aligned in both directions

### 28.6.2: Parallel/Perpendicular Inference

**Tasks:**
- [ ] Detect when line being drawn is parallel to existing line
- [ ] Show "∥" indicator and dashed line
- [ ] Detect perpendicular alignment
- [ ] Show "⊥" indicator

### 28.6.3: Tangent Inference

**Tasks:**
- [ ] When near arc/circle endpoint, detect tangent direction
- [ ] Show tangent inference line
- [ ] Show "T" indicator

### 28.6.4: Inference Hysteresis

**Tasks:**
- [ ] Once inference appears, don't flicker off immediately
- [ ] Require cursor to move threshold distance before removing
- [ ] Prevents annoying flicker during precise positioning

---

## Phase 28.7: Sketch Status & Display

### 28.7.1: Entity Coloring by Status

**Colors:**
| Status | Color |
|--------|-------|
| Under-defined | Blue |
| Fully defined | Black/Green |
| Construction | Dashed Orange |
| Over-defined | Red |

**Tasks:**
- [ ] Track DOF (degrees of freedom) per entity
- [ ] Color entities based on constrained status
- [ ] Show overall sketch status in toolbar

### 28.7.2: DOF Indicator

**Tasks:**
- [ ] Show "DOF: X" in sketch toolbar
- [ ] Show 0 when fully constrained
- [ ] Indicate over-constrained (negative DOF equivalent)

### 28.7.3: Construction Mode Toggle

**Status:** X key toggle exists, needs verification.

**Tasks:**
- [ ] Verify X key toggles construction mode
- [ ] Construction entities render dashed orange
- [ ] Construction entities excluded from profiles
- [ ] Can toggle existing entity to construction

---

## Verification Checklists

### Reference Geometry
- [ ] Create offset plane from datum plane
- [ ] Create offset plane from model face
- [ ] Create midplane between 2 faces
- [ ] Create 3-point plane
- [ ] Create angle plane
- [ ] Create axis from sketch line
- [ ] Create axis from 2 points
- [ ] Create axis from 2 planes

### Sketch Entity Tools
- [ ] Line chain mode works
- [ ] Arc 3-point creates arc
- [ ] Arc centerpoint creates arc
- [ ] Circle centerpoint creates circle
- [ ] Rectangle corner mode creates rectangle with constraints
- [ ] All tools show live preview

### Sketch Modify Tools
- [ ] Trim removes portion of entity
- [ ] Power trim works with drag
- [ ] Extend lengthens entity to boundary
- [ ] Offset creates parallel geometry
- [ ] Mirror creates symmetric copy
- [ ] Fillet rounds corner
- [ ] Chamfer bevels corner

### Constraints
- [ ] All constraint types apply correctly
- [ ] Auto-constraints work during drawing
- [ ] Constraint glyphs visible
- [ ] Can delete constraints
- [ ] Over-constrained shown in red

### Inference
- [ ] H/V inference lines show during drawing
- [ ] Parallel/perpendicular inference works
- [ ] Inference doesn't flicker

---

## Dependencies

```
Phase 28.0 (Prerequisites)
    │
    ├─→ Phase 28.1 (Planes)
    │       └─→ Phase 28.2 (Axes) [needs edge selection for some modes]
    │
    └─→ Phase 28.3 (Sketch Entities)
            │
            ├─→ Phase 28.4 (Modify Tools) [needs entities to modify]
            │
            ├─→ Phase 28.5 (Constraints)
            │
            └─→ Phase 28.6 (Inference)
                    │
                    └─→ Phase 28.7 (Status Display)
```

---

## Estimated Effort

| Phase | Description | Estimate |
|-------|-------------|----------|
| 28.0 | Prerequisites (fix Sketch on Face) | 0.5-1 day |
| 28.1 | Planes | 2-3 days |
| 28.2 | Axes | 1-2 days |
| 28.3 | Sketch Entities | 3-4 days |
| 28.4 | Modify Tools | 4-5 days |
| 28.5 | Constraints | 2-3 days |
| 28.6 | Inference | 2-3 days |
| 28.7 | Status Display | 1 day |
| **Total** | | **15-22 days** |

---

## Key Files Reference

### App Package
- `viewer/hooks/useSketchTools.ts` - sketch tool logic
- `viewer/renderers/useSketchRenderer.ts` - sketch entity rendering
- `viewer/renderers/useSelectionRenderer.ts` - selection highlights
- `contexts/SketchContext.tsx` - sketch state and operations
- `contexts/SelectionContext.tsx` - 3D selection state
- `commands/modeling.ts` - unified command API
- `document/schema.ts` - Yjs document schemas
- `document/featureHelpers.ts` - feature CRUD
- `floating-toolbar/SketchModeTools.tsx` - sketch toolbar

### Core Package
- `sketch/solver.ts` - constraint solver
- `sketch/constraints.ts` - constraint error functions
- `sketch/SketchModel.ts` - sketch data model

---

## Automated Testing Strategy

### Testing Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    E2E Tests (Playwright)                        │
│  Full user workflows in real browser                             │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│              Integration Tests (Vitest + Yjs)                    │
│  Commands layer, document mutations, kernel rebuild              │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                   Unit Tests (Vitest)                            │
│  Geometry, constraints, pure functions                           │
└─────────────────────────────────────────────────────────────────┘
```

---

### 1. Unit Tests (Core Package)

These test pure geometry and constraint logic in isolation.

#### Constraint Solver Tests

**File:** `packages/core/tests/sketch/solver.test.ts` (extend existing)

```typescript
describe("Phase 28 Constraints", () => {
  describe("Tangent constraint", () => {
    it("should make line tangent to arc at endpoint", () => {
      const sketch = new SketchModel(XY_PLANE);
      const center = sketch.addPoint(0, 0);
      const arcStart = sketch.addPoint(5, 0);
      const arcEnd = sketch.addPoint(0, 5);
      const arc = sketch.addArc(arcStart, arcEnd, center, true);
      
      const lineEnd = sketch.addPoint(10, 0);
      const line = sketch.addLine(arcStart, lineEnd);
      
      const constraints = [tangent(arc, line)];
      const result = solveSketch(sketch, constraints);
      
      expect(result.status).toBe("success");
      // Verify tangent: line direction perpendicular to radius at arcStart
    });
  });
  
  describe("Symmetric constraint", () => {
    it("should make points symmetric about line", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(-5, 3);
      const p2 = sketch.addPoint(7, 4);
      const axisStart = sketch.addPoint(0, -10);
      const axisEnd = sketch.addPoint(0, 10);
      const axis = sketch.addLine(axisStart, axisEnd);
      
      const constraints = [
        fixed(axisStart),
        fixed(axisEnd),
        symmetric(p1, p2, axis),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe("success");
      
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt1.x).toBeCloseTo(-pt2.x); // Symmetric about Y axis
      expect(pt1.y).toBeCloseTo(pt2.y);
    });
  });
});
```

#### Geometry Calculation Tests

**File:** `packages/core/tests/geom/sketch-geometry.test.ts` (new)

```typescript
describe("Sketch Geometry Calculations", () => {
  describe("Line-line intersection", () => {
    it("should find intersection point", () => {
      const line1 = { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } };
      const line2 = { start: { x: 0, y: 10 }, end: { x: 10, y: 0 } };
      
      const intersection = lineLineIntersection(line1, line2);
      
      expect(intersection).not.toBeNull();
      expect(intersection!.x).toBeCloseTo(5);
      expect(intersection!.y).toBeCloseTo(5);
    });
    
    it("should return null for parallel lines", () => {
      const line1 = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
      const line2 = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
      
      const intersection = lineLineIntersection(line1, line2);
      
      expect(intersection).toBeNull();
    });
  });
  
  describe("Line-arc intersection", () => {
    it("should find intersection points", () => {
      const line = { start: { x: -10, y: 5 }, end: { x: 10, y: 5 } };
      const arc = { center: { x: 0, y: 0 }, radius: 10 };
      
      const intersections = lineArcIntersection(line, arc);
      
      expect(intersections).toHaveLength(2);
    });
  });
  
  describe("Offset curve", () => {
    it("should offset line by distance", () => {
      const line = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
      const offset = offsetLine(line, 5, "left");
      
      expect(offset.start.y).toBeCloseTo(5);
      expect(offset.end.y).toBeCloseTo(5);
    });
    
    it("should offset arc (change radius)", () => {
      const arc = { center: { x: 0, y: 0 }, radius: 10 };
      const offset = offsetArc(arc, 5, "outward");
      
      expect(offset.radius).toBeCloseTo(15);
    });
  });
  
  describe("Trim calculation", () => {
    it("should find trim points for line", () => {
      const line = { start: { x: 0, y: 0 }, end: { x: 20, y: 0 } };
      const crossingLines = [
        { start: { x: 5, y: -5 }, end: { x: 5, y: 5 } },
        { start: { x: 15, y: -5 }, end: { x: 15, y: 5 } },
      ];
      
      const trimPoints = findTrimPoints(line, crossingLines);
      
      expect(trimPoints).toHaveLength(2);
      expect(trimPoints[0].x).toBeCloseTo(5);
      expect(trimPoints[1].x).toBeCloseTo(15);
    });
  });
});
```

#### Plane Calculation Tests

**File:** `packages/core/tests/model/planes.test.ts` (extend existing)

```typescript
describe("Phase 28 Plane Creation", () => {
  describe("Midplane", () => {
    it("should create plane between two parallel planes", () => {
      const plane1 = { origin: [0, 0, 0], normal: [0, 0, 1] };
      const plane2 = { origin: [0, 0, 10], normal: [0, 0, 1] };
      
      const midplane = createMidplane(plane1, plane2);
      
      expect(midplane.origin[2]).toBeCloseTo(5);
      expect(midplane.normal).toEqual([0, 0, 1]);
    });
    
    it("should fail for non-parallel planes", () => {
      const plane1 = { origin: [0, 0, 0], normal: [0, 0, 1] };
      const plane2 = { origin: [0, 0, 10], normal: [1, 0, 0] };
      
      expect(() => createMidplane(plane1, plane2)).toThrow();
    });
  });
  
  describe("3-Point Plane", () => {
    it("should create plane through three points", () => {
      const p1 = [0, 0, 0];
      const p2 = [10, 0, 0];
      const p3 = [0, 10, 0];
      
      const plane = create3PointPlane(p1, p2, p3);
      
      expect(plane.normal[2]).toBeCloseTo(1); // XY plane
    });
    
    it("should fail for collinear points", () => {
      const p1 = [0, 0, 0];
      const p2 = [5, 0, 0];
      const p3 = [10, 0, 0];
      
      expect(() => create3PointPlane(p1, p2, p3)).toThrow();
    });
  });
  
  describe("Angle Plane", () => {
    it("should create plane at angle to reference", () => {
      const refPlane = { origin: [0, 0, 0], normal: [0, 0, 1] };
      const axis = { origin: [0, 0, 0], direction: [1, 0, 0] };
      const angle = 45; // degrees
      
      const result = createAnglePlane(refPlane, axis, angle);
      
      // Plane rotated 45° about X axis
      expect(result.normal[1]).toBeCloseTo(Math.sin(Math.PI / 4));
      expect(result.normal[2]).toBeCloseTo(Math.cos(Math.PI / 4));
    });
  });
});
```

---

### 2. Integration Tests (App Package)

These test the full command layer and Yjs document mutations.

#### Commands Integration Tests

**File:** `packages/app/tests/integration/sketch-commands.test.ts` (new)

```typescript
/**
 * Sketch Commands Integration Tests
 * 
 * Tests the full sketch workflow through the commands layer.
 */

import { describe, test, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { createDocument, type SolidTypeDoc } from "../../src/editor/document/createDocument";
import { createSketch } from "../../src/editor/commands";
import {
  addPointToSketch,
  addLineToSketch,
  addArcToSketch,
  addCircleToSketch,
  addRectangleToSketch,
  addConstraintToSketch,
  trimEntity,
  extendEntity,
  offsetEntities,
} from "../../src/editor/document/featureHelpers";

describe("Sketch Entity Commands", () => {
  let doc: SolidTypeDoc;
  let sketchId: string;
  
  beforeEach(() => {
    doc = createDocument();
    const result = createSketch(doc, { planeRef: "xy" });
    if (!result.ok) throw new Error(result.error);
    sketchId = result.value.featureId;
  });
  
  describe("Line creation", () => {
    test("creates line between two points", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      const p1 = addPointToSketch(sketch, 0, 0);
      const p2 = addPointToSketch(sketch, 10, 0);
      const lineId = addLineToSketch(sketch, p1, p2);
      
      expect(lineId).toBeDefined();
      
      const lines = sketch.get("lines") as Y.Array<Y.Map<unknown>>;
      expect(lines.length).toBe(1);
      expect(lines.get(0).get("startId")).toBe(p1);
      expect(lines.get(0).get("endId")).toBe(p2);
    });
    
    test("reuses existing point when coordinates match", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      const p1 = addPointToSketch(sketch, 0, 0);
      const p2 = addPointToSketch(sketch, 10, 0);
      const p3 = addPointToSketch(sketch, 0, 0); // Same as p1
      
      expect(p3).toBe(p1); // Should reuse
    });
  });
  
  describe("Arc creation", () => {
    test("creates 3-point arc", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      const start = addPointToSketch(sketch, 0, 0);
      const end = addPointToSketch(sketch, 10, 0);
      const mid = addPointToSketch(sketch, 5, 5);
      
      const arcId = addArcToSketch(sketch, { 
        type: "threePoint",
        start, 
        end, 
        through: mid 
      });
      
      expect(arcId).toBeDefined();
      const arcs = sketch.get("arcs") as Y.Array<Y.Map<unknown>>;
      expect(arcs.length).toBe(1);
    });
    
    test("creates centerpoint arc", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      const center = addPointToSketch(sketch, 0, 0);
      const start = addPointToSketch(sketch, 5, 0);
      const end = addPointToSketch(sketch, 0, 5);
      
      const arcId = addArcToSketch(sketch, {
        type: "centerpoint",
        center,
        start,
        end,
        ccw: true,
      });
      
      expect(arcId).toBeDefined();
    });
  });
  
  describe("Rectangle creation", () => {
    test("creates rectangle with 4 lines and constraints", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      
      addRectangleToSketch(sketch, {
        corner1: { x: 0, y: 0 },
        corner2: { x: 10, y: 5 },
      });
      
      const lines = sketch.get("lines") as Y.Array<unknown>;
      const constraints = sketch.get("constraints") as Y.Array<unknown>;
      
      expect(lines.length).toBe(4);
      // Should have H/V constraints
      expect(constraints.length).toBeGreaterThanOrEqual(4);
    });
  });
  
  describe("Constraint application", () => {
    test("adds horizontal constraint to line", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      const p1 = addPointToSketch(sketch, 0, 0);
      const p2 = addPointToSketch(sketch, 10, 2); // Not horizontal
      const lineId = addLineToSketch(sketch, p1, p2);
      
      addConstraintToSketch(sketch, {
        type: "horizontal",
        lineId,
      });
      
      const constraints = sketch.get("constraints") as Y.Array<Y.Map<unknown>>;
      expect(constraints.length).toBe(1);
      expect(constraints.get(0).get("type")).toBe("horizontal");
    });
    
    test("adds coincident constraint between points", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      const p1 = addPointToSketch(sketch, 0, 0);
      const p2 = addPointToSketch(sketch, 1, 1);
      
      addConstraintToSketch(sketch, {
        type: "coincident",
        point1Id: p1,
        point2Id: p2,
      });
      
      const constraints = sketch.get("constraints") as Y.Array<Y.Map<unknown>>;
      expect(constraints.length).toBe(1);
    });
  });
});

describe("Sketch Modify Commands", () => {
  let doc: SolidTypeDoc;
  let sketchId: string;
  
  beforeEach(() => {
    doc = createDocument();
    const result = createSketch(doc, { planeRef: "xy" });
    if (!result.ok) throw new Error(result.error);
    sketchId = result.value.featureId;
  });
  
  describe("Trim", () => {
    test("trims line at intersection", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      
      // Create crossing lines
      const h1 = addPointToSketch(sketch, 0, 5);
      const h2 = addPointToSketch(sketch, 20, 5);
      const horizontalLine = addLineToSketch(sketch, h1, h2);
      
      const v1 = addPointToSketch(sketch, 10, 0);
      const v2 = addPointToSketch(sketch, 10, 10);
      const verticalLine = addLineToSketch(sketch, v1, v2);
      
      // Trim left portion of horizontal line
      const result = trimEntity(sketch, horizontalLine, { 
        trimPoint: { x: 5, y: 5 } 
      });
      
      expect(result.ok).toBe(true);
      // Line should now start at intersection (10, 5)
    });
  });
  
  describe("Offset", () => {
    test("offsets line by distance", () => {
      const sketch = doc.featuresById.get(sketchId)!;
      
      const p1 = addPointToSketch(sketch, 0, 0);
      const p2 = addPointToSketch(sketch, 10, 0);
      const lineId = addLineToSketch(sketch, p1, p2);
      
      const result = offsetEntities(sketch, [lineId], {
        distance: 5,
        side: "left",
      });
      
      expect(result.ok).toBe(true);
      
      const lines = sketch.get("lines") as Y.Array<unknown>;
      expect(lines.length).toBe(2); // Original + offset
    });
  });
});
```

#### Reference Geometry Commands Tests

**File:** `packages/app/tests/integration/plane-commands.test.ts` (new)

```typescript
/**
 * Reference Geometry Commands Integration Tests
 */

import { describe, test, expect, beforeEach } from "vitest";
import { createDocument, type SolidTypeDoc } from "../../src/editor/document/createDocument";
import {
  createOffsetPlane,
  createMidplane,
  create3PointPlane,
  createAnglePlane,
  createAxis,
} from "../../src/editor/commands";

describe("Plane Creation Commands", () => {
  let doc: SolidTypeDoc;
  
  beforeEach(() => {
    doc = createDocument();
  });
  
  describe("Offset Plane", () => {
    test("creates offset plane from XY plane", () => {
      const result = createOffsetPlane(doc, {
        basePlaneRef: "xy",
        offset: 10,
      });
      
      expect(result.ok).toBe(true);
      expect(result.value.featureId).toBeDefined();
      
      const plane = doc.featuresById.get(result.value.featureId);
      expect(plane).toBeDefined();
    });
    
    test("creates offset plane with negative distance", () => {
      const result = createOffsetPlane(doc, {
        basePlaneRef: "xy",
        offset: -10,
      });
      
      expect(result.ok).toBe(true);
    });
  });
  
  describe("Midplane", () => {
    test("creates midplane between two parallel planes", () => {
      // First create two offset planes
      createOffsetPlane(doc, { basePlaneRef: "xy", offset: 0, name: "Plane1" });
      createOffsetPlane(doc, { basePlaneRef: "xy", offset: 20, name: "Plane2" });
      
      const result = createMidplane(doc, {
        plane1Ref: "Plane1",
        plane2Ref: "Plane2",
      });
      
      expect(result.ok).toBe(true);
      // Midplane should be at Z=10
    });
    
    test("fails for non-parallel planes", () => {
      const result = createMidplane(doc, {
        plane1Ref: "xy",
        plane2Ref: "xz",
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain("parallel");
    });
  });
  
  describe("3-Point Plane", () => {
    test("creates plane through three sketch points", () => {
      // Create sketch with 3 points
      const sketchResult = createSketch(doc, { planeRef: "xy" });
      const sketch = doc.featuresById.get(sketchResult.value.featureId)!;
      
      const p1 = addPointToSketch(sketch, 0, 0);
      const p2 = addPointToSketch(sketch, 10, 0);
      const p3 = addPointToSketch(sketch, 5, 10);
      
      const result = create3PointPlane(doc, {
        point1Ref: `${sketchResult.value.featureId}:${p1}`,
        point2Ref: `${sketchResult.value.featureId}:${p2}`,
        point3Ref: `${sketchResult.value.featureId}:${p3}`,
      });
      
      expect(result.ok).toBe(true);
    });
  });
});

describe("Axis Creation Commands", () => {
  let doc: SolidTypeDoc;
  
  beforeEach(() => {
    doc = createDocument();
  });
  
  describe("Axis from two planes", () => {
    test("creates axis at intersection of XY and XZ planes", () => {
      const result = createAxis(doc, {
        type: "twoPlanes",
        plane1Ref: "xy",
        plane2Ref: "xz",
      });
      
      expect(result.ok).toBe(true);
      // Axis should be along X direction
    });
  });
});
```

---

### 3. UI Behavior Tests

Test tool state machines and user interaction flows.

**File:** `packages/app/tests/integration/sketch-tools.test.ts` (new)

```typescript
/**
 * Sketch Tool Behavior Tests
 * 
 * Tests tool state machines and click sequences.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { 
  simulateSketchToolClick,
  simulateSketchToolMove,
  simulateSketchToolRightClick,
  createTestSketchContext,
} from "../fixtures/sketch-tool-harness";

describe("Line Tool State Machine", () => {
  test("first click sets start point", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    
    expect(ctx.tempStartPoint).toEqual({ x: 0, y: 0 });
    expect(ctx.sketch.lines.length).toBe(0); // No line yet
  });
  
  test("second click creates line and chains", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    simulateSketchToolClick(ctx, { x: 10, y: 0 });
    
    expect(ctx.sketch.lines.length).toBe(1);
    expect(ctx.chainLastEndpoint).toEqual({ x: 10, y: 0, id: expect.any(String) });
  });
  
  test("third click continues chain", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    simulateSketchToolClick(ctx, { x: 10, y: 0 });
    simulateSketchToolClick(ctx, { x: 10, y: 10 });
    
    expect(ctx.sketch.lines.length).toBe(2);
  });
  
  test("right-click ends chain", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    simulateSketchToolClick(ctx, { x: 10, y: 0 });
    simulateSketchToolRightClick(ctx);
    
    expect(ctx.chainLastEndpoint).toBeNull();
    expect(ctx.tempStartPoint).toBeNull();
  });
  
  test("escape cancels current operation", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    ctx.pressKey("Escape");
    
    expect(ctx.tempStartPoint).toBeNull();
    expect(ctx.chainLastEndpoint).toBeNull();
  });
});

describe("Arc Tool State Machine", () => {
  test("3-point arc: three clicks create arc", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("arc");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });   // Start
    simulateSketchToolClick(ctx, { x: 10, y: 0 });  // End
    simulateSketchToolClick(ctx, { x: 5, y: 5 });   // Bulge
    
    expect(ctx.sketch.arcs.length).toBe(1);
  });
});

describe("Rectangle Tool State Machine", () => {
  test("two clicks create rectangle", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("rectangle");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    simulateSketchToolClick(ctx, { x: 10, y: 5 });
    
    expect(ctx.sketch.lines.length).toBe(4);
    expect(ctx.sketch.constraints.length).toBeGreaterThanOrEqual(4); // H/V constraints
  });
});

describe("Auto-Constraints", () => {
  test("near-horizontal line gets H constraint", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    simulateSketchToolClick(ctx, { x: 10, y: 0.1 }); // Almost horizontal
    
    const hConstraints = ctx.sketch.constraints.filter(c => c.type === "horizontal");
    expect(hConstraints.length).toBe(1);
  });
  
  test("near-vertical line gets V constraint", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    simulateSketchToolClick(ctx, { x: 0.1, y: 10 }); // Almost vertical
    
    const vConstraints = ctx.sketch.constraints.filter(c => c.type === "vertical");
    expect(vConstraints.length).toBe(1);
  });
  
  test("ctrl key suppresses auto-constraints", () => {
    const ctx = createTestSketchContext();
    ctx.activateTool("line");
    
    simulateSketchToolClick(ctx, { x: 0, y: 0 });
    simulateSketchToolClick(ctx, { x: 10, y: 0 }, { ctrlKey: true });
    
    expect(ctx.sketch.constraints.length).toBe(0);
  });
});
```

---

### 4. Visual Regression Tests

Test that rendering produces expected visual output.

**File:** `packages/app/tests/visual/sketch-rendering.test.ts` (new)

```typescript
/**
 * Visual Regression Tests for Sketch Rendering
 * 
 * Uses snapshot testing to verify rendering output.
 */

import { describe, test, expect } from "vitest";
import { renderSketchToCanvas } from "../fixtures/sketch-renderer-harness";

describe("Sketch Entity Rendering", () => {
  test("line renders correctly", async () => {
    const sketch = createSketchWithLine(0, 0, 10, 10);
    const canvas = await renderSketchToCanvas(sketch);
    
    expect(canvas).toMatchImageSnapshot();
  });
  
  test("arc renders correctly", async () => {
    const sketch = createSketchWithArc(0, 0, 5, 0, 0, 5, true);
    const canvas = await renderSketchToCanvas(sketch);
    
    expect(canvas).toMatchImageSnapshot();
  });
  
  test("construction line renders dashed orange", async () => {
    const sketch = createSketchWithConstructionLine(0, 0, 10, 0);
    const canvas = await renderSketchToCanvas(sketch);
    
    // Verify orange dashed line
    expect(canvas).toMatchImageSnapshot();
  });
  
  test("constraint glyphs render", async () => {
    const sketch = createSketchWithConstrainedRectangle();
    const canvas = await renderSketchToCanvas(sketch, { showConstraints: true });
    
    // Should show H/V glyphs
    expect(canvas).toMatchImageSnapshot();
  });
});

describe("Selection Highlighting", () => {
  test("selected face highlights blue", async () => {
    const scene = createSceneWithBody();
    selectFace(scene, 0);
    const canvas = await renderSceneToCanvas(scene);
    
    expect(canvas).toMatchImageSnapshot();
  });
  
  test("hovered edge highlights", async () => {
    const scene = createSceneWithBody();
    hoverEdge(scene, 0);
    const canvas = await renderSceneToCanvas(scene);
    
    expect(canvas).toMatchImageSnapshot();
  });
});
```

---

### 5. E2E Tests (Playwright)

Full browser tests for complete user workflows.

**File:** `packages/app/e2e/sketch-workflow.spec.ts` (new)

```typescript
/**
 * E2E Tests for Sketch Workflows
 * 
 * Tests complete user interactions in the browser.
 */

import { test, expect } from "@playwright/test";

test.describe("Sketch Creation Workflow", () => {
  test("create sketch on XY plane and draw rectangle", async ({ page }) => {
    await page.goto("/editor");
    
    // Wait for app to load
    await page.waitForSelector('[data-testid="viewer-canvas"]');
    
    // Click XY plane in feature tree
    await page.click('[data-testid="feature-xy-plane"]');
    
    // Click "New Sketch" button
    await page.click('[data-testid="new-sketch-button"]');
    
    // Should enter sketch mode
    await expect(page.locator('[data-testid="sketch-toolbar"]')).toBeVisible();
    
    // Select rectangle tool
    await page.click('[data-testid="rectangle-tool"]');
    
    // Draw rectangle (click two corners on canvas)
    const canvas = page.locator('[data-testid="viewer-canvas"]');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 200, y: 150 } });
    
    // Should have created 4 lines
    await expect(page.locator('[data-testid="sketch-entity-line"]')).toHaveCount(4);
    
    // Exit sketch
    await page.keyboard.press("Escape");
    
    // Should show sketch in feature tree
    await expect(page.locator('[data-testid="feature-sketch"]')).toBeVisible();
  });
  
  test("sketch on face workflow", async ({ page }) => {
    await page.goto("/editor");
    
    // Create a body first (assume one exists or create via extrude)
    // ...
    
    // Click on a face
    const canvas = page.locator('[data-testid="viewer-canvas"]');
    await canvas.click({ position: { x: 300, y: 200 } });
    
    // Face should be highlighted
    await expect(page.locator('[data-testid="selected-face-indicator"]')).toBeVisible();
    
    // Click "Sketch on Face" button
    await page.click('[data-testid="sketch-on-face-button"]');
    
    // Should enter sketch mode on that face
    await expect(page.locator('[data-testid="sketch-toolbar"]')).toBeVisible();
  });
  
  test("trim tool workflow", async ({ page }) => {
    // Enter sketch mode and draw crossing lines
    // ...
    
    // Select trim tool
    await page.click('[data-testid="trim-tool"]');
    
    // Click on portion to trim
    const canvas = page.locator('[data-testid="viewer-canvas"]');
    await canvas.click({ position: { x: 150, y: 100 } });
    
    // Portion should be removed
    // Verify by checking entity count or visual state
  });
});

test.describe("Reference Geometry Workflow", () => {
  test("create offset plane", async ({ page }) => {
    await page.goto("/editor");
    
    // Select XY plane
    await page.click('[data-testid="feature-xy-plane"]');
    
    // Click "Add Offset Plane"
    await page.click('[data-testid="offset-plane-button"]');
    
    // Should show in feature tree
    await expect(page.locator('[data-testid="feature-offset-plane"]')).toBeVisible();
    
    // Modify offset in properties panel
    await page.fill('[data-testid="offset-distance-input"]', "15");
    await page.keyboard.press("Enter");
    
    // Plane should update in viewport
  });
});
```

---

### Test Fixtures

**File:** `packages/app/tests/fixtures/sketch-tool-harness.ts`

```typescript
/**
 * Test harness for simulating sketch tool interactions
 */

export function createTestSketchContext() {
  const doc = createDocument();
  const sketchResult = createSketch(doc, { planeRef: "xy" });
  const sketchId = sketchResult.value.featureId;
  
  return {
    doc,
    sketchId,
    sketch: {
      lines: [],
      arcs: [],
      circles: [],
      points: [],
      constraints: [],
    },
    tempStartPoint: null as { x: number; y: number } | null,
    chainLastEndpoint: null as { x: number; y: number; id: string } | null,
    activeTool: null as string | null,
    
    activateTool(tool: string) {
      this.activeTool = tool;
      this.tempStartPoint = null;
      this.chainLastEndpoint = null;
    },
    
    pressKey(key: string) {
      if (key === "Escape") {
        this.tempStartPoint = null;
        this.chainLastEndpoint = null;
      }
    },
  };
}

export function simulateSketchToolClick(
  ctx: ReturnType<typeof createTestSketchContext>,
  pos: { x: number; y: number },
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}
) {
  // Implement tool-specific click logic
  // This mirrors the actual tool handlers
}

export function simulateSketchToolRightClick(
  ctx: ReturnType<typeof createTestSketchContext>
) {
  ctx.chainLastEndpoint = null;
  ctx.tempStartPoint = null;
}
```

---

### Running Tests

```bash
# Unit tests (core package)
pnpm --filter @solidtype/core test

# Integration tests (app package)
pnpm --filter @solidtype/app test

# Visual regression tests
pnpm --filter @solidtype/app test:visual

# E2E tests
pnpm --filter @solidtype/app test:e2e

# All tests with coverage
pnpm test:coverage

# Watch mode during development
pnpm --filter @solidtype/app test --watch
```

---

### CI Pipeline

```yaml
# .github/workflows/test.yml
name: Phase 28 Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm --filter @solidtype/core test
      - run: pnpm --filter @solidtype/app test:unit

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm --filter @solidtype/app test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm exec playwright install
      - run: pnpm --filter @solidtype/app test:e2e
```

---

### Test Requirements Per Phase

| Phase | Required Tests |
|-------|----------------|
| 28.0 | Selection feedback visual tests, Sketch on Face workflow test |
| 28.1 | Plane calculation unit tests, plane command integration tests |
| 28.2 | Axis calculation unit tests, axis command integration tests |
| 28.3 | Tool state machine tests for each entity type |
| 28.4 | Geometry operation unit tests (trim, extend, offset) |
| 28.5 | Constraint solver tests for each constraint type |
| 28.6 | Inference detection unit tests |
| 28.7 | DOF calculation tests |
