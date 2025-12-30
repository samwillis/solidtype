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

// Re-export session types
export type {
  BodyId,
  FaceId,
  EdgeId,
  Mesh,
  BoundingBox,
  OperationResult,
  ModelingError,
  ExtrudeOperation,
  ExtrudeOptions,
  RevolveOptions,
  FilletOptions,
} from './SolidSession.js';
