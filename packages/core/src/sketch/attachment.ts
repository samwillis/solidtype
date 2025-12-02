/**
 * External Edge Attachment Resolution
 * 
 * This module handles the resolution of sketch point attachments to external
 * model geometry (edges, vertices) during solving. It bridges the sketch system
 * with the naming system to enable constraint-based attachment.
 * 
 * Key concepts:
 * - Attachment: A sketch point's `externalRef` field links it to model geometry
 * - Resolution: During solving, attachments are resolved to actual coordinates
 * - Projection: Point is constrained to lie on/near the resolved edge
 * 
 * Usage patterns:
 * 1. Vertex attachment: Point is fixed to a specific vertex position
 * 2. Edge attachment: Point is constrained to lie on an edge
 * 3. Edge endpoint: Point is attached to start/end of an edge
 * 4. Edge parameter: Point is attached to a parametric position on an edge
 */

import type { Vec2 } from '../num/vec2.js';
import type { Vec3 } from '../num/vec3.js';
import { sub3, dot3, add3, mul3, length3 } from '../num/vec3.js';
import type { TopoModel } from '../topo/model.js';
import { getVertexPosition, getEdgeStartVertex, getEdgeEndVertex } from '../topo/model.js';
import type { EdgeId, VertexId } from '../topo/handles.js';
import type { DatumPlane } from '../model/planes.js';
import type { SubshapeRef } from '../naming/types.js';
import type { NamingStrategy } from '../naming/evolution.js';
import type { Sketch, SketchPointId, SketchPoint } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Type of attachment for a sketch point
 */
export type AttachmentType = 'vertex' | 'edgeStart' | 'edgeEnd' | 'edgeParameter' | 'edgeProjection';

/**
 * Resolved attachment for a sketch point
 */
export interface ResolvedAttachment {
  /** Point ID in the sketch */
  pointId: SketchPointId;
  /** Type of attachment */
  type: AttachmentType;
  /** Target 3D position (in world coordinates) */
  worldPosition: Vec3;
  /** Target 2D position (in sketch plane coordinates) */
  sketchPosition: Vec2;
  /** For edge attachments: parametric t value along edge (0-1) */
  parameter?: number;
  /** Original SubshapeRef that was resolved */
  resolvedRef?: SubshapeRef;
}

/**
 * Attachment with associated constraint data
 */
export interface AttachmentConstraintData {
  /** Point ID */
  pointId: SketchPointId;
  /** Target position in sketch coordinates */
  targetX: number;
  targetY: number;
  /** Whether this is a hard constraint (fixed) or soft (weighted) */
  isHard: boolean;
  /** Weight for soft constraints (higher = stronger attachment) */
  weight: number;
}

/**
 * Result of resolving all attachments
 */
export interface AttachmentResolutionResult {
  /** Successfully resolved attachments */
  resolved: ResolvedAttachment[];
  /** Failed resolutions */
  failed: Array<{ pointId: SketchPointId; reason: string }>;
  /** Constraint data for solved positions */
  constraintData: AttachmentConstraintData[];
}

// ============================================================================
// 3D to 2D Projection
// ============================================================================

/**
 * Project a 3D world point onto a sketch plane to get 2D coordinates
 * 
 * The sketch plane is defined by origin + xAxis/yAxis, so:
 *   2D_coords = [(P - origin) · xAxis, (P - origin) · yAxis]
 */
export function projectToSketchPlane(worldPoint: Vec3, plane: DatumPlane): Vec2 {
  const relative = sub3(worldPoint, plane.surface.origin);
  return [
    dot3(relative, plane.surface.xDir),
    dot3(relative, plane.surface.yDir),
  ];
}

/**
 * Convert a 2D sketch coordinate back to 3D world coordinates
 */
export function sketchToWorld(sketchPoint: Vec2, plane: DatumPlane): Vec3 {
  const xContrib = mul3(plane.surface.xDir, sketchPoint[0]);
  const yContrib = mul3(plane.surface.yDir, sketchPoint[1]);
  return add3(add3(plane.surface.origin, xContrib), yContrib);
}

// ============================================================================
// Edge Geometry
// ============================================================================

/**
 * Get the start and end positions of an edge in world coordinates
 */
export function getEdgeEndpoints(
  model: TopoModel,
  edgeId: EdgeId
): { start: Vec3; end: Vec3 } {
  const startVertex = getEdgeStartVertex(model, edgeId);
  const endVertex = getEdgeEndVertex(model, edgeId);
  return {
    start: getVertexPosition(model, startVertex),
    end: getVertexPosition(model, endVertex),
  };
}

/**
 * Get a point at parameter t along an edge (t=0 is start, t=1 is end)
 * 
 * For now, we assume linear edges. This should be extended for curve support.
 */
export function getEdgePointAtParameter(
  model: TopoModel,
  edgeId: EdgeId,
  t: number
): Vec3 {
  const { start, end } = getEdgeEndpoints(model, edgeId);
  return [
    start[0] + t * (end[0] - start[0]),
    start[1] + t * (end[1] - start[1]),
    start[2] + t * (end[2] - start[2]),
  ];
}

/**
 * Project a point onto an edge and find the closest parameter
 */
export function projectPointOntoEdge(
  model: TopoModel,
  edgeId: EdgeId,
  point: Vec3
): { t: number; closestPoint: Vec3; distance: number } {
  const { start, end } = getEdgeEndpoints(model, edgeId);
  
  const edgeDir = sub3(end, start);
  const edgeLength = length3(edgeDir);
  
  if (edgeLength < 1e-10) {
    // Degenerate edge
    return { t: 0, closestPoint: start, distance: length3(sub3(point, start)) };
  }
  
  const toPoint = sub3(point, start);
  const t = Math.max(0, Math.min(1, dot3(toPoint, edgeDir) / (edgeLength * edgeLength)));
  
  const closestPoint = getEdgePointAtParameter(model, edgeId, t);
  const distance = length3(sub3(point, closestPoint));
  
  return { t, closestPoint, distance };
}

// ============================================================================
// Attachment Resolution
// ============================================================================

/**
 * Resolve a single external attachment for a sketch point
 */
export function resolveAttachment(
  point: SketchPoint,
  sketch: Sketch,
  model: TopoModel,
  naming: NamingStrategy
): ResolvedAttachment | { error: string } {
  const ref = point.externalRef;
  if (!ref) {
    return { error: 'Point has no external reference' };
  }
  
  // Resolve the persistent reference
  const resolveResult = naming.resolve(ref, model);
  
  if (resolveResult.status === 'not_found') {
    return { error: resolveResult.reason };
  }
  
  if (resolveResult.status === 'ambiguous') {
    return { error: `Ambiguous reference with ${resolveResult.candidates.length} candidates` };
  }
  
  const subshapeRef = resolveResult.ref;
  
  // Handle based on subshape type
  if (subshapeRef.type === 'vertex') {
    // Vertex attachment - get exact position
    const pos = getVertexPosition(model, subshapeRef.id as VertexId);
    const sketchPos = projectToSketchPlane(pos, sketch.plane);
    
    return {
      pointId: point.id,
      type: 'vertex',
      worldPosition: pos,
      sketchPosition: sketchPos,
      resolvedRef: subshapeRef,
    };
  }
  
  if (subshapeRef.type === 'edge') {
    // Edge attachment - project current point position onto edge
    const edgeId = subshapeRef.id as EdgeId;
    
    // Get current point position in world coordinates
    const currentSketchPos: Vec2 = [point.x, point.y];
    const currentWorldPos = sketchToWorld(currentSketchPos, sketch.plane);
    
    // Project onto edge
    const { t, closestPoint } = projectPointOntoEdge(model, edgeId, currentWorldPos);
    const sketchPos = projectToSketchPlane(closestPoint, sketch.plane);
    
    // Determine attachment type based on t value
    let type: AttachmentType;
    if (t < 0.001) {
      type = 'edgeStart';
    } else if (t > 0.999) {
      type = 'edgeEnd';
    } else {
      type = 'edgeProjection';
    }
    
    return {
      pointId: point.id,
      type,
      worldPosition: closestPoint,
      sketchPosition: sketchPos,
      parameter: t,
      resolvedRef: subshapeRef,
    };
  }
  
  return { error: `Unsupported attachment type: ${subshapeRef.type}` };
}

/**
 * Resolve all external attachments in a sketch
 */
export function resolveAllAttachments(
  sketch: Sketch,
  model: TopoModel,
  naming: NamingStrategy
): AttachmentResolutionResult {
  const resolved: ResolvedAttachment[] = [];
  const failed: Array<{ pointId: SketchPointId; reason: string }> = [];
  const constraintData: AttachmentConstraintData[] = [];
  
  for (const [id, point] of sketch.points) {
    if (!point.externalRef) continue;
    
    const result = resolveAttachment(point, sketch, model, naming);
    
    if ('error' in result) {
      failed.push({ pointId: id, reason: result.error });
    } else {
      resolved.push(result);
      
      // Create constraint data
      constraintData.push({
        pointId: id,
        targetX: result.sketchPosition[0],
        targetY: result.sketchPosition[1],
        // Vertex attachments are hard constraints, edge projections are softer
        isHard: result.type === 'vertex',
        weight: result.type === 'vertex' ? 100 : 10,
      });
    }
  }
  
  return { resolved, failed, constraintData };
}

/**
 * Apply resolved attachments by updating point positions
 * 
 * This is useful for initializing sketch points to their attached positions
 * before solving.
 */
export function applyResolvedAttachments(
  sketch: Sketch,
  attachments: ResolvedAttachment[]
): void {
  for (const attachment of attachments) {
    const point = sketch.points.get(attachment.pointId);
    if (point) {
      point.x = attachment.sketchPosition[0];
      point.y = attachment.sketchPosition[1];
    }
  }
}

/**
 * Check if a sketch has any external attachments
 */
export function hasExternalAttachments(sketch: Sketch): boolean {
  for (const [_, point] of sketch.points) {
    if (point.externalRef) return true;
  }
  return false;
}

/**
 * Get all points with external attachments
 */
export function getAttachedPoints(sketch: Sketch): SketchPoint[] {
  const attached: SketchPoint[] = [];
  for (const [_, point] of sketch.points) {
    if (point.externalRef) {
      attached.push(point);
    }
  }
  return attached;
}

/**
 * Create fixed constraints from resolved attachments
 * 
 * This generates constraint objects that can be added to the sketch's
 * constraint list for solving.
 */
export function createAttachmentConstraints(
  constraintData: AttachmentConstraintData[]
): Array<{
  kind: 'fixed';
  point: SketchPointId;
  x: number;
  y: number;
  weight?: number;
}> {
  return constraintData.map(data => ({
    kind: 'fixed' as const,
    point: data.pointId,
    x: data.targetX,
    y: data.targetY,
    weight: data.isHard ? undefined : data.weight,
  }));
}
