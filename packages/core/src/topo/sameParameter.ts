/**
 * SameParameter validation
 *
 * SameParameter is a B-Rep discipline ensuring that at any parameter t ∈ [0,1]:
 * - edge_curve(t) ≈ surface(pcurve(t))
 *
 * This module provides validation and verification functions for this discipline.
 */

import type { TopoModel, PCurve } from "./TopoModel.js";
import type { HalfEdgeId, FaceId, LoopId } from "./handles.js";
import { NULL_ID, isNullId } from "./handles.js";
import type { Vec3 } from "../num/vec3.js";
import type { NumericContext } from "../num/tolerance.js";
import { dist3 } from "../num/vec3.js";
import { evalCurve3D } from "../geom/curve3d.js";
import { evalCurve2D } from "../geom/curve2d.js";
import { evalSurface } from "../geom/surface.js";

/**
 * Result of SameParameter validation
 */
export interface SameParameterResult {
  valid: boolean;
  maxDeviation: number;
  deviationAt: number; // parameter t where max deviation occurs
  sampleCount: number;
  errors: SameParameterError[];
}

/**
 * A SameParameter violation
 */
export interface SameParameterError {
  halfEdgeId: HalfEdgeId;
  t: number;
  edgePoint: Vec3;
  surfacePoint: Vec3;
  deviation: number;
}

/**
 * Options for SameParameter validation
 */
export interface SameParameterOptions {
  /** Number of sample points along the curve */
  sampleCount?: number;
  /** Maximum allowed deviation (default: use NumericContext tolerance) */
  maxDeviation?: number;
  /** Stop on first error */
  stopOnFirst?: boolean;
}

const DEFAULT_SAMPLE_COUNT = 10;

/**
 * Validate SameParameter for a single half-edge
 *
 * Checks that edge_curve(t) ≈ surface(pcurve(t)) at sample points
 *
 * @param model The TopoModel
 * @param halfEdgeId The half-edge to validate
 * @param ctx Numeric context for tolerance
 * @param options Validation options
 * @returns Validation result
 */
export function validateHalfEdgeSameParameter(
  model: TopoModel,
  halfEdgeId: HalfEdgeId,
  ctx: NumericContext,
  options?: SameParameterOptions
): SameParameterResult {
  const sampleCount = options?.sampleCount ?? DEFAULT_SAMPLE_COUNT;
  const maxAllowed = options?.maxDeviation ?? ctx.tol.length;
  const stopOnFirst = options?.stopOnFirst ?? false;

  const result: SameParameterResult = {
    valid: true,
    maxDeviation: 0,
    deviationAt: 0,
    sampleCount,
    errors: [],
  };

  // Get p-curve for this half-edge
  const pcurveIdx = model.getHalfEdgePCurve(halfEdgeId);
  if (pcurveIdx === NULL_ID) {
    // No p-curve - skip validation (may be valid for certain edge types)
    return result;
  }

  const pcurve = model.getPCurve(pcurveIdx);
  const curve2d = model.getCurve2D(pcurve.curve2dIndex);
  const surface = model.getSurface(pcurve.surfaceIndex);

  // Get edge curve
  const edgeId = model.getHalfEdgeEdge(halfEdgeId);
  const curveIdx = model.getEdgeCurveIndex(edgeId);

  if (curveIdx === NULL_ID) {
    // No edge curve - use vertex interpolation (linear edges)
    return validateLinearEdgeSameParameter(
      model,
      halfEdgeId,
      pcurve,
      sampleCount,
      maxAllowed,
      stopOnFirst
    );
  }

  const edgeCurve = model.getCurve3D(curveIdx);
  const direction = model.getHalfEdgeDirection(halfEdgeId);
  const tStart = model.getEdgeTStart(edgeId);
  const tEnd = model.getEdgeTEnd(edgeId);

  // Sample along the curve
  for (let i = 0; i <= sampleCount; i++) {
    const s = i / sampleCount; // parameter along half-edge [0,1]

    // Map s to edge curve parameter, accounting for direction
    let tEdge: number;
    if (direction === 1) {
      tEdge = tStart + s * (tEnd - tStart);
    } else {
      tEdge = tEnd - s * (tEnd - tStart);
    }

    // Evaluate edge curve (normalize t to [0,1] for curve evaluation)
    const edgePoint = evalCurve3D(edgeCurve, tEdge);

    // Evaluate p-curve then surface
    const uv = evalCurve2D(curve2d, s);
    const surfacePoint = evalSurface(surface, uv[0], uv[1]);

    // Compute deviation
    const deviation = dist3(edgePoint, surfacePoint);

    if (deviation > result.maxDeviation) {
      result.maxDeviation = deviation;
      result.deviationAt = s;
    }

    if (deviation > maxAllowed) {
      result.valid = false;
      result.errors.push({
        halfEdgeId,
        t: s,
        edgePoint,
        surfacePoint,
        deviation,
      });

      if (stopOnFirst) {
        return result;
      }
    }
  }

  return result;
}

/**
 * Validate SameParameter for a linear edge (no explicit curve)
 */
function validateLinearEdgeSameParameter(
  model: TopoModel,
  halfEdgeId: HalfEdgeId,
  pcurve: PCurve,
  sampleCount: number,
  maxAllowed: number,
  stopOnFirst: boolean
): SameParameterResult {
  const result: SameParameterResult = {
    valid: true,
    maxDeviation: 0,
    deviationAt: 0,
    sampleCount,
    errors: [],
  };

  const curve2d = model.getCurve2D(pcurve.curve2dIndex);
  const surface = model.getSurface(pcurve.surfaceIndex);

  // Get start and end vertices
  const startVertex = model.getHalfEdgeStartVertex(halfEdgeId);
  const endVertex = model.getHalfEdgeEndVertex(halfEdgeId);
  const p0 = model.getVertexPosition(startVertex);
  const p1 = model.getVertexPosition(endVertex);

  // Sample along the edge
  for (let i = 0; i <= sampleCount; i++) {
    const s = i / sampleCount;

    // Linear interpolation between vertices
    const edgePoint: Vec3 = [
      p0[0] + s * (p1[0] - p0[0]),
      p0[1] + s * (p1[1] - p0[1]),
      p0[2] + s * (p1[2] - p0[2]),
    ];

    // Evaluate p-curve then surface
    const uv = evalCurve2D(curve2d, s);
    const surfacePoint = evalSurface(surface, uv[0], uv[1]);

    // Compute deviation
    const deviation = dist3(edgePoint, surfacePoint);

    if (deviation > result.maxDeviation) {
      result.maxDeviation = deviation;
      result.deviationAt = s;
    }

    if (deviation > maxAllowed) {
      result.valid = false;
      result.errors.push({
        halfEdgeId,
        t: s,
        edgePoint,
        surfacePoint,
        deviation,
      });

      if (stopOnFirst) {
        return result;
      }
    }
  }

  return result;
}

/**
 * Validate SameParameter for all half-edges in a loop
 */
export function validateLoopSameParameter(
  model: TopoModel,
  loopId: LoopId,
  ctx: NumericContext,
  options?: SameParameterOptions
): SameParameterResult {
  const result: SameParameterResult = {
    valid: true,
    maxDeviation: 0,
    deviationAt: 0,
    sampleCount: 0,
    errors: [],
  };

  const stopOnFirst = options?.stopOnFirst ?? false;

  for (const halfEdgeId of model.iterateLoopHalfEdges(loopId)) {
    const heResult = validateHalfEdgeSameParameter(model, halfEdgeId, ctx, options);

    result.sampleCount += heResult.sampleCount;

    if (heResult.maxDeviation > result.maxDeviation) {
      result.maxDeviation = heResult.maxDeviation;
      result.deviationAt = heResult.deviationAt;
    }

    if (!heResult.valid) {
      result.valid = false;
      result.errors.push(...heResult.errors);

      if (stopOnFirst) {
        return result;
      }
    }
  }

  return result;
}

/**
 * Validate SameParameter for all half-edges in a face
 */
export function validateFaceSameParameter(
  model: TopoModel,
  faceId: FaceId,
  ctx: NumericContext,
  options?: SameParameterOptions
): SameParameterResult {
  const result: SameParameterResult = {
    valid: true,
    maxDeviation: 0,
    deviationAt: 0,
    sampleCount: 0,
    errors: [],
  };

  const stopOnFirst = options?.stopOnFirst ?? false;

  for (const loopId of model.iterateFaceLoops(faceId)) {
    const loopResult = validateLoopSameParameter(model, loopId, ctx, options);

    result.sampleCount += loopResult.sampleCount;

    if (loopResult.maxDeviation > result.maxDeviation) {
      result.maxDeviation = loopResult.maxDeviation;
      result.deviationAt = loopResult.deviationAt;
    }

    if (!loopResult.valid) {
      result.valid = false;
      result.errors.push(...loopResult.errors);

      if (stopOnFirst) {
        return result;
      }
    }
  }

  return result;
}

/**
 * Validate SameParameter for all half-edges in the model
 */
export function validateModelSameParameter(
  model: TopoModel,
  ctx: NumericContext,
  options?: SameParameterOptions
): SameParameterResult {
  const result: SameParameterResult = {
    valid: true,
    maxDeviation: 0,
    deviationAt: 0,
    sampleCount: 0,
    errors: [],
  };

  const stopOnFirst = options?.stopOnFirst ?? false;

  for (const bodyId of model.iterateBodies()) {
    for (const shellId of model.iterateBodyShells(bodyId)) {
      for (const faceId of model.iterateShellFaces(shellId)) {
        const faceResult = validateFaceSameParameter(model, faceId, ctx, options);

        result.sampleCount += faceResult.sampleCount;

        if (faceResult.maxDeviation > result.maxDeviation) {
          result.maxDeviation = faceResult.maxDeviation;
          result.deviationAt = faceResult.deviationAt;
        }

        if (!faceResult.valid) {
          result.valid = false;
          result.errors.push(...faceResult.errors);

          if (stopOnFirst) {
            return result;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Check if a half-edge has a valid p-curve assigned
 */
export function hasPCurve(model: TopoModel, halfEdgeId: HalfEdgeId): boolean {
  const pcurveIdx = model.getHalfEdgePCurve(halfEdgeId);
  return pcurveIdx !== NULL_ID && !isNullId(pcurveIdx);
}

/**
 * Check if all half-edges in a loop have p-curves
 */
export function loopHasAllPCurves(model: TopoModel, loopId: LoopId): boolean {
  for (const halfEdgeId of model.iterateLoopHalfEdges(loopId)) {
    if (!hasPCurve(model, halfEdgeId)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if all half-edges in a face have p-curves
 */
export function faceHasAllPCurves(model: TopoModel, faceId: FaceId): boolean {
  for (const loopId of model.iterateFaceLoops(faceId)) {
    if (!loopHasAllPCurves(model, loopId)) {
      return false;
    }
  }
  return true;
}
