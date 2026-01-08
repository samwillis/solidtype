/**
 * Kernel Module
 *
 * Provides kernel rebuild utilities including ReferenceIndex generation
 * and the reusable KernelEngine class.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 3-4
 */

export {
  // Types
  type FaceFingerprint,
  type EdgeFingerprint,
  type ProfileLoop,
  type SketchInfo,
  type BodyReferenceIndex,
  type ReferenceIndex,
  // Fingerprint computation
  computeFaceFingerprints,
  computeEdgeFingerprints,
  // Ref generation
  generateFaceRef,
  generateEdgeRef,
  // ReferenceIndex building
  buildBodyReferenceIndex,
  // Profile loop computation
  computeProfileLoops,
} from "./referenceIndex";

export {
  // KernelEngine class
  KernelEngine,
  // Types
  type KernelEngineOptions,
  type RebuildResult,
  type SketchSolveResult,
} from "./KernelEngine";
