/**
 * Persistent Naming Types
 *
 * This module defines the core types for the persistent naming subsystem.
 * The naming system allows faces, edges, and vertices to be referenced
 * stably across parametric edits and modeling operations.
 *
 * Design influences:
 * - Kripac's topological ID system
 * - OpenCascade's OCAF TNaming_NamedShape
 * - FreeCAD's topological naming improvements (realthunder)
 */

import type { Vec3 } from "../num/vec3.js";
import type { BodyId, FaceId, EdgeId, VertexId } from "../topo/handles.js";

// ============================================================================
// Branded IDs for the naming system
// ============================================================================

/**
 * Feature ID - identifies a modeling feature (extrude, revolve, boolean, etc.)
 *
 * Each modeling operation allocates a unique FeatureId to track
 * the entities it creates.
 */
export type FeatureId = number & { __brand: `FeatureId` };

/**
 * Step ID - identifies a step in the model history
 *
 * Each modeling operation that modifies existing geometry creates a new step.
 * Used for tracking evolution across operations.
 */
export type StepId = number & { __brand: `StepId` };

/**
 * Cast a number to a FeatureId
 * @internal Use with caution
 */
export function asFeatureId(id: number): FeatureId {
  return id as FeatureId;
}

/**
 * Cast a number to a StepId
 * @internal Use with caution
 */
export function asStepId(id: number): StepId {
  return id as StepId;
}

// ============================================================================
// Subshape Reference Types
// ============================================================================

/**
 * Type of subshape entity
 */
export type SubshapeType = `face` | `edge` | `vertex`;

/**
 * SubshapeRef - ephemeral reference to a topological entity
 *
 * This is an "internal" reference that's valid within a single model build.
 * External systems should use PersistentRef instead.
 */
export interface SubshapeRef {
  /** Body containing the subshape */
  body: BodyId;
  /** Type of the subshape */
  type: SubshapeType;
  /** The actual ID (FaceId, EdgeId, or VertexId depending on type) */
  id: FaceId | EdgeId | VertexId;
}

/**
 * Create a SubshapeRef for a face
 */
export function faceRef(body: BodyId, face: FaceId): SubshapeRef {
  return { body, type: `face`, id: face };
}

/**
 * Create a SubshapeRef for an edge
 */
export function edgeRef(body: BodyId, edge: EdgeId): SubshapeRef {
  return { body, type: `edge`, id: edge };
}

/**
 * Create a SubshapeRef for a vertex
 */
export function vertexRef(body: BodyId, vertex: VertexId): SubshapeRef {
  return { body, type: `vertex`, id: vertex };
}

// ============================================================================
// Feature-Local Selectors
// ============================================================================

/**
 * FeatureLocalSelector - identifies a subshape within the context of its creating feature
 *
 * This provides a stable path to identify which part of a feature a subshape
 * represents. Examples:
 * - Extrude top cap: { kind: 'extrude.topCap', data: { loop: 0 } }
 * - Extrude bottom cap: { kind: 'extrude.bottomCap', data: { loop: 0 } }
 * - Extrude side face: { kind: 'extrude.side', data: { loop: 0, segment: 2 } }
 * - Revolve side face: { kind: 'revolve.side', data: { segment: 0, ring: 1 } }
 */
export interface FeatureLocalSelector {
  /** Kind of the selector (feature.part notation) */
  kind: string;
  /** Additional data to disambiguate within the feature */
  data: Record<string, number | string>;
}

/**
 * Create a selector for an extrude top cap face
 */
export function extrudeTopCapSelector(loopIndex: number = 0): FeatureLocalSelector {
  return { kind: `extrude.topCap`, data: { loop: loopIndex } };
}

/**
 * Create a selector for an extrude bottom cap face
 */
export function extrudeBottomCapSelector(loopIndex: number = 0): FeatureLocalSelector {
  return { kind: `extrude.bottomCap`, data: { loop: loopIndex } };
}

/**
 * Create a selector for an extrude side face
 */
export function extrudeSideSelector(loopIndex: number, segmentIndex: number): FeatureLocalSelector {
  return { kind: `extrude.side`, data: { loop: loopIndex, segment: segmentIndex } };
}

/**
 * Create a selector for an extrude side edge (vertical edge)
 */
export function extrudeSideEdgeSelector(
  loopIndex: number,
  vertexIndex: number
): FeatureLocalSelector {
  return { kind: `extrude.sideEdge`, data: { loop: loopIndex, vertex: vertexIndex } };
}

/**
 * Create a selector for an extrude top edge
 */
export function extrudeTopEdgeSelector(
  loopIndex: number,
  segmentIndex: number
): FeatureLocalSelector {
  return { kind: `extrude.topEdge`, data: { loop: loopIndex, segment: segmentIndex } };
}

/**
 * Create a selector for an extrude bottom edge
 */
export function extrudeBottomEdgeSelector(
  loopIndex: number,
  segmentIndex: number
): FeatureLocalSelector {
  return { kind: `extrude.bottomEdge`, data: { loop: loopIndex, segment: segmentIndex } };
}

/**
 * Create a selector for a revolve side face
 */
export function revolveSideSelector(
  profileSegment: number,
  ringSegment: number
): FeatureLocalSelector {
  return { kind: `revolve.side`, data: { segment: profileSegment, ring: ringSegment } };
}

/**
 * Create a selector for a revolve start cap face
 */
export function revolveStartCapSelector(): FeatureLocalSelector {
  return { kind: `revolve.startCap`, data: {} };
}

/**
 * Create a selector for a revolve end cap face
 */
export function revolveEndCapSelector(): FeatureLocalSelector {
  return { kind: `revolve.endCap`, data: {} };
}

/**
 * Create a selector for a primitive face
 */
export function primitiveFaceSelector(faceIndex: number, faceName?: string): FeatureLocalSelector {
  const data: Record<string, number | string> = { index: faceIndex };
  if (faceName) data.name = faceName;
  return { kind: `primitive.face`, data };
}

/**
 * Create a selector for a boolean result face derived from body A
 */
export function booleanFaceFromASelector(originalFaceIndex: number): FeatureLocalSelector {
  return { kind: `boolean.faceFromA`, data: { originalIndex: originalFaceIndex } };
}

/**
 * Create a selector for a boolean result face derived from body B
 */
export function booleanFaceFromBSelector(originalFaceIndex: number): FeatureLocalSelector {
  return { kind: `boolean.faceFromB`, data: { originalIndex: originalFaceIndex } };
}

// ============================================================================
// Geometry/Topology Fingerprints
// ============================================================================

/**
 * GeometryTopologyFingerprint - compact descriptor for matching subshapes
 *
 * Used as a fallback when topology-based matching is ambiguous (e.g., splits).
 * Contains geometric and topological hints to help identify the "right" subshape.
 */
export interface GeometryTopologyFingerprint {
  /** Approximate centroid of the subshape */
  centroid: Vec3;
  /** Approximate area (for faces) or length (for edges) */
  approxAreaOrLength: number;
  /** Normal direction (for faces, normalized) */
  normal?: Vec3;
  /** Number of adjacent faces (for edges) or adjacent edges (for faces) */
  adjacentCount?: number;
  /** Hash of adjacent subshape fingerprints (for disambiguating similar shapes) */
  adjacencyHash?: number;
}

/**
 * Create an empty fingerprint (placeholder until computed)
 */
export function emptyFingerprint(): GeometryTopologyFingerprint {
  return {
    centroid: [0, 0, 0],
    approxAreaOrLength: 0,
  };
}

// ============================================================================
// Persistent References
// ============================================================================

/**
 * PersistentRef - stable reference to a subshape exposed to external consumers
 *
 * This is the main type that constraints, dimensions, and other features
 * should hold onto. It survives parametric edits and can be resolved
 * back to a current SubshapeRef.
 */
export interface PersistentRef {
  /** Feature that originally created this subshape */
  originFeatureId: FeatureId;
  /** Feature-local selector identifying the subshape within the feature */
  localSelector: FeatureLocalSelector;
  /** Optional geometry/topology fingerprint for disambiguation */
  fingerprint?: GeometryTopologyFingerprint;
  /** Type hint for the expected subshape type */
  expectedType: SubshapeType;
}

/**
 * Create a PersistentRef
 */
export function createPersistentRef(
  featureId: FeatureId,
  selector: FeatureLocalSelector,
  expectedType: SubshapeType,
  fingerprint?: GeometryTopologyFingerprint
): PersistentRef {
  return {
    originFeatureId: featureId,
    localSelector: selector,
    expectedType,
    fingerprint,
  };
}

// ============================================================================
// Evolution Mapping Types
// ============================================================================

/**
 * EvolutionMapping - describes how a subshape evolved through a modeling step
 *
 * Possible scenarios:
 * - Birth: old is null, news contains the newly created subshapes
 * - Death: old exists, news is empty (subshape was deleted)
 * - Split: old exists, news contains multiple (subshape was split)
 * - Merge: multiple olds map to single news (subshapes were merged)
 * - Modify: old exists, news contains exactly one (subshape was modified in place)
 * - Unchanged: old and news[0] are the same (no change)
 */
export interface EvolutionMapping {
  /** The original subshape (null for births) */
  old: SubshapeRef | null;
  /** The resulting subshapes (empty for deaths, multiple for splits) */
  news: SubshapeRef[];
  /** Optional description of the evolution type */
  evolutionType?: `birth` | `death` | `split` | `merge` | `modify` | `unchanged`;
}

/**
 * Create an evolution mapping for a birth
 */
export function birthMapping(newSubshapes: SubshapeRef[]): EvolutionMapping {
  return { old: null, news: newSubshapes, evolutionType: `birth` };
}

/**
 * Create an evolution mapping for a death
 */
export function deathMapping(oldSubshape: SubshapeRef): EvolutionMapping {
  return { old: oldSubshape, news: [], evolutionType: `death` };
}

/**
 * Create an evolution mapping for a modification
 */
export function modifyMapping(
  oldSubshape: SubshapeRef,
  newSubshape: SubshapeRef
): EvolutionMapping {
  return { old: oldSubshape, news: [newSubshape], evolutionType: `modify` };
}

/**
 * Create an evolution mapping for a split
 */
export function splitMapping(
  oldSubshape: SubshapeRef,
  newSubshapes: SubshapeRef[]
): EvolutionMapping {
  return { old: oldSubshape, news: newSubshapes, evolutionType: `split` };
}

// ============================================================================
// Resolution Results
// ============================================================================

/**
 * Result of resolving a PersistentRef
 */
export type ResolveResult =
  | { status: `found`; ref: SubshapeRef }
  | { status: `not_found`; reason: string }
  | { status: `ambiguous`; candidates: SubshapeRef[] };

/**
 * Create a successful resolve result
 */
export function resolvedRef(ref: SubshapeRef): ResolveResult {
  return { status: `found`, ref };
}

/**
 * Create a not-found resolve result
 */
export function notFoundRef(reason: string): ResolveResult {
  return { status: `not_found`, reason };
}

/**
 * Create an ambiguous resolve result
 */
export function ambiguousRef(candidates: SubshapeRef[]): ResolveResult {
  return { status: `ambiguous`, candidates };
}
