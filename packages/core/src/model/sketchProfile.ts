/**
 * Sketch profiles for modeling operations
 * 
 * Sketch profiles are 2D shapes on datum planes that can be used
 * as inputs to extrude, revolve, and other operations.
 * 
 * This module provides profile creation without the full constraint solver
 * (which is in the sketch module). Profiles are defined by ordered chains
 * of Curve2D segments that close into loops.
 */

import type { Vec2 } from '../num/vec2.js';
import type { Curve2D, Line2D, Arc2D } from '../geom/curve2d.js';
import type { NumericContext } from '../num/tolerance.js';
import type { DatumPlane } from './planes.js';
import { vec2, dist2 } from '../num/vec2.js';
import { evalCurve2D } from '../geom/curve2d.js';

/**
 * Branded type for profile identifiers
 */
export type ProfileId = number & { __brand: 'ProfileId' };

/**
 * Counter for generating unique profile IDs
 */
let nextProfileId = 0;

/**
 * Create a ProfileId from a number
 * @internal
 */
export function asProfileId(id: number): ProfileId {
  return id as ProfileId;
}

/**
 * Generate a new unique profile ID
 */
function newProfileId(): ProfileId {
  return asProfileId(nextProfileId++);
}

/**
 * A loop of curves that forms a closed boundary
 */
export interface ProfileLoop {
  /** Ordered array of curve segments forming a closed loop */
  curves: Curve2D[];
  /** Whether this is the outer boundary (true) or a hole (false) */
  isOuter: boolean;
}

/**
 * A sketch profile on a datum plane
 * 
 * Contains one or more loops:
 * - First loop is the outer boundary
 * - Additional loops are holes
 */
export interface SketchProfile {
  /** Unique identifier */
  id: ProfileId;
  /** The plane this profile lies on */
  plane: DatumPlane;
  /** Profile loops (first = outer, rest = holes) */
  loops: ProfileLoop[];
}

/**
 * Validation result for a profile
 */
export interface ProfileValidation {
  /** Whether the profile is valid */
  valid: boolean;
  /** Error messages if not valid */
  errors: string[];
}

/**
 * Create an empty sketch profile on a datum plane
 * 
 * @param plane The datum plane for the profile
 * @returns A new empty profile
 */
export function createEmptyProfile(plane: DatumPlane): SketchProfile {
  return {
    id: newProfileId(),
    plane,
    loops: [],
  };
}

/**
 * Add a loop to a profile
 * 
 * @param profile The profile to add to
 * @param curves Array of curves forming the loop
 * @param isOuter Whether this is an outer boundary (default: first loop is outer)
 */
export function addLoopToProfile(
  profile: SketchProfile,
  curves: Curve2D[],
  isOuter?: boolean
): void {
  const outer = isOuter ?? (profile.loops.length === 0);
  profile.loops.push({ curves, isOuter: outer });
}

/**
 * Validate that a profile's loops are closed
 * 
 * @param profile The profile to validate
 * @param ctx Numeric context for tolerance
 * @returns Validation result with any errors
 */
export function validateProfile(
  profile: SketchProfile,
  ctx: NumericContext
): ProfileValidation {
  const errors: string[] = [];
  
  if (profile.loops.length === 0) {
    errors.push('Profile has no loops');
    return { valid: false, errors };
  }
  
  // Check each loop is closed
  for (let loopIdx = 0; loopIdx < profile.loops.length; loopIdx++) {
    const loop = profile.loops[loopIdx];
    
    if (loop.curves.length === 0) {
      errors.push(`Loop ${loopIdx} has no curves`);
      continue;
    }
    
    // Check that consecutive curves are connected
    for (let i = 0; i < loop.curves.length; i++) {
      const current = loop.curves[i];
      const next = loop.curves[(i + 1) % loop.curves.length];
      
      const currentEnd = evalCurve2D(current, 1);
      const nextStart = evalCurve2D(next, 0);
      
      const gap = dist2(currentEnd, nextStart);
      if (gap > ctx.tol.length) {
        errors.push(
          `Loop ${loopIdx}: gap of ${gap.toFixed(6)} between curve ${i} and ${(i + 1) % loop.curves.length}`
        );
      }
    }
  }
  
  // Check that first loop is outer
  if (profile.loops.length > 0 && !profile.loops[0].isOuter) {
    errors.push('First loop should be outer boundary');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get all vertices of a profile loop
 * 
 * @param loop The profile loop
 * @returns Array of 2D vertex positions
 */
export function getLoopVertices(loop: ProfileLoop): Vec2[] {
  const vertices: Vec2[] = [];
  
  for (const curve of loop.curves) {
    // Add start point of each curve
    vertices.push(evalCurve2D(curve, 0));
  }
  
  return vertices;
}

// ============================================================================
// Profile creation helpers
// ============================================================================

/**
 * Create a rectangular profile
 * 
 * @param plane The datum plane for the profile
 * @param width Width in X direction
 * @param height Height in Y direction
 * @param centerX X coordinate of center (default: 0)
 * @param centerY Y coordinate of center (default: 0)
 * @returns A rectangular profile
 */
export function createRectangleProfile(
  plane: DatumPlane,
  width: number,
  height: number,
  centerX: number = 0,
  centerY: number = 0
): SketchProfile {
  const hw = width / 2;
  const hh = height / 2;
  
  const p0 = vec2(centerX - hw, centerY - hh);
  const p1 = vec2(centerX + hw, centerY - hh);
  const p2 = vec2(centerX + hw, centerY + hh);
  const p3 = vec2(centerX - hw, centerY + hh);
  
  const curves: Line2D[] = [
    { kind: 'line', p0: p0, p1: p1 }, // bottom
    { kind: 'line', p0: p1, p1: p2 }, // right
    { kind: 'line', p0: p2, p1: p3 }, // top
    { kind: 'line', p0: p3, p1: p0 }, // left
  ];
  
  const profile = createEmptyProfile(plane);
  addLoopToProfile(profile, curves, true);
  return profile;
}

/**
 * Create a circular profile
 * 
 * @param plane The datum plane for the profile
 * @param radius Circle radius
 * @param centerX X coordinate of center (default: 0)
 * @param centerY Y coordinate of center (default: 0)
 * @returns A circular profile
 */
export function createCircleProfile(
  plane: DatumPlane,
  radius: number,
  centerX: number = 0,
  centerY: number = 0
): SketchProfile {
  const center = vec2(centerX, centerY);
  
  // Create a full circle as a single arc
  const arc: Arc2D = {
    kind: 'arc',
    center,
    radius,
    startAngle: 0,
    endAngle: 2 * Math.PI,
    ccw: true,
  };
  
  const profile = createEmptyProfile(plane);
  addLoopToProfile(profile, [arc], true);
  return profile;
}

/**
 * Create a polygon profile from vertices
 * 
 * @param plane The datum plane for the profile
 * @param vertices Array of vertices (at least 3, will be closed automatically)
 * @returns A polygon profile
 */
export function createPolygonProfile(
  plane: DatumPlane,
  vertices: Vec2[]
): SketchProfile {
  if (vertices.length < 3) {
    throw new Error('Polygon must have at least 3 vertices');
  }
  
  const curves: Line2D[] = [];
  
  for (let i = 0; i < vertices.length; i++) {
    const p0 = vertices[i];
    const p1 = vertices[(i + 1) % vertices.length];
    curves.push({ kind: 'line', p0, p1 });
  }
  
  const profile = createEmptyProfile(plane);
  addLoopToProfile(profile, curves, true);
  return profile;
}

/**
 * Create an L-shaped profile
 * 
 * @param plane The datum plane for the profile
 * @param totalWidth Total width of the L
 * @param totalHeight Total height of the L
 * @param legWidth Width of the vertical leg
 * @param legHeight Height of the horizontal leg
 * @returns An L-shaped profile
 */
export function createLProfile(
  plane: DatumPlane,
  totalWidth: number,
  totalHeight: number,
  legWidth: number,
  legHeight: number
): SketchProfile {
  const vertices: Vec2[] = [
    vec2(0, 0),
    vec2(totalWidth, 0),
    vec2(totalWidth, legHeight),
    vec2(legWidth, legHeight),
    vec2(legWidth, totalHeight),
    vec2(0, totalHeight),
  ];
  
  return createPolygonProfile(plane, vertices);
}

/**
 * Create a profile with a rectangular hole
 * 
 * @param plane The datum plane for the profile
 * @param outerWidth Outer rectangle width
 * @param outerHeight Outer rectangle height
 * @param innerWidth Inner hole width
 * @param innerHeight Inner hole height
 * @returns A rectangular profile with a rectangular hole
 */
export function createRectangleWithHoleProfile(
  plane: DatumPlane,
  outerWidth: number,
  outerHeight: number,
  innerWidth: number,
  innerHeight: number
): SketchProfile {
  // Outer rectangle
  const ohw = outerWidth / 2;
  const ohh = outerHeight / 2;
  const outerVertices: Vec2[] = [
    vec2(-ohw, -ohh),
    vec2(ohw, -ohh),
    vec2(ohw, ohh),
    vec2(-ohw, ohh),
  ];
  const outerCurves: Line2D[] = [];
  for (let i = 0; i < outerVertices.length; i++) {
    outerCurves.push({
      kind: 'line',
      p0: outerVertices[i],
      p1: outerVertices[(i + 1) % outerVertices.length],
    });
  }
  
  // Inner rectangle (hole) - wound in opposite direction
  const ihw = innerWidth / 2;
  const ihh = innerHeight / 2;
  const innerVertices: Vec2[] = [
    vec2(-ihw, -ihh),
    vec2(-ihw, ihh),   // wound opposite to outer
    vec2(ihw, ihh),
    vec2(ihw, -ihh),
  ];
  const innerCurves: Line2D[] = [];
  for (let i = 0; i < innerVertices.length; i++) {
    innerCurves.push({
      kind: 'line',
      p0: innerVertices[i],
      p1: innerVertices[(i + 1) % innerVertices.length],
    });
  }
  
  const profile = createEmptyProfile(plane);
  addLoopToProfile(profile, outerCurves, true);
  addLoopToProfile(profile, innerCurves, false);
  return profile;
}

/**
 * Compute the approximate area of a profile (outer boundary only)
 * 
 * Uses shoelace formula for polygonal approximation.
 * 
 * @param profile The profile
 * @returns Approximate area (positive for CCW, negative for CW)
 */
export function computeProfileArea(profile: SketchProfile): number {
  if (profile.loops.length === 0) return 0;
  
  let totalArea = 0;
  
  for (const loop of profile.loops) {
    const vertices = getLoopVertices(loop);
    if (vertices.length < 3) continue;
    
    // Shoelace formula
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i][0] * vertices[j][1];
      area -= vertices[j][0] * vertices[i][1];
    }
    area /= 2;
    
    if (loop.isOuter) {
      totalArea += Math.abs(area);
    } else {
      totalArea -= Math.abs(area);
    }
  }
  
  return totalArea;
}
