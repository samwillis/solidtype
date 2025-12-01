/**
 * Worker Module Exports
 * 
 * Provides the kernel worker API for off-main-thread modeling.
 */

// Types
export type {
  // Commands
  WorkerCommand,
  InitCommand,
  DisposeCommand,
  ResetCommand,
  CreateBoxCommand,
  ExtrudeCommand,
  RevolveCommand,
  BooleanCommand,
  GetMeshCommand,
  GetAllMeshesCommand,
  SolveSketchCommand,
  SetParamsCommand,
  GetParamsCommand,
  BuildSequenceCommand,
  
  // Responses
  WorkerResponse,
  InitResponse,
  DisposeResponse,
  ResetResponse,
  BodyCreatedResponse,
  MeshResponse,
  MeshesResponse,
  SolveSketchResponse,
  ParamsResponse,
  BuildSequenceResponse,
  ErrorResponse,
  
  // Data types
  SerializedMesh,
  SerializedSketch,
  SerializedSketchPoint,
  SerializedSketchEntity,
  SerializedConstraint,
  SerializedSolveResult,
  BoxParams,
  ExtrudeParams,
  RevolveParams,
  BooleanParams,
  DragPoint,
  ParamValue,
  ParamRef,
  BuildOperation,
  BuildSequence,
} from './types.js';

// Type guards and utilities
export {
  isErrorResponse,
  isSuccessResponse,
  generateRequestId,
  getTransferables,
  isParamRef,
  paramRef,
} from './types.js';

// Client
export {
  KernelClient,
  createKernelClient,
  type KernelClientOptions,
  type TessellationOptions,
  type SolveOptions,
} from './KernelClient.js';
