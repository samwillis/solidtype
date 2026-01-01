/**
 * Integer-based geometry for exact vertex matching
 *
 * All coordinates are stored in nanometers as integers.
 * This eliminates floating-point comparison issues because:
 * 1. Two points are equal iff their integer coordinates are equal
 * 2. Intersection points are computed once and snapped to the grid
 * 3. All references to the same geometric point use the same integers
 *
 * The 0.5nm maximum rounding error is negligible for CAD purposes
 * (typical manufacturing tolerance is 10-100 micrometers = 10,000-100,000 nm).
 */

// ============================================================================
// Constants
// ============================================================================

/** Nanometers per millimeter */
export const NANO_PER_MM = 1_000_000;

/** Nanometers per meter */
export const NANO_PER_M = 1_000_000_000;

/** Maximum safe integer coordinate (JavaScript safe integer limit) */
export const MAX_COORD = Number.MAX_SAFE_INTEGER; // ~9 quadrillion nm = ~9000 km

// ============================================================================
// Types
// ============================================================================

/** Integer coordinate in nanometers */
export type NanoInt = number;

/** 3D point with integer coordinates in nanometers */
export type Vec3I = readonly [NanoInt, NanoInt, NanoInt];

/** 2D point with integer coordinates in nanometers */
export type Vec2I = readonly [NanoInt, NanoInt];

// ============================================================================
// Conversion functions
// ============================================================================

/** Convert millimeters to nanometers (integer) */
export function mmToNano(mm: number): NanoInt {
  return Math.round(mm * NANO_PER_MM);
}

/** Convert nanometers (integer) to millimeters (float for output) */
export function nanoToMm(nano: NanoInt): number {
  return nano / NANO_PER_MM;
}

/** Convert a float Vec3 (in mm) to integer Vec3I (in nm) */
export function vec3ToInt(v: readonly [number, number, number]): Vec3I {
  return [mmToNano(v[0]), mmToNano(v[1]), mmToNano(v[2])];
}

/** Convert integer Vec3I (in nm) to float Vec3 (in mm) for output */
export function vec3ToFloat(v: Vec3I): [number, number, number] {
  return [nanoToMm(v[0]), nanoToMm(v[1]), nanoToMm(v[2])];
}

/** Convert a float Vec2 (in mm) to integer Vec2I (in nm) */
export function vec2ToInt(v: readonly [number, number]): Vec2I {
  return [mmToNano(v[0]), mmToNano(v[1])];
}

/** Convert integer Vec2I (in nm) to float Vec2 (in mm) for output */
export function vec2ToFloat(v: Vec2I): [number, number] {
  return [nanoToMm(v[0]), nanoToMm(v[1])];
}

// ============================================================================
// Vector operations (integer)
// ============================================================================

export function addI(a: Vec3I, b: Vec3I): Vec3I {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subI(a: Vec3I, b: Vec3I): Vec3I {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Dot product - returns a large integer (nm²)
 * Be careful with overflow for very large coordinates
 */
export function dotI(a: Vec3I, b: Vec3I): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cross product - returns vector in nm²
 */
export function crossI(a: Vec3I, b: Vec3I): Vec3I {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Check if two integer points are exactly equal */
export function equalsI(a: Vec3I, b: Vec3I): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Squared length (avoids sqrt, stays in integer domain) */
export function lengthSquaredI(v: Vec3I): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

// ============================================================================
// Line-line intersection (2D, for planar faces)
// ============================================================================

/**
 * Compute intersection of two 2D line segments.
 * Returns the intersection point snapped to integer coordinates, or null if no intersection.
 *
 * Uses exact integer arithmetic for the determinant tests (no floating point error),
 * then snaps the result to the integer grid.
 */
export function segmentIntersection2I(
  p1: Vec2I,
  p2: Vec2I, // Segment 1
  p3: Vec2I,
  p4: Vec2I // Segment 2
): Vec2I | null {
  // Direction vectors
  const d1x = p2[0] - p1[0];
  const d1y = p2[1] - p1[1];
  const d2x = p4[0] - p3[0];
  const d2y = p4[1] - p3[1];

  // Cross product of directions (determinant)
  // This is exact in integer arithmetic
  const cross = d1x * d2y - d1y * d2x;

  // If cross is 0, lines are parallel
  if (cross === 0) return null;

  // Vector from p1 to p3
  const dx = p3[0] - p1[0];
  const dy = p3[1] - p1[1];

  // Parameter t for segment 1: p1 + t * d1
  // t = (dx * d2y - dy * d2x) / cross
  const tNumer = dx * d2y - dy * d2x;

  // Parameter s for segment 2: p3 + s * d2
  // s = (dx * d1y - dy * d1x) / cross
  const sNumer = dx * d1y - dy * d1x;

  // Check if intersection is within both segments [0, 1]
  // We check without division to avoid floating point
  if (cross > 0) {
    if (tNumer < 0 || tNumer > cross) return null;
    if (sNumer < 0 || sNumer > cross) return null;
  } else {
    if (tNumer > 0 || tNumer < cross) return null;
    if (sNumer > 0 || sNumer < cross) return null;
  }

  // Compute the intersection point
  // This is where we use floating point, then snap to grid
  const t = tNumer / cross;
  const x = p1[0] + t * d1x;
  const y = p1[1] + t * d1y;

  // Snap to integer grid - THIS IS THE KEY STEP
  // Both faces will use this exact same snapped value
  return [Math.round(x), Math.round(y)];
}

// ============================================================================
// Line-line intersection (3D)
// ============================================================================

/**
 * Find the closest points on two 3D lines, snapped to integer grid.
 *
 * Line 1: p1 + t * d1
 * Line 2: p2 + s * d2
 *
 * Returns [point on line 1, point on line 2] snapped to integers,
 * or null if lines are parallel.
 */
export function lineLineClosestPoints3I(
  p1: Vec3I,
  d1: Vec3I, // Line 1: point and direction
  p2: Vec3I,
  d2: Vec3I // Line 2: point and direction
): [Vec3I, Vec3I] | null {
  // w = p1 - p2
  const w: Vec3I = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];

  const a = dotI(d1, d1); // |d1|²
  const b = dotI(d1, d2); // d1·d2
  const c = dotI(d2, d2); // |d2|²
  const d = dotI(d1, w); // d1·w
  const e = dotI(d2, w); // d2·w

  const denom = a * c - b * b; // This is exact (all integer)

  // If denom is 0 (or very small relative to a*c), lines are parallel
  if (Math.abs(denom) < 1) return null; // Using 1 as threshold (1 nm² is tiny)

  // Compute parameters (this uses floating point)
  const t = (b * e - c * d) / denom;
  const s = (a * e - b * d) / denom;

  // Compute points on each line
  const point1x = p1[0] + t * d1[0];
  const point1y = p1[1] + t * d1[1];
  const point1z = p1[2] + t * d1[2];

  const point2x = p2[0] + s * d2[0];
  const point2y = p2[1] + s * d2[1];
  const point2z = p2[2] + s * d2[2];

  // SNAP BOTH POINTS TO THE SAME INTEGER VALUE
  // Take the average and round - both get the exact same result
  const avgX = Math.round((point1x + point2x) / 2);
  const avgY = Math.round((point1y + point2y) / 2);
  const avgZ = Math.round((point1z + point2z) / 2);

  const snapped: Vec3I = [avgX, avgY, avgZ];

  // Both lines get the SAME point
  return [snapped, snapped];
}

// ============================================================================
// Plane-plane intersection line
// ============================================================================

/**
 * Compute the intersection line of two planes.
 *
 * Plane 1: n1 · (p - p1) = 0
 * Plane 2: n2 · (p - p2) = 0
 *
 * Returns [point on line, direction of line], or null if planes are parallel.
 * The point is snapped to integer coordinates.
 */
export function planePlaneIntersection(
  n1: Vec3I,
  p1: Vec3I, // Plane 1: normal and point on plane
  n2: Vec3I,
  p2: Vec3I // Plane 2: normal and point on plane
): { point: Vec3I; direction: Vec3I } | null {
  // Direction of intersection line = n1 × n2
  const direction = crossI(n1, n2);

  // If cross product is zero, planes are parallel
  const dirLenSq = lengthSquaredI(direction);
  if (dirLenSq === 0) return null;

  // Find a point on the line
  // We solve for the point closest to origin on the intersection line
  // This involves some floating point, then we snap

  // d1 = n1 · p1 (distance from origin to plane 1)
  const d1 = dotI(n1, p1);
  // d2 = n2 · p2 (distance from origin to plane 2)
  const d2 = dotI(n2, p2);

  // The point on the intersection line closest to origin is:
  // p = (d1 * (n2 × dir) + d2 * (dir × n1)) / |dir|²

  const n2CrossDir = crossI(n2, direction);
  const dirCrossN1 = crossI(direction, n1);

  // This computation uses floating point
  const scale1 = d1 / dirLenSq;
  const scale2 = d2 / dirLenSq;

  const px = scale1 * n2CrossDir[0] + scale2 * dirCrossN1[0];
  const py = scale1 * n2CrossDir[1] + scale2 * dirCrossN1[1];
  const pz = scale1 * n2CrossDir[2] + scale2 * dirCrossN1[2];

  // Snap to integer grid
  const point: Vec3I = [Math.round(px), Math.round(py), Math.round(pz)];

  return { point, direction };
}

// ============================================================================
// Key insight: Computing intersection points for face pairs
// ============================================================================

/**
 * Compute the intersection segment between a line and a 3D polygon.
 *
 * The key insight: we compute intersection points in 3D, snap them to
 * the integer grid ONCE, and then both faces reference the same snapped points.
 *
 * This eliminates the "slightly different endpoints" problem entirely.
 */
export function clipLineToPolygon3I(
  linePoint: Vec3I,
  lineDir: Vec3I,
  polygon: Vec3I[]
): { tStart: number; tEnd: number; start: Vec3I; end: Vec3I }[] {
  if (polygon.length < 3) return [];

  // Collect all edge crossings with their t-parameters
  const crossings: { t: number; point: Vec3I }[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    // Edge direction
    const edgeDir: Vec3I = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];

    // Find closest points on the two lines
    const result = lineLineClosestPoints3I(linePoint, lineDir, p1, edgeDir);
    if (!result) continue; // Lines parallel

    const [pointOnLine, pointOnEdge] = result;

    // Check if pointOnEdge is actually on the edge segment [0, 1]
    // We compute s = (pointOnEdge - p1) / edgeDir for the longest component
    const edgeLenSq = lengthSquaredI(edgeDir);
    if (edgeLenSq === 0) continue;

    const toPoint: Vec3I = [pointOnEdge[0] - p1[0], pointOnEdge[1] - p1[1], pointOnEdge[2] - p1[2]];
    const s = dotI(toPoint, edgeDir) / edgeLenSq;

    // Check if s is in [0, 1] with small tolerance
    const tol = 1e-9;
    if (s < -tol || s > 1 + tol) continue;

    // Compute t parameter on the main line
    const toPointOnLine: Vec3I = [
      pointOnLine[0] - linePoint[0],
      pointOnLine[1] - linePoint[1],
      pointOnLine[2] - linePoint[2],
    ];
    const lineLenSq = lengthSquaredI(lineDir);
    const t = dotI(toPointOnLine, lineDir) / lineLenSq;

    crossings.push({ t, point: pointOnLine });
  }

  if (crossings.length < 2) return [];

  // Sort by t parameter
  crossings.sort((a, b) => a.t - b.t);

  // Build segments from pairs of crossings
  // For a convex polygon, we'd have exactly 2 crossings
  // For concave, we might have more
  const segments: { tStart: number; tEnd: number; start: Vec3I; end: Vec3I }[] = [];

  for (let i = 0; i < crossings.length - 1; i += 2) {
    segments.push({
      tStart: crossings[i].t,
      tEnd: crossings[i + 1].t,
      start: crossings[i].point,
      end: crossings[i + 1].point,
    });
  }

  return segments;
}
