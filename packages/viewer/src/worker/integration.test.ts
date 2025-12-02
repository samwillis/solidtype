/**
 * Worker Integration Tests
 * 
 * These tests simulate worker communication patterns and verify
 * the command/response protocol works correctly. Since Web Workers
 * don't run natively in Node.js, we test the command handling
 * logic directly using the core library.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createNumericContext,
  createEmptyModel,
  createNamingStrategy,
  createBox,
  extrude,
  createDatumPlaneFromNormal,
  createRectangleProfile,
  createCircleProfile,
  tessellateBody,
  vec3,
  iterateBodies,
  type TopoModel,
  type NumericContext,
  type NamingStrategy,
  type BodyId,
} from '@solidtype/core';

import type {
  WorkerCommand,
  WorkerResponse,
  BoxParams,
  ExtrudeParams,
  ParamValue,
  BuildSequence,
  SerializedMesh,
} from './types.js';
import {
  generateRequestId,
  isParamRef,
  paramRef,
  isErrorResponse,
} from './types.js';

// ============================================================================
// Test Harness - Simulates Worker State and Command Handling
// ============================================================================

interface WorkerState {
  ctx: NumericContext | null;
  model: TopoModel | null;
  naming: NamingStrategy | null;
  initialized: boolean;
  params: Map<string, ParamValue>;
  resultIds: Map<string, number>;
}

function createWorkerState(): WorkerState {
  return {
    ctx: null,
    model: null,
    naming: null,
    initialized: false,
    params: new Map(),
    resultIds: new Map(),
  };
}

/**
 * Simulates the worker's command handling logic.
 * This mirrors the actual worker implementation for testing.
 */
function handleCommand(state: WorkerState, command: WorkerCommand): WorkerResponse {
  switch (command.kind) {
    case 'init':
      return handleInit(state, command.requestId, command.tolerances);
    
    case 'reset':
      return handleReset(state, command.requestId);
    
    case 'createBox':
      return handleCreateBox(state, command.requestId, command.params);
    
    case 'extrude':
      return handleExtrude(state, command.requestId, command.params);
    
    case 'getMesh':
      return handleGetMesh(state, command.requestId, command.bodyId);
    
    case 'getAllMeshes':
      return handleGetAllMeshes(state, command.requestId);
    
    case 'setParams':
      return handleSetParams(state, command.requestId, command.params);
    
    case 'getParams':
      return handleGetParams(state, command.requestId, command.paramIds);
    
    case 'buildSequence':
      return handleBuildSequence(state, command.requestId, command.sequence, command.returnMeshes);
    
    case 'dispose':
      return handleDispose(state, command.requestId);
    
    default:
      return {
        kind: 'error',
        requestId: (command as { requestId: string }).requestId,
        success: false,
        error: `Unknown command kind: ${(command as { kind: string }).kind}`,
      };
  }
}

function handleInit(
  state: WorkerState,
  requestId: string,
  tolerances?: { length?: number; angle?: number }
): WorkerResponse {
  try {
    state.ctx = createNumericContext(tolerances);
    state.model = createEmptyModel(state.ctx);
    state.naming = createNamingStrategy();
    state.initialized = true;
    state.params.clear();
    state.resultIds.clear();
    
    return {
      kind: 'init',
      requestId,
      success: true,
    };
  } catch (error) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleDispose(state: WorkerState, requestId: string): WorkerResponse {
  state.ctx = null;
  state.model = null;
  state.naming = null;
  state.initialized = false;
  state.params.clear();
  state.resultIds.clear();
  
  return {
    kind: 'dispose',
    requestId,
    success: true,
  };
}

function handleReset(state: WorkerState, requestId: string): WorkerResponse {
  if (!state.initialized || !state.ctx) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: 'Worker not initialized',
    };
  }
  
  state.model = createEmptyModel(state.ctx);
  state.naming = createNamingStrategy();
  state.resultIds.clear();
  
  return {
    kind: 'reset',
    requestId,
    success: true,
  };
}

function handleCreateBox(
  state: WorkerState,
  requestId: string,
  params: BoxParams
): WorkerResponse {
  if (!state.initialized || !state.model) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: 'Worker not initialized',
    };
  }
  
  try {
    const bodyId = createBox(state.model, {
      width: params.width ?? 1,
      height: params.height ?? 1,
      depth: params.depth ?? 1,
      center: params.center ?? [0, 0, 0],
    });
    
    return {
      kind: 'bodyCreated',
      requestId,
      success: true,
      bodyId: bodyId as number,
    };
  } catch (error) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleExtrude(
  state: WorkerState,
  requestId: string,
  params: ExtrudeParams
): WorkerResponse {
  if (!state.initialized || !state.model || !state.naming) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: 'Worker not initialized',
    };
  }
  
  try {
    // Resolve plane - can be string literal or custom object
    let planeOrigin: [number, number, number] = [0, 0, 0];
    let planeNormal: [number, number, number] = [0, 0, 1];
    let planeXDir: [number, number, number] = [1, 0, 0];
    
    if (params.plane && typeof params.plane === 'object') {
      planeOrigin = params.plane.origin as [number, number, number];
      planeNormal = params.plane.normal as [number, number, number];
      planeXDir = params.plane.xDir as [number, number, number];
    }
    
    const plane = createDatumPlaneFromNormal(
      'sketch',
      vec3(planeOrigin[0], planeOrigin[1], planeOrigin[2]),
      vec3(planeNormal[0], planeNormal[1], planeNormal[2]),
      vec3(planeXDir[0], planeXDir[1], planeXDir[2])
    );
    
    let profile;
    if (params.profile.kind === 'rectangle') {
      profile = createRectangleProfile(
        plane,
        params.profile.width,
        params.profile.height,
        params.profile.centerX ?? 0,
        params.profile.centerY ?? 0
      );
    } else {
      profile = createCircleProfile(
        plane,
        params.profile.radius,
        params.profile.centerX ?? 0,
        params.profile.centerY ?? 0
      );
    }
    
    const result = extrude(state.model, profile, {
      distance: params.distance,
      direction: params.direction,
      operation: params.operation ?? 'add',
      targetBody: params.targetBodyId as BodyId | undefined,
      namingStrategy: state.naming,
    });
    
    if (!result.success) {
      return {
        kind: 'error',
        requestId,
        success: false,
        error: result.error ?? 'Extrude failed',
      };
    }
    
    return {
      kind: 'bodyCreated',
      requestId,
      success: true,
      bodyId: result.body as number,
    };
  } catch (error) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleGetMesh(
  state: WorkerState,
  requestId: string,
  bodyId: number
): WorkerResponse {
  if (!state.initialized || !state.model) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: 'Worker not initialized',
    };
  }
  
  try {
    const mesh = tessellateBody(state.model, bodyId as BodyId);
    
    return {
      kind: 'mesh',
      requestId,
      success: true,
      mesh: {
        bodyId,
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
      },
    };
  } catch (error) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleGetAllMeshes(
  state: WorkerState,
  requestId: string
): WorkerResponse {
  if (!state.initialized || !state.model) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: 'Worker not initialized',
    };
  }
  
  try {
    const meshes: SerializedMesh[] = [];
    
    for (const bodyId of iterateBodies(state.model)) {
      const mesh = tessellateBody(state.model, bodyId);
      meshes.push({
        bodyId: bodyId as number,
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
      });
    }
    
    return {
      kind: 'meshes',
      requestId,
      success: true,
      meshes,
    };
  } catch (error) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleSetParams(
  state: WorkerState,
  requestId: string,
  params: Record<string, ParamValue>
): WorkerResponse {
  for (const [key, value] of Object.entries(params)) {
    state.params.set(key, value);
  }
  
  return {
    kind: 'params',
    requestId,
    success: true,
    params: Object.fromEntries(state.params),
  };
}

function handleGetParams(
  state: WorkerState,
  requestId: string,
  paramIds?: string[]
): WorkerResponse {
  const result: Record<string, ParamValue> = {};
  
  if (paramIds && paramIds.length > 0) {
    for (const id of paramIds) {
      const value = state.params.get(id);
      if (value !== undefined) {
        result[id] = value;
      }
    }
  } else {
    for (const [key, value] of state.params) {
      result[key] = value;
    }
  }
  
  return {
    kind: 'params',
    requestId,
    success: true,
    params: result,
  };
}

/**
 * Resolve parameter references in an object
 */
function resolveParams<T>(params: Map<string, ParamValue>, obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (isParamRef(obj)) {
    const value = params.get(obj.paramId);
    if (value === undefined) {
      throw new Error(`Parameter not found: ${obj.paramId}`);
    }
    return value as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => resolveParams(params, item)) as unknown as T;
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveParams(params, value);
    }
    return result as T;
  }
  
  return obj;
}

function handleBuildSequence(
  state: WorkerState,
  requestId: string,
  sequence: BuildSequence,
  returnMeshes?: boolean
): WorkerResponse {
  if (!state.initialized || !state.ctx) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: 'Worker not initialized',
    };
  }
  
  // Reset model for clean rebuild
  state.model = createEmptyModel(state.ctx);
  state.naming = createNamingStrategy();
  state.resultIds.clear();
  
  const bodyIds: number[] = [];
  const results: Record<string, number> = {};
  
  for (const op of sequence.operations) {
    try {
      const resolvedParams = resolveParams(state.params, op.params);
      let bodyId: number;
      
      if (op.kind === 'createBox') {
        bodyId = createBox(state.model!, resolvedParams as BoxParams) as number;
      } else if (op.kind === 'extrude') {
        const extrudeParams = resolvedParams as ExtrudeParams;
        
        // Resolve plane - can be string literal or custom object
        let planeOrigin: [number, number, number] = [0, 0, 0];
        let planeNormal: [number, number, number] = [0, 0, 1];
        let planeXDir: [number, number, number] = [1, 0, 0];
        
        if (extrudeParams.plane && typeof extrudeParams.plane === 'object') {
          planeOrigin = extrudeParams.plane.origin as [number, number, number];
          planeNormal = extrudeParams.plane.normal as [number, number, number];
          planeXDir = extrudeParams.plane.xDir as [number, number, number];
        }
        
        const plane = createDatumPlaneFromNormal(
          'sketch',
          vec3(planeOrigin[0], planeOrigin[1], planeOrigin[2]),
          vec3(planeNormal[0], planeNormal[1], planeNormal[2]),
          vec3(planeXDir[0], planeXDir[1], planeXDir[2])
        );
        
        let profile;
        if (extrudeParams.profile.kind === 'rectangle') {
          profile = createRectangleProfile(
            plane,
            extrudeParams.profile.width,
            extrudeParams.profile.height,
            extrudeParams.profile.centerX ?? 0,
            extrudeParams.profile.centerY ?? 0
          );
        } else {
          profile = createCircleProfile(
            plane,
            extrudeParams.profile.radius,
            extrudeParams.profile.centerX ?? 0,
            extrudeParams.profile.centerY ?? 0
          );
        }
        
        const result = extrude(state.model!, profile, {
          distance: extrudeParams.distance,
          direction: extrudeParams.direction,
          operation: extrudeParams.operation ?? 'add',
          namingStrategy: state.naming!,
        });
        
        if (!result.success) {
          throw new Error(result.error ?? 'Extrude failed');
        }
        bodyId = result.body as number;
      } else {
        throw new Error(`Unsupported operation kind: ${op.kind}`);
      }
      
      bodyIds.push(bodyId);
      if (op.resultId) {
        state.resultIds.set(op.resultId, bodyId);
        results[op.resultId] = bodyId;
      }
    } catch (error) {
      return {
        kind: 'error',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: `Failed at operation: ${op.kind}`,
      };
    }
  }
  
  let meshes: SerializedMesh[] | undefined;
  if (returnMeshes && state.model) {
    meshes = [];
    for (const bodyId of bodyIds) {
      const mesh = tessellateBody(state.model, bodyId as BodyId);
      meshes.push({
        bodyId,
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
      });
    }
  }
  
  return {
    kind: 'buildSequence',
    requestId,
    success: true,
    results,
    bodyIds,
    meshes,
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Worker Integration', () => {
  let state: WorkerState;
  
  beforeEach(() => {
    state = createWorkerState();
  });
  
  describe('Lifecycle Commands', () => {
    it('should initialize the worker', () => {
      const response = handleCommand(state, {
        kind: 'init',
        requestId: generateRequestId(),
      });
      
      expect(response.kind).toBe('init');
      expect(response.success).toBe(true);
      expect(state.initialized).toBe(true);
      expect(state.model).not.toBeNull();
    });
    
    it('should initialize with custom tolerances', () => {
      const response = handleCommand(state, {
        kind: 'init',
        requestId: generateRequestId(),
        tolerances: { length: 0.001, angle: 0.001 },
      });
      
      expect(response.success).toBe(true);
      expect(state.ctx).not.toBeNull();
    });
    
    it('should reset the model', () => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
      handleCommand(state, {
        kind: 'createBox',
        requestId: generateRequestId(),
        params: { width: 1, height: 1, depth: 1 },
      });
      
      const response = handleCommand(state, {
        kind: 'reset',
        requestId: generateRequestId(),
      });
      
      expect(response.kind).toBe('reset');
      expect(response.success).toBe(true);
      expect(state.model!.bodies.liveCount).toBe(0);
    });
    
    it('should dispose the worker', () => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
      
      const response = handleCommand(state, {
        kind: 'dispose',
        requestId: generateRequestId(),
      });
      
      expect(response.kind).toBe('dispose');
      expect(response.success).toBe(true);
      expect(state.initialized).toBe(false);
      expect(state.model).toBeNull();
    });
  });
  
  describe('Modeling Commands', () => {
    beforeEach(() => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
    });
    
    it('should create a box', () => {
      const response = handleCommand(state, {
        kind: 'createBox',
        requestId: generateRequestId(),
        params: { width: 2, height: 3, depth: 4 },
      });
      
      expect(response.kind).toBe('bodyCreated');
      expect(response.success).toBe(true);
      if (response.kind === 'bodyCreated') {
        expect(response.bodyId).toBeDefined();
      }
    });
    
    it('should create an extrude', () => {
      const response = handleCommand(state, {
        kind: 'extrude',
        requestId: generateRequestId(),
        params: {
          plane: {
            origin: [0, 0, 0],
            normal: [0, 0, 1],
            xDir: [1, 0, 0],
          },
          profile: {
            kind: 'rectangle',
            width: 2,
            height: 1,
            centerX: 0,
            centerY: 0,
          },
          distance: 5,
        },
      });
      
      expect(response.kind).toBe('bodyCreated');
      expect(response.success).toBe(true);
    });
    
    it('should fail when not initialized', () => {
      const uninitState = createWorkerState();
      
      const response = handleCommand(uninitState, {
        kind: 'createBox',
        requestId: generateRequestId(),
        params: {},
      });
      
      expect(isErrorResponse(response)).toBe(true);
      if (isErrorResponse(response)) {
        expect(response.error).toContain('not initialized');
      }
    });
  });
  
  describe('Mesh Retrieval', () => {
    beforeEach(() => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
    });
    
    it('should get mesh for a body', () => {
      const createResponse = handleCommand(state, {
        kind: 'createBox',
        requestId: generateRequestId(),
        params: { width: 1, height: 1, depth: 1 },
      });
      
      if (createResponse.kind !== 'bodyCreated') {
        throw new Error('Expected bodyCreated response');
      }
      
      const meshResponse = handleCommand(state, {
        kind: 'getMesh',
        requestId: generateRequestId(),
        bodyId: createResponse.bodyId,
      });
      
      expect(meshResponse.kind).toBe('mesh');
      if (meshResponse.kind === 'mesh') {
        expect(meshResponse.mesh.positions).toBeInstanceOf(Float32Array);
        expect(meshResponse.mesh.normals).toBeInstanceOf(Float32Array);
        expect(meshResponse.mesh.indices).toBeInstanceOf(Uint32Array);
        expect(meshResponse.mesh.positions.length).toBeGreaterThan(0);
      }
    });
    
    it('should get all meshes', () => {
      handleCommand(state, {
        kind: 'createBox',
        requestId: generateRequestId(),
        params: { width: 1, height: 1, depth: 1, center: [-2, 0, 0] },
      });
      handleCommand(state, {
        kind: 'createBox',
        requestId: generateRequestId(),
        params: { width: 1, height: 1, depth: 1, center: [2, 0, 0] },
      });
      
      const response = handleCommand(state, {
        kind: 'getAllMeshes',
        requestId: generateRequestId(),
      });
      
      expect(response.kind).toBe('meshes');
      if (response.kind === 'meshes') {
        expect(response.meshes.length).toBe(2);
      }
    });
  });
  
  describe('Parameter Management', () => {
    beforeEach(() => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
    });
    
    it('should set parameters', () => {
      const response = handleCommand(state, {
        kind: 'setParams',
        requestId: generateRequestId(),
        params: { width: 10, height: 20, name: 'test' },
      });
      
      expect(response.kind).toBe('params');
      if (response.kind === 'params') {
        expect(response.params.width).toBe(10);
        expect(response.params.height).toBe(20);
        expect(response.params.name).toBe('test');
      }
    });
    
    it('should get all parameters', () => {
      handleCommand(state, {
        kind: 'setParams',
        requestId: generateRequestId(),
        params: { a: 1, b: 2, c: 3 },
      });
      
      const response = handleCommand(state, {
        kind: 'getParams',
        requestId: generateRequestId(),
      });
      
      expect(response.kind).toBe('params');
      if (response.kind === 'params') {
        expect(response.params).toEqual({ a: 1, b: 2, c: 3 });
      }
    });
    
    it('should get specific parameters', () => {
      handleCommand(state, {
        kind: 'setParams',
        requestId: generateRequestId(),
        params: { a: 1, b: 2, c: 3 },
      });
      
      const response = handleCommand(state, {
        kind: 'getParams',
        requestId: generateRequestId(),
        paramIds: ['a', 'c'],
      });
      
      expect(response.kind).toBe('params');
      if (response.kind === 'params') {
        expect(response.params).toEqual({ a: 1, c: 3 });
        expect(response.params.b).toBeUndefined();
      }
    });
  });
  
  describe('Build Sequence', () => {
    beforeEach(() => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
    });
    
    it('should build a simple sequence', () => {
      const sequence: BuildSequence = {
        operations: [
          {
            kind: 'createBox',
            params: { width: 1, height: 2, depth: 3 },
            resultId: 'box1',
          },
        ],
      };
      
      const response = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
      });
      
      expect(response.kind).toBe('buildSequence');
      if (response.kind === 'buildSequence') {
        expect(response.bodyIds.length).toBe(1);
        expect(response.results['box1']).toBeDefined();
      }
    });
    
    it('should build a sequence with multiple operations', () => {
      const sequence: BuildSequence = {
        operations: [
          { kind: 'createBox', params: { width: 1 }, resultId: 'box1' },
          { kind: 'createBox', params: { width: 2 }, resultId: 'box2' },
          { kind: 'createBox', params: { width: 3 }, resultId: 'box3' },
        ],
      };
      
      const response = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
      });
      
      expect(response.kind).toBe('buildSequence');
      if (response.kind === 'buildSequence') {
        expect(response.bodyIds.length).toBe(3);
        expect(Object.keys(response.results).length).toBe(3);
      }
    });
    
    it('should return meshes when requested', () => {
      const sequence: BuildSequence = {
        operations: [
          { kind: 'createBox', params: { width: 1, height: 1, depth: 1 } },
        ],
      };
      
      const response = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
        returnMeshes: true,
      });
      
      expect(response.kind).toBe('buildSequence');
      if (response.kind === 'buildSequence') {
        expect(response.meshes).toBeDefined();
        expect(response.meshes!.length).toBe(1);
        expect(response.meshes![0].positions).toBeInstanceOf(Float32Array);
      }
    });
    
    it('should use parameter references in operations', () => {
      // Set parameters first
      handleCommand(state, {
        kind: 'setParams',
        requestId: generateRequestId(),
        params: { boxWidth: 5, boxHeight: 3, boxDepth: 2 },
      });
      
      // Note: Using type assertion because the runtime supports ParamRef
      // but the static types expect numbers (resolved at runtime)
      const sequence: BuildSequence = {
        operations: [
          {
            kind: 'createBox',
            params: {
              width: paramRef('boxWidth') as unknown as number,
              height: paramRef('boxHeight') as unknown as number,
              depth: paramRef('boxDepth') as unknown as number,
            },
          },
        ],
      };
      
      const response = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
        returnMeshes: true,
      });
      
      expect(response.kind).toBe('buildSequence');
      if (response.kind === 'buildSequence') {
        expect(response.bodyIds.length).toBe(1);
        // The mesh should exist and be valid
        expect(response.meshes![0].positions.length).toBeGreaterThan(0);
      }
    });
    
    it('should fail when parameter is missing', () => {
      const sequence: BuildSequence = {
        operations: [
          {
            kind: 'createBox',
            params: {
              width: paramRef('missingParam') as unknown as number,
            },
          },
        ],
      };
      
      const response = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
      });
      
      expect(isErrorResponse(response)).toBe(true);
      if (isErrorResponse(response)) {
        expect(response.error).toContain('Parameter not found');
      }
    });
  });
  
  describe('Parametric Update Workflow', () => {
    beforeEach(() => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
    });
    
    it('should rebuild model when parameters change', () => {
      const sequence: BuildSequence = {
        operations: [
          {
            kind: 'createBox',
            params: {
              width: paramRef('size') as unknown as number,
              height: paramRef('size') as unknown as number,
              depth: paramRef('size') as unknown as number,
            },
            resultId: 'cube',
          },
        ],
      };
      
      // Build with initial parameter
      handleCommand(state, {
        kind: 'setParams',
        requestId: generateRequestId(),
        params: { size: 1 },
      });
      
      const response1 = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
        returnMeshes: true,
      }) as { kind: 'buildSequence'; meshes: SerializedMesh[] };
      
      const mesh1VertexCount = response1.meshes[0].positions.length / 3;
      
      // Update parameter and rebuild
      handleCommand(state, {
        kind: 'setParams',
        requestId: generateRequestId(),
        params: { size: 2 },
      });
      
      const response2 = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
        returnMeshes: true,
      }) as { kind: 'buildSequence'; meshes: SerializedMesh[] };
      
      const mesh2VertexCount = response2.meshes[0].positions.length / 3;
      
      // Vertex count should be the same (same topology, different scale)
      expect(mesh1VertexCount).toBe(mesh2VertexCount);
    });
    
    it('should support mixed literal and parameter values', () => {
      handleCommand(state, {
        kind: 'setParams',
        requestId: generateRequestId(),
        params: { customHeight: 10 },
      });
      
      const sequence: BuildSequence = {
        operations: [
          {
            kind: 'createBox',
            params: {
              width: 5, // literal
              height: paramRef('customHeight') as unknown as number, // from parameter
              depth: 3, // literal
            },
          },
        ],
      };
      
      const response = handleCommand(state, {
        kind: 'buildSequence',
        requestId: generateRequestId(),
        sequence,
      });
      
      expect(response.kind).toBe('buildSequence');
      if (response.kind === 'buildSequence') {
        expect(response.bodyIds.length).toBe(1);
      }
    });
  });
  
  describe('Request ID Correlation', () => {
    it('should preserve request IDs in responses', () => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
      
      const requestId = 'test-request-12345';
      const response = handleCommand(state, {
        kind: 'createBox',
        requestId,
        params: {},
      });
      
      expect(response.requestId).toBe(requestId);
    });
    
    it('should handle unique request IDs for concurrent requests', () => {
      handleCommand(state, { kind: 'init', requestId: generateRequestId() });
      
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const id = generateRequestId();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });
  });
});

describe('Type Guards and Utilities', () => {
  it('isParamRef should identify parameter references', () => {
    expect(isParamRef(paramRef('test'))).toBe(true);
    expect(isParamRef({ __paramRef: true, paramId: 'test' })).toBe(true);
    expect(isParamRef({ paramId: 'test' })).toBe(false);
    expect(isParamRef(null)).toBe(false);
    expect(isParamRef(undefined)).toBe(false);
    expect(isParamRef(123)).toBe(false);
    expect(isParamRef('string')).toBe(false);
  });
  
  it('paramRef should create valid references', () => {
    const ref = paramRef('myParam');
    expect(ref.__paramRef).toBe(true);
    expect(ref.paramId).toBe('myParam');
  });
});
