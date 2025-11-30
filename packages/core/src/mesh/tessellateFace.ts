/**
 * Face tessellation
 * 
 * Converts BREP faces into triangle meshes.
 * Currently supports planar faces; curved surface support to be added later.
 */

import type { Vec2 } from '../num/vec2.js';
import type { Vec3 } from '../num/vec3.js';
import { vec2 } from '../num/vec2.js';
import { sub3, dot3, normalize3 } from '../num/vec3.js';
import type { PlaneSurface } from '../geom/surface.js';
import type { TopoModel } from '../topo/model.js';
import type { FaceId, LoopId, HalfEdgeId } from '../topo/handles.js';
import {
  getFaceLoops,
  getFaceSurfaceIndex,
  getSurface,
  isFaceReversed,
  getLoopFirstHalfEdge,
  getHalfEdgeNext,
  getHalfEdgeStartVertex,
  getVertexPosition,
  isNullId,
} from '../topo/model.js';
import type { Mesh, TessellationOptions } from './types.js';
import { createMesh, DEFAULT_TESSELLATION_OPTIONS } from './types.js';
import { triangulatePolygon } from './triangulate.js';

/**
 * Project a 3D point onto a plane's 2D coordinate system
 * 
 * @param point 3D point to project
 * @param plane The plane surface
 * @returns 2D coordinates in plane's local system
 */
export function projectToPlane(point: Vec3, plane: PlaneSurface): Vec2 {
  // Vector from origin to point
  const v = sub3(point, plane.origin);
  
  // Project onto xDir and yDir
  const u = dot3(v, plane.xDir);
  const w = dot3(v, plane.yDir);
  
  return vec2(u, w);
}

/**
 * Unproject 2D coordinates back to 3D using plane's coordinate system
 */
export function unprojectFromPlane(point2D: Vec2, plane: PlaneSurface): Vec3 {
  return [
    plane.origin[0] + point2D[0] * plane.xDir[0] + point2D[1] * plane.yDir[0],
    plane.origin[1] + point2D[0] * plane.xDir[1] + point2D[1] * plane.yDir[1],
    plane.origin[2] + point2D[0] * plane.xDir[2] + point2D[1] * plane.yDir[2],
  ];
}

/**
 * Get all vertices of a loop in order
 */
function getLoopVertices(model: TopoModel, loopId: LoopId): Vec3[] {
  const vertices: Vec3[] = [];
  const firstHe = getLoopFirstHalfEdge(model, loopId);
  
  if (isNullId(firstHe)) {
    return vertices;
  }
  
  let he: HalfEdgeId = firstHe;
  let iterations = 0;
  const maxIterations = 10000; // Safety limit
  
  do {
    const vertex = getHalfEdgeStartVertex(model, he);
    vertices.push(getVertexPosition(model, vertex));
    he = getHalfEdgeNext(model, he);
    iterations++;
  } while (he !== firstHe && !isNullId(he) && iterations < maxIterations);
  
  return vertices;
}

/**
 * Tessellate a planar face
 * 
 * @param model The topology model
 * @param faceId The face to tessellate
 * @param surface The face's underlying surface (must be a plane)
 * @param reversed Whether the face normal is reversed
 * @returns Triangle mesh for the face
 */
function tessellatePlanarFace(
  model: TopoModel,
  faceId: FaceId,
  surface: PlaneSurface,
  reversed: boolean
): Mesh {
  const loops = getFaceLoops(model, faceId);
  
  if (loops.length === 0) {
    return createMesh([], [], []);
  }
  
  // Get the outer loop (first loop)
  const outerLoop = loops[0];
  const vertices3D = getLoopVertices(model, outerLoop);
  
  if (vertices3D.length < 3) {
    return createMesh([], [], []);
  }
  
  // Project vertices to 2D
  const vertices2D: Vec2[] = vertices3D.map(v => projectToPlane(v, surface));
  
  // Triangulate the polygon
  const triangleIndices = triangulatePolygon(vertices2D);
  
  if (triangleIndices.length === 0) {
    return createMesh([], [], []);
  }
  
  // Build mesh arrays
  const positions: number[] = [];
  const normals: number[] = [];
  
  // Compute face normal (potentially reversed)
  let normal = normalize3(surface.normal);
  if (reversed) {
    normal = [-normal[0], -normal[1], -normal[2]];
  }
  
  // Add vertices
  for (const v of vertices3D) {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
  
  // If face is reversed, flip triangle winding
  const indices: number[] = [];
  if (reversed) {
    for (let i = 0; i < triangleIndices.length; i += 3) {
      indices.push(triangleIndices[i], triangleIndices[i + 2], triangleIndices[i + 1]);
    }
  } else {
    indices.push(...triangleIndices);
  }
  
  return createMesh(positions, normals, indices);
}

/**
 * Tessellate a face
 * 
 * Currently only supports planar faces.
 * Curved surface support (cylinder, sphere, etc.) to be added later.
 * 
 * @param model The topology model
 * @param faceId The face to tessellate
 * @param _options Tessellation options (unused for planar faces)
 * @returns Triangle mesh for the face
 */
export function tessellateFace(
  model: TopoModel,
  faceId: FaceId,
  _options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh {
  const surfaceIdx = getFaceSurfaceIndex(model, faceId);
  const surface = getSurface(model, surfaceIdx);
  const reversed = isFaceReversed(model, faceId);
  
  switch (surface.kind) {
    case 'plane':
      return tessellatePlanarFace(model, faceId, surface, reversed);
      
    case 'cylinder':
    case 'cone':
    case 'sphere':
      // TODO(agent): Implement curved surface tessellation (Phase 4+)
      // For now, return empty mesh for unsupported surfaces
      console.warn(`Tessellation of ${surface.kind} surfaces not yet implemented`);
      return createMesh([], [], []);
      
    default:
      // Exhaustive check - this should never happen
      return createMesh([], [], []);
  }
}
