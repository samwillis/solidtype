/**
 * Loop extraction from DCEL faces.
 * 
 * After building a DCEL from imprinted segments, extract the 
 * bounded face polygons (with possible holes) for classification.
 */

import type { Vec2 } from '../../../num/vec2.js';
import type { FaceId } from '../../../topo/handles.js';
import type { FacePiece } from '../types.js';
import type { PlaneSurface } from '../../../geom/surface.js';

export interface ExtractedLoop {
  /** The polygon vertices */
  polygon: Vec2[];
  /** Any holes contained within this loop */
  holes: Vec2[][];
  /** Is this the outer boundary (CCW, positive area) or a hole (CW, negative area)? */
  isOuter: boolean;
  /** Source face ID */
  sourceFace: FaceId;
  /** Source body */
  sourceBody: 0 | 1;
}

/**
 * Extract bounded loops from a DCEL structure
 */
export function extractBoundedLoops(
  dcel: { 
    vertices: { pos: Vec2 }[]; 
    halfEdges: { origin: number; next: number; face: number; metadata: { sourceBody: 0 | 1 } }[];
    faces: { id: number; outerComponent: number; isUnbounded: boolean }[];
  },
  sourceFace: FaceId,
  surface: PlaneSurface
): FacePiece[] {
  const pieces: FacePiece[] = [];
  
  for (const face of dcel.faces) {
    if (face.isUnbounded) continue;
    if (face.outerComponent === -1) continue;
    
    // Extract polygon for this face
    const polygon = getCyclePolygonFromDCEL(dcel, face.outerComponent);
    if (polygon.length < 3) continue;
    
    // Compute signed area to verify orientation
    const area = computePolygonSignedArea(polygon);
    if (Math.abs(area) < 1e-12) continue; // Degenerate face
    
    // Determine source body from half-edges
    const firstHe = dcel.halfEdges[face.outerComponent];
    const sourceBody = firstHe.metadata.sourceBody;
    
    pieces.push({
      polygon: area > 0 ? polygon : polygon.slice().reverse(), // Ensure CCW
      holes: [], // Holes are handled separately
      classification: 'outside', // Will be set later
      sourceFace,
      sourceBody,
      surface
    });
  }
  
  return pieces;
}

/**
 * Get polygon vertices from a half-edge cycle
 */
function getCyclePolygonFromDCEL(
  dcel: { 
    vertices: { pos: Vec2 }[]; 
    halfEdges: { origin: number; next: number }[];
  },
  startHalfEdge: number
): Vec2[] {
  const polygon: Vec2[] = [];
  let current = startHalfEdge;
  let iterations = 0;
  const maxIterations = dcel.halfEdges.length + 1;
  
  do {
    const he = dcel.halfEdges[current];
    const v = dcel.vertices[he.origin];
    polygon.push([v.pos[0], v.pos[1]]);
    current = he.next;
    iterations++;
  } while (current !== startHalfEdge && current !== -1 && iterations < maxIterations);
  
  return polygon;
}

/**
 * Compute signed area of a 2D polygon
 */
function computePolygonSignedArea(polygon: Vec2[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return area / 2;
}
