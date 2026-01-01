/**
 * BREP Topology Model - Object-Oriented API
 *
 * This module provides the core class for representing BREP (Boundary
 * Representation) topology. The design uses a struct-of-arrays layout internally
 * for performance while exposing an object-oriented API.
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

import type { Vec3 } from "../num/vec3.js";
import type { Surface } from "../geom/surface.js";
import type { Curve3D } from "../geom/curve3d.js";
import type { Curve2D } from "../geom/curve2d.js";
import type { NumericContext } from "../num/tolerance.js";
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
  type Curve2DIndex,
  type PCurveIndex,
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
  asCurve2DIndex,
  asPCurveIndex,
  isNullId,
} from "./handles.js";

/**
 * PCurve - parametric curve in surface UV space
 *
 * A p-curve represents a 2D curve in the (u,v) domain of a surface,
 * corresponding to a 3D edge curve. The p-curve uses the same parameter
 * t ∈ [0,1] as the edge curve (SameParameter discipline).
 */
export interface PCurve {
  /** Index of the 2D curve in the model's curve2d array */
  curve2dIndex: Curve2DIndex;
  /** Index of the surface this p-curve lies on */
  surfaceIndex: SurfaceIndex;
}

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
interface VertexTable {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  flags: Uint8Array;
  count: number;
  liveCount: number;
}

/**
 * Edge table - stores edge geometry and connectivity
 */
interface EdgeTable {
  vStart: Int32Array;
  vEnd: Int32Array;
  curveIndex: Int32Array;
  tStart: Float64Array;
  tEnd: Float64Array;
  halfEdge: Int32Array;
  flags: Uint8Array;
  count: number;
  liveCount: number;
}

/**
 * Half-edge table - stores directed edge usage
 */
interface HalfEdgeTable {
  edge: Int32Array;
  loop: Int32Array;
  next: Int32Array;
  prev: Int32Array;
  twin: Int32Array;
  direction: Int8Array;
  /** P-curve index for UV trimming on the face. NULL_ID if not set. */
  pcurve: Int32Array;
  flags: Uint8Array;
  count: number;
  liveCount: number;
}

/**
 * Loop table - stores face boundary information
 */
interface LoopTable {
  face: Int32Array;
  firstHalfEdge: Int32Array;
  halfEdgeCount: Int32Array;
  flags: Uint8Array;
  count: number;
  liveCount: number;
}

/**
 * Face table - stores surface bounds
 */
interface FaceTable {
  shell: Int32Array;
  surfaceIndex: Int32Array;
  flags: Uint8Array;
  count: number;
  liveCount: number;
}

/**
 * Shell table - stores connected sets of faces
 */
interface ShellTable {
  body: Int32Array;
  flags: Uint8Array;
  count: number;
  liveCount: number;
}

/**
 * Body table - stores top-level solid/surface bodies
 */
interface BodyTable {
  flags: Uint8Array;
  count: number;
  liveCount: number;
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

function createEdgeTable(capacity: number = DEFAULT_INITIAL_CAPACITY): EdgeTable {
  const arrays = createTypedArrays(capacity);
  return {
    vStart: arrays.int32(),
    vEnd: arrays.int32(),
    curveIndex: arrays.int32(),
    tStart: arrays.float64(),
    tEnd: arrays.float64Ones(),
    halfEdge: arrays.int32(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

function createHalfEdgeTable(capacity: number = DEFAULT_INITIAL_CAPACITY): HalfEdgeTable {
  const arrays = createTypedArrays(capacity);
  return {
    edge: arrays.int32(),
    loop: arrays.int32(),
    next: arrays.int32(),
    prev: arrays.int32(),
    twin: arrays.int32(),
    direction: arrays.int8(),
    pcurve: arrays.int32(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

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

function createShellTable(capacity: number = DEFAULT_INITIAL_CAPACITY): ShellTable {
  const arrays = createTypedArrays(capacity);
  return {
    body: arrays.int32(),
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

function createBodyTable(capacity: number = DEFAULT_INITIAL_CAPACITY): BodyTable {
  const arrays = createTypedArrays(capacity);
  return {
    flags: arrays.uint8(),
    count: 0,
    liveCount: 0,
  };
}

function growTypedArray<T extends Float64Array | Int32Array | Int8Array | Uint8Array>(
  arr: T,
  minSize: number,
  defaultValue: number = 0
): T {
  const newSize = Math.max(minSize, arr.length * 2);
  const Constructor = arr.constructor as new (len: number) => T;
  const newArr = new Constructor(newSize);
  newArr.set(arr);
  if (defaultValue !== 0) {
    for (let i = arr.length; i < newSize; i++) {
      (newArr as unknown as number[])[i] = defaultValue;
    }
  } else if (arr instanceof Int32Array) {
    for (let i = arr.length; i < newSize; i++) {
      (newArr as Int32Array)[i] = NULL_ID;
    }
  }
  return newArr;
}

/**
 * Model statistics
 */
export interface ModelStats {
  vertices: number;
  edges: number;
  halfEdges: number;
  loops: number;
  faces: number;
  shells: number;
  bodies: number;
  curves: number;
  curves2d: number;
  surfaces: number;
  pcurves: number;
}

/**
 * TopoModel - The main BREP topology model class
 *
 * This class provides an object-oriented interface for creating and manipulating
 * BREP topology. It uses struct-of-arrays internally for performance.
 */
export class TopoModel {
  // Internal storage (struct-of-arrays for performance)
  private _vertices: VertexTable;
  private _edges: EdgeTable;
  private _halfEdges: HalfEdgeTable;
  private _loops: LoopTable;
  private _faces: FaceTable;
  private _shells: ShellTable;
  private _bodies: BodyTable;

  // Relationship arrays
  private _faceLoops: LoopId[][] = [];
  private _shellFaces: FaceId[][] = [];
  private _bodyShells: ShellId[][] = [];

  // Geometry storage
  private _curves: Curve3D[] = [];
  private _curves2d: Curve2D[] = [];
  private _surfaces: Surface[] = [];
  private _pcurves: PCurve[] = [];

  // Numeric context
  private _ctx: NumericContext;

  constructor(ctx: NumericContext) {
    this._ctx = ctx;
    this._vertices = createVertexTable();
    this._edges = createEdgeTable();
    this._halfEdges = createHalfEdgeTable();
    this._loops = createLoopTable();
    this._faces = createFaceTable();
    this._shells = createShellTable();
    this._bodies = createBodyTable();
  }

  /**
   * Get the numeric context
   */
  get ctx(): NumericContext {
    return this._ctx;
  }

  // ==========================================================================
  // Vertex operations
  // ==========================================================================

  /**
   * Add a vertex to the model
   */
  addVertex(x: number, y: number, z: number): VertexId {
    this.ensureVertexCapacity();
    const id = this._vertices.count;
    this._vertices.x[id] = x;
    this._vertices.y[id] = y;
    this._vertices.z[id] = z;
    this._vertices.flags[id] = EntityFlags.NONE;
    this._vertices.count++;
    this._vertices.liveCount++;
    return asVertexId(id);
  }

  /**
   * Add a vertex from a Vec3
   */
  addVertexVec3(p: Vec3): VertexId {
    return this.addVertex(p[0], p[1], p[2]);
  }

  /**
   * Get vertex position
   */
  getVertexPosition(id: VertexId): Vec3 {
    return [this._vertices.x[id], this._vertices.y[id], this._vertices.z[id]];
  }

  /**
   * Set vertex position
   */
  setVertexPosition(id: VertexId, p: Vec3): void {
    this._vertices.x[id] = p[0];
    this._vertices.y[id] = p[1];
    this._vertices.z[id] = p[2];
  }

  /**
   * Check if a vertex is deleted
   */
  isVertexDeleted(id: VertexId): boolean {
    return (this._vertices.flags[id] & EntityFlags.DELETED) !== 0;
  }

  private ensureVertexCapacity(): void {
    if (this._vertices.count >= this._vertices.x.length) {
      const newCapacity = Math.max(this._vertices.count + 1, this._vertices.x.length * 2);
      this._vertices.x = growTypedArray(this._vertices.x, newCapacity);
      this._vertices.y = growTypedArray(this._vertices.y, newCapacity);
      this._vertices.z = growTypedArray(this._vertices.z, newCapacity);
      this._vertices.flags = growTypedArray(this._vertices.flags, newCapacity);
    }
  }

  // ==========================================================================
  // Surface and curve geometry operations
  // ==========================================================================

  /**
   * Add a surface to the model
   */
  addSurface(surface: Surface): SurfaceIndex {
    const idx = this._surfaces.length;
    this._surfaces.push(surface);
    return asSurfaceIndex(idx);
  }

  /**
   * Get a surface by index
   */
  getSurface(idx: SurfaceIndex): Surface {
    return this._surfaces[idx];
  }

  /**
   * Add a 3D curve to the model
   */
  addCurve3D(curve: Curve3D): Curve3DIndex {
    const idx = this._curves.length;
    this._curves.push(curve);
    return asCurve3DIndex(idx);
  }

  /**
   * Get a 3D curve by index
   */
  getCurve3D(idx: Curve3DIndex): Curve3D {
    return this._curves[idx];
  }

  /**
   * Add a 2D curve to the model
   */
  addCurve2D(curve: Curve2D): Curve2DIndex {
    const idx = this._curves2d.length;
    this._curves2d.push(curve);
    return asCurve2DIndex(idx);
  }

  /**
   * Get a 2D curve by index
   */
  getCurve2D(idx: Curve2DIndex): Curve2D {
    return this._curves2d[idx];
  }

  /**
   * Add a p-curve to the model
   * A p-curve is a 2D curve in UV space representing an edge on a surface
   */
  addPCurve(curve2dIndex: Curve2DIndex, surfaceIndex: SurfaceIndex): PCurveIndex {
    const idx = this._pcurves.length;
    this._pcurves.push({ curve2dIndex, surfaceIndex });
    return asPCurveIndex(idx);
  }

  /**
   * Get a p-curve by index
   */
  getPCurve(idx: PCurveIndex): PCurve {
    return this._pcurves[idx];
  }

  // ==========================================================================
  // Edge operations
  // ==========================================================================

  /**
   * Add an edge to the model
   */
  addEdge(
    vStart: VertexId,
    vEnd: VertexId,
    curveIndex: Curve3DIndex | typeof NULL_ID = NULL_ID,
    tStart: number = 0,
    tEnd: number = 1
  ): EdgeId {
    this.ensureEdgeCapacity();
    const id = this._edges.count;
    this._edges.vStart[id] = vStart;
    this._edges.vEnd[id] = vEnd;
    this._edges.curveIndex[id] = curveIndex;
    this._edges.tStart[id] = tStart;
    this._edges.tEnd[id] = tEnd;
    this._edges.halfEdge[id] = NULL_ID;
    this._edges.flags[id] = EntityFlags.NONE;
    this._edges.count++;
    this._edges.liveCount++;
    return asEdgeId(id);
  }

  getEdgeStartVertex(id: EdgeId): VertexId {
    return asVertexId(this._edges.vStart[id]);
  }

  getEdgeEndVertex(id: EdgeId): VertexId {
    return asVertexId(this._edges.vEnd[id]);
  }

  getEdgeCurveIndex(id: EdgeId): Curve3DIndex | typeof NULL_ID {
    const idx = this._edges.curveIndex[id];
    return idx === NULL_ID ? NULL_ID : asCurve3DIndex(idx);
  }

  getEdgeTStart(id: EdgeId): number {
    return this._edges.tStart[id];
  }

  getEdgeTEnd(id: EdgeId): number {
    return this._edges.tEnd[id];
  }

  isEdgeDeleted(id: EdgeId): boolean {
    return (this._edges.flags[id] & EntityFlags.DELETED) !== 0;
  }

  private ensureEdgeCapacity(): void {
    if (this._edges.count >= this._edges.vStart.length) {
      const newCapacity = Math.max(this._edges.count + 1, this._edges.vStart.length * 2);
      this._edges.vStart = growTypedArray(this._edges.vStart, newCapacity);
      this._edges.vEnd = growTypedArray(this._edges.vEnd, newCapacity);
      this._edges.curveIndex = growTypedArray(this._edges.curveIndex, newCapacity);
      this._edges.tStart = growTypedArray(this._edges.tStart, newCapacity);
      this._edges.tEnd = growTypedArray(this._edges.tEnd, newCapacity, 1);
      this._edges.halfEdge = growTypedArray(this._edges.halfEdge, newCapacity);
      this._edges.flags = growTypedArray(this._edges.flags, newCapacity);
    }
  }

  // ==========================================================================
  // Half-edge operations
  // ==========================================================================

  /**
   * Add a half-edge to the model
   */
  addHalfEdge(edge: EdgeId, direction: 1 | -1 = 1): HalfEdgeId {
    this.ensureHalfEdgeCapacity();
    const id = this._halfEdges.count;
    this._halfEdges.edge[id] = edge;
    this._halfEdges.loop[id] = NULL_ID;
    this._halfEdges.next[id] = NULL_ID;
    this._halfEdges.prev[id] = NULL_ID;
    this._halfEdges.twin[id] = NULL_ID;
    this._halfEdges.direction[id] = direction;
    this._halfEdges.pcurve[id] = NULL_ID;
    this._halfEdges.flags[id] = EntityFlags.NONE;
    this._halfEdges.count++;
    this._halfEdges.liveCount++;

    // Link edge to this half-edge if not already linked
    if (this._edges.halfEdge[edge] === NULL_ID) {
      this._edges.halfEdge[edge] = id;
    }

    return asHalfEdgeId(id);
  }

  /**
   * Set the twin half-edge
   */
  setHalfEdgeTwin(he: HalfEdgeId, twin: HalfEdgeId): void {
    this._halfEdges.twin[he] = twin;
    this._halfEdges.twin[twin] = he;
  }

  /**
   * Link half-edges in a loop
   */
  linkHalfEdges(he1: HalfEdgeId, he2: HalfEdgeId): void {
    this._halfEdges.next[he1] = he2;
    this._halfEdges.prev[he2] = he1;
  }

  getHalfEdgeEdge(id: HalfEdgeId): EdgeId {
    return asEdgeId(this._halfEdges.edge[id]);
  }

  getHalfEdgeLoop(id: HalfEdgeId): LoopId {
    const loopId = this._halfEdges.loop[id];
    return loopId === NULL_ID ? asLoopId(NULL_ID) : asLoopId(loopId);
  }

  getHalfEdgeNext(id: HalfEdgeId): HalfEdgeId {
    const nextId = this._halfEdges.next[id];
    return nextId === NULL_ID ? asHalfEdgeId(NULL_ID) : asHalfEdgeId(nextId);
  }

  getHalfEdgePrev(id: HalfEdgeId): HalfEdgeId {
    const prevId = this._halfEdges.prev[id];
    return prevId === NULL_ID ? asHalfEdgeId(NULL_ID) : asHalfEdgeId(prevId);
  }

  getHalfEdgeTwin(id: HalfEdgeId): HalfEdgeId {
    const twinId = this._halfEdges.twin[id];
    return twinId === NULL_ID ? asHalfEdgeId(NULL_ID) : asHalfEdgeId(twinId);
  }

  getHalfEdgeDirection(id: HalfEdgeId): 1 | -1 {
    return this._halfEdges.direction[id] as 1 | -1;
  }

  /**
   * Get the p-curve index for this half-edge
   * Returns NULL_ID if no p-curve is set
   */
  getHalfEdgePCurve(id: HalfEdgeId): PCurveIndex | typeof NULL_ID {
    const pcId = this._halfEdges.pcurve[id];
    return pcId === NULL_ID ? NULL_ID : asPCurveIndex(pcId);
  }

  /**
   * Set the p-curve for this half-edge
   */
  setHalfEdgePCurve(id: HalfEdgeId, pcurve: PCurveIndex): void {
    this._halfEdges.pcurve[id] = pcurve;
  }

  /**
   * Get the start vertex of a half-edge (considering direction)
   */
  getHalfEdgeStartVertex(id: HalfEdgeId): VertexId {
    const edge = this.getHalfEdgeEdge(id);
    const dir = this.getHalfEdgeDirection(id);
    return dir === 1 ? this.getEdgeStartVertex(edge) : this.getEdgeEndVertex(edge);
  }

  /**
   * Get the end vertex of a half-edge (considering direction)
   */
  getHalfEdgeEndVertex(id: HalfEdgeId): VertexId {
    const edge = this.getHalfEdgeEdge(id);
    const dir = this.getHalfEdgeDirection(id);
    return dir === 1 ? this.getEdgeEndVertex(edge) : this.getEdgeStartVertex(edge);
  }

  private ensureHalfEdgeCapacity(): void {
    if (this._halfEdges.count >= this._halfEdges.edge.length) {
      const newCapacity = Math.max(this._halfEdges.count + 1, this._halfEdges.edge.length * 2);
      this._halfEdges.edge = growTypedArray(this._halfEdges.edge, newCapacity);
      this._halfEdges.loop = growTypedArray(this._halfEdges.loop, newCapacity);
      this._halfEdges.next = growTypedArray(this._halfEdges.next, newCapacity);
      this._halfEdges.prev = growTypedArray(this._halfEdges.prev, newCapacity);
      this._halfEdges.twin = growTypedArray(this._halfEdges.twin, newCapacity);
      this._halfEdges.direction = growTypedArray(this._halfEdges.direction, newCapacity);
      this._halfEdges.pcurve = growTypedArray(this._halfEdges.pcurve, newCapacity);
      this._halfEdges.flags = growTypedArray(this._halfEdges.flags, newCapacity);
    }
  }

  // ==========================================================================
  // Loop operations
  // ==========================================================================

  /**
   * Add a loop to the model
   */
  addLoop(halfEdges: HalfEdgeId[]): LoopId {
    this.ensureLoopCapacity();
    const id = this._loops.count;
    const firstHe = halfEdges[0];

    this._loops.face[id] = NULL_ID;
    this._loops.firstHalfEdge[id] = firstHe;
    this._loops.halfEdgeCount[id] = halfEdges.length;
    this._loops.flags[id] = EntityFlags.NONE;
    this._loops.count++;
    this._loops.liveCount++;

    const loopId = asLoopId(id);

    // Link half-edges to this loop and to each other
    for (let i = 0; i < halfEdges.length; i++) {
      const he = halfEdges[i];
      this._halfEdges.loop[he] = id;
      const nextHe = halfEdges[(i + 1) % halfEdges.length];
      this.linkHalfEdges(he, nextHe);
    }

    return loopId;
  }

  /**
   * Add a loop to a face
   */
  addLoopToFace(face: FaceId, loop: LoopId): void {
    this._loops.face[loop] = face;
    if (!this._faceLoops[face]) {
      this._faceLoops[face] = [];
    }
    this._faceLoops[face].push(loop);
  }

  getLoopFace(id: LoopId): FaceId {
    return asFaceId(this._loops.face[id]);
  }

  getLoopFirstHalfEdge(id: LoopId): HalfEdgeId {
    return asHalfEdgeId(this._loops.firstHalfEdge[id]);
  }

  getLoopHalfEdgeCount(id: LoopId): number {
    return this._loops.halfEdgeCount[id];
  }

  /**
   * Iterate over all half-edges in a loop
   */
  *iterateLoopHalfEdges(id: LoopId): Generator<HalfEdgeId> {
    const firstHe = this.getLoopFirstHalfEdge(id);
    if (isNullId(firstHe)) return;

    let he = firstHe;
    do {
      yield he;
      he = this.getHalfEdgeNext(he);
    } while (he !== firstHe && !isNullId(he));
  }

  private ensureLoopCapacity(): void {
    if (this._loops.count >= this._loops.face.length) {
      const newCapacity = Math.max(this._loops.count + 1, this._loops.face.length * 2);
      this._loops.face = growTypedArray(this._loops.face, newCapacity);
      this._loops.firstHalfEdge = growTypedArray(this._loops.firstHalfEdge, newCapacity);
      this._loops.halfEdgeCount = growTypedArray(this._loops.halfEdgeCount, newCapacity);
      this._loops.flags = growTypedArray(this._loops.flags, newCapacity);
    }
  }

  // ==========================================================================
  // Face operations
  // ==========================================================================

  /**
   * Add a face to the model
   */
  addFace(surfaceIndex: SurfaceIndex, reversed: boolean = false): FaceId {
    this.ensureFaceCapacity();
    const id = this._faces.count;
    this._faces.shell[id] = NULL_ID;
    this._faces.surfaceIndex[id] = surfaceIndex;
    this._faces.flags[id] = reversed ? EntityFlags.REVERSED : EntityFlags.NONE;
    this._faces.count++;
    this._faces.liveCount++;
    this._faceLoops[id] = [];
    return asFaceId(id);
  }

  /**
   * Add a face to a shell
   */
  addFaceToShell(shell: ShellId, face: FaceId): void {
    this._faces.shell[face] = shell;
    if (!this._shellFaces[shell]) {
      this._shellFaces[shell] = [];
    }
    this._shellFaces[shell].push(face);
  }

  getFaceShell(id: FaceId): ShellId {
    return asShellId(this._faces.shell[id]);
  }

  getFaceSurfaceIndex(id: FaceId): SurfaceIndex {
    return asSurfaceIndex(this._faces.surfaceIndex[id]);
  }

  getFaceLoops(id: FaceId): readonly LoopId[] {
    return this._faceLoops[id] || [];
  }

  getFaceLoopCount(id: FaceId): number {
    return this._faceLoops[id]?.length || 0;
  }

  getFaceOuterLoop(id: FaceId): LoopId | null {
    const loops = this._faceLoops[id];
    return loops && loops.length > 0 ? loops[0] : null;
  }

  isFaceReversed(id: FaceId): boolean {
    return (this._faces.flags[id] & EntityFlags.REVERSED) !== 0;
  }

  isFaceDeleted(id: FaceId): boolean {
    return (this._faces.flags[id] & EntityFlags.DELETED) !== 0;
  }

  /**
   * Iterate over all loops of a face
   */
  *iterateFaceLoops(id: FaceId): Generator<LoopId> {
    const loops = this._faceLoops[id];
    if (loops) {
      for (const loop of loops) {
        yield loop;
      }
    }
  }

  private ensureFaceCapacity(): void {
    if (this._faces.count >= this._faces.shell.length) {
      const newCapacity = Math.max(this._faces.count + 1, this._faces.shell.length * 2);
      this._faces.shell = growTypedArray(this._faces.shell, newCapacity);
      this._faces.surfaceIndex = growTypedArray(this._faces.surfaceIndex, newCapacity);
      this._faces.flags = growTypedArray(this._faces.flags, newCapacity);
    }
  }

  // ==========================================================================
  // Shell operations
  // ==========================================================================

  /**
   * Add a shell to the model
   */
  addShell(closed: boolean = false): ShellId {
    this.ensureShellCapacity();
    const id = this._shells.count;
    this._shells.body[id] = NULL_ID;
    this._shells.flags[id] = closed ? EntityFlags.CLOSED : EntityFlags.NONE;
    this._shells.count++;
    this._shells.liveCount++;
    this._shellFaces[id] = [];
    return asShellId(id);
  }

  /**
   * Add a shell to a body
   */
  addShellToBody(body: BodyId, shell: ShellId): void {
    this._shells.body[shell] = body;
    if (!this._bodyShells[body]) {
      this._bodyShells[body] = [];
    }
    this._bodyShells[body].push(shell);
  }

  getShellBody(id: ShellId): BodyId {
    return asBodyId(this._shells.body[id]);
  }

  getShellFaces(id: ShellId): readonly FaceId[] {
    return this._shellFaces[id] || [];
  }

  getShellFaceCount(id: ShellId): number {
    return this._shellFaces[id]?.length || 0;
  }

  isShellClosed(id: ShellId): boolean {
    return (this._shells.flags[id] & EntityFlags.CLOSED) !== 0;
  }

  setShellClosed(id: ShellId, closed: boolean): void {
    if (closed) {
      this._shells.flags[id] |= EntityFlags.CLOSED;
    } else {
      this._shells.flags[id] &= ~EntityFlags.CLOSED;
    }
  }

  /**
   * Iterate over all faces of a shell
   */
  *iterateShellFaces(id: ShellId): Generator<FaceId> {
    const faces = this._shellFaces[id];
    if (faces) {
      for (const face of faces) {
        yield face;
      }
    }
  }

  private ensureShellCapacity(): void {
    if (this._shells.count >= this._shells.body.length) {
      const newCapacity = Math.max(this._shells.count + 1, this._shells.body.length * 2);
      this._shells.body = growTypedArray(this._shells.body, newCapacity);
      this._shells.flags = growTypedArray(this._shells.flags, newCapacity);
    }
  }

  // ==========================================================================
  // Body operations
  // ==========================================================================

  /**
   * Add a body to the model
   */
  addBody(): BodyId {
    this.ensureBodyCapacity();
    const id = this._bodies.count;
    this._bodies.flags[id] = EntityFlags.NONE;
    this._bodies.count++;
    this._bodies.liveCount++;
    this._bodyShells[id] = [];
    return asBodyId(id);
  }

  getBodyShells(id: BodyId): readonly ShellId[] {
    return this._bodyShells[id] || [];
  }

  getBodyShellCount(id: BodyId): number {
    return this._bodyShells[id]?.length || 0;
  }

  isBodyDeleted(id: BodyId): boolean {
    return (this._bodies.flags[id] & EntityFlags.DELETED) !== 0;
  }

  /**
   * Iterate over all shells of a body
   */
  *iterateBodyShells(id: BodyId): Generator<ShellId> {
    const shells = this._bodyShells[id];
    if (shells) {
      for (const shell of shells) {
        yield shell;
      }
    }
  }

  /**
   * Iterate over all live bodies
   */
  *iterateBodies(): Generator<BodyId> {
    for (let i = 0; i < this._bodies.count; i++) {
      if (!this.isBodyDeleted(asBodyId(i))) {
        yield asBodyId(i);
      }
    }
  }

  private ensureBodyCapacity(): void {
    if (this._bodies.count >= this._bodies.flags.length) {
      const newCapacity = Math.max(this._bodies.count + 1, this._bodies.flags.length * 2);
      this._bodies.flags = growTypedArray(this._bodies.flags, newCapacity);
    }
  }

  // ==========================================================================
  // Statistics and utilities
  // ==========================================================================

  /**
   * Get counts of all entity types
   */
  getStats(): ModelStats {
    return {
      vertices: this._vertices.liveCount,
      edges: this._edges.liveCount,
      halfEdges: this._halfEdges.liveCount,
      loops: this._loops.liveCount,
      faces: this._faces.liveCount,
      shells: this._shells.liveCount,
      bodies: this._bodies.liveCount,
      curves: this._curves.length,
      curves2d: this._curves2d.length,
      surfaces: this._surfaces.length,
      pcurves: this._pcurves.length,
    };
  }

  /**
   * Get total vertex count (including deleted)
   * @internal For advanced use
   */
  getVertexCount(): number {
    return this._vertices.count;
  }

  /**
   * Get total edge count (including deleted)
   * @internal For advanced use
   */
  getEdgeCount(): number {
    return this._edges.count;
  }

  /**
   * Get total half-edge count (including deleted)
   * @internal For advanced use
   */
  getHalfEdgeCount(): number {
    return this._halfEdges.count;
  }

  /**
   * Get total loop count (including deleted)
   * @internal For advanced use
   */
  getLoopCount(): number {
    return this._loops.count;
  }

  /**
   * Get total face count (including deleted)
   * @internal For advanced use
   */
  getFaceCount(): number {
    return this._faces.count;
  }

  /**
   * Get total shell count (including deleted)
   * @internal For advanced use
   */
  getShellCount(): number {
    return this._shells.count;
  }

  /**
   * Get total body count (including deleted)
   * @internal For advanced use
   */
  getBodyCount(): number {
    return this._bodies.count;
  }

  // ==========================================================================
  // Internal modification methods for healing/repair
  // ==========================================================================

  /**
   * Mark a vertex as deleted
   * @internal For healing operations
   */
  markVertexDeleted(id: VertexId): void {
    this._vertices.flags[id] |= EntityFlags.DELETED;
    this._vertices.liveCount--;
  }

  /**
   * Mark an edge as deleted
   * @internal For healing operations
   */
  markEdgeDeleted(id: EdgeId): void {
    this._edges.flags[id] |= EntityFlags.DELETED;
    this._edges.liveCount--;
  }

  /**
   * Mark a half-edge as deleted
   * @internal For healing operations
   */
  markHalfEdgeDeleted(id: HalfEdgeId): void {
    this._halfEdges.flags[id] |= EntityFlags.DELETED;
    this._halfEdges.liveCount--;
  }

  /**
   * Mark a loop as deleted
   * @internal For healing operations
   */
  markLoopDeleted(id: LoopId): void {
    this._loops.flags[id] |= EntityFlags.DELETED;
    this._loops.liveCount--;
  }

  /**
   * Mark a face as deleted
   * @internal For healing operations
   */
  markFaceDeleted(id: FaceId): void {
    this._faces.flags[id] |= EntityFlags.DELETED;
    this._faces.liveCount--;
  }

  /**
   * Update edge vertex references
   * @internal For healing operations
   */
  setEdgeVertices(id: EdgeId, vStart: VertexId, vEnd: VertexId): void {
    this._edges.vStart[id] = vStart;
    this._edges.vEnd[id] = vEnd;
  }

  /**
   * Clear twin reference for a half-edge
   * @internal For healing operations
   */
  clearHalfEdgeTwin(id: HalfEdgeId): void {
    this._halfEdges.twin[id] = NULL_ID;
  }

  /**
   * Toggle face reversed flag
   * @internal For healing operations
   */
  toggleFaceReversed(id: FaceId): void {
    this._faces.flags[id] ^= EntityFlags.REVERSED;
  }

  /**
   * Set half-edge direction
   * @internal For healing operations
   */
  setHalfEdgeDirection(id: HalfEdgeId, direction: 1 | -1): void {
    this._halfEdges.direction[id] = direction;
  }

  /**
   * Set half-edge next/prev pointers
   * @internal For healing operations
   */
  setHalfEdgeLinks(id: HalfEdgeId, next: HalfEdgeId, prev: HalfEdgeId): void {
    this._halfEdges.next[id] = next;
    this._halfEdges.prev[id] = prev;
  }

  /**
   * Remove a face from a shell
   * @internal For healing operations
   */
  removeFaceFromShell(faceId: FaceId): void {
    const shellId = this._faces.shell[faceId];
    if (shellId !== NULL_ID) {
      const faces = this._shellFaces[shellId];
      if (faces) {
        const idx = faces.indexOf(faceId);
        if (idx >= 0) {
          faces.splice(idx, 1);
        }
      }
    }
  }

  /**
   * Clear face loops
   * @internal For healing operations
   */
  clearFaceLoops(faceId: FaceId): void {
    this._faceLoops[faceId] = [];
  }

  /**
   * Iterate over all edge IDs (for updating vertex references)
   * @internal For healing operations
   */
  *iterateAllEdgeIds(): Generator<EdgeId> {
    for (let i = 0; i < this._edges.count; i++) {
      yield asEdgeId(i);
    }
  }

  /**
   * Get raw edge vertex IDs for healing
   * @internal For healing operations
   */
  getRawEdgeVertices(id: EdgeId): { vStart: number; vEnd: number } {
    return {
      vStart: this._edges.vStart[id],
      vEnd: this._edges.vEnd[id],
    };
  }

  /**
   * Update edge start vertex
   * @internal For healing operations
   */
  setEdgeStartVertex(id: EdgeId, vertex: VertexId): void {
    this._edges.vStart[id] = vertex;
  }

  /**
   * Update edge end vertex
   * @internal For healing operations
   */
  setEdgeEndVertex(id: EdgeId, vertex: VertexId): void {
    this._edges.vEnd[id] = vertex;
  }

  // ==========================================================================
  // Backward compatibility - deprecated methods
  // ==========================================================================

  /** @deprecated Use addFace() + addLoopToFace() instead */
  setFaceLoops(face: FaceId, loops: LoopId[]): void {
    this._faceLoops[face] = [...loops];
    for (const loop of loops) {
      this._loops.face[loop] = face;
    }
  }

  /** @deprecated Use addShell() + addFaceToShell() instead */
  setShellFaces(shell: ShellId, faces: FaceId[]): void {
    this._shellFaces[shell] = [...faces];
    for (const face of faces) {
      this._faces.shell[face] = shell;
    }
  }

  /** @deprecated Use addBody() + addShellToBody() instead */
  setBodyShells(body: BodyId, shells: ShellId[]): void {
    this._bodyShells[body] = [...shells];
    for (const shell of shells) {
      this._shells.body[shell] = body;
    }
  }

  /** @deprecated Use getFaceOuterLoop() instead */
  getFaceFirstLoop(id: FaceId): LoopId {
    const loops = this._faceLoops[id];
    return loops && loops.length > 0 ? loops[0] : asLoopId(NULL_ID);
  }

  /** @deprecated Use getBodyShells()[0] instead */
  getBodyFirstShell(id: BodyId): ShellId {
    const shells = this._bodyShells[id];
    return shells && shells.length > 0 ? shells[0] : asShellId(NULL_ID);
  }

  /** @deprecated Use getShellFaces()[0] instead */
  getShellFirstFace(id: ShellId): FaceId {
    const faces = this._shellFaces[id];
    return faces && faces.length > 0 ? faces[0] : asFaceId(NULL_ID);
  }

  // ==========================================================================
  // Read-only accessors for testing and introspection
  // ==========================================================================

  /**
   * Get read-only access to vertices table
   * @internal For testing and introspection only
   */
  get vertices(): Readonly<{
    x: Float64Array;
    y: Float64Array;
    z: Float64Array;
    flags: Uint8Array;
    count: number;
    liveCount: number;
  }> {
    return this._vertices;
  }

  /**
   * Get read-only access to edges table
   * @internal For testing and introspection only
   */
  get edges(): Readonly<{
    vStart: Int32Array;
    vEnd: Int32Array;
    curveIndex: Int32Array;
    tStart: Float64Array;
    tEnd: Float64Array;
    halfEdge: Int32Array;
    flags: Uint8Array;
    count: number;
    liveCount: number;
  }> {
    return this._edges;
  }

  /**
   * Get read-only access to half-edges table
   * @internal For testing and introspection only
   */
  get halfEdges(): Readonly<{
    edge: Int32Array;
    loop: Int32Array;
    next: Int32Array;
    prev: Int32Array;
    twin: Int32Array;
    direction: Int8Array;
    pcurve: Int32Array;
    flags: Uint8Array;
    count: number;
    liveCount: number;
  }> {
    return this._halfEdges;
  }

  /**
   * Get read-only access to loops table
   * @internal For testing and introspection only
   */
  get loops(): Readonly<{
    firstHalfEdge: Int32Array;
    face: Int32Array;
    flags: Uint8Array;
    count: number;
    liveCount: number;
  }> {
    return this._loops;
  }

  /**
   * Get read-only access to faces table
   * @internal For testing and introspection only
   */
  get faces(): Readonly<{
    surfaceIndex: Int32Array;
    shell: Int32Array;
    flags: Uint8Array;
    count: number;
    liveCount: number;
  }> {
    return this._faces;
  }

  /**
   * Get read-only access to shells table
   * @internal For testing and introspection only
   */
  get shells(): Readonly<{
    body: Int32Array;
    flags: Uint8Array;
    count: number;
    liveCount: number;
  }> {
    return this._shells;
  }

  /**
   * Get read-only access to bodies table
   * @internal For testing and introspection only
   */
  get bodies(): Readonly<{
    flags: Uint8Array;
    count: number;
    liveCount: number;
  }> {
    return this._bodies;
  }

  /**
   * Get read-only access to curves array
   * @internal For testing and introspection only
   */
  get curves(): readonly Curve3D[] {
    return this._curves;
  }

  /**
   * Get read-only access to 2D curves array
   * @internal For testing and introspection only
   */
  get curves2d(): readonly Curve2D[] {
    return this._curves2d;
  }

  /**
   * Get read-only access to surfaces array
   * @internal For testing and introspection only
   */
  get surfaces(): readonly Surface[] {
    return this._surfaces;
  }

  /**
   * Get read-only access to p-curves array
   * @internal For testing and introspection only
   */
  get pcurves(): readonly PCurve[] {
    return this._pcurves;
  }

  /**
   * Get read-only access to face loops adjacency
   * @internal For testing and introspection only
   */
  get faceLoops(): readonly (readonly LoopId[])[] {
    return this._faceLoops;
  }

  /**
   * Get read-only access to shell faces adjacency
   * @internal For testing and introspection only
   */
  get shellFaces(): readonly (readonly FaceId[])[] {
    return this._shellFaces;
  }

  /**
   * Get read-only access to body shells adjacency
   * @internal For testing and introspection only
   */
  get bodyShells(): readonly (readonly ShellId[])[] {
    return this._bodyShells;
  }
}
