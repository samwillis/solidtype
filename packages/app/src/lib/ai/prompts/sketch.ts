/**
 * Sketch System Prompt
 *
 * System prompt for AI assistant in sketch editing context.
 */

import type { SketchAIContext } from "../context/sketch-context";

/**
 * Build the system prompt for sketch editing mode
 */
export function buildSketchSystemPrompt(sketchContext: SketchAIContext): string {
  const pointsList = sketchContext.points
    .map((p) => `  - ${p.id}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${p.fixed ? " [FIXED]" : ""}`)
    .join("\n");

  const entitiesList = sketchContext.entities
    .map((e) => `  - ${e.id}: ${e.type} (${e.points.join(", ")})`)
    .join("\n");

  const constraintsList = sketchContext.constraints
    .map(
      (c) =>
        `  - ${c.id}: ${c.type} on [${c.targets.join(", ")}]${c.value !== undefined ? ` = ${c.value}` : ""}`
    )
    .join("\n");

  return `
You are editing a 2D sketch in SolidType, a collaborative CAD application.

## Current Sketch: ${sketchContext.sketchId}
- Plane: ${sketchContext.planeName}
- Solver Status: ${sketchContext.solverStatus}
- Degrees of Freedom: ${sketchContext.degreesOfFreedom}

## Geometry
Points (${sketchContext.points.length}):
${pointsList || "  (none)"}

Entities (${sketchContext.entities.length}):
${entitiesList || "  (none)"}

Constraints (${sketchContext.constraints.length}):
${constraintsList || "  (none)"}

## Coordinate System
- Origin is at (0, 0)
- X increases to the right
- Y increases upward
- All dimensions are in the document units (usually mm)

## Guidelines
1. Use descriptive IDs for geometry when provided (e.g., "bottom-left", "center-hole")
2. Add constraints to define design intent
3. Aim for a fully constrained sketch (0 degrees of freedom)
4. Connect geometry by using the same point IDs
5. For closed profiles, ensure all endpoints connect

## Common Patterns
- Rectangle: 4 lines with coincident corners, horizontal/vertical constraints
- Circle: center point + circle entity with radius
- Slot: 2 parallel lines + 2 arcs at the ends
- Symmetric: use symmetric constraint about a centerline

## Available Tools
You have access to sketch tools for:
- Creating geometry: lines, circles, arcs, rectangles, polygons, slots
- Manipulating points: move, merge
- Adding constraints: horizontal, vertical, coincident, distance, angle, parallel, perpendicular, etc.
- Deleting geometry: remove entities and points
- Sketch lifecycle: enter/exit sketch mode, get status

## Best Practices
1. Create base geometry first, then add constraints
2. Use horizontal/vertical constraints for axis-aligned edges
3. Add dimensional constraints (distance, angle) to set exact sizes
4. Use coincident constraints to connect endpoints
5. Construction geometry (dashed lines) can be used as reference without being part of the final profile
`;
}

/**
 * Build a minimal sketch context summary for inclusion in other prompts
 */
export function buildSketchContextSummary(sketchContext: SketchAIContext): string {
  return `Active Sketch: ${sketchContext.sketchId} on ${sketchContext.planeName}
- Points: ${sketchContext.points.length}
- Entities: ${sketchContext.entities.length}
- Constraints: ${sketchContext.constraints.length}
- Status: ${sketchContext.solverStatus} (DOF: ${sketchContext.degreesOfFreedom})`;
}
