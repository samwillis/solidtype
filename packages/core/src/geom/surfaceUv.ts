/**
 * Surface UV inverse mapping
 *
 * Provides functions to compute (u,v) parameters from 3D points on surfaces.
 * This is essential for UV-first trimming and p-curve generation.
 */

import type { Vec2 } from "../num/vec2.js";
import type { Vec3 } from "../num/vec3.js";
import { vec2 } from "../num/vec2.js";
import { sub3, dot3, normalize3, length3, mul3, add3 } from "../num/vec3.js";
import type {
  Surface,
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  SphereSurface,
} from "./surface.js";

/**
 * Compute (u,v) parameters from a 3D point on a surface.
 *
 * For periodic surfaces (cylinder, sphere), returns unwrapped U/V values
 * (not canonicalized to [0, 2π) - caller is responsible for handling seams).
 *
 * @param surface The surface
 * @param point The 3D point (assumed to be on or near the surface)
 * @returns UV coordinates
 */
export function surfacePointToUV(surface: Surface, point: Vec3): Vec2 {
  switch (surface.kind) {
    case `plane`:
      return planePointToUV(surface, point);
    case `cylinder`:
      return cylinderPointToUV(surface, point);
    case `cone`:
      return conePointToUV(surface, point);
    case `sphere`:
      return spherePointToUV(surface, point);
    case `torus`:
      // Torus is deferred per plan - return approximate projection
      return torusPointToUV(surface, point);
    default:
      return vec2(0, 0);
  }
}

/**
 * Plane: u = (point - origin) · xDir, v = (point - origin) · yDir
 */
function planePointToUV(plane: PlaneSurface, point: Vec3): Vec2 {
  const rel = sub3(point, plane.origin);
  const u = dot3(rel, plane.xDir);
  const v = dot3(rel, plane.yDir);
  return vec2(u, v);
}

/**
 * Cylinder:
 * - u = (point - center) · axis (height along axis)
 * - v = atan2(sinComp, cosComp) (angle around axis)
 */
function cylinderPointToUV(cyl: CylinderSurface, point: Vec3): Vec2 {
  const axis = normalize3(cyl.axis);
  const rel = sub3(point, cyl.center);

  // u = projection onto axis
  const u = dot3(rel, axis);

  // Radial component (perpendicular to axis)
  const axisPoint = add3(cyl.center, mul3(axis, u));
  const radial = sub3(point, axisPoint);

  // Get basis vectors
  const basis = getCylinderBasis(cyl);

  // v = angle in the plane perpendicular to axis
  // Convention: at v=0, radial points in vPerp direction
  // radial ≈ cos(v)*vPerp + sin(v)*uPerp
  const sinComp = dot3(radial, basis.uPerp);
  const cosComp = dot3(radial, basis.vPerp);
  const v = Math.atan2(sinComp, cosComp);

  return vec2(u, v);
}

/**
 * Cone:
 * - u = distance from apex along axis
 * - v = angle around axis
 */
function conePointToUV(cone: ConeSurface, point: Vec3): Vec2 {
  const axis = normalize3(cone.axis);
  const rel = sub3(point, cone.apex);

  // u = projection onto axis (distance from apex)
  const u = dot3(rel, axis);

  // Radial component
  const axisPoint = add3(cone.apex, mul3(axis, u));
  const radial = sub3(point, axisPoint);

  // Get basis vectors
  const basis = getConeBasis(cone);

  // v = angle in the plane perpendicular to axis
  const sinComp = dot3(radial, basis.uPerp);
  const cosComp = dot3(radial, basis.vPerp);
  const v = Math.atan2(sinComp, cosComp);

  return vec2(u, v);
}

/**
 * Sphere (spherical coordinates):
 * - u = polar angle (colatitude), 0 = north pole, π = south pole
 * - v = azimuthal angle
 */
function spherePointToUV(sphere: SphereSurface, point: Vec3): Vec2 {
  const rel = sub3(point, sphere.center);
  const r = length3(rel);

  if (r < 1e-12) {
    // Point at center - return north pole
    return vec2(0, 0);
  }

  // Normalize to unit sphere
  const nx = rel[0] / r;
  const ny = rel[1] / r;
  const nz = rel[2] / r;

  // u = polar angle (acos of z component)
  const u = Math.acos(Math.max(-1, Math.min(1, nz)));

  // v = azimuthal angle
  const v = Math.atan2(ny, nx);

  return vec2(u, v);
}

/**
 * Torus: more complex - for now, approximate
 */
function torusPointToUV(
  torus: {
    kind: `torus`;
    center: Vec3;
    axis: Vec3;
    majorRadius: number;
    minorRadius: number;
    uPerp?: Vec3;
    vPerp?: Vec3;
  },
  point: Vec3
): Vec2 {
  const axis = normalize3(torus.axis);
  const rel = sub3(point, torus.center);

  // Project to plane perpendicular to axis
  const axial = dot3(rel, axis);
  const axisPoint = add3(torus.center, mul3(axis, axial));
  const planar = sub3(point, axisPoint);
  const planarLen = length3(planar);

  // Get basis
  const basis = getTorusBasis(torus);

  // v: around the main axis (like cylinder)
  const sinV = dot3(planar, basis.uPerp);
  const cosV = dot3(planar, basis.vPerp);
  const v = Math.atan2(sinV, cosV);

  // u: around the tube circle
  const planarDir = planarLen > 1e-12 ? mul3(planar, 1 / planarLen) : basis.vPerp;
  const tubeCenter = add3(torus.center, mul3(planarDir, torus.majorRadius));
  const tubeVec = sub3(point, tubeCenter);

  const sinU = dot3(tubeVec, axis);
  const cosU = dot3(tubeVec, planarDir);
  const u = Math.atan2(sinU, cosU);

  return vec2(u, v);
}

/**
 * Canonicalize UV to standard ranges (for display only, not for stored pcurves)
 * - Cylinder: v ∈ [0, 2π)
 * - Sphere: u ∈ [0, π], v ∈ [0, 2π)
 */
export function canonicalizeUV(surface: Surface, uv: Vec2): Vec2 {
  const [u, v] = uv;

  switch (surface.kind) {
    case `plane`:
      return uv;

    case `cylinder`: {
      // v is periodic with period 2π
      let vNorm = v % (2 * Math.PI);
      if (vNorm < 0) vNorm += 2 * Math.PI;
      return vec2(u, vNorm);
    }

    case `cone`: {
      // v is periodic with period 2π
      let vNorm = v % (2 * Math.PI);
      if (vNorm < 0) vNorm += 2 * Math.PI;
      return vec2(u, vNorm);
    }

    case `sphere`: {
      // v is periodic with period 2π
      let vNorm = v % (2 * Math.PI);
      if (vNorm < 0) vNorm += 2 * Math.PI;
      // u is clamped to [0, π]
      const uNorm = Math.max(0, Math.min(Math.PI, u));
      return vec2(uNorm, vNorm);
    }

    case `torus`: {
      // Both u and v are periodic with period 2π
      let uNorm = u % (2 * Math.PI);
      if (uNorm < 0) uNorm += 2 * Math.PI;
      let vNorm = v % (2 * Math.PI);
      if (vNorm < 0) vNorm += 2 * Math.PI;
      return vec2(uNorm, vNorm);
    }

    default:
      return uv;
  }
}

// Helper functions to get orthonormal basis (copied from surface.ts to avoid circular deps)
function computeOrthonormalBasis(axis: Vec3): { uPerp: Vec3; vPerp: Vec3 } {
  const absX = Math.abs(axis[0]);
  const absY = Math.abs(axis[1]);
  const absZ = Math.abs(axis[2]);

  let candidate: Vec3;
  if (absX <= absY && absX <= absZ) {
    candidate = [1, 0, 0];
  } else if (absY <= absZ) {
    candidate = [0, 1, 0];
  } else {
    candidate = [0, 0, 1];
  }

  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  const uPerp = normalize3(cross(axis, candidate));
  const vPerp = normalize3(cross(uPerp, axis));

  return { uPerp, vPerp };
}

function getCylinderBasis(cyl: CylinderSurface): { uPerp: Vec3; vPerp: Vec3 } {
  if (cyl.uPerp && cyl.vPerp) {
    return { uPerp: cyl.uPerp, vPerp: cyl.vPerp };
  }
  const basis = computeOrthonormalBasis(cyl.axis);
  (cyl as CylinderSurface & { uPerp: Vec3; vPerp: Vec3 }).uPerp = basis.uPerp;
  (cyl as CylinderSurface & { uPerp: Vec3; vPerp: Vec3 }).vPerp = basis.vPerp;
  return basis;
}

function getConeBasis(cone: ConeSurface): { uPerp: Vec3; vPerp: Vec3 } {
  if (cone.uPerp && cone.vPerp) {
    return { uPerp: cone.uPerp, vPerp: cone.vPerp };
  }
  const basis = computeOrthonormalBasis(cone.axis);
  (cone as ConeSurface & { uPerp: Vec3; vPerp: Vec3 }).uPerp = basis.uPerp;
  (cone as ConeSurface & { uPerp: Vec3; vPerp: Vec3 }).vPerp = basis.vPerp;
  return basis;
}

function getTorusBasis(torus: { axis: Vec3; uPerp?: Vec3; vPerp?: Vec3 }): {
  uPerp: Vec3;
  vPerp: Vec3;
} {
  if (torus.uPerp && torus.vPerp) {
    return { uPerp: torus.uPerp, vPerp: torus.vPerp };
  }
  const basis = computeOrthonormalBasis(torus.axis);
  (torus as { uPerp: Vec3; vPerp: Vec3 }).uPerp = basis.uPerp;
  (torus as { uPerp: Vec3; vPerp: Vec3 }).vPerp = basis.vPerp;
  return basis;
}
