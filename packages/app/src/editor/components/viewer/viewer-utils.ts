/**
 * Viewer utility functions
 *
 * Pure helper functions extracted from Viewer.tsx for better organization.
 */

import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";

/** Point merge tolerance in sketch units (mm) */
export const POINT_MERGE_TOLERANCE_MM = 5;

/** Angle tolerance for H/V inference (radians) - 5 degrees */
export const HV_INFERENCE_TOLERANCE = 5 * (Math.PI / 180);

/** Alignment tolerance for inference lines (mm) */
export const INFERENCE_ALIGN_TOLERANCE_MM = 5;

export type InferenceLine = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  kind: "horizontal" | "vertical";
};

/** Check if a line is near horizontal */
export function isNearHorizontal(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.abs(Math.atan2(dy, dx));
  return angle < HV_INFERENCE_TOLERANCE || angle > Math.PI - HV_INFERENCE_TOLERANCE;
}

/** Check if a line is near vertical */
export function isNearVertical(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.abs(Math.atan2(dy, dx));
  return Math.abs(angle - Math.PI / 2) < HV_INFERENCE_TOLERANCE;
}

/**
 * Compute horizontal/vertical inference lines based on existing points.
 */
export function computeHVInferenceLines(
  points: Array<{ x: number; y: number }>,
  cursor: { x: number; y: number },
  tolerance: number = INFERENCE_ALIGN_TOLERANCE_MM
): InferenceLine[] {
  let closestVertical: { point: { x: number; y: number }; delta: number } | null = null;
  let closestHorizontal: { point: { x: number; y: number }; delta: number } | null = null;

  for (const point of points) {
    const dx = Math.abs(point.x - cursor.x);
    if (dx <= tolerance && (!closestVertical || dx < closestVertical.delta)) {
      closestVertical = { point, delta: dx };
    }

    const dy = Math.abs(point.y - cursor.y);
    if (dy <= tolerance && (!closestHorizontal || dy < closestHorizontal.delta)) {
      closestHorizontal = { point, delta: dy };
    }
  }

  const lines: InferenceLine[] = [];
  if (closestVertical) {
    lines.push({
      kind: "vertical",
      start: { x: closestVertical.point.x, y: closestVertical.point.y },
      end: { x: closestVertical.point.x, y: cursor.y },
    });
  }
  if (closestHorizontal) {
    lines.push({
      kind: "horizontal",
      start: { x: closestHorizontal.point.x, y: closestHorizontal.point.y },
      end: { x: cursor.x, y: closestHorizontal.point.y },
    });
  }

  return lines;
}

/**
 * Calculate the circumcircle center from 3 points (for 3-point arc).
 * Returns null if points are collinear.
 */
export function calculateCircumcircleCenter(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { x: number; y: number; radius: number } | null {
  const ax = p1.x,
    ay = p1.y;
  const bx = p2.x,
    by = p2.y;
  const cx = p3.x,
    cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

  if (Math.abs(d) < 1e-10) {
    // Points are collinear
    return null;
  }

  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;
  const cSq = cx * cx + cy * cy;

  const centerX = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
  const centerY = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;
  const radius = Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2);

  return { x: centerX, y: centerY, radius };
}

/** Get default color for a datum plane based on its ID */
export function getDefaultPlaneColor(planeId: string): number {
  switch (planeId) {
    case "xy":
      return 0x0088ff; // Blue (Top plane)
    case "xz":
      return 0x00cc44; // Green (Front plane)
    case "yz":
      return 0xff4444; // Red (Right plane)
    default:
      return 0x888888; // Gray for custom planes
  }
}

/** Parse hex color string to number */
export function parseHexColor(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  if (color.startsWith("#")) {
    const parsed = parseInt(color.slice(1), 16);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
}

/** Visual state for rendering features */
export type FeatureDisplayState = "normal" | "hovered" | "selected";

/** Get opacity based on display state (reduced by 50% per user request) */
export function getPlaneOpacity(state: FeatureDisplayState): {
  fill: number;
  border: number;
  grid: number;
} {
  switch (state) {
    case "selected":
      return { fill: 0.18, border: 0.5, grid: 0.4 };
    case "hovered":
      return { fill: 0.12, border: 0.4, grid: 0.3 };
    case "normal":
    default:
      return { fill: 0.06, border: 0.2, grid: 0.15 };
  }
}

/**
 * Calculate grid square size as 10% of widest side, rounded to nearest magnitude (power of 10)
 * Examples:
 * - 12x13mm → widest=13, 10%=1.3 → magnitude=1mm
 * - 143x178mm → widest=178, 10%=17.8 → magnitude=10mm
 * - 1000x1200mm → widest=1200, 10%=120 → magnitude=100mm
 */
export function calculateGridSize(width: number, height: number): number {
  const widest = Math.max(width, height);
  const target = widest * 0.1;
  if (target <= 0) return 10; // fallback
  const magnitude = Math.pow(10, Math.round(Math.log10(target)));
  return magnitude;
}

/** Get line width based on display state */
export function getPlaneLineWidth(state: FeatureDisplayState): number {
  switch (state) {
    case "selected":
      return 4;
    case "hovered":
      return 3;
    case "normal":
    default:
      return 2;
  }
}

/** Get origin opacity and scale based on display state */
export function getOriginStyle(state: FeatureDisplayState): { opacity: number; scale: number } {
  switch (state) {
    case "selected":
      return { opacity: 1.0, scale: 1.3 };
    case "hovered":
      return { opacity: 0.8, scale: 1.15 };
    case "normal":
    default:
      return { opacity: 0.4, scale: 1.0 };
  }
}

/** Result of edge raycasting */
export interface EdgeRaycastHit {
  bodyId: string;
  featureId: string;
  edgeIndex: number;
  distance: number;
  point: THREE.Vector3;
}

/**
 * Find the closest edge segment to a ray.
 * Returns null if no edge is within the threshold distance.
 */
export function raycastEdges(
  raycaster: THREE.Raycaster,
  edgeGroup: THREE.Group,
  screenThreshold: number,
  camera: THREE.Camera,
  containerWidth: number
): EdgeRaycastHit | null {
  let closestHit: EdgeRaycastHit | null = null;
  let closestScreenDist = screenThreshold;

  const ray = raycaster.ray;

  edgeGroup.traverse((child) => {
    if (!(child instanceof LineSegments2)) return;

    const userData = child.userData as {
      bodyId?: string;
      featureId?: string;
      edgePositions?: Float32Array;
      edgeMap?: Uint32Array;
    };

    if (!userData.edgePositions || !userData.edgeMap) return;

    const positions = userData.edgePositions;
    const edgeMap = userData.edgeMap;

    // Each segment has 2 points = 6 floats
    const numSegments = positions.length / 6;

    for (let i = 0; i < numSegments; i++) {
      const p1 = new THREE.Vector3(
        positions[i * 6 + 0],
        positions[i * 6 + 1],
        positions[i * 6 + 2]
      );
      const p2 = new THREE.Vector3(
        positions[i * 6 + 3],
        positions[i * 6 + 4],
        positions[i * 6 + 5]
      );

      // Find closest point on ray to line segment
      const closestOnRay = new THREE.Vector3();
      const closestOnSegment = new THREE.Vector3();
      ray.distanceSqToSegment(p1, p2, closestOnRay, closestOnSegment);

      // Project to screen space to check pixel distance
      const screenPoint = closestOnSegment.clone().project(camera);
      const rayScreenPoint = closestOnRay.clone().project(camera);

      // Convert to pixel coordinates
      const screenDist = Math.sqrt(
        Math.pow((screenPoint.x - rayScreenPoint.x) * containerWidth * 0.5, 2) +
          Math.pow((screenPoint.y - rayScreenPoint.y) * containerWidth * 0.5, 2)
      );

      if (screenDist < closestScreenDist) {
        closestScreenDist = screenDist;
        closestHit = {
          bodyId: userData.bodyId || "",
          featureId: userData.featureId || "",
          edgeIndex: edgeMap[i],
          distance: closestOnRay.distanceTo(ray.origin),
          point: closestOnSegment.clone(),
        };
      }
    }
  });

  return closestHit;
}
