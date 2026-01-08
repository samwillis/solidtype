/**
 * Commands Module
 *
 * This is the canonical API for mutating the Yjs document.
 * Both UI interactions and AI tool calls should use these commands
 * to ensure consistent behavior across all mutation paths.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 1, 6
 */

// Re-export types
export type { CommandResult } from "./types";
export { ok, err } from "./types";

// Re-export modeling commands
export {
  // Sketch
  createSketch,
  type CreateSketchArgs,
  // Extrude
  createExtrude,
  type CreateExtrudeArgs,
  // Revolve
  createRevolve,
  type CreateRevolveArgs,
  // Boolean
  createBoolean,
  type CreateBooleanArgs,
  // Offset Plane
  createOffsetPlane,
  type CreateOffsetPlaneArgs,
  // Axis
  createAxis,
  type CreateAxisArgs,
  // Feature Modification
  modifyFeatureParam,
  type ModifyFeatureParamArgs,
  deleteFeature,
  type DeleteFeatureArgs,
  renameFeature,
  type RenameFeatureArgs,
  suppressFeature,
  type SuppressFeatureArgs,
  reorderFeature,
  type ReorderFeatureArgs,
  setVisibility,
  type SetVisibilityArgs,
  toggleVisibility,
  type ToggleVisibilityArgs,
} from "./modeling";

// Re-export repair commands (Phase 6)
export {
  repairReference,
  type RepairReferenceArgs,
  clearReference,
  type ClearReferenceArgs,
  updateReferenceSetPreferred,
} from "./repair";
