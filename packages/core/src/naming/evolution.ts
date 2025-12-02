/**
 * Evolution Graph and Naming Strategy
 * 
 * This module implements the persistent naming strategy that tracks how
 * subshapes evolve through modeling operations. It provides the mechanism
 * for resolving PersistentRef handles back to current SubshapeRef handles.
 * 
 * Design influences:
 * - OpenCascade's OCAF TNaming module (old/new shape pairs)
 * - FreeCAD's topological naming improvements (graph-based matching)
 * - Research on hybrid topology+geometry matching approaches
 */

import type { Vec3 } from '../num/vec3.js';
import { dot3, sub3 } from '../num/vec3.js';
import type { TopoModel } from '../topo/model.js';
import type { BodyId, FaceId, EdgeId } from '../topo/handles.js';
import {
  getBodyShells,
  getShellFaces,
  getFaceLoops,
  getLoopFirstHalfEdge,
  getHalfEdgeNext,
  getHalfEdgeStartVertex,
  getVertexPosition,
  getFaceSurfaceIndex,
  getSurface,
  isNullId,
  isFaceReversed,
  getEdgeStartVertex,
  getEdgeEndVertex,
} from '../topo/model.js';
import { surfaceNormal } from '../geom/surface.js';
import type {
  FeatureId,
  StepId,
  FeatureLocalSelector,
  SubshapeRef,
  PersistentRef,
  EvolutionMapping,
  GeometryTopologyFingerprint,
  ResolveResult,
} from './types.js';
import {
  asFeatureId,
  asStepId,
  createPersistentRef,
  resolvedRef,
  notFoundRef,
  ambiguousRef,
} from './types.js';

// ============================================================================
// NamingStrategy Interface
// ============================================================================

/**
 * NamingStrategy - interface for persistent naming implementations
 * 
 * This is intentionally pluggable to allow experimentation with different
 * algorithms and heuristics.
 */
export interface NamingStrategy {
  /**
   * Record the birth of a new subshape from a feature
   * 
   * @param featureId The feature that created the subshape
   * @param selector The feature-local selector
   * @param subshape The current SubshapeRef
   * @param fingerprint Optional geometry/topology fingerprint
   * @returns A PersistentRef that can be used to find this subshape later
   */
  recordBirth(
    featureId: FeatureId,
    selector: FeatureLocalSelector,
    subshape: SubshapeRef,
    fingerprint?: GeometryTopologyFingerprint
  ): PersistentRef;

  /**
   * Record the evolution of subshapes through a modeling step
   * 
   * @param stepId The step ID for this operation
   * @param mappings Array of evolution mappings
   */
  recordEvolution(stepId: StepId, mappings: EvolutionMapping[]): void;

  /**
   * Resolve a PersistentRef to a current SubshapeRef
   * 
   * @param ref The persistent reference to resolve
   * @param model The current topology model
   * @returns The resolved SubshapeRef, or ambiguous/not_found status
   */
  resolve(ref: PersistentRef, model: TopoModel): ResolveResult;

  /**
   * Allocate a new FeatureId
   */
  allocateFeatureId(): FeatureId;

  /**
   * Allocate a new StepId
   */
  allocateStepId(): StepId;

  /**
   * Get all PersistentRefs created by a feature
   */
  getFeatureRefs(featureId: FeatureId): PersistentRef[];

  /**
   * Look up an existing PersistentRef for a subshape (reverse lookup)
   * 
   * @param subshape The current subshape reference
   * @returns The PersistentRef if one exists, or null
   */
  lookupRefForSubshape(subshape: SubshapeRef): PersistentRef | null;

  /**
   * Update body ID mapping (call when bodies are recreated during rebuild)
   * 
   * @param oldBody The old body ID
   * @param newBody The new body ID
   */
  updateBodyMapping(oldBody: BodyId, newBody: BodyId): void;

  /**
   * Clear all naming data (for testing or reset)
   */
  clear(): void;
}

// ============================================================================
// Birth Record
// ============================================================================

/**
 * Internal record of a subshape birth
 */
interface BirthRecord {
  /** The feature that created the subshape */
  featureId: FeatureId;
  /** Feature-local selector */
  selector: FeatureLocalSelector;
  /** Original SubshapeRef at time of birth */
  originalSubshape: SubshapeRef;
  /** Geometry/topology fingerprint */
  fingerprint?: GeometryTopologyFingerprint;
  /** The PersistentRef assigned */
  persistentRef: PersistentRef;
}

// ============================================================================
// Evolution Step Record
// ============================================================================

/**
 * Internal record of an evolution step
 */
interface EvolutionStep {
  stepId: StepId;
  mappings: EvolutionMapping[];
}

// ============================================================================
// Default Naming Strategy Implementation
// ============================================================================

/**
 * DefaultNamingStrategy - basic implementation of persistent naming
 * 
 * This implementation:
 * - Stores birth records per feature
 * - Tracks evolution mappings per step
 * - Resolves refs by walking the evolution graph from birth to current
 * - Uses fingerprint similarity as tie-breaker for splits
 * - Maintains reverse lookup from (BodyId, SubshapeId) → PersistentRef
 */
export class DefaultNamingStrategy implements NamingStrategy {
  /** Birth records indexed by feature ID */
  private birthsByFeature: Map<FeatureId, BirthRecord[]> = new Map();
  
  /** All birth records indexed by a key derived from selector */
  private birthsBySelector: Map<string, BirthRecord> = new Map();
  
  /** Reverse lookup: (body:type:id) → PersistentRef */
  private refsBySubshape: Map<string, PersistentRef> = new Map();
  
  /** Evolution steps in order */
  private evolutionSteps: EvolutionStep[] = [];
  
  /** Next feature ID to allocate */
  private nextFeatureId: number = 0;
  
  /** Next step ID to allocate */
  private nextStepId: number = 0;
  
  /** Current body mapping (updated when bodies are recreated) */
  private currentBodyMap: Map<BodyId, BodyId> = new Map();

  /**
   * Create a new DefaultNamingStrategy
   */
  constructor() {}

  /**
   * Generate a unique key for a birth record
   */
  private birthKey(featureId: FeatureId, selector: FeatureLocalSelector): string {
    return `${featureId}:${selector.kind}:${JSON.stringify(selector.data)}`;
  }

  /**
   * Generate a key for a subshape reference (for reverse lookup)
   */
  private subshapeKey(ref: SubshapeRef): string {
    return `${ref.body}:${ref.type}:${ref.id}`;
  }

  /**
   * Record the birth of a new subshape from a feature
   */
  recordBirth(
    featureId: FeatureId,
    selector: FeatureLocalSelector,
    subshape: SubshapeRef,
    fingerprint?: GeometryTopologyFingerprint
  ): PersistentRef {
    // Create the persistent reference
    const persistentRef = createPersistentRef(
      featureId,
      selector,
      subshape.type,
      fingerprint
    );

    // Create and store the birth record
    const record: BirthRecord = {
      featureId,
      selector,
      originalSubshape: { ...subshape },
      fingerprint,
      persistentRef,
    };

    // Index by feature
    const featureRecords = this.birthsByFeature.get(featureId) || [];
    featureRecords.push(record);
    this.birthsByFeature.set(featureId, featureRecords);

    // Index by selector
    const key = this.birthKey(featureId, selector);
    this.birthsBySelector.set(key, record);

    // Index by subshape for reverse lookup
    const subshapeKeyStr = this.subshapeKey(subshape);
    this.refsBySubshape.set(subshapeKeyStr, persistentRef);

    return persistentRef;
  }

  /**
   * Record the evolution of subshapes through a modeling step
   * 
   * This updates the reverse lookup to track where PersistentRefs moved to
   */
  recordEvolution(stepId: StepId, mappings: EvolutionMapping[]): void {
    // Update reverse lookup based on evolution mappings
    for (const mapping of mappings) {
      if (mapping.old && mapping.news.length > 0) {
        const oldKey = this.subshapeKey(mapping.old);
        const existingRef = this.refsBySubshape.get(oldKey);
        
        if (existingRef) {
          // Remove old mapping
          this.refsBySubshape.delete(oldKey);
          
          // Add new mappings for each evolved subshape
          // If split, they all point to the same original ref
          for (const newSubshape of mapping.news) {
            const newKey = this.subshapeKey(newSubshape);
            this.refsBySubshape.set(newKey, existingRef);
          }
        }
      }
    }
    
    this.evolutionSteps.push({ stepId, mappings });
  }

  /**
   * Resolve a PersistentRef to a current SubshapeRef
   */
  resolve(ref: PersistentRef, model: TopoModel): ResolveResult {
    // Look up the birth record
    const key = this.birthKey(ref.originFeatureId, ref.localSelector);
    const birthRecord = this.birthsBySelector.get(key);

    if (!birthRecord) {
      return notFoundRef(`No birth record found for feature ${ref.originFeatureId}`);
    }

    // Start with the original subshape
    let currentRefs: SubshapeRef[] = [birthRecord.originalSubshape];

    // Walk through evolution steps
    for (const step of this.evolutionSteps) {
      const nextRefs: SubshapeRef[] = [];

      for (const currentRef of currentRefs) {
        // Find mappings that involve this subshape
        let foundMapping = false;
        for (const mapping of step.mappings) {
          if (mapping.old && subshapeRefsMatch(mapping.old, currentRef)) {
            // This subshape was transformed
            nextRefs.push(...mapping.news);
            foundMapping = true;
            break;
          }
        }

        // If no mapping was found, the subshape persists unchanged
        if (!foundMapping) {
          nextRefs.push(currentRef);
        }
      }

      currentRefs = nextRefs;

      // Early exit if we lost all candidates
      if (currentRefs.length === 0) {
        return notFoundRef('Subshape was deleted during evolution');
      }
    }

    // Apply body mapping if available
    currentRefs = currentRefs.map(r => ({
      ...r,
      body: this.currentBodyMap.get(r.body) ?? r.body,
    }));

    // Handle the result
    if (currentRefs.length === 0) {
      return notFoundRef('Subshape no longer exists');
    }

    if (currentRefs.length === 1) {
      return resolvedRef(currentRefs[0]);
    }

    // Multiple candidates - try to disambiguate using fingerprint
    if (ref.fingerprint) {
      const bestMatch = this.findBestFingerprintMatch(currentRefs, ref.fingerprint, model);
      if (bestMatch) {
        return resolvedRef(bestMatch);
      }
    }

    // Still ambiguous
    return ambiguousRef(currentRefs);
  }

  /**
   * Find the best matching subshape based on fingerprint similarity
   */
  private findBestFingerprintMatch(
    candidates: SubshapeRef[],
    targetFingerprint: GeometryTopologyFingerprint,
    model: TopoModel
  ): SubshapeRef | null {
    let bestCandidate: SubshapeRef | null = null;
    let bestScore = Infinity;

    for (const candidate of candidates) {
      const candidateFingerprint = computeSubshapeFingerprint(model, candidate);
      if (!candidateFingerprint) continue;

      const score = fingerprintDistance(targetFingerprint, candidateFingerprint);
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    // Only return if we have a good match (threshold based on model scale)
    const threshold = 0.1 * (targetFingerprint.approxAreaOrLength || 1);
    return bestScore < threshold ? bestCandidate : null;
  }

  /**
   * Allocate a new FeatureId
   */
  allocateFeatureId(): FeatureId {
    return asFeatureId(this.nextFeatureId++);
  }

  /**
   * Allocate a new StepId
   */
  allocateStepId(): StepId {
    return asStepId(this.nextStepId++);
  }

  /**
   * Get all PersistentRefs created by a feature
   */
  getFeatureRefs(featureId: FeatureId): PersistentRef[] {
    const records = this.birthsByFeature.get(featureId) || [];
    return records.map(r => r.persistentRef);
  }

  /**
   * Update the body mapping (call when bodies are recreated)
   */
  updateBodyMapping(oldBody: BodyId, newBody: BodyId): void {
    this.currentBodyMap.set(oldBody, newBody);
    
    // Also update the reverse lookup to use new body IDs
    const keysToUpdate: Array<{ oldKey: string; newKey: string; ref: PersistentRef }> = [];
    
    for (const [key, ref] of this.refsBySubshape) {
      // Parse the key to check if it references the old body
      const [bodyStr, type, id] = key.split(':');
      const body = parseInt(bodyStr, 10) as BodyId;
      
      if (body === oldBody) {
        const newKey = `${newBody}:${type}:${id}`;
        keysToUpdate.push({ oldKey: key, newKey, ref });
      }
    }
    
    for (const { oldKey, newKey, ref } of keysToUpdate) {
      this.refsBySubshape.delete(oldKey);
      this.refsBySubshape.set(newKey, ref);
    }
  }

  /**
   * Clear all body mappings
   */
  clearBodyMappings(): void {
    this.currentBodyMap.clear();
  }

  /**
   * Look up an existing PersistentRef for a subshape
   * 
   * This is the reverse lookup - given a current subshape, find its PersistentRef
   * 
   * @param subshape The current subshape reference
   * @returns The PersistentRef if one exists, or null
   */
  lookupRefForSubshape(subshape: SubshapeRef): PersistentRef | null {
    const key = this.subshapeKey(subshape);
    return this.refsBySubshape.get(key) ?? null;
  }

  /**
   * Clear all naming data
   */
  clear(): void {
    this.birthsByFeature.clear();
    this.birthsBySelector.clear();
    this.refsBySubshape.clear();
    this.evolutionSteps = [];
    this.currentBodyMap.clear();
    this.nextFeatureId = 0;
    this.nextStepId = 0;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if two SubshapeRefs match
 */
export function subshapeRefsMatch(a: SubshapeRef, b: SubshapeRef): boolean {
  return a.body === b.body && a.type === b.type && a.id === b.id;
}

/**
 * Compute the fingerprint of a subshape
 */
export function computeSubshapeFingerprint(
  model: TopoModel,
  ref: SubshapeRef
): GeometryTopologyFingerprint | null {
  if (ref.type === 'face') {
    return computeFaceFingerprint(model, ref.id as FaceId);
  } else if (ref.type === 'edge') {
    return computeEdgeFingerprint(model, ref.id as EdgeId);
  }
  // Vertices don't have meaningful fingerprints beyond position
  return null;
}

/**
 * Compute the fingerprint of a face
 */
export function computeFaceFingerprint(
  model: TopoModel,
  faceId: FaceId
): GeometryTopologyFingerprint {
  // Get face centroid
  const loops = getFaceLoops(model, faceId);
  let centroidSum: Vec3 = [0, 0, 0];
  let vertexCount = 0;
  let adjacentCount = 0;

  for (const loopId of loops) {
    const firstHe = getLoopFirstHalfEdge(model, loopId);
    if (isNullId(firstHe)) continue;

    let he = firstHe;
    do {
      const vertex = getHalfEdgeStartVertex(model, he);
      const pos = getVertexPosition(model, vertex);
      centroidSum = [
        centroidSum[0] + pos[0],
        centroidSum[1] + pos[1],
        centroidSum[2] + pos[2],
      ];
      vertexCount++;
      adjacentCount++; // Each half-edge corresponds to an adjacent edge
      he = getHalfEdgeNext(model, he);
    } while (he !== firstHe && !isNullId(he));
  }

  const centroid: Vec3 = vertexCount > 0
    ? [centroidSum[0] / vertexCount, centroidSum[1] / vertexCount, centroidSum[2] / vertexCount]
    : [0, 0, 0];

  // Get face normal
  const surfaceIdx = getFaceSurfaceIndex(model, faceId);
  const surface = getSurface(model, surfaceIdx);
  let normal = surfaceNormal(surface, 0, 0);
  if (isFaceReversed(model, faceId)) {
    normal = [-normal[0], -normal[1], -normal[2]];
  }

  // Approximate area (using vertex count as a simple proxy for planar faces)
  // More sophisticated implementations would compute actual area
  const approxArea = computeFaceApproxArea(model, faceId);

  return {
    centroid,
    approxAreaOrLength: approxArea,
    normal,
    adjacentCount,
  };
}

/**
 * Compute approximate face area
 */
function computeFaceApproxArea(model: TopoModel, faceId: FaceId): number {
  const loops = getFaceLoops(model, faceId);
  if (loops.length === 0) return 0;

  const outerLoop = loops[0];
  const firstHe = getLoopFirstHalfEdge(model, outerLoop);
  if (isNullId(firstHe)) return 0;

  // Collect vertices
  const vertices: Vec3[] = [];
  let he = firstHe;
  do {
    const vertex = getHalfEdgeStartVertex(model, he);
    vertices.push(getVertexPosition(model, vertex));
    he = getHalfEdgeNext(model, he);
  } while (he !== firstHe && !isNullId(he));

  if (vertices.length < 3) return 0;

  // Compute area using the shoelace formula (projected)
  // For 3D, we use the cross product of vectors from centroid
  const centroid: Vec3 = [
    vertices.reduce((sum, v) => sum + v[0], 0) / vertices.length,
    vertices.reduce((sum, v) => sum + v[1], 0) / vertices.length,
    vertices.reduce((sum, v) => sum + v[2], 0) / vertices.length,
  ];

  let totalArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const v0 = sub3(vertices[i], centroid);
    const v1 = sub3(vertices[j], centroid);
    // Cross product magnitude / 2
    const cross: Vec3 = [
      v0[1] * v1[2] - v0[2] * v1[1],
      v0[2] * v1[0] - v0[0] * v1[2],
      v0[0] * v1[1] - v0[1] * v1[0],
    ];
    totalArea += Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2) / 2;
  }

  return totalArea;
}

/**
 * Compute the fingerprint of an edge
 */
export function computeEdgeFingerprint(
  model: TopoModel,
  edgeId: EdgeId
): GeometryTopologyFingerprint {
  const startVertex = getEdgeStartVertex(model, edgeId);
  const endVertex = getEdgeEndVertex(model, edgeId);
  
  const startPos = getVertexPosition(model, startVertex);
  const endPos = getVertexPosition(model, endVertex);

  // Centroid is midpoint
  const centroid: Vec3 = [
    (startPos[0] + endPos[0]) / 2,
    (startPos[1] + endPos[1]) / 2,
    (startPos[2] + endPos[2]) / 2,
  ];

  // Length
  const dx = endPos[0] - startPos[0];
  const dy = endPos[1] - startPos[1];
  const dz = endPos[2] - startPos[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    centroid,
    approxAreaOrLength: length,
    // Edges typically have 2 adjacent faces (for manifold solids)
    adjacentCount: 2,
  };
}

/**
 * Compute the distance between two fingerprints
 * Lower is more similar
 * 
 * Weighting rationale:
 * - Centroid position is the most reliable discriminator (weight 1.0)
 * - Relative size difference is less reliable due to mesh variations (weight 0.5)
 * - Normal direction is highly reliable for faces (weight 2.0)
 * - Adjacent count can help but varies with topology changes (weight 0.2)
 * 
 * All values are normalized to roughly similar scales before weighting.
 */
export function fingerprintDistance(
  a: GeometryTopologyFingerprint,
  b: GeometryTopologyFingerprint
): number {
  // Centroid distance (in model units)
  const dx = a.centroid[0] - b.centroid[0];
  const dy = a.centroid[1] - b.centroid[1];
  const dz = a.centroid[2] - b.centroid[2];
  const centroidDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Size difference (normalized to 0-1 range)
  const maxSize = Math.max(a.approxAreaOrLength, b.approxAreaOrLength, 0.001);
  const sizeRatio = Math.abs(a.approxAreaOrLength - b.approxAreaOrLength) / maxSize;

  // Normal difference (0 for same direction, 2 for opposite)
  let normalDiff = 0;
  if (a.normal && b.normal) {
    normalDiff = 1 - dot3(a.normal, b.normal);
  }

  // Adjacent count difference (normalized)
  let adjacentDiff = 0;
  if (a.adjacentCount !== undefined && b.adjacentCount !== undefined) {
    const maxAdj = Math.max(a.adjacentCount, b.adjacentCount, 1);
    adjacentDiff = Math.abs(a.adjacentCount - b.adjacentCount) / maxAdj;
  }

  // Weighted sum with documented rationale
  const WEIGHT_CENTROID = 1.0;
  const WEIGHT_SIZE = 0.5;
  const WEIGHT_NORMAL = 2.0;
  const WEIGHT_ADJACENT = 0.2;

  return (
    centroidDist * WEIGHT_CENTROID +
    sizeRatio * WEIGHT_SIZE +
    normalDiff * WEIGHT_NORMAL +
    adjacentDiff * WEIGHT_ADJACENT
  );
}

// ============================================================================
// Helper Functions for Integration
// ============================================================================

/**
 * Get all faces in a body
 */
export function collectBodyFaceRefs(model: TopoModel, bodyId: BodyId): SubshapeRef[] {
  const refs: SubshapeRef[] = [];
  const shells = getBodyShells(model, bodyId);
  
  for (const shellId of shells) {
    const faces = getShellFaces(model, shellId);
    for (const faceId of faces) {
      refs.push({ body: bodyId, type: 'face', id: faceId });
    }
  }
  
  return refs;
}

/**
 * Create a default naming strategy instance
 */
export function createNamingStrategy(): NamingStrategy {
  return new DefaultNamingStrategy();
}
