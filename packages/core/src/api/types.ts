/**
 * Types for the Object-Oriented API
 */

import type { Vec3 } from '../num/vec3.js';

/**
 * Ray for intersection tests
 */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}
