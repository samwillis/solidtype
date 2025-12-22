/**
 * Healing for planar boolean results.
 * 
 * Post-processing to fix minor issues in the result:
 * - Weld vertices within tolerance
 * - Merge colinear edges
 * - Delete sliver/degenerate faces
 * - Validate manifoldness
 */

import type { Vec3 } from '../../num/vec3.js';
import { sub3, cross3, length3 } from '../../num/vec3.js';
import type { NumericContext } from '../../num/tolerance.js';
import type { TopoModel } from '../../topo/TopoModel.js';
import type { BodyId, FaceId } from '../../topo/handles.js';

/**
 * Healing options
 */
export interface HealOptions {
  /** Tolerance for vertex merging */
  mergeVertexTol?: number;
  /** Tolerance for colinear edge merging (cos of angle) */
  colinearAngleTol?: number;
  /** Minimum face area to keep */
  minFaceArea?: number;
}

/**
 * Healing result
 */
export interface HealResult {
  success: boolean;
  /** Number of vertices merged */
  verticesMerged: number;
  /** Number of edges merged */
  edgesMerged: number;
  /** Number of sliver faces removed */
  facesCulled: number;
  /** Validation errors (empty if manifold) */
  errors: string[];
}

/**
 * Heal a boolean result body
 */
export function healBody(
  model: TopoModel,
  bodyId: BodyId,
  _ctx: NumericContext,
  _options: HealOptions = {}
): HealResult {
  const result: HealResult = {
    success: true,
    verticesMerged: 0,
    edgesMerged: 0,
    facesCulled: 0,
    errors: []
  };
  
  // For now, just validate manifoldness
  const validationErrors = validateManifold(model, bodyId);
  result.errors = validationErrors;
  result.success = validationErrors.length === 0;
  
  return result;
}

/**
 * Validate that a body is manifold
 */
function validateManifold(model: TopoModel, bodyId: BodyId): string[] {
  const errors: string[] = [];
  
  // Count half-edges per edge
  const edgeUsage = new Map<number, number>();
  
  const shells = model.getBodyShells(bodyId);
  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    for (const faceId of faces) {
      const loops = model.getFaceLoops(faceId);
      for (const loopId of loops) {
        for (const heId of model.iterateLoopHalfEdges(loopId)) {
          const edgeId = model.getHalfEdgeEdge(heId);
          const count = edgeUsage.get(edgeId) || 0;
          edgeUsage.set(edgeId, count + 1);
        }
      }
    }
  }
  
  // Check that each edge has exactly 2 half-edges
  for (const [edgeId, count] of edgeUsage) {
    if (count !== 2) {
      errors.push(`Edge ${edgeId} has ${count} half-edges (expected 2 for manifold)`);
    }
  }
  
  // Check that each edge has its twin set
  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    for (const faceId of faces) {
      const loops = model.getFaceLoops(faceId);
      for (const loopId of loops) {
        for (const heId of model.iterateLoopHalfEdges(loopId)) {
          const twin = model.getHalfEdgeTwin(heId);
          if (twin < 0) {
            errors.push(`HalfEdge ${heId} has no twin`);
          }
        }
      }
    }
  }
  
  return errors;
}

/**
 * Compute face area (for sliver detection)
 */
export function computeFaceArea(
  model: TopoModel,
  faceId: FaceId
): number {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return 0;
  
  const outerLoop = loops[0];
  const vertices: Vec3[] = [];
  
  for (const he of model.iterateLoopHalfEdges(outerLoop)) {
    const vertex = model.getHalfEdgeStartVertex(he);
    vertices.push(model.getVertexPosition(vertex));
  }
  
  if (vertices.length < 3) return 0;
  
  // Compute area using cross product method
  let area = 0;
  const v0 = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    const v1 = vertices[i];
    const v2 = vertices[i + 1];
    const e1 = sub3(v1, v0);
    const e2 = sub3(v2, v0);
    const cross = cross3(e1, e2);
    area += length3(cross) / 2;
  }
  
  return area;
}
