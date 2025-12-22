/**
 * Selection rules for planar boolean operations.
 * 
 * Based on classification, select which face pieces to keep and
 * whether to flip their orientations.
 */

import type { FacePiece, BoolOp, SelectedPieces } from './types.js';

/**
 * Apply selection rules to classified face pieces.
 * 
 * Rules:
 * - UNION: keep OUT pieces from both
 * - INTERSECT: keep IN pieces from both  
 * - SUBTRACT A\B: keep A.OUT; keep B.IN but flip orientation
 */
export function selectPieces(
  piecesA: FacePiece[],
  piecesB: FacePiece[],
  operation: BoolOp
): SelectedPieces {
  let fromA: FacePiece[];
  let fromB: FacePiece[];
  let flipB = false;
  
  switch (operation) {
    case 'union':
      // Keep pieces from A that are OUTSIDE B
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      // Keep pieces from B that are OUTSIDE A
      fromB = piecesB.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      break;
      
    case 'intersect':
      // Keep pieces from A that are INSIDE B
      fromA = piecesA.filter(p => p.classification === 'inside');
      // Keep pieces from B that are INSIDE A
      fromB = piecesB.filter(p => p.classification === 'inside');
      break;
      
    case 'subtract':
      // Keep pieces from A that are OUTSIDE B
      fromA = piecesA.filter(p => p.classification === 'outside');
      // Keep pieces from B that are INSIDE A (but flip them)
      fromB = piecesB.filter(p => p.classification === 'inside');
      flipB = true;
      break;
  }
  
  return { fromA, fromB, flipB };
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
