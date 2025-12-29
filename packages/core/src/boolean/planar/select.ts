/**
 * Selection rules for planar boolean operations.
 * 
 * Based on classification, select which face pieces to keep and
 * whether to flip their orientations.
 */

import type { NumericContext } from '../../num/tolerance.js';
import { scaledTol, snap, createNumericContext } from '../../num/tolerance.js';
import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
import { dot3 } from '../../num/vec3.js';
import type { PlaneSurface } from '../../geom/surface.js';
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
  const numericCtx = ctx ?? createNumericContext();
  const tol = numericCtx.tol.length;
  const snapValue = (v: number) => snap(v, numericCtx, tol);
  
  // Normalize a 3D polygon loop (unproject 2D to 3D, then sort)
  const normalizeLoop3D = (piece: FacePiece): string => {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    // Create key for each vertex
    const vertexKeys = vertices3D.map(v => `${snapValue(v[0])},${snapValue(v[1])},${snapValue(v[2])}`);
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
      if (Math.abs(n[i]) > scaledTol(numericCtx, 0.1)) {
        sign = n[i] > 0 ? 1 : -1;
        break;
      }
    }
    const canonNormal: Vec3 = [n[0] * sign, n[1] * sign, n[2] * sign];
    
    // Compute plane equation: n · p = d (using canonical normal)
    // For the same plane, d will be the same regardless of which point on the plane we use
    const d = snapValue(dot3(surf.origin, canonNormal));
    
    const normKey = `${snapValue(canonNormal[0])},${snapValue(canonNormal[1])},${snapValue(canonNormal[2])}`;
    return `${normKey}|${d}`;
  };
  
  const polygonKey = (polygon: Vec2[], surface: PlaneSurface): string => {
    const verts3D = polygon.map(v => unprojectFromPlane(v, surface));
    const snapped = verts3D.map(v => `${snapValue(v[0])},${snapValue(v[1])},${snapValue(v[2])}`).sort();
    return snapped.join(';');
  };

  const coplanarShapeKey = (piece: FacePiece): string => {
    const outer = polygonKey(piece.polygon, piece.surface);
    const holes = piece.holes.map(h => polygonKey(h, piece.surface)).sort().join('||');
    return `${planeKey(piece)}|${outer}|holes:${holes}`;
  };
  
  // Key that includes polygon shape (for exact duplicates) - retained for future debugging
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _exactKey = (piece: FacePiece): string => `${planeKey(piece)}|${normalizeLoop3D(piece)}`;
  
  let fromA: FacePiece[];
  let fromB: FacePiece[];
  let flipB = false;
  
  switch (operation) {
    case 'union':
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      fromB = piecesB.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      break;
      
    case 'intersect':
      fromA = piecesA.filter(p => p.classification === 'inside' || p.classification === 'on_same');
      fromB = piecesB.filter(p => p.classification === 'inside' || p.classification === 'on_same');
      break;
      
    case 'subtract':
      fromA = piecesA.filter(p => p.classification === 'outside' || p.classification === 'on_same');
      fromB = piecesB.filter(p => p.classification === 'inside' || p.classification === 'on_same');
      flipB = true;
      break;
  }

  if (operation === 'subtract' && boundsA) {
    fromB = filterPiecesByBounds3D(fromB, boundsA, numericCtx);
  }
  
  if (operation === 'intersect' && boundsA && _boundsB) {
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
    
    fromA = filterPiecesByBounds3D(fromA, intersectBounds, numericCtx);
    fromB = filterPiecesByBounds3D(fromB, intersectBounds, numericCtx);
  }
  
  const seenCoplanar = new Set<string>();
  const dropCoplanarDuplicates = (piece: FacePiece): boolean => {
    const key = coplanarShapeKey(piece);
    if (seenCoplanar.has(key)) return false;
    seenCoplanar.add(key);
    return true;
  };
  fromA = fromA.filter(dropCoplanarDuplicates);
  fromB = fromB.filter(dropCoplanarDuplicates);
  
  // Final dedup: remove exact duplicates using 3D vertex positions
  // This catches coplanar faces from different bodies that occupy the same 3D space
  const geometry3DKey = (piece: FacePiece): string => {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    // Sort vertices by position to create a canonical key
    const vertexKeys = vertices3D
      .map(v => `${snapValue(v[0])},${snapValue(v[1])},${snapValue(v[2])}`)
      .sort();
    // Include normal direction for orientation
    const n = piece.surface.normal;
    const normalKey = `${snapValue(n[0])},${snapValue(n[1])},${snapValue(n[2])}`;
    return `${normalKey}|${vertexKeys.join(';')}`;
  };
  
  // Filter out pieces with duplicate vertices (degenerate cycles)
  const hasUniqueVertices = (piece: FacePiece): boolean => {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    const seen = new Set<string>();
    for (const v of vertices3D) {
      const key = `${snapValue(v[0])},${snapValue(v[1])},${snapValue(v[2])}`;
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

  // For subtract: collapse per-plane
  // - If any tool piece exists on a plane, drop all target pieces on that plane.
  // - Keep only the first tool piece per plane (after geometry dedup).
  if (operation === 'subtract') {
    const planesB = new Set(dedupedB.map(planeKey));
    const filteredA = dedupedA.filter(p => !planesB.has(planeKey(p)));

    const seenPlanes = new Set<string>();
    const mergedB: FacePiece[] = [];
    for (const p of dedupedB) {
      const pk = planeKey(p);
      if (seenPlanes.has(pk)) continue;
      seenPlanes.add(pk);
      mergedB.push(p);
    }

    return { fromA: filteredA, fromB: mergedB, flipB };
  }

  // For intersect: collapse per-plane to avoid duplicate coplanar faces
  // When both bodies have a face on the same plane, keep only one (prefer A)
  if (operation === 'intersect') {
    const seenPlanesA = new Set<string>();
    const filteredA: FacePiece[] = [];
    for (const p of dedupedA) {
      const pk = planeKey(p);
      if (!seenPlanesA.has(pk)) {
        seenPlanesA.add(pk);
        filteredA.push(p);
      }
    }
    
    // For B, skip planes already covered by A
    const filteredB: FacePiece[] = [];
    for (const p of dedupedB) {
      const pk = planeKey(p);
      if (!seenPlanesA.has(pk)) {
        seenPlanesA.add(pk); // Also track B's planes to avoid duplicates within B
        filteredB.push(p);
      }
    }
    
    return { fromA: filteredA, fromB: filteredB, flipB };
  }

  return { fromA: dedupedA, fromB: dedupedB, flipB };
}

/**
 * Filter pieces to keep only those that are at least partially within bounds.
 * 
 * For pieces that extend beyond bounds, clamps vertices to the exact bounds.
 * This ensures that the result doesn't contain geometry outside the target body.
 */
function filterPiecesByBounds3D(
  pieces: FacePiece[],
  bounds: BoundingBox3D,
  ctx: NumericContext
): FacePiece[] {
  const result: FacePiece[] = [];
  const boundsTol = scaledTol(ctx, 10);
  const snapBounds = (v: number) => snap(v, ctx, boundsTol);
  
  for (const piece of pieces) {
    const vertices3D = piece.polygon.map(v => unprojectFromPlane(v, piece.surface));
    if (vertices3D.length < 3) continue;
    
    // Quick reject: if the polygon's bounding box doesn't overlap the target bounds, skip it
    let pieceMin: Vec3 = [Infinity, Infinity, Infinity];
    let pieceMax: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const v of vertices3D) {
      pieceMin = [Math.min(pieceMin[0], v[0]), Math.min(pieceMin[1], v[1]), Math.min(pieceMin[2], v[2])];
      pieceMax = [Math.max(pieceMax[0], v[0]), Math.max(pieceMax[1], v[1]), Math.max(pieceMax[2], v[2])];
    }
    const overlaps =
      pieceMax[0] >= bounds.min[0] - boundsTol && pieceMin[0] <= bounds.max[0] + boundsTol &&
      pieceMax[1] >= bounds.min[1] - boundsTol && pieceMin[1] <= bounds.max[1] + boundsTol &&
      pieceMax[2] >= bounds.min[2] - boundsTol && pieceMin[2] <= bounds.max[2] + boundsTol;
    if (!overlaps) continue;
    
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
      const key = `${snapBounds(v[0])},${snapBounds(v[1])},${snapBounds(v[2])}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped3D.push([snapBounds(v[0]), snapBounds(v[1]), snapBounds(v[2])]);
      }
    }
    
    if (deduped3D.length < 3) continue;
    
    const clamped2DUnsorted = deduped3D.map(p => projectToPlane2D(p, piece.surface));
    // Sort vertices around centroid to avoid self-intersections after clamping
    const centroid2D: Vec2 = clamped2DUnsorted.reduce<Vec2>(
      (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
      [0, 0]
    ).map(v => v / clamped2DUnsorted.length) as Vec2;
    const sorted2D = [...clamped2DUnsorted].sort(
      (a, b) => Math.atan2(a[1] - centroid2D[1], a[0] - centroid2D[0]) -
                Math.atan2(b[1] - centroid2D[1], b[0] - centroid2D[0])
    );
    
    const area = computePolygonArea(sorted2D);
    
    if (area <= boundsTol * boundsTol) continue;
    
    result.push({
      ...piece,
      polygon: sorted2D,
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _pointInPolygon2D(point: Vec2, polygon: Vec2[]): boolean {
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
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
