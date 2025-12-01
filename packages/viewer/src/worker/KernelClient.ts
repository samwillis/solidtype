/**
 * Kernel Client
 * 
 * Provides a clean async API for interacting with the kernel worker from
 * the main thread. Handles request/response correlation and error handling.
 */

import type {
  WorkerCommand,
  WorkerResponse,
  SerializedMesh,
  SerializedSketch,
  SerializedSolveResult,
  BoxParams,
  ExtrudeParams,
  RevolveParams,
  BooleanParams,
  DragPoint,
  ParamValue,
  BuildSequence,
  ParamsResponse,
  BuildSequenceResponse,
} from './types.js';
import { generateRequestId, isErrorResponse } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface KernelClientOptions {
  /** Tolerance settings for the kernel */
  tolerances?: {
    length?: number;
    angle?: number;
  };
  /** Custom worker instance (for testing) */
  worker?: Worker;
  /** Timeout for requests in ms (default: 30000) */
  timeout?: number;
}

export interface TessellationOptions {
  tolerance?: number;
}

export interface SolveOptions {
  maxIterations?: number;
  tolerance?: number;
}

// ============================================================================
// Kernel Client Class
// ============================================================================

/**
 * Client for communicating with the kernel worker
 * 
 * Usage:
 * ```ts
 * const client = new KernelClient();
 * await client.init();
 * 
 * const bodyId = await client.createBox({ width: 2, height: 1, depth: 1 });
 * const mesh = await client.getMesh(bodyId);
 * 
 * await client.dispose();
 * ```
 */
export class KernelClient {
  private worker: Worker | null = null;
  private pending = new Map<string, {
    resolve: (value: WorkerResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private options: Required<KernelClientOptions>;
  private initialized = false;
  
  constructor(options: KernelClientOptions = {}) {
    this.options = {
      tolerances: options.tolerances ?? {},
      worker: options.worker as Worker,
      timeout: options.timeout ?? 30000,
    };
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  /**
   * Initialize the kernel worker
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    // Create worker if not provided
    if (!this.options.worker) {
      this.worker = new Worker(
        new URL('./kernel.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } else {
      this.worker = this.options.worker;
    }
    
    // Set up message handler
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
    
    // Send init command
    await this.sendCommand({
      kind: 'init',
      requestId: generateRequestId(),
      tolerances: this.options.tolerances,
    });
    
    this.initialized = true;
  }
  
  /**
   * Dispose the kernel worker
   */
  async dispose(): Promise<void> {
    if (!this.initialized || !this.worker) {
      return;
    }
    
    try {
      await this.sendCommand({
        kind: 'dispose',
        requestId: generateRequestId(),
      });
    } finally {
      // Clean up pending requests
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Worker disposed'));
      }
      this.pending.clear();
      
      // Terminate worker
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
  
  /**
   * Reset the model (clear all bodies)
   */
  async reset(): Promise<void> {
    this.ensureInitialized();
    await this.sendCommand({
      kind: 'reset',
      requestId: generateRequestId(),
    });
  }
  
  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  // ==========================================================================
  // Modeling Operations
  // ==========================================================================
  
  /**
   * Create a box primitive
   * 
   * @param params Box parameters
   * @returns Body ID
   */
  async createBox(params: BoxParams = {}): Promise<number> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'createBox',
      requestId: generateRequestId(),
      params,
    });
    
    if (response.kind !== 'bodyCreated') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.bodyId;
  }
  
  /**
   * Create an extrusion
   * 
   * @param params Extrusion parameters
   * @returns Body ID
   */
  async extrude(params: ExtrudeParams): Promise<number> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'extrude',
      requestId: generateRequestId(),
      params,
    });
    
    if (response.kind !== 'bodyCreated') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.bodyId;
  }
  
  /**
   * Create a revolve
   * 
   * @param params Revolve parameters
   * @returns Body ID
   */
  async revolve(params: RevolveParams): Promise<number> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'revolve',
      requestId: generateRequestId(),
      params,
    });
    
    if (response.kind !== 'bodyCreated') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.bodyId;
  }
  
  /**
   * Perform a boolean operation
   * 
   * @param params Boolean operation parameters
   * @returns Body ID of the result
   */
  async boolean(params: BooleanParams): Promise<number> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'boolean',
      requestId: generateRequestId(),
      params,
    });
    
    if (response.kind !== 'bodyCreated') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.bodyId;
  }
  
  // ==========================================================================
  // Mesh Retrieval
  // ==========================================================================
  
  /**
   * Get mesh for a specific body
   * 
   * @param bodyId Body ID to tessellate
   * @param options Tessellation options
   * @returns Serialized mesh with typed arrays
   */
  async getMesh(bodyId: number, options?: TessellationOptions): Promise<SerializedMesh> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'getMesh',
      requestId: generateRequestId(),
      bodyId,
      options,
    });
    
    if (response.kind !== 'mesh') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.mesh;
  }
  
  /**
   * Get meshes for all bodies
   * 
   * @param options Tessellation options
   * @returns Array of serialized meshes
   */
  async getAllMeshes(options?: TessellationOptions): Promise<SerializedMesh[]> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'getAllMeshes',
      requestId: generateRequestId(),
      options,
    });
    
    if (response.kind !== 'meshes') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.meshes;
  }
  
  // ==========================================================================
  // Sketch Solving
  // ==========================================================================
  
  /**
   * Solve sketch constraints
   * 
   * @param sketch Serialized sketch data
   * @param dragPoint Optional drag point for interactive solving
   * @param options Solver options
   * @returns Solve result with updated point positions
   */
  async solveSketch(
    sketch: SerializedSketch,
    dragPoint?: DragPoint,
    options?: SolveOptions
  ): Promise<SerializedSolveResult> {
    // Note: solveSketch does not require kernel initialization
    // as it operates on standalone sketch data
    if (!this.worker) {
      // Create a temporary worker just for sketch solving
      const tempWorker = new Worker(
        new URL('./kernel.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      // Initialize temporarily
      const tempPending = new Map<string, {
        resolve: (value: WorkerResponse) => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
      }>();
      
      tempWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const pending = tempPending.get(response.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          tempPending.delete(response.requestId);
          pending.resolve(response);
        }
      };
      
      // Send command and wait for response
      const response = await new Promise<WorkerResponse>((resolve, reject) => {
        const requestId = generateRequestId();
        const timeout = setTimeout(() => {
          tempPending.delete(requestId);
          reject(new Error('Request timed out'));
        }, this.options.timeout);
        
        tempPending.set(requestId, { resolve, reject, timeout });
        
        const command: WorkerCommand = {
          kind: 'solveSketch',
          requestId,
          sketch,
          dragPoint,
          options,
        };
        
        tempWorker.postMessage(command);
      });
      
      tempWorker.terminate();
      
      if (isErrorResponse(response)) {
        throw new Error(response.error);
      }
      
      if (response.kind !== 'solveSketch') {
        throw new Error(`Unexpected response kind: ${response.kind}`);
      }
      
      return response.result;
    }
    
    const response = await this.sendCommand({
      kind: 'solveSketch',
      requestId: generateRequestId(),
      sketch,
      dragPoint,
      options,
    });
    
    if (response.kind !== 'solveSketch') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.result;
  }
  
  // ==========================================================================
  // Parametric Editing
  // ==========================================================================
  
  /**
   * Set parameters for parametric editing
   * 
   * @param params Parameters to set (id → value)
   * @returns Current parameter values
   */
  async setParams(params: Record<string, ParamValue>): Promise<Record<string, ParamValue>> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'setParams',
      requestId: generateRequestId(),
      params,
    }) as ParamsResponse;
    
    if (response.kind !== 'params') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.params;
  }
  
  /**
   * Get current parameter values
   * 
   * @param paramIds Optional specific parameter IDs to get (empty = all)
   * @returns Current parameter values
   */
  async getParams(paramIds?: string[]): Promise<Record<string, ParamValue>> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'getParams',
      requestId: generateRequestId(),
      paramIds,
    }) as ParamsResponse;
    
    if (response.kind !== 'params') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return response.params;
  }
  
  /**
   * Build a parametric model from a sequence of operations
   * 
   * This is the main entry point for parametric editing. The sequence
   * describes the model as a list of operations that reference parameters.
   * When parameters change, call this again to rebuild the model.
   * 
   * @param sequence Build sequence to execute
   * @param options Build options
   * @returns Build result with body IDs and optional meshes
   */
  async buildSequence(
    sequence: BuildSequence,
    options?: { returnMeshes?: boolean }
  ): Promise<{
    results: Record<string, number>;
    bodyIds: number[];
    meshes?: SerializedMesh[];
  }> {
    this.ensureInitialized();
    
    const response = await this.sendCommand({
      kind: 'buildSequence',
      requestId: generateRequestId(),
      sequence,
      returnMeshes: options?.returnMeshes,
    }) as BuildSequenceResponse;
    
    if (response.kind !== 'buildSequence') {
      throw new Error(`Unexpected response kind: ${response.kind}`);
    }
    
    return {
      results: response.results,
      bodyIds: response.bodyIds,
      meshes: response.meshes,
    };
  }
  
  /**
   * Update a parameter and rebuild the model
   * 
   * Convenience method that combines setParams and buildSequence.
   * 
   * @param paramId Parameter ID to update
   * @param value New value
   * @param sequence Build sequence to execute
   * @param options Build options
   * @returns Build result with body IDs and optional meshes
   */
  async updateParam(
    paramId: string,
    value: ParamValue,
    sequence: BuildSequence,
    options?: { returnMeshes?: boolean }
  ): Promise<{
    results: Record<string, number>;
    bodyIds: number[];
    meshes?: SerializedMesh[];
  }> {
    // Set the parameter
    await this.setParams({ [paramId]: value });
    
    // Rebuild the model
    return this.buildSequence(sequence, options);
  }
  
  /**
   * Batch update multiple parameters and rebuild the model
   * 
   * @param params Parameters to update
   * @param sequence Build sequence to execute
   * @param options Build options
   * @returns Build result with body IDs and optional meshes
   */
  async updateParams(
    params: Record<string, ParamValue>,
    sequence: BuildSequence,
    options?: { returnMeshes?: boolean }
  ): Promise<{
    results: Record<string, number>;
    bodyIds: number[];
    meshes?: SerializedMesh[];
  }> {
    // Set the parameters
    await this.setParams(params);
    
    // Rebuild the model
    return this.buildSequence(sequence, options);
  }
  
  // ==========================================================================
  // Internal Methods
  // ==========================================================================
  
  private ensureInitialized(): void {
    if (!this.initialized || !this.worker) {
      throw new Error('KernelClient not initialized. Call init() first.');
    }
  }
  
  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;
    const pending = this.pending.get(response.requestId);
    
    if (pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(response.requestId);
      pending.resolve(response);
    }
  }
  
  private handleError(event: ErrorEvent): void {
    console.error('Worker error:', event);
    
    // Reject all pending requests
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Worker error: ${event.message}`));
    }
    this.pending.clear();
  }
  
  private sendCommand(command: WorkerCommand): Promise<WorkerResponse> {
    return new Promise<WorkerResponse>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }
      
      const timeout = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(new Error(`Request timed out: ${command.kind}`));
      }, this.options.timeout);
      
      this.pending.set(command.requestId, { resolve, reject, timeout });
      
      this.worker.postMessage(command);
    }).then(response => {
      if (isErrorResponse(response)) {
        const error = new Error(response.error);
        if (response.details) {
          (error as Error & { details?: string }).details = response.details;
        }
        throw error;
      }
      return response;
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a kernel client
 * 
 * @param options Client options
 * @returns Initialized kernel client
 */
export async function createKernelClient(options?: KernelClientOptions): Promise<KernelClient> {
  const client = new KernelClient(options);
  await client.init();
  return client;
}
