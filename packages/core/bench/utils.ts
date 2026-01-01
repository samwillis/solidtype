/**
 * Benchmark utilities for SolidType performance testing
 *
 * Provides simple timing utilities for measuring performance of
 * core operations like model building, tessellation, and constraint solving.
 */

/**
 * Result of a benchmark run
 */
export interface BenchmarkResult {
  /** Name of the benchmark */
  name: string;
  /** Number of iterations run */
  iterations: number;
  /** Total time in milliseconds */
  totalMs: number;
  /** Average time per iteration in milliseconds */
  avgMs: number;
  /** Minimum time in milliseconds */
  minMs: number;
  /** Maximum time in milliseconds */
  maxMs: number;
  /** Standard deviation in milliseconds */
  stdDevMs: number;
  /** Operations per second (based on average) */
  opsPerSec: number;
}

/**
 * Options for running a benchmark
 */
export interface BenchmarkOptions {
  /** Number of iterations (default: 100) */
  iterations?: number;
  /** Number of warmup iterations (default: 5) */
  warmup?: number;
  /** Whether to log progress (default: false) */
  verbose?: boolean;
}

const DEFAULT_OPTIONS: Required<BenchmarkOptions> = {
  iterations: 100,
  warmup: 5,
  verbose: false,
};

/**
 * Run a benchmark and collect timing statistics
 *
 * @param name Name of the benchmark
 * @param fn Function to benchmark
 * @param options Benchmark options
 * @returns Benchmark results
 */
export function runBenchmark(
  name: string,
  fn: () => void,
  options?: BenchmarkOptions
): BenchmarkResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Warmup runs
  if (opts.verbose) {
    console.log(`[${name}] Running ${opts.warmup} warmup iterations...`);
  }
  for (let i = 0; i < opts.warmup; i++) {
    fn();
  }

  // Timed runs
  const times: number[] = [];

  if (opts.verbose) {
    console.log(`[${name}] Running ${opts.iterations} iterations...`);
  }

  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  // Compute statistics
  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / opts.iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);

  // Standard deviation
  const squaredDiffs = times.map((t) => Math.pow(t - avgMs, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / opts.iterations;
  const stdDevMs = Math.sqrt(avgSquaredDiff);

  // Operations per second
  const opsPerSec = 1000 / avgMs;

  return {
    name,
    iterations: opts.iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    stdDevMs,
    opsPerSec,
  };
}

/**
 * Run a benchmark with async function
 */
export async function runBenchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  options?: BenchmarkOptions
): Promise<BenchmarkResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Warmup runs
  for (let i = 0; i < opts.warmup; i++) {
    await fn();
  }

  // Timed runs
  const times: number[] = [];

  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  // Compute statistics
  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / opts.iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);

  const squaredDiffs = times.map((t) => Math.pow(t - avgMs, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / opts.iterations;
  const stdDevMs = Math.sqrt(avgSquaredDiff);

  const opsPerSec = 1000 / avgMs;

  return {
    name,
    iterations: opts.iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    stdDevMs,
    opsPerSec,
  };
}

/**
 * Format a benchmark result for console output
 */
export function formatResult(result: BenchmarkResult): string {
  return [
    `Benchmark: ${result.name}`,
    `  Iterations: ${result.iterations}`,
    `  Average:    ${result.avgMs.toFixed(3)} ms`,
    `  Min:        ${result.minMs.toFixed(3)} ms`,
    `  Max:        ${result.maxMs.toFixed(3)} ms`,
    `  Std Dev:    ${result.stdDevMs.toFixed(3)} ms`,
    `  Ops/sec:    ${result.opsPerSec.toFixed(2)}`,
  ].join(`\n`);
}

/**
 * Print benchmark result to console
 */
export function printResult(result: BenchmarkResult): void {
  console.log(formatResult(result));
  console.log(``);
}

/**
 * Run multiple benchmarks and collect results
 */
export function runBenchmarks(
  benchmarks: { name: string; fn: () => void }[],
  options?: BenchmarkOptions
): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const { name, fn } of benchmarks) {
    const result = runBenchmark(name, fn, options);
    results.push(result);
    printResult(result);
  }

  return results;
}

/**
 * Create a summary table from benchmark results
 */
export function summarizeResults(results: BenchmarkResult[]): string {
  const header = `| Benchmark | Avg (ms) | Min (ms) | Max (ms) | Ops/sec |`;
  const separator = `|-----------|----------|----------|----------|---------|`;

  const rows = results.map(
    (r) =>
      `| ${r.name.padEnd(9)} | ${r.avgMs.toFixed(3).padStart(8)} | ${r.minMs.toFixed(3).padStart(8)} | ${r.maxMs.toFixed(3).padStart(8)} | ${r.opsPerSec.toFixed(1).padStart(7)} |`
  );

  return [header, separator, ...rows].join(`\n`);
}
