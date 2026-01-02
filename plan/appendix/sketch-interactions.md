# Sketch Tool Interactions Specification

> **Note:** This document has been superseded by the comprehensive [`/CAD-UX-SPEC.md`](/CAD-UX-SPEC.md) which covers all sketch tools, feature tools, reference geometry, and complete UI/UX specifications. Refer to that document for the authoritative implementation guide.

This document defines the complete keyboard and mouse interaction specification for SolidType sketch tools, aligned with professional CAD modelers like SolidWorks, Fusion 360, and Onshape.

## Table of Contents

1. [Overview](#overview)
2. [General Interaction Patterns](#general-interaction-patterns)
3. [Tool-Specific Interactions](#tool-specific-interactions)
4. [Automatic Constraints (Relations)](#automatic-constraints-relations)
5. [Selection Behavior](#selection-behavior)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Mouse Gestures](#mouse-gestures)
8. [Current Implementation Status](#current-implementation-status)

---

## Overview

### Design Principles

1. **Consistency with industry standards**: Match SolidWorks/Fusion 360 where possible
2. **Click-Click vs Click-Drag**: Different interactions for different workflow preferences
3. **Automatic constraints**: Smart geometry detection during sketching
4. **Chain mode**: Continuous entity creation with explicit finish
5. **Immediate feedback**: Real-time preview of geometry being created
6. **Modifier keys**: Ctrl/Shift/Alt to modify behavior temporarily

---

## General Interaction Patterns

### Mouse Button Conventions

| Button | Primary Action | With Shift | With Ctrl | With Alt |
|--------|---------------|------------|-----------|----------|
| **Left Click** | Create/select/place | Add to selection | Toggle selection | - |
| **Left Drag** | Create geometry | Pan view | - | - |
| **Middle Click** | Pan/Orbit | - | - | - |
| **Middle Drag** | Orbit view | Pan view | - | - |
| **Right Click** | Context menu / Finish chain | - | - | - |
| **Scroll** | Zoom | - | Zoom to cursor | - |

### Tool Lifecycle

1. **Tool Activation**: Click tool button or press shortcut key
2. **Entity Creation**: Click/drag to create geometry
3. **Chain Mode**: Continue creating connected entities
4. **Tool Finish**: Right-click, Escape, or click same tool to deactivate
5. **Tool Switch**: Click different tool or press different shortcut

### Cancel/Finish Operations

| Action | Effect |
|--------|--------|
| **Escape** (during creation) | Cancel current entity, stay in tool |
| **Escape** (no active entity) | Deselect all, stay in tool |
| **Escape** (nothing selected) | Exit tool, switch to Select |
| **Right-Click** | Finish chain, start new chain (stay in tool) |
| **Double-Click** | Finish entity and chain (tool-specific) |
| **Enter** | Accept current input value (dimensions) |
| **Ctrl+Enter** | Finish sketch |

---

## Tool-Specific Interactions

### 1. Select Tool (`S`)

#### Click Behavior
| Action | Result |
|--------|--------|
| Click empty space | Clear selection |
| Click point | Select point (clear other selection) |
| Click line/arc | Select entity (clear other selection) |
| Click constraint icon | Select constraint |
| Ctrl+Click entity | Toggle selection (multi-select) |
| Shift+Click entity | Add to selection |

#### Drag Behavior
| Action | Result |
|--------|--------|
| Drag from empty space | Box selection (entities fully inside) |
| Ctrl+Drag | Add box contents to selection |
| Drag point | Move point (solver adjusts geometry) |
| Drag line | Move entire line (both endpoints) |
| Drag arc | Move arc (all three points) |

#### Hover Behavior
| Hover Target | Visual Feedback |
|--------------|-----------------|
| Point | Highlight point, show snap indicator |
| Line/Arc | Highlight entity |
| Constraint | Show constraint info tooltip |
| Dimension | Highlight dimension, show edit cursor |

---

### 2. Line Tool (`L`)

The line tool supports three distinct modes based on click vs drag behavior:

#### Mode A: Click-Click (Chain Mode)

This is the primary mode - clicking places points and automatically chains lines.

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place start point | Coincident (if snapping to existing point) |
| 2 | Move cursor | Show preview line | Show H/V inference indicators |
| 3 | Click | Place end point, create line | Horizontal/Vertical (if near axis) |
| 4 | Move cursor | Preview next line from last point | Chain continues |
| 5 | Click | Create next line segment | Coincident (to previous endpoint) |
| n | Right-Click or Escape | Finish chain | - |
| n | Double-Click | Place final point and finish chain | - |

#### Mode B: Click-Drag (Single Line)

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click+Hold | Set start point | Coincident (if snapping) |
| 2 | Drag | Preview line dynamically | Show H/V inference |
| 3 | Release | Create single line | Horizontal/Vertical (if applicable) |

After drag-release, the tool remains active but does NOT chain - user must click again to start new line.

#### Modifier Keys (During Line Creation)

| Modifier | Effect |
|----------|--------|
| **Shift** | Constrain to horizontal/vertical/45° angles |
| **Ctrl** | Temporarily disable automatic constraints |
| **Tab** | Cycle through input fields (X, Y, Length, Angle) |

#### Snapping During Line

| Snap Target | Visual | Resulting Constraint |
|-------------|--------|---------------------|
| Existing point | Highlight point | Coincident |
| Line midpoint | Diamond marker | Midpoint |
| Line endpoint | Circle marker | Coincident |
| Origin | Cross marker | Fixed/Coincident |
| Grid intersection | Subtle dot | (position only, no constraint) |
| Parallel to existing line | Dashed inference line | Parallel (optional) |
| Perpendicular to existing | Right-angle marker | Perpendicular (optional) |

#### Keyboard Input (On-Screen Numeric Input)

When enabled, dimension boxes appear during line creation:

| Key | Action |
|-----|--------|
| Type number | Enter dimension value |
| Tab | Switch between Length/Angle fields |
| Enter | Accept value and continue |
| Escape | Cancel numeric input |

---

### 3. Arc Tool

SolidType should support multiple arc creation methods via a dropdown or mode toggle:

#### 3.1 Center Point Arc (`A`) - Default

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place center point | Coincident (if snapping) |
| 2 | Move + Click | Set radius and start angle | - |
| 3 | Move + Click | Set end angle, create arc | - |

**Click-Drag variant:**
| Step | Action | Result |
|------|--------|--------|
| 1 | Click+Hold | Place center |
| 2 | Drag | Set radius |
| 3 | Release | Set start point |
| 4 | Move + Click | Set end point, create arc |

#### 3.2 Three-Point Arc

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place start point | Coincident (if snapping) |
| 2 | Click | Place end point | Coincident (if snapping) |
| 3 | Click | Place point on arc (defines curvature) | - |

**Click-Drag variant:**
| Step | Action | Result |
|------|--------|--------|
| 1 | Click+Hold | Place start point |
| 2 | Drag to end | Preview straight line |
| 3 | Release | Set end point |
| 4 | Move + Click | Set arc through-point |

#### 3.3 Tangent Arc (After Line/Arc)

When the last created entity is a line or arc, and the arc tool is active:

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click near endpoint | Start tangent arc from endpoint | **Tangent** (automatic) |
| 2 | Move + Click | Set end point | - |

The tangent direction is automatically constrained.

#### Arc Direction (CW/CCW)

| Action | Effect |
|--------|--------|
| Drag cursor above centerline | Counter-clockwise arc |
| Drag cursor below centerline | Clockwise arc |
| **A** key during arc | Toggle arc direction |

---

### 4. Circle Tool (`C`)

#### 4.1 Center-Radius Circle (Default)

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place center | Coincident (if snapping to point) |
| 2 | Move + Click | Set radius, create circle | Concentric (if center on arc/circle) |

**Click-Drag variant:**
| Step | Action | Result |
|------|--------|--------|
| 1 | Click+Hold | Place center |
| 2 | Drag | Preview circle with dynamic radius |
| 3 | Release | Create circle |

#### 4.2 Three-Point Circle

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place first point | Coincident (if snapping) |
| 2 | Click | Place second point | Coincident (if snapping) |
| 3 | Click | Place third point, create circle | Coincident (if snapping) |

#### Keyboard Input

| Key | Action |
|-----|--------|
| Type number after center | Set exact radius |
| **D** | Add diameter dimension to circle |

---

### 5. Rectangle Tool (`R`)

#### 5.1 Corner-Corner Rectangle (Default)

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place first corner | Coincident (if snapping) |
| 2 | Move + Click | Place opposite corner, create rectangle | **Horizontal** on top/bottom edges, **Vertical** on left/right edges |

**Click-Drag variant:**
| Step | Action | Result |
|------|--------|--------|
| 1 | Click+Hold | Place first corner |
| 2 | Drag | Preview rectangle |
| 3 | Release | Create rectangle |

#### 5.2 Center-Corner Rectangle

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place center | Coincident (if snapping) |
| 2 | Move + Click | Place corner, create rectangle centered on first point | H/V constraints on edges |

#### Modifier Keys

| Modifier | Effect |
|----------|--------|
| **Shift** during drag | Constrain to square (equal width/height) |
| **Ctrl** | Switch between corner-corner and center-corner modes |

#### Construction Geometry

Rectangle always creates 4 lines with:
- 4 corner points with **Coincident** constraints
- **Horizontal** constraints on horizontal edges
- **Vertical** constraints on vertical edges

---

### 6. Polygon Tool

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Set sides count (default 6) | Configure polygon | - |
| 2 | Click | Place center | Coincident (if snapping) |
| 3 | Move + Click | Set radius and rotation | **Equal** length on all sides |

**Options (in Properties Panel or popup):**
- Number of sides (3-32)
- Inscribed vs Circumscribed

---

### 7. Slot Tool (Straight Slot)

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place first center | Coincident (if snapping) |
| 2 | Move + Click | Place second center | Horizontal/Vertical between centers |
| 3 | Move + Click | Set slot width | **Equal** radii on both arcs |

Creates: 2 arcs + 2 tangent lines

---

### 8. Spline Tool

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Click | Place first control point | Coincident (if snapping) |
| 2 | Click | Place additional points | - |
| n | Double-Click or Enter | Finish spline | - |

**Editing splines:**
- Drag control points to reshape
- Alt+Click on segment to add control point
- Delete key removes selected control point

---

### 9. Fillet Tool (Sketch Fillet)

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Activate tool | - | - |
| 2 | Click corner (point where 2 lines meet) | Preview fillet | - |
| 3 | Move to adjust radius or type value | Preview updates | - |
| 4 | Click or Enter | Create fillet arc | **Tangent** to both lines |

---

### 10. Chamfer Tool (Sketch Chamfer)

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Activate tool | - | - |
| 2 | Click corner | Preview chamfer | - |
| 3 | Move to adjust or type distance | Preview updates | - |
| 4 | Click or Enter | Create chamfer line | **Coincident** endpoints |

---

### 11. Trim Tool

| Step | Action | Result |
|------|--------|--------|
| 1 | Click on entity segment | Delete segment between intersections |
| 2 | Continue clicking | Trim more segments |

**Power Trim (Drag):**
| Step | Action | Result |
|------|--------|--------|
| 1 | Click+Drag across entities | Trim all crossed segments |

---

### 12. Extend Tool

| Step | Action | Result |
|------|--------|--------|
| 1 | Click near endpoint of line/arc | Extend to nearest intersecting entity |

---

### 13. Offset Tool

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Select entities to offset | Highlight selection | - |
| 2 | Click or type distance | Preview offset | - |
| 3 | Click side for direction | Create offset geometry | None (or optional **Equal** distance) |

---

### 14. Mirror Tool

| Step | Action | Result | Default Constraints |
|------|--------|--------|---------------------|
| 1 | Select entities to mirror | Highlight selection | - |
| 2 | Select mirror line | Preview mirrored geometry | **Symmetric** constraints |
| 3 | Click to confirm | Create mirrored geometry | - |

---

### 15. Construction Mode Toggle (`X`)

| Action | Effect |
|--------|--------|
| **X** key with selection | Toggle construction/geometry mode |
| **X** key with no selection | Toggle mode for next created entity |

Construction geometry:
- Displayed as dashed lines (orange/brown color)
- Not used for extrude/revolve profile
- Used for reference and constraints only

---

## Automatic Constraints (Relations)

### Inference Engine

The inference engine detects geometric relationships during sketching and offers automatic constraints:

#### Point-Based Inferences

| Detection | Visual Indicator | Constraint Applied |
|-----------|-----------------|-------------------|
| On existing point | Filled circle highlight | **Coincident** |
| On line | Diamond/perpendicular marker | **Point on Line** |
| On arc/circle | Filled circle on arc | **Point on Arc** |
| On midpoint | Diamond marker | **Midpoint** |
| At origin | Cross marker | **Fixed** or **Coincident to origin** |

#### Line-Based Inferences

| Detection | Visual Indicator | Constraint Applied |
|-----------|-----------------|-------------------|
| Near horizontal | Horizontal indicator (H) | **Horizontal** |
| Near vertical | Vertical indicator (V) | **Vertical** |
| Parallel to existing line | Parallel lines symbol (∥) | **Parallel** |
| Perpendicular to existing | Right angle symbol (⊥) | **Perpendicular** |
| Equal length to existing | Equal symbol (=) | **Equal Length** |
| Collinear with existing | Dashed extension line | **Collinear** |

#### Arc/Circle-Based Inferences

| Detection | Visual Indicator | Constraint Applied |
|-----------|-----------------|-------------------|
| Tangent to line | Tangent indicator | **Tangent** |
| Tangent to arc/circle | Tangent indicator | **Tangent** |
| Concentric with arc/circle | Concentric indicator | **Concentric** |
| Equal radius to arc/circle | Equal symbol | **Equal Radius** |

### Suppressing Automatic Constraints

| Method | Effect |
|--------|--------|
| **Ctrl** key while sketching | Temporarily disable inference |
| Settings toggle | Disable automatic relations globally |
| Delete constraint after creation | Remove unwanted constraint |

### Constraint Priority

When multiple constraints are possible, apply in this priority:
1. Coincident (point snapping)
2. Horizontal/Vertical
3. Parallel/Perpendicular
4. Tangent
5. Equal/Concentric

---

## Selection Behavior

### Multi-Selection

| Action | Behavior |
|--------|----------|
| Click entity | Select (clear previous) |
| Ctrl+Click | Toggle selection |
| Shift+Click | Add to selection |
| Box select (left to right) | Select fully enclosed entities |
| Box select (right to left) | Select touched entities |

### Selection Filters

Allow filtering selection to:
- Points only
- Lines only
- Arcs only
- Constraints only
- Construction geometry only

---

## Keyboard Shortcuts

### Global Sketch Shortcuts

| Key | Action |
|-----|--------|
| **Escape** | Cancel current operation / Deselect / Exit tool |
| **Delete** / **Backspace** | Delete selected entities |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Redo |
| **Ctrl+A** | Select all |
| **Ctrl+Enter** | Finish/Accept sketch |
| **G** | Toggle grid snap |

### Tool Shortcuts

| Key | Tool |
|-----|------|
| **S** | Select |
| **L** | Line |
| **A** | Arc (Center-Point) |
| **Shift+A** | Arc (3-Point) |
| **C** | Circle |
| **R** | Rectangle |
| **P** | Point |
| **O** | Offset |
| **T** | Trim |
| **X** | Toggle Construction |
| **M** | Mirror |
| **E** | Extend |

### Constraint Shortcuts

| Key | Constraint |
|-----|------------|
| **H** | Horizontal |
| **V** | Vertical |
| **D** | Distance (dimension) |
| **=** | Equal |
| **F** | Fix |
| **Ctrl+H** | Coincident |
| **/** | Parallel |
| **\\** | Perpendicular |

### View Shortcuts

| Key | Action |
|-----|--------|
| **F** | Fit all |
| **N** | Normal to sketch plane |
| **1-6** | Standard views |
| **Home** | Isometric view |

---

## Mouse Gestures

### Radial Gesture Menu (Optional)

Right-click and drag to invoke radial menu with 8 slots:

| Direction | Default Tool |
|-----------|--------------|
| ↑ Up | Line |
| ↗ Up-Right | Arc |
| → Right | Circle |
| ↘ Down-Right | Rectangle |
| ↓ Down | Dimension |
| ↙ Down-Left | Trim |
| ← Left | Select |
| ↖ Up-Left | Construction Toggle |

---

## Current Implementation Status

### ✅ Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Line tool (click-click) | ✅ Basic | No chain mode |
| Arc tool (3-point, center last) | ✅ Basic | Non-standard order |
| Circle tool (center-radius) | ✅ Basic | |
| Rectangle tool (corner-corner) | ✅ Basic | |
| Select tool | ✅ Basic | Single selection |
| Point snapping | ✅ | |
| Grid snapping | ✅ | Toggleable |
| Escape to clear | ✅ Partial | |
| Delete selected | ✅ | |
| Construction toggle | ✅ | |

### ❌ Not Implemented

| Feature | Priority | Notes |
|---------|----------|-------|
| **Click-Drag behavior** | High | Different from click-click |
| **Chain mode for lines** | High | Continue from last point |
| **Right-click to finish chain** | High | Standard CAD behavior |
| **Automatic H/V constraints** | High | On near-axis lines |
| **Automatic coincident constraints** | High | When snapping to points |
| **Tangent arc mode** | Medium | After line/arc |
| **Center-point arc** | Medium | Different arc workflow |
| **3-point circle** | Medium | |
| **Center rectangle** | Medium | |
| **Multi-select (Ctrl+click)** | High | |
| **Box selection** | Medium | |
| **Inference visual indicators** | High | H/V/Parallel markers |
| **Shift to constrain angles** | High | Force H/V/45° |
| **Ctrl to suppress constraints** | Medium | |
| **On-screen dimension input** | Medium | Type values during creation |
| **Slot tool** | Low | |
| **Polygon tool** | Low | |
| **Fillet tool (sketch)** | Medium | |
| **Chamfer tool (sketch)** | Medium | |
| **Trim tool** | Medium | |
| **Extend tool** | Low | |
| **Offset tool** | Medium | |
| **Mirror tool** | Low | |
| **Radial gesture menu** | Low | Right-click menu |

---

## Implementation Recommendations

### Phase 1: Core Interaction Improvements (High Priority)

1. **Line chain mode**: After creating a line, automatically start next line from endpoint
2. **Right-click to finish**: End chain without exiting tool
3. **Click-drag distinction**: Track mousedown → mousemove → mouseup separately
4. **Automatic H/V constraints**: Detect near-horizontal/vertical during line creation
5. **Automatic coincident**: When snapping to existing points
6. **Multi-select**: Ctrl+click for toggle, Shift+click for add
7. **Visual inference indicators**: Show H/V/∥/⊥ icons near cursor

### Phase 2: Enhanced Tool Modes (Medium Priority)

1. **Center-point arc**: Standard CAD arc workflow
2. **Tangent arc continuation**: From line/arc endpoints
3. **Shift to constrain**: Force angles to H/V/45°
4. **Center rectangle mode**
5. **On-screen dimension input**
6. **Trim tool**: Click to remove segments
7. **Sketch fillet/chamfer**

### Phase 3: Advanced Features (Lower Priority)

1. **Slot tool**
2. **Polygon tool**
3. **Offset tool**
4. **Mirror tool**
5. **Spline tool**
6. **Radial gesture menu**
7. **Customizable keyboard shortcuts**

---

## References

- SolidWorks Sketch Best Practices
- Fusion 360 Sketch Hotkeys
- Onshape Sketcher Documentation
- FreeCAD Sketcher Constraints
