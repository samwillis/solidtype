/**
 * Classification of face pieces for planar boolean operations.
 * 
 * Determines whether each face piece is INSIDE, OUTSIDE, or ON
 * the other solid using point-in-polygon/polyhedron tests.
 */

import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
import { vec3, add3, mul3, sub3, dot3, normalize3 } from '../../num/vec3.js';
import type { NumericContext } from '../../num/tolerance.js';
import { scaledTol } from '../../num/tolerance.js';
import type { TopoModel } from '../../topo/TopoModel.js';
import type { BodyId, FaceId } from '../../topo/handles.js';
import type { PlaneSurface } from '../../geom/surface.js';
import type { FacePiece, PieceClassification, BoundingBox3D } from './types.js';
import { pointInPolygon, unprojectFromPlane } from './intersect.js';
import { isPointOnSegment2D } from '../../num/predicates.js';

interface FaceRecord {
  faceId: FaceId;
  plane: PlaneSurface;
  bounds: { min: Vec3; max: Vec3 };
}

/**
 * Classify a face piece relative to another body.
 * 
 * Uses test points on the face material, offset slightly along the face normal,
 * to perform ray casting against the other body's faces.
 * 
 * For boundary cases (where tests disagree), we check if there's a coplanar
 * face of the other body with the same normal (on_same) or opposite normal
 * (on_opposite). If not, we classify based on which side has the material.
 */
export function classifyPiece(
  piece: FacePiece,
  otherBody: BodyId,
  model: TopoModel,
  ctx: NumericContext,
  faceIndex?: FaceRecord[]
): PieceClassification {
  const testOffset = scaledTol(ctx, 50);
  const normal = piece.surface.normal;
  
  // Sample multiple points (interior + vertices) with offset tests.
  const samplePoints3D: Vec3[] = [];
  const interior2D = pickInteriorPoint(piece);
  const interior3D = unprojectFromPlane(interior2D, piece.surface);
  samplePoints3D.push(interior3D);
  for (const v of piece.polygon) {
    samplePoints3D.push(unprojectFromPlane(v, piece.surface));
  }
  
  let insideHits = 0;
  let outsideHits = 0;
  let boundaryHits = 0;
  
  for (const pt of samplePoints3D) {
    const pos = add3(pt, mul3(normal, testOffset));
    const neg = add3(pt, mul3(normal, -testOffset));
    const inPos = isPointInsideBody(pos, otherBody, model, ctx, faceIndex);
    const inNeg = isPointInsideBody(neg, otherBody, model, ctx, faceIndex);
    
    if (inPos && inNeg) {
      insideHits++;
    } else if (!inPos && !inNeg) {
      outsideHits++;
    } else {
      boundaryHits++;
    }
  }
  
  // Use the centroid for primary classification, then validate with other points
  // If centroid is clearly inside or outside, use that
  // If mixed or boundary, use 'on_same' for boundary handling
  
  let result: PieceClassification;
  
  // Classification strategy using majority voting:
  // - Use the centroid as the primary classification signal
  // - If centroid is clear (inside or outside), use that
  // - If centroid is on boundary, use majority of other points
  // - Treat boundary-heavy cases as on_same
  
  // Check centroid first (first sample point)
  const centroidPt = samplePoints3D[0];
  const centroidPos = add3(centroidPt, mul3(normal, testOffset));
  const centroidNeg = add3(centroidPt, mul3(normal, -testOffset));
  const centroidInPos = isPointInsideBody(centroidPos, otherBody, model, ctx, faceIndex);
  const centroidInNeg = isPointInsideBody(centroidNeg, otherBody, model, ctx, faceIndex);
  
  const centroidIsInside = centroidInPos && centroidInNeg;
  const centroidIsOutside = !centroidInPos && !centroidInNeg;
  if (centroidIsInside) {
    result = 'inside';
  } else if (centroidIsOutside) {
    result = 'outside';
  } else {
    // Centroid is on boundary - use majority of all points
    const totalPoints = insideHits + outsideHits + boundaryHits;
    if (insideHits > totalPoints / 2) {
      result = 'inside';
    } else if (outsideHits > totalPoints / 2) {
      result = 'outside';
    } else {
      // No clear majority - truly on boundary
      result = 'on_same';
    }
  }

  // Fallback: if we believe the piece is outside but the face plane
  // actually cuts through the other body's bounding box (and their
  // bounds overlap), keep it as boundary so it can be clamped later.
  if (result === 'outside') {
    const otherBounds = faceIndex ? combineBounds(faceIndex) : combineBounds(buildFaceIndex(otherBody, model, ctx));
    const pieceBounds = computePieceBounds(piece);
    if (
      boundsOverlap(pieceBounds, otherBounds, scaledTol(ctx, 10)) &&
      planeIntersectsBounds(piece.surface, otherBounds, scaledTol(ctx, 10))
    ) {
      result = 'on_same';
    }
  }

  if (result === 'on_same') {
    const coplanar = _findCoplanarFace(interior3D, normal, otherBody, model, ctx);
    if (coplanar.found) {
      result = coplanar.sameNormal ? 'on_same' : 'on_opposite';
    }
  }
  return result;
}

/**
 * Check if there's a coplanar face of the body at the given location
 * Reserved for future use in advanced coplanar face classification.
 */
export function _findCoplanarFace(
  point: Vec3,
  normal: Vec3,
  bodyId: BodyId,
  model: TopoModel,
  ctx: NumericContext
): { found: boolean; sameNormal: boolean } {
  const shells = model.getBodyShells(bodyId);
  
  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    
    for (const faceId of faces) {
      const surfaceIdx = model.getFaceSurfaceIndex(faceId);
      const surface = model.getSurface(surfaceIdx);
      
      if (surface.kind !== 'plane') continue;
      
      const plane = surface as PlaneSurface;
      
      // Check if point is on this plane
      const dist = dot3(sub3(point, plane.origin), plane.normal);
      if (Math.abs(dist) > ctx.tol.length * 10) continue;
      
      // Point is on this plane - check if it's inside the face polygon
      const loops = model.getFaceLoops(faceId);
      if (loops.length === 0) continue;
      
      // Project point to face's 2D space
      const v = sub3(point, plane.origin);
      const u2d = dot3(v, plane.xDir);
      const v2d = dot3(v, plane.yDir);
      
      // Get face polygon
      const polygon: Vec2[] = [];
      for (const he of model.iterateLoopHalfEdges(loops[0])) {
        const vertex = model.getHalfEdgeStartVertex(he);
        const pos = model.getVertexPosition(vertex);
        const pv = sub3(pos, plane.origin);
        polygon.push([dot3(pv, plane.xDir), dot3(pv, plane.yDir)]);
      }
      
      if (pointInPolygon([u2d, v2d], polygon)) {
        // Point is inside this face's polygon
        const dotNormals = dot3(normal, plane.normal);
        return {
          found: true,
          sameNormal: dotNormals > 0.9
        };
      }
    }
  }
  
  return { found: false, sameNormal: false };
}

/**
 * Find a point that's on the face material, avoiding any holes.
 * 
 * For faces without holes, just return the centroid.
 * For faces with holes, find a point on the outer boundary that's not in any hole.
 */
export function _findPointOnFaceMaterial(piece: FacePiece): Vec2 {
  const centroid = computePolygonCentroid(piece.polygon);
  
  // If no holes, centroid is fine
  if (piece.holes.length === 0) {
    return centroid;
  }
  
  // Check if centroid is inside any hole
  let centroidInHole = false;
  for (const hole of piece.holes) {
    if (pointInPolygon2D(centroid, hole)) {
      centroidInHole = true;
      break;
    }
  }
  
  if (!centroidInHole) {
    return centroid;
  }
  
  // Centroid is in a hole - find a point on the outer boundary that's not in a hole
  // Try points along the first edge of the outer boundary
  const n = piece.polygon.length;
  for (let i = 0; i < n; i++) {
    const p0 = piece.polygon[i];
    const p1 = piece.polygon[(i + 1) % n];
    
    // Try midpoint of edge
    const mid: Vec2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    
    // Move slightly inward (toward centroid)
    const towardCenter: Vec2 = [centroid[0] - mid[0], centroid[1] - mid[1]];
    const len = Math.sqrt(towardCenter[0] ** 2 + towardCenter[1] ** 2);
    if (len > 1e-10) {
      const offset = 0.001;
      const testPt: Vec2 = [mid[0] + towardCenter[0] / len * offset, mid[1] + towardCenter[1] / len * offset];
      
      // Check if this point is inside the outer polygon and not in any hole
      if (pointInPolygon2D(testPt, piece.polygon)) {
        let inHole = false;
        for (const hole of piece.holes) {
          if (pointInPolygon2D(testPt, hole)) {
            inHole = true;
            break;
          }
        }
        if (!inHole) {
          return testPt;
        }
      }
    }
  }
  
  // Fallback: try vertices of outer polygon
  // They should definitely be on the face material (on the boundary at least)
  return piece.polygon[0];
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
 * Classify all pieces from a body relative to another body
 */
export function classifyAllPieces(
  pieces: FacePiece[],
  otherBody: BodyId,
  model: TopoModel,
  ctx: NumericContext
): void {
  const faceIndex = buildFaceIndex(otherBody, model, ctx);
  for (const piece of pieces) {
    piece.classification = classifyPiece(piece, otherBody, model, ctx, faceIndex);
  }
}

/**
 * Compute centroid of a 2D polygon
 */
function computePolygonCentroid(polygon: Vec2[]): Vec2 {
  if (polygon.length === 0) return [0, 0];
  
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1];
    area += cross;
    cx += (polygon[i][0] + polygon[j][0]) * cross;
    cy += (polygon[i][1] + polygon[j][1]) * cross;
  }
  
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate polygon - use simple average
    let sumX = 0, sumY = 0;
    for (const p of polygon) {
      sumX += p[0];
      sumY += p[1];
    }
    return [sumX / n, sumY / n];
  }
  
  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

function isPointInFace2D(pt: Vec2, piece: FacePiece): boolean {
  if (!pointInPolygon2D(pt, piece.polygon)) return false;
  for (const hole of piece.holes) {
    if (pointInPolygon2D(pt, hole)) return false;
  }
  return true;
}

function pickInteriorPoint(piece: FacePiece): Vec2 {
  const centroid = computePolygonCentroid(piece.polygon);
  if (isPointInFace2D(centroid, piece)) return centroid;
  // Try triangle fan centroids from first vertex
  for (let i = 1; i < piece.polygon.length - 1; i++) {
    const tri = [
      piece.polygon[0],
      piece.polygon[i],
      piece.polygon[i + 1],
    ] as const;
    const triCentroid: Vec2 = [
      (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
      (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
    ];
    if (isPointInFace2D(triCentroid, piece)) return triCentroid;
  }
  // Fallback to first vertex
  return piece.polygon[0];
}

function buildFaceIndex(bodyId: BodyId, model: TopoModel, ctx: NumericContext): FaceRecord[] {
  const faces: FaceRecord[] = [];
  const shells = model.getBodyShells(bodyId);
  for (const shellId of shells) {
    const shellFaces = model.getShellFaces(shellId);
    for (const faceId of shellFaces) {
      const surfaceIdx = model.getFaceSurfaceIndex(faceId);
      const surface = model.getSurface(surfaceIdx);
      if (surface.kind !== 'plane') continue;
      const loops = model.getFaceLoops(faceId);
      if (loops.length === 0) continue;
      let min: Vec3 = [Infinity, Infinity, Infinity];
      let max: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (const he of model.iterateLoopHalfEdges(loops[0])) {
        const vId = model.getHalfEdgeStartVertex(he);
        const pos = model.getVertexPosition(vId);
        min = [Math.min(min[0], pos[0]), Math.min(min[1], pos[1]), Math.min(min[2], pos[2])];
        max = [Math.max(max[0], pos[0]), Math.max(max[1], pos[1]), Math.max(max[2], pos[2])];
      }
      const pad = scaledTol(ctx, 2);
      min = [min[0] - pad, min[1] - pad, min[2] - pad];
      max = [max[0] + pad, max[1] + pad, max[2] + pad];
      faces.push({ faceId, plane: surface as PlaneSurface, bounds: { min, max } });
    }
  }
  return faces;
}

function combineBounds(records: FaceRecord[]): BoundingBox3D {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  
  for (const r of records) {
    min[0] = Math.min(min[0], r.bounds.min[0]);
    min[1] = Math.min(min[1], r.bounds.min[1]);
    min[2] = Math.min(min[2], r.bounds.min[2]);
    max[0] = Math.max(max[0], r.bounds.max[0]);
    max[1] = Math.max(max[1], r.bounds.max[1]);
    max[2] = Math.max(max[2], r.bounds.max[2]);
  }
  
  return { min, max };
}

function computePieceBounds(piece: FacePiece): BoundingBox3D {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const push = (p: Vec3) => {
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    min[2] = Math.min(min[2], p[2]);
    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
    max[2] = Math.max(max[2], p[2]);
  };
  for (const v of piece.polygon) {
    push(unprojectFromPlane(v, piece.surface));
  }
  for (const hole of piece.holes) {
    for (const v of hole) {
      push(unprojectFromPlane(v, piece.surface));
    }
  }
  return { min, max };
}

function boundsOverlap(a: BoundingBox3D, b: BoundingBox3D, tol: number): boolean {
  return (
    a.max[0] >= b.min[0] - tol && a.min[0] <= b.max[0] + tol &&
    a.max[1] >= b.min[1] - tol && a.min[1] <= b.max[1] + tol &&
    a.max[2] >= b.min[2] - tol && a.min[2] <= b.max[2] + tol
  );
}

function planeIntersectsBounds(plane: PlaneSurface, bounds: BoundingBox3D, tol: number): boolean {
  // Evaluate signed distances at all 8 corners
  const corners: Vec3[] = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ];
  
  let minDist = Infinity;
  let maxDist = -Infinity;
  
  for (const c of corners) {
    const dist = dot3(sub3(c, plane.origin), plane.normal);
    minDist = Math.min(minDist, dist);
    maxDist = Math.max(maxDist, dist);
  }
  
  return minDist <= tol && maxDist >= -tol;
}

function aabbRayIntersect(origin: Vec3, dir: Vec3, bounds: { min: Vec3; max: Vec3 }): boolean {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const invD = 1 / dir[i];
    let t0 = (bounds.min[i] - origin[i]) * invD;
    let t1 = (bounds.max[i] - origin[i]) * invD;
    if (invD < 0) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmax < tmin) return false;
  }
  return tmax >= 0;
}

/**
 * Test if a 3D point is inside a body using ray casting
 */
function isPointInsideBody(
  point: Vec3,
  bodyId: BodyId,
  model: TopoModel,
  ctx: NumericContext,
  faceIndex?: FaceRecord[]
): boolean {
  // Cast ray along a slightly off-axis direction to avoid hitting face edges/corners exactly.
  // Using irrational-ish numbers to minimize the chance of hitting exact boundaries.
  const rayDir: Vec3 = normalize3(vec3(1, 0.00017, 0.00013));
  let intersectionCount = 0;
  
  const faces = faceIndex ?? buildFaceIndex(bodyId, model, ctx);
  for (const face of faces) {
    if (!aabbRayIntersect(point, rayDir, face.bounds)) continue;
    
    const plane = face.plane;
    const denom = dot3(rayDir, plane.normal);
    if (Math.abs(denom) < scaledTol(ctx, 0.1)) continue; // Parallel
    
    const t = dot3(sub3(plane.origin, point), plane.normal) / denom;
    if (t < -ctx.tol.length) continue; // Behind ray origin
    
    const hitPoint = add3(point, mul3(rayDir, t));
    
    // Check if hit point is inside face polygon
    if (pointInFace(hitPoint, face.faceId, model, plane, ctx)) {
      intersectionCount++;
    }
  }
  
  // Odd number of intersections = inside
  return intersectionCount % 2 === 1;
}

/**
 * Check if a 3D point (on a plane) is inside a face's polygon
 */
function pointInFace(
  point: Vec3,
  faceId: FaceId,
  model: TopoModel,
  plane: PlaneSurface,
  ctx: NumericContext
): boolean {
  // Project point to 2D
  const v = sub3(point, plane.origin);
  const u2d = dot3(v, plane.xDir);
  const v2d = dot3(v, plane.yDir);
  
  // Get face outer loop vertices
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return false;
  
  const outerLoop = loops[0];
  const polygon: Vec2[] = [];
  
  for (const he of model.iterateLoopHalfEdges(outerLoop)) {
    const vertex = model.getHalfEdgeStartVertex(he);
    const pos = model.getVertexPosition(vertex);
    const pv = sub3(pos, plane.origin);
    polygon.push([dot3(pv, plane.xDir), dot3(pv, plane.yDir)]);
  }
  
  // Point-in-polygon test with boundary tolerance
  let inside = pointInPolygon([u2d, v2d], polygon);
  if (!inside) {
    // Check if on boundary within tolerance
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (isPointOnSegment2D([u2d, v2d], a, b, { tol: { length: ctx.tol.length, angle: ctx.tol.angle } } as any)) {
        inside = true;
        break;
      }
    }
  }
  
  // Check holes (inner loops) - if point is in a hole, it's outside the face
  for (let i = 1; i < loops.length; i++) {
    const holeLoop = loops[i];
    const holePolygon: Vec2[] = [];
    
    for (const he of model.iterateLoopHalfEdges(holeLoop)) {
      const vertex = model.getHalfEdgeStartVertex(he);
      const pos = model.getVertexPosition(vertex);
      const pv = sub3(pos, plane.origin);
      holePolygon.push([dot3(pv, plane.xDir), dot3(pv, plane.yDir)]);
    }
    
    if (pointInPolygon([u2d, v2d], holePolygon)) {
      inside = false;
    }
  }
  
  return inside;
}
