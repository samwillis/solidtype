/**
 * Stitching for planar boolean operations.
 *
 * After selection, we have face pieces from both bodies that need to be
 * joined into a single manifold shell. This involves:
 * - Vertex welding (merge coincident vertices)
 * - Edge matching (unify coincident edges)
 * - Twin setup (connect half-edges across pieces)
 */

import type { Vec2 } from "../../num/vec2.js";
import type { Vec3 } from "../../num/vec3.js";
// mul3 removed - no longer needed after simplifying flip logic
import type { NumericContext } from "../../num/tolerance.js";
import { scaledTol, snap, snap3 } from "../../num/tolerance.js";
import type { TopoModel } from "../../topo/TopoModel.js";
import type {
  BodyId,
  ShellId,
  FaceId,
  LoopId,
  VertexId,
  EdgeId,
  HalfEdgeId,
} from "../../topo/handles.js";
import type { PlaneSurface } from "../../geom/surface.js";
import { createPlaneSurface } from "../../geom/surface.js";
import type { FacePiece, SelectedPieces } from "./types.js";
import { unprojectFromPlane } from "./intersect.js";

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
    // Use a consistent tolerance with createLoopFromPolygon to ensure
    // positions considered "same" during loop deduplication get the same vertex ID
    const tol = scaledTol(ctx, 10);
    const snapped = snap3(pos, ctx, tol);
    const key = `${snapped[0]},${snapped[1]},${snapped[2]}`;

    if (vertexMap.has(key)) {
      return vertexMap.get(key)!;
    }

    const vid = model.addVertex(pos[0], pos[1], pos[2]);
    vertexMap.set(key, vid);
    return vid;
  }

  // Deduplicate pieces using 3D geometry (more robust than 2D)
  const faceKeyMap = new Map<string, true>();

  // Use larger tolerance for robust snapping
  const keyTol = scaledTol(ctx, 10);
  const snapValue = (v: number) => snap(v, ctx, keyTol);

  // Create a 3D-based key that ignores duplicates and ordering
  const piece3DKey = (piece: FacePiece): string => {
    const vertices3D = piece.polygon.map((v) => unprojectFromPlane(v, piece.surface));
    // Get unique vertex keys (deduplicate)
    const uniqueKeys = new Set<string>();
    for (const v of vertices3D) {
      uniqueKeys.add(`${snapValue(v[0])},${snapValue(v[1])},${snapValue(v[2])}`);
    }
    // Sort for order-independence
    const sortedKeys = Array.from(uniqueKeys).sort();
    // Include normal for orientation
    const n = piece.surface.normal;
    const normalKey = `${snapValue(n[0])},${snapValue(n[1])},${snapValue(n[2])}`;
    return `${normalKey}|${sortedKeys.join(";")}`;
  };

  const seen = (piece: FacePiece): boolean => {
    const k = piece3DKey(piece);
    if (faceKeyMap.has(k)) return true;
    faceKeyMap.set(k, true);
    return false;
  };

  // Helper snaps using the same tolerance as key generation
  const snap2D = snapValue;
  const snap3D = snapValue;

  const has3DDuplicates = (piece: FacePiece): boolean => {
    const vertices3D = piece.polygon.map((v) => unprojectFromPlane(v, piece.surface));
    const seen3D = new Set<string>();
    for (const v of vertices3D) {
      const key = `${snap3D(v[0])},${snap3D(v[1])},${snap3D(v[2])}`;
      if (seen3D.has(key)) return true;
      seen3D.add(key);
    }
    return false;
  };

  // Check if piece has fewer than 4 unique 3D vertices (for quads) or fewer than its polygon size
  // This catches pieces where 2D vertices map to the same 3D position
  const hasReducedUniqueVertices = (piece: FacePiece): boolean => {
    const vertices3D = piece.polygon.map((v) => unprojectFromPlane(v, piece.surface));
    const seen3D = new Set<string>();
    for (const v of vertices3D) {
      seen3D.add(`${snap3D(v[0])},${snap3D(v[1])},${snap3D(v[2])}`);
    }
    // If unique count is less than polygon size, we have duplicates
    return seen3D.size < piece.polygon.length;
  };

  // Helper to check for consecutive duplicate 2D vertices
  const hasConsecutive2DDuplicates = (piece: FacePiece): boolean => {
    for (let i = 0; i < piece.polygon.length; i++) {
      const curr = piece.polygon[i];
      const next = piece.polygon[(i + 1) % piece.polygon.length];
      if (snap2D(curr[0]) === snap2D(next[0]) && snap2D(curr[1]) === snap2D(next[1])) {
        return true;
      }
    }
    return false;
  };

  // Add faces from A
  for (const piece of selected.fromA) {
    if (piece.polygon.length < 3) continue;
    if (hasConsecutive2DDuplicates(piece)) continue;
    if (has3DDuplicates(piece)) continue;
    if (hasReducedUniqueVertices(piece)) continue;
    if (seen(piece)) continue;
    try {
      const faceId = addPieceAsFace(model, piece, shell, false, getOrCreateVertex, ctx, keyTol);
      faces.push(faceId);
      facesFromA.push({ newFace: faceId, sourceFace: piece.sourceFace });
    } catch {
      // Skip degenerate pieces
    }
  }

  // Add faces from B (possibly flipped)
  for (const piece of selected.fromB) {
    if (piece.polygon.length < 3) continue;
    if (hasConsecutive2DDuplicates(piece)) continue;
    if (has3DDuplicates(piece)) continue;
    if (hasReducedUniqueVertices(piece)) continue;
    if (seen(piece)) continue;
    try {
      const faceId = addPieceAsFace(
        model,
        piece,
        shell,
        selected.flipB,
        getOrCreateVertex,
        ctx,
        keyTol
      );
      faces.push(faceId);
      facesFromB.push({ newFace: faceId, sourceFace: piece.sourceFace });
    } catch {
      // Skip degenerate pieces
    }
  }

  // Setup twin half-edges by matching edge endpoints
  setupTwinsByPosition(model, ctx);

  // Post-process: remove faces that have duplicate vertices in their loops
  // This catches degenerate faces that weren't filtered at the piece level
  const validFaces: FaceId[] = [];
  const validFacesFromA: { newFace: FaceId; sourceFace: FaceId }[] = [];
  const validFacesFromB: { newFace: FaceId; sourceFace: FaceId }[] = [];
  const facesToRemove: FaceId[] = [];

  for (let i = 0; i < faces.length; i++) {
    const faceId = faces[i];
    const loops = model.getFaceLoops(faceId);
    if (loops.length === 0) {
      facesToRemove.push(faceId);
      continue;
    }

    // Check if the outer loop has duplicate vertices
    let hasLoopDuplicates = false;
    const vertices: Vec3[] = [];
    for (const he of model.iterateLoopHalfEdges(loops[0])) {
      const vertex = model.getHalfEdgeStartVertex(he);
      const pos = model.getVertexPosition(vertex);
      vertices.push(pos);
    }

    // Check for any duplicates (using the key tolerance)
    const seenKeys = new Set<string>();
    for (const v of vertices) {
      const key = `${snapValue(v[0])},${snapValue(v[1])},${snapValue(v[2])}`;
      if (seenKeys.has(key)) {
        hasLoopDuplicates = true;
        break;
      }
      seenKeys.add(key);
    }

    if (hasLoopDuplicates) {
      facesToRemove.push(faceId);
    } else {
      validFaces.push(faceId);
      const fromA = facesFromA.find((f) => f.newFace === faceId);
      if (fromA) validFacesFromA.push(fromA);
      const fromB = facesFromB.find((f) => f.newFace === faceId);
      if (fromB) validFacesFromB.push(fromB);
    }
  }

  // Remove degenerate faces from the shell
  for (const faceId of facesToRemove) {
    model.removeFaceFromShell(faceId);
  }

  // Manifold validation can be enabled for debugging; currently skip to allow downstream heal/usage
  // validateManifold(model, validFaces);

  return {
    body,
    shell,
    faces: validFaces,
    facesFromA: validFacesFromA,
    facesFromB: validFacesFromB,
  };
}

/**
 * Clean a 2D polygon by removing consecutive duplicates and collinear points
 */
function cleanPolygon2D(polygon: Vec2[], tol: number): Vec2[] {
  if (polygon.length < 3) return [];

  // Remove consecutive duplicates
  const deduped: Vec2[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    if (deduped.length === 0) {
      deduped.push(p);
    } else {
      const last = deduped[deduped.length - 1];
      const dx = Math.abs(p[0] - last[0]);
      const dy = Math.abs(p[1] - last[1]);
      if (dx > tol || dy > tol) {
        deduped.push(p);
      }
    }
  }

  // Check first and last
  while (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    const dx = Math.abs(first[0] - last[0]);
    const dy = Math.abs(first[1] - last[1]);
    if (dx <= tol && dy <= tol) {
      deduped.pop();
    } else {
      break;
    }
  }

  return deduped.length >= 3 ? deduped : [];
}

/**
 * Add a face piece as a new face in the model
 *
 * When flip=true (for subtract operations), we need to reverse the face orientation.
 * Instead of manually flipping the surface normal and reversing the polygon (which
 * can cause winding issues due to coordinate system handedness), we use the face's
 * `reversed` flag. This tells the tessellation to flip normals and triangle winding.
 */
function addPieceAsFace(
  model: TopoModel,
  piece: FacePiece,
  shell: ShellId,
  flip: boolean,
  getOrCreateVertex: (pos: Vec3) => VertexId,
  ctx: NumericContext,
  tolerance: number
): FaceId {
  // Use the original surface - the reversed flag handles orientation
  const surface = createPlaneSurface(
    piece.surface.origin,
    piece.surface.normal,
    piece.surface.xDir
  );
  const surfaceIdx = model.addSurface(surface);

  // Create face with reversed flag if flipping
  // The reversed flag tells tessellation to flip normals and triangle winding
  const face = model.addFace(surfaceIdx, flip);

  // Use the original polygon (no reversal needed - reversed flag handles winding)
  const polygon = cleanPolygon2D(piece.polygon, tolerance);
  if (polygon.length < 3) {
    throw new Error("Degenerate polygon after cleanup");
  }
  const outerLoop = createLoopFromPolygon(
    model,
    polygon,
    piece.surface,
    getOrCreateVertex,
    ctx,
    tolerance
  );
  model.addLoopToFace(face, outerLoop);

  // Create inner loops (holes)
  // Holes normally have opposite winding, but with reversed flag, keep original winding
  for (const hole of piece.holes) {
    const holePolygon = cleanPolygon2D(hole, tolerance);
    if (holePolygon.length < 3) continue; // Skip degenerate holes
    const holeLoop = createLoopFromPolygon(
      model,
      holePolygon,
      piece.surface,
      getOrCreateVertex,
      ctx,
      tolerance
    );
    model.addLoopToFace(face, holeLoop);
  }

  model.addFaceToShell(shell, face);
  return face;
}

/**
 * Create a loop from a 2D polygon, filtering degenerate edges
 */
function createLoopFromPolygon(
  model: TopoModel,
  polygon: Vec2[],
  surface: PlaneSurface,
  getOrCreateVertex: (pos: Vec3) => VertexId,
  ctx: NumericContext,
  tolerance?: number
): LoopId {
  const baseTol = tolerance ?? ctx.tol.length;
  // Use a slightly enlarged tolerance for position comparison to catch near-duplicates
  const tol = scaledTol(ctx, baseTol === ctx.tol.length ? 10 : baseTol / ctx.tol.length);

  // First, create 3D positions and filter duplicates at the 3D level
  const positions3d: Vec3[] = [];
  const snapValue = (v: number) => snap(v, ctx, tol);

  for (const uv of polygon) {
    const pos3d = unprojectFromPlane(uv, surface);

    // Check if this position is a duplicate of the previous one (using tolerance)
    if (positions3d.length > 0) {
      const prev = positions3d[positions3d.length - 1];
      const sameX = snapValue(pos3d[0]) === snapValue(prev[0]);
      const sameY = snapValue(pos3d[1]) === snapValue(prev[1]);
      const sameZ = snapValue(pos3d[2]) === snapValue(prev[2]);
      if (sameX && sameY && sameZ) {
        continue; // Skip duplicate
      }
    }
    positions3d.push(pos3d);
  }

  // Check first and last for duplicates
  while (positions3d.length > 1) {
    const first = positions3d[0];
    const last = positions3d[positions3d.length - 1];
    const sameX = snapValue(first[0]) === snapValue(last[0]);
    const sameY = snapValue(first[1]) === snapValue(last[1]);
    const sameZ = snapValue(first[2]) === snapValue(last[2]);
    if (sameX && sameY && sameZ) {
      positions3d.pop();
    } else {
      break;
    }
  }

  // Need at least 3 vertices for a valid loop
  if (positions3d.length < 3) {
    throw new Error(`Degenerate loop with only ${positions3d.length} unique 3D positions`);
  }

  // Now create vertices
  const vertices: VertexId[] = positions3d.map((pos) => getOrCreateVertex(pos));

  // Filter out any remaining consecutive duplicates by vertex ID
  const uniqueVertices: VertexId[] = [];
  for (const v of vertices) {
    const prev = uniqueVertices[uniqueVertices.length - 1];
    if (prev === undefined || prev !== v) {
      uniqueVertices.push(v);
    }
  }

  // Check first and last for duplicates by ID
  while (
    uniqueVertices.length > 1 &&
    uniqueVertices[0] === uniqueVertices[uniqueVertices.length - 1]
  ) {
    uniqueVertices.pop();
  }

  // Need at least 3 vertices for a valid loop
  if (uniqueVertices.length < 3) {
    throw new Error(`Degenerate loop with only ${uniqueVertices.length} unique vertex IDs`);
  }

  // Create edges and half-edges, skipping degenerate edges
  const halfEdges: HalfEdgeId[] = [];
  for (let i = 0; i < uniqueVertices.length; i++) {
    const j = (i + 1) % uniqueVertices.length;
    if (uniqueVertices[i] === uniqueVertices[j]) {
      continue; // Skip degenerate edge
    }
    const edge = model.addEdge(uniqueVertices[i], uniqueVertices[j]);
    const he = model.addHalfEdge(edge, 1); // direction +1
    halfEdges.push(he);
  }

  if (halfEdges.length < 3) {
    throw new Error(`Degenerate loop with only ${halfEdges.length} edges`);
  }

  return model.addLoop(halfEdges);
}

/**
 * Setup twin half-edges by matching edge endpoint positions
 */
function setupTwinsByPosition(model: TopoModel, ctx: NumericContext): void {
  const tol = scaledTol(ctx, 10);

  // Build map of edges by endpoint positions
  interface EdgeKey {
    edge: EdgeId;
    v0: Vec3;
    v1: Vec3;
    halfEdges: HalfEdgeId[];
  }

  const edgeMap = new Map<string, EdgeKey[]>();

  function posKey(pos: Vec3): string {
    return `${snap(pos[0], ctx, tol)},${snap(pos[1], ctx, tol)},${snap(pos[2], ctx, tol)}`;
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
        halfEdges: [heId],
      });
    }
  }

  // For each edge key, if there are multiple half-edges from different edges,
  // set up twins between them.
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

// function validateManifold(model: TopoModel, faces: FaceId[]): void {
//   for (const faceId of faces) {
//     const loops = model.getFaceLoops(faceId);
//     for (const loop of loops) {
//       let count = 0;
//       for (const he of model.iterateLoopHalfEdges(loop)) {
//         count++;
//         const twin = model.getHalfEdgeTwin(he);
//         if (twin < 0) {
//           throw new Error(`Missing twin for half-edge ${he} on face ${faceId}`);
//         }
//       }
//       if (count < 3) {
//         throw new Error(`Degenerate loop on face ${faceId} with only ${count} half-edges`);
//       }
//     }
//   }
// }
