/**
 * Segment splitting for planar imprinting.
 *
 * Given a face polygon and intersection segments, split all edges
 * at intersection points to prepare for DCEL construction.
 */

import type { Vec2 } from "../../../num/vec2.js";
import type { HalfEdgeId, FaceId } from "../../../topo/handles.js";
import type { Segment2D } from "../types.js";

/**
 * Convert a face polygon to segments with source tracking
 */
export function facePolygonToSegments(
  polygon: Vec2[],
  faceId: FaceId,
  sourceBody: 0 | 1,
  halfEdgeIds?: HalfEdgeId[]
): Segment2D[] {
  const segments: Segment2D[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    segments.push({
      a: [polygon[i][0], polygon[i][1]],
      b: [polygon[j][0], polygon[j][1]],
      sourceBody,
      sourceFace: faceId,
      sourceHalfEdge: halfEdgeIds ? halfEdgeIds[i] : null,
      isIntersection: false,
    });
  }

  return segments;
}

/**
 * Merge boundary segments with intersection segments for imprinting
 */
export function mergeSegmentsForImprint(
  boundarySegments: Segment2D[],
  intersectionSegments: Segment2D[]
): Segment2D[] {
  return [...boundarySegments, ...intersectionSegments];
}
