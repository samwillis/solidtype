/**
 * 2D curve intersection functions
 * 
 * Provides intersection routines for 2D curves (lines and arcs).
 * All intersections are tolerance-aware.
 */

import type { Vec2 } from '../num/vec2.js';
import type { NumericContext } from '../num/tolerance.js';
import type { Line2D, Arc2D } from './curve2d.js';
import { vec2, add2, sub2, mul2, dot2, cross2, length2, dist2 } from '../num/vec2.js';
import { isZero, eqLength } from '../num/tolerance.js';
import { evalCurve2D } from './curve2d.js';

/**
 * Result of a 2D intersection
 */
export interface Intersection2D {
  /** Intersection point */
  point: Vec2;
  /** Parameter on first curve (t1) */
  t1: number;
  /** Parameter on second curve (t2) */
  t2: number;
}

/**
 * Find intersection between two line segments
 * 
 * @param line1 First line
 * @param line2 Second line
 * @param ctx Numeric context for tolerance
 * @returns Array of intersection points (0, 1, or many for overlapping segments)
 */
export function intersectLineLine2D(
  line1: Line2D,
  line2: Line2D,
  ctx: NumericContext
): Intersection2D[] {
  const d1 = sub2(line1.p1, line1.p0);
  const d2 = sub2(line2.p1, line2.p0);
  const r = sub2(line1.p0, line2.p0);
  
  const cross = cross2(d1, d2);
  
  if (isZero(cross, ctx)) {
    // Lines are parallel or collinear
    const rCross = cross2(r, d1);
    if (!isZero(rCross, ctx)) {
      // Parallel but not collinear
      return [];
    }
    
    // Collinear - check for overlap
    return intersectCollinearSegments2D(line1, line2, ctx);
  }
  
  // Lines intersect at a point
  // Standard formula: t = -cross(Q0 - P0, d2) / cross(d1, d2)
  // Since r = P0 - Q0 = -(Q0 - P0), we have: t = cross(r, d2) / cross(d1, d2)
  // But we need to negate because r is the opposite direction
  const t1 = -cross2(r, d2) / cross;
  const t2 = -cross2(r, d1) / cross;
  
  // Check if intersection is within both segments
  if (t1 >= -ctx.tol.length && t1 <= 1 + ctx.tol.length &&
      t2 >= -ctx.tol.length && t2 <= 1 + ctx.tol.length) {
    const point = evalCurve2D(line1, Math.max(0, Math.min(1, t1)));
    return [{ point, t1: Math.max(0, Math.min(1, t1)), t2: Math.max(0, Math.min(1, t2)) }];
  }
  
  return [];
}

/**
 * Helper: find intersection of two collinear line segments
 */
function intersectCollinearSegments2D(
  line1: Line2D,
  line2: Line2D,
  ctx: NumericContext
): Intersection2D[] {
  // Project onto line1's direction
  const d1 = sub2(line1.p1, line1.p0);
  const d1LenSq = dot2(d1, d1);
  
  if (isZero(d1LenSq, ctx)) {
    // Degenerate line1 - check if points coincide
    if (eqLength(dist2(line1.p0, line2.p0), 0, ctx) ||
        eqLength(dist2(line1.p0, line2.p1), 0, ctx)) {
      return [{ point: line1.p0, t1: 0, t2: 0 }];
    }
    return [];
  }
  
  const d1Norm = mul2(d1, 1 / Math.sqrt(d1LenSq));
  
  // Project line2 endpoints onto line1
  const p20Proj = dot2(sub2(line2.p0, line1.p0), d1Norm);
  const p21Proj = dot2(sub2(line2.p1, line1.p0), d1Norm);
  const line1Len = length2(d1);
  
  const min2 = Math.min(p20Proj, p21Proj);
  const max2 = Math.max(p20Proj, p21Proj);
  
  // Check overlap
  const overlapStart = Math.max(0, min2);
  const overlapEnd = Math.min(line1Len, max2);
  
  if (overlapStart > overlapEnd + ctx.tol.length) {
    return [];
  }
  
  // Return endpoints of overlap
  const results: Intersection2D[] = [];
  if (overlapStart <= overlapEnd + ctx.tol.length) {
    const t1Start = overlapStart / line1Len;
    const t1End = overlapEnd / line1Len;
    const pointStart = evalCurve2D(line1, t1Start);
    const pointEnd = evalCurve2D(line1, t1End);
    
    // Project back to get t2
    const d2 = sub2(line2.p1, line2.p0);
    const d2LenSq = dot2(d2, d2);
    if (!isZero(d2LenSq, ctx)) {
      const t2Start = dot2(sub2(pointStart, line2.p0), d2) / d2LenSq;
      const t2End = dot2(sub2(pointEnd, line2.p0), d2) / d2LenSq;
      
      results.push({ point: pointStart, t1: t1Start, t2: Math.max(0, Math.min(1, t2Start)) });
      if (!eqLength(overlapStart, overlapEnd, ctx)) {
        results.push({ point: pointEnd, t1: t1End, t2: Math.max(0, Math.min(1, t2End)) });
      }
    } else {
      // Degenerate line2
      results.push({ point: pointStart, t1: t1Start, t2: 0 });
    }
  }
  
  return results;
}

/**
 * Find intersection between a line and an arc
 * 
 * @param line The line segment
 * @param arc The arc
 * @param ctx Numeric context for tolerance
 * @returns Array of intersection points
 */
export function intersectLineArc2D(
  line: Line2D,
  arc: Arc2D,
  ctx: NumericContext
): Intersection2D[] {
  // Transform to arc-centered coordinate system
  const lineStart = sub2(line.p0, arc.center);
  const lineEnd = sub2(line.p1, arc.center);
  const lineDir = sub2(lineEnd, lineStart);
  
  // Parametric line: p(t) = lineStart + t * lineDir, t ∈ [0, 1]
  // Circle: ||p||² = r²
  // Substitute: ||lineStart + t * lineDir||² = r²
  // Expand: ||lineStart||² + 2t(lineStart · lineDir) + t²||lineDir||² = r²
  
  const a = dot2(lineDir, lineDir);
  const b = 2 * dot2(lineStart, lineDir);
  const c = dot2(lineStart, lineStart) - arc.radius * arc.radius;
  
  const discriminant = b * b - 4 * a * c;
  
  if (discriminant < -ctx.tol.length) {
    // No intersection
    return [];
  }
  
  if (isZero(a, ctx)) {
    // Degenerate line
    const dist = length2(lineStart);
    if (eqLength(dist, arc.radius, ctx)) {
      // Point on circle
      const angle = Math.atan2(lineStart[1], lineStart[0]);
      if (isPointOnArc(arc, angle, ctx)) {
        return [{ point: add2(line.p0, arc.center), t1: 0, t2: angleToArcT(arc, angle) }];
      }
    }
    return [];
  }
  
  const results: Intersection2D[] = [];
  const sqrtDisc = Math.sqrt(Math.max(0, discriminant));
  
  // Two potential intersection points
  for (const sign of [-1, 1]) {
    const t = (-b + sign * sqrtDisc) / (2 * a);
    
    // Check if intersection is on line segment
    if (t >= -ctx.tol.length && t <= 1 + ctx.tol.length) {
      const clampedT = Math.max(0, Math.min(1, t));
      const point = evalCurve2D(line, clampedT);
      const pointRel = sub2(point, arc.center);
      const angle = Math.atan2(pointRel[1], pointRel[0]);
      
      // Check if point is on arc
      if (isPointOnArc(arc, angle, ctx)) {
        const arcT = angleToArcT(arc, angle);
        results.push({ point, t1: clampedT, t2: arcT });
      }
    }
  }
  
  return results;
}

/**
 * Find intersection between two arcs
 * 
 * @param arc1 First arc
 * @param arc2 Second arc
 * @param ctx Numeric context for tolerance
 * @returns Array of intersection points
 */
export function intersectArcArc2D(
  arc1: Arc2D,
  arc2: Arc2D,
  ctx: NumericContext
): Intersection2D[] {
  // Transform to arc1-centered coordinate system
  const centerOffset = sub2(arc2.center, arc1.center);
  const d = length2(centerOffset);
  
  // Check if circles are too far apart or one contains the other
  const r1 = arc1.radius;
  const r2 = arc2.radius;
  
  if (d > r1 + r2 + ctx.tol.length) {
    return [];
  }
  if (d < Math.abs(r1 - r2) - ctx.tol.length) {
    return [];
  }
  
  if (isZero(d, ctx)) {
    // Concentric circles
    if (eqLength(r1, r2, ctx)) {
      // Same circle - check for arc overlap (simplified: return empty for now)
      // Full implementation would check angular overlap
      return [];
    }
    return [];
  }
  
  // Use law of cosines to find intersection points
  // Distance from arc1.center to line connecting intersections
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  
  if (hSq < -ctx.tol.length) {
    return [];
  }
  
  const h = Math.sqrt(Math.max(0, hSq));
  
  // Unit vector from arc1.center to arc2.center
  const u = mul2(centerOffset, 1 / d);
  // Perpendicular vector
  const v = vec2(-u[1], u[0]);
  
  const results: Intersection2D[] = [];
  
  // Two intersection points (if h > 0)
  for (const sign of [-1, 1]) {
    if (isZero(h, ctx) && sign === 1) {
      // Only one intersection point (tangent)
      continue;
    }
    
    const pointRel = add2(mul2(u, a), mul2(v, sign * h));
    const point = add2(pointRel, arc1.center);
    const angle1 = Math.atan2(pointRel[1], pointRel[0]);
    const angle2 = Math.atan2((point[1] - arc2.center[1]), (point[0] - arc2.center[0]));
    
    // Check if points are on both arcs
    if (isPointOnArc(arc1, angle1, ctx) && isPointOnArc(arc2, angle2, ctx)) {
      results.push({
        point,
        t1: angleToArcT(arc1, angle1),
        t2: angleToArcT(arc2, angle2),
      });
    }
  }
  
  return results;
}

/**
 * Check if an angle (in radians) is within an arc's range
 */
function isPointOnArc(arc: Arc2D, angle: number, ctx: NumericContext): boolean {
  // Normalize angle to [0, 2π)
  let normalizedAngle = angle;
  if (normalizedAngle < 0) {
    normalizedAngle += 2 * Math.PI;
  }
  
  let startNorm = arc.startAngle;
  if (startNorm < 0) {
    startNorm += 2 * Math.PI;
  }
  let endNorm = arc.endAngle;
  if (endNorm < 0) {
    endNorm += 2 * Math.PI;
  }
  
  if (arc.ccw) {
    if (startNorm <= endNorm) {
      return normalizedAngle >= startNorm - ctx.tol.angle &&
             normalizedAngle <= endNorm + ctx.tol.angle;
    } else {
      // Arc crosses 0
      return normalizedAngle >= startNorm - ctx.tol.angle ||
             normalizedAngle <= endNorm + ctx.tol.angle;
    }
  } else {
    // Clockwise
    if (startNorm >= endNorm) {
      return normalizedAngle <= startNorm + ctx.tol.angle &&
             normalizedAngle >= endNorm - ctx.tol.angle;
    } else {
      // Arc crosses 0
      return normalizedAngle <= startNorm + ctx.tol.angle ||
             normalizedAngle >= endNorm - ctx.tol.angle;
    }
  }
}

/**
 * Convert an angle to arc parameter t ∈ [0, 1]
 */
function angleToArcT(arc: Arc2D, angle: number): number {
  // Normalize angles
  let normalizedAngle = angle;
  if (normalizedAngle < 0) {
    normalizedAngle += 2 * Math.PI;
  }
  
  let startNorm = arc.startAngle;
  if (startNorm < 0) {
    startNorm += 2 * Math.PI;
  }
  let endNorm = arc.endAngle;
  if (endNorm < 0) {
    endNorm += 2 * Math.PI;
  }
  
  if (arc.ccw) {
    if (startNorm <= endNorm) {
      return (normalizedAngle - startNorm) / (endNorm - startNorm);
    } else {
      // Arc crosses 0
      if (normalizedAngle >= startNorm) {
        return (normalizedAngle - startNorm) / (endNorm + 2 * Math.PI - startNorm);
      } else {
        return (normalizedAngle + 2 * Math.PI - startNorm) / (endNorm + 2 * Math.PI - startNorm);
      }
    }
  } else {
    // Clockwise
    if (startNorm >= endNorm) {
      return (startNorm - normalizedAngle) / (startNorm - endNorm);
    } else {
      // Arc crosses 0
      if (normalizedAngle <= startNorm) {
        return (startNorm - normalizedAngle) / (startNorm + 2 * Math.PI - endNorm);
      } else {
        return (startNorm + 2 * Math.PI - normalizedAngle) / (startNorm + 2 * Math.PI - endNorm);
      }
    }
  }
}
