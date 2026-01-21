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
  booleanOpWithHistory,
  extrudeSymmetric,
  extrudeWithHistory,
  revolveWithHistory,
  filletAllEdges,
  chamferAllEdges,
  tessellate,
  tessellateWithHashes,
  getBoundingBox,
  getFacePlane as kernelGetFacePlane,
  sketchProfileToFace,
  getPlaneNormal,
  exportSTEP,
  importSTEP,
  type TessellationQuality,
  type TessellatedMeshWithHashes,
  type FacePlaneData,
  type FaceHistoryMapping,
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

/**
 * OCCT history mapping from profile edges to generated faces.
 * Used for Phase 8 persistent naming.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8
 */
export interface ProfileEdgeMapping {
  /** Hash of the profile edge that generated this face */
  profileEdgeHash: number;
  /** Hash of the generated face */
  generatedFaceHash: number;
  /** Index of the profile edge in exploration order */
  profileEdgeIndex: number;
}

/**
 * OCCT operation history for extrude/revolve.
 * Captures the relationship between input profile and generated faces.
 */
export interface OperationHistory {
  /** Hash of the bottom/start cap face */
  bottomCapHash?: number;
  /** Hash of the top/end cap face */
  topCapHash?: number;
  /** Mappings from profile edges to generated side faces */
  sideFaceMappings: ProfileEdgeMapping[];
}

/**
 * Result of a boolean operation with history tracking.
 * Includes mappings showing what happened to each input face.
 */
export interface BooleanHistoryResult {
  /** The resulting body ID (if successful) */
  bodyId: BodyId;
  /**
   * Face history from the base shape.
   * Maps input face hashes to output face hashes.
   */
  baseFaceHistory: FaceHistoryMapping[];
  /**
   * Face history from the tool shape.
   * Maps input face hashes to output face hashes.
   */
  toolFaceHistory: FaceHistoryMapping[];
}

// Re-export FaceHistoryMapping for consumers
export type { FaceHistoryMapping };

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
   * Operation history for each body.
   * Maps bodyId to the OCCT history from the operation that created it.
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 8
   */
  private operationHistory: Map<number, OperationHistory> = new Map();

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
   *
   * This method now captures OCCT history for persistent naming (Phase 8).
   * Use getOperationHistory(bodyId) to retrieve the generated face mappings.
   */
  extrude(profile: SketchProfile, options: ExtrudeOptions): OperationResult<BodyId> {
    this.ensureInitialized();

    try {
      // Convert profile to OCCT face
      const face = sketchProfileToFace(profile);

      // Get extrusion direction
      const direction = options.direction ?? getPlaneNormal(profile.plane);

      // Create extruded solid with history tracking
      let extrudedShape: Shape;
      let history: OperationHistory | undefined;

      if (options.symmetric) {
        // Symmetric extrude doesn't have simple first/last shape semantics
        extrudedShape = extrudeSymmetric(face, direction, options.distance);
      } else {
        // Use history-enabled extrude for Phase 8 persistent naming
        const result = extrudeWithHistory(face, direction, options.distance);
        extrudedShape = result.shape;

        // Capture the history for later use in referenceIndex
        history = {
          bottomCapHash: result.firstShapeHash,
          topCapHash: result.lastShapeHash,
          sideFaceMappings: result.sideFaceMappings.map((m) => ({
            profileEdgeHash: m.profileEdgeHash,
            generatedFaceHash: m.generatedFaceHash,
            profileEdgeIndex: m.profileEdgeIndex,
          })),
        };
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
        // Note: History is lost for add operations since faces merge
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
        // Note: History is lost for cut operations since faces merge
        return { success: true, value: options.targetBody };
      } else {
        // Create new body
        const id = this.allocateBodyId();
        this.bodies.set(id, extrudedShape);

        // Store the operation history for this new body
        if (history) {
          this.operationHistory.set(id, history);
        }

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
   *
   * This method now captures OCCT history for persistent naming (Phase 8).
   * Use getOperationHistory(bodyId) to retrieve the generated face mappings.
   */
  revolve(profile: SketchProfile, options: RevolveOptions): OperationResult<BodyId> {
    this.ensureInitialized();

    try {
      // Convert profile to OCCT face
      const face = sketchProfileToFace(profile);

      // Use history-enabled revolve for Phase 8 persistent naming
      const revolveResult = revolveWithHistory(
        face,
        options.axis.origin,
        options.axis.direction,
        options.angleDegrees
      );
      const revolvedShape = revolveResult.shape;

      // Capture the history for later use in referenceIndex
      const history: OperationHistory = {
        bottomCapHash: revolveResult.firstShapeHash,
        topCapHash: revolveResult.lastShapeHash,
        sideFaceMappings: revolveResult.sideFaceMappings.map((m) => ({
          profileEdgeHash: m.profileEdgeHash,
          generatedFaceHash: m.generatedFaceHash,
          profileEdgeIndex: m.profileEdgeIndex,
        })),
      };

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

        // Store the operation history for this new body
        this.operationHistory.set(id, history);

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

  /**
   * Union two bodies with history tracking.
   * Returns face mappings showing what happened to each input face.
   *
   * @param bodyA - The base body
   * @param bodyB - The tool body
   * @returns Result with body ID and face history mappings
   */
  unionWithHistory(bodyA: BodyId, bodyB: BodyId): OperationResult<BooleanHistoryResult> {
    this.ensureInitialized();
    return this.performBooleanWithHistory(bodyA, bodyB, `union`);
  }

  /**
   * Subtract bodyB from bodyA with history tracking.
   * Returns face mappings showing what happened to each input face.
   *
   * @param bodyA - The base body (to cut from)
   * @param bodyB - The tool body (the cutter)
   * @returns Result with body ID and face history mappings
   */
  subtractWithHistory(bodyA: BodyId, bodyB: BodyId): OperationResult<BooleanHistoryResult> {
    this.ensureInitialized();
    return this.performBooleanWithHistory(bodyA, bodyB, `subtract`);
  }

  /**
   * Intersect two bodies with history tracking.
   * Returns face mappings showing what happened to each input face.
   *
   * @param bodyA - The base body
   * @param bodyB - The tool body
   * @returns Result with body ID and face history mappings
   */
  intersectWithHistory(bodyA: BodyId, bodyB: BodyId): OperationResult<BooleanHistoryResult> {
    this.ensureInitialized();
    return this.performBooleanWithHistory(bodyA, bodyB, `intersect`);
  }

  private performBooleanWithHistory(
    bodyA: BodyId,
    bodyB: BodyId,
    op: `union` | `subtract` | `intersect`
  ): OperationResult<BooleanHistoryResult> {
    const shapeA = this.bodies.get(bodyA);
    const shapeB = this.bodies.get(bodyB);

    if (!shapeA) {
      return { success: false, error: { code: `UNKNOWN`, message: `Body ${bodyA} not found` } };
    }
    if (!shapeB) {
      return { success: false, error: { code: `UNKNOWN`, message: `Body ${bodyB} not found` } };
    }

    const result = booleanOpWithHistory(shapeA, shapeB, op);

    if (!result.success || !result.shape) {
      return {
        success: false,
        error: { code: `BOOLEAN_FAILED`, message: result.error ?? `Boolean ${op} failed` },
      };
    }

    // Create new body with result (original bodies are preserved)
    const id = this.allocateBodyId();
    this.bodies.set(id, result.shape);

    return {
      success: true,
      value: {
        bodyId: id,
        baseFaceHistory: result.baseFaceMap ?? [],
        toolFaceHistory: result.toolFaceMap ?? [],
      },
    };
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
   * Extended tessellation interface for Phase 8.
   * Same as tessellate() but includes face/edge hash codes for OCCT history matching.
   */
  tessellateWithHashes: TessellatedMeshWithHashes | undefined;

  /**
   * Get tessellated mesh with topology hashes for OCCT history matching.
   *
   * This extended version returns hash codes that can be matched with
   * getOperationHistory() to determine which profile edges generated
   * which result faces.
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 8
   */
  tessellateWithTopologyHashes(
    bodyId: BodyId,
    quality: TessellationQuality = `medium`
  ): Mesh & { faceHashes: Uint32Array; edgeHashes: Uint32Array } {
    this.ensureInitialized();

    const body = this.bodies.get(bodyId);
    if (!body) {
      throw new Error(`Body ${bodyId} not found`);
    }

    const result = tessellateWithHashes(body, quality);
    return {
      positions: result.vertices,
      normals: result.normals,
      indices: result.indices,
      faceMap: result.faceMap,
      edges: result.edges,
      edgeMap: result.edgeMap,
      faceHashes: result.faceHashes,
      edgeHashes: result.edgeHashes,
    };
  }

  /**
   * Get the OCCT operation history for a body.
   *
   * Returns the mapping from profile edges to generated faces,
   * enabling stable persistent references that survive sketch edits.
   *
   * @param bodyId - The body to get history for
   * @returns Operation history or undefined if no history is available
   *
   * @see docs/CAD-PIPELINE-REWORK.md Phase 8
   */
  getOperationHistory(bodyId: BodyId): OperationHistory | undefined {
    return this.operationHistory.get(bodyId);
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
    this.operationHistory.clear();
  }
}
