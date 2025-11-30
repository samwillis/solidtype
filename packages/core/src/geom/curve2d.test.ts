/**
 * Tests for 2D curve evaluators
 */

import { describe, it, expect } from 'vitest';
import type { Line2D, Arc2D } from './curve2d.js';
import {
  evalCurve2D,
  curveTangent2D,
  curveLength2D,
  closestPointOnCurve2D,
} from './curve2d.js';
import { vec2, length2 } from '../num/vec2.js';
import { createNumericContext } from '../num/tolerance.js';

describe('curve2d', () => {
  const ctx = createNumericContext();

  describe('evalCurve2D', () => {
    it('evaluates line at endpoints', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 5),
      };

      const p0 = evalCurve2D(line, 0);
      const p1 = evalCurve2D(line, 1);

      expect(p0[0]).toBeCloseTo(0, 10);
      expect(p0[1]).toBeCloseTo(0, 10);
      expect(p1[0]).toBeCloseTo(10, 10);
      expect(p1[1]).toBeCloseTo(5, 10);
    });

    it('evaluates line at midpoint', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 0),
      };

      const mid = evalCurve2D(line, 0.5);
      expect(mid[0]).toBeCloseTo(5, 10);
      expect(mid[1]).toBeCloseTo(0, 10);
    });

    it('evaluates arc at start and end', () => {
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };

      const start = evalCurve2D(arc, 0);
      const end = evalCurve2D(arc, 1);

      expect(start[0]).toBeCloseTo(5, 10);
      expect(start[1]).toBeCloseTo(0, 10);
      expect(end[0]).toBeCloseTo(0, 10);
      expect(end[1]).toBeCloseTo(5, 10);
    });

    it('evaluates arc at midpoint', () => {
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };

      const mid = evalCurve2D(arc, 0.5);
      const expectedAngle = Math.PI / 4;
      expect(mid[0]).toBeCloseTo(5 * Math.cos(expectedAngle), 10);
      expect(mid[1]).toBeCloseTo(5 * Math.sin(expectedAngle), 10);
    });
  });

  describe('curveTangent2D', () => {
    it('computes line tangent', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 0),
      };

      const tangent = curveTangent2D(line, 0.5);
      expect(tangent[0]).toBeCloseTo(1, 10);
      expect(tangent[1]).toBeCloseTo(0, 10);
    });

    it('computes arc tangent', () => {
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };

      const tangent = curveTangent2D(arc, 0); // At start (angle 0)
      expect(tangent[0]).toBeCloseTo(0, 10);
      expect(tangent[1]).toBeCloseTo(1, 10); // Upward for CCW
    });
  });

  describe('curveLength2D', () => {
    it('computes line length', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(3, 4),
      };

      const len = curveLength2D(line);
      expect(len).toBeCloseTo(5, 10);
    });

    it('computes arc length', () => {
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI,
        ccw: true,
      };

      const len = curveLength2D(arc);
      expect(len).toBeCloseTo(5 * Math.PI, 10);
    });
  });

  describe('closestPointOnCurve2D', () => {
    it('finds closest point on line', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 0),
      };

      const result = closestPointOnCurve2D(line, vec2(5, 5), ctx);
      expect(result.point[0]).toBeCloseTo(5, 10);
      expect(result.point[1]).toBeCloseTo(0, 10);
      expect(result.t).toBeCloseTo(0.5, 10);
    });

    it('clamps to line endpoints', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 0),
      };

      const result = closestPointOnCurve2D(line, vec2(20, 5), ctx);
      expect(result.point[0]).toBeCloseTo(10, 10);
      expect(result.point[1]).toBeCloseTo(0, 10);
      expect(result.t).toBeCloseTo(1, 10);
    });

    it('finds closest point on arc', () => {
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };

      // Point at angle π/4 should map to itself
      const query = vec2(5 * Math.cos(Math.PI / 4), 5 * Math.sin(Math.PI / 4));
      const result = closestPointOnCurve2D(arc, query, ctx);
      expect(result.t).toBeCloseTo(0.5, 5);
    });
  });

  describe('edge cases', () => {
    it('handles zero-radius arc', () => {
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(1, 2),
        radius: 0,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };

      const p = evalCurve2D(arc, 0);
      expect(p[0]).toBeCloseTo(1, 10);
      expect(p[1]).toBeCloseTo(2, 10);

      const len = curveLength2D(arc);
      expect(len).toBeCloseTo(0, 10);
    });

    it('handles degenerate arc (zero angle span)', () => {
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: 0,
        ccw: true,
      };

      const p0 = evalCurve2D(arc, 0);
      const p1 = evalCurve2D(arc, 1);
      expect(p0[0]).toBeCloseTo(p1[0], 10);
      expect(p0[1]).toBeCloseTo(p1[1], 10);

      const len = curveLength2D(arc);
      expect(len).toBeCloseTo(0, 10);
    });

    it('handles zero-length line', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(5, 5),
        p1: vec2(5, 5),
      };

      const p = evalCurve2D(line, 0.5);
      expect(p[0]).toBeCloseTo(5, 10);
      expect(p[1]).toBeCloseTo(5, 10);

      const len = curveLength2D(line);
      expect(len).toBeCloseTo(0, 10);

      const tangent = curveTangent2D(line, 0.5);
      // Should handle gracefully (returns zero vector or normalized zero)
      expect(length2(tangent)).toBeLessThanOrEqual(1);
    });
  });
});
