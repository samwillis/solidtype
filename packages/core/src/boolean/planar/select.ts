/**
 * Selection rules for planar boolean operations.
 * 
 * Based on classification, select which face pieces to keep and
 * whether to flip their orientations.
 */

import type { NumericContext } from '../../num/tolerance.js';
import type { Vec3 } from '../../num/vec3.js';
import { dot3, add3, mul3 } from '../../num/vec3.js';
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
  const normalizeLoop2D = (loop: readonly [number, number][]): string => {
    const forward = loop.map(p => `${snap(p[0])},${snap(p[1])}`).join(';');
    const reverse = loop.slice().reverse().map(p => `${snap(p[0])},${snap(p[1])}`).join(';');
    return forward < reverse ? forward : reverse;
  };
  
  // Normalize a 3D polygon loop (unproject 2D to 3D, then sort)
  const normalizeLoop3D = (piece: FacePiece): string => {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    // Create key for each vertex
    const vertexKeys = vertices3D.map(v => `${snap(v[0])},${snap(v[1])},${snap(v[2])}`);
    // Find canonical starting point (lexicographically smallest)
    let minIdx = 0;
    for (let i = 1; i < vertexKeys.length; i++) {
      if (vertexKeys[i] < vertexKeys[minIdx]) minIdx = i;
    }
    // Rotate to start at min, try both directions
    const rotated = [...vertexKeys.slice(minIdx), ...vertexKeys.slice(0, minIdx)];
    const forward = rotated.join(';');
    const reversed = [rotated[0], ...rotated.slice(1).reverse()].join(';');
    return forward < reversed ? forward : reversed;
  };
  
  // Key that ignores normal direction (treats coplanar faces as same) using 3D geometry
  const coplanarKey = (piece: FacePiece): string => {
    const surf = piece.surface;
    // Use absolute normal for plane orientation
    const normKey = `${snap(Math.abs(surf.normal[0]))},${snap(Math.abs(surf.normal[1]))},${snap(Math.abs(surf.normal[2]))}`;
    // Use plane distance from origin
    const dist = snap(dot3(surf.origin, surf.normal));
    return `${normKey}|${Math.abs(dist)}|${normalizeLoop3D(piece)}`;
  };
  
  // Key that includes signed normal (orientation-sensitive)
  const orientedKey = (piece: FacePiece): string => {
    const surf = piece.surface;
    const surfKey = `${snap(surf.origin[0])},${snap(surf.origin[1])},${snap(surf.origin[2])}|${snap(surf.normal[0])},${snap(surf.normal[1])},${snap(surf.normal[2])}`;
    const holesKey = piece.holes.map(h => normalizeLoop2D(h)).sort().join('|');
    return `${surfKey}|${normalizeLoop2D(piece.polygon)}|${holesKey}`;
  };
  
  let fromA: FacePiece[];
  let fromB: FacePiece[];
  let flipB = false;
  
  switch (operation) {
    case 'union':
      // Keep exterior pieces and boundary-aligned fragments
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      fromB = piecesB.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      
      // Drop paired coplanar faces (shared internal walls):
      // 1. Opposing normals (internal wall between touching volumes)
      // 2. Same-normal duplicates from both bodies (exact geometry match)
      // Cache the coplanar key for each piece to avoid recomputation issues
      const pieceKeyMapA = new Map<FacePiece, string>();
      const pieceKeyMapB = new Map<FacePiece, string>();
      const coplanarGroups = new Map<string, { fromA: FacePiece[]; fromB: FacePiece[] }>();
      
      for (const p of fromA) {
        const key = coplanarKey(p);
        pieceKeyMapA.set(p, key);
        if (!coplanarGroups.has(key)) {
          coplanarGroups.set(key, { fromA: [], fromB: [] });
        }
        coplanarGroups.get(key)!.fromA.push(p);
      }
      for (const p of fromB) {
        const key = coplanarKey(p);
        pieceKeyMapB.set(p, key);
        if (!coplanarGroups.has(key)) {
          coplanarGroups.set(key, { fromA: [], fromB: [] });
        }
        coplanarGroups.get(key)!.fromB.push(p);
      }
      
      // Find keys to drop: coplanar pieces from both A and B
      const keysToDrop = new Set<string>();
      for (const [key, group] of coplanarGroups) {
        if (group.fromA.length > 0 && group.fromB.length > 0) {
          // Both bodies have pieces at this location - check normals
          const normA = group.fromA[0].surface.normal;
          for (const pB of group.fromB) {
            const dotN = dot3(normA, pB.surface.normal);
            // Drop if opposing normals (internal wall) OR if same normal (duplicate)
            if (Math.abs(dotN) > 0.5) {
              keysToDrop.add(key);
              break;
            }
          }
        }
      }
      
      if (keysToDrop.size > 0) {
        // Use cached keys to avoid recomputation issues
        fromA = fromA.filter(p => !keysToDrop.has(pieceKeyMapA.get(p)!));
        fromB = fromB.filter(p => !keysToDrop.has(pieceKeyMapB.get(p)!));
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
  
  // Filter tool pieces that are entirely outside target bounds (for subtract)
  if (operation === 'subtract' && boundsA) {
    fromB = filterPiecesByBounds3D(fromB, boundsA, tol);
  }
  
  // For intersect, filter both A and B to keep only pieces within the intersection region
  if (operation === 'intersect' && boundsA && _boundsB) {
    // Compute intersection of bounds
    const intersectBounds: BoundingBox3D = {
      min: [
        Math.max(boundsA.min[0], _boundsB.min[0]),
        Math.max(boundsA.min[1], _boundsB.min[1]),
        Math.max(boundsA.min[2], _boundsB.min[2]),
      ] as Vec3,
      max: [
        Math.min(boundsA.max[0], _boundsB.max[0]),
        Math.min(boundsA.max[1], _boundsB.max[1]),
        Math.min(boundsA.max[2], _boundsB.max[2]),
      ] as Vec3,
    };
    
    fromA = filterPiecesByBounds3D(fromA, intersectBounds, tol);
    fromB = filterPiecesByBounds3D(fromB, intersectBounds, tol);
  }
  
  // Final dedup: remove exact duplicates (same orientation, same geometry)
  const seenKeys = new Set<string>();
  const dedupedA: FacePiece[] = [];
  const dedupedB: FacePiece[] = [];
  
  for (const p of fromA) {
    const key = orientedKey(p);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedA.push(p);
    }
  }
  for (const p of fromB) {
    const key = orientedKey(p);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedB.push(p);
    }
  }
  
  return { fromA: dedupedA, fromB: dedupedB, flipB };
}

/**
 * Filter pieces to keep only those that are at least partially within bounds.
 * Uses 3D centroid check: if the face's 3D centroid is outside bounds, drop it.
 * Also clamps piece geometry to bounds to trim overhanging portions.
 */
function filterPiecesByBounds3D(pieces: FacePiece[], bounds: BoundingBox3D, tol: number): FacePiece[] {
  const result: FacePiece[] = [];
  
  for (const piece of pieces) {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    if (vertices3D.length < 3) continue;
    
    // Compute 3D centroid
    let cx = 0, cy = 0, cz = 0;
    for (const v of vertices3D) {
      cx += v[0];
      cy += v[1];
      cz += v[2];
    }
    cx /= vertices3D.length;
    cy /= vertices3D.length;
    cz /= vertices3D.length;
    
    // Check if centroid is within bounds (with tolerance)
    const inBounds = 
      cx >= bounds.min[0] - tol && cx <= bounds.max[0] + tol &&
      cy >= bounds.min[1] - tol && cy <= bounds.max[1] + tol &&
      cz >= bounds.min[2] - tol && cz <= bounds.max[2] + tol;
    
    if (!inBounds) {
      // Piece centroid is outside bounds - skip it
      continue;
    }
    
    // Check if piece needs clamping (any vertex outside bounds)
    let needsClamping = false;
    for (const v of vertices3D) {
      if (v[0] < bounds.min[0] - tol || v[0] > bounds.max[0] + tol ||
          v[1] < bounds.min[1] - tol || v[1] > bounds.max[1] + tol ||
          v[2] < bounds.min[2] - tol || v[2] > bounds.max[2] + tol) {
        needsClamping = true;
        break;
      }
    }
    
    if (!needsClamping) {
      // Piece is entirely within bounds - keep as is
      result.push(piece);
      continue;
    }
    
    // Clamp vertices to bounds
    const clamped3D = vertices3D.map(v => ([
      Math.min(Math.max(v[0], bounds.min[0] - tol), bounds.max[0] + tol),
      Math.min(Math.max(v[1], bounds.min[1] - tol), bounds.max[1] + tol),
      Math.min(Math.max(v[2], bounds.min[2] - tol), bounds.max[2] + tol),
    ] as [number, number, number]));
    
    const clamped2D = clamped3D.map(p => projectToPlane2D(p, piece.surface));
    const area = computePolygonArea(clamped2D);
    
    if (area <= tol * tol) continue;
    
    result.push({
      ...piece,
      polygon: clamped2D,
    });
  }
  
  return result;
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
