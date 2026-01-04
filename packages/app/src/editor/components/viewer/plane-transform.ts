/**
 * Plane coordinate transformation utilities
 *
 * Provides functions for converting between sketch 2D coordinates
 * and 3D world coordinates based on plane orientation.
 */

import * as THREE from "three";

/** Plane transform data from kernel */
export interface PlaneTransformData {
  origin: [number, number, number];
  xDir: [number, number, number];
  yDir: [number, number, number];
  normal: [number, number, number];
}

/** Resolved plane transform with THREE.js vectors */
export interface PlaneTransform {
  origin: THREE.Vector3;
  xDir: THREE.Vector3;
  yDir: THREE.Vector3;
  normal?: THREE.Vector3;
}

/**
 * Get plane transformation for converting sketch coordinates to world coordinates.
 * Uses kernel transform when available, falls back to built-in plane definitions.
 *
 * @param planeId - The plane ID (e.g., "xy", "xz", "yz", or a face reference)
 * @param sketchId - Optional sketch ID for looking up kernel transforms
 * @param sketchPlaneTransforms - Map of sketch IDs to kernel plane transforms
 */
export function getPlaneTransform(
  planeId: string,
  sketchId?: string,
  sketchPlaneTransforms?: Record<string, PlaneTransformData>
): PlaneTransform {
  // Try to use kernel transform for accurate plane coordinates
  if (sketchId && sketchPlaneTransforms?.[sketchId]) {
    const t = sketchPlaneTransforms[sketchId];
    return {
      origin: new THREE.Vector3(...t.origin),
      xDir: new THREE.Vector3(...t.xDir),
      yDir: new THREE.Vector3(...t.yDir),
      normal: new THREE.Vector3(...t.normal),
    };
  }

  // Fallback for built-in planes
  switch (planeId) {
    case "xy":
      return {
        origin: new THREE.Vector3(0, 0, 0),
        xDir: new THREE.Vector3(1, 0, 0),
        yDir: new THREE.Vector3(0, 1, 0),
        normal: new THREE.Vector3(0, 0, 1),
      };
    case "xz":
      return {
        origin: new THREE.Vector3(0, 0, 0),
        xDir: new THREE.Vector3(1, 0, 0),
        yDir: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(0, 1, 0),
      };
    case "yz":
      return {
        origin: new THREE.Vector3(0, 0, 0),
        xDir: new THREE.Vector3(0, 1, 0),
        yDir: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(1, 0, 0),
      };
    default:
      // Default fallback for unknown planes
      return {
        origin: new THREE.Vector3(0, 0, 0),
        xDir: new THREE.Vector3(1, 0, 0),
        yDir: new THREE.Vector3(0, 1, 0),
        normal: new THREE.Vector3(0, 0, 1),
      };
  }
}

/**
 * Convert 2D sketch coordinates to 3D world coordinates.
 *
 * @param x - X coordinate in sketch space
 * @param y - Y coordinate in sketch space
 * @param transform - The plane transform to use
 */
export function toWorldCoords(x: number, y: number, transform: PlaneTransform): THREE.Vector3 {
  const { origin, xDir, yDir } = transform;
  return new THREE.Vector3(
    origin.x + x * xDir.x + y * yDir.x,
    origin.y + x * xDir.y + y * yDir.y,
    origin.z + x * xDir.z + y * yDir.z
  );
}

/**
 * Create a toWorld function bound to a specific plane transform.
 * Useful for creating a helper inside rendering loops.
 *
 * @param transform - The plane transform to use
 */
export function createToWorldFn(
  transform: PlaneTransform
): (x: number, y: number) => THREE.Vector3 {
  return (x: number, y: number) => toWorldCoords(x, y, transform);
}

/**
 * Get the plane normal from a transform, computing it if not provided.
 *
 * @param transform - The plane transform
 */
export function getPlaneNormal(transform: PlaneTransform): THREE.Vector3 {
  if (transform.normal) {
    return transform.normal.clone();
  }
  return new THREE.Vector3().crossVectors(transform.xDir, transform.yDir).normalize();
}
