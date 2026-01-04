/**
 * Viewer hooks - custom hooks for viewer logic
 */

export { useSceneSetup, type SceneGroups, type SceneSetupResult } from "./useSceneSetup";
export { useViewerControls, type ViewerControlsOptions } from "./useViewerControls";
export {
  use3DSelection,
  type FaceSelection,
  type EdgeSelection,
  type HoverTarget,
  type RaycastHit,
  type Selection3DOptions,
} from "./use3DSelection";
export {
  useSketchTools,
  type SketchPoint,
  type PreviewShapes,
  type SnapTarget,
  type DraggingEntity,
  type BoxSelection,
  type TangentSource,
  type SketchToolsOptions,
  type SketchToolsResult,
} from "./useSketchTools";
export {
  useDimensionEditing,
  type DimensionEditingState,
  type DimensionDraggingState,
  type DimensionEditingOptions,
  type DimensionEditingResult,
} from "./useDimensionEditing";
