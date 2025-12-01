/**
 * SolidType Core Benchmarks
 * 
 * Performance benchmarks for measuring the efficiency of core operations.
 * These benchmarks are informative and help identify optimization opportunities.
 * 
 * Usage:
 *   pnpm bench              - Run all benchmarks
 *   pnpm bench:model        - Run model building benchmarks
 *   pnpm bench:tessellation - Run tessellation benchmarks  
 *   pnpm bench:solver       - Run constraint solver benchmarks
 * 
 * Or run directly:
 *   npx tsx bench/index.ts
 */

import { runModelBenchmarks } from './model.bench.js';
import { runTessellationBenchmarks } from './tessellation.bench.js';
import { runSolverBenchmarks } from './solver.bench.js';
import { summarizeResults, type BenchmarkResult } from './utils.js';

// ============================================================================
// Main Entry Point
// ============================================================================

export async function runAllBenchmarks(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           SOLIDTYPE PERFORMANCE BENCHMARKS               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);
  console.log('');
  
  const allResults: BenchmarkResult[] = [];
  
  // Model benchmarks
  console.log('');
  const modelResults = runModelBenchmarks();
  allResults.push(...modelResults);
  
  // Tessellation benchmarks
  console.log('');
  const tessResults = runTessellationBenchmarks();
  allResults.push(...tessResults);
  
  // Solver benchmarks
  console.log('');
  const solverResults = runSolverBenchmarks();
  allResults.push(...solverResults);
  
  // Overall summary
  console.log('');
  console.log('='.repeat(60));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log(summarizeResults(allResults));
  console.log('');
  
  // Performance insights
  console.log('Performance Insights:');
  console.log('─'.repeat(40));
  
  const slowest = allResults.reduce((a, b) => a.avgMs > b.avgMs ? a : b);
  const fastest = allResults.reduce((a, b) => a.avgMs < b.avgMs ? a : b);
  
  console.log(`  Fastest: ${fastest.name} (${fastest.avgMs.toFixed(3)} ms avg)`);
  console.log(`  Slowest: ${slowest.name} (${slowest.avgMs.toFixed(3)} ms avg)`);
  
  const highVariance = allResults.filter(r => r.stdDevMs / r.avgMs > 0.5);
  if (highVariance.length > 0) {
    console.log(`  High variance: ${highVariance.map(r => r.name).join(', ')}`);
  }
  
  console.log('');
}

// Run if executed directly
const isMain = typeof process !== 'undefined' && 
  process.argv[1]?.includes('bench');
if (isMain) {
  runAllBenchmarks().catch(console.error);
}

// Re-export individual benchmark runners
export { runModelBenchmarks } from './model.bench.js';
export { runTessellationBenchmarks } from './tessellation.bench.js';
export { runSolverBenchmarks } from './solver.bench.js';
export * from './utils.js';
