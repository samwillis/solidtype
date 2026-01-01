/**
 * BREP topology validation
 *
 * Provides comprehensive validation of topology models to detect:
 * - Structural issues (missing references, broken cycles)
 * - Non-manifold conditions (edges with wrong number of faces)
 * - Degenerate entities (zero-area faces, zero-length edges)
 * - Consistency issues (mismatched half-edge pairs, orientation problems)
 */

import { sub3, length3 } from "../num/vec3.js";
import { isZero } from "../num/tolerance.js";
import { TopoModel } from "./TopoModel.js";
import {
  isNullId,
  asBodyId,
  asShellId,
  asFaceId,
  asEdgeId,
  asHalfEdgeId,
  asLoopId,
  asVertexId,
} from "./handles.js";

/**
 * Types of validation issues
 */
export type ValidationIssueKind =
  | `nullReference`
  | `invalidIndex`
  | `deletedReference`
  | `brokenLoopCycle`
  | `loopNotClosed`
  | `halfEdgePairMismatch`
  | `twinMismatch`
  | `twinDirectionMismatch`
  | `nonManifoldEdge`
  | `boundaryEdge`
  | `crack`
  | `zeroLengthEdge`
  | `shortEdge`
  | `zeroAreaFace`
  | `sliverFace`
  | `inconsistentLoopOrientation`
  | `orphanedEntity`
  | `surfaceMissing`
  | `curveMissing`
  | `vertexMismatch`
  | `loopFaceMismatch`
  | `faceShellMismatch`
  | `shellBodyMismatch`
  | `duplicateVertex`
  | `inconsistentShellOrientation`;

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = `error` | `warning` | `info`;

/**
 * Entity reference for validation issues
 */
export interface ValidationEntityRef {
  type: `body` | `shell` | `face` | `loop` | `halfEdge` | `edge` | `vertex`;
  id: number;
}

/**
 * A single validation issue
 */
export interface ValidationIssue {
  kind: ValidationIssueKind;
  severity: ValidationSeverity;
  message: string;
  subshape: ValidationEntityRef;
  related?: ValidationEntityRef[];
}

/**
 * Complete validation report
 */
export interface ValidationReport {
  isValid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  checkDegenerate?: boolean;
  checkManifold?: boolean;
  checkBoundary?: boolean;
  checkSlivers?: boolean;
  checkDuplicateVertices?: boolean;
  maxLoopIterations?: number;
  shortEdgeMultiplier?: number;
  sliverAspectRatioThreshold?: number;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  checkDegenerate: true,
  checkManifold: true,
  checkBoundary: true,
  checkSlivers: true,
  checkDuplicateVertices: false,
  maxLoopIterations: 10000,
  shortEdgeMultiplier: 10,
  sliverAspectRatioThreshold: 0.01,
};

function createReport(): ValidationReport {
  return {
    isValid: true,
    issues: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
  };
}

function addIssue(
  report: ValidationReport,
  kind: ValidationIssueKind,
  severity: ValidationSeverity,
  message: string,
  subshape: ValidationEntityRef,
  related?: ValidationEntityRef[]
): void {
  report.issues.push({ kind, severity, message, subshape, related });

  if (severity === `error`) {
    report.errorCount++;
    report.isValid = false;
  } else if (severity === `warning`) {
    report.warningCount++;
  } else {
    report.infoCount++;
  }
}

/**
 * Validate the complete topology model
 */
export function validateModel(model: TopoModel, options: ValidationOptions = {}): ValidationReport {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const report = createReport();
  const stats = model.getStats();

  // Validate vertices
  validateVertices(model, report, stats.vertices);

  if (opts.checkDuplicateVertices) {
    validateDuplicateVertices(model, report, stats.vertices);
  }

  validateEdges(model, report, opts, stats.edges);
  validateHalfEdges(model, report, stats.halfEdges);
  validateLoops(model, report, opts, stats.loops);
  validateFaces(model, report, stats.faces);

  if (opts.checkSlivers) {
    validateSliverFaces(model, report, opts, stats.faces);
  }

  validateShells(model, report, stats.shells);
  validateBodies(model, report, stats.bodies);

  if (opts.checkManifold) {
    validateManifold(model, report, opts, stats);
  }

  return report;
}

function validateVertices(model: TopoModel, report: ValidationReport, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = asVertexId(i);
    if (model.isVertexDeleted(id)) continue;

    const pos = model.getVertexPosition(id);

    if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1]) || !Number.isFinite(pos[2])) {
      addIssue(
        report,
        `invalidIndex`,
        `error`,
        `Vertex ${i} has non-finite coordinates: [${pos[0]}, ${pos[1]}, ${pos[2]}]`,
        { type: `vertex`, id: i }
      );
    }
  }
}

function validateEdges(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const id = asEdgeId(i);
    if (model.isEdgeDeleted(id)) continue;

    const vStart = model.getEdgeStartVertex(id);
    const vEnd = model.getEdgeEndVertex(id);

    if (isNullId(vStart)) {
      addIssue(report, `nullReference`, `error`, `Edge ${i} has null start vertex`, {
        type: `edge`,
        id: i,
      });
    } else if (model.isVertexDeleted(vStart)) {
      addIssue(
        report,
        `deletedReference`,
        `error`,
        `Edge ${i} references deleted start vertex ${vStart}`,
        { type: `edge`, id: i },
        [{ type: `vertex`, id: vStart }]
      );
    }

    if (isNullId(vEnd)) {
      addIssue(report, `nullReference`, `error`, `Edge ${i} has null end vertex`, {
        type: `edge`,
        id: i,
      });
    } else if (model.isVertexDeleted(vEnd)) {
      addIssue(
        report,
        `deletedReference`,
        `error`,
        `Edge ${i} references deleted end vertex ${vEnd}`,
        { type: `edge`, id: i },
        [{ type: `vertex`, id: vEnd }]
      );
    }

    if (opts.checkDegenerate && !isNullId(vStart) && !isNullId(vEnd)) {
      const p0 = model.getVertexPosition(vStart);
      const p1 = model.getVertexPosition(vEnd);
      const len = length3(sub3(p1, p0));

      if (isZero(len, model.ctx)) {
        addIssue(
          report,
          `zeroLengthEdge`,
          `warning`,
          `Edge ${i} has zero length (vertices ${vStart} and ${vEnd} are coincident)`,
          { type: `edge`, id: i },
          [
            { type: `vertex`, id: vStart },
            { type: `vertex`, id: vEnd },
          ]
        );
      } else {
        const shortEdgeThreshold = model.ctx.tol.length * opts.shortEdgeMultiplier;
        if (len < shortEdgeThreshold && len > model.ctx.tol.length) {
          addIssue(
            report,
            `shortEdge`,
            `warning`,
            `Edge ${i} is very short (length ${len.toExponential(3)}, threshold ${shortEdgeThreshold.toExponential(3)})`,
            { type: `edge`, id: i },
            [
              { type: `vertex`, id: vStart },
              { type: `vertex`, id: vEnd },
            ]
          );
        }
      }
    }
  }
}

function validateHalfEdges(model: TopoModel, report: ValidationReport, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = asHalfEdgeId(i);

    const edge = model.getHalfEdgeEdge(id);
    const loop = model.getHalfEdgeLoop(id);
    const next = model.getHalfEdgeNext(id);
    const prev = model.getHalfEdgePrev(id);
    const twin = model.getHalfEdgeTwin(id);

    if (isNullId(edge)) {
      addIssue(report, `nullReference`, `error`, `Half-edge ${i} has null edge reference`, {
        type: `halfEdge`,
        id: i,
      });
    }

    if (isNullId(loop)) {
      addIssue(report, `nullReference`, `warning`, `Half-edge ${i} has null loop reference`, {
        type: `halfEdge`,
        id: i,
      });
    }

    if (!isNullId(next)) {
      const nextPrev = model.getHalfEdgePrev(next);
      if (nextPrev !== i) {
        addIssue(
          report,
          `brokenLoopCycle`,
          `error`,
          `Half-edge ${i} -> next ${next} -> prev ${nextPrev} != ${i}`,
          { type: `halfEdge`, id: i },
          [{ type: `halfEdge`, id: next }]
        );
      }
    }

    if (!isNullId(prev)) {
      const prevNext = model.getHalfEdgeNext(prev);
      if (prevNext !== i) {
        addIssue(
          report,
          `brokenLoopCycle`,
          `error`,
          `Half-edge ${i} -> prev ${prev} -> next ${prevNext} != ${i}`,
          { type: `halfEdge`, id: i },
          [{ type: `halfEdge`, id: prev }]
        );
      }
    }

    if (!isNullId(twin)) {
      const twinTwin = model.getHalfEdgeTwin(twin);
      if (twinTwin !== i) {
        addIssue(
          report,
          `twinMismatch`,
          `error`,
          `Half-edge ${i} -> twin ${twin} -> twin ${twinTwin} != ${i}`,
          { type: `halfEdge`, id: i },
          [{ type: `halfEdge`, id: twin }]
        );
      }

      const twinEdge = model.getHalfEdgeEdge(twin);
      if (twinEdge !== edge) {
        addIssue(
          report,
          `halfEdgePairMismatch`,
          `error`,
          `Half-edge ${i} (edge ${edge}) and twin ${twin} (edge ${twinEdge}) don't share the same edge`,
          { type: `halfEdge`, id: i },
          [{ type: `halfEdge`, id: twin }]
        );
      }

      const dir = model.getHalfEdgeDirection(id);
      const twinDir = model.getHalfEdgeDirection(twin);
      if (dir === twinDir) {
        addIssue(
          report,
          `twinDirectionMismatch`,
          `error`,
          `Half-edge ${i} and twin ${twin} have the same direction`,
          { type: `halfEdge`, id: i },
          [{ type: `halfEdge`, id: twin }]
        );
      }
    }

    if (!isNullId(prev) && !isNullId(edge)) {
      const prevEnd = model.getHalfEdgeEndVertex(prev);
      const thisStart = model.getHalfEdgeStartVertex(id);

      if (prevEnd !== thisStart) {
        addIssue(
          report,
          `vertexMismatch`,
          `error`,
          `Half-edge ${i} start vertex ${thisStart} doesn't match prev half-edge ${prev} end vertex ${prevEnd}`,
          { type: `halfEdge`, id: i },
          [{ type: `halfEdge`, id: prev }]
        );
      }
    }
  }
}

function validateLoops(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const id = asLoopId(i);

    const face = model.getLoopFace(id);
    const firstHe = model.getLoopFirstHalfEdge(id);
    const heCount = model.getLoopHalfEdgeCount(id);

    if (isNullId(face)) {
      addIssue(report, `nullReference`, `warning`, `Loop ${i} has null face reference`, {
        type: `loop`,
        id: i,
      });
    } else {
      const faceLoops = model.getFaceLoops(face);
      if (!faceLoops.includes(id)) {
        addIssue(
          report,
          `loopFaceMismatch`,
          `error`,
          `Loop ${i} claims face ${face}, but face doesn't list this loop`,
          { type: `loop`, id: i },
          [{ type: `face`, id: face }]
        );
      }
    }

    if (isNullId(firstHe)) {
      addIssue(report, `nullReference`, `error`, `Loop ${i} has null first half-edge`, {
        type: `loop`,
        id: i,
      });
      continue;
    }

    let actualCount = 0;
    let current = firstHe;
    const visited = new Set<number>();

    while (actualCount < opts.maxLoopIterations) {
      if (isNullId(current)) {
        addIssue(
          report,
          `loopNotClosed`,
          `error`,
          `Loop ${i} is not closed (reached null half-edge after ${actualCount} steps)`,
          { type: `loop`, id: i }
        );
        break;
      }

      if (visited.has(current)) {
        if (current === firstHe) break;
        else {
          addIssue(
            report,
            `brokenLoopCycle`,
            `error`,
            `Loop ${i} has a cycle that doesn't return to start (hit ${current} twice)`,
            { type: `loop`, id: i },
            [{ type: `halfEdge`, id: current }]
          );
          break;
        }
      }

      visited.add(current);
      actualCount++;

      const heLoop = model.getHalfEdgeLoop(asHalfEdgeId(current));
      if (heLoop !== i) {
        addIssue(
          report,
          `loopFaceMismatch`,
          `error`,
          `Half-edge ${current} in loop ${i} claims to belong to loop ${heLoop}`,
          { type: `loop`, id: i },
          [{ type: `halfEdge`, id: current }]
        );
      }

      current = model.getHalfEdgeNext(asHalfEdgeId(current));
    }

    if (actualCount >= opts.maxLoopIterations) {
      addIssue(
        report,
        `brokenLoopCycle`,
        `error`,
        `Loop ${i} traversal exceeded max iterations (${opts.maxLoopIterations}) - likely infinite loop`,
        { type: `loop`, id: i }
      );
    } else if (actualCount !== heCount && visited.has(firstHe)) {
      addIssue(
        report,
        `halfEdgePairMismatch`,
        `warning`,
        `Loop ${i} claims ${heCount} half-edges but traversal found ${actualCount}`,
        { type: `loop`, id: i }
      );
    }
  }
}

function validateFaces(model: TopoModel, report: ValidationReport, count: number): void {
  const stats = model.getStats();

  for (let i = 0; i < count; i++) {
    const id = asFaceId(i);
    if (model.isFaceDeleted(id)) continue;

    // Check surface reference
    const surfaceIndex = model.getFaceSurfaceIndex(id);
    if (surfaceIndex >= stats.surfaces || surfaceIndex < 0) {
      addIssue(
        report,
        `surfaceMissing`,
        `error`,
        `Face ${i} references invalid surface index ${surfaceIndex}`,
        { type: `face`, id: i }
      );
    }

    const shell = model.getFaceShell(id);
    const loops = model.getFaceLoops(id);

    if (isNullId(shell)) {
      addIssue(report, `nullReference`, `warning`, `Face ${i} has null shell reference`, {
        type: `face`,
        id: i,
      });
    } else {
      const shellFaces = model.getShellFaces(shell);
      if (!shellFaces.includes(id)) {
        addIssue(
          report,
          `faceShellMismatch`,
          `error`,
          `Face ${i} claims shell ${shell}, but shell doesn't list this face`,
          { type: `face`, id: i },
          [{ type: `shell`, id: shell }]
        );
      }
    }

    if (loops.length === 0) {
      addIssue(report, `nullReference`, `error`, `Face ${i} has no loops`, { type: `face`, id: i });
    } else {
      for (const loopId of loops) {
        const loopFace = model.getLoopFace(loopId);
        if (loopFace !== i) {
          addIssue(
            report,
            `loopFaceMismatch`,
            `error`,
            `Face ${i} lists loop ${loopId}, but loop claims face ${loopFace}`,
            { type: `face`, id: i },
            [{ type: `loop`, id: loopId }]
          );
        }
      }
    }
  }
}

function validateShells(model: TopoModel, report: ValidationReport, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = asShellId(i);

    const body = model.getShellBody(id);
    const faces = model.getShellFaces(id);

    if (isNullId(body)) {
      addIssue(report, `nullReference`, `warning`, `Shell ${i} has null body reference`, {
        type: `shell`,
        id: i,
      });
    } else {
      const bodyShells = model.getBodyShells(body);
      if (!bodyShells.includes(id)) {
        addIssue(
          report,
          `shellBodyMismatch`,
          `error`,
          `Shell ${i} claims body ${body}, but body doesn't list this shell`,
          { type: `shell`, id: i },
          [{ type: `body`, id: body }]
        );
      }
    }

    if (faces.length === 0) {
      addIssue(report, `nullReference`, `warning`, `Shell ${i} has no faces`, {
        type: `shell`,
        id: i,
      });
    } else {
      for (const faceId of faces) {
        const faceShell = model.getFaceShell(faceId);
        if (faceShell !== i) {
          addIssue(
            report,
            `faceShellMismatch`,
            `error`,
            `Shell ${i} lists face ${faceId}, but face claims shell ${faceShell}`,
            { type: `shell`, id: i },
            [{ type: `face`, id: faceId }]
          );
        }
      }
    }
  }
}

function validateBodies(model: TopoModel, report: ValidationReport, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = asBodyId(i);
    if (model.isBodyDeleted(id)) continue;

    const shells = model.getBodyShells(id);

    if (shells.length === 0) {
      addIssue(report, `nullReference`, `warning`, `Body ${i} has no shells`, {
        type: `body`,
        id: i,
      });
    } else {
      for (const shellId of shells) {
        const shellBody = model.getShellBody(shellId);
        if (shellBody !== i) {
          addIssue(
            report,
            `shellBodyMismatch`,
            `error`,
            `Body ${i} lists shell ${shellId}, but shell claims body ${shellBody}`,
            { type: `body`, id: i },
            [{ type: `shell`, id: shellId }]
          );
        }
      }
    }
  }
}

function validateManifold(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>,
  stats: { halfEdges: number; shells: number; faces: number; loops: number }
): void {
  const edgeHalfEdgeCounts = new Map<number, number>();

  for (let i = 0; i < stats.halfEdges; i++) {
    const id = asHalfEdgeId(i);
    const edge = model.getHalfEdgeEdge(id);
    if (!isNullId(edge)) {
      edgeHalfEdgeCounts.set(edge, (edgeHalfEdgeCounts.get(edge) ?? 0) + 1);
    }
  }

  for (const [edgeId, count] of edgeHalfEdgeCounts) {
    if (count < 2 && opts.checkBoundary) {
      addIssue(
        report,
        `boundaryEdge`,
        `info`,
        `Edge ${edgeId} is a boundary edge (only ${count} half-edge(s))`,
        { type: `edge`, id: edgeId }
      );
    } else if (count > 2) {
      addIssue(
        report,
        `nonManifoldEdge`,
        `error`,
        `Edge ${edgeId} is non-manifold (${count} half-edges, expected 2)`,
        { type: `edge`, id: edgeId }
      );
    }
  }

  for (let i = 0; i < stats.shells; i++) {
    const id = asShellId(i);

    if (model.isShellClosed(id)) {
      const shellEdges = new Map<number, number>();
      const faces = model.getShellFaces(id);

      for (const faceId of faces) {
        const loops = model.getFaceLoops(faceId);

        for (const loopId of loops) {
          const firstHe = model.getLoopFirstHalfEdge(loopId);
          if (isNullId(firstHe)) continue;

          let current = firstHe;
          let iterations = 0;

          do {
            const edge = model.getHalfEdgeEdge(current);
            if (!isNullId(edge)) {
              shellEdges.set(edge, (shellEdges.get(edge) ?? 0) + 1);
            }
            current = model.getHalfEdgeNext(current);
            iterations++;
          } while (
            current !== firstHe &&
            !isNullId(current) &&
            iterations < opts.maxLoopIterations
          );
        }
      }

      for (const [edgeId, count] of shellEdges) {
        if (count !== 2) {
          addIssue(
            report,
            count < 2 ? `boundaryEdge` : `nonManifoldEdge`,
            `error`,
            `Closed shell ${i} has edge ${edgeId} with ${count} half-edge(s) (expected 2)`,
            { type: `shell`, id: i },
            [{ type: `edge`, id: edgeId }]
          );
        }
      }
    }
  }
}

function validateDuplicateVertices(
  model: TopoModel,
  report: ValidationReport,
  count: number
): void {
  const tol = model.ctx.tol.length;

  const liveVertices: Array<{ id: number; x: number; y: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    const id = asVertexId(i);
    if (model.isVertexDeleted(id)) continue;
    const pos = model.getVertexPosition(id);
    liveVertices.push({ id: i, x: pos[0], y: pos[1], z: pos[2] });
  }

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
          `duplicateVertex`,
          `warning`,
          `Vertices ${a.id} and ${b.id} are nearly coincident (distance ${Math.sqrt(distSq).toExponential(3)})`,
          { type: `vertex`, id: a.id },
          [{ type: `vertex`, id: b.id }]
        );
      }
    }
  }
}

function validateSliverFaces(
  model: TopoModel,
  report: ValidationReport,
  opts: Required<ValidationOptions>,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const faceId = asFaceId(i);
    if (model.isFaceDeleted(faceId)) continue;

    const loops = model.getFaceLoops(faceId);
    if (loops.length === 0) continue;

    const outerLoop = loops[0];
    const firstHe = model.getLoopFirstHalfEdge(outerLoop);
    if (isNullId(firstHe)) continue;

    const vertices: Array<{ x: number; y: number; z: number }> = [];
    let he = firstHe;
    let iterations = 0;

    do {
      if (iterations++ > opts.maxLoopIterations) break;

      const vertex = model.getHalfEdgeStartVertex(he);
      const pos = model.getVertexPosition(vertex);
      vertices.push({ x: pos[0], y: pos[1], z: pos[2] });
      he = model.getHalfEdgeNext(he);
    } while (he !== firstHe && !isNullId(he));

    if (vertices.length < 3) continue;

    const { area, perimeter } = computePolygonAreaAndPerimeter(vertices);

    if (area < model.ctx.tol.length * model.ctx.tol.length) {
      addIssue(
        report,
        `zeroAreaFace`,
        `warning`,
        `Face ${i} has near-zero area (${area.toExponential(3)})`,
        { type: `face`, id: i }
      );
      continue;
    }

    if (perimeter > 0) {
      const isoperimetricRatio = (4 * Math.PI * area) / (perimeter * perimeter);

      if (isoperimetricRatio < opts.sliverAspectRatioThreshold) {
        addIssue(
          report,
          `sliverFace`,
          `warning`,
          `Face ${i} is a sliver face (isoperimetric ratio ${isoperimetricRatio.toFixed(4)}, threshold ${opts.sliverAspectRatioThreshold})`,
          { type: `face`, id: i }
        );
      }
    }
  }
}

function computePolygonAreaAndPerimeter(vertices: Array<{ x: number; y: number; z: number }>): {
  area: number;
  perimeter: number;
} {
  const n = vertices.length;
  if (n < 3) return { area: 0, perimeter: 0 };

  let cx = 0,
    cy = 0,
    cz = 0;
  for (const v of vertices) {
    cx += v.x;
    cy += v.y;
    cz += v.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;

  let nx = 0,
    ny = 0,
    nz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vi = vertices[i];
    const vj = vertices[j];

    nx += (vi.y - cy) * (vj.z - cz) - (vi.z - cz) * (vj.y - cy);
    ny += (vi.z - cz) * (vj.x - cx) - (vi.x - cx) * (vj.z - cz);
    nz += (vi.x - cx) * (vj.y - cy) - (vi.y - cy) * (vj.x - cx);
  }

  const area = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);

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
 */
export function isValidModel(model: TopoModel): boolean {
  const report = validateModel(model, {
    checkDegenerate: false,
    checkBoundary: false,
    checkSlivers: false,
  });
  return report.isValid;
}
