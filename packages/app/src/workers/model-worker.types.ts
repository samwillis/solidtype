/**
 * Model Worker Types
 * 
 * Defines the message protocol between main thread and the model worker.
 * The model worker executes transpiled DSL code and produces geometry.
 */

import type { FeatureCheckpoint, ModelingError, BuiltBodyHandle } from '@solidtype/dsl';

// ============================================================================
// Serialized Mesh
// ============================================================================

/**
 * Serialized mesh for transferring to main thread
 */
export interface SerializedMesh {
  /** Feature ID this mesh belongs to */
  id: string;
  /** Vertex positions (x,y,z,x,y,z,...) */
  positions: Float32Array;
  /** Vertex normals (x,y,z,x,y,z,...) */
  normals: Float32Array;
  /** Triangle indices */
  indices: Uint32Array;
}

// ============================================================================
// Main → Worker Messages
// ============================================================================

/**
 * Build a model from transpiled JS code
 */
export interface BuildModelMessage {
  kind: 'buildModel';
  requestId: number;
  /** Transpiled JavaScript code (from TS worker) */
  jsCode: string;
  /** Entry function name (default: 'Part') */
  entryFunction?: string;
  /** Props to pass to the Part function */
  props?: Record<string, unknown>;
}

/**
 * Build up to a specific checkpoint (for breakpoints)
 */
export interface BuildToCheckpointMessage {
  kind: 'buildToCheckpoint';
  requestId: number;
  /** Transpiled JavaScript code */
  jsCode: string;
  /** Entry function name */
  entryFunction?: string;
  /** Props to pass to the Part function */
  props?: Record<string, unknown>;
  /** Checkpoint ID to stop at */
  checkpointId: string;
}

export type ModelWorkerMessage = BuildModelMessage | BuildToCheckpointMessage;

// ============================================================================
// Worker → Main Messages
// ============================================================================

/**
 * Successful build result
 */
export interface BuildResultMessage {
  kind: 'buildResult';
  requestId: number;
  success: true;
  /** Built body handles */
  bodies: BuiltBodyHandle[];
  /** Feature checkpoints for tree */
  checkpoints: FeatureCheckpoint[];
  /** Meshes for rendering (one per body with geometry) */
  meshes: SerializedMesh[];
  /** Last valid checkpoint ID */
  lastValidCheckpointId?: string;
}

/**
 * Build error result
 */
export interface BuildErrorMessage {
  kind: 'buildError';
  requestId: number;
  success: false;
  /** Modeling errors */
  errors: ModelingError[];
  /** Runtime error (if JS execution failed) */
  runtimeError?: string;
  /** Partial results (if some features succeeded) */
  partialCheckpoints?: FeatureCheckpoint[];
  partialMeshes?: SerializedMesh[];
  lastValidCheckpointId?: string;
}

export type ModelWorkerResponse = BuildResultMessage | BuildErrorMessage;
