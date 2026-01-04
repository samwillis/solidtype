/**
 * Tests for polygon triangulation
 */

import { describe, it, expect } from "vitest";
import type { Vec2 } from "../../src/num/vec2.js";
import { vec2 } from "../../src/num/vec2.js";
import {
  triangulatePolygon,
  isCounterClockwise,
  computeSignedArea,
} from "../../src/mesh/triangulate.js";

describe(`isCounterClockwise`, () => {
  it(`returns true for CCW triangle`, () => {
    const ccwTriangle: Vec2[] = [vec2(0, 0), vec2(1, 0), vec2(0, 1)];
    expect(isCounterClockwise(ccwTriangle)).toBe(true);
  });

  it(`returns false for CW triangle`, () => {
    const cwTriangle: Vec2[] = [vec2(0, 0), vec2(0, 1), vec2(1, 0)];
    expect(isCounterClockwise(cwTriangle)).toBe(false);
  });

  it(`returns true for CCW square`, () => {
    const ccwSquare: Vec2[] = [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)];
    expect(isCounterClockwise(ccwSquare)).toBe(true);
  });

  it(`returns false for degenerate polygon`, () => {
    expect(isCounterClockwise([vec2(0, 0)])).toBe(false);
    expect(isCounterClockwise([vec2(0, 0), vec2(1, 0)])).toBe(false);
  });
});

describe(`computeSignedArea`, () => {
  it(`computes positive area for CCW polygon`, () => {
    const ccwSquare: Vec2[] = [vec2(0, 0), vec2(2, 0), vec2(2, 2), vec2(0, 2)];
    expect(computeSignedArea(ccwSquare)).toBeCloseTo(4, 10);
  });

  it(`computes negative area for CW polygon`, () => {
    const cwSquare: Vec2[] = [vec2(0, 0), vec2(0, 2), vec2(2, 2), vec2(2, 0)];
    expect(computeSignedArea(cwSquare)).toBeCloseTo(-4, 10);
  });

  it(`returns 0 for degenerate polygon`, () => {
    expect(computeSignedArea([])).toBe(0);
    expect(computeSignedArea([vec2(0, 0)])).toBe(0);
  });
});

describe(`triangulatePolygon`, () => {
  it(`returns empty for less than 3 vertices`, () => {
    expect(triangulatePolygon([])).toEqual([]);
    expect(triangulatePolygon([vec2(0, 0)])).toEqual([]);
    expect(triangulatePolygon([vec2(0, 0), vec2(1, 0)])).toEqual([]);
  });

  it(`triangulates a triangle to itself`, () => {
    const triangle: Vec2[] = [vec2(0, 0), vec2(1, 0), vec2(0, 1)];
    const indices = triangulatePolygon(triangle);
    expect(indices).toHaveLength(3);
    // Should contain all 3 indices
    expect(indices.sort()).toEqual([0, 1, 2]);
  });

  it(`triangulates a square into 2 triangles`, () => {
    const square: Vec2[] = [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)];
    const indices = triangulatePolygon(square);
    expect(indices).toHaveLength(6); // 2 triangles × 3 indices
    // All indices should be in range [0, 3]
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }
  });

  it(`triangulates a pentagon into 3 triangles`, () => {
    const pentagon: Vec2[] = [vec2(0, 0), vec2(2, 0), vec2(3, 1), vec2(1, 2), vec2(-1, 1)];
    const indices = triangulatePolygon(pentagon);
    expect(indices).toHaveLength(9); // 3 triangles × 3 indices
  });

  it(`handles CW polygon by reversing`, () => {
    // CW square
    const cwSquare: Vec2[] = [vec2(0, 0), vec2(0, 1), vec2(1, 1), vec2(1, 0)];
    const indices = triangulatePolygon(cwSquare);
    expect(indices).toHaveLength(6); // 2 triangles
  });

  it(`triangulates an L-shaped polygon`, () => {
    // L-shape (concave polygon)
    const lShape: Vec2[] = [vec2(0, 0), vec2(2, 0), vec2(2, 1), vec2(1, 1), vec2(1, 2), vec2(0, 2)];
    const indices = triangulatePolygon(lShape);
    // 6 vertices = 4 triangles
    expect(indices).toHaveLength(12);
  });

  it(`produces valid triangles for unit square`, () => {
    const square: Vec2[] = [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)];
    const indices = triangulatePolygon(square);

    // Check that triangles are valid (no degenerate triangles)
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      // All indices should be different
      expect(a).not.toBe(b);
      expect(b).not.toBe(c);
      expect(c).not.toBe(a);
    }
  });
});
