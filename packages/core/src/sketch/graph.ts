/**
 * Constraint Graph & Partitioning
 * 
 * This module provides utilities for analyzing the constraint graph structure,
 * partitioning sketches into independent solvable components, and detecting
 * constraint conflicts.
 * 
 * Key concepts:
 * - Constraint graph: nodes are points, edges are constraints between them
 * - Connected components: groups of points connected by constraints
 * - DOF analysis: computing degrees of freedom for each component
 */

import type { Sketch, SketchPointId, SketchEntityId } from './types.js';
import { getSketchPoint, getSketchEntity, getAllSketchPoints } from './types.js';
import type { Constraint } from './constraints.js';
import { getConstraintPoints, getConstraintResidualCount } from './constraints.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A node in the constraint graph (represents a point)
 */
export interface GraphNode {
  pointId: SketchPointId;
  neighbors: Set<SketchPointId>;
  constraints: Set<Constraint>;
  fixed: boolean;
}

/**
 * Connected component of the constraint graph
 */
export interface GraphComponent {
  /** Points in this component */
  points: SketchPointId[];
  /** Constraints that only involve points in this component */
  constraints: Constraint[];
  /** Total DOF before constraints (2 per non-fixed point) */
  baseDOF: number;
  /** Number of constraint equations */
  constraintDOF: number;
  /** Remaining DOF (may be negative if over-constrained) */
  remainingDOF: number;
  /** Whether this component is under-constrained */
  isUnderConstrained: boolean;
  /** Whether this component is fully constrained */
  isFullyConstrained: boolean;
  /** Whether this component is over-constrained */
  isOverConstrained: boolean;
}

/**
 * Result of graph analysis
 */
export interface GraphAnalysis {
  /** All graph nodes (one per point) */
  nodes: Map<SketchPointId, GraphNode>;
  /** Connected components */
  components: GraphComponent[];
  /** Global DOF analysis */
  globalDOF: {
    total: number;
    constrained: number;
    remaining: number;
  };
  /** Detected conflicts (e.g., contradictory constraints) */
  conflicts: ConstraintConflict[];
}

/**
 * A detected constraint conflict
 */
export interface ConstraintConflict {
  /** Conflicting constraints */
  constraints: Constraint[];
  /** Human-readable description */
  message: string;
}

// ============================================================================
// Graph Building
// ============================================================================

/**
 * Build the constraint graph from a sketch and its constraints
 */
export function buildConstraintGraph(
  sketch: Sketch,
  constraints: Constraint[]
): Map<SketchPointId, GraphNode> {
  const nodes = new Map<SketchPointId, GraphNode>();
  
  // Initialize nodes for all points
  for (const [id, point] of sketch.points) {
    nodes.set(id, {
      pointId: id,
      neighbors: new Set(),
      constraints: new Set(),
      fixed: point.fixed,
    });
  }
  
  // Add edges based on constraints
  for (const constraint of constraints) {
    const pointIds = getConstraintPoints(constraint, sketch);
    
    // Add constraint to all involved nodes
    for (const pid of pointIds) {
      const node = nodes.get(pid);
      if (node) {
        node.constraints.add(constraint);
      }
    }
    
    // Create edges between all pairs of points
    for (let i = 0; i < pointIds.length; i++) {
      for (let j = i + 1; j < pointIds.length; j++) {
        const nodeA = nodes.get(pointIds[i]);
        const nodeB = nodes.get(pointIds[j]);
        if (nodeA && nodeB) {
          nodeA.neighbors.add(pointIds[j]);
          nodeB.neighbors.add(pointIds[i]);
        }
      }
    }
  }
  
  return nodes;
}

// ============================================================================
// Component Finding
// ============================================================================

/**
 * Find connected components in the constraint graph using BFS
 */
export function findConnectedComponents(
  nodes: Map<SketchPointId, GraphNode>
): SketchPointId[][] {
  const visited = new Set<SketchPointId>();
  const components: SketchPointId[][] = [];
  
  for (const [pointId, _] of nodes) {
    if (visited.has(pointId)) continue;
    
    // BFS to find all connected points
    const component: SketchPointId[] = [];
    const queue: SketchPointId[] = [pointId];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      
      visited.add(current);
      component.push(current);
      
      const node = nodes.get(current);
      if (node) {
        for (const neighbor of node.neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }
    
    if (component.length > 0) {
      components.push(component);
    }
  }
  
  return components;
}

/**
 * Get constraints that only involve points in a specific component
 */
export function getComponentConstraints(
  sketch: Sketch,
  component: SketchPointId[],
  allConstraints: Constraint[]
): Constraint[] {
  const pointSet = new Set(component);
  
  return allConstraints.filter(constraint => {
    const involvedPoints = getConstraintPoints(constraint, sketch);
    return involvedPoints.every(pid => pointSet.has(pid));
  });
}

// ============================================================================
// DOF Analysis
// ============================================================================

/**
 * Analyze DOF for a single component
 */
export function analyzeComponentDOF(
  sketch: Sketch,
  component: SketchPointId[],
  constraints: Constraint[]
): GraphComponent {
  // Count non-fixed points (each contributes 2 DOF)
  let baseDOF = 0;
  for (const pid of component) {
    const point = getSketchPoint(sketch, pid);
    if (point && !point.fixed) {
      baseDOF += 2;
    }
  }
  
  // Count constraint equations
  let constraintDOF = 0;
  for (const c of constraints) {
    constraintDOF += getConstraintResidualCount(c);
  }
  
  const remainingDOF = baseDOF - constraintDOF;
  
  return {
    points: component,
    constraints,
    baseDOF,
    constraintDOF,
    remainingDOF,
    isUnderConstrained: remainingDOF > 0,
    isFullyConstrained: remainingDOF === 0,
    isOverConstrained: remainingDOF < 0,
  };
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect basic constraint conflicts
 * 
 * This is a heuristic approach that catches common conflicts:
 * - Duplicate identical constraints
 * - Contradictory fixed constraints
 * - Obvious geometric conflicts
 */
export function detectConflicts(
  sketch: Sketch,
  constraints: Constraint[]
): ConstraintConflict[] {
  const conflicts: ConstraintConflict[] = [];
  
  // Group constraints by type and affected points
  const fixedConstraints: Constraint[] = [];
  const distanceConstraints = new Map<string, Constraint[]>();
  const angleConstraints = new Map<string, Constraint[]>();
  
  for (const c of constraints) {
    if (c.kind === 'fixed') {
      fixedConstraints.push(c);
    } else if (c.kind === 'distance') {
      const key = `${c.p1}-${c.p2}`;
      if (!distanceConstraints.has(key)) {
        distanceConstraints.set(key, []);
      }
      distanceConstraints.get(key)!.push(c);
    } else if (c.kind === 'angle') {
      const key = `${c.line1}-${c.line2}`;
      if (!angleConstraints.has(key)) {
        angleConstraints.set(key, []);
      }
      angleConstraints.get(key)!.push(c);
    }
  }
  
  // Check for conflicting fixed constraints on the same point
  const fixedByPoint = new Map<SketchPointId, Constraint[]>();
  for (const fc of fixedConstraints) {
    if (fc.kind === 'fixed') {
      const key = fc.point;
      if (!fixedByPoint.has(key)) {
        fixedByPoint.set(key, []);
      }
      fixedByPoint.get(key)!.push(fc);
    }
  }
  
  for (const [_, fixedList] of fixedByPoint) {
    if (fixedList.length > 1) {
      // Multiple fixed constraints on same point - check if they agree
      const first = fixedList[0];
      for (let i = 1; i < fixedList.length; i++) {
        const other = fixedList[i];
        if (
          first.kind === 'fixed' && other.kind === 'fixed' &&
          (first.position[0] !== other.position[0] || first.position[1] !== other.position[1])
        ) {
          conflicts.push({
            constraints: [first, other],
            message: `Conflicting fixed positions for point ${first.point}`,
          });
        }
      }
    }
  }
  
  // Check for conflicting distance constraints between the same points
  for (const [key, dList] of distanceConstraints) {
    if (dList.length > 1) {
      const first = dList[0];
      for (let i = 1; i < dList.length; i++) {
        const other = dList[i];
        if (
          first.kind === 'distance' && other.kind === 'distance' &&
          Math.abs(first.distance - other.distance) > 1e-6
        ) {
          conflicts.push({
            constraints: [first, other],
            message: `Conflicting distance constraints between points ${key}`,
          });
        }
      }
    }
  }
  
  // Check for conflicting angle constraints between the same lines
  for (const [key, aList] of angleConstraints) {
    if (aList.length > 1) {
      const first = aList[0];
      for (let i = 1; i < aList.length; i++) {
        const other = aList[i];
        if (
          first.kind === 'angle' && other.kind === 'angle' &&
          Math.abs(first.angle - other.angle) > 1e-6
        ) {
          conflicts.push({
            constraints: [first, other],
            message: `Conflicting angle constraints between lines ${key}`,
          });
        }
      }
    }
  }
  
  return conflicts;
}

// ============================================================================
// Main Analysis
// ============================================================================

/**
 * Perform full constraint graph analysis
 */
export function analyzeConstraintGraph(
  sketch: Sketch,
  constraints: Constraint[]
): GraphAnalysis {
  // Build the graph
  const nodes = buildConstraintGraph(sketch, constraints);
  
  // Find connected components
  const pointComponents = findConnectedComponents(nodes);
  
  // Analyze each component
  const components: GraphComponent[] = [];
  for (const pointIds of pointComponents) {
    const componentConstraints = getComponentConstraints(sketch, pointIds, constraints);
    const component = analyzeComponentDOF(sketch, pointIds, componentConstraints);
    components.push(component);
  }
  
  // Compute global DOF
  let totalDOF = 0;
  let constrainedDOF = 0;
  for (const comp of components) {
    totalDOF += comp.baseDOF;
    constrainedDOF += comp.constraintDOF;
  }
  
  // Detect conflicts
  const conflicts = detectConflicts(sketch, constraints);
  
  return {
    nodes,
    components,
    globalDOF: {
      total: totalDOF,
      constrained: constrainedDOF,
      remaining: totalDOF - constrainedDOF,
    },
    conflicts,
  };
}

/**
 * Partition a sketch into independent solvable subproblems
 * 
 * This enables solving each component separately for better performance
 * and allows partial solving when some components are over-constrained.
 */
export function partitionForSolving(
  sketch: Sketch,
  constraints: Constraint[]
): { sketch: Sketch; constraints: Constraint[] }[] {
  const analysis = analyzeConstraintGraph(sketch, constraints);
  const partitions: { sketch: Sketch; constraints: Constraint[] }[] = [];
  
  for (const component of analysis.components) {
    // Create a sub-sketch with only the points in this component
    const subSketch: Sketch = {
      ...sketch,
      points: new Map(),
      entities: new Map(),
    };
    
    // Copy relevant points
    const pointSet = new Set(component.points);
    for (const pid of component.points) {
      const point = getSketchPoint(sketch, pid);
      if (point) {
        subSketch.points.set(pid, { ...point });
      }
    }
    
    // Copy entities that use only points in this component
    for (const [entityId, entity] of sketch.entities) {
      let includeEntity = false;
      if (entity.kind === 'line') {
        includeEntity = pointSet.has(entity.start) && pointSet.has(entity.end);
      } else if (entity.kind === 'arc') {
        includeEntity = 
          pointSet.has(entity.start) && 
          pointSet.has(entity.center) && 
          (entity.end === undefined || pointSet.has(entity.end));
      }
      if (includeEntity) {
        subSketch.entities.set(entityId, { ...entity });
      }
    }
    
    partitions.push({
      sketch: subSketch,
      constraints: component.constraints,
    });
  }
  
  return partitions;
}

/**
 * Check if a sketch can be solved (has enough constraints)
 */
export function canSolve(
  sketch: Sketch,
  constraints: Constraint[]
): { solvable: boolean; message: string; analysis: GraphAnalysis } {
  const analysis = analyzeConstraintGraph(sketch, constraints);
  
  if (analysis.conflicts.length > 0) {
    return {
      solvable: false,
      message: `Found ${analysis.conflicts.length} constraint conflict(s)`,
      analysis,
    };
  }
  
  const overConstrained = analysis.components.filter(c => c.isOverConstrained);
  if (overConstrained.length > 0) {
    return {
      solvable: false,
      message: `${overConstrained.length} component(s) are over-constrained`,
      analysis,
    };
  }
  
  return {
    solvable: true,
    message: analysis.globalDOF.remaining > 0 
      ? `Under-constrained by ${analysis.globalDOF.remaining} DOF` 
      : 'Fully constrained',
    analysis,
  };
}
