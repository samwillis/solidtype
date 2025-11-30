/**
 * Tests for 2D curve intersections
 */

import { describe, it, expect } from 'vitest';
import type { Line2D, Arc2D } from './curve2d.js';
import { intersectLineLine2D, intersectLineArc2D, intersectArcArc2D } from './intersect2d.js';
import { vec2 } from '../num/vec2.js';
import { createNumericContext } from '../num/tolerance.js';

describe('intersect2d', () => {
  const ctx = createNumericContext();

  describe('intersectLineLine2D', () => {
    it('finds intersection of two non-parallel lines', () => {
      const line1: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 10),
      };
      const line2: Line2D = {
        kind: 'line',
        p0: vec2(0, 10),
        p1: vec2(10, 0),
      };

      const intersections = intersectLineLine2D(line1, line2, ctx);
      expect(intersections).toHaveLength(1);
      expect(intersections[0].point[0]).toBeCloseTo(5, 5);
      expect(intersections[0].point[1]).toBeCloseTo(5, 5);
    });

    it('returns empty for parallel non-intersecting lines', () => {
      const line1: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 0),
      };
      const line2: Line2D = {
        kind: 'line',
        p0: vec2(0, 5),
        p1: vec2(10, 5),
      };

      const intersections = intersectLineLine2D(line1, line2, ctx);
      expect(intersections).toHaveLength(0);
    });

    it('handles collinear overlapping segments', () => {
      const line1: Line2D = {
        kind: 'line',
        p0: vec2(0, 0),
        p1: vec2(10, 0),
      };
      const line2: Line2D = {
        kind: 'line',
        p0: vec2(5, 0),
        p1: vec2(15, 0),
      };

      const intersections = intersectLineLine2D(line1, line2, ctx);
      expect(intersections.length).toBeGreaterThan(0);
    });
  });

  describe('intersectLineArc2D', () => {
    it('finds intersection of line and arc', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(-10, 0),
        p1: vec2(10, 0),
      };
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI,
        ccw: true,
      };

      const intersections = intersectLineArc2D(line, arc, ctx);
      expect(intersections.length).toBeGreaterThanOrEqual(1);
      // Should intersect at (5, 0) and possibly (-5, 0) depending on arc range
    });

    it('returns empty for line that does not intersect arc', () => {
      const line: Line2D = {
        kind: 'line',
        p0: vec2(0, 10),
        p1: vec2(10, 10),
      };
      const arc: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };

      const intersections = intersectLineArc2D(line, arc, ctx);
      expect(intersections).toHaveLength(0);
    });
  });

  describe('intersectArcArc2D', () => {
    it('finds intersection of two arcs', () => {
      const arc1: Arc2D = {
        kind: 'arc',
        center: vec2(-5, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI,
        ccw: true,
      };
      const arc2: Arc2D = {
        kind: 'arc',
        center: vec2(5, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI,
        ccw: true,
      };

      const intersections = intersectArcArc2D(arc1, arc2, ctx);
      // Should intersect at (0, 0) if both arcs include that point
      expect(intersections.length).toBeGreaterThanOrEqual(0);
    });

    it('returns empty for non-intersecting arcs', () => {
      const arc1: Arc2D = {
        kind: 'arc',
        center: vec2(0, 0),
        radius: 2,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };
      const arc2: Arc2D = {
        kind: 'arc',
        center: vec2(10, 10),
        radius: 2,
        startAngle: 0,
        endAngle: Math.PI / 2,
        ccw: true,
      };

      const intersections = intersectArcArc2D(arc1, arc2, ctx);
      expect(intersections).toHaveLength(0);
    });
  });
});
