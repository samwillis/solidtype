/**
 * 3D surface representations and evaluators
 * 
 * Provides analytic 3D surfaces: plane, cylinder, cone, sphere, and torus.
 * All surfaces use a uniform parameterization with (u, v) parameters.
 */

import type { Vec3 } from '../num/vec3.js';
import type { NumericContext } from '../num/tolerance.js';
import { vec3, add3, sub3, mul3, cross3, dot3, normalize3 } from '../num/vec3.js';

/**
 * Type tag for surface kinds
 */
export type SurfaceType = 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus';

/**
 * Plane surface
 * 
 * Defined by origin point, normal vector, and two orthonormal direction vectors
 * that define the local u and v axes.
 * 
 * Parameterization:
 * - u: u ∈ (-∞, ∞), unbounded (typically clamped by trimming)
 * - v: v ∈ (-∞, ∞), unbounded (typically clamped by trimming)
 * - Point: origin + u * xDir + v * yDir
 */
export interface PlaneSurface {
  kind: 'plane';
  origin: Vec3;
  normal: Vec3;
  xDir: Vec3; // defines local u-axis (should be orthonormal to normal)
  yDir: Vec3; // defines local v-axis (orthonormal to xDir and normal)
}

/**
 * Cylinder surface
 * 
 * Defined by center point on axis, axis direction, and radius.
 * 
 * Parameterization:
 * - u: along axis (height), u ∈ (-∞, ∞), typically unbounded
 * - v: around circumference, v ∈ [0, 2π)
 * - Point: center + u * axis + radius * (cos(v) * uPerp + sin(v) * vPerp)
 *   where uPerp and vPerp are orthonormal vectors perpendicular to axis
 */
export interface CylinderSurface {
  kind: 'cylinder';
  center: Vec3;
  axis: Vec3; // unit vector along cylinder axis
  radius: number;
  // Cached orthonormal basis (computed from axis)
  uPerp?: Vec3;
  vPerp?: Vec3;
}

/**
 * Cone surface
 * 
 * Defined by apex point, axis direction, and half-angle.
 * 
 * Parameterization:
 * - u: along axis from apex, u ∈ [0, ∞), typically [0, height] or unbounded
 * - v: around circumference, v ∈ [0, 2π)
 * - Point: apex + u * axis + u * tan(halfAngle) * (cos(v) * uPerp + sin(v) * vPerp)
 */
export interface ConeSurface {
  kind: 'cone';
  apex: Vec3;
  axis: Vec3; // unit vector along cone axis
  halfAngle: number; // half-angle of cone in radians
  // Cached orthonormal basis
  uPerp?: Vec3;
  vPerp?: Vec3;
}

/**
 * Sphere surface
 * 
 * Defined by center and radius.
 * 
 * Parameterization (spherical coordinates):
 * - u: polar angle (colatitude), u ∈ [0, π], 0 = north pole, π = south pole
 * - v: azimuthal angle, v ∈ [0, 2π)
 * - Point: center + radius * (sin(u) * cos(v) * xAxis + sin(u) * sin(v) * yAxis + cos(u) * zAxis)
 */
export interface SphereSurface {
  kind: 'sphere';
  center: Vec3;
  radius: number;
}

/**
 * Torus surface
 *
 * Defined by a center point on the torus axis, a unit axis direction, a major radius (R),
 * and a minor radius (r).
 *
 * Parameterization (standard torus):
 * - u: tube angle (minor circle), u ∈ [0, 2π)
 * - v: sweep angle around axis (major circle), v ∈ [0, 2π)
 * - Point:
 *   radialDir(v) = cos(v) * vPerp + sin(v) * uPerp
 *   p = center + (R + r*cos(u)) * radialDir(v) + r*sin(u) * axis
 */
export interface TorusSurface {
  kind: 'torus';
  center: Vec3; // point on axis
  axis: Vec3; // unit vector along torus axis
  majorRadius: number;
  minorRadius: number;
  // Cached orthonormal basis (computed from axis)
  uPerp?: Vec3;
  vPerp?: Vec3;
}

/**
 * Union type for all surfaces
 */
export type Surface = PlaneSurface | CylinderSurface | ConeSurface | SphereSurface | TorusSurface;

/**
 * Evaluate a surface at parameters (u, v)
 * 
 * Parameter ranges:
 * - Plane: u ∈ (-∞, ∞), v ∈ (-∞, ∞) (typically clamped by trimming)
 * - Cylinder: u ∈ (-∞, ∞) (along axis), v ∈ [0, 2π) (around circumference)
 * - Cone: u ∈ [0, ∞) (along axis from apex), v ∈ [0, 2π) (around circumference)
 * - Sphere: u ∈ [0, π] (polar angle, 0 = north pole), v ∈ [0, 2π) (azimuthal angle)
 * 
 * @param surface The surface
 * @param u First parameter
 * @param v Second parameter
 * @returns Point on surface at (u, v)
 */
export function evalSurface(surface: Surface, u: number, v: number): Vec3 {
  switch (surface.kind) {
    case 'plane': {
      return add3(
        surface.origin,
        add3(mul3(surface.xDir, u), mul3(surface.yDir, v))
      );
    }
    
    case 'cylinder': {
      const basis = getCylinderBasis(surface);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      // Standard convention: at v=0, radial points in +X direction
      // So: radial = cos(v) * vPerp + sin(v) * uPerp
      const radial = add3(
        mul3(basis.vPerp, cosV),
        mul3(basis.uPerp, sinV)
      );
      return add3(
        surface.center,
        add3(mul3(surface.axis, u), mul3(radial, surface.radius))
      );
    }
    
    case 'cone': {
      const basis = getConeBasis(surface);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      // Standard convention: at v=0, radial points in +X direction (same as cylinder)
      // So: radial = cos(v) * vPerp + sin(v) * uPerp
      const radial = add3(
        mul3(basis.vPerp, cosV),
        mul3(basis.uPerp, sinV)
      );
      const radiusAtU = u * Math.tan(surface.halfAngle);
      return add3(
        surface.apex,
        add3(mul3(surface.axis, u), mul3(radial, radiusAtU))
      );
    }
    
    case 'sphere': {
      const sinU = Math.sin(u);
      const cosU = Math.cos(u);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      // Use standard spherical coordinates
      return vec3(
        surface.center[0] + surface.radius * sinU * cosV,
        surface.center[1] + surface.radius * sinU * sinV,
        surface.center[2] + surface.radius * cosU
      );
    }

    case 'torus': {
      const basis = getTorusBasis(surface);
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      // radialDir(v) matches cylinder convention
      const radialDir = add3(mul3(basis.vPerp, cosV), mul3(basis.uPerp, sinV));
      const ringRadius = surface.majorRadius + surface.minorRadius * cosU;
      return add3(
        surface.center,
        add3(mul3(radialDir, ringRadius), mul3(surface.axis, surface.minorRadius * sinU))
      );
    }
  }
}

/**
 * Compute the surface normal at parameters (u, v)
 * 
 * Parameter ranges: same as evalSurface
 * 
 * @param surface The surface
 * @param u First parameter
 * @param v Second parameter
 * @returns Unit normal vector (pointing outward for closed surfaces)
 */
export function surfaceNormal(surface: Surface, u: number, v: number): Vec3 {
  switch (surface.kind) {
    case 'plane': {
      return normalize3(surface.normal);
    }
    
    case 'cylinder': {
      const basis = getCylinderBasis(surface);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      // Normal points radially outward (same convention as evalSurface)
      return normalize3(add3(
        mul3(basis.vPerp, cosV),
        mul3(basis.uPerp, sinV)
      ));
    }
    
    case 'cone': {
      const basis = getConeBasis(surface);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      // Normal points radially outward (same convention as evalSurface)
      const radial = normalize3(add3(
        mul3(basis.vPerp, cosV),
        mul3(basis.uPerp, sinV)
      ));
      // Normal is perpendicular to both axis and radial direction
      // For a cone, normal = normalize(radial - (radial · axis) * axis)
      const axisDot = dot3(radial, surface.axis);
      const normal = normalize3(sub3(radial, mul3(surface.axis, axisDot)));
      return normal;
    }
    
    case 'sphere': {
      const sinU = Math.sin(u);
      const cosU = Math.cos(u);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      // Normal points radially outward
      return normalize3(vec3(
        sinU * cosV,
        sinU * sinV,
        cosU
      ));
    }

    case 'torus': {
      const basis = getTorusBasis(surface);
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const radialDir = add3(mul3(basis.vPerp, cosV), mul3(basis.uPerp, sinV));
      // Tube normal is a combination of radialDir and axis
      return normalize3(add3(mul3(radialDir, cosU), mul3(surface.axis, sinU)));
    }
  }
}

/**
 * Get or compute orthonormal basis for cylinder (perpendicular to axis)
 */
function getCylinderBasis(cylinder: CylinderSurface): { uPerp: Vec3; vPerp: Vec3 } {
  if (cylinder.uPerp && cylinder.vPerp) {
    return { uPerp: cylinder.uPerp, vPerp: cylinder.vPerp };
  }
  
  const basis = computeOrthonormalBasis(cylinder.axis);
  // Cache for future use (mutation for performance)
  (cylinder as CylinderSurface & { uPerp: Vec3; vPerp: Vec3 }).uPerp = basis.uPerp;
  (cylinder as CylinderSurface & { uPerp: Vec3; vPerp: Vec3 }).vPerp = basis.vPerp;
  return basis;
}

/**
 * Get or compute orthonormal basis for cone (perpendicular to axis)
 */
function getConeBasis(cone: ConeSurface): { uPerp: Vec3; vPerp: Vec3 } {
  if (cone.uPerp && cone.vPerp) {
    return { uPerp: cone.uPerp, vPerp: cone.vPerp };
  }
  
  const basis = computeOrthonormalBasis(cone.axis);
  // Cache for future use
  (cone as ConeSurface & { uPerp: Vec3; vPerp: Vec3 }).uPerp = basis.uPerp;
  (cone as ConeSurface & { uPerp: Vec3; vPerp: Vec3 }).vPerp = basis.vPerp;
  return basis;
}

function getTorusBasis(torus: TorusSurface): { uPerp: Vec3; vPerp: Vec3 } {
  if (torus.uPerp && torus.vPerp) {
    return { uPerp: torus.uPerp, vPerp: torus.vPerp };
  }
  const basis = computeOrthonormalBasis(torus.axis);
  (torus as TorusSurface & { uPerp: Vec3; vPerp: Vec3 }).uPerp = basis.uPerp;
  (torus as TorusSurface & { uPerp: Vec3; vPerp: Vec3 }).vPerp = basis.vPerp;
  return basis;
}

/**
 * Compute an orthonormal basis where the first vector is perpendicular to the given vector
 * 
 * Uses a standard method: pick a vector not parallel to the input, cross product to get first basis,
 * then cross product again to get second basis.
 */
function computeOrthonormalBasis(axis: Vec3): { uPerp: Vec3; vPerp: Vec3 } {
  // Find a vector not parallel to axis
  const absX = Math.abs(axis[0]);
  const absY = Math.abs(axis[1]);
  const absZ = Math.abs(axis[2]);
  
  let candidate: Vec3;
  if (absX <= absY && absX <= absZ) {
    candidate = vec3(1, 0, 0);
  } else if (absY <= absZ) {
    candidate = vec3(0, 1, 0);
  } else {
    candidate = vec3(0, 0, 1);
  }
  
  const uPerp = normalize3(cross3(axis, candidate));
  const vPerp = normalize3(cross3(uPerp, axis));
  
  return { uPerp, vPerp };
}

/**
 * Create a plane surface from origin, normal, and optional x-direction
 * 
 * If xDir is not provided or not orthogonal to normal, it will be computed automatically.
 */
export function createPlaneSurface(
  origin: Vec3,
  normal: Vec3,
  xDir?: Vec3,
  _ctx?: NumericContext
): PlaneSurface {
  const n = normalize3(normal);
  let x: Vec3;
  let y: Vec3;
  
  if (xDir) {
    // Project xDir onto plane perpendicular to normal
    const xDirDot = dot3(xDir, n);
    x = normalize3(sub3(xDir, mul3(n, xDirDot)));
    y = normalize3(cross3(n, x));
  } else {
    // Compute arbitrary orthonormal basis
    const basis = computeOrthonormalBasis(n);
    x = basis.uPerp;
    y = basis.vPerp;
  }
  
  return {
    kind: 'plane',
    origin,
    normal: n,
    xDir: x,
    yDir: y,
  };
}
