/**
 * @solidtype/oo - Object-oriented façade for SolidType
 * 
 * This package provides ergonomic class-based APIs wrapping @solidtype/core:
 * - SolidSession - main entry point for modeling operations
 * - Body, Face, Edge - wrappers for topological entities
 * - Integration with persistent naming via PersistentRef
 */

import {
  // Numeric types
  type Vec3,
  vec3,
  sub3,
  dot3,
  cross3,
  normalize3,
  length3,
  
  // Tolerance
  type NumericContext,
  createNumericContext,
  
  // Topology types
  type TopoModel,
  type BodyId,
  type FaceId,
  type EdgeId,
  type VertexId,
  type ShellId,
  createEmptyModel,
  getBodyShells,
  getShellFaces,
  getFaceLoops,
  getLoopFirstHalfEdge,
  getHalfEdgeNext,
  getHalfEdgeStartVertex,
  getVertexPosition,
  getFaceSurfaceIndex,
  getSurface,
  isFaceReversed,
  isNullId,
  
  // Surface
  surfaceNormal,
  
  // Naming
  type NamingStrategy,
  type PersistentRef,
  type ResolveResult,
  type SubshapeRef,
  type FeatureId,
  createNamingStrategy,
  faceRef,
  
  // Model operations
  type SketchProfile,
  type DatumPlane,
  type ExtrudeOptions,
  type ExtrudeResult,
  type RevolveOptions,
  type RevolveResult,
  type RevolveAxis,
  type BooleanOptions,
  type BooleanResult,
  extrude,
  revolve,
  booleanOperation,
  createDatumPlane,
  XY_PLANE,
  YZ_PLANE,
  ZX_PLANE,
  createRectangleProfile,
  createCircleProfile,
  
  // Mesh
  type Mesh,
  tessellateBody,
} from '@solidtype/core';

// Re-export useful types
export type {
  Vec3,
  NumericContext,
  SketchProfile,
  DatumPlane,
  PersistentRef,
  ResolveResult,
  SubshapeRef,
  FeatureId,
  Mesh,
};

// Re-export utility functions
export { vec3 };

/**
 * Ray for intersection tests
 */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/**
 * Face selection result
 */
export interface FaceSelectionResult {
  face: Face;
  persistentRef: PersistentRef;
  hitPoint: Vec3;
  distance: number;
}

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
   * Get the body this face belongs to
   */
  getBody(): Body {
    return new Body(this.session, this.bodyId);
  }
}

/**
 * Edge wrapper class
 */
export class Edge {
  constructor(
    private readonly session: SolidSession,
    private readonly bodyId: BodyId,
    public readonly id: EdgeId
  ) {}
  
  /**
   * Get the body this edge belongs to
   */
  getBody(): Body {
    return new Body(this.session, this.bodyId);
  }
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
  tessellate(options?: { tolerance?: number }): Mesh {
    const model = this.session.getModel();
    return tessellateBody(model, this.id, options);
  }
  
  /**
   * Select a face by ray intersection
   * 
   * @param ray The ray to test
   * @returns Selection result with face and PersistentRef, or null if no hit
   */
  selectFaceByRay(ray: Ray): FaceSelectionResult | null {
    const model = this.session.getModel();
    const naming = this.session.getNamingStrategy();
    
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
    
    // Create a PersistentRef for the selected face
    // For now, we use a simple selector based on the face ID
    // In a more complete implementation, this would look up
    // any existing PersistentRef or create one
    const persistentRef = this.createFaceRef(closestFace);
    
    return {
      face,
      persistentRef,
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
   * Create a PersistentRef for a face (ad-hoc reference)
   */
  private createFaceRef(faceId: FaceId): PersistentRef {
    const naming = this.session.getNamingStrategy();
    const featureId = naming.allocateFeatureId();
    
    // Create a simple selector for the face
    const selector = {
      kind: 'selection.face',
      data: { faceId: faceId as number },
    };
    
    const model = this.session.getModel();
    const ref = faceRef(this.id, faceId);
    
    // Record the birth
    return naming.recordBirth(featureId, selector, ref);
  }
}

/**
 * SolidSession - main entry point for modeling operations
 */
export class SolidSession {
  private model: TopoModel;
  private naming: NamingStrategy;
  
  constructor(ctx?: NumericContext) {
    const numericCtx = ctx ?? createNumericContext();
    this.model = createEmptyModel(numericCtx);
    this.naming = createNamingStrategy();
  }
  
  /**
   * Get the underlying topology model
   * @internal For advanced use only
   */
  getModel(): TopoModel {
    return this.model;
  }
  
  /**
   * Get the naming strategy
   * @internal For advanced use only
   */
  getNamingStrategy(): NamingStrategy {
    return this.naming;
  }
  
  /**
   * Create a datum plane
   */
  createDatumPlane(origin: Vec3, normal: Vec3, xDir: Vec3): DatumPlane {
    return createDatumPlane(origin, normal, xDir);
  }
  
  /**
   * Get the XY datum plane
   */
  getXYPlane(): DatumPlane {
    return XY_PLANE;
  }
  
  /**
   * Get the YZ datum plane
   */
  getYZPlane(): DatumPlane {
    return YZ_PLANE;
  }
  
  /**
   * Get the ZX datum plane
   */
  getZXPlane(): DatumPlane {
    return ZX_PLANE;
  }
  
  /**
   * Create a rectangular sketch profile
   */
  createRectangleProfile(
    plane: DatumPlane,
    width: number,
    height: number,
    centerX: number = 0,
    centerY: number = 0
  ): SketchProfile {
    return createRectangleProfile(plane, width, height, centerX, centerY);
  }
  
  /**
   * Create a circular sketch profile
   */
  createCircleProfile(
    plane: DatumPlane,
    radius: number,
    centerX: number = 0,
    centerY: number = 0,
    segments?: number
  ): SketchProfile {
    return createCircleProfile(plane, radius, centerX, centerY, segments);
  }
  
  /**
   * Extrude a profile to create a body
   */
  extrude(profile: SketchProfile, options: Omit<ExtrudeOptions, 'namingStrategy'>): ExtrudeResult & { body?: Body } {
    const result = extrude(this.model, profile, {
      ...options,
      namingStrategy: this.naming,
    });
    
    return {
      ...result,
      body: result.body !== undefined ? new Body(this, result.body) : undefined,
    } as ExtrudeResult & { body?: Body };
  }
  
  /**
   * Revolve a profile to create a body
   */
  revolve(profile: SketchProfile, options: Omit<RevolveOptions, 'namingStrategy'>): RevolveResult & { body?: Body } {
    const result = revolve(this.model, profile, {
      ...options,
      namingStrategy: this.naming,
    });
    
    return {
      ...result,
      body: result.body !== undefined ? new Body(this, result.body) : undefined,
    } as RevolveResult & { body?: Body };
  }
  
  /**
   * Perform a boolean operation on two bodies
   */
  boolean(
    bodyA: Body,
    bodyB: Body,
    options: Omit<BooleanOptions, 'namingStrategy'>
  ): BooleanResult & { body?: Body } {
    const result = booleanOperation(this.model, bodyA.id, bodyB.id, {
      ...options,
      namingStrategy: this.naming,
    });
    
    return {
      ...result,
      body: result.body !== undefined ? new Body(this, result.body) : undefined,
    } as BooleanResult & { body?: Body };
  }
  
  /**
   * Union two bodies
   */
  union(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body } {
    return this.boolean(bodyA, bodyB, { operation: 'union' });
  }
  
  /**
   * Subtract bodyB from bodyA
   */
  subtract(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body } {
    return this.boolean(bodyA, bodyB, { operation: 'subtract' });
  }
  
  /**
   * Intersect two bodies
   */
  intersect(bodyA: Body, bodyB: Body): BooleanResult & { body?: Body } {
    return this.boolean(bodyA, bodyB, { operation: 'intersect' });
  }
  
  /**
   * Clear all naming data (useful for testing)
   */
  clearNaming(): void {
    this.naming.clear();
  }
  
  /**
   * Resolve a PersistentRef
   */
  resolve(ref: PersistentRef): ResolveResult {
    return this.naming.resolve(ref, this.model);
  }
}

// Export the default session creator
export { createNamingStrategy };

// Re-export standard planes for convenience
export { XY_PLANE, YZ_PLANE, ZX_PLANE };
