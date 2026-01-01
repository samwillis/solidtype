/**
 * Naming module - Persistent naming subsystem
 *
 * Provides a first-class persistent naming system that:
 * - Associates semantic identities with created faces/edges
 * - Tracks evolution of subshapes through modeling steps
 * - Exposes PersistentRef handles for external consumers
 */

// Core types
export type {
  FeatureId,
  StepId,
  SubshapeType,
  SubshapeRef,
  FeatureLocalSelector,
  GeometryTopologyFingerprint,
  PersistentRef,
  EvolutionMapping,
  ResolveResult,
} from "./types.js";

export {
  // Type constructors
  asFeatureId,
  asStepId,

  // SubshapeRef constructors
  faceRef,
  edgeRef,
  vertexRef,

  // FeatureLocalSelector constructors
  extrudeTopCapSelector,
  extrudeBottomCapSelector,
  extrudeSideSelector,
  extrudeSideEdgeSelector,
  extrudeTopEdgeSelector,
  extrudeBottomEdgeSelector,
  revolveSideSelector,
  revolveStartCapSelector,
  revolveEndCapSelector,
  primitiveFaceSelector,
  booleanFaceFromASelector,
  booleanFaceFromBSelector,

  // Fingerprint constructors
  emptyFingerprint,

  // PersistentRef constructors
  createPersistentRef,

  // EvolutionMapping constructors
  birthMapping,
  deathMapping,
  modifyMapping,
  splitMapping,

  // ResolveResult constructors
  resolvedRef,
  notFoundRef,
  ambiguousRef,
} from "./types.js";

// Evolution and naming strategy
export type { NamingStrategy } from "./evolution.js";

export {
  DefaultNamingStrategy,
  createNamingStrategy,
  subshapeRefsMatch,
  computeSubshapeFingerprint,
  computeFaceFingerprint,
  computeEdgeFingerprint,
  fingerprintDistance,
  collectBodyFaceRefs,
} from "./evolution.js";
