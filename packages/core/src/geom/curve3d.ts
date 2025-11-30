/**
 * 3D curve representations and evaluators
 * 
 * Provides analytic 3D curves: lines and circles.
 * All curves use a uniform parameterization where t ∈ [0, 1].
 */

import type { Vec3 } from '../num/vec3.js';
import type { NumericContext } from '../num/tolerance.js';
import { vec3, add3, sub3, mul3, dot3, cross3, length3, normalize3, dist3 } from '../num/vec3.js';
import { isZero } from '../num/tolerance.js';

/**
 * Type tag for 3D curve kinds
 */
export type Curve3DType = 'line' | 'circle';

/**
 * 3D line segment defined by endpoints
 */
export interface Line3D {
  kind: 'line';
  p0: Vec3;
  p1: Vec3;
}

/**
 * 3D circle
 * 
 * Defined by center, radius, normal (axis), and a reference direction for parameterization.
 * The circle lies in a plane perpendicular to the normal.
 */
export interface Circle3D {
  kind: 'circle';
  center: Vec3;
  radius: number;
  normal: Vec3; // unit vector perpendicular to circle plane
  // Cached orthonormal basis in the plane (computed from normal)
  uDir?: Vec3; // reference direction for t=0
  vDir?: Vec3; // perpendicular to uDir in plane
}

/**
 * Union type for all 3D curves
 */
export type Curve3D = Line3D | Circle3D;

/**
 * Evaluate a 3D curve at parameter t
 * 
 * For lines: t ∈ [0, 1] maps linearly from p0 to p1
 * For circles: t ∈ [0, 1] maps from 0 to 2π (one full revolution)
 * 
 * @param curve The curve to evaluate
 * @param t Parameter value in [0, 1]
 * @returns Point on curve at parameter t
 */
export function evalCurve3D(curve: Curve3D, t: number): Vec3 {
  if (curve.kind === 'line') {
    // Linear interpolation: p0 + t * (p1 - p0)
    const dir = sub3(curve.p1, curve.p0);
    return add3(curve.p0, mul3(dir, t));
  } else {
    // Circle: parameterize by angle
    const angle = t * 2 * Math.PI;
    const basis = getCircleBasis(curve);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const radial = add3(
      mul3(basis.uDir, cosA),
      mul3(basis.vDir, sinA)
    );
    return add3(curve.center, mul3(radial, curve.radius));
  }
}

/**
 * Compute the tangent vector at parameter t
 * 
 * For lines: constant direction vector
 * For circles: tangent to the circle at that point
 * 
 * @param curve The curve
 * @param t Parameter value in [0, 1]
 * @returns Unit tangent vector (or zero vector if degenerate)
 */
export function curveTangent3D(curve: Curve3D, t: number): Vec3 {
  if (curve.kind === 'line') {
    const dir = sub3(curve.p1, curve.p0);
    return normalize3(dir);
  } else {
    // Circle tangent: perpendicular to radius vector in the plane
    const angle = t * 2 * Math.PI;
    const basis = getCircleBasis(curve);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // Tangent = -sin(angle) * uDir + cos(angle) * vDir
    return normalize3(add3(
      mul3(basis.uDir, -sinA),
      mul3(basis.vDir, cosA)
    ));
  }
}

/**
 * Compute the length of a curve
 * 
 * @param curve The curve
 * @returns Length of the curve
 */
export function curveLength3D(curve: Curve3D): number {
  if (curve.kind === 'line') {
    return dist3(curve.p0, curve.p1);
  } else {
    return 2 * Math.PI * curve.radius;
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
export function closestPointOnCurve3D(
  curve: Curve3D,
  point: Vec3,
  ctx: NumericContext
): { point: Vec3; t: number } {
  if (curve.kind === 'line') {
    // Project point onto line segment
    const dir = sub3(curve.p1, curve.p0);
    const toPoint = sub3(point, curve.p0);
    const dirLenSq = dot3(dir, dir);
    
    if (isZero(dirLenSq, ctx)) {
      // Degenerate line (zero length)
      return { point: curve.p0, t: 0 };
    }
    
    const t = Math.max(0, Math.min(1, dot3(toPoint, dir) / dirLenSq));
    return {
      point: evalCurve3D(curve, t),
      t,
    };
  } else {
    // Circle: project onto plane, then onto circle
    const toCenter = sub3(point, curve.center);
    
    // Project toPoint onto the circle's plane
    const normal = normalize3(curve.normal);
    const distToPlane = dot3(toCenter, normal);
    const inPlane = sub3(toCenter, mul3(normal, distToPlane));
    const distInPlane = length3(inPlane);
    
    if (isZero(distInPlane, ctx)) {
      // Point is at center, use arbitrary point (t=0)
      return { point: evalCurve3D(curve, 0), t: 0 };
    }
    
    // Angle from center to projected point
    const basis = getCircleBasis(curve);
    const u = dot3(inPlane, basis.uDir);
    const v = dot3(inPlane, basis.vDir);
    const angle = Math.atan2(v, u);
    
    // Normalize to [0, 2π)
    let normalizedAngle = angle;
    if (normalizedAngle < 0) {
      normalizedAngle += 2 * Math.PI;
    }
    
    const t = normalizedAngle / (2 * Math.PI);
    return {
      point: evalCurve3D(curve, t),
      t,
    };
  }
}

/**
 * Get or compute orthonormal basis for circle (in the plane perpendicular to normal)
 */
function getCircleBasis(circle: Circle3D): { uDir: Vec3; vDir: Vec3 } {
  if (circle.uDir && circle.vDir) {
    return { uDir: circle.uDir, vDir: circle.vDir };
  }
  
  // Compute orthonormal basis in the plane
  const normal = normalize3(circle.normal);
  
  // Find a vector not parallel to normal
  const absX = Math.abs(normal[0]);
  const absY = Math.abs(normal[1]);
  const absZ = Math.abs(normal[2]);
  
  let candidate: Vec3;
  if (absX <= absY && absX <= absZ) {
    candidate = vec3(1, 0, 0);
  } else if (absY <= absZ) {
    candidate = vec3(0, 1, 0);
  } else {
    candidate = vec3(0, 0, 1);
  }
  
  // uDir is perpendicular to normal
  const uDir = normalize3(cross3(normal, candidate));
  // vDir completes the orthonormal basis
  const vDir = normalize3(cross3(uDir, normal));
  
  // Cache for future use
  (circle as Circle3D & { uDir: Vec3; vDir: Vec3 }).uDir = uDir;
  (circle as Circle3D & { uDir: Vec3; vDir: Vec3 }).vDir = vDir;
  
  return { uDir, vDir };
}

/**
 * Create a 3D circle from center, radius, normal, and optional reference direction
 * 
 * If uDir is not provided, it will be computed automatically.
 */
export function createCircle3D(
  center: Vec3,
  radius: number,
  normal: Vec3,
  uDir?: Vec3,
  ctx?: NumericContext
): Circle3D {
  const n = normalize3(normal);
  let u: Vec3;
  let v: Vec3;
  
  if (uDir) {
    // Project uDir onto plane perpendicular to normal
    const uDirDot = dot3(uDir, n);
    u = normalize3(sub3(uDir, mul3(n, uDirDot)));
    v = normalize3(cross3(n, u));
  } else {
    // Compute arbitrary orthonormal basis
    const absX = Math.abs(n[0]);
    const absY = Math.abs(n[1]);
    const absZ = Math.abs(n[2]);
    
    let candidate: Vec3;
    if (absX <= absY && absX <= absZ) {
      candidate = vec3(1, 0, 0);
    } else if (absY <= absZ) {
      candidate = vec3(0, 1, 0);
    } else {
      candidate = vec3(0, 0, 1);
    }
    
    u = normalize3(cross3(n, candidate));
    v = normalize3(cross3(u, n));
  }
  
  return {
    kind: 'circle',
    center,
    radius,
    normal: n,
    uDir: u,
    vDir: v,
  };
}
