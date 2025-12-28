/**
 * Selection rules for planar boolean operations.
 * 
 * Based on classification, select which face pieces to keep and
 * whether to flip their orientations.
 */

import type { NumericContext } from '../../num/tolerance.js';
import { dot3 } from '../../num/vec3.js';
import type { FacePiece, BoolOp, SelectedPieces, BoundingBox3D } from './types.js';
import { projectToPlane2D, unprojectFromPlane } from './intersect.js';

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
 * @param ctx - Numeric context for tolerance-aware filtering
 */
export function selectPieces(
  piecesA: FacePiece[],
  piecesB: FacePiece[],
  operation: BoolOp,
  boundsA?: BoundingBox3D,
  _boundsB?: BoundingBox3D,
  ctx?: NumericContext
): SelectedPieces {
  const tol = ctx?.tol.length ?? 1e-6;
  const snap = (v: number) => Math.round(v / tol) * tol;
  const normalizeLoop = (loop: readonly [number, number][]): string => {
    const forward = loop.map(p => `${snap(p[0])},${snap(p[1])}`).join(';');
    const reverse = loop.slice().reverse().map(p => `${snap(p[0])},${snap(p[1])}`).join(';');
    return forward < reverse ? forward : reverse;
  };
  const onSameKey = (piece: FacePiece): string => {
    const surf = piece.surface;
    const surfKey = `${snap(surf.origin[0])},${snap(surf.origin[1])},${snap(surf.origin[2])}|${snap(surf.normal[0])},${snap(surf.normal[1])},${snap(surf.normal[2])}`;
    return `${surfKey}|${normalizeLoop(piece.polygon)}`;
  };
  const coplanarKey = (piece: FacePiece): string => {
    const surf = piece.surface;
    const normKey = `${snap(Math.abs(surf.normal[0]))},${snap(Math.abs(surf.normal[1]))},${snap(Math.abs(surf.normal[2]))}`;
    const surfKey = `${snap(surf.origin[0])},${snap(surf.origin[1])},${snap(surf.origin[2])}|${normKey}`;
    return `${surfKey}|${normalizeLoop(piece.polygon)}`;
  };
  
  let fromA: FacePiece[];
  let fromB: FacePiece[];
  let flipB = false;
  
  switch (operation) {
    case 'union':
      // Keep exterior pieces and boundary-aligned fragments
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      fromB = piecesB.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      
      // Drop paired coplanar faces with opposing normals (shared internal walls), regardless of classification
      const oppKeys = new Set<string>();
      const mapA = new Map<string, Vec3>();
      for (const p of fromA) {
        mapA.set(coplanarKey(p), p.surface.normal);
      }
      for (const p of fromB) {
        const key = coplanarKey(p);
        const nA = mapA.get(key);
        if (nA && dot3(nA, p.surface.normal) < -0.5) {
          oppKeys.add(key);
        }
      }
      if (oppKeys.size > 0) {
        fromA = fromA.filter(p => !oppKeys.has(coplanarKey(p)));
        fromB = fromB.filter(p => !oppKeys.has(coplanarKey(p)));
      }
      break;
      
    case 'intersect':
      // Keep pieces that are INSIDE or on shared boundary
      fromA = piecesA.filter(p => p.classification === 'inside' || p.classification === 'on_same');
      fromB = piecesB.filter(p => p.classification === 'inside' || p.classification === 'on_same');
      break;
      
    case 'subtract':
      // Keep pieces from A that are OUTSIDE B (and boundary-aligned pieces)
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      // Keep pieces from B that are INSIDE A (flipped to form the cavity interior).
      fromB = piecesB
        .filter(p => p.classification === 'inside' || p.classification === 'on_same')
        .map(p => ({ ...p, holes: [] })); // tool walls should not carry holes
      flipB = true;
      break;
  }

  if (operation === 'subtract') {
    // Keep holes only on cap-like faces (normal dominant along Z); clear from side faces
    fromA = fromA.map(piece => {
      if (piece.holes.length === 0) return piece;
      const n = piece.surface.normal.map(Math.abs);
      const maxComp = Math.max(n[0], n[1], n[2]);
      const isCap = maxComp === n[2];
      return isCap ? piece : { ...piece, holes: [] };
    });
  }
  
  // Filter tool pieces that extend significantly beyond target bounds for subtract
  if (operation === 'subtract' && boundsA) {
    fromB = filterPiecesByBounds(fromB, boundsA, tol);
  }
  
  return { fromA, fromB, flipB };
}

/**
 * Filter pieces to only keep those whose 3D vertices are mostly within the given bounds.
 * Pieces where a LARGE portion extends beyond the bounds are rejected.
 * This catches cases where a piece is classified as "inside" based on centroid
 * but actually extends significantly outside the target body.
 */
function filterPiecesByBounds(pieces: FacePiece[], bounds: BoundingBox3D, tol: number): FacePiece[] {
  const clampedPieces: FacePiece[] = [];
  
  for (const piece of pieces) {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    if (vertices3D.length < 3) continue;
    
    const clamped3D = vertices3D.map(v => ([
      Math.min(Math.max(v[0], bounds.min[0] - tol), bounds.max[0] + tol),
      Math.min(Math.max(v[1], bounds.min[1] - tol), bounds.max[1] + tol),
      Math.min(Math.max(v[2], bounds.min[2] - tol), bounds.max[2] + tol),
    ] as [number, number, number]));
    
    const clamped2D = clamped3D.map(p => projectToPlane2D(p, piece.surface));
    if (computePolygonArea(clamped2D) <= tol * tol) continue;
    
    clampedPieces.push({
      ...piece,
      polygon: clamped2D,
    });
  }
  
  return clampedPieces;
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
