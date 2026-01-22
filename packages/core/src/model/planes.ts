/**
 * Datum planes for sketch placement
 *
 * Provides named datum planes that sketches can be placed on.
 * Planes are represented as PlaneSurface from geom module with
 * additional identity information.
 */

import type { Vec3 } from "../num/vec3.js";
import { vec3, normalize3, add3, sub3, mul3, dot3, cross3, length3 } from "../num/vec3.js";
import type { PlaneSurface } from "../geom/surface.js";
import { createPlaneSurface } from "../geom/surface.js";

/**
 * Branded type for plane identifiers
 */
export type PlaneId = number & { __brand: `PlaneId` };

/**
 * Counter for generating unique plane IDs
 */
let nextPlaneId = 0;

/**
 * Create a PlaneId from a number
 * @internal
 */
export function asPlaneId(id: number): PlaneId {
  return id as PlaneId;
}

/**
 * Generate a new unique plane ID
 */
function newPlaneId(): PlaneId {
  return asPlaneId(nextPlaneId++);
}

/**
 * A named datum plane for sketch placement
 */
export interface DatumPlane {
  /** Unique identifier */
  id: PlaneId;
  /** Human-readable name (e.g., "XY", "Front") */
  name: string;
  /** The underlying surface geometry */
  surface: PlaneSurface;
}

/**
 * Create a datum plane from a surface with a name
 *
 * @param name Human-readable name
 * @param surface The plane surface geometry
 * @returns A new datum plane
 */
export function createDatumPlane(name: string, surface: PlaneSurface): DatumPlane {
  return {
    id: newPlaneId(),
    name,
    surface,
  };
}

/**
 * Create a datum plane at the origin with specified normal and X direction
 *
 * @param name Human-readable name
 * @param origin Point on the plane
 * @param normal Plane normal direction
 * @param xDir Reference X direction in plane
 * @returns A new datum plane
 */
export function createDatumPlaneFromNormal(
  name: string,
  origin: Vec3,
  normal: Vec3,
  xDir?: Vec3
): DatumPlane {
  const surface = createPlaneSurface(origin, normal, xDir);
  return createDatumPlane(name, surface);
}

/**
 * Create a datum plane offset from an existing plane
 *
 * @param basePlane The plane to offset from
 * @param distance Distance to offset (positive = in normal direction)
 * @param name Optional name for the new plane
 * @returns A new datum plane parallel to basePlane
 */
export function createOffsetPlane(
  basePlane: DatumPlane,
  distance: number,
  name?: string
): DatumPlane {
  const base = basePlane.surface;
  const offset = normalize3(base.normal);
  const newOrigin: Vec3 = [
    base.origin[0] + offset[0] * distance,
    base.origin[1] + offset[1] * distance,
    base.origin[2] + offset[2] * distance,
  ];

  const surface = createPlaneSurface(newOrigin, base.normal, base.xDir);
  return createDatumPlane(name ?? `${basePlane.name}_offset_${distance}`, surface);
}

// ============================================================================
// Derived plane construction (Phase 28)
// ============================================================================

const PLANE_EPS = 1e-9;

type PlaneSurfaceLike = PlaneSurface | DatumPlane;

function toPlaneSurface(plane: PlaneSurfaceLike): PlaneSurface {
  return "surface" in plane ? plane.surface : plane;
}

function rotateVectorAroundAxis(vec: Vec3, axisDir: Vec3, angleRad: number): Vec3 {
  const k = normalize3(axisDir);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const term1 = mul3(vec, cos);
  const term2 = mul3(cross3(k, vec), sin);
  const term3 = mul3(k, dot3(k, vec) * (1 - cos));
  return add3(add3(term1, term2), term3);
}

function rotatePointAroundAxis(point: Vec3, axisOrigin: Vec3, axisDir: Vec3, angleRad: number): Vec3 {
  const relative = sub3(point, axisOrigin);
  const rotated = rotateVectorAroundAxis(relative, axisDir, angleRad);
  return add3(axisOrigin, rotated);
}

/**
 * Create a plane through three points.
 * Throws if points are collinear.
 */
export function create3PointPlane(
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  name: string = "3-Point Plane"
): DatumPlane {
  const v1 = sub3(p2, p1);
  const v2 = sub3(p3, p1);
  const normal = cross3(v1, v2);
  if (length3(normal) < PLANE_EPS) {
    throw new Error("Points are collinear - cannot define plane");
  }
  const xDir = normalize3(v1);
  const surface = createPlaneSurface(p1, normal, xDir);
  return createDatumPlane(name, surface);
}

/**
 * Create a midplane between two parallel planes.
 * Throws if planes are not parallel.
 */
export function createMidplane(
  planeA: PlaneSurfaceLike,
  planeB: PlaneSurfaceLike,
  name: string = "Midplane"
): DatumPlane {
  const a = toPlaneSurface(planeA);
  const b = toPlaneSurface(planeB);
  let n1 = normalize3(a.normal);
  let n2 = normalize3(b.normal);

  // Align normals for stable midplane computation.
  if (dot3(n1, n2) < 0) {
    n2 = mul3(n2, -1);
  }

  const cross = cross3(n1, n2);
  if (length3(cross) > PLANE_EPS) {
    throw new Error("Planes are not parallel - cannot define midplane");
  }

  const delta = sub3(b.origin, a.origin);
  const distance = dot3(delta, n1);
  const midOrigin = add3(a.origin, mul3(n1, distance * 0.5));
  const surface = createPlaneSurface(midOrigin, n1, a.xDir);
  return createDatumPlane(name, surface);
}

/**
 * Create a plane by rotating a base plane around an axis.
 */
export function createAnglePlane(
  basePlane: PlaneSurfaceLike,
  axis: { origin: Vec3; direction: Vec3 },
  angleDegrees: number,
  name: string = "Angle Plane"
): DatumPlane {
  const base = toPlaneSurface(basePlane);
  const angleRad = (angleDegrees * Math.PI) / 180;
  const newNormal = rotateVectorAroundAxis(base.normal, axis.direction, angleRad);
  const newXDir = rotateVectorAroundAxis(base.xDir, axis.direction, angleRad);
  const newOrigin = rotatePointAroundAxis(base.origin, axis.origin, axis.direction, angleRad);
  const surface = createPlaneSurface(newOrigin, newNormal, newXDir);
  return createDatumPlane(name, surface);
}

// ============================================================================
// Standard datum planes
// ============================================================================

/**
 * XY plane (Z = 0)
 * - Normal: +Z (0, 0, 1)
 * - X direction: +X (1, 0, 0)
 * - Y direction: +Y (0, 1, 0)
 */
export const XY_PLANE: DatumPlane = createDatumPlaneFromNormal(
  `XY`,
  vec3(0, 0, 0),
  vec3(0, 0, 1),
  vec3(1, 0, 0)
);

/**
 * YZ plane (X = 0)
 * - Normal: +X (1, 0, 0)
 * - X direction: +Y (0, 1, 0)
 * - Y direction: +Z (0, 0, 1)
 */
export const YZ_PLANE: DatumPlane = createDatumPlaneFromNormal(
  `YZ`,
  vec3(0, 0, 0),
  vec3(1, 0, 0),
  vec3(0, 1, 0)
);

/**
 * ZX plane (Y = 0)
 * - Normal: +Y (0, 1, 0)
 * - X direction: +Z (0, 0, 1)
 * - Y direction: +X (1, 0, 0)
 */
export const ZX_PLANE: DatumPlane = createDatumPlaneFromNormal(
  `ZX`,
  vec3(0, 0, 0),
  vec3(0, 1, 0),
  vec3(0, 0, 1)
);

/**
 * Alias for XY plane (looking from +Z toward origin)
 */
export const TOP_PLANE: DatumPlane = XY_PLANE;

/**
 * Alias for YZ plane (looking from +X toward origin)
 */
export const RIGHT_PLANE: DatumPlane = YZ_PLANE;

/**
 * Alias for ZX plane (looking from +Y toward origin)
 */
export const FRONT_PLANE: DatumPlane = ZX_PLANE;

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Get the origin of a datum plane
 */
export function getPlaneOrigin(plane: DatumPlane): Vec3 {
  return plane.surface.origin;
}

/**
 * Get the normal of a datum plane
 */
export function getPlaneNormal(plane: DatumPlane): Vec3 {
  return plane.surface.normal;
}

/**
 * Get the X direction of a datum plane
 */
export function getPlaneXDir(plane: DatumPlane): Vec3 {
  return plane.surface.xDir;
}

/**
 * Get the Y direction of a datum plane
 */
export function getPlaneYDir(plane: DatumPlane): Vec3 {
  return plane.surface.yDir;
}

/**
 * Transform a 2D point on the plane to 3D world coordinates
 *
 * @param plane The datum plane
 * @param x X coordinate in plane space
 * @param y Y coordinate in plane space
 * @returns 3D world coordinates
 */
export function planeToWorld(plane: DatumPlane, x: number, y: number): Vec3 {
  const { origin, xDir, yDir } = plane.surface;
  return [
    origin[0] + x * xDir[0] + y * yDir[0],
    origin[1] + x * xDir[1] + y * yDir[1],
    origin[2] + x * xDir[2] + y * yDir[2],
  ];
}

/**
 * Transform a 3D world point to 2D plane coordinates
 * (Projects onto the plane)
 *
 * @param plane The datum plane
 * @param point 3D world coordinates
 * @returns [x, y] coordinates in plane space
 */
export function worldToPlane(plane: DatumPlane, point: Vec3): [number, number] {
  const { origin, xDir, yDir } = plane.surface;
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const dz = point[2] - origin[2];

  const x = dx * xDir[0] + dy * xDir[1] + dz * xDir[2];
  const y = dx * yDir[0] + dy * yDir[1] + dz * yDir[2];

  return [x, y];
}
