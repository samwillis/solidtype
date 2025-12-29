/**
 * Tolerance model and numeric context
 * 
 * Provides a centralized tolerance system for all geometric comparisons.
 * All equality/near-equality decisions should go through these helpers
 * rather than using raw comparisons.
 */

import type { Vec2 } from './vec2.js';
import type { Vec3 } from './vec3.js';

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

// Minimum snap step to avoid division by zero and preserve stability
const MIN_SNAP = 1e-12;

// Helper to choose a positive snap step
function snapStep(step: number): number {
  const s = Math.abs(step);
  return s > MIN_SNAP ? s : MIN_SNAP;
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
 * Snap a scalar to the nearest multiple of `step` (default: ctx.tol.length)
 */
export function snap(value: number, ctx: NumericContext, step: number = ctx.tol.length): number {
  const s = snapStep(step);
  return Math.round(value / s) * s;
}

/**
 * Get a length tolerance scaled by factor, clamped to a minimum snap step.
 */
export function scaledTol(ctx: NumericContext, scale = 1, min: number = MIN_SNAP): number {
  return Math.max(ctx.tol.length * scale, min);
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
 * Check approximate equality of 2D/3D coordinates
 */
export function eq2(a: Vec2, b: Vec2, ctx: NumericContext, scale = 1): boolean {
  const tol = ctx.tol.length * scale;
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

export function eq3(a: Vec3, b: Vec3, ctx: NumericContext, scale = 1): boolean {
  const tol = ctx.tol.length * scale;
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol
  );
}

/**
 * Snap vectors component-wise
 */
export function snap2(a: Vec2, ctx: NumericContext, step: number = ctx.tol.length): Vec2 {
  return [snap(a[0], ctx, step), snap(a[1], ctx, step)];
}

export function snap3(a: Vec3, ctx: NumericContext, step: number = ctx.tol.length): Vec3 {
  return [snap(a[0], ctx, step), snap(a[1], ctx, step), snap(a[2], ctx, step)];
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
