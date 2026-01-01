/**
 * Revolve operation
 *
 * Creates a solid body by revolving a 2D profile around an axis.
 */

import type { Vec2 } from "../num/vec2.js";
import type { Vec3 } from "../num/vec3.js";
import { vec2 } from "../num/vec2.js";
import { vec3, normalize3, add3, sub3, mul3, cross3, dot3, length3 } from "../num/vec3.js";
import type { Curve2D } from "../geom/curve2d.js";
import { evalCurve2D } from "../geom/curve2d.js";
import { createPlaneSurface } from "../geom/surface.js";
import type { SurfaceIndex } from "../topo/handles.js";
import { worldToPlane, planeToWorld } from "./planes.js";
import { TopoModel } from "../topo/TopoModel.js";
import type { BodyId, EdgeId, VertexId, HalfEdgeId, FaceId, ShellId } from "../topo/handles.js";
import type { SketchProfile } from "./sketchProfile.js";
import type { ProfileLoop } from "./sketchProfile.js";
import type { NamingStrategy, FeatureId, PersistentRef } from "../naming/index.js";
import {
  faceRef,
  revolveSideSelector,
  revolveStartCapSelector,
  revolveEndCapSelector,
  computeFaceFingerprint,
} from "../naming/index.js";

export type RevolveOperation = `add` | `cut`;

export interface RevolveAxis {
  origin: Vec3;
  direction: Vec3;
}

export interface RevolveOptions {
  operation: RevolveOperation;
  axis: RevolveAxis;
  angle?: number;
  segments?: number;
  targetBody?: BodyId;
  namingStrategy?: NamingStrategy;
  featureId?: FeatureId;
}

export interface RevolveResult {
  success: boolean;
  body?: BodyId;
  error?: string;
  featureId?: FeatureId;
  sideRefs?: PersistentRef[][];
  startCapRef?: PersistentRef;
  endCapRef?: PersistentRef;
}

const MIN_FULL_SEGMENTS = 8;
const SEGMENTS_PER_RADIAN = Math.PI / 12;

const ARC_MIN_SEGMENTS = 8;
const ARC_SEGMENTS_PER_RADIAN = 8;

export function revolve(
  model: TopoModel,
  profile: SketchProfile,
  options: RevolveOptions
): RevolveResult {
  const { operation, axis, namingStrategy } = options;
  const angle = options.angle ?? 2 * Math.PI;

  if (profile.loops.length === 0) {
    return { success: false, error: `Profile has no loops` };
  }

  if (Math.abs(angle) < model.ctx.tol.angle) {
    return { success: false, error: `Revolve angle is too small` };
  }

  if (operation === `cut` && !options.targetBody) {
    return { success: false, error: `Cut operation requires a target body` };
  }

  const featureId = namingStrategy
    ? (options.featureId ?? namingStrategy.allocateFeatureId())
    : undefined;

  const axisDir = normalize3(axis.direction);
  const axisOrigin = axis.origin;

  const isFullRevolution = Math.abs(Math.abs(angle) - 2 * Math.PI) < model.ctx.tol.angle;
  let segments = options.segments;
  if (segments === undefined) {
    segments = Math.max(
      isFullRevolution ? MIN_FULL_SEGMENTS : 4,
      Math.ceil(Math.abs(angle) / SEGMENTS_PER_RADIAN)
    );
  }

  const body = model.addBody();
  const shell = model.addShell(true);
  model.addShellToBody(body, shell);

  const sideFaces: FaceId[][] = [];

  const loop = profile.loops[0];
  if (!loop) {
    return { success: false, error: `Profile has no outer loop` };
  }

  const { vertices2D, segmentCurves } = sampleProfileLoop(loop);
  if (vertices2D.length < 3 || segmentCurves.length !== vertices2D.length) {
    return { success: false, error: `Profile loop has less than 3 vertices` };
  }

  const profileVertices3D: Vec3[] = vertices2D.map((v2d) =>
    planeToWorld(profile.plane, v2d[0], v2d[1])
  );

  const rings: VertexId[][] = [];
  const angleStep = angle / segments;

  for (let s = 0; s <= segments; s++) {
    if (isFullRevolution && s === segments) {
      rings.push(rings[0]);
      continue;
    }

    const rotAngle = s * angleStep;
    const ring: VertexId[] = [];

    for (const v3d of profileVertices3D) {
      const rotated = rotatePointAroundAxis(v3d, axisOrigin, axisDir, rotAngle);
      ring.push(model.addVertex(rotated[0], rotated[1], rotated[2]));
    }

    rings.push(ring);
  }

  const nProfile = profileVertices3D.length;
  const nSegments = isFullRevolution ? segments : segments + 1;

  for (let v = 0; v < nProfile; v++) sideFaces.push([]);

  // Precompute analytic side surface per profile segment (one per loop edge)
  const sideSurfaceBySegment: SurfaceIndex[] = [];
  for (let v = 0; v < nProfile; v++) {
    const nextV = (v + 1) % nProfile;
    const curve = segmentCurves[v];
    const p0 = profileVertices3D[v];
    const p1 = profileVertices3D[nextV];
    sideSurfaceBySegment.push(
      model.addSurface(createRevolvedSurface(model, profile, axisOrigin, axisDir, curve, p0, p1))
    );
  }

  for (let s = 0; s < segments; s++) {
    const ring0 = rings[s];
    const ring1 = rings[(s + 1) % nSegments];

    for (let v = 0; v < nProfile; v++) {
      const nextV = (v + 1) % nProfile;

      const v00 = ring0[v];
      const v01 = ring0[nextV];
      const v10 = ring1[v];
      const v11 = ring1[nextV];

      const edgeRing0 = model.addEdge(v00, v01);
      const edgeRing1 = model.addEdge(v10, v11);
      const edgeRev0 = model.addEdge(v00, v10);
      const edgeRev1 = model.addEdge(v01, v11);

      const surface = sideSurfaceBySegment[v];

      const halfEdges: HalfEdgeId[] = [
        model.addHalfEdge(edgeRing0, 1),
        model.addHalfEdge(edgeRev1, 1),
        model.addHalfEdge(edgeRing1, -1),
        model.addHalfEdge(edgeRev0, -1),
      ];

      const faceLoop = model.addLoop(halfEdges);
      const face = model.addFace(surface, false);
      model.addLoopToFace(face, faceLoop);
      model.addFaceToShell(shell, face);

      sideFaces[v].push(face);
    }
  }

  let startCapFace: FaceId | undefined;
  let endCapFace: FaceId | undefined;

  if (!isFullRevolution) {
    startCapFace = createRevolveCap(model, shell, profileVertices3D, rings[0], true);
    endCapFace = createRevolveCap(model, shell, profileVertices3D, rings[segments], false);
  }

  setupTwinHalfEdges(model);

  let sideRefs: PersistentRef[][] | undefined;
  let startCapRef: PersistentRef | undefined;
  let endCapRef: PersistentRef | undefined;

  if (namingStrategy && featureId !== undefined) {
    sideRefs = sideFaces.map((profileFaces, profileSegment) =>
      profileFaces.map((faceId, ringSegment) => {
        const ref = faceRef(body, faceId);
        const fingerprint = computeFaceFingerprint(model, faceId);
        return namingStrategy.recordBirth(
          featureId,
          revolveSideSelector(profileSegment, ringSegment),
          ref,
          fingerprint
        );
      })
    );

    if (startCapFace !== undefined) {
      const ref = faceRef(body, startCapFace);
      const fingerprint = computeFaceFingerprint(model, startCapFace);
      startCapRef = namingStrategy.recordBirth(
        featureId,
        revolveStartCapSelector(),
        ref,
        fingerprint
      );
    }

    if (endCapFace !== undefined) {
      const ref = faceRef(body, endCapFace);
      const fingerprint = computeFaceFingerprint(model, endCapFace);
      endCapRef = namingStrategy.recordBirth(featureId, revolveEndCapSelector(), ref, fingerprint);
    }
  }

  if (operation === `cut`) {
    return {
      success: true,
      body,
      featureId,
      sideRefs,
      startCapRef,
      endCapRef,
      error: `Note: Cut operation currently returns the tool body. Boolean subtraction pending.`,
    };
  }

  return {
    success: true,
    body,
    featureId,
    sideRefs,
    startCapRef,
    endCapRef,
  };
}

function arcAngleSpan(curve: Extract<Curve2D, { kind: `arc` }>): number {
  let span: number;
  if (curve.ccw) {
    span = curve.endAngle - curve.startAngle;
    if (span < 0) span += 2 * Math.PI;
  } else {
    span = curve.startAngle - curve.endAngle;
    if (span < 0) span += 2 * Math.PI;
  }
  return span;
}

function sampleProfileLoop(loop: ProfileLoop): { vertices2D: Vec2[]; segmentCurves: Curve2D[] } {
  const vertices: Vec2[] = [];
  const segmentCurves: Curve2D[] = [];

  for (const curve of loop.curves) {
    if (curve.kind === `line`) {
      vertices.push(evalCurve2D(curve, 0));
      segmentCurves.push(curve);
      continue;
    }

    if (curve.kind === `polyline`) {
      // For polylines, sample each segment
      const pts = curve.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        vertices.push(pts[i]);
        segmentCurves.push(curve);
      }
      continue;
    }

    // Arc case
    const span = arcAngleSpan(curve);
    const segments = Math.max(
      ARC_MIN_SEGMENTS,
      Math.ceil(Math.abs(span) * ARC_SEGMENTS_PER_RADIAN)
    );
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      vertices.push(evalCurve2D(curve, t0));
      // Each sampled segment still maps to the same source curve
      segmentCurves.push(curve);
      // avoid duplicating last point; next segment will add its own start
      if (i === segments - 1) {
        // ensure closure by letting next original curve start handle continuity
      }
      void t1;
    }
  }

  // Remove duplicate closing vertex if present.
  if (vertices.length >= 2) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    const dx = last[0] - first[0];
    const dy = last[1] - first[1];
    if (Math.hypot(dx, dy) < 1e-12) {
      vertices.pop();
      segmentCurves.pop();
    }
  }

  return { vertices2D: vertices, segmentCurves };
}

function clamp01(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

function distancePointToAxis(point: Vec3, axisOrigin: Vec3, axisDirUnit: Vec3): number {
  const ap = sub3(point, axisOrigin);
  const t = dot3(ap, axisDirUnit);
  const proj = add3(axisOrigin, mul3(axisDirUnit, t));
  return length3(sub3(point, proj));
}

function intersectLines2D(
  p0: Vec2,
  d0: Vec2,
  p1: Vec2,
  d1: Vec2
): { ok: true; t0: number; t1: number; point: Vec2 } | { ok: false } {
  const det = d0[0] * d1[1] - d0[1] * d1[0];
  if (Math.abs(det) < 1e-12) return { ok: false };
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const t0 = (dx * d1[1] - dy * d1[0]) / det;
  const t1 = (dx * d0[1] - dy * d0[0]) / det;
  return { ok: true, t0, t1, point: vec2(p0[0] + d0[0] * t0, p0[1] + d0[1] * t0) };
}

function createRevolvedSurface(
  model: TopoModel,
  profile: SketchProfile,
  axisOrigin: Vec3,
  axisDirUnit: Vec3,
  curve: Curve2D,
  p0: Vec3,
  p1: Vec3
) {
  // Axis in the profile plane coordinate system (for cone apex computation)
  const plane = profile.plane;
  const axisO2 = worldToPlane(plane, axisOrigin);
  const axisDir2: Vec2 = vec2(
    dot3(axisDirUnit, plane.surface.xDir),
    dot3(axisDirUnit, plane.surface.yDir)
  );

  if (curve.kind === `arc`) {
    const center3 = planeToWorld(plane, curve.center[0], curve.center[1]);
    const centerOnAxis = projectPointOntoAxis(center3, axisOrigin, axisDirUnit);
    const majorRadius = length3(sub3(center3, centerOnAxis));
    const minorRadius = curve.radius;
    if (majorRadius < model.ctx.tol.length) {
      return { kind: `sphere`, center: center3, radius: minorRadius } as const;
    }
    return {
      kind: `torus`,
      center: centerOnAxis,
      axis: axisDirUnit,
      majorRadius,
      minorRadius,
    } as const;
  }

  // Line segment: cylinder if parallel to axis, else cone
  const lineDir = normalize3(sub3(p1, p0));
  const parallel = length3(cross3(lineDir, axisDirUnit)) < model.ctx.tol.angle;
  if (parallel) {
    const radius = distancePointToAxis(p0, axisOrigin, axisDirUnit);
    return { kind: `cylinder`, center: axisOrigin, axis: axisDirUnit, radius } as const;
  }

  const p0_2: Vec2 = vec2(...worldToPlane(plane, p0));
  const p1_2: Vec2 = vec2(...worldToPlane(plane, p1));
  const dLine: Vec2 = vec2(p1_2[0] - p0_2[0], p1_2[1] - p0_2[1]);
  const hit = intersectLines2D(vec2(axisO2[0], axisO2[1]), axisDir2, p0_2, dLine);
  if (!hit.ok) {
    const radius = distancePointToAxis(p0, axisOrigin, axisDirUnit);
    return { kind: `cylinder`, center: axisOrigin, axis: axisDirUnit, radius } as const;
  }
  const apex = planeToWorld(plane, hit.point[0], hit.point[1]);
  const cos = clamp01(Math.abs(dot3(lineDir, axisDirUnit)));
  const halfAngle = Math.acos(cos);
  return { kind: `cone`, apex, axis: axisDirUnit, halfAngle } as const;
}

function projectPointOntoAxis(point: Vec3, axisOrigin: Vec3, axisDir: Vec3): Vec3 {
  const toPoint = sub3(point, axisOrigin);
  const projLen = dot3(toPoint, axisDir);
  return add3(axisOrigin, mul3(axisDir, projLen));
}

function rotatePointAroundAxis(point: Vec3, axisOrigin: Vec3, axisDir: Vec3, angle: number): Vec3 {
  const p = sub3(point, axisOrigin);
  const k = axisDir;

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const kCrossP = cross3(k, p);
  const kDotP = dot3(k, p);

  const rotated: Vec3 = [
    p[0] * cosA + kCrossP[0] * sinA + k[0] * kDotP * (1 - cosA),
    p[1] * cosA + kCrossP[1] * sinA + k[1] * kDotP * (1 - cosA),
    p[2] * cosA + kCrossP[2] * sinA + k[2] * kDotP * (1 - cosA),
  ];

  return add3(axisOrigin, rotated);
}

function createRevolveCap(
  model: TopoModel,
  shell: ShellId,
  _profileVertices3D: Vec3[],
  ringVertices: VertexId[],
  isStart: boolean
): FaceId | undefined {
  const n = ringVertices.length;
  if (n < 3) return undefined;

  const positions: Vec3[] = ringVertices.map((v) => model.getVertexPosition(v));

  const v01 = sub3(positions[1], positions[0]);
  const v02 = sub3(positions[2], positions[0]);
  let normal = normalize3(cross3(v01, v02));

  if (isStart) {
    normal = mul3(normal, -1);
  }

  const surface = model.addSurface(createPlaneSurface(positions[0], normal, normalize3(v01)));

  const edges: EdgeId[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    edges.push(model.addEdge(ringVertices[i], ringVertices[j]));
  }

  const halfEdges: HalfEdgeId[] = [];
  if (isStart) {
    for (let i = n - 1; i >= 0; i--) {
      halfEdges.push(model.addHalfEdge(edges[i], -1));
    }
  } else {
    for (let i = 0; i < n; i++) {
      halfEdges.push(model.addHalfEdge(edges[i], 1));
    }
  }

  const faceLoop = model.addLoop(halfEdges);
  const face = model.addFace(surface, false);
  model.addLoopToFace(face, faceLoop);
  model.addFaceToShell(shell, face);
  return face;
}

function setupTwinHalfEdges(model: TopoModel): void {
  const edgeHalfEdges = new Map<number, HalfEdgeId[]>();
  const heCount = model.getHalfEdgeCount();

  for (let i = 0; i < heCount; i++) {
    const edge = model.getHalfEdgeEdge(i as HalfEdgeId);
    if (edge < 0) continue;

    const halfEdges = edgeHalfEdges.get(edge) || [];
    halfEdges.push(i as HalfEdgeId);
    edgeHalfEdges.set(edge, halfEdges);
  }

  for (const [_edge, halfEdges] of edgeHalfEdges) {
    if (halfEdges.length === 2) {
      model.setHalfEdgeTwin(halfEdges[0], halfEdges[1]);
    }
  }
}

export function createAxisFromPoints(point1: Vec3, point2: Vec3): RevolveAxis {
  return {
    origin: point1,
    direction: sub3(point2, point1),
  };
}

export function createAxisFromDirection(origin: Vec3, direction: Vec3): RevolveAxis {
  return { origin, direction };
}

export const X_AXIS_REVOLVE: RevolveAxis = {
  origin: vec3(0, 0, 0),
  direction: vec3(1, 0, 0),
};

export const Y_AXIS_REVOLVE: RevolveAxis = {
  origin: vec3(0, 0, 0),
  direction: vec3(0, 1, 0),
};

export const Z_AXIS_REVOLVE: RevolveAxis = {
  origin: vec3(0, 0, 0),
  direction: vec3(0, 0, 1),
};
