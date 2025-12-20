/**
 * BREP Topology Model - Backward Compatibility Layer
 * 
 * This module re-exports the OO TopoModel class and provides functional
 * wrapper functions for backward compatibility with existing code.
 * 
 * New code should use the TopoModel class directly from ./TopoModel.js
 */

import type { Vec3 } from '../num/vec3.js';
import type { Surface } from '../geom/surface.js';
import type { Curve3D } from '../geom/curve3d.js';
import type { NumericContext } from '../num/tolerance.js';
import {
  TopoModel,
  type ModelStats,
} from './TopoModel.js';
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
} from './handles.js';

// Re-export TopoModel class and types
export { TopoModel, EntityFlags, type ModelStats } from './TopoModel.js';
export * from './handles.js';

/**
 * @deprecated Use `new TopoModel(ctx)` directly
 */
export function createEmptyModel(ctx: NumericContext): TopoModel {
  return new TopoModel(ctx);
}

// =============================================================================
// Functional API wrappers (deprecated - use TopoModel methods directly)
// =============================================================================

/** @deprecated Use `model.addVertex()` */
export function addVertex(model: TopoModel, x: number, y: number, z: number): VertexId {
  return model.addVertex(x, y, z);
}

/** @deprecated Use `model.addVertexVec3()` */
export function addVertexVec3(model: TopoModel, p: Vec3): VertexId {
  return model.addVertexVec3(p);
}

/** @deprecated Use `model.getVertexPosition()` */
export function getVertexPosition(model: TopoModel, id: VertexId): Vec3 {
  return model.getVertexPosition(id);
}

/** @deprecated Use `model.setVertexPosition()` */
export function setVertexPosition(model: TopoModel, id: VertexId, p: Vec3): void {
  model.setVertexPosition(id, p);
}

/** @deprecated Use `model.isVertexDeleted()` */
export function isVertexDeleted(model: TopoModel, id: VertexId): boolean {
  return model.isVertexDeleted(id);
}

/** @deprecated Use `model.addSurface()` */
export function addSurface(model: TopoModel, surface: Surface): SurfaceIndex {
  return model.addSurface(surface);
}

/** @deprecated Use `model.getSurface()` */
export function getSurface(model: TopoModel, idx: SurfaceIndex): Surface {
  return model.getSurface(idx);
}

/** @deprecated Use `model.addCurve3D()` */
export function addCurve3D(model: TopoModel, curve: Curve3D): Curve3DIndex {
  return model.addCurve3D(curve);
}

/** @deprecated Use `model.getCurve3D()` */
export function getCurve3D(model: TopoModel, idx: Curve3DIndex): Curve3D {
  return model.getCurve3D(idx);
}

/** @deprecated Use `model.addEdge()` */
export function addEdge(
  model: TopoModel,
  vStart: VertexId,
  vEnd: VertexId,
  curveIndex: Curve3DIndex | typeof NULL_ID = NULL_ID,
  tStart: number = 0,
  tEnd: number = 1
): EdgeId {
  return model.addEdge(vStart, vEnd, curveIndex, tStart, tEnd);
}

/** @deprecated Use `model.getEdgeStartVertex()` */
export function getEdgeStartVertex(model: TopoModel, id: EdgeId): VertexId {
  return model.getEdgeStartVertex(id);
}

/** @deprecated Use `model.getEdgeEndVertex()` */
export function getEdgeEndVertex(model: TopoModel, id: EdgeId): VertexId {
  return model.getEdgeEndVertex(id);
}

/** @deprecated Use `model.getEdgeCurveIndex()` */
export function getEdgeCurveIndex(model: TopoModel, id: EdgeId): Curve3DIndex | typeof NULL_ID {
  return model.getEdgeCurveIndex(id);
}

/** @deprecated Use `model.getEdgeTStart()` */
export function getEdgeTStart(model: TopoModel, id: EdgeId): number {
  return model.getEdgeTStart(id);
}

/** @deprecated Use `model.getEdgeTEnd()` */
export function getEdgeTEnd(model: TopoModel, id: EdgeId): number {
  return model.getEdgeTEnd(id);
}

/** @deprecated Use `model.isEdgeDeleted()` */
export function isEdgeDeleted(model: TopoModel, id: EdgeId): boolean {
  return model.isEdgeDeleted(id);
}

/** @deprecated Use `model.addHalfEdge()` */
export function addHalfEdge(model: TopoModel, edge: EdgeId, direction: 1 | -1 = 1): HalfEdgeId {
  return model.addHalfEdge(edge, direction);
}

/** @deprecated Use `model.setHalfEdgeTwin()` */
export function setHalfEdgeTwin(model: TopoModel, he: HalfEdgeId, twin: HalfEdgeId): void {
  model.setHalfEdgeTwin(he, twin);
}

/** @deprecated Use `model.linkHalfEdges()` */
export function linkHalfEdges(model: TopoModel, he1: HalfEdgeId, he2: HalfEdgeId): void {
  model.linkHalfEdges(he1, he2);
}

/** @deprecated Use `model.getHalfEdgeEdge()` */
export function getHalfEdgeEdge(model: TopoModel, id: HalfEdgeId): EdgeId {
  return model.getHalfEdgeEdge(id);
}

/** @deprecated Use `model.getHalfEdgeLoop()` */
export function getHalfEdgeLoop(model: TopoModel, id: HalfEdgeId): LoopId {
  return model.getHalfEdgeLoop(id);
}

/** @deprecated Use `model.getHalfEdgeNext()` */
export function getHalfEdgeNext(model: TopoModel, id: HalfEdgeId): HalfEdgeId {
  return model.getHalfEdgeNext(id);
}

/** @deprecated Use `model.getHalfEdgePrev()` */
export function getHalfEdgePrev(model: TopoModel, id: HalfEdgeId): HalfEdgeId {
  return model.getHalfEdgePrev(id);
}

/** @deprecated Use `model.getHalfEdgeTwin()` */
export function getHalfEdgeTwin(model: TopoModel, id: HalfEdgeId): HalfEdgeId {
  return model.getHalfEdgeTwin(id);
}

/** @deprecated Use `model.getHalfEdgeDirection()` */
export function getHalfEdgeDirection(model: TopoModel, id: HalfEdgeId): 1 | -1 {
  return model.getHalfEdgeDirection(id);
}

/** @deprecated Use `model.getHalfEdgeStartVertex()` */
export function getHalfEdgeStartVertex(model: TopoModel, id: HalfEdgeId): VertexId {
  return model.getHalfEdgeStartVertex(id);
}

/** @deprecated Use `model.getHalfEdgeEndVertex()` */
export function getHalfEdgeEndVertex(model: TopoModel, id: HalfEdgeId): VertexId {
  return model.getHalfEdgeEndVertex(id);
}

/** @deprecated Use `model.addLoop()` */
export function addLoop(model: TopoModel, halfEdges: HalfEdgeId[]): LoopId {
  return model.addLoop(halfEdges);
}

/** @deprecated Use `model.addLoopToFace()` */
export function addLoopToFace(model: TopoModel, face: FaceId, loop: LoopId): void {
  model.addLoopToFace(face, loop);
}

/** @deprecated Use `model.getLoopFace()` */
export function getLoopFace(model: TopoModel, id: LoopId): FaceId {
  return model.getLoopFace(id);
}

/** @deprecated Use `model.getLoopFirstHalfEdge()` */
export function getLoopFirstHalfEdge(model: TopoModel, id: LoopId): HalfEdgeId {
  return model.getLoopFirstHalfEdge(id);
}

/** @deprecated Use `model.getLoopHalfEdgeCount()` */
export function getLoopHalfEdgeCount(model: TopoModel, id: LoopId): number {
  return model.getLoopHalfEdgeCount(id);
}

/** @deprecated Use `model.iterateLoopHalfEdges()` */
export function* iterateLoopHalfEdges(model: TopoModel, id: LoopId): Generator<HalfEdgeId> {
  yield* model.iterateLoopHalfEdges(id);
}

/** @deprecated Use `model.addFace()` */
export function addFace(model: TopoModel, surfaceIndex: SurfaceIndex, reversed: boolean = false): FaceId {
  return model.addFace(surfaceIndex, reversed);
}

/** @deprecated Use `model.addFaceToShell()` */
export function addFaceToShell(model: TopoModel, shell: ShellId, face: FaceId): void {
  model.addFaceToShell(shell, face);
}

/** @deprecated Use `model.getFaceShell()` */
export function getFaceShell(model: TopoModel, id: FaceId): ShellId {
  return model.getFaceShell(id);
}

/** @deprecated Use `model.getFaceSurfaceIndex()` */
export function getFaceSurfaceIndex(model: TopoModel, id: FaceId): SurfaceIndex {
  return model.getFaceSurfaceIndex(id);
}

/** @deprecated Use `model.getFaceLoops()` */
export function getFaceLoops(model: TopoModel, id: FaceId): readonly LoopId[] {
  return model.getFaceLoops(id);
}

/** @deprecated Use `model.getFaceLoopCount()` */
export function getFaceLoopCount(model: TopoModel, id: FaceId): number {
  return model.getFaceLoopCount(id);
}

/** @deprecated Use `model.getFaceOuterLoop()` */
export function getFaceOuterLoop(model: TopoModel, id: FaceId): LoopId | null {
  return model.getFaceOuterLoop(id);
}

/** @deprecated Use `model.isFaceReversed()` */
export function isFaceReversed(model: TopoModel, id: FaceId): boolean {
  return model.isFaceReversed(id);
}

/** @deprecated Use `model.isFaceDeleted()` */
export function isFaceDeleted(model: TopoModel, id: FaceId): boolean {
  return model.isFaceDeleted(id);
}

/** @deprecated Use `model.iterateFaceLoops()` */
export function* iterateFaceLoops(model: TopoModel, id: FaceId): Generator<LoopId> {
  yield* model.iterateFaceLoops(id);
}

/** @deprecated Use `model.addShell()` */
export function addShell(model: TopoModel, closed: boolean = false): ShellId {
  return model.addShell(closed);
}

/** @deprecated Use `model.addShellToBody()` */
export function addShellToBody(model: TopoModel, body: BodyId, shell: ShellId): void {
  model.addShellToBody(body, shell);
}

/** @deprecated Use `model.getShellBody()` */
export function getShellBody(model: TopoModel, id: ShellId): BodyId {
  return model.getShellBody(id);
}

/** @deprecated Use `model.getShellFaces()` */
export function getShellFaces(model: TopoModel, id: ShellId): readonly FaceId[] {
  return model.getShellFaces(id);
}

/** @deprecated Use `model.getShellFaceCount()` */
export function getShellFaceCount(model: TopoModel, id: ShellId): number {
  return model.getShellFaceCount(id);
}

/** @deprecated Use `model.isShellClosed()` */
export function isShellClosed(model: TopoModel, id: ShellId): boolean {
  return model.isShellClosed(id);
}

/** @deprecated Use `model.setShellClosed()` */
export function setShellClosed(model: TopoModel, id: ShellId, closed: boolean): void {
  model.setShellClosed(id, closed);
}

/** @deprecated Use `model.iterateShellFaces()` */
export function* iterateShellFaces(model: TopoModel, id: ShellId): Generator<FaceId> {
  yield* model.iterateShellFaces(id);
}

/** @deprecated Use `model.addBody()` */
export function addBody(model: TopoModel): BodyId {
  return model.addBody();
}

/** @deprecated Use `model.getBodyShells()` */
export function getBodyShells(model: TopoModel, id: BodyId): readonly ShellId[] {
  return model.getBodyShells(id);
}

/** @deprecated Use `model.getBodyShellCount()` */
export function getBodyShellCount(model: TopoModel, id: BodyId): number {
  return model.getBodyShellCount(id);
}

/** @deprecated Use `model.isBodyDeleted()` */
export function isBodyDeleted(model: TopoModel, id: BodyId): boolean {
  return model.isBodyDeleted(id);
}

/** @deprecated Use `model.iterateBodyShells()` */
export function* iterateBodyShells(model: TopoModel, id: BodyId): Generator<ShellId> {
  yield* model.iterateBodyShells(id);
}

/** @deprecated Use `model.iterateBodies()` */
export function* iterateBodies(model: TopoModel): Generator<BodyId> {
  yield* model.iterateBodies();
}

/** @deprecated Use `model.getStats()` */
export function getModelStats(model: TopoModel): ModelStats {
  return model.getStats();
}

/** @deprecated Use `model.setFaceLoops()` */
export function setFaceLoops(model: TopoModel, face: FaceId, loops: LoopId[]): void {
  model.setFaceLoops(face, loops);
}

/** @deprecated Use `model.setShellFaces()` */
export function setShellFaces(model: TopoModel, shell: ShellId, faces: FaceId[]): void {
  model.setShellFaces(shell, faces);
}

/** @deprecated Use `model.setBodyShells()` */
export function setBodyShells(model: TopoModel, body: BodyId, shells: ShellId[]): void {
  model.setBodyShells(body, shells);
}

/** @deprecated Use `model.getFaceFirstLoop()` */
export function getFaceFirstLoop(model: TopoModel, id: FaceId): LoopId {
  return model.getFaceFirstLoop(id);
}

/** @deprecated Use `model.getBodyFirstShell()` */
export function getBodyFirstShell(model: TopoModel, id: BodyId): ShellId {
  return model.getBodyFirstShell(id);
}

/** @deprecated Use `model.getShellFirstFace()` */
export function getShellFirstFace(model: TopoModel, id: ShellId): FaceId {
  return model.getShellFirstFace(id);
}
