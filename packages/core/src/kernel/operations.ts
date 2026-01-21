/**
 * OCCT Operations
 *
 * Boolean operations, extrude, revolve, fillet, chamfer.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8 - OCCT history integration
 */

import { getOC } from "./init.js";
import { Shape } from "./Shape.js";
import type { TopoDS_Shape, TopoDS_Edge } from "opencascade.js";
// Type declarations are in ./opencascade.d.ts

export type BooleanOp = `union` | `subtract` | `intersect`;

/**
 * Mapping from profile edge to generated side face.
 * Used to associate sketch entity UUIDs with result faces.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8.1
 */
export interface ProfileEdgeToFaceMapping {
  /** Hash code of the profile edge that generated this face */
  profileEdgeHash: number;
  /** Hash code of the generated side face */
  generatedFaceHash: number;
  /** Index of the profile edge (0-based, in exploration order) */
  profileEdgeIndex: number;
}

/**
 * Extended extrusion result with OCCT history info.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8.1
 */
export interface ExtrudeWithHistoryResult {
  shape: Shape;
  /** First shape (bottom cap of extrude) - hash code for matching */
  firstShapeHash?: number;
  /** Last shape (top cap of extrude) - hash code for matching */
  lastShapeHash?: number;
  /**
   * Mappings from profile edges to generated side faces.
   * Each profile edge generates one side face during extrusion.
   */
  sideFaceMappings: ProfileEdgeToFaceMapping[];
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
 * Mapping from input face hash to output face hashes.
 * Used to track faces through boolean operations.
 */
export interface FaceHistoryMapping {
  inputHash: number;
  outputHashes: number[];
  isDeleted: boolean;
}

/**
 * Result of a boolean operation with history tracking.
 * Includes mappings from input faces to output faces.
 */
export interface BooleanWithHistoryResult {
  success: boolean;
  shape?: Shape;
  error?: string;
  /** Face mappings from base shape */
  baseFaceMap?: FaceHistoryMapping[];
  /** Face mappings from tool shape */
  toolFaceMap?: FaceHistoryMapping[];
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
 * Extract face history mappings from a boolean builder.
 *
 * For each face in the input shape, queries Modified() and IsDeleted()
 * to determine what happened to it during the boolean operation.
 *
 * @param builder - The boolean operation builder (with Modified/IsDeleted methods)
 * @param inputShape - The input shape to extract face history for
 * @returns Array of FaceHistoryMapping for each input face
 */
function extractFaceHistory(
  builder: { Modified(s: TopoDS_Shape): unknown; IsDeleted(s: TopoDS_Shape): boolean },
  inputShape: TopoDS_Shape
): FaceHistoryMapping[] {
  const oc = getOC();
  const mappings: FaceHistoryMapping[] = [];

  const faceExplorer = new oc.TopExp_Explorer_2(
    inputShape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  const processedHashes = new Set<number>();

  while (faceExplorer.More()) {
    const face = faceExplorer.Current();
    const inputHash = face.HashCode(0x7fffffff);

    // Skip duplicate faces (can happen with shared faces)
    if (processedHashes.has(inputHash)) {
      faceExplorer.Next();
      continue;
    }
    processedHashes.add(inputHash);

    try {
      const isDeleted = builder.IsDeleted(face);

      if (isDeleted) {
        mappings.push({
          inputHash,
          outputHashes: [],
          isDeleted: true,
        });
      } else {
        // Get modified shapes
        const modified = builder.Modified(face) as {
          Size(): number;
          First_1(): TopoDS_Shape;
          Last_1(): TopoDS_Shape;
        };
        const outputHashes: number[] = [];

        const size = modified.Size();
        if (size > 0) {
          // First element
          const first = modified.First_1();
          outputHashes.push(first.HashCode(0x7fffffff));

          // If there are 2+ elements, we can get last
          // For more than 2, we'd need a different approach, but typically
          // boolean splits result in 1-2 output faces
          if (size > 1) {
            const last = modified.Last_1();
            const lastHash = last.HashCode(0x7fffffff);
            if (lastHash !== outputHashes[0]) {
              outputHashes.push(lastHash);
            }
          }
        }

        // If Modified returns empty but face isn't deleted, it's unchanged
        // The face exists in the output with the same hash
        if (outputHashes.length === 0) {
          outputHashes.push(inputHash);
        }

        mappings.push({
          inputHash,
          outputHashes,
          isDeleted: false,
        });
      }
    } catch {
      // If history query fails, assume face is unchanged
      mappings.push({
        inputHash,
        outputHashes: [inputHash],
        isDeleted: false,
      });
    }

    faceExplorer.Next();
  }

  faceExplorer.delete();
  return mappings;
}

/**
 * Perform a boolean operation with history tracking.
 *
 * Like booleanOp, but also returns mappings showing what happened to
 * each input face (modified into which output faces, or deleted).
 *
 * This enables tracking persistent references through boolean operations.
 *
 * @param base - The base shape
 * @param tool - The tool shape
 * @param op - The boolean operation type
 * @returns Result with shape and face history mappings
 */
export function booleanOpWithHistory(
  base: Shape,
  tool: Shape,
  op: BooleanOp
): BooleanWithHistoryResult {
  const oc = getOC();

  // We need to use a builder type that has history methods
  type BooleanBuilder = {
    delete(): void;
    IsDone(): boolean;
    Shape(): TopoDS_Shape;
    Modified(s: TopoDS_Shape): unknown;
    IsDeleted(s: TopoDS_Shape): boolean;
  };

  let builder: BooleanBuilder;

  try {
    switch (op) {
      case `union`: {
        builder = new oc.BRepAlgoAPI_Fuse_3(base.raw, tool.raw) as BooleanBuilder;
        break;
      }
      case `subtract`: {
        builder = new oc.BRepAlgoAPI_Cut_3(base.raw, tool.raw) as BooleanBuilder;
        break;
      }
      case `intersect`: {
        builder = new oc.BRepAlgoAPI_Common_3(base.raw, tool.raw) as BooleanBuilder;
        break;
      }
    }

    if (!builder.IsDone()) {
      builder.delete();
      return { success: false, error: `Boolean ${op} operation failed` };
    }

    // Extract history BEFORE getting result shape
    const baseFaceMap = extractFaceHistory(builder, base.raw);
    const toolFaceMap = extractFaceHistory(builder, tool.raw);

    const result = builder.Shape();
    const shape = new Shape(result);
    builder.delete();

    return {
      success: true,
      shape,
      baseFaceMap,
      toolFaceMap,
    };
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
 * Uses OCCT's Generated() API to map each profile edge to its generated side face,
 * enabling stable references even when sketch geometry is reordered.
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

  // Use Copy=false to preserve the relationship between input and output shapes
  const prism = new oc.BRepPrimAPI_MakePrism_1(profile.raw, vec, false, true);
  const resultShape = prism.Shape();
  const shape = new Shape(resultShape);

  // Extract cap face hashes
  let firstShapeHash: number | undefined;
  let lastShapeHash: number | undefined;

  try {
    const first = prism.FirstShape();
    if (first && !first.IsNull()) {
      firstShapeHash = first.HashCode(0x7fffffff);
    }
  } catch {
    // FirstShape might not be available
  }

  try {
    const last = prism.LastShape();
    if (last && !last.IsNull()) {
      lastShapeHash = last.HashCode(0x7fffffff);
    }
  } catch {
    // LastShape might not be available
  }

  // Extract side face mappings using Generated()
  // For each edge in the profile, Generated() returns the face(s) that were swept from it
  const sideFaceMappings: ProfileEdgeToFaceMapping[] = [];

  try {
    // Explore edges in the input profile
    const edgeExplorer = new oc.TopExp_Explorer_2(
      profile.raw,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const processedEdges = new Set<number>();
    let profileEdgeIndex = 0;

    while (edgeExplorer.More()) {
      const edge = edgeExplorer.Current();
      const edgeHash = edge.HashCode(0x7fffffff);

      // Skip duplicate edges (edges can be shared)
      if (!processedEdges.has(edgeHash)) {
        processedEdges.add(edgeHash);

        try {
          // Generated() returns the shapes generated from this input shape
          // In OpenCascade.js, this returns a TopTools_ListOfShape
          const generatedShapes = prism.Generated(edge);

          // Use Size() method (not Extent) for OpenCascade.js lists
          const numGenerated = generatedShapes.Size();

          if (numGenerated > 0) {
            // For extrude, each edge generates exactly 1 face
            // Use First_1() to access it (OpenCascade.js binding)
            const generatedShape = generatedShapes.First_1();

            // Check if it's a face (Generated from an edge should produce a face)
            if (generatedShape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
              const faceHash = generatedShape.HashCode(0x7fffffff);

              sideFaceMappings.push({
                profileEdgeHash: edgeHash,
                generatedFaceHash: faceHash,
                profileEdgeIndex,
              });
            }
          }
        } catch {
          // Generated() might fail for some edge types
        }

        profileEdgeIndex++;
      }

      edgeExplorer.Next();
    }

    edgeExplorer.delete();
  } catch {
    // Edge exploration might fail
  }

  vec.delete();
  prism.delete();

  return {
    shape,
    firstShapeHash,
    lastShapeHash,
    sideFaceMappings,
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
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8.1
 */
export interface RevolveWithHistoryResult {
  shape: Shape;
  /** Start cap face hash (for partial revolve < 360°) */
  firstShapeHash?: number;
  /** End cap face hash (for partial revolve < 360°) */
  lastShapeHash?: number;
  /**
   * Mappings from profile edges to generated side faces.
   * Each profile edge generates one side surface during revolution.
   */
  sideFaceMappings: ProfileEdgeToFaceMapping[];
}

/**
 * Revolve a face or wire with OCCT history information.
 *
 * Returns the revolved shape along with metadata about generated faces
 * (start cap, end cap for partial revolves, and side faces) that can be
 * used for persistent naming.
 *
 * Uses OCCT's Generated() API to map each profile edge to its generated side face.
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
  const resultShape = revol.Shape();
  const shape = new Shape(resultShape);

  // Extract cap face hashes (only for partial revolves)
  let firstShapeHash: number | undefined;
  let lastShapeHash: number | undefined;

  if (angleDegrees < 360) {
    try {
      const first = revol.FirstShape();
      if (first && !first.IsNull()) {
        firstShapeHash = first.HashCode(0x7fffffff);
      }
    } catch {
      // FirstShape might not be available
    }

    try {
      const last = revol.LastShape();
      if (last && !last.IsNull()) {
        lastShapeHash = last.HashCode(0x7fffffff);
      }
    } catch {
      // LastShape might not be available
    }
  }

  // Extract side face mappings using Generated()
  const sideFaceMappings: ProfileEdgeToFaceMapping[] = [];

  try {
    const edgeExplorer = new oc.TopExp_Explorer_2(
      profile.raw,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const processedEdges = new Set<number>();
    let profileEdgeIndex = 0;

    while (edgeExplorer.More()) {
      const edge = edgeExplorer.Current();
      const edgeHash = edge.HashCode(0x7fffffff);

      if (!processedEdges.has(edgeHash)) {
        processedEdges.add(edgeHash);

        try {
          const generatedShapes = revol.Generated(edge);

          // Use Size() method (not Extent) for OpenCascade.js lists
          const numGenerated = generatedShapes.Size();

          if (numGenerated > 0) {
            // For revolve, each edge generates exactly 1 face
            const generatedShape = generatedShapes.First_1();

            if (generatedShape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
              const faceHash = generatedShape.HashCode(0x7fffffff);

              sideFaceMappings.push({
                profileEdgeHash: edgeHash,
                generatedFaceHash: faceHash,
                profileEdgeIndex,
              });
            }
          }
        } catch {
          // Generated() might fail for some edge types
        }

        profileEdgeIndex++;
      }

      edgeExplorer.Next();
    }

    edgeExplorer.delete();
  } catch {
    // Edge exploration might fail
  }

  origin.delete();
  dir.delete();
  axis.delete();
  revol.delete();

  return {
    shape,
    firstShapeHash,
    lastShapeHash,
    sideFaceMappings,
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
