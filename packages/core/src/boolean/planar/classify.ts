/**
 * Classification of face pieces for planar boolean operations.
 * 
 * Determines whether each face piece is INSIDE, OUTSIDE, or ON
 * the other solid using point-in-polygon/polyhedron tests.
 */

import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
import { vec3, add3, mul3, sub3, dot3 } from '../../num/vec3.js';
import type { NumericContext } from '../../num/tolerance.js';
import type { TopoModel } from '../../topo/TopoModel.js';
import type { BodyId, FaceId } from '../../topo/handles.js';
import type { PlaneSurface } from '../../geom/surface.js';
import type { FacePiece, PieceClassification } from './types.js';
import { pointInPolygon, unprojectFromPlane } from './intersect.js';

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
  ctx: NumericContext
): PieceClassification {
  const testOffset = Math.max(ctx.tol.length * 1000, 0.001);
  const normal = piece.surface.normal;
  
  // Get a test point on the face material
  const testPoint2D = findPointOnFaceMaterial(piece);
  const testPoint3D = unprojectFromPlane(testPoint2D, piece.surface);
  
  // Test from both sides
  const testPointPos = add3(testPoint3D, mul3(normal, testOffset));
  const insideFromPos = isPointInsideBody(testPointPos, otherBody, model, ctx);
  
  const testPointNeg = add3(testPoint3D, mul3(normal, -testOffset));
  const insideFromNeg = isPointInsideBody(testPointNeg, otherBody, model, ctx);
  
  // If both tests agree, use that result
  if (insideFromPos && insideFromNeg) {
    return 'inside';
  }
  if (!insideFromPos && !insideFromNeg) {
    return 'outside';
  }
  
  // Tests disagree - the piece is on the boundary
  // Check if there's a coplanar face of the other body at this location
  const coplanarResult = findCoplanarFace(testPoint3D, normal, otherBody, model, ctx);
  
  if (coplanarResult.found) {
    if (coplanarResult.sameNormal) {
      // Coplanar face with same normal - this is a shared exterior surface
      // For UNION: keep (both bodies share this surface)
      // For SUBTRACT: this is where the tool touches the target
      return 'on_same';
    } else {
      // Coplanar face with opposite normal - back-to-back faces
      return 'on_opposite';
    }
  }
  
  // No coplanar face found - classify based on material side
  // insideFromNeg = true means the material (opposite of normal) is inside
  if (insideFromNeg) {
    return 'inside';
  }
  
  return 'outside';
}

/**
 * Check if there's a coplanar face of the body at the given location
 */
function findCoplanarFace(
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
function findPointOnFaceMaterial(piece: FacePiece): Vec2 {
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
  for (const piece of pieces) {
    piece.classification = classifyPiece(piece, otherBody, model, ctx);
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

/**
 * Test if a 3D point is inside a body using ray casting
 */
function isPointInsideBody(
  point: Vec3,
  bodyId: BodyId,
  model: TopoModel,
  ctx: NumericContext
): boolean {
  // Cast ray along +X axis
  const rayDir: Vec3 = vec3(1, 0, 0);
  let intersectionCount = 0;
  
  const shells = model.getBodyShells(bodyId);
  
  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    
    for (const faceId of faces) {
      const surfaceIdx = model.getFaceSurfaceIndex(faceId);
      const surface = model.getSurface(surfaceIdx);
      
      if (surface.kind !== 'plane') {
        // Skip non-planar faces for now (they shouldn't exist in planar booleans)
        continue;
      }
      
      const plane = surface as PlaneSurface;
      
      // Ray-plane intersection
      const denom = dot3(rayDir, plane.normal);
      if (Math.abs(denom) < 1e-12) continue; // Parallel
      
      const t = dot3(sub3(plane.origin, point), plane.normal) / denom;
      if (t < -ctx.tol.length) continue; // Behind ray origin
      
      const hitPoint = add3(point, mul3(rayDir, t));
      
      // Check if hit point is inside face polygon
      if (pointInFace(hitPoint, faceId, model, plane)) {
        intersectionCount++;
      }
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
  plane: PlaneSurface
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
  
  // Point-in-polygon test
  let inside = pointInPolygon([u2d, v2d], polygon);
  
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
