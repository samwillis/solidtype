/**
 * Primitive Shape Creation
 *
 * Creates basic 3D shapes using OCCT's BRepPrimAPI.
 */

import { getOC } from "./init.js";
import { Shape } from "./Shape.js";

/**
 * Create a box centered at origin or at a corner.
 */
export function makeBox(width: number, height: number, depth: number, centered = false): Shape {
  const oc = getOC();

  if (centered) {
    const halfW = width / 2; // X
    const halfH = height / 2; // Y
    const halfD = depth / 2; // Z
    // Points are (X, Y, Z)
    const corner1 = new oc.gp_Pnt_3(-halfW, -halfH, -halfD);
    const corner2 = new oc.gp_Pnt_3(halfW, halfH, halfD);
    // _3 = 2 params (P1, P2)
    const box = new oc.BRepPrimAPI_MakeBox_3(corner1, corner2);
    const shape = new Shape(box.Shape());
    corner1.delete();
    corner2.delete();
    box.delete();
    return shape;
  }

  // _1 = 3 params (dx, dy, dz) - maps to (width, height, depth) = (X, Y, Z)
  const box = new oc.BRepPrimAPI_MakeBox_1(width, height, depth);
  const shape = new Shape(box.Shape());
  box.delete();
  return shape;
}

/**
 * Create a cylinder along Z axis.
 */
export function makeCylinder(radius: number, height: number): Shape {
  const oc = getOC();
  const cyl = new oc.BRepPrimAPI_MakeCylinder_1(radius, height);
  const shape = new Shape(cyl.Shape());
  cyl.delete();
  return shape;
}

/**
 * Create a sphere at origin.
 */
export function makeSphere(radius: number): Shape {
  const oc = getOC();
  const sphere = new oc.BRepPrimAPI_MakeSphere_1(radius);
  const shape = new Shape(sphere.Shape());
  sphere.delete();
  return shape;
}

/**
 * Create a cone along Z axis.
 */
export function makeCone(radiusBottom: number, radiusTop: number, height: number): Shape {
  const oc = getOC();
  const cone = new oc.BRepPrimAPI_MakeCone_1(radiusBottom, radiusTop, height);
  const shape = new Shape(cone.Shape());
  cone.delete();
  return shape;
}

/**
 * Create a torus at origin.
 */
export function makeTorus(majorRadius: number, minorRadius: number): Shape {
  const oc = getOC();
  const torus = new oc.BRepPrimAPI_MakeTorus_1(majorRadius, minorRadius);
  const shape = new Shape(torus.Shape());
  torus.delete();
  return shape;
}
