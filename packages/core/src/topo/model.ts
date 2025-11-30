/**
 * BREP topology model with struct-of-arrays storage
 * 
 * This module provides the core data structure for representing BREP (Boundary
 * Representation) topology. The design uses a struct-of-arrays layout for
 * performance and cache efficiency.
 * 
 * Hierarchy:
 * - Body: collection of shells
 * - Shell: connected set of faces (closed = solid, open = surface)
 * - Face: bounded region on a surface, defined by loops
 * - Loop: closed sequence of half-edges (outer boundary or hole)
 * - HalfEdge: directed edge usage within a loop
 * - Edge: geometry shared by two half-edges (or one for boundary edges)
 * - Vertex: point where edges meet
 */

import type { Vec3 } from '../num/vec3.js';
import type { Surface } from '../geom/surface.js';
import type { Curve3D } from '../geom/curve3d.js';
import type { NumericContext } from '../num/tolerance.js';
import {
  type BodyId,
  type ShellId,
  type FaceId,
  type EdgeId,
  type HalfEdgeId,
  type LoopId,
  type VertexId,
  type SurfaceIndex,
  type Curve3DIndex,
  NULL_ID,
  asBodyId,
  asShellId,
  asFaceId,
  asEdgeId,
  asHalfEdgeId,
  asLoopId,
  asVertexId,
  asSurfaceIndex,
  asCurve3DIndex,
  isNullId,
} from './handles.js';

// Re-export handles for convenience
export * from './handles.js';

/**
 * Entity flags (shared across entity types)
 */
export const enum EntityFlags {
  NONE = 0,
  DELETED = 1 << 0,
  /** Face orientation: when set, face normal is reversed relative to surface normal */
  REVERSED = 1 << 1,
  /** Shell is closed (watertight solid) */
  CLOSED = 1 << 2,
}

/**
 * Vertex table - stores vertex positions
 */
export interface VertexTable {
  /** X coordinates */
  x: Float64Array;
  /** Y coordinates */
  y: Float64Array;
  /** Z coordinates */
  z: Float64Array;
  /** Flags */
  flags: Uint8Array;
  /** Number of allocated entries (including deleted) */
  count: number;
  /** Number of live (non-deleted) entries */
  liveCount: number;
}

/**
 * Edge table - stores edge geometry and connectivity
 */
export interface EdgeTable {
  /** Start vertex index */
  vStart: Int32Array;
  /** End vertex index */
  vEnd: Int32Array;
  /** Index into curves array (-1 if straight line) */
  curveIndex: Int32Array;
  /** Parameter start on curve (0 for straight lines) */
  tStart: Float64Array;
  /** Parameter end on curve (1 for straight lines) */
  tEnd: Float64Array;
  /** First half-edge using this edge */
  halfEdge: Int32Array;
  /** Flags */
  flags: Uint8Array;
  /** Number of allocated entries */
  count: number;
  /** Number of live entries */
  liveCount: number;
}

/**
 * Half-edge table - stores directed edge usage
 */
export interface HalfEdgeTable {
  /** Edge this half-edge belongs to */
  edge: Int32Array;
  /** Loop this half-edge belongs to */
  loop: Int32Array;
  /** Next half-edge in the loop (CCW direction) */
  next: Int32Array;
  /** Previous half-edge in the loop */
  prev: Int32Array;
  /** Twin half-edge (same edge, opposite direction) */
  twin: Int32Array;
  /** Direction: 1 = same as edge direction, -1 = reversed */
  direction: Int8Array;
  /** Flags */
  flags: Uint8Array;
  /** Number of allocated entries */
  count: number;
  /** Number of live entries */
  liveCount: number;
}

/**
 * Loop table - stores face boundary information
 */
export interface LoopTable {
  /** Face this loop belongs to */
  face: Int32Array;
  /** First half-edge in the loop */
  firstHalfEdge: Int32Array;
  /** Number of half-edges in this loop */
  halfEdgeCount: Int32Array;
  /** Flags */
  flags: Uint8Array;
  /** Number of allocated entries */
  count: number;
  /** Number of live entries */
  liveCount: number;
}

/**
 * Face table - stores surface bounds
 * Note: Loop references are stored separately in faceLoops array
 */
export interface FaceTable {
  /** Shell this face belongs to */
  shell: Int32Array;
  /** Index into surfaces array */
  surfaceIndex: Int32Array;
  /** Flags (includes REVERSED for orientation) */
  flags: Uint8Array;
  /** Number of allocated entries */
  count: number;
  /** Number of live entries */
  liveCount: number;
}

/**
 * Shell table - stores connected sets of faces
 * Note: Face references are stored separately in shellFaces array
 */
export interface ShellTable {
  /** Body this shell belongs to */
  body: Int32Array;
  /** Flags (includes CLOSED for watertight shells) */
  flags: Uint8Array;
  /** Number of allocated entries */
  count: number;
  /** Number of live entries */
  liveCount: number;
}

/**
 * Body table - stores top-level solid/surface bodies
 * Note: Shell references are stored separately in bodyShells array
 */
export interface BodyTable {
  /** Flags */
  flags: Uint8Array;
  /** Number of allocated entries */
  count: number;
  /** Number of live entries */
  liveCount: number;
}

/**
 * The complete BREP topology model
 */
export interface TopoModel {
  /** Vertex storage */
  vertices: VertexTable;
  /** Edge storage */
  edges: EdgeTable;
  /** Half-edge storage */
  halfEdges: HalfEdgeTable;
  /** Loop storage */
  loops: LoopTable;
  /** Face storage */
  faces: FaceTable;
  /** Shell storage */
  shells: ShellTable;
  /** Body storage */
  bodies: BodyTable;
  
  /**
   * Loop IDs per face - explicit arrays to avoid contiguous storage assumption
   * Index by face ID to get array of loop IDs (first = outer, rest = holes)
   */
  faceLoops: LoopId[][];
  
  /**
   * Face IDs per shell - explicit arrays to avoid contiguous storage assumption
   * Index by shell ID to get array of face IDs
   */
  shellFaces: FaceId[][];
  
  /**
   * Shell IDs per body - explicit arrays to avoid contiguous storage assumption
   * Index by body ID to get array of shell IDs
   */
  bodyShells: ShellId[][];
  
  /** 3D curves (geometry underlying edges) */
  curves: Curve3D[];
  /** Surfaces (geometry underlying faces) */
  surfaces: Surface[];
  
  /** Numeric context for tolerance-aware operations */
  ctx: NumericContext;
}

// Default initial capacity for tables
const DEFAULT_INITIAL_CAPACITY = 16;

/**
 * Create empty typed arrays for a table of given capacity
 */
function createTypedArrays(capacity: number) {
  return {
    float64: () => new Float64Array(capacity),
    float64Ones: () => {
      const arr = new Float64Array(capacity);
      arr.fill(1);
      return arr;
    },
    int32: () => new Int32Array(capacity).fill(NULL_ID),
    int8: () => new Int8Array(capacity),
    uint8: () => new Uint8Array(capacity),
  };
}

/**
 * Create an empty vertex table
 */
function createVertexTable(capacity: number = DEFAULT_INITIAL_CAPACITY): VertexTable {
  const arrays = createTypedArrays(capacity);
  return {
    x: arrays.float64(),
    y: arrays.float64(),
    z: arrays.float64(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

/**
 * Create an empty edge table
 */
function createEdgeTable(capacity: number = DEFAULT_INITIAL_CAPACITY): EdgeTable {
  const arrays = createTypedArrays(capacity);
  return {
    vStart: arrays.int32(),
    vEnd: arrays.int32(),
    curveIndex: arrays.int32(),
    tStart: arrays.float64(), // defaults to 0
    tEnd: arrays.float64Ones(), // defaults to 1
    halfEdge: arrays.int32(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

/**
 * Create an empty half-edge table
 */
function createHalfEdgeTable(capacity: number = DEFAULT_INITIAL_CAPACITY): HalfEdgeTable {
  const arrays = createTypedArrays(capacity);
  return {
    edge: arrays.int32(),
    loop: arrays.int32(),
    next: arrays.int32(),
    prev: arrays.int32(),
    twin: arrays.int32(),
    direction: arrays.int8(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

/**
 * Create an empty loop table
 */
function createLoopTable(capacity: number = DEFAULT_INITIAL_CAPACITY): LoopTable {
  const arrays = createTypedArrays(capacity);
  return {
    face: arrays.int32(),
    firstHalfEdge: arrays.int32(),
    halfEdgeCount: arrays.int32(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

/**
 * Create an empty face table
 */
function createFaceTable(capacity: number = DEFAULT_INITIAL_CAPACITY): FaceTable {
  const arrays = createTypedArrays(capacity);
  return {
    shell: arrays.int32(),
    surfaceIndex: arrays.int32(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

/**
 * Create an empty shell table
 */
function createShellTable(capacity: number = DEFAULT_INITIAL_CAPACITY): ShellTable {
  const arrays = createTypedArrays(capacity);
  return {
    body: arrays.int32(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

/**
 * Create an empty body table
 */
function createBodyTable(capacity: number = DEFAULT_INITIAL_CAPACITY): BodyTable {
  const arrays = createTypedArrays(capacity);
  return {
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

/**
 * Grow a typed array to double its size (or minimum newSize)
 */
function growTypedArray<T extends Float64Array | Int32Array | Int8Array | Uint8Array>(
  arr: T,
  minSize: number,
  defaultValue: number = 0
): T {
  const newSize = Math.max(minSize, arr.length * 2);
  const Constructor = arr.constructor as new (len: number) => T;
  const newArr = new Constructor(newSize);
  newArr.set(arr);
  // Fill new slots with default value
  if (defaultValue !== 0) {
    for (let i = arr.length; i < newSize; i++) {
      (newArr as unknown as number[])[i] = defaultValue;
    }
  } else if (arr instanceof Int32Array) {
    // Fill Int32Array new slots with NULL_ID
    for (let i = arr.length; i < newSize; i++) {
      (newArr as Int32Array)[i] = NULL_ID;
    }
  }
  return newArr;
}

/**
 * Ensure a table has capacity for at least one more entry
 */
function ensureVertexCapacity(table: VertexTable): void {
  if (table.count >= table.x.length) {
    const newCapacity = Math.max(table.count + 1, table.x.length * 2);
    table.x = growTypedArray(table.x, newCapacity);
    table.y = growTypedArray(table.y, newCapacity);
    table.z = growTypedArray(table.z, newCapacity);
    table.flags = growTypedArray(table.flags, newCapacity);
  }
}

function ensureEdgeCapacity(table: EdgeTable): void {
  if (table.count >= table.vStart.length) {
    const newCapacity = Math.max(table.count + 1, table.vStart.length * 2);
    table.vStart = growTypedArray(table.vStart, newCapacity);
    table.vEnd = growTypedArray(table.vEnd, newCapacity);
    table.curveIndex = growTypedArray(table.curveIndex, newCapacity);
    table.tStart = growTypedArray(table.tStart, newCapacity);
    table.tEnd = growTypedArray(table.tEnd, newCapacity, 1); // default to 1
    table.halfEdge = growTypedArray(table.halfEdge, newCapacity);
    table.flags = growTypedArray(table.flags, newCapacity);
  }
}

function ensureHalfEdgeCapacity(table: HalfEdgeTable): void {
  if (table.count >= table.edge.length) {
    const newCapacity = Math.max(table.count + 1, table.edge.length * 2);
    table.edge = growTypedArray(table.edge, newCapacity);
    table.loop = growTypedArray(table.loop, newCapacity);
    table.next = growTypedArray(table.next, newCapacity);
    table.prev = growTypedArray(table.prev, newCapacity);
    table.twin = growTypedArray(table.twin, newCapacity);
    table.direction = growTypedArray(table.direction, newCapacity);
    table.flags = growTypedArray(table.flags, newCapacity);
  }
}

function ensureLoopCapacity(table: LoopTable): void {
  if (table.count >= table.face.length) {
    const newCapacity = Math.max(table.count + 1, table.face.length * 2);
    table.face = growTypedArray(table.face, newCapacity);
    table.firstHalfEdge = growTypedArray(table.firstHalfEdge, newCapacity);
    table.halfEdgeCount = growTypedArray(table.halfEdgeCount, newCapacity);
    table.flags = growTypedArray(table.flags, newCapacity);
  }
}

function ensureFaceCapacity(table: FaceTable): void {
  if (table.count >= table.shell.length) {
    const newCapacity = Math.max(table.count + 1, table.shell.length * 2);
    table.shell = growTypedArray(table.shell, newCapacity);
    table.surfaceIndex = growTypedArray(table.surfaceIndex, newCapacity);
    table.flags = growTypedArray(table.flags, newCapacity);
  }
}

function ensureShellCapacity(table: ShellTable): void {
  if (table.count >= table.body.length) {
    const newCapacity = Math.max(table.count + 1, table.body.length * 2);
    table.body = growTypedArray(table.body, newCapacity);
    table.flags = growTypedArray(table.flags, newCapacity);
  }
}

function ensureBodyCapacity(table: BodyTable): void {
  if (table.count >= table.flags.length) {
    const newCapacity = Math.max(table.count + 1, table.flags.length * 2);
    table.flags = growTypedArray(table.flags, newCapacity);
  }
}

/**
 * Create an empty topology model
 * 
 * @param ctx Numeric context for tolerance-aware operations
 * @returns Empty TopoModel ready for use
 */
export function createEmptyModel(ctx: NumericContext): TopoModel {
  return {
    vertices: createVertexTable(),
    edges: createEdgeTable(),
    halfEdges: createHalfEdgeTable(),
    loops: createLoopTable(),
    faces: createFaceTable(),
    shells: createShellTable(),
    bodies: createBodyTable(),
    faceLoops: [],
    shellFaces: [],
    bodyShells: [],
    curves: [],
    surfaces: [],
    ctx,
  };
}

// ============================================================================
// Vertex operations
// ============================================================================

/**
 * Add a vertex to the model
 * 
 * @param model The topology model
 * @param x X coordinate
 * @param y Y coordinate
 * @param z Z coordinate
 * @returns Handle to the new vertex
 */
export function addVertex(model: TopoModel, x: number, y: number, z: number): VertexId {
  const table = model.vertices;
  ensureVertexCapacity(table);
  
  const id = table.count;
  table.x[id] = x;
  table.y[id] = y;
  table.z[id] = z;
  table.flags[id] = EntityFlags.NONE;
  table.count++;
  table.liveCount++;
  
  return asVertexId(id);
}

/**
 * Add a vertex from a Vec3
 */
export function addVertexVec3(model: TopoModel, p: Vec3): VertexId {
  return addVertex(model, p[0], p[1], p[2]);
}

/**
 * Get vertex position
 */
export function getVertexPosition(model: TopoModel, id: VertexId): Vec3 {
  const table = model.vertices;
  return [table.x[id], table.y[id], table.z[id]];
}

/**
 * Set vertex position
 */
export function setVertexPosition(model: TopoModel, id: VertexId, p: Vec3): void {
  const table = model.vertices;
  table.x[id] = p[0];
  table.y[id] = p[1];
  table.z[id] = p[2];
}

/**
 * Check if a vertex is deleted
 */
export function isVertexDeleted(model: TopoModel, id: VertexId): boolean {
  return (model.vertices.flags[id] & EntityFlags.DELETED) !== 0;
}

// ============================================================================
// Surface and curve geometry operations
// ============================================================================

/**
 * Add a surface to the model
 * 
 * @param model The topology model
 * @param surface The surface geometry
 * @returns Index of the new surface
 */
export function addSurface(model: TopoModel, surface: Surface): SurfaceIndex {
  const idx = model.surfaces.length;
  model.surfaces.push(surface);
  return asSurfaceIndex(idx);
}

/**
 * Get a surface by index
 */
export function getSurface(model: TopoModel, idx: SurfaceIndex): Surface {
  return model.surfaces[idx];
}

/**
 * Add a 3D curve to the model
 * 
 * @param model The topology model
 * @param curve The curve geometry
 * @returns Index of the new curve
 */
export function addCurve3D(model: TopoModel, curve: Curve3D): Curve3DIndex {
  const idx = model.curves.length;
  model.curves.push(curve);
  return asCurve3DIndex(idx);
}

/**
 * Get a 3D curve by index
 */
export function getCurve3D(model: TopoModel, idx: Curve3DIndex): Curve3D {
  return model.curves[idx];
}

// ============================================================================
// Edge operations
// ============================================================================

/**
 * Add an edge to the model
 * 
 * @param model The topology model
 * @param vStart Start vertex
 * @param vEnd End vertex
 * @param curveIndex Index into curves array, or NULL_ID for straight line
 * @param tStart Parameter start on curve (default 0)
 * @param tEnd Parameter end on curve (default 1)
 * @returns Handle to the new edge
 */
export function addEdge(
  model: TopoModel,
  vStart: VertexId,
  vEnd: VertexId,
  curveIndex: Curve3DIndex | typeof NULL_ID = NULL_ID,
  tStart: number = 0,
  tEnd: number = 1
): EdgeId {
  const table = model.edges;
  ensureEdgeCapacity(table);
  
  const id = table.count;
  table.vStart[id] = vStart;
  table.vEnd[id] = vEnd;
  table.curveIndex[id] = curveIndex;
  table.tStart[id] = tStart;
  table.tEnd[id] = tEnd;
  table.halfEdge[id] = NULL_ID;
  table.flags[id] = EntityFlags.NONE;
  table.count++;
  table.liveCount++;
  
  return asEdgeId(id);
}

/**
 * Get edge start vertex
 */
export function getEdgeStartVertex(model: TopoModel, id: EdgeId): VertexId {
  return asVertexId(model.edges.vStart[id]);
}

/**
 * Get edge end vertex
 */
export function getEdgeEndVertex(model: TopoModel, id: EdgeId): VertexId {
  return asVertexId(model.edges.vEnd[id]);
}

/**
 * Get edge curve index
 */
export function getEdgeCurveIndex(model: TopoModel, id: EdgeId): Curve3DIndex | typeof NULL_ID {
  const idx = model.edges.curveIndex[id];
  return idx === NULL_ID ? NULL_ID : asCurve3DIndex(idx);
}

/**
 * Get edge parameter start
 */
export function getEdgeTStart(model: TopoModel, id: EdgeId): number {
  return model.edges.tStart[id];
}

/**
 * Get edge parameter end
 */
export function getEdgeTEnd(model: TopoModel, id: EdgeId): number {
  return model.edges.tEnd[id];
}

/**
 * Check if an edge is deleted
 */
export function isEdgeDeleted(model: TopoModel, id: EdgeId): boolean {
  return (model.edges.flags[id] & EntityFlags.DELETED) !== 0;
}

// ============================================================================
// Half-edge operations
// ============================================================================

/**
 * Add a half-edge to the model
 * 
 * @param model The topology model
 * @param edge The edge this half-edge uses
 * @param direction 1 = same direction as edge, -1 = reversed
 * @returns Handle to the new half-edge
 */
export function addHalfEdge(
  model: TopoModel,
  edge: EdgeId,
  direction: 1 | -1 = 1
): HalfEdgeId {
  const table = model.halfEdges;
  ensureHalfEdgeCapacity(table);
  
  const id = table.count;
  table.edge[id] = edge;
  table.loop[id] = NULL_ID;
  table.next[id] = NULL_ID;
  table.prev[id] = NULL_ID;
  table.twin[id] = NULL_ID;
  table.direction[id] = direction;
  table.flags[id] = EntityFlags.NONE;
  table.count++;
  table.liveCount++;
  
  // Link edge to this half-edge if not already linked
  if (model.edges.halfEdge[edge] === NULL_ID) {
    model.edges.halfEdge[edge] = id;
  }
  
  return asHalfEdgeId(id);
}

/**
 * Set the twin half-edge (same edge, opposite direction)
 */
export function setHalfEdgeTwin(model: TopoModel, he: HalfEdgeId, twin: HalfEdgeId): void {
  model.halfEdges.twin[he] = twin;
  model.halfEdges.twin[twin] = he;
}

/**
 * Link half-edges in a loop (set next/prev pointers)
 */
export function linkHalfEdges(model: TopoModel, he1: HalfEdgeId, he2: HalfEdgeId): void {
  model.halfEdges.next[he1] = he2;
  model.halfEdges.prev[he2] = he1;
}

/**
 * Get half-edge's edge
 */
export function getHalfEdgeEdge(model: TopoModel, id: HalfEdgeId): EdgeId {
  return asEdgeId(model.halfEdges.edge[id]);
}

/**
 * Get half-edge's loop
 */
export function getHalfEdgeLoop(model: TopoModel, id: HalfEdgeId): LoopId {
  const loopId = model.halfEdges.loop[id];
  return loopId === NULL_ID ? asLoopId(NULL_ID) : asLoopId(loopId);
}

/**
 * Get half-edge's next half-edge in the loop
 */
export function getHalfEdgeNext(model: TopoModel, id: HalfEdgeId): HalfEdgeId {
  const nextId = model.halfEdges.next[id];
  return nextId === NULL_ID ? asHalfEdgeId(NULL_ID) : asHalfEdgeId(nextId);
}

/**
 * Get half-edge's previous half-edge in the loop
 */
export function getHalfEdgePrev(model: TopoModel, id: HalfEdgeId): HalfEdgeId {
  const prevId = model.halfEdges.prev[id];
  return prevId === NULL_ID ? asHalfEdgeId(NULL_ID) : asHalfEdgeId(prevId);
}

/**
 * Get half-edge's twin (same edge, opposite direction)
 */
export function getHalfEdgeTwin(model: TopoModel, id: HalfEdgeId): HalfEdgeId {
  const twinId = model.halfEdges.twin[id];
  return twinId === NULL_ID ? asHalfEdgeId(NULL_ID) : asHalfEdgeId(twinId);
}

/**
 * Get half-edge direction (1 = same as edge, -1 = reversed)
 */
export function getHalfEdgeDirection(model: TopoModel, id: HalfEdgeId): 1 | -1 {
  return model.halfEdges.direction[id] as 1 | -1;
}

/**
 * Get the start vertex of a half-edge (considering direction)
 */
export function getHalfEdgeStartVertex(model: TopoModel, id: HalfEdgeId): VertexId {
  const edge = getHalfEdgeEdge(model, id);
  const dir = getHalfEdgeDirection(model, id);
  return dir === 1 ? getEdgeStartVertex(model, edge) : getEdgeEndVertex(model, edge);
}

/**
 * Get the end vertex of a half-edge (considering direction)
 */
export function getHalfEdgeEndVertex(model: TopoModel, id: HalfEdgeId): VertexId {
  const edge = getHalfEdgeEdge(model, id);
  const dir = getHalfEdgeDirection(model, id);
  return dir === 1 ? getEdgeEndVertex(model, edge) : getEdgeStartVertex(model, edge);
}

// ============================================================================
// Loop operations
// ============================================================================

/**
 * Add a loop to the model
 * 
 * Note: This creates the loop but does NOT add it to a face.
 * Use addLoopToFace() to associate the loop with a face.
 * 
 * @param model The topology model
 * @param halfEdges Array of half-edge IDs forming the loop (in order)
 * @returns Handle to the new loop
 */
export function addLoop(
  model: TopoModel,
  halfEdges: HalfEdgeId[]
): LoopId {
  const table = model.loops;
  ensureLoopCapacity(table);
  
  const id = table.count;
  const firstHe = halfEdges[0];
  
  table.face[id] = NULL_ID;
  table.firstHalfEdge[id] = firstHe;
  table.halfEdgeCount[id] = halfEdges.length;
  table.flags[id] = EntityFlags.NONE;
  table.count++;
  table.liveCount++;
  
  const loopId = asLoopId(id);
  
  // Link half-edges to this loop and to each other
  for (let i = 0; i < halfEdges.length; i++) {
    const he = halfEdges[i];
    model.halfEdges.loop[he] = id;
    
    // Link to next half-edge (wrapping around)
    const nextHe = halfEdges[(i + 1) % halfEdges.length];
    linkHalfEdges(model, he, nextHe);
  }
  
  return loopId;
}

/**
 * Add a loop to a face
 * 
 * @param model The topology model
 * @param face The face to add the loop to
 * @param loop The loop to add
 * @param isOuter If true, this is the outer boundary (must be first loop added)
 */
export function addLoopToFace(model: TopoModel, face: FaceId, loop: LoopId): void {
  // Update loop's face reference
  model.loops.face[loop] = face;
  
  // Add to faceLoops array
  if (!model.faceLoops[face]) {
    model.faceLoops[face] = [];
  }
  model.faceLoops[face].push(loop);
}

/**
 * Get loop's face
 */
export function getLoopFace(model: TopoModel, id: LoopId): FaceId {
  return asFaceId(model.loops.face[id]);
}

/**
 * Get loop's first half-edge
 */
export function getLoopFirstHalfEdge(model: TopoModel, id: LoopId): HalfEdgeId {
  return asHalfEdgeId(model.loops.firstHalfEdge[id]);
}

/**
 * Get loop's half-edge count
 */
export function getLoopHalfEdgeCount(model: TopoModel, id: LoopId): number {
  return model.loops.halfEdgeCount[id];
}

/**
 * Iterate over all half-edges in a loop
 */
export function* iterateLoopHalfEdges(model: TopoModel, id: LoopId): Generator<HalfEdgeId> {
  const firstHe = getLoopFirstHalfEdge(model, id);
  if (isNullId(firstHe)) return;
  
  let he = firstHe;
  do {
    yield he;
    he = getHalfEdgeNext(model, he);
  } while (he !== firstHe && !isNullId(he));
}

// ============================================================================
// Face operations
// ============================================================================

/**
 * Add a face to the model
 * 
 * Note: This creates the face but does NOT add it to a shell.
 * Use addFaceToShell() to associate the face with a shell.
 * 
 * @param model The topology model
 * @param surfaceIndex Index into surfaces array
 * @param reversed Whether face normal is reversed relative to surface normal
 * @returns Handle to the new face
 */
export function addFace(
  model: TopoModel,
  surfaceIndex: SurfaceIndex,
  reversed: boolean = false
): FaceId {
  const table = model.faces;
  ensureFaceCapacity(table);
  
  const id = table.count;
  table.shell[id] = NULL_ID;
  table.surfaceIndex[id] = surfaceIndex;
  table.flags[id] = reversed ? EntityFlags.REVERSED : EntityFlags.NONE;
  table.count++;
  table.liveCount++;
  
  // Initialize empty loops array for this face
  model.faceLoops[id] = [];
  
  return asFaceId(id);
}

/**
 * Add a face to a shell
 * 
 * @param model The topology model
 * @param shell The shell to add the face to
 * @param face The face to add
 */
export function addFaceToShell(model: TopoModel, shell: ShellId, face: FaceId): void {
  // Update face's shell reference
  model.faces.shell[face] = shell;
  
  // Add to shellFaces array
  if (!model.shellFaces[shell]) {
    model.shellFaces[shell] = [];
  }
  model.shellFaces[shell].push(face);
}

/**
 * Get face's shell
 */
export function getFaceShell(model: TopoModel, id: FaceId): ShellId {
  return asShellId(model.faces.shell[id]);
}

/**
 * Get face's surface index
 */
export function getFaceSurfaceIndex(model: TopoModel, id: FaceId): SurfaceIndex {
  return asSurfaceIndex(model.faces.surfaceIndex[id]);
}

/**
 * Get face's loops (first is outer boundary, rest are holes)
 */
export function getFaceLoops(model: TopoModel, id: FaceId): readonly LoopId[] {
  return model.faceLoops[id] || [];
}

/**
 * Get face's loop count
 */
export function getFaceLoopCount(model: TopoModel, id: FaceId): number {
  return model.faceLoops[id]?.length || 0;
}

/**
 * Get face's outer loop (first loop)
 */
export function getFaceOuterLoop(model: TopoModel, id: FaceId): LoopId | null {
  const loops = model.faceLoops[id];
  return loops && loops.length > 0 ? loops[0] : null;
}

/**
 * Check if face is reversed (normal points opposite to surface normal)
 */
export function isFaceReversed(model: TopoModel, id: FaceId): boolean {
  return (model.faces.flags[id] & EntityFlags.REVERSED) !== 0;
}

/**
 * Check if a face is deleted
 */
export function isFaceDeleted(model: TopoModel, id: FaceId): boolean {
  return (model.faces.flags[id] & EntityFlags.DELETED) !== 0;
}

/**
 * Iterate over all loops of a face
 */
export function* iterateFaceLoops(model: TopoModel, id: FaceId): Generator<LoopId> {
  const loops = model.faceLoops[id];
  if (loops) {
    for (const loop of loops) {
      yield loop;
    }
  }
}

// ============================================================================
// Shell operations
// ============================================================================

/**
 * Add a shell to the model
 * 
 * Note: This creates the shell but does NOT add it to a body.
 * Use addShellToBody() to associate the shell with a body.
 * 
 * @param model The topology model
 * @param closed Whether the shell is closed (watertight solid)
 * @returns Handle to the new shell
 */
export function addShell(
  model: TopoModel,
  closed: boolean = false
): ShellId {
  const table = model.shells;
  ensureShellCapacity(table);
  
  const id = table.count;
  table.body[id] = NULL_ID;
  table.flags[id] = closed ? EntityFlags.CLOSED : EntityFlags.NONE;
  table.count++;
  table.liveCount++;
  
  // Initialize empty faces array for this shell
  model.shellFaces[id] = [];
  
  return asShellId(id);
}

/**
 * Add a shell to a body
 * 
 * @param model The topology model
 * @param body The body to add the shell to
 * @param shell The shell to add
 */
export function addShellToBody(model: TopoModel, body: BodyId, shell: ShellId): void {
  // Update shell's body reference
  model.shells.body[shell] = body;
  
  // Add to bodyShells array
  if (!model.bodyShells[body]) {
    model.bodyShells[body] = [];
  }
  model.bodyShells[body].push(shell);
}

/**
 * Get shell's body
 */
export function getShellBody(model: TopoModel, id: ShellId): BodyId {
  return asBodyId(model.shells.body[id]);
}

/**
 * Get shell's faces
 */
export function getShellFaces(model: TopoModel, id: ShellId): readonly FaceId[] {
  return model.shellFaces[id] || [];
}

/**
 * Get shell's face count
 */
export function getShellFaceCount(model: TopoModel, id: ShellId): number {
  return model.shellFaces[id]?.length || 0;
}

/**
 * Check if shell is closed (watertight)
 */
export function isShellClosed(model: TopoModel, id: ShellId): boolean {
  return (model.shells.flags[id] & EntityFlags.CLOSED) !== 0;
}

/**
 * Set shell closed flag
 */
export function setShellClosed(model: TopoModel, id: ShellId, closed: boolean): void {
  if (closed) {
    model.shells.flags[id] |= EntityFlags.CLOSED;
  } else {
    model.shells.flags[id] &= ~EntityFlags.CLOSED;
  }
}

/**
 * Iterate over all faces of a shell
 */
export function* iterateShellFaces(model: TopoModel, id: ShellId): Generator<FaceId> {
  const faces = model.shellFaces[id];
  if (faces) {
    for (const face of faces) {
      yield face;
    }
  }
}

// ============================================================================
// Body operations
// ============================================================================

/**
 * Add a body to the model
 * 
 * @param model The topology model
 * @returns Handle to the new body
 */
export function addBody(model: TopoModel): BodyId {
  const table = model.bodies;
  ensureBodyCapacity(table);
  
  const id = table.count;
  table.flags[id] = EntityFlags.NONE;
  table.count++;
  table.liveCount++;
  
  // Initialize empty shells array for this body
  model.bodyShells[id] = [];
  
  return asBodyId(id);
}

/**
 * Get body's shells
 */
export function getBodyShells(model: TopoModel, id: BodyId): readonly ShellId[] {
  return model.bodyShells[id] || [];
}

/**
 * Get body's shell count
 */
export function getBodyShellCount(model: TopoModel, id: BodyId): number {
  return model.bodyShells[id]?.length || 0;
}

/**
 * Check if a body is deleted
 */
export function isBodyDeleted(model: TopoModel, id: BodyId): boolean {
  return (model.bodies.flags[id] & EntityFlags.DELETED) !== 0;
}

/**
 * Iterate over all shells of a body
 */
export function* iterateBodyShells(model: TopoModel, id: BodyId): Generator<ShellId> {
  const shells = model.bodyShells[id];
  if (shells) {
    for (const shell of shells) {
      yield shell;
    }
  }
}

/**
 * Iterate over all live bodies in the model
 */
export function* iterateBodies(model: TopoModel): Generator<BodyId> {
  for (let i = 0; i < model.bodies.count; i++) {
    if (!isBodyDeleted(model, asBodyId(i))) {
      yield asBodyId(i);
    }
  }
}

// ============================================================================
// Model statistics
// ============================================================================

/**
 * Get counts of all entity types in the model
 */
export function getModelStats(model: TopoModel): {
  vertices: number;
  edges: number;
  halfEdges: number;
  loops: number;
  faces: number;
  shells: number;
  bodies: number;
  curves: number;
  surfaces: number;
} {
  return {
    vertices: model.vertices.liveCount,
    edges: model.edges.liveCount,
    halfEdges: model.halfEdges.liveCount,
    loops: model.loops.liveCount,
    faces: model.faces.liveCount,
    shells: model.shells.liveCount,
    bodies: model.bodies.liveCount,
    curves: model.curves.length,
    surfaces: model.surfaces.length,
  };
}

// ============================================================================
// Backward compatibility - deprecated functions
// ============================================================================

/**
 * @deprecated Use addFace() + addLoopToFace() instead
 */
export function setFaceLoops(model: TopoModel, face: FaceId, loops: LoopId[]): void {
  model.faceLoops[face] = [...loops];
  for (const loop of loops) {
    model.loops.face[loop] = face;
  }
}

/**
 * @deprecated Use addShell() + addFaceToShell() instead
 */
export function setShellFaces(model: TopoModel, shell: ShellId, faces: FaceId[]): void {
  model.shellFaces[shell] = [...faces];
  for (const face of faces) {
    model.faces.shell[face] = shell;
  }
}

/**
 * @deprecated Use addBody() + addShellToBody() instead
 */
export function setBodyShells(model: TopoModel, body: BodyId, shells: ShellId[]): void {
  model.bodyShells[body] = [...shells];
  for (const shell of shells) {
    model.shells.body[shell] = body;
  }
}

/**
 * @deprecated Use getFaceOuterLoop() instead
 */
export function getFaceFirstLoop(model: TopoModel, id: FaceId): LoopId {
  const loops = model.faceLoops[id];
  return loops && loops.length > 0 ? loops[0] : asLoopId(NULL_ID);
}

/**
 * @deprecated Use getBodyShells()[0] instead
 */
export function getBodyFirstShell(model: TopoModel, id: BodyId): ShellId {
  const shells = model.bodyShells[id];
  return shells && shells.length > 0 ? shells[0] : asShellId(NULL_ID);
}

/**
 * @deprecated Use getShellFaces()[0] instead
 */
export function getShellFirstFace(model: TopoModel, id: ShellId): FaceId {
  const faces = model.shellFaces[id];
  return faces && faces.length > 0 ? faces[0] : asFaceId(NULL_ID);
}
