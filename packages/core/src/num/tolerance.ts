/**
 * Tolerance model and numeric context
 * 
 * Provides a centralized tolerance system for all geometric comparisons.
 * All equality/near-equality decisions should go through these helpers
 * rather than using raw comparisons.
 */

/**
 * Tolerance values for a model
 */
export interface Tolerances {
  /** Model-space length tolerance (absolute distance) */
  length: number;
  /** Angle tolerance in radians */
  angle: number;
}

/**
 * Numeric context containing tolerance information
 */
export interface NumericContext {
  tol: Tolerances;
}

/**
 * Default tolerances (suitable for typical CAD work in mm)
 */
export const DEFAULT_TOLERANCES: Tolerances = {
  length: 1e-6,
  angle: 1e-8,
};

/**
 * Create a default numeric context
 */
export function createNumericContext(tol?: Partial<Tolerances>): NumericContext {
  return {
    tol: {
      length: tol?.length ?? DEFAULT_TOLERANCES.length,
      angle: tol?.angle ?? DEFAULT_TOLERANCES.angle,
    },
  };
}

/**
 * Check if a value is effectively zero (within length tolerance)
 */
export function isZero(value: number, ctx: NumericContext): boolean {
  return Math.abs(value) <= ctx.tol.length;
}

/**
 * Check if two lengths are equal within tolerance
 */
export function eqLength(a: number, b: number, ctx: NumericContext): boolean {
  return Math.abs(a - b) <= ctx.tol.length;
}

/**
 * Check if two angles are equal within tolerance
 */
export function eqAngle(a: number, b: number, ctx: NumericContext): boolean {
  const diff = Math.abs(a - b);
  // Handle wrap-around (angles modulo 2π)
  const wrapped = Math.abs(diff - 2 * Math.PI);
  return Math.min(diff, wrapped) <= ctx.tol.angle;
}

/**
 * Clamp a value to zero if it's within tolerance
 */
export function clampToZero(value: number, ctx: NumericContext): number {
  return isZero(value, ctx) ? 0 : value;
}

/**
 * Check if two numbers are equal within length tolerance
 */
export function eq(a: number, b: number, ctx: NumericContext): boolean {
  return eqLength(a, b, ctx);
}

/**
 * Check if a is less than b (with tolerance consideration)
 * Returns true if a < b - tol.length
 */
export function lt(a: number, b: number, ctx: NumericContext): boolean {
  return a < b - ctx.tol.length;
}

/**
 * Check if a is less than or equal to b (with tolerance)
 */
export function lte(a: number, b: number, ctx: NumericContext): boolean {
  return a <= b + ctx.tol.length;
}

/**
 * Check if a is greater than b (with tolerance consideration)
 */
export function gt(a: number, b: number, ctx: NumericContext): boolean {
  return a > b + ctx.tol.length;
}

/**
 * Check if a is greater than or equal to b (with tolerance)
 */
export function gte(a: number, b: number, ctx: NumericContext): boolean {
  return a >= b - ctx.tol.length;
}
