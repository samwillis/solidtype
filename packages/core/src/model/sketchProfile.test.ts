/**
 * Tests for sketch profiles
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyProfile,
  addLoopToProfile,
  validateProfile,
  getLoopVertices,
  createRectangleProfile,
  createCircleProfile,
  createPolygonProfile,
  createLProfile,
  createRectangleWithHoleProfile,
  computeProfileArea,
} from './sketchProfile.js';
import { XY_PLANE, YZ_PLANE } from './planes.js';
import { createNumericContext } from '../num/tolerance.js';
import { vec2 } from '../num/vec2.js';
import type { Line2D, Arc2D } from '../geom/curve2d.js';

const ctx = createNumericContext();

describe('createEmptyProfile', () => {
  it('creates an empty profile on a plane', () => {
    const profile = createEmptyProfile(XY_PLANE);
    
    expect(profile.plane).toBe(XY_PLANE);
    expect(profile.loops).toHaveLength(0);
    expect(profile.id).toBeDefined();
  });

  it('creates profiles with unique IDs', () => {
    const p1 = createEmptyProfile(XY_PLANE);
    const p2 = createEmptyProfile(XY_PLANE);
    
    expect(p1.id).not.toBe(p2.id);
  });
});

describe('addLoopToProfile', () => {
  it('adds a loop with curves', () => {
    const profile = createEmptyProfile(XY_PLANE);
    const curves: Line2D[] = [
      { kind: 'line', p0: vec2(0, 0), p1: vec2(1, 0) },
      { kind: 'line', p0: vec2(1, 0), p1: vec2(1, 1) },
      { kind: 'line', p0: vec2(1, 1), p1: vec2(0, 0) },
    ];
    
    addLoopToProfile(profile, curves);
    
    expect(profile.loops).toHaveLength(1);
    expect(profile.loops[0].curves).toHaveLength(3);
    expect(profile.loops[0].isOuter).toBe(true);
  });

  it('marks first loop as outer by default', () => {
    const profile = createEmptyProfile(XY_PLANE);
    addLoopToProfile(profile, []);
    
    expect(profile.loops[0].isOuter).toBe(true);
  });

  it('marks subsequent loops as inner by default', () => {
    const profile = createEmptyProfile(XY_PLANE);
    addLoopToProfile(profile, []); // outer
    addLoopToProfile(profile, []); // inner
    
    expect(profile.loops[0].isOuter).toBe(true);
    expect(profile.loops[1].isOuter).toBe(false);
  });

  it('respects explicit isOuter parameter', () => {
    const profile = createEmptyProfile(XY_PLANE);
    addLoopToProfile(profile, [], false);
    
    expect(profile.loops[0].isOuter).toBe(false);
  });
});

describe('validateProfile', () => {
  it('validates a closed loop', () => {
    const profile = createRectangleProfile(XY_PLANE, 2, 2);
    const result = validateProfile(profile, ctx);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error for empty profile', () => {
    const profile = createEmptyProfile(XY_PLANE);
    const result = validateProfile(profile, ctx);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Profile has no loops');
  });

  it('reports error for gap in loop', () => {
    const profile = createEmptyProfile(XY_PLANE);
    const curves: Line2D[] = [
      { kind: 'line', p0: vec2(0, 0), p1: vec2(1, 0) },
      { kind: 'line', p0: vec2(2, 0), p1: vec2(2, 1) }, // gap!
      { kind: 'line', p0: vec2(2, 1), p1: vec2(0, 0) },
    ];
    addLoopToProfile(profile, curves);
    
    const result = validateProfile(profile, ctx);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('gap');
  });
});

describe('createRectangleProfile', () => {
  it('creates a rectangle with correct dimensions', () => {
    const profile = createRectangleProfile(XY_PLANE, 4, 3);
    
    expect(profile.loops).toHaveLength(1);
    expect(profile.loops[0].curves).toHaveLength(4);
    expect(profile.loops[0].isOuter).toBe(true);
  });

  it('creates rectangle centered at specified position', () => {
    const profile = createRectangleProfile(XY_PLANE, 4, 2, 10, 20);
    const vertices = getLoopVertices(profile.loops[0]);
    
    // Check that center is at (10, 20)
    const sumX = vertices.reduce((s, v) => s + v[0], 0) / vertices.length;
    const sumY = vertices.reduce((s, v) => s + v[1], 0) / vertices.length;
    
    expect(sumX).toBeCloseTo(10);
    expect(sumY).toBeCloseTo(20);
  });

  it('creates valid rectangle that passes validation', () => {
    const profile = createRectangleProfile(XY_PLANE, 5, 3);
    const result = validateProfile(profile, ctx);
    
    expect(result.valid).toBe(true);
  });

  it('creates rectangle with correct area', () => {
    const profile = createRectangleProfile(XY_PLANE, 4, 3);
    const area = computeProfileArea(profile);
    
    expect(area).toBeCloseTo(12);
  });
});

describe('createCircleProfile', () => {
  it('creates a circle with correct radius', () => {
    const profile = createCircleProfile(XY_PLANE, 5);
    
    expect(profile.loops).toHaveLength(1);
    expect(profile.loops[0].curves).toHaveLength(1);
    
    const arc = profile.loops[0].curves[0] as Arc2D;
    expect(arc.kind).toBe('arc');
    expect(arc.radius).toBe(5);
  });

  it('creates circle centered at specified position', () => {
    const profile = createCircleProfile(XY_PLANE, 3, 5, 7);
    const arc = profile.loops[0].curves[0] as Arc2D;
    
    expect(arc.center[0]).toBe(5);
    expect(arc.center[1]).toBe(7);
  });
});

describe('createPolygonProfile', () => {
  it('creates a triangle', () => {
    const vertices = [vec2(0, 0), vec2(3, 0), vec2(1.5, 2)];
    const profile = createPolygonProfile(XY_PLANE, vertices);
    
    expect(profile.loops).toHaveLength(1);
    expect(profile.loops[0].curves).toHaveLength(3);
  });

  it('creates valid polygon that passes validation', () => {
    const vertices = [vec2(0, 0), vec2(4, 0), vec2(4, 3), vec2(0, 3)];
    const profile = createPolygonProfile(XY_PLANE, vertices);
    const result = validateProfile(profile, ctx);
    
    expect(result.valid).toBe(true);
  });

  it('throws error for less than 3 vertices', () => {
    expect(() => createPolygonProfile(XY_PLANE, [vec2(0, 0), vec2(1, 0)])).toThrow();
  });
});

describe('createLProfile', () => {
  it('creates an L-shaped profile', () => {
    const profile = createLProfile(XY_PLANE, 10, 8, 3, 2);
    
    expect(profile.loops).toHaveLength(1);
    expect(profile.loops[0].curves).toHaveLength(6); // L has 6 sides
  });

  it('creates valid L profile', () => {
    const profile = createLProfile(XY_PLANE, 10, 8, 3, 2);
    const result = validateProfile(profile, ctx);
    
    expect(result.valid).toBe(true);
  });
});

describe('createRectangleWithHoleProfile', () => {
  it('creates outer and inner loops', () => {
    const profile = createRectangleWithHoleProfile(XY_PLANE, 10, 10, 4, 4);
    
    expect(profile.loops).toHaveLength(2);
    expect(profile.loops[0].isOuter).toBe(true);
    expect(profile.loops[1].isOuter).toBe(false);
  });

  it('creates valid profile with hole', () => {
    const profile = createRectangleWithHoleProfile(XY_PLANE, 10, 10, 4, 4);
    const result = validateProfile(profile, ctx);
    
    expect(result.valid).toBe(true);
  });

  it('computes correct area (outer - inner)', () => {
    const profile = createRectangleWithHoleProfile(XY_PLANE, 10, 10, 4, 4);
    const area = computeProfileArea(profile);
    
    // 100 - 16 = 84
    expect(area).toBeCloseTo(84);
  });
});

describe('getLoopVertices', () => {
  it('returns vertices from a rectangle loop', () => {
    const profile = createRectangleProfile(XY_PLANE, 4, 2);
    const vertices = getLoopVertices(profile.loops[0]);
    
    expect(vertices).toHaveLength(4);
  });

  it('returns vertices in correct positions', () => {
    const profile = createRectangleProfile(XY_PLANE, 4, 2, 0, 0);
    const vertices = getLoopVertices(profile.loops[0]);
    
    // Should have corners at (-2, -1), (2, -1), (2, 1), (-2, 1)
    const expectedX = [-2, 2, 2, -2];
    const expectedY = [-1, -1, 1, 1];
    
    for (let i = 0; i < 4; i++) {
      expect(vertices[i][0]).toBeCloseTo(expectedX[i]);
      expect(vertices[i][1]).toBeCloseTo(expectedY[i]);
    }
  });
});

describe('computeProfileArea', () => {
  it('computes area of square', () => {
    const profile = createRectangleProfile(XY_PLANE, 5, 5);
    expect(computeProfileArea(profile)).toBeCloseTo(25);
  });

  it('computes area of rectangle', () => {
    const profile = createRectangleProfile(XY_PLANE, 8, 3);
    expect(computeProfileArea(profile)).toBeCloseTo(24);
  });

  it('returns 0 for empty profile', () => {
    const profile = createEmptyProfile(XY_PLANE);
    expect(computeProfileArea(profile)).toBe(0);
  });
});
