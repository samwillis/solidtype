/**
 * Sketch solver benchmarks
 * 
 * Benchmarks for the 2D constraint solver.
 * Measures the performance of solving various constraint configurations.
 */

import {
  createDatumPlaneFromNormal,
  createSketch,
  addPoint,
  addLine,
  solveSketch,
  horizontalLine,
  verticalLine,
  distance,
  equalLength,
  vec3,
  type Sketch,
  type Constraint,
  type SketchEntityId,
  type SketchPointId,
} from '../src/index.js';
import { runBenchmark, printResult, summarizeResults, type BenchmarkResult } from './utils.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a simple rectangle sketch with basic constraints
 */
function createRectangleSketch(): { sketch: Sketch; constraints: Constraint[] } {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  const sketch = createSketch(plane);
  
  // Add 4 corner points
  const p0 = addPoint(sketch, 0, 0, { fixed: true });
  const p1 = addPoint(sketch, 10, 0);
  const p2 = addPoint(sketch, 10, 8);
  const p3 = addPoint(sketch, 0, 8);
  
  // Add 4 lines
  const l0 = addLine(sketch, p0, p1);
  const l1 = addLine(sketch, p1, p2);
  const l2 = addLine(sketch, p2, p3);
  const l3 = addLine(sketch, p3, p0);
  
  // Create constraints (factory functions auto-allocate IDs)
  const constraints: Constraint[] = [
    horizontalLine(l0),
    verticalLine(l1),
    horizontalLine(l2),
    verticalLine(l3),
    distance(p0, p1, 10),
    distance(p1, p2, 8),
  ];
  
  return { sketch, constraints };
}

/**
 * Create a triangular sketch with constraints
 */
function createTriangleSketch(): { sketch: Sketch; constraints: Constraint[] } {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  const sketch = createSketch(plane);
  
  // Add 3 corner points
  const p0 = addPoint(sketch, 0, 0, { fixed: true });
  const p1 = addPoint(sketch, 10, 0);
  const p2 = addPoint(sketch, 5, 8);
  
  // Add 3 lines
  const l0 = addLine(sketch, p0, p1);
  const l1 = addLine(sketch, p1, p2);
  const l2 = addLine(sketch, p2, p0);
  
  // Create constraints
  const constraints: Constraint[] = [
    horizontalLine(l0),
    equalLength(l1, l2),
    distance(p0, p1, 10),
  ];
  
  return { sketch, constraints };
}

/**
 * Create a sketch with many constraints
 */
function createComplexSketch(
  numPoints: number
): { sketch: Sketch; constraints: Constraint[] } {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  const sketch = createSketch(plane);
  
  // Create a polygon with numPoints vertices
  const points: SketchPointId[] = [];
  const radius = 10;
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const x = radius * Math.cos(angle) + (Math.random() - 0.5);
    const y = radius * Math.sin(angle) + (Math.random() - 0.5);
    points.push(addPoint(sketch, x, y, { fixed: i === 0 }));
  }
  
  // Create lines between adjacent points
  const lines: SketchEntityId[] = [];
  for (let i = 0; i < numPoints; i++) {
    const j = (i + 1) % numPoints;
    lines.push(addLine(sketch, points[i], points[j]));
  }
  
  // Create constraints
  const constraints: Constraint[] = [];
  
  // Equal length for all edges
  for (let i = 1; i < numPoints; i++) {
    constraints.push(equalLength(lines[0], lines[i]));
  }
  
  // Fix the first line to be horizontal
  constraints.push(horizontalLine(lines[0]));
  
  // Add distance constraint
  constraints.push(distance(
    points[0],
    points[1],
    2 * radius * Math.sin(Math.PI / numPoints)
  ));
  
  return { sketch, constraints };
}

// ============================================================================
// Benchmark: Simple Sketches
// ============================================================================

/**
 * Benchmark solving a simple rectangle
 */
function benchmarkRectangleSolve(): BenchmarkResult {
  const { sketch, constraints } = createRectangleSketch();
  
  return runBenchmark('solve rect', () => {
    // Perturb points slightly
    const points = Array.from(sketch.points.values());
    for (const point of points) {
      if (!point.fixed) {
        point.x += (Math.random() - 0.5) * 0.1;
        point.y += (Math.random() - 0.5) * 0.1;
      }
    }
    solveSketch(sketch, constraints);
  }, { iterations: 500 });
}

/**
 * Benchmark solving a triangle
 */
function benchmarkTriangleSolve(): BenchmarkResult {
  const { sketch, constraints } = createTriangleSketch();
  
  return runBenchmark('solve triangle', () => {
    const points = Array.from(sketch.points.values());
    for (const point of points) {
      if (!point.fixed) {
        point.x += (Math.random() - 0.5) * 0.1;
        point.y += (Math.random() - 0.5) * 0.1;
      }
    }
    solveSketch(sketch, constraints);
  }, { iterations: 500 });
}

// ============================================================================
// Benchmark: Complex Sketches
// ============================================================================

/**
 * Benchmark solving a hexagon (6 vertices, many constraints)
 */
function benchmarkHexagonSolve(): BenchmarkResult {
  const { sketch, constraints } = createComplexSketch(6);
  
  return runBenchmark('solve hexagon', () => {
    const points = Array.from(sketch.points.values());
    for (const point of points) {
      if (!point.fixed) {
        point.x += (Math.random() - 0.5) * 0.1;
        point.y += (Math.random() - 0.5) * 0.1;
      }
    }
    solveSketch(sketch, constraints);
  }, { iterations: 200 });
}

/**
 * Benchmark solving a 12-sided polygon
 */
function benchmarkDodecagonSolve(): BenchmarkResult {
  const { sketch, constraints } = createComplexSketch(12);
  
  return runBenchmark('solve 12-gon', () => {
    const points = Array.from(sketch.points.values());
    for (const point of points) {
      if (!point.fixed) {
        point.x += (Math.random() - 0.5) * 0.1;
        point.y += (Math.random() - 0.5) * 0.1;
      }
    }
    solveSketch(sketch, constraints);
  }, { iterations: 100 });
}

/**
 * Benchmark solving a 20-sided polygon
 */
function benchmarkIcosagonSolve(): BenchmarkResult {
  const { sketch, constraints } = createComplexSketch(20);
  
  return runBenchmark('solve 20-gon', () => {
    const points = Array.from(sketch.points.values());
    for (const point of points) {
      if (!point.fixed) {
        point.x += (Math.random() - 0.5) * 0.1;
        point.y += (Math.random() - 0.5) * 0.1;
      }
    }
    solveSketch(sketch, constraints);
  }, { iterations: 50 });
}

// ============================================================================
// Benchmark: Interactive Solving
// ============================================================================

/**
 * Benchmark incremental solve (simulating drag operations)
 */
function benchmarkIncrementalSolve(): BenchmarkResult {
  const { sketch, constraints } = createRectangleSketch();
  
  // Get a movable point
  const points = Array.from(sketch.points.values());
  const movablePoint = points.find(p => !p.fixed)!;
  
  return runBenchmark('incremental solve', () => {
    // Simulate dragging: small perturbation + solve
    const dx = (Math.random() - 0.5) * 0.5;
    const dy = (Math.random() - 0.5) * 0.5;
    movablePoint.x += dx;
    movablePoint.y += dy;
    
    solveSketch(sketch, constraints, {
      drivenPoints: new Map([[movablePoint.id, [movablePoint.x, movablePoint.y]]]),
    });
  }, { iterations: 500 });
}

// ============================================================================
// Run All Benchmarks
// ============================================================================

export function runSolverBenchmarks(): BenchmarkResult[] {
  console.log('='.repeat(60));
  console.log('SKETCH SOLVER BENCHMARKS');
  console.log('='.repeat(60));
  console.log('');
  
  const results: BenchmarkResult[] = [];
  
  console.log('--- Simple Sketches ---');
  results.push(benchmarkRectangleSolve());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkTriangleSolve());
  printResult(results[results.length - 1]);
  
  console.log('--- Complex Sketches ---');
  results.push(benchmarkHexagonSolve());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkDodecagonSolve());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkIcosagonSolve());
  printResult(results[results.length - 1]);
  
  console.log('--- Interactive Solving ---');
  results.push(benchmarkIncrementalSolve());
  printResult(results[results.length - 1]);
  
  console.log('Summary:');
  console.log(summarizeResults(results));
  
  return results;
}

// Run if executed directly
const isMain = typeof process !== 'undefined' && 
  process.argv[1]?.endsWith('solver.bench.ts');
if (isMain) {
  runSolverBenchmarks();
}
