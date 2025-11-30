/**
 * Tests for 3D curve evaluators
 */

import { describe, it, expect } from 'vitest';
import type { Line3D, Circle3D } from './curve3d.js';
import {
  evalCurve3D,
  curveTangent3D,
  curveLength3D,
  closestPointOnCurve3D,
  createCircle3D,
} from './curve3d.js';
import { vec3, X_AXIS, Y_AXIS, Z_AXIS } from '../num/vec3.js';
import { createNumericContext } from '../num/tolerance.js';
import { length3, dist3 } from '../num/vec3.js';

describe('curve3d', () => {
  const ctx = createNumericContext();

  describe('evalCurve3D', () => {
    it('evaluates line at endpoints', () => {
      const line: Line3D = {
        kind: 'line',
        p0: vec3(0, 0, 0),
        p1: vec3(10, 5, 2),
      };

      const p0 = evalCurve3D(line, 0);
      const p1 = evalCurve3D(line, 1);

      expect(p0[0]).toBeCloseTo(0, 10);
      expect(p0[1]).toBeCloseTo(0, 10);
      expect(p0[2]).toBeCloseTo(0, 10);
      expect(p1[0]).toBeCloseTo(10, 10);
      expect(p1[1]).toBeCloseTo(5, 10);
      expect(p1[2]).toBeCloseTo(2, 10);
    });

    it('evaluates line at midpoint', () => {
      const line: Line3D = {
        kind: 'line',
        p0: vec3(0, 0, 0),
        p1: vec3(10, 0, 0),
      };

      const mid = evalCurve3D(line, 0.5);
      expect(mid[0]).toBeCloseTo(5, 10);
      expect(mid[1]).toBeCloseTo(0, 10);
      expect(mid[2]).toBeCloseTo(0, 10);
    });

    it('evaluates circle', () => {
      const circle: Circle3D = {
        kind: 'circle',
        center: vec3(0, 0, 0),
        radius: 5,
        normal: Z_AXIS,
        uDir: X_AXIS,
        vDir: Y_AXIS,
      };

      // At t=0 (angle 0)
      const p0 = evalCurve3D(circle, 0);
      expect(p0[0]).toBeCloseTo(5, 10);
      expect(p0[1]).toBeCloseTo(0, 10);
      expect(p0[2]).toBeCloseTo(0, 10);

      // At t=0.25 (angle π/2)
      const p1 = evalCurve3D(circle, 0.25);
      expect(p1[0]).toBeCloseTo(0, 10);
      expect(p1[1]).toBeCloseTo(5, 10);
      expect(p1[2]).toBeCloseTo(0, 10);
    });
  });

  describe('curveTangent3D', () => {
    it('computes line tangent', () => {
      const line: Line3D = {
        kind: 'line',
        p0: vec3(0, 0, 0),
        p1: vec3(10, 0, 0),
      };

      const tangent = curveTangent3D(line, 0.5);
      expect(tangent[0]).toBeCloseTo(1, 10);
      expect(tangent[1]).toBeCloseTo(0, 10);
      expect(tangent[2]).toBeCloseTo(0, 10);
      expect(length3(tangent)).toBeCloseTo(1, 10);
    });

    it('computes circle tangent', () => {
      const circle: Circle3D = {
        kind: 'circle',
        center: vec3(0, 0, 0),
        radius: 5,
        normal: Z_AXIS,
        uDir: X_AXIS,
        vDir: Y_AXIS,
      };

      // At t=0, tangent should be in +Y direction
      const tangent = curveTangent3D(circle, 0);
      expect(tangent[0]).toBeCloseTo(0, 10);
      expect(tangent[1]).toBeCloseTo(1, 10);
      expect(tangent[2]).toBeCloseTo(0, 10);
      expect(length3(tangent)).toBeCloseTo(1, 10);
    });
  });

  describe('curveLength3D', () => {
    it('computes line length', () => {
      const line: Line3D = {
        kind: 'line',
        p0: vec3(0, 0, 0),
        p1: vec3(3, 4, 0),
      };

      const len = curveLength3D(line);
      expect(len).toBeCloseTo(5, 10);
    });

    it('computes circle circumference', () => {
      const circle: Circle3D = {
        kind: 'circle',
        center: vec3(0, 0, 0),
        radius: 5,
        normal: Z_AXIS,
        uDir: X_AXIS,
        vDir: Y_AXIS,
      };

      const len = curveLength3D(circle);
      expect(len).toBeCloseTo(2 * Math.PI * 5, 10);
    });
  });

  describe('closestPointOnCurve3D', () => {
    it('finds closest point on line', () => {
      const line: Line3D = {
        kind: 'line',
        p0: vec3(0, 0, 0),
        p1: vec3(10, 0, 0),
      };

      const result = closestPointOnCurve3D(line, vec3(5, 5, 0), ctx);
      expect(result.point[0]).toBeCloseTo(5, 10);
      expect(result.point[1]).toBeCloseTo(0, 10);
      expect(result.point[2]).toBeCloseTo(0, 10);
      expect(result.t).toBeCloseTo(0.5, 10);
    });

    it('finds closest point on circle', () => {
      const circle: Circle3D = {
        kind: 'circle',
        center: vec3(0, 0, 0),
        radius: 5,
        normal: Z_AXIS,
        uDir: X_AXIS,
        vDir: Y_AXIS,
      };

      // Point at angle π/4 should map to itself
      const query = vec3(5 * Math.cos(Math.PI / 4), 5 * Math.sin(Math.PI / 4), 0);
      const result = closestPointOnCurve3D(circle, query, ctx);
      expect(result.t).toBeCloseTo(0.125, 5); // π/4 / (2π) = 0.125
    });
  });

  describe('createCircle3D', () => {
    it('creates circle from center, radius, and normal', () => {
      const circle = createCircle3D(vec3(0, 0, 0), 5, Z_AXIS);

      expect(circle.kind).toBe('circle');
      expect(circle.center).toEqual(vec3(0, 0, 0));
      expect(circle.radius).toBe(5);
      expect(circle.normal[2]).toBeCloseTo(1, 10);
      expect(circle.uDir).toBeDefined();
      expect(circle.vDir).toBeDefined();
    });
  });
});
