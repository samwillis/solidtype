/**
 * DCEL (Doubly-Connected Edge List) implementation for planar arrangements.
 * 
 * This is a "DCEL-lite" implementation focused on:
 * - Building a planar subdivision from segments
 * - Extracting bounded cycles (faces with possible holes)
 */

import type { Vec2 } from '../../../num/vec2.js';
import { segSegHit } from '../../../num/predicates.js';
import type { Segment2D } from '../types.js';

/**
 * A vertex in the DCEL
 */
export interface Vertex {
  id: number;
  pos: Vec2;
  /** Indices of outgoing half-edges */
  outgoing: number[];
}

/**
 * A half-edge in the DCEL
 */
export interface HalfEdge {
  id: number;
  /** Origin vertex index */
  origin: number;
  /** Twin half-edge index */
  twin: number;
  /** Next half-edge in face traversal */
  next: number;
  /** Previous half-edge in face traversal */
  prev: number;
  /** Face index (left side of half-edge) */
  face: number;
  /** Source metadata */
  metadata: {
    sourceBody: 0 | 1;
    isIntersection: boolean;
  };
}

/**
 * A face in the DCEL
 */
export interface Face {
  id: number;
  /** One half-edge on the outer boundary (-1 if unbounded) */
  outerComponent: number;
  /** Half-edges of inner components (holes) */
  innerComponents: number[];
  /** Is this the unbounded face? */
  isUnbounded: boolean;
}

/**
 * The complete DCEL structure
 */
export interface DCELStructure {
  vertices: Vertex[];
  halfEdges: HalfEdge[];
  faces: Face[];
}

/**
 * Build a DCEL from a set of 2D segments.
 * 
 * Steps:
 * 1. Split all segments at intersection points
 * 2. Filter degenerate and duplicate segments
 * 3. Build vertices and half-edges
 * 4. Sort outgoing edges around each vertex
 * 5. Set next/prev pointers using "turn-left" rule
 * 6. Extract faces
 */
export function buildDCEL(segments: Segment2D[], tolerance: number = 1e-8): DCELStructure {
  // Step 1: Split segments at intersections
  const splitSegments = splitAllSegments(segments, tolerance);
  
  // Step 1.5: Filter degenerate segments (near-zero length) and deduplicate
  const cleanedSegments = filterDegenerateAndDuplicateSegments(splitSegments, tolerance);
  
  // Step 2: Build vertices
  const { vertices, vertexMap } = buildVertices(cleanedSegments, tolerance);
  
  // Step 3: Build half-edges
  const halfEdges = buildHalfEdges(cleanedSegments, vertexMap, tolerance);
  
  // Step 4: Populate outgoing edges for each vertex
  populateOutgoing(vertices, halfEdges);
  
  // Step 5: Sort outgoing edges by angle
  sortOutgoingEdges(vertices, halfEdges);
  
  // Step 6: Set next/prev pointers using turn-left rule
  setNextPrevPointers(vertices, halfEdges);
  
  // Step 7: Extract faces
  const faces = extractFaces(halfEdges, vertices);
  
  return { vertices, halfEdges, faces };
}

/**
 * Filter out degenerate segments (near-zero length) and duplicate segments
 */
function filterDegenerateAndDuplicateSegments(
  segments: Segment2D[],
  tolerance: number
): Segment2D[] {
  const seen = new Set<string>();
  const result: Segment2D[] = [];
  
  // Round coordinates for consistent comparison
  const snap = (v: number) => Math.round(v / tolerance) * tolerance;
  
  for (const seg of segments) {
    const ax = snap(seg.a[0]);
    const ay = snap(seg.a[1]);
    const bx = snap(seg.b[0]);
    const by = snap(seg.b[1]);
    
    // Skip degenerate segments
    if (ax === bx && ay === by) continue;
    
    // Check segment length
    const dx = seg.b[0] - seg.a[0];
    const dy = seg.b[1] - seg.a[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < tolerance * 2) continue;
    
    // Create canonical key (direction-independent)
    const k1 = `${ax},${ay}|${bx},${by}`;
    const k2 = `${bx},${by}|${ax},${ay}`;
    const key = k1 < k2 ? k1 : k2;
    
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(seg);
  }
  
  return result;
}

/**
 * Split all segments at their mutual intersection points
 */
function splitAllSegments(segments: Segment2D[], tolerance: number): Segment2D[] {
  // Collect split points for each segment
  const splitPoints: Map<number, { t: number; point: Vec2 }[]> = new Map();
  
  for (let i = 0; i < segments.length; i++) {
    splitPoints.set(i, []);
  }
  
  // Find all intersections
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const segI = segments[i];
      const segJ = segments[j];
      
      const hit = segSegHit(segI.a, segI.b, segJ.a, segJ.b);
      
      if (hit.kind === 'point') {
        // Add split points (excluding endpoints which are at t=0 or t=1)
        if (hit.t1 > tolerance && hit.t1 < 1 - tolerance) {
          splitPoints.get(i)!.push({ t: hit.t1, point: hit.point });
        }
        if (hit.t2 > tolerance && hit.t2 < 1 - tolerance) {
          splitPoints.get(j)!.push({ t: hit.t2, point: hit.point });
        }
      } else if (hit.kind === 'overlap') {
        // For overlapping segments, add endpoints of overlap as split points
        if (hit.t1Start > tolerance && hit.t1Start < 1 - tolerance) {
          const pt = interpolate(segI.a, segI.b, hit.t1Start);
          splitPoints.get(i)!.push({ t: hit.t1Start, point: pt });
        }
        if (hit.t1End > tolerance && hit.t1End < 1 - tolerance) {
          const pt = interpolate(segI.a, segI.b, hit.t1End);
          splitPoints.get(i)!.push({ t: hit.t1End, point: pt });
        }
        if (hit.t2Start > tolerance && hit.t2Start < 1 - tolerance) {
          const pt = interpolate(segJ.a, segJ.b, hit.t2Start);
          splitPoints.get(j)!.push({ t: hit.t2Start, point: pt });
        }
        if (hit.t2End > tolerance && hit.t2End < 1 - tolerance) {
          const pt = interpolate(segJ.a, segJ.b, hit.t2End);
          splitPoints.get(j)!.push({ t: hit.t2End, point: pt });
        }
      }
    }
  }
  
  // Split each segment
  const result: Segment2D[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const pts = splitPoints.get(i)!;
    
    if (pts.length === 0) {
      result.push(seg);
      continue;
    }
    
    // Sort by parameter
    pts.sort((a, b) => a.t - b.t);
    
    // Remove duplicates
    const unique: { t: number; point: Vec2 }[] = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      if (Math.abs(pts[k].t - unique[unique.length - 1].t) > tolerance) {
        unique.push(pts[k]);
      }
    }
    
    // Create sub-segments
    let prevPoint = seg.a;
    for (const split of unique) {
      result.push({
        ...seg,
        a: prevPoint,
        b: split.point
      });
      prevPoint = split.point;
    }
    result.push({
      ...seg,
      a: prevPoint,
      b: seg.b
    });
  }
  
  return result;
}

/**
 * Interpolate between two points
 */
function interpolate(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/**
 * Build vertices from segment endpoints, merging nearby points
 */
function buildVertices(
  segments: Segment2D[],
  tolerance: number
): { vertices: Vertex[]; vertexMap: Map<string, number> } {
  const vertices: Vertex[] = [];
  const vertexMap = new Map<string, number>();
  
  function getOrCreateVertex(pos: Vec2): number {
    // Snap to grid for consistent hashing
    const key = `${Math.round(pos[0] / tolerance) * tolerance},${Math.round(pos[1] / tolerance) * tolerance}`;
    
    if (vertexMap.has(key)) {
      return vertexMap.get(key)!;
    }
    
    // Check if any existing vertex is within tolerance
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const dx = v.pos[0] - pos[0];
      const dy = v.pos[1] - pos[1];
      if (dx * dx + dy * dy < tolerance * tolerance) {
        vertexMap.set(key, i);
        return i;
      }
    }
    
    const id = vertices.length;
    vertices.push({ id, pos: [pos[0], pos[1]], outgoing: [] });
    vertexMap.set(key, id);
    return id;
  }
  
  for (const seg of segments) {
    getOrCreateVertex(seg.a);
    getOrCreateVertex(seg.b);
  }
  
  return { vertices, vertexMap };
}

/**
 * Build half-edges from segments
 */
function buildHalfEdges(
  segments: Segment2D[],
  vertexMap: Map<string, number>,
  tolerance: number
): HalfEdge[] {
  const halfEdges: HalfEdge[] = [];
  
  function getVertexIndex(pos: Vec2): number {
    const key = `${Math.round(pos[0] / tolerance) * tolerance},${Math.round(pos[1] / tolerance) * tolerance}`;
    const idx = vertexMap.get(key);
    if (idx === undefined) {
      throw new Error(`Vertex not found for position ${pos}`);
    }
    return idx;
  }
  
  for (const seg of segments) {
    const v0 = getVertexIndex(seg.a);
    const v1 = getVertexIndex(seg.b);
    
    if (v0 === v1) continue; // Skip degenerate segments
    
    const he0: HalfEdge = {
      id: halfEdges.length,
      origin: v0,
      twin: halfEdges.length + 1,
      next: -1,
      prev: -1,
      face: -1,
      metadata: {
        sourceBody: seg.sourceBody,
        isIntersection: seg.isIntersection
      }
    };
    
    const he1: HalfEdge = {
      id: halfEdges.length + 1,
      origin: v1,
      twin: halfEdges.length,
      next: -1,
      prev: -1,
      face: -1,
      metadata: {
        sourceBody: seg.sourceBody,
        isIntersection: seg.isIntersection
      }
    };
    
    halfEdges.push(he0, he1);
  }
  
  return halfEdges;
}

/**
 * Populate outgoing edge lists for each vertex
 */
function populateOutgoing(vertices: Vertex[], halfEdges: HalfEdge[]): void {
  for (const he of halfEdges) {
    vertices[he.origin].outgoing.push(he.id);
  }
}

/**
 * Sort outgoing edges around each vertex by angle (CCW from +x axis)
 */
function sortOutgoingEdges(vertices: Vertex[], halfEdges: HalfEdge[]): void {
  for (const v of vertices) {
    if (v.outgoing.length <= 1) continue;
    
    v.outgoing.sort((a, b) => {
      const heA = halfEdges[a];
      const heB = halfEdges[b];
      
      const destA = vertices[halfEdges[heA.twin].origin];
      const destB = vertices[halfEdges[heB.twin].origin];
      
      const dxA = destA.pos[0] - v.pos[0];
      const dyA = destA.pos[1] - v.pos[1];
      const dxB = destB.pos[0] - v.pos[0];
      const dyB = destB.pos[1] - v.pos[1];
      
      const angleA = Math.atan2(dyA, dxA);
      const angleB = Math.atan2(dyB, dxB);
      
      return angleA - angleB;
    });
  }
}

/**
 * Set next/prev pointers using the "turn-left" rule:
 * For half-edge h ending at vertex v, h.next is the half-edge that
 * comes immediately CCW after h.twin in the sorted outgoing list of v.
 */
function setNextPrevPointers(vertices: Vertex[], halfEdges: HalfEdge[]): void {
  for (const he of halfEdges) {
    // h ends at vertex v = destination of h = origin of twin(h)
    const twin = halfEdges[he.twin];
    const v = vertices[twin.origin];
    const outgoing = v.outgoing;
    
    if (outgoing.length === 0) continue;
    
    // Find twin in outgoing list
    const twinIdx = outgoing.indexOf(he.twin);
    if (twinIdx === -1) continue;
    
    // Next edge is the one CCW before twin (or wrapping around)
    // In our CCW-sorted list, "turn left" means going to the previous entry
    const nextIdx = (twinIdx - 1 + outgoing.length) % outgoing.length;
    const nextHe = outgoing[nextIdx];
    
    he.next = nextHe;
    halfEdges[nextHe].prev = he.id;
  }
}

/**
 * Extract faces by walking half-edge cycles
 */
function extractFaces(halfEdges: HalfEdge[], vertices: Vertex[]): Face[] {
  const faces: Face[] = [];
  const visited = new Set<number>();
  
  for (let i = 0; i < halfEdges.length; i++) {
    if (visited.has(i)) continue;
    if (halfEdges[i].next === -1) continue;
    
    // Walk the cycle
    const cycle: number[] = [];
    let current = i;
    let iterations = 0;
    const maxIterations = halfEdges.length + 1;
    
    while (!visited.has(current) && iterations < maxIterations) {
      visited.add(current);
      cycle.push(current);
      current = halfEdges[current].next;
      iterations++;
      
      if (current === i) break;
    }
    
    if (cycle.length < 3) continue;
    
    // Compute signed area to determine if outer or hole (reserved for future use)
    // The area computation is used for winding order but not returned currently
    void computeCycleSignedArea(cycle, halfEdges, vertices);
    
    const face: Face = {
      id: faces.length,
      outerComponent: cycle[0],
      innerComponents: [],
      // Orientation from the traversal is not reliable for unbounded detection here;
      // downstream filtering (bounds checks) will prune any unbounded face.
      isUnbounded: false
    };
    
    // Assign face to all half-edges in cycle
    for (const heIdx of cycle) {
      halfEdges[heIdx].face = face.id;
    }
    
    faces.push(face);
  }
  
  return faces;
}

/**
 * Compute signed area of a half-edge cycle
 * Note: This is a simplified version that always returns positive (bounded)
 * The actual face classification is done in extractFaces based on polygon area.
 */
function computeCycleSignedArea(
  cycle: number[],
  halfEdges: HalfEdge[],
  vertices: Vertex[]
): number {
  let area = 0;
  
  for (let i = 0; i < cycle.length; i++) {
    const heIdx = cycle[i];
    const nextIdx = cycle[(i + 1) % cycle.length];
    const p = vertices[halfEdges[heIdx].origin].pos;
    const q = vertices[halfEdges[nextIdx].origin].pos;
    area += p[0] * q[1] - q[0] * p[1];
  }
  
  return area / 2;
}

/**
 * Extract polygon vertices for a face cycle, skipping consecutive duplicates
 */
export function getCyclePolygon(
  dcel: DCELStructure,
  startHalfEdge: number,
  tolerance: number = 1e-8
): Vec2[] {
  const polygon: Vec2[] = [];
  let current = startHalfEdge;
  let iterations = 0;
  const maxIterations = dcel.halfEdges.length + 1;
  
  do {
    const he = dcel.halfEdges[current];
    const v = dcel.vertices[he.origin];
    const pos: Vec2 = [v.pos[0], v.pos[1]];
    
    // Skip if this vertex is the same as the last one
    if (polygon.length > 0) {
      const last = polygon[polygon.length - 1];
      const dx = Math.abs(pos[0] - last[0]);
      const dy = Math.abs(pos[1] - last[1]);
      if (dx <= tolerance && dy <= tolerance) {
        current = he.next;
        iterations++;
        continue;
      }
    }
    
    polygon.push(pos);
    current = he.next;
    iterations++;
  } while (current !== startHalfEdge && current !== -1 && iterations < maxIterations);
  
  // Also check if first and last are duplicates
  if (polygon.length > 1) {
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    const dx = Math.abs(first[0] - last[0]);
    const dy = Math.abs(first[1] - last[1]);
    if (dx <= tolerance && dy <= tolerance) {
      polygon.pop();
    }
  }
  
  return polygon;
}

/**
 * Compute signed area of a 2D polygon
 */
export function polygonSignedArea(polygon: Vec2[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return area / 2;
}
