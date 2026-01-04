/**
 * Sketch geometry helper functions
 *
 * Pure helper functions for sketch entity calculations, extracted from Viewer.tsx.
 */

import type { SketchLine, SketchArc, SketchCircle, SketchEntity } from "../../types/document";

/** Sketch data in array format for compatibility */
export interface SketchDataArrays {
  points: Array<{ id: string; x: number; y: number }>;
  entities: SketchEntity[];
  constraints: Array<{ id: string; type: string; [key: string]: unknown }>;
}

/**
 * Determine if an arc from start to end should go CCW to pass through a bulge point.
 * All three points (start, end, bulge) are on the arc.
 * Returns true if going CCW from start to end passes through bulge.
 */
export function shouldArcBeCCW(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bulge: { x: number; y: number },
  center: { x: number; y: number }
): boolean {
  // Calculate angles from center to each point
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const bulgeAngle = Math.atan2(bulge.y - center.y, bulge.x - center.x);

  // Normalize angles to [0, 2π)
  const normalize = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sA = normalize(startAngle);
  const eA = normalize(endAngle);
  const bA = normalize(bulgeAngle);

  // Check if bulge is between start and end going CCW (increasing angle)
  // CCW sweep from start: start → bulge → end
  const ccwSweepToBulge = normalize(bA - sA);
  const ccwSweepToEnd = normalize(eA - sA);

  // If bulge is encountered before end when going CCW, use CCW
  // (bulge angle from start < end angle from start, both in CCW direction)
  return ccwSweepToBulge < ccwSweepToEnd;
}

/**
 * Determine if an arc from start to end around center should go CCW.
 * For centerpoint arcs: the end point determines direction.
 * Returns true if going CCW from start reaches end via the shorter arc.
 */
export function shouldCenterpointArcBeCCW(
  center: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
): boolean {
  // Calculate angles from center
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

  // Calculate sweep in CCW direction (positive angle)
  let ccwSweep = endAngle - startAngle;
  if (ccwSweep <= 0) ccwSweep += 2 * Math.PI;

  // Calculate sweep in CW direction (negative angle, made positive)
  const cwSweep = 2 * Math.PI - ccwSweep;

  // Use the direction with the shorter sweep
  // This is the intuitive behavior: the arc goes the "short way" to the end point
  return ccwSweep <= cwSweep;
}

/**
 * Calculate squared distance from a point to a line segment.
 */
export function pointSegmentDistanceSquared(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 === 0) return apx * apx + apy * apy;

  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return dx * dx + dy * dy;
}

/**
 * Find a nearby line in a sketch within tolerance.
 */
export function findNearbyLineInSketch(
  sketch: SketchDataArrays,
  x: number,
  y: number,
  tolerance: number
): SketchLine | null {
  let best: { line: SketchLine; dist2: number } | null = null;

  const p: [number, number] = [x, y];
  for (const entity of sketch.entities) {
    if (entity.type !== "line") continue;
    const line = entity as SketchLine;
    const a = sketch.points.find((pt) => pt.id === line.start);
    const b = sketch.points.find((pt) => pt.id === line.end);
    if (!a || !b) continue;

    const d2 = pointSegmentDistanceSquared(p, [a.x, a.y], [b.x, b.y]);
    if (d2 <= tolerance * tolerance) {
      if (!best || d2 < best.dist2) {
        best = { line, dist2: d2 };
      }
    }
  }

  return best ? best.line : null;
}

/**
 * Result of finding the nearest entity to a point
 */
export interface NearestEntityResult {
  entity: SketchEntity;
  closestPoint: { x: number; y: number };
  distance: number;
}

/**
 * Find the nearest entity (line, arc, or circle) to a given point.
 * Returns the entity, the closest point on it, and the distance.
 */
export function findNearestEntityInSketch(
  sketch: SketchDataArrays,
  x: number,
  y: number,
  tolerance: number
): NearestEntityResult | null {
  let best: NearestEntityResult | null = null;

  for (const entity of sketch.entities) {
    if (entity.type === "line") {
      const line = entity as SketchLine;
      const a = sketch.points.find((pt) => pt.id === line.start);
      const b = sketch.points.find((pt) => pt.id === line.end);
      if (!a || !b) continue;

      // Find closest point on line segment
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = x - a.x;
      const apy = y - a.y;
      const abLen2 = abx * abx + aby * aby;

      let closest: { x: number; y: number };
      if (abLen2 === 0) {
        closest = { x: a.x, y: a.y };
      } else {
        let t = (apx * abx + apy * aby) / abLen2;
        t = Math.max(0, Math.min(1, t));
        closest = { x: a.x + t * abx, y: a.y + t * aby };
      }

      const dx = x - closest.x;
      const dy = y - closest.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= tolerance && (!best || dist < best.distance)) {
        best = { entity, closestPoint: closest, distance: dist };
      }
    } else if (entity.type === "arc") {
      const arc = entity as SketchArc;
      const center = sketch.points.find((pt) => pt.id === arc.center);
      const start = sketch.points.find((pt) => pt.id === arc.start);
      if (!center || !start) continue;

      const radius = Math.hypot(start.x - center.x, start.y - center.y);
      if (radius < 0.001) continue;

      // Find closest point on circle (radial projection from center)
      const dx = x - center.x;
      const dy = y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) continue; // Point is at center, can't project

      const closest = {
        x: center.x + (dx / dist) * radius,
        y: center.y + (dy / dist) * radius,
      };

      // Check if closest point is within arc bounds
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const end = sketch.points.find((pt) => pt.id === arc.end);
      if (!end) continue;
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      const closestAngle = Math.atan2(closest.y - center.y, closest.x - center.x);

      // Check if closestAngle is between startAngle and endAngle (respecting ccw)
      const normalize = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const sA = normalize(startAngle);
      const eA = normalize(endAngle);
      const cA = normalize(closestAngle);

      let isOnArc = false;
      if (arc.ccw) {
        // CCW: sweep from start to end going counterclockwise
        const sweep = normalize(eA - sA);
        const toClosest = normalize(cA - sA);
        isOnArc = toClosest <= sweep;
      } else {
        // CW: sweep from start to end going clockwise (negative direction)
        const sweep = normalize(sA - eA);
        const toClosest = normalize(sA - cA);
        isOnArc = toClosest <= sweep;
      }

      if (!isOnArc) continue;

      const distToArc = Math.abs(dist - radius);
      if (distToArc <= tolerance && (!best || distToArc < best.distance)) {
        best = { entity, closestPoint: closest, distance: distToArc };
      }
    } else if (entity.type === "circle") {
      const circle = entity as SketchCircle;
      const center = sketch.points.find((pt) => pt.id === circle.center);
      if (!center) continue;

      const radius = circle.radius;
      if (radius < 0.001) continue;

      // Find closest point on circle
      const dx = x - center.x;
      const dy = y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) continue; // Point is at center

      const closest = {
        x: center.x + (dx / dist) * radius,
        y: center.y + (dy / dist) * radius,
      };

      const distToCircle = Math.abs(dist - radius);
      if (distToCircle <= tolerance && (!best || distToCircle < best.distance)) {
        best = { entity, closestPoint: closest, distance: distToCircle };
      }
    }
  }

  return best;
}

/**
 * Check if a line segment intersects a box (for box selection).
 * Uses Cohen-Sutherland line clipping algorithm.
 */
export function lineIntersectsBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): boolean {
  // Cohen-Sutherland line clipping algorithm outcode
  const INSIDE = 0;
  const LEFT = 1;
  const RIGHT = 2;
  const BOTTOM = 4;
  const TOP = 8;

  const computeOutCode = (x: number, y: number): number => {
    let code = INSIDE;
    if (x < minX) code |= LEFT;
    else if (x > maxX) code |= RIGHT;
    if (y < minY) code |= BOTTOM;
    else if (y > maxY) code |= TOP;
    return code;
  };

  let x0 = start.x,
    y0 = start.y,
    x1 = end.x,
    y1 = end.y;
  let outcode0 = computeOutCode(x0, y0);
  let outcode1 = computeOutCode(x1, y1);

  while (true) {
    if (!(outcode0 | outcode1)) {
      // Both points inside
      return true;
    } else if (outcode0 & outcode1) {
      // Both points share an outside zone - no intersection
      return false;
    } else {
      // At least one endpoint is outside - clip to box edge
      const outcodeOut = outcode0 !== 0 ? outcode0 : outcode1;
      let x = 0,
        y = 0;

      if (outcodeOut & TOP) {
        x = x0 + ((x1 - x0) * (maxY - y0)) / (y1 - y0);
        y = maxY;
      } else if (outcodeOut & BOTTOM) {
        x = x0 + ((x1 - x0) * (minY - y0)) / (y1 - y0);
        y = minY;
      } else if (outcodeOut & RIGHT) {
        y = y0 + ((y1 - y0) * (maxX - x0)) / (x1 - x0);
        x = maxX;
      } else if (outcodeOut & LEFT) {
        y = y0 + ((y1 - y0) * (minX - x0)) / (x1 - x0);
        x = minX;
      }

      if (outcodeOut === outcode0) {
        x0 = x;
        y0 = y;
        outcode0 = computeOutCode(x0, y0);
      } else {
        x1 = x;
        y1 = y;
        outcode1 = computeOutCode(x1, y1);
      }
    }
  }
}
