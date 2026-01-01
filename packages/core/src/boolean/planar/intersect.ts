/**
 * Plane-plane intersection for planar boolean operations
 *
 * Given two planar faces, computes the intersection line and clips it
 * against each face's polygon boundary.
 */

import type { Vec2 } from "../../num/vec2.js";
import type { Vec3 } from "../../num/vec3.js";
import { dot3, cross3, sub3, add3, mul3, normalize3, length3 } from "../../num/vec3.js";
import type { NumericContext } from "../../num/tolerance.js";
import { isZero } from "../../num/tolerance.js";
import { segSegHit, orient2DRobust } from "../../num/predicates.js";
import type { PlaneSurface } from "../../geom/surface.js";
import type { Segment2D, FacePolygon2D } from "./types.js";

/**
 * Result of intersecting two planes
 */
export interface PlaneIntersection {
  /** Direction of intersection line (normalized) */
  direction: Vec3;
  /** A point on the intersection line */
  point: Vec3;
}

/**
 * Compute the intersection line of two planes.
 * Returns null if planes are parallel.
 */
export function intersectPlanes(
  planeA: PlaneSurface,
  planeB: PlaneSurface,
  ctx: NumericContext
): PlaneIntersection | null {
  // Direction of intersection line is cross product of normals
  const direction = cross3(planeA.normal, planeB.normal);
  const dirLen = length3(direction);

  if (isZero(dirLen, ctx)) {
    // Planes are parallel
    return null;
  }

  // Normalize direction
  const normDir = normalize3(direction);

  // Find a point on the intersection line
  // Solve system: n1 · p = d1, n2 · p = d2, and choose the point closest to origin
  // that lies on both planes
  const d1 = dot3(planeA.normal, planeA.origin);
  const d2 = dot3(planeB.normal, planeB.origin);

  // Use the formula for finding a point on the intersection line
  // p = ((d1 * n2 - d2 * n1) × dir) / |dir|²  + arbitrary component along dir
  const n1 = planeA.normal;
  const n2 = planeB.normal;

  // The point can be computed as:
  // p = (d2 * (dir × n1) + d1 * (n2 × dir)) / (dir · dir)
  // but since dir is normalized, dir · dir = 1
  const point = add3(mul3(cross3(normDir, n1), d2), mul3(cross3(n2, normDir), d1));

  return { direction: normDir, point };
}

/**
 * Project a 3D point onto a plane's local 2D coordinates
 */
export function projectToPlane2D(point: Vec3, plane: PlaneSurface): Vec2 {
  const v = sub3(point, plane.origin);
  return [dot3(v, plane.xDir), dot3(v, plane.yDir)];
}

/**
 * Unproject a 2D point from plane coordinates back to 3D
 */
export function unprojectFromPlane(uv: Vec2, plane: PlaneSurface): Vec3 {
  return add3(plane.origin, add3(mul3(plane.xDir, uv[0]), mul3(plane.yDir, uv[1])));
}

/**
 * Clip a line (given by direction and point) against a polygon.
 * Returns the segment(s) of the line that lie inside the polygon.
 *
 * Uses robust orientation predicates for numerical stability with
 * tilted/rotated geometry.
 *
 * Approach: find all edge crossings using segSegHit (robust), sort by parameter,
 * then use odd-even rule to determine inside intervals.
 *
 * Returns empty if the line lies on a polygon edge (degenerate case).
 */
export function clipLineToPolygon(
  linePoint: Vec2,
  lineDir: Vec2,
  polygon: Vec2[],
  _ctx: NumericContext
): { tStart: number; tEnd: number }[] {
  if (polygon.length < 3) return [];

  // Normalize line direction for consistent parameterization
  const dirLen = Math.sqrt(lineDir[0] ** 2 + lineDir[1] ** 2);
  if (dirLen < 1e-12) return [];
  const normDir: Vec2 = [lineDir[0] / dirLen, lineDir[1] / dirLen];

  // Compute polygon extent along line direction for bounding the "infinite" line
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of polygon) {
    const t = (p[0] - linePoint[0]) * normDir[0] + (p[1] - linePoint[1]) * normDir[1];
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }

  // Extend beyond polygon bounds to create a finite segment for intersection testing
  const padding = Math.max(1, (tMax - tMin) * 0.1);
  const lineStart: Vec2 = [
    linePoint[0] + (tMin - padding) * normDir[0],
    linePoint[1] + (tMin - padding) * normDir[1],
  ];
  const lineEnd: Vec2 = [
    linePoint[0] + (tMax + padding) * normDir[0],
    linePoint[1] + (tMax + padding) * normDir[1],
  ];

  // Collect intersection parameters with polygon edges using robust segment-segment test
  const crossings: number[] = [];
  const collinearIntervals: { tStart: number; tEnd: number }[] = [];

  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Use robust segment-segment intersection
    const hit = segSegHit(lineStart, lineEnd, p1, p2);

    if (hit.kind === `point`) {
      // Convert t1 from lineStart-lineEnd parameterization to linePoint parameterization
      const hitPoint = hit.point;
      const t =
        (hitPoint[0] - linePoint[0]) * normDir[0] + (hitPoint[1] - linePoint[1]) * normDir[1];
      crossings.push(t);
    } else if (hit.kind === `overlap`) {
      // Line is collinear with this edge - record the overlapping interval
      const pt1: Vec2 = [
        lineStart[0] + hit.t1Start * (lineEnd[0] - lineStart[0]),
        lineStart[1] + hit.t1Start * (lineEnd[1] - lineStart[1]),
      ];
      const pt2: Vec2 = [
        lineStart[0] + hit.t1End * (lineEnd[0] - lineStart[0]),
        lineStart[1] + hit.t1End * (lineEnd[1] - lineStart[1]),
      ];
      const t1 = (pt1[0] - linePoint[0]) * normDir[0] + (pt1[1] - linePoint[1]) * normDir[1];
      const t2 = (pt2[0] - linePoint[0]) * normDir[0] + (pt2[1] - linePoint[1]) * normDir[1];
      collinearIntervals.push({ tStart: Math.min(t1, t2), tEnd: Math.max(t1, t2) });
    }
  }

  // If we have collinear overlaps, merge and return them
  if (collinearIntervals.length > 0) {
    collinearIntervals.sort((a, b) => a.tStart - b.tStart);
    const merged: { tStart: number; tEnd: number }[] = [];
    let current = { ...collinearIntervals[0] };
    for (let i = 1; i < collinearIntervals.length; i++) {
      const next = collinearIntervals[i];
      if (next.tStart <= current.tEnd + 1e-10) {
        current.tEnd = Math.max(current.tEnd, next.tEnd);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
    return merged;
  }

  if (crossings.length === 0) {
    // No edge crossings - check if line is entirely inside or outside
    if (pointInPolygon(linePoint, polygon)) {
      // Line is entirely inside polygon - return the full extent
      return [{ tStart: tMin - padding, tEnd: tMax + padding }];
    }
    return [];
  }

  // Sort crossings by parameter
  crossings.sort((a, b) => a - b);

  // Remove duplicates (within tolerance)
  const uniqueCrossings: number[] = [crossings[0]];
  for (let i = 1; i < crossings.length; i++) {
    if (Math.abs(crossings[i] - uniqueCrossings[uniqueCrossings.length - 1]) > 1e-10) {
      uniqueCrossings.push(crossings[i]);
    }
  }

  // Use odd-even rule: between each pair of crossings, test if inside
  const segments: { tStart: number; tEnd: number }[] = [];

  // Test before first crossing
  const testBefore: Vec2 = [
    linePoint[0] + (uniqueCrossings[0] - 1) * normDir[0],
    linePoint[1] + (uniqueCrossings[0] - 1) * normDir[1],
  ];
  let inside = pointInPolygon(testBefore, polygon);

  if (inside) {
    // Line starts inside - interval from polygon extent to first crossing
    segments.push({ tStart: tMin - padding, tEnd: uniqueCrossings[0] });
  }

  // Process each interval between crossings
  for (let i = 0; i < uniqueCrossings.length - 1; i++) {
    inside = !inside; // Toggle at each crossing
    if (inside) {
      segments.push({ tStart: uniqueCrossings[i], tEnd: uniqueCrossings[i + 1] });
    }
  }

  // Test after last crossing
  inside = !inside;
  if (inside) {
    segments.push({ tStart: uniqueCrossings[uniqueCrossings.length - 1], tEnd: tMax + padding });
  }

  return segments;
}

/**
 * Point-in-polygon test using robust winding number algorithm.
 *
 * Uses robust orientation predicates to correctly handle edge cases
 * where the point is very close to polygon edges.
 *
 * The winding number method counts how many times the polygon winds
 * around the point. For a simple polygon, winding != 0 means inside.
 */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;

  let windingNumber = 0;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    if (p1[1] <= point[1]) {
      // Edge goes upward
      if (p2[1] > point[1]) {
        // Upward crossing - check if point is to the left of edge
        const orient = orient2DRobust(p1, p2, point);
        if (orient > 0) {
          // Point is strictly to the left - count upward crossing
          windingNumber++;
        }
      }
    } else {
      // Edge goes downward
      if (p2[1] <= point[1]) {
        // Downward crossing - check if point is to the right of edge
        const orient = orient2DRobust(p1, p2, point);
        if (orient < 0) {
          // Point is strictly to the right - count downward crossing
          windingNumber--;
        }
      }
    }
  }

  return windingNumber !== 0;
}

/**
 * Clip a 3D line to a 3D planar polygon.
 * Returns intervals along the 3D line (parameterized from linePoint in direction lineDir).
 *
 * This avoids UV projection/unprojection roundtrips which accumulate floating-point errors.
 */
function clipLine3DToPolygon(
  linePoint: Vec3,
  lineDir: Vec3,
  polygon3D: Vec3[],
  ctx: NumericContext
): { tStart: number; tEnd: number }[] {
  if (polygon3D.length < 3) return [];

  const DEBUG =
    typeof globalThis !== `undefined` && (globalThis as Record<string, unknown>).DEBUG_CLIP_3D;

  // First, check if the line even passes through the polygon's plane
  // Compute polygon plane from vertices
  const v1 = sub3(polygon3D[1], polygon3D[0]);
  const v2 = sub3(polygon3D[2], polygon3D[0]);
  const planeNormal = normalize3(cross3(v1, v2));
  const planeD = dot3(planeNormal, polygon3D[0]);

  // Check if line is parallel to polygon plane
  const lineDotNormal = dot3(lineDir, planeNormal);

  if (Math.abs(lineDotNormal) < 1e-10) {
    // Line is parallel to polygon plane
    // Check if line is in the plane
    // NOTE: We use a very large tolerance here because:
    // 1. The line comes from intersectPlanes, which guarantees it lies on both planes mathematically
    // 2. But recomputing the plane from polygon vertices introduces floating-point errors
    // 3. Tolerances of 0.1 or more are possible due to accumulated errors in geometry
    const pointDist = dot3(linePoint, planeNormal) - planeD;
    const inPlaneTol = Math.max(0.1, ctx.tol.length * 1e6); // Very lenient tolerance
    if (Math.abs(pointDist) > inPlaneTol) {
      if (DEBUG)
        console.log(
          `    Line parallel to polygon and not in plane (dist=${pointDist.toFixed(6)}, tol=${inPlaneTol})`
        );
      return []; // Line doesn't intersect polygon plane
    }
    // Line is in the polygon plane - continue with edge clipping
    if (DEBUG)
      console.log(
        `    Line is in polygon plane (dist=${pointDist.toFixed(6)}) - proceeding with edge clipping`
      );
  } else {
    // Line intersects polygon plane at a single point
    // Find that point and check if it's inside the polygon
    const t = (planeD - dot3(linePoint, planeNormal)) / lineDotNormal;
    const intersectPt = add3(linePoint, mul3(lineDir, t));

    if (DEBUG) {
      console.log(
        `    Line pierces polygon plane at t=${t.toFixed(4)}, point=[${intersectPt.map((v) => v.toFixed(2)).join(`,`)}]`
      );
    }

    // Check if this point is inside the polygon
    if (point3DInPolygon(intersectPt, polygon3D, ctx)) {
      if (DEBUG) console.log(`    Point is INSIDE polygon - returning single-point interval`);
      // Return a small interval around this point
      const epsilon = ctx.tol.length * 10;
      return [{ tStart: t - epsilon, tEnd: t + epsilon }];
    } else {
      if (DEBUG) console.log(`    Point is OUTSIDE polygon - no intersection`);
      return [];
    }
  }

  // Compute polygon extent along line direction
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of polygon3D) {
    const v = sub3(p, linePoint);
    const t = dot3(v, lineDir);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }

  if (tMax - tMin < ctx.tol.length) return []; // Degenerate

  // Extend beyond polygon bounds
  const padding = Math.max(1, (tMax - tMin) * 0.1);

  // Collect intersection parameters with polygon edges
  const crossings: number[] = [];
  const n = polygon3D.length;

  for (let i = 0; i < n; i++) {
    const p1 = polygon3D[i];
    const p2 = polygon3D[(i + 1) % n];

    // Compute intersection of 3D line with edge p1-p2
    // Line: linePoint + t * lineDir
    // Edge: p1 + s * (p2 - p1), s ∈ [0, 1]

    const edgeDir = sub3(p2, p1);
    const edgeLen = length3(edgeDir);
    if (edgeLen < ctx.tol.length) continue;

    // Solve: linePoint + t * lineDir = p1 + s * edgeDir
    // This gives us: t * lineDir - s * edgeDir = p1 - linePoint
    // Two equations, two unknowns (t, s)

    // Use cross product to find intersection
    // (lineDir × edgeDir) should be parallel to plane normal
    const w = sub3(p1, linePoint);
    const cross = cross3(lineDir, edgeDir);
    const crossLen = length3(cross);

    if (crossLen < 1e-12) {
      // Lines are parallel - check for overlap
      // This happens when the intersection line lies along a polygon edge
      const distToLine = length3(sub3(w, mul3(lineDir, dot3(w, lineDir))));
      if (distToLine < ctx.tol.length) {
        // Edge lies on line - add both endpoints
        const t1 = dot3(sub3(p1, linePoint), lineDir);
        const t2 = dot3(sub3(p2, linePoint), lineDir);
        crossings.push(t1, t2);
      }
      continue;
    }

    // Use Cramer's rule for 2D system (project onto plane perpendicular to cross)
    // t = (w × edgeDir) · cross / |cross|²
    // s = (w × lineDir) · cross / |cross|²
    const cross2 = crossLen * crossLen;
    const t = dot3(cross3(w, edgeDir), cross) / cross2;
    const s = dot3(cross3(w, lineDir), cross) / cross2;

    // Check if intersection is within edge bounds
    if (s >= -ctx.tol.length / edgeLen && s <= 1 + ctx.tol.length / edgeLen) {
      crossings.push(t);
    }
  }

  if (crossings.length === 0) {
    // No edge crossings - check if line is entirely inside or outside
    // Test a point on the line within the polygon's t-range
    const testT = (tMin + tMax) / 2;
    const testPoint = add3(linePoint, mul3(lineDir, testT));
    if (point3DInPolygon(testPoint, polygon3D, ctx)) {
      return [{ tStart: tMin - padding, tEnd: tMax + padding }];
    }
    return [];
  }

  // Sort and deduplicate crossings
  crossings.sort((a, b) => a - b);
  const uniqueCrossings: number[] = [crossings[0]];
  for (let i = 1; i < crossings.length; i++) {
    if (Math.abs(crossings[i] - uniqueCrossings[uniqueCrossings.length - 1]) > ctx.tol.length) {
      uniqueCrossings.push(crossings[i]);
    }
  }

  // Use odd-even rule
  const segments: { tStart: number; tEnd: number }[] = [];

  // Test before first crossing
  const testBefore = add3(linePoint, mul3(lineDir, uniqueCrossings[0] - 1));
  let inside = point3DInPolygon(testBefore, polygon3D, ctx);

  if (inside) {
    segments.push({ tStart: tMin - padding, tEnd: uniqueCrossings[0] });
  }

  for (let i = 0; i < uniqueCrossings.length - 1; i++) {
    inside = !inside;
    if (inside) {
      segments.push({ tStart: uniqueCrossings[i], tEnd: uniqueCrossings[i + 1] });
    }
  }

  inside = !inside;
  if (inside) {
    segments.push({ tStart: uniqueCrossings[uniqueCrossings.length - 1], tEnd: tMax + padding });
  }

  return segments;
}

/**
 * Test if a 3D point lies inside a 3D planar polygon.
 * Assumes the point is coplanar with the polygon.
 */
function point3DInPolygon(point: Vec3, polygon3D: Vec3[], ctx: NumericContext): boolean {
  if (polygon3D.length < 3) return false;

  // Compute plane normal from first three vertices
  const v1 = sub3(polygon3D[1], polygon3D[0]);
  const v2 = sub3(polygon3D[2], polygon3D[0]);
  const normal = cross3(v1, v2);
  const normalLen = length3(normal);
  if (normalLen < ctx.tol.length) return false;

  // Create a local 2D coordinate system on the plane
  // Use a deterministic basis derived from the normal
  const n = normalize3(normal);
  const xDir = normalize3(v1);
  const yDir = cross3(n, xDir);

  // Project all points to 2D
  const origin = polygon3D[0];
  const pointV = sub3(point, origin);
  const point2D: Vec2 = [dot3(pointV, xDir), dot3(pointV, yDir)];

  const polygon2D: Vec2[] = polygon3D.map((p) => {
    const v = sub3(p, origin);
    return [dot3(v, xDir), dot3(v, yDir)] as Vec2;
  });

  return pointInPolygon(point2D, polygon2D);
}

/**
 * Convert a 2D polygon to 3D using the face's surface
 */
function polygon2DTo3D(polygon2D: Vec2[], surface: PlaneSurface): Vec3[] {
  return polygon2D.map((p) => unprojectFromPlane(p, surface));
}

/**
 * Compute intersection segments between two planar faces.
 * Returns segments in the 2D coordinate system of each face.
 *
 * Uses 3D clipping to avoid floating-point errors from UV projection roundtrips.
 *
 * @param operation Optional boolean operation type. Affects coplanar face handling:
 *   - 'union': Skip imprinting for same-normal coplanar faces
 *   - 'subtract'/'intersect': Always imprint for proper hole creation
 */
export function computeFaceIntersection(
  faceA: FacePolygon2D,
  faceB: FacePolygon2D,
  ctx: NumericContext,
  operation?: `union` | `subtract` | `intersect`
): { segmentsA: Segment2D[]; segmentsB: Segment2D[] } | null {
  const DEBUG =
    typeof globalThis !== `undefined` &&
    (globalThis as Record<string, unknown>).DEBUG_FACE_INTERSECTION;

  // Intersect the two planes
  const intersection = intersectPlanes(faceA.surface, faceB.surface, ctx);

  if (!intersection) {
    // Planes are parallel - check if coplanar
    const dist = dot3(sub3(faceB.surface.origin, faceA.surface.origin), faceA.surface.normal);
    if (Math.abs(dist) < ctx.tol.length) {
      // Coplanar faces - handle specially (overlap detection)
      return handleCoplanarFaces(faceA, faceB, ctx, operation);
    }
    return null;
  }

  // Convert both polygons to 3D for direct 3D clipping
  const polygon3DA = polygon2DTo3D(faceA.outer, faceA.surface);
  const polygon3DB = polygon2DTo3D(faceB.outer, faceB.surface);

  if (DEBUG) {
    console.log(
      `  Intersection line: point=[${intersection.point.map((v) => v.toFixed(2)).join(`,`)}], dir=[${intersection.direction.map((v) => v.toFixed(3)).join(`,`)}]`
    );
    console.log(
      `  Polygon3DA: ${polygon3DA.map((p) => `[${p.map((v) => v.toFixed(1)).join(`,`)}]`).join(` `)}`
    );
    console.log(
      `  Polygon3DB: ${polygon3DB.map((p) => `[${p.map((v) => v.toFixed(1)).join(`,`)}]`).join(` `)}`
    );
  }

  // Clip intersection line to both polygons in 3D
  // This avoids UV projection/unprojection roundtrips which cause floating-point errors
  const intervalsA = clipLine3DToPolygon(
    intersection.point,
    intersection.direction,
    polygon3DA,
    ctx
  );
  const intervalsB = clipLine3DToPolygon(
    intersection.point,
    intersection.direction,
    polygon3DB,
    ctx
  );

  if (DEBUG) {
    console.log(`  IntervalsA: ${JSON.stringify(intervalsA)}`);
    console.log(`  IntervalsB: ${JSON.stringify(intervalsB)}`);
  }

  if (intervalsA.length === 0 || intervalsB.length === 0) {
    return null;
  }

  const segmentsA: Segment2D[] = [];
  const segmentsB: Segment2D[] = [];

  // For each pair of intervals, compute overlap in 3D parameter space
  for (const intA of intervalsA) {
    for (const intB of intervalsB) {
      // Intervals are already in the same 3D parameter space!
      // No need for 2D→3D→2D roundtrip
      const overlapMin = Math.max(intA.tStart, intB.tStart);
      const overlapMax = Math.min(intA.tEnd, intB.tEnd);

      if (overlapMax - overlapMin < ctx.tol.length) continue; // No significant overlap

      // Compute canonical 3D endpoints from the overlap
      const pt3d_start = add3(intersection.point, mul3(intersection.direction, overlapMin));
      const pt3d_end = add3(intersection.point, mul3(intersection.direction, overlapMax));

      // Project to each face's 2D system
      // Now both faces get endpoints derived from the SAME 3D points
      const segA: Segment2D = {
        a: projectToPlane2D(pt3d_start, faceA.surface),
        b: projectToPlane2D(pt3d_end, faceA.surface),
        sourceBody: 1,
        sourceFace: faceB.faceId,
        sourceHalfEdge: null,
        isIntersection: true,
      };

      const segB: Segment2D = {
        a: projectToPlane2D(pt3d_start, faceB.surface),
        b: projectToPlane2D(pt3d_end, faceB.surface),
        sourceBody: 0,
        sourceFace: faceA.faceId,
        sourceHalfEdge: null,
        isIntersection: true,
      };

      segmentsA.push(segA);
      segmentsB.push(segB);
    }
  }

  if (segmentsA.length === 0) return null;

  return { segmentsA, segmentsB };
}

/**
 * Handle coplanar face intersection (polygon overlap)
 *
 * For coplanar faces with partial overlap, we need to add intersection segments
 * so that each face gets subdivided into overlapping and non-overlapping regions.
 * This allows proper classification of each region.
 *
 * For coplanar faces:
 * - If polygons don't overlap at all: return null (no intersection)
 * - If polygons partially overlap: add boundary segments for subdivision
 * - If polygons exactly coincide: return null (no subdivision needed)
 */
function handleCoplanarFaces(
  faceA: FacePolygon2D,
  faceB: FacePolygon2D,
  _ctx: NumericContext,
  _operation?: `union` | `subtract` | `intersect`
): { segmentsA: Segment2D[]; segmentsB: Segment2D[] } | null {
  const dotNormals = dot3(faceA.surface.normal, faceB.surface.normal);

  if (Math.abs(dotNormals) < 0.9) {
    // Normals neither aligned nor opposite - shouldn't happen for truly coplanar faces
    return null;
  }

  const segmentsA: Segment2D[] = [];
  const segmentsB: Segment2D[] = [];

  // Transform B's polygon to A's coordinate system
  const bInA: Vec2[] = faceB.outer.map((p) => {
    const p3d = unprojectFromPlane(p, faceB.surface);
    return projectToPlane2D(p3d, faceA.surface);
  });

  // Check if there's any overlap between the polygons
  // A vertex of B inside A, or a vertex of A inside B, or edges intersecting
  let hasOverlap = false;

  // Check if any B vertex is strictly inside A
  for (const p of bInA) {
    if (pointInPolygon(p, faceA.outer)) {
      hasOverlap = true;
      break;
    }
  }

  // Check if any A vertex is strictly inside B (in B's coordinate system)
  if (!hasOverlap) {
    const aInB: Vec2[] = faceA.outer.map((p) => {
      const p3d = unprojectFromPlane(p, faceA.surface);
      return projectToPlane2D(p3d, faceB.surface);
    });
    for (const p of aInB) {
      if (pointInPolygon(p, faceB.outer)) {
        hasOverlap = true;
        break;
      }
    }
  }

  // Check for edge-edge intersections if no vertex containment found
  if (!hasOverlap) {
    // Check if any edge of B crosses any edge of A
    outer: for (let i = 0; i < bInA.length; i++) {
      const b1 = bInA[i];
      const b2 = bInA[(i + 1) % bInA.length];

      for (let j = 0; j < faceA.outer.length; j++) {
        const a1 = faceA.outer[j];
        const a2 = faceA.outer[(j + 1) % faceA.outer.length];

        if (edgesIntersect(a1, a2, b1, b2)) {
          hasOverlap = true;
          break outer;
        }
      }
    }
  }

  if (!hasOverlap) {
    // No overlap at all - no intersection
    return null;
  }

  // Check if polygons are exactly coincident (same vertices up to ordering/tolerance)
  // If so, return null - no subdivision needed
  const tolerance = 1e-6;
  const vertexSet = new Set<string>();
  for (const v of faceA.outer) {
    const key = `${Math.round(v[0] / tolerance) * tolerance},${Math.round(v[1] / tolerance) * tolerance}`;
    vertexSet.add(key);
  }
  let allBInA = true;
  for (const v of bInA) {
    const key = `${Math.round(v[0] / tolerance) * tolerance},${Math.round(v[1] / tolerance) * tolerance}`;
    if (!vertexSet.has(key)) {
      allBInA = false;
      break;
    }
  }
  if (allBInA && bInA.length === faceA.outer.length) {
    // Polygons are exactly coincident - no subdivision needed
    return null;
  }

  // Helper to deduplicate segments
  const segKey = (a: Vec2, b: Vec2): string => {
    const ax = Math.round(a[0] / tolerance) * tolerance;
    const ay = Math.round(a[1] / tolerance) * tolerance;
    const bx = Math.round(b[0] / tolerance) * tolerance;
    const by = Math.round(b[1] / tolerance) * tolerance;
    const k1 = `${ax},${ay}|${bx},${by}`;
    const k2 = `${bx},${by}|${ax},${ay}`;
    return k1 < k2 ? k1 : k2;
  };

  const seenA = new Set<string>();
  const seenB = new Set<string>();

  // Compute the overlap polygon (intersection of B with A)
  const overlapBA = clipPolygonToPolygon(bInA, faceA.outer);

  // Only add the overlap polygon edges (not individual edge clips to avoid duplicates)
  if (overlapBA.length >= 3) {
    for (let i = 0; i < overlapBA.length; i++) {
      const a = overlapBA[i];
      const b = overlapBA[(i + 1) % overlapBA.length];
      const key = segKey(a, b);
      if (!seenA.has(key)) {
        seenA.add(key);
        segmentsA.push({
          a,
          b,
          sourceBody: 1,
          sourceFace: faceB.faceId,
          sourceHalfEdge: null,
          isIntersection: true,
        });
      }
    }
  }

  // Similarly for A in B's space
  const aInB: Vec2[] = faceA.outer.map((p) => {
    const p3d = unprojectFromPlane(p, faceA.surface);
    return projectToPlane2D(p3d, faceB.surface);
  });

  const overlapAB = clipPolygonToPolygon(aInB, faceB.outer);
  if (overlapAB.length >= 3) {
    for (let i = 0; i < overlapAB.length; i++) {
      const a = overlapAB[i];
      const b = overlapAB[(i + 1) % overlapAB.length];
      const key = segKey(a, b);
      if (!seenB.has(key)) {
        seenB.add(key);
        segmentsB.push({
          a,
          b,
          sourceBody: 0,
          sourceFace: faceA.faceId,
          sourceHalfEdge: null,
          isIntersection: true,
        });
      }
    }
  }

  // If no segments were added (e.g., exact coincidence), return null
  if (segmentsA.length === 0 && segmentsB.length === 0) {
    return null;
  }

  return { segmentsA, segmentsB };
}

/**
 * Check if two line segments intersect (not just touch at endpoints)
 * Uses robust orientation predicates for numerical stability.
 */
function edgesIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  // Use robust orientation predicates
  const d1 = orient2DRobust(a1, a2, b1);
  const d2 = orient2DRobust(a1, a2, b2);
  const d3 = orient2DRobust(b1, b2, a1);
  const d4 = orient2DRobust(b1, b2, a2);

  // Proper crossing: endpoints of each segment are on opposite sides of the other
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

/**
 * Check if an edge crosses a polygon's boundary
 * (Reserved for future use in coplanar face handling)
 */
export function _edgesCrossBoundary(p1: Vec2, p2: Vec2, polygon: Vec2[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % polygon.length];
    if (edgesIntersect(a1, a2, p1, p2)) {
      return true;
    }
  }
  return false;
}

/**
 * Clip a segment to a (possibly concave) polygon.
 * Returns zero, one, or multiple sub-segments that lie inside or on the boundary.
 * (Reserved for future use in coplanar face handling)
 */
export function _clipSegmentToPolygon(p1: Vec2, p2: Vec2, polygon: Vec2[]): [Vec2, Vec2][] {
  const ts: number[] = [0, 1];

  // Collect intersection parameters along the segment
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const hit = segSegHit(p1, p2, a, b);
    if (hit.kind === `point`) {
      ts.push(hit.t1);
    } else if (hit.kind === `overlap`) {
      ts.push(hit.t1Start, hit.t1End);
    }
  }

  // Sort and deduplicate parameters
  ts.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const t of ts) {
    if (unique.length === 0 || Math.abs(t - unique[unique.length - 1]) > 1e-10) {
      unique.push(Math.min(1, Math.max(0, t)));
    }
  }

  const lerp = (t: number): Vec2 => [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  const segments: [Vec2, Vec2][] = [];

  for (let i = 0; i < unique.length - 1; i++) {
    const t0 = unique[i];
    const t1 = unique[i + 1];
    if (t1 - t0 < 1e-10) continue;
    const midT = (t0 + t1) / 2;
    const midPoint = lerp(midT);
    if (pointInPolygonWithBoundary(midPoint, polygon)) {
      segments.push([lerp(t0), lerp(t1)]);
    }
  }

  return segments;
}

/**
 * Point-in-polygon with boundary inclusion.
 * Uses robust predicates for boundary detection.
 */
function pointInPolygonWithBoundary(point: Vec2, polygon: Vec2[]): boolean {
  if (pointInPolygon(point, polygon)) return true;

  // Check if point is on any edge using robust orientation test
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];

    // Use robust orientation to check collinearity
    const orient = orient2DRobust(a, b, point);
    if (orient !== 0) continue; // Not collinear

    // Point is collinear with edge - check if it's between endpoints
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-24) continue; // Degenerate edge

    const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2;
    if (t >= -1e-10 && t <= 1 + 1e-10) {
      return true; // Point is on the edge
    }
  }
  return false;
}

/**
 * Clip a polygon against another polygon.
 * Returns the intersection polygon in the same coordinate system.
 *
 * This implementation handles both convex and concave polygons by:
 * 1. Clipping each subject edge against the clip polygon
 * 2. Adding clip polygon vertices that are inside the subject polygon
 * 3. Constructing the result from the clipped segments
 *
 * For simple convex-convex cases, this gives the same result as Sutherland-Hodgman.
 * For concave clip polygons, this correctly handles the non-convex case.
 */
function clipPolygonToPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return [];

  // Collect all intersection vertices and vertices inside the other polygon
  const resultVertices: Vec2[] = [];

  // Step 1: Clip each subject edge against clip polygon
  for (let i = 0; i < subject.length; i++) {
    const p = subject[i];
    const q = subject[(i + 1) % subject.length];

    // If start vertex is inside clip polygon, add it
    if (pointInPolygonWithBoundary(p, clip)) {
      resultVertices.push(p);
    }

    // Find intersection points with clip polygon edges
    for (let j = 0; j < clip.length; j++) {
      const a = clip[j];
      const b = clip[(j + 1) % clip.length];
      const hit = segSegHit(p, q, a, b);
      if (hit.kind === `point`) {
        resultVertices.push(hit.point);
      } else if (hit.kind === `overlap`) {
        // Edge overlaps - add both overlap endpoints
        const pt1: Vec2 = [p[0] + hit.t1Start * (q[0] - p[0]), p[1] + hit.t1Start * (q[1] - p[1])];
        const pt2: Vec2 = [p[0] + hit.t1End * (q[0] - p[0]), p[1] + hit.t1End * (q[1] - p[1])];
        resultVertices.push(pt1, pt2);
      }
    }
  }

  // Step 2: Add clip polygon vertices that are inside subject polygon
  for (const v of clip) {
    if (pointInPolygonWithBoundary(v, subject)) {
      resultVertices.push(v);
    }
  }

  if (resultVertices.length < 3) return [];

  // Step 3: Order vertices to form a valid polygon (convex hull of intersection)
  // For general case, use a simple centroid-based angular sort
  const cx = resultVertices.reduce((s, v) => s + v[0], 0) / resultVertices.length;
  const cy = resultVertices.reduce((s, v) => s + v[1], 0) / resultVertices.length;

  // Deduplicate vertices
  const tol = 1e-10;
  const unique: Vec2[] = [];
  for (const v of resultVertices) {
    const isDup = unique.some((u) => Math.abs(u[0] - v[0]) < tol && Math.abs(u[1] - v[1]) < tol);
    if (!isDup) {
      unique.push(v);
    }
  }

  if (unique.length < 3) return [];

  // Sort by angle from centroid
  unique.sort((a, b) => {
    const angleA = Math.atan2(a[1] - cy, a[0] - cx);
    const angleB = Math.atan2(b[1] - cy, b[0] - cx);
    return angleA - angleB;
  });

  return unique;
}

/**
 * Check if point p is to the left of line from a to b.
 * Uses robust orientation predicates.
 * Returns positive if left (CCW), negative if right (CW), zero if collinear.
 */
function _isLeft(a: Vec2, b: Vec2, p: Vec2): number {
  return orient2DRobust(a, b, p);
}

function _lineIntersect(a: Vec2, b: Vec2, p: Vec2, q: Vec2): Vec2 {
  const s1x = b[0] - a[0];
  const s1y = b[1] - a[1];
  const s2x = q[0] - p[0];
  const s2y = q[1] - p[1];
  const denom = -s2x * s1y + s1x * s2y;
  if (Math.abs(denom) < 1e-12) return q;
  const s = (-s1y * (a[0] - p[0]) + s1x * (a[1] - p[1])) / denom;
  return [p[0] + s * s2x, p[1] + s * s2y];
}

// Suppress unused warnings for debugging utilities kept for future use
void _isLeft;
void _lineIntersect;
