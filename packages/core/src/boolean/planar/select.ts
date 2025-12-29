/**
 * Selection rules for planar boolean operations.
 * 
 * Based on classification, select which face pieces to keep and
 * whether to flip their orientations.
 */

import type { NumericContext } from '../../num/tolerance.js';
import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
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
  
  // Key that identifies the PLANE only (not the polygon shape)
  // Two faces on the same plane will have the same planeKey
  const planeKey = (piece: FacePiece): string => {
    const surf = piece.surface;
    const n = surf.normal;
    
    // Canonicalize normal direction: prefer positive first non-zero component
    // This ensures faces on the same plane (with opposite normals) get the same key
    let sign = 1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(n[i]) > 1e-9) {
        sign = n[i] > 0 ? 1 : -1;
        break;
      }
    }
    const canonNormal: Vec3 = [n[0] * sign, n[1] * sign, n[2] * sign];
    
    // Compute plane equation: n · p = d (using canonical normal)
    // For the same plane, d will be the same regardless of which point on the plane we use
    const d = snap(dot3(surf.origin, canonNormal));
    
    const normKey = `${snap(canonNormal[0])},${snap(canonNormal[1])},${snap(canonNormal[2])}`;
    return `${normKey}|${d}`;
  };
  
  // Key that includes polygon shape (for exact duplicates)
  const exactKey = (piece: FacePiece): string => {
    return `${planeKey(piece)}|${normalizeLoop3D(piece)}`;
  };
  
  // Check if two 2D polygons overlap (one contains a point of the other, or edges cross)
  const polygonsOverlap2D = (polyA: Vec2[], polyB: Vec2[]): boolean => {
    // Check if any vertex of A is inside B
    for (const p of polyA) {
      if (pointInPolygon2D(p, polyB)) return true;
    }
    // Check if any vertex of B is inside A
    for (const p of polyB) {
      if (pointInPolygon2D(p, polyA)) return true;
    }
    // Check if any edges cross
    for (let i = 0; i < polyA.length; i++) {
      const a1 = polyA[i];
      const a2 = polyA[(i + 1) % polyA.length];
      for (let j = 0; j < polyB.length; j++) {
        const b1 = polyB[j];
        const b2 = polyB[(j + 1) % polyB.length];
        if (segmentsIntersect(a1, a2, b1, b2)) return true;
      }
    }
    return false;
  };
  
  let fromA: FacePiece[];
  let fromB: FacePiece[];
  let flipB = false;
  
  switch (operation) {
    case 'union':
      // Keep exterior pieces and boundary-aligned fragments
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      fromB = piecesB.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      
      // Handle coplanar faces: group by PLANE (not polygon shape)
      // For overlapping coplanar faces with opposite normals, remove both (internal wall)
      const planeGroupsA = new Map<string, FacePiece[]>();
      const planeGroupsB = new Map<string, FacePiece[]>();
      
      for (const p of fromA) {
        const key = planeKey(p);
        if (!planeGroupsA.has(key)) planeGroupsA.set(key, []);
        planeGroupsA.get(key)!.push(p);
      }
      for (const p of fromB) {
        const key = planeKey(p);
        if (!planeGroupsB.has(key)) planeGroupsB.set(key, []);
        planeGroupsB.get(key)!.push(p);
      }
      
      // Find pieces to remove: coplanar overlapping faces with opposite normals
      const piecesToRemoveA = new Set<FacePiece>();
      const piecesToRemoveB = new Set<FacePiece>();
      
      for (const [key, piecesOnPlaneA] of planeGroupsA) {
        const piecesOnPlaneB = planeGroupsB.get(key);
        if (!piecesOnPlaneB || piecesOnPlaneB.length === 0) continue;
        
        // Check each pair for overlap and opposite normals
        for (const pA of piecesOnPlaneA) {
          for (const pB of piecesOnPlaneB) {
            // Check if normals are opposite
            const dotN = dot3(pA.surface.normal, pB.surface.normal);
            if (dotN > -0.5) continue; // Not opposite normals
            
            // Project B's polygon to A's coordinate system for overlap check
            const bInA = pB.polygon.map(v => {
              const p3d = unprojectFromPlane(v, pB.surface);
              return projectToPlane2D(p3d, pA.surface);
            });
            
            if (polygonsOverlap2D(pA.polygon, bInA)) {
              // These are internal walls - remove both
              piecesToRemoveA.add(pA);
              piecesToRemoveB.add(pB);
            }
          }
        }
      }
      
      
      // Also handle exact duplicates (same plane, same shape, any normal direction)
      const seenExact = new Set<string>();
      const exactDuplicatesB = new Set<FacePiece>();
      for (const p of fromA) {
        seenExact.add(exactKey(p));
      }
      for (const p of fromB) {
        if (seenExact.has(exactKey(p))) {
          exactDuplicatesB.add(p);
        }
      }
      
      fromA = fromA.filter(p => !piecesToRemoveA.has(p));
      fromB = fromB.filter(p => !piecesToRemoveB.has(p) && !exactDuplicatesB.has(p));
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
  
  // Final dedup: remove exact duplicates using 3D vertex positions
  // This catches coplanar faces from different bodies that occupy the same 3D space
  const geometry3DKey = (piece: FacePiece): string => {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    // Sort vertices by position to create a canonical key
    const vertexKeys = vertices3D
      .map(v => `${snap(v[0])},${snap(v[1])},${snap(v[2])}`)
      .sort();
    // Include normal direction for orientation
    const n = piece.surface.normal;
    const normalKey = `${snap(n[0])},${snap(n[1])},${snap(n[2])}`;
    return `${normalKey}|${vertexKeys.join(';')}`;
  };
  
  // Filter out pieces with duplicate vertices (degenerate cycles)
  const hasUniqueVertices = (piece: FacePiece): boolean => {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    const seen = new Set<string>();
    for (const v of vertices3D) {
      const key = `${snap(v[0])},${snap(v[1])},${snap(v[2])}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  };
  
  // First filter out degenerate pieces
  const validA = fromA.filter(hasUniqueVertices);
  const validB = fromB.filter(hasUniqueVertices);
  
  // Then deduplicate by 3D geometry
  const seenKeys = new Set<string>();
  const dedupedA: FacePiece[] = [];
  const dedupedB: FacePiece[] = [];
  
  // Prefer pieces from A over B (A has priority)
  for (const p of validA) {
    const key = geometry3DKey(p);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedA.push(p);
    }
  }
  for (const p of validB) {
    const key = geometry3DKey(p);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedB.push(p);
    }
  }
  
  return { fromA: dedupedA, fromB: dedupedB, flipB };
}

/**
 * Filter pieces to keep only those that are at least partially within bounds.
 * 
 * For pieces that extend beyond bounds, clamps vertices to the exact bounds.
 * This ensures that the result doesn't contain geometry outside the target body.
 */
function filterPiecesByBounds3D(pieces: FacePiece[], bounds: BoundingBox3D, tol: number): FacePiece[] {
  const result: FacePiece[] = [];
  const boundsTol = Math.max(tol * 1000, 0.001);
  
  for (const piece of pieces) {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    if (vertices3D.length < 3) continue;
    
    // Check if ANY vertex is within bounds
    let anyVertexInBounds = false;
    for (const v of vertices3D) {
      if (v[0] >= bounds.min[0] - boundsTol && v[0] <= bounds.max[0] + boundsTol &&
          v[1] >= bounds.min[1] - boundsTol && v[1] <= bounds.max[1] + boundsTol &&
          v[2] >= bounds.min[2] - boundsTol && v[2] <= bounds.max[2] + boundsTol) {
        anyVertexInBounds = true;
        break;
      }
    }
    
    if (!anyVertexInBounds) continue;
    
    // Check if piece needs clamping (any vertex outside bounds)
    let needsClamping = false;
    for (const v of vertices3D) {
      if (v[0] < bounds.min[0] - boundsTol || v[0] > bounds.max[0] + boundsTol ||
          v[1] < bounds.min[1] - boundsTol || v[1] > bounds.max[1] + boundsTol ||
          v[2] < bounds.min[2] - boundsTol || v[2] > bounds.max[2] + boundsTol) {
        needsClamping = true;
        break;
      }
    }
    
    if (!needsClamping) {
      result.push(piece);
      continue;
    }
    
    // Clamp vertices to EXACT bounds (not bounds ± tolerance)
    // This ensures we don't create vertices like 10.001 or -0.001
    const clamped3D = vertices3D.map(v => ([
      Math.min(Math.max(v[0], bounds.min[0]), bounds.max[0]),
      Math.min(Math.max(v[1], bounds.min[1]), bounds.max[1]),
      Math.min(Math.max(v[2], bounds.min[2]), bounds.max[2]),
    ] as [number, number, number]));
    
    // Deduplicate vertices that collapsed to the same position after clamping
    const deduped3D: [number, number, number][] = [];
    const seen = new Set<string>();
    for (const v of clamped3D) {
      const key = `${v[0].toFixed(6)},${v[1].toFixed(6)},${v[2].toFixed(6)}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped3D.push(v);
      }
    }
    
    if (deduped3D.length < 3) continue;
    
    const clamped2D = deduped3D.map(p => projectToPlane2D(p, piece.surface));
    const area = computePolygonArea(clamped2D);
    
    if (area <= boundsTol * boundsTol) continue;
    
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

/**
 * Point-in-polygon test for Vec2
 */
function pointInPolygon2D(point: Vec2, polygon: Vec2[]): boolean {
  const n = polygon.length;
  let inside = false;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    
    if (((yi > point[1]) !== (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Check if two line segments intersect (proper intersection, not just touching)
 */
function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1 = cross2D(b1, b2, a1);
  const d2 = cross2D(b1, b2, a2);
  const d3 = cross2D(a1, a2, b1);
  const d4 = cross2D(a1, a2, b2);
  
  // Proper intersection: points are on opposite sides of each line
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  
  return false;
}

/**
 * Cross product for 2D orientation test: (b - o) × (c - o)
 */
function cross2D(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
