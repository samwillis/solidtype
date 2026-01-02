/**
 * Object-Oriented API for SolidType
 *
 * This module provides ergonomic class-based APIs for the SolidType CAD kernel:
 * - SolidSession - main entry point for modeling operations
 * - Sketch - 2D sketch with constraint solving
 * - BodyId, FaceId, EdgeId - opaque handles for topological entities
 *
 * The underlying CAD kernel (OpenCascade.js) is completely hidden.
 * All operations are done through SolidSession.
 */

// Main session API
export { SolidSession } from "./SolidSession.js";

// Sketch API
export { Sketch } from "./Sketch.js";

// OCCT initialization (for external initialization in browser/worker)
export { setOC, initOCCT } from "../kernel/init.js";

// Types
export type {
  Ray,
  BodyId,
  FaceId,
  EdgeId,
  Mesh,
  BoundingBox,
  OperationResult,
  ModelingError,
  ExtrudeOperation,
  ExtrudeOptions,
  RevolveOptions,
  FilletOptions,
} from "./types.js";

// Re-export tessellation quality and face plane data for convenience
export type { TessellationQuality, FacePlaneData } from "../kernel/tessellate.js";
