/**
 * Stitching for planar boolean operations.
 * 
 * After selection, we have face pieces from both bodies that need to be
 * joined into a single manifold shell. This involves:
 * - Vertex welding (merge coincident vertices)
 * - Edge matching (unify coincident edges)
 * - Twin setup (connect half-edges across pieces)
 */

import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
import { mul3 } from '../../num/vec3.js';
import type { NumericContext } from '../../num/tolerance.js';
import type { TopoModel } from '../../topo/TopoModel.js';
import type { BodyId, ShellId, FaceId, LoopId, VertexId, EdgeId, HalfEdgeId } from '../../topo/handles.js';
import type { PlaneSurface } from '../../geom/surface.js';
import { createPlaneSurface } from '../../geom/surface.js';
import type { FacePiece, SelectedPieces } from './types.js';
import { unprojectFromPlane } from './intersect.js';

/**
 * Result of stitching operation
 */
export interface StitchResult {
  body: BodyId;
  shell: ShellId;
  faces: FaceId[];
  /** Faces that came from body A (with source face IDs) */
  facesFromA: { newFace: FaceId; sourceFace: FaceId }[];
  /** Faces that came from body B (with source face IDs) */
  facesFromB: { newFace: FaceId; sourceFace: FaceId }[];
}

/**
 * Stitch selected face pieces into a new body.
 * 
 * This is the main stitching entry point that:
 * 1. Creates a new body and shell
 * 2. Adds all face pieces as new faces
 * 3. Welds coincident vertices
 * 4. Sets up edge twins
 */
export function stitchPieces(
  model: TopoModel,
  selected: SelectedPieces,
  ctx: NumericContext
): StitchResult {
  // Create new body and shell
  const body = model.addBody();
  const shell = model.addShell(true); // closed shell
  model.addShellToBody(body, shell);
  
  const faces: FaceId[] = [];
  const facesFromA: { newFace: FaceId; sourceFace: FaceId }[] = [];
  const facesFromB: { newFace: FaceId; sourceFace: FaceId }[] = [];
  
  // Track vertices by position for welding
  const vertexMap = new Map<string, VertexId>();
  
  function getOrCreateVertex(pos: Vec3): VertexId {
    const tol = ctx.tol.length;
    const key = `${Math.round(pos[0] / tol) * tol},${Math.round(pos[1] / tol) * tol},${Math.round(pos[2] / tol) * tol}`;
    
    if (vertexMap.has(key)) {
      return vertexMap.get(key)!;
    }
    
    const vid = model.addVertex(pos[0], pos[1], pos[2]);
    vertexMap.set(key, vid);
    return vid;
  }
  
  // Add faces from A
  for (const piece of selected.fromA) {
    const faceId = addPieceAsFace(model, piece, shell, false, getOrCreateVertex);
    faces.push(faceId);
    facesFromA.push({ newFace: faceId, sourceFace: piece.sourceFace });
  }
  
  // Add faces from B (possibly flipped)
  for (const piece of selected.fromB) {
    const faceId = addPieceAsFace(model, piece, shell, selected.flipB, getOrCreateVertex);
    faces.push(faceId);
    facesFromB.push({ newFace: faceId, sourceFace: piece.sourceFace });
  }
  
  // Setup twin half-edges by matching edge endpoints
  setupTwinsByPosition(model, ctx);
  
  return { body, shell, faces, facesFromA, facesFromB };
}

/**
 * Add a face piece as a new face in the model
 */
function addPieceAsFace(
  model: TopoModel,
  piece: FacePiece,
  shell: ShellId,
  flip: boolean,
  getOrCreateVertex: (pos: Vec3) => VertexId
): FaceId {
  // Create surface (possibly flipped)
  let normal = piece.surface.normal;
  let xDir = piece.surface.xDir;
  let yDir = piece.surface.yDir;
  
  if (flip) {
    normal = mul3(normal, -1);
    // Keep xDir, flip yDir to maintain right-hand rule
    yDir = mul3(yDir, -1);
  }
  
  const surface = createPlaneSurface(piece.surface.origin, normal, xDir);
  const surfaceIdx = model.addSurface(surface);
  
  // Create face
  const face = model.addFace(surfaceIdx, false);
  
  // Create outer loop
  const polygon = flip ? piece.polygon.slice().reverse() : piece.polygon;
  const outerLoop = createLoopFromPolygon(model, polygon, piece.surface, getOrCreateVertex);
  model.addLoopToFace(face, outerLoop);
  
  // Create inner loops (holes)
  for (const hole of piece.holes) {
    // Holes have opposite winding
    const holePolygon = flip ? hole : hole.slice().reverse();
    const holeLoop = createLoopFromPolygon(model, holePolygon, piece.surface, getOrCreateVertex);
    model.addLoopToFace(face, holeLoop);
  }
  
  model.addFaceToShell(shell, face);
  return face;
}

/**
 * Create a loop from a 2D polygon
 */
function createLoopFromPolygon(
  model: TopoModel,
  polygon: Vec2[],
  surface: PlaneSurface,
  getOrCreateVertex: (pos: Vec3) => VertexId
): LoopId {
  const n = polygon.length;
  const vertices: VertexId[] = [];
  
  // Create/reuse vertices
  for (const uv of polygon) {
    const pos3d = unprojectFromPlane(uv, surface);
    vertices.push(getOrCreateVertex(pos3d));
  }
  
  // Create edges and half-edges
  const halfEdges: HalfEdgeId[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edge = model.addEdge(vertices[i], vertices[j]);
    const he = model.addHalfEdge(edge, 1); // direction +1
    halfEdges.push(he);
  }
  
  return model.addLoop(halfEdges);
}

/**
 * Setup twin half-edges by matching edge endpoint positions
 */
function setupTwinsByPosition(model: TopoModel, ctx: NumericContext): void {
  const tol = ctx.tol.length;
  
  // Build map of edges by endpoint positions
  interface EdgeKey {
    edge: EdgeId;
    v0: Vec3;
    v1: Vec3;
    halfEdges: HalfEdgeId[];
  }
  
  const edgeMap = new Map<string, EdgeKey[]>();
  
  function posKey(pos: Vec3): string {
    return `${Math.round(pos[0] / tol) * tol},${Math.round(pos[1] / tol) * tol},${Math.round(pos[2] / tol) * tol}`;
  }
  
  function edgeKey(v0: Vec3, v1: Vec3): string {
    const k0 = posKey(v0);
    const k1 = posKey(v1);
    return k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`;
  }
  
  // Collect all half-edges and group by edge geometry
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
    
    const entries = edgeMap.get(key)!;
    
    // Find or create entry for this edge
    let found = false;
    for (const entry of entries) {
      if (entry.edge === edgeId) {
        entry.halfEdges.push(heId);
        found = true;
        break;
      }
    }
    
    if (!found) {
      entries.push({
        edge: edgeId,
        v0: pos0,
        v1: pos1,
        halfEdges: [heId]
      });
    }
  }
  
  // For each edge key, if there are multiple half-edges from different edges,
  // set up twins between them
  for (const [_key, entries] of edgeMap) {
    // Collect all half-edges across all entries
    const allHalfEdges: HalfEdgeId[] = [];
    for (const entry of entries) {
      allHalfEdges.push(...entry.halfEdges);
    }
    
    // If exactly 2 half-edges, make them twins
    if (allHalfEdges.length === 2) {
      model.setHalfEdgeTwin(allHalfEdges[0], allHalfEdges[1]);
    }
    // If more than 2, this is a non-manifold edge - for now, skip
  }
}
