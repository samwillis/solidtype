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
import { TopoModel } from './TopoModel.js';
import type { ShellId, FaceId, HalfEdgeId, LoopId } from './handles.js';
import { isNullId, asVertexId, asEdgeId, asFaceId, asShellId } from './handles.js';
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

const DEFAULT_HEALING_OPTIONS: Required<HealingOptions> = {
  vertexMergeTolerance: 0,
  shortEdgeThreshold: 0,
  smallFaceAreaThreshold: 0,
  reorientShells: true,
  maxIterations: 3,
  validateAfterEachStep: false,
};

/**
 * Result of a single healing action
 */
export interface HealingAction {
  kind: 'mergeVertices' | 'collapseEdge' | 'removeFace' | 'reorientShell';
  description: string;
  affected: Array<{
    type: 'vertex' | 'edge' | 'face' | 'shell';
    id: number;
  }>;
}

/**
 * Result of a healing operation
 */
export interface HealingResult {
  success: boolean;
  error?: string;
  iterations: number;
  actions: HealingAction[];
  stats: {
    verticesMerged: number;
    edgesCollapsed: number;
    facesRemoved: number;
    shellsReoriented: number;
  };
  validationReport?: ValidationReport;
}

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
      
      const mergeResult = mergeCoincidentVertices(model, opts.vertexMergeTolerance);
      result.actions.push(...mergeResult.actions);
      result.stats.verticesMerged += mergeResult.count;
      actionsThisIteration += mergeResult.count;
      
      const collapseResult = collapseShortEdges(model, opts.shortEdgeThreshold);
      result.actions.push(...collapseResult.actions);
      result.stats.edgesCollapsed += collapseResult.count;
      actionsThisIteration += collapseResult.count;
      
      const removeResult = removeSmallFaces(model, opts.smallFaceAreaThreshold);
      result.actions.push(...removeResult.actions);
      result.stats.facesRemoved += removeResult.count;
      actionsThisIteration += removeResult.count;
      
      if (opts.reorientShells && iteration === 0) {
        const reorientResult = reorientShells(model);
        result.actions.push(...reorientResult.actions);
        result.stats.shellsReoriented += reorientResult.count;
        actionsThisIteration += reorientResult.count;
      }
      
      if (actionsThisIteration === 0) {
        break;
      }
      
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
    
    result.validationReport = validateModel(model, {
      checkDegenerate: true,
      checkManifold: true,
      checkBoundary: false,
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

interface SubOperationResult {
  count: number;
  actions: HealingAction[];
}

/**
 * Merge vertices that are within tolerance of each other
 */
export function mergeCoincidentVertices(
  model: TopoModel,
  tolerance: number
): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  const tolSq = tolerance * tolerance;
  
  const vertexGroups: Map<number, number[]> = new Map();
  const merged: Set<number> = new Set();
  
  // Collect live vertices
  const liveVertices: number[] = [];
  const vertexCount = model.getVertexCount();
  for (let i = 0; i < vertexCount; i++) {
    if (!model.isVertexDeleted(asVertexId(i))) {
      liveVertices.push(i);
    }
  }
  
  // Find coincident vertex pairs
  for (let i = 0; i < liveVertices.length; i++) {
    const vi = liveVertices[i];
    if (merged.has(vi)) continue;
    
    const pi = model.getVertexPosition(asVertexId(vi));
    const group: number[] = [vi];
    
    for (let j = i + 1; j < liveVertices.length; j++) {
      const vj = liveVertices[j];
      if (merged.has(vj)) continue;
      
      const pj = model.getVertexPosition(asVertexId(vj));
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
    let sx = 0, sy = 0, sz = 0;
    for (const vid of group) {
      const p = model.getVertexPosition(asVertexId(vid));
      sx += p[0];
      sy += p[1];
      sz += p[2];
    }
    sx /= group.length;
    sy /= group.length;
    sz /= group.length;
    
    model.setVertexPosition(asVertexId(survivor), [sx, sy, sz]);
    
    for (const vid of group) {
      if (vid === survivor) continue;
      
      // Update all edge references
      for (const edgeId of model.iterateAllEdgeIds()) {
        const { vStart, vEnd } = model.getRawEdgeVertices(edgeId);
        if (vStart === vid) {
          model.setEdgeStartVertex(edgeId, asVertexId(survivor));
        }
        if (vEnd === vid) {
          model.setEdgeEndVertex(edgeId, asVertexId(survivor));
        }
      }
      
      model.markVertexDeleted(asVertexId(vid));
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
 */
export function collapseShortEdges(
  model: TopoModel,
  threshold: number
): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  
  const edgesToCollapse: Array<{ id: number; length: number }> = [];
  const edgeCount = model.getEdgeCount();
  
  for (let i = 0; i < edgeCount; i++) {
    const id = asEdgeId(i);
    if (model.isEdgeDeleted(id)) continue;
    
    const vStart = model.getEdgeStartVertex(id);
    const vEnd = model.getEdgeEndVertex(id);
    
    if (isNullId(vStart) || isNullId(vEnd)) continue;
    if (vStart === vEnd) continue;
    
    const p0 = model.getVertexPosition(vStart);
    const p1 = model.getVertexPosition(vEnd);
    const len = length3(sub3(p1, p0));
    
    if (len < threshold && len > 0) {
      edgesToCollapse.push({ id: i, length: len });
    }
  }
  
  edgesToCollapse.sort((a, b) => a.length - b.length);
  
  for (const { id: edgeId, length } of edgesToCollapse) {
    const id = asEdgeId(edgeId);
    if (model.isEdgeDeleted(id)) continue;
    
    const vStart = model.getEdgeStartVertex(id);
    const vEnd = model.getEdgeEndVertex(id);
    
    if (isNullId(vStart) || isNullId(vEnd) || vStart === vEnd) continue;
    if (model.isVertexDeleted(vStart)) continue;
    if (model.isVertexDeleted(vEnd)) continue;
    
    const p0 = model.getVertexPosition(vStart);
    const p1 = model.getVertexPosition(vEnd);
    const midpoint: Vec3 = [
      (p0[0] + p1[0]) / 2,
      (p0[1] + p1[1]) / 2,
      (p0[2] + p1[2]) / 2,
    ];
    
    model.setVertexPosition(vStart, midpoint);
    
    // Update all references from vEnd to vStart
    for (const eId of model.iterateAllEdgeIds()) {
      const { vStart: vs, vEnd: ve } = model.getRawEdgeVertices(eId);
      if (vs === vEnd) {
        model.setEdgeStartVertex(eId, vStart);
      }
      if (ve === vEnd) {
        model.setEdgeEndVertex(eId, vStart);
      }
    }
    
    model.markEdgeDeleted(id);
    model.markVertexDeleted(vEnd);
    
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
 */
export function removeSmallFaces(
  model: TopoModel,
  areaThreshold: number
): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  const faceCount = model.getFaceCount();
  
  for (let i = 0; i < faceCount; i++) {
    const faceId = asFaceId(i);
    if (model.isFaceDeleted(faceId)) continue;
    
    const area = computeFaceArea(model, faceId);
    
    if (area < areaThreshold) {
      model.markFaceDeleted(faceId);
      model.removeFaceFromShell(faceId);
      
      const loops = model.getFaceLoops(faceId);
      for (const loopId of loops) {
        model.markLoopDeleted(loopId);
        
        for (const he of model.iterateLoopHalfEdges(loopId)) {
          model.markHalfEdgeDeleted(he);
          const twin = model.getHalfEdgeTwin(he);
          if (!isNullId(twin)) {
            model.clearHalfEdgeTwin(twin);
          }
        }
      }
      
      model.clearFaceLoops(faceId);
      
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

function computeFaceArea(model: TopoModel, faceId: FaceId): number {
  const loops = model.getFaceLoops(faceId);
  if (loops.length === 0) return 0;
  
  const outerLoop = loops[0];
  const firstHe = model.getLoopFirstHalfEdge(outerLoop);
  if (isNullId(firstHe)) return 0;
  
  const vertices: Vec3[] = [];
  let iterations = 0;
  
  for (const he of model.iterateLoopHalfEdges(outerLoop)) {
    if (iterations++ > 10000) break;
    const vertex = model.getHalfEdgeStartVertex(he);
    if (!isNullId(vertex)) {
      vertices.push(model.getVertexPosition(vertex));
    }
  }
  
  if (vertices.length < 3) return 0;
  
  const n = vertices.length;
  let cx = 0, cy = 0, cz = 0;
  for (const v of vertices) {
    cx += v[0]; cy += v[1]; cz += v[2];
  }
  cx /= n; cy /= n; cz /= n;
  
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
 */
export function reorientShells(model: TopoModel): SubOperationResult {
  const result: SubOperationResult = { count: 0, actions: [] };
  const shellCount = model.getShellCount();
  
  for (let s = 0; s < shellCount; s++) {
    const shellId = asShellId(s);
    
    if (!model.isShellClosed(shellId)) continue;
    
    const signedVolume = computeShellSignedVolume(model, shellId);
    
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

function computeShellSignedVolume(model: TopoModel, shellId: ShellId): number {
  const faces = model.getShellFaces(shellId);
  let totalVolume = 0;
  
  for (const faceId of faces) {
    if (model.isFaceDeleted(faceId)) continue;
    
    const loops = model.getFaceLoops(faceId);
    if (loops.length === 0) continue;
    
    const outerLoop = loops[0];
    const firstHe = model.getLoopFirstHalfEdge(outerLoop);
    if (isNullId(firstHe)) continue;
    
    const vertices: Vec3[] = [];
    let iterations = 0;
    
    for (const he of model.iterateLoopHalfEdges(outerLoop)) {
      if (iterations++ > 10000) break;
      const vertex = model.getHalfEdgeStartVertex(he);
      if (!isNullId(vertex)) {
        vertices.push(model.getVertexPosition(vertex));
      }
    }
    
    if (vertices.length < 3) continue;
    
    const n = vertices.length;
    let cx = 0, cy = 0, cz = 0;
    for (const v of vertices) {
      cx += v[0]; cy += v[1]; cz += v[2];
    }
    const centroid: Vec3 = [cx / n, cy / n, cz / n];
    
    const surfaceIdx = model.getFaceSurfaceIndex(faceId);
    const surface = model.getSurface(surfaceIdx);
    let normal = surfaceNormal(surface, 0, 0);
    
    if (model.isFaceReversed(faceId)) {
      normal = mul3(normal, -1);
    }
    
    const area = computeFaceArea(model, faceId);
    
    totalVolume += (1 / 3) * dot3(centroid, normal) * area;
  }
  
  return totalVolume;
}

function flipShell(model: TopoModel, shellId: ShellId): void {
  const faces = model.getShellFaces(shellId);
  
  for (const faceId of faces) {
    if (model.isFaceDeleted(faceId)) continue;
    
    model.toggleFaceReversed(faceId);
    
    const loops = model.getFaceLoops(faceId);
    for (const loopId of loops) {
      reverseLoop(model, loopId);
    }
  }
}

function reverseLoop(model: TopoModel, loopId: LoopId): void {
  const firstHe = model.getLoopFirstHalfEdge(loopId);
  if (isNullId(firstHe)) return;
  
  const halfEdges: HalfEdgeId[] = [];
  
  for (const he of model.iterateLoopHalfEdges(loopId)) {
    halfEdges.push(he);
    if (halfEdges.length > 10000) break;
  }
  
  if (halfEdges.length === 0) return;
  
  for (let i = 0; i < halfEdges.length; i++) {
    const current = halfEdges[i];
    const prevIdx = (i + 1) % halfEdges.length;
    const nextIdx = (i - 1 + halfEdges.length) % halfEdges.length;
    
    model.setHalfEdgeLinks(current, halfEdges[nextIdx], halfEdges[prevIdx]);
    
    const dir = model.getHalfEdgeDirection(current);
    model.setHalfEdgeDirection(current, dir === 1 ? -1 : 1);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the model needs healing
 */
export function needsHealing(model: TopoModel): boolean {
  const report = validateModel(model, {
    checkDegenerate: true,
    checkManifold: true,
    checkBoundary: false,
    checkSlivers: true,
    checkDuplicateVertices: true,
  });
  
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
