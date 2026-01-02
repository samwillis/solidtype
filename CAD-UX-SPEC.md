# CAD Editor UX Specification

**A comprehensive implementation guide for SolidType's sketch and feature tools, designed to match professional CAD workflows (SOLIDWORKS-like).**

---

## Table of Contents

1. [Scope and Goals](#1-scope-and-goals)
2. [Global Interaction Model](#2-global-interaction-model)
3. [UI Structure](#3-ui-structure)
4. [Reference Geometry](#4-reference-geometry)
5. [Sketch Environment](#5-sketch-environment)
6. [Sketch Entities](#6-sketch-entities)
7. [Sketch Modify Tools](#7-sketch-modify-tools)
8. [Sketch Constraints](#8-sketch-constraints)
9. [Feature Tools Pattern](#9-feature-tools-pattern)
10. [Feature Tools Specifications](#10-feature-tools-specifications)
11. [Definition Helpers](#11-definition-helpers)
12. [Context Menus](#12-context-menus)
13. [Error Handling](#13-error-handling)
14. [Implementation Guide](#14-implementation-guide)
15. [UI Inventory](#15-ui-inventory)
16. [Selection Acceptance Matrix](#16-selection-acceptance-matrix)
17. [Implementation Priority](#17-implementation-priority)
18. [Codebase Architecture Map](#18-codebase-architecture-map)
19. [Current vs Target Gap Analysis](#19-current-vs-target-gap-analysis)
20. [Implementation Tasks](#20-implementation-tasks)
21. [Code Patterns](#21-code-patterns)
22. [Verification Checklists](#22-verification-checklists)
23. [Testing Strategy](#23-testing-strategy)
24. [Common Pitfalls](#24-common-pitfalls)
25. [Dependencies Between Tasks](#25-dependencies-between-tasks)
26. [3D Face and Edge Selection](#26-3d-face-and-edge-selection)

---

## 1. Scope and Goals

### 1.1 In Scope

> **Note:** Features are categorized by implementation phase. Status shows both kernel and app readiness.

**Legend:**

- ✅ = Fully implemented
- 🔧 = Partially implemented / needs work
- ❌ = Not implemented

#### 2D Sketching

| Feature                | Kernel | App | Notes                                                                                 |
| ---------------------- | ------ | --- | ------------------------------------------------------------------------------------- |
| Lines                  | ✅     | 🔧  | Creates lines with preview, but NO chain mode (each line is separate)                 |
| Arcs (3-point)         | ✅     | 🔧  | 3-click works, but NO preview arc while placing                                       |
| Circles                | ✅     | ❌  | Click twice to create, but NO preview circle, NO radius indicator, ~20% functional    |
| Rectangles             | ✅     | ❌  | **BROKEN**: Toolbar button creates fixed 4×3 rect at origin, tool mode has no preview |
| Point snapping         | ✅     | 🔧  | Snaps to points, but NO visual snap indicator                                         |
| Grid snapping          | —      | 🔧  | Basic grid snap, but NO grid lines visible in sketch mode                             |
| Coincident constraint  | ✅     | 🔧  | Menu button exists, **NOT TESTED** if it works correctly                              |
| Horizontal/Vertical    | ✅     | 🔧  | Menu button exists, **NOT TESTED** if it works correctly                              |
| Parallel/Perpendicular | ✅     | 🔧  | Menu button exists, **NOT TESTED** if it works correctly                              |
| Tangent                | ✅     | 🔧  | Menu button exists, **NOT TESTED**                                                    |
| Equal/Midpoint         | ✅     | 🔧  | Menu button exists, **NOT TESTED**                                                    |
| Distance dimension     | ✅     | 🔧  | Can create, but input UX is poor                                                      |
| Angle dimension        | ✅     | ❌  | Menu exists, **likely broken**                                                        |
| Inference lines (H/V)  | ❌     | ❌  | Not implemented                                                                       |
| Auto-constraints       | ❌     | ❌  | Not implemented                                                                       |
| Trim                   | ❌     | ❌  | Not implemented                                                                       |
| Extend                 | ❌     | ❌  | Not implemented                                                                       |
| Offset                 | ❌     | ❌  | Not implemented                                                                       |
| Splines                | ❌     | ❌  | Future                                                                                |
| Slots                  | ❌     | ❌  | Future                                                                                |
| Construction toggle    | ✅     | 🔧  | Button exists, **NOT TESTED**                                                         |

> **Reality check:** The constraint menu has buttons but most are **untested**.
> The `canApplyConstraint` logic may have bugs. Selection of appropriate entities is unclear.

#### Part Features (Solid + Surface)

| Feature               | Kernel | App | Notes                                                             |
| --------------------- | ------ | --- | ----------------------------------------------------------------- |
| Extrude (Blind)       | ✅     | 🔧  | Works, but preview may be inconsistent                            |
| Extrude (Through All) | ❌     | ❌  | Not implemented                                                   |
| Extrude (Up To Face)  | ❌     | ❌  | Not implemented                                                   |
| Extrude Cut           | ✅     | 🔧  | Works via boolean, UX clunky                                      |
| Revolve               | ✅     | 🔧  | Works, axis selection is confusing                                |
| Fillet                | ✅     | ❌  | **NO UI AT ALL** - no toolbar button, no dialog                   |
| Chamfer               | ✅     | ❌  | **NO UI AT ALL** - no toolbar button, no dialog                   |
| Boolean (Union)       | ✅     | 🔧  | Auto-selects last 2 bodies, not user-friendly                     |
| Boolean (Subtract)    | ✅     | 🔧  | Same as union                                                     |
| Boolean (Intersect)   | ✅     | 🔧  | Same as union                                                     |
| Face selection        | ✅     | ❌  | Click works but **NO UI FEEDBACK** - no "1 Face selected" message |
| Edge selection        | ❌     | ❌  | **NOT IMPLEMENTED** - blocks Fillet/Chamfer                       |
| Sketch on Face        | ✅     | ❌  | **REPORTED BROKEN** - face selection doesn't trigger sketch       |
| Mirror                | ❌     | ❌  | Future                                                            |
| Linear Pattern        | ❌     | ❌  | Future                                                            |
| Circular Pattern      | ❌     | ❌  | Future                                                            |
| Sweep                 | ❌     | ❌  | Future                                                            |
| Loft                  | ❌     | ❌  | Future                                                            |
| Shell                 | ❌     | ❌  | Future                                                            |
| Draft                 | ❌     | ❌  | Future                                                            |
| Rib                   | ❌     | ❌  | Future                                                            |
| Hole Wizard           | ❌     | ❌  | Future                                                            |
| Split Line            | ❌     | ❌  | Future                                                            |

> **Blocking issues:**
>
> - **Fillet/Chamfer**: Kernel ready, but NO app UI exists at all
> - **Edge selection**: Not implemented, blocks Fillet/Chamfer
> - **Face selection feedback**: Works internally, but user has NO indication it worked
> - **Sketch on Face**: Reported broken - needs investigation

#### Reference Geometry

| Feature                  | Kernel | App | Notes                                          |
| ------------------------ | ------ | --- | ---------------------------------------------- |
| Origin planes (XY/XZ/YZ) | ✅     | ✅  | Works, visible in tree and viewport            |
| Origin axes (X/Y/Z)      | ✅     | 🔧  | In tree, but visualization may be missing      |
| Offset plane             | ✅     | 🔧  | Can create, UX for specifying distance unclear |
| Plane from face          | ✅     | ❌  | **Blocked**: Face selection has no UI feedback |
| Midplane (2 faces)       | ❌     | ❌  | Not implemented                                |
| Angle plane              | ❌     | ❌  | Not implemented                                |
| 3-point plane            | ❌     | ❌  | Not implemented                                |
| Axis from edge           | ❌     | ❌  | **Blocked**: Edge selection not implemented    |
| Axis from 2 points       | ❌     | ❌  | Not implemented                                |

#### 3D Selection & Interaction

| Feature                          | Kernel | App | Notes                                                                                         |
| -------------------------------- | ------ | --- | --------------------------------------------------------------------------------------------- |
| Face hover highlight             | ✅     | 🔧  | Renders highlight, but subtle - easy to miss                                                  |
| Face click selection             | ✅     | ❌  | Click works internally, but **NO UI FEEDBACK** - user doesn't know it worked                  |
| Face multi-select                | ✅     | ❌  | Ctrl+click may work, but impossible to verify without UI feedback                             |
| Properties panel shows selection | —      | ❌  | **NO "Face selected" indicator** anywhere                                                     |
| Edge tessellation                | ❌     | ❌  | **NOT IN KERNEL** - needs to be added                                                         |
| Edge rendering                   | —      | ❌  | Blocked by tessellation                                                                       |
| Edge hover highlight             | —      | ❌  | Blocked by tessellation                                                                       |
| Edge click selection             | —      | ❌  | Blocked by tessellation                                                                       |
| Persistent naming                | 🔧     | 🔧  | Partial, uses unstable indices currently. See [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md) |

> **Critical UX gap:** User can click on faces, the system registers it internally,
> but there's **NO VISIBLE INDICATION** that anything was selected. This makes
> "Sketch on Face" impossible to use because users don't know if they selected a face.

#### Workflow Patterns

| Pattern                  | App | Notes                                                                 |
| ------------------------ | --- | --------------------------------------------------------------------- |
| Selection-first          | ❌  | Selection works but **NO FEEDBACK** - users can't see what's selected |
| PropertyManager panel    | 🔧  | Shows feature params, but NO selection info                           |
| Live preview             | 🔧  | Lines have preview; **Missing for**: circle, rectangle, arc           |
| In-canvas handles        | ❌  | Not implemented                                                       |
| Undo/Redo                | ✅  | Works via Yjs                                                         |
| Multi-user collaboration | ✅  | Works via Yjs                                                         |

> **Core UX problem:** The app has backend functionality but users can't **see**
> what's happening. No previews, no selection indicators, no feedback.

#### Body Types: Solid vs Surface

Following SolidWorks conventions, SolidType distinguishes between **Solid Bodies** and **Surface Bodies**:

| Body Type        | Description                    | Visual                                | Use Cases                                                |
| ---------------- | ------------------------------ | ------------------------------------- | -------------------------------------------------------- |
| **Solid Body**   | Watertight, enclosed volume    | Shaded, opaque                        | Machined parts, 3D printing, mass properties             |
| **Surface Body** | Open faces, no enclosed volume | Slightly transparent or colored edges | Complex shapes, imported geometry, intermediate modeling |

##### SolidWorks Behavior (Reference)

1. **Feature Tree Organization:**
   - Solid bodies appear under "Solid Bodies(n)" folder
   - Surface bodies appear under "Surface Bodies(n)" folder
   - Each body can be renamed, hidden, or deleted independently

2. **Creation:**
   - **Solid features** (Extrude, Revolve, Sweep, Loft) create solid bodies from closed profiles
   - **Surface features** (Extruded Surface, Revolved Surface, etc.) create surface bodies
   - Open sketch profiles create surfaces, closed profiles can create either

3. **Conversion:**
   - `Knit Surface` → combines surfaces into one, optionally creating solid if closed
   - `Thicken` → converts surface to solid by adding thickness
   - `Delete Face` with "Delete and Fill" → can convert solid to surface

4. **Boolean Operations:**
   - Solids can be combined, subtracted, intersected with other solids
   - Surfaces can be trimmed, extended, knitted with other surfaces
   - `Combine` feature works only on solid bodies

5. **Visual Distinction:**
   - Solid bodies: standard shading, thick black edges
   - Surface bodies: often shown with colored edges (orange in SW), slightly transparent

##### SolidType Implementation

| Feature               | Kernel | App | Notes                                              |
| --------------------- | ------ | --- | -------------------------------------------------- |
| Solid body creation   | ✅     | 🔧  | Extrude/Revolve create solids from closed profiles |
| Surface body creation | ❌     | ❌  | No surface-specific features yet                   |
| Body type detection   | ✅     | ❌  | Kernel has `isShellClosed()`, app doesn't display  |
| Body folder in tree   | —      | ❌  | No "Solid Bodies(n)" / "Surface Bodies(n)" folders |
| Visual distinction    | —      | ❌  | All bodies rendered identically                    |
| Thicken surface       | ❌     | ❌  | Future                                             |
| Knit surfaces         | ❌     | ❌  | Future                                             |

**Kernel Implementation:**

```typescript
// In TopoModel.ts - shells have closed flag
addShell(closed: boolean = false): ShellId;
isShellClosed(id: ShellId): boolean;

// A body is "solid" if ALL its shells are closed
// A body is "surface" if ANY shell is open
```

##### Required UX Work

1. **Bodies Section (separate panel, flat list):**
   - Show all bodies in single flat list (no subgroups)
   - Each body row: name, visibility toggle, color swatch, type badge [Solid]/[Surface]
   - Body selection highlights in viewport and cross-links to Features section

2. **Features Section (separate panel, flat list):**
   - Origin planes as flat list at top (no nesting)
   - Each feature shows which body(s) it affects: `Extrude1 → Body 1`
   - Selecting feature highlights associated body in Bodies section

3. **Properties Panel:**
   - When body selected: show "Type: Solid" or "Type: Surface"
   - Show volume (for solids), surface area, bounding box

4. **Viewport:**
   - Solid bodies: opaque shading, dark edges
   - Surface bodies: edge color tint (e.g., orange), optional transparency
   - Add display mode: "Shaded with Edges" vs "Shaded" vs "Wireframe"

5. **Feature Behavior:**
   - Extrude from closed profile → Solid body
   - Extrude from open profile → **Should create Surface body** (currently fails?)
   - Boolean operations → validate both operands are solids
   - Error message if trying to boolean with surface body

6. **Multi-Body Support:**
   - Features can affect specific bodies (merge scope)
   - "Merge result" checkbox on Boss features
   - Body selection for Cut operations

##### Open Profile Handling (Critical Gap)

Currently, if a user draws an open profile (e.g., an arc) and tries to extrude:

| Current Behavior    | Target Behavior (SolidWorks-like)        |
| ------------------- | ---------------------------------------- |
| ❌ Fails with error | ✅ Creates surface body                  |
| User is stuck       | User can continue modeling with surfaces |

**Implementation Note:**

- Kernel `extrude()` requires closed profiles for solid bodies
- Need to add "extruded surface" variant for open profiles
- This creates a ruled surface through the profile curve

### 1.1.1 Scope Governance

This UX spec **supersedes** documents in `/plan/*` for UX direction. However:

1. **Kernel parity required:** Do not implement UX for features the kernel doesn't support
2. **Future sections:** Sections marked "Future" describe target behavior for later phases
3. **Graceful degradation:** If a feature is partially supported, document limitations in UI

### 1.2 Success Criteria

| Criterion                | Description                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reliable References**  | Axes and planes can be defined in multiple ways without dead ends. See [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md) for persistent naming. |
| **Clear Tool Contracts** | Every tool has clear required inputs, predictable click sequences                                                                             |
| **Visual Feedback**      | Visible preview and direction handles on all operations                                                                                       |
| **Consistent UX**        | Same confirm/cancel patterns across all tools                                                                                                 |
| **Muscle Memory**        | Inference cues, auto-relations, tangent arc gestures, power trim                                                                              |

---

## 2. Global Interaction Model

### 2.1 Application Modes

| Mode               | Description      | Available Tools                                            |
| ------------------ | ---------------- | ---------------------------------------------------------- |
| **Model Mode**     | No active sketch | Selection, feature creation, reference geometry            |
| **Sketch Mode**    | Editing a sketch | Sketch tools active, model entities selectable via filters |
| **Command Active** | Any tool running | Tool captures input, selection boxes accept picks          |

### 2.2 Confirmation and Cancellation

| Action       | Key/Button   | Effect                               |
| ------------ | ------------ | ------------------------------------ |
| Accept       | `Enter` / ✅ | Commit feature or finish sketch tool |
| Cancel       | `Esc` / ❌   | Revert preview, exit tool            |
| Context Menu | Right-click  | Show context options + OK/Cancel     |

#### Right-Click Precedence Rules

Right-click behavior depends on context. Priority order (highest first):

| Priority | Context                                         | Right-Click Behavior                        |
| -------- | ----------------------------------------------- | ------------------------------------------- |
| 1        | **Sketch tool chaining** (line/arc in progress) | End chain (stay in tool, clear start point) |
| 2        | **Second right-click** after chain end          | Show sketch context menu                    |
| 3        | **Entity selected**                             | Show entity context menu                    |
| 4        | **Empty canvas**                                | Show global context menu                    |

**Example flow for line chain:**

1. Click point A → Click point B → line created, chaining from B
2. Right-click → chain ends (no line from B), still in line tool
3. Right-click again → context menu appears
4. Click elsewhere → new chain starts from new point

### 2.3 Selection Model

#### Preselection Support

If user selects valid inputs (sketch, face, edge, axis) before starting tool:

- Tool auto-fills appropriate selection boxes
- Reduces clicks for common workflows

#### In-Command Selection

- Tool shows selection boxes (Profile, Axis, Direction)
- Valid pick candidates highlighted in viewport
- Focused selection box determines filtering

#### Selection Filters (Toggles)

| Filter          | Entities                   |
| --------------- | -------------------------- |
| Faces           | All face types             |
| Edges           | All edge types             |
| Vertices        | Points and vertices        |
| Sketch Entities | Lines, arcs, circles, etc. |
| Sketch Regions  | Closed contours            |
| Planes          | Reference planes           |
| Axes            | Reference axes             |
| Bodies          | Solid and surface bodies   |

#### Selection Priority

1. Prefer entity types the focused selection box accepts
2. Allow cycle selection (`Tab`) through candidates under cursor
3. `Ctrl+Click` to toggle selection
4. `Shift+Click` to add to selection

### 2.4 Inference and Snapping (Sketch)

#### Snap Targets

| Target                 | Description                            |
| ---------------------- | -------------------------------------- |
| Endpoints              | Start/end of lines and arcs            |
| Midpoints              | Center of line segments                |
| Centers                | Circle and arc centers                 |
| Quadrants              | 0°, 90°, 180°, 270° on circles         |
| Intersections          | Real and inferred crossing points      |
| H/V Alignment          | Horizontal/vertical to existing points |
| Collinear              | Along existing line direction          |
| Parallel/Perpendicular | To existing entities                   |
| Tangent                | To arcs and circles                    |
| Point-on-Curve         | Anywhere on a curve                    |

#### Inference UX Requirements

| Requirement      | Implementation                                                         |
| ---------------- | ---------------------------------------------------------------------- |
| Visual Cues      | Dashed inference lines, snap glyphs at cursor                          |
| Relation Preview | Show glyph ("Tangent", "Horizontal", "Coincident")                     |
| Hysteresis       | Once relation appears, don't flicker off until cursor leaves tolerance |
| Intent Zones     | Special areas around endpoints for tangent-arc gesture                 |

### 2.5 Relations/Constraints (Sketch)

- Relations are **first-class objects**:
  - Visible as small glyphs on entities
  - Inspectable in relations panel
- Created via:
  - **Auto-relations** on placement (configurable)
  - **Add Relations** tool (explicit)
- **Delete/disable**:
  - Context menu on relation glyph
  - Display/Delete Relations panel for bulk management

### 2.6 Live Preview Pipeline

Preview must update on:

- Each selection change
- Each numeric input change
- Drag of in-canvas manipulator

Preview degradation:

- If kernel compute is expensive, show approximate preview then refine

---

## 3. UI Structure

### 3.1 CommandManager Tabs (Top Toolbar)

#### Sketch Tab

| Group           | Tools                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sketch Entities | Line flyout, Rectangle flyout, Circle flyout, Arc flyout, Slot flyout, Spline                                            |
| Other Entities  | Point, Text, Sketch Picture, Polygon                                                                                     |
| Modify          | Smart Dimension, Add Relations, Trim, Extend, Offset, Convert, Mirror, Linear Pattern, Circular Pattern, Fillet, Chamfer |

#### Features Tab

| Group           | Tools                                                             |
| --------------- | ----------------------------------------------------------------- |
| Boss/Cut        | Extrude, Revolve, Sweep, Loft                                     |
| Modify          | Fillet, Chamfer, Draft, Shell, Rib                                |
| Patterns/Mirror | Linear Pattern, Circular Pattern, Mirror                          |
| Holes           | Hole Wizard                                                       |
| Booleans        | Combine                                                           |
| Curves/Faces    | Split Line                                                        |
| Surfaces        | Extruded Surface, Revolved Surface, Swept Surface, Lofted Surface |

#### Reference Geometry Tab

| Tools                                     |
| ----------------------------------------- |
| Plane, Axis, (Point), (Coordinate System) |

### 3.2 Flyout Menus

| Flyout        | Options                                                      |
| ------------- | ------------------------------------------------------------ |
| **Rectangle** | Corner, Center, 3-Point Corner, 3-Point Center               |
| **Circle**    | Centerpoint, Perimeter/3-Point                               |
| **Arc**       | 3-Point, Centerpoint, Tangent                                |
| **Slot**      | Straight, Centerpoint Straight, 3-Point Arc, Centerpoint Arc |
| **Line**      | Line, Centerline, Construction Line                          |
| **Trim**      | Power Trim, Trim to Closest, Corner                          |

### 3.3 Essential Gestures

| Gesture                | Behavior                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Line ↔ Tangent Arc** | While line tool active, moving into endpoint intent zone switches to tangent arc preview |
| **Power Trim**         | Click-drag across segments to trim continuously                                          |
| **Handle Drag**        | Drag feature arrows/handles to adjust direction/extent                                   |

---

## 4. Reference Geometry

### 4.1 Plane Tool

**Goal:** Single tool that creates planes from many reference combinations.

#### PropertyManager Structure

```
┌─────────────────────────────────┐
│ Plane                           │
├─────────────────────────────────┤
│ Reference 1: [Select...]        │
│ Reference 2: [Select...] (opt)  │
│ Reference 3: [Select...] (opt)  │
├─────────────────────────────────┤
│ Type: [Auto-detect ▼]           │
│   • Offset                      │
│   • Midplane                    │
│   • Angle                       │
│   • 3-Point                     │
│   • Tangent                     │
├─────────────────────────────────┤
│ Offset Distance: [____] mm      │
│ Angle: [____]°                  │
│ [Flip Normal] [Reverse]         │
├─────────────────────────────────┤
│        [✓ OK]  [✗ Cancel]       │
└─────────────────────────────────┘
```

#### Accepted References

| Reference Type | Accepted Entities                              |
| -------------- | ---------------------------------------------- |
| Planar surface | `FacePlanar`, `PlaneRef`                       |
| Linear entity  | `EdgeLinear`, `AxisRef`, `SketchLine`          |
| Point          | `Vertex`, `SketchPoint`                        |
| Curved surface | `FaceCylindrical`, `FaceConical` (for tangent) |

#### Mode Detection Rules

| Selection                     | Detected Mode                        |
| ----------------------------- | ------------------------------------ |
| One planar face/plane         | **Offset** (distance=0 initially)    |
| Two planar faces/planes       | **Midplane**                         |
| Three points/vertices         | **3-Point**                          |
| Plane + linear entity         | **Angle** (angle=0 initially)        |
| Cylindrical face + plane/edge | **Tangent** (oriented by second ref) |

#### UX Requirements

- Highlight valid picks for each reference slot
- Always show preview once sufficient refs exist
- Provide **Flip** and numeric inputs
- Quick creation: `Ctrl+Drag` existing plane creates offset (optional enhancement)

### 4.2 Axis Tool

#### PropertyManager Structure

```
┌─────────────────────────────────┐
│ Axis                            │
├─────────────────────────────────┤
│ Definition: [Auto-detect ▼]     │
│   • Single linear entity        │
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

#### Accepted References

| Method        | Accepted Entities                                     |
| ------------- | ----------------------------------------------------- |
| Single linear | `SketchLine`, `EdgeLinear`, `AxisRef`                 |
| Two points    | `Vertex`, `SketchPoint`                               |
| Two planes    | `PlaneRef`, `FacePlanar`                              |
| Cylinder/Cone | `FaceCylindrical`, `FaceConical` → creates `TempAxis` |

#### Axis Acceptance in Other Tools

Any feature field requiring "Axis" must accept:

- Reference axis
- Temporary axis
- Linear edge
- Sketch centerline

---

## 5. Sketch Environment

### 5.1 Entering Sketch Mode

**Entry Points:**

1. Click **Sketch** then select plane/planar face
2. Preselect plane/face then click **Sketch**

**On Entry:**

- Orient view normal to sketch plane
- Show sketch origin and axes (optional)
- Enable sketch inference and constraints
- Set default tool to Line

### 5.2 Sketch Status Indicators

| Status        | Color         | Description             |
| ------------- | ------------- | ----------------------- |
| Under-defined | Blue          | Geometry can still move |
| Fully defined | Black/Green   | All DOF constrained     |
| Construction  | Dashed Orange | Reference geometry only |
| Over-defined  | Red           | Conflicting constraints |

### 5.3 Sketch Tool State Machine Pattern

Every sketch entity tool follows:

```
┌──────────────────────────────────────────────┐
│ S0: Activate Tool                            │
│     └─→ Show HUD prompt: "Select first point"│
└──────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ S1: Hover                                    │
│     └─→ Show preview + inference             │
└──────────────────────────────────────────────┘
              │
              ▼ (Click)
┌──────────────────────────────────────────────┐
│ S2: Commit Point/Segment                     │
│     └─→ Apply auto-relations                 │
└──────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ S3: Continue Chain or Complete               │
│     ├─→ Continue → back to S1                │
│     ├─→ Double-click → end chain             │
│     ├─→ Enter → accept                       │
│     └─→ Esc → cancel                         │
└──────────────────────────────────────────────┘
```

---

## 6. Sketch Entities

### 6.1 Line / Centerline / Construction

#### States

| State | Description                                |
| ----- | ------------------------------------------ |
| S0    | Waiting for first point                    |
| S1    | Placing next point in chain (with preview) |

#### Point Placement Accepts

- Free space → creates new point
- Existing point/vertex → coincident constraint
- Point on entity → creates point-on-curve + coincident

#### Auto-Relations on Placement

| Condition                       | Relation Created |
| ------------------------------- | ---------------- |
| Near horizontal                 | Horizontal       |
| Near vertical                   | Vertical         |
| Aligned with existing line      | Collinear        |
| Near perpendicular to reference | Perpendicular    |
| Near parallel to reference      | Parallel         |
| Snapping to endpoint            | Coincident       |

#### Chain Behavior

- After placing second point, remain in S1 to continue polyline
- End chain via: double-click, right-click "End Chain", or `Esc`

#### Line ↔ Tangent Arc Gesture

When current point is an endpoint of an arc/circle or line:

- Moving cursor into "arc intent zone" → shows tangent arc preview
- Moving away → shows line preview
- Click commits whichever preview is active

### 6.2 Rectangle Flyout

#### Corner Rectangle

| Step | Action         |
| ---- | -------------- |
| 1    | Click corner 1 |
| 2    | Click corner 2 |

**Auto-relations:** H/V edges, perpendicular corners

#### Center Rectangle

| Step | Action       |
| ---- | ------------ |
| 1    | Click center |
| 2    | Click corner |

#### 3-Point Corner Rectangle

| Step | Action                            |
| ---- | --------------------------------- |
| 1    | Click corner A                    |
| 2    | Click corner B (defines one edge) |
| 3    | Click third point (defines width) |

#### 3-Point Center Rectangle

| Step | Action                              |
| ---- | ----------------------------------- |
| 1    | Click center                        |
| 2    | Click point (half-length direction) |
| 3    | Click point (half-width)            |

### 6.3 Circle Flyout

#### Centerpoint Circle

| Step | Action                   |
| ---- | ------------------------ |
| 1    | Click center             |
| 2    | Click/drag to set radius |

#### 3-Point Circle

| Step | Action        |
| ---- | ------------- |
| 1    | Click point 1 |
| 2    | Click point 2 |
| 3    | Click point 3 |

### 6.4 Arc Flyout

#### 3-Point Arc

| Step | Action                 | Auto-Relations                      |
| ---- | ---------------------- | ----------------------------------- |
| 1    | Click start            | Coincident (if snapping)            |
| 2    | Click end              | Coincident (if snapping)            |
| 3    | Click/drag bulge point | Tangent (if near tangent condition) |

#### Centerpoint Arc

| Step | Action                          |
| ---- | ------------------------------- |
| 1    | Click center                    |
| 2    | Click start point (sets radius) |
| 3    | Click end point (sets angle)    |

#### Tangent Arc

**Entry paths:**

1. **Explicit Tangent Arc tool:**
   - Click existing endpoint (must be connected to curve/line)
   - Hover shows tangent arc preview
   - Click to place end

2. **Implicit during Line tool:**
   - At endpoint, hover into arc intent zone
   - Preview becomes tangent arc
   - Click to place

**Tangency direction fix:**

- Context menu: "Reverse Endpoint Tangent" (flips tangent direction)

### 6.5 Slot Flyout

#### Straight Slot

| Step | Action                            |
| ---- | --------------------------------- |
| 1    | Click end 1                       |
| 2    | Click end 2                       |
| 3    | Set width (drag/click or numeric) |

**Creates:** 2 lines + 2 end arcs + optional centerline

#### Centerpoint Straight Slot

| Step | Action                       |
| ---- | ---------------------------- |
| 1    | Click center                 |
| 2    | Click length direction point |
| 3    | Set width                    |

#### 3-Point Arc Slot

| Step | Action                        |
| ---- | ----------------------------- |
| 1    | Define arc via 3-point method |
| 2    | Set width                     |

#### Centerpoint Arc Slot

| Step | Action                            |
| ---- | --------------------------------- |
| 1    | Define arc via centerpoint method |
| 2    | Set width                         |

### 6.6 Spline

| Step | Action                         |
| ---- | ------------------------------ |
| 1+   | Click to place control points  |
| End  | Right-click or Enter to finish |

**Editing:**

- Control points draggable
- Tangent handles visible at endpoints
- Relations allowed: coincident, tangent, curvature, H/V handles

### 6.7 Point

- Single click places point
- If placed on entity: creates point-on-curve relation

### 6.8 Text

- Click to place text box
- Type content
- Optional: text on curve (select path)

### 6.9 Sketch Picture

- Insert image
- Manipulators: move, rotate, scale
- Optional calibration (set known distance)

---

## 7. Sketch Modify Tools

### 7.1 Smart Dimension

#### Selection Logic

| Selection            | Dimension Type                |
| -------------------- | ----------------------------- |
| 1 line               | Length                        |
| 1 arc/circle         | Radius/diameter (toggle)      |
| 2 points             | Distance                      |
| Point + line         | Perpendicular distance        |
| 2 parallel lines     | Distance                      |
| 2 non-parallel lines | Angle                         |
| Circle + line        | Distance to center or tangent |

#### Workflow

1. Select entity(ies)
2. Move mouse to preview dimension placement
3. Click to place
4. (Optional) Type value immediately

#### Driven vs Driving

- Allow toggling dimension to "driven/reference" if over-constraining

### 7.2 Add Relations

1. User selects entities/points
2. Panel shows valid relations (enabled based on selection)
3. Click relation to create constraint
4. Preview updates immediately

### 7.3 Display/Delete Relations

1. Select entity → shows its relations list
2. Hover relation → highlights related entities
3. Delete one or multiple
4. Supports bulk deletion

### 7.4 Trim Entities

| Mode                    | Behavior                                                 |
| ----------------------- | -------------------------------------------------------- |
| **Power Trim**          | Drag across segments; trim continuously                  |
| **Trim to Closest**     | Click segment portion to remove to nearest intersections |
| **Corner**              | Select two entities → trims/extends to meet at corner    |
| **Trim Inside/Outside** | (Optional advanced)                                      |

### 7.5 Extend Entities

- Select entity end → extend to next boundary (nearest intersection)

### 7.6 Offset Entities

1. Select chain/loop (auto-chain selection)
2. Enter distance
3. Choose side (flip)
4. Preview offset curve
5. Optional: cap ends for open chains

### 7.7 Convert Entities

- In sketch mode: select model edges/loops/faces
- Creates sketch entities projected to sketch plane
- Maintains associative link (recommended)

### 7.8 Mirror Entities (Sketch)

1. Select entities to mirror
2. Select mirror line/centerline
3. Creates mirrored copies with symmetric relations

### 7.9 Sketch Patterns

#### Linear Sketch Pattern

1. Select entities
2. Set direction (edge/line)
3. Set spacing and count

#### Circular Sketch Pattern

1. Select entities
2. Set center/axis
3. Set angle and count

### 7.10 Sketch Fillet

1. Select corner or 2 entities
2. Set radius
3. Preview tangent arc + trims
4. Confirm

### 7.11 Sketch Chamfer

1. Select corner or 2 entities
2. Set distances or angle
3. Preview
4. Confirm

---

## 8. Sketch Constraints

### 8.1 Core Constraints (Must-Have)

| Constraint        | Description                               |
| ----------------- | ----------------------------------------- |
| **Coincident**    | Point-point, point-curve                  |
| **Horizontal**    | Entity or point pair aligned horizontally |
| **Vertical**      | Entity or point pair aligned vertically   |
| **Parallel**      | Two lines same direction                  |
| **Perpendicular** | Two lines at 90°                          |
| **Collinear**     | Two lines on same infinite line           |
| **Tangent**       | Smooth connection between curves          |
| **Concentric**    | Circles/arcs share center                 |
| **Equal**         | Length or radius equality                 |
| **Midpoint**      | Point at midpoint of line                 |
| **Symmetric**     | Points symmetric about axis               |
| **Fix**           | Lock position/angle                       |
| **Merge Points**  | Explicitly merge endpoints                |

### 8.2 Advanced Constraints (Future)

| Constraint               | Description                        |
| ------------------------ | ---------------------------------- |
| **Curvature Continuity** | Smooth curvature at spline joints  |
| **Pierce/Intersection**  | For 3D sketches or sweep workflows |

---

## 9. Feature Tools Pattern

### 9.1 Universal PropertyManager Structure

```
┌─────────────────────────────────┐
│ [Feature Name]                  │
├─────────────────────────────────┤
│ Selection Boxes                 │
│ ┌─────────────────────────────┐ │
│ │ Profile: [Select...] *      │ │
│ │ Axis: [Select...] *         │ │
│ │ Direction: [Select...]      │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ Parameters                      │
│ ┌─────────────────────────────┐ │
│ │ End Condition: [Blind ▼]    │ │
│ │ Depth: [10] mm              │ │
│ │ Draft: [_]°                 │ │
│ │ [□] Thin Feature            │ │
│ │ [Flip Direction]            │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│        [✓ OK]  [✗ Cancel]       │
└─────────────────────────────────┘
(* = required)
```

### 9.2 In-Viewport Elements

| Element              | Behavior                            |
| -------------------- | ----------------------------------- |
| Preview body/surface | Shows result geometry               |
| Direction arrows     | Drag to change depth, click to flip |
| On-handle dimension  | Edit value directly on manipulator  |

### 9.3 Reference Acceptance Rules

| Field Type    | Accepts                                                           |
| ------------- | ----------------------------------------------------------------- |
| **Plane**     | Planar faces, planes, reference planes                            |
| **Axis**      | Sketch lines/centerlines, linear edges, reference axes, temp axes |
| **Direction** | Linear edge, axis, sketch line, planar face normal                |

### 9.4 Validation Rules

| Condition                   | Behavior                                  |
| --------------------------- | ----------------------------------------- |
| Required selections missing | Disable OK, show prompt                   |
| Geometry fails              | Show error with highlight, keep tool open |
| Self-intersection           | Highlight problem area, show suggestion   |

### 9.5 Multi-Body and Body Type Handling

#### Body Type Determination

| Profile Type                        | Feature          | Result           |
| ----------------------------------- | ---------------- | ---------------- |
| **Closed** (rectangle, closed loop) | Extrude/Revolve  | **Solid Body**   |
| **Open** (line, arc, open chain)    | Extrude/Revolve  | **Surface Body** |
| **Closed**                          | Extruded Surface | **Surface Body** |
| **Open**                            | Extruded Surface | **Surface Body** |

#### Merge Scope (SolidWorks-like)

When creating a new boss feature, the PropertyManager includes merge options:

| Option                      | Behavior                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| **Merge result** (checkbox) | ON: Union with intersecting solid bodies; OFF: Create separate body |
| **Selected bodies** (list)  | When merge is ON, select which bodies to merge with                 |

```
┌─────────────────────────────────────────┐
│ Result Options                          │
├─────────────────────────────────────────┤
│ ☑ Merge result                          │
│                                         │
│ Bodies to merge:                        │
│ ┌─────────────────────────────────────┐ │
│ │ ☑ Solid Body (1)                    │ │
│ │ ☑ Solid Body (2)                    │ │
│ │ ☐ Solid Body (3)                    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

#### Feature Applicability by Body Type

| Feature           | Solid Bodies      | Surface Bodies | Notes                            |
| ----------------- | ----------------- | -------------- | -------------------------------- |
| Extrude Boss      | ✅ Creates/merges | ❌ N/A         | Target must be solid             |
| Extrude Cut       | ✅                | ❌             | Cut requires solid target        |
| Extruded Surface  | —                 | ✅ Creates     | Always creates surface           |
| Fillet            | ✅                | ❌             | Solid only                       |
| Chamfer           | ✅                | ❌             | Solid only                       |
| Shell             | ✅                | ❌             | Solid only                       |
| Boolean (Combine) | ✅                | ❌             | Both operands must be solid      |
| Thicken           | —                 | ✅ → Solid     | Converts surface to solid        |
| Knit Surface      | —                 | ✅             | Joins surfaces, can create solid |
| Trim Surface      | —                 | ✅             | Surface only                     |
| Extend Surface    | —                 | ✅             | Surface only                     |

#### Cut Feature Body Selection

For Cut operations (Extrude Cut, Revolve Cut):

```
┌─────────────────────────────────────────┐
│ Cut Options                             │
├─────────────────────────────────────────┤
│ Feature Scope:                          │
│ ○ All bodies                            │
│ ● Selected bodies                       │
│                                         │
│ Bodies to cut:                          │
│ ┌─────────────────────────────────────┐ │
│ │ ☑ Solid Body (1)                    │ │
│ │ ☐ Solid Body (2)  ← won't be cut    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ☐ Auto-select  (select intersecting)    │
└─────────────────────────────────────────┘
```

#### Error Messages

| Situation                      | Error Message                                            |
| ------------------------------ | -------------------------------------------------------- |
| Open profile with Extrude Boss | "Profile is open. Create an Extruded Surface instead?"   |
| Boolean with surface body      | "Combine requires solid bodies. Convert to solid first." |
| Fillet on surface body         | "Fillet applies to solid bodies only."                   |
| No closed region in sketch     | "No closed contour found. Check for gaps."               |

#### Implementation Status

| Feature                | Kernel | App | Notes                                           |
| ---------------------- | ------ | --- | ----------------------------------------------- |
| Closed profile → solid | ✅     | 🔧  | Works but error handling poor                   |
| Open profile → surface | ❌     | ❌  | **Currently fails** instead of creating surface |
| Merge result checkbox  | ❌     | ❌  | Not implemented                                 |
| Body scope selection   | ❌     | ❌  | Not implemented                                 |
| Body type display      | ✅     | ❌  | `isShellClosed()` exists, no UI                 |

---

## 10. Feature Tools Specifications

### 10.1 Extrude Boss/Base and Cut

#### Selection Boxes

| Box           | Accepts                                   | Multiplicity |
| ------------- | ----------------------------------------- | ------------ |
| Profile       | `SketchRegion`, `SketchContour`, `Sketch` | Multi        |
| Direction     | `FacePlanar` (optional)                   | Single       |
| Up To Surface | `Face*`                                   | Single       |

#### End Conditions

| Condition           | Parameters             |
| ------------------- | ---------------------- |
| Blind               | Distance               |
| Through All         | None                   |
| Up To Next          | None                   |
| Up To Surface       | Face selection         |
| Offset From Surface | Face + offset distance |
| Midplane            | Distance (symmetric)   |

#### Multi-Body Options (Boss only)

| Option          | Default | Description                      |
| --------------- | ------- | -------------------------------- |
| Merge result    | ☑ ON    | Combine with intersecting bodies |
| Selected bodies | Auto    | Which bodies to merge into       |
| New body        | OFF     | Force creation of separate body  |

#### Cut Options

| Option        | Default    | Description                              |
| ------------- | ---------- | ---------------------------------------- |
| Feature Scope | All bodies | Which bodies to cut                      |
| Auto-select   | ☑ ON       | Automatically select intersecting bodies |

#### Profile Type Handling

| Profile        | Feature Type     | Result                              |
| -------------- | ---------------- | ----------------------------------- |
| Closed contour | Extrude Boss     | Solid body (merged or new)          |
| Open contour   | Extrude Boss     | ❌ Error → suggest Extruded Surface |
| Closed contour | Extruded Surface | Surface body                        |
| Open contour   | Extruded Surface | Surface body (ruled surface)        |

#### Interaction Flow

1. Preselect sketch (optional)
2. Activate Extrude
3. Auto-fill Profile if possible; otherwise user selects regions
4. Show arrow + depth handle
5. Choose end condition, supply refs
6. If Boss: choose merge options
7. If Cut: choose body scope
8. OK

### 10.2 Revolve Boss/Base and Cut

#### Selection Boxes

| Box     | Accepts                                           | Multiplicity |
| ------- | ------------------------------------------------- | ------------ |
| Profile | `SketchRegion`, `SketchContour`                   | Multi        |
| Axis    | `SketchLine`, `EdgeLinear`, `AxisRef`, `TempAxis` | Single       |

#### Parameters

- Angle (default 360°)
- Direction 2 (optional)
- Thin feature (optional)

#### Auto-Propose Axis

If sketch contains single centerline marked construction → auto-propose as axis (non-destructive, user can change)

### 10.3 Sweep Boss/Cut and Surface

#### Selection Boxes

| Box          | Accepts                         | Multiplicity | Chain |
| ------------ | ------------------------------- | ------------ | ----- |
| Profile      | `SketchRegion`, `SketchContour` | Single       | No    |
| Path         | `SketchCurve`, `EdgeCurve`      | Single       | Yes   |
| Guide Curves | Curve chains                    | Multi        | Yes   |

#### Parameters

- Orientation/twist type
- Keep normal constant (optional)
- Merge result

### 10.4 Loft Boss/Cut and Surface

#### Selection Boxes

| Box          | Accepts                         | Multiplicity  |
| ------------ | ------------------------------- | ------------- |
| Profiles     | `SketchRegion`, `SketchContour` | Ordered Multi |
| Guide Curves | Curve chains                    | Multi         |
| Centerline   | Curve                           | Single        |

#### Parameters

- Start/end constraints: None, Tangent, Curvature
- Tangent length handles (visual)
- Merge result

### 10.5 Rib

#### Selection Boxes

| Box       | Accepts                                | Multiplicity      |
| --------- | -------------------------------------- | ----------------- |
| Profile   | Open `SketchContour`                   | Single            |
| Direction | `FacePlanar`, `PlaneRef`, `EdgeLinear` | Single (optional) |

#### Parameters

- Thickness
- Both sides toggle
- Draft angle
- Normal to sketch / Parallel to sketch

### 10.6 Shell

#### Selection Boxes

| Box             | Accepts | Multiplicity     |
| --------------- | ------- | ---------------- |
| Faces to Remove | `Face*` | Multi (optional) |

#### Parameters

- Thickness
- Multi-thickness faces (advanced)

### 10.7 Draft (Neutral Plane)

#### Selection Boxes

| Box            | Accepts                          | Multiplicity |
| -------------- | -------------------------------- | ------------ |
| Neutral Plane  | `PlaneRef`, `FacePlanar`         | Single       |
| Pull Direction | `Face*`, `AxisRef`, `EdgeLinear` | Single       |
| Faces to Draft | `Face*`                          | Multi        |

#### Parameters

- Draft angle
- Flip direction

### 10.8 Hole Wizard

**Two-Stage Workflow:** "What" then "Where"

#### Type Stage (What)

- Standard (ISO/ANSI)
- Hole type: simple, counterbore, countersink, tapped
- Size, depth

#### Positions Stage (Where)

1. Select target face
2. Enter placement sketch mode
3. Click to place hole points
4. Dimension/constrain points
5. Confirm and OK

### 10.9 Fillet

#### Selection Boxes

| Box   | Accepts | Multiplicity     |
| ----- | ------- | ---------------- |
| Edges | `Edge*` | Multi            |
| Faces | `Face*` | Multi (optional) |

#### Parameters

- Radius
- Tangent propagation toggle

#### Full Round Fillet (Optional)

- Side face set 1
- Middle face set
- Side face set 2

### 10.10 Chamfer

#### Selection Boxes

| Box    | Accepts  | Multiplicity      |
| ------ | -------- | ----------------- |
| Edges  | `Edge*`  | Multi             |
| Vertex | `Vertex` | Single (optional) |

#### Parameters

- Mode: distance-distance, angle-distance
- Values
- Flip direction

### 10.11 Mirror

#### Selection Boxes

| Box                   | Accepts                     | Multiplicity |
| --------------------- | --------------------------- | ------------ |
| Mirror Plane          | `PlaneRef`, `FacePlanar`    | Single       |
| Features/Bodies/Faces | `Feature`, `Body*`, `Face*` | Multi        |

### 10.12 Linear Pattern

#### Selection Boxes

| Box         | Accepts                               | Multiplicity | Chain |
| ----------- | ------------------------------------- | ------------ | ----- |
| Direction 1 | `EdgeLinear`, `AxisRef`, `SketchLine` | Single       | No    |
| Direction 2 | Same as Direction 1                   | Single       | No    |
| Seed        | `Feature`, `Face*`, `Body*`           | Multi        | No    |

#### Parameters

- Spacing 1, Count 1
- Spacing 2, Count 2
- Instances to skip (interactive mode)

### 10.13 Circular Pattern

#### Selection Boxes

| Box  | Accepts                                           | Multiplicity |
| ---- | ------------------------------------------------- | ------------ |
| Axis | `AxisRef`, `TempAxis`, `EdgeLinear`, `SketchLine` | Single       |
| Seed | `Feature`, `Face*`, `Body*`                       | Multi        |

#### Parameters

- Count
- Angle (default 360°)
- Equal spacing toggle

### 10.14 Combine (Multibody Boolean)

#### Modes

| Mode               | Selection                                |
| ------------------ | ---------------------------------------- |
| Add (Union)        | Bodies (multi)                           |
| Subtract           | Main body (single) + Tool bodies (multi) |
| Common (Intersect) | Bodies (≥2)                              |

### 10.15 Split Line (Projection)

#### Selection Boxes

| Box            | Accepts                 | Multiplicity |
| -------------- | ----------------------- | ------------ |
| Sketch         | `Sketch`, `SketchCurve` | Single/Multi |
| Faces to Split | `Face*`                 | Multi        |

---

## 11. Definition Helpers

### 11.1 Inline Reference Creation

Next to any Plane/Axis selection box:

- Small **"+"** button opens plane/axis creation dialog
- On OK, returns to feature tool with reference filled

### 11.2 Broad Reference Acceptance

| Field Type  | Accepts                                                        |
| ----------- | -------------------------------------------------------------- |
| Axis field  | Sketch line/centerline, linear edge, reference axis, temp axis |
| Plane field | Planar face, plane, reference plane                            |

### 11.3 Invalid Pick Feedback

If user clicks non-acceptable entity:

- Show near cursor: "Needs a linear edge or axis"
- Highlight acceptable alternatives

---

## 12. Context Menus

### 12.1 Sketch Entity Context Menu

| Action                   | Description                              |
| ------------------------ | ---------------------------------------- |
| Toggle Construction      | Switch to/from construction mode         |
| Add Relations…           | Open Add Relations panel                 |
| Delete Relations…        | Show relations for deletion              |
| Reverse Endpoint Tangent | Flip tangent direction (on arcs/splines) |
| Fix/Unfix                | Toggle fixed constraint                  |
| Trim/Extend              | Quick access                             |
| Delete                   | Remove entity                            |

### 12.2 Feature Preview Context Menu

| Action               | Description                       |
| -------------------- | --------------------------------- |
| Flip Direction       | Reverse extrude/revolve direction |
| Change End Condition | Quick dropdown                    |
| Edit Feature         | Open PropertyManager              |

---

## 13. Error Handling

### 13.1 Sketch Errors

| Error         | Display                                              | Behavior                         |
| ------------- | ---------------------------------------------------- | -------------------------------- |
| Over-defined  | Red entities, conflicting dims/relations highlighted | Non-blocking, allow edits        |
| Under-defined | Blue entities, show DOF count (optional)             | Suggest adding constraints       |
| Solve failure | Message displayed                                    | Keep edits, clear error guidance |

### 13.2 Feature Errors

| Error           | Display                      | Behavior                            |
| --------------- | ---------------------------- | ----------------------------------- |
| Rebuild failure | Failing feature in tree      | Keep last good body                 |
| During tool     | Highlight problem selections | Keep tool open with actionable hint |

**Example hints:**

- "Profile self-intersects"
- "Zero-thickness geometry would result"
- "Termination face is behind profile direction"

---

## 14. Implementation Guide

### 14.0 Feature Identity: ID vs Display Name

> **📘 See also:** [TOPOLOGICAL-NAMING.md § 0.3](/TOPOLOGICAL-NAMING.md#03-feature-identity-uuid-vs-display-name) for how this applies to persistent topological references.

Every feature has two identifiers:

| Property | Purpose                      | Example          | Visible to User? |
| -------- | ---------------------------- | ---------------- | ---------------- |
| `id`     | Internal UUID for references | `"f7a8b3c2-..."` | ❌ Never         |
| `name`   | User-facing display name     | `"Extrude1"`     | ✅ Always        |

#### Rules

1. **NEVER show `id` in the UI** - it's an internal implementation detail
2. **ALWAYS show `name`** - this is the user-facing identifier
3. **Generate default names** when creating features: `"Sketch1"`, `"Extrude2"`, etc.
4. **Allow renaming** - users can change `name` at any time
5. **Use `id` for references** - stored references (including PersistentRef for faces/edges) must use `id`, not `name`

#### Schema

```typescript
// From schema.ts
export const FeatureBaseSchema = z.object({
  id: UUID, // Internal: never display
  type: z.string(),
  name: z.string().optional(), // Display: always show (generate if missing)
  suppressed: z.boolean().optional(),
  visible: z.boolean().optional(),
});
```

#### Display Name Resolution

When displaying a feature name, always provide a fallback:

```typescript
// CORRECT: Use getDisplayName helper
function getFeatureDisplayName(feature: Feature): string {
  if (feature.name) return feature.name;

  // Generate type-based default (never show raw ID)
  const typeNames: Record<string, string> = {
    sketch: "Sketch",
    extrude: "Extrude",
    revolve: "Revolve",
    plane: "Plane",
    axis: "Axis",
    origin: "Origin",
    fillet: "Fillet",
    chamfer: "Chamfer",
    boolean: "Boolean",
  };
  return typeNames[feature.type] || "Feature";
}

// WRONG: Never fall back to ID
const displayName = feature.name || feature.id; // ❌ BAD
```

#### Where This Applies

| UI Component            | Show                          |
| ----------------------- | ----------------------------- |
| Feature Tree            | `name` (with type icon)       |
| Properties Panel header | `name`                        |
| Error messages          | `name` ("Extrude1 failed")    |
| Selection info          | `name` + type                 |
| Tooltips                | `name`                        |
| Context menus           | `name`                        |
| Reference displays      | `name` ("Offset from Plane1") |

#### Name Generation on Create

When creating a new feature, generate a unique name:

```typescript
function generateFeatureName(type: string, existingFeatures: Feature[]): string {
  const prefix = type.charAt(0).toUpperCase() + type.slice(1);
  let maxNum = 0;

  for (const feature of existingFeatures) {
    const name = feature.name || "";
    const match = name.match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }

  return `${prefix}${maxNum + 1}`;
}

// Usage: generateFeatureName("extrude", features) → "Extrude3"
```

---

### 14.1 Tool Contract Interface

```typescript
interface SketchTool {
  activate(context: ToolContext): void;
  deactivate(): void;
  onHover(rayHit: RayHit, modifiers: Modifiers): void;
  onClick(rayHit: RayHit, modifiers: Modifiers): void;
  onDrag(start: Point, current: Point, modifiers: Modifiers): void;
  onKey(key: string, modifiers: Modifiers): void;
  setParameter(name: string, value: unknown): void;
  getPreviewGeometry(): PreviewGeometry; // Must be fast
  commit(): void; // Creates persistent entities
}
```

### 14.2 Selection Box Contract

```typescript
interface SelectionBox {
  acceptedTypes: EntityType[];
  multiplicity: "single" | "multiple";
  chainSelect: boolean;
  filters: SelectionFilter[];
  required: boolean;
  placeholder: string;
  errorMessage: string;
}
```

### 14.3 Inference Engine Contract

```typescript
interface InferenceEngine {
  // Inputs
  cursorPosition: Vec2; // In sketch plane
  existingGeometry: SketchData;
  tolerances: ToleranceSettings;

  // Outputs
  snappedPoint: Vec2;
  candidateRelations: RelationCandidate[];
  previewGlyphs: Glyph[];
  inferenceLines: Line[];

  // Must support
  hysteresis: boolean;
  intentZones: IntentZone[];
}
```

### 14.4 Persistence and Editability

- Everything created is editable:
  - Sketch entity parameters + relations
  - Feature parameters + references
- Recompute model on edits
- Preserve IDs so downstream references survive
- **Topological naming** ensures face/edge references remain valid across rebuilds. See [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md) for the algorithm.

---

## 15. UI Inventory

### 15.1 Top-Level UI Regions

| Region                   | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| **CommandManager**       | Tabbed toolbar (Sketch, Features, Surfaces, Reference Geometry) |
| **Bodies Section**       | List of solid and surface bodies with visibility controls       |
| **Features Section**     | Ordered list of features (origin, sketches, operations)         |
| **PropertyManager**      | Right panel with selection boxes, parameters, OK/Cancel         |
| **Graphics Area**        | Viewport with previews, manipulators, HUD                       |
| **Contextual Toolbar**   | Near-cursor toolbar on selection                                |
| **Shortcut Bar (S key)** | Pop-up palette of common commands                               |

> **Note:** Unlike SolidWorks' unified tree, SolidType has **two separate sections** for Bodies and Features.

### 15.2 UI Structure: Two Separate Sections

> **Note:** Unlike SolidWorks' single unified tree, SolidType uses **two separate UI sections**:
> a **Bodies section** and a **Features section**. These are distinct panels with flat lists (no nesting).

```
┌─────────────────────────────────────┐
│           BODIES SECTION            │  ← Separate UI panel
├─────────────────────────────────────┤
│                                     │
│  Body 1 👁️ 🎨 [Solid]               │  ← Flat list, type badge
│  Body 2 👁️ 🎨 [Solid]               │
│  Surface Body 1 👁️ 🎨 [Surface]     │  ← Surface bodies in same list
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│          FEATURES SECTION           │  ← Separate UI panel
├─────────────────────────────────────┤
│                                     │
│  Front Plane (XZ)                   │  ← Origin planes as flat list
│  Top Plane (XY)                     │
│  Right Plane (YZ)                   │
│  📐 Sketch1                         │
│  🔷 Extrude1 → Body 1               │  ← Shows target body
│  📐 Sketch2                         │
│  🔷 Extrude2 → Body 1               │
│  🔷 Fillet1 → Body 1, Body 2        │
│  📐 Sketch3                         │
│  🔶 Extruded Surface1 → Surface 1   │
│  🔄 Rebuild Gate                    │
│                                     │
└─────────────────────────────────────┘
```

#### Bodies Section (Flat List)

| Element           | Behavior                                                            |
| ----------------- | ------------------------------------------------------------------- |
| Body row          | Name, visibility toggle, color swatch, type badge [Solid]/[Surface] |
| Click body        | Select body, highlight in viewport                                  |
| Right-click body  | Context menu: Hide, Show, Delete, Appearance, Select All Faces      |
| Double-click name | Inline rename                                                       |
| Drag body         | Not supported (bodies are results, not reorderable)                 |

> **No subgroups:** Solid and surface bodies are in the same flat list, distinguished by a type badge or icon.

#### Features Section (Flat List)

| Element              | Behavior                                            |
| -------------------- | --------------------------------------------------- |
| Origin planes        | Flat list at top (Front, Top, Right) - no nesting   |
| Separator            | Visual line between origin planes and user features |
| Feature row          | Icon, name, target body indicator, status icon      |
| Click feature        | Select feature, show in Properties Panel            |
| Right-click feature  | Context menu: Edit, Suppress, Delete, Rollback      |
| Double-click feature | Enter edit mode for that feature                    |
| Drag feature         | Reorder (changes evaluation order)                  |
| Rebuild Gate         | Visual marker, features below are not evaluated     |

> **No nesting:** Origin planes are a flat list, not nested under an "Origin" folder.

#### Feature → Body Association Display

Each feature shows which body(s) it affects:

```
🔷 Extrude1 → Body 1              ← Creates/modifies Body 1
🔷 Cut1 → Body 1, Body 2          ← Cuts through multiple bodies
🔷 Fillet1 → Body 1               ← Applied to Body 1
🔶 Extruded Surface1 → Surface 1  ← Creates Surface Body 1
```

#### Current Implementation Status

| Feature                  | Bodies Section | Features Section | Notes                                      |
| ------------------------ | -------------- | ---------------- | ------------------------------------------ |
| Panel exists             | 🔧 Partial     | ✅ Works         | Bodies section needs work                  |
| Body type indicator      | ❌             | —                | No [Solid]/[Surface] badge                 |
| Body visibility toggle   | ❌             | —                | Not implemented                            |
| Body color/appearance    | ❌             | —                | Not implemented                            |
| Body selection feedback  | ❌             | —                | No visible feedback                        |
| Origin planes flat list  | —              | ✅               | Works                                      |
| Feature → Body indicator | —              | ❌               | Features don't show target body            |
| Feature reordering       | —              | ❌               | Not implemented                            |
| Feature status icons     | —              | 🔧               | Error icons exist, success/warning missing |

#### Interaction Between Sections

| Action           | Bodies Section              | Features Section                   |
| ---------------- | --------------------------- | ---------------------------------- |
| Select body      | Highlights body             | Highlights features that affect it |
| Select feature   | Highlights affected body(s) | Shows feature selected             |
| Hide body        | Body hidden in viewport     | Features still visible             |
| Suppress feature | Body may change/disappear   | Feature shows suppressed icon      |
| Delete body      | ❓ Behavior TBD             | Associated features deleted?       |

#### Body Deletion Behavior (Design Decision)

When user deletes a body from Bodies section:

| Option                        | Behavior                                                        |
| ----------------------------- | --------------------------------------------------------------- |
| **A. Delete body only**       | Body removed, features that created it become orphaned          |
| **B. Delete body + features** | Body and all features that contributed to it are deleted        |
| **C. Suppress features**      | Body hidden, contributing features suppressed (non-destructive) |

> **Recommendation:** Option C (Suppress) as default, with Option B available via Shift+Delete

### 15.3 Contextual Toolbar Options

| Selection     | Available Actions                                              |
| ------------- | -------------------------------------------------------------- |
| Sketch entity | Smart Dimension, Add Relation, Construction, Trim, Fix, Delete |
| Face          | Extrude, Offset, Sketch, Hole Wizard, Fillet                   |
| Edge          | Fillet, Chamfer, Convert Entities (in sketch)                  |
| Body          | Combine, Appearance                                            |

### 15.4 Shortcut Bar (S Key)

**In Sketch:**
Line, Rectangle, Circle, Arc, Smart Dimension, Trim, Offset, Mirror

**In Part:**
Extrude, Cut, Fillet, Chamfer, Shell, Draft, Mirror, Pattern

### 15.5 Selection Filters Toolbar

| Filter          | Toggle |
| --------------- | ------ |
| Faces           | ☑      |
| Edges           | ☑      |
| Vertices        | ☑      |
| Sketch Entities | ☑      |
| Sketch Regions  | ☑      |
| Planes          | ☑      |
| Axes            | ☑      |
| Bodies          | ☑      |

### 15.6 Keyboard + Mouse Conventions

| Input            | Action                               |
| ---------------- | ------------------------------------ |
| **LMB**          | Select / place                       |
| **Drag**         | Move manipulator / Power Trim        |
| **Ctrl+Click**   | Toggle selection                     |
| **Shift**        | Constrain inference / lock direction |
| **Esc**          | Cancel tool                          |
| **Enter**        | OK / finish                          |
| **Double-click** | End chain (line polyline)            |
| **Tab**          | Cycle pick candidates under cursor   |
| **Right-click**  | Context menu                         |

---

## 16. Selection Acceptance Matrix

### 16.1 Entity Type Taxonomy

#### Sketch-Level Types

| Type            | Description             |
| --------------- | ----------------------- |
| `SketchPoint`   | Point in sketch         |
| `SketchLine`    | Line segment            |
| `SketchArc`     | Arc segment             |
| `SketchCircle`  | Full circle             |
| `SketchSpline`  | Spline curve            |
| `SketchRegion`  | Closed profile region   |
| `SketchContour` | Chain usable as profile |

#### Model-Level Types

| Type              | Description                |
| ----------------- | -------------------------- |
| `FacePlanar`      | Flat face                  |
| `FaceCylindrical` | Cylindrical surface        |
| `FaceConical`     | Conical surface            |
| `EdgeLinear`      | Straight edge              |
| `EdgeCircular`    | Circular edge              |
| `EdgeCurve`       | General curve edge         |
| `Vertex`          | Point on body              |
| `BodySolid`       | Solid body                 |
| `BodySurface`     | Surface body               |
| `PlaneRef`        | Reference plane            |
| `AxisRef`         | Reference axis             |
| `TempAxis`        | Derived from cylinder/cone |

### 16.2 Standard Validation Messages

| Code              | Message                                            |
| ----------------- | -------------------------------------------------- |
| `NEED_PLANAR`     | "Select a planar face or plane."                   |
| `NEED_LINEAR`     | "Select a linear edge, sketch line, or axis."      |
| `NEED_CLOSED`     | "Select a closed sketch region."                   |
| `NO_INTERSECT`    | "Selection does not intersect required profiles."  |
| `OPEN_PROFILE`    | "Profile is open (not closed)."                    |
| `ZERO_THICKNESS`  | "Feature would result in zero-thickness geometry." |
| `PARALLEL_PLANES` | "Planes do not intersect; cannot form an axis."    |

### 16.3 Per-Tool Acceptance

#### Plane Tool

| Box         | Accepts                                                                                       | Multiplicity      |
| ----------- | --------------------------------------------------------------------------------------------- | ----------------- |
| Reference 1 | `FacePlanar`, `PlaneRef`, `EdgeLinear`, `AxisRef`, `Vertex`, `FaceCylindrical`, `FaceConical` | Single            |
| Reference 2 | Same, filtered by mode                                                                        | Single (optional) |
| Reference 3 | `Vertex`                                                                                      | Single (optional) |

#### Axis Tool

| Box           | Accepts                               | Multiplicity |
| ------------- | ------------------------------------- | ------------ |
| Linear Entity | `EdgeLinear`, `SketchLine`, `AxisRef` | Single       |
| Point 1       | `Vertex`, `SketchPoint`               | Single       |
| Point 2       | `Vertex`, `SketchPoint`               | Single       |
| Plane 1       | `PlaneRef`, `FacePlanar`              | Single       |
| Plane 2       | `PlaneRef`, `FacePlanar`              | Single       |
| Cylindrical   | `FaceCylindrical`, `FaceConical`      | Single       |

#### Extrude

| Box           | Accepts                                   | Multiplicity | Chain | Required    |
| ------------- | ----------------------------------------- | ------------ | ----- | ----------- |
| Profile       | `SketchRegion`, `SketchContour`, `Sketch` | Multi        | No    | Yes         |
| Direction     | `FacePlanar`                              | Single       | No    | No          |
| Up To Surface | `Face*`                                   | Single       | No    | Conditional |

#### Revolve

| Box     | Accepts                                           | Multiplicity | Chain | Required |
| ------- | ------------------------------------------------- | ------------ | ----- | -------- |
| Profile | `SketchRegion`, `SketchContour`                   | Multi        | No    | Yes      |
| Axis    | `SketchLine`, `EdgeLinear`, `AxisRef`, `TempAxis` | Single       | No    | Yes      |

#### Sweep

| Box     | Accepts                         | Multiplicity | Chain | Required |
| ------- | ------------------------------- | ------------ | ----- | -------- |
| Profile | `SketchRegion`, `SketchContour` | Single       | No    | Yes      |
| Path    | `SketchCurve`, `EdgeCurve`      | Single       | Yes   | Yes      |
| Guides  | Curve chains                    | Multi        | Yes   | No       |

#### Loft

| Box        | Accepts                         | Multiplicity  | Chain | Required |
| ---------- | ------------------------------- | ------------- | ----- | -------- |
| Profiles   | `SketchRegion`, `SketchContour` | Ordered Multi | No    | Yes (≥2) |
| Guides     | Curve chains                    | Multi         | Yes   | No       |
| Centerline | Curve                           | Single        | Yes   | No       |

---

## 17. Implementation Priority

> **📘 See also:** [IMPLEMENTATION-SEQUENCE.md](/IMPLEMENTATION-SEQUENCE.md) for how to interleave sketch improvements with topological naming work, and which features can proceed without naming.

### Phase 1: Core Sketch Feel (MVP)

| Feature                                     | Priority    |
| ------------------------------------------- | ----------- |
| Line + inference + auto-relations           | 🔴 Critical |
| Smart Dimension                             | 🔴 Critical |
| Trim (Power Trim)                           | 🔴 Critical |
| Rectangle/Circle/Arc flyouts                | 🔴 Critical |
| Chain line behavior with right-click finish | 🔴 Critical |

### Phase 2: Constraints System

| Feature                    | Priority    |
| -------------------------- | ----------- |
| Coincident                 | 🔴 Critical |
| Horizontal/Vertical        | 🔴 Critical |
| Parallel/Perpendicular     | 🔴 Critical |
| Tangent                    | 🔴 Critical |
| Equal, Midpoint, Symmetric | 🟡 High     |
| Fix + Relations Manager    | 🟡 High     |

### Phase 3: Core Features

| Feature                               | Priority    |
| ------------------------------------- | ----------- |
| Extrude Boss/Cut (all end conditions) | 🔴 Critical |
| Revolve                               | 🔴 Critical |
| Fillet/Chamfer                        | 🔴 Critical |

### Phase 4: Reference Geometry

| Feature                                | Priority |
| -------------------------------------- | -------- |
| Plane (Offset/Midplane/3-Point/Angle)  | 🟡 High  |
| Axis (line/edge/two points/two planes) | 🟡 High  |

### Phase 5: Advanced Features

| Feature              | Priority  |
| -------------------- | --------- |
| Patterns + Mirror    | 🟡 High   |
| Shell + Draft        | 🟡 High   |
| Sweep + Loft         | 🟢 Medium |
| Hole Wizard          | 🟢 Medium |
| Combine, Split Line  | 🟢 Medium |
| Surface counterparts | 🔵 Lower  |

### Phase 6: 3D Selection System

| Feature                                      | Priority    |
| -------------------------------------------- | ----------- |
| Edge tessellation in kernel                  | 🔴 Critical |
| Edge rendering in viewer                     | 🔴 Critical |
| Edge picking/selection                       | 🔴 Critical |
| Edge hover highlighting                      | 🔴 Critical |
| Face selection info in Properties Panel      | 🟡 High     |
| Edge selection info in Properties Panel      | 🟡 High     |
| Selection filters (Face/Edge/Vertex toggles) | 🟡 High     |
| Edge loop selection (double-click)           | 🟢 Medium   |
| Box selection (drag to select)               | 🟢 Medium   |

> **Note:** 3D selection is a foundation for many features (Fillet, Chamfer, Shell, Draft, Patterns).
> Edge selection must work before these features can be fully implemented.

---

## Appendix: "Glue" Rules That Prevent Dead-Ends

### A. Inline Reference Creation

Any selection box accepting `PlaneRef` or `AxisRef` gets:

- **"+ Create Plane…"** button
- **"+ Create Axis…"** button

On creation OK: return to tool, fill selection box, preserve tool state.

### B. Auto-Chain Selection

When selection box accepts edges/curves with `ChainSelect: yes`:

- Single click selects connected tangent chain
- `Ctrl+Click` adds/removes segments from chain

### C. Region Picking Rules

- Click inside closed loop → selects `SketchRegion`
- If nested loops, click cycles through: outer region → inner void(s)
- "Selected Contours" list shows chosen regions

### D. Defaulting Rules

| Tool    | Defaults                                                  |
| ------- | --------------------------------------------------------- |
| Extrude | Direction = sketch normal, End = Blind, Depth = last-used |
| Cut     | End = Through All (or last-used)                          |
| Revolve | If sketch has one centerline, auto-suggest                |
| Mirror  | Suggest midplane if symmetric part implied                |

### E. Consistent Failure UX

When kernel fails:

1. Keep tool open
2. Preserve user selections
3. Highlight failing selections
4. Show one-line reason + suggestion

---

# Part 2: Implementation Guide

This section provides the concrete implementation details needed for an agent to build the features described in Part 1.

---

## 18. Codebase Architecture Map

### 18.1 Package Structure

```
packages/
├── core/                    # CAD kernel wrapper (@solidtype/core)
│   └── src/
│       ├── api/             # Public API (SolidSession)
│       ├── sketch/          # Sketch model and solver
│       │   ├── SketchModel.ts    # Sketch data structure
│       │   ├── solver.ts         # Constraint solver
│       │   ├── constraints.ts    # Constraint definitions
│       │   └── types.ts          # Type definitions
│       ├── model/           # Feature modeling
│       ├── geom/            # Geometry primitives
│       ├── topo/            # Topology structures
│       └── kernel/          # OpenCascade.js wrapper
│
└── app/                     # React application (@solidtype/app)
    └── src/
        └── editor/
            ├── components/
            │   ├── Viewer.tsx              # 3D/2D canvas + sketch interactions
            │   ├── FloatingToolbar.tsx     # Toolbar with tool buttons
            │   ├── PropertiesPanel.tsx     # Feature property editing
            │   └── FeatureTree.tsx         # Feature tree sidebar
            ├── contexts/
            │   ├── SketchContext.tsx       # Sketch mode state + operations
            │   ├── SelectionContext.tsx    # Selection state
            │   ├── DocumentContext.tsx     # Yjs document operations
            │   ├── FeatureEditContext.tsx  # Feature creation/editing
            │   └── ViewerContext.tsx       # Camera + view state
            ├── document/
            │   ├── schema.ts               # Zod schemas for all features
            │   ├── featureHelpers.ts       # CRUD operations for features
            │   └── createDocument.ts       # Document initialization
            └── worker/
                └── kernel.worker.ts        # Kernel rebuild worker
```

### 18.2 Key File Responsibilities

| File                  | Responsibility                                            | Lines |
| --------------------- | --------------------------------------------------------- | ----- |
| `Viewer.tsx`          | 3D rendering, sketch mouse handlers, entity visualization | ~3300 |
| `SketchContext.tsx`   | Sketch mode state, tool switching, entity CRUD            | ~770  |
| `FloatingToolbar.tsx` | Tool buttons, constraint menu, grid toggle                | ~870  |
| `schema.ts`           | Zod schemas for all document types                        | ~580  |
| `featureHelpers.ts`   | Yjs document operations for features                      | ~1100 |
| `SketchModel.ts`      | Core sketch data model (kernel side)                      | ~660  |
| `solver.ts`           | Gauss-Newton constraint solver                            | ~500  |
| `constraints.ts`      | Constraint error functions                                | ~400  |

### 18.3 Data Flow

```
User Input (Mouse/Keyboard)
        │
        ▼
┌─────────────────┐
│   Viewer.tsx    │  ◄─── Captures mouse events in sketch mode
│ handleMouseUp() │
└────────┬────────┘
         │ Calls addPoint(), addLine(), etc.
         ▼
┌─────────────────┐
│ SketchContext   │  ◄─── Provides sketch operations API
│   addLine()     │
└────────┬────────┘
         │ Writes to Yjs
         ▼
┌─────────────────┐
│ featureHelpers  │  ◄─── Yjs document mutations
│ addLineToSketch │
└────────┬────────┘
         │ Triggers observer
         ▼
┌─────────────────┐
│ kernel.worker   │  ◄─── Rebuilds model in worker
│ interpretSketch │
└────────┬────────┘
         │ Updates meshes
         ▼
┌─────────────────┐
│   Viewer.tsx    │  ◄─── Re-renders with new geometry
│ (useEffect)     │
└─────────────────┘
```

---

## 19. Current vs Target Gap Analysis

### 19.1 Line Tool

| Aspect                 | Current                  | Target                       | Gap                                 |
| ---------------------- | ------------------------ | ---------------------------- | ----------------------------------- |
| **Chain Mode**         | ❌ Each line independent | ✅ Continue from last point  | Need to track `lastEndpointId`      |
| **Right-Click Finish** | ❌ Not handled           | ✅ Ends chain, stays in tool | Add `onContextMenu` handler         |
| **Click-Drag**         | ❌ Same as click-click   | ✅ Single line on release    | Track `mouseDownPos` + `isDragging` |
| **Auto H/V**           | ❌ None                  | ✅ Detect near-axis lines    | Check angle in `handleMouseUp`      |
| **Auto Coincident**    | ❌ Point reuse only      | ✅ Create constraint         | Call `addConstraint` on snap        |
| **Visual Inference**   | ❌ Only snap indicator   | ✅ H/V/∥/⊥ icons             | Add inference overlay               |

**Current Code Location:** `Viewer.tsx` lines 3016-3050

```typescript
// CURRENT (simplified)
if (sketchMode.activeTool === "line") {
  if (!tempStartPoint) {
    setTempStartPoint({ x, y }); // First click
  } else {
    addLine(startId, endId); // Second click
    setTempStartPoint(null); // ❌ Doesn't chain
  }
}
```

**Target Code Pattern:**

```typescript
if (sketchMode.activeTool === "line") {
  if (!tempStartPoint) {
    setTempStartPoint({ x, y, id: snappedId });
  } else {
    const endId = snappedId ?? addPoint(x, y);
    addLine(startId, endId);

    // ✅ Auto-constraints
    if (isNearHorizontal(startPt, endPt)) {
      addConstraint({ type: "horizontal", points: [startId, endId] });
    }
    if (snappedId) {
      addConstraint({ type: "coincident", points: [prevEndId, snappedId] });
    }

    // ✅ Chain mode: continue from endpoint
    setTempStartPoint({ x: endPt.x, y: endPt.y, id: endId });
  }
}
```

### 19.2 Arc Tool

| Aspect           | Current                | Target                     | Gap                            |
| ---------------- | ---------------------- | -------------------------- | ------------------------------ |
| **Order**        | start → end → center   | center → start → end       | Swap click sequence            |
| **Tangent Mode** | ❌ Not implemented     | ✅ Auto from line endpoint | Add intent zone detection      |
| **Direction**    | CCW from cross product | Drag side determines       | Track cursor relative to chord |
| **3-Point Mode** | ❌ Not available       | ✅ Alternative mode        | Add mode toggle                |

**Current Code Location:** `Viewer.tsx` lines 3052-3077

### 19.3 Rectangle Tool

| Aspect       | Current            | Target                   | Gap                          |
| ------------ | ------------------ | ------------------------ | ---------------------------- |
| **Modes**    | Corner-corner only | + Center, 3-Point        | Add mode state               |
| **Auto H/V** | ❌ None            | ✅ All edges constrained | Add 4 constraints on create  |
| **Preview**  | ❌ None            | ✅ Live rectangle        | Add preview line for 4 edges |

**Current Code Location:** `Viewer.tsx` lines 3106-3137

### 19.4 Selection

| Aspect           | Current            | Target                | Gap                         |
| ---------------- | ------------------ | --------------------- | --------------------------- |
| **Multi-Select** | ❌ Single only     | ✅ Ctrl+click toggle  | Check `e.ctrlKey` modifier  |
| **Box Select**   | ❌ Not implemented | ✅ Drag to box select | Add selection box state     |
| **Shift+Click**  | ❌ Not handled     | ✅ Add to selection   | Check `e.shiftKey` modifier |

**Current Code Location:** `Viewer.tsx` lines 2995-3014

### 19.5 Constraints

| Aspect             | Current             | Target                | Gap                    |
| ------------------ | ------------------- | --------------------- | ---------------------- |
| **Auto on Create** | ❌ None             | ✅ H/V/Coincident     | Add in entity creation |
| **Visual Glyphs**  | ✅ Dimension labels | + Constraint icons    | Add glyph sprites      |
| **Suppress Ctrl**  | ❌ Not implemented  | ✅ Ctrl disables auto | Check modifier         |

---

## 20. Implementation Tasks

### Phase A: Line Tool Chain Mode (Foundation)

**Estimated Effort:** 2-3 hours

#### Task A1: Add Chain Mode State

**File:** `packages/app/src/editor/components/Viewer.tsx`

```typescript
// ADD after line 185 (sketch editing state)
const [chainLastEndpoint, setChainLastEndpoint] = useState<{
  x: number;
  y: number;
  id: string;
} | null>(null);
```

#### Task A2: Modify Line Tool Click Handler

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** Inside `handleMouseUp`, around line 3016

**Changes:**

1. After creating line, set `chainLastEndpoint` to the end point
2. On next click, if `chainLastEndpoint` exists, use it as start
3. Clear `chainLastEndpoint` on tool change or Escape

```typescript
// REPLACE the line tool section (lines 3016-3050)
if (sketchMode.activeTool === "line") {
  const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

  // Determine start point (chain mode or fresh start)
  const startSource = chainLastEndpoint || tempStartPoint;

  if (!startSource) {
    // First click - set start point
    if (nearbyPoint) {
      setTempStartPoint({
        x: nearbyPoint.x,
        y: nearbyPoint.y,
        id: nearbyPoint.id,
      });
    } else {
      setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
    }
  } else {
    // Second+ click - create line
    let startId = startSource.id;
    if (!startId) {
      startId = addPoint(startSource.x, startSource.y);
    }

    let endId: string | null = null;
    if (nearbyPoint) {
      endId = nearbyPoint.id;
    } else {
      endId = addPoint(snappedPos.x, snappedPos.y);
    }

    if (startId && endId) {
      addLine(startId, endId);

      // Chain mode: set end as new start
      const endPt = nearbyPoint || { x: snappedPos.x, y: snappedPos.y };
      setChainLastEndpoint({ x: endPt.x, y: endPt.y, id: endId });
      setTempStartPoint(null); // Clear initial temp point
    }
  }
  return;
}
```

#### Task A3: Add Right-Click to End Chain

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** After the `onContextMenu` handler (around line 2583)

```typescript
// MODIFY onContextMenu to handle sketch chain finish
const onContextMenu = (e: MouseEvent) => {
  e.preventDefault();

  // In sketch mode with line tool: end chain
  if (sketchMode.active && sketchMode.activeTool === "line") {
    setChainLastEndpoint(null);
    setTempStartPoint(null);
    return;
  }
};
```

#### Task A4: Clear Chain on Tool Change

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** In the useEffect that clears tool state (around line 528)

```typescript
// ADD to the existing useEffect
useEffect(() => {
  setTempStartPoint(null);
  setArcStartPoint(null);
  setArcEndPoint(null);
  setCircleCenterPoint(null);
  setChainLastEndpoint(null); // ADD THIS
}, [sketchMode.active, sketchMode.sketchId, sketchMode.activeTool]); // ADD activeTool
```

#### Task A5: Update Preview Line for Chain Mode

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** Update the preview line effect (around line 537)

```typescript
// MODIFY the preview effect
useEffect(() => {
  if (!sketchMode.active) {
    setPreviewLine(null);
    return;
  }

  // Use chain endpoint if available, otherwise temp start
  const startPt = chainLastEndpoint || tempStartPoint;

  if (sketchMode.activeTool === "line" && startPt && sketchPos) {
    setPreviewLine({
      start: { x: startPt.x, y: startPt.y },
      end: { x: sketchPos.x, y: sketchPos.y },
    });
  } else {
    setPreviewLine(null);
  }
}, [
  sketchMode.active,
  sketchMode.activeTool,
  tempStartPoint,
  chainLastEndpoint,
  sketchPos,
  setPreviewLine,
]);
```

**Verification Checklist for Phase A:**

- [ ] Click first point → preview line appears
- [ ] Click second point → line created, preview continues from endpoint
- [ ] Click third point → second line created, chained to first
- [ ] Right-click → chain ends, no preview
- [ ] Escape → chain ends, selection cleared
- [ ] Switch to Select tool → chain ends
- [ ] Click existing point → snaps and creates coincident start

---

### Phase B: Auto-Constraints on Line Creation

**Estimated Effort:** 2-3 hours

#### Task B1: Add Inference Detection Functions

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** Add after line 98 (utility functions section)

```typescript
// Angle tolerance for H/V inference (radians)
const HV_INFERENCE_TOLERANCE = 5 * (Math.PI / 180); // 5 degrees

/** Check if a line is near horizontal */
function isNearHorizontal(p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.abs(Math.atan2(dy, dx));
  return angle < HV_INFERENCE_TOLERANCE || angle > Math.PI - HV_INFERENCE_TOLERANCE;
}

/** Check if a line is near vertical */
function isNearVertical(p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.abs(Math.atan2(dy, dx));
  return Math.abs(angle - Math.PI / 2) < HV_INFERENCE_TOLERANCE;
}
```

#### Task B2: Add Auto-Constraint Setting

**File:** `packages/app/src/editor/contexts/ViewerContext.tsx`

```typescript
// ADD to ViewerState interface
autoConstraints: boolean;

// ADD to initial state
autoConstraints: true,

// ADD action
toggleAutoConstraints: () => void;
setAutoConstraints: (enabled: boolean) => void;
```

#### Task B3: Apply Auto-Constraints in Line Creation

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** Inside the line creation code (Task A2), after `addLine()`

```typescript
if (startId && endId) {
  addLine(startId, endId);

  // Auto-constraints (if enabled and Ctrl not held)
  if (viewerState.autoConstraints && !e.ctrlKey) {
    const startPt = startSource;
    const endPt = nearbyPoint || { x: snappedPos.x, y: snappedPos.y };

    // Check for horizontal/vertical
    if (isNearHorizontal(startPt, endPt)) {
      addConstraint({ type: "horizontal", points: [startId, endId] });
    } else if (isNearVertical(startPt, endPt)) {
      addConstraint({ type: "vertical", points: [startId, endId] });
    }

    // Auto-coincident on snap (only if end snapped to existing point)
    // Note: coincident with start is implicit from chain mode
    if (nearbyPoint && chainLastEndpoint) {
      // This creates a coincident between the chain's previous endpoint
      // and the snapped point (if they're different)
      if (chainLastEndpoint.id !== nearbyPoint.id) {
        addConstraint({
          type: "coincident",
          points: [chainLastEndpoint.id, nearbyPoint.id],
        });
      }
    }
  }

  // Chain mode...
}
```

#### Task B4: Add Inference Visual Overlay

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** Add state for inference display

```typescript
// ADD to state (after line 200)
const [inferenceIndicator, setInferenceIndicator] = useState<{
  type: "horizontal" | "vertical" | "parallel" | "perpendicular" | null;
  position: { x: number; y: number };
} | null>(null);
```

Then update in mousemove handler when line tool is active with a start point.

**Verification Checklist for Phase B:**

- [ ] Draw horizontal line → "H" indicator appears → horizontal constraint created
- [ ] Draw vertical line → "V" indicator appears → vertical constraint created
- [ ] Draw diagonal line → no indicator → no H/V constraint
- [ ] Hold Ctrl while drawing → no auto constraints applied
- [ ] Toggle auto-constraints off → no auto constraints applied
- [ ] Constraint appears in Relations panel after creation

---

### Phase C: Multi-Select Support

**Estimated Effort:** 1-2 hours

> **Critical Fix:** Current `togglePointSelection` and `toggleLineSelection` functions
> clear other selection types. This must be fixed for proper multi-select behavior.

#### Task C0: Fix Toggle Selection Functions (Pre-requisite)

**File:** `packages/app/src/editor/contexts/SketchContext.tsx`

The current toggle functions incorrectly clear other selection types:

```typescript
// ❌ CURRENT (BROKEN): Clears lines when toggling points
const togglePointSelection = (pointId: string) => {
  setSelectedPoints((prev) => {
    const next = new Set(prev);
    if (next.has(pointId)) next.delete(pointId);
    else next.add(pointId);
    return next;
  });
  setSelectedLines(new Set()); // BUG: This clears lines!
};

// ✅ FIXED: Toggle only affects its own type
const togglePointSelection = (pointId: string) => {
  setSelectedPoints((prev) => {
    const next = new Set(prev);
    if (next.has(pointId)) next.delete(pointId);
    else next.add(pointId);
    return next;
  });
  // Do NOT clear other selection types
};

const toggleLineSelection = (lineId: string) => {
  setSelectedLines((prev) => {
    const next = new Set(prev);
    if (next.has(lineId)) next.delete(lineId);
    else next.add(lineId);
    return next;
  });
  // Do NOT clear other selection types
};
```

#### Task C1: Modify Click Selection Logic

**File:** `packages/app/src/editor/components/Viewer.tsx`
**Location:** In `handleMouseUp`, select tool section (lines 2995-3014)

```typescript
if (sketchMode.activeTool === "select") {
  const sketch = getSketch();
  if (!sketch) return;

  const tol = POINT_MERGE_TOLERANCE_MM;
  const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, tol);

  if (nearbyPoint) {
    if (e.ctrlKey) {
      // Ctrl+click: toggle selection (preserves other selections)
      togglePointSelection(nearbyPoint.id);
    } else if (e.shiftKey) {
      // Shift+click: add to selection (preserves other selections)
      setSelectedPoints((prev) => new Set([...prev, nearbyPoint.id]));
    } else {
      // Plain click: select only this (clear all others)
      setSelectedPoints(new Set([nearbyPoint.id]));
      setSelectedLines(new Set());
      setSelectedConstraints(new Set());
    }
    return;
  }

  const nearbyLine = findNearbyLineInSketch(sketch, snappedPos.x, snappedPos.y, tol);
  if (nearbyLine) {
    if (e.ctrlKey) {
      // Ctrl+click: toggle selection (preserves other selections)
      toggleLineSelection(nearbyLine.id);
    } else if (e.shiftKey) {
      // Shift+click: add to selection (preserves other selections)
      setSelectedLines((prev) => new Set([...prev, nearbyLine.id]));
    } else {
      // Plain click: select only this (clear all others)
      setSelectedLines(new Set([nearbyLine.id]));
      setSelectedPoints(new Set());
      setSelectedConstraints(new Set());
    }
    return;
  }

  // Click on empty space: clear selection (unless modifier held)
  if (!e.ctrlKey && !e.shiftKey) {
    clearSketchSelection();
  }
  return;
}
```

**Verification Checklist for Task C0:**

- [ ] Ctrl+click point → point toggles, lines stay selected
- [ ] Ctrl+click line → line toggles, points stay selected
- [ ] Shift+click → adds to selection, doesn't clear others
- [ ] Plain click → clears all, selects only clicked item

#### Task C2: Update SketchContext Toggle Functions

**File:** `packages/app/src/editor/contexts/SketchContext.tsx`
**Location:** Modify `togglePointSelection` and `toggleLineSelection`

```typescript
// MODIFY togglePointSelection (around line 432)
const togglePointSelection = useCallback((pointId: string, additive?: boolean) => {
  setSelectedPoints((prev) => {
    const next = new Set(prev);
    if (next.has(pointId)) {
      next.delete(pointId);
    } else {
      next.add(pointId);
    }
    return next;
  });
  // Only clear lines if not in additive mode
  if (!additive) {
    setSelectedLines(new Set());
    setSelectedConstraints(new Set());
  }
}, []);
```

**Verification Checklist for Phase C:**

- [ ] Click point → only that point selected
- [ ] Ctrl+click another point → both points selected
- [ ] Ctrl+click selected point → deselects it
- [ ] Shift+click point → adds to selection
- [ ] Click empty space → clears selection
- [ ] Ctrl+click empty space → selection unchanged

---

### Phase D: Rectangle with Auto-Constraints

**Estimated Effort:** 1-2 hours

#### Task D1: Add Rectangle Constraint Application

**File:** `packages/app/src/editor/contexts/SketchContext.tsx`
**Location:** Modify `addRectangle` function (around line 395)

```typescript
const addRectangle = useCallback(
  (centerX: number, centerY: number, width: number, height: number) => {
    const sketch = getSketchElement();
    if (!sketch) return;

    const halfW = width / 2;
    const halfH = height / 2;

    // Add 4 corner points (bottom-left, bottom-right, top-right, top-left)
    const p1 = addPointToSketch(sketch, centerX - halfW, centerY - halfH);
    const p2 = addPointToSketch(sketch, centerX + halfW, centerY - halfH);
    const p3 = addPointToSketch(sketch, centerX + halfW, centerY + halfH);
    const p4 = addPointToSketch(sketch, centerX - halfW, centerY + halfH);

    // Add 4 lines
    const l1 = addLineToSketch(sketch, p1, p2); // bottom (horizontal)
    const l2 = addLineToSketch(sketch, p2, p3); // right (vertical)
    const l3 = addLineToSketch(sketch, p3, p4); // top (horizontal)
    const l4 = addLineToSketch(sketch, p4, p1); // left (vertical)

    // Add auto-constraints for rectangle
    addConstraintToSketch(sketch, { type: "horizontal", points: [p1, p2] }); // bottom
    addConstraintToSketch(sketch, { type: "horizontal", points: [p3, p4] }); // top
    addConstraintToSketch(sketch, { type: "vertical", points: [p2, p3] }); // right
    addConstraintToSketch(sketch, { type: "vertical", points: [p4, p1] }); // left

    // Optional: equal length constraints for square-like rectangles
    // addConstraintToSketch(sketch, { type: "equalLength", lines: [l1, l3] });
    // addConstraintToSketch(sketch, { type: "equalLength", lines: [l2, l4] });
  },
  [getSketchElement]
);
```

**Verification Checklist for Phase D:**

- [ ] Create rectangle → 4 lines created
- [ ] Rectangle has horizontal constraints on top/bottom
- [ ] Rectangle has vertical constraints on left/right
- [ ] Dragging corner maintains rectangle shape (solver works)

---

### Phase E: Arc Tool Improvements

**Estimated Effort:** 3-4 hours

#### Task E1: Add Arc Tool Mode State

**File:** `packages/app/src/editor/contexts/SketchContext.tsx`

```typescript
// ADD to SketchTool type
export type SketchTool =
  | "none"
  | "select"
  | "line"
  | "arc"
  | "arcCenterpoint"
  | "arcTangent"
  | "circle"
  | "rectangle";

// Or use a separate state for arc mode:
export type ArcMode = "threePoint" | "centerpoint" | "tangent";
```

#### Task E2: Implement Centerpoint Arc Sequence

**File:** `packages/app/src/editor/components/Viewer.tsx`

The centerpoint arc follows: center → start (defines radius) → end (defines angle)

```typescript
if (sketchMode.activeTool === "arcCenterpoint") {
  const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
  const clickPoint = nearbyPoint
    ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id }
    : { x: snappedPos.x, y: snappedPos.y };

  if (!arcCenterPoint) {
    // First click: center
    setArcCenterPoint(clickPoint);
  } else if (!arcStartPoint) {
    // Second click: start point (defines radius)
    setArcStartPoint(clickPoint);
  } else {
    // Third click: end point (defines angle)
    const centerId = arcCenterPoint.id ?? addPoint(arcCenterPoint.x, arcCenterPoint.y);
    const startId = arcStartPoint.id ?? addPoint(arcStartPoint.x, arcStartPoint.y);
    const endId = clickPoint.id ?? addPoint(clickPoint.x, clickPoint.y);

    if (centerId && startId && endId) {
      // Determine CCW based on cursor position relative to center-start line
      const ccw = determineCcw(arcCenterPoint, arcStartPoint, clickPoint);
      addArc(startId, endId, centerId, ccw);
    }

    // Reset for next arc
    setArcCenterPoint(null);
    setArcStartPoint(null);
  }
  return;
}
```

#### Task E3: Implement Tangent Arc Detection

**File:** `packages/app/src/editor/components/Viewer.tsx`

Add intent zone detection in the line tool:

```typescript
// In mousemove handler, when line tool active and near endpoint:
function isInTangentIntentZone(
  cursor: { x: number; y: number },
  endpoint: { x: number; y: number },
  entityDir: { dx: number; dy: number }
): boolean {
  // Check if cursor is:
  // 1. Near the endpoint (within intent radius)
  // 2. On the "arc side" (perpendicular to the entity direction)
  const dist = Math.sqrt((cursor.x - endpoint.x) ** 2 + (cursor.y - endpoint.y) ** 2);
  if (dist > TANGENT_INTENT_RADIUS) return false;

  // Check angle between cursor direction and entity direction
  const cursorDir = { dx: cursor.x - endpoint.x, dy: cursor.y - endpoint.y };
  const dot = cursorDir.dx * entityDir.dx + cursorDir.dy * entityDir.dy;
  const cursorMag = Math.sqrt(cursorDir.dx ** 2 + cursorDir.dy ** 2);
  const entityMag = Math.sqrt(entityDir.dx ** 2 + entityDir.dy ** 2);

  if (cursorMag < 0.01 || entityMag < 0.01) return false;

  const cosAngle = dot / (cursorMag * entityMag);
  // If angle > 45° from extension, we're in arc territory
  return Math.abs(cosAngle) < 0.7;
}
```

**Verification Checklist for Phase E:**

- [ ] Centerpoint arc: click center → click radius point → click end → arc created
- [ ] Arc direction follows cursor position (above/below chord)
- [ ] Tangent arc: after line, moving perpendicular shows arc preview
- [ ] Tangent constraint auto-applied on tangent arc creation

---

## 21. Code Patterns Reference

### 21.1 Adding a New Sketch Tool

```typescript
// 1. Add to SketchTool type (SketchContext.tsx)
export type SketchTool = "none" | "select" | "line" | "arc" | "circle" | "rectangle" | "newTool";

// 2. Add state variables (Viewer.tsx)
const [newToolState, setNewToolState] = useState<NewToolState | null>(null);

// 3. Add tool button (FloatingToolbar.tsx)
<Tooltip.Root>
  <Tooltip.Trigger
    className={`floating-toolbar-button ${mode.activeTool === "newTool" ? "active" : ""}`}
    onClick={() => toggleTool("newTool")}
  >
    <NewToolIcon />
  </Tooltip.Trigger>
</Tooltip.Root>

// 4. Handle in mouse handlers (Viewer.tsx)
if (sketchMode.activeTool === "newTool") {
  // ... click handling logic
}

// 5. Clear state on tool change (Viewer.tsx useEffect)
useEffect(() => {
  setNewToolState(null);
}, [sketchMode.activeTool]);
```

### 21.2 Adding a New Constraint Type

```typescript
// 1. Add Zod schema (schema.ts)
export const NewConstraintSchema = z.object({
  id: UUID,
  type: z.literal("newConstraint"),
  // ... constraint-specific fields
}).strict();

// 2. Add to union (schema.ts)
export const SketchConstraintSchema = z.union([
  // ... existing
  NewConstraintSchema,
]);

// 3. Add to ConstraintType (SketchContext.tsx)
export type ConstraintType =
  | "horizontal" | "vertical" | /* ... */ | "newConstraint";

// 4. Add canApplyConstraint logic (SketchContext.tsx)
case "newConstraint":
  return /* selection requirements */;

// 5. Add applyConstraint logic (SketchContext.tsx)
else if (type === "newConstraint") {
  constraint = { type: "newConstraint", /* ... */ };
}

// 6. Add solver support (@solidtype/core)
// In constraints.ts, add error function
// In solver.ts, add to constraint processing
```

### 21.3 Adding Visual Feedback

```typescript
// 1. Add state for visual element
const [visualState, setVisualState] = useState<VisualState | null>(null);

// 2. Create Three.js objects in setup effect
useEffect(() => {
  // Create geometry/material
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  const visual = new THREE.Line(geometry, material);
  visualRef.current = visual;
  sceneRef.current?.add(visual);

  return () => {
    sceneRef.current?.remove(visual);
    geometry.dispose();
    material.dispose();
  };
}, []);

// 3. Update in state change effect
useEffect(() => {
  if (!visualRef.current) return;

  if (visualState) {
    // Update geometry positions
    visualRef.current.visible = true;
  } else {
    visualRef.current.visible = false;
  }
  needsRenderRef.current = true;
}, [visualState]);
```

---

## 22. Verification Checklists

### 22.1 Sketch Tool Verification

**For Each Tool:**

- [ ] Tool activates when clicked in toolbar
- [ ] Tool button shows active state
- [ ] Escape clears in-progress operation
- [ ] Escape again deselects, then exits tool
- [ ] Right-click finishes chain (if applicable)
- [ ] Preview appears during operation
- [ ] Snap indicators appear near existing points
- [ ] Grid snap works when enabled
- [ ] Entity created matches preview

### 22.2 Constraint Verification

**For Each Constraint Type:**

- [ ] Constraint appears in dropdown when valid selection exists
- [ ] Constraint grayed out when selection invalid
- [ ] Applying constraint updates geometry immediately
- [ ] Constraint glyph appears on sketch
- [ ] Deleting constraint releases geometry
- [ ] Over-constraint shows error state

### 22.3 Integration Verification

**Document Persistence:**

- [ ] Entities persist after page refresh
- [ ] Constraints persist after page refresh
- [ ] Undo reverts last operation
- [ ] Redo re-applies operation

**Multi-User (if applicable):**

- [ ] Other user sees entities in real-time
- [ ] Constraint changes sync correctly
- [ ] No conflicts on simultaneous edits

---

## 23. Testing Strategy

### 23.1 Unit Tests

**Location:** `packages/core/src/sketch/*.test.ts`

```typescript
// Example: Test constraint solver
describe("Horizontal constraint", () => {
  it("should make two points have same Y coordinate", () => {
    const sketch = new SketchModel(testPlane);
    const p1 = sketch.addPoint(0, 0);
    const p2 = sketch.addPoint(10, 5);

    const solver = new ConstraintSolver(sketch);
    solver.addConstraint({ type: "horizontal", points: [p1, p2] });

    const result = solver.solve();
    expect(result.status).toBe("success");
    expect(sketch.getPoint(p1)?.y).toBeCloseTo(sketch.getPoint(p2)?.y);
  });
});
```

### 23.2 Integration Tests

**Location:** `packages/app/src/__tests__/`

```typescript
// Example: Test line tool chain mode
describe("Line tool chain mode", () => {
  it("should continue from last endpoint", async () => {
    // Setup
    const { container } = render(<Editor />);

    // Activate line tool
    fireEvent.click(screen.getByLabelText("Line"));

    // Click first point
    fireEvent.mouseUp(container, { clientX: 100, clientY: 100 });

    // Click second point (creates first line)
    fireEvent.mouseUp(container, { clientX: 200, clientY: 100 });

    // Click third point (should chain)
    fireEvent.mouseUp(container, { clientX: 200, clientY: 200 });

    // Verify two lines created
    const sketch = getActiveSketch();
    expect(sketch.entities.filter(e => e.type === "line")).toHaveLength(2);
  });
});
```

### 23.3 Manual Testing Script

```markdown
## Line Tool Chain Mode Test

1. Open a new document
2. Click XY plane to select it
3. Click "Sketch" to start new sketch
4. Click "Line" tool
5. Click at point A (any location)
6. Move cursor → verify preview line appears
7. Click at point B → verify line A-B created
8. Move cursor → verify preview continues from B
9. Click at point C → verify line B-C created (chained)
10. Right-click → verify chain ends (no preview)
11. Click at point D → verify new chain starts
12. Press Escape → verify chain cleared
13. Press Ctrl+Enter → verify sketch finishes

Expected: Steps 7 and 9 create connected lines without needing to re-click the endpoint.
```

---

## 24. Common Pitfalls

### 24.1 State Management

**Pitfall:** Modifying state in event handlers without considering React's batching.

```typescript
// ❌ BAD: Multiple state updates may not batch correctly
setTempStartPoint(null);
setChainLastEndpoint({ x, y, id });
setInferenceIndicator(null);

// ✅ GOOD: Use functional updates or combine into single state
setToolState((prev) => ({
  ...prev,
  tempStart: null,
  chainEnd: { x, y, id },
  inference: null,
}));
```

### 24.2 Yjs Transactions

**Pitfall:** Multiple Yjs operations causing multiple rebuilds.

```typescript
// ❌ BAD: Each call triggers separate transaction
addPoint(x1, y1);
addPoint(x2, y2);
addLine(p1, p2);
addConstraint({ type: "horizontal", points: [p1, p2] });

// ✅ GOOD: Wrap in single transaction (already handled in featureHelpers)
// Or use batch operations when available
```

### 24.3 Three.js Memory Leaks

**Pitfall:** Not disposing geometries and materials.

```typescript
// ❌ BAD: Creates new objects every render
const geometry = new THREE.BufferGeometry();
// ... use it
// geometry never disposed

// ✅ GOOD: Reuse or dispose properly
useEffect(() => {
  const geometry = new THREE.BufferGeometry();
  geometryRef.current = geometry;

  return () => {
    geometry.dispose();
  };
}, []);
```

### 24.4 Constraint Solver Performance

**Pitfall:** Re-solving on every mouse move.

```typescript
// ❌ BAD: Solve on every move
onMouseMove: () => {
  solver.solve(); // Expensive!
};

// ✅ GOOD: Debounce or only solve on commit
onMouseUp: () => {
  solver.solve(); // Only when done
};
```

### 24.5 Displaying Feature IDs in UI

**Pitfall:** Showing internal UUIDs to users instead of display names.

```typescript
// ❌ BAD: Falling back to internal ID (exposes implementation detail)
<span>{feature.name || feature.id}</span>
// Shows: "f7a8b3c2-1234-5678-9abc-def012345678" 😱

// ❌ BAD: Using ID in error messages
throw new Error(`Feature ${feature.id} failed to build`);
// Shows: "Feature f7a8b3c2-1234-5678-9abc-def012345678 failed to build"

// ✅ GOOD: Use display name with type fallback
<span>{getFeatureDisplayName(feature)}</span>
// Shows: "Extrude1" or "Extrude" if no name set

// ✅ GOOD: Error messages use display name
throw new Error(`${getFeatureDisplayName(feature)} failed to build`);
// Shows: "Extrude1 failed to build"
```

**Helper function to use:**

```typescript
function getFeatureDisplayName(feature: Feature): string {
  if (feature.name) return feature.name;

  // Type-based fallback (never raw ID)
  const typeNames: Record<string, string> = {
    sketch: "Sketch",
    extrude: "Extrude",
    revolve: "Revolve",
    plane: "Plane",
    axis: "Axis",
    origin: "Origin",
    fillet: "Fillet",
    chamfer: "Chamfer",
    boolean: "Boolean",
  };
  return typeNames[feature.type] || "Feature";
}
```

**Where to look for violations:**

- `FeatureTree.tsx` - node labels
- `PropertiesPanel.tsx` - feature headers
- Error messages in worker and contexts
- Tooltips and context menus

### 24.6 Inconsistent Feature Name Generation

**Pitfall:** Not generating unique default names on feature creation.

```typescript
// ❌ BAD: Feature created without name
addFeature({ id: uuid(), type: "extrude", ... });
// Result: Feature shows as "Extrude" or worse, just blank

// ✅ GOOD: Generate unique name at creation time
addFeature({
  id: uuid(),
  type: "extrude",
  name: generateFeatureName("extrude", existingFeatures), // "Extrude1"
  ...
});
```

---

## 25. Dependencies Between Tasks

```
┌─────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION ORDER                      │
└─────────────────────────────────────────────────────────────┘

Phase A: Line Chain Mode
    │
    ├──▶ Phase B: Auto-Constraints (depends on chain tracking)
    │
    └──▶ Phase C: Multi-Select (independent)

Phase B: Auto-Constraints
    │
    └──▶ Phase D: Rectangle Constraints (uses same pattern)

Phase C: Multi-Select
    │
    └──▶ Constraint application on selection (uses selection)

Phase D: Rectangle
    │
    └──▶ Phase E: Arc improvements (independent but lower priority)

Phase E: Arc
    │
    └──▶ Tangent detection (most complex, depends on endpoint tracking)
```

**Recommended Build Order:**

1. A1-A5 (Line chain mode) - Foundation
2. C1-C2 (Multi-select) - Quick win
3. B1-B4 (Auto-constraints) - High impact
4. D1 (Rectangle constraints) - Uses B patterns
5. E1-E3 (Arc improvements) - More complex

---

## 26. 3D Face and Edge Selection

### 26.1 Current Implementation Status

#### Face Selection - Partially Working ✅

| Component                        | Status     | Notes                                            |
| -------------------------------- | ---------- | ------------------------------------------------ |
| `SelectionContext.tsx`           | ✅ Done    | `SelectedFace` type, `selectFace()` function     |
| `useRaycast.ts`                  | ✅ Done    | Returns faceIndex via triangle picking           |
| `Viewer.tsx` click handler       | ✅ Done    | Calls `selectFace()` on mesh click               |
| `Viewer.tsx` hover highlighting  | ✅ Done    | Renders semi-transparent overlay on hovered face |
| `Viewer.tsx` selection highlight | ✅ Done    | Renders selected face with distinct color        |
| Kernel `faceMap` generation      | ✅ Done    | `tessellate.ts` maps triangles to face indices   |
| PropertiesPanel                  | ⚠️ Partial | Shows parent feature but no face-specific info   |

#### Edge Selection - NOT Implemented ❌

| Component                    | Status     | Notes                                      |
| ---------------------------- | ---------- | ------------------------------------------ |
| `SelectionContext.tsx` types | ✅ Done    | `SelectedEdge` type, `selectEdge()` exists |
| Edge tessellation in kernel  | ❌ Missing | Only faces tessellated, no edge curves     |
| Edge mesh data to viewer     | ❌ Missing | No edge line geometry sent                 |
| Edge rendering in viewer     | ❌ Missing | No visible edge lines displayed            |
| Edge picking/raycasting      | ❌ Missing | Can't select edges                         |
| Edge hover highlighting      | ❌ Missing | No edge highlights                         |
| Edge selection highlighting  | ❌ Missing | No edge selection visuals                  |
| PropertiesPanel edge info    | ❌ Missing | No edge info shown                         |

### 26.2 Target Behavior

#### Face Selection

- Hover over face → face highlights (semi-transparent overlay)
- Click face → face selected, shown in selection color
- Selected face info shown in Properties Panel (area, normal, adjacent edges)
- Right-click face → context menu (Sketch on Face, Extrude, Offset, etc.)

#### Edge Selection

- Hover near edge → edge highlights (thicker line, different color)
- Click near edge → edge selected
- Hold **Alt** or toggle filter → prioritize edge over face
- Selected edge info shown in Properties Panel (length, type, connected faces)
- Right-click edge → context menu (Fillet, Chamfer, Select Loop, etc.)

#### Multi-Selection

- **Ctrl+Click** → toggle face/edge in selection
- **Shift+Click** → add to selection
- **Click empty space** → clear selection
- Box select (drag) → future enhancement

### 26.3 Implementation Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           KERNEL WORKER                                    │
│                                                                           │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐ │
│  │  tessellate()   │────▶│  Face Mesh      │────▶│  postMessage()      │ │
│  │                 │     │  + faceMap      │     │                     │ │
│  └─────────────────┘     └─────────────────┘     │  {                  │ │
│                                                  │    mesh: {...},     │ │
│  ┌─────────────────┐     ┌─────────────────┐     │    edges: {...}     │ │
│  │ tessellateEdges │────▶│  Edge Lines     │────▶│  }                  │ │
│  │ (NEW)           │     │  + edgeMap      │     │                     │ │
│  └─────────────────┘     └─────────────────┘     └─────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              VIEWER                                        │
│                                                                           │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐ │
│  │  Face Meshes    │     │  Edge Lines     │     │  Selection          │ │
│  │  (THREE.Mesh)   │     │  (THREE.Line)   │     │  Highlights         │ │
│  └────────┬────────┘     └────────┬────────┘     └─────────────────────┘ │
│           │                       │                                       │
│           ▼                       ▼                                       │
│  ┌─────────────────────────────────────────┐                             │
│  │            Raycasting                    │                             │
│  │  - Face: intersect mesh triangles        │                             │
│  │  - Edge: proximity test to edge lines    │                             │
│  └──────────────────────┬──────────────────┘                             │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────┐                             │
│  │         Selection Context               │                             │
│  │  selectFace() / selectEdge()            │                             │
│  └─────────────────────────────────────────┘                             │
└───────────────────────────────────────────────────────────────────────────┘
```

### 26.4 Implementation Tasks

#### Phase F1: Edge Tessellation via SolidSession API

> **Important:** All OCCT operations must go through `SolidSession` in `@solidtype/core`.
> The worker must NOT import from `kernel/` directly.

**Step F1.1: Add Edge Mesh Type to Core API**

**File:** `packages/core/src/api/types.ts`

```typescript
// NEW: Edge mesh output type (mirrors face Mesh pattern)
export interface EdgeMesh {
  /** Flattened array of edge vertex positions [x1,y1,z1, x2,y2,z2, ...] */
  vertices: Float32Array;
  /** Pairs of indices into vertices defining line segments */
  indices: Uint32Array;
  /** Maps each line segment to its kernel edge ID (stable within session) */
  edgeIds: string[];
  /** Maps each line segment index to its edgeIds array index */
  edgeMap: Uint32Array;
  /** Persistent refs for each edge (for selection storage) */
  persistentRefs: string[];
}
```

**Step F1.2: Add Edge Tessellation to SolidSession**

**File:** `packages/core/src/api/SolidSession.ts`

```typescript
/**
 * Get tessellated edges for rendering (called via worker, not directly in app)
 * Returns line segments with persistent references for selection
 */
tessellateEdges(bodyId: BodyId, quality: TessellationQuality = 'medium'): EdgeMesh {
  this.ensureInitialized();

  const body = this.bodies.get(bodyId);
  if (!body) {
    throw new Error(`Body ${bodyId} not found`);
  }

  // Delegate to kernel tessellate module (internal)
  const result = tessellateBodyEdges(body, quality);

  // Generate persistent refs for each edge
  const persistentRefs = result.edgeIds.map((edgeId, index) =>
    this.getEdgePersistentRef(bodyId, index)
  );

  return {
    vertices: result.vertices,
    indices: result.indices,
    edgeIds: result.edgeIds,
    edgeMap: result.edgeMap,
    persistentRefs,
  };
}

/**
 * Get persistent reference string for an edge (survives rebuilds)
 */
getEdgePersistentRef(bodyId: BodyId, edgeIndex: number): string {
  // Format: "edge:<featureId>:<localSelector>:<fingerprint>"
  // This must use the naming system for stability
  return this.namingStrategy.getEdgeRef(bodyId, edgeIndex);
}

/**
 * Get persistent reference string for a face (survives rebuilds)
 */
getFacePersistentRef(bodyId: BodyId, faceIndex: number): string {
  // Format: "face:<featureId>:<localSelector>:<fingerprint>"
  return this.namingStrategy.getFaceRef(bodyId, faceIndex);
}
```

**Step F1.3: Implement Edge Tessellation in Kernel Module**

**File:** `packages/core/src/kernel/tessellate.ts`

```typescript
// Internal function - only called by SolidSession, never imported by app
export function tessellateBodyEdges(
  shape: Shape,
  quality: TessellationQuality
): { vertices: Float32Array; indices: Uint32Array; edgeIds: string[]; edgeMap: Uint32Array } {
  const oc = getOC();
  const vertices: number[] = [];
  const indices: number[] = [];
  const edgeIds: string[] = [];
  const edgeMap: number[] = [];

  const deflection = quality === "high" ? 0.01 : quality === "medium" ? 0.05 : 0.1;

  const edgeExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  let edgeIndex = 0;

  while (edgeExplorer.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());
    const edgeId = `edge-${edgeIndex}`; // Session-local ID
    edgeIds.push(edgeId);

    // Get edge curve and discretize
    const curve = new oc.BRepAdaptor_Curve_2(edge);
    const deflector = new oc.GCPnts_TangentialDeflection_2(
      curve,
      0.1, // angular deflection (radians)
      deflection,
      2, // minimum points
      1e-7, // U tolerance
      100 // max points
    );

    const numPoints = deflector.NbPoints();
    const startVertexIdx = vertices.length / 3;

    for (let i = 1; i <= numPoints; i++) {
      const pnt = deflector.Value(i);
      vertices.push(pnt.X(), pnt.Y(), pnt.Z());
    }

    for (let i = 0; i < numPoints - 1; i++) {
      indices.push(startVertexIdx + i, startVertexIdx + i + 1);
      edgeMap.push(edgeIndex);
    }

    deflector.delete();
    curve.delete();
    edgeExplorer.Next();
    edgeIndex++;
  }

  edgeExplorer.delete();

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    edgeIds,
    edgeMap: new Uint32Array(edgeMap),
  };
}
```

**Estimated Effort:** 3-4 hours

#### Phase F2: Worker Message Types and Edge Data Flow

**Step F2.1: Update Worker Message Types**

**File:** `packages/app/src/editor/worker/types.ts` (create if needed)

```typescript
// Add to existing mesh message type
export interface MeshMessage {
  type: "meshes";
  bodyId: string;
  featureId: string;
  mesh: {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    faceMap: Uint32Array;
    // NEW: Persistent refs for faces
    facePersistentRefs: string[];
  };
  // NEW: Edge data
  edges: {
    vertices: Float32Array;
    indices: Uint32Array;
    edgeMap: Uint32Array;
    // NEW: Persistent refs for edges
    edgePersistentRefs: string[];
  };
}
```

**Step F2.2: Call SolidSession from Worker**

**File:** `packages/app/src/editor/worker/kernel.worker.ts`

```typescript
// In mesh generation (after tessellate call):
const faceMesh = session.tessellate(bodyId, "medium");
const edgeMesh = session.tessellateEdges(bodyId, "medium");

// Get persistent refs for faces
const facePersistentRefs = Array.from({ length: faceMesh.faceMap.length }, (_, i) =>
  session.getFacePersistentRef(bodyId, faceMesh.faceMap[i])
);

postMessage({
  type: "meshes",
  bodyId: bodyEntry.id,
  featureId: feature.id,
  mesh: {
    positions: faceMesh.positions,
    normals: faceMesh.normals,
    indices: faceMesh.indices,
    faceMap: faceMesh.faceMap,
    facePersistentRefs,
  },
  edges: {
    vertices: edgeMesh.vertices,
    indices: edgeMesh.indices,
    edgeMap: edgeMesh.edgeMap,
    edgePersistentRefs: edgeMesh.persistentRefs,
  },
});
```

**Step F2.3: Update useKernel Hook**

**File:** `packages/app/src/editor/hooks/useKernel.ts`

```typescript
interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  faceMap: Uint32Array;
  facePersistentRefs: string[];
  edges: {
    vertices: Float32Array;
    indices: Uint32Array;
    edgeMap: Uint32Array;
    edgePersistentRefs: string[];
  };
}
```

**Estimated Effort:** 2-3 hours

#### Phase F3: Render Edges in Viewer

**File:** `packages/app/src/editor/components/Viewer.tsx`

Add edge line rendering after mesh rendering:

```typescript
// ADD: Edge rendering group ref (after line ~130)
const edgeGroupRef = useRef<THREE.Group | null>(null);

// ADD: useEffect to render edges (after mesh rendering, ~line 870)
useEffect(() => {
  const edgeGroup = edgeGroupRef.current;
  const scene = sceneRef.current;
  if (!edgeGroup || !sceneReady) return;

  // Clear existing edges
  while (edgeGroup.children.length > 0) {
    const child = edgeGroup.children[0];
    edgeGroup.remove(child);
    if (child instanceof THREE.Line) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }

  // Render edges for each body
  for (const [bodyId, meshData] of meshes) {
    if (!meshData.edges) continue;

    const { vertices, indices } = meshData.edges;

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Dark edge lines
    const material = new THREE.LineBasicMaterial({
      color: 0x333333,
      linewidth: 1,
    });

    const lineSegments = new THREE.LineSegments(geometry, material);
    lineSegments.name = `edges-${bodyId}`;
    lineSegments.renderOrder = 1; // Render on top of faces
    edgeGroup.add(lineSegments);
  }

  needsRenderRef.current = true;
}, [meshes, sceneReady]);

// ADD: Create edge group in scene setup (in sceneSetup useEffect, ~line 2450)
const edgeGroup = new THREE.Group();
edgeGroup.name = "edge-lines";
edgeGroup.renderOrder = 1;
scene.add(edgeGroup);
edgeGroupRef.current = edgeGroup;
```

**Estimated Effort:** 2-3 hours

#### Phase F4: Edge Picking Logic with Screen-Space Threshold

> **Important:** Selection thresholds must be computed in screen space, not world space,
> so selection sensitivity is consistent regardless of zoom level.

**File:** `packages/app/src/editor/hooks/useRaycast.ts`

```typescript
export interface RaycastHit {
  bodyId: string;
  featureId: string;
  faceIndex: number;
  point: THREE.Vector3;
  normal: THREE.Vector3 | null;
  distance: number;
  // Persistent reference for the face (survives rebuilds)
  facePersistentRef: string;
  // NEW: Edge info (if edge was closer than face)
  edgeIndex?: number;
  edgeScreenDistance?: number; // Distance in pixels
  edgePersistentRef?: string; // Persistent reference for the edge
}

/**
 * Convert world-space distance to approximate screen pixels
 * This ensures consistent selection sensitivity regardless of zoom
 */
function worldToScreenDistance(
  worldPoint: THREE.Vector3,
  worldDistance: number,
  camera: THREE.Camera,
  containerWidth: number
): number {
  // Get distance from camera to point
  const cameraDistance = camera.position.distanceTo(worldPoint);

  // For perspective camera, use FOV to compute screen size
  if (camera instanceof THREE.PerspectiveCamera) {
    const vFov = (camera.fov * Math.PI) / 180;
    const worldHeightAtPoint = 2 * cameraDistance * Math.tan(vFov / 2);
    const pixelsPerUnit = containerWidth / (worldHeightAtPoint * camera.aspect);
    return worldDistance * pixelsPerUnit;
  }

  // For orthographic camera, use zoom directly
  if (camera instanceof THREE.OrthographicCamera) {
    const worldWidth = (camera.right - camera.left) / camera.zoom;
    const pixelsPerUnit = containerWidth / worldWidth;
    return worldDistance * pixelsPerUnit;
  }

  return worldDistance * 100; // Fallback
}

/**
 * Find nearest edge to a point, using screen-space threshold
 */
function findNearestEdge(
  worldPoint: THREE.Vector3,
  meshData: MeshData,
  camera: THREE.Camera,
  containerWidth: number,
  thresholdPixels: number = 8 // 8 pixels is comfortable for mouse selection
): { edgeIndex: number; screenDistance: number; persistentRef: string } | null {
  if (!meshData.edges) return null;

  const { vertices, indices, edgeMap, edgePersistentRefs } = meshData.edges;
  let nearestEdge = -1;
  let nearestScreenDistance = Infinity;

  for (let i = 0; i < indices.length; i += 2) {
    const i1 = indices[i] * 3;
    const i2 = indices[i + 1] * 3;

    const p1 = new THREE.Vector3(vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
    const p2 = new THREE.Vector3(vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);

    // Distance from point to line segment in world space
    const line = new THREE.Line3(p1, p2);
    const closest = new THREE.Vector3();
    line.closestPointToPoint(worldPoint, true, closest);
    const worldDist = worldPoint.distanceTo(closest);

    // Convert to screen space
    const screenDist = worldToScreenDistance(closest, worldDist, camera, containerWidth);

    if (screenDist < nearestScreenDistance && screenDist < thresholdPixels) {
      nearestScreenDistance = screenDist;
      nearestEdge = edgeMap[i / 2];
    }
  }

  if (nearestEdge >= 0) {
    return {
      edgeIndex: nearestEdge,
      screenDistance: nearestScreenDistance,
      persistentRef: edgePersistentRefs[nearestEdge],
    };
  }
  return null;
}
```

**Estimated Effort:** 2-3 hours

#### Phase F5: Selection with Persistent References

> **Critical:** Selection must use persistent references, not tessellation indices.
> Indices are unstable across rebuilds and break downstream features (fillet, chamfer).
> See [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md) for the complete naming algorithm.

**Step F5.1: Update Selection Context Types**

**File:** `packages/app/src/editor/contexts/SelectionContext.tsx`

```typescript
/** Selected face with persistent reference */
export interface SelectedFace {
  bodyId: string;
  featureId: string;
  // DEPRECATED: Do not use for storage/features - unstable across rebuilds
  faceIndex: number;
  /** Persistent reference string - USE THIS for storage */
  persistentRef: string;
}

/** Selected edge with persistent reference */
export interface SelectedEdge {
  bodyId: string;
  featureId: string;
  // DEPRECATED: Do not use for storage/features - unstable across rebuilds
  edgeIndex: number;
  /** Persistent reference string - USE THIS for storage */
  persistentRef: string;
}
```

**Step F5.2: Update Selection Handlers in Viewer**

**File:** `packages/app/src/editor/components/Viewer.tsx`

```typescript
const handleClick = (e: MouseEvent) => {
  if (sketchMode.active) return; // Sketch mode handles its own clicks

  const hit = raycastRef.current(e.clientX, e.clientY);
  if (!hit) {
    clearFaceSelection();
    return;
  }

  const meshData = meshes.get(hit.bodyId);
  if (!meshData) return;

  const containerWidth = containerRef.current?.clientWidth || 800;

  // Find nearest edge in screen space (8 pixel threshold)
  const nearestEdge = findNearestEdge(
    hit.point,
    meshData,
    cameraRef.current!,
    containerWidth,
    8 // pixels
  );

  // Edge selection priority:
  // - Alt key held → prefer edge
  // - Edge within 4 pixels → prefer edge
  // - Otherwise → prefer face
  const preferEdge = e.altKey || (nearestEdge && nearestEdge.screenDistance < 4);

  const isMultiSelect = e.ctrlKey || e.metaKey;
  const isAdditive = e.shiftKey;

  if (preferEdge && nearestEdge) {
    selectEdgeRef.current(
      {
        bodyId: hit.bodyId,
        edgeIndex: nearestEdge.edgeIndex,
        featureId: hit.featureId,
        persistentRef: nearestEdge.persistentRef, // Store persistent ref
      },
      isMultiSelect,
      isAdditive
    );
  } else {
    // Get persistent ref from mesh data
    const faceIndex = getFaceIdRef.current(hit.bodyId, hit.faceIndex);
    const persistentRef =
      meshData.facePersistentRefs?.[faceIndex] || `face:${hit.featureId}:${faceIndex}`;

    selectFaceRef.current(
      {
        bodyId: hit.bodyId,
        faceIndex,
        featureId: hit.featureId,
        persistentRef, // Store persistent ref
      },
      isMultiSelect,
      isAdditive
    );
  }
};
```

**Estimated Effort:** 2-3 hours

#### Phase F6: Edge Highlight Rendering

**File:** `packages/app/src/editor/components/Viewer.tsx`

Add edge highlight rendering (similar to face highlights):

```typescript
// ADD: After face highlight rendering (~line 1040)
// Render selected edges
for (const selected of selectedEdges) {
  const meshData = meshes.get(selected.bodyId);
  if (!meshData?.edges) continue;

  const edgeGeometry = extractEdgeSegments(meshData, selected.edgeIndex);
  if (!edgeGeometry) continue;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(edgeGeometry.vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(edgeGeometry.indices, 1));

  const material = new THREE.LineBasicMaterial({
    color: 0x00aaff, // Selection blue
    linewidth: 3,
    depthTest: false,
  });

  const highlightLine = new THREE.LineSegments(geometry, material);
  highlightLine.name = `selected-edge-${selected.bodyId}-${selected.edgeIndex}`;
  highlightLine.renderOrder = 101;
  edgeHighlightGroup.add(highlightLine);
}

// ADD: Helper function to extract edge segments
function extractEdgeSegments(
  meshData: MeshData,
  edgeIndex: number
): { vertices: Float32Array; indices: Uint32Array } | null {
  if (!meshData.edges) return null;

  const { vertices, indices, edgeMap } = meshData.edges;
  const segmentIndices: number[] = [];

  // Find all segments belonging to this edge
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] === edgeIndex) {
      segmentIndices.push(indices[i * 2], indices[i * 2 + 1]);
    }
  }

  if (segmentIndices.length === 0) return null;

  return {
    vertices: vertices, // Reuse full vertex array
    indices: new Uint32Array(segmentIndices),
  };
}
```

**Estimated Effort:** 2-3 hours

#### Phase F7: Properties Panel Selection Info

**File:** `packages/app/src/editor/components/PropertiesPanel.tsx`

Add selection info display:

```typescript
// ADD: Component to show face/edge selection info
const SelectionInfo: React.FC<{
  selectedFaces: SelectedFace[];
  selectedEdges: SelectedEdge[];
}> = ({ selectedFaces, selectedEdges }) => {
  if (selectedFaces.length === 0 && selectedEdges.length === 0) {
    return null;
  }

  return (
    <div className="properties-panel-selection-info">
      <h4 className="properties-panel-section-title">Selection</h4>

      {selectedFaces.length > 0 && (
        <div className="properties-panel-selection-faces">
          <span className="selection-label">
            {selectedFaces.length} Face{selectedFaces.length !== 1 ? 's' : ''} Selected
          </span>
          {selectedFaces.map((face, i) => (
            <div key={i} className="selection-item">
              <span className="selection-item-icon">◻</span>
              <span>Face {face.faceIndex}</span>
            </div>
          ))}
        </div>
      )}

      {selectedEdges.length > 0 && (
        <div className="properties-panel-selection-edges">
          <span className="selection-label">
            {selectedEdges.length} Edge{selectedEdges.length !== 1 ? 's' : ''} Selected
          </span>
          {selectedEdges.map((edge, i) => (
            <div key={i} className="selection-item">
              <span className="selection-item-icon">─</span>
              <span>Edge {edge.edgeIndex}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ADD: In main PropertiesPanel render, before feature content
{selectedFaces.length > 0 || selectedEdges.length > 0 ? (
  <SelectionInfo
    selectedFaces={selectedFaces}
    selectedEdges={selectedEdges}
  />
) : null}
```

**Estimated Effort:** 1-2 hours

### 26.5 Verification Checklist

#### Face Selection

- [ ] Hover over face → semi-transparent highlight appears
- [ ] Click face → face selected with distinct highlight color
- [ ] Ctrl+Click → toggle face in selection
- [ ] Shift+Click → add face to selection
- [ ] Click empty space → selection cleared
- [ ] Selected face shows in Properties Panel

#### Edge Selection

- [ ] Visible edges rendered on all bodies
- [ ] Hover near edge → edge highlights
- [ ] Click near edge → edge selected (with Alt key or very close)
- [ ] Click face normally → face selected (not edge)
- [ ] Edge highlight distinct from face highlight
- [ ] Selected edge shows in Properties Panel

#### Multi-Selection

- [ ] Can select multiple faces
- [ ] Can select multiple edges
- [ ] Can select mix of faces and edges
- [ ] Selection persists across view changes

### 26.6 Dependencies

```
Phase F1: Edge Tessellation (kernel)
    │
    ▼
Phase F2: Worker Edge Data
    │
    ▼
Phase F3: Edge Rendering ──────────┐
    │                              │
    ▼                              ▼
Phase F4: Edge Picking       Phase F6: Edge Highlights
    │                              │
    ▼                              │
Phase F5: Edge Selection ◀─────────┘
    │
    ▼
Phase F7: Properties Panel Info
```

### 26.7 Resolved Design Decisions

1. **Edge selection threshold**: How close must click be to edge?
   - ✅ **Decision:** 8 pixels in screen space (computed via camera projection)
   - See Phase F4 for implementation
2. **Hidden edge display**: Show hidden edges as dashed lines?
   - ✅ **Decision:** Future enhancement, not in initial implementation
3. **Edge loop selection**: Double-click to select connected edge loop?
   - ✅ **Decision:** Yes, add in Phase F5 extension

4. **Selection filter UI**: Need toggle buttons for Face/Edge/Vertex filters?
   - ✅ **Decision:** Add in toolbar with Phase F5

5. **Persistent naming requirement**: Use indices or persistent refs?
   - ✅ **Decision:** Persistent refs are **essential** from day one
   - Indices are unstable across rebuilds and break downstream features
   - All selection storage must use `persistentRef` field, not `faceIndex`/`edgeIndex`
   - See Phase F5.1 for updated SelectionContext types
   - **Full algorithm:** [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md)

### 26.8 Persistent Naming Critical Path

> **📘 Full Implementation Plan:** See [TOPOLOGICAL-NAMING.md](/TOPOLOGICAL-NAMING.md) for the comprehensive persistent naming algorithm, data structures, and phased implementation plan.

> **Why this matters:** Without persistent naming, selecting a face for "Sketch on Face"
> will break when the extrude distance changes. The sketch plane reference becomes invalid.

```
User selects top face of Extrude1
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Selection stores persistentRef: "face:e1:top:h123"      │
│  NOT: faceIndex: 2 (unstable!)                           │
└──────────────────────────────────────────────────────────┘
         │
         ▼
User changes Extrude1 height from 10mm to 20mm
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Rebuild occurs, face tessellation changes               │
│  faceIndex 2 might now be a different face!              │
│  BUT: "face:e1:top:h123" still resolves to top face      │
└──────────────────────────────────────────────────────────┘
```

**Implementation Requirement:**

```typescript
// When storing selection for features (e.g., sketch plane, fillet edges):
// ✅ CORRECT: Use persistent ref
sketchFeature.plane = { kind: "faceRef", ref: selectedFace.persistentRef };

// ❌ WRONG: Use index (will break on rebuild)
sketchFeature.plane = { kind: "faceRef", ref: `face:${featureId}:${faceIndex}` };
```
