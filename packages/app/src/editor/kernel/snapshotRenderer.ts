/**
 * Snapshot Renderer - Renders 2D line-art snapshots of 3D models
 *
 * Generates PNG snapshots from kernel rebuild results for AI multimodal reasoning.
 * Uses OffscreenCanvas for worker-compatible rendering.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 5
 */

import type { RebuildResult } from "./KernelEngine";

// ============================================================================
// Types
// ============================================================================

export type SnapshotView = "iso" | "top" | "front" | "right" | "left" | "back" | "bottom";

export interface SnapshotOptions {
  /** View direction */
  view: SnapshotView;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Background color (CSS color string) */
  backgroundColor?: string;
  /** Edge color (CSS color string) */
  edgeColor?: string;
  /** Edge line width */
  lineWidth?: number;
  /** Padding as fraction of view size (0-1) */
  padding?: number;
}

export interface SnapshotResult {
  /** PNG image as base64-encoded string */
  pngBase64: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** View that was rendered */
  view: SnapshotView;
  /** Number of bodies in the model */
  bodyCount: number;
}

// ============================================================================
// Camera Matrices
// ============================================================================

interface Camera {
  /** View matrix (rotation) */
  viewMatrix: number[];
  /** Projection scale factor */
  scale: number;
  /** Center offset [x, y] */
  offset: [number, number];
}

/**
 * Get camera parameters for a given view
 */
function getCameraForView(
  view: SnapshotView,
  bbox: { min: [number, number, number]; max: [number, number, number] }
): Camera {
  const center = [
    (bbox.min[0] + bbox.max[0]) / 2,
    (bbox.min[1] + bbox.max[1]) / 2,
    (bbox.min[2] + bbox.max[2]) / 2,
  ];

  const size = [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]];

  // View matrices (simple orthographic projections)
  // Format: [right_x, right_y, right_z, up_x, up_y, up_z, forward_x, forward_y, forward_z]
  const viewMatrices: Record<SnapshotView, number[]> = {
    top: [1, 0, 0, 0, 1, 0, 0, 0, 1], // Looking down -Z
    bottom: [1, 0, 0, 0, -1, 0, 0, 0, -1], // Looking up +Z
    front: [1, 0, 0, 0, 0, 1, 0, -1, 0], // Looking at -Y
    back: [-1, 0, 0, 0, 0, 1, 0, 1, 0], // Looking at +Y
    right: [0, 1, 0, 0, 0, 1, 1, 0, 0], // Looking at +X
    left: [0, -1, 0, 0, 0, 1, -1, 0, 0], // Looking at -X
    iso: [0.707, 0.408, 0, -0.707, 0.408, 0, 0, -0.816, 0.577], // Isometric
  };

  const viewMatrix = viewMatrices[view];

  // Project center and compute 2D bounds
  const projectedCenter = projectPoint3D(center, viewMatrix);

  // Compute projected size based on view
  let projectedSize: [number, number];
  if (view === "top" || view === "bottom") {
    projectedSize = [size[0], size[1]];
  } else if (view === "front" || view === "back") {
    projectedSize = [size[0], size[2]];
  } else if (view === "left" || view === "right") {
    projectedSize = [size[1], size[2]];
  } else {
    // Isometric - use diagonal of bounding box
    const diagonal = Math.sqrt(size[0] ** 2 + size[1] ** 2 + size[2] ** 2);
    projectedSize = [diagonal, diagonal];
  }

  const maxSize = Math.max(projectedSize[0], projectedSize[1], 0.001);

  return {
    viewMatrix,
    scale: 1 / maxSize,
    offset: [-projectedCenter[0], -projectedCenter[1]],
  };
}

/**
 * Project a 3D point using a view matrix
 */
function projectPoint3D(point: number[], viewMatrix: number[]): [number, number] {
  // viewMatrix format: [right_x, right_y, right_z, up_x, up_y, up_z, forward_x, forward_y, forward_z]
  const x = point[0] * viewMatrix[0] + point[1] * viewMatrix[1] + point[2] * viewMatrix[2];
  const y = point[0] * viewMatrix[3] + point[1] * viewMatrix[4] + point[2] * viewMatrix[5];
  return [x, y];
}

// ============================================================================
// Bounding Box Computation
// ============================================================================

/**
 * Compute bounding box from rebuild result
 */
function computeBoundingBox(rebuildResult: RebuildResult): {
  min: [number, number, number];
  max: [number, number, number];
} {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const [, mesh] of rebuildResult.meshes) {
    const positions = mesh.positions;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
  }

  // Handle empty case
  if (!isFinite(minX)) {
    return {
      min: [-1, -1, -1],
      max: [1, 1, 1],
    };
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Render a snapshot of the model
 *
 * @param rebuildResult - Kernel rebuild result with meshes
 * @param options - Rendering options
 * @returns Snapshot result with PNG base64
 */
export async function renderSnapshot(
  rebuildResult: RebuildResult,
  options: SnapshotOptions
): Promise<SnapshotResult> {
  const width = options.width ?? 512;
  const height = options.height ?? 512;
  const backgroundColor = options.backgroundColor ?? "#ffffff";
  const edgeColor = options.edgeColor ?? "#000000";
  const lineWidth = options.lineWidth ?? 1;
  const padding = options.padding ?? 0.1;

  // Create OffscreenCanvas
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2d context from OffscreenCanvas");
  }

  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Compute bounding box and camera
  const bbox = computeBoundingBox(rebuildResult);
  const camera = getCameraForView(options.view, bbox);

  // Set up transform
  const drawSize = Math.min(width, height) * (1 - padding * 2);
  const scale = camera.scale * drawSize;
  const offsetX = width / 2 + camera.offset[0] * scale;
  const offsetY = height / 2 - camera.offset[1] * scale; // Flip Y for canvas

  // Draw edges
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [, mesh] of rebuildResult.meshes) {
    const edges = mesh.edges;
    if (!edges || edges.length === 0) continue;

    // Draw edge segments
    ctx.beginPath();
    for (let i = 0; i < edges.length; i += 6) {
      const p1_3d = [edges[i], edges[i + 1], edges[i + 2]];
      const p2_3d = [edges[i + 3], edges[i + 4], edges[i + 5]];

      const p1 = projectPoint3D(p1_3d, camera.viewMatrix);
      const p2 = projectPoint3D(p2_3d, camera.viewMatrix);

      // Transform to canvas coordinates
      const x1 = offsetX + p1[0] * scale;
      const y1 = offsetY - p1[1] * scale;
      const x2 = offsetX + p2[0] * scale;
      const y2 = offsetY - p2[1] * scale;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  // Convert to PNG blob
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  return {
    pngBase64: base64,
    width,
    height,
    view: options.view,
    bodyCount: rebuildResult.bodies.length,
  };
}

/**
 * Check if OffscreenCanvas is available
 */
export function isSnapshotRenderingAvailable(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}
