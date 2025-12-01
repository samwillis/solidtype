/**
 * 2D Constraint Solver
 * 
 * This module implements a numeric constraint solver for 2D sketches using
 * the Levenberg-Marquardt algorithm (a hybrid of Gauss-Newton and gradient descent).
 * 
 * Algorithm overview:
 * 1. Build a system of equations from constraints (residuals)
 * 2. Compute Jacobian matrix via finite differences
 * 3. Iteratively update positions to minimize sum of squared residuals
 * 4. Use damping (lambda) to ensure convergence
 * 
 * Design influences:
 * - Siemens D-Cubed 2D DCM constraint system
 * - Standard Levenberg-Marquardt implementations
 */

import type { Vec2 } from '../num/vec2.js';
import { sub2, dot2, length2, normalize2, cross2 } from '../num/vec2.js';
import type {
  Sketch,
  SketchPointId,
  SketchPoint,
  SolveResult,
  SolveOptions,
  SolveStatus,
} from './types.js';
import {
  getSketchPoint,
  getSketchEntity,
  getAllSketchPoints,
  DEFAULT_SOLVE_OPTIONS,
} from './types.js';
import type { Constraint } from './constraints.js';
import { getConstraintResidualCount } from './constraints.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Internal representation of the solver state
 */
interface SolverState {
  /** Sketch being solved */
  sketch: Sketch;
  /** Constraints to satisfy */
  constraints: Constraint[];
  /** Current state vector [x0, y0, x1, y1, ...] for non-fixed points */
  x: number[];
  /** Mapping from point ID to index in state vector */
  pointIndices: Map<SketchPointId, number>;
  /** Number of equations (total residual count) */
  numEquations: number;
  /** Number of variables (2 * number of free points) */
  numVariables: number;
  /** Solve options */
  options: Required<SolveOptions>;
}

// ============================================================================
// Main Solver Function
// ============================================================================

/**
 * Solve a sketch's constraints
 * 
 * Uses Levenberg-Marquardt to find positions that satisfy all constraints.
 * The current point positions are used as the initial guess.
 * 
 * @param sketch The sketch to solve (will be modified in place)
 * @param constraints The constraints to satisfy
 * @param options Optional solver settings
 * @returns Solve result with status and statistics
 */
export function solveSketch(
  sketch: Sketch,
  constraints: Constraint[],
  options?: SolveOptions
): SolveResult {
  // Merge options with defaults
  const opts: Required<SolveOptions> = {
    maxIterations: options?.maxIterations ?? DEFAULT_SOLVE_OPTIONS.maxIterations,
    tolerance: options?.tolerance ?? DEFAULT_SOLVE_OPTIONS.tolerance,
    lambda: options?.lambda ?? DEFAULT_SOLVE_OPTIONS.lambda,
    drivenWeight: options?.drivenWeight ?? DEFAULT_SOLVE_OPTIONS.drivenWeight,
    drivenPoints: options?.drivenPoints ?? new Map(),
    verbose: options?.verbose ?? false,
  };
  
  // Filter out inactive constraints
  const activeConstraints = constraints.filter(c => c.active !== false);
  
  // Build solver state
  const state = buildSolverState(sketch, activeConstraints, opts);
  
  // Check for under/over-constrained system
  const remainingDOF = state.numVariables - state.numEquations;
  
  if (state.numVariables === 0) {
    // All points are fixed, nothing to solve
    return {
      status: 'success',
      iterations: 0,
      residual: computeTotalResidual(state),
      satisfied: true,
      message: 'All points are fixed',
      remainingDOF: 0,
    };
  }
  
  if (state.numEquations === 0) {
    // No constraints
    return {
      status: 'under_constrained',
      iterations: 0,
      residual: 0,
      satisfied: true,
      message: 'No constraints to solve',
      remainingDOF: state.numVariables,
    };
  }
  
  // Run Levenberg-Marquardt
  const result = levenbergMarquardt(state);
  
  // Update sketch with final positions
  applyStateToSketch(state);
  
  return {
    ...result,
    remainingDOF,
  };
}

// ============================================================================
// Solver State Management
// ============================================================================

/**
 * Build the initial solver state from a sketch
 */
function buildSolverState(
  sketch: Sketch,
  constraints: Constraint[],
  options: Required<SolveOptions>
): SolverState {
  // Build point index map and initial state vector
  const pointIndices = new Map<SketchPointId, number>();
  const x: number[] = [];
  
  for (const point of sketch.points.values()) {
    if (!point.fixed) {
      pointIndices.set(point.id, x.length);
      x.push(point.x, point.y);
    }
  }
  
  // Count total equations
  let numEquations = 0;
  for (const constraint of constraints) {
    numEquations += getConstraintResidualCount(constraint);
  }
  
  // Add driven point constraints (2 equations each)
  numEquations += options.drivenPoints.size * 2;
  
  return {
    sketch,
    constraints,
    x,
    pointIndices,
    numEquations,
    numVariables: x.length,
    options,
  };
}

/**
 * Apply the state vector back to the sketch
 */
function applyStateToSketch(state: SolverState): void {
  for (const [pointId, idx] of state.pointIndices) {
    const point = getSketchPoint(state.sketch, pointId);
    if (point) {
      point.x = state.x[idx];
      point.y = state.x[idx + 1];
    }
  }
}

// ============================================================================
// Levenberg-Marquardt Algorithm
// ============================================================================

/**
 * Levenberg-Marquardt optimization
 */
function levenbergMarquardt(state: SolverState): SolveResult {
  const { options } = state;
  let lambda = options.lambda;
  let iterations = 0;
  
  // Compute initial residual
  let residuals = computeResiduals(state);
  let totalResidual = sumSquared(residuals);
  
  if (options.verbose) {
    console.log(`Initial residual: ${totalResidual}`);
  }
  
  // Check if already satisfied
  if (totalResidual < options.tolerance) {
    return {
      status: 'success',
      iterations: 0,
      residual: totalResidual,
      satisfied: true,
      message: 'Already satisfied',
    };
  }
  
  while (iterations < options.maxIterations) {
    iterations++;
    
    // Compute Jacobian
    const J = computeJacobian(state);
    
    // Compute J^T * J and J^T * r
    const JtJ = matMulTranspose(J, J);
    const Jtr = matVecMulTranspose(J, residuals);
    
    // Add damping: (J^T * J + lambda * I)
    for (let i = 0; i < state.numVariables; i++) {
      JtJ[i][i] += lambda;
    }
    
    // Solve (J^T * J + lambda * I) * delta = -J^T * r
    const delta = solveLinearSystem(JtJ, Jtr.map(v => -v));
    
    if (delta === null) {
      // Singular matrix
      return {
        status: 'singular',
        iterations,
        residual: totalResidual,
        satisfied: false,
        message: 'Jacobian is singular',
      };
    }
    
    // Try the step
    const newX = state.x.map((v, i) => v + delta[i]);
    const oldX = [...state.x];
    state.x = newX;
    
    const newResiduals = computeResiduals(state);
    const newTotalResidual = sumSquared(newResiduals);
    
    if (options.verbose) {
      console.log(`Iteration ${iterations}: residual = ${newTotalResidual}, lambda = ${lambda}`);
    }
    
    if (newTotalResidual < totalResidual) {
      // Step accepted, decrease lambda (more Gauss-Newton)
      lambda = Math.max(lambda / 10, 1e-10);
      residuals = newResiduals;
      totalResidual = newTotalResidual;
      
      // Check convergence
      if (totalResidual < options.tolerance) {
        return {
          status: 'success',
          iterations,
          residual: totalResidual,
          satisfied: true,
          message: 'Converged',
        };
      }
      
      // Check if step is too small
      const stepSize = Math.sqrt(sumSquared(delta));
      if (stepSize < 1e-12) {
        return {
          status: 'converged',
          iterations,
          residual: totalResidual,
          satisfied: totalResidual < options.tolerance * 10,
          message: 'Step size too small',
        };
      }
    } else {
      // Step rejected, increase lambda (more gradient descent)
      state.x = oldX;
      lambda = Math.min(lambda * 10, 1e10);
      
      // If lambda is too large, we're stuck
      if (lambda > 1e9) {
        return {
          status: 'not_converged',
          iterations,
          residual: totalResidual,
          satisfied: false,
          message: 'Cannot find descent direction',
        };
      }
    }
  }
  
  return {
    status: 'not_converged',
    iterations,
    residual: totalResidual,
    satisfied: false,
    message: 'Maximum iterations reached',
  };
}

// ============================================================================
// Residual Computation
// ============================================================================

/**
 * Compute all residuals for the current state
 */
function computeResiduals(state: SolverState): number[] {
  const residuals: number[] = [];
  
  // Compute constraint residuals
  for (const constraint of state.constraints) {
    const cr = computeConstraintResiduals(state, constraint);
    residuals.push(...cr);
  }
  
  // Compute driven point residuals
  for (const [pointId, targetPos] of state.options.drivenPoints) {
    const idx = state.pointIndices.get(pointId);
    if (idx !== undefined) {
      const weight = Math.sqrt(state.options.drivenWeight);
      residuals.push(weight * (state.x[idx] - targetPos[0]));
      residuals.push(weight * (state.x[idx + 1] - targetPos[1]));
    }
  }
  
  return residuals;
}

/**
 * Compute residuals for a single constraint
 */
function computeConstraintResiduals(state: SolverState, constraint: Constraint): number[] {
  const weight = Math.sqrt(constraint.weight ?? 1);
  
  switch (constraint.kind) {
    case 'coincident': {
      const p1 = getPointPosition(state, constraint.p1);
      const p2 = getPointPosition(state, constraint.p2);
      return [
        weight * (p1[0] - p2[0]),
        weight * (p1[1] - p2[1]),
      ];
    }
    
    case 'horizontal': {
      if ('line' in constraint) {
        const entity = getSketchEntity(state.sketch, constraint.line);
        if (entity && entity.kind === 'line') {
          const start = getPointPosition(state, entity.start);
          const end = getPointPosition(state, entity.end);
          return [weight * (start[1] - end[1])];
        }
      } else {
        const p1 = getPointPosition(state, constraint.p1);
        const p2 = getPointPosition(state, constraint.p2);
        return [weight * (p1[1] - p2[1])];
      }
      return [0];
    }
    
    case 'vertical': {
      if ('line' in constraint) {
        const entity = getSketchEntity(state.sketch, constraint.line);
        if (entity && entity.kind === 'line') {
          const start = getPointPosition(state, entity.start);
          const end = getPointPosition(state, entity.end);
          return [weight * (start[0] - end[0])];
        }
      } else {
        const p1 = getPointPosition(state, constraint.p1);
        const p2 = getPointPosition(state, constraint.p2);
        return [weight * (p1[0] - p2[0])];
      }
      return [0];
    }
    
    case 'parallel': {
      const e1 = getSketchEntity(state.sketch, constraint.line1);
      const e2 = getSketchEntity(state.sketch, constraint.line2);
      if (e1?.kind === 'line' && e2?.kind === 'line') {
        const dir1 = getLineDir(state, e1.start, e1.end);
        const dir2 = getLineDir(state, e2.start, e2.end);
        // Cross product should be zero for parallel lines
        return [weight * cross2(dir1, dir2)];
      }
      return [0];
    }
    
    case 'perpendicular': {
      const e1 = getSketchEntity(state.sketch, constraint.line1);
      const e2 = getSketchEntity(state.sketch, constraint.line2);
      if (e1?.kind === 'line' && e2?.kind === 'line') {
        const dir1 = getLineDir(state, e1.start, e1.end);
        const dir2 = getLineDir(state, e2.start, e2.end);
        // Dot product should be zero for perpendicular lines
        return [weight * dot2(dir1, dir2)];
      }
      return [0];
    }
    
    case 'equalLength': {
      const e1 = getSketchEntity(state.sketch, constraint.line1);
      const e2 = getSketchEntity(state.sketch, constraint.line2);
      if (e1?.kind === 'line' && e2?.kind === 'line') {
        const len1 = getLineLength(state, e1.start, e1.end);
        const len2 = getLineLength(state, e2.start, e2.end);
        return [weight * (len1 - len2)];
      }
      return [0];
    }
    
    case 'fixed': {
      const p = getPointPosition(state, constraint.point);
      return [
        weight * (p[0] - constraint.position[0]),
        weight * (p[1] - constraint.position[1]),
      ];
    }
    
    case 'distance': {
      const p1 = getPointPosition(state, constraint.p1);
      const p2 = getPointPosition(state, constraint.p2);
      const d = getLineLength(state, constraint.p1, constraint.p2);
      return [weight * (d - constraint.distance)];
    }
    
    case 'angle': {
      const e1 = getSketchEntity(state.sketch, constraint.line1);
      const e2 = getSketchEntity(state.sketch, constraint.line2);
      if (e1?.kind === 'line' && e2?.kind === 'line') {
        const dir1 = getLineDir(state, e1.start, e1.end);
        const dir2 = getLineDir(state, e2.start, e2.end);
        const actualAngle = Math.atan2(cross2(dir1, dir2), dot2(dir1, dir2));
        // Normalize angle difference to [-π, π]
        let diff = actualAngle - constraint.angle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return [weight * diff];
      }
      return [0];
    }
    
    case 'tangent': {
      const line = getSketchEntity(state.sketch, constraint.line);
      const arc = getSketchEntity(state.sketch, constraint.arc);
      if (line?.kind === 'line' && arc?.kind === 'arc') {
        // Get the connection point on the line
        const lineEndpoint = constraint.lineEndpoint === 'start' ? line.start : line.end;
        const arcEndpoint = constraint.arcEndpoint === 'start' ? arc.start : arc.end;
        
        // The line direction should be perpendicular to the radius at the connection
        const lineStart = getPointPosition(state, line.start);
        const lineEnd = getPointPosition(state, line.end);
        const center = getPointPosition(state, arc.center);
        const connectionPoint = getPointPosition(state, arcEndpoint);
        
        // Radius direction (from center to connection point)
        const radius = sub2(connectionPoint, center);
        // Line direction
        const lineDir = sub2(lineEnd, lineStart);
        
        // For tangency, dot(radius, lineDir) should be 0
        return [weight * dot2(normalize2(radius), normalize2(lineDir))];
      }
      return [0];
    }
    
    case 'pointOnLine': {
      const p = getPointPosition(state, constraint.point);
      const line = getSketchEntity(state.sketch, constraint.line);
      if (line?.kind === 'line') {
        const start = getPointPosition(state, line.start);
        const end = getPointPosition(state, line.end);
        // Signed distance from point to line
        const lineDir = sub2(end, start);
        const lineLen = length2(lineDir);
        if (lineLen < 1e-10) return [0];
        const toPoint = sub2(p, start);
        // Cross product gives signed area, divide by length for distance
        const dist = cross2(lineDir, toPoint) / lineLen;
        return [weight * dist];
      }
      return [0];
    }
    
    case 'pointOnArc': {
      const p = getPointPosition(state, constraint.point);
      const arc = getSketchEntity(state.sketch, constraint.arc);
      if (arc?.kind === 'arc') {
        const center = getPointPosition(state, arc.center);
        const arcStart = getPointPosition(state, arc.start);
        const radius = length2(sub2(arcStart, center));
        const distToCenter = length2(sub2(p, center));
        return [weight * (distToCenter - radius)];
      }
      return [0];
    }
    
    case 'equalRadius': {
      const a1 = getSketchEntity(state.sketch, constraint.arc1);
      const a2 = getSketchEntity(state.sketch, constraint.arc2);
      if (a1?.kind === 'arc' && a2?.kind === 'arc') {
        const center1 = getPointPosition(state, a1.center);
        const start1 = getPointPosition(state, a1.start);
        const center2 = getPointPosition(state, a2.center);
        const start2 = getPointPosition(state, a2.start);
        const r1 = length2(sub2(start1, center1));
        const r2 = length2(sub2(start2, center2));
        return [weight * (r1 - r2)];
      }
      return [0];
    }
    
    case 'concentric': {
      const a1 = getSketchEntity(state.sketch, constraint.arc1);
      const a2 = getSketchEntity(state.sketch, constraint.arc2);
      if (a1?.kind === 'arc' && a2?.kind === 'arc') {
        const c1 = getPointPosition(state, a1.center);
        const c2 = getPointPosition(state, a2.center);
        return [
          weight * (c1[0] - c2[0]),
          weight * (c1[1] - c2[1]),
        ];
      }
      return [0, 0];
    }
    
    case 'symmetric': {
      const p1 = getPointPosition(state, constraint.p1);
      const p2 = getPointPosition(state, constraint.p2);
      const line = getSketchEntity(state.sketch, constraint.symmetryLine);
      if (line?.kind === 'line') {
        const lineStart = getPointPosition(state, line.start);
        const lineEnd = getPointPosition(state, line.end);
        
        // Midpoint of p1-p2
        const mid: Vec2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        
        // Line direction
        const lineDir = sub2(lineEnd, lineStart);
        const lineLen = length2(lineDir);
        if (lineLen < 1e-10) return [0, 0];
        
        // Vector from p1 to p2
        const p1p2 = sub2(p2, p1);
        
        // 1. Midpoint should lie on the line (distance from midpoint to line = 0)
        const toMid = sub2(mid, lineStart);
        const midDist = cross2(lineDir, toMid) / lineLen;
        
        // 2. Line p1-p2 should be perpendicular to symmetry line
        const perpResidual = dot2(normalize2(lineDir), normalize2(p1p2));
        
        return [
          weight * midDist,
          weight * perpResidual,
        ];
      }
      return [0, 0];
    }
    
    case 'midpoint': {
      const p = getPointPosition(state, constraint.point);
      const line = getSketchEntity(state.sketch, constraint.line);
      if (line?.kind === 'line') {
        const start = getPointPosition(state, line.start);
        const end = getPointPosition(state, line.end);
        const expectedMid: Vec2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
        return [
          weight * (p[0] - expectedMid[0]),
          weight * (p[1] - expectedMid[1]),
        ];
      }
      return [0, 0];
    }
    
    case 'arcArcTangent': {
      const a1 = getSketchEntity(state.sketch, constraint.arc1);
      const a2 = getSketchEntity(state.sketch, constraint.arc2);
      if (a1?.kind === 'arc' && a2?.kind === 'arc') {
        const c1 = getPointPosition(state, a1.center);
        const s1 = getPointPosition(state, a1.start);
        const c2 = getPointPosition(state, a2.center);
        const s2 = getPointPosition(state, a2.start);
        
        const r1 = length2(sub2(s1, c1));
        const r2 = length2(sub2(s2, c2));
        const centerDist = length2(sub2(c2, c1));
        
        // For external tangency: centerDist = r1 + r2
        // For internal tangency: centerDist = |r1 - r2|
        const expectedDist = constraint.internal 
          ? Math.abs(r1 - r2) 
          : r1 + r2;
        
        return [weight * (centerDist - expectedDist)];
      }
      return [0];
    }
    
    case 'radiusDimension': {
      const arc = getSketchEntity(state.sketch, constraint.arc);
      if (arc?.kind === 'arc') {
        const center = getPointPosition(state, arc.center);
        const start = getPointPosition(state, arc.start);
        const actualRadius = length2(sub2(start, center));
        return [weight * (actualRadius - constraint.radius)];
      }
      return [0];
    }
    
    case 'pointToLineDistance': {
      const p = getPointPosition(state, constraint.point);
      const line = getSketchEntity(state.sketch, constraint.line);
      if (line?.kind === 'line') {
        const start = getPointPosition(state, line.start);
        const end = getPointPosition(state, line.end);
        const lineDir = sub2(end, start);
        const lineLen = length2(lineDir);
        if (lineLen < 1e-10) return [0];
        const toPoint = sub2(p, start);
        // Absolute distance from point to line
        const actualDist = Math.abs(cross2(lineDir, toPoint) / lineLen);
        return [weight * (actualDist - constraint.distance)];
      }
      return [0];
    }
    
    default:
      return [];
  }
}

/**
 * Compute total residual (sum of squares)
 */
function computeTotalResidual(state: SolverState): number {
  const residuals = computeResiduals(state);
  return sumSquared(residuals);
}

// ============================================================================
// Jacobian Computation
// ============================================================================

/**
 * Compute the Jacobian matrix using finite differences
 */
function computeJacobian(state: SolverState): number[][] {
  const eps = 1e-8;
  const baseResiduals = computeResiduals(state);
  const J: number[][] = [];
  
  for (let i = 0; i < baseResiduals.length; i++) {
    J.push(new Array(state.numVariables).fill(0));
  }
  
  for (let j = 0; j < state.numVariables; j++) {
    // Perturb variable j
    state.x[j] += eps;
    const perturbedResiduals = computeResiduals(state);
    state.x[j] -= eps;
    
    // Compute partial derivatives
    for (let i = 0; i < baseResiduals.length; i++) {
      J[i][j] = (perturbedResiduals[i] - baseResiduals[i]) / eps;
    }
  }
  
  return J;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get point position from state (or from sketch if fixed)
 */
function getPointPosition(state: SolverState, pointId: SketchPointId): Vec2 {
  const idx = state.pointIndices.get(pointId);
  if (idx !== undefined) {
    return [state.x[idx], state.x[idx + 1]];
  }
  // Fixed point - get from sketch
  const point = getSketchPoint(state.sketch, pointId);
  if (point) {
    return [point.x, point.y];
  }
  return [0, 0];
}

/**
 * Get normalized line direction
 */
function getLineDir(
  state: SolverState,
  startId: SketchPointId,
  endId: SketchPointId
): Vec2 {
  const start = getPointPosition(state, startId);
  const end = getPointPosition(state, endId);
  return normalize2(sub2(end, start));
}

/**
 * Get line length
 */
function getLineLength(
  state: SolverState,
  startId: SketchPointId,
  endId: SketchPointId
): number {
  const start = getPointPosition(state, startId);
  const end = getPointPosition(state, endId);
  return length2(sub2(end, start));
}

/**
 * Sum of squared values
 */
function sumSquared(values: number[]): number {
  let sum = 0;
  for (const v of values) {
    sum += v * v;
  }
  return sum;
}

// ============================================================================
// Linear Algebra
// ============================================================================

/**
 * Multiply A^T * B
 */
function matMulTranspose(A: number[][], B: number[][]): number[][] {
  const n = A[0].length; // columns of A (rows of A^T)
  const m = B[0].length; // columns of B
  const result: number[][] = [];
  
  for (let i = 0; i < n; i++) {
    result.push(new Array(m).fill(0));
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < A.length; k++) {
        sum += A[k][i] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  
  return result;
}

/**
 * Multiply A^T * v
 */
function matVecMulTranspose(A: number[][], v: number[]): number[] {
  const n = A[0].length;
  const result = new Array(n).fill(0);
  
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < A.length; k++) {
      sum += A[k][i] * v[k];
    }
    result[i] = sum;
  }
  
  return result;
}

/**
 * Solve Ax = b using LU decomposition with partial pivoting
 * Returns null if matrix is singular
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  
  // Create copies to avoid modifying originals
  const L = A.map(row => [...row]);
  const y = [...b];
  
  // Gaussian elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxVal = Math.abs(L[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(L[k][i]) > maxVal) {
        maxVal = Math.abs(L[k][i]);
        maxRow = k;
      }
    }
    
    // Check for singular matrix
    if (maxVal < 1e-14) {
      return null;
    }
    
    // Swap rows
    if (maxRow !== i) {
      [L[i], L[maxRow]] = [L[maxRow], L[i]];
      [y[i], y[maxRow]] = [y[maxRow], y[i]];
    }
    
    // Eliminate column
    for (let k = i + 1; k < n; k++) {
      const factor = L[k][i] / L[i][i];
      for (let j = i; j < n; j++) {
        L[k][j] -= factor * L[i][j];
      }
      y[k] -= factor * y[i];
    }
  }
  
  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < n; j++) {
      sum -= L[i][j] * x[j];
    }
    x[i] = sum / L[i][i];
  }
  
  return x;
}

// ============================================================================
// DOF Analysis
// ============================================================================

/**
 * Analyze degrees of freedom in a sketch
 * 
 * @param sketch The sketch to analyze
 * @param constraints The constraints
 * @returns DOF analysis result
 */
export function analyzeDOF(
  sketch: Sketch,
  constraints: Constraint[]
): {
  totalDOF: number;
  constrainedDOF: number;
  remainingDOF: number;
  isFullyConstrained: boolean;
  isOverConstrained: boolean;
} {
  // Count free point DOF (2 per point)
  let totalDOF = 0;
  for (const point of sketch.points.values()) {
    if (!point.fixed) {
      totalDOF += 2;
    }
  }
  
  // Count constraint equations
  let constrainedDOF = 0;
  for (const constraint of constraints) {
    if (constraint.active !== false) {
      constrainedDOF += getConstraintResidualCount(constraint);
    }
  }
  
  const remainingDOF = totalDOF - constrainedDOF;
  
  return {
    totalDOF,
    constrainedDOF,
    remainingDOF,
    isFullyConstrained: remainingDOF === 0,
    isOverConstrained: remainingDOF < 0,
  };
}
