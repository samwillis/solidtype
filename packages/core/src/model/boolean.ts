/**
 * Boolean operations on solid bodies
 */

import type { Vec3 } from '../num/vec3.js';
import { vec3, add3, sub3, mul3, dot3 } from '../num/vec3.js';
import type { NumericContext } from '../num/tolerance.js';
import { isZero } from '../num/tolerance.js';
import type { PlaneSurface } from '../geom/surface.js';
import { createPlaneSurface, surfaceNormal } from '../geom/surface.js';
import { TopoModel } from '../topo/TopoModel.js';
import type { BodyId, FaceId, ShellId, HalfEdgeId } from '../topo/handles.js';
import type { NamingStrategy, FeatureId, PersistentRef, EvolutionMapping, StepId } from '../naming/index.js';
import { faceRef, modifyMapping } from '../naming/index.js';

export type BooleanOperation = 'union' | 'subtract' | 'intersect';

export interface BooleanOptions {
  operation: BooleanOperation;
  namingStrategy?: NamingStrategy;
  featureId?: FeatureId;
}

export interface BooleanResult {
  success: boolean;
  body?: BodyId;
  error?: string;
  warnings?: string[];
  featureId?: FeatureId;
  stepId?: StepId;
  faceRefsFromA?: PersistentRef[];
  faceRefsFromB?: PersistentRef[];
  evolutionMappings?: EvolutionMapping[];
}

type FaceClassification = 'inside' | 'outside' | 'on' | 'unknown';

interface AABB {
  min: Vec3;
  max: Vec3;
}

export function booleanOperation(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId,
  options: BooleanOptions
): BooleanResult {
  const { operation, namingStrategy } = options;
  const ctx = model.ctx;
  
  const featureId = namingStrategy
    ? (options.featureId ?? namingStrategy.allocateFeatureId())
    : undefined;
  const stepId = namingStrategy ? namingStrategy.allocateStepId() : undefined;
  
  const aabbA = computeBodyAABB(model, bodyA);
  const aabbB = computeBodyAABB(model, bodyB);
  
  if (!aabbsOverlap(aabbA, aabbB, ctx)) {
    switch (operation) {
      case 'union':
        return createCompoundBody(bodyA);
      case 'subtract':
        return { success: true, body: bodyA };
      case 'intersect':
        return { success: false, error: 'Bodies do not intersect' };
    }
  }
  
  const facesA = collectBodyFaces(model, bodyA);
  const facesB = collectBodyFaces(model, bodyB);
  
  const nonPlanarA = facesA.filter(f => model.getSurface(model.getFaceSurfaceIndex(f)).kind !== 'plane');
  const nonPlanarB = facesB.filter(f => model.getSurface(model.getFaceSurfaceIndex(f)).kind !== 'plane');
  
  if (nonPlanarA.length > 0 || nonPlanarB.length > 0) {
    return {
      success: false,
      error: 'Boolean operations currently only support planar faces',
    };
  }
  
  const classificationsA = classifyFaces(model, facesA, bodyB);
  const classificationsB = classifyFaces(model, facesB, bodyA);
  
  let selectedFacesA: FaceId[];
  let selectedFacesB: FaceId[];
  let flipFacesB = false;
  let selectedIndicesA: number[];
  let selectedIndicesB: number[];
  
  switch (operation) {
    case 'union':
      selectedIndicesA = facesA.map((_, i) => i).filter(i => classificationsA[i] !== 'inside');
      selectedIndicesB = facesB.map((_, i) => i).filter(i => classificationsB[i] !== 'inside');
      selectedFacesA = selectedIndicesA.map(i => facesA[i]);
      selectedFacesB = selectedIndicesB.map(i => facesB[i]);
      break;
      
    case 'subtract':
      selectedIndicesA = facesA.map((_, i) => i).filter(i => classificationsA[i] !== 'inside');
      selectedIndicesB = facesB.map((_, i) => i).filter(i => classificationsB[i] === 'inside');
      selectedFacesA = selectedIndicesA.map(i => facesA[i]);
      selectedFacesB = selectedIndicesB.map(i => facesB[i]);
      flipFacesB = true;
      break;
      
    case 'intersect':
      selectedIndicesA = facesA.map((_, i) => i).filter(i => classificationsA[i] === 'inside');
      selectedIndicesB = facesB.map((_, i) => i).filter(i => classificationsB[i] === 'inside');
      selectedFacesA = selectedIndicesA.map(i => facesA[i]);
      selectedFacesB = selectedIndicesB.map(i => facesB[i]);
      break;
  }
  
  return createResultBodyWithNaming(
    model,
    bodyA,
    bodyB,
    selectedFacesA,
    selectedFacesB,
    selectedIndicesA,
    selectedIndicesB,
    flipFacesB,
    namingStrategy,
    featureId,
    stepId
  );
}

function computeBodyAABB(model: TopoModel, bodyId: BodyId): AABB {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  const shells = model.getBodyShells(bodyId);
  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    for (const faceId of faces) {
      const loops = model.getFaceLoops(faceId);
      for (const loopId of loops) {
        for (const he of model.iterateLoopHalfEdges(loopId)) {
          const vertex = model.getHalfEdgeStartVertex(he);
          const pos = model.getVertexPosition(vertex);
          minX = Math.min(minX, pos[0]);
          minY = Math.min(minY, pos[1]);
          minZ = Math.min(minZ, pos[2]);
          maxX = Math.max(maxX, pos[0]);
          maxY = Math.max(maxY, pos[1]);
          maxZ = Math.max(maxZ, pos[2]);
        }
      }
    }
  }
  
  return {
    min: vec3(minX, minY, minZ),
    max: vec3(maxX, maxY, maxZ),
  };
}

function aabbsOverlap(a: AABB, b: AABB, ctx: NumericContext): boolean {
  const tol = ctx.tol.length;
  return (
    a.min[0] <= b.max[0] + tol && a.max[0] >= b.min[0] - tol &&
    a.min[1] <= b.max[1] + tol && a.max[1] >= b.min[1] - tol &&
    a.min[2] <= b.max[2] + tol && a.max[2] >= b.min[2] - tol
  );
}

function collectBodyFaces(model: TopoModel, bodyId: BodyId): FaceId[] {
  const faces: FaceId[] = [];
  const shells = model.getBodyShells(bodyId);
  for (const shellId of shells) {
    faces.push(...model.getShellFaces(shellId));
  }
  return faces;
}

function classifyFaces(
  model: TopoModel,
  faces: FaceId[],
  otherBody: BodyId
): FaceClassification[] {
  const ctx = model.ctx;
  const classifications: FaceClassification[] = [];
  
  for (const faceId of faces) {
    const centroid = computeFaceCentroid(model, faceId);
    
    const surfaceIdx = model.getFaceSurfaceIndex(faceId);
    const surface = model.getSurface(surfaceIdx);
    let normal = surfaceNormal(surface, 0, 0);
    if (model.isFaceReversed(faceId)) {
      normal = mul3(normal, -1);
    }
    
    const testPoint = add3(centroid, mul3(normal, ctx.tol.length * 10));
    const classification = classifyPointInBody(model, testPoint, otherBody, ctx);
    classifications.push(classification);
  }
  
  return classifications;
}

function computeFaceCentroid(model: TopoModel, faceId: FaceId): Vec3 {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return vec3(0, 0, 0);
  
  const loopId = loops[0];
  let sum: Vec3 = vec3(0, 0, 0);
  let count = 0;
  
  for (const he of model.iterateLoopHalfEdges(loopId)) {
    const vertex = model.getHalfEdgeStartVertex(he);
    const pos = model.getVertexPosition(vertex);
    sum = add3(sum, pos);
    count++;
  }
  
  return count > 0 ? mul3(sum, 1 / count) : vec3(0, 0, 0);
}

function classifyPointInBody(
  model: TopoModel,
  point: Vec3,
  bodyId: BodyId,
  ctx: NumericContext
): FaceClassification {
  const rayDir: Vec3 = vec3(1, 0, 0);
  let intersectionCount = 0;
  const shells = model.getBodyShells(bodyId);
  
  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    
    for (const faceId of faces) {
      const surfaceIdx = model.getFaceSurfaceIndex(faceId);
      const surface = model.getSurface(surfaceIdx);
      
      if (surface.kind !== 'plane') {
        continue;
      }
      
      const plane = surface as PlaneSurface;
      const intersection = rayPlaneIntersection(point, rayDir, plane, ctx);
      
      if (intersection === null) {
        continue;
      }
      
      if (pointInFace(model, intersection, faceId, ctx)) {
        intersectionCount++;
      }
    }
  }
  
  return intersectionCount % 2 === 1 ? 'inside' : 'outside';
}

function rayPlaneIntersection(
  rayOrigin: Vec3,
  rayDir: Vec3,
  plane: PlaneSurface,
  ctx: NumericContext
): Vec3 | null {
  const denom = dot3(rayDir, plane.normal);
  
  if (isZero(denom, ctx)) {
    return null;
  }
  
  const t = dot3(sub3(plane.origin, rayOrigin), plane.normal) / denom;
  
  if (t < -ctx.tol.length) {
    return null;
  }
  
  return add3(rayOrigin, mul3(rayDir, t));
}

function pointInFace(
  model: TopoModel,
  point: Vec3,
  faceId: FaceId,
  _ctx: NumericContext
): boolean {
  const surfaceIdx = model.getFaceSurfaceIndex(faceId);
  const surface = model.getSurface(surfaceIdx);
  
  if (surface.kind !== 'plane') {
    return false;
  }
  
  const plane = surface as PlaneSurface;
  
  const v = sub3(point, plane.origin);
  const u2d = dot3(v, plane.xDir);
  const v2d = dot3(v, plane.yDir);
  
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return false;
  
  const outerLoop = loops[0];
  const vertices2D: [number, number][] = [];
  
  for (const he of model.iterateLoopHalfEdges(outerLoop)) {
    const vertex = model.getHalfEdgeStartVertex(he);
    const pos = model.getVertexPosition(vertex);
    const pv = sub3(pos, plane.origin);
    vertices2D.push([dot3(pv, plane.xDir), dot3(pv, plane.yDir)]);
  }
  
  return pointInPolygon2D(u2d, v2d, vertices2D);
}

function pointInPolygon2D(
  x: number,
  y: number,
  vertices: [number, number][]
): boolean {
  const n = vertices.length;
  let inside = false;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i][0];
    const yi = vertices[i][1];
    const xj = vertices[j][0];
    const yj = vertices[j][1];
    
    if (((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

function createCompoundBody(bodyA: BodyId): BooleanResult {
  return {
    success: true,
    body: bodyA,
    warnings: ['Non-overlapping union creates disjoint body (returning bodyA only)'],
  };
}

function copyFaceToShell(
  model: TopoModel,
  sourceFaceId: FaceId,
  targetShell: ShellId,
  flip: boolean
): FaceId {
  const surfaceIdx = model.getFaceSurfaceIndex(sourceFaceId);
  const surface = model.getSurface(surfaceIdx);
  let reversed = model.isFaceReversed(sourceFaceId);
  
  if (flip) {
    reversed = !reversed;
  }
  
  let newSurface: ReturnType<typeof model.addSurface>;
  if (surface.kind === 'plane') {
    const plane = surface as PlaneSurface;
    let normal = plane.normal;
    if (flip) {
      normal = mul3(normal, -1);
    }
    newSurface = model.addSurface(createPlaneSurface(plane.origin, normal, plane.xDir));
  } else {
    newSurface = surfaceIdx;
  }
  
  const newFace = model.addFace(newSurface, reversed);
  
  const loops = model.getFaceLoops(sourceFaceId);
  for (const loopId of loops) {
    const vertices: number[] = [];
    for (const he of model.iterateLoopHalfEdges(loopId)) {
      const vertex = model.getHalfEdgeStartVertex(he);
      const pos = model.getVertexPosition(vertex);
      vertices.push(model.addVertex(pos[0], pos[1], pos[2]));
    }
    
    const n = vertices.length;
    const halfEdges: HalfEdgeId[] = [];
    
    if (flip) {
      for (let i = n - 1; i >= 0; i--) {
        const j = (i - 1 + n) % n;
        const edge = model.addEdge(vertices[i] as any, vertices[j] as any);
        halfEdges.push(model.addHalfEdge(edge, 1));
      }
    } else {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const edge = model.addEdge(vertices[i] as any, vertices[j] as any);
        halfEdges.push(model.addHalfEdge(edge, 1));
      }
    }
    
    const newLoop = model.addLoop(halfEdges);
    model.addLoopToFace(newFace, newLoop);
  }
  
  model.addFaceToShell(targetShell, newFace);
  return newFace;
}

function createResultBodyWithNaming(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId,
  facesA: FaceId[],
  facesB: FaceId[],
  _indicesA: number[],
  _indicesB: number[],
  flipFacesB: boolean,
  namingStrategy: NamingStrategy | undefined,
  featureId: FeatureId | undefined,
  stepId: StepId | undefined
): BooleanResult {
  if (facesA.length === 0 && facesB.length === 0) {
    return { success: false, error: 'Boolean result has no faces' };
  }
  
  const body = model.addBody();
  const shell = model.addShell(true);
  model.addShellToBody(body, shell);
  
  const newFacesFromA: FaceId[] = [];
  const newFacesFromB: FaceId[] = [];
  
  for (const faceId of facesA) {
    const newFaceId = copyFaceToShell(model, faceId, shell, false);
    newFacesFromA.push(newFaceId);
  }
  
  for (const faceId of facesB) {
    const newFaceId = copyFaceToShell(model, faceId, shell, flipFacesB);
    newFacesFromB.push(newFaceId);
  }
  
  setupTwinHalfEdges(model);
  
  let faceRefsFromA: PersistentRef[] | undefined;
  let faceRefsFromB: PersistentRef[] | undefined;
  let evolutionMappings: EvolutionMapping[] | undefined;
  
  if (namingStrategy && stepId !== undefined) {
    evolutionMappings = [];
    
    for (let i = 0; i < newFacesFromA.length; i++) {
      const oldFaceId = facesA[i];
      const newFaceId = newFacesFromA[i];
      
      evolutionMappings.push(modifyMapping(
        faceRef(bodyA, oldFaceId),
        faceRef(body, newFaceId)
      ));
    }
    
    for (let i = 0; i < newFacesFromB.length; i++) {
      const oldFaceId = facesB[i];
      const newFaceId = newFacesFromB[i];
      
      evolutionMappings.push(modifyMapping(
        faceRef(bodyB, oldFaceId),
        faceRef(body, newFaceId)
      ));
    }
    
    namingStrategy.recordEvolution(stepId, evolutionMappings);
    
    faceRefsFromA = newFacesFromA
      .map(faceId => namingStrategy.lookupRefForSubshape(faceRef(body, faceId)))
      .filter((ref): ref is PersistentRef => ref !== null);
    
    faceRefsFromB = newFacesFromB
      .map(faceId => namingStrategy.lookupRefForSubshape(faceRef(body, faceId)))
      .filter((ref): ref is PersistentRef => ref !== null);
  }
  
  return {
    success: true,
    body,
    featureId,
    stepId,
    faceRefsFromA,
    faceRefsFromB,
    evolutionMappings,
    warnings: facesA.length === 0 || facesB.length === 0 
      ? ['Some faces were eliminated in the boolean result']
      : undefined,
  };
}

function setupTwinHalfEdges(model: TopoModel): void {
  const edgeHalfEdges = new Map<number, HalfEdgeId[]>();
  const heCount = model.getHalfEdgeCount();
  
  for (let i = 0; i < heCount; i++) {
    const edge = model.getHalfEdgeEdge(i as HalfEdgeId);
    if (edge < 0) continue;
    
    const halfEdges = edgeHalfEdges.get(edge) || [];
    halfEdges.push(i as HalfEdgeId);
    edgeHalfEdges.set(edge, halfEdges);
  }
  
  for (const [_edge, halfEdges] of edgeHalfEdges) {
    if (halfEdges.length === 2) {
      model.setHalfEdgeTwin(halfEdges[0], halfEdges[1]);
    }
  }
}

export function union(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId
): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: 'union' });
}

export function subtract(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId
): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: 'subtract' });
}

export function intersect(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId
): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: 'intersect' });
}
