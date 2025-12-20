/**
 * Types for kernel worker communication
 */

// ============================================================================
// Message Types: Main Thread → Worker
// ============================================================================

export interface InitSyncMessage {
  type: 'init-sync';
  port: MessagePort;
}

export interface YjsInitMessage {
  type: 'yjs-init';
  data: Uint8Array;
}

export interface YjsUpdateMessage {
  type: 'yjs-update';
  data: Uint8Array;
}

export type MainToWorkerMessage =
  | InitSyncMessage
  | YjsInitMessage
  | YjsUpdateMessage;

// ============================================================================
// Message Types: Worker → Main Thread
// ============================================================================

export interface ReadyMessage {
  type: 'ready';
}

export interface RebuildStartMessage {
  type: 'rebuild-start';
}

export interface RebuildCompleteMessage {
  type: 'rebuild-complete';
  bodies: BodyInfo[];
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
}

export interface MeshMessage {
  type: 'mesh';
  bodyId: string;
  mesh: TransferableMesh;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type WorkerToMainMessage =
  | ReadyMessage
  | RebuildStartMessage
  | RebuildCompleteMessage
  | MeshMessage
  | ErrorMessage;

// ============================================================================
// Shared Types
// ============================================================================

export type FeatureStatus = 'computed' | 'error' | 'suppressed' | 'gated';

export interface BuildError {
  featureId: string;
  code: 'NO_CLOSED_PROFILE' | 'SELF_INTERSECTING' | 'INVALID_REFERENCE' | 'BUILD_ERROR' | 'SKETCH_NOT_FOUND';
  message: string;
}

export interface BodyInfo {
  id: string;
  featureId: string;
  faceCount: number;
}

export interface TransferableMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}
