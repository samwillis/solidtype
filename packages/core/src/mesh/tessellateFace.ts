/**
 * Face tessellation
 * 
 * Converts BREP faces into triangle meshes.
 * Supports planar faces and basic cylinder faces.
 */

import type { Vec2 } from '../num/vec2.js';
import type { Vec3 } from '../num/vec3.js';
import { vec2 } from '../num/vec2.js';
import { sub3, dot3, normalize3, cross3, add3, mul3, vec3, length3 } from '../num/vec3.js';
import type { PlaneSurface, CylinderSurface, ConeSurface, SphereSurface, TorusSurface } from '../geom/surface.js';
import { surfaceNormal } from '../geom/surface.js';
import { TopoModel } from '../topo/TopoModel.js';
import type { FaceId, LoopId } from '../topo/handles.js';
import type { Mesh, TessellationOptions } from './types.js';
import { createMesh, DEFAULT_TESSELLATION_OPTIONS } from './types.js';
import { triangulatePolygon, triangulatePolygonWithHoles } from './triangulate.js';

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
  const outerVertices3D = getLoopVertices(model, outerLoop);
  
  if (outerVertices3D.length < 3) {
    return createMesh([], [], []);
  }
  
  const outerVertices2D: Vec2[] = outerVertices3D.map(v => projectToPlane(v, surface));
  
  // Collect all vertices (outer + holes) for position/normal buffers
  const allVertices3D: Vec3[] = [...outerVertices3D];
  
  // Collect hole vertices
  const holes2D: Vec2[][] = [];
  for (let i = 1; i < loops.length; i++) {
    const holeVertices3D = getLoopVertices(model, loops[i]);
    if (holeVertices3D.length < 3) continue;
    
    const holeVertices2D = holeVertices3D.map(v => projectToPlane(v, surface));
    holes2D.push(holeVertices2D);
    allVertices3D.push(...holeVertices3D);
  }
  
  // Triangulate with holes if any
  let triangleIndices: number[];
  if (holes2D.length > 0) {
    triangleIndices = triangulatePolygonWithHoles(outerVertices2D, holes2D);
  } else {
    triangleIndices = triangulatePolygon(outerVertices2D);
  }
  
  if (triangleIndices.length === 0) {
    return createMesh([], [], []);
  }
  
  const positions: number[] = [];
  const normals: number[] = [];
  
  let normal = normalize3(surface.normal);
  if (reversed) {
    normal = [-normal[0], -normal[1], -normal[2]];
  }
  
  for (const v of allVertices3D) {
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

function computeOrthonormalBasis(axis: Vec3): { uPerp: Vec3; vPerp: Vec3 } {
  const absX = Math.abs(axis[0]);
  const absY = Math.abs(axis[1]);
  const absZ = Math.abs(axis[2]);

  let candidate: Vec3;
  if (absX <= absY && absX <= absZ) {
    candidate = vec3(1, 0, 0);
  } else if (absY <= absZ) {
    candidate = vec3(0, 1, 0);
  } else {
    candidate = vec3(0, 0, 1);
  }

  const uPerp = normalize3(cross3(axis, candidate));
  const vPerp = normalize3(cross3(uPerp, axis));
  return { uPerp, vPerp };
}

function unwrapAngles(values: number[]): number[] {
  if (values.length === 0) return values;
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    let v = values[i];
    const prev = out[i - 1];
    while (v - prev > Math.PI) v -= 2 * Math.PI;
    while (v - prev < -Math.PI) v += 2 * Math.PI;
    out.push(v);
  }
  return out;
}

function tessellateCylinderFace(
  model: TopoModel,
  faceId: FaceId,
  surface: CylinderSurface,
  reversed: boolean
): Mesh {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return createMesh([], [], []);

  const outerLoop = loops[0];
  const vertices3D = getLoopVertices(model, outerLoop);
  if (vertices3D.length < 3) return createMesh([], [], []);

  const axis = normalize3(surface.axis);
  const { uPerp, vPerp } = surface.uPerp && surface.vPerp
    ? { uPerp: surface.uPerp, vPerp: surface.vPerp }
    : computeOrthonormalBasis(axis);

  // Project vertices onto cylinder (u, vAngle) coordinates
  const uVals: number[] = [];
  const vAngles: number[] = [];
  for (const p of vertices3D) {
    const rel = sub3(p, surface.center);
    const u = dot3(rel, axis);
    const axisPoint = add3(surface.center, mul3(axis, u));
    const radial = sub3(p, axisPoint);

    // Angle convention matches evalSurface/surfaceNormal:
    // radial ≈ cos(v)*vPerp + sin(v)*uPerp
    const sinComp = dot3(radial, uPerp);
    const cosComp = dot3(radial, vPerp);
    const v = Math.atan2(sinComp, cosComp);
    uVals.push(u);
    vAngles.push(v);
  }

  const vUnwrapped = unwrapAngles(vAngles);
  const vertices2D: Vec2[] = vertices3D.map((_p, i) => vec2(vUnwrapped[i], uVals[i]));
  const triangleIndices = triangulatePolygon(vertices2D);
  if (triangleIndices.length === 0) return createMesh([], [], []);

  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < vertices3D.length; i++) {
    const p = vertices3D[i];
    positions.push(p[0], p[1], p[2]);
    let n = surfaceNormal(surface, uVals[i], vUnwrapped[i]);
    if (reversed) n = [-n[0], -n[1], -n[2]];
    normals.push(n[0], n[1], n[2]);
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

function tessellateConeFace(
  model: TopoModel,
  faceId: FaceId,
  surface: ConeSurface,
  reversed: boolean
): Mesh {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return createMesh([], [], []);
  const outerLoop = loops[0];
  const vertices3D = getLoopVertices(model, outerLoop);
  if (vertices3D.length < 3) return createMesh([], [], []);

  const axis = normalize3(surface.axis);
  const { uPerp, vPerp } = surface.uPerp && surface.vPerp
    ? { uPerp: surface.uPerp, vPerp: surface.vPerp }
    : computeOrthonormalBasis(axis);

  const uVals: number[] = [];
  const vAngles: number[] = [];
  for (const p of vertices3D) {
    const rel = sub3(p, surface.apex);
    const u = dot3(rel, axis);
    const axisPoint = add3(surface.apex, mul3(axis, u));
    const radial = sub3(p, axisPoint);
    const sinComp = dot3(radial, uPerp);
    const cosComp = dot3(radial, vPerp);
    const v = Math.atan2(sinComp, cosComp);
    uVals.push(u);
    vAngles.push(v);
  }

  const vUnwrapped = unwrapAngles(vAngles);
  const vertices2D: Vec2[] = vertices3D.map((_p, i) => vec2(vUnwrapped[i], uVals[i]));
  const triangleIndices = triangulatePolygon(vertices2D);
  if (triangleIndices.length === 0) return createMesh([], [], []);

  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < vertices3D.length; i++) {
    const p = vertices3D[i];
    positions.push(p[0], p[1], p[2]);
    let n = surfaceNormal(surface, uVals[i], vUnwrapped[i]);
    if (reversed) n = [-n[0], -n[1], -n[2]];
    normals.push(n[0], n[1], n[2]);
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

function tessellateSphereFace(
  model: TopoModel,
  faceId: FaceId,
  surface: SphereSurface,
  reversed: boolean
): Mesh {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return createMesh([], [], []);
  const outerLoop = loops[0];
  const vertices3D = getLoopVertices(model, outerLoop);
  if (vertices3D.length < 3) return createMesh([], [], []);

  const uVals: number[] = [];
  const vAngles: number[] = [];
  for (const p of vertices3D) {
    const rel = sub3(p, surface.center);
    const r = length3(rel);
    if (r < 1e-12) {
      uVals.push(0);
      vAngles.push(0);
      continue;
    }
    const nx = rel[0] / r;
    const ny = rel[1] / r;
    const nz = rel[2] / r;
    const u = Math.acos(Math.max(-1, Math.min(1, nz))); // colatitude
    const v = Math.atan2(ny, nx);
    uVals.push(u);
    vAngles.push(v);
  }

  const vUnwrapped = unwrapAngles(vAngles);
  const vertices2D: Vec2[] = vertices3D.map((_p, i) => vec2(vUnwrapped[i], uVals[i]));
  const triangleIndices = triangulatePolygon(vertices2D);
  if (triangleIndices.length === 0) return createMesh([], [], []);

  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < vertices3D.length; i++) {
    const p = vertices3D[i];
    positions.push(p[0], p[1], p[2]);
    let n = surfaceNormal(surface, uVals[i], vUnwrapped[i]);
    if (reversed) n = [-n[0], -n[1], -n[2]];
    normals.push(n[0], n[1], n[2]);
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

function tessellateTorusFace(
  model: TopoModel,
  faceId: FaceId,
  surface: TorusSurface,
  reversed: boolean
): Mesh {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return createMesh([], [], []);
  const outerLoop = loops[0];
  const vertices3D = getLoopVertices(model, outerLoop);
  if (vertices3D.length < 3) return createMesh([], [], []);

  const axis = normalize3(surface.axis);
  const { uPerp, vPerp } = surface.uPerp && surface.vPerp
    ? { uPerp: surface.uPerp, vPerp: surface.vPerp }
    : computeOrthonormalBasis(axis);

  const uAngles: number[] = [];
  const vAngles: number[] = [];

  for (const p of vertices3D) {
    const rel = sub3(p, surface.center);
    const axial = dot3(rel, axis);
    const axisPoint = add3(surface.center, mul3(axis, axial));
    const planar = sub3(p, axisPoint);
    const planarLen = length3(planar);
    const planarDir = planarLen > 1e-12 ? mul3(planar, 1 / planarLen) : vPerp;

    // v: around the axis (same convention as cylinder)
    const sinComp = dot3(planar, uPerp);
    const cosComp = dot3(planar, vPerp);
    const v = Math.atan2(sinComp, cosComp);
    vAngles.push(v);

    // u: around the tube circle (in plane spanned by planarDir and axis)
    const tubeCenter = add3(surface.center, mul3(planarDir, surface.majorRadius));
    const tubeVec = sub3(p, tubeCenter);
    const sinU = dot3(tubeVec, axis);
    const cosU = dot3(tubeVec, planarDir);
    const u = Math.atan2(sinU, cosU);
    uAngles.push(u);
  }

  const vUnwrapped = unwrapAngles(vAngles);
  const uUnwrapped = unwrapAngles(uAngles);

  const vertices2D: Vec2[] = vertices3D.map((_p, i) => vec2(vUnwrapped[i], uUnwrapped[i]));
  const triangleIndices = triangulatePolygon(vertices2D);
  if (triangleIndices.length === 0) return createMesh([], [], []);

  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < vertices3D.length; i++) {
    const p = vertices3D[i];
    positions.push(p[0], p[1], p[2]);
    let n = surfaceNormal(surface, uUnwrapped[i], vUnwrapped[i]);
    if (reversed) n = [-n[0], -n[1], -n[2]];
    normals.push(n[0], n[1], n[2]);
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
      return tessellateCylinderFace(model, faceId, surface, reversed);
    case 'cone':
      return tessellateConeFace(model, faceId, surface, reversed);
    case 'sphere':
      return tessellateSphereFace(model, faceId, surface, reversed);
    case 'torus':
      return tessellateTorusFace(model, faceId, surface, reversed);
      
    default:
      return createMesh([], [], []);
  }
}
