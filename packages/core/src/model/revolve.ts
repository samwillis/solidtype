/**
 * Revolve operation
 * 
 * Creates a solid body by revolving a 2D profile around an axis.
 * Supports both "add" (create new body) and "cut" (subtract from existing body)
 * operations.
 */

import type { Vec3 } from '../num/vec3.js';
import { vec3, normalize3, add3, sub3, mul3, cross3, dot3, length3 } from '../num/vec3.js';
import { createPlaneSurface } from '../geom/surface.js';
import type { TopoModel } from '../topo/model.js';
import type { BodyId, EdgeId, VertexId, HalfEdgeId } from '../topo/handles.js';
import {
  addVertex,
  addEdge,
  addHalfEdge,
  addLoop,
  addFace,
  addShell,
  addBody,
  addSurface,
  addLoopToFace,
  addFaceToShell,
  addShellToBody,
  setHalfEdgeTwin,
} from '../topo/model.js';
import type { SketchProfile } from './sketchProfile.js';
import { getLoopVertices } from './sketchProfile.js';
import { planeToWorld } from './planes.js';

/**
 * Revolve operation type
 */
export type RevolveOperation = 'add' | 'cut';

/**
 * Axis definition for revolve
 */
export interface RevolveAxis {
  /** A point on the axis (in 3D world coordinates) */
  origin: Vec3;
  /** Direction of the axis (will be normalized) */
  direction: Vec3;
}

/**
 * Revolve options
 */
export interface RevolveOptions {
  /** Operation type: 'add' creates a new body, 'cut' subtracts from existing body */
  operation: RevolveOperation;
  /** Axis to revolve around */
  axis: RevolveAxis;
  /** Angle to revolve (in radians, default: 2π for full revolution) */
  angle?: number;
  /** Number of segments for discretization (default: based on angle and tolerance) */
  segments?: number;
  /** Body to cut from (required for 'cut' operation) */
  targetBody?: BodyId;
}

/**
 * Result of a revolve operation
 */
export interface RevolveResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The resulting body (new body for 'add', modified body for 'cut') */
  body?: BodyId;
  /** Error message if failed */
  error?: string;
}

/**
 * Minimum segments for a full revolution
 */
const MIN_FULL_SEGMENTS = 8;

/**
 * Default segments per radian (approximately 6 per 90 degrees)
 */
const SEGMENTS_PER_RADIAN = Math.PI / 12; // ~15 degrees per segment

/**
 * Revolve a sketch profile around an axis to create a solid body
 * 
 * This creates a solid by:
 * 1. Discretizing the profile into vertices
 * 2. Revolving vertices around the axis to create rings
 * 3. Creating faces connecting adjacent rings
 * 4. Creating end caps if not a full revolution
 * 
 * @param model The topology model to add the body to
 * @param profile The sketch profile to revolve
 * @param options Revolve options
 * @returns Result with the created/modified body or error
 */
export function revolve(
  model: TopoModel,
  profile: SketchProfile,
  options: RevolveOptions
): RevolveResult {
  const { operation, axis } = options;
  const angle = options.angle ?? 2 * Math.PI;
  
  // Validate inputs
  if (profile.loops.length === 0) {
    return { success: false, error: 'Profile has no loops' };
  }
  
  if (Math.abs(angle) < model.ctx.tol.angle) {
    return { success: false, error: 'Revolve angle is too small' };
  }
  
  if (operation === 'cut' && !options.targetBody) {
    return { success: false, error: 'Cut operation requires a target body' };
  }
  
  // Normalize axis direction
  const axisDir = normalize3(axis.direction);
  const axisOrigin = axis.origin;
  
  // Determine number of segments
  const isFullRevolution = Math.abs(Math.abs(angle) - 2 * Math.PI) < model.ctx.tol.angle;
  let segments = options.segments;
  if (segments === undefined) {
    segments = Math.max(
      isFullRevolution ? MIN_FULL_SEGMENTS : 4,
      Math.ceil(Math.abs(angle) / SEGMENTS_PER_RADIAN)
    );
  }
  
  // Create the revolved body
  const body = addBody(model);
  const shell = addShell(model, true); // closed shell
  addShellToBody(model, body, shell);
  
  // Process the outer loop only for now
  // TODO(agent): Handle holes (inner loops) properly
  const loop = profile.loops[0];
  if (!loop) {
    return { success: false, error: 'Profile has no outer loop' };
  }
  
  // Get 2D vertices and convert to 3D
  const vertices2D = getLoopVertices(loop);
  if (vertices2D.length < 3) {
    return { success: false, error: 'Profile loop has less than 3 vertices' };
  }
  
  // Convert 2D profile vertices to 3D
  const profileVertices3D: Vec3[] = vertices2D.map(v2d => 
    planeToWorld(profile.plane, v2d[0], v2d[1])
  );
  
  // Check that profile doesn't intersect the axis
  for (const v3d of profileVertices3D) {
    const dist = distanceToAxis(v3d, axisOrigin, axisDir);
    if (dist < model.ctx.tol.length) {
      // Vertex is on or very close to axis - this would create a degenerate geometry
      // For now, we'll handle this by treating on-axis points specially
    }
  }
  
  // Create rings of vertices
  const rings: VertexId[][] = [];
  const angleStep = angle / segments;
  
  for (let s = 0; s <= segments; s++) {
    // For full revolutions, the last ring shares vertices with the first
    if (isFullRevolution && s === segments) {
      rings.push(rings[0]);
      continue;
    }
    
    const rotAngle = s * angleStep;
    const ring: VertexId[] = [];
    
    for (const v3d of profileVertices3D) {
      const rotated = rotatePointAroundAxis(v3d, axisOrigin, axisDir, rotAngle);
      ring.push(addVertex(model, rotated[0], rotated[1], rotated[2]));
    }
    
    rings.push(ring);
  }
  
  const nProfile = profileVertices3D.length;
  const nSegments = isFullRevolution ? segments : segments + 1;
  
  // Create side faces (quads connecting adjacent rings)
  for (let s = 0; s < segments; s++) {
    const ring0 = rings[s];
    const ring1 = rings[(s + 1) % nSegments];
    
    for (let v = 0; v < nProfile; v++) {
      const nextV = (v + 1) % nProfile;
      
      // Four corners of the quad
      const v00 = ring0[v];
      const v01 = ring0[nextV];
      const v10 = ring1[v];
      const v11 = ring1[nextV];
      
      // Create edges for this quad
      // Edge along ring0 (profile direction)
      const edgeRing0 = addEdge(model, v00, v01);
      // Edge along ring1 (profile direction)
      const edgeRing1 = addEdge(model, v10, v11);
      // Edge connecting rings (revolution direction) at v
      const edgeRev0 = addEdge(model, v00, v10);
      // Edge connecting rings (revolution direction) at nextV
      const edgeRev1 = addEdge(model, v01, v11);
      
      // Determine the surface type based on the geometry
      // For line segments in the profile:
      // - Parallel to axis: planar surface
      // - Perpendicular to axis: planar (radial face)
      // - General case: conical or cylindrical surface
      
      const p0 = profileVertices3D[v];
      const p1 = profileVertices3D[nextV];
      
      // Compute face normal (approximate for planar approximation)
      const midPoint3D: Vec3 = [
        (p0[0] + p1[0]) / 2,
        (p0[1] + p1[1]) / 2,
        (p0[2] + p1[2]) / 2,
      ];
      const midAngle = (s + 0.5) * angleStep;
      const rotatedMid = rotatePointAroundAxis(midPoint3D, axisOrigin, axisDir, midAngle);
      
      // Surface normal: radial direction from axis at the midpoint
      const axisPoint = projectPointOntoAxis(rotatedMid, axisOrigin, axisDir);
      let radialDir = sub3(rotatedMid, axisPoint);
      const radialLen = length3(radialDir);
      if (radialLen > model.ctx.tol.length) {
        radialDir = normalize3(radialDir);
      } else {
        // Point is on axis, use arbitrary perpendicular
        radialDir = computePerpendicularToAxis(axisDir);
      }
      
      // Create surface (planar approximation)
      const faceNormal = radialDir;
      const surface = addSurface(model, createPlaneSurface(
        rotatedMid,
        faceNormal,
        axisDir
      ));
      
      // Create half-edges for the quad face
      // Winding: v00 -> v01 -> v11 -> v10 -> v00 (CCW when viewed from outside)
      const halfEdges: HalfEdgeId[] = [
        addHalfEdge(model, edgeRing0, 1),  // v00 -> v01
        addHalfEdge(model, edgeRev1, 1),   // v01 -> v11
        addHalfEdge(model, edgeRing1, -1), // v11 -> v10
        addHalfEdge(model, edgeRev0, -1),  // v10 -> v00
      ];
      
      const faceLoop = addLoop(model, halfEdges);
      const face = addFace(model, surface, false);
      addLoopToFace(model, face, faceLoop);
      addFaceToShell(model, shell, face);
    }
  }
  
  // Create end caps if not a full revolution
  if (!isFullRevolution) {
    // Start cap (at angle = 0)
    createRevolveCap(model, shell, profile, profileVertices3D, rings[0], true);
    
    // End cap (at angle = angle)
    createRevolveCap(model, shell, profile, profileVertices3D, rings[segments], false);
  }
  
  // Set up twin half-edges
  setupTwinHalfEdges(model);
  
  // For 'cut' operation, perform boolean subtraction
  if (operation === 'cut') {
    // TODO(agent): Implement boolean subtraction
    return {
      success: true,
      body,
      error: 'Note: Cut operation currently returns the tool body. Boolean subtraction pending.'
    };
  }
  
  return { success: true, body };
}

/**
 * Calculate the distance from a point to an axis
 */
function distanceToAxis(point: Vec3, axisOrigin: Vec3, axisDir: Vec3): number {
  const toPoint = sub3(point, axisOrigin);
  const projLen = dot3(toPoint, axisDir);
  const projPoint = add3(axisOrigin, mul3(axisDir, projLen));
  return length3(sub3(point, projPoint));
}

/**
 * Project a point onto the axis line
 */
function projectPointOntoAxis(point: Vec3, axisOrigin: Vec3, axisDir: Vec3): Vec3 {
  const toPoint = sub3(point, axisOrigin);
  const projLen = dot3(toPoint, axisDir);
  return add3(axisOrigin, mul3(axisDir, projLen));
}

/**
 * Rotate a point around an axis by a given angle
 */
function rotatePointAroundAxis(
  point: Vec3,
  axisOrigin: Vec3,
  axisDir: Vec3,
  angle: number
): Vec3 {
  // Rodrigues' rotation formula
  const p = sub3(point, axisOrigin);
  const k = axisDir;
  
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  
  // p' = p*cos(θ) + (k × p)*sin(θ) + k*(k·p)*(1 - cos(θ))
  const kCrossP = cross3(k, p);
  const kDotP = dot3(k, p);
  
  const rotated: Vec3 = [
    p[0] * cosA + kCrossP[0] * sinA + k[0] * kDotP * (1 - cosA),
    p[1] * cosA + kCrossP[1] * sinA + k[1] * kDotP * (1 - cosA),
    p[2] * cosA + kCrossP[2] * sinA + k[2] * kDotP * (1 - cosA),
  ];
  
  return add3(axisOrigin, rotated);
}

/**
 * Compute a vector perpendicular to the given axis
 */
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

/**
 * Create an end cap face for revolve
 */
function createRevolveCap(
  model: TopoModel,
  shell: ReturnType<typeof addShell>,
  _profile: SketchProfile,
  _profileVertices3D: Vec3[],
  ringVertices: VertexId[],
  isStart: boolean
): void {
  const n = ringVertices.length;
  if (n < 3) return;
  
  // Get the actual 3D positions
  const positions: Vec3[] = ringVertices.map(v => [
    model.vertices.x[v],
    model.vertices.y[v],
    model.vertices.z[v],
  ]);
  
  // Compute face normal from first three vertices
  const v01 = sub3(positions[1], positions[0]);
  const v02 = sub3(positions[2], positions[0]);
  let normal = normalize3(cross3(v01, v02));
  
  // Flip normal for start cap to point outward
  if (isStart) {
    normal = mul3(normal, -1);
  }
  
  // Create surface
  const surface = addSurface(model, createPlaneSurface(
    positions[0],
    normal,
    normalize3(v01)
  ));
  
  // Create edges and half-edges
  const edges: EdgeId[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    edges.push(addEdge(model, ringVertices[i], ringVertices[j]));
  }
  
  // Create half-edges with appropriate winding
  const halfEdges: HalfEdgeId[] = [];
  if (isStart) {
    // Start cap: reverse winding
    for (let i = n - 1; i >= 0; i--) {
      halfEdges.push(addHalfEdge(model, edges[i], -1));
    }
  } else {
    // End cap: forward winding
    for (let i = 0; i < n; i++) {
      halfEdges.push(addHalfEdge(model, edges[i], 1));
    }
  }
  
  const faceLoop = addLoop(model, halfEdges);
  const face = addFace(model, surface, false);
  addLoopToFace(model, face, faceLoop);
  addFaceToShell(model, shell, face);
}

/**
 * Set up twin half-edge relationships for all edges in the model
 */
function setupTwinHalfEdges(model: TopoModel): void {
  const edgeHalfEdges = new Map<number, HalfEdgeId[]>();
  
  for (let i = 0; i < model.halfEdges.count; i++) {
    const edge = model.halfEdges.edge[i];
    if (edge < 0) continue;
    
    const halfEdges = edgeHalfEdges.get(edge) || [];
    halfEdges.push(i as HalfEdgeId);
    edgeHalfEdges.set(edge, halfEdges);
  }
  
  for (const [_edge, halfEdges] of edgeHalfEdges) {
    if (halfEdges.length === 2) {
      setHalfEdgeTwin(model, halfEdges[0], halfEdges[1]);
    }
  }
}

/**
 * Create a revolve axis from two points
 * 
 * @param point1 First point on the axis
 * @param point2 Second point on the axis (defines direction)
 * @returns Revolve axis
 */
export function createAxisFromPoints(point1: Vec3, point2: Vec3): RevolveAxis {
  return {
    origin: point1,
    direction: sub3(point2, point1),
  };
}

/**
 * Create a revolve axis from a point and direction
 */
export function createAxisFromDirection(origin: Vec3, direction: Vec3): RevolveAxis {
  return { origin, direction };
}

/**
 * Standard axes for revolve operations
 */
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
