/**
 * Primitive shape creation
 * 
 * Creates basic 3D shapes as BREP bodies directly in the topology model.
 * These primitives are useful for testing and as building blocks for more
 * complex operations.
 */

import type { Vec3 } from '../num/vec3.js';
import { vec3 } from '../num/vec3.js';
import type { TopoModel } from '../topo/model.js';
import type { BodyId, EdgeId, HalfEdgeId } from '../topo/handles.js';
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
import { createPlaneSurface } from '../geom/surface.js';

/**
 * Box creation options
 */
export interface BoxOptions {
  /** X dimension (width) - default 1 */
  width?: number;
  /** Y dimension (depth) - default 1 */
  depth?: number;
  /** Z dimension (height) - default 1 */
  height?: number;
  /** Center position - default [0, 0, 0] */
  center?: Vec3;
}

/**
 * Create a box primitive
 * 
 * Creates a closed solid box with 6 planar faces, 12 edges, and 8 vertices.
 * The box is axis-aligned and centered at the specified position.
 * 
 * Vertex layout (when viewed from above, looking down -Z):
 * ```
 *   3----2    (at z = -hh, bottom)
 *   |    |
 *   0----1
 *
 *   7----6    (at z = +hh, top)  
 *   |    |
 *   4----5
 * ```
 * 
 * @param model The topology model to add the box to
 * @param options Box dimensions and position
 * @returns Handle to the created body
 */
export function createBox(model: TopoModel, options: BoxOptions = {}): BodyId {
  const width = options.width ?? 1;
  const depth = options.depth ?? 1;
  const height = options.height ?? 1;
  const center = options.center ?? vec3(0, 0, 0);
  
  const hw = width / 2;
  const hd = depth / 2;
  const hh = height / 2;
  
  // Create 8 vertices
  const v = [
    addVertex(model, center[0] - hw, center[1] - hd, center[2] - hh), // v0
    addVertex(model, center[0] + hw, center[1] - hd, center[2] - hh), // v1
    addVertex(model, center[0] + hw, center[1] + hd, center[2] - hh), // v2
    addVertex(model, center[0] - hw, center[1] + hd, center[2] - hh), // v3
    addVertex(model, center[0] - hw, center[1] - hd, center[2] + hh), // v4
    addVertex(model, center[0] + hw, center[1] - hd, center[2] + hh), // v5
    addVertex(model, center[0] + hw, center[1] + hd, center[2] + hh), // v6
    addVertex(model, center[0] - hw, center[1] + hd, center[2] + hh), // v7
  ];
  
  // Create 12 edges (each edge is used by exactly 2 faces)
  const e = [
    addEdge(model, v[0], v[1]), // e0: v0 -> v1
    addEdge(model, v[1], v[2]), // e1: v1 -> v2
    addEdge(model, v[2], v[3]), // e2: v2 -> v3
    addEdge(model, v[3], v[0]), // e3: v3 -> v0
    addEdge(model, v[4], v[5]), // e4: v4 -> v5
    addEdge(model, v[5], v[6]), // e5: v5 -> v6
    addEdge(model, v[6], v[7]), // e6: v6 -> v7
    addEdge(model, v[7], v[4]), // e7: v7 -> v4
    addEdge(model, v[0], v[4]), // e8: v0 -> v4
    addEdge(model, v[1], v[5]), // e9: v1 -> v5
    addEdge(model, v[2], v[6]), // e10: v2 -> v6
    addEdge(model, v[3], v[7]), // e11: v3 -> v7
  ];
  
  // Create the body and shell
  const body = addBody(model);
  const shell = addShell(model, true);
  addShellToBody(model, body, shell);
  
  // Each face is defined with vertex winding that gives outward-pointing normal
  // by right-hand rule. Adjacent faces use shared edges in opposite directions.
  
  // Face edge usage table:
  // Edge | Face 1 (fwd) | Face 2 (rev)
  // e0   | back         | bottom
  // e1   | right        | bottom  
  // e2   | front        | bottom
  // e3   | bottom       | left
  // e4   | back         | top
  // e5   | right        | top
  // e6   | front        | top
  // e7   | left         | top
  // e8   | left         | back
  // e9   | back         | right
  // e10  | right        | front
  // e11  | front        | left

  // Bottom face (-Z normal): v0 -> v3 -> v2 -> v1
  createFaceWithLoop(model, shell, center,
    vec3(0, 0, -1), vec3(0, 0, -hh), vec3(1, 0, 0),
    [
      { edge: e[3], dir: -1 },  // v0 -> v3 (e3: v3->v0 reversed)
      { edge: e[2], dir: -1 },  // v3 -> v2 (e2: v2->v3 reversed)
      { edge: e[1], dir: -1 },  // v2 -> v1 (e1: v1->v2 reversed)
      { edge: e[0], dir: -1 },  // v1 -> v0 (e0: v0->v1 reversed)
    ]
  );
  
  // Top face (+Z normal): v4 -> v5 -> v6 -> v7
  createFaceWithLoop(model, shell, center,
    vec3(0, 0, 1), vec3(0, 0, hh), vec3(1, 0, 0),
    [
      { edge: e[4], dir: 1 },   // v4 -> v5
      { edge: e[5], dir: 1 },   // v5 -> v6
      { edge: e[6], dir: 1 },   // v6 -> v7
      { edge: e[7], dir: 1 },   // v7 -> v4
    ]
  );
  
  // Left face (-X normal): v0 -> v4 -> v7 -> v3
  createFaceWithLoop(model, shell, center,
    vec3(-1, 0, 0), vec3(-hw, 0, 0), vec3(0, 1, 0),
    [
      { edge: e[8], dir: 1 },   // v0 -> v4
      { edge: e[7], dir: -1 },  // v4 -> v7 (e7: v7->v4 reversed)
      { edge: e[11], dir: -1 }, // v7 -> v3 (e11: v3->v7 reversed)
      { edge: e[3], dir: 1 },   // v3 -> v0
    ]
  );
  
  // Right face (+X normal): v1 -> v2 -> v6 -> v5
  createFaceWithLoop(model, shell, center,
    vec3(1, 0, 0), vec3(hw, 0, 0), vec3(0, -1, 0),
    [
      { edge: e[1], dir: 1 },   // v1 -> v2
      { edge: e[10], dir: 1 },  // v2 -> v6
      { edge: e[5], dir: -1 },  // v6 -> v5 (e5: v5->v6 reversed)
      { edge: e[9], dir: -1 },  // v5 -> v1 (e9: v1->v5 reversed)
    ]
  );
  
  // Back face (-Y normal): v0 -> v1 -> v5 -> v4
  createFaceWithLoop(model, shell, center,
    vec3(0, -1, 0), vec3(0, -hd, 0), vec3(-1, 0, 0),
    [
      { edge: e[0], dir: 1 },   // v0 -> v1
      { edge: e[9], dir: 1 },   // v1 -> v5
      { edge: e[4], dir: -1 },  // v5 -> v4 (e4: v4->v5 reversed)
      { edge: e[8], dir: -1 },  // v4 -> v0 (e8: v0->v4 reversed)
    ]
  );
  
  // Front face (+Y normal): v3 -> v7 -> v6 -> v2
  createFaceWithLoop(model, shell, center,
    vec3(0, 1, 0), vec3(0, hd, 0), vec3(1, 0, 0),
    [
      { edge: e[11], dir: 1 },  // v3 -> v7
      { edge: e[6], dir: -1 },  // v7 -> v6 (e6: v6->v7 reversed)
      { edge: e[10], dir: -1 }, // v6 -> v2 (e10: v2->v6 reversed)
      { edge: e[2], dir: 1 },   // v2 -> v3
    ]
  );
  
  // Set up twin half-edges
  setupTwinHalfEdges(model);
  
  return body;
}

/**
 * Helper to create a face with its loop
 */
function createFaceWithLoop(
  model: TopoModel,
  shell: ReturnType<typeof addShell>,
  center: Vec3,
  normal: Vec3,
  originOffset: Vec3,
  xDir: Vec3,
  edgeSpecs: { edge: EdgeId; dir: 1 | -1 }[]
): void {
  const surfaceOrigin: Vec3 = [
    center[0] + originOffset[0],
    center[1] + originOffset[1],
    center[2] + originOffset[2],
  ];
  const surface = addSurface(model, createPlaneSurface(surfaceOrigin, normal, xDir));
  
  const halfEdges: HalfEdgeId[] = [];
  for (const spec of edgeSpecs) {
    const he = addHalfEdge(model, spec.edge, spec.dir);
    halfEdges.push(he);
  }
  
  const loop = addLoop(model, halfEdges);
  const face = addFace(model, surface, false);
  addLoopToFace(model, face, loop);
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
 * Create a unit cube centered at origin
 */
export function createUnitCube(model: TopoModel): BodyId {
  return createBox(model, {
    width: 1,
    depth: 1,
    height: 1,
    center: vec3(0, 0, 0),
  });
}
