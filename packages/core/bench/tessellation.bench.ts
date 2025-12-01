/**
 * Tessellation benchmarks
 * 
 * Benchmarks for converting BREP bodies to triangle meshes.
 * Measures the performance of face tessellation and body mesh generation.
 */

import {
  createEmptyModel,
  createNumericContext,
  createBox,
  tessellateBody,
  createRectangleProfile,
  extrude,
  createDatumPlaneFromNormal,
  vec3,
  type NumericContext,
} from '../src/index.js';
import { runBenchmark, printResult, summarizeResults, type BenchmarkResult } from './utils.js';

// Create a shared numeric context for benchmarks
const ctx: NumericContext = createNumericContext();

// ============================================================================
// Benchmark: Simple Tessellation
// ============================================================================

/**
 * Benchmark tessellating a simple box (6 faces, 12 triangles)
 */
function benchmarkBoxTessellation(): BenchmarkResult {
  // Pre-create the model
  const model = createEmptyModel(ctx);
  const body = createBox(model, { width: 10, depth: 10, height: 10 });
  
  return runBenchmark('tess box', () => {
    tessellateBody(model, body);
  }, { iterations: 1000 });
}

/**
 * Benchmark tessellating with higher tolerance (fewer triangles)
 */
function benchmarkCoarseTessellation(): BenchmarkResult {
  const model = createEmptyModel(ctx);
  const body = createBox(model, { width: 10, depth: 10, height: 10 });
  
  return runBenchmark('tess coarse', () => {
    tessellateBody(model, body, { angularTolerance: 0.5, chordTolerance: 0.5 });
  }, { iterations: 1000 });
}

/**
 * Benchmark tessellating with fine tolerance (more triangles)
 */
function benchmarkFineTessellation(): BenchmarkResult {
  const model = createEmptyModel(ctx);
  const body = createBox(model, { width: 10, depth: 10, height: 10 });
  
  return runBenchmark('tess fine', () => {
    tessellateBody(model, body, { angularTolerance: 0.01, chordTolerance: 0.01 });
  }, { iterations: 1000 });
}

// ============================================================================
// Benchmark: Complex Body Tessellation
// ============================================================================

/**
 * Benchmark tessellating extruded rectangle
 */
function benchmarkExtrusionTessellation(): BenchmarkResult {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  const model = createEmptyModel(ctx);
  const profile = createRectangleProfile(plane, 10, 8);
  const result = extrude(model, profile, { operation: 'add', distance: 5 });
  const body = result.body!;
  
  return runBenchmark('tess extrusion', () => {
    tessellateBody(model, body);
  }, { iterations: 500 });
}

/**
 * Benchmark tessellating a multi-face body
 */
function benchmarkMultiFaceTessellation(): BenchmarkResult {
  const model = createEmptyModel(ctx);
  
  // Create a model with many faces
  const bodies = [];
  for (let i = 0; i < 10; i++) {
    bodies.push(createBox(model, {
      width: 2,
      depth: 2,
      height: 2,
      center: vec3(i * 3, 0, 0),
    }));
  }
  
  return runBenchmark('tess 10 boxes', () => {
    // Tessellate all bodies
    for (const body of bodies) {
      tessellateBody(model, body);
    }
  }, { iterations: 100 });
}

// ============================================================================
// Benchmark: Polygon Tessellation
// ============================================================================

/**
 * Benchmark tessellating polygons with different vertex counts
 */
function benchmarkPolygonTessellation(): BenchmarkResult {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  
  // Create a 20-sided polygon profile
  const radius = 10;
  const sides = 20;
  const curves: any[] = [];
  
  for (let i = 0; i < sides; i++) {
    const angle1 = (2 * Math.PI * i) / sides;
    const angle2 = (2 * Math.PI * (i + 1)) / sides;
    
    curves.push({
      kind: 'line',
      p0: [radius * Math.cos(angle1), radius * Math.sin(angle1)] as [number, number],
      p1: [radius * Math.cos(angle2), radius * Math.sin(angle2)] as [number, number],
    });
  }
  
  const profile = {
    id: 0,
    plane,
    loops: [{
      curves,
      isOuter: true,
    }],
  };
  
  const model = createEmptyModel(ctx);
  const result = extrude(model, profile as any, { operation: 'add', distance: 5 });
  const body = result.body!;
  
  return runBenchmark('tess 20-gon', () => {
    tessellateBody(model, body);
  }, { iterations: 200 });
}

// ============================================================================
// Run All Benchmarks
// ============================================================================

export function runTessellationBenchmarks(): BenchmarkResult[] {
  console.log('='.repeat(60));
  console.log('TESSELLATION BENCHMARKS');
  console.log('='.repeat(60));
  console.log('');
  
  const results: BenchmarkResult[] = [];
  
  console.log('--- Simple Bodies ---');
  results.push(benchmarkBoxTessellation());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkCoarseTessellation());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkFineTessellation());
  printResult(results[results.length - 1]);
  
  console.log('--- Complex Bodies ---');
  results.push(benchmarkExtrusionTessellation());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkMultiFaceTessellation());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkPolygonTessellation());
  printResult(results[results.length - 1]);
  
  console.log('Summary:');
  console.log(summarizeResults(results));
  
  return results;
}

// Run if executed directly
const isMain = typeof process !== 'undefined' && 
  process.argv[1]?.endsWith('tessellation.bench.ts');
if (isMain) {
  runTessellationBenchmarks();
}
