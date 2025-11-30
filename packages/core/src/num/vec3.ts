/**
 * 3D vector operations
 * 
 * Vectors are represented as tuples [number, number, number] for simplicity and performance.
 * All operations are pure functions.
 */

export type Vec3 = [number, number, number];

/**
 * Create a 3D vector
 */
export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

/**
 * Zero vector
 */
export const ZERO3: Vec3 = [0, 0, 0];

/**
 * Unit vectors along axes
 */
export const X_AXIS: Vec3 = [1, 0, 0];
export const Y_AXIS: Vec3 = [0, 1, 0];
export const Z_AXIS: Vec3 = [0, 0, 1];

/**
 * Add two vectors: a + b
 */
export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Subtract two vectors: a - b
 */
export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Multiply vector by scalar: v * s
 */
export function mul3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Dot product: a · b
 */
export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cross product: a × b
 */
export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Squared length of vector
 */
export function lengthSq3(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

/**
 * Length of vector
 */
export function length3(v: Vec3): number {
  return Math.sqrt(lengthSq3(v));
}

/**
 * Normalize vector to unit length
 * Returns zero vector if input is zero
 */
export function normalize3(v: Vec3): Vec3 {
  const len = length3(v);
  if (len === 0) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Distance squared between two points
 */
export function distSq3(a: Vec3, b: Vec3): number {
  return lengthSq3(sub3(a, b));
}

/**
 * Distance between two points
 */
export function dist3(a: Vec3, b: Vec3): number {
  return length3(sub3(a, b));
}
