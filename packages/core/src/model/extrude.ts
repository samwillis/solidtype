/**
 * Extrude operation
 * 
 * Creates a solid body by extruding a 2D profile along a direction.
 * Supports both "add" (create new body) and "cut" (subtract from existing body)
 * operations.
 */

import type { Vec2 } from '../num/vec2.js';
import type { Vec3 } from '../num/vec3.js';
import { vec3, normalize3, add3, mul3, cross3 } from '../num/vec3.js';
import { evalCurve2D } from '../geom/curve2d.js';
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
import type { SketchProfile, ProfileLoop } from './sketchProfile.js';
import { getLoopVertices } from './sketchProfile.js';
import { planeToWorld } from './planes.js';

/**
 * Extrude operation type
 */
export type ExtrudeOperation = 'add' | 'cut';

/**
 * Extrude options
 */
export interface ExtrudeOptions {
  /** Operation type: 'add' creates a new body, 'cut' subtracts from existing body */
  operation: ExtrudeOperation;
  /** Distance to extrude (positive = in direction, negative = opposite) */
  distance: number;
  /** Extrude direction (default: plane normal) */
  direction?: Vec3;
  /** Body to cut from (required for 'cut' operation) */
  targetBody?: BodyId;
  /** Whether to extrude symmetrically in both directions */
  symmetric?: boolean;
}

/**
 * Result of an extrude operation
 */
export interface ExtrudeResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The resulting body (new body for 'add', modified body for 'cut') */
  body?: BodyId;
  /** Error message if failed */
  error?: string;
}

/**
 * Internal data structure for tracking vertices during extrusion
 */
interface ExtrudeVertexData {
  /** Bottom (start) vertices for the loop */
  bottomVertices: VertexId[];
  /** Top (end) vertices for the loop */
  topVertices: VertexId[];
}

/**
 * Internal data structure for tracking edges during extrusion
 */
interface ExtrudeEdgeData {
  /** Edges on the bottom face */
  bottomEdges: EdgeId[];
  /** Edges on the top face */
  topEdges: EdgeId[];
  /** Side (vertical) edges connecting bottom to top */
  sideEdges: EdgeId[];
}

/**
 * Extrude a sketch profile to create a solid body
 * 
 * This creates a solid by:
 * 1. Creating vertices at bottom and top of extrusion
 * 2. Creating edges for bottom, top, and side faces
 * 3. Creating faces: bottom cap, top cap, and side faces
 * 4. For 'cut' operation: performs boolean subtraction (not yet implemented)
 * 
 * @param model The topology model to add the body to
 * @param profile The sketch profile to extrude
 * @param options Extrude options
 * @returns Result with the created/modified body or error
 */
export function extrude(
  model: TopoModel,
  profile: SketchProfile,
  options: ExtrudeOptions
): ExtrudeResult {
  const { operation, distance } = options;
  
  // Validate inputs
  if (profile.loops.length === 0) {
    return { success: false, error: 'Profile has no loops' };
  }
  
  if (Math.abs(distance) < model.ctx.tol.length) {
    return { success: false, error: 'Extrude distance is too small' };
  }
  
  if (operation === 'cut' && !options.targetBody) {
    return { success: false, error: 'Cut operation requires a target body' };
  }
  
  // Get extrusion direction (default: plane normal)
  let direction = options.direction ?? profile.plane.surface.normal;
  direction = normalize3(direction);
  
  // Compute actual start and end offsets
  let startOffset = 0;
  let endOffset = distance;
  
  if (options.symmetric) {
    startOffset = -Math.abs(distance) / 2;
    endOffset = Math.abs(distance) / 2;
  }
  
  // Create the extruded body
  const body = addBody(model);
  const shell = addShell(model, true); // closed shell
  addShellToBody(model, body, shell);
  
  // Process each loop
  for (let loopIdx = 0; loopIdx < profile.loops.length; loopIdx++) {
    const loop = profile.loops[loopIdx];
    
    // Get vertices from the loop
    const vertices2D = getLoopVertices(loop);
    if (vertices2D.length < 3) continue;
    
    // Create vertex and edge data for this loop
    const vertexData = createExtrudeVertices(
      model, profile, vertices2D, direction, startOffset, endOffset
    );
    
    const edgeData = createExtrudeEdges(model, vertexData);
    
    // Create the faces
    const isOuterLoop = loop.isOuter;
    
    createBottomFace(model, shell, profile, loop, vertices2D, vertexData, edgeData, isOuterLoop);
    createTopFace(model, shell, profile, loop, vertices2D, vertexData, edgeData, direction, endOffset - startOffset, isOuterLoop);
    createSideFaces(model, shell, profile, loop, vertexData, edgeData, direction, startOffset, endOffset, isOuterLoop);
  }
  
  // Set up twin half-edges
  setupTwinHalfEdges(model);
  
  // For 'cut' operation, perform boolean subtraction
  if (operation === 'cut') {
    // TODO(agent): Implement boolean subtraction in Phase 5
    // For now, just return the tool body
    return { 
      success: true, 
      body,
      error: 'Note: Cut operation currently returns the tool body. Boolean subtraction pending.'
    };
  }
  
  return { success: true, body };
}

/**
 * Create bottom and top vertices for extrusion
 */
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
    // Transform 2D vertex to 3D
    const base3D = planeToWorld(profile.plane, v2d[0], v2d[1]);
    
    // Create bottom vertex (at start offset)
    const bottom3D: Vec3 = add3(base3D, dirStart);
    bottomVertices.push(addVertex(model, bottom3D[0], bottom3D[1], bottom3D[2]));
    
    // Create top vertex (at end offset)
    const top3D: Vec3 = add3(base3D, dirEnd);
    topVertices.push(addVertex(model, top3D[0], top3D[1], top3D[2]));
  }
  
  return { bottomVertices, topVertices };
}

/**
 * Create edges for extrusion (bottom, top, and side edges)
 */
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
    
    // Bottom edge (goes around bottom face)
    bottomEdges.push(addEdge(model, bottomVertices[i], bottomVertices[j]));
    
    // Top edge (goes around top face)
    topEdges.push(addEdge(model, topVertices[i], topVertices[j]));
    
    // Side edge (connects bottom to top)
    sideEdges.push(addEdge(model, bottomVertices[i], topVertices[i]));
  }
  
  return { bottomEdges, topEdges, sideEdges };
}

/**
 * Create the bottom cap face
 */
function createBottomFace(
  model: TopoModel,
  shell: ReturnType<typeof addShell>,
  profile: SketchProfile,
  _loop: ProfileLoop,
  _vertices2D: Vec2[],
  vertexData: ExtrudeVertexData,
  edgeData: ExtrudeEdgeData,
  isOuterLoop: boolean
): void {
  const n = vertexData.bottomVertices.length;
  
  // Bottom face surface: plane at bottom, normal pointing down (opposite to extrude direction)
  const plane = profile.plane.surface;
  const bottomNormal: Vec3 = [-plane.normal[0], -plane.normal[1], -plane.normal[2]];
  const bottomOrigin = planeToWorld(profile.plane, 0, 0);
  const surface = addSurface(model, createPlaneSurface(bottomOrigin, bottomNormal, plane.xDir));
  
  // Create half-edges for bottom face (wound clockwise when viewed from outside)
  // If outer loop: vertices go CCW in 2D, but bottom face looks down, so we reverse
  const halfEdges: HalfEdgeId[] = [];
  
  if (isOuterLoop) {
    // For outer loop: traverse edges in reverse order (CW when viewed from bottom)
    for (let i = n - 1; i >= 0; i--) {
      // Edge i goes from vertex i to vertex i+1, we need reversed direction
      halfEdges.push(addHalfEdge(model, edgeData.bottomEdges[i], -1));
    }
  } else {
    // For hole: traverse edges forward (they're already wound opposite)
    for (let i = 0; i < n; i++) {
      halfEdges.push(addHalfEdge(model, edgeData.bottomEdges[i], 1));
    }
  }
  
  const loop = addLoop(model, halfEdges);
  const face = addFace(model, surface, false);
  addLoopToFace(model, face, loop);
  addFaceToShell(model, shell, face);
}

/**
 * Create the top cap face
 */
function createTopFace(
  model: TopoModel,
  shell: ReturnType<typeof addShell>,
  profile: SketchProfile,
  _loop: ProfileLoop,
  _vertices2D: Vec2[],
  vertexData: ExtrudeVertexData,
  edgeData: ExtrudeEdgeData,
  direction: Vec3,
  _totalDistance: number,
  isOuterLoop: boolean
): void {
  const n = vertexData.topVertices.length;
  
  // Top face surface: plane at top, normal pointing in extrude direction
  const plane = profile.plane.surface;
  const topOrigin = planeToWorld(profile.plane, 0, 0);
  // For the top surface, we need to offset it by the extrusion distance
  const surface = addSurface(model, createPlaneSurface(topOrigin, direction, plane.xDir));
  
  // Create half-edges for top face (wound CCW when viewed from outside/top)
  const halfEdges: HalfEdgeId[] = [];
  
  if (isOuterLoop) {
    // For outer loop: traverse edges forward (CCW when viewed from top)
    for (let i = 0; i < n; i++) {
      halfEdges.push(addHalfEdge(model, edgeData.topEdges[i], 1));
    }
  } else {
    // For hole: traverse in reverse
    for (let i = n - 1; i >= 0; i--) {
      halfEdges.push(addHalfEdge(model, edgeData.topEdges[i], -1));
    }
  }
  
  const loop = addLoop(model, halfEdges);
  const face = addFace(model, surface, false);
  addLoopToFace(model, face, loop);
  addFaceToShell(model, shell, face);
}

/**
 * Create side faces for extrusion
 */
function createSideFaces(
  model: TopoModel,
  shell: ReturnType<typeof addShell>,
  profile: SketchProfile,
  loop: ProfileLoop,
  vertexData: ExtrudeVertexData,
  edgeData: ExtrudeEdgeData,
  direction: Vec3,
  _startOffset: number,
  _endOffset: number,
  isOuterLoop: boolean
): void {
  const n = vertexData.bottomVertices.length;
  const plane = profile.plane.surface;
  
  // Create a side face for each edge in the profile
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    
    // Get the 2D edge direction for computing the face normal
    const curve = loop.curves[i];
    const startPoint2D = evalCurve2D(curve, 0);
    const endPoint2D = evalCurve2D(curve, 1);
    
    // 2D edge direction in plane coordinates
    const edge2D: Vec2 = [
      endPoint2D[0] - startPoint2D[0],
      endPoint2D[1] - startPoint2D[1],
    ];
    
    // Compute 3D edge direction
    const edgeDir3D: Vec3 = [
      edge2D[0] * plane.xDir[0] + edge2D[1] * plane.yDir[0],
      edge2D[0] * plane.xDir[1] + edge2D[1] * plane.yDir[1],
      edge2D[0] * plane.xDir[2] + edge2D[1] * plane.yDir[2],
    ];
    
    // Side face normal: cross product of extrude direction and edge direction
    // For outer loop, normal points outward; for hole, normal points inward
    let faceNormal: Vec3;
    if (isOuterLoop) {
      faceNormal = normalize3(cross3(direction, edgeDir3D));
    } else {
      faceNormal = normalize3(cross3(edgeDir3D, direction));
    }
    
    // Face origin: first vertex of bottom edge
    const v0 = vertexData.bottomVertices[i];
    const x0 = model.vertices.x[v0];
    const y0 = model.vertices.y[v0];
    const z0 = model.vertices.z[v0];
    
    // Create face based on curve type
    let surface: ReturnType<typeof addSurface>;
    
    if (curve.kind === 'line') {
      // Planar side face
      surface = addSurface(model, createPlaneSurface(
        vec3(x0, y0, z0),
        faceNormal,
        normalize3(edgeDir3D)
      ));
    } else {
      // For arc curves, we would create a cylindrical surface
      // TODO(agent): Implement cylindrical surface for arc extrusion
      surface = addSurface(model, createPlaneSurface(
        vec3(x0, y0, z0),
        faceNormal,
        normalize3(edgeDir3D)
      ));
    }
    
    // Create half-edges for this side face
    // The face is a quad: bottom[i] -> bottom[j] -> top[j] -> top[i] -> bottom[i]
    // But we need the right winding order
    
    const halfEdges: HalfEdgeId[] = [];
    
    if (isOuterLoop) {
      // Outer loop: CCW when viewed from outside
      // bottom[i] -> bottom[j] (bottom edge forward)
      halfEdges.push(addHalfEdge(model, edgeData.bottomEdges[i], 1));
      // bottom[j] -> top[j] (side edge j forward)
      halfEdges.push(addHalfEdge(model, edgeData.sideEdges[j], 1));
      // top[j] -> top[i] (top edge reversed)
      halfEdges.push(addHalfEdge(model, edgeData.topEdges[i], -1));
      // top[i] -> bottom[i] (side edge i reversed)
      halfEdges.push(addHalfEdge(model, edgeData.sideEdges[i], -1));
    } else {
      // Hole: opposite winding
      halfEdges.push(addHalfEdge(model, edgeData.bottomEdges[i], -1));
      halfEdges.push(addHalfEdge(model, edgeData.sideEdges[i], 1));
      halfEdges.push(addHalfEdge(model, edgeData.topEdges[i], 1));
      halfEdges.push(addHalfEdge(model, edgeData.sideEdges[j], -1));
    }
    
    const faceLoop = addLoop(model, halfEdges);
    const face = addFace(model, surface, false);
    addLoopToFace(model, face, faceLoop);
    addFaceToShell(model, shell, face);
  }
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
 * Convenience function to extrude a rectangular profile
 * 
 * @param model The topology model
 * @param width Rectangle width
 * @param height Rectangle height  
 * @param depth Extrusion depth
 * @param center Optional center point in 2D
 * @returns The created body or undefined on failure
 */
export function extrudeRectangle(
  model: TopoModel,
  width: number,
  height: number,
  depth: number,
  center?: Vec2
): BodyId | undefined {
  // Import here to avoid circular dependency
  const { XY_PLANE } = require('./planes.js');
  const { createRectangleProfile } = require('./sketchProfile.js');
  
  const profile = createRectangleProfile(
    XY_PLANE,
    width,
    height,
    center?.[0] ?? 0,
    center?.[1] ?? 0
  );
  
  const result = extrude(model, profile, {
    operation: 'add',
    distance: depth,
  });
  
  return result.success ? result.body : undefined;
}
