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
  // Pass bounding boxes to filter pieces that extend beyond the other body
  const selected = selectPieces(allPiecesA, allPiecesB, operation, aabbA, aabbB, ctx);
  
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
export function imprintFaceAndExtractPieces(
  segments: Segment2D[],
  polygon: FacePolygon2D,
  sourceBody: 0 | 1,
  tolerance: number
): FacePiece[] {
  // Check if we have any intersection segments
  const intersectionSegs = segments.filter(s => s.isIntersection);
  const hasIntersections = intersectionSegs.length > 0;
  
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
  const faceData: { polygon: Vec2[]; area: number; centroid: Vec2; isOriginal: boolean }[] = [];
  
  // Compute bounding box of original face for validation
  const originalBounds = computePolygonBounds(polygon.outer);
  const boundsPadding = tolerance * 10;
  
  for (const face of dcel.faces) {
    if (face.isUnbounded) continue;
    if (face.outerComponent === -1) continue;
    
    // Use a larger tolerance for vertex deduplication to catch near-duplicates
    const extractTol = Math.max(tolerance * 1000, 1e-6);
    let facePolygon = getCyclePolygon(dcel, face.outerComponent, extractTol);
    facePolygon = sanitizePolygon(facePolygon, extractTol);
    if (facePolygon.length < 3) continue;
    
    // Validate: check for any duplicate vertices (degenerate cycle detection)
    // Use extractTol for consistent tolerance with getCyclePolygon
    const vertexKeys = new Set<string>();
    let hasDuplicates = false;
    for (const p of facePolygon) {
      const key = `${Math.round(p[0] / extractTol) * extractTol},${Math.round(p[1] / extractTol) * extractTol}`;
      if (vertexKeys.has(key)) {
        hasDuplicates = true;
        break;
      }
      vertexKeys.add(key);
    }
    if (hasDuplicates) continue; // Skip degenerate cycles
    
    const area = polygonSignedArea(facePolygon);
    if (Math.abs(area) < tolerance * tolerance) continue;
    
    // Validate: extracted piece should be within original face bounds
    // (with some tolerance for numerical precision)
    const pieceBounds = computePolygonBounds(facePolygon);
    if (pieceBounds.minX < originalBounds.minX - boundsPadding ||
        pieceBounds.maxX > originalBounds.maxX + boundsPadding ||
        pieceBounds.minY < originalBounds.minY - boundsPadding ||
        pieceBounds.maxY > originalBounds.maxY + boundsPadding) {
      // This piece extends beyond the original face - skip it
      // This can happen when the DCEL includes segments from intersecting faces
      continue;
    }
    
    // Compute centroid for containment testing
    const centroid = computePolygonCentroid2D(facePolygon);
    
    faceData.push({ polygon: facePolygon, area, centroid, isOriginal: false });
  }
  
  const intersectionHoles = extractIntersectionPolygons(segments, tolerance);
  const orientedIntersectionHoles = (() => {
    if (intersectionHoles.length === 0) return [];
    const holeMap = new Map<string, Vec2[]>();
    for (const hole of intersectionHoles) {
      const oriented = polygonSignedArea(hole) < 0 ? hole.slice().reverse() : hole;
      const key = oriented.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join('|');
      if (!holeMap.has(key)) {
        holeMap.set(key, oriented);
      }
    }
    return Array.from(holeMap.values());
  })();
  
  // If no faces extracted, return original (preserving any intersection-derived holes)
  if (faceData.length === 0) {
    // Merge existing holes with new intersection holes
    const allHoles = [...polygon.holes];
    for (const newHole of orientedIntersectionHoles) {
      // Check if this hole overlaps with existing holes
      const newCentroid = computePolygonCentroid2D(newHole);
      const isInExistingHole = polygon.holes.some(h => pointInPolygonWithBoundary(newCentroid, h, tolerance));
      if (!isInExistingHole) {
        allHoles.push(newHole);
      }
    }
    return [{
      polygon: polygon.outer,
      holes: allHoles,
      classification: 'outside',
      sourceFace: polygon.faceId,
      sourceBody,
      surface: polygon.surface
    }];
  }
  
  // Filter out faces with repeated vertices (degenerate cycles)
  const validFaceData = faceData.filter(fd => {
    const seen = new Set<string>();
    for (const p of fd.polygon) {
      const key = `${Math.round(p[0] / tolerance) * tolerance},${Math.round(p[1] / tolerance) * tolerance}`;
      if (seen.has(key)) return false; // Duplicate vertex detected
      seen.add(key);
    }
    return true;
  });
  
  // Deduplicate faces by vertex set (not just centroid) - keeps the one with proper CCW winding
  const vertexSetKey = (polygon: Vec2[]): string => {
    // Create a sorted, unique set of vertex keys
    const keys = polygon.map(p => 
      `${Math.round(p[0] / tolerance) * tolerance},${Math.round(p[1] / tolerance) * tolerance}`
    );
    return [...new Set(keys)].sort().join('|');
  };
  
  const vertexSetMap = new Map<string, typeof faceData[0]>();
  for (const fd of validFaceData) {
    const key = vertexSetKey(fd.polygon);
    if (!vertexSetMap.has(key)) {
      vertexSetMap.set(key, fd);
    } else {
      // Keep the one with positive area (proper CCW winding) and more vertices
      const existing = vertexSetMap.get(key)!;
      const preferNew = 
        (fd.area > 0 && existing.area < 0) ||
        (fd.area > 0 && existing.area > 0 && fd.polygon.length < existing.polygon.length);
      if (preferNew) {
        vertexSetMap.set(key, fd);
      }
    }
  }
  const dedupedFaceData = Array.from(vertexSetMap.values());
  
  // Check if we have the original face (same area as original within tolerance)
  const originalArea = Math.abs(polygonSignedArea(polygon.outer));
  const areaTol = Math.max(tolerance * originalArea * 0.1, tolerance * 10);
  
  // Mark faces that match the original size as "isOriginal"
  for (const fd of dedupedFaceData) {
    const sameArea = Math.abs(Math.abs(fd.area) - originalArea) < areaTol;
    const sameVertexCount = fd.polygon.length === polygon.outer.length;
    (fd as { isOriginal: boolean }).isOriginal = sameArea && sameVertexCount;
  }
  
  // If we have split pieces (non-original faces), filter out the original face
  const splitFaces = dedupedFaceData.filter(fd => !fd.isOriginal);
  const effectiveFaceData = splitFaces.length > 0 ? splitFaces : dedupedFaceData;
  
  // Sort by absolute area descending (larger faces first)
  effectiveFaceData.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  
  
  // Helper: check if a point is inside any existing hole
  const isInsideExistingHole = (pt: Vec2): boolean => {
    for (const hole of polygon.holes) {
      if (pointInPolygon2D(pt, hole)) {
        return true;
      }
    }
    return false;
  };
  
  // Robust containment-based hole assignment for all extracted faces
  // Filter out pieces whose centroid is inside an existing hole (these are void regions)
  const facesInOriginal = effectiveFaceData
    .map((fd, idx) => ({ ...fd, idx, absArea: Math.abs(fd.area) }))
    .filter(fd => pointInPolygonWithBoundary(fd.centroid, polygon.outer, tolerance))
    .filter(fd => !isInsideExistingHole(fd.centroid));
  
  interface Node { idx: number; poly: Vec2[]; area: number; signedArea: number; centroid: Vec2; parent: number | null; children: number[]; }
  const nodes: Node[] = facesInOriginal.map(fd => ({
    idx: fd.idx,
    poly: fd.polygon,
    area: fd.absArea,
    signedArea: fd.area,
    centroid: fd.centroid,
    parent: null,
    children: []
  }));
  
  const strictContainsPoly = (outer: Vec2[], inner: Vec2[]): boolean => {
    const allInside = inner.every(pt => pointInPolygonWithBoundary(pt, outer, tolerance));
    if (!allInside) return false;
    // Ensure polygons are not identical (outer must have some point outside inner)
    const outerHasOutside = outer.some(pt => !pointInPolygonWithBoundary(pt, inner, tolerance));
    return outerHasOutside;
  };
  
  // Parent = smallest-area polygon that contains this polygon
  for (let i = 0; i < nodes.length; i++) {
    let best: number | null = null;
    let bestArea = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      if (!strictContainsPoly(nodes[j].poly, nodes[i].poly)) continue;
      if (nodes[j].area < bestArea) {
        best = j;
        bestArea = nodes[j].area;
      }
    }
    nodes[i].parent = best;
    if (best !== null) nodes[best].children.push(i);
  }
  
  const depthCache = new Map<number, number>();
  const depthOf = (i: number): number => {
    if (depthCache.has(i)) return depthCache.get(i)!;
    const p = nodes[i].parent;
    const d = p === null ? 0 : depthOf(p) + 1;
    depthCache.set(i, d);
    return d;
  };
  
  const pieces: FacePiece[] = [];
  nodes.forEach((node, localIdx) => {
    const depth = depthOf(localIdx);
    if (depth % 2 === 0) {
      const holes: Vec2[][] = [];
      for (const child of node.children) {
        if (depthOf(child) === depth + 1) {
          const childNode = nodes[child];
          const orientedHole = childNode.signedArea < 0 ? childNode.poly.slice().reverse() : childNode.poly;
          holes.push(orientedHole);
        }
      }
      const orientedPoly = node.signedArea < 0 ? node.poly.slice().reverse() : node.poly;
      pieces.push({
        polygon: orientedPoly,
        holes,
        classification: 'outside',
        sourceFace: polygon.faceId,
        sourceBody,
        surface: polygon.surface
      });
    }
  });
  
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
 * Remove consecutive duplicate or collinear points to simplify polygons.
 * Uses a more relaxed tolerance for duplicates to catch near-duplicate vertices.
 */
function sanitizePolygon(poly: Vec2[], tol: number): Vec2[] {
  if (poly.length < 3) return [];
  
  // Use a slightly larger tolerance for deduplication to catch near-duplicates
  const dedupTol = Math.max(tol * 10, 1e-9);
  
  const dedup: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const prev = dedup[dedup.length - 1];
    if (!prev) {
      dedup.push([p[0], p[1]]);
    } else {
      const dx = Math.abs(p[0] - prev[0]);
      const dy = Math.abs(p[1] - prev[1]);
      if (dx > dedupTol || dy > dedupTol) {
        dedup.push([p[0], p[1]]);
      }
    }
  }
  
  // Check first and last for duplicates (close the polygon)
  while (dedup.length > 1) {
    const first = dedup[0];
    const last = dedup[dedup.length - 1];
    const dx = Math.abs(first[0] - last[0]);
    const dy = Math.abs(first[1] - last[1]);
    if (dx <= dedupTol && dy <= dedupTol) {
      dedup.pop();
    } else {
      break;
    }
  }
  
  if (dedup.length < 3) return [];
  
  // Remove collinear points (with a slightly relaxed tolerance)
  const collinearTol = Math.max(tol * tol * 10, 1e-16);
  const cleaned: Vec2[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const a = dedup[(i - 1 + dedup.length) % dedup.length];
    const b = dedup[i];
    const c = dedup[(i + 1) % dedup.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > collinearTol) {
      cleaned.push(b);
    }
  }
  
  return cleaned.length >= 3 ? cleaned : [];
}

/**
 * Build polygons that come purely from intersection segments (coplanar overlaps).
 */
function extractIntersectionPolygons(segments: Segment2D[], tolerance: number): Vec2[][] {
  const interSegments = segments.filter(s => s.isIntersection);
  if (interSegments.length === 0) return [];
  const dcel = buildDCEL(interSegments, tolerance);
  const polys: Vec2[][] = [];
  for (const face of dcel.faces) {
    if (face.outerComponent === -1) continue;
    // Use a larger tolerance for vertex deduplication  
    const extractTol2 = Math.max(tolerance * 1000, 1e-6);
    const poly = sanitizePolygon(getCyclePolygon(dcel, face.outerComponent, extractTol2), extractTol2);
    if (poly.length < 3) continue;
    const area = polygonSignedArea(poly);
    if (Math.abs(area) < tolerance * tolerance) continue;
    polys.push(poly);
  }
  return polys;
}

/**
 * Compute bounding box of a 2D polygon
 */
function computePolygonBounds(polygon: Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (polygon.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  
  let minX = polygon[0][0];
  let maxX = polygon[0][0];
  let minY = polygon[0][1];
  let maxY = polygon[0][1];
  
  for (let i = 1; i < polygon.length; i++) {
    minX = Math.min(minX, polygon[i][0]);
    maxX = Math.max(maxX, polygon[i][0]);
    minY = Math.min(minY, polygon[i][1]);
    maxY = Math.max(maxY, polygon[i][1]);
  }
  
  return { minX, maxX, minY, maxY };
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
 * Point-in-polygon that treats boundary as inside (with tolerance).
 */
function pointInPolygonWithBoundary(point: Vec2, polygon: Vec2[], tol: number): boolean {
  if (pointInPolygon2D(point, polygon)) return true;
  // Check boundary distance
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2;
    const tClamped = Math.max(0, Math.min(1, t));
    const px = a[0] + tClamped * dx;
    const py = a[1] + tClamped * dy;
    const dist2 = (point[0] - px) ** 2 + (point[1] - py) ** 2;
    if (dist2 <= tol * tol) return true;
  }
  return false;
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
