/**
 * Face wrapper class
 * 
 * Provides an object-oriented interface to face entities in the BREP model.
 */

import type { Vec3 } from '../num/vec3.js';
import { vec3 } from '../num/vec3.js';
import type { BodyId, FaceId } from '../topo/handles.js';
import { isNullId } from '../topo/handles.js';
import {
  getFaceSurfaceIndex,
  getSurface,
  isFaceReversed,
  getFaceLoops,
  getLoopFirstHalfEdge,
  getHalfEdgeNext,
  getHalfEdgeStartVertex,
  getVertexPosition,
} from '../topo/model.js';
import { surfaceNormal } from '../geom/surface.js';
import type { SolidSession } from './SolidSession.js';

/**
 * Face wrapper class
 */
export class Face {
  constructor(
    private readonly session: SolidSession,
    private readonly bodyId: BodyId,
    public readonly id: FaceId
  ) {}
  
  /**
   * Get the face normal at a point (currently returns surface normal at origin)
   */
  getNormal(): Vec3 {
    const model = this.session.getModel();
    const surfaceIdx = getFaceSurfaceIndex(model, this.id);
    const surface = getSurface(model, surfaceIdx);
    let normal = surfaceNormal(surface, 0, 0);
    if (isFaceReversed(model, this.id)) {
      normal = [-normal[0], -normal[1], -normal[2]] as Vec3;
    }
    return normal;
  }
  
  /**
   * Get the centroid of the face
   */
  getCentroid(): Vec3 {
    const model = this.session.getModel();
    const loops = getFaceLoops(model, this.id);
    if (loops.length === 0) return vec3(0, 0, 0);
    
    let sum: Vec3 = vec3(0, 0, 0);
    let count = 0;
    
    const firstHe = getLoopFirstHalfEdge(model, loops[0]);
    if (isNullId(firstHe)) return vec3(0, 0, 0);
    
    let he = firstHe;
    do {
      const vertex = getHalfEdgeStartVertex(model, he);
      const pos = getVertexPosition(model, vertex);
      sum = [sum[0] + pos[0], sum[1] + pos[1], sum[2] + pos[2]];
      count++;
      he = getHalfEdgeNext(model, he);
    } while (he !== firstHe && !isNullId(he));
    
    return count > 0 
      ? [sum[0] / count, sum[1] / count, sum[2] / count]
      : vec3(0, 0, 0);
  }
  
  /**
   * Get the body ID this face belongs to
   */
  getBodyId(): BodyId {
    return this.bodyId;
  }
}
