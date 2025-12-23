/**
 * Main planar boolean operation implementation.
 * 
 * This module orchestrates the full boundary evaluation pipeline:
 * 1. Intersect - compute face-face intersection segments
 * 2. Imprint - split faces at intersection boundaries
 * 3. Classify - determine IN/OUT/ON for each piece
 * 4. Select - choose pieces based on operation
 * 5. Stitch - merge selected pieces into result body
 * 6. Heal - fix minor issues and validate
 */

import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
import { vec3, sub3, dot3, mul3, add3 } from '../../num/vec3.js';
import type { NumericContext } from '../../num/tolerance.js';
import type { TopoModel } from '../../topo/TopoModel.js';
import type { BodyId, FaceId, ShellId, HalfEdgeId, VertexId } from '../../topo/handles.js';
import type { PlaneSurface } from '../../geom/surface.js';
import { createPlaneSurface } from '../../geom/surface.js';
import type { BoolOp, FacePolygon2D, FacePiece, Segment2D } from './types.js';
import { computeFaceIntersection, projectToPlane2D } from './intersect.js';
import { buildDCEL, getCyclePolygon, polygonSignedArea } from './imprint/dcel.js';
import { facePolygonToSegments } from './imprint/splitSegments.js';
import { classifyAllPieces } from './classify.js';
import { selectPieces, regularize } from './select.js';
import { stitchPieces } from './stitch.js';
import { healBody } from './heal.js';

/**
 * Result of a planar boolean operation
 */
export interface PlanarBooleanResult {
  success: boolean;
  body?: BodyId;
  error?: string;
  warnings?: string[];
  /** Faces from body A in the result (new face ID -> source face ID) */
  facesFromA?: { newFace: FaceId; sourceFace: FaceId }[];
  /** Faces from body B in the result (new face ID -> source face ID) */
  facesFromB?: { newFace: FaceId; sourceFace: FaceId }[];
}

/**
 * Options for planar boolean operation
 */
export interface PlanarBooleanOptions {
  operation: BoolOp;
  /** Skip healing pass */
  skipHeal?: boolean;
  /** Skip validation */
  skipValidation?: boolean;
}

/**
 * Perform a planar boolean operation between two bodies.
 * 
 * Both bodies must consist entirely of planar faces.
 */
export function planarBoolean(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId,
  options: PlanarBooleanOptions
): PlanarBooleanResult {
  const ctx = model.ctx;
  const { operation } = options;
  
  // Handle degenerate case: same body for both operands
  if (bodyA === bodyB) {
    switch (operation) {
      case 'union':
        // A ∪ A = A
        return { success: true, body: bodyA };
      case 'intersect':
        // A ∩ A = A
        return { success: true, body: bodyA };
      case 'subtract':
        // A \ A = ∅
        return { success: false, error: 'Subtracting a body from itself results in an empty body' };
    }
  }
  
  // Collect faces from both bodies
  const facesA = collectBodyFaces(model, bodyA);
  const facesB = collectBodyFaces(model, bodyB);
  
  // Verify all faces are planar
  for (const faceId of [...facesA, ...facesB]) {
    const surface = model.getSurface(model.getFaceSurfaceIndex(faceId));
    if (surface.kind !== 'plane') {
      return {
        success: false,
        error: `Face ${faceId} is not planar - planar boolean only supports planar faces`
      };
    }
  }
  
  // Check for AABB overlap first
  const aabbA = computeAABB(model, facesA);
  const aabbB = computeAABB(model, facesB);
  
  if (!aabbsOverlap(aabbA, aabbB, ctx.tol.length)) {
    // No overlap - handle degenerate cases
    return handleNoOverlap(model, bodyA, bodyB, operation);
  }
  
  // Convert faces to 2D polygons
  const polygonsA = facesToPolygons(model, facesA);
  const polygonsB = facesToPolygons(model, facesB);
  
  // Compute all face-face intersections and collect imprint segments
  const imprintDataA = new Map<FaceId, Segment2D[]>();
  const imprintDataB = new Map<FaceId, Segment2D[]>();
  
  // Initialize with boundary segments (outer + holes)
  for (const poly of polygonsA) {
    const boundarySegs = facePolygonToSegments(poly.outer, poly.faceId, 0);
    // Also add hole boundaries - they must be preserved in the DCEL
    for (const hole of poly.holes) {
      const holeSegs = facePolygonToSegments(hole, poly.faceId, 0);
      boundarySegs.push(...holeSegs);
    }
    imprintDataA.set(poly.faceId, boundarySegs);
  }
  for (const poly of polygonsB) {
    const boundarySegs = facePolygonToSegments(poly.outer, poly.faceId, 1);
    // Also add hole boundaries
    for (const hole of poly.holes) {
      const holeSegs = facePolygonToSegments(hole, poly.faceId, 1);
      boundarySegs.push(...holeSegs);
    }
    imprintDataB.set(poly.faceId, boundarySegs);
  }
  
  // Add intersection segments
  for (const polyA of polygonsA) {
    for (const polyB of polygonsB) {
      const intersection = computeFaceIntersection(polyA, polyB, ctx, operation);
      if (intersection) {
        const segsA = imprintDataA.get(polyA.faceId)!;
        segsA.push(...intersection.segmentsA);
        
        const segsB = imprintDataB.get(polyB.faceId)!;
        segsB.push(...intersection.segmentsB);
      }
    }
  }
  
  // Build DCEL for each face and extract pieces
  const allPiecesA: FacePiece[] = [];
  const allPiecesB: FacePiece[] = [];
  
  for (const poly of polygonsA) {
    const segments = imprintDataA.get(poly.faceId)!;
    const pieces = imprintFaceAndExtractPieces(segments, poly, 0, ctx.tol.length);
    allPiecesA.push(...pieces);
  }
  
  for (const poly of polygonsB) {
    const segments = imprintDataB.get(poly.faceId)!;
    const pieces = imprintFaceAndExtractPieces(segments, poly, 1, ctx.tol.length);
    allPiecesB.push(...pieces);
  }
  
  // If no pieces were created, fall back to simple face copying
  if (allPiecesA.length === 0 && allPiecesB.length === 0) {
    return fallbackToCopyFaces(model, bodyA, bodyB, facesA, facesB, operation, ctx);
  }
  
  // Classify pieces
  classifyAllPieces(allPiecesA, bodyB, model, ctx);
  classifyAllPieces(allPiecesB, bodyA, model, ctx);
  
  // Select pieces based on operation
  const selected = selectPieces(allPiecesA, allPiecesB, operation);
  
  // Regularize (remove slivers)
  selected.fromA = regularize(selected.fromA);
  selected.fromB = regularize(selected.fromB);
  
  // Check for empty result
  if (selected.fromA.length === 0 && selected.fromB.length === 0) {
    return {
      success: false,
      error: 'Boolean result is empty'
    };
  }
  
  // Stitch pieces together
  const stitchResult = stitchPieces(model, selected, ctx);
  
  // Heal if not skipped
  let warnings: string[] = [];
  if (!options.skipHeal) {
    const healResult = healBody(model, stitchResult.body, ctx);
    if (!healResult.success) {
      warnings = healResult.errors;
    }
  }
  
  return {
    success: true,
    body: stitchResult.body,
    warnings: warnings.length > 0 ? warnings : undefined,
    facesFromA: stitchResult.facesFromA,
    facesFromB: stitchResult.facesFromB
  };
}

/**
 * Collect all faces from a body
 */
function collectBodyFaces(model: TopoModel, bodyId: BodyId): FaceId[] {
  const faces: FaceId[] = [];
  const shells = model.getBodyShells(bodyId);
  for (const shellId of shells) {
    faces.push(...model.getShellFaces(shellId));
  }
  return faces;
}

/**
 * Convert faces to 2D polygons
 */
function facesToPolygons(model: TopoModel, faces: FaceId[]): FacePolygon2D[] {
  const result: FacePolygon2D[] = [];
  
  for (const faceId of faces) {
    const surfaceIdx = model.getFaceSurfaceIndex(faceId);
    const surface = model.getSurface(surfaceIdx) as PlaneSurface;
    
    const loops = model.getFaceLoops(faceId);
    if (loops.length === 0) continue;
    
    // Outer loop
    const outerLoop = loops[0];
    const outer: Vec2[] = [];
    const vertexIds: VertexId[] = [];
    
    for (const he of model.iterateLoopHalfEdges(outerLoop)) {
      const vertex = model.getHalfEdgeStartVertex(he);
      const pos = model.getVertexPosition(vertex);
      outer.push(projectToPlane2D(pos, surface));
      vertexIds.push(vertex);
    }
    
    // Inner loops (holes)
    const holes: Vec2[][] = [];
    for (let i = 1; i < loops.length; i++) {
      const holeLoop = loops[i];
      const hole: Vec2[] = [];
      for (const he of model.iterateLoopHalfEdges(holeLoop)) {
        const vertex = model.getHalfEdgeStartVertex(he);
        const pos = model.getVertexPosition(vertex);
        hole.push(projectToPlane2D(pos, surface));
      }
      holes.push(hole);
    }
    
    result.push({ faceId, outer, holes, surface, vertexIds });
  }
  
  return result;
}

/**
 * Imprint a face and extract the resulting pieces
 */
function imprintFaceAndExtractPieces(
  segments: Segment2D[],
  polygon: FacePolygon2D,
  sourceBody: 0 | 1,
  tolerance: number
): FacePiece[] {
  // Check if we have any intersection segments
  const hasIntersections = segments.some(s => s.isIntersection);
  
  if (!hasIntersections) {
    // No imprinting needed - return the original face as a single piece
    return [{
      polygon: polygon.outer,
      holes: polygon.holes,
      classification: 'outside', // Will be set during classification
      sourceFace: polygon.faceId,
      sourceBody,
      surface: polygon.surface
    }];
  }
  
  // Build DCEL and extract faces
  const dcel = buildDCEL(segments, tolerance);
  
  // Collect all bounded face polygons with their areas
  // IMPORTANT: Only keep faces with POSITIVE area (CCW orientation).
  // The DCEL creates both CW and CCW versions of each face (inner and outer windings).
  // We only want the CCW (positive area) ones to avoid duplicates.
  const faceData: { polygon: Vec2[]; area: number; centroid: Vec2 }[] = [];
  
  for (const face of dcel.faces) {
    if (face.isUnbounded) continue;
    if (face.outerComponent === -1) continue;
    
    const facePolygon = getCyclePolygon(dcel, face.outerComponent);
    if (facePolygon.length < 3) continue;
    
    const area = polygonSignedArea(facePolygon);
    
    // Skip degenerate and CW (negative area) faces
    // CW faces are the "other side" of CCW faces - we don't want duplicates
    if (area < tolerance * tolerance) continue;
    
    // Compute centroid for containment testing
    const centroid = computePolygonCentroid2D(facePolygon);
    
    faceData.push({ polygon: facePolygon, area, centroid });
  }
  
  // If no faces extracted, return original
  if (faceData.length === 0) {
    return [{
      polygon: polygon.outer,
      holes: polygon.holes,
      classification: 'outside',
      sourceFace: polygon.faceId,
      sourceBody,
      surface: polygon.surface
    }];
  }
  
  // Sort by area descending (larger faces first)
  faceData.sort((a, b) => b.area - a.area);
  
  // Identify containment relationships
  // A smaller face is a hole in a larger face if its centroid is inside the larger face
  const pieces: FacePiece[] = [];
  const usedAsHole = new Set<number>();
  
  for (let i = 0; i < faceData.length; i++) {
    if (usedAsHole.has(i)) continue;
    
    const outer = faceData[i];
    const holes: Vec2[][] = [];
    
    // Check if any smaller face is contained inside this one
    for (let j = i + 1; j < faceData.length; j++) {
      if (usedAsHole.has(j)) continue;
      
      const inner = faceData[j];
      
      // Check if inner's centroid is inside outer's polygon
      if (pointInPolygon2D(inner.centroid, outer.polygon)) {
        // This is a hole - reverse winding for hole representation
        holes.push(inner.polygon.slice().reverse());
        usedAsHole.add(j);
      }
    }
    
    pieces.push({
      polygon: outer.polygon,
      holes,
      classification: 'outside',
      sourceFace: polygon.faceId,
      sourceBody,
      surface: polygon.surface
    });
  }
  
  return pieces;
}

/**
 * Simple polygon centroid computation
 */
function computePolygonCentroid2D(polygon: Vec2[]): Vec2 {
  if (polygon.length === 0) return [0, 0];
  
  let cx = 0, cy = 0, area = 0;
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1];
    area += cross;
    cx += (polygon[i][0] + polygon[j][0]) * cross;
    cy += (polygon[i][1] + polygon[j][1]) * cross;
  }
  
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate - use simple average
    let sumX = 0, sumY = 0;
    for (const p of polygon) { sumX += p[0]; sumY += p[1]; }
    return [sumX / n, sumY / n];
  }
  
  return [cx / (6 * area), cy / (6 * area)];
}

/**
 * Point-in-polygon test (2D)
 */
function pointInPolygon2D(point: Vec2, polygon: Vec2[]): boolean {
  const n = polygon.length;
  let inside = false;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    
    if (((yi > point[1]) !== (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Compute AABB for a set of faces
 */
function computeAABB(model: TopoModel, faces: FaceId[]): { min: Vec3; max: Vec3 } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
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
  
  return {
    min: vec3(minX, minY, minZ),
    max: vec3(maxX, maxY, maxZ)
  };
}

/**
 * Check if two AABBs overlap
 */
function aabbsOverlap(
  a: { min: Vec3; max: Vec3 },
  b: { min: Vec3; max: Vec3 },
  tolerance: number
): boolean {
  return (
    a.min[0] <= b.max[0] + tolerance && a.max[0] >= b.min[0] - tolerance &&
    a.min[1] <= b.max[1] + tolerance && a.max[1] >= b.min[1] - tolerance &&
    a.min[2] <= b.max[2] + tolerance && a.max[2] >= b.min[2] - tolerance
  );
}

/**
 * Handle non-overlapping bodies
 */
function handleNoOverlap(
  _model: TopoModel,
  bodyA: BodyId,
  _bodyB: BodyId,
  operation: BoolOp
): PlanarBooleanResult {
  switch (operation) {
    case 'union':
      // For union, we'd need to combine both bodies
      // For now, just return A with a warning
      return {
        success: true,
        body: bodyA,
        warnings: ['Bodies do not overlap - returning body A only']
      };
    case 'subtract':
      // A - B with no overlap = A unchanged
      return { success: true, body: bodyA };
    case 'intersect':
      // No overlap = empty intersection
      return { success: false, error: 'Bodies do not intersect' };
  }
}

/**
 * Fallback to simple face copying when imprinting produces no pieces
 */
function fallbackToCopyFaces(
  model: TopoModel,
  bodyA: BodyId,
  bodyB: BodyId,
  facesA: FaceId[],
  facesB: FaceId[],
  operation: BoolOp,
  ctx: NumericContext
): PlanarBooleanResult {
  // Use the simple classification-based approach
  const classificationsA = classifyFacesSimple(model, facesA, bodyB, ctx);
  const classificationsB = classifyFacesSimple(model, facesB, bodyA, ctx);
  
  let selectedFacesA: FaceId[];
  let selectedFacesB: FaceId[];
  let flipB = false;
  
  switch (operation) {
    case 'union':
      selectedFacesA = facesA.filter((_, i) => classificationsA[i] !== 'inside');
      selectedFacesB = facesB.filter((_, i) => classificationsB[i] !== 'inside');
      break;
    case 'subtract':
      selectedFacesA = facesA.filter((_, i) => classificationsA[i] !== 'inside');
      selectedFacesB = facesB.filter((_, i) => classificationsB[i] === 'inside');
      flipB = true;
      break;
    case 'intersect':
      selectedFacesA = facesA.filter((_, i) => classificationsA[i] === 'inside');
      selectedFacesB = facesB.filter((_, i) => classificationsB[i] === 'inside');
      break;
  }
  
  if (selectedFacesA.length === 0 && selectedFacesB.length === 0) {
    return { success: false, error: 'Boolean result is empty' };
  }
  
  // Create result body by copying faces
  const body = model.addBody();
  const shell = model.addShell(true);
  model.addShellToBody(body, shell);
  
  for (const faceId of selectedFacesA) {
    copyFaceToShell(model, faceId, shell, false);
  }
  for (const faceId of selectedFacesB) {
    copyFaceToShell(model, faceId, shell, flipB);
  }
  
  // Setup twins
  setupTwinsByEndpoints(model);
  
  return { success: true, body };
}

/**
 * Simple face classification using centroid ray casting
 */
function classifyFacesSimple(
  model: TopoModel,
  faces: FaceId[],
  otherBody: BodyId,
  ctx: NumericContext
): ('inside' | 'outside')[] {
  const results: ('inside' | 'outside')[] = [];
  
  for (const faceId of faces) {
    const surface = model.getSurface(model.getFaceSurfaceIndex(faceId)) as PlaneSurface;
    const centroid = computeFaceCentroid(model, faceId);
    
    // Offset along normal
    let normal = surface.normal;
    if (model.isFaceReversed(faceId)) {
      normal = mul3(normal, -1);
    }
    const testPoint = add3(centroid, mul3(normal, ctx.tol.length * 10));
    
    // Ray cast
    const inside = isPointInsideBody(testPoint, otherBody, model, ctx);
    results.push(inside ? 'inside' : 'outside');
  }
  
  return results;
}

/**
 * Compute face centroid
 */
function computeFaceCentroid(model: TopoModel, faceId: FaceId): Vec3 {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return vec3(0, 0, 0);
  
  let sum: Vec3 = vec3(0, 0, 0);
  let count = 0;
  
  for (const he of model.iterateLoopHalfEdges(loops[0])) {
    const vertex = model.getHalfEdgeStartVertex(he);
    const pos = model.getVertexPosition(vertex);
    sum = add3(sum, pos);
    count++;
  }
  
  return count > 0 ? mul3(sum, 1 / count) : vec3(0, 0, 0);
}

/**
 * Point-in-body test using ray casting
 */
function isPointInsideBody(
  point: Vec3,
  bodyId: BodyId,
  model: TopoModel,
  ctx: NumericContext
): boolean {
  const rayDir: Vec3 = vec3(1, 0, 0);
  let intersectionCount = 0;
  
  const shells = model.getBodyShells(bodyId);
  
  for (const shellId of shells) {
    const faces = model.getShellFaces(shellId);
    
    for (const faceId of faces) {
      const surfaceIdx = model.getFaceSurfaceIndex(faceId);
      const surface = model.getSurface(surfaceIdx);
      
      if (surface.kind !== 'plane') continue;
      
      const plane = surface as PlaneSurface;
      const denom = dot3(rayDir, plane.normal);
      if (Math.abs(denom) < 1e-12) continue;
      
      const t = dot3(sub3(plane.origin, point), plane.normal) / denom;
      if (t < -ctx.tol.length) continue;
      
      const hitPoint = add3(point, mul3(rayDir, t));
      
      if (isPointInFace(hitPoint, faceId, model, plane)) {
        intersectionCount++;
      }
    }
  }
  
  return intersectionCount % 2 === 1;
}

/**
 * Check if a point is inside a face polygon
 */
function isPointInFace(
  point: Vec3,
  faceId: FaceId,
  model: TopoModel,
  plane: PlaneSurface
): boolean {
  const v = sub3(point, plane.origin);
  const u2d = dot3(v, plane.xDir);
  const v2d = dot3(v, plane.yDir);
  
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return false;
  
  const polygon: Vec2[] = [];
  for (const he of model.iterateLoopHalfEdges(loops[0])) {
    const vertex = model.getHalfEdgeStartVertex(he);
    const pos = model.getVertexPosition(vertex);
    const pv = sub3(pos, plane.origin);
    polygon.push([dot3(pv, plane.xDir), dot3(pv, plane.yDir)]);
  }
  
  return pointInPolygon([u2d, v2d], polygon);
}

/**
 * Point-in-polygon test
 */
function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  const n = polygon.length;
  let inside = false;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    
    if (((yi > point[1]) !== (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Copy a face to a shell
 */
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
  
  let newSurface: typeof surfaceIdx;
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
        const edge = model.addEdge(vertices[i] as VertexId, vertices[j] as VertexId);
        halfEdges.push(model.addHalfEdge(edge, 1));
      }
    } else {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const edge = model.addEdge(vertices[i] as VertexId, vertices[j] as VertexId);
        halfEdges.push(model.addHalfEdge(edge, 1));
      }
    }
    
    const newLoop = model.addLoop(halfEdges);
    model.addLoopToFace(newFace, newLoop);
  }
  
  model.addFaceToShell(targetShell, newFace);
  return newFace;
}

/**
 * Setup twin half-edges by matching edge endpoints
 */
function setupTwinsByEndpoints(model: TopoModel): void {
  const tol = model.ctx.tol.length;
  const edgeMap = new Map<string, HalfEdgeId[]>();
  
  function posKey(pos: Vec3): string {
    return `${Math.round(pos[0] / tol) * tol},${Math.round(pos[1] / tol) * tol},${Math.round(pos[2] / tol) * tol}`;
  }
  
  function edgeKey(v0: Vec3, v1: Vec3): string {
    const k0 = posKey(v0);
    const k1 = posKey(v1);
    return k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`;
  }
  
  const heCount = model.getHalfEdgeCount();
  for (let i = 0; i < heCount; i++) {
    const heId = i as HalfEdgeId;
    const edgeId = model.getHalfEdgeEdge(heId);
    if (edgeId < 0) continue;
    
    const verts = [model.getEdgeStartVertex(edgeId), model.getEdgeEndVertex(edgeId)];
    const pos0 = model.getVertexPosition(verts[0]);
    const pos1 = model.getVertexPosition(verts[1]);
    
    const key = edgeKey(pos0, pos1);
    
    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }
    edgeMap.get(key)!.push(heId);
  }
  
  for (const halfEdges of edgeMap.values()) {
    if (halfEdges.length === 2) {
      model.setHalfEdgeTwin(halfEdges[0], halfEdges[1]);
    }
  }
}
