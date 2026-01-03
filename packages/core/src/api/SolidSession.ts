/**
 * SolidSession - main entry point for modeling operations
 *
 * Provides an object-oriented interface for creating and manipulating solid models.
 * Uses OpenCascade.js as the underlying kernel.
 */

import type { Vec3 } from "../num/vec3.js";
import type { Vec2 } from "../num/vec2.js";
import type { DatumPlane } from "../model/planes.js";
import { createDatumPlaneFromNormal, XY_PLANE, YZ_PLANE, ZX_PLANE } from "../model/planes.js";
import type { SketchProfile } from "../model/sketchProfile.js";
import {
  createRectangleProfile,
  createCircleProfile,
  createPolygonProfile,
} from "../model/sketchProfile.js";
import { Sketch } from "./Sketch.js";

// Import kernel functions (internal - not exported from @solidtype/core)
import {
  initOCCT,
  Shape,
  makeBox,
  makeCylinder,
  makeSphere,
  booleanOp,
  extrude,
  extrudeSymmetric,
  revolve,
  filletAllEdges,
  chamferAllEdges,
  tessellate,
  getBoundingBox,
  getFacePlane as kernelGetFacePlane,
  sketchProfileToFace,
  getPlaneNormal,
  exportSTEP,
  importSTEP,
  type TessellationQuality,
  type FacePlaneData,
} from "../kernel/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Opaque handle to a body in the session */
export type BodyId = number & { readonly __brand: `BodyId` };

/** Opaque handle to a face */
export type FaceId = number & { readonly __brand: `FaceId` };

/** Opaque handle to an edge */
export type EdgeId = number & { readonly __brand: `EdgeId` };

/** Tessellated mesh for rendering */
export interface Mesh {
  /** Vertex positions (xyzxyz...) */
  readonly positions: Float32Array;
  /** Vertex normals (xyzxyz...), same length as positions */
  readonly normals: Float32Array;
  /** Triangle indices (3 per triangle) */
  readonly indices: Uint32Array;
  /** Maps each triangle to its face index (for 3D selection) */
  readonly faceMap: Uint32Array;
  /** B-Rep edge line segments for CAD-style rendering (x1y1z1 x2y2z2...) */
  readonly edges?: Float32Array;
  /** Maps each edge segment to its edge index (for 3D edge selection) */
  readonly edgeMap?: Uint32Array;
}

/** Bounding box */
export interface BoundingBox {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

/** Result of a modeling operation */
export type OperationResult<T = void> =
  | { success: true; value: T }
  | { success: false; error: ModelingError };

/** Modeling error with context */
export interface ModelingError {
  code: `BOOLEAN_FAILED` | `INVALID_PROFILE` | `SELF_INTERSECTION` | `NOT_INITIALIZED` | `UNKNOWN`;
  message: string;
  details?: Record<string, unknown>;
}

export type ExtrudeOperation = `add` | `cut` | `new`;

export interface ExtrudeOptions {
  operation: ExtrudeOperation;
  distance: number;
  direction?: [number, number, number]; // Default: profile plane normal
  symmetric?: boolean; // Extrude both directions
  targetBody?: BodyId; // For add/cut operations
}

export interface RevolveOptions {
  operation?: ExtrudeOperation;
  axis: { origin: [number, number, number]; direction: [number, number, number] };
  angleDegrees: number;
  targetBody?: BodyId;
}

export interface FilletOptions {
  radius: number;
  edges?: EdgeId[]; // If omitted, fillet all edges
}

// ─────────────────────────────────────────────────────────────────────────────
// SolidSession Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main session for solid modeling operations.
 *
 * This is the primary API for the app to interact with the CAD kernel.
 * The underlying implementation (OCCT) is completely hidden.
 *
 * @example
 * ```typescript
 * const session = new SolidSession();
 * await session.init();
 *
 * const profile = session.createRectangleProfile(session.getXYPlane(), 10, 20);
 * const result = session.extrude(profile, { operation: 'new', distance: 5 });
 * if (result.success) {
 *   const mesh = session.tessellate(result.value);
 * }
 * ```
 */
export class SolidSession {
  private bodies: Map<number, Shape> = new Map();
  private nextBodyId = 0;
  private initialized = false;

  /**
   * Initialize the session. Must be called before any operations.
   * Loads the WASM kernel asynchronously.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await initOCCT();
    this.initialized = true;
  }

  /**
   * Check if the session is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Session not initialized. Call init() first.`);
    }
  }

  private allocateBodyId(): BodyId {
    return this.nextBodyId++ as BodyId;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Datum Planes
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a datum plane
   */
  createDatumPlane(origin: Vec3, normal: Vec3, xDir?: Vec3): DatumPlane {
    return createDatumPlaneFromNormal(`custom`, origin, normal, xDir);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Primitives
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a box primitive
   */
  createBox(width: number, height: number, depth: number, centered = false): BodyId {
    this.ensureInitialized();
    const shape = makeBox(width, height, depth, centered);
    const id = this.allocateBodyId();
    this.bodies.set(id, shape);
    return id;
  }

  /**
   * Create a cylinder primitive
   */
  createCylinder(radius: number, height: number): BodyId {
    this.ensureInitialized();
    const shape = makeCylinder(radius, height);
    const id = this.allocateBodyId();
    this.bodies.set(id, shape);
    return id;
  }

  /**
   * Create a sphere primitive
   */
  createSphere(radius: number): BodyId {
    this.ensureInitialized();
    const shape = makeSphere(radius);
    const id = this.allocateBodyId();
    this.bodies.set(id, shape);
    return id;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sketches
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new sketch on a datum plane
   *
   * @param plane The datum plane for the sketch
   * @param name Optional name for the sketch
   * @returns A new Sketch instance
   */
  createSketch(plane: DatumPlane, name?: string): Sketch {
    return new Sketch(plane, name);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Profiles
  // ─────────────────────────────────────────────────────────────────────────────

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
    centerY: number = 0
  ): SketchProfile {
    return createCircleProfile(plane, radius, centerX, centerY);
  }

  /**
   * Create a profile from arbitrary vertices
   */
  createPolygonProfile(plane: DatumPlane, vertices: Vec2[]): SketchProfile {
    return createPolygonProfile(plane, vertices);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sketch-based operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Extrude a sketch to create or modify a body
   *
   * @param sketch The solved sketch to extrude
   * @param options Extrusion options
   * @returns Result with body ID or error
   */
  extrudeSketch(sketch: Sketch, options: ExtrudeOptions): OperationResult<BodyId> {
    const profile = sketch.toProfile();
    if (!profile) {
      return {
        success: false,
        error: {
          code: `INVALID_PROFILE`,
          message: `Could not convert sketch to profile - ensure sketch forms closed loops`,
        },
      };
    }
    return this.extrude(profile, options);
  }

  /**
   * Extrude a sketch profile
   */
  extrude(profile: SketchProfile, options: ExtrudeOptions): OperationResult<BodyId> {
    this.ensureInitialized();

    try {
      // Convert profile to OCCT face
      const face = sketchProfileToFace(profile);

      // Get extrusion direction
      const direction = options.direction ?? getPlaneNormal(profile.plane);

      // Create extruded solid
      let extrudedShape: Shape;
      if (options.symmetric) {
        extrudedShape = extrudeSymmetric(face, direction, options.distance);
      } else {
        extrudedShape = extrude(face, direction, options.distance);
      }
      face.dispose();

      // Handle operation type
      if (options.operation === `add` && options.targetBody !== undefined) {
        // Union with existing body
        const target = this.bodies.get(options.targetBody);
        if (!target) {
          extrudedShape.dispose();
          return {
            success: false,
            error: { code: `UNKNOWN`, message: `Body ${options.targetBody} not found` },
          };
        }

        const result = booleanOp(target, extrudedShape, `union`);
        target.dispose();
        extrudedShape.dispose();

        if (!result.success || !result.shape) {
          return {
            success: false,
            error: { code: `BOOLEAN_FAILED`, message: result.error ?? `Union failed` },
          };
        }

        this.bodies.set(options.targetBody, result.shape);
        return { success: true, value: options.targetBody };
      } else if (options.operation === `cut` && options.targetBody !== undefined) {
        // Subtract from existing body
        const target = this.bodies.get(options.targetBody);
        if (!target) {
          extrudedShape.dispose();
          return {
            success: false,
            error: { code: `UNKNOWN`, message: `Body ${options.targetBody} not found` },
          };
        }

        const result = booleanOp(target, extrudedShape, `subtract`);
        target.dispose();
        extrudedShape.dispose();

        if (!result.success || !result.shape) {
          return {
            success: false,
            error: { code: `BOOLEAN_FAILED`, message: result.error ?? `Cut failed` },
          };
        }

        this.bodies.set(options.targetBody, result.shape);
        return { success: true, value: options.targetBody };
      } else {
        // Create new body
        const id = this.allocateBodyId();
        this.bodies.set(id, extrudedShape);
        return { success: true, value: id };
      }
    } catch (e) {
      return {
        success: false,
        error: {
          code: `UNKNOWN`,
          message: e instanceof Error ? e.message : `Unknown extrude error`,
        },
      };
    }
  }

  /**
   * Revolve a sketch profile around an axis
   */
  revolve(profile: SketchProfile, options: RevolveOptions): OperationResult<BodyId> {
    this.ensureInitialized();

    try {
      // Convert profile to OCCT face
      const face = sketchProfileToFace(profile);

      // Revolve
      const revolvedShape = revolve(
        face,
        options.axis.origin,
        options.axis.direction,
        options.angleDegrees
      );
      face.dispose();

      const operation = options.operation ?? `new`;

      // Handle operation type
      if (operation === `add` && options.targetBody !== undefined) {
        const target = this.bodies.get(options.targetBody);
        if (!target) {
          revolvedShape.dispose();
          return {
            success: false,
            error: { code: `UNKNOWN`, message: `Body ${options.targetBody} not found` },
          };
        }

        const result = booleanOp(target, revolvedShape, `union`);
        target.dispose();
        revolvedShape.dispose();

        if (!result.success || !result.shape) {
          return {
            success: false,
            error: { code: `BOOLEAN_FAILED`, message: result.error ?? `Union failed` },
          };
        }

        this.bodies.set(options.targetBody, result.shape);
        return { success: true, value: options.targetBody };
      } else if (operation === `cut` && options.targetBody !== undefined) {
        const target = this.bodies.get(options.targetBody);
        if (!target) {
          revolvedShape.dispose();
          return {
            success: false,
            error: { code: `UNKNOWN`, message: `Body ${options.targetBody} not found` },
          };
        }

        const result = booleanOp(target, revolvedShape, `subtract`);
        target.dispose();
        revolvedShape.dispose();

        if (!result.success || !result.shape) {
          return {
            success: false,
            error: { code: `BOOLEAN_FAILED`, message: result.error ?? `Cut failed` },
          };
        }

        this.bodies.set(options.targetBody, result.shape);
        return { success: true, value: options.targetBody };
      } else {
        const id = this.allocateBodyId();
        this.bodies.set(id, revolvedShape);
        return { success: true, value: id };
      }
    } catch (e) {
      return {
        success: false,
        error: {
          code: `UNKNOWN`,
          message: e instanceof Error ? e.message : `Unknown revolve error`,
        },
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Boolean operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Union two bodies
   */
  union(bodyA: BodyId, bodyB: BodyId): OperationResult<BodyId> {
    this.ensureInitialized();
    return this.performBoolean(bodyA, bodyB, `union`);
  }

  /**
   * Subtract bodyB from bodyA
   */
  subtract(bodyA: BodyId, bodyB: BodyId): OperationResult<BodyId> {
    this.ensureInitialized();
    return this.performBoolean(bodyA, bodyB, `subtract`);
  }

  /**
   * Intersect two bodies
   */
  intersect(bodyA: BodyId, bodyB: BodyId): OperationResult<BodyId> {
    this.ensureInitialized();
    return this.performBoolean(bodyA, bodyB, `intersect`);
  }

  private performBoolean(
    bodyA: BodyId,
    bodyB: BodyId,
    op: `union` | `subtract` | `intersect`
  ): OperationResult<BodyId> {
    const shapeA = this.bodies.get(bodyA);
    const shapeB = this.bodies.get(bodyB);

    if (!shapeA) {
      return { success: false, error: { code: `UNKNOWN`, message: `Body ${bodyA} not found` } };
    }
    if (!shapeB) {
      return { success: false, error: { code: `UNKNOWN`, message: `Body ${bodyB} not found` } };
    }

    const result = booleanOp(shapeA, shapeB, op);

    if (!result.success || !result.shape) {
      return {
        success: false,
        error: { code: `BOOLEAN_FAILED`, message: result.error ?? `Boolean ${op} failed` },
      };
    }

    // Create new body with result (original bodies are preserved)
    const id = this.allocateBodyId();
    this.bodies.set(id, result.shape);
    return { success: true, value: id };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Modification operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Apply fillet to all edges of a body
   */
  fillet(bodyId: BodyId, options: FilletOptions): OperationResult<void> {
    this.ensureInitialized();

    const body = this.bodies.get(bodyId);
    if (!body) {
      return { success: false, error: { code: `UNKNOWN`, message: `Body ${bodyId} not found` } };
    }

    try {
      // TODO: Support specific edges when options.edges is provided
      const filleted = filletAllEdges(body, options.radius);
      body.dispose();
      this.bodies.set(bodyId, filleted);
      return { success: true, value: undefined };
    } catch (e) {
      return {
        success: false,
        error: { code: `UNKNOWN`, message: e instanceof Error ? e.message : `Fillet failed` },
      };
    }
  }

  /**
   * Apply chamfer to all edges of a body
   */
  chamfer(bodyId: BodyId, distance: number, _edges?: EdgeId[]): OperationResult<void> {
    this.ensureInitialized();

    const body = this.bodies.get(bodyId);
    if (!body) {
      return { success: false, error: { code: `UNKNOWN`, message: `Body ${bodyId} not found` } };
    }

    try {
      // TODO: Support specific edges
      const chamfered = chamferAllEdges(body, distance);
      body.dispose();
      this.bodies.set(bodyId, chamfered);
      return { success: true, value: undefined };
    } catch (e) {
      return {
        success: false,
        error: { code: `UNKNOWN`, message: e instanceof Error ? e.message : `Chamfer failed` },
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Query operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get tessellated mesh for rendering
   */
  tessellate(bodyId: BodyId, quality: TessellationQuality = `medium`): Mesh {
    this.ensureInitialized();

    const body = this.bodies.get(bodyId);
    if (!body) {
      throw new Error(`Body ${bodyId} not found`);
    }

    const result = tessellate(body, quality);
    return {
      positions: result.vertices,
      normals: result.normals,
      indices: result.indices,
      faceMap: result.faceMap,
      edges: result.edges,
      edgeMap: result.edgeMap,
    };
  }

  /**
   * Get bounding box of a body
   */
  getBoundingBox(bodyId: BodyId): BoundingBox {
    this.ensureInitialized();

    const body = this.bodies.get(bodyId);
    if (!body) {
      throw new Error(`Body ${bodyId} not found`);
    }

    return getBoundingBox(body);
  }

  /**
   * Get plane data from a specific face of a body.
   * Returns null if the face index is out of range or the face has no valid plane.
   *
   * @param bodyId - The body containing the face
   * @param faceIndex - The 0-based face index
   */
  getFacePlane(bodyId: BodyId, faceIndex: number): FacePlaneData | null {
    this.ensureInitialized();

    const body = this.bodies.get(bodyId);
    if (!body) {
      throw new Error(`Body ${bodyId} not found`);
    }

    return kernelGetFacePlane(body, faceIndex);
  }

  /**
   * Check if a body exists
   */
  hasBody(bodyId: BodyId): boolean {
    return this.bodies.has(bodyId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Import/Export
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Export body to STEP format
   */
  exportSTEP(bodyId: BodyId): Uint8Array {
    this.ensureInitialized();

    const body = this.bodies.get(bodyId);
    if (!body) {
      throw new Error(`Body ${bodyId} not found`);
    }

    return exportSTEP(body);
  }

  /**
   * Import body from STEP format
   */
  importSTEP(data: Uint8Array): OperationResult<BodyId> {
    this.ensureInitialized();

    const result = importSTEP(data);

    if (!result.success || !result.shape) {
      return {
        success: false,
        error: { code: `UNKNOWN`, message: result.error ?? `STEP import failed` },
      };
    }

    const id = this.allocateBodyId();
    this.bodies.set(id, result.shape);
    return { success: true, value: id };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Delete a body and free memory
   */
  deleteBody(bodyId: BodyId): void {
    const body = this.bodies.get(bodyId);
    if (body) {
      body.dispose();
      this.bodies.delete(bodyId);
    }
  }

  /**
   * Dispose the session and free all resources
   */
  dispose(): void {
    for (const body of this.bodies.values()) {
      body.dispose();
    }
    this.bodies.clear();
  }
}
