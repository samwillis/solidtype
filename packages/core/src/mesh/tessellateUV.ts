/**
 * UV-first (trim-driven) tessellation
 * 
 * Tessellates faces using p-curves for UV boundary sampling.
 * This is the preferred approach when p-curves are available,
 * providing accurate trim boundaries for curved surfaces.
 * 
 * Falls back to vertex-based tessellation when p-curves are not available.
 */

import type { Vec2 } from '../num/vec2.js';
import type { Vec3 } from '../num/vec3.js';
import { vec2 } from '../num/vec2.js';
import { normalize3 } from '../num/vec3.js';
import type { Surface } from '../geom/surface.js';
import { evalSurface, surfaceNormal } from '../geom/surface.js';
import { evalCurve2D } from '../geom/curve2d.js';
import { TopoModel } from '../topo/TopoModel.js';
import type { FaceId, LoopId } from '../topo/handles.js';
import { NULL_ID } from '../topo/handles.js';
import type { Mesh, TessellationOptions } from './types.js';
import { createMesh, DEFAULT_TESSELLATION_OPTIONS } from './types.js';
import { triangulatePolygonWithHoles, triangulatePolygon } from './triangulate.js';
import { surfacePointToUV } from '../geom/surfaceUv.js';
import { sampleCurve2DParams } from './sampleCurve.js';

/**
 * Result of sampling a loop in UV space
 */
interface LoopSample {
  uvPoints: Vec2[];
  positions: Vec3[];
  normals: Vec3[];
}

/**
 * Check if a face has p-curves on all half-edges
 */
export function faceHasPCurves(model: TopoModel, faceId: FaceId): boolean {
  const loops = model.getFaceLoops(faceId);
  for (const loopId of loops) {
    for (const heId of model.iterateLoopHalfEdges(loopId)) {
      const pcurveIdx = model.getHalfEdgePCurve(heId);
      if (pcurveIdx === NULL_ID) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Sample a loop using p-curves
 * 
 * @param model The TopoModel
 * @param loopId The loop to sample
 * @param surface The surface the loop lies on
 * @param options Tessellation options
 * @returns Sampled UV points, positions, and normals
 */
function sampleLoopWithPCurves(
  model: TopoModel,
  loopId: LoopId,
  surface: Surface,
  reversed: boolean,
  options: TessellationOptions
): LoopSample | null {
  const uvPoints: Vec2[] = [];
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  
  for (const heId of model.iterateLoopHalfEdges(loopId)) {
    const pcurveIdx = model.getHalfEdgePCurve(heId);
    if (pcurveIdx === NULL_ID) {
      return null; // No p-curve, fall back to vertex-based
    }
    
    const pcurve = model.getPCurve(pcurveIdx);
    const curve2d = model.getCurve2D(pcurve.curve2dIndex);
    const direction = model.getHalfEdgeDirection(heId);
    
    // Sample the p-curve with direction awareness
    // Use angular tolerance to compute curve segments
    const arcStep = options.angularTolerance ?? Math.PI / 18;
    const minArcSegs = Math.max(6, Math.ceil(Math.PI / arcStep));
    const params = sampleCurve2DParams(curve2d, direction, {
      minSegments: 1,
      minArcSegments: minArcSegs,
    });
    
    // Sample UV points (skip last to avoid duplicates at loop closure)
    for (let i = 0; i < params.length - 1; i++) {
      const t = params[i];
      const uv = evalCurve2D(curve2d, t);
      const pos = evalSurface(surface, uv[0], uv[1]);
      let n = surfaceNormal(surface, uv[0], uv[1]);
      if (reversed) {
        n = [-n[0], -n[1], -n[2]] as Vec3;
      }
      
      uvPoints.push(uv);
      positions.push(pos);
      normals.push(normalize3(n));
    }
  }
  
  return { uvPoints, positions, normals };
}

/**
 * Sample a loop using vertex positions and surface projection
 * Fallback when p-curves are not available
 */
function sampleLoopFromVertices(
  model: TopoModel,
  loopId: LoopId,
  surface: Surface,
  reversed: boolean
): LoopSample {
  const uvPoints: Vec2[] = [];
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  
  for (const heId of model.iterateLoopHalfEdges(loopId)) {
    const vertex = model.getHalfEdgeStartVertex(heId);
    const pos = model.getVertexPosition(vertex);
    
    // Project 3D point to UV
    const uv = surfacePointToUV(surface, pos);
    
    // Get normal
    let n = surfaceNormal(surface, uv[0], uv[1]);
    if (reversed) {
      n = [-n[0], -n[1], -n[2]] as Vec3;
    }
    
    uvPoints.push(uv);
    positions.push(pos);
    normals.push(normalize3(n));
  }
  
  return { uvPoints, positions, normals };
}

/**
 * Unwrap angles for periodic surfaces (cylinder, torus, etc.)
 * Ensures consecutive UV values don't jump across the seam
 */
function unwrapUVSeam(uvPoints: Vec2[], surface: Surface): Vec2[] {
  if (surface.kind === 'plane') {
    return uvPoints; // No seam issue for planes
  }
  
  // For periodic surfaces, unwrap the angular component
  const result: Vec2[] = [uvPoints[0]];
  
  for (let i = 1; i < uvPoints.length; i++) {
    const prev = result[i - 1];
    let [u, v] = uvPoints[i];
    
    // Unwrap v (the periodic angle) for cylinder/cone
    if (surface.kind === 'cylinder' || surface.kind === 'cone') {
      while (v - prev[1] > Math.PI) v -= 2 * Math.PI;
      while (v - prev[1] < -Math.PI) v += 2 * Math.PI;
    }
    
    // Unwrap both u and v for torus
    if (surface.kind === 'torus') {
      while (u - prev[0] > Math.PI) u -= 2 * Math.PI;
      while (u - prev[0] < -Math.PI) u += 2 * Math.PI;
      while (v - prev[1] > Math.PI) v -= 2 * Math.PI;
      while (v - prev[1] < -Math.PI) v += 2 * Math.PI;
    }
    
    // Unwrap v for sphere
    if (surface.kind === 'sphere') {
      while (v - prev[1] > Math.PI) v -= 2 * Math.PI;
      while (v - prev[1] < -Math.PI) v += 2 * Math.PI;
    }
    
    result.push(vec2(u, v));
  }
  
  return result;
}

/**
 * Tessellate a face using UV-first approach
 * 
 * Uses p-curves when available, falls back to vertex projection otherwise.
 * Supports holes (inner loops) via polygon triangulation with holes.
 */
export function tessellateFaceUV(
  model: TopoModel,
  faceId: FaceId,
  options: TessellationOptions = DEFAULT_TESSELLATION_OPTIONS
): Mesh {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) {
    return createMesh([], [], []);
  }
  
  const surfaceIdx = model.getFaceSurfaceIndex(faceId);
  const surface = model.getSurface(surfaceIdx);
  const reversed = model.isFaceReversed(faceId);
  
  // Sample all loops
  const loopSamples: LoopSample[] = [];
  
  for (const loopId of loops) {
    // Try p-curve sampling first
    let sample = sampleLoopWithPCurves(model, loopId, surface, reversed, options);
    
    if (!sample) {
      // Fall back to vertex-based sampling
      sample = sampleLoopFromVertices(model, loopId, surface, reversed);
    }
    
    if (sample.uvPoints.length < 3) {
      continue; // Skip degenerate loops
    }
    
    // Unwrap seams for periodic surfaces
    sample.uvPoints = unwrapUVSeam(sample.uvPoints, surface);
    
    loopSamples.push(sample);
  }
  
  if (loopSamples.length === 0) {
    return createMesh([], [], []);
  }
  
  // Triangulate
  let triangleIndices: number[];
  
  if (loopSamples.length === 1) {
    // Simple polygon (no holes)
    triangleIndices = triangulatePolygon(loopSamples[0].uvPoints);
  } else {
    // Polygon with holes
    const outer = loopSamples[0].uvPoints;
    const holes = loopSamples.slice(1).map(s => s.uvPoints);
    triangleIndices = triangulatePolygonWithHoles(outer, holes);
  }
  
  if (triangleIndices.length === 0) {
    return createMesh([], [], []);
  }
  
  // Build combined vertex arrays
  const allPositions: Vec3[] = [];
  const allNormals: Vec3[] = [];
  
  for (const sample of loopSamples) {
    allPositions.push(...sample.positions);
    allNormals.push(...sample.normals);
  }
  
  // Convert to flat arrays
  const positions: number[] = [];
  const normals: number[] = [];
  
  for (let i = 0; i < allPositions.length; i++) {
    positions.push(allPositions[i][0], allPositions[i][1], allPositions[i][2]);
    normals.push(allNormals[i][0], allNormals[i][1], allNormals[i][2]);
  }
  
  // Handle face reversal for triangle winding
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
