/**
 * Types for planar boolean operations
 */

import type { Vec2 } from '../../num/vec2.js';
import type { Vec3 } from '../../num/vec3.js';
import type { FaceId, HalfEdgeId, VertexId } from '../../topo/handles.js';
import type { PlaneSurface } from '../../geom/surface.js';

/**
 * A 2D polygon in the UV space of a planar face
 */
export interface FacePolygon2D {
  faceId: FaceId;
  outer: Vec2[];
  holes: Vec2[][];
  /** The plane surface this polygon lives on */
  surface: PlaneSurface;
  /** Mapping from vertex index to original vertex ID (optional, for reconstruction) */
  vertexIds?: VertexId[];
}

/**
 * A segment in 2D with source tracking
 */
export interface Segment2D {
  a: Vec2;
  b: Vec2;
  /** Which body this segment came from (0 = A, 1 = B) */
  sourceBody: 0 | 1;
  /** Original face ID */
  sourceFace: FaceId;
  /** Original halfedge (if from boundary) or null (if from intersection) */
  sourceHalfEdge: HalfEdgeId | null;
  /** Is this an intersection segment? */
  isIntersection: boolean;
}

/**
 * Result of plane-plane intersection clipped to face boundaries
 */
export interface PlaneIntersectionResult {
  /** The intersection line direction (normalized) */
  direction: Vec3;
  /** A point on the intersection line */
  point: Vec3;
  /** Clipped segments in face A's 2D space */
  segmentsA: Segment2D[];
  /** Clipped segments in face B's 2D space */
  segmentsB: Segment2D[];
}

/**
 * Classification of a face piece relative to another solid
 */
export type PieceClassification = 'inside' | 'outside' | 'on_same' | 'on_opposite';

/**
 * A face piece resulting from imprinting
 */
export interface FacePiece {
  /** 2D polygon in UV space (outer boundary) */
  polygon: Vec2[];
  /** Any holes in this piece */
  holes: Vec2[][];
  /** Classification relative to the other solid */
  classification: PieceClassification;
  /** Original face this piece came from */
  sourceFace: FaceId;
  /** Source body */
  sourceBody: 0 | 1;
  /** The surface (inherited from source face) */
  surface: PlaneSurface;
}

/**
 * Boolean operation type
 */
export type BoolOp = 'union' | 'subtract' | 'intersect';

/**
 * 3D axis-aligned bounding box
 */
export interface BoundingBox3D {
  min: Vec3;
  max: Vec3;
}

/**
 * Result of the selection phase
 */
export interface SelectedPieces {
  /** Pieces to keep from body A */
  fromA: FacePiece[];
  /** Pieces to keep from body B (may need flipping for subtract) */
  fromB: FacePiece[];
  /** Whether pieces from B should be flipped */
  flipB: boolean;
}

/**
 * DCEL vertex in the planar arrangement
 */
export interface DCELVertex {
  id: number;
  pos: Vec2;
  /** One outgoing half-edge (arbitrary) */
  outgoingHalfEdge: number;
}

/**
 * DCEL half-edge in the planar arrangement
 */
export interface DCELHalfEdge {
  id: number;
  /** Origin vertex */
  origin: number;
  /** Twin half-edge */
  twin: number;
  /** Next half-edge in the face */
  next: number;
  /** Previous half-edge in the face */
  prev: number;
  /** Face this half-edge bounds (left side) */
  face: number;
  /** Source tracking */
  sourceBody: 0 | 1;
  sourceFace: FaceId;
  isIntersection: boolean;
}

/**
 * DCEL face in the planar arrangement
 */
export interface DCELFace {
  id: number;
  /** One half-edge on the outer boundary */
  outerHalfEdge: number;
  /** Half-edges of inner boundaries (holes) */
  innerHalfEdges: number[];
  /** Is this the unbounded outer face? */
  isUnbounded: boolean;
}

/**
 * DCEL structure for planar arrangement
 */
export interface DCEL {
  vertices: DCELVertex[];
  halfEdges: DCELHalfEdge[];
  faces: DCELFace[];
}
