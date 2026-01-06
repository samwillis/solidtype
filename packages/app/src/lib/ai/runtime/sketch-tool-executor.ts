/**
 * Sketch Tool Executor
 *
 * Executes sketch AI tools against a Yjs document.
 * Used by the SharedWorker to process local tool calls.
 */

import type { SolidTypeDoc } from "../../../editor/document";
import type { SketchToolContext } from "../tools/sketch-impl";
import * as sketchImpl from "../tools/sketch-impl";

/**
 * Execute a sketch tool by name
 *
 * @param toolName - The name of the tool to execute
 * @param args - The tool arguments
 * @param doc - The Yjs document
 * @param activeSketchId - The active sketch ID (for geometry/constraint tools)
 * @returns The tool result or throws an error
 */
export function executeSketchTool(
  toolName: string,
  args: Record<string, unknown>,
  doc: SolidTypeDoc,
  activeSketchId: string | null
): unknown {
  // Create context without UI callbacks (worker has no React)
  const ctx: SketchToolContext = {
    doc,
    activeSketchId,
    // No UI callbacks in worker - changes sync via Yjs
  };

  switch (toolName) {
    // ============ Lifecycle Tools ============
    case "createSketch":
      return sketchImpl.createSketchImpl(
        ctx,
        args as Parameters<typeof sketchImpl.createSketchImpl>[1]
      );

    case "enterSketch":
      return sketchImpl.enterSketchImpl(
        ctx,
        args as Parameters<typeof sketchImpl.enterSketchImpl>[1]
      );

    case "exitSketch":
      return sketchImpl.exitSketchImpl(ctx);

    case "getSketchStatus":
      return sketchImpl.getSketchStatusImpl(ctx);

    // ============ Geometry Creation Tools ============
    case "addLine":
      return sketchImpl.addLineImpl(ctx, args as Parameters<typeof sketchImpl.addLineImpl>[1]);

    case "addCircle":
      return sketchImpl.addCircleImpl(ctx, args as Parameters<typeof sketchImpl.addCircleImpl>[1]);

    case "addArc":
      return sketchImpl.addArcImpl(ctx, args as Parameters<typeof sketchImpl.addArcImpl>[1]);

    case "addRectangle":
      return sketchImpl.addRectangleImpl(
        ctx,
        args as Parameters<typeof sketchImpl.addRectangleImpl>[1]
      );

    case "addPolygon":
      return sketchImpl.addPolygonImpl(
        ctx,
        args as Parameters<typeof sketchImpl.addPolygonImpl>[1]
      );

    case "addSlot":
      return sketchImpl.addSlotImpl(ctx, args as Parameters<typeof sketchImpl.addSlotImpl>[1]);

    // ============ Point Manipulation Tools ============
    case "addPoint":
      return sketchImpl.addPointImpl(ctx, args as Parameters<typeof sketchImpl.addPointImpl>[1]);

    case "movePoint":
      return sketchImpl.movePointImpl(ctx, args as Parameters<typeof sketchImpl.movePointImpl>[1]);

    case "mergePoints":
      return sketchImpl.mergePointsImpl(
        ctx,
        args as Parameters<typeof sketchImpl.mergePointsImpl>[1]
      );

    // ============ Constraint Tools ============
    case "addConstraint":
      return sketchImpl.addConstraintImpl(
        ctx,
        args as Parameters<typeof sketchImpl.addConstraintImpl>[1]
      );

    case "removeConstraint":
      return sketchImpl.removeConstraintImpl(
        ctx,
        args as Parameters<typeof sketchImpl.removeConstraintImpl>[1]
      );

    case "modifyConstraintValue":
      return sketchImpl.modifyConstraintValueImpl(
        ctx,
        args as Parameters<typeof sketchImpl.modifyConstraintValueImpl>[1]
      );

    // ============ Deletion Tools ============
    case "deleteEntity":
      return sketchImpl.deleteEntityImpl(
        ctx,
        args as Parameters<typeof sketchImpl.deleteEntityImpl>[1]
      );

    case "deletePoint":
      return sketchImpl.deletePointImpl(
        ctx,
        args as Parameters<typeof sketchImpl.deletePointImpl>[1]
      );

    // ============ Construction Geometry ============
    case "toggleConstruction":
      return sketchImpl.toggleConstructionImpl(
        ctx,
        args as Parameters<typeof sketchImpl.toggleConstructionImpl>[1]
      );

    // ============ Helper Tools ============
    case "createCenteredRectangle":
      return sketchImpl.createCenteredRectangleImpl(
        ctx,
        args as Parameters<typeof sketchImpl.createCenteredRectangleImpl>[1]
      );

    case "createCircleWithRadius":
      return sketchImpl.createCircleWithRadiusImpl(
        ctx,
        args as Parameters<typeof sketchImpl.createCircleWithRadiusImpl>[1]
      );

    case "createCenterlinesAtOrigin":
      return sketchImpl.createCenterlinesAtOriginImpl(
        ctx,
        args as Parameters<typeof sketchImpl.createCenterlinesAtOriginImpl>[1]
      );

    default:
      throw new Error(`Unknown sketch tool: ${toolName}`);
  }
}

/**
 * Check if a tool name is a sketch tool
 */
export function isSketchTool(toolName: string): boolean {
  const sketchTools = new Set([
    // Lifecycle
    "createSketch",
    "enterSketch",
    "exitSketch",
    "getSketchStatus",
    // Geometry
    "addLine",
    "addCircle",
    "addArc",
    "addRectangle",
    "addPolygon",
    "addSlot",
    // Points
    "addPoint",
    "movePoint",
    "mergePoints",
    // Constraints
    "addConstraint",
    "removeConstraint",
    "modifyConstraintValue",
    // Deletion
    "deleteEntity",
    "deletePoint",
    // Construction
    "toggleConstruction",
    // Helpers
    "createCenteredRectangle",
    "createCircleWithRadius",
    "createCenterlinesAtOrigin",
  ]);

  return sketchTools.has(toolName);
}
