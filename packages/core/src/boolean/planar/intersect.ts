/**
 * Plane-plane intersection for planar boolean operations
 * 
 * Given two planar faces, computes the intersection line and clips it
 * against each face's polygon boundary.
 */

import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
import { dot3, cross3, sub3, add3, mul3, normalize3, length3 } from '../../num/vec3.js';
import type { NumericContext } from '../../num/tolerance.js';
import { isZero } from '../../num/tolerance.js';
import type { PlaneSurface } from '../../geom/surface.js';
import type { Segment2D, FacePolygon2D } from './types.js';

/**
 * Result of intersecting two planes
 */
export interface PlaneIntersection {
  /** Direction of intersection line (normalized) */
  direction: Vec3;
  /** A point on the intersection line */
  point: Vec3;
}

/**
 * Compute the intersection line of two planes.
 * Returns null if planes are parallel.
 */
export function intersectPlanes(
  planeA: PlaneSurface,
  planeB: PlaneSurface,
  ctx: NumericContext
): PlaneIntersection | null {
  // Direction of intersection line is cross product of normals
  const direction = cross3(planeA.normal, planeB.normal);
  const dirLen = length3(direction);
  
  if (isZero(dirLen, ctx)) {
    // Planes are parallel
    return null;
  }
  
  // Normalize direction
  const normDir = normalize3(direction);
  
  // Find a point on the intersection line
  // Solve system: n1 · p = d1, n2 · p = d2, and choose the point closest to origin
  // that lies on both planes
  const d1 = dot3(planeA.normal, planeA.origin);
  const d2 = dot3(planeB.normal, planeB.origin);
  
  // Use the formula for finding a point on the intersection line
  // p = ((d1 * n2 - d2 * n1) × dir) / |dir|²  + arbitrary component along dir
  const n1 = planeA.normal;
  const n2 = planeB.normal;
  
  // The point can be computed as:
  // p = (d2 * (dir × n1) + d1 * (n2 × dir)) / (dir · dir)
  // but since dir is normalized, dir · dir = 1
  const point = add3(
    mul3(cross3(normDir, n1), d2),
    mul3(cross3(n2, normDir), d1)
  );
  
  return { direction: normDir, point };
}

/**
 * Project a 3D point onto a plane's local 2D coordinates
 */
export function projectToPlane2D(point: Vec3, plane: PlaneSurface): Vec2 {
  const v = sub3(point, plane.origin);
  return [dot3(v, plane.xDir), dot3(v, plane.yDir)];
}

/**
 * Unproject a 2D point from plane coordinates back to 3D
 */
export function unprojectFromPlane(uv: Vec2, plane: PlaneSurface): Vec3 {
  return add3(
    plane.origin,
    add3(
      mul3(plane.xDir, uv[0]),
      mul3(plane.yDir, uv[1])
    )
  );
}

/**
 * Clip a line (given by direction and point) against a polygon.
 * Returns the segment(s) of the line that lie inside the polygon.
 * 
 * Uses a simpler approach: find all edge crossings, sort by parameter,
 * then use odd-even rule to determine inside intervals.
 * 
 * Returns empty if the line lies on a polygon edge (degenerate case).
 */
export function clipLineToPolygon(
  linePoint: Vec2,
  lineDir: Vec2,
  polygon: Vec2[],
  _ctx: NumericContext
): { tStart: number; tEnd: number }[] {
  if (polygon.length < 3) return [];
  
  // Normalize line direction for consistent parameterization
  const dirLen = Math.sqrt(lineDir[0] ** 2 + lineDir[1] ** 2);
  if (dirLen < 1e-12) return [];
  
  // First, check if the line lies ON any polygon edge (degenerate case)
  // If so, return empty - this intersection doesn't create a proper face split
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    
    const edgeDir: Vec2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const edgeLen = Math.sqrt(edgeDir[0] ** 2 + edgeDir[1] ** 2);
    if (edgeLen < 1e-12) continue;
    
    // Check if line is parallel to this edge
    const cross = lineDir[0] * edgeDir[1] - lineDir[1] * edgeDir[0];
    if (Math.abs(cross) < 1e-10 * edgeLen) {
      // Parallel - check if linePoint is on the edge line
      const toP1: Vec2 = [p1[0] - linePoint[0], p1[1] - linePoint[1]];
      const distToLine = Math.abs(toP1[0] * edgeDir[1] - toP1[1] * edgeDir[0]) / edgeLen;
      if (distToLine < 1e-10) {
        // Line lies ON this edge - degenerate case
        // Return empty to skip this intersection
        return [];
      }
    }
  }
  
  // Collect intersection parameters with polygon edges
  const crossings: number[] = [];
  
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    
    const edgeDir: Vec2 = [p2[0] - p1[0], p2[1] - p1[1]];
    
    // Solve: linePoint + t * lineDir = p1 + s * edgeDir
    const denom = lineDir[0] * edgeDir[1] - lineDir[1] * edgeDir[0];
    
    if (Math.abs(denom) < 1e-12) {
      // Line parallel to edge - skip
      continue;
    }
    
    const diff: Vec2 = [p1[0] - linePoint[0], p1[1] - linePoint[1]];
    const t = (diff[0] * edgeDir[1] - diff[1] * edgeDir[0]) / denom;
    const s = (diff[0] * lineDir[1] - diff[1] * lineDir[0]) / denom;
    
    // Check if intersection is within edge bounds (exclusive of endpoints to avoid double counting)
    if (s > 1e-10 && s < 1 - 1e-10) {
      crossings.push(t);
    } else if (Math.abs(s) < 1e-10) {
      // Intersection at p1 - count only if entering/leaving through this vertex
      // For simplicity, include it
      crossings.push(t);
    }
  }
  
  if (crossings.length === 0) {
    // No edge crossings - check if line is entirely inside or outside
    if (pointInPolygon(linePoint, polygon)) {
      // Line is entirely inside polygon - return a large interval
      return [{ tStart: -1e10, tEnd: 1e10 }];
    }
    return [];
  }
  
  // Sort crossings by parameter
  crossings.sort((a, b) => a - b);
  
  // Remove duplicates (within tolerance)
  const uniqueCrossings: number[] = [crossings[0]];
  for (let i = 1; i < crossings.length; i++) {
    if (Math.abs(crossings[i] - uniqueCrossings[uniqueCrossings.length - 1]) > 1e-10) {
      uniqueCrossings.push(crossings[i]);
    }
  }
  
  // Use odd-even rule: between each pair of crossings, test if inside
  const segments: { tStart: number; tEnd: number }[] = [];
  
  // Test before first crossing
  const testBefore: Vec2 = [
    linePoint[0] + (uniqueCrossings[0] - 1) * lineDir[0],
    linePoint[1] + (uniqueCrossings[0] - 1) * lineDir[1]
  ];
  let inside = pointInPolygon(testBefore, polygon);
  
  if (inside) {
    // Line starts inside - interval from -infinity to first crossing
    // (will be clipped later by 3D overlap)
    segments.push({ tStart: -1e10, tEnd: uniqueCrossings[0] });
  }
  
  // Process each interval between crossings
  for (let i = 0; i < uniqueCrossings.length - 1; i++) {
    inside = !inside; // Toggle at each crossing
    if (inside) {
      segments.push({ tStart: uniqueCrossings[i], tEnd: uniqueCrossings[i + 1] });
    }
  }
  
  // Test after last crossing
  inside = !inside;
  if (inside) {
    segments.push({ tStart: uniqueCrossings[uniqueCrossings.length - 1], tEnd: 1e10 });
  }
  
  return segments;
}

/**
 * Point-in-polygon test using ray casting
 */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  const n = polygon.length;
  let inside = false;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    
    if (((yi > point[1]) !== (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Compute intersection segments between two planar faces.
 * Returns segments in the 2D coordinate system of each face.
 * 
 * @param operation Optional boolean operation type. Affects coplanar face handling:
 *   - 'union': Skip imprinting for same-normal coplanar faces
 *   - 'subtract'/'intersect': Always imprint for proper hole creation
 */
export function computeFaceIntersection(
  faceA: FacePolygon2D,
  faceB: FacePolygon2D,
  ctx: NumericContext,
  operation?: 'union' | 'subtract' | 'intersect'
): { segmentsA: Segment2D[]; segmentsB: Segment2D[] } | null {
  // Intersect the two planes
  const intersection = intersectPlanes(faceA.surface, faceB.surface, ctx);
  
  if (!intersection) {
    // Planes are parallel - check if coplanar
    const dist = dot3(sub3(faceB.surface.origin, faceA.surface.origin), faceA.surface.normal);
    if (Math.abs(dist) < ctx.tol.length) {
      // Coplanar faces - handle specially (overlap detection)
      return handleCoplanarFaces(faceA, faceB, ctx, operation);
    }
    return null;
  }
  
  // Project intersection line to each face's 2D system
  const linePointA = projectToPlane2D(intersection.point, faceA.surface);
  const lineDirA = projectToPlane2D(
    add3(intersection.point, intersection.direction),
    faceA.surface
  );
  const lineDirA2D: Vec2 = [lineDirA[0] - linePointA[0], lineDirA[1] - linePointA[1]];
  const lenA = Math.sqrt(lineDirA2D[0] ** 2 + lineDirA2D[1] ** 2);
  if (lenA > 1e-12) {
    lineDirA2D[0] /= lenA;
    lineDirA2D[1] /= lenA;
  }
  
  const linePointB = projectToPlane2D(intersection.point, faceB.surface);
  const lineDirB = projectToPlane2D(
    add3(intersection.point, intersection.direction),
    faceB.surface
  );
  const lineDirB2D: Vec2 = [lineDirB[0] - linePointB[0], lineDirB[1] - linePointB[1]];
  const lenB = Math.sqrt(lineDirB2D[0] ** 2 + lineDirB2D[1] ** 2);
  if (lenB > 1e-12) {
    lineDirB2D[0] /= lenB;
    lineDirB2D[1] /= lenB;
  }
  
  // Clip line to each polygon
  const intervalsA = clipLineToPolygon(linePointA, lineDirA2D, faceA.outer, ctx);
  const intervalsB = clipLineToPolygon(linePointB, lineDirB2D, faceB.outer, ctx);
  
  if (intervalsA.length === 0 || intervalsB.length === 0) {
    return null;
  }
  
  // Map A's intervals to 3D and then to B's parameter space (and vice versa)
  // to find the overlap
  const segmentsA: Segment2D[] = [];
  const segmentsB: Segment2D[] = [];
  
  // For each pair of intervals, compute overlap
  for (const intA of intervalsA) {
    for (const intB of intervalsB) {
      // Convert B interval to A's parameter space
      // A point at tA in A corresponds to:
      // 3D: linePointA (in 3D) + tA * intersection.direction (in 3D)
      // Actually, we need to map through 3D...
      
      // Simpler approach: map both to a common 3D parameter
      // tA and tB are both along the same 3D line, so we just need to find the transform
      // The scaling might differ if lineDirA2D and lineDirB2D have different lengths relative to 3D dir
      
      // Since we normalized, tA in 2D corresponds to tA * lenA in 3D direction
      // and tB in 2D corresponds to tB * lenB in 3D direction
      // We need to map them to a common space
      
      // Actually, after normalization, t represents distance in 2D. 
      // The 3D intersection line has unit direction, so we need to figure out
      // how 2D distance relates to 3D distance for each plane.
      
      // For simplicity, use 3D mapping:
      // Point on line at 2D param tA (in face A): 
      // 3D pos = unprojectFromPlane([linePointA[0] + tA * lineDirA2D[0], linePointA[1] + tA * lineDirA2D[1]], faceA.surface)
      
      // To get overlap, compute 3D points at interval endpoints and find intersection
      const a3d_start = unprojectFromPlane(
        [linePointA[0] + intA.tStart * lineDirA2D[0], linePointA[1] + intA.tStart * lineDirA2D[1]],
        faceA.surface
      );
      const a3d_end = unprojectFromPlane(
        [linePointA[0] + intA.tEnd * lineDirA2D[0], linePointA[1] + intA.tEnd * lineDirA2D[1]],
        faceA.surface
      );
      
      const b3d_start = unprojectFromPlane(
        [linePointB[0] + intB.tStart * lineDirB2D[0], linePointB[1] + intB.tStart * lineDirB2D[1]],
        faceB.surface
      );
      const b3d_end = unprojectFromPlane(
        [linePointB[0] + intB.tEnd * lineDirB2D[0], linePointB[1] + intB.tEnd * lineDirB2D[1]],
        faceB.surface
      );
      
      // Project all to the line direction for 1D interval intersection
      const aStart1D = dot3(sub3(a3d_start, intersection.point), intersection.direction);
      const aEnd1D = dot3(sub3(a3d_end, intersection.point), intersection.direction);
      const bStart1D = dot3(sub3(b3d_start, intersection.point), intersection.direction);
      const bEnd1D = dot3(sub3(b3d_end, intersection.point), intersection.direction);
      
      // Ensure order
      const aMin = Math.min(aStart1D, aEnd1D);
      const aMax = Math.max(aStart1D, aEnd1D);
      const bMin = Math.min(bStart1D, bEnd1D);
      const bMax = Math.max(bStart1D, bEnd1D);
      
      // Compute overlap
      const overlapMin = Math.max(aMin, bMin);
      const overlapMax = Math.min(aMax, bMax);
      
      if (overlapMax - overlapMin < ctx.tol.length) continue; // No significant overlap
      
      // Convert overlap back to 2D segments for each face
      const pt3d_start = add3(intersection.point, mul3(intersection.direction, overlapMin));
      const pt3d_end = add3(intersection.point, mul3(intersection.direction, overlapMax));
      
      const segA: Segment2D = {
        a: projectToPlane2D(pt3d_start, faceA.surface),
        b: projectToPlane2D(pt3d_end, faceA.surface),
        sourceBody: 1, // This segment comes from intersection with B
        sourceFace: faceB.faceId,
        sourceHalfEdge: null,
        isIntersection: true
      };
      
      const segB: Segment2D = {
        a: projectToPlane2D(pt3d_start, faceB.surface),
        b: projectToPlane2D(pt3d_end, faceB.surface),
        sourceBody: 0, // This segment comes from intersection with A
        sourceFace: faceA.faceId,
        sourceHalfEdge: null,
        isIntersection: true
      };
      
      segmentsA.push(segA);
      segmentsB.push(segB);
    }
  }
  
  if (segmentsA.length === 0) return null;
  
  return { segmentsA, segmentsB };
}

/**
 * Handle coplanar face intersection (polygon overlap)
 * 
 * For coplanar faces:
 * - SAME normal + UNION: Skip imprinting (faces are part of same exterior surface)
 * - SAME normal + SUBTRACT/INTERSECT: Imprint for hole creation
 * - OPPOSITE normal: Always imprint for proper splitting
 */
function handleCoplanarFaces(
  faceA: FacePolygon2D,
  faceB: FacePolygon2D,
  _ctx: NumericContext,
  operation?: 'union' | 'subtract' | 'intersect'
): { segmentsA: Segment2D[]; segmentsB: Segment2D[] } | null {
  const dotNormals = dot3(faceA.surface.normal, faceB.surface.normal);
  
  if (dotNormals > 0.9 && operation === 'union') {
    // Same normal direction + UNION
    // Both faces are part of the same exterior surface
    // Don't imprint; classification will handle keeping the correct faces
    return null;
  }
  
  if (Math.abs(dotNormals) < 0.9) {
    // Normals neither aligned nor opposite - shouldn't happen for truly coplanar faces
    return null;
  }
  
  // For opposite normals (dotNormals < -0.9) or same normals with subtract/intersect,
  // add intersection segments
  const segmentsA: Segment2D[] = [];
  const segmentsB: Segment2D[] = [];
  
  // Transform B's polygon to A's coordinate system
  const bInA: Vec2[] = faceB.outer.map(p => {
    const p3d = unprojectFromPlane(p, faceB.surface);
    return projectToPlane2D(p3d, faceA.surface);
  });
  
  // Add edges of B that are inside A
  for (let i = 0; i < bInA.length; i++) {
    const p1 = bInA[i];
    const p2 = bInA[(i + 1) % bInA.length];
    
    const p1Inside = pointInPolygon(p1, faceA.outer);
    const p2Inside = pointInPolygon(p2, faceA.outer);
    
    if (p1Inside || p2Inside) {
      segmentsA.push({
        a: p1,
        b: p2,
        sourceBody: 1,
        sourceFace: faceB.faceId,
        sourceHalfEdge: null,
        isIntersection: true
      });
    }
  }
  
  // Similarly for A in B's space
  const aInB: Vec2[] = faceA.outer.map(p => {
    const p3d = unprojectFromPlane(p, faceA.surface);
    return projectToPlane2D(p3d, faceB.surface);
  });
  
  for (let i = 0; i < aInB.length; i++) {
    const p1 = aInB[i];
    const p2 = aInB[(i + 1) % aInB.length];
    
    const p1Inside = pointInPolygon(p1, faceB.outer);
    const p2Inside = pointInPolygon(p2, faceB.outer);
    
    if (p1Inside || p2Inside) {
      segmentsB.push({
        a: p1,
        b: p2,
        sourceBody: 0,
        sourceFace: faceA.faceId,
        sourceHalfEdge: null,
        isIntersection: true
      });
    }
  }
  
  return { segmentsA, segmentsB };
}

