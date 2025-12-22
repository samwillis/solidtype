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
export type Curve3DType = 'line' | 'circle' | 'polyline';

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
 * 3D polyline
 * 
 * Defined by an ordered array of points.
 * Uses arc-length parameterization: t ∈ [0, 1] maps across the total length.
 * Caches cumulative lengths for efficient evaluation.
 */
export interface Polyline3D {
  kind: 'polyline';
  pts: Vec3[];
  /** Cached cumulative arc lengths at each point (computed lazily) */
  _cumLengths?: number[];
}

/**
 * Union type for all 3D curves
 */
export type Curve3D = Line3D | Circle3D | Polyline3D;

/**
 * Compute cumulative lengths for a 3D polyline (cached)
 */
function getPolyline3DCumLengths(poly: Polyline3D): number[] {
  if (poly._cumLengths) return poly._cumLengths;
  
  const pts = poly.pts;
  const cumLengths: number[] = [0];
  
  for (let i = 1; i < pts.length; i++) {
    const segLen = dist3(pts[i - 1], pts[i]);
    cumLengths.push(cumLengths[i - 1] + segLen);
  }
  
  poly._cumLengths = cumLengths;
  return cumLengths;
}

/**
 * Evaluate a 3D curve at parameter t
 * 
 * Parameter ranges:
 * - Lines: t ∈ [0, 1] maps linearly from p0 to p1
 * - Circles: t ∈ [0, 1] maps from 0 to 2π (one full revolution)
 * - Polylines: t ∈ [0, 1] uses arc-length parameterization
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
  } else if (curve.kind === 'circle') {
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
  } else {
    // Polyline: arc-length parameterization
    const pts = curve.pts;
    if (pts.length === 0) return vec3(0, 0, 0);
    if (pts.length === 1) return vec3(pts[0][0], pts[0][1], pts[0][2]);
    
    const cumLengths = getPolyline3DCumLengths(curve);
    const totalLength = cumLengths[cumLengths.length - 1];
    
    if (totalLength < 1e-12) return vec3(pts[0][0], pts[0][1], pts[0][2]);
    
    const targetLen = t * totalLength;
    
    // Binary search to find segment
    let lo = 0, hi = cumLengths.length - 1;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (cumLengths[mid] <= targetLen) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    
    const segStart = cumLengths[lo];
    const segEnd = cumLengths[lo + 1];
    const segLen = segEnd - segStart;
    
    if (segLen < 1e-12) return vec3(pts[lo][0], pts[lo][1], pts[lo][2]);
    
    const localT = (targetLen - segStart) / segLen;
    const p0 = pts[lo];
    const p1 = pts[lo + 1];
    
    return vec3(
      p0[0] + localT * (p1[0] - p0[0]),
      p0[1] + localT * (p1[1] - p0[1]),
      p0[2] + localT * (p1[2] - p0[2])
    );
  }
}

/**
 * Compute the tangent vector at parameter t
 * 
 * For lines: constant direction vector
 * For circles: tangent to the circle at that point
 * For polylines: tangent of the current segment
 * 
 * @param curve The curve
 * @param t Parameter value in [0, 1]
 * @returns Unit tangent vector (or zero vector if degenerate)
 */
export function curveTangent3D(curve: Curve3D, t: number): Vec3 {
  if (curve.kind === 'line') {
    const dir = sub3(curve.p1, curve.p0);
    return normalize3(dir);
  } else if (curve.kind === 'circle') {
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
  } else {
    // Polyline: find current segment and return its direction
    const pts = curve.pts;
    if (pts.length < 2) return vec3(0, 0, 0);
    
    const cumLengths = getPolyline3DCumLengths(curve);
    const totalLength = cumLengths[cumLengths.length - 1];
    
    if (totalLength < 1e-12) return vec3(0, 0, 0);
    
    const targetLen = t * totalLength;
    
    // Find segment
    let lo = 0, hi = cumLengths.length - 1;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (cumLengths[mid] <= targetLen) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    
    const p0 = pts[lo];
    const p1 = pts[lo + 1];
    const dir = sub3(p1, p0);
    return normalize3(dir);
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
  } else if (curve.kind === 'circle') {
    return 2 * Math.PI * curve.radius;
  } else {
    // Polyline: sum of segment lengths
    const cumLengths = getPolyline3DCumLengths(curve);
    return cumLengths[cumLengths.length - 1];
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
  } else if (curve.kind === 'circle') {
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
  } else {
    // Polyline: find closest segment and point on it
    const pts = curve.pts;
    if (pts.length === 0) return { point: vec3(0, 0, 0), t: 0 };
    if (pts.length === 1) return { point: vec3(pts[0][0], pts[0][1], pts[0][2]), t: 0 };
    
    const cumLengths = getPolyline3DCumLengths(curve);
    const totalLength = cumLengths[cumLengths.length - 1];
    
    let bestDist = Infinity;
    let bestT = 0;
    let bestPoint = pts[0];
    
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dir = sub3(p1, p0);
      const toPoint = sub3(point, p0);
      const dirLenSq = dot3(dir, dir);
      
      let localT = 0;
      if (dirLenSq > 1e-12) {
        localT = Math.max(0, Math.min(1, dot3(toPoint, dir) / dirLenSq));
      }
      
      const closestPt: Vec3 = vec3(
        p0[0] + localT * dir[0],
        p0[1] + localT * dir[1],
        p0[2] + localT * dir[2]
      );
      const d = dist3(point, closestPt);
      
      if (d < bestDist) {
        bestDist = d;
        bestPoint = closestPt;
        // Convert local t to global t (arc-length based)
        const segLen = cumLengths[i + 1] - cumLengths[i];
        const arcLenToPoint = cumLengths[i] + localT * segLen;
        bestT = totalLength > 1e-12 ? arcLenToPoint / totalLength : 0;
      }
    }
    
    return { point: bestPoint, t: bestT };
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
  _ctx?: NumericContext
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
