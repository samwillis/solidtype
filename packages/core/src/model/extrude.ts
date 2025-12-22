/**
 * Extrude operation
 * 
 * Creates a solid body by extruding a 2D profile along a direction.
 * Supports both "add" (create new body) and "cut" (subtract from existing body)
 * operations.
 * 
 * Integrates with the persistent naming system to track created faces and edges.
 */

import type { Vec2 } from '../num/vec2.js';
import type { Vec3 } from '../num/vec3.js';
import { vec3, normalize3, add3, mul3, cross3 } from '../num/vec3.js';
import { evalCurve2D, type Curve2D, type Arc2D } from '../geom/curve2d.js';
import { createPlaneSurface, type CylinderSurface } from '../geom/surface.js';
import { TopoModel } from '../topo/TopoModel.js';
import type { BodyId, EdgeId, VertexId, HalfEdgeId, FaceId, ShellId, SurfaceIndex } from '../topo/handles.js';
import type { SketchProfile, ProfileLoop } from './sketchProfile.js';
import { planeToWorld } from './planes.js';
import { computeFacePCurves } from './pcurveHelpers.js';
import type { NamingStrategy, FeatureId, PersistentRef } from '../naming/index.js';
import {
  faceRef,
  edgeRef,
  extrudeTopCapSelector,
  extrudeBottomCapSelector,
  extrudeSideSelector,
  extrudeSideEdgeSelector,
  extrudeTopEdgeSelector,
  extrudeBottomEdgeSelector,
  computeFaceFingerprint,
  computeEdgeFingerprint,
} from '../naming/index.js';

/**
 * Extrude operation type
 */
export type ExtrudeOperation = 'add' | 'cut';

/**
 * Extrude options
 */
export interface ExtrudeOptions {
  operation: ExtrudeOperation;
  distance: number;
  direction?: Vec3;
  targetBody?: BodyId;
  symmetric?: boolean;
  namingStrategy?: NamingStrategy;
  featureId?: FeatureId;
}

/**
 * Result of an extrude operation
 */
export interface ExtrudeResult {
  success: boolean;
  body?: BodyId;
  error?: string;
  featureId?: FeatureId;
  topCapRefs?: PersistentRef[];
  bottomCapRefs?: PersistentRef[];
  sideRefs?: PersistentRef[][];
  sideEdgeRefs?: PersistentRef[][];
  topEdgeRefs?: PersistentRef[][];
  bottomEdgeRefs?: PersistentRef[][];
}

interface ExtrudeVertexData {
  bottomVertices: VertexId[];
  topVertices: VertexId[];
}

interface ExtrudeEdgeData {
  bottomEdges: EdgeId[];
  topEdges: EdgeId[];
  sideEdges: EdgeId[];
}

interface SampledLoop {
  vertices: Vec2[];
  segmentCurves: Curve2D[]; // curve source for each edge i -> (i+1)%n
}

const ARC_MIN_SEGMENTS = 12;
const ARC_SEGMENTS_PER_RADIAN = Math.PI / 18; // ~10 degrees

/**
 * Extrude a sketch profile to create a solid body
 */
export function extrude(
  model: TopoModel,
  profile: SketchProfile,
  options: ExtrudeOptions
): ExtrudeResult {
  const { operation, distance, namingStrategy } = options;
  
  if (profile.loops.length === 0) {
    return { success: false, error: 'Profile has no loops' };
  }
  
  if (Math.abs(distance) < model.ctx.tol.length) {
    return { success: false, error: 'Extrude distance is too small' };
  }
  
  if (operation === 'cut' && !options.targetBody) {
    return { success: false, error: 'Cut operation requires a target body' };
  }
  
  let direction = options.direction ?? profile.plane.surface.normal;
  direction = normalize3(direction);
  
  let startOffset = 0;
  let endOffset = distance;
  
  if (options.symmetric) {
    startOffset = -Math.abs(distance) / 2;
    endOffset = Math.abs(distance) / 2;
  }
  
  const featureId = namingStrategy 
    ? (options.featureId ?? namingStrategy.allocateFeatureId())
    : undefined;
  
  const body = model.addBody();
  const shell = model.addShell(true);
  model.addShellToBody(body, shell);
  
  const topCapFaces: FaceId[] = [];
  const bottomCapFaces: FaceId[] = [];
  const sideFaces: FaceId[][] = [];
  const sideEdges: EdgeId[][] = [];
  const topEdges: EdgeId[][] = [];
  const bottomEdges: EdgeId[][] = [];
  
  for (let loopIdx = 0; loopIdx < profile.loops.length; loopIdx++) {
    const loop = profile.loops[loopIdx];
    
    const sampled = sampleProfileLoop(loop);
    const vertices2D = sampled.vertices;
    if (vertices2D.length < 3) continue;
    
    const vertexData = createExtrudeVertices(
      model, profile, vertices2D, direction, startOffset, endOffset
    );
    
    const edgeData = createExtrudeEdges(model, vertexData);
    
    sideEdges.push([...edgeData.sideEdges]);
    topEdges.push([...edgeData.topEdges]);
    bottomEdges.push([...edgeData.bottomEdges]);
    
    const isOuterLoop = loop.isOuter;
    
    const bottomFace = createBottomFace(model, shell, profile, vertexData, edgeData, isOuterLoop, direction, startOffset);
    bottomCapFaces.push(bottomFace);
    
    const topFace = createTopFace(model, shell, profile, vertexData, edgeData, direction, isOuterLoop, endOffset);
    topCapFaces.push(topFace);
    
    const loopSideFaces = createSideFaces(
      model,
      shell,
      profile,
      sampled.segmentCurves,
      vertexData,
      edgeData,
      direction,
      startOffset,
      isOuterLoop
    );
    sideFaces.push(loopSideFaces);
  }
  
  setupTwinHalfEdges(model);
  
  let topCapRefs: PersistentRef[] | undefined;
  let bottomCapRefs: PersistentRef[] | undefined;
  let sideRefs: PersistentRef[][] | undefined;
  let sideEdgeRefs: PersistentRef[][] | undefined;
  let topEdgeRefs: PersistentRef[][] | undefined;
  let bottomEdgeRefs: PersistentRef[][] | undefined;
  
  if (namingStrategy && featureId !== undefined) {
    topCapRefs = topCapFaces.map((faceId, loopIdx) => {
      const ref = faceRef(body, faceId);
      const fingerprint = computeFaceFingerprint(model, faceId);
      return namingStrategy.recordBirth(featureId, extrudeTopCapSelector(loopIdx), ref, fingerprint);
    });
    
    bottomCapRefs = bottomCapFaces.map((faceId, loopIdx) => {
      const ref = faceRef(body, faceId);
      const fingerprint = computeFaceFingerprint(model, faceId);
      return namingStrategy.recordBirth(featureId, extrudeBottomCapSelector(loopIdx), ref, fingerprint);
    });
    
    sideRefs = sideFaces.map((loopFaces, loopIdx) => 
      loopFaces.map((faceId, segIdx) => {
        const ref = faceRef(body, faceId);
        const fingerprint = computeFaceFingerprint(model, faceId);
        return namingStrategy.recordBirth(featureId, extrudeSideSelector(loopIdx, segIdx), ref, fingerprint);
      })
    );
    
    sideEdgeRefs = sideEdges.map((loopEdges, loopIdx) =>
      loopEdges.map((edgeId, vertIdx) => {
        const ref = edgeRef(body, edgeId);
        const fingerprint = computeEdgeFingerprint(model, edgeId);
        return namingStrategy.recordBirth(featureId, extrudeSideEdgeSelector(loopIdx, vertIdx), ref, fingerprint);
      })
    );
    
    topEdgeRefs = topEdges.map((loopEdges, loopIdx) =>
      loopEdges.map((edgeId, segIdx) => {
        const ref = edgeRef(body, edgeId);
        const fingerprint = computeEdgeFingerprint(model, edgeId);
        return namingStrategy.recordBirth(featureId, extrudeTopEdgeSelector(loopIdx, segIdx), ref, fingerprint);
      })
    );
    
    bottomEdgeRefs = bottomEdges.map((loopEdges, loopIdx) =>
      loopEdges.map((edgeId, segIdx) => {
        const ref = edgeRef(body, edgeId);
        const fingerprint = computeEdgeFingerprint(model, edgeId);
        return namingStrategy.recordBirth(featureId, extrudeBottomEdgeSelector(loopIdx, segIdx), ref, fingerprint);
      })
    );
  }
  
  if (operation === 'cut') {
    return { 
      success: true, 
      body,
      featureId,
      topCapRefs,
      bottomCapRefs,
      sideRefs,
      sideEdgeRefs,
      topEdgeRefs,
      bottomEdgeRefs,
      error: 'Note: Cut operation currently returns the tool body. Boolean subtraction pending.'
    };
  }
  
  return { 
    success: true, 
    body,
    featureId,
    topCapRefs,
    bottomCapRefs,
    sideRefs,
    sideEdgeRefs,
    topEdgeRefs,
    bottomEdgeRefs,
  };
}

function arcAngleSpan(arc: Arc2D): number {
  let span = arc.ccw ? arc.endAngle - arc.startAngle : arc.startAngle - arc.endAngle;
  if (span < 0) span += 2 * Math.PI;
  return span;
}

function sampleProfileLoop(loop: ProfileLoop): SampledLoop {
  const vertices: Vec2[] = [];
  const segmentCurves: Curve2D[] = [];

  if (loop.curves.length === 0) return { vertices, segmentCurves };

  // Start at the first curve's start point
  vertices.push(evalCurve2D(loop.curves[0], 0));

  for (const curve of loop.curves) {
    let segments = 1;
    if (curve.kind === 'arc') {
      const span = arcAngleSpan(curve);
      segments = Math.max(ARC_MIN_SEGMENTS, Math.ceil(span / ARC_SEGMENTS_PER_RADIAN));
    }

    for (let i = 1; i <= segments; i++) {
      const p = evalCurve2D(curve, i / segments);
      vertices.push(p);
      segmentCurves.push(curve);
    }
  }

  // Remove duplicate closing point if present
  if (vertices.length >= 2) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    const dx = first[0] - last[0];
    const dy = first[1] - last[1];
    if (dx * dx + dy * dy < 1e-16) {
      vertices.pop();
    }
  }

  return { vertices, segmentCurves };
}

function createExtrudeVertices(
  model: TopoModel,
  profile: SketchProfile,
  vertices2D: Vec2[],
  direction: Vec3,
  startOffset: number,
  endOffset: number
): ExtrudeVertexData {
  const bottomVertices: VertexId[] = [];
  const topVertices: VertexId[] = [];
  
  const dirStart = mul3(direction, startOffset);
  const dirEnd = mul3(direction, endOffset);
  
  for (const v2d of vertices2D) {
    const base3D = planeToWorld(profile.plane, v2d[0], v2d[1]);
    
    const bottom3D: Vec3 = add3(base3D, dirStart);
    bottomVertices.push(model.addVertex(bottom3D[0], bottom3D[1], bottom3D[2]));
    
    const top3D: Vec3 = add3(base3D, dirEnd);
    topVertices.push(model.addVertex(top3D[0], top3D[1], top3D[2]));
  }
  
  return { bottomVertices, topVertices };
}

function createExtrudeEdges(
  model: TopoModel,
  vertexData: ExtrudeVertexData
): ExtrudeEdgeData {
  const { bottomVertices, topVertices } = vertexData;
  const n = bottomVertices.length;
  
  const bottomEdges: EdgeId[] = [];
  const topEdges: EdgeId[] = [];
  const sideEdges: EdgeId[] = [];
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    
    bottomEdges.push(model.addEdge(bottomVertices[i], bottomVertices[j]));
    topEdges.push(model.addEdge(topVertices[i], topVertices[j]));
    sideEdges.push(model.addEdge(bottomVertices[i], topVertices[i]));
  }
  
  return { bottomEdges, topEdges, sideEdges };
}

function createBottomFace(
  model: TopoModel,
  shell: ShellId,
  profile: SketchProfile,
  vertexData: ExtrudeVertexData,
  edgeData: ExtrudeEdgeData,
  isOuterLoop: boolean,
  direction: Vec3,
  startOffset: number
): FaceId {
  const n = vertexData.bottomVertices.length;
  
  const plane = profile.plane.surface;
  const bottomNormal: Vec3 = [-plane.normal[0], -plane.normal[1], -plane.normal[2]];
  // Surface origin must be on the actual bottom cap plane
  const baseOrigin = planeToWorld(profile.plane, 0, 0);
  const bottomOrigin = add3(baseOrigin, mul3(direction, startOffset));
  const surface = model.addSurface(createPlaneSurface(bottomOrigin, bottomNormal, plane.xDir));
  
  const halfEdges: HalfEdgeId[] = [];
  
  if (isOuterLoop) {
    for (let i = n - 1; i >= 0; i--) {
      halfEdges.push(model.addHalfEdge(edgeData.bottomEdges[i], -1));
    }
  } else {
    for (let i = 0; i < n; i++) {
      halfEdges.push(model.addHalfEdge(edgeData.bottomEdges[i], 1));
    }
  }
  
  const loop = model.addLoop(halfEdges);
  const face = model.addFace(surface, false);
  model.addLoopToFace(face, loop);
  model.addFaceToShell(shell, face);
  
  // Compute p-curves for the face
  computeFacePCurves(model, [loop], surface);
  
  return face;
}

function createTopFace(
  model: TopoModel,
  shell: ShellId,
  profile: SketchProfile,
  vertexData: ExtrudeVertexData,
  edgeData: ExtrudeEdgeData,
  direction: Vec3,
  isOuterLoop: boolean,
  endOffset: number
): FaceId {
  const n = vertexData.topVertices.length;
  
  const plane = profile.plane.surface;
  // Surface origin must be on the actual top cap plane, not the sketch plane
  const baseOrigin = planeToWorld(profile.plane, 0, 0);
  const topOrigin = add3(baseOrigin, mul3(direction, endOffset));
  const surface = model.addSurface(createPlaneSurface(topOrigin, direction, plane.xDir));
  
  const halfEdges: HalfEdgeId[] = [];
  
  if (isOuterLoop) {
    for (let i = 0; i < n; i++) {
      halfEdges.push(model.addHalfEdge(edgeData.topEdges[i], 1));
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      halfEdges.push(model.addHalfEdge(edgeData.topEdges[i], -1));
    }
  }
  
  const loop = model.addLoop(halfEdges);
  const face = model.addFace(surface, false);
  model.addLoopToFace(face, loop);
  model.addFaceToShell(shell, face);
  
  // Compute p-curves for the face
  computeFacePCurves(model, [loop], surface);
  
  return face;
}

function createSideFaces(
  model: TopoModel,
  shell: ShellId,
  profile: SketchProfile,
  segmentCurves: Curve2D[],
  vertexData: ExtrudeVertexData,
  edgeData: ExtrudeEdgeData,
  direction: Vec3,
  startOffset: number,
  isOuterLoop: boolean
): FaceId[] {
  const n = vertexData.bottomVertices.length;
  const plane = profile.plane.surface;
  const createdFaces: FaceId[] = [];
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    
    const curve = segmentCurves[i] ?? segmentCurves[segmentCurves.length - 1];
    const startPoint2D = evalCurve2D(curve, 0);
    const endPoint2D = evalCurve2D(curve, 1);
    
    const edge2D: Vec2 = [
      endPoint2D[0] - startPoint2D[0],
      endPoint2D[1] - startPoint2D[1],
    ];
    
    const edgeDir3D: Vec3 = [
      edge2D[0] * plane.xDir[0] + edge2D[1] * plane.yDir[0],
      edge2D[0] * plane.xDir[1] + edge2D[1] * plane.yDir[1],
      edge2D[0] * plane.xDir[2] + edge2D[1] * plane.yDir[2],
    ];
    
    const v0 = vertexData.bottomVertices[i];
    const pos = model.getVertexPosition(v0);

    let surface: SurfaceIndex;
    let faceReversed = false;
    if (curve.kind === 'arc') {
      // Arc segment sweeps a cylindrical surface under extrusion.
      const baseCenter = planeToWorld(profile.plane, curve.center[0], curve.center[1]);
      const center = add3(baseCenter, mul3(direction, startOffset));
      const cyl: CylinderSurface = {
        kind: 'cylinder',
        center,
        axis: direction,
        radius: curve.radius,
      };
      surface = model.addSurface(cyl);
      // Inner-loop (hole) side faces should flip normals.
      faceReversed = !isOuterLoop;
    } else {
      // Line segment sweeps a planar side face.
      let faceNormal: Vec3;
      if (isOuterLoop) {
        faceNormal = normalize3(cross3(direction, edgeDir3D));
      } else {
        faceNormal = normalize3(cross3(edgeDir3D, direction));
      }
      surface = model.addSurface(createPlaneSurface(
        vec3(pos[0], pos[1], pos[2]),
        faceNormal,
        normalize3(edgeDir3D)
      ));
    }
    
    const halfEdges: HalfEdgeId[] = [];
    
    if (isOuterLoop) {
      halfEdges.push(model.addHalfEdge(edgeData.bottomEdges[i], 1));
      halfEdges.push(model.addHalfEdge(edgeData.sideEdges[j], 1));
      halfEdges.push(model.addHalfEdge(edgeData.topEdges[i], -1));
      halfEdges.push(model.addHalfEdge(edgeData.sideEdges[i], -1));
    } else {
      halfEdges.push(model.addHalfEdge(edgeData.bottomEdges[i], -1));
      halfEdges.push(model.addHalfEdge(edgeData.sideEdges[i], 1));
      halfEdges.push(model.addHalfEdge(edgeData.topEdges[i], 1));
      halfEdges.push(model.addHalfEdge(edgeData.sideEdges[j], -1));
    }
    
    const faceLoop = model.addLoop(halfEdges);
    const face = model.addFace(surface, faceReversed);
    model.addLoopToFace(face, faceLoop);
    model.addFaceToShell(shell, face);
    
    // Compute p-curves for the face
    computeFacePCurves(model, [faceLoop], surface);
    
    createdFaces.push(face);
  }
  
  return createdFaces;
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
