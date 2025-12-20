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
import { TopoModel } from '../topo/TopoModel.js';
import type { FaceId, LoopId } from '../topo/handles.js';
import type { Mesh, TessellationOptions } from './types.js';
import { createMesh, DEFAULT_TESSELLATION_OPTIONS } from './types.js';
import { triangulatePolygon } from './triangulate.js';

/**
 * Project a 3D point onto a plane's 2D coordinate system
 */
export function projectToPlane(point: Vec3, plane: PlaneSurface): Vec2 {
  const v = sub3(point, plane.origin);
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
  
  for (const he of model.iterateLoopHalfEdges(loopId)) {
    const vertex = model.getHalfEdgeStartVertex(he);
    vertices.push(model.getVertexPosition(vertex));
  }
  
  return vertices;
}

/**
 * Tessellate a planar face
 */
function tessellatePlanarFace(
  model: TopoModel,
  faceId: FaceId,
  surface: PlaneSurface,
  reversed: boolean
): Mesh {
  const loops = model.getFaceLoops(faceId);
  
  if (loops.length === 0) {
    return createMesh([], [], []);
  }
  
  const outerLoop = loops[0];
  const vertices3D = getLoopVertices(model, outerLoop);
  
  if (vertices3D.length < 3) {
    return createMesh([], [], []);
  }
  
  const vertices2D: Vec2[] = vertices3D.map(v => projectToPlane(v, surface));
  const triangleIndices = triangulatePolygon(vertices2D);
  
  if (triangleIndices.length === 0) {
    return createMesh([], [], []);
  }
  
  const positions: number[] = [];
  const normals: number[] = [];
  
  let normal = normalize3(surface.normal);
  if (reversed) {
    normal = [-normal[0], -normal[1], -normal[2]];
  }
  
  for (const v of vertices3D) {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
  
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
 */
export function tessellateFace(
  model: TopoModel,
  faceId: FaceId,
  _options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh {
  const surfaceIdx = model.getFaceSurfaceIndex(faceId);
  const surface = model.getSurface(surfaceIdx);
  const reversed = model.isFaceReversed(faceId);
  
  switch (surface.kind) {
    case 'plane':
      return tessellatePlanarFace(model, faceId, surface, reversed);
      
    case 'cylinder':
    case 'cone':
    case 'sphere':
      console.warn(`Tessellation of ${surface.kind} surfaces not yet implemented`);
      return createMesh([], [], []);
      
    default:
      return createMesh([], [], []);
  }
}
