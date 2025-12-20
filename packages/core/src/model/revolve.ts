/**
 * Revolve operation
 * 
 * Creates a solid body by revolving a 2D profile around an axis.
 */

import type { Vec3 } from '../num/vec3.js';
import { vec3, normalize3, add3, sub3, mul3, cross3, dot3, length3 } from '../num/vec3.js';
import { createPlaneSurface } from '../geom/surface.js';
import { TopoModel } from '../topo/TopoModel.js';
import type { BodyId, EdgeId, VertexId, HalfEdgeId, FaceId, ShellId } from '../topo/handles.js';
import type { SketchProfile } from './sketchProfile.js';
import { getLoopVertices } from './sketchProfile.js';
import { planeToWorld } from './planes.js';
import type { NamingStrategy, FeatureId, PersistentRef } from '../naming/index.js';
import {
  faceRef,
  revolveSideSelector,
  revolveStartCapSelector,
  revolveEndCapSelector,
  computeFaceFingerprint,
} from '../naming/index.js';

export type RevolveOperation = 'add' | 'cut';

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

export function revolve(
  model: TopoModel,
  profile: SketchProfile,
  options: RevolveOptions
): RevolveResult {
  const { operation, axis, namingStrategy } = options;
  const angle = options.angle ?? 2 * Math.PI;
  
  if (profile.loops.length === 0) {
    return { success: false, error: 'Profile has no loops' };
  }
  
  if (Math.abs(angle) < model.ctx.tol.angle) {
    return { success: false, error: 'Revolve angle is too small' };
  }
  
  if (operation === 'cut' && !options.targetBody) {
    return { success: false, error: 'Cut operation requires a target body' };
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
    return { success: false, error: 'Profile has no outer loop' };
  }
  
  const vertices2D = getLoopVertices(loop);
  if (vertices2D.length < 3) {
    return { success: false, error: 'Profile loop has less than 3 vertices' };
  }
  
  const profileVertices3D: Vec3[] = vertices2D.map(v2d => 
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
  
  for (let v = 0; v < nProfile; v++) {
    sideFaces.push([]);
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
      
      const p0 = profileVertices3D[v];
      const p1 = profileVertices3D[nextV];
      
      const midPoint3D: Vec3 = [
        (p0[0] + p1[0]) / 2,
        (p0[1] + p1[1]) / 2,
        (p0[2] + p1[2]) / 2,
      ];
      const midAngle = (s + 0.5) * angleStep;
      const rotatedMid = rotatePointAroundAxis(midPoint3D, axisOrigin, axisDir, midAngle);
      
      const axisPoint = projectPointOntoAxis(rotatedMid, axisOrigin, axisDir);
      let radialDir = sub3(rotatedMid, axisPoint);
      const radialLen = length3(radialDir);
      if (radialLen > model.ctx.tol.length) {
        radialDir = normalize3(radialDir);
      } else {
        radialDir = computePerpendicularToAxis(axisDir);
      }
      
      const faceNormal = radialDir;
      const surface = model.addSurface(createPlaneSurface(
        rotatedMid,
        faceNormal,
        axisDir
      ));
      
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
      endCapRef = namingStrategy.recordBirth(
        featureId,
        revolveEndCapSelector(),
        ref,
        fingerprint
      );
    }
  }
  
  if (operation === 'cut') {
    return {
      success: true,
      body,
      featureId,
      sideRefs,
      startCapRef,
      endCapRef,
      error: 'Note: Cut operation currently returns the tool body. Boolean subtraction pending.'
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

function projectPointOntoAxis(point: Vec3, axisOrigin: Vec3, axisDir: Vec3): Vec3 {
  const toPoint = sub3(point, axisOrigin);
  const projLen = dot3(toPoint, axisDir);
  return add3(axisOrigin, mul3(axisDir, projLen));
}

function rotatePointAroundAxis(
  point: Vec3,
  axisOrigin: Vec3,
  axisDir: Vec3,
  angle: number
): Vec3 {
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

function computePerpendicularToAxis(axisDir: Vec3): Vec3 {
  const absX = Math.abs(axisDir[0]);
  const absY = Math.abs(axisDir[1]);
  const absZ = Math.abs(axisDir[2]);
  
  let candidate: Vec3;
  if (absX <= absY && absX <= absZ) {
    candidate = vec3(1, 0, 0);
  } else if (absY <= absZ) {
    candidate = vec3(0, 1, 0);
  } else {
    candidate = vec3(0, 0, 1);
  }
  
  return normalize3(cross3(axisDir, candidate));
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
  
  const positions: Vec3[] = ringVertices.map(v => model.getVertexPosition(v));
  
  const v01 = sub3(positions[1], positions[0]);
  const v02 = sub3(positions[2], positions[0]);
  let normal = normalize3(cross3(v01, v02));
  
  if (isStart) {
    normal = mul3(normal, -1);
  }
  
  const surface = model.addSurface(createPlaneSurface(
    positions[0],
    normal,
    normalize3(v01)
  ));
  
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
