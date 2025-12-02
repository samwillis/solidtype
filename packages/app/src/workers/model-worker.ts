/**
 * Model Worker
 * 
 * Executes transpiled DSL code in a sandboxed environment and produces geometry.
 * 
 * Security notes:
 * - Code is executed in a worker context (no DOM access)
 * - Only the DSL API is exposed to user code
 * - No arbitrary imports allowed
 */

import {
  sjsx,
  Model,
  Sketch,
  Rectangle,
  Circle,
  Line,
  Arc,
  Extrude,
  Revolve,
  Sweep,
  Boolean,
  Group,
  interpretModelWithMeshes,
  type ModelNode,
} from '@solidtype/dsl';

import type {
  ModelWorkerMessage,
  ModelWorkerResponse,
  SerializedMesh,
} from './model-worker.types.js';

// ============================================================================
// DSL Runtime Environment
// ============================================================================

/**
 * Create the sandboxed runtime environment for DSL code
 * Only exposes the modeling DSL components
 */
function createDSLRuntime() {
  return {
    // JSX factory
    sjsx,
    
    // DSL components
    Model,
    Sketch,
    Rectangle,
    Circle,
    Line,
    Arc,
    Extrude,
    Revolve,
    Sweep,
    Boolean,
    Group,
    
    // Math helpers (commonly needed)
    Math,
    
    // Console for debugging (limited)
    console: {
      log: (...args: unknown[]) => console.log('[Part]', ...args),
      warn: (...args: unknown[]) => console.warn('[Part]', ...args),
      error: (...args: unknown[]) => console.error('[Part]', ...args),
    },
  };
}

/**
 * Strip import/export statements from transpiled code
 * 
 * The transpiled code may contain import statements that won't work
 * in the Function() context. We need to strip them since we provide
 * the DSL runtime as function arguments.
 */
function stripModuleStatements(code: string): string {
  // Remove import statements (handles multiline imports too)
  let result = code.replace(/^import\s+.*?['"].*?['"];?\s*$/gm, '');
  result = result.replace(/^import\s*\{[^}]*\}\s*from\s*['"].*?['"];?\s*$/gm, '');
  result = result.replace(/^import\s+\*\s+as\s+\w+\s+from\s+['"].*?['"];?\s*$/gm, '');
  
  // Remove export keywords but keep the function/variable declarations
  result = result.replace(/^export\s+(?=function|const|let|var|class|type|interface)/gm, '');
  result = result.replace(/^export\s+default\s+/gm, '');
  
  return result;
}

/**
 * Execute transpiled JS code and extract the Part function
 */
function executeCode(
  jsCode: string,
  entryFunction: string = 'Part'
): (props: Record<string, unknown>) => ModelNode {
  const runtime = createDSLRuntime();
  
  // Create function arguments from runtime
  const argNames = Object.keys(runtime);
  const argValues = Object.values(runtime);
  
  // Strip imports/exports since we provide the runtime
  const cleanCode = stripModuleStatements(jsCode);
  
  // Wrap code to export the Part function
  // The transpiled code should have: function Part(props) { ... }
  // (after stripping exports)
  const wrappedCode = `
    "use strict";
    ${cleanCode}
    return typeof ${entryFunction} === 'function' ? ${entryFunction} : null;
  `;
  
  try {
    // Create a function that takes the runtime as arguments
    const factory = new Function(...argNames, wrappedCode);
    const partFn = factory(...argValues);
    
    if (typeof partFn !== 'function') {
      throw new Error(`Entry function "${entryFunction}" not found or not a function`);
    }
    
    return partFn;
  } catch (error) {
    throw new Error(`Failed to execute code: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Message Handling
// ============================================================================

function handleBuildModel(msg: ModelWorkerMessage & { kind: 'buildModel' }): ModelWorkerResponse {
  const { requestId, jsCode, entryFunction = 'Part', props = {} } = msg;
  
  try {
    // Execute the code to get the Part function
    const partFn = executeCode(jsCode, entryFunction);
    
    // Call the Part function with props
    const modelNode = partFn(props);
    
    // Validate we got a Model node
    if (!modelNode || modelNode.kind !== 'Model') {
      return {
        kind: 'buildError',
        requestId,
        success: false,
        errors: [{
          message: `Part function must return a <Model> element, got: ${modelNode?.kind ?? 'undefined'}`,
        }],
      };
    }
    
    // Interpret the model and get meshes
    const { result, meshes: meshMap } = interpretModelWithMeshes(modelNode);
    
    // Convert meshes to serialized format
    const meshes: SerializedMesh[] = [];
    for (const [id, mesh] of meshMap) {
      meshes.push({
        id,
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
      });
    }
    
    if (result.success) {
      return {
        kind: 'buildResult',
        requestId,
        success: true,
        bodies: result.bodies,
        checkpoints: result.checkpoints,
        meshes,
        lastValidCheckpointId: result.lastValidCheckpointId,
      };
    } else {
      return {
        kind: 'buildError',
        requestId,
        success: false,
        errors: result.errors,
        partialCheckpoints: result.checkpoints,
        partialMeshes: meshes,
        lastValidCheckpointId: result.lastValidCheckpointId,
      };
    }
  } catch (error) {
    return {
      kind: 'buildError',
      requestId,
      success: false,
      errors: [],
      runtimeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleBuildToCheckpoint(
  msg: ModelWorkerMessage & { kind: 'buildToCheckpoint' }
): ModelWorkerResponse {
  // For now, just do a full build - checkpoint stopping will be added later
  // TODO: Implement proper checkpoint stopping
  return handleBuildModel({
    kind: 'buildModel',
    requestId: msg.requestId,
    jsCode: msg.jsCode,
    entryFunction: msg.entryFunction,
    props: msg.props,
  });
}

// ============================================================================
// Worker Entry Point
// ============================================================================

self.addEventListener('message', (event: MessageEvent<ModelWorkerMessage>) => {
  const msg = event.data;
  let response: ModelWorkerResponse;
  
  switch (msg.kind) {
    case 'buildModel':
      response = handleBuildModel(msg);
      break;
    case 'buildToCheckpoint':
      response = handleBuildToCheckpoint(msg);
      break;
    default:
      response = {
        kind: 'buildError',
        requestId: (msg as any).requestId ?? 0,
        success: false,
        errors: [],
        runtimeError: `Unknown message kind: ${(msg as any).kind}`,
      };
  }
  
  // Get transferables for zero-copy transfer
  const transferables: Transferable[] = [];
  if (response.kind === 'buildResult') {
    for (const mesh of response.meshes) {
      transferables.push(mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer);
    }
  } else if (response.partialMeshes) {
    for (const mesh of response.partialMeshes) {
      transferables.push(mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer);
    }
  }
  
  // Use type assertion for Worker postMessage which accepts transferables
  (self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void })
    .postMessage(response, transferables);
});

// Signal that worker is ready
console.log('[ModelWorker] Ready');
