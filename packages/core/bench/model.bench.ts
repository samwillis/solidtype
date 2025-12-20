/**
 * Model building benchmarks
 * 
 * Benchmarks for primitive creation, extrusion, and model building operations.
 * These measure the performance of creating parametric models.
 */

import {
  TopoModel,
  createNumericContext,
  createBox,
  createRectangleProfile,
  extrude,
  createDatumPlaneFromNormal,
  booleanOperation,
  vec3,
  type NumericContext,
} from '../src/index.js';
import { runBenchmark, printResult, summarizeResults, type BenchmarkResult } from './utils.js';

// Create a shared numeric context for benchmarks
const ctx: NumericContext = createNumericContext();

// ============================================================================
// Benchmark: Primitive Creation
// ============================================================================

/**
 * Benchmark creating simple box primitives
 */
function benchmarkBoxCreation(): BenchmarkResult {
  return runBenchmark('createBox', () => {
    const model = new TopoModel(ctx);
    createBox(model, { width: 10, depth: 10, height: 10 });
  }, { iterations: 1000 });
}

/**
 * Benchmark creating multiple boxes in one model
 */
function benchmarkMultipleBoxes(): BenchmarkResult {
  return runBenchmark('10 boxes', () => {
    const model = new TopoModel(ctx);
    for (let i = 0; i < 10; i++) {
      createBox(model, {
        width: 1,
        depth: 1,
        height: 1,
        center: vec3(i * 2, 0, 0),
      });
    }
  }, { iterations: 500 });
}

// ============================================================================
// Benchmark: Extrusion
// ============================================================================

/**
 * Benchmark simple rectangle extrusion
 */
function benchmarkRectangleExtrusion(): BenchmarkResult {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  
  return runBenchmark('extrude rect', () => {
    const model = new TopoModel(ctx);
    const profile = createRectangleProfile(plane, 10, 8);
    extrude(model, profile, { operation: 'add', distance: 5 });
  }, { iterations: 500 });
}

/**
 * Benchmark extruding complex profiles (many-sided polygon)
 */
function benchmarkComplexExtrusion(): BenchmarkResult {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  
  // Pre-create a polygon profile with many vertices
  const createPolygonProfile = (sides: number) => {
    const radius = 10;
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
    
    return {
      id: 0,
      plane,
      loops: [{
        curves,
        isOuter: true,
      }],
    };
  };
  
  const polygon16 = createPolygonProfile(16);
  
  return runBenchmark('extrude 16-gon', () => {
    const model = new TopoModel(ctx);
    extrude(model, polygon16 as any, { operation: 'add', distance: 5 });
  }, { iterations: 200 });
}

// ============================================================================
// Benchmark: Boolean Operations
// ============================================================================

/**
 * Benchmark union of two boxes
 */
function benchmarkBooleanUnion(): BenchmarkResult {
  return runBenchmark('union 2 boxes', () => {
    const model = new TopoModel(ctx);
    const box1 = createBox(model, { width: 10, depth: 10, height: 10, center: vec3(0, 0, 0) });
    const box2 = createBox(model, { width: 10, depth: 10, height: 10, center: vec3(5, 5, 0) });
    booleanOperation(model, box1, box2, { operation: 'union' });
  }, { iterations: 100, warmup: 5 });
}

/**
 * Benchmark subtraction of two boxes
 */
function benchmarkBooleanSubtract(): BenchmarkResult {
  return runBenchmark('subtract boxes', () => {
    const model = new TopoModel(ctx);
    const box1 = createBox(model, { width: 20, depth: 20, height: 20, center: vec3(0, 0, 0) });
    const box2 = createBox(model, { width: 10, depth: 10, height: 10, center: vec3(5, 5, 5) });
    booleanOperation(model, box1, box2, { operation: 'subtract' });
  }, { iterations: 100, warmup: 5 });
}

// ============================================================================
// Benchmark: Model Rebuild
// ============================================================================

/**
 * Benchmark rebuilding a parametric model
 * Simulates changing a parameter and rebuilding
 */
function benchmarkModelRebuild(): BenchmarkResult {
  const plane = createDatumPlaneFromNormal('XY', vec3(0, 0, 0), vec3(0, 0, 1));
  
  return runBenchmark('rebuild model', () => {
    // Simulate rebuilding a model with different parameters
    const height = 5 + Math.random() * 10;
    const model = new TopoModel(ctx);
    const profile = createRectangleProfile(plane, 10, 8);
    extrude(model, profile, { operation: 'add', distance: height });
  }, { iterations: 200 });
}

// ============================================================================
// Run All Benchmarks
// ============================================================================

export function runModelBenchmarks(): BenchmarkResult[] {
  console.log('='.repeat(60));
  console.log('MODEL BENCHMARKS');
  console.log('='.repeat(60));
  console.log('');
  
  const results: BenchmarkResult[] = [];
  
  console.log('--- Primitive Creation ---');
  results.push(benchmarkBoxCreation());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkMultipleBoxes());
  printResult(results[results.length - 1]);
  
  console.log('--- Extrusion ---');
  results.push(benchmarkRectangleExtrusion());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkComplexExtrusion());
  printResult(results[results.length - 1]);
  
  console.log('--- Boolean Operations ---');
  results.push(benchmarkBooleanUnion());
  printResult(results[results.length - 1]);
  
  results.push(benchmarkBooleanSubtract());
  printResult(results[results.length - 1]);
  
  console.log('--- Model Rebuild ---');
  results.push(benchmarkModelRebuild());
  printResult(results[results.length - 1]);
  
  console.log('Summary:');
  console.log(summarizeResults(results));
  
  return results;
}

// Run if executed directly
const isMain = typeof process !== 'undefined' && 
  process.argv[1]?.endsWith('model.bench.ts');
if (isMain) {
  runModelBenchmarks();
}
