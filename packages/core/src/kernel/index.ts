/**
 * Kernel Module - Internal OCCT Implementation
 * 
 * This module wraps OpenCascade.js and provides the internal implementation
 * for the SolidSession public API.
 * 
 * ⚠️ NOT EXPORTED from @solidtype/core - this is an internal implementation detail.
 * 
 * The public API (SolidSession, Body, Face, etc.) in api/ uses these functions
 * but apps should never import from kernel/ directly.
 */

// Initialization
export { initOCCT, getOC, isOCCTInitialized, setOC } from './init.js';

// Shape wrapper
export { Shape } from './Shape.js';

// Primitives
export { makeBox, makeCylinder, makeSphere, makeCone, makeTorus } from './primitives.js';

// Operations
export { 
  booleanOp, 
  extrude, 
  extrudeSymmetric,
  revolve, 
  filletAllEdges, 
  filletEdges,
  chamferAllEdges,
  translate,
  rotate,
  type BooleanOp,
  type BooleanResult,
} from './operations.js';

// Sketch conversion
export { 
  sketchProfileToFace, 
  createRectangleFace, 
  createCircleFace, 
  createPolygonFace,
  getPlaneNormal,
} from './sketch-to-wire.js';

// Tessellation
export { 
  tessellate, 
  tessellateWithParams,
  getBoundingBox,
  type TessellatedMesh,
  type TessellationQuality,
} from './tessellate.js';

// Import/Export
export {
  exportSTEP,
  importSTEP,
  exportBREP,
  importBREP,
  type ImportResult,
} from './io.js';
