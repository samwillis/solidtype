/**
 * Sketch to OCCT Wire Conversion
 *
 * Converts our sketch profiles to OCCT faces for extrusion/revolution.
 */

import { getOC } from "./init.js";
import { Shape } from "./Shape.js";
import type { SketchProfile, ProfileLoop } from "../model/sketchProfile.js";
import type { DatumPlane } from "../model/planes.js";
import type { Vec2 } from "../num/vec2.js";
import type { Vec3 } from "../num/vec3.js";
import type { TopoDS_Wire } from "opencascade.js";
// Type declarations are in ./opencascade.d.ts

/**
 * Convert a SketchProfile to an OCCT Face.
 *
 * The profile contains 2D curves in the sketch plane coordinate system.
 * We need to:
 * 1. Create OCCT 2D curves (lines, arcs)
 * 2. Build a wire from the curves
 * 3. Create a face from the wire
 * 4. The face is automatically in the correct 3D position
 */
export function sketchProfileToFace(profile: SketchProfile): Shape {
  const oc = getOC();

  if (profile.loops.length === 0) {
    throw new Error(`Profile has no loops`);
  }

  // Get the sketch plane transformation
  const plane = profile.plane;
  const origin = plane.surface.origin;
  const xDir = plane.surface.xDir;
  const yDir = plane.surface.yDir;
  const normal = plane.surface.normal;

  // Create the OCCT plane for the face
  const gpOrigin = new oc.gp_Pnt_3(origin[0], origin[1], origin[2]);
  const gpNormal = new oc.gp_Dir_4(normal[0], normal[1], normal[2]);
  const gpXDir = new oc.gp_Dir_4(xDir[0], xDir[1], xDir[2]);
  // gp_Ax3_3 is the 3-param constructor (Point, Normal, XDir)
  // gp_Pln_2 expects gp_Ax3, not gp_Ax2
  const gpAx3 = new oc.gp_Ax3_3(gpOrigin, gpNormal, gpXDir);
  const gpPlane = new oc.gp_Pln_2(gpAx3);

  // Build the outer wire from the first loop
  const outerLoop = profile.loops[0];
  const outerWire = buildWireFromLoop(outerLoop, origin, xDir, yDir);

  // Create face from plane and outer wire
  // _16 = (gp_Pln, TopoDS_Wire, bool) constructor
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_16(gpPlane, outerWire, true);

  // Add inner wires (holes) if present
  for (let i = 1; i < profile.loops.length; i++) {
    const innerLoop = profile.loops[i];
    const innerWire = buildWireFromLoop(innerLoop, origin, xDir, yDir);
    faceBuilder.Add(innerWire);
  }

  const face = faceBuilder.Face();

  // Cleanup
  gpOrigin.delete();
  gpNormal.delete();
  gpXDir.delete();
  gpAx3.delete();
  gpPlane.delete();
  faceBuilder.delete();

  return new Shape(face);
}

/**
 * Build an OCCT wire from a profile loop.
 */
function buildWireFromLoop(loop: ProfileLoop, origin: Vec3, xDir: Vec3, yDir: Vec3): TopoDS_Wire {
  const oc = getOC();
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();

  for (const curve of loop.curves) {
    if (curve.kind === `line`) {
      // Line segment
      const p1_2d = curve.p0;
      const p2_2d = curve.p1;

      const p1 = transformToPlane(p1_2d, origin, xDir, yDir);
      const p2 = transformToPlane(p2_2d, origin, xDir, yDir);

      const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
      const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);

      const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
      if (edgeBuilder.IsDone()) {
        wireBuilder.Add_1(edgeBuilder.Edge());
      }

      gp1.delete();
      gp2.delete();
      edgeBuilder.delete();
    } else if (curve.kind === `arc`) {
      // Arc segment
      const center = curve.center;
      const radius = curve.radius;
      const startAngle = curve.startAngle;
      const endAngle = curve.endAngle;
      const ccw = curve.ccw;

      // Compute 3D center and axis
      const center3D = transformToPlane(center, origin, xDir, yDir);
      const normal = computeNormal(xDir, yDir);

      // Create axis for the arc
      const centerPt = new oc.gp_Pnt_3(center3D[0], center3D[1], center3D[2]);

      // Flip normal if clockwise
      const arcNormal = ccw ? normal : ([-normal[0], -normal[1], -normal[2]] as Vec3);
      const axisDir = new oc.gp_Dir_4(arcNormal[0], arcNormal[1], arcNormal[2]);
      const xAxisDir = new oc.gp_Dir_4(xDir[0], xDir[1], xDir[2]);
      // gp_Ax2_2 is the 3-param constructor (Point, Normal, XDir)
      const axis = new oc.gp_Ax2_2(centerPt, axisDir, xAxisDir);

      // Handle full circle case
      const isFullCircle = Math.abs(endAngle - startAngle) >= 2 * Math.PI - 1e-10;

      if (isFullCircle) {
        // Create a full circle
        const circle = new oc.gp_Circ_2(axis, radius);
        const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_8(circle);
        if (edgeBuilder.IsDone()) {
          wireBuilder.Add_1(edgeBuilder.Edge());
        }
        circle.delete();
        edgeBuilder.delete();
      } else {
        // Create arc from angles
        // Adjust angles if not CCW
        let arcStart = startAngle;
        let arcEnd = endAngle;
        if (!ccw) {
          arcStart = endAngle;
          arcEnd = startAngle;
        }

        const circle = new oc.gp_Circ_2(axis, radius);
        const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_9(circle, arcStart, arcEnd);
        if (edgeBuilder.IsDone()) {
          wireBuilder.Add_1(edgeBuilder.Edge());
        }
        circle.delete();
        edgeBuilder.delete();
      }

      centerPt.delete();
      axisDir.delete();
      xAxisDir.delete();
      axis.delete();
    }
  }

  const wire = wireBuilder.Wire();
  wireBuilder.delete();
  return wire;
}

/**
 * Compute normal from X and Y directions.
 */
function computeNormal(xDir: Vec3, yDir: Vec3): Vec3 {
  return [
    xDir[1] * yDir[2] - xDir[2] * yDir[1],
    xDir[2] * yDir[0] - xDir[0] * yDir[2],
    xDir[0] * yDir[1] - xDir[1] * yDir[0],
  ];
}

/**
 * Create a rectangular face on a datum plane.
 */
export function createRectangleFace(
  plane: DatumPlane,
  width: number,
  height: number,
  centerX: number = 0,
  centerY: number = 0
): Shape {
  const halfW = width / 2;
  const halfH = height / 2;

  const vertices: Vec2[] = [
    [centerX - halfW, centerY - halfH],
    [centerX + halfW, centerY - halfH],
    [centerX + halfW, centerY + halfH],
    [centerX - halfW, centerY + halfH],
  ];

  return createPolygonFace(plane, vertices);
}

/**
 * Create a circular face on a datum plane.
 */
export function createCircleFace(
  plane: DatumPlane,
  radius: number,
  centerX: number = 0,
  centerY: number = 0
): Shape {
  const oc = getOC();

  const origin = plane.surface.origin;
  const normal = plane.surface.normal;
  const xDir = plane.surface.xDir;
  const yDir = plane.surface.yDir;

  // Calculate 3D center point
  const center3D = transformToPlane([centerX, centerY], origin, xDir, yDir);

  // Create axis for the circle (normal to the plane, at center)
  const centerPt = new oc.gp_Pnt_3(center3D[0], center3D[1], center3D[2]);
  const axisDir = new oc.gp_Dir_4(normal[0], normal[1], normal[2]);
  // gp_Ax2_3 is the 2-param constructor (Point, Direction)
  const axis = new oc.gp_Ax2_3(centerPt, axisDir);

  // Create circle
  const circle = new oc.gp_Circ_2(axis, radius);

  // Create edge from circle
  const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_8(circle);
  const edge = edgeBuilder.Edge();

  // Create wire from edge
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_2(edge);
  const wire = wireBuilder.Wire();

  // Create face from wire
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
  const face = faceBuilder.Face();

  // Cleanup
  centerPt.delete();
  axisDir.delete();
  axis.delete();
  circle.delete();
  edgeBuilder.delete();
  wireBuilder.delete();
  faceBuilder.delete();

  return new Shape(face);
}

/**
 * Create a polygonal face from 2D vertices on a datum plane.
 */
export function createPolygonFace(plane: DatumPlane, vertices: Vec2[]): Shape {
  const oc = getOC();

  const origin = plane.surface.origin;
  const xDir = plane.surface.xDir;
  const yDir = plane.surface.yDir;

  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();

  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];

    const p1 = transformToPlane(curr, origin, xDir, yDir);
    const p2 = transformToPlane(next, origin, xDir, yDir);

    const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
    const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);

    const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
    if (edgeBuilder.IsDone()) {
      wireBuilder.Add_1(edgeBuilder.Edge());
    }

    gp1.delete();
    gp2.delete();
    edgeBuilder.delete();
  }

  const wire = wireBuilder.Wire();
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
  const face = faceBuilder.Face();

  wireBuilder.delete();
  faceBuilder.delete();

  return new Shape(face);
}

/**
 * Transform a 2D point on the plane to 3D world coordinates.
 */
function transformToPlane(point2D: Vec2, origin: Vec3, xDir: Vec3, yDir: Vec3): Vec3 {
  return [
    origin[0] + point2D[0] * xDir[0] + point2D[1] * yDir[0],
    origin[1] + point2D[0] * xDir[1] + point2D[1] * yDir[1],
    origin[2] + point2D[0] * xDir[2] + point2D[1] * yDir[2],
  ];
}

/**
 * Get the normal direction from a datum plane.
 */
export function getPlaneNormal(plane: DatumPlane): Vec3 {
  return plane.surface.normal;
}
