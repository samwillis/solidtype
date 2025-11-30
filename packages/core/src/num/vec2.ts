/**
 * 2D vector operations
 * 
 * Vectors are represented as tuples [number, number] for simplicity and performance.
 * All operations are pure functions.
 */

export type Vec2 = [number, number];

/**
 * Create a 2D vector
 */
export function vec2(x: number, y: number): Vec2 {
  return [x, y];
}

/**
 * Zero vector
 */
export const ZERO2: Vec2 = [0, 0];

/**
 * Add two vectors: a + b
 */
export function add2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

/**
 * Subtract two vectors: a - b
 */
export function sub2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

/**
 * Multiply vector by scalar: v * s
 */
export function mul2(v: Vec2, s: number): Vec2 {
  return [v[0] * s, v[1] * s];
}

/**
 * Dot product: a · b
 */
export function dot2(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

/**
 * Cross product (2D): returns scalar (z-component of 3D cross product)
 */
export function cross2(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

/**
 * Squared length of vector
 */
export function lengthSq2(v: Vec2): number {
  return v[0] * v[0] + v[1] * v[1];
}

/**
 * Length of vector
 */
export function length2(v: Vec2): number {
  return Math.sqrt(lengthSq2(v));
}

/**
 * Normalize vector to unit length
 * Returns zero vector if input is zero
 */
export function normalize2(v: Vec2): Vec2 {
  const len = length2(v);
  if (len === 0) {
    return [0, 0];
  }
  return [v[0] / len, v[1] / len];
}

/**
 * Distance squared between two points
 */
export function distSq2(a: Vec2, b: Vec2): number {
  return lengthSq2(sub2(a, b));
}

/**
 * Distance between two points
 */
export function dist2(a: Vec2, b: Vec2): number {
  return length2(sub2(a, b));
}
