/**
 * Modeling Tool Executor
 *
 * Executes 3D modeling AI tools against a Yjs document and OCCT kernel.
 * Used by the SharedWorker to process local tool calls.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 5
 */

import type { SolidTypeDoc } from "../../../editor/document";
import type { RebuildResult } from "../../../editor/kernel";
import * as modelingImpl from "../tools/modeling-impl";

/**
 * Context for modeling tool execution
 *
 * Extended in Phase 5 to support geometry queries via RebuildResult.
 */
export interface ModelingToolContext {
  doc: SolidTypeDoc;

  /**
   * Optional RebuildResult from the last kernel rebuild.
   * When available, enables geometry queries (findFaces, getBoundingBox, etc.)
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 5
   */
  rebuildResult?: RebuildResult;
}

/**
 * Check if a tool name is a modeling tool
 */
export function isModelingTool(toolName: string): boolean {
  // Query tools
  if (
    [
      "getCurrentSelection",
      "getModelContext",
      "findFaces",
      "findEdges",
      "measureDistance",
      "getBoundingBox",
      "measureAngle",
      "getModelSnapshot",
    ].includes(toolName)
  ) {
    return true;
  }

  // Feature tools
  if (
    [
      "createExtrude",
      "createRevolve",
      "createLoft",
      "createSweep",
      "createFillet",
      "createChamfer",
      "createDraft",
      "createLinearPattern",
      "createCircularPattern",
      "createMirror",
    ].includes(toolName)
  ) {
    return true;
  }

  // Modify tools
  if (
    [
      "modifyFeature",
      "deleteFeature",
      "reorderFeature",
      "suppressFeature",
      "renameFeature",
      "duplicateFeature",
      "undo",
      "redo",
    ].includes(toolName)
  ) {
    return true;
  }

  // Helper tools
  if (
    [
      "createBox",
      "createCylinder",
      "createSphere",
      "createCone",
      "createHole",
      "createPocket",
      "createBoss",
      "createShell",
      "createRib",
      "filletAllEdges",
    ].includes(toolName)
  ) {
    return true;
  }

  return false;
}

/**
 * Execute a modeling tool by name
 *
 * @param toolName - The name of the tool to execute
 * @param args - The tool arguments
 * @param ctx - The modeling context (doc, kernel state, etc.)
 * @returns The tool result or throws an error
 */
export function executeModelingTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ModelingToolContext
): unknown {
  switch (toolName) {
    // ============ Query Tools ============
    case "getCurrentSelection":
      return modelingImpl.getCurrentSelectionImpl(args, ctx);
    case "getModelContext":
      return modelingImpl.getModelContextImpl(args, ctx);
    case "findFaces":
      return modelingImpl.findFacesImpl(args, ctx);
    case "findEdges":
      return modelingImpl.findEdgesImpl(args, ctx);
    case "measureDistance":
      return modelingImpl.measureDistanceImpl(args, ctx);
    case "getBoundingBox":
      return modelingImpl.getBoundingBoxImpl(args, ctx);
    case "measureAngle":
      return modelingImpl.measureAngleImpl(args, ctx);
    case "getModelSnapshot":
      // getModelSnapshot is async - return the promise
      return modelingImpl.getModelSnapshotImpl(args, ctx);

    // ============ Feature Tools ============
    case "createExtrude":
      return modelingImpl.createExtrudeImpl(args, ctx);
    case "createRevolve":
      return modelingImpl.createRevolveImpl(args, ctx);
    case "createLoft":
      return modelingImpl.createLoftImpl(args, ctx);
    case "createSweep":
      return modelingImpl.createSweepImpl(args, ctx);
    case "createFillet":
      return modelingImpl.createFilletImpl(args, ctx);
    case "createChamfer":
      return modelingImpl.createChamferImpl(args, ctx);
    case "createDraft":
      return modelingImpl.createDraftImpl(args, ctx);
    case "createLinearPattern":
      return modelingImpl.createLinearPatternImpl(args, ctx);
    case "createCircularPattern":
      return modelingImpl.createCircularPatternImpl(args, ctx);
    case "createMirror":
      return modelingImpl.createMirrorImpl(args, ctx);

    // ============ Modify Tools ============
    case "modifyFeature":
      return modelingImpl.modifyFeatureImpl(args, ctx);
    case "deleteFeature":
      return modelingImpl.deleteFeatureImpl(args, ctx);
    case "reorderFeature":
      return modelingImpl.reorderFeatureImpl(args, ctx);
    case "suppressFeature":
      return modelingImpl.suppressFeatureImpl(args, ctx);
    case "renameFeature":
      return modelingImpl.renameFeatureImpl(args, ctx);
    case "duplicateFeature":
      return modelingImpl.duplicateFeatureImpl(args, ctx);
    case "undo":
      return modelingImpl.undoImpl(args, ctx);
    case "redo":
      return modelingImpl.redoImpl(args, ctx);

    // ============ Helper Tools ============
    case "createBox":
      return modelingImpl.createBoxImpl(args, ctx);
    case "createCylinder":
      return modelingImpl.createCylinderImpl(args, ctx);
    case "createSphere":
      return modelingImpl.createSphereImpl(args, ctx);
    case "createCone":
      return modelingImpl.createConeImpl(args, ctx);
    case "createHole":
      return modelingImpl.createHoleImpl(args, ctx);
    case "createPocket":
      return modelingImpl.createPocketImpl(args, ctx);
    case "createBoss":
      return modelingImpl.createBossImpl(args, ctx);
    case "createShell":
      return modelingImpl.createShellImpl(args, ctx);
    case "createRib":
      return modelingImpl.createRibImpl(args, ctx);
    case "filletAllEdges":
      return modelingImpl.filletAllEdgesImpl(args, ctx);

    default:
      throw new Error(`Unknown modeling tool: ${toolName}`);
  }
}
