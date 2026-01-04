/**
 * Viewer module - 3D CAD viewport
 *
 * Organized into:
 * - viewer-utils.ts: Pure helper functions (colors, planes, raycasting)
 * - sketch-helpers.ts: Sketch geometry helpers (arc direction, entity finding)
 * - plane-transform.ts: Plane coordinate transforms
 * - hooks/: Custom hooks for viewer logic
 * - renderers/: Rendering effect hooks
 * - Viewer.tsx: Main component (orchestration)
 */

export * from "./viewer-utils";
export * from "./sketch-helpers";
export * from "./plane-transform";

// Re-export hooks
export * from "./hooks";

// Re-export renderers (with renamed types to avoid conflicts)
export {
  useMeshRenderer,
  usePlaneRenderer,
  useOriginRenderer,
  useSketchRenderer,
  useSelectionRenderer,
  useConstraintRenderer,
  type MeshData,
  type BodyInfo,
  type Feature as RendererFeature,
  type MeshRendererOptions,
  type PlaneRendererOptions,
  type OriginRendererOptions,
  type SketchRendererOptions as RendererSketchRendererOptions,
  type SelectionRendererOptions,
  type ConstraintRendererOptions,
  type RendererPreviewShapes,
  type RendererFaceSelection,
  type RendererEdgeSelection,
  type RendererHoverTarget,
  type RendererDimensionDraggingState,
} from "./renderers";