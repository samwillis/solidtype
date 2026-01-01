/**
 * Direction-aware curve sampling
 *
 * Samples curves respecting half-edge direction for consistent tessellation.
 * Supports both 2D p-curves (for UV trimming) and 3D edge curves.
 */

import type { Vec2 } from "../num/vec2.js";
import type { Vec3 } from "../num/vec3.js";
import type { Curve2D, Arc2D } from "../geom/curve2d.js";
import type { Curve3D, Circle3D } from "../geom/curve3d.js";
import { evalCurve2D } from "../geom/curve2d.js";
import { evalCurve3D } from "../geom/curve3d.js";

/**
 * Sampling options
 */
export interface SampleCurveOptions {
  /** Minimum number of segments for lines */
  minSegments?: number;
  /** Minimum segments for arcs/circles */
  minArcSegments?: number;
  /** Maximum segments */
  maxSegments?: number;
  /** Target angle per segment for arcs (radians) */
  arcAngleStep?: number;
}

const DEFAULT_OPTIONS: Required<SampleCurveOptions> = {
  minSegments: 1,
  minArcSegments: 12,
  maxSegments: 64,
  arcAngleStep: Math.PI / 18, // ~10 degrees
};

/**
 * Sample a 2D curve, respecting direction
 *
 * @param curve The 2D curve to sample
 * @param direction +1 for forward (t: 0→1), -1 for reverse (t: 1→0)
 * @param options Sampling options
 * @returns Array of sampled 2D points
 */
export function sampleCurve2D(
  curve: Curve2D,
  direction: 1 | -1 = 1,
  options?: SampleCurveOptions
): Vec2[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const segments = computeSegmentCount(curve, opts);

  const points: Vec2[] = [];

  if (direction === 1) {
    // Forward: sample from t=0 to t=1
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(evalCurve2D(curve, t));
    }
  } else {
    // Reverse: sample from t=1 to t=0
    for (let i = 0; i <= segments; i++) {
      const t = 1 - i / segments;
      points.push(evalCurve2D(curve, t));
    }
  }

  return points;
}

/**
 * Sample a 3D curve, respecting direction
 *
 * @param curve The 3D curve to sample
 * @param direction +1 for forward (t: 0→1), -1 for reverse (t: 1→0)
 * @param options Sampling options
 * @returns Array of sampled 3D points
 */
export function sampleCurve3D(
  curve: Curve3D,
  direction: 1 | -1 = 1,
  options?: SampleCurveOptions
): Vec3[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const segments = computeSegmentCount3D(curve, opts);

  const points: Vec3[] = [];

  if (direction === 1) {
    // Forward: sample from t=0 to t=1
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(evalCurve3D(curve, t));
    }
  } else {
    // Reverse: sample from t=1 to t=0
    for (let i = 0; i <= segments; i++) {
      const t = 1 - i / segments;
      points.push(evalCurve3D(curve, t));
    }
  }

  return points;
}

/**
 * Sample a 2D curve to an array of t values
 * Useful for synchronized sampling of p-curve and edge curve
 */
export function sampleCurve2DParams(
  curve: Curve2D,
  direction: 1 | -1 = 1,
  options?: SampleCurveOptions
): number[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const segments = computeSegmentCount(curve, opts);

  const params: number[] = [];

  if (direction === 1) {
    for (let i = 0; i <= segments; i++) {
      params.push(i / segments);
    }
  } else {
    for (let i = 0; i <= segments; i++) {
      params.push(1 - i / segments);
    }
  }

  return params;
}

/**
 * Sample a 3D curve to an array of t values
 */
export function sampleCurve3DParams(
  curve: Curve3D,
  direction: 1 | -1 = 1,
  options?: SampleCurveOptions
): number[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const segments = computeSegmentCount3D(curve, opts);

  const params: number[] = [];

  if (direction === 1) {
    for (let i = 0; i <= segments; i++) {
      params.push(i / segments);
    }
  } else {
    for (let i = 0; i <= segments; i++) {
      params.push(1 - i / segments);
    }
  }

  return params;
}

/**
 * Compute number of segments for a 2D curve
 */
function computeSegmentCount(curve: Curve2D, opts: Required<SampleCurveOptions>): number {
  if (curve.kind === `line`) {
    return opts.minSegments;
  }

  if (curve.kind === `arc`) {
    const span = arcAngleSpan(curve);
    const byAngle = Math.ceil(span / opts.arcAngleStep);
    return Math.min(opts.maxSegments, Math.max(opts.minArcSegments, byAngle));
  }

  if (curve.kind === `polyline`) {
    // For polylines, sample at each vertex
    return Math.max(opts.minSegments, curve.pts.length - 1);
  }

  return opts.minSegments;
}

/**
 * Compute number of segments for a 3D curve
 */
function computeSegmentCount3D(curve: Curve3D, opts: Required<SampleCurveOptions>): number {
  if (curve.kind === `line`) {
    return opts.minSegments;
  }

  if (curve.kind === `circle`) {
    const span = circleAngleSpan(curve);
    const byAngle = Math.ceil(span / opts.arcAngleStep);
    return Math.min(opts.maxSegments, Math.max(opts.minArcSegments, byAngle));
  }

  if (curve.kind === `polyline`) {
    // For polylines, sample at each vertex
    return Math.max(opts.minSegments, curve.pts.length - 1);
  }

  return opts.minSegments;
}

/**
 * Get angle span for 2D arc
 */
function arcAngleSpan(arc: Arc2D): number {
  let span: number;
  if (arc.ccw) {
    span = arc.endAngle - arc.startAngle;
    if (span < 0) span += 2 * Math.PI;
  } else {
    span = arc.startAngle - arc.endAngle;
    if (span < 0) span += 2 * Math.PI;
  }
  return span;
}

/**
 * Get angle span for 3D circle (full circle by default)
 */
function circleAngleSpan(_circle: Circle3D): number {
  // Full circle in our parameterization
  return 2 * Math.PI;
}
