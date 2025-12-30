/**
 * Tessellation for Three.js Rendering
 * 
 * Converts OCCT shapes to triangle meshes.
 */

import { getOC } from './init.js';
import { Shape } from './Shape.js';

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
}

/**
 * Tessellation quality presets.
 */
export type TessellationQuality = 'low' | 'medium' | 'high';

/**
 * Get linear deflection for a quality preset.
 */
function getLinearDeflection(quality: TessellationQuality): number {
  switch (quality) {
    case 'low': return 0.5;
    case 'medium': return 0.1;
    case 'high': return 0.01;
  }
}

/**
 * Get angular deflection for a quality preset.
 */
function getAngularDeflection(quality: TessellationQuality): number {
  switch (quality) {
    case 'low': return 0.8;
    case 'medium': return 0.5;
    case 'high': return 0.2;
  }
}

/**
 * Tessellate a shape for rendering.
 * 
 * @param shape - The shape to tessellate
 * @param quality - Quality preset or 'medium' by default
 */
export function tessellate(
  shape: Shape,
  quality: TessellationQuality = 'medium'
): TessellatedMesh {
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
  
  // Iterate over all faces
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape.raw,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  
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
        let n1 = triangle.Value(1) - 1 + nodeStart;
        let n2 = triangle.Value(2) - 1 + nodeStart;
        let n3 = triangle.Value(3) - 1 + nodeStart;
        
        if (isReversed) {
          [n2, n3] = [n3, n2]; // Flip winding
        }
        
        indices.push(n1, n2, n3);
      }
    }
    
    location.delete();
    faceExplorer.Next();
  }
  
  faceExplorer.delete();
  mesher.delete();
  
  // Compute normals from triangles
  const computedNormals = computeNormals(vertices, indices);
  
  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(computedNormals),
    indices: new Uint32Array(indices),
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
 * Get the bounding box of a shape.
 */
export function getBoundingBox(shape: Shape): { min: [number, number, number]; max: [number, number, number] } {
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
