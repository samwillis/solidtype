/**
 * Boolean operations on solid bodies
 * 
 * Implements union, subtract, and intersect operations for BREP solids.
 * This is a staged implementation starting with planar-only faces and
 * convex/simple cases.
 * 
 * The algorithm:
 * 1. Compute face-face intersections where bounding boxes overlap
 * 2. Build intersection curves as 3D edges
 * 3. Classify faces (inside/outside/overlapping) via point classification
 * 4. Construct result BREP by selecting and trimming faces
 * 
 * Integrates with the persistent naming system to track face evolution.
 */

import type { Vec3 } from '../num/vec3.js';
import { vec3, add3, sub3, mul3, dot3 } from '../num/vec3.js';
import type { NumericContext } from '../num/tolerance.js';
import { isZero } from '../num/tolerance.js';
import type { PlaneSurface } from '../geom/surface.js';
import { createPlaneSurface, surfaceNormal } from '../geom/surface.js';
import type { TopoModel } from '../topo/model.js';
import type { BodyId, FaceId, VertexId, ShellId, HalfEdgeId } from '../topo/handles.js';
import {
  getBodyShells,
  getShellFaces,
  getFaceLoops,
  getFaceSurfaceIndex,
  getSurface,
  isFaceReversed,
  getLoopFirstHalfEdge,
  getHalfEdgeNext,
  getHalfEdgeStartVertex,
  getVertexPosition,
  isNullId,
  addVertex,
  addEdge,
  addHalfEdge,
  addLoop,
  addFace,
  addShell,
  addBody,
  addSurface,
  addLoopToFace,
  addFaceToShell,
  addShellToBody,
  setHalfEdgeTwin,
} from '../topo/model.js';
import type { NamingStrategy, FeatureId, PersistentRef, EvolutionMapping, StepId } from '../naming/index.js';
import {
  faceRef,
  booleanFaceFromASelector,
  booleanFaceFromBSelector,
  computeFaceFingerprint,
  modifyMapping,
} from '../naming/index.js';

/**
 * Boolean operation type
 */
export type BooleanOperation = 'union' | 'subtract' | 'intersect';

/**
 * Boolean operation options
 */
export interface BooleanOptions {
  /** The type of boolean operation */
  operation: BooleanOperation;
  /** Optional naming strategy for persistent naming */
  namingStrategy?: NamingStrategy;
  /** Optional feature ID (allocated from namingStrategy if not provided) */
  featureId?: FeatureId;
}

/**
 * Result of a boolean operation
 */
export interface BooleanResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The resulting body */
  body?: BodyId;
  /** Error message if failed */
  error?: string;
  /** Warning messages (operation succeeded but with caveats) */
  warnings?: string[];
  /** Feature ID assigned to this operation (if naming was enabled) */
  featureId?: FeatureId;
  /** Step ID for evolution tracking */
  stepId?: StepId;
  /** Persistent refs for result faces from body A */
  faceRefsFromA?: PersistentRef[];
  /** Persistent refs for result faces from body B */
  faceRefsFromB?: PersistentRef[];
  /** Evolution mappings from the operation */
  evolutionMappings?: EvolutionMapping[];
}

/**
 * Face classification result
 */
type FaceClassification = 'inside' | 'outside' | 'on' | 'unknown';

/**
 * Axis-aligned bounding box
 */
interface AABB {
  min: Vec3;
  max: Vec3;
}

/**
 * Perform a boolean operation on two bodies
 * 
 * This is currently a simplified implementation that handles basic cases:
 * - Planar faces only
 * - Simple solid bodies (convex or mildly concave)
 * - Non-overlapping or simple intersection topologies
 * 
 * @param model The topology model
 * @param bodyA First body
 * @param bodyB Second body
 * @param options Boolean operation options
 * @returns Result with the combined body or error
 */
export function booleanOperation(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId,
  options: BooleanOptions
): BooleanResult {
  const { operation, namingStrategy } = options;
  const ctx = model.ctx;
  
  // Allocate feature and step IDs if naming is enabled
  const featureId = namingStrategy
    ? (options.featureId ?? namingStrategy.allocateFeatureId())
    : undefined;
  const stepId = namingStrategy ? namingStrategy.allocateStepId() : undefined;
  
  // Get bounding boxes
  const aabbA = computeBodyAABB(model, bodyA);
  const aabbB = computeBodyAABB(model, bodyB);
  
  // Quick rejection test
  if (!aabbsOverlap(aabbA, aabbB, ctx)) {
    // Bodies don't overlap
    switch (operation) {
      case 'union':
        // For union of non-overlapping bodies, create a compound body
        return createCompoundBody(model, bodyA, bodyB);
      case 'subtract':
        // Subtracting non-overlapping body does nothing
        return { success: true, body: bodyA };
      case 'intersect':
        // Intersection of non-overlapping bodies is empty
        return { success: false, error: 'Bodies do not intersect' };
    }
  }
  
  // Collect faces from both bodies
  const facesA = collectBodyFaces(model, bodyA);
  const facesB = collectBodyFaces(model, bodyB);
  
  // Check that all faces are planar (current limitation)
  const nonPlanarA = facesA.filter(f => getSurface(model, getFaceSurfaceIndex(model, f)).kind !== 'plane');
  const nonPlanarB = facesB.filter(f => getSurface(model, getFaceSurfaceIndex(model, f)).kind !== 'plane');
  
  if (nonPlanarA.length > 0 || nonPlanarB.length > 0) {
    return {
      success: false,
      error: 'Boolean operations currently only support planar faces',
    };
  }
  
  // Classify faces of A with respect to B
  const classificationsA = classifyFaces(model, facesA, bodyB);
  
  // Classify faces of B with respect to A
  const classificationsB = classifyFaces(model, facesB, bodyA);
  
  // Select faces based on operation type
  let selectedFacesA: FaceId[];
  let selectedFacesB: FaceId[];
  let flipFacesB = false;
  
  // Track original face indices for evolution mapping
  let selectedIndicesA: number[];
  let selectedIndicesB: number[];
  
  switch (operation) {
    case 'union':
      // Union: keep faces of A that are outside B, and faces of B that are outside A
      selectedIndicesA = facesA.map((_, i) => i).filter(i => classificationsA[i] !== 'inside');
      selectedIndicesB = facesB.map((_, i) => i).filter(i => classificationsB[i] !== 'inside');
      selectedFacesA = selectedIndicesA.map(i => facesA[i]);
      selectedFacesB = selectedIndicesB.map(i => facesB[i]);
      break;
      
    case 'subtract':
      // Subtract: keep faces of A that are outside B, and faces of B that are inside A (reversed)
      selectedIndicesA = facesA.map((_, i) => i).filter(i => classificationsA[i] !== 'inside');
      selectedIndicesB = facesB.map((_, i) => i).filter(i => classificationsB[i] === 'inside');
      selectedFacesA = selectedIndicesA.map(i => facesA[i]);
      selectedFacesB = selectedIndicesB.map(i => facesB[i]);
      flipFacesB = true;
      break;
      
    case 'intersect':
      // Intersect: keep faces of A that are inside B, and faces of B that are inside A
      selectedIndicesA = facesA.map((_, i) => i).filter(i => classificationsA[i] === 'inside');
      selectedIndicesB = facesB.map((_, i) => i).filter(i => classificationsB[i] === 'inside');
      selectedFacesA = selectedIndicesA.map(i => facesA[i]);
      selectedFacesB = selectedIndicesB.map(i => facesB[i]);
      break;
  }
  
  // Create the result body with naming tracking
  const result = createResultBodyWithNaming(
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
  
  return result;
}

/**
 * Compute the axis-aligned bounding box of a body
 */
function computeBodyAABB(model: TopoModel, bodyId: BodyId): AABB {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  const shells = getBodyShells(model, bodyId);
  for (const shellId of shells) {
    const faces = getShellFaces(model, shellId);
    for (const faceId of faces) {
      const loops = getFaceLoops(model, faceId);
      for (const loopId of loops) {
        const firstHe = getLoopFirstHalfEdge(model, loopId);
        if (isNullId(firstHe)) continue;
        
        let he = firstHe;
        do {
          const vertex = getHalfEdgeStartVertex(model, he);
          const pos = getVertexPosition(model, vertex);
          minX = Math.min(minX, pos[0]);
          minY = Math.min(minY, pos[1]);
          minZ = Math.min(minZ, pos[2]);
          maxX = Math.max(maxX, pos[0]);
          maxY = Math.max(maxY, pos[1]);
          maxZ = Math.max(maxZ, pos[2]);
          he = getHalfEdgeNext(model, he);
        } while (he !== firstHe && !isNullId(he));
      }
    }
  }
  
  return {
    min: vec3(minX, minY, minZ),
    max: vec3(maxX, maxY, maxZ),
  };
}

/**
 * Check if two AABBs overlap
 */
function aabbsOverlap(a: AABB, b: AABB, ctx: NumericContext): boolean {
  const tol = ctx.tol.length;
  return (
    a.min[0] <= b.max[0] + tol && a.max[0] >= b.min[0] - tol &&
    a.min[1] <= b.max[1] + tol && a.max[1] >= b.min[1] - tol &&
    a.min[2] <= b.max[2] + tol && a.max[2] >= b.min[2] - tol
  );
}

/**
 * Collect all face IDs from a body
 */
function collectBodyFaces(model: TopoModel, bodyId: BodyId): FaceId[] {
  const faces: FaceId[] = [];
  const shells = getBodyShells(model, bodyId);
  for (const shellId of shells) {
    faces.push(...getShellFaces(model, shellId));
  }
  return faces;
}

/**
 * Classify faces with respect to another body
 * 
 * For each face, determines if it is inside, outside, or on the surface of the other body.
 */
function classifyFaces(
  model: TopoModel,
  faces: FaceId[],
  otherBody: BodyId
): FaceClassification[] {
  const ctx = model.ctx;
  const classifications: FaceClassification[] = [];
  
  for (const faceId of faces) {
    // Get a point on the face (centroid of first loop)
    const centroid = computeFaceCentroid(model, faceId);
    
    // Get face normal
    const surfaceIdx = getFaceSurfaceIndex(model, faceId);
    const surface = getSurface(model, surfaceIdx);
    let normal = surfaceNormal(surface, 0, 0);
    if (isFaceReversed(model, faceId)) {
      normal = mul3(normal, -1);
    }
    
    // Test point slightly offset in normal direction (to avoid being exactly on surface)
    const testPoint = add3(centroid, mul3(normal, ctx.tol.length * 10));
    
    // Classify the point
    const classification = classifyPointInBody(model, testPoint, otherBody, ctx);
    classifications.push(classification);
  }
  
  return classifications;
}

/**
 * Compute the centroid of a face (from its first loop)
 */
function computeFaceCentroid(model: TopoModel, faceId: FaceId): Vec3 {
  const loops = getFaceLoops(model, faceId);
  if (loops.length === 0) return vec3(0, 0, 0);
  
  const loopId = loops[0];
  const firstHe = getLoopFirstHalfEdge(model, loopId);
  if (isNullId(firstHe)) return vec3(0, 0, 0);
  
  let sum: Vec3 = vec3(0, 0, 0);
  let count = 0;
  
  let he = firstHe;
  do {
    const vertex = getHalfEdgeStartVertex(model, he);
    const pos = getVertexPosition(model, vertex);
    sum = add3(sum, pos);
    count++;
    he = getHalfEdgeNext(model, he);
  } while (he !== firstHe && !isNullId(he));
  
  return count > 0 ? mul3(sum, 1 / count) : vec3(0, 0, 0);
}

/**
 * Classify a point as inside, outside, or on a solid body
 * 
 * Uses ray casting algorithm: count number of face intersections
 * along a ray from the point. Odd = inside, even = outside.
 */
function classifyPointInBody(
  model: TopoModel,
  point: Vec3,
  bodyId: BodyId,
  ctx: NumericContext
): FaceClassification {
  // Cast ray in +X direction (arbitrary choice)
  const rayDir: Vec3 = vec3(1, 0, 0);
  
  let intersectionCount = 0;
  const shells = getBodyShells(model, bodyId);
  
  for (const shellId of shells) {
    const faces = getShellFaces(model, shellId);
    
    for (const faceId of faces) {
      const surfaceIdx = getFaceSurfaceIndex(model, faceId);
      const surface = getSurface(model, surfaceIdx);
      
      if (surface.kind !== 'plane') {
        // Skip non-planar faces for now
        continue;
      }
      
      const plane = surface as PlaneSurface;
      const intersection = rayPlaneIntersection(point, rayDir, plane, ctx);
      
      if (intersection === null) {
        // No intersection (ray parallel to plane)
        continue;
      }
      
      // Check if intersection point is within the face boundary
      if (pointInFace(model, intersection, faceId, ctx)) {
        intersectionCount++;
      }
    }
  }
  
  // Odd count = inside, even count = outside
  return intersectionCount % 2 === 1 ? 'inside' : 'outside';
}

/**
 * Compute ray-plane intersection
 */
function rayPlaneIntersection(
  rayOrigin: Vec3,
  rayDir: Vec3,
  plane: PlaneSurface,
  ctx: NumericContext
): Vec3 | null {
  const denom = dot3(rayDir, plane.normal);
  
  if (isZero(denom, ctx)) {
    // Ray is parallel to plane
    return null;
  }
  
  const t = dot3(sub3(plane.origin, rayOrigin), plane.normal) / denom;
  
  if (t < -ctx.tol.length) {
    // Intersection is behind ray origin
    return null;
  }
  
  return add3(rayOrigin, mul3(rayDir, t));
}

/**
 * Check if a point lies within a face boundary (projected onto the face)
 */
function pointInFace(
  model: TopoModel,
  point: Vec3,
  faceId: FaceId,
  _ctx: NumericContext
): boolean {
  const surfaceIdx = getFaceSurfaceIndex(model, faceId);
  const surface = getSurface(model, surfaceIdx);
  
  if (surface.kind !== 'plane') {
    return false; // Only support planar faces for now
  }
  
  const plane = surface as PlaneSurface;
  
  // Project point onto plane's 2D coordinate system
  const v = sub3(point, plane.origin);
  const u2d = dot3(v, plane.xDir);
  const v2d = dot3(v, plane.yDir);
  
  // Get face boundary vertices in 2D
  const loops = getFaceLoops(model, faceId);
  if (loops.length === 0) return false;
  
  const outerLoop = loops[0];
  const vertices2D: [number, number][] = [];
  
  const firstHe = getLoopFirstHalfEdge(model, outerLoop);
  if (isNullId(firstHe)) return false;
  
  let he = firstHe;
  do {
    const vertex = getHalfEdgeStartVertex(model, he);
    const pos = getVertexPosition(model, vertex);
    const pv = sub3(pos, plane.origin);
    vertices2D.push([dot3(pv, plane.xDir), dot3(pv, plane.yDir)]);
    he = getHalfEdgeNext(model, he);
  } while (he !== firstHe && !isNullId(he));
  
  // Point in polygon test (ray casting)
  return pointInPolygon2D(u2d, v2d, vertices2D);
}

/**
 * 2D point in polygon test using ray casting
 */
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

/**
 * Create a compound body from two non-overlapping bodies
 */
function createCompoundBody(
  _model: TopoModel,
  bodyA: BodyId,
  _bodyB: BodyId
): BooleanResult {
  // For now, just return bodyA with a warning
  // Full implementation would merge the bodies into a multi-shell body
  return {
    success: true,
    body: bodyA,
    warnings: ['Non-overlapping union creates disjoint body (returning bodyA only)'],
  };
}

/**
 * Create the result body from selected faces
 */
function createResultBody(
  model: TopoModel,
  facesA: FaceId[],
  facesB: FaceId[],
  flipFacesB: boolean
): BooleanResult {
  if (facesA.length === 0 && facesB.length === 0) {
    return { success: false, error: 'Boolean result has no faces' };
  }
  
  // Create new body and shell
  const body = addBody(model);
  const shell = addShell(model, true);
  addShellToBody(model, body, shell);
  
  // Copy faces from A
  for (const faceId of facesA) {
    copyFaceToShell(model, faceId, shell, false);
  }
  
  // Copy faces from B (potentially flipped)
  for (const faceId of facesB) {
    copyFaceToShell(model, faceId, shell, flipFacesB);
  }
  
  // Set up twin half-edges
  setupTwinHalfEdges(model);
  
  return {
    success: true,
    body,
    warnings: facesA.length === 0 || facesB.length === 0 
      ? ['Some faces were eliminated in the boolean result']
      : undefined,
  };
}

/**
 * Copy a face to a new shell and return the new face ID
 */
function copyFaceToShell(
  model: TopoModel,
  sourceFaceId: FaceId,
  targetShell: ShellId,
  flip: boolean
): FaceId {
  // Get source face data
  const surfaceIdx = getFaceSurfaceIndex(model, sourceFaceId);
  const surface = getSurface(model, surfaceIdx);
  let reversed = isFaceReversed(model, sourceFaceId);
  
  if (flip) {
    reversed = !reversed;
  }
  
  // Create new surface (copy)
  let newSurface: ReturnType<typeof addSurface>;
  if (surface.kind === 'plane') {
    const plane = surface as PlaneSurface;
    let normal = plane.normal;
    if (flip) {
      normal = mul3(normal, -1);
    }
    newSurface = addSurface(model, createPlaneSurface(plane.origin, normal, plane.xDir));
  } else {
    // For non-planar surfaces, just reference the same surface
    newSurface = surfaceIdx;
  }
  
  // Create new face
  const newFace = addFace(model, newSurface, reversed);
  
  // Copy loops
  const loops = getFaceLoops(model, sourceFaceId);
  for (const loopId of loops) {
    const firstHe = getLoopFirstHalfEdge(model, loopId);
    if (isNullId(firstHe)) continue;
    
    // Collect vertices from the loop
    const vertices: VertexId[] = [];
    let he = firstHe;
    do {
      const vertex = getHalfEdgeStartVertex(model, he);
      const pos = getVertexPosition(model, vertex);
      // Create new vertex (could optimize to reuse)
      vertices.push(addVertex(model, pos[0], pos[1], pos[2]));
      he = getHalfEdgeNext(model, he);
    } while (he !== firstHe && !isNullId(he));
    
    // Create edges and half-edges
    const n = vertices.length;
    const halfEdges: HalfEdgeId[] = [];
    
    if (flip) {
      // Reverse winding order
      for (let i = n - 1; i >= 0; i--) {
        const j = (i - 1 + n) % n;
        const edge = addEdge(model, vertices[i], vertices[j]);
        halfEdges.push(addHalfEdge(model, edge, 1));
      }
    } else {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const edge = addEdge(model, vertices[i], vertices[j]);
        halfEdges.push(addHalfEdge(model, edge, 1));
      }
    }
    
    const newLoop = addLoop(model, halfEdges);
    addLoopToFace(model, newFace, newLoop);
  }
  
  addFaceToShell(model, targetShell, newFace);
  return newFace;
}

/**
 * Create the result body with naming integration
 * 
 * Boolean operations modify existing topology, so we use evolution tracking
 * rather than birth recording. The faces in the result body evolved from
 * faces in the input bodies, and their existing PersistentRefs should
 * continue to resolve correctly via the evolution graph.
 */
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
  
  // Create new body and shell
  const body = addBody(model);
  const shell = addShell(model, true);
  addShellToBody(model, body, shell);
  
  // Track created faces for naming
  const newFacesFromA: FaceId[] = [];
  const newFacesFromB: FaceId[] = [];
  
  // Copy faces from A and track new face IDs
  for (const faceId of facesA) {
    const newFaceId = copyFaceToShell(model, faceId, shell, false);
    newFacesFromA.push(newFaceId);
  }
  
  // Copy faces from B (potentially flipped) and track new face IDs
  for (const faceId of facesB) {
    const newFaceId = copyFaceToShell(model, faceId, shell, flipFacesB);
    newFacesFromB.push(newFaceId);
  }
  
  // Set up twin half-edges
  setupTwinHalfEdges(model);
  
  // Build evolution mappings - NO birth records for boolean results
  // The faces evolved from existing faces, so we track that evolution
  let faceRefsFromA: PersistentRef[] | undefined;
  let faceRefsFromB: PersistentRef[] | undefined;
  let evolutionMappings: EvolutionMapping[] | undefined;
  
  if (namingStrategy && stepId !== undefined) {
    evolutionMappings = [];
    
    // Build evolution mappings for faces from A
    for (let i = 0; i < newFacesFromA.length; i++) {
      const oldFaceId = facesA[i];
      const newFaceId = newFacesFromA[i];
      
      evolutionMappings.push(modifyMapping(
        faceRef(bodyA, oldFaceId),
        faceRef(body, newFaceId)
      ));
    }
    
    // Build evolution mappings for faces from B
    for (let i = 0; i < newFacesFromB.length; i++) {
      const oldFaceId = facesB[i];
      const newFaceId = newFacesFromB[i];
      
      evolutionMappings.push(modifyMapping(
        faceRef(bodyB, oldFaceId),
        faceRef(body, newFaceId)
      ));
    }
    
    // Record evolution - this updates the reverse lookup so existing
    // PersistentRefs now point to the new faces
    namingStrategy.recordEvolution(stepId, evolutionMappings);
    
    // Collect existing refs that now point to the result faces
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

/**
 * Set up twin half-edge relationships
 */
function setupTwinHalfEdges(model: TopoModel): void {
  const edgeHalfEdges = new Map<number, HalfEdgeId[]>();
  
  for (let i = 0; i < model.halfEdges.count; i++) {
    const edge = model.halfEdges.edge[i];
    if (edge < 0) continue;
    
    const halfEdges = edgeHalfEdges.get(edge) || [];
    halfEdges.push(i as HalfEdgeId);
    edgeHalfEdges.set(edge, halfEdges);
  }
  
  for (const [_edge, halfEdges] of edgeHalfEdges) {
    if (halfEdges.length === 2) {
      setHalfEdgeTwin(model, halfEdges[0], halfEdges[1]);
    }
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

/**
 * Union two bodies
 */
export function union(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId
): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: 'union' });
}

/**
 * Subtract bodyB from bodyA
 */
export function subtract(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId
): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: 'subtract' });
}

/**
 * Intersect two bodies
 */
export function intersect(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId
): BooleanResult {
  return booleanOperation(model, bodyA, bodyB, { operation: 'intersect' });
}
