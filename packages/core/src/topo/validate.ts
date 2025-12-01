/**
 * BREP topology validation
 * 
 * Provides comprehensive validation of topology models to detect:
 * - Structural issues (missing references, broken cycles)
 * - Non-manifold conditions (edges with wrong number of faces)
 * - Degenerate entities (zero-area faces, zero-length edges)
 * - Consistency issues (mismatched half-edge pairs, orientation problems)
 */

import { sub3, length3 } from '../num/vec3.js';
import { isZero } from '../num/tolerance.js';
import type { TopoModel } from './model.js';
import {
  isNullId,
  asBodyId,
  asShellId,
  asFaceId,
  asEdgeId,
  asHalfEdgeId,
  asLoopId,
  asVertexId,
  getVertexPosition,
  isVertexDeleted,
  isEdgeDeleted,
  isFaceDeleted,
  isBodyDeleted,
  getEdgeStartVertex,
  getEdgeEndVertex,
  getHalfEdgeEdge,
  getHalfEdgeLoop,
  getHalfEdgeNext,
  getHalfEdgePrev,
  getHalfEdgeTwin,
  getHalfEdgeDirection,
  getHalfEdgeStartVertex,
  getHalfEdgeEndVertex,
  getLoopFace,
  getLoopFirstHalfEdge,
  getLoopHalfEdgeCount,
  getFaceShell,
  getFaceSurfaceIndex,
  getFaceLoops,
  getShellBody,
  getShellFaces,
  isShellClosed,
  getBodyShells,
} from './model.js';

/**
 * Types of validation issues
 */
export type ValidationIssueKind =
  | 'nullReference'
  | 'invalidIndex'
  | 'deletedReference'
  | 'brokenLoopCycle'
  | 'loopNotClosed'
  | 'halfEdgePairMismatch'
  | 'twinMismatch'
  | 'twinDirectionMismatch'
  | 'nonManifoldEdge'
  | 'boundaryEdge'
  | 'crack'
  | 'zeroLengthEdge'
  | 'shortEdge'
  | 'zeroAreaFace'
  | 'sliverFace'
  | 'inconsistentLoopOrientation'
  | 'orphanedEntity'
  | 'surfaceMissing'
  | 'curveMissing'
  | 'vertexMismatch'
  | 'loopFaceMismatch'
  | 'faceShellMismatch'
  | 'shellBodyMismatch'
  | 'duplicateVertex'
  | 'inconsistentShellOrientation';

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Entity reference for validation issues
 * 
 * Note: This is distinct from naming/types.ts SubshapeRef, which is specifically
 * for persistent naming. This type covers all entity types (including shells, loops, etc.)
 * that can have validation issues.
 */
export interface ValidationEntityRef {
  type: 'body' | 'shell' | 'face' | 'loop' | 'halfEdge' | 'edge' | 'vertex';
  id: number;
}

/**
 * A single validation issue
 */
export interface ValidationIssue {
  /** Type of the issue */
  kind: ValidationIssueKind;
  /** Severity level */
  severity: ValidationSeverity;
  /** Human-readable description */
  message: string;
  /** The entity where the issue was found */
  subshape: ValidationEntityRef;
  /** Related entities involved in the issue */
  related?: ValidationEntityRef[];
}

/**
 * Complete validation report
 */
export interface ValidationReport {
  /** Whether the model is valid (no errors) */
  isValid: boolean;
  /** All validation issues found */
  issues: ValidationIssue[];
  /** Count by severity */
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Check for degenerate entities (zero-length edges, zero-area faces) */
  checkDegenerate?: boolean;
  /** Check for non-manifold conditions */
  checkManifold?: boolean;
  /** Check for boundary edges (edges with only one face) */
  checkBoundary?: boolean;
  /** Check for sliver faces (faces with poor aspect ratio) */
  checkSlivers?: boolean;
  /** Check for near-coincident vertices */
  checkDuplicateVertices?: boolean;
  /** Maximum iterations when traversing loops (to prevent infinite loops) */
  maxLoopIterations?: number;
  /** Multiplier for short edge threshold (shortEdge if length < tol * multiplier) */
  shortEdgeMultiplier?: number;
  /** Minimum aspect ratio for sliver face detection (smaller = more strict) */
  sliverAspectRatioThreshold?: number;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  checkDegenerate: true,
  checkManifold: true,
  checkBoundary: true,
  checkSlivers: true,
  checkDuplicateVertices: false, // disabled by default as it can be expensive
  maxLoopIterations: 10000,
  shortEdgeMultiplier: 10, // edges shorter than 10 * tol are flagged
  sliverAspectRatioThreshold: 0.01, // faces with aspect ratio < 1% are slivers
};

/**
 * Create an empty validation report
 */
function createReport(): ValidationReport {
  return {
    isValid: true,
    issues: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
  };
}

/**
 * Add an issue to the report
 */
function addIssue(
  report: ValidationReport,
  kind: ValidationIssueKind,
  severity: ValidationSeverity,
  message: string,
  subshape: ValidationEntityRef,
  related?: ValidationEntityRef[]
): void {
  report.issues.push({ kind, severity, message, subshape, related });
  
  if (severity === 'error') {
    report.errorCount++;
    report.isValid = false;
  } else if (severity === 'warning') {
    report.warningCount++;
  } else {
    report.infoCount++;
  }
}

/**
 * Validate the complete topology model
 * 
 * @param model The topology model to validate
 * @param options Validation options
 * @returns Validation report with all issues found
 */
export function validateModel(
  model: TopoModel,
  options: ValidationOptions = {}
): ValidationReport {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const report = createReport();
  
  // Validate vertices
  validateVertices(model, report);
  
  // Check for duplicate vertices if requested
  if (opts.checkDuplicateVertices) {
    validateDuplicateVertices(model, report);
  }
  
  // Validate edges
  validateEdges(model, report, opts);
  
  // Validate half-edges
  validateHalfEdges(model, report);
  
  // Validate loops
  validateLoops(model, report, opts);
  
  // Validate faces
  validateFaces(model, report);
  
  // Check for sliver faces if requested
  if (opts.checkSlivers) {
    validateSliverFaces(model, report, opts);
  }
  
  // Validate shells
  validateShells(model, report);
  
  // Validate bodies
  validateBodies(model, report);
  
  // Check manifold conditions if requested
  if (opts.checkManifold) {
    validateManifold(model, report, opts);
  }
  
  return report;
}

/**
 * Validate all vertices in the model
 */
function validateVertices(
  model: TopoModel,
  report: ValidationReport
): void {
  const table = model.vertices;
  
  for (let i = 0; i < table.count; i++) {
    const id = asVertexId(i);
    if (isVertexDeleted(model, id)) continue;
    
    const pos = getVertexPosition(model, id);
    
    // Check for NaN/Infinity
    if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1]) || !Number.isFinite(pos[2])) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Vertex ${i} has non-finite coordinates: [${pos[0]}, ${pos[1]}, ${pos[2]}]`,
        { type: 'vertex', id: i }
      );
    }
  }
}

/**
 * Validate all edges in the model
 */
function validateEdges(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>
): void {
  const table = model.edges;
  
  for (let i = 0; i < table.count; i++) {
    const id = asEdgeId(i);
    if (isEdgeDeleted(model, id)) continue;
    
    const vStart = getEdgeStartVertex(model, id);
    const vEnd = getEdgeEndVertex(model, id);
    
    // Check vertex references
    if (isNullId(vStart)) {
      addIssue(
        report,
        'nullReference',
        'error',
        `Edge ${i} has null start vertex`,
        { type: 'edge', id: i }
      );
    } else if (vStart >= model.vertices.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Edge ${i} references invalid start vertex ${vStart}`,
        { type: 'edge', id: i },
        [{ type: 'vertex', id: vStart }]
      );
    } else if (isVertexDeleted(model, vStart)) {
      addIssue(
        report,
        'deletedReference',
        'error',
        `Edge ${i} references deleted start vertex ${vStart}`,
        { type: 'edge', id: i },
        [{ type: 'vertex', id: vStart }]
      );
    }
    
    if (isNullId(vEnd)) {
      addIssue(
        report,
        'nullReference',
        'error',
        `Edge ${i} has null end vertex`,
        { type: 'edge', id: i }
      );
    } else if (vEnd >= model.vertices.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Edge ${i} references invalid end vertex ${vEnd}`,
        { type: 'edge', id: i },
        [{ type: 'vertex', id: vEnd }]
      );
    } else if (isVertexDeleted(model, vEnd)) {
      addIssue(
        report,
        'deletedReference',
        'error',
        `Edge ${i} references deleted end vertex ${vEnd}`,
        { type: 'edge', id: i },
        [{ type: 'vertex', id: vEnd }]
      );
    }
    
    // Check for degenerate (zero-length) and short edges
    if (opts.checkDegenerate && !isNullId(vStart) && !isNullId(vEnd)) {
      const p0 = getVertexPosition(model, vStart);
      const p1 = getVertexPosition(model, vEnd);
      const len = length3(sub3(p1, p0));
      
      if (isZero(len, model.ctx)) {
        addIssue(
          report,
          'zeroLengthEdge',
          'warning',
          `Edge ${i} has zero length (vertices ${vStart} and ${vEnd} are coincident)`,
          { type: 'edge', id: i },
          [{ type: 'vertex', id: vStart }, { type: 'vertex', id: vEnd }]
        );
      } else {
        // Check for short edges (longer than zero but still very small)
        const shortEdgeThreshold = model.ctx.tol.length * opts.shortEdgeMultiplier;
        if (len < shortEdgeThreshold && len > model.ctx.tol.length) {
          addIssue(
            report,
            'shortEdge',
            'warning',
            `Edge ${i} is very short (length ${len.toExponential(3)}, threshold ${shortEdgeThreshold.toExponential(3)})`,
            { type: 'edge', id: i },
            [{ type: 'vertex', id: vStart }, { type: 'vertex', id: vEnd }]
          );
        }
      }
    }
    
    // Check curve reference
    const curveIdx = model.edges.curveIndex[i];
    if (!isNullId(curveIdx) && curveIdx >= model.curves.length) {
      addIssue(
        report,
        'curveMissing',
        'error',
        `Edge ${i} references non-existent curve ${curveIdx}`,
        { type: 'edge', id: i }
      );
    }
    
    // Check parameter bounds
    const tStart = model.edges.tStart[i];
    const tEnd = model.edges.tEnd[i];
    if (!Number.isFinite(tStart) || !Number.isFinite(tEnd)) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Edge ${i} has invalid parameter bounds: [${tStart}, ${tEnd}]`,
        { type: 'edge', id: i }
      );
    }
  }
}

/**
 * Validate all half-edges in the model
 */
function validateHalfEdges(
  model: TopoModel,
  report: ValidationReport
): void {
  const table = model.halfEdges;
  
  for (let i = 0; i < table.count; i++) {
    const id = asHalfEdgeId(i);
    if ((table.flags[i] & 1) !== 0) continue; // deleted
    
    const edge = getHalfEdgeEdge(model, id);
    const loop = getHalfEdgeLoop(model, id);
    const next = getHalfEdgeNext(model, id);
    const prev = getHalfEdgePrev(model, id);
    const twin = getHalfEdgeTwin(model, id);
    
    // Check edge reference
    if (isNullId(edge)) {
      addIssue(
        report,
        'nullReference',
        'error',
        `Half-edge ${i} has null edge reference`,
        { type: 'halfEdge', id: i }
      );
    } else if (edge >= model.edges.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Half-edge ${i} references invalid edge ${edge}`,
        { type: 'halfEdge', id: i },
        [{ type: 'edge', id: edge }]
      );
    }
    
    // Check loop reference
    if (isNullId(loop)) {
      addIssue(
        report,
        'nullReference',
        'warning',
        `Half-edge ${i} has null loop reference`,
        { type: 'halfEdge', id: i }
      );
    } else if (loop >= model.loops.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Half-edge ${i} references invalid loop ${loop}`,
        { type: 'halfEdge', id: i },
        [{ type: 'loop', id: loop }]
      );
    }
    
    // Check next/prev consistency
    if (!isNullId(next)) {
      if (next >= table.count) {
        addIssue(
          report,
          'invalidIndex',
          'error',
          `Half-edge ${i} has invalid next reference ${next}`,
          { type: 'halfEdge', id: i }
        );
      } else {
        const nextPrev = getHalfEdgePrev(model, next);
        if (nextPrev !== i) {
          addIssue(
            report,
            'brokenLoopCycle',
            'error',
            `Half-edge ${i} -> next ${next} -> prev ${nextPrev} != ${i}`,
            { type: 'halfEdge', id: i },
            [{ type: 'halfEdge', id: next }]
          );
        }
      }
    }
    
    if (!isNullId(prev)) {
      if (prev >= table.count) {
        addIssue(
          report,
          'invalidIndex',
          'error',
          `Half-edge ${i} has invalid prev reference ${prev}`,
          { type: 'halfEdge', id: i }
        );
      } else {
        const prevNext = getHalfEdgeNext(model, prev);
        if (prevNext !== i) {
          addIssue(
            report,
            'brokenLoopCycle',
            'error',
            `Half-edge ${i} -> prev ${prev} -> next ${prevNext} != ${i}`,
            { type: 'halfEdge', id: i },
            [{ type: 'halfEdge', id: prev }]
          );
        }
      }
    }
    
    // Check twin consistency
    if (!isNullId(twin)) {
      if (twin >= table.count) {
        addIssue(
          report,
          'invalidIndex',
          'error',
          `Half-edge ${i} has invalid twin reference ${twin}`,
          { type: 'halfEdge', id: i }
        );
      } else {
        const twinTwin = getHalfEdgeTwin(model, twin);
        if (twinTwin !== i) {
          addIssue(
            report,
            'twinMismatch',
            'error',
            `Half-edge ${i} -> twin ${twin} -> twin ${twinTwin} != ${i}`,
            { type: 'halfEdge', id: i },
            [{ type: 'halfEdge', id: twin }]
          );
        }
        
        // Check that twins share the same edge
        const twinEdge = getHalfEdgeEdge(model, twin);
        if (twinEdge !== edge) {
          addIssue(
            report,
            'halfEdgePairMismatch',
            'error',
            `Half-edge ${i} (edge ${edge}) and twin ${twin} (edge ${twinEdge}) don't share the same edge`,
            { type: 'halfEdge', id: i },
            [{ type: 'halfEdge', id: twin }]
          );
        }
        
        // Check that twins have opposite directions
        const dir = getHalfEdgeDirection(model, id);
        const twinDir = getHalfEdgeDirection(model, twin);
        if (dir === twinDir) {
          addIssue(
            report,
            'twinDirectionMismatch',
            'error',
            `Half-edge ${i} and twin ${twin} have the same direction`,
            { type: 'halfEdge', id: i },
            [{ type: 'halfEdge', id: twin }]
          );
        }
      }
    }
    
    // Check vertex connectivity (end of prev == start of this, end of this == start of next)
    if (!isNullId(prev) && !isNullId(edge) && prev < table.count && edge < model.edges.count) {
      const prevEnd = getHalfEdgeEndVertex(model, prev);
      const thisStart = getHalfEdgeStartVertex(model, id);
      
      if (prevEnd !== thisStart) {
        addIssue(
          report,
          'vertexMismatch',
          'error',
          `Half-edge ${i} start vertex ${thisStart} doesn't match prev half-edge ${prev} end vertex ${prevEnd}`,
          { type: 'halfEdge', id: i },
          [{ type: 'halfEdge', id: prev }]
        );
      }
    }
  }
}

/**
 * Validate all loops in the model
 */
function validateLoops(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>
): void {
  const table = model.loops;
  
  for (let i = 0; i < table.count; i++) {
    const id = asLoopId(i);
    if ((table.flags[i] & 1) !== 0) continue; // deleted
    
    const face = getLoopFace(model, id);
    const firstHe = getLoopFirstHalfEdge(model, id);
    const heCount = getLoopHalfEdgeCount(model, id);
    
    // Check face reference
    if (isNullId(face)) {
      addIssue(
        report,
        'nullReference',
        'warning',
        `Loop ${i} has null face reference`,
        { type: 'loop', id: i }
      );
    } else if (face >= model.faces.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Loop ${i} references invalid face ${face}`,
        { type: 'loop', id: i },
        [{ type: 'face', id: face }]
      );
    } else {
      // Check that the face's loops include this loop
      const faceLoops = getFaceLoops(model, face);
      if (!faceLoops.includes(id)) {
        addIssue(
          report,
          'loopFaceMismatch',
          'error',
          `Loop ${i} claims face ${face}, but face doesn't list this loop`,
          { type: 'loop', id: i },
          [{ type: 'face', id: face }]
        );
      }
    }
    
    // Check first half-edge reference
    if (isNullId(firstHe)) {
      addIssue(
        report,
        'nullReference',
        'error',
        `Loop ${i} has null first half-edge`,
        { type: 'loop', id: i }
      );
      continue;
    }
    
    if (firstHe >= model.halfEdges.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Loop ${i} references invalid first half-edge ${firstHe}`,
        { type: 'loop', id: i },
        [{ type: 'halfEdge', id: firstHe }]
      );
      continue;
    }
    
    // Check that the loop is actually closed and has the right count
    let actualCount = 0;
    let current: number = firstHe;
    const visited = new Set<number>();
    
    while (actualCount < opts.maxLoopIterations) {
      if (isNullId(current)) {
        addIssue(
          report,
          'loopNotClosed',
          'error',
          `Loop ${i} is not closed (reached null half-edge after ${actualCount} steps)`,
          { type: 'loop', id: i }
        );
        break;
      }
      
      if (visited.has(current)) {
        if (current === firstHe) {
          // Successfully closed the loop
          break;
        } else {
          // Hit a different half-edge we've seen before (but not the start)
          addIssue(
            report,
            'brokenLoopCycle',
            'error',
            `Loop ${i} has a cycle that doesn't return to start (hit ${current} twice)`,
            { type: 'loop', id: i },
            [{ type: 'halfEdge', id: current }]
          );
          break;
        }
      }
      
      visited.add(current);
      actualCount++;
      
      // Check that this half-edge belongs to this loop
      const heLoop = getHalfEdgeLoop(model, asHalfEdgeId(current));
      if (heLoop !== i) {
        addIssue(
          report,
          'loopFaceMismatch',
          'error',
          `Half-edge ${current} in loop ${i} claims to belong to loop ${heLoop}`,
          { type: 'loop', id: i },
          [{ type: 'halfEdge', id: current }]
        );
      }
      
      current = model.halfEdges.next[current];
    }
    
    if (actualCount >= opts.maxLoopIterations) {
      addIssue(
        report,
        'brokenLoopCycle',
        'error',
        `Loop ${i} traversal exceeded max iterations (${opts.maxLoopIterations}) - likely infinite loop`,
        { type: 'loop', id: i }
      );
    } else if (actualCount !== heCount && visited.has(firstHe)) {
      addIssue(
        report,
        'halfEdgePairMismatch',
        'warning',
        `Loop ${i} claims ${heCount} half-edges but traversal found ${actualCount}`,
        { type: 'loop', id: i }
      );
    }
  }
}

/**
 * Validate all faces in the model
 */
function validateFaces(
  model: TopoModel,
  report: ValidationReport
): void {
  const table = model.faces;
  
  for (let i = 0; i < table.count; i++) {
    const id = asFaceId(i);
    if (isFaceDeleted(model, id)) continue;
    
    const shell = getFaceShell(model, id);
    const surfaceIdx = getFaceSurfaceIndex(model, id);
    const loops = getFaceLoops(model, id);
    
    // Check shell reference
    if (isNullId(shell)) {
      addIssue(
        report,
        'nullReference',
        'warning',
        `Face ${i} has null shell reference`,
        { type: 'face', id: i }
      );
    } else if (shell >= model.shells.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Face ${i} references invalid shell ${shell}`,
        { type: 'face', id: i },
        [{ type: 'shell', id: shell }]
      );
    } else {
      // Check that the shell's faces include this face
      const shellFaces = getShellFaces(model, shell);
      if (!shellFaces.includes(id)) {
        addIssue(
          report,
          'faceShellMismatch',
          'error',
          `Face ${i} claims shell ${shell}, but shell doesn't list this face`,
          { type: 'face', id: i },
          [{ type: 'shell', id: shell }]
        );
      }
    }
    
    // Check surface reference
    if (isNullId(surfaceIdx)) {
      addIssue(
        report,
        'nullReference',
        'error',
        `Face ${i} has null surface reference`,
        { type: 'face', id: i }
      );
    } else if (surfaceIdx >= model.surfaces.length) {
      addIssue(
        report,
        'surfaceMissing',
        'error',
        `Face ${i} references non-existent surface ${surfaceIdx}`,
        { type: 'face', id: i }
      );
    }
    
    // Check loops
    if (loops.length === 0) {
      addIssue(
        report,
        'nullReference',
        'error',
        `Face ${i} has no loops`,
        { type: 'face', id: i }
      );
    } else {
      // Check each loop references this face
      for (const loopId of loops) {
        if (loopId >= model.loops.count) {
          addIssue(
            report,
            'invalidIndex',
            'error',
            `Face ${i} references invalid loop ${loopId}`,
            { type: 'face', id: i },
            [{ type: 'loop', id: loopId }]
          );
        } else {
          const loopFace = getLoopFace(model, loopId);
          if (loopFace !== i) {
            addIssue(
              report,
              'loopFaceMismatch',
              'error',
              `Face ${i} lists loop ${loopId}, but loop claims face ${loopFace}`,
              { type: 'face', id: i },
              [{ type: 'loop', id: loopId }]
            );
          }
        }
      }
    }
  }
}

/**
 * Validate all shells in the model
 */
function validateShells(
  model: TopoModel,
  report: ValidationReport
): void {
  const table = model.shells;
  
  for (let i = 0; i < table.count; i++) {
    const id = asShellId(i);
    if ((table.flags[i] & 1) !== 0) continue; // deleted
    
    const body = getShellBody(model, id);
    const faces = getShellFaces(model, id);
    
    // Check body reference
    if (isNullId(body)) {
      addIssue(
        report,
        'nullReference',
        'warning',
        `Shell ${i} has null body reference`,
        { type: 'shell', id: i }
      );
    } else if (body >= model.bodies.count) {
      addIssue(
        report,
        'invalidIndex',
        'error',
        `Shell ${i} references invalid body ${body}`,
        { type: 'shell', id: i },
        [{ type: 'body', id: body }]
      );
    } else {
      // Check that the body's shells include this shell
      const bodyShells = getBodyShells(model, body);
      if (!bodyShells.includes(id)) {
        addIssue(
          report,
          'shellBodyMismatch',
          'error',
          `Shell ${i} claims body ${body}, but body doesn't list this shell`,
          { type: 'shell', id: i },
          [{ type: 'body', id: body }]
        );
      }
    }
    
    // Check faces
    if (faces.length === 0) {
      addIssue(
        report,
        'nullReference',
        'warning',
        `Shell ${i} has no faces`,
        { type: 'shell', id: i }
      );
    } else {
      // Check each face references this shell
      for (const faceId of faces) {
        if (faceId >= model.faces.count) {
          addIssue(
            report,
            'invalidIndex',
            'error',
            `Shell ${i} references invalid face ${faceId}`,
            { type: 'shell', id: i },
            [{ type: 'face', id: faceId }]
          );
        } else {
          const faceShell = getFaceShell(model, faceId);
          if (faceShell !== i) {
            addIssue(
              report,
              'faceShellMismatch',
              'error',
              `Shell ${i} lists face ${faceId}, but face claims shell ${faceShell}`,
              { type: 'shell', id: i },
              [{ type: 'face', id: faceId }]
            );
          }
        }
      }
    }
  }
}

/**
 * Validate all bodies in the model
 */
function validateBodies(
  model: TopoModel,
  report: ValidationReport
): void {
  const table = model.bodies;
  
  for (let i = 0; i < table.count; i++) {
    const id = asBodyId(i);
    if (isBodyDeleted(model, id)) continue;
    
    const shells = getBodyShells(model, id);
    
    // Check shells
    if (shells.length === 0) {
      addIssue(
        report,
        'nullReference',
        'warning',
        `Body ${i} has no shells`,
        { type: 'body', id: i }
      );
    } else {
      // Check each shell references this body
      for (const shellId of shells) {
        if (shellId >= model.shells.count) {
          addIssue(
            report,
            'invalidIndex',
            'error',
            `Body ${i} references invalid shell ${shellId}`,
            { type: 'body', id: i },
            [{ type: 'shell', id: shellId }]
          );
        } else {
          const shellBody = getShellBody(model, shellId);
          if (shellBody !== i) {
            addIssue(
              report,
              'shellBodyMismatch',
              'error',
              `Body ${i} lists shell ${shellId}, but shell claims body ${shellBody}`,
              { type: 'body', id: i },
              [{ type: 'shell', id: shellId }]
            );
          }
        }
      }
    }
  }
}

/**
 * Validate manifold conditions
 * 
 * For a 2-manifold solid:
 * - Each edge should have exactly 2 half-edges (one in each direction)
 * - Each edge should be shared by exactly 2 faces
 */
function validateManifold(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>
): void {
  // Count half-edges per edge
  const edgeHalfEdgeCounts = new Map<number, number>();
  
  for (let i = 0; i < model.halfEdges.count; i++) {
    if ((model.halfEdges.flags[i] & 1) !== 0) continue; // deleted
    
    const edge = model.halfEdges.edge[i];
    if (!isNullId(edge)) {
      edgeHalfEdgeCounts.set(edge, (edgeHalfEdgeCounts.get(edge) ?? 0) + 1);
    }
  }
  
  // Check each edge
  for (const [edgeId, count] of edgeHalfEdgeCounts) {
    if (count < 2 && opts.checkBoundary) {
      addIssue(
        report,
        'boundaryEdge',
        'info',
        `Edge ${edgeId} is a boundary edge (only ${count} half-edge(s))`,
        { type: 'edge', id: edgeId }
      );
    } else if (count > 2) {
      addIssue(
        report,
        'nonManifoldEdge',
        'error',
        `Edge ${edgeId} is non-manifold (${count} half-edges, expected 2)`,
        { type: 'edge', id: edgeId }
      );
    }
  }
  
  // Also check shell closure for shells marked as closed
  for (let i = 0; i < model.shells.count; i++) {
    const id = asShellId(i);
    if ((model.shells.flags[i] & 1) !== 0) continue; // deleted
    
    if (isShellClosed(model, id)) {
      // For a closed shell, all edges should have exactly 2 half-edges
      const shellEdges = new Map<number, number>();
      
      const faces = getShellFaces(model, id);
      
      for (const faceId of faces) {
        if (faceId >= model.faces.count) continue;
        
        const loops = getFaceLoops(model, faceId);
        
        for (const loopId of loops) {
          if (loopId >= model.loops.count) continue;
          
          const firstHe = model.loops.firstHalfEdge[loopId];
          if (isNullId(firstHe)) continue;
          
          let current = firstHe;
          let iterations = 0;
          
          do {
            if (current >= model.halfEdges.count) break;
            
            const edge = model.halfEdges.edge[current];
            if (!isNullId(edge)) {
              shellEdges.set(edge, (shellEdges.get(edge) ?? 0) + 1);
            }
            
            current = model.halfEdges.next[current];
            iterations++;
          } while (current !== firstHe && !isNullId(current) && iterations < opts.maxLoopIterations);
        }
      }
      
      // Check for boundary edges in closed shell
      for (const [edgeId, count] of shellEdges) {
        if (count !== 2) {
          addIssue(
            report,
            count < 2 ? 'boundaryEdge' : 'nonManifoldEdge',
            'error',
            `Closed shell ${i} has edge ${edgeId} with ${count} half-edge(s) (expected 2)`,
            { type: 'shell', id: i },
            [{ type: 'edge', id: edgeId }]
          );
        }
      }
    }
  }
}

/**
 * Validate for duplicate (near-coincident) vertices
 * 
 * Finds vertices that are within tolerance of each other,
 * which may indicate geometry issues or need for healing.
 */
function validateDuplicateVertices(
  model: TopoModel,
  report: ValidationReport
): void {
  const table = model.vertices;
  const tol = model.ctx.tol.length;
  
  // Build list of live vertices
  const liveVertices: Array<{ id: number; x: number; y: number; z: number }> = [];
  for (let i = 0; i < table.count; i++) {
    if (isVertexDeleted(model, asVertexId(i))) continue;
    liveVertices.push({
      id: i,
      x: table.x[i],
      y: table.y[i],
      z: table.z[i],
    });
  }
  
  // O(n²) check for duplicates (could be optimized with spatial indexing)
  for (let i = 0; i < liveVertices.length; i++) {
    for (let j = i + 1; j < liveVertices.length; j++) {
      const a = liveVertices[i];
      const b = liveVertices[j];
      
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq < tol * tol) {
        addIssue(
          report,
          'duplicateVertex',
          'warning',
          `Vertices ${a.id} and ${b.id} are nearly coincident (distance ${Math.sqrt(distSq).toExponential(3)})`,
          { type: 'vertex', id: a.id },
          [{ type: 'vertex', id: b.id }]
        );
      }
    }
  }
}

/**
 * Validate for sliver faces (faces with very poor aspect ratio or very small area)
 * 
 * A sliver face is typically a very thin triangle or quad that may cause
 * numerical issues or visual artifacts in rendering.
 */
function validateSliverFaces(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>
): void {
  for (let i = 0; i < model.faces.count; i++) {
    const faceId = asFaceId(i);
    if (isFaceDeleted(model, faceId)) continue;
    
    const loops = getFaceLoops(model, faceId);
    if (loops.length === 0) continue;
    
    const outerLoop = loops[0];
    const firstHe = getLoopFirstHalfEdge(model, outerLoop);
    if (isNullId(firstHe)) continue;
    
    // Collect vertices from outer loop
    const vertices: Array<{ x: number; y: number; z: number }> = [];
    let he = firstHe;
    let iterations = 0;
    
    do {
      if (iterations++ > opts.maxLoopIterations) break;
      
      const vertex = getHalfEdgeStartVertex(model, he);
      const pos = getVertexPosition(model, vertex);
      vertices.push({ x: pos[0], y: pos[1], z: pos[2] });
      he = getHalfEdgeNext(model, he);
    } while (he !== firstHe && !isNullId(he));
    
    if (vertices.length < 3) continue;
    
    // Compute approximate area using shoelace-like formula for 3D polygon
    // Project to best-fit plane and compute 2D area
    const areaAndPerimeter = computePolygonAreaAndPerimeter(vertices);
    const { area, perimeter } = areaAndPerimeter;
    
    // Check for zero area
    if (area < model.ctx.tol.length * model.ctx.tol.length) {
      addIssue(
        report,
        'zeroAreaFace',
        'warning',
        `Face ${i} has near-zero area (${area.toExponential(3)})`,
        { type: 'face', id: i }
      );
      continue;
    }
    
    // Check for sliver face using isoperimetric ratio
    // For a circle (best ratio): ratio = 4π*area/perimeter² = 1
    // For a square: ratio ≈ 0.785
    // For very thin shapes: ratio → 0
    if (perimeter > 0) {
      const isoperimetricRatio = (4 * Math.PI * area) / (perimeter * perimeter);
      
      if (isoperimetricRatio < opts.sliverAspectRatioThreshold) {
        addIssue(
          report,
          'sliverFace',
          'warning',
          `Face ${i} is a sliver face (isoperimetric ratio ${isoperimetricRatio.toFixed(4)}, threshold ${opts.sliverAspectRatioThreshold})`,
          { type: 'face', id: i }
        );
      }
    }
  }
}

/**
 * Compute the approximate area and perimeter of a 3D polygon
 * by projecting to its best-fit plane.
 */
function computePolygonAreaAndPerimeter(
  vertices: Array<{ x: number; y: number; z: number }>
): { area: number; perimeter: number } {
  const n = vertices.length;
  if (n < 3) return { area: 0, perimeter: 0 };
  
  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  for (const v of vertices) {
    cx += v.x;
    cy += v.y;
    cz += v.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  
  // Compute approximate normal using Newell's method
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vi = vertices[i];
    const vj = vertices[j];
    
    nx += (vi.y - cy) * (vj.z - cz) - (vi.z - cz) * (vj.y - cy);
    ny += (vi.z - cz) * (vj.x - cx) - (vi.x - cx) * (vj.z - cz);
    nz += (vi.x - cx) * (vj.y - cy) - (vi.y - cy) * (vj.x - cx);
  }
  
  // Area is half the magnitude of the normal vector from Newell's method
  const area = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
  
  // Compute perimeter
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vi = vertices[i];
    const vj = vertices[j];
    
    const dx = vj.x - vi.x;
    const dy = vj.y - vi.y;
    const dz = vj.z - vi.z;
    perimeter += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  return { area, perimeter };
}

/**
 * Quick validation check - returns true if model is valid
 * 
 * This is a lighter check than full validateModel, suitable for assertions.
 */
export function isValidModel(model: TopoModel): boolean {
  const report = validateModel(model, {
    checkDegenerate: false,
    checkBoundary: false,
    checkSlivers: false,
  });
  return report.isValid;
}
