/**
 * 4x4 matrix operations
 * 
 * Matrices are represented as 16-element arrays in column-major order:
 * [m00, m10, m20, m30, m01, m11, m21, m31, m02, m12, m22, m32, m03, m13, m23, m33]
 * 
 * This matches common graphics library conventions (WebGL, three.js).
 * All operations are pure functions.
 */

import type { Vec3 } from './vec3.js';

export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/**
 * Identity matrix
 */
export function identity4(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

/**
 * Zero matrix
 */
export function zero4(): Mat4 {
  return [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
}

/**
 * Multiply two matrices: A * B
 */
export function mul4(a: Mat4, b: Mat4): Mat4 {
  const result = zero4();
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i + k * 4] * b[k + j * 4];
      }
      result[i + j * 4] = sum;
    }
  }
  return result;
}

/**
 * Transform a 3D point by a 4x4 matrix (assumes w=1)
 */
export function transformPoint3(m: Mat4, v: Vec3): Vec3 {
  const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
  const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
  const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
  return [x, y, z];
}

/**
 * Transform a 3D direction vector by a 4x4 matrix (assumes w=0, ignores translation)
 */
export function transformDirection3(m: Mat4, v: Vec3): Vec3 {
  const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2];
  const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2];
  const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
  return [x, y, z];
}
