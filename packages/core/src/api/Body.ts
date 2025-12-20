/**
 * Body wrapper class
 * 
 * Provides an object-oriented interface to body entities in the BREP model.
 */

import type { Vec3 } from '../num/vec3.js';
import { sub3, dot3 } from '../num/vec3.js';
import type { BodyId, FaceId } from '../topo/handles.js';
import { isNullId } from '../topo/handles.js';
import {
  getBodyShells,
  getShellFaces,
  getFaceSurfaceIndex,
  getSurface,
  isFaceReversed,
  getFaceLoops,
  getLoopFirstHalfEdge,
  getHalfEdgeNext,
  getHalfEdgeStartVertex,
  getVertexPosition,
} from '../topo/model.js';
import type { Mesh, TessellationOptions } from '../mesh/types.js';
import { tessellateBody } from '../mesh/tessellateBody.js';
import type { PersistentRef, ResolveResult } from '../naming/types.js';
import { faceRef } from '../naming/types.js';
import type { SolidSession } from './SolidSession.js';
import { Face } from './Face.js';
import type { Ray } from './types.js';

/**
 * Face selection result
 */
export interface FaceSelectionResult {
  face: Face;
  /** 
   * The PersistentRef for the selected face, if one exists.
   * Will be null if the face was not created by a tracked feature.
   */
  persistentRef: PersistentRef | null;
  hitPoint: Vec3;
  distance: number;
}

/**
 * Body wrapper class
 */
export class Body {
  constructor(
    private readonly session: SolidSession,
    public readonly id: BodyId
  ) {}
  
  /**
   * Get all faces of this body
   */
  getFaces(): Face[] {
    const model = this.session.getModel();
    const faces: Face[] = [];
    
    const shells = getBodyShells(model, this.id);
    for (const shellId of shells) {
      const shellFaces = getShellFaces(model, shellId);
      for (const faceId of shellFaces) {
        faces.push(new Face(this.session, this.id, faceId));
      }
    }
    
    return faces;
  }
  
  /**
   * Tessellate this body into a triangle mesh
   */
  tessellate(options?: TessellationOptions): Mesh {
    const model = this.session.getModel();
    return tessellateBody(model, this.id, options);
  }
  
  /**
   * Select a face by ray intersection
   * 
   * Returns the existing PersistentRef for the face if one exists,
   * otherwise returns null for the persistentRef (the face wasn't
   * created by a tracked feature).
   * 
   * @param ray The ray to test
   * @returns Selection result with face and PersistentRef, or null if no hit
   */
  selectFaceByRay(ray: Ray): FaceSelectionResult | null {
    const model = this.session.getModel();
    
    let closestFace: FaceId | null = null;
    let closestDistance = Infinity;
    let closestHitPoint: Vec3 | null = null;
    
    const shells = getBodyShells(model, this.id);
    for (const shellId of shells) {
      const faces = getShellFaces(model, shellId);
      for (const faceId of faces) {
        const result = this.intersectRayWithFace(ray, faceId);
        if (result && result.distance < closestDistance) {
          closestDistance = result.distance;
          closestFace = faceId;
          closestHitPoint = result.hitPoint;
        }
      }
    }
    
    if (closestFace === null || closestHitPoint === null) {
      return null;
    }
    
    const face = new Face(this.session, this.id, closestFace);
    
    // Look up existing PersistentRef for this face
    // This returns the ref from the feature that created the face
    const persistentRef = this.lookupExistingRef(closestFace);
    
    return {
      face,
      persistentRef: persistentRef ?? null,
      hitPoint: closestHitPoint,
      distance: closestDistance,
    };
  }
  
  /**
   * Resolve a PersistentRef to a Face
   * 
   * @param ref The persistent reference to resolve
   * @returns The resolved Face, or null if not found/ambiguous
   */
  resolve(ref: PersistentRef): Face | null {
    const model = this.session.getModel();
    const naming = this.session.getNamingStrategy();
    
    const result = naming.resolve(ref, model);
    
    if (result.status === 'found' && result.ref.type === 'face') {
      return new Face(this.session, result.ref.body, result.ref.id as FaceId);
    }
    
    return null;
  }
  
  /**
   * Resolve a PersistentRef with full result information
   */
  resolveWithResult(ref: PersistentRef): ResolveResult {
    const model = this.session.getModel();
    const naming = this.session.getNamingStrategy();
    return naming.resolve(ref, model);
  }
  
  /**
   * Get the PersistentRef for a face by its ID
   * 
   * @param faceId The face ID to look up
   * @returns The PersistentRef or null if not found
   */
  getRefForFace(faceId: FaceId): PersistentRef | null {
    return this.lookupExistingRef(faceId);
  }
  
  /**
   * Intersect a ray with a face (simple planar intersection)
   */
  private intersectRayWithFace(
    ray: Ray,
    faceId: FaceId
  ): { hitPoint: Vec3; distance: number } | null {
    const model = this.session.getModel();
    const surfaceIdx = getFaceSurfaceIndex(model, faceId);
    const surface = getSurface(model, surfaceIdx);
    
    if (surface.kind !== 'plane') {
      // TODO: Support non-planar surfaces
      return null;
    }
    
    let normal = surface.normal;
    if (isFaceReversed(model, faceId)) {
      normal = [-normal[0], -normal[1], -normal[2]] as Vec3;
    }
    
    // Ray-plane intersection
    const denom = dot3(ray.direction, surface.normal);
    if (Math.abs(denom) < 1e-10) {
      return null; // Ray parallel to plane
    }
    
    const t = dot3(sub3(surface.origin, ray.origin), surface.normal) / denom;
    if (t < 0) {
      return null; // Intersection behind ray
    }
    
    const hitPoint: Vec3 = [
      ray.origin[0] + ray.direction[0] * t,
      ray.origin[1] + ray.direction[1] * t,
      ray.origin[2] + ray.direction[2] * t,
    ];
    
    // Check if hit point is inside the face boundary
    if (!this.isPointInFace(hitPoint, faceId)) {
      return null;
    }
    
    return { hitPoint, distance: t };
  }
  
  /**
   * Check if a point is inside a face boundary
   */
  private isPointInFace(point: Vec3, faceId: FaceId): boolean {
    const model = this.session.getModel();
    const surfaceIdx = getFaceSurfaceIndex(model, faceId);
    const surface = getSurface(model, surfaceIdx);
    
    if (surface.kind !== 'plane') {
      return false;
    }
    
    // Project point onto plane's 2D coordinate system
    const v = sub3(point, surface.origin);
    const u2d = dot3(v, surface.xDir);
    const v2d = dot3(v, surface.yDir);
    
    // Get face boundary vertices in 2D
    const loops = getFaceLoops(model, faceId);
    if (loops.length === 0) return false;
    
    const vertices2D: [number, number][] = [];
    const firstHe = getLoopFirstHalfEdge(model, loops[0]);
    if (isNullId(firstHe)) return false;
    
    let he = firstHe;
    do {
      const vertex = getHalfEdgeStartVertex(model, he);
      const pos = getVertexPosition(model, vertex);
      const pv = sub3(pos, surface.origin);
      vertices2D.push([dot3(pv, surface.xDir), dot3(pv, surface.yDir)]);
      he = getHalfEdgeNext(model, he);
    } while (he !== firstHe && !isNullId(he));
    
    // Point in polygon test (ray casting)
    return this.pointInPolygon2D(u2d, v2d, vertices2D);
  }
  
  /**
   * 2D point in polygon test
   */
  private pointInPolygon2D(
    x: number,
    y: number,
    vertices: [number, number][]
  ): boolean {
    const n = vertices.length;
    let inside = false;
    
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = vertices[i][0];
      const yi = vertices[i][1];
      const xj = vertices[j][0];
      const yj = vertices[j][1];
      
      if (((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }
  
  /**
   * Look up an existing PersistentRef for a face
   * 
   * Returns the ref from the feature that created the face, or null if
   * no ref exists (face wasn't created by a tracked feature).
   */
  private lookupExistingRef(faceId: FaceId): PersistentRef | null {
    const naming = this.session.getNamingStrategy();
    const subshape = faceRef(this.id, faceId);
    return naming.lookupRefForSubshape(subshape);
  }
}
