/**
 * Selection rules for planar boolean operations.
 * 
 * Based on classification, select which face pieces to keep and
 * whether to flip their orientations.
 */

import type { FacePiece, BoolOp, SelectedPieces, BoundingBox3D } from './types.js';
import { unprojectFromPlane } from './intersect.js';

/**
 * Apply selection rules to classified face pieces.
 * 
 * Rules:
 * - UNION: keep OUT pieces from both
 * - INTERSECT: keep IN pieces from both  
 * - SUBTRACT A\B: keep A.OUT; keep B.IN but flip orientation
 * 
 * @param piecesA - Face pieces from body A
 * @param piecesB - Face pieces from body B
 * @param operation - Boolean operation type
 * @param boundsA - Optional bounding box of body A for validation
 * @param _boundsB - Optional bounding box of body B (reserved for future use)
 */
export function selectPieces(
  piecesA: FacePiece[],
  piecesB: FacePiece[],
  operation: BoolOp,
  boundsA?: BoundingBox3D,
  _boundsB?: BoundingBox3D
): SelectedPieces {
  let fromA: FacePiece[];
  let fromB: FacePiece[];
  let flipB = false;
  
  switch (operation) {
    case 'union':
      // Keep pieces from A that are OUTSIDE B or on a shared boundary (on_same)
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      // Keep pieces from B that are OUTSIDE A only (on_same would duplicate A's pieces)
      fromB = piecesB.filter(p => p.classification === 'outside');
      break;
      
    case 'intersect':
      // Keep pieces from A that are INSIDE B
      fromA = piecesA.filter(p => p.classification === 'inside');
      // Keep pieces from B that are INSIDE A
      fromB = piecesB.filter(p => p.classification === 'inside');
      break;
      
    case 'subtract':
      // Keep pieces from A that are OUTSIDE B or on boundary (on_same means touching, not inside)
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      // Keep pieces from B that are INSIDE A (but flip them to form the hole interior)
      // Note: on_same pieces from B should NOT be kept (they're on the same surface as A)
      fromB = piecesB.filter(p => p.classification === 'inside');
      flipB = true;
      break;
  }
  
  // Validate: For subtract, pieces from B should not extend beyond A's bounds
  // This catches cases where a piece is classified as "inside" based on centroid
  // but actually has vertices that extend outside the target body
  if (operation === 'subtract' && boundsA) {
    fromB = filterPiecesByBounds(fromB, boundsA);
  }
  
  // NOTE: We intentionally don't filter for intersect operations here
  // because the intersection may have pieces that legitimately touch the boundary
  // and our simple bounds check would incorrectly filter them out.
  // The proper fix would be to improve the intersection/imprinting to correctly
  // split faces at all boundaries.
  
  return { fromA, fromB, flipB };
}

/**
 * Filter pieces to only keep those whose 3D vertices are mostly within the given bounds.
 * Pieces where a LARGE portion extends beyond the bounds are rejected.
 * This catches cases where a piece is classified as "inside" based on centroid
 * but actually extends significantly outside the target body.
 */
function filterPiecesByBounds(pieces: FacePiece[], bounds: BoundingBox3D): FacePiece[] {
  const tolerance = 1e-6;
  
  return pieces.filter(piece => {
    let verticesInside = 0;
    let verticesOutside = 0;
    let maxExceedance = 0;
    
    // Check each vertex of the piece
    for (const vertex2D of piece.polygon) {
      const vertex3D = unprojectFromPlane(vertex2D, piece.surface);
      
      // Calculate how far outside the bounds this vertex is
      const exceedanceX = Math.max(
        bounds.min[0] - vertex3D[0],
        vertex3D[0] - bounds.max[0],
        0
      );
      const exceedanceY = Math.max(
        bounds.min[1] - vertex3D[1],
        vertex3D[1] - bounds.max[1],
        0
      );
      const exceedanceZ = Math.max(
        bounds.min[2] - vertex3D[2],
        vertex3D[2] - bounds.max[2],
        0
      );
      
      const totalExceedance = exceedanceX + exceedanceY + exceedanceZ;
      maxExceedance = Math.max(maxExceedance, totalExceedance);
      
      if (totalExceedance > tolerance) {
        verticesOutside++;
      } else {
        verticesInside++;
      }
    }
    
    // Reject pieces where:
    // 1. Most vertices are outside, OR
    // 2. Any vertex exceeds bounds by more than a significant amount
    // This filters out faces from the tool that extend way beyond the target
    // while allowing faces that just touch the boundary
    
    const significantExceedance = 0.1; // More than 10% of typical model size
    if (maxExceedance > significantExceedance) {
      return false;
    }
    
    // If more than half the vertices are outside, reject
    if (verticesOutside > verticesInside) {
      return false;
    }
    
    return true;
  });
}

/**
 * Handle regularized boolean semantics:
 * Discard lower-dimensional artifacts (ON faces that don't contribute to volume)
 */
export function regularize(pieces: FacePiece[]): FacePiece[] {
  // Filter out degenerate pieces (very small area)
  return pieces.filter(p => {
    const area = computePolygonArea(p.polygon);
    return Math.abs(area) > 1e-10;
  });
}

/**
 * Compute area of a 2D polygon
 */
function computePolygonArea(polygon: readonly [number, number][]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area) / 2;
}
