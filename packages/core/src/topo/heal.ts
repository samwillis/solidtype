/**
 * BREP topology healing
 * 
 * Provides healing operations to fix common topology issues:
 * - Merge coincident vertices
 * - Collapse short edges
 * - Remove degenerate faces
 * - Reorient shells for consistent outward normals
 * 
 * The healing approach is conservative: prefer returning clear failures
 * over "heroic" auto-fixes that might silently corrupt the model.
 */

import { sub3, length3, mul3, dot3 } from '../num/vec3.js';
import type { TopoModel } from './model.js';
import type { ShellId, FaceId, HalfEdgeId, LoopId } from './handles.js';
import {
  isNullId,
  asVertexId,
  asEdgeId,
  asFaceId,
  asShellId,
  getVertexPosition,
  setVertexPosition,
  isVertexDeleted,
  isEdgeDeleted,
  isFaceDeleted,
  getHalfEdgeNext,
  getHalfEdgeTwin,
  getHalfEdgeStartVertex,
  getLoopFirstHalfEdge,
  getFaceShell,
  getFaceLoops,
  getFaceSurfaceIndex,
  getSurface,
  isFaceReversed,
  getShellFaces,
  isShellClosed,
  EntityFlags,
} from './model.js';
import type { ValidationReport } from './validate.js';
import { validateModel } from './validate.js';
import { surfaceNormal } from '../geom/surface.js';
import type { Vec3 } from '../num/vec3.js';

// ============================================================================
// Healing Options & Result Types
// ============================================================================

/**
 * Options for healing operations
 */
export interface HealingOptions {
  /** Merge vertices that are within this distance. Default: model tolerance */
  vertexMergeTolerance?: number;
  /** Collapse edges shorter than this. Default: 10 * model tolerance */
  shortEdgeThreshold?: number;
  /** Remove faces with area smaller than this. Default: (10 * tol)² */
  smallFaceAreaThreshold?: number;
  /** Attempt to reorient shells for consistent outward normals */
  reorientShells?: boolean;
  /** Maximum number of healing iterations */
  maxIterations?: number;
  /** Validate after each healing step */
  validateAfterEachStep?: boolean;
}

/**
 * Default healing options
 */
const DEFAULT_HEALING_OPTIONS: Required<HealingOptions> = {
  vertexMergeTolerance: 0, // Will use model tolerance
  shortEdgeThreshold: 0, // Will use 10 * model tolerance
  smallFaceAreaThreshold: 0, // Will use (10 * tol)²
  reorientShells: true,
  maxIterations: 3,
  validateAfterEachStep: false,
};

/**
 * Result of a single healing action
 */
export interface HealingAction {
  /** Type of healing performed */
  kind: 'mergeVertices' | 'collapseEdge' | 'removeFace' | 'reorientShell';
  /** Description of what was done */
  description: string;
  /** Entities affected */
  affected: Array<{
    type: 'vertex' | 'edge' | 'face' | 'shell';
    id: number;
  }>;
}

/**
 * Result of a healing operation
 */
export interface HealingResult {
  /** Whether healing was successful */
  success: boolean;
  /** Error message if healing failed */
  error?: string;
  /** Number of healing iterations performed */
  iterations: number;
  /** Actions taken during healing */
  actions: HealingAction[];
  /** Summary statistics */
  stats: {
    verticesMerged: number;
    edgesCollapsed: number;
    facesRemoved: number;
    shellsReoriented: number;
  };
  /** Final validation report (if validation was requested) */
  validationReport?: ValidationReport;
}

/**
 * Create a healing result with default values
 */
function createHealingResult(): HealingResult {
  return {
    success: true,
    iterations: 0,
    actions: [],
    stats: {
      verticesMerged: 0,
      edgesCollapsed: 0,
      facesRemoved: 0,
      shellsReoriented: 0,
    },
  };
}

// ============================================================================
// Main Healing API
// ============================================================================

/**
 * Heal a topology model
 * 
 * Applies a series of healing operations to fix common topology issues.
 * The healing is conservative and will fail cleanly if issues cannot
 * be resolved automatically.
 * 
 * @param model The topology model to heal
 * @param options Healing options
 * @returns Healing result with actions taken and final status
 */
export function healModel(
  model: TopoModel,
  options: HealingOptions = {}
): HealingResult {
  const opts: Required<HealingOptions> = {
    ...DEFAULT_HEALING_OPTIONS,
    ...options,
    vertexMergeTolerance: options.vertexMergeTolerance ?? model.ctx.tol.length,
    shortEdgeThreshold: options.shortEdgeThreshold ?? model.ctx.tol.length * 10,
    smallFaceAreaThreshold: options.smallFaceAreaThreshold ?? Math.pow(model.ctx.tol.length * 10, 2),
  };
  
  const result = createHealingResult();
  
  try {
    for (let iteration = 0; iteration < opts.maxIterations; iteration++) {
      result.iterations = iteration + 1;
      
      let actionsThisIteration = 0;
      
      // Step 1: Merge coincident vertices
      const mergeResult = mergeCoincidentVertices(model, opts.vertexMergeTolerance);
      result.actions.push(...mergeResult.actions);
      result.stats.verticesMerged += mergeResult.count;
      actionsThisIteration += mergeResult.count;
      
      // Step 2: Collapse short edges
      const collapseResult = collapseShortEdges(model, opts.shortEdgeThreshold);
      result.actions.push(...collapseResult.actions);
      result.stats.edgesCollapsed += collapseResult.count;
      actionsThisIteration += collapseResult.count;
      
      // Step 3: Remove small faces
      const removeResult = removeSmallFaces(model, opts.smallFaceAreaThreshold);
      result.actions.push(...removeResult.actions);
      result.stats.facesRemoved += removeResult.count;
      actionsThisIteration += removeResult.count;
      
      // Step 4: Reorient shells (only on first iteration)
      if (opts.reorientShells && iteration === 0) {
        const reorientResult = reorientShells(model);
        result.actions.push(...reorientResult.actions);
        result.stats.shellsReoriented += reorientResult.count;
        actionsThisIteration += reorientResult.count;
      }
      
      // If no actions were taken, we're done
      if (actionsThisIteration === 0) {
        break;
      }
      
      // Optionally validate after each step
      if (opts.validateAfterEachStep) {
        const report = validateModel(model);
        if (!report.isValid) {
          result.success = false;
          result.error = `Healing introduced validation errors after iteration ${iteration + 1}`;
          result.validationReport = report;
          return result;
        }
      }
    }
    
    // Final validation
    result.validationReport = validateModel(model, {
      checkDegenerate: true,
      checkManifold: true,
      checkBoundary: false, // Don't fail on boundary edges
      checkSlivers: true,
    });
    
    result.success = result.validationReport.errorCount === 0;
    if (!result.success) {
      result.error = `Model has ${result.validationReport.errorCount} validation error(s) after healing`;
    }
    
  } catch (err) {
    result.success = false;
    result.error = `Healing failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  
  return result;
}

// ============================================================================
// Individual Healing Operations
// ============================================================================

/**
 * Result of a healing sub-operation
 */
interface SubOperationResult {
  count: number;
  actions: HealingAction[];
}

/**
 * Merge vertices that are within tolerance of each other
 * 
 * When vertices are merged, all edge references are updated to point
 * to the surviving vertex.
 */
export function mergeCoincidentVertices(
  model: TopoModel,
  tolerance: number
): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  const tolSq = tolerance * tolerance;
  
  // Build groups of coincident vertices
  const vertexGroups: Map<number, number[]> = new Map();
  const merged: Set<number> = new Set();
  
  // Collect live vertices
  const liveVertices: number[] = [];
  for (let i = 0; i < model.vertices.count; i++) {
    if (!isVertexDeleted(model, asVertexId(i))) {
      liveVertices.push(i);
    }
  }
  
  // Find coincident vertex pairs (O(n²) - could use spatial hashing for large models)
  for (let i = 0; i < liveVertices.length; i++) {
    const vi = liveVertices[i];
    if (merged.has(vi)) continue;
    
    const pi = getVertexPosition(model, asVertexId(vi));
    const group: number[] = [vi];
    
    for (let j = i + 1; j < liveVertices.length; j++) {
      const vj = liveVertices[j];
      if (merged.has(vj)) continue;
      
      const pj = getVertexPosition(model, asVertexId(vj));
      const d = sub3(pj, pi);
      const distSq = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      
      if (distSq < tolSq) {
        group.push(vj);
        merged.add(vj);
      }
    }
    
    if (group.length > 1) {
      vertexGroups.set(vi, group);
    }
  }
  
  // Merge each group
  for (const [survivor, group] of vertexGroups) {
    // Compute averaged position
    let sx = 0, sy = 0, sz = 0;
    for (const vid of group) {
      const p = getVertexPosition(model, asVertexId(vid));
      sx += p[0];
      sy += p[1];
      sz += p[2];
    }
    sx /= group.length;
    sy /= group.length;
    sz /= group.length;
    
    // Update survivor position
    setVertexPosition(model, asVertexId(survivor), [sx, sy, sz]);
    
    // Delete other vertices and update all edge references
    for (const vid of group) {
      if (vid === survivor) continue;
      
      // Update edge references
      for (let e = 0; e < model.edges.count; e++) {
        if (model.edges.vStart[e] === vid) {
          model.edges.vStart[e] = survivor;
        }
        if (model.edges.vEnd[e] === vid) {
          model.edges.vEnd[e] = survivor;
        }
      }
      
      // Mark vertex as deleted
      model.vertices.flags[vid] |= EntityFlags.DELETED;
      model.vertices.liveCount--;
    }
    
    result.count += group.length - 1;
    result.actions.push({
      kind: 'mergeVertices',
      description: `Merged ${group.length} vertices at (${sx.toFixed(6)}, ${sy.toFixed(6)}, ${sz.toFixed(6)})`,
      affected: group.map(id => ({ type: 'vertex' as const, id })),
    });
  }
  
  return result;
}

/**
 * Collapse edges that are shorter than the threshold
 * 
 * Short edges are collapsed by merging their endpoints.
 * This may create degenerate faces which should be removed afterward.
 */
export function collapseShortEdges(
  model: TopoModel,
  threshold: number
): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  
  // Find edges to collapse
  const edgesToCollapse: Array<{ id: number; length: number }> = [];
  
  for (let i = 0; i < model.edges.count; i++) {
    if (isEdgeDeleted(model, asEdgeId(i))) continue;
    
    const vStart = model.edges.vStart[i];
    const vEnd = model.edges.vEnd[i];
    
    if (isNullId(vStart) || isNullId(vEnd)) continue;
    if (vStart === vEnd) continue; // Already collapsed
    
    const p0 = getVertexPosition(model, asVertexId(vStart));
    const p1 = getVertexPosition(model, asVertexId(vEnd));
    const len = length3(sub3(p1, p0));
    
    if (len < threshold && len > 0) {
      edgesToCollapse.push({ id: i, length: len });
    }
  }
  
  // Sort by length (shortest first)
  edgesToCollapse.sort((a, b) => a.length - b.length);
  
  // Collapse each edge
  for (const { id: edgeId, length } of edgesToCollapse) {
    // Re-check if edge is still valid (may have been affected by previous collapses)
    if (isEdgeDeleted(model, asEdgeId(edgeId))) continue;
    
    const vStart = model.edges.vStart[edgeId];
    const vEnd = model.edges.vEnd[edgeId];
    
    if (isNullId(vStart) || isNullId(vEnd) || vStart === vEnd) continue;
    if (isVertexDeleted(model, asVertexId(vStart))) continue;
    if (isVertexDeleted(model, asVertexId(vEnd))) continue;
    
    // Merge vEnd into vStart (keep vStart as survivor)
    const p0 = getVertexPosition(model, asVertexId(vStart));
    const p1 = getVertexPosition(model, asVertexId(vEnd));
    const midpoint: Vec3 = [
      (p0[0] + p1[0]) / 2,
      (p0[1] + p1[1]) / 2,
      (p0[2] + p1[2]) / 2,
    ];
    
    // Update survivor position to midpoint
    setVertexPosition(model, asVertexId(vStart), midpoint);
    
    // Update all references from vEnd to vStart
    for (let e = 0; e < model.edges.count; e++) {
      if (model.edges.vStart[e] === vEnd) {
        model.edges.vStart[e] = vStart;
      }
      if (model.edges.vEnd[e] === vEnd) {
        model.edges.vEnd[e] = vStart;
      }
    }
    
    // Mark the edge as collapsed (vStart == vEnd now effectively)
    // We'll mark it as deleted
    model.edges.flags[edgeId] |= EntityFlags.DELETED;
    model.edges.liveCount--;
    
    // Mark vEnd as deleted
    model.vertices.flags[vEnd] |= EntityFlags.DELETED;
    model.vertices.liveCount--;
    
    result.count++;
    result.actions.push({
      kind: 'collapseEdge',
      description: `Collapsed edge ${edgeId} (length ${length.toExponential(3)})`,
      affected: [
        { type: 'edge', id: edgeId },
        { type: 'vertex', id: vStart },
        { type: 'vertex', id: vEnd },
      ],
    });
  }
  
  return result;
}

/**
 * Remove faces with area smaller than the threshold
 * 
 * Small faces are typically the result of degenerate geometry
 * and should be removed to avoid numerical issues.
 */
export function removeSmallFaces(
  model: TopoModel,
  areaThreshold: number
): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  
  for (let i = 0; i < model.faces.count; i++) {
    const faceId = asFaceId(i);
    if (isFaceDeleted(model, faceId)) continue;
    
    const area = computeFaceArea(model, faceId);
    
    if (area < areaThreshold) {
      // Mark face as deleted
      model.faces.flags[i] |= EntityFlags.DELETED;
      model.faces.liveCount--;
      
      // Remove from shell's face list
      const shellId = getFaceShell(model, faceId);
      if (!isNullId(shellId)) {
        const shellFaces = model.shellFaces[shellId];
        if (shellFaces) {
          const idx = shellFaces.indexOf(faceId);
          if (idx >= 0) {
            shellFaces.splice(idx, 1);
          }
        }
      }
      
      // Mark loops as deleted
      const loops = getFaceLoops(model, faceId);
      for (const loopId of loops) {
        model.loops.flags[loopId] |= EntityFlags.DELETED;
        model.loops.liveCount--;
        
        // Mark half-edges in loop as deleted
        const firstHe = getLoopFirstHalfEdge(model, loopId);
        if (!isNullId(firstHe)) {
          let he = firstHe;
          let iterations = 0;
          do {
            if (iterations++ > 10000) break; // Safety
            
            model.halfEdges.flags[he] |= EntityFlags.DELETED;
            model.halfEdges.liveCount--;
            
            // Clear twin reference of the twin
            const twin = getHalfEdgeTwin(model, he);
            if (!isNullId(twin)) {
              model.halfEdges.twin[twin] = -1;
            }
            
            he = getHalfEdgeNext(model, he);
          } while (he !== firstHe && !isNullId(he));
        }
      }
      
      // Clear face loops array
      model.faceLoops[i] = [];
      
      result.count++;
      result.actions.push({
        kind: 'removeFace',
        description: `Removed face ${i} (area ${area.toExponential(3)})`,
        affected: [{ type: 'face', id: i }],
      });
    }
  }
  
  return result;
}

/**
 * Compute the approximate area of a face
 */
function computeFaceArea(model: TopoModel, faceId: FaceId): number {
  const loops = getFaceLoops(model, faceId);
  if (loops.length === 0) return 0;
  
  const outerLoop = loops[0];
  const firstHe = getLoopFirstHalfEdge(model, outerLoop);
  if (isNullId(firstHe)) return 0;
  
  // Collect vertices
  const vertices: Vec3[] = [];
  let he = firstHe;
  let iterations = 0;
  
  do {
    if (iterations++ > 10000) break;
    
    const vertex = getHalfEdgeStartVertex(model, he);
    if (!isNullId(vertex)) {
      vertices.push(getVertexPosition(model, vertex));
    }
    he = getHalfEdgeNext(model, he);
  } while (he !== firstHe && !isNullId(he));
  
  if (vertices.length < 3) return 0;
  
  // Compute area using Newell's method
  const n = vertices.length;
  let cx = 0, cy = 0, cz = 0;
  for (const v of vertices) {
    cx += v[0];
    cy += v[1];
    cz += v[2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vi = vertices[i];
    const vj = vertices[j];
    
    nx += (vi[1] - cy) * (vj[2] - cz) - (vi[2] - cz) * (vj[1] - cy);
    ny += (vi[2] - cz) * (vj[0] - cx) - (vi[0] - cx) * (vj[2] - cz);
    nz += (vi[0] - cx) * (vj[1] - cy) - (vi[1] - cy) * (vj[0] - cx);
  }
  
  return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
}

/**
 * Reorient shells to have consistent outward-pointing normals
 * 
 * Uses the signed volume test: if total signed volume is negative,
 * the shell is inside-out and should be flipped.
 */
export function reorientShells(model: TopoModel): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  
  for (let s = 0; s < model.shells.count; s++) {
    const shellId = asShellId(s);
    if ((model.shells.flags[s] & EntityFlags.DELETED) !== 0) continue;
    
    // Only reorient closed shells
    if (!isShellClosed(model, shellId)) continue;
    
    const signedVolume = computeShellSignedVolume(model, shellId);
    
    // If signed volume is negative, shell is inside-out
    if (signedVolume < 0) {
      flipShell(model, shellId);
      
      result.count++;
      result.actions.push({
        kind: 'reorientShell',
        description: `Reoriented shell ${s} (signed volume was ${signedVolume.toExponential(3)})`,
        affected: [{ type: 'shell', id: s }],
      });
    }
  }
  
  return result;
}

/**
 * Compute the signed volume of a shell using the divergence theorem
 * 
 * For each face, compute the signed volume contribution using
 * the formula: V = (1/6) * sum(face_centroid · face_normal * face_area)
 */
function computeShellSignedVolume(model: TopoModel, shellId: ShellId): number {
  const faces = getShellFaces(model, shellId);
  let totalVolume = 0;
  
  for (const faceId of faces) {
    if (isFaceDeleted(model, faceId)) continue;
    
    const loops = getFaceLoops(model, faceId);
    if (loops.length === 0) continue;
    
    const outerLoop = loops[0];
    const firstHe = getLoopFirstHalfEdge(model, outerLoop);
    if (isNullId(firstHe)) continue;
    
    // Collect vertices
    const vertices: Vec3[] = [];
    let he = firstHe;
    let iterations = 0;
    
    do {
      if (iterations++ > 10000) break;
      
      const vertex = getHalfEdgeStartVertex(model, he);
      if (!isNullId(vertex)) {
        vertices.push(getVertexPosition(model, vertex));
      }
      he = getHalfEdgeNext(model, he);
    } while (he !== firstHe && !isNullId(he));
    
    if (vertices.length < 3) continue;
    
    // Compute face centroid
    const n = vertices.length;
    let cx = 0, cy = 0, cz = 0;
    for (const v of vertices) {
      cx += v[0];
      cy += v[1];
      cz += v[2];
    }
    const centroid: Vec3 = [cx / n, cy / n, cz / n];
    
    // Get face normal (from surface)
    const surfaceIdx = getFaceSurfaceIndex(model, faceId);
    const surface = getSurface(model, surfaceIdx);
    let normal = surfaceNormal(surface, 0, 0);
    
    if (isFaceReversed(model, faceId)) {
      normal = mul3(normal, -1);
    }
    
    // Compute area
    const area = computeFaceArea(model, faceId);
    
    // Contribution to volume: (1/3) * centroid · normal * area
    totalVolume += (1 / 3) * dot3(centroid, normal) * area;
  }
  
  return totalVolume;
}

/**
 * Flip a shell by reversing all face orientations
 */
function flipShell(model: TopoModel, shellId: ShellId): void {
  const faces = getShellFaces(model, shellId);
  
  for (const faceId of faces) {
    if (isFaceDeleted(model, faceId)) continue;
    
    // Toggle the REVERSED flag
    model.faces.flags[faceId] ^= EntityFlags.REVERSED;
    
    // Reverse the half-edge directions in all loops
    const loops = getFaceLoops(model, faceId);
    for (const loopId of loops) {
      reverseLoop(model, loopId);
    }
  }
}

/**
 * Reverse a loop by swapping next/prev pointers and flipping directions
 */
function reverseLoop(model: TopoModel, loopId: LoopId): void {
  const firstHe = getLoopFirstHalfEdge(model, loopId);
  if (isNullId(firstHe)) return;
  
  // Collect all half-edges in the loop
  const halfEdges: HalfEdgeId[] = [];
  let he = firstHe;
  let iterations = 0;
  
  do {
    if (iterations++ > 10000) break;
    halfEdges.push(he);
    he = getHalfEdgeNext(model, he);
  } while (he !== firstHe && !isNullId(he));
  
  if (halfEdges.length === 0) return;
  
  // Reverse the links
  for (let i = 0; i < halfEdges.length; i++) {
    const current = halfEdges[i];
    const prevIdx = (i + 1) % halfEdges.length;
    const nextIdx = (i - 1 + halfEdges.length) % halfEdges.length;
    
    model.halfEdges.next[current] = halfEdges[nextIdx];
    model.halfEdges.prev[current] = halfEdges[prevIdx];
    
    // Flip direction
    model.halfEdges.direction[current] *= -1;
  }
  
  // Update loop's first half-edge (keep it the same, but it's now "first" in reverse order)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the model needs healing
 * 
 * Returns true if there are any issues that healing could address.
 */
export function needsHealing(model: TopoModel): boolean {
  const report = validateModel(model, {
    checkDegenerate: true,
    checkManifold: true,
    checkBoundary: false,
    checkSlivers: true,
    checkDuplicateVertices: true,
  });
  
  // Check for healable issues
  const healableKinds = [
    'zeroLengthEdge',
    'shortEdge',
    'zeroAreaFace',
    'sliverFace',
    'duplicateVertex',
    'inconsistentShellOrientation',
  ];
  
  return report.issues.some(issue => healableKinds.includes(issue.kind));
}

/**
 * Get a summary of issues that would be addressed by healing
 */
export function getHealingSummary(model: TopoModel): {
  duplicateVertices: number;
  shortEdges: number;
  smallFaces: number;
  inconsistentShells: number;
} {
  const report = validateModel(model, {
    checkDegenerate: true,
    checkManifold: false,
    checkBoundary: false,
    checkSlivers: true,
    checkDuplicateVertices: true,
  });
  
  return {
    duplicateVertices: report.issues.filter(i => i.kind === 'duplicateVertex').length,
    shortEdges: report.issues.filter(i => i.kind === 'shortEdge' || i.kind === 'zeroLengthEdge').length,
    smallFaces: report.issues.filter(i => i.kind === 'zeroAreaFace' || i.kind === 'sliverFace').length,
    inconsistentShells: report.issues.filter(i => i.kind === 'inconsistentShellOrientation').length,
  };
}
