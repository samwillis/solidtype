/**
 * External Edge Attachment Resolution
 *
 * This module handles the resolution of sketch point attachments to external
 * model geometry (edges, vertices) during solving.
 */

import type { Vec2 } from "../num/vec2.js";
import type { Vec3 } from "../num/vec3.js";
import { sub3, dot3, add3, mul3, length3 } from "../num/vec3.js";
import { TopoModel } from "../topo/TopoModel.js";
import type { EdgeId, VertexId } from "../topo/handles.js";
import type { DatumPlane } from "../model/planes.js";
import type { SubshapeRef } from "../naming/types.js";
import type { NamingStrategy } from "../naming/evolution.js";
import type { Sketch, SketchPointId, SketchPoint } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export type AttachmentType =
  | `vertex`
  | `edgeStart`
  | `edgeEnd`
  | `edgeParameter`
  | `edgeProjection`;

export interface ResolvedAttachment {
  pointId: SketchPointId;
  type: AttachmentType;
  worldPosition: Vec3;
  sketchPosition: Vec2;
  parameter?: number;
  resolvedRef?: SubshapeRef;
}

export interface AttachmentConstraintData {
  pointId: SketchPointId;
  targetX: number;
  targetY: number;
  isHard: boolean;
  weight: number;
}

export interface AttachmentResolutionResult {
  resolved: ResolvedAttachment[];
  failed: Array<{ pointId: SketchPointId; reason: string }>;
  constraintData: AttachmentConstraintData[];
}

// ============================================================================
// 3D to 2D Projection
// ============================================================================

export function projectToSketchPlane(worldPoint: Vec3, plane: DatumPlane): Vec2 {
  const relative = sub3(worldPoint, plane.surface.origin);
  return [dot3(relative, plane.surface.xDir), dot3(relative, plane.surface.yDir)];
}

export function sketchToWorld(sketchPoint: Vec2, plane: DatumPlane): Vec3 {
  const xContrib = mul3(plane.surface.xDir, sketchPoint[0]);
  const yContrib = mul3(plane.surface.yDir, sketchPoint[1]);
  return add3(add3(plane.surface.origin, xContrib), yContrib);
}

// ============================================================================
// Edge Geometry
// ============================================================================

export function getEdgeEndpoints(model: TopoModel, edgeId: EdgeId): { start: Vec3; end: Vec3 } {
  const startVertex = model.getEdgeStartVertex(edgeId);
  const endVertex = model.getEdgeEndVertex(edgeId);
  return {
    start: model.getVertexPosition(startVertex),
    end: model.getVertexPosition(endVertex),
  };
}

export function getEdgePointAtParameter(model: TopoModel, edgeId: EdgeId, t: number): Vec3 {
  const { start, end } = getEdgeEndpoints(model, edgeId);
  return [
    start[0] + t * (end[0] - start[0]),
    start[1] + t * (end[1] - start[1]),
    start[2] + t * (end[2] - start[2]),
  ];
}

export function projectPointOntoEdge(
  model: TopoModel,
  edgeId: EdgeId,
  point: Vec3
): { t: number; closestPoint: Vec3; distance: number } {
  const { start, end } = getEdgeEndpoints(model, edgeId);

  const edgeDir = sub3(end, start);
  const edgeLength = length3(edgeDir);

  if (edgeLength < 1e-10) {
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

export function resolveAttachment(
  point: SketchPoint,
  sketch: Sketch,
  model: TopoModel,
  naming: NamingStrategy
): ResolvedAttachment | { error: string } {
  const ref = point.externalRef;
  if (!ref) {
    return { error: `Point has no external reference` };
  }

  const resolveResult = naming.resolve(ref, model);

  if (resolveResult.status === `not_found`) {
    return { error: resolveResult.reason };
  }

  if (resolveResult.status === `ambiguous`) {
    return { error: `Ambiguous reference with ${resolveResult.candidates.length} candidates` };
  }

  const subshapeRef = resolveResult.ref;

  if (subshapeRef.type === `vertex`) {
    const pos = model.getVertexPosition(subshapeRef.id as VertexId);
    const sketchPos = projectToSketchPlane(pos, sketch.plane);

    return {
      pointId: point.id,
      type: `vertex`,
      worldPosition: pos,
      sketchPosition: sketchPos,
      resolvedRef: subshapeRef,
    };
  }

  if (subshapeRef.type === `edge`) {
    const edgeId = subshapeRef.id as EdgeId;

    const currentSketchPos: Vec2 = [point.x, point.y];
    const currentWorldPos = sketchToWorld(currentSketchPos, sketch.plane);

    const { t, closestPoint } = projectPointOntoEdge(model, edgeId, currentWorldPos);
    const sketchPos = projectToSketchPlane(closestPoint, sketch.plane);

    let type: AttachmentType;
    if (t < 0.001) {
      type = `edgeStart`;
    } else if (t > 0.999) {
      type = `edgeEnd`;
    } else {
      type = `edgeProjection`;
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

    if (`error` in result) {
      failed.push({ pointId: id, reason: result.error });
    } else {
      resolved.push(result);

      constraintData.push({
        pointId: id,
        targetX: result.sketchPosition[0],
        targetY: result.sketchPosition[1],
        isHard: result.type === `vertex`,
        weight: result.type === `vertex` ? 100 : 10,
      });
    }
  }

  return { resolved, failed, constraintData };
}

export function applyResolvedAttachments(sketch: Sketch, attachments: ResolvedAttachment[]): void {
  for (const attachment of attachments) {
    const point = sketch.points.get(attachment.pointId);
    if (point) {
      point.x = attachment.sketchPosition[0];
      point.y = attachment.sketchPosition[1];
    }
  }
}

export function hasExternalAttachments(sketch: Sketch): boolean {
  for (const [_, point] of sketch.points) {
    if (point.externalRef) return true;
  }
  return false;
}

export function getAttachedPoints(sketch: Sketch): SketchPoint[] {
  const attached: SketchPoint[] = [];
  for (const [_, point] of sketch.points) {
    if (point.externalRef) {
      attached.push(point);
    }
  }
  return attached;
}

export function createAttachmentConstraints(constraintData: AttachmentConstraintData[]): Array<{
  kind: `fixed`;
  point: SketchPointId;
  x: number;
  y: number;
  weight?: number;
}> {
  return constraintData.map((data) => ({
    kind: `fixed` as const,
    point: data.pointId,
    x: data.targetX,
    y: data.targetY,
    weight: data.isHard ? undefined : data.weight,
  }));
}
