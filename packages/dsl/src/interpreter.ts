/**
 * DSL Interpreter
 * 
 * Interprets a ModelNode tree and executes the corresponding SolidType
 * kernel operations to produce actual geometry.
 */

import {
  createEmptyModel,
  createNumericContext,
  createRectangleProfile,
  createCircleProfile,
  createDatumPlaneFromNormal,
  extrude,
  revolve,
  booleanOperation,
  tessellateBody,
  vec3,
  type TopoModel,
  type NumericContext,
  type BodyId,
  type DatumPlane,
  type SketchProfile,
} from '@solidtype/core';

import type {
  ModelNode,
  FeatureNode,
  SketchNode,
  ExtrudeNode,
  RevolveNode,
  SweepNode,
  BooleanNode,
  GroupNode,
  PlaneRef,
  ModelBuildResult,
  BuiltBodyHandle,
  FeatureCheckpoint,
  ModelingError,
} from './types.js';

// ============================================================================
// Interpreter Context
// ============================================================================

interface InterpreterContext {
  model: TopoModel;
  numCtx: NumericContext;
  /** Map of sketch ID to its profile */
  sketchProfiles: Map<string, SketchProfile>;
  /** Map of feature ID to body ID */
  featureBodies: Map<string, BodyId>;
  /** Built bodies */
  bodies: BuiltBodyHandle[];
  /** Feature checkpoints for breakpoint support */
  checkpoints: FeatureCheckpoint[];
  /** Errors encountered during interpretation */
  errors: ModelingError[];
  /** Current path in the DSL tree (for error reporting) */
  currentPath: string[];
  /** Last valid checkpoint ID */
  lastValidCheckpointId?: string;
  /** Auto-incrementing ID for features without explicit IDs */
  autoIdCounter: number;
}

// ============================================================================
// Plane Resolution
// ============================================================================

function resolvePlane(planeRef: PlaneRef): DatumPlane {
  if (typeof planeRef === 'string') {
    // Standard plane
    switch (planeRef) {
      case 'XY':
        return createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
      case 'YZ':
        return createDatumPlaneFromNormal('YZ', vec3(0, 0, 0), vec3(1, 0, 0));
      case 'ZX':
        return createDatumPlaneFromNormal('ZX', vec3(0, 0, 0), vec3(0, 1, 0));
      default:
        throw new Error(`Unknown standard plane: ${planeRef}`);
    }
  } else {
    // Custom plane - convert arrays to Vec3 if needed
    const origin = Array.isArray(planeRef.origin) 
      ? vec3(planeRef.origin[0], planeRef.origin[1], planeRef.origin[2])
      : planeRef.origin;
    const normal = Array.isArray(planeRef.normal)
      ? vec3(planeRef.normal[0], planeRef.normal[1], planeRef.normal[2])
      : planeRef.normal;
    const xDir = planeRef.xDir 
      ? (Array.isArray(planeRef.xDir) 
          ? vec3(planeRef.xDir[0], planeRef.xDir[1], planeRef.xDir[2])
          : planeRef.xDir)
      : undefined;
    
    return createDatumPlaneFromNormal('Custom', origin, normal, xDir);
  }
}

// ============================================================================
// Sketch Interpretation
// ============================================================================

function interpretSketch(node: SketchNode, ctx: InterpreterContext): void {
  const plane = resolvePlane(node.plane);
  
  // For now, we only support single entities that become profiles
  // More complex sketches with constraints will be added later
  
  if (node.children.length === 0) {
    ctx.errors.push({
      featureId: node.id,
      message: 'Sketch has no entities',
    });
    return;
  }

  // For v1, we only support single Rectangle or Circle as the entire profile
  const entity = node.children[0];
  let profile: SketchProfile | null = null;

  try {
    switch (entity.kind) {
      case 'Rectangle': {
        profile = createRectangleProfile(
          plane,
          entity.width,
          entity.height,
          entity.centerX ?? 0,
          entity.centerY ?? 0
        );
        break;
      }
      case 'Circle': {
        // Create a circular profile (uses arc internally)
        profile = createCircleProfile(
          plane,
          entity.radius,
          entity.centerX ?? 0,
          entity.centerY ?? 0
        );
        break;
      }
      default:
        ctx.errors.push({
          featureId: node.id,
          message: `Unsupported sketch entity type: ${entity.kind}. Currently only Rectangle and Circle are supported.`,
        });
        return;
    }

    if (profile) {
      ctx.sketchProfiles.set(node.id, profile);
      
      // Record checkpoint
      ctx.checkpoints.push({
        id: node.id,
        kind: 'Sketch',
        label: `Sketch: ${node.id}`,
        dslPath: [...ctx.currentPath],
        hasGeometry: false, // Sketches don't produce visible geometry directly
      });
    }
  } catch (error) {
    ctx.errors.push({
      featureId: node.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Feature Interpretation
// ============================================================================

function generateId(ctx: InterpreterContext, prefix: string): string {
  return `${prefix}_${ctx.autoIdCounter++}`;
}

function interpretExtrude(node: ExtrudeNode, ctx: InterpreterContext): void {
  const featureId = node.id ?? generateId(ctx, 'extrude');
  const profile = ctx.sketchProfiles.get(node.sketch);
  
  if (!profile) {
    ctx.errors.push({
      featureId,
      message: `Sketch "${node.sketch}" not found for extrude`,
    });
    return;
  }

  try {
    const result = extrude(ctx.model, profile, {
      operation: node.op ?? 'add',
      distance: node.distance,
      direction: node.direction,
    });

    if (result.success && result.body !== undefined) {
      ctx.featureBodies.set(featureId, result.body);
      ctx.bodies.push({
        id: featureId,
        bodyId: result.body as number,
        sourceFeatureId: featureId,
      });
      ctx.lastValidCheckpointId = featureId;
      
      ctx.checkpoints.push({
        id: featureId,
        kind: 'Extrude',
        label: `Extrude: ${node.distance}`,
        dslPath: [...ctx.currentPath],
        hasGeometry: true,
      });
    } else {
      ctx.errors.push({
        featureId,
        message: `Extrude failed: ${result.error ?? 'Unknown error'}`,
      });
    }
  } catch (error) {
    ctx.errors.push({
      featureId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function interpretRevolve(node: RevolveNode, ctx: InterpreterContext): void {
  const featureId = node.id ?? generateId(ctx, 'revolve');
  const profile = ctx.sketchProfiles.get(node.sketch);
  
  if (!profile) {
    ctx.errors.push({
      featureId,
      message: `Sketch "${node.sketch}" not found for revolve`,
    });
    return;
  }

  try {
    // Convert axis ref to revolve axis parameters
    // The core revolve function expects { origin: Vec3, direction: Vec3 }
    let axis: { origin: [number, number, number]; direction: [number, number, number] };
    
    if (node.axis.kind === 'sketchAxis') {
      const offset = node.axis.offset ?? 0;
      if (node.axis.axis === 'x') {
        // X axis at y=offset
        axis = {
          origin: vec3(0, offset, 0),
          direction: vec3(1, 0, 0),
        };
      } else {
        // Y axis at x=offset
        axis = {
          origin: vec3(offset, 0, 0),
          direction: vec3(0, 1, 0),
        };
      }
    } else {
      // Custom axis
      const origin = Array.isArray(node.axis.origin)
        ? vec3(node.axis.origin[0], node.axis.origin[1], 0)
        : vec3(0, 0, 0);
      const direction = Array.isArray(node.axis.direction)
        ? vec3(node.axis.direction[0], node.axis.direction[1], 0)
        : vec3(0, 1, 0);
      axis = { origin, direction };
    }

    const result = revolve(ctx.model, profile, {
      operation: node.op ?? 'add',
      axis,
      angle: node.angle ?? Math.PI * 2,
    });

    if (result.success && result.body !== undefined) {
      ctx.featureBodies.set(featureId, result.body);
      ctx.bodies.push({
        id: featureId,
        bodyId: result.body as number,
        sourceFeatureId: featureId,
      });
      ctx.lastValidCheckpointId = featureId;
      
      ctx.checkpoints.push({
        id: featureId,
        kind: 'Revolve',
        label: `Revolve: ${((node.angle ?? Math.PI * 2) * 180 / Math.PI).toFixed(0)}°`,
        dslPath: [...ctx.currentPath],
        hasGeometry: true,
      });
    } else {
      ctx.errors.push({
        featureId,
        message: `Revolve failed: ${result.error ?? 'Unknown error'}`,
      });
    }
  } catch (error) {
    ctx.errors.push({
      featureId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function interpretSweep(node: SweepNode, ctx: InterpreterContext): void {
  const featureId = node.id ?? generateId(ctx, 'sweep');
  
  // Sweep is not yet implemented in the kernel
  ctx.errors.push({
    featureId,
    message: 'Sweep operation is not yet implemented',
  });
  
  ctx.checkpoints.push({
    id: featureId,
    kind: 'Sweep',
    label: 'Sweep (not implemented)',
    dslPath: [...ctx.currentPath],
    hasGeometry: false,
  });
}

function interpretBoolean(node: BooleanNode, ctx: InterpreterContext): void {
  const featureId = node.id ?? generateId(ctx, 'boolean');
  
  if (node.bodies.length < 2) {
    ctx.errors.push({
      featureId,
      message: 'Boolean operation requires at least 2 bodies',
    });
    return;
  }

  const bodyA = ctx.featureBodies.get(node.bodies[0]);
  const bodyB = ctx.featureBodies.get(node.bodies[1]);
  
  if (!bodyA || !bodyB) {
    ctx.errors.push({
      featureId,
      message: `One or more bodies not found for boolean: ${node.bodies.join(', ')}`,
    });
    return;
  }

  try {
    const result = booleanOperation(ctx.model, bodyA, bodyB, {
      operation: node.operation,
    });

    if (result.success && result.body !== undefined) {
      ctx.featureBodies.set(featureId, result.body);
      ctx.bodies.push({
        id: featureId,
        bodyId: result.body as number,
        sourceFeatureId: featureId,
      });
      ctx.lastValidCheckpointId = featureId;
      
      ctx.checkpoints.push({
        id: featureId,
        kind: 'Boolean',
        label: `Boolean: ${node.operation}`,
        dslPath: [...ctx.currentPath],
        hasGeometry: true,
      });
    } else {
      ctx.errors.push({
        featureId,
        message: `Boolean operation failed: ${result.error ?? 'Unknown error'}`,
      });
    }
  } catch (error) {
    ctx.errors.push({
      featureId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function interpretGroup(node: GroupNode, ctx: InterpreterContext): void {
  const featureId = node.id ?? generateId(ctx, 'group');
  
  ctx.currentPath.push(featureId);
  
  ctx.checkpoints.push({
    id: featureId,
    kind: 'Group',
    label: node.name ?? `Group: ${featureId}`,
    dslPath: [...ctx.currentPath],
    hasGeometry: false,
  });
  
  for (const child of node.children) {
    interpretFeature(child, ctx);
  }
  
  ctx.currentPath.pop();
}

function interpretFeature(node: FeatureNode, ctx: InterpreterContext): void {
  switch (node.kind) {
    case 'Sketch':
      interpretSketch(node, ctx);
      break;
    case 'Extrude':
      interpretExtrude(node, ctx);
      break;
    case 'Revolve':
      interpretRevolve(node, ctx);
      break;
    case 'Sweep':
      interpretSweep(node, ctx);
      break;
    case 'Boolean':
      interpretBoolean(node, ctx);
      break;
    case 'Group':
      interpretGroup(node, ctx);
      break;
    default:
      ctx.errors.push({
        message: `Unknown feature type: ${(node as any).kind}`,
      });
  }
}

// ============================================================================
// Main Interpreter Entry Point
// ============================================================================

/**
 * Interpret a ModelNode tree and produce geometry
 * 
 * @param modelNode - The root ModelNode from the DSL
 * @returns ModelBuildResult with bodies, checkpoints, and errors
 */
export function interpretModel(modelNode: ModelNode): ModelBuildResult {
  const numCtx = createNumericContext();
  const model = createEmptyModel(numCtx);
  
  const ctx: InterpreterContext = {
    model,
    numCtx,
    sketchProfiles: new Map(),
    featureBodies: new Map(),
    bodies: [],
    checkpoints: [],
    errors: [],
    currentPath: [],
    autoIdCounter: 1,
  };

  // Validate root node
  if (modelNode.kind !== 'Model') {
    return {
      success: false,
      bodies: [],
      checkpoints: [],
      errors: [{
        message: 'Root node must be a <Model> element',
      }],
    };
  }

  // Interpret each feature
  for (const feature of modelNode.children) {
    interpretFeature(feature, ctx);
  }

  return {
    success: ctx.errors.length === 0,
    bodies: ctx.bodies,
    checkpoints: ctx.checkpoints,
    errors: ctx.errors,
    lastValidCheckpointId: ctx.lastValidCheckpointId,
  };
}

/**
 * Get mesh data for a built body
 */
export function getMeshForBody(
  modelNode: ModelNode,
  bodyId: number
): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } | null {
  // Re-interpret the model to get the TopoModel
  // In a real implementation, we'd cache this
  const numCtx = createNumericContext();
  const model = createEmptyModel(numCtx);
  
  const ctx: InterpreterContext = {
    model,
    numCtx,
    sketchProfiles: new Map(),
    featureBodies: new Map(),
    bodies: [],
    checkpoints: [],
    errors: [],
    currentPath: [],
    autoIdCounter: 1,
  };

  for (const feature of modelNode.children) {
    interpretFeature(feature, ctx);
  }

  // Find the body and tessellate
  const body = ctx.bodies.find(b => b.bodyId === bodyId);
  if (!body) return null;

  try {
    const mesh = tessellateBody(ctx.model, body.bodyId as BodyId);
    return mesh;
  } catch {
    return null;
  }
}

/**
 * Interpret and get all meshes at once
 */
export function interpretModelWithMeshes(modelNode: ModelNode): {
  result: ModelBuildResult;
  meshes: Map<string, { positions: Float32Array; normals: Float32Array; indices: Uint32Array }>;
} {
  const numCtx = createNumericContext();
  const model = createEmptyModel(numCtx);
  
  const ctx: InterpreterContext = {
    model,
    numCtx,
    sketchProfiles: new Map(),
    featureBodies: new Map(),
    bodies: [],
    checkpoints: [],
    errors: [],
    currentPath: [],
    autoIdCounter: 1,
  };

  if (modelNode.kind !== 'Model') {
    return {
      result: {
        success: false,
        bodies: [],
        checkpoints: [],
        errors: [{ message: 'Root node must be a <Model> element' }],
      },
      meshes: new Map(),
    };
  }

  for (const feature of modelNode.children) {
    interpretFeature(feature, ctx);
  }

  // Tessellate all bodies
  const meshes = new Map<string, { positions: Float32Array; normals: Float32Array; indices: Uint32Array }>();
  
  for (const body of ctx.bodies) {
    try {
      const mesh = tessellateBody(ctx.model, body.bodyId as BodyId);
      meshes.set(body.id, mesh);
    } catch (error) {
      ctx.errors.push({
        featureId: body.id,
        message: `Failed to tessellate body: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    result: {
      success: ctx.errors.length === 0,
      bodies: ctx.bodies,
      checkpoints: ctx.checkpoints,
      errors: ctx.errors,
      lastValidCheckpointId: ctx.lastValidCheckpointId,
    },
    meshes,
  };
}
