/**
 * Branded handle types for BREP topology
 *
 * These are numeric handles that provide type safety through TypeScript's
 * structural typing. Each handle type is a number with a phantom brand
 * that prevents accidental mixing of different entity types.
 *
 * The actual values are indices into the corresponding tables in TopoModel.
 */

/**
 * Handle to a body in the model
 * A body is a collection of shells representing a solid or surface body.
 */
export type BodyId = number & { __brand: `BodyId` };

/**
 * Handle to a shell in the model
 * A shell is a connected set of faces that forms a closed or open boundary.
 */
export type ShellId = number & { __brand: `ShellId` };

/**
 * Handle to a face in the model
 * A face is a bounded portion of a surface.
 */
export type FaceId = number & { __brand: `FaceId` };

/**
 * Handle to an edge in the model
 * An edge is a bounded portion of a 3D curve shared by adjacent faces.
 */
export type EdgeId = number & { __brand: `EdgeId` };

/**
 * Handle to a half-edge in the model
 * A half-edge represents the usage of an edge within a particular loop,
 * with a specific direction.
 */
export type HalfEdgeId = number & { __brand: `HalfEdgeId` };

/**
 * Handle to a loop in the model
 * A loop is a closed sequence of half-edges forming a boundary of a face.
 * The first loop of a face is the outer boundary; subsequent loops are holes.
 */
export type LoopId = number & { __brand: `LoopId` };

/**
 * Handle to a vertex in the model
 * A vertex is a point in 3D space where edges meet.
 */
export type VertexId = number & { __brand: `VertexId` };

/**
 * Index into the surface array (geometry)
 */
export type SurfaceIndex = number & { __brand: `SurfaceIndex` };

/**
 * Index into the 3D curve array (geometry)
 */
export type Curve3DIndex = number & { __brand: `Curve3DIndex` };

/**
 * Index into the 2D curve array (geometry)
 */
export type Curve2DIndex = number & { __brand: `Curve2DIndex` };

/**
 * Index into the p-curve array
 * A p-curve represents a 2D curve in the UV space of a surface,
 * corresponding to a 3D edge projected onto that surface.
 */
export type PCurveIndex = number & { __brand: `PCurveIndex` };

/**
 * Sentinel value for "null" handles
 * Used to represent missing/invalid references in tables
 */
export const NULL_ID = -1;

/**
 * Check if a handle is null (invalid/missing)
 */
export function isNullId(id: number): boolean {
  return id === NULL_ID;
}

/**
 * Cast a number to a BodyId
 * @internal Use with caution - only when reading from known valid sources
 */
export function asBodyId(id: number): BodyId {
  return id as BodyId;
}

/**
 * Cast a number to a ShellId
 * @internal Use with caution - only when reading from known valid sources
 */
export function asShellId(id: number): ShellId {
  return id as ShellId;
}

/**
 * Cast a number to a FaceId
 * @internal Use with caution - only when reading from known valid sources
 */
export function asFaceId(id: number): FaceId {
  return id as FaceId;
}

/**
 * Cast a number to an EdgeId
 * @internal Use with caution - only when reading from known valid sources
 */
export function asEdgeId(id: number): EdgeId {
  return id as EdgeId;
}

/**
 * Cast a number to a HalfEdgeId
 * @internal Use with caution - only when reading from known valid sources
 */
export function asHalfEdgeId(id: number): HalfEdgeId {
  return id as HalfEdgeId;
}

/**
 * Cast a number to a LoopId
 * @internal Use with caution - only when reading from known valid sources
 */
export function asLoopId(id: number): LoopId {
  return id as LoopId;
}

/**
 * Cast a number to a VertexId
 * @internal Use with caution - only when reading from known valid sources
 */
export function asVertexId(id: number): VertexId {
  return id as VertexId;
}

/**
 * Cast a number to a SurfaceIndex
 * @internal Use with caution - only when reading from known valid sources
 */
export function asSurfaceIndex(id: number): SurfaceIndex {
  return id as SurfaceIndex;
}

/**
 * Cast a number to a Curve3DIndex
 * @internal Use with caution - only when reading from known valid sources
 */
export function asCurve3DIndex(id: number): Curve3DIndex {
  return id as Curve3DIndex;
}

/**
 * Cast a number to a Curve2DIndex
 * @internal Use with caution - only when reading from known valid sources
 */
export function asCurve2DIndex(id: number): Curve2DIndex {
  return id as Curve2DIndex;
}

/**
 * Cast a number to a PCurveIndex
 * @internal Use with caution - only when reading from known valid sources
 */
export function asPCurveIndex(id: number): PCurveIndex {
  return id as PCurveIndex;
}
