/**
 * Polygon triangulation using ear clipping algorithm
 * 
 * Implements the ear clipping algorithm for triangulating simple polygons.
 * Handles both convex and concave polygons without holes.
 * 
 * For polygons with holes, the outer boundary and holes should be
 * pre-processed using a technique like bridge edges before triangulation.
 */

import type { Vec2 } from '../num/vec2.js';
import { sub2, cross2 } from '../num/vec2.js';

/**
 * Result of triangulation: array of triangle indices
 * Each triplet (i, j, k) represents a triangle with vertices at those indices
 */
export type TriangleIndices = number[];

/**
 * Check if a polygon is counter-clockwise oriented
 * Uses the shoelace formula to compute signed area
 */
export function isCounterClockwise(polygon: Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += (polygon[j][0] - polygon[i][0]) * (polygon[j][1] + polygon[i][1]);
  }
  
  return signedArea < 0;
}

/**
 * Compute signed area of a polygon
 * Positive = CCW, Negative = CW
 */
export function computeSignedArea(polygon: Vec2[]): number {
  const n = polygon.length;
  if (n < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  
  return area / 2;
}

/**
 * Check if point P is inside triangle ABC (or on edge)
 * Uses barycentric coordinates
 */
function isPointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  // Compute vectors
  const v0 = sub2(c, a);
  const v1 = sub2(b, a);
  const v2 = sub2(p, a);
  
  // Compute dot products
  const dot00 = v0[0] * v0[0] + v0[1] * v0[1];
  const dot01 = v0[0] * v1[0] + v0[1] * v1[1];
  const dot02 = v0[0] * v2[0] + v0[1] * v2[1];
  const dot11 = v1[0] * v1[0] + v1[1] * v1[1];
  const dot12 = v1[0] * v2[0] + v1[1] * v2[1];
  
  // Compute barycentric coordinates
  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  
  // Check if point is in triangle
  // Use small epsilon for numerical stability
  const eps = 1e-10;
  return (u >= -eps) && (v >= -eps) && (u + v <= 1 + eps);
}

/**
 * Check if vertex at index i is a convex vertex (ear candidate)
 * Assumes CCW polygon orientation
 */
function isConvexVertex(polygon: Vec2[], i: number): boolean {
  const n = polygon.length;
  const prev = polygon[(i + n - 1) % n];
  const curr = polygon[i];
  const next = polygon[(i + 1) % n];
  
  // Compute cross product of edges
  const edge1 = sub2(curr, prev);
  const edge2 = sub2(next, curr);
  const cross = cross2(edge1, edge2);
  
  // For CCW polygon, convex vertices have positive cross product
  return cross > 0;
}

/**
 * Check if the triangle formed by removing vertex i is an "ear"
 * (no other polygon vertices inside the triangle)
 */
function isEar(polygon: Vec2[], indices: number[], i: number): boolean {
  const n = indices.length;
  const prev = indices[(i + n - 1) % n];
  const curr = indices[i];
  const next = indices[(i + 1) % n];
  
  const a = polygon[prev];
  const b = polygon[curr];
  const c = polygon[next];
  
  // First check if this is a convex vertex
  const edge1 = sub2(b, a);
  const edge2 = sub2(c, b);
  const cross = cross2(edge1, edge2);
  
  // For CCW polygon, convex vertices have positive cross product
  if (cross <= 0) {
    return false;
  }
  
  // Check if any other vertex is inside the triangle
  for (let j = 0; j < n; j++) {
    const idx = indices[j];
    if (idx === prev || idx === curr || idx === next) {
      continue;
    }
    
    if (isPointInTriangle(polygon[idx], a, b, c)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Triangulate a simple polygon using ear clipping
 * 
 * @param polygon Array of 2D vertices (must be CCW oriented)
 * @returns Array of triangle indices (triplets)
 */
export function triangulatePolygon(polygon: Vec2[]): TriangleIndices {
  const n = polygon.length;
  
  if (n < 3) {
    return [];
  }
  
  if (n === 3) {
    // Already a triangle
    return [0, 1, 2];
  }
  
  // Ensure CCW orientation
  let reversed = false;
  if (!isCounterClockwise(polygon)) {
    reversed = true;
  }
  
  // Initialize index list (remaining vertices)
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(reversed ? n - 1 - i : i);
  }
  
  const triangles: TriangleIndices = [];
  
  // Ear clipping
  let count = n;
  let errorCount = 0;
  const maxErrors = n * 2; // Safety limit
  
  while (count > 3 && errorCount < maxErrors) {
    let earFound = false;
    
    for (let i = 0; i < count; i++) {
      if (isEar(polygon, indices, i)) {
        // Found an ear, clip it
        const prev = (i + count - 1) % count;
        const next = (i + 1) % count;
        
        // Add triangle (using original indices)
        triangles.push(indices[prev], indices[i], indices[next]);
        
        // Remove the ear vertex
        indices.splice(i, 1);
        count--;
        earFound = true;
        break;
      }
    }
    
    if (!earFound) {
      // No ear found - this shouldn't happen for valid simple polygons
      // Try to force progress (fallback for numerical issues)
      errorCount++;
      
      // Force-clip first convex vertex
      for (let i = 0; i < count; i++) {
        if (isConvexVertex(polygon, indices[i])) {
          const prev = (i + count - 1) % count;
          const next = (i + 1) % count;
          triangles.push(indices[prev], indices[i], indices[next]);
          indices.splice(i, 1);
          count--;
          break;
        }
      }
    }
  }
  
  // Add the remaining triangle
  if (count === 3) {
    triangles.push(indices[0], indices[1], indices[2]);
  }
  
  return triangles;
}

/**
 * Triangulate a simple polygon from 3D vertices projected to 2D
 * 
 * @param vertices2D Array of 2D vertices (already projected)
 * @returns Array of triangle indices
 */
export function triangulate2D(vertices2D: Vec2[]): TriangleIndices {
  return triangulatePolygon(vertices2D);
}

/**
 * Triangulate a polygon with holes using bridge edges
 * 
 * This connects each hole to the outer boundary with bridge edges,
 * creating a single simple polygon that can be triangulated.
 * 
 * @param outer Outer boundary vertices (CCW)
 * @param holes Array of hole vertices (CW - opposite winding)
 * @returns Array of triangle indices into concatenated vertex array [outer...holes[0]...holes[1]...]
 */
export function triangulatePolygonWithHoles(
  outer: Vec2[],
  holes: Vec2[][]
): TriangleIndices {
  if (holes.length === 0) {
    return triangulatePolygon(outer);
  }
  
  // Create combined polygon by connecting holes to outer via bridge edges
  // This is a simplified implementation using the rightmost vertex of each hole
  
  let combined = [...outer];
  let vertexOffset = outer.length;
  const indexMap: number[] = outer.map((_, i) => i);
  
  for (const hole of holes) {
    if (hole.length < 3) continue;
    
    // Find rightmost point in hole
    let rightmostIdx = 0;
    for (let i = 1; i < hole.length; i++) {
      if (hole[i][0] > hole[rightmostIdx][0]) {
        rightmostIdx = i;
      }
    }
    const holePoint = hole[rightmostIdx];
    
    // Find closest point on outer boundary to the right of hole point
    // For simplicity, find the nearest outer vertex
    let bestOuterIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < combined.length; i++) {
      const dx = combined[i][0] - holePoint[0];
      const dy = combined[i][1] - holePoint[1];
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestOuterIdx = i;
      }
    }
    
    // Create bridge: insert hole into combined polygon
    // Split combined at bestOuterIdx, insert hole starting at rightmostIdx,
    // then bridge back to bestOuterIdx
    
    const newCombined: Vec2[] = [];
    const newIndexMap: number[] = [];
    
    // Part before bridge point (inclusive)
    for (let i = 0; i <= bestOuterIdx; i++) {
      newCombined.push(combined[i]);
      newIndexMap.push(indexMap[i]);
    }
    
    // Insert hole vertices starting from rightmost, going around
    for (let i = 0; i < hole.length; i++) {
      const holeIdx = (rightmostIdx + i) % hole.length;
      newCombined.push(hole[holeIdx]);
      newIndexMap.push(vertexOffset + holeIdx);
    }
    
    // Bridge back: repeat hole's rightmost and outer's bridge point
    newCombined.push(hole[rightmostIdx]);
    newIndexMap.push(vertexOffset + rightmostIdx);
    
    // Part after bridge point
    for (let i = bestOuterIdx; i < combined.length; i++) {
      newCombined.push(combined[i]);
      newIndexMap.push(indexMap[i]);
    }
    
    combined = newCombined;
    indexMap.length = 0;
    indexMap.push(...newIndexMap);
    vertexOffset += hole.length;
  }
  
  // Triangulate combined polygon
  const localIndices = triangulatePolygon(combined);
  
  // Map back to original indices
  const result: TriangleIndices = [];
  for (const localIdx of localIndices) {
    result.push(indexMap[localIdx]);
  }
  
  return result;
}
