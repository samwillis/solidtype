/**
 * Geometric predicates
 * 
 * These functions perform geometric classification and orientation tests.
 * Uses Shewchuk-style adaptive precision robust predicates via mourner/robust-predicates
 * to avoid numerical errors in geometric computations.
 * 
 * All predicates take a NumericContext for tolerance-aware comparisons.
 */

import type { Vec2 } from './vec2.js';
import type { Vec3 } from './vec3.js';
import type { NumericContext } from './tolerance.js';
// cross2 no longer needed - using robust-predicates
// import { cross2 } from './vec2.js';
import { cross3, dot3, sub3 } from './vec3.js';
import { isZero } from './tolerance.js';
import { orient2d as robustOrient2d, orient3d as robustOrient3d } from 'robust-predicates';

/**
 * 2D orientation test using ROBUST predicates (Shewchuk)
 * 
 * Returns the exact sign of the 2D cross product (b - a) × (c - a):
 * - positive (>0): c is to the left (counter-clockwise)
 * - negative (<0): c is to the right (clockwise) 
 * - zero (0): c is collinear with a and b
 * 
 * This uses adaptive precision arithmetic to guarantee correct results
 * even in near-degenerate cases.
 * 
 * Note: robust-predicates uses the opposite sign convention, so we negate the result.
 */
export function orient2DRobust(a: Vec2, b: Vec2, c: Vec2): number {
  // robust-predicates uses opposite sign convention from our cross product convention
  // Negate to match: positive = left/CCW, negative = right/CW
  return -robustOrient2d(a[0], a[1], b[0], b[1], c[0], c[1]);
}

/**
 * 2D orientation test (tolerance-aware wrapper)
 * 
 * Returns the orientation of point c relative to the directed line from a to b:
 * - positive: c is to the left (counter-clockwise)
 * - negative: c is to the right (clockwise)
 * - zero: c is collinear with a and b (within tolerance)
 */
export function orient2D(a: Vec2, b: Vec2, c: Vec2, ctx: NumericContext): number {
  const result = orient2DRobust(a, b, c);
  
  // For tolerance-aware comparison, we need to scale by the size of the inputs.
  // The orient2d result is proportional to the area of the triangle (base * height).
  // For near-collinear cases, we compare against tol * base_length.
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const baseLength = Math.sqrt(dx * dx + dy * dy);
  
  // Handle degenerate case: if base is zero (a == b), all points are collinear
  if (baseLength < ctx.tol.length) {
    return 0;
  }
  
  const tolerance = ctx.tol.length * baseLength;
  
  if (Math.abs(result) < tolerance) {
    return 0;
  }
  return result > 0 ? 1 : -1;
}

/**
 * 3D orientation test using ROBUST predicates (Shewchuk)
 * 
 * Returns the exact sign of the determinant for orient3d:
 * - positive (>0): d is above the plane (in direction of normal)
 * - negative (<0): d is below the plane
 * - zero (0): d is coplanar with a, b, c
 * 
 * Note: robust-predicates uses the opposite sign convention, so we negate the result.
 */
export function orient3DRobust(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  // robust-predicates uses opposite sign convention, negate to match our convention
  return -robustOrient3d(
    a[0], a[1], a[2],
    b[0], b[1], b[2],
    c[0], c[1], c[2],
    d[0], d[1], d[2]
  );
}

/**
 * 3D orientation test (tolerance-aware wrapper)
 * 
 * Returns the orientation of point d relative to the plane through a, b, c:
 * - positive: d is above the plane (in direction of normal)
 * - negative: d is below the plane
 * - zero: d is coplanar with a, b, c (within tolerance)
 */
export function orient3D(a: Vec3, b: Vec3, c: Vec3, d: Vec3, ctx: NumericContext): number {
  const result = orient3DRobust(a, b, c, d);
  
  // For tolerance-aware comparison, scale by the size of the base triangle.
  // The orient3d result is proportional to volume (area * height).
  // Use the cross product magnitude of (b-a) × (c-a) as scale.
  const ab = sub3(b, a);
  const ac = sub3(c, a);
  const crossProd = cross3(ab, ac);
  const areaScale = Math.sqrt(dot3(crossProd, crossProd));
  const tolerance = ctx.tol.length * areaScale;
  
  if (Math.abs(result) < tolerance) {
    return 0;
  }
  return result > 0 ? 1 : -1;
}

/**
 * Classify a point relative to a plane
 * 
 * Returns:
 * - "on": point is on the plane (within tolerance)
 * - "above": point is above the plane (in direction of normal)
 * - "below": point is below the plane
 */
export type PlaneClassification = 'on' | 'above' | 'below';

/**
 * Classify a point relative to a plane defined by origin and normal
 */
export function classifyPointPlane(
  point: Vec3,
  planeOrigin: Vec3,
  planeNormal: Vec3,
  ctx: NumericContext
): PlaneClassification {
  const toPoint = sub3(point, planeOrigin);
  const distance = dot3(toPoint, planeNormal);
  
  if (isZero(distance, ctx)) {
    return 'on';
  }
  return distance > 0 ? 'above' : 'below';
}

/**
 * Distance from a point to a plane
 * 
 * Returns signed distance (positive if point is above plane in normal direction)
 */
export function distanceToPlane(
  point: Vec3,
  planeOrigin: Vec3,
  planeNormal: Vec3
): number {
  const toPoint = sub3(point, planeOrigin);
  return dot3(toPoint, planeNormal);
}

/**
 * Check if a point is on a line segment (2D)
 * 
 * Returns true if the point lies on the segment within tolerance
 */
export function isPointOnSegment2D(
  point: Vec2,
  segStart: Vec2,
  segEnd: Vec2,
  ctx: NumericContext
): boolean {
  // Check if point is collinear with segment
  const orient = orient2D(segStart, segEnd, point, ctx);
  if (orient !== 0) {
    return false;
  }
  
  // Check if point is within segment bounds
  const minX = Math.min(segStart[0], segEnd[0]);
  const maxX = Math.max(segStart[0], segEnd[0]);
  const minY = Math.min(segStart[1], segEnd[1]);
  const maxY = Math.max(segStart[1], segEnd[1]);
  
  return (
    point[0] >= minX - ctx.tol.length &&
    point[0] <= maxX + ctx.tol.length &&
    point[1] >= minY - ctx.tol.length &&
    point[1] <= maxY + ctx.tol.length
  );
}

/**
 * Check if a point is on a line segment (3D)
 * 
 * Returns true if the point lies on the segment within tolerance
 */
export function isPointOnSegment3D(
  point: Vec3,
  segStart: Vec3,
  segEnd: Vec3,
  ctx: NumericContext
): boolean {
  const segVec = sub3(segEnd, segStart);
  const toPoint = sub3(point, segStart);
  
  // Check if point is collinear with segment
  const cross = cross3(segVec, toPoint);
  const crossLenSq = dot3(cross, cross);
  if (!isZero(crossLenSq, ctx)) {
    return false;
  }
  
  // Check if point is within segment bounds
  const segLenSq = dot3(segVec, segVec);
  const t = dot3(toPoint, segVec) / segLenSq;
  
  return t >= -ctx.tol.length && t <= 1 + ctx.tol.length;
}

// =====================================================================
// Segment-Segment Intersection (Robust)
// =====================================================================

/**
 * Result of segment-segment intersection test
 */
export type SegSegResult =
  | { kind: 'none' }                                    // No intersection
  | { kind: 'point'; t1: number; t2: number; point: Vec2 } // Intersection at a point
  | { kind: 'overlap'; t1Start: number; t1End: number; t2Start: number; t2End: number }; // Overlapping collinear segments

/**
 * Robust 2D segment-segment intersection using orientation predicates.
 * 
 * Returns:
 * - { kind: 'none' } if segments don't intersect
 * - { kind: 'point', t1, t2, point } if they intersect at a single point
 *   (t1, t2 are parameters in [0,1] on each segment)
 * - { kind: 'overlap', ... } if segments are collinear and overlap
 */
export function segSegHit(
  a1: Vec2, a2: Vec2,  // First segment
  b1: Vec2, b2: Vec2   // Second segment
): SegSegResult {
  // Orientation tests for endpoint classification
  const o1 = orient2DRobust(a1, a2, b1);
  const o2 = orient2DRobust(a1, a2, b2);
  const o3 = orient2DRobust(b1, b2, a1);
  const o4 = orient2DRobust(b1, b2, a2);
  
  // General case: segments cross
  if (o1 * o2 < 0 && o3 * o4 < 0) {
    // Compute intersection point
    const dx1 = a2[0] - a1[0];
    const dy1 = a2[1] - a1[1];
    const dx2 = b2[0] - b1[0];
    const dy2 = b2[1] - b1[1];
    
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-15) {
      // Parallel (shouldn't happen given orientation tests, but safety check)
      return { kind: 'none' };
    }
    
    const t1 = ((b1[0] - a1[0]) * dy2 - (b1[1] - a1[1]) * dx2) / denom;
    const t2 = ((b1[0] - a1[0]) * dy1 - (b1[1] - a1[1]) * dx1) / denom;
    
    const point: Vec2 = [
      a1[0] + t1 * dx1,
      a1[1] + t1 * dy1
    ];
    
    return { kind: 'point', t1, t2, point };
  }
  
  // Check for collinear cases
  if (o1 === 0 && o2 === 0) {
    // All four points are collinear
    return segSegCollinear(a1, a2, b1, b2);
  }
  
  // Endpoint touches: one endpoint of one segment lies on the other segment
  // o1 === 0 means b1 is on line through a1,a2
  if (o1 === 0 && onSegment(a1, b1, a2)) {
    const t1 = paramOnSegment(a1, a2, b1);
    return { kind: 'point', t1, t2: 0, point: [b1[0], b1[1]] };
  }
  if (o2 === 0 && onSegment(a1, b2, a2)) {
    const t1 = paramOnSegment(a1, a2, b2);
    return { kind: 'point', t1, t2: 1, point: [b2[0], b2[1]] };
  }
  if (o3 === 0 && onSegment(b1, a1, b2)) {
    const t2 = paramOnSegment(b1, b2, a1);
    return { kind: 'point', t1: 0, t2, point: [a1[0], a1[1]] };
  }
  if (o4 === 0 && onSegment(b1, a2, b2)) {
    const t2 = paramOnSegment(b1, b2, a2);
    return { kind: 'point', t1: 1, t2, point: [a2[0], a2[1]] };
  }
  
  return { kind: 'none' };
}

/**
 * Check if point q lies on segment p-r (assuming collinear)
 */
function onSegment(p: Vec2, q: Vec2, r: Vec2): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) + 1e-12 &&
    q[0] >= Math.min(p[0], r[0]) - 1e-12 &&
    q[1] <= Math.max(p[1], r[1]) + 1e-12 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-12
  );
}

/**
 * Compute parameter t for point p on segment a-b (assuming p is on the line)
 */
function paramOnSegment(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) > Math.abs(dy)) {
    return (p[0] - a[0]) / dx;
  } else if (Math.abs(dy) > 1e-15) {
    return (p[1] - a[1]) / dy;
  }
  return 0; // Degenerate segment
}

/**
 * Handle collinear segment overlap
 */
function segSegCollinear(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): SegSegResult {
  // Project onto the axis with larger range
  const dx1 = a2[0] - a1[0];
  const dy1 = a2[1] - a1[1];
  
  // Use x-axis if range is larger, else y-axis
  let axis = 0;
  if (Math.abs(dy1) > Math.abs(dx1)) {
    axis = 1;
  }
  
  // Parameterize b1 and b2 on segment a
  const a1v = axis === 0 ? a1[0] : a1[1];
  const a2v = axis === 0 ? a2[0] : a2[1];
  const b1v = axis === 0 ? b1[0] : b1[1];
  const b2v = axis === 0 ? b2[0] : b2[1];
  
  const len = a2v - a1v;
  if (Math.abs(len) < 1e-15) {
    // Degenerate segment a - check if b contains a1
    if (onSegment(b1, a1, b2)) {
      return { kind: 'point', t1: 0, t2: paramOnSegment(b1, b2, a1), point: [a1[0], a1[1]] };
    }
    return { kind: 'none' };
  }
  
  let tb1 = (b1v - a1v) / len;
  let tb2 = (b2v - a1v) / len;
  
  // Ensure tb1 <= tb2
  let t2AtTb1 = 0;
  let t2AtTb2 = 1;
  if (tb1 > tb2) {
    [tb1, tb2] = [tb2, tb1];
    [t2AtTb1, t2AtTb2] = [1, 0];
  }
  
  // Overlap is intersection of [0, 1] and [tb1, tb2]
  const overlapStart = Math.max(0, tb1);
  const overlapEnd = Math.min(1, tb2);
  
  if (overlapStart > overlapEnd + 1e-12) {
    return { kind: 'none' }; // No overlap
  }
  
  if (Math.abs(overlapEnd - overlapStart) < 1e-12) {
    // Single point overlap
    const point: Vec2 = [
      a1[0] + overlapStart * (a2[0] - a1[0]),
      a1[1] + overlapStart * (a2[1] - a1[1])
    ];
    // Compute t2
    const t2 = paramOnSegment(b1, b2, point);
    return { kind: 'point', t1: overlapStart, t2, point };
  }
  
  // Compute t2 at overlap boundaries
  const t1Start = overlapStart;
  const t1End = overlapEnd;
  
  // Map back to t2 coordinates
  // Linear interpolation: when t1 = tb1, t2 = t2AtTb1; when t1 = tb2, t2 = t2AtTb2
  const t2Range = t2AtTb2 - t2AtTb1;
  const tbRange = tb2 - tb1;
  
  let t2Start: number, t2End: number;
  if (Math.abs(tbRange) < 1e-15) {
    t2Start = t2AtTb1;
    t2End = t2AtTb2;
  } else {
    t2Start = t2AtTb1 + (t1Start - tb1) * t2Range / tbRange;
    t2End = t2AtTb1 + (t1End - tb1) * t2Range / tbRange;
  }
  
  return { kind: 'overlap', t1Start, t1End, t2Start, t2End };
}
