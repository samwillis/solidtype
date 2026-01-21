/**
 * ReferenceIndex — Maps mesh indices to PersistentRefs
 *
 * This module provides functionality to:
 * 1. Compute fingerprints from tessellated mesh data
 * 2. Generate PersistentRefs for each face/edge
 * 3. Build a ReferenceIndex during kernel rebuild
 *
 * The ReferenceIndex is a rebuild artifact (not persisted in Yjs),
 * recomputed every time the model is rebuilt.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 3
 */

import { encodePersistentRef, computeLoopId, type PersistentRefV1 } from "../naming/persistentRef";

// ============================================================================
// Types
// ============================================================================

/**
 * Fingerprint for a single face
 */
export interface FaceFingerprint {
  /** Approximate centroid [x, y, z] */
  centroid: [number, number, number];
  /** Approximate area */
  size: number;
  /** Surface normal [nx, ny, nz] (averaged) */
  normal: [number, number, number];
}

/**
 * Fingerprint for a single edge
 */
export interface EdgeFingerprint {
  /** Approximate midpoint [x, y, z] */
  centroid: [number, number, number];
  /** Approximate length */
  size: number;
}

/**
 * Information about a sketch profile loop
 */
export interface ProfileLoop {
  /** Stable loop identifier */
  loopId: string;
  /** Entity UUIDs in the loop, in canonical order */
  entityIds: string[];
}

/**
 * Sketch info passed to ref generation
 */
export interface SketchInfo {
  /** Profile loops in the sketch */
  profileLoops: ProfileLoop[];
}

/**
 * Origin information for a face, tracking which sketch entity created it.
 */
export interface FaceOriginInfo {
  /** The feature that created this face */
  sourceFeatureId: string;
  /** The sketch entity UUID that created this face (for side faces) */
  entityId?: string;
  /** The type of face (topCap, bottomCap, side) */
  faceType: "topCap" | "bottomCap" | "side" | "unknown";
}

/**
 * OCCT operation history for Phase 8 persistent naming.
 * Maps profile edges to generated faces using OCCT's Generated() API.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8
 */
export interface OCCTHistory {
  /** Hash of the bottom cap face (from FirstShape) */
  bottomCapHash?: number;
  /** Hash of the top cap face (from LastShape) */
  topCapHash?: number;
  /**
   * Mappings from profile edge index to generated face hash.
   * Used to associate sketch entity UUIDs with result faces.
   */
  sideFaceMappings: Array<{
    profileEdgeIndex: number;
    generatedFaceHash: number;
  }>;
  /**
   * Mapping from current face hash to its origin.
   * Updated when faces are modified through boolean operations.
   * This enables tracking faces through multiple booleans.
   */
  faceHashToOrigin?: Map<number, FaceOriginInfo>;
}

/**
 * Extended tessellation data for Phase 8.
 * Includes face/edge hashes for OCCT history matching.
 */
export interface TessellationWithHashes {
  faceHashes: Uint32Array;
  edgeHashes: Uint32Array;
}

/**
 * ReferenceIndex for a single body
 */
export interface BodyReferenceIndex {
  /** Encoded PersistentRef strings, indexed by face index */
  faces: string[];
  /** Encoded PersistentRef strings, indexed by edge index */
  edges: string[];
}

/**
 * Complete ReferenceIndex for all bodies in a rebuild
 */
export type ReferenceIndex = Record<string, BodyReferenceIndex>;

// ============================================================================
// Fingerprint Computation
// ============================================================================

/**
 * Compute face fingerprints from mesh data
 *
 * @param positions - Float32Array of vertex positions [x,y,z,x,y,z,...]
 * @param normals - Float32Array of vertex normals [nx,ny,nz,...]
 * @param indices - Uint32Array of triangle indices
 * @param faceMap - Uint32Array mapping triangle index to face index
 * @returns Array of FaceFingerprint, indexed by face index
 */
export function computeFaceFingerprints(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  faceMap: Uint32Array
): FaceFingerprint[] {
  // Handle empty input
  if (faceMap.length === 0) {
    return [];
  }

  // Determine number of faces
  let maxFaceIndex = 0;
  for (let i = 0; i < faceMap.length; i++) {
    if (faceMap[i] > maxFaceIndex) {
      maxFaceIndex = faceMap[i];
    }
  }
  const faceCount = maxFaceIndex + 1;

  // Initialize accumulators for each face
  const centroids: [number, number, number][] = [];
  const normals_: [number, number, number][] = [];
  const areas: number[] = [];
  const counts: number[] = [];

  for (let i = 0; i < faceCount; i++) {
    centroids.push([0, 0, 0]);
    normals_.push([0, 0, 0]);
    areas.push(0);
    counts.push(0);
  }

  // Process each triangle
  const triCount = Math.floor(indices.length / 3);
  for (let t = 0; t < triCount; t++) {
    const faceIdx = faceMap[t];
    if (faceIdx >= faceCount) continue;

    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    // Get vertices
    const v0: [number, number, number] = [positions[i0], positions[i0 + 1], positions[i0 + 2]];
    const v1: [number, number, number] = [positions[i1], positions[i1 + 1], positions[i1 + 2]];
    const v2: [number, number, number] = [positions[i2], positions[i2 + 1], positions[i2 + 2]];

    // Compute triangle centroid
    const cx = (v0[0] + v1[0] + v2[0]) / 3;
    const cy = (v0[1] + v1[1] + v2[1]) / 3;
    const cz = (v0[2] + v1[2] + v2[2]) / 3;

    // Compute triangle area using cross product
    const e1: [number, number, number] = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2: [number, number, number] = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const cross: [number, number, number] = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const area = 0.5 * Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);

    // Accumulate (area-weighted for centroid)
    centroids[faceIdx][0] += cx * area;
    centroids[faceIdx][1] += cy * area;
    centroids[faceIdx][2] += cz * area;
    areas[faceIdx] += area;
    counts[faceIdx]++;

    // Accumulate normals (using first vertex normal for simplicity)
    normals_[faceIdx][0] += normals[i0];
    normals_[faceIdx][1] += normals[i0 + 1];
    normals_[faceIdx][2] += normals[i0 + 2];
  }

  // Finalize fingerprints
  const fingerprints: FaceFingerprint[] = [];
  for (let i = 0; i < faceCount; i++) {
    const totalArea = areas[i];
    const _count = counts[i]; // Unused, but kept for potential future use

    // Centroid (area-weighted average)
    const centroid: [number, number, number] =
      totalArea > 0
        ? [centroids[i][0] / totalArea, centroids[i][1] / totalArea, centroids[i][2] / totalArea]
        : [0, 0, 0];

    // Normal (normalized average)
    const nx = normals_[i][0];
    const ny = normals_[i][1];
    const nz = normals_[i][2];
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const normal: [number, number, number] =
      nLen > 0 ? [nx / nLen, ny / nLen, nz / nLen] : [0, 0, 1];

    fingerprints.push({
      centroid,
      size: totalArea,
      normal,
    });
  }

  return fingerprints;
}

/**
 * Compute edge fingerprints from edge line segments
 *
 * @param edges - Float32Array of edge segments [x1,y1,z1,x2,y2,z2,...]
 * @param edgeMap - Uint32Array mapping edge segment to edge index
 * @returns Array of EdgeFingerprint, indexed by edge index
 */
export function computeEdgeFingerprints(
  edges: Float32Array,
  edgeMap: Uint32Array
): EdgeFingerprint[] {
  // Handle empty input
  if (edgeMap.length === 0) {
    return [];
  }

  // Determine number of edges
  let maxEdgeIndex = 0;
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] > maxEdgeIndex) {
      maxEdgeIndex = edgeMap[i];
    }
  }
  const edgeCount = maxEdgeIndex + 1;

  // Initialize accumulators
  const centroids: [number, number, number][] = [];
  const lengths: number[] = [];
  const counts: number[] = [];

  for (let i = 0; i < edgeCount; i++) {
    centroids.push([0, 0, 0]);
    lengths.push(0);
    counts.push(0);
  }

  // Process each edge segment
  const segCount = Math.floor(edges.length / 6);
  for (let s = 0; s < segCount; s++) {
    if (s >= edgeMap.length) break;

    const edgeIdx = edgeMap[s];
    if (edgeIdx >= edgeCount) continue;

    const base = s * 6;
    const x1 = edges[base];
    const y1 = edges[base + 1];
    const z1 = edges[base + 2];
    const x2 = edges[base + 3];
    const y2 = edges[base + 4];
    const z2 = edges[base + 5];

    // Segment midpoint
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const mz = (z1 + z2) / 2;

    // Segment length
    const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);

    // Accumulate (length-weighted)
    centroids[edgeIdx][0] += mx * len;
    centroids[edgeIdx][1] += my * len;
    centroids[edgeIdx][2] += mz * len;
    lengths[edgeIdx] += len;
    counts[edgeIdx]++;
  }

  // Finalize fingerprints
  const fingerprints: EdgeFingerprint[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const totalLen = lengths[i];

    const centroid: [number, number, number] =
      totalLen > 0
        ? [centroids[i][0] / totalLen, centroids[i][1] / totalLen, centroids[i][2] / totalLen]
        : [0, 0, 0];

    fingerprints.push({
      centroid,
      size: totalLen,
    });
  }

  return fingerprints;
}

// ============================================================================
// PersistentRef Generation
// ============================================================================

/**
 * Options for generateFaceRef with Phase 8 OCCT history support.
 */
export interface GenerateFaceRefOptions {
  featureId: string;
  featureType: string;
  faceIdx: number;
  fingerprint: FaceFingerprint;
  sketchInfo?: SketchInfo;
  /** Phase 8: OCCT history for accurate side face matching */
  occtHistory?: OCCTHistory;
  /** Phase 8: Face hash from tessellateWithHashes for history lookup */
  faceHash?: number;
  /** Phase 8: Mapping from profile edge index to sketch entity ID */
  profileEdgeToEntityId?: Map<number, string>;
}

/**
 * Generate a PersistentRef for a face
 *
 * Uses the feature type to determine the appropriate localSelector kind.
 * When OCCT history is available (Phase 8), uses it to accurately map
 * side faces to their generating sketch entities.
 *
 * @param featureId - UUID of the originating feature
 * @param featureType - Type of the feature (extrude, revolve, etc.)
 * @param faceIdx - Index of the face in the tessellation
 * @param fingerprint - Computed fingerprint for this face
 * @param sketchInfo - Optional sketch info for semantic selectors
 * @param occtHistory - Optional OCCT history for Phase 8 accurate matching
 * @param faceHash - Optional face hash for OCCT history lookup
 * @param profileEdgeToEntityId - Optional mapping from edge index to entity UUID
 * @returns Encoded PersistentRef string
 */
export function generateFaceRef(
  featureId: string,
  featureType: string,
  faceIdx: number,
  fingerprint: FaceFingerprint,
  sketchInfo?: SketchInfo,
  occtHistory?: OCCTHistory,
  faceHash?: number,
  profileEdgeToEntityId?: Map<number, string>
): string {
  let localSelector: { kind: string; data: Record<string, string | number> };

  // First check faceHashToOrigin map (for faces that have been through boolean operations)
  if (occtHistory?.faceHashToOrigin && faceHash !== undefined) {
    const origin = occtHistory.faceHashToOrigin.get(faceHash);
    if (origin) {
      const loopId = sketchInfo?.profileLoops?.[0]?.loopId ?? "loop:unknown";

      // Use the tracked origin to generate the selector
      if (origin.faceType === "topCap") {
        localSelector = { kind: "extrude.topCap", data: { loopId } };
      } else if (origin.faceType === "bottomCap") {
        localSelector = { kind: "extrude.bottomCap", data: { loopId } };
      } else if (origin.faceType === "side" && origin.entityId) {
        localSelector = { kind: "extrude.side", data: { loopId, segmentId: origin.entityId } };
      } else if (origin.faceType === "side") {
        localSelector = { kind: "extrude.side", data: { loopId, faceIndex: faceIdx } };
      } else {
        localSelector = { kind: "face.unknown", data: { faceIndex: faceIdx } };
      }

      // Note: originFeatureId might differ from the body's sourceFeatureId
      // because the face may have come from a different feature before the boolean
      const persistentRef: PersistentRefV1 = {
        v: 1,
        expectedType: "face",
        originFeatureId: origin.sourceFeatureId,
        localSelector,
        fingerprint: {
          centroid: fingerprint.centroid,
          size: fingerprint.size,
          normal: fingerprint.normal,
        },
      };

      return encodePersistentRef(persistentRef);
    }
  }

  if (featureType === "extrude") {
    const loopId = sketchInfo?.profileLoops?.[0]?.loopId ?? "loop:unknown";

    // Phase 8: Use OCCT history for accurate cap/side detection
    if (occtHistory && faceHash !== undefined) {
      // Check if this is the top cap
      if (occtHistory.topCapHash === faceHash) {
        localSelector = { kind: "extrude.topCap", data: { loopId } };
      }
      // Check if this is the bottom cap
      else if (occtHistory.bottomCapHash === faceHash) {
        localSelector = { kind: "extrude.bottomCap", data: { loopId } };
      }
      // Check side face mappings
      else {
        const sideMapping = occtHistory.sideFaceMappings.find(
          (m) => m.generatedFaceHash === faceHash
        );

        if (sideMapping && profileEdgeToEntityId) {
          // Found the profile edge that generated this face - use entity UUID
          const entityId = profileEdgeToEntityId.get(sideMapping.profileEdgeIndex);
          if (entityId) {
            localSelector = { kind: "extrude.side", data: { loopId, segmentId: entityId } };
          } else {
            // Edge index known but no entity mapping
            localSelector = {
              kind: "extrude.side",
              data: { loopId, profileEdgeIndex: sideMapping.profileEdgeIndex },
            };
          }
        } else if (sideMapping) {
          // Have OCCT mapping but no entity UUID mapping
          localSelector = {
            kind: "extrude.side",
            data: { loopId, profileEdgeIndex: sideMapping.profileEdgeIndex },
          };
        } else {
          // No OCCT match - fall back to fingerprint-based heuristics
          localSelector = generateFallbackExtrudeSideSelector(fingerprint, loopId, faceIdx);
        }
      }
    } else {
      // No OCCT history - use original heuristic approach
      const [, , nz] = fingerprint.normal;
      const isTopCap = nz > 0.9;
      const isBottomCap = nz < -0.9;

      if (isTopCap) {
        localSelector = { kind: "extrude.topCap", data: { loopId } };
      } else if (isBottomCap) {
        localSelector = { kind: "extrude.bottomCap", data: { loopId } };
      } else {
        localSelector = { kind: "extrude.side", data: { loopId, faceIndex: faceIdx } };
      }
    }
  } else if (featureType === "revolve") {
    // Phase 8: Use OCCT history for revolve caps
    if (occtHistory && faceHash !== undefined) {
      if (occtHistory.bottomCapHash === faceHash) {
        localSelector = { kind: "revolve.startCap", data: {} };
      } else if (occtHistory.topCapHash === faceHash) {
        localSelector = { kind: "revolve.endCap", data: {} };
      } else {
        const sideMapping = occtHistory.sideFaceMappings.find(
          (m) => m.generatedFaceHash === faceHash
        );

        if (sideMapping && profileEdgeToEntityId) {
          const entityId = profileEdgeToEntityId.get(sideMapping.profileEdgeIndex);
          if (entityId) {
            localSelector = { kind: "revolve.side", data: { segmentId: entityId } };
          } else {
            localSelector = {
              kind: "revolve.side",
              data: { profileEdgeIndex: sideMapping.profileEdgeIndex },
            };
          }
        } else {
          localSelector = { kind: "revolve.side", data: { faceIndex: faceIdx } };
        }
      }
    } else {
      // Fallback: heuristic approach
      const [, , nz] = fingerprint.normal;
      const isStartCap = Math.abs(nz - 1) < 0.1;
      const isEndCap = Math.abs(nz + 1) < 0.1;

      if (isStartCap) {
        localSelector = { kind: "revolve.startCap", data: {} };
      } else if (isEndCap) {
        localSelector = { kind: "revolve.endCap", data: {} };
      } else {
        localSelector = { kind: "revolve.side", data: { faceIndex: faceIdx } };
      }
    }
  } else {
    // Generic fallback - use fingerprint for matching
    localSelector = { kind: "face.unknown", data: { faceIndex: faceIdx } };
  }

  const ref: PersistentRefV1 = {
    v: 1,
    expectedType: "face",
    originFeatureId: featureId,
    localSelector,
    fingerprint: {
      centroid: fingerprint.centroid,
      size: fingerprint.size,
      normal: fingerprint.normal,
    },
  };

  return encodePersistentRef(ref);
}

/**
 * Generate fallback selector for extrude side faces when OCCT history doesn't match.
 */
function generateFallbackExtrudeSideSelector(
  fingerprint: FaceFingerprint,
  loopId: string,
  faceIdx: number
): { kind: string; data: Record<string, string | number> } {
  // Use faceIndex as fallback
  return { kind: "extrude.side", data: { loopId, faceIndex: faceIdx } };
}

/**
 * Generate a PersistentRef for an edge
 *
 * @param featureId - UUID of the originating feature
 * @param featureType - Type of the feature
 * @param edgeIdx - Index of the edge in the tessellation
 * @param fingerprint - Computed fingerprint for this edge
 * @param sketchInfo - Optional sketch info for semantic selectors
 * @returns Encoded PersistentRef string
 */
export function generateEdgeRef(
  featureId: string,
  featureType: string,
  edgeIdx: number,
  fingerprint: EdgeFingerprint,
  sketchInfo?: SketchInfo
): string {
  let localSelector: { kind: string; data: Record<string, string | number> };

  if (featureType === "extrude") {
    const loopId = sketchInfo?.profileLoops?.[0]?.loopId ?? "loop:unknown";
    // For extrude edges, we categorize by position
    // TODO: Improve with OCCT history in Phase 8
    localSelector = { kind: "extrude.edge", data: { loopId, edgeIndex: edgeIdx } };
  } else if (featureType === "revolve") {
    localSelector = { kind: "revolve.edge", data: { edgeIndex: edgeIdx } };
  } else {
    localSelector = { kind: "edge.unknown", data: { edgeIndex: edgeIdx } };
  }

  const ref: PersistentRefV1 = {
    v: 1,
    expectedType: "edge",
    originFeatureId: featureId,
    localSelector,
    fingerprint: {
      centroid: fingerprint.centroid,
      size: fingerprint.size,
    },
  };

  return encodePersistentRef(ref);
}

// ============================================================================
// ReferenceIndex Building
// ============================================================================

/**
 * Options for buildBodyReferenceIndex with Phase 8 support.
 */
export interface BuildReferenceIndexOptions {
  bodyKey: string;
  featureId: string;
  featureType: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  faceMap?: Uint32Array;
  edges?: Float32Array;
  edgeMap?: Uint32Array;
  sketchInfo?: SketchInfo;
  /** Phase 8: OCCT operation history */
  occtHistory?: OCCTHistory;
  /** Phase 8: Face hashes from tessellateWithHashes */
  faceHashes?: Uint32Array;
  /** Phase 8: Edge hashes from tessellateWithHashes */
  edgeHashes?: Uint32Array;
  /** Phase 8: Mapping from profile edge index to sketch entity UUID */
  profileEdgeToEntityId?: Map<number, string>;
}

/**
 * Build a ReferenceIndex for a body from mesh data
 *
 * @param bodyKey - Identifier for this body
 * @param featureId - UUID of the feature that created this body
 * @param featureType - Type of the feature
 * @param positions - Vertex positions
 * @param normals - Vertex normals
 * @param indices - Triangle indices
 * @param faceMap - Triangle to face mapping
 * @param edges - Edge line segments
 * @param edgeMap - Segment to edge mapping
 * @param sketchInfo - Optional sketch info
 * @param occtHistory - Optional OCCT history for Phase 8
 * @param faceHashes - Optional face hashes for Phase 8
 * @param edgeHashes - Optional edge hashes for Phase 8
 * @param profileEdgeToEntityId - Optional edge-to-entity mapping for Phase 8
 * @returns BodyReferenceIndex for this body
 */
export function buildBodyReferenceIndex(
  bodyKey: string,
  featureId: string,
  featureType: string,
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  faceMap?: Uint32Array,
  edges?: Float32Array,
  edgeMap?: Uint32Array,
  sketchInfo?: SketchInfo,
  occtHistory?: OCCTHistory,
  faceHashes?: Uint32Array,
  _edgeHashes?: Uint32Array,
  profileEdgeToEntityId?: Map<number, string>
): BodyReferenceIndex {
  const result: BodyReferenceIndex = {
    faces: [],
    edges: [],
  };

  // Compute face refs
  if (faceMap && faceMap.length > 0) {
    const faceFingerprints = computeFaceFingerprints(positions, normals, indices, faceMap);

    result.faces = faceFingerprints.map((fp, idx) => {
      const faceHash = faceHashes ? faceHashes[idx] : undefined;
      return generateFaceRef(
        featureId,
        featureType,
        idx,
        fp,
        sketchInfo,
        occtHistory,
        faceHash,
        profileEdgeToEntityId
      );
    });
  }

  // Compute edge refs
  if (edges && edgeMap && edges.length > 0 && edgeMap.length > 0) {
    const edgeFingerprints = computeEdgeFingerprints(edges, edgeMap);

    result.edges = edgeFingerprints.map((fp, idx) =>
      generateEdgeRef(featureId, featureType, idx, fp, sketchInfo)
    );
  }

  return result;
}

// ============================================================================
// Profile Loop Computation
// ============================================================================

/**
 * Compute profile loops from sketch data
 *
 * This function identifies closed loops in the sketch and assigns
 * stable loop IDs based on the entity UUIDs.
 *
 * @param entitiesById - Map of entity ID to entity data
 * @param pointsById - Map of point ID to point data
 * @returns Array of ProfileLoop objects
 */
export function computeProfileLoops(
  entitiesById: Record<
    string,
    { type: string; start?: string; end?: string; [key: string]: unknown }
  >,
  _pointsById: Record<string, { x: number; y: number; [key: string]: unknown }>
): ProfileLoop[] {
  // Build adjacency from line/arc entities
  const adjacency = new Map<string, string[]>();
  const entityEndpoints = new Map<string, [string, string]>();

  for (const [entityId, entity] of Object.entries(entitiesById)) {
    if ((entity.type === "line" || entity.type === "arc") && entity.start && entity.end) {
      entityEndpoints.set(entityId, [entity.start, entity.end]);

      // Add to adjacency
      if (!adjacency.has(entity.start)) adjacency.set(entity.start, []);
      if (!adjacency.has(entity.end)) adjacency.set(entity.end, []);
      adjacency.get(entity.start)!.push(entityId);
      adjacency.get(entity.end)!.push(entityId);
    }
    // Handle circles (closed loop by itself)
    if (entity.type === "circle") {
      const loopId = computeLoopId([entityId]);
      return [{ loopId, entityIds: [entityId] }];
    }
  }

  // Find loops using DFS
  const visited = new Set<string>();
  const loops: ProfileLoop[] = [];

  function findLoop(startEntity: string): string[] | null {
    const path: string[] = [startEntity];
    const endpoints = entityEndpoints.get(startEntity);
    if (!endpoints) return null;

    let currentPoint = endpoints[1]; // Follow end point
    const startPoint = endpoints[0];

    const visitedEntities = new Set<string>([startEntity]);

    while (currentPoint !== startPoint) {
      const neighbors = adjacency.get(currentPoint) || [];
      let found = false;

      for (const entityId of neighbors) {
        if (visitedEntities.has(entityId)) continue;

        const eps = entityEndpoints.get(entityId);
        if (!eps) continue;

        visitedEntities.add(entityId);
        path.push(entityId);

        // Move to the other endpoint
        currentPoint = eps[0] === currentPoint ? eps[1] : eps[0];
        found = true;
        break;
      }

      if (!found) return null; // Dead end
      if (path.length > 100) return null; // Safety limit
    }

    return path;
  }

  // Try to find loops starting from each unvisited entity
  for (const entityId of entityEndpoints.keys()) {
    if (visited.has(entityId)) continue;

    const loop = findLoop(entityId);
    if (loop && loop.length > 0) {
      loop.forEach((e) => visited.add(e));
      const loopId = computeLoopId(loop);
      loops.push({ loopId, entityIds: loop });
    }
  }

  return loops;
}
