/**
 * 2D curve representations and evaluators
 * 
 * Provides analytic 2D curves: lines and circular arcs.
 * All curves use a uniform parameterization where t ∈ [0, 1] for lines,
 * and t represents normalized angle for arcs.
 */

import type { Vec2 } from '../num/vec2.js';
import type { NumericContext } from '../num/tolerance.js';
import { vec2, add2, sub2, mul2, dot2, length2, normalize2, dist2 } from '../num/vec2.js';
import { eqLength, isZero } from '../num/tolerance.js';

/**
 * Type tag for 2D curve kinds
 */
export type Curve2DType = 'line' | 'arc';

/**
 * 2D line segment defined by endpoints
 */
export interface Line2D {
  kind: 'line';
  p0: Vec2;
  p1: Vec2;
}

/**
 * 2D circular arc
 * 
 * Defined by center, radius, start angle, end angle, and direction.
 * Angles are in radians.
 * ccw (counter-clockwise) determines the direction from startAngle to endAngle.
 */
export interface Arc2D {
  kind: 'arc';
  center: Vec2;
  radius: number;
  startAngle: number;
  endAngle: number;
  ccw: boolean; // true = counter-clockwise, false = clockwise
}

/**
 * Union type for all 2D curves
 */
export type Curve2D = Line2D | Arc2D;

/**
 * Evaluate a 2D curve at parameter t
 * 
 * For lines: t ∈ [0, 1] maps linearly from p0 to p1
 * For arcs: t ∈ [0, 1] maps from startAngle to endAngle (normalized by angle span)
 * 
 * @param curve The curve to evaluate
 * @param t Parameter value in [0, 1]
 * @returns Point on curve at parameter t
 */
export function evalCurve2D(curve: Curve2D, t: number): Vec2 {
  if (curve.kind === 'line') {
    // Linear interpolation: p0 + t * (p1 - p0)
    const dir = sub2(curve.p1, curve.p0);
    return add2(curve.p0, mul2(dir, t));
  } else {
    // Arc: interpolate angle from startAngle to endAngle
    const angleSpan = getArcAngleSpan(curve);
    const angle = curve.startAngle + t * angleSpan;
    return vec2(
      curve.center[0] + curve.radius * Math.cos(angle),
      curve.center[1] + curve.radius * Math.sin(angle)
    );
  }
}

/**
 * Get the angle span of an arc (accounting for direction)
 */
function getArcAngleSpan(arc: Arc2D): number {
  let span: number;
  if (arc.ccw) {
    span = arc.endAngle - arc.startAngle;
    // Normalize to [0, 2π)
    if (span < 0) {
      span += 2 * Math.PI;
    }
  } else {
    span = arc.startAngle - arc.endAngle;
    // Normalize to [0, 2π)
    if (span < 0) {
      span += 2 * Math.PI;
    }
  }
  return span;
}

/**
 * Compute the tangent vector at parameter t
 * 
 * For lines: constant direction vector
 * For arcs: tangent to the circle at that point
 * 
 * @param curve The curve
 * @param t Parameter value in [0, 1]
 * @returns Unit tangent vector (or zero vector if degenerate)
 */
export function curveTangent2D(curve: Curve2D, t: number): Vec2 {
  if (curve.kind === 'line') {
    const dir = sub2(curve.p1, curve.p0);
    return normalize2(dir);
  } else {
    // Arc tangent: perpendicular to radius vector
    const angleSpan = getArcAngleSpan(curve);
    const angle = curve.startAngle + t * angleSpan;
    // Tangent direction depends on ccw
    const sign = curve.ccw ? 1 : -1;
    return vec2(
      -sign * Math.sin(angle),
      sign * Math.cos(angle)
    );
  }
}

/**
 * Compute the length of a curve
 * 
 * @param curve The curve
 * @returns Length of the curve
 */
export function curveLength2D(curve: Curve2D): number {
  if (curve.kind === 'line') {
    return dist2(curve.p0, curve.p1);
  } else {
    const angleSpan = getArcAngleSpan(curve);
    return curve.radius * angleSpan;
  }
}

/**
 * Find the closest point on a curve to a given point
 * 
 * @param curve The curve
 * @param point The query point
 * @param ctx Numeric context for tolerance
 * @returns Object with closest point and parameter t
 */
export function closestPointOnCurve2D(
  curve: Curve2D,
  point: Vec2,
  ctx: NumericContext
): { point: Vec2; t: number } {
  if (curve.kind === 'line') {
    // Project point onto line segment
    const dir = sub2(curve.p1, curve.p0);
    const toPoint = sub2(point, curve.p0);
    const dirLenSq = dot2(dir, dir);
    
    if (isZero(dirLenSq, ctx)) {
      // Degenerate line (zero length)
      return { point: curve.p0, t: 0 };
    }
    
    const t = Math.max(0, Math.min(1, dot2(toPoint, dir) / dirLenSq));
    return {
      point: evalCurve2D(curve, t),
      t,
    };
  } else {
    // Arc: project onto circle, then clamp to arc range
    const toCenter = sub2(point, curve.center);
    const distToCenter = length2(toCenter);
    
    if (isZero(distToCenter, ctx)) {
      // Point is at center, use start point
      return { point: evalCurve2D(curve, 0), t: 0 };
    }
    
    // Angle from center to point
    const angle = Math.atan2(toCenter[1], toCenter[0]);
    
    // Normalize angle to [0, 2π)
    let normalizedAngle = angle;
    if (normalizedAngle < 0) {
      normalizedAngle += 2 * Math.PI;
    }
    
    // Find closest angle on arc
    const angleSpan = getArcAngleSpan(curve);
    let startNorm = curve.startAngle;
    if (startNorm < 0) {
      startNorm += 2 * Math.PI;
    }
    let endNorm = curve.endAngle;
    if (endNorm < 0) {
      endNorm += 2 * Math.PI;
    }
    
    // Check if angle is within arc range
    let t: number;
    if (curve.ccw) {
      if (normalizedAngle >= startNorm && normalizedAngle <= endNorm) {
        t = (normalizedAngle - startNorm) / angleSpan;
      } else {
        // Clamp to nearest endpoint
        const distToStart = Math.abs(normalizedAngle - startNorm);
        const distToEnd = Math.abs(normalizedAngle - endNorm);
        t = distToStart < distToEnd ? 0 : 1;
      }
    } else {
      // Clockwise: need to handle wrap-around
      if (startNorm > endNorm) {
        // Arc crosses 0
        if (normalizedAngle >= startNorm || normalizedAngle <= endNorm) {
          if (normalizedAngle >= startNorm) {
            t = (normalizedAngle - startNorm) / angleSpan;
          } else {
            t = (normalizedAngle + 2 * Math.PI - startNorm) / angleSpan;
          }
        } else {
          const distToStart = Math.min(
            Math.abs(normalizedAngle - startNorm),
            Math.abs(normalizedAngle + 2 * Math.PI - startNorm)
          );
          const distToEnd = Math.min(
            Math.abs(normalizedAngle - endNorm),
            Math.abs(normalizedAngle + 2 * Math.PI - endNorm)
          );
          t = distToStart < distToEnd ? 0 : 1;
        }
      } else {
        if (normalizedAngle <= startNorm && normalizedAngle >= endNorm) {
          t = (startNorm - normalizedAngle) / angleSpan;
        } else {
          const distToStart = Math.abs(normalizedAngle - startNorm);
          const distToEnd = Math.abs(normalizedAngle - endNorm);
          t = distToStart < distToEnd ? 0 : 1;
        }
      }
    }
    
    t = Math.max(0, Math.min(1, t));
    return {
      point: evalCurve2D(curve, t),
      t,
    };
  }
}
