/**
 * Root-finding utilities
 *
 * Provides 1D root-finding algorithms for curve/surface parameter solving.
 * Used when we need to find parameter values where curves/surfaces satisfy
 * certain conditions (e.g., intersection points, closest points).
 */

import type { NumericContext } from "./tolerance.js";
import { isZero } from "./tolerance.js";

/**
 * Function type for root-finding: f(x) = 0
 */
export type RootFunction = (x: number) => number;

/**
 * Options for root-finding algorithms
 */
export interface RootFindingOptions {
  /** Maximum number of iterations */
  maxIterations?: number;
  /** Convergence tolerance (defaults to context length tolerance) */
  tolerance?: number;
}

/**
 * Result of root-finding
 */
export type RootFindingResult =
  | { ok: true; root: number; iterations: number }
  | { ok: false; error: string };

/**
 * Newton's method for finding roots
 *
 * Requires both the function and its derivative.
 *
 * @param f Function to find root of
 * @param df Derivative of f
 * @param x0 Initial guess
 * @param ctx Numeric context for tolerances
 * @param options Additional options
 */
export function newton(
  f: RootFunction,
  df: RootFunction,
  x0: number,
  ctx: NumericContext,
  options?: RootFindingOptions
): RootFindingResult {
  const maxIter = options?.maxIterations ?? 100;
  const tol = options?.tolerance ?? ctx.tol.length;

  let x = x0;

  for (let i = 0; i < maxIter; i++) {
    const fx = f(x);

    // Check convergence
    if (Math.abs(fx) < tol) {
      return { ok: true, root: x, iterations: i + 1 };
    }

    const dfx = df(x);

    // Check for zero derivative (stationary point)
    if (isZero(dfx, ctx)) {
      return { ok: false, error: `Derivative is zero, cannot continue` };
    }

    // Newton step: x_new = x - f(x) / f'(x)
    const xNew = x - fx / dfx;

    // Check if we're stuck (not making progress)
    if (Math.abs(xNew - x) < tol) {
      return { ok: true, root: xNew, iterations: i + 1 };
    }

    x = xNew;
  }

  return { ok: false, error: `Did not converge after ${maxIter} iterations` };
}

/**
 * Bisection method for finding roots
 *
 * Requires a bracketing interval [a, b] where f(a) and f(b) have opposite signs.
 * More robust than Newton but slower convergence.
 *
 * @param f Function to find root of
 * @param a Left bound of bracket
 * @param b Right bound of bracket
 * @param ctx Numeric context for tolerances
 * @param options Additional options
 */
export function bisection(
  f: RootFunction,
  a: number,
  b: number,
  ctx: NumericContext,
  options?: RootFindingOptions
): RootFindingResult {
  const maxIter = options?.maxIterations ?? 100;
  const tol = options?.tolerance ?? ctx.tol.length;

  let left = a;
  let right = b;
  const fa = f(left);
  const fb = f(right);

  // Check that bracket is valid
  if (fa * fb > 0) {
    return { ok: false, error: `Function must have opposite signs at bracket endpoints` };
  }

  // If one endpoint is already a root, return it
  if (Math.abs(fa) < tol) {
    return { ok: true, root: left, iterations: 0 };
  }
  if (Math.abs(fb) < tol) {
    return { ok: true, root: right, iterations: 0 };
  }

  for (let i = 0; i < maxIter; i++) {
    const mid = (left + right) / 2;
    const fmid = f(mid);

    // Check convergence
    if (Math.abs(fmid) < tol || (right - left) / 2 < tol) {
      return { ok: true, root: mid, iterations: i + 1 };
    }

    // Update bracket
    if (fa * fmid < 0) {
      right = mid;
    } else {
      left = mid;
    }
  }

  return { ok: false, error: `Did not converge after ${maxIter} iterations` };
}

/**
 * Hybrid method: try Newton first, fall back to bisection if it fails
 *
 * @param f Function to find root of
 * @param df Derivative of f
 * @param x0 Initial guess for Newton
 * @param bracket Optional bracket [a, b] for bisection fallback
 * @param ctx Numeric context
 * @param options Additional options
 */
export function hybrid(
  f: RootFunction,
  df: RootFunction,
  x0: number,
  bracket: [number, number] | null,
  ctx: NumericContext,
  options?: RootFindingOptions
): RootFindingResult {
  // Try Newton first
  const newtonResult = newton(f, df, x0, ctx, options);
  if (newtonResult.ok) {
    return newtonResult;
  }

  // Fall back to bisection if bracket is provided
  if (bracket) {
    return bisection(f, bracket[0], bracket[1], ctx, options);
  }

  return newtonResult;
}
