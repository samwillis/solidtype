/**
 * Tessellation for Three.js Rendering
 *
 * Converts OCCT shapes to triangle meshes.
 */

import { getOC } from "./init.js";
import { Shape } from "./Shape.js";

/**
 * Tessellated mesh data for rendering.
 */
export interface TessellatedMesh {
  /** Flat array of vertex positions: [x1, y1, z1, x2, y2, z2, ...] */
  vertices: Float32Array;
  /** Flat array of vertex normals: [nx1, ny1, nz1, ...] */
  normals: Float32Array;
  /** Triangle indices into the vertex array */
  indices: Uint32Array;
  /** Maps each triangle index to its face ID (for 3D selection) */
  faceMap: Uint32Array;
  /** B-Rep edge line segments [x1,y1,z1, x2,y2,z2, ...] for each segment pair */
  edges?: Float32Array;
  /** Maps each edge segment to its edge ID (for 3D edge selection) */
  edgeMap?: Uint32Array;
}

/**
 * Tessellation quality presets.
 */
export type TessellationQuality = `low` | `medium` | `high`;

/**
 * Get linear deflection for a quality preset.
 */
function getLinearDeflection(quality: TessellationQuality): number {
  switch (quality) {
    case `low`:
      return 0.5;
    case `medium`:
      return 0.1;
    case `high`:
      return 0.01;
  }
}

/**
 * Get angular deflection for a quality preset.
 */
function getAngularDeflection(quality: TessellationQuality): number {
  switch (quality) {
    case `low`:
      return 0.8;
    case `medium`:
      return 0.5;
    case `high`:
      return 0.2;
  }
}

/**
 * Tessellate a shape for rendering.
 *
 * @param shape - The shape to tessellate
 * @param quality - Quality preset or 'medium' by default
 */
export function tessellate(shape: Shape, quality: TessellationQuality = `medium`): TessellatedMesh {
  const linearDeflection = getLinearDeflection(quality);
  const angularDeflection = getAngularDeflection(quality);

  return tessellateWithParams(shape, linearDeflection, angularDeflection);
}

/**
 * Tessellate a shape with explicit parameters.
 *
 * @param shape - The shape to tessellate
 * @param linearDeflection - Max distance from mesh to real surface (default 0.1mm)
 * @param angularDeflection - Max angle between adjacent triangles (default 0.5 rad)
 */
export function tessellateWithParams(
  shape: Shape,
  linearDeflection = 0.1,
  angularDeflection = 0.5
): TessellatedMesh {
  const oc = getOC();

  // Perform tessellation
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape.raw,
    linearDeflection,
    false,
    angularDeflection,
    false
  );
  mesher.Perform_1();

  const vertices: number[] = [];
  const indices: number[] = [];
  const faceMap: number[] = [];

  // Iterate over all faces
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape.raw,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  let faceIndex = 0;
  while (faceExplorer.More()) {
    const face = oc.TopoDS.Face_1(faceExplorer.Current());
    const location = new oc.TopLoc_Location_1();
    // BRep_Tool.Triangulation takes 2 params in OpenCascade.js (no meshPurpose)
    const triangulation = oc.BRep_Tool.Triangulation(face, location);

    if (!triangulation.IsNull()) {
      const transform = location.Transformation();
      const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

      // Get starting vertex index for this face
      const nodeStart = vertices.length / 3;

      // Get triangulation data
      const tri = triangulation.get();
      const numNodes = tri.NbNodes();
      const numTriangles = tri.NbTriangles();

      // Add vertices
      for (let i = 1; i <= numNodes; i++) {
        const node = tri.Node(i);
        const transformed = node.Transformed(transform);
        vertices.push(transformed.X(), transformed.Y(), transformed.Z());
      }

      // Add triangles
      for (let i = 1; i <= numTriangles; i++) {
        const triangle = tri.Triangle(i);
        const n1 = triangle.Value(1) - 1 + nodeStart;
        let n2 = triangle.Value(2) - 1 + nodeStart;
        let n3 = triangle.Value(3) - 1 + nodeStart;

        if (isReversed) {
          [n2, n3] = [n3, n2]; // Flip winding
        }

        indices.push(n1, n2, n3);
        // Track which face this triangle belongs to (for 3D selection)
        faceMap.push(faceIndex);
      }
    }

    location.delete();
    faceExplorer.Next();
    faceIndex++;
  }

  faceExplorer.delete();
  mesher.delete();

  // Compute normals from triangles
  const computedNormals = computeNormals(vertices, indices);

  // Extract B-Rep edges
  const edgeResult = extractEdges(shape);

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(computedNormals),
    indices: new Uint32Array(indices),
    faceMap: new Uint32Array(faceMap),
    edges: edgeResult.positions,
    edgeMap: edgeResult.edgeMap,
  };
}

/**
 * Edge extraction result with positions and edge-to-segment mapping.
 */
interface EdgeExtractionResult {
  /** Line segment positions [x1,y1,z1, x2,y2,z2, ...] */
  positions: Float32Array;
  /** Maps each segment to its B-Rep edge index */
  edgeMap: Uint32Array;
}

/**
 * Extract B-Rep edges from a shape by sampling the 3D curves.
 *
 * @param shape - The shape to extract edges from
 * @param numSamples - Number of samples per edge for curved edges
 */
function extractEdges(shape: Shape, numSamples = 32): EdgeExtractionResult {
  const oc = getOC();
  const edgePoints: number[] = [];
  const edgeIndices: number[] = [];

  // Track processed edges to avoid duplicates (edges are shared between faces)
  const processedEdges = new Set<number>();
  let edgeIndex = 0;

  // Iterate over all edges in the shape
  const edgeExplorer = new oc.TopExp_Explorer_2(
    shape.raw,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  while (edgeExplorer.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());

    // Get a hash to deduplicate edges
    const edgeHash = edge.HashCode(1000000);
    if (processedEdges.has(edgeHash)) {
      edgeExplorer.Next();
      continue;
    }
    processedEdges.add(edgeHash);

    try {
      // Use BRepAdaptor_Curve to get the 3D curve from the edge
      const adaptor = new oc.BRepAdaptor_Curve_2(edge);
      const paramStart = adaptor.FirstParameter();
      const paramEnd = adaptor.LastParameter();

      // Check if it's a line (only needs 2 points) or curve (needs more samples)
      const curveType = adaptor.GetType();
      const isLine = curveType === oc.GeomAbs_CurveType.GeomAbs_Line;
      const samples = isLine ? 2 : numSamples;

      // Sample the curve
      const points: { x: number; y: number; z: number }[] = [];

      for (let i = 0; i < samples; i++) {
        const t = paramStart + (paramEnd - paramStart) * (i / (samples - 1));
        const pnt = adaptor.Value(t);
        points.push({ x: pnt.X(), y: pnt.Y(), z: pnt.Z() });
        pnt.delete();
      }

      // Create line segments between consecutive points
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        edgePoints.push(p1.x, p1.y, p1.z);
        edgePoints.push(p2.x, p2.y, p2.z);
        // Map this segment to the current edge index
        edgeIndices.push(edgeIndex);
      }

      adaptor.delete();
      edgeIndex++;
    } catch {
      // Skip edges that fail to extract (e.g., degenerate edges)
    }

    edgeExplorer.Next();
  }

  edgeExplorer.delete();

  return {
    positions: new Float32Array(edgePoints),
    edgeMap: new Uint32Array(edgeIndices),
  };
}

/**
 * Compute per-vertex normals from triangles using area-weighted averaging.
 */
function computeNormals(vertices: number[], indices: number[]): number[] {
  const normals = new Array(vertices.length).fill(0);

  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i] * 3;
    const i2 = indices[i + 1] * 3;
    const i3 = indices[i + 2] * 3;

    // Triangle vertices
    const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
    const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
    const v3 = [vertices[i3], vertices[i3 + 1], vertices[i3 + 2]];

    // Edges
    const e1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const e2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];

    // Cross product (not normalized - area-weighted)
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];

    // Accumulate
    for (const idx of [i1, i2, i3]) {
      normals[idx] += n[0];
      normals[idx + 1] += n[1];
      normals[idx + 2] += n[2];
    }
  }

  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2);
    if (len > 0) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }

  return normals;
}

/**
 * Plane data extracted from a face.
 */
export interface FacePlaneData {
  /** Point on the face (used as origin for sketch plane) */
  origin: [number, number, number];
  /** Face normal direction */
  normal: [number, number, number];
  /** X direction for the sketch plane (tangent to face) */
  xDir: [number, number, number];
  /** Y direction for the sketch plane (tangent to face, perpendicular to xDir) */
  yDir: [number, number, number];
}

/**
 * Extract plane data from a specific face of a shape.
 * Returns null if the face index is out of range.
 *
 * @param shape - The shape containing the face
 * @param faceIndex - The 0-based face index
 */
export function getFacePlane(shape: Shape, faceIndex: number): FacePlaneData | null {
  const oc = getOC();

  // Iterate over faces to find the target one
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape.raw,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  let currentIndex = 0;
  let result: FacePlaneData | null = null;

  while (faceExplorer.More()) {
    if (currentIndex === faceIndex) {
      const face = oc.TopoDS.Face_1(faceExplorer.Current());

      // Get the surface from the face
      const surface = oc.BRep_Tool.Surface_2(face);

      if (!surface.IsNull()) {
        const surfaceHandle = surface.get();

        // Get surface type
        const geomPlane = surfaceHandle as { Location?: () => unknown };

        // Try to get plane parameters using the Geom_Surface interface
        // Get a point and normal at UV = (0, 0) - this works for any surface type
        const uMin = { current: 0 };
        const uMax = { current: 0 };
        const vMin = { current: 0 };
        const vMax = { current: 0 };
        surfaceHandle.Bounds(uMin, uMax, vMin, vMax);

        // Sample at the center of the parameter space
        const uMid = (uMin.current + uMax.current) / 2;
        const vMid = (vMin.current + vMax.current) / 2;

        // Get point on surface
        const point = surfaceHandle.Value(uMid, vMid);

        // Get derivatives to compute normal and tangent directions
        const d1u = new oc.gp_Vec_1();
        const d1v = new oc.gp_Vec_1();
        const pnt = new oc.gp_Pnt_1();
        surfaceHandle.D1(uMid, vMid, pnt, d1u, d1v);

        // Compute normal from cross product of derivatives
        const normal = d1u.Crossed(d1v);
        const normalLen = normal.Magnitude();

        if (normalLen > 1e-10) {
          // Normalize
          normal.Scale(1 / normalLen);

          // Use d1u as xDir (normalized)
          const d1uLen = d1u.Magnitude();
          if (d1uLen > 1e-10) {
            d1u.Scale(1 / d1uLen);
          }

          // Compute yDir as normal × xDir
          const yDir = normal.Crossed(d1u);

          // Handle face orientation
          const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
          const sign = isReversed ? -1 : 1;

          result = {
            origin: [point.X(), point.Y(), point.Z()],
            normal: [normal.X() * sign, normal.Y() * sign, normal.Z() * sign],
            xDir: [d1u.X(), d1u.Y(), d1u.Z()],
            yDir: [yDir.X() * sign, yDir.Y() * sign, yDir.Z() * sign],
          };

          // Clean up
          d1u.delete();
          d1v.delete();
          pnt.delete();
          normal.delete();
          yDir.delete();
        }

        point.delete();
      }

      break;
    }

    faceExplorer.Next();
    currentIndex++;
  }

  faceExplorer.delete();
  return result;
}

/**
 * Get the bounding box of a shape.
 */
export function getBoundingBox(shape: Shape): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const oc = getOC();

  const bbox = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(shape.raw, bbox, false);

  // Use CornerMin/CornerMax methods which return gp_Pnt objects
  const minPt = bbox.CornerMin();
  const maxPt = bbox.CornerMax();

  const result = {
    min: [minPt.X(), minPt.Y(), minPt.Z()] as [number, number, number],
    max: [maxPt.X(), maxPt.Y(), maxPt.Z()] as [number, number, number],
  };

  minPt.delete();
  maxPt.delete();
  bbox.delete();

  return result;
}
