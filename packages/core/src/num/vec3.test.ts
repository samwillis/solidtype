import { describe, it, expect } from 'vitest';
import {
  vec3,
  ZERO3,
  X_AXIS,
  Y_AXIS,
  Z_AXIS,
  add3,
  sub3,
  mul3,
  dot3,
  cross3,
  lengthSq3,
  length3,
  normalize3,
  distSq3,
  dist3,
} from './vec3.js';

describe('vec3', () => {
  describe('basic operations', () => {
    it('should create vectors', () => {
      const v = vec3(1, 2, 3);
      expect(v[0]).toBe(1);
      expect(v[1]).toBe(2);
      expect(v[2]).toBe(3);
    });

    it('should add vectors', () => {
      const a = vec3(1, 2, 3);
      const b = vec3(4, 5, 6);
      const result = add3(a, b);
      expect(result).toEqual([5, 7, 9]);
    });

    it('should subtract vectors', () => {
      const a = vec3(5, 6, 7);
      const b = vec3(2, 3, 4);
      const result = sub3(a, b);
      expect(result).toEqual([3, 3, 3]);
    });

    it('should multiply by scalar', () => {
      const v = vec3(2, 3, 4);
      const result = mul3(v, 2);
      expect(result).toEqual([4, 6, 8]);
    });

    it('should compute dot product', () => {
      const a = vec3(1, 2, 3);
      const b = vec3(4, 5, 6);
      expect(dot3(a, b)).toBe(32); // 1*4 + 2*5 + 3*6 = 32
    });

    it('should compute cross product', () => {
      const a = vec3(1, 0, 0);
      const b = vec3(0, 1, 0);
      const result = cross3(a, b);
      expect(result).toEqual([0, 0, 1]); // Should give Z axis
    });
  });

  describe('length operations', () => {
    it('should compute squared length', () => {
      const v = vec3(2, 3, 6);
      expect(lengthSq3(v)).toBe(49); // 2² + 3² + 6² = 49
    });

    it('should compute length', () => {
      const v = vec3(2, 3, 6);
      expect(length3(v)).toBe(7);
    });

    it('should normalize vectors', () => {
      const v = vec3(2, 3, 6);
      const normalized = normalize3(v);
      expect(length3(normalized)).toBeCloseTo(1, 10);
      expect(normalized[0]).toBeCloseTo(2 / 7, 10);
      expect(normalized[1]).toBeCloseTo(3 / 7, 10);
      expect(normalized[2]).toBeCloseTo(6 / 7, 10);
    });

    it('should handle zero vector normalization', () => {
      const normalized = normalize3(ZERO3);
      expect(normalized).toEqual([0, 0, 0]);
    });
  });

  describe('distance operations', () => {
    it('should compute squared distance', () => {
      const a = vec3(0, 0, 0);
      const b = vec3(2, 3, 6);
      expect(distSq3(a, b)).toBe(49);
    });

    it('should compute distance', () => {
      const a = vec3(0, 0, 0);
      const b = vec3(2, 3, 6);
      expect(dist3(a, b)).toBe(7);
    });
  });

  describe('vector identities', () => {
    it('should satisfy: ||normalize(v)|| ≈ 1', () => {
      const vectors = [
        vec3(1, 0, 0),
        vec3(0, 1, 0),
        vec3(0, 0, 1),
        vec3(1, 1, 1),
        vec3(3, 4, 5),
        vec3(100, 200, 300),
      ];

      for (const v of vectors) {
        if (length3(v) > 0) {
          const normalized = normalize3(v);
          expect(length3(normalized)).toBeCloseTo(1, 10);
        }
      }
    });

    it('should satisfy: ||normalize(v)|| ≈ 1 for random vectors (property test)', () => {
      // Generate random vectors and verify normalization property
      for (let i = 0; i < 100; i++) {
        const x = (Math.random() - 0.5) * 1000;
        const y = (Math.random() - 0.5) * 1000;
        const z = (Math.random() - 0.5) * 1000;
        const v = vec3(x, y, z);
        
        if (length3(v) > 1e-10) {
          const normalized = normalize3(v);
          expect(length3(normalized)).toBeCloseTo(1, 10);
        }
      }
    });

    it('should satisfy: a × b = -(b × a)', () => {
      const a = vec3(1, 2, 3);
      const b = vec3(4, 5, 6);
      const crossAB = cross3(a, b);
      const crossBA = cross3(b, a);
      expect(crossAB[0]).toBeCloseTo(-crossBA[0], 10);
      expect(crossAB[1]).toBeCloseTo(-crossBA[1], 10);
      expect(crossAB[2]).toBeCloseTo(-crossBA[2], 10);
    });

    it('should satisfy: a · (b × c) = (a × b) · c (scalar triple product)', () => {
      const a = vec3(1, 2, 3);
      const b = vec3(4, 5, 6);
      const c = vec3(7, 8, 9);
      const left = dot3(a, cross3(b, c));
      const right = dot3(cross3(a, b), c);
      expect(left).toBeCloseTo(right, 10);
    });

    it('should have orthogonal unit axes', () => {
      expect(dot3(X_AXIS, Y_AXIS)).toBe(0);
      expect(dot3(Y_AXIS, Z_AXIS)).toBe(0);
      expect(dot3(Z_AXIS, X_AXIS)).toBe(0);
      expect(length3(X_AXIS)).toBe(1);
      expect(length3(Y_AXIS)).toBe(1);
      expect(length3(Z_AXIS)).toBe(1);
    });
  });
});
