/**
 * Worker API Types
 * 
 * Defines the message protocol between main thread and the kernel worker.
 * Uses a request/response pattern with unique request IDs for correlation.
 * 
 * Design principles:
 * - Minimal command set (expand as needed)
 * - All data is serializable (no Maps, Sets, or class instances)
 * - Typed arrays can be transferred for zero-copy performance
 * - Clear error responses with actionable details
 */

import type { Vec2, Vec3 } from '@solidtype/core';

// ============================================================================
// Serialized Data Types
// ============================================================================

/**
 * Serialized mesh - uses typed arrays for efficient transfer
 */
export interface SerializedMesh {
  /** Body ID this mesh represents */
  bodyId: number;
  /** Vertex positions (xyzxyz...) */
  positions: Float32Array;
  /** Vertex normals (xyzxyz...) */
  normals: Float32Array;
  /** Triangle indices */
  indices: Uint32Array;
}

/**
 * Serialized sketch point
 */
export interface SerializedSketchPoint {
  id: number;
  x: number;
  y: number;
  fixed: boolean;
  name?: string;
}

/**
 * Serialized sketch entity
 */
export interface SerializedSketchEntity {
  id: number;
  kind: 'line' | 'arc';
  start: number; // point ID
  end: number;   // point ID
  center?: number; // point ID for arcs
  ccw?: boolean;
  construction?: boolean;
}

/**
 * Serialized constraint
 */
export interface SerializedConstraint {
  id: number;
  kind: string;
  active?: boolean;
  weight?: number;
  // Constraint-specific data stored as record
  data: Record<string, unknown>;
}

/**
 * Serialized sketch for worker communication
 */
export interface SerializedSketch {
  planeOrigin: Vec3;
  planeNormal: Vec3;
  planeXDir: Vec3;
  points: SerializedSketchPoint[];
  entities: SerializedSketchEntity[];
  constraints: SerializedConstraint[];
  name?: string;
}

/**
 * Serialized solve result
 */
export interface SerializedSolveResult {
  status: 'success' | 'under_constrained' | 'over_constrained' | 'not_converged' | 'singular' | 'converged';
  iterations: number;
  residual: number;
  satisfied: boolean;
  message?: string;
  remainingDOF?: number;
  /** Updated point positions after solving */
  updatedPoints: Array<{ id: number; x: number; y: number }>;
}

/**
 * Box creation parameters
 */
export interface BoxParams {
  width?: number;
  depth?: number;
  height?: number;
  center?: Vec3;
}

/**
 * Extrusion parameters
 */
export interface ExtrudeParams {
  /** Rectangle profile params (simplified for now) */
  profile: {
    kind: 'rectangle';
    width: number;
    height: number;
    centerX?: number;
    centerY?: number;
  } | {
    kind: 'circle';
    radius: number;
    centerX?: number;
    centerY?: number;
    segments?: number;
  };
  /** Plane for the profile */
  plane: 'XY' | 'YZ' | 'ZX' | {
    origin: Vec3;
    normal: Vec3;
    xDir: Vec3;
  };
  /** Extrusion distance */
  distance: number;
  /** Extrusion direction (defaults to plane normal) */
  direction?: Vec3;
  /** Operation type */
  operation?: 'add' | 'cut';
  /** Target body ID for cut operations */
  targetBodyId?: number;
}

/**
 * Revolve parameters
 */
export interface RevolveParams {
  /** Profile (same as extrude) */
  profile: ExtrudeParams['profile'];
  /** Plane for the profile */
  plane: ExtrudeParams['plane'];
  /** Axis definition */
  axis: {
    kind: 'x' | 'y' | 'custom';
    offset?: number;
    origin?: Vec2;
    direction?: Vec2;
  };
  /** Angle in radians (default 2π) */
  angle?: number;
  /** Operation type */
  operation?: 'add' | 'cut';
  /** Target body ID for cut operations */
  targetBodyId?: number;
}

/**
 * Boolean operation parameters
 */
export interface BooleanParams {
  /** Operation type */
  operation: 'union' | 'subtract' | 'intersect';
  /** Body A ID */
  bodyAId: number;
  /** Body B ID */
  bodyBId: number;
}

/**
 * Drag point for interactive sketch solving
 */
export interface DragPoint {
  /** Point ID to drag */
  pointId: number;
  /** Target position */
  target: Vec2;
}

// ============================================================================
// Worker Commands (Main → Worker)
// ============================================================================

/**
 * Initialize the kernel
 */
export interface InitCommand {
  kind: 'init';
  requestId: string;
  /** Optional tolerance settings */
  tolerances?: {
    length?: number;
    angle?: number;
  };
}

/**
 * Dispose the kernel and free resources
 */
export interface DisposeCommand {
  kind: 'dispose';
  requestId: string;
}

/**
 * Reset the model (clear all bodies)
 */
export interface ResetCommand {
  kind: 'reset';
  requestId: string;
}

/**
 * Create a box primitive
 */
export interface CreateBoxCommand {
  kind: 'createBox';
  requestId: string;
  params: BoxParams;
}

/**
 * Create an extrusion
 */
export interface ExtrudeCommand {
  kind: 'extrude';
  requestId: string;
  params: ExtrudeParams;
}

/**
 * Create a revolve
 */
export interface RevolveCommand {
  kind: 'revolve';
  requestId: string;
  params: RevolveParams;
}

/**
 * Perform a boolean operation
 */
export interface BooleanCommand {
  kind: 'boolean';
  requestId: string;
  params: BooleanParams;
}

/**
 * Get mesh for a specific body
 */
export interface GetMeshCommand {
  kind: 'getMesh';
  requestId: string;
  bodyId: number;
  /** Tessellation options */
  options?: {
    tolerance?: number;
  };
}

/**
 * Get meshes for all bodies
 */
export interface GetAllMeshesCommand {
  kind: 'getAllMeshes';
  requestId: string;
  /** Tessellation options */
  options?: {
    tolerance?: number;
  };
}

/**
 * Solve sketch constraints
 */
export interface SolveSketchCommand {
  kind: 'solveSketch';
  requestId: string;
  sketch: SerializedSketch;
  /** Optional drag point for interactive solving */
  dragPoint?: DragPoint;
  /** Solver options */
  options?: {
    maxIterations?: number;
    tolerance?: number;
  };
}

/**
 * Union type of all worker commands
 */
export type WorkerCommand =
  | InitCommand
  | DisposeCommand
  | ResetCommand
  | CreateBoxCommand
  | ExtrudeCommand
  | RevolveCommand
  | BooleanCommand
  | GetMeshCommand
  | GetAllMeshesCommand
  | SolveSketchCommand;

// ============================================================================
// Worker Responses (Worker → Main)
// ============================================================================

/**
 * Base response with common fields
 */
export interface BaseResponse {
  requestId: string;
}

/**
 * Successful init response
 */
export interface InitResponse extends BaseResponse {
  kind: 'init';
  success: true;
}

/**
 * Successful dispose response
 */
export interface DisposeResponse extends BaseResponse {
  kind: 'dispose';
  success: true;
}

/**
 * Successful reset response
 */
export interface ResetResponse extends BaseResponse {
  kind: 'reset';
  success: true;
}

/**
 * Body creation result
 */
export interface BodyCreatedResponse extends BaseResponse {
  kind: 'bodyCreated';
  success: true;
  bodyId: number;
}

/**
 * Mesh response (single body)
 */
export interface MeshResponse extends BaseResponse {
  kind: 'mesh';
  success: true;
  mesh: SerializedMesh;
}

/**
 * Meshes response (all bodies)
 */
export interface MeshesResponse extends BaseResponse {
  kind: 'meshes';
  success: true;
  meshes: SerializedMesh[];
}

/**
 * Sketch solve response
 */
export interface SolveSketchResponse extends BaseResponse {
  kind: 'solveSketch';
  success: true;
  result: SerializedSolveResult;
}

/**
 * Error response
 */
export interface ErrorResponse extends BaseResponse {
  kind: 'error';
  success: false;
  error: string;
  details?: string;
}

/**
 * Union type of all worker responses
 */
export type WorkerResponse =
  | InitResponse
  | DisposeResponse
  | ResetResponse
  | BodyCreatedResponse
  | MeshResponse
  | MeshesResponse
  | SolveSketchResponse
  | ErrorResponse;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a response is an error
 */
export function isErrorResponse(response: WorkerResponse): response is ErrorResponse {
  return response.kind === 'error';
}

/**
 * Check if a response is successful
 */
export function isSuccessResponse(response: WorkerResponse): response is Exclude<WorkerResponse, ErrorResponse> {
  return response.kind !== 'error' && 'success' in response && response.success === true;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get transferable objects from a response (for zero-copy transfer)
 */
export function getTransferables(response: WorkerResponse): Transferable[] {
  const transferables: Transferable[] = [];
  
  if (response.kind === 'mesh' && response.success) {
    transferables.push(
      response.mesh.positions.buffer,
      response.mesh.normals.buffer,
      response.mesh.indices.buffer
    );
  } else if (response.kind === 'meshes' && response.success) {
    for (const mesh of response.meshes) {
      transferables.push(
        mesh.positions.buffer,
        mesh.normals.buffer,
        mesh.indices.buffer
      );
    }
  }
  
  return transferables;
}
