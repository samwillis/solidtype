/**
 * P-curve generation helpers for modeling operations
 *
 * Provides functions to compute p-curves (2D curves in UV space) for
 * common edge/surface combinations created by extrude, revolve, etc.
 */

import type { Vec2 } from "../num/vec2.js";
import type { Vec3 } from "../num/vec3.js";
import { vec2 } from "../num/vec2.js";
import { normalize3 } from "../num/vec3.js";
import type { PlaneSurface, CylinderSurface } from "../geom/surface.js";
import type { Line2D, Arc2D } from "../geom/curve2d.js";
import type { Line3D, Circle3D } from "../geom/curve3d.js";
import { TopoModel } from "../topo/TopoModel.js";
import type { HalfEdgeId, SurfaceIndex, PCurveIndex, Curve3DIndex } from "../topo/handles.js";
import { surfacePointToUV } from "../geom/surfaceUv.js";

/**
 * Create a line p-curve on a plane surface
 *
 * Given a 3D line edge lying on a plane, compute the 2D line in UV space.
 */
export function createLinePCurveOnPlane(
  model: TopoModel,
  p0: Vec3,
  p1: Vec3,
  plane: PlaneSurface,
  surfaceIndex: SurfaceIndex
): PCurveIndex {
  // Project endpoints to UV
  const uv0 = surfacePointToUV(plane, p0);
  const uv1 = surfacePointToUV(plane, p1);

  // Create 2D line
  const line2d: Line2D = {
    kind: `line`,
    p0: uv0,
    p1: uv1,
  };

  const curve2dIndex = model.addCurve2D(line2d);
  return model.addPCurve(curve2dIndex, surfaceIndex);
}

/**
 * Create a vertical line p-curve on a cylinder surface
 *
 * For an extrude side edge (vertical line on cylinder at constant angle)
 */
export function createVerticalLinePCurveOnCylinder(
  model: TopoModel,
  p0: Vec3,
  p1: Vec3,
  cylinder: CylinderSurface,
  surfaceIndex: SurfaceIndex
): PCurveIndex {
  // Project endpoints to UV
  const uv0 = surfacePointToUV(cylinder, p0);
  const uv1 = surfacePointToUV(cylinder, p1);

  // The v coordinate (angle) should be the same for vertical lines
  // Use a line from (u0, v) to (u1, v) where v is the angle
  const line2d: Line2D = {
    kind: `line`,
    p0: uv0,
    p1: uv1,
  };

  const curve2dIndex = model.addCurve2D(line2d);
  return model.addPCurve(curve2dIndex, surfaceIndex);
}

/**
 * Create a horizontal arc p-curve on a cylinder surface
 *
 * For a circular edge at the top or bottom of an extruded arc
 */
export function createHorizontalArcPCurveOnCylinder(
  model: TopoModel,
  arc: Arc2D,
  uHeight: number,
  _cylinder: CylinderSurface,
  surfaceIndex: SurfaceIndex
): PCurveIndex {
  // On a cylinder, a circular arc at constant height becomes a line segment in UV space
  // u is constant (height), v varies from startAngle to endAngle

  // Get the angles - need to map from the arc's 2D angles to cylinder's angular parameter
  // This depends on how the cylinder is oriented relative to the sketch plane

  // For now, use a line in UV space from (u, v0) to (u, v1)
  // where v0 and v1 are computed from the arc endpoints
  const p0_2d = [
    arc.center[0] + arc.radius * Math.cos(arc.startAngle),
    arc.center[1] + arc.radius * Math.sin(arc.startAngle),
  ] as Vec2;
  const p1_2d = [
    arc.center[0] + arc.radius * Math.cos(arc.endAngle),
    arc.center[1] + arc.radius * Math.sin(arc.endAngle),
  ] as Vec2;

  const line2d: Line2D = {
    kind: `line`,
    p0: vec2(uHeight, arc.startAngle),
    p1: vec2(uHeight, arc.endAngle),
  };

  void p0_2d;
  void p1_2d; // Suppress unused warnings

  const curve2dIndex = model.addCurve2D(line2d);
  return model.addPCurve(curve2dIndex, surfaceIndex);
}

/**
 * Create an analytic 3D line curve for an edge
 */
export function createLine3DCurve(model: TopoModel, p0: Vec3, p1: Vec3): Curve3DIndex {
  const line: Line3D = {
    kind: `line`,
    p0,
    p1,
  };
  return model.addCurve3D(line);
}

/**
 * Create an analytic 3D circle curve for an edge
 */
export function createCircle3DCurve(
  model: TopoModel,
  center: Vec3,
  radius: number,
  normal: Vec3,
  uDir?: Vec3
): Curve3DIndex {
  const circle: Circle3D = {
    kind: `circle`,
    center,
    radius,
    normal: normalize3(normal),
    uDir,
  };
  return model.addCurve3D(circle);
}

/**
 * Set p-curve for a half-edge, computing it from surface and edge geometry
 *
 * This is a convenience function that computes the appropriate p-curve
 * based on the surface and edge types.
 */
export function computeAndSetPCurve(
  model: TopoModel,
  halfEdgeId: HalfEdgeId,
  surfaceIndex: SurfaceIndex
): PCurveIndex | null {
  const surface = model.getSurface(surfaceIndex);
  const direction = model.getHalfEdgeDirection(halfEdgeId);

  // Get edge endpoints (in half-edge order)
  const startVertex = model.getHalfEdgeStartVertex(halfEdgeId);
  const endVertex = model.getHalfEdgeEndVertex(halfEdgeId);
  const p0 = model.getVertexPosition(startVertex);
  const p1 = model.getVertexPosition(endVertex);

  // Compute UV coordinates
  const uv0 = surfacePointToUV(surface, p0);
  const uv1 = surfacePointToUV(surface, p1);

  // Unwrap for periodic surfaces (avoid crossing seams)
  let uv1Unwrapped = uv1;
  if (surface.kind === `cylinder` || surface.kind === `cone` || surface.kind === `torus`) {
    // Unwrap v (angle)
    let v1 = uv1[1];
    while (v1 - uv0[1] > Math.PI) v1 -= 2 * Math.PI;
    while (v1 - uv0[1] < -Math.PI) v1 += 2 * Math.PI;
    uv1Unwrapped = vec2(uv1[0], v1);
  }
  if (surface.kind === `sphere`) {
    // Unwrap v (azimuthal angle)
    let v1 = uv1[1];
    while (v1 - uv0[1] > Math.PI) v1 -= 2 * Math.PI;
    while (v1 - uv0[1] < -Math.PI) v1 += 2 * Math.PI;
    uv1Unwrapped = vec2(uv1[0], v1);
  }

  // Create a line p-curve (works for straight edges, approximation for curved)
  const line2d: Line2D = {
    kind: `line`,
    p0: uv0,
    p1: uv1Unwrapped,
  };

  void direction; // Direction affects interpretation, but line geometry is same

  const curve2dIndex = model.addCurve2D(line2d);
  const pcurveIndex = model.addPCurve(curve2dIndex, surfaceIndex);

  model.setHalfEdgePCurve(halfEdgeId, pcurveIndex);
  return pcurveIndex;
}

/**
 * Compute and set p-curves for all half-edges in a face
 */
export function computeFacePCurves(
  model: TopoModel,
  loops: readonly import(`../topo/handles.js`).LoopId[],
  surfaceIndex: SurfaceIndex
): void {
  for (const loopId of loops) {
    for (const halfEdgeId of model.iterateLoopHalfEdges(loopId)) {
      computeAndSetPCurve(model, halfEdgeId, surfaceIndex);
    }
  }
}
