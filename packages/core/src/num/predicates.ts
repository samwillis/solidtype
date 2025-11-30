/**
 * Geometric predicates
 * 
 * These functions perform geometric classification and orientation tests.
 * Initially implemented using straightforward Float64 arithmetic, but designed
 * to be upgradeable to robust predicates (e.g. Shewchuk-style adaptive precision)
 * without changing the API.
 * 
 * All predicates take a NumericContext for tolerance-aware comparisons.
 */

import type { Vec2 } from './vec2.js';
import type { Vec3 } from './vec3.js';
import type { NumericContext } from './tolerance.js';
import { cross2 } from './vec2.js';
import { cross3, dot3, sub3 } from './vec3.js';
import { isZero } from './tolerance.js';

/**
 * 2D orientation test
 * 
 * Returns the orientation of point c relative to the directed line from a to b:
 * - positive: c is to the left (counter-clockwise)
 * - negative: c is to the right (clockwise)
 * - zero: c is collinear with a and b
 * 
 * Computed as the sign of the 2D cross product (b - a) × (c - a)
 */
export function orient2D(a: Vec2, b: Vec2, c: Vec2, ctx: NumericContext): number {
  const ab = [b[0] - a[0], b[1] - a[1]] as Vec2;
  const ac = [c[0] - a[0], c[1] - a[1]] as Vec2;
  const cross = cross2(ab, ac);
  
  if (isZero(cross, ctx)) {
    return 0;
  }
  return cross > 0 ? 1 : -1;
}

/**
 * 3D orientation test
 * 
 * Returns the orientation of point d relative to the plane through a, b, c:
 * - positive: d is above the plane (in direction of normal)
 * - negative: d is below the plane
 * - zero: d is coplanar with a, b, c
 * 
 * Computed as the sign of the scalar triple product (b - a) × (c - a) · (d - a)
 */
export function orient3D(a: Vec3, b: Vec3, c: Vec3, d: Vec3, ctx: NumericContext): number {
  const ab = sub3(b, a);
  const ac = sub3(c, a);
  const ad = sub3(d, a);
  
  const normal = cross3(ab, ac);
  const dot = dot3(normal, ad);
  
  if (isZero(dot, ctx)) {
    return 0;
  }
  return dot > 0 ? 1 : -1;
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
