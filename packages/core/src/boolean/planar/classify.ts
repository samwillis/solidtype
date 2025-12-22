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
 * Uses the centroid of the piece, offset slightly along the face normal,
 * to perform ray casting against the other body's faces.
 * 
 * We test from both sides of the face surface to handle boundary cases.
 */
export function classifyPiece(
  piece: FacePiece,
  otherBody: BodyId,
  model: TopoModel,
  ctx: NumericContext
): PieceClassification {
  // Compute centroid of the piece in 2D
  const centroid2D = computePolygonCentroid(piece.polygon);
  
  // Convert to 3D
  const centroid3D = unprojectFromPlane(centroid2D, piece.surface);
  
  // Use a more significant offset for testing (0.001 units instead of tiny tolerance)
  // This helps get clear inside/outside answers
  const testOffset = Math.max(ctx.tol.length * 1000, 0.001);
  const normal = piece.surface.normal;
  
  // Test from the positive normal side
  const testPointPos = add3(centroid3D, mul3(normal, testOffset));
  const insideFromPos = isPointInsideBody(testPointPos, otherBody, model, ctx);
  
  // Test from the negative normal side
  const testPointNeg = add3(centroid3D, mul3(normal, -testOffset));
  const insideFromNeg = isPointInsideBody(testPointNeg, otherBody, model, ctx);
  
  // If both tests agree, use that result
  if (insideFromPos && insideFromNeg) {
    return 'inside';
  }
  if (!insideFromPos && !insideFromNeg) {
    return 'outside';
  }
  
  // If they disagree, the face is ON the boundary
  // For boolean operations, we treat boundary faces based on
  // which side faces the interior of the other solid
  // If positive normal side is inside, face points into the solid
  if (insideFromPos) {
    return 'inside'; // Normal points into other body
  }
  
  return 'outside';
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
