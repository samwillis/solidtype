/**
 * Mesh types and interfaces
 * 
 * Provides triangle mesh representation for BREP body tessellation.
 * The mesh format is designed for efficient WebGL rendering.
 */

/**
 * Triangle mesh output
 * 
 * - positions: Float32Array of vertex positions (xyzxyz...)
 * - normals: Float32Array of vertex normals (xyzxyz...), same length as positions
 * - indices: Uint32Array of triangle indices (abc, abc, ...)
 */
export interface Mesh {
  /** Vertex positions (xyzxyz...) */
  positions: Float32Array;
  /** Vertex normals (xyzxyz...), same length as positions */
  normals: Float32Array;
  /** Triangle indices (3 per triangle) */
  indices: Uint32Array;
}

/**
 * Tessellation options
 */
export interface TessellationOptions {
  /** Maximum angle deviation (in radians) for curved surfaces */
  angularTolerance?: number;
  /** Maximum chord deviation for curved surfaces */
  chordTolerance?: number;
}

/**
 * Default tessellation options
 */
export const DEFAULT_TESSELLATION_OPTIONS: Required<TessellationOptions> = {
  angularTolerance: Math.PI / 36, // 5 degrees
  chordTolerance: 0.01,
};

/**
 * Create an empty mesh
 */
export function createEmptyMesh(): Mesh {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    indices: new Uint32Array(0),
  };
}

/**
 * Create a mesh from arrays
 */
export function createMesh(
  positions: number[],
  normals: number[],
  indices: number[]
): Mesh {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

/**
 * Merge multiple meshes into one
 */
export function mergeMeshes(meshes: Mesh[]): Mesh {
  if (meshes.length === 0) {
    return createEmptyMesh();
  }
  
  if (meshes.length === 1) {
    return meshes[0];
  }
  
  // Calculate total sizes
  let totalPositions = 0;
  let totalIndices = 0;
  
  for (const mesh of meshes) {
    totalPositions += mesh.positions.length;
    totalIndices += mesh.indices.length;
  }
  
  // Allocate output arrays
  const positions = new Float32Array(totalPositions);
  const normals = new Float32Array(totalPositions);
  const indices = new Uint32Array(totalIndices);
  
  // Copy data
  let posOffset = 0;
  let idxOffset = 0;
  let vertexOffset = 0;
  
  for (const mesh of meshes) {
    // Copy positions and normals
    positions.set(mesh.positions, posOffset);
    normals.set(mesh.normals, posOffset);
    
    // Copy indices with offset
    for (let i = 0; i < mesh.indices.length; i++) {
      indices[idxOffset + i] = mesh.indices[i] + vertexOffset;
    }
    
    posOffset += mesh.positions.length;
    idxOffset += mesh.indices.length;
    vertexOffset += mesh.positions.length / 3;
  }
  
  return { positions, normals, indices };
}

/**
 * Get the number of vertices in a mesh
 */
export function getMeshVertexCount(mesh: Mesh): number {
  return mesh.positions.length / 3;
}

/**
 * Get the number of triangles in a mesh
 */
export function getMeshTriangleCount(mesh: Mesh): number {
  return mesh.indices.length / 3;
}
