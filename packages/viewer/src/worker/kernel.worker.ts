/**
 * Kernel Worker
 * 
 * Runs the SolidType kernel in a Web Worker for off-main-thread modeling.
 * Handles incoming commands and sends responses back to the main thread.
 */

/// <reference lib="webworker" />

import {
  createNumericContext,
  createEmptyModel,
  createBox,
  tessellateBody,
  extrude,
  revolve,
  booleanOperation,
  createRectangleProfile,
  createCircleProfile,
  XY_PLANE,
  YZ_PLANE,
  ZX_PLANE,
  createDatumPlaneFromNormal,
  createNamingStrategy,
  iterateBodies,
  createSketch as coreCreateSketch,
  addPoint as coreAddPoint,
  addFixedPoint as coreAddFixedPoint,
  addLine as coreAddLine,
  addArc as coreAddArc,
  solveSketch,
  coincident,
  horizontalPoints,
  horizontalLine,
  verticalPoints,
  verticalLine,
  parallel,
  perpendicular,
  equalLength,
  fixed,
  distance,
  angle,
  tangent,
  pointOnLine,
  pointOnArc,
  equalRadius,
  concentric,
  symmetric,
  midpoint,
  arcArcTangent,
  radiusDimension,
  pointToLineDistance,
  type TopoModel,
  type NumericContext,
  type NamingStrategy,
  type BodyId,
  type DatumPlane,
  type SketchProfile,
  type SketchPointId,
  type SketchEntityId,
  type Constraint,
  type ConstraintId,
  type RevolveAxis,
} from '@solidtype/core';

import type {
  WorkerCommand,
  WorkerResponse,
  SerializedMesh,
  SerializedSketch,
  SerializedSolveResult,
  ExtrudeParams,
  RevolveParams,
  DragPoint,
  BoxParams,
  BooleanParams,
} from './types.js';
import { getTransferables } from './types.js';

// ============================================================================
// Worker State
// ============================================================================

let ctx: NumericContext | null = null;
let model: TopoModel | null = null;
let naming: NamingStrategy | null = null;
let initialized = false;

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;
  
  try {
    const response = handleCommand(command);
    const transferables = getTransferables(response);
    self.postMessage(response, transferables);
  } catch (error) {
    const errorResponse: WorkerResponse = {
      kind: 'error',
      requestId: command.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined,
    };
    self.postMessage(errorResponse);
  }
};

// ============================================================================
// Command Handlers
// ============================================================================

function handleCommand(command: WorkerCommand): WorkerResponse {
  switch (command.kind) {
    case 'init':
      return handleInit(command.requestId, command.tolerances);
    
    case 'dispose':
      return handleDispose(command.requestId);
    
    case 'reset':
      return handleReset(command.requestId);
    
    case 'createBox':
      return handleCreateBox(command.requestId, command.params);
    
    case 'extrude':
      return handleExtrude(command.requestId, command.params);
    
    case 'revolve':
      return handleRevolve(command.requestId, command.params);
    
    case 'boolean':
      return handleBoolean(command.requestId, command.params);
    
    case 'getMesh':
      return handleGetMesh(command.requestId, command.bodyId, command.options);
    
    case 'getAllMeshes':
      return handleGetAllMeshes(command.requestId, command.options);
    
    case 'solveSketch':
      return handleSolveSketch(command.requestId, command.sketch, command.dragPoint, command.options);
    
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
  requestId: string,
  tolerances?: { length?: number; angle?: number }
): WorkerResponse {
  ctx = createNumericContext(tolerances);
  model = createEmptyModel(ctx);
  naming = createNamingStrategy();
  initialized = true;
  
  return {
    kind: 'init',
    requestId,
    success: true,
  };
}

function handleDispose(requestId: string): WorkerResponse {
  ctx = null;
  model = null;
  naming = null;
  initialized = false;
  
  return {
    kind: 'dispose',
    requestId,
    success: true,
  };
}

function handleReset(requestId: string): WorkerResponse {
  ensureInitialized();
  
  // Create fresh model and naming strategy
  model = createEmptyModel(ctx!);
  naming = createNamingStrategy();
  
  return {
    kind: 'reset',
    requestId,
    success: true,
  };
}

function handleCreateBox(requestId: string, params: BoxParams): WorkerResponse {
  ensureInitialized();
  
  const bodyId = createBox(model!, {
    width: params.width,
    depth: params.depth,
    height: params.height,
    center: params.center,
  });
  
  return {
    kind: 'bodyCreated',
    requestId,
    success: true,
    bodyId: bodyId as number,
  };
}

function handleExtrude(requestId: string, params: ExtrudeParams): WorkerResponse {
  ensureInitialized();
  
  const plane = resolvePlane(params.plane);
  const profile = createProfile(params.profile, plane);
  
  const result = extrude(model!, profile, {
    distance: params.distance,
    direction: params.direction,
    operation: params.operation ?? 'add',
    targetBody: params.targetBodyId as BodyId | undefined,
    namingStrategy: naming!,
  });
  
  if (!result.success) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: result.error ?? 'Extrude operation failed',
    };
  }
  
  return {
    kind: 'bodyCreated',
    requestId,
    success: true,
    bodyId: result.body as number,
  };
}

function handleRevolve(requestId: string, params: RevolveParams): WorkerResponse {
  ensureInitialized();
  
  const plane = resolvePlane(params.plane);
  const profile = createProfile(params.profile, plane);
  
  // Resolve axis - need to compute 3D axis from profile plane
  const axis = resolveAxis(params.axis, plane);
  
  const result = revolve(model!, profile, {
    axis,
    angle: params.angle ?? Math.PI * 2,
    operation: params.operation ?? 'add',
    targetBody: params.targetBodyId as BodyId | undefined,
    namingStrategy: naming!,
  });
  
  if (!result.success) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: result.error ?? 'Revolve operation failed',
    };
  }
  
  return {
    kind: 'bodyCreated',
    requestId,
    success: true,
    bodyId: result.body as number,
  };
}

function handleBoolean(requestId: string, params: BooleanParams): WorkerResponse {
  ensureInitialized();
  
  const result = booleanOperation(
    model!,
    params.bodyAId as BodyId,
    params.bodyBId as BodyId,
    {
      operation: params.operation,
      namingStrategy: naming!,
    }
  );
  
  if (!result.success) {
    return {
      kind: 'error',
      requestId,
      success: false,
      error: result.error ?? 'Boolean operation failed',
    };
  }
  
  return {
    kind: 'bodyCreated',
    requestId,
    success: true,
    bodyId: result.body as number,
  };
}

function handleGetMesh(
  requestId: string,
  bodyId: number,
  _options?: { tolerance?: number }
): WorkerResponse {
  ensureInitialized();
  
  const mesh = tessellateBody(model!, bodyId as BodyId);
  
  const serializedMesh: SerializedMesh = {
    bodyId,
    positions: mesh.positions,
    normals: mesh.normals,
    indices: mesh.indices,
  };
  
  return {
    kind: 'mesh',
    requestId,
    success: true,
    mesh: serializedMesh,
  };
}

function handleGetAllMeshes(
  requestId: string,
  _options?: { tolerance?: number }
): WorkerResponse {
  ensureInitialized();
  
  const meshes: SerializedMesh[] = [];
  
  for (const bodyId of iterateBodies(model!)) {
    const mesh = tessellateBody(model!, bodyId);
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
}

function handleSolveSketch(
  requestId: string,
  serializedSketch: SerializedSketch,
  dragPoint?: DragPoint,
  options?: { maxIterations?: number; tolerance?: number }
): WorkerResponse {
  // Create a sketch from serialized data
  const plane = createDatumPlaneFromNormal(
    serializedSketch.name ?? 'sketch',
    serializedSketch.planeOrigin,
    serializedSketch.planeNormal,
    serializedSketch.planeXDir
  );
  
  const sketch = coreCreateSketch(plane, serializedSketch.name);
  
  // Map from serialized IDs to actual IDs
  const pointIdMap = new Map<number, SketchPointId>();
  const entityIdMap = new Map<number, SketchEntityId>();
  
  // Add points
  for (const sp of serializedSketch.points) {
    const pid = sp.fixed 
      ? coreAddFixedPoint(sketch, sp.x, sp.y, sp.name)
      : coreAddPoint(sketch, sp.x, sp.y, { name: sp.name });
    pointIdMap.set(sp.id, pid);
  }
  
  // Add entities
  for (const se of serializedSketch.entities) {
    const startId = pointIdMap.get(se.start);
    const endId = pointIdMap.get(se.end);
    
    if (!startId || !endId) continue;
    
    if (se.kind === 'line') {
      const eid = coreAddLine(sketch, startId, endId, { construction: se.construction });
      entityIdMap.set(se.id, eid);
    } else if (se.kind === 'arc' && se.center !== undefined) {
      const centerId = pointIdMap.get(se.center);
      if (centerId) {
        const eid = coreAddArc(sketch, startId, endId, centerId, se.ccw, { construction: se.construction });
        entityIdMap.set(se.id, eid);
      }
    }
  }
  
  // Build constraints
  const constraints: Constraint[] = [];
  for (const sc of serializedSketch.constraints) {
    const constraint = deserializeConstraint(sc, pointIdMap, entityIdMap);
    if (constraint) {
      constraints.push(constraint);
    }
  }
  
  // Build driven points map for drag
  const drivenPoints = new Map<SketchPointId, [number, number]>();
  if (dragPoint) {
    const mappedId = pointIdMap.get(dragPoint.pointId);
    if (mappedId) {
      drivenPoints.set(mappedId, [dragPoint.target[0], dragPoint.target[1]]);
    }
  }
  
  // Solve
  const result = solveSketch(sketch, constraints, {
    maxIterations: options?.maxIterations,
    tolerance: options?.tolerance,
    drivenPoints,
  });
  
  // Build updated points
  const updatedPoints: Array<{ id: number; x: number; y: number }> = [];
  for (const [serializedId, actualId] of pointIdMap) {
    const point = sketch.points.get(actualId);
    if (point) {
      updatedPoints.push({
        id: serializedId,
        x: point.x,
        y: point.y,
      });
    }
  }
  
  // Map status to our serialized type
  const solveStatus = mapSolveStatus(result.status);
  
  const solveResult: SerializedSolveResult = {
    status: solveStatus,
    iterations: result.iterations,
    residual: result.residual,
    satisfied: result.satisfied,
    message: result.message,
    remainingDOF: result.remainingDOF,
    updatedPoints,
  };
  
  return {
    kind: 'solveSketch',
    requestId,
    success: true,
    result: solveResult,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function ensureInitialized(): void {
  if (!initialized || !model || !ctx || !naming) {
    throw new Error('Worker not initialized. Call init() first.');
  }
}

function resolvePlane(plane: ExtrudeParams['plane']): DatumPlane {
  if (plane === 'XY') return XY_PLANE;
  if (plane === 'YZ') return YZ_PLANE;
  if (plane === 'ZX') return ZX_PLANE;
  return createDatumPlaneFromNormal('custom', plane.origin, plane.normal, plane.xDir);
}

function resolveAxis(
  axisParams: RevolveParams['axis'],
  plane: DatumPlane
): RevolveAxis {
  // Get the plane basis vectors from the surface
  const planeOrigin = plane.surface.origin;
  const planeXDir = plane.surface.xDir;
  const planeYDir = plane.surface.yDir;
  
  if (axisParams.kind === 'custom' && axisParams.origin && axisParams.direction) {
    // Custom axis in 2D - convert to 3D
    const origin2d = axisParams.origin;
    const dir2d = axisParams.direction;
    
    // Convert 2D origin to 3D
    const origin3d: [number, number, number] = [
      planeOrigin[0] + origin2d[0] * planeXDir[0] + origin2d[1] * planeYDir[0],
      planeOrigin[1] + origin2d[0] * planeXDir[1] + origin2d[1] * planeYDir[1],
      planeOrigin[2] + origin2d[0] * planeXDir[2] + origin2d[1] * planeYDir[2],
    ];
    
    // Convert 2D direction to 3D
    const direction3d: [number, number, number] = [
      dir2d[0] * planeXDir[0] + dir2d[1] * planeYDir[0],
      dir2d[0] * planeXDir[1] + dir2d[1] * planeYDir[1],
      dir2d[0] * planeXDir[2] + dir2d[1] * planeYDir[2],
    ];
    
    return { origin: origin3d, direction: direction3d };
  } else if (axisParams.kind === 'y') {
    // Y axis in profile plane with optional offset
    const offset = axisParams.offset ?? 0;
    const origin3d: [number, number, number] = [
      planeOrigin[0] + offset * planeXDir[0],
      planeOrigin[1] + offset * planeXDir[1],
      planeOrigin[2] + offset * planeXDir[2],
    ];
    // Direction along Y in profile plane
    const direction3d: [number, number, number] = [
      planeYDir[0],
      planeYDir[1],
      planeYDir[2],
    ];
    return { origin: origin3d, direction: direction3d };
  } else {
    // X axis in profile plane with optional offset
    const offset = axisParams.offset ?? 0;
    const origin3d: [number, number, number] = [
      planeOrigin[0] + offset * planeYDir[0],
      planeOrigin[1] + offset * planeYDir[1],
      planeOrigin[2] + offset * planeYDir[2],
    ];
    // Direction along X in profile plane
    const direction3d: [number, number, number] = [
      planeXDir[0],
      planeXDir[1],
      planeXDir[2],
    ];
    return { origin: origin3d, direction: direction3d };
  }
}

function createProfile(
  profile: ExtrudeParams['profile'],
  plane: DatumPlane
): SketchProfile {
  if (profile.kind === 'rectangle') {
    return createRectangleProfile(
      plane,
      profile.width,
      profile.height,
      profile.centerX ?? 0,
      profile.centerY ?? 0
    );
  } else {
    // Note: segments parameter is currently not supported by createCircleProfile
    return createCircleProfile(
      plane,
      profile.radius,
      profile.centerX ?? 0,
      profile.centerY ?? 0
    );
  }
}

function mapSolveStatus(status: string): SerializedSolveResult['status'] {
  switch (status) {
    case 'success':
    case 'converged':
    case 'under_constrained':
    case 'over_constrained':
    case 'not_converged':
    case 'singular':
      return status;
    default:
      return 'not_converged';
  }
}

function deserializeConstraint(
  sc: { kind: string; data: Record<string, unknown>; active?: boolean; weight?: number; id: number },
  pointIdMap: Map<number, SketchPointId>,
  entityIdMap: Map<number, SketchEntityId>
): Constraint | null {
  const mapPoint = (id: unknown): SketchPointId | undefined => 
    typeof id === 'number' ? pointIdMap.get(id) : undefined;
  const mapEntity = (id: unknown): SketchEntityId | undefined => 
    typeof id === 'number' ? entityIdMap.get(id) : undefined;
  
  let constraint: Constraint | null = null;
  
  switch (sc.kind) {
    case 'coincident': {
      const p1 = mapPoint(sc.data.p1);
      const p2 = mapPoint(sc.data.p2);
      if (p1 && p2) constraint = coincident(p1, p2);
      break;
    }
    case 'horizontal': {
      if ('line' in sc.data) {
        const line = mapEntity(sc.data.line);
        if (line) constraint = horizontalLine(line);
      } else {
        const p1 = mapPoint(sc.data.p1);
        const p2 = mapPoint(sc.data.p2);
        if (p1 && p2) constraint = horizontalPoints(p1, p2);
      }
      break;
    }
    case 'vertical': {
      if ('line' in sc.data) {
        const line = mapEntity(sc.data.line);
        if (line) constraint = verticalLine(line);
      } else {
        const p1 = mapPoint(sc.data.p1);
        const p2 = mapPoint(sc.data.p2);
        if (p1 && p2) constraint = verticalPoints(p1, p2);
      }
      break;
    }
    case 'parallel': {
      const line1 = mapEntity(sc.data.line1);
      const line2 = mapEntity(sc.data.line2);
      if (line1 && line2) constraint = parallel(line1, line2);
      break;
    }
    case 'perpendicular': {
      const line1 = mapEntity(sc.data.line1);
      const line2 = mapEntity(sc.data.line2);
      if (line1 && line2) constraint = perpendicular(line1, line2);
      break;
    }
    case 'equalLength': {
      const line1 = mapEntity(sc.data.line1);
      const line2 = mapEntity(sc.data.line2);
      if (line1 && line2) constraint = equalLength(line1, line2);
      break;
    }
    case 'fixed': {
      const point = mapPoint(sc.data.point);
      const position = sc.data.position as [number, number] | undefined;
      if (point && position) constraint = fixed(point, position);
      break;
    }
    case 'distance': {
      const p1 = mapPoint(sc.data.p1);
      const p2 = mapPoint(sc.data.p2);
      const dist = sc.data.distance as number | undefined;
      if (p1 && p2 && typeof dist === 'number') constraint = distance(p1, p2, dist);
      break;
    }
    case 'angle': {
      const line1 = mapEntity(sc.data.line1);
      const line2 = mapEntity(sc.data.line2);
      const ang = sc.data.angle as number | undefined;
      if (line1 && line2 && typeof ang === 'number') constraint = angle(line1, line2, ang);
      break;
    }
    case 'tangent': {
      const line = mapEntity(sc.data.line);
      const arc = mapEntity(sc.data.arc);
      const lineEndpoint = (sc.data.lineEndpoint as 'start' | 'end' | undefined) ?? 'end';
      const arcEndpoint = (sc.data.arcEndpoint as 'start' | 'end' | undefined) ?? 'start';
      if (line && arc) constraint = tangent(line, arc, lineEndpoint, arcEndpoint);
      break;
    }
    case 'pointOnLine': {
      const point = mapPoint(sc.data.point);
      const line = mapEntity(sc.data.line);
      if (point && line) constraint = pointOnLine(point, line);
      break;
    }
    case 'pointOnArc': {
      const point = mapPoint(sc.data.point);
      const arc = mapEntity(sc.data.arc);
      if (point && arc) constraint = pointOnArc(point, arc);
      break;
    }
    case 'equalRadius': {
      const arc1 = mapEntity(sc.data.arc1);
      const arc2 = mapEntity(sc.data.arc2);
      if (arc1 && arc2) constraint = equalRadius(arc1, arc2);
      break;
    }
    case 'concentric': {
      const arc1 = mapEntity(sc.data.arc1);
      const arc2 = mapEntity(sc.data.arc2);
      if (arc1 && arc2) constraint = concentric(arc1, arc2);
      break;
    }
    case 'symmetric': {
      const p1 = mapPoint(sc.data.p1);
      const p2 = mapPoint(sc.data.p2);
      const symmetryLine = mapEntity(sc.data.symmetryLine);
      if (p1 && p2 && symmetryLine) constraint = symmetric(p1, p2, symmetryLine);
      break;
    }
    case 'midpoint': {
      const point = mapPoint(sc.data.point);
      const line = mapEntity(sc.data.line);
      if (point && line) constraint = midpoint(point, line);
      break;
    }
    case 'arcArcTangent': {
      const arc1 = mapEntity(sc.data.arc1);
      const arc2 = mapEntity(sc.data.arc2);
      const internal = sc.data.internal as boolean | undefined;
      if (arc1 && arc2) constraint = arcArcTangent(arc1, arc2, internal);
      break;
    }
    case 'radiusDimension': {
      const arc = mapEntity(sc.data.arc);
      const radius = sc.data.radius as number | undefined;
      if (arc && typeof radius === 'number') constraint = radiusDimension(arc, radius);
      break;
    }
    case 'pointToLineDistance': {
      const point = mapPoint(sc.data.point);
      const line = mapEntity(sc.data.line);
      const dist = sc.data.distance as number | undefined;
      if (point && line && typeof dist === 'number') constraint = pointToLineDistance(point, line, dist);
      break;
    }
  }
  
  if (constraint) {
    // Assign the constraint ID from serialized data
    (constraint as unknown as { id: number }).id = sc.id as unknown as ConstraintId;
    if (sc.active !== undefined) constraint.active = sc.active;
    if (sc.weight !== undefined) constraint.weight = sc.weight;
  }
  
  return constraint;
}
