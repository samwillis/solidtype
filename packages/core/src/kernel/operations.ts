/**
 * OCCT Operations
 *
 * Boolean operations, extrude, revolve, fillet, chamfer.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8 - OCCT history integration
 */

import { getOC } from "./init.js";
import { Shape } from "./Shape.js";
import type { TopoDS_Shape, TopoDS_Edge, TopoDS_Face } from "opencascade.js";
// Type declarations are in ./opencascade.d.ts

export type BooleanOp = `union` | `subtract` | `intersect`;

/**
 * Generated face info from OCCT operation history.
 * Captures the relationship between input profile edges and generated solid faces.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8.1
 */
export interface GeneratedFaceInfo {
  /** The generated face as a TopoDS_Shape reference (caller must not dispose) */
  face: TopoDS_Face;
  /** Index of the face in the result shape (for mesh mapping) */
  faceIndex: number;
  /** Which part of the extrude this face is: topCap, bottomCap, or side */
  role: "topCap" | "bottomCap" | "side";
}

/**
 * Extended extrusion result with OCCT history info.
 */
export interface ExtrudeWithHistoryResult {
  shape: Shape;
  /** First shape (bottom cap of extrude) */
  firstShape?: Shape;
  /** Last shape (top cap of extrude) */
  lastShape?: Shape;
  /** Generated faces with their roles */
  generatedFaces?: GeneratedFaceInfo[];
}

/**
 * Result of a boolean operation
 */
export interface BooleanResult {
  success: boolean;
  shape?: Shape;
  error?: string;
}

/**
 * Perform a boolean operation on two shapes.
 *
 * Uses BRepAlgoAPI_*_3 constructors which take (S1, S2) and perform the operation
 * immediately without requiring Build() or progress tracking.
 */
export function booleanOp(base: Shape, tool: Shape, op: BooleanOp): BooleanResult {
  const oc = getOC();

  let result: TopoDS_Shape;
  let builder: { delete(): void; IsDone(): boolean; Shape(): TopoDS_Shape };

  try {
    switch (op) {
      case `union`: {
        // _3 = (S1, S2) constructor - performs fuse immediately
        builder = new oc.BRepAlgoAPI_Fuse_3(base.raw, tool.raw);
        break;
      }
      case `subtract`: {
        // _3 = (S1, S2) constructor - performs cut immediately
        builder = new oc.BRepAlgoAPI_Cut_3(base.raw, tool.raw);
        break;
      }
      case `intersect`: {
        // _3 = (S1, S2) constructor - performs common immediately
        builder = new oc.BRepAlgoAPI_Common_3(base.raw, tool.raw);
        break;
      }
    }

    if (!builder.IsDone()) {
      builder.delete();
      return { success: false, error: `Boolean ${op} operation failed` };
    }

    result = builder.Shape();
    const shape = new Shape(result);
    builder.delete();

    return { success: true, shape };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : `Unknown boolean operation error`,
    };
  }
}

/**
 * Extrude a face or wire along a direction.
 */
export function extrude(
  profile: Shape,
  direction: [number, number, number],
  distance: number
): Shape {
  const oc = getOC();

  const vec = new oc.gp_Vec_4(
    direction[0] * distance,
    direction[1] * distance,
    direction[2] * distance
  );

  const prism = new oc.BRepPrimAPI_MakePrism_1(profile.raw, vec, false, true);
  const shape = new Shape(prism.Shape());

  vec.delete();
  prism.delete();

  return shape;
}

/**
 * Extrude a face or wire with OCCT history information.
 *
 * Returns the extruded shape along with metadata about generated faces
 * (top cap, bottom cap, sides) that can be used for persistent naming.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8.1
 */
export function extrudeWithHistory(
  profile: Shape,
  direction: [number, number, number],
  distance: number
): ExtrudeWithHistoryResult {
  const oc = getOC();

  const vec = new oc.gp_Vec_4(
    direction[0] * distance,
    direction[1] * distance,
    direction[2] * distance
  );

  const prism = new oc.BRepPrimAPI_MakePrism_1(profile.raw, vec, false, true);
  const shape = new Shape(prism.Shape());

  // Extract OCCT history - FirstShape and LastShape
  let firstShape: Shape | undefined;
  let lastShape: Shape | undefined;

  try {
    // FirstShape() returns the bottom cap (original profile location)
    const first = prism.FirstShape();
    if (first && !first.IsNull()) {
      firstShape = new Shape(first);
    }
  } catch {
    // FirstShape might not be available for some profiles
  }

  try {
    // LastShape() returns the top cap (extruded profile location)
    const last = prism.LastShape();
    if (last && !last.IsNull()) {
      lastShape = new Shape(last);
    }
  } catch {
    // LastShape might not be available for some profiles
  }

  vec.delete();
  prism.delete();

  return {
    shape,
    firstShape,
    lastShape,
  };
}

/**
 * Extrude symmetrically (in both directions).
 */
export function extrudeSymmetric(
  profile: Shape,
  direction: [number, number, number],
  totalDistance: number
): Shape {
  const oc = getOC();
  const halfDist = totalDistance / 2;

  const vec = new oc.gp_Vec_4(
    direction[0] * halfDist,
    direction[1] * halfDist,
    direction[2] * halfDist
  );

  // Extrude in both directions
  const prism = new oc.BRepPrimAPI_MakePrism_2(profile.raw, vec, true, true);
  const shape = new Shape(prism.Shape());

  vec.delete();
  prism.delete();

  return shape;
}

/**
 * Revolve a face or wire around an axis.
 */
export function revolve(
  profile: Shape,
  axisOrigin: [number, number, number],
  axisDirection: [number, number, number],
  angleDegrees: number
): Shape {
  const oc = getOC();

  const origin = new oc.gp_Pnt_3(axisOrigin[0], axisOrigin[1], axisOrigin[2]);
  const dir = new oc.gp_Dir_4(axisDirection[0], axisDirection[1], axisDirection[2]);
  const axis = new oc.gp_Ax1_2(origin, dir);

  const angleRad = (angleDegrees * Math.PI) / 180;
  const revol = new oc.BRepPrimAPI_MakeRevol_1(profile.raw, axis, angleRad, true);
  const shape = new Shape(revol.Shape());

  origin.delete();
  dir.delete();
  axis.delete();
  revol.delete();

  return shape;
}

/**
 * Extended revolve result with OCCT history info.
 */
export interface RevolveWithHistoryResult {
  shape: Shape;
  /** First shape (start cap for partial revolve) */
  firstShape?: Shape;
  /** Last shape (end cap for partial revolve) */
  lastShape?: Shape;
}

/**
 * Revolve a face or wire with OCCT history information.
 *
 * Returns the revolved shape along with metadata about generated faces
 * (start cap, end cap for partial revolves) that can be used for persistent naming.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8.1
 */
export function revolveWithHistory(
  profile: Shape,
  axisOrigin: [number, number, number],
  axisDirection: [number, number, number],
  angleDegrees: number
): RevolveWithHistoryResult {
  const oc = getOC();

  const origin = new oc.gp_Pnt_3(axisOrigin[0], axisOrigin[1], axisOrigin[2]);
  const dir = new oc.gp_Dir_4(axisDirection[0], axisDirection[1], axisDirection[2]);
  const axis = new oc.gp_Ax1_2(origin, dir);

  const angleRad = (angleDegrees * Math.PI) / 180;
  const revol = new oc.BRepPrimAPI_MakeRevol_1(profile.raw, axis, angleRad, true);
  const shape = new Shape(revol.Shape());

  // Extract OCCT history - FirstShape and LastShape
  // For full 360° revolve, there are no end caps
  let firstShape: Shape | undefined;
  let lastShape: Shape | undefined;

  if (angleDegrees < 360) {
    try {
      const first = revol.FirstShape();
      if (first && !first.IsNull()) {
        firstShape = new Shape(first);
      }
    } catch {
      // FirstShape might not be available
    }

    try {
      const last = revol.LastShape();
      if (last && !last.IsNull()) {
        lastShape = new Shape(last);
      }
    } catch {
      // LastShape might not be available
    }
  }

  origin.delete();
  dir.delete();
  axis.delete();
  revol.delete();

  return {
    shape,
    firstShape,
    lastShape,
  };
}

/**
 * Add fillets to all edges of a shape.
 */
export function filletAllEdges(shape: Shape, radius: number): Shape {
  const oc = getOC();
  // Use correct enum access: ChFi3d_FilletShape.ChFi3d_Rational
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape.raw, oc.ChFi3d_FilletShape.ChFi3d_Rational);

  // Add all edges
  const explorer = new oc.TopExp_Explorer_2(
    shape.raw,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  while (explorer.More()) {
    const edge = oc.TopoDS.Edge_1(explorer.Current());
    fillet.Add_2(radius, edge);
    explorer.Next();
  }

  // Build() works without progress parameter in this OpenCascade.js version
  fillet.Build();
  const result = new Shape(fillet.Shape());

  explorer.delete();
  fillet.delete();

  return result;
}

/**
 * Add fillets to specific edges.
 */
export function filletEdges(shape: Shape, radius: number, edges: TopoDS_Edge[]): Shape {
  const oc = getOC();
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape.raw, oc.ChFi3d_FilletShape.ChFi3d_Rational);

  for (const edge of edges) {
    fillet.Add_2(radius, edge);
  }

  fillet.Build();
  const result = new Shape(fillet.Shape());

  fillet.delete();

  return result;
}

/**
 * Add chamfers to all edges of a shape.
 */
export function chamferAllEdges(shape: Shape, distance: number): Shape {
  const oc = getOC();
  const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape.raw);

  // Track added edges to avoid duplicates
  const addedEdges = new Set<number>();

  // Explore all edges
  const explorer = new oc.TopExp_Explorer_2(
    shape.raw,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  while (explorer.More()) {
    const edge = oc.TopoDS.Edge_1(explorer.Current());
    const hash = edge.HashCode(10000000);

    if (!addedEdges.has(hash)) {
      // _2 = (distance, edge) - symmetric chamfer
      chamfer.Add_2(distance, edge);
      addedEdges.add(hash);
    }
    explorer.Next();
  }

  chamfer.Build();
  const result = new Shape(chamfer.Shape());

  explorer.delete();
  chamfer.delete();

  return result;
}

/**
 * Translate a shape by a vector.
 */
export function translate(shape: Shape, dx: number, dy: number, dz: number): Shape {
  const oc = getOC();

  const vec = new oc.gp_Vec_4(dx, dy, dz);
  const trsf = new oc.gp_Trsf_1();
  trsf.SetTranslation_1(vec);

  const transform = new oc.BRepBuilderAPI_Transform_2(shape.raw, trsf, true);
  const result = new Shape(transform.Shape());

  vec.delete();
  trsf.delete();
  transform.delete();

  return result;
}

/**
 * Rotate a shape around an axis.
 */
export function rotate(
  shape: Shape,
  axisOrigin: [number, number, number],
  axisDirection: [number, number, number],
  angleDegrees: number
): Shape {
  const oc = getOC();

  const origin = new oc.gp_Pnt_3(axisOrigin[0], axisOrigin[1], axisOrigin[2]);
  const dir = new oc.gp_Dir_4(axisDirection[0], axisDirection[1], axisDirection[2]);
  const axis = new oc.gp_Ax1_2(origin, dir);

  const trsf = new oc.gp_Trsf_1();
  trsf.SetRotation_1(axis, (angleDegrees * Math.PI) / 180);

  const transform = new oc.BRepBuilderAPI_Transform_2(shape.raw, trsf, true);
  const result = new Shape(transform.Shape());

  origin.delete();
  dir.delete();
  axis.delete();
  trsf.delete();
  transform.delete();

  return result;
}
