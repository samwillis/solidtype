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
 * Standard datum plane transforms that match the kernel's coordinate systems.
 * These MUST match the definitions in @solidtype/core/src/model/planes.ts
 */
const DATUM_PLANE_TRANSFORMS: Record<"xy" | "xz" | "yz", PlaneTransform> = {
  // XY plane: normal=+Z, xDir=+X, yDir=+Y
  xy: {
    origin: new THREE.Vector3(0, 0, 0),
    xDir: new THREE.Vector3(1, 0, 0),
    yDir: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, 1),
  },
  // YZ plane: normal=+X, xDir=+Y, yDir=+Z
  yz: {
    origin: new THREE.Vector3(0, 0, 0),
    xDir: new THREE.Vector3(0, 1, 0),
    yDir: new THREE.Vector3(0, 0, 1),
    normal: new THREE.Vector3(1, 0, 0),
  },
  // ZX plane (called "xz" in app): normal=+Y, xDir=+Z, yDir=+X
  xz: {
    origin: new THREE.Vector3(0, 0, 0),
    xDir: new THREE.Vector3(0, 0, 1),
    yDir: new THREE.Vector3(1, 0, 0),
    normal: new THREE.Vector3(0, 1, 0),
  },
};

/**
 * Get plane transformation for converting sketch coordinates to world coordinates.
 * Uses kernel transform when available, falls back to standard datum plane transforms.
 *
 * @param sketchId - Sketch ID for looking up kernel transforms
 * @param sketchPlaneTransforms - Map of sketch IDs to kernel plane transforms
 * @param planeRole - The plane role ("xy", "xz", "yz") for fallback when kernel transform unavailable
 * @returns The plane transform (always returns a valid transform for standard planes)
 */
export function getPlaneTransform(
  sketchId: string,
  sketchPlaneTransforms: Record<string, PlaneTransformData>,
  planeRole?: "xy" | "xz" | "yz" | null
): PlaneTransform | null {
  // Use kernel transform if available (most accurate)
  const t = sketchPlaneTransforms[sketchId];
  if (t) {
    return {
      origin: new THREE.Vector3(...t.origin),
      xDir: new THREE.Vector3(...t.xDir),
      yDir: new THREE.Vector3(...t.yDir),
      normal: new THREE.Vector3(...t.normal),
    };
  }

  // Fallback to standard datum plane transforms
  if (planeRole && DATUM_PLANE_TRANSFORMS[planeRole]) {
    return DATUM_PLANE_TRANSFORMS[planeRole];
  }

  return null;
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
