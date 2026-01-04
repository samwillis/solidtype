import { describe, it, expect } from "vitest";
import {
  vec2,
  ZERO2,
  add2,
  sub2,
  mul2,
  dot2,
  cross2,
  lengthSq2,
  length2,
  normalize2,
  distSq2,
  dist2,
} from "../../src/num/vec2.js";

describe(`vec2`, () => {
  describe(`basic operations`, () => {
    it(`should create vectors`, () => {
      const v = vec2(3, 4);
      expect(v[0]).toBe(3);
      expect(v[1]).toBe(4);
    });

    it(`should add vectors`, () => {
      const a = vec2(1, 2);
      const b = vec2(3, 4);
      const result = add2(a, b);
      expect(result).toEqual([4, 6]);
    });

    it(`should subtract vectors`, () => {
      const a = vec2(5, 6);
      const b = vec2(2, 3);
      const result = sub2(a, b);
      expect(result).toEqual([3, 3]);
    });

    it(`should multiply by scalar`, () => {
      const v = vec2(2, 3);
      const result = mul2(v, 2);
      expect(result).toEqual([4, 6]);
    });

    it(`should compute dot product`, () => {
      const a = vec2(1, 2);
      const b = vec2(3, 4);
      expect(dot2(a, b)).toBe(11); // 1*3 + 2*4 = 11
    });

    it(`should compute cross product`, () => {
      const a = vec2(1, 0);
      const b = vec2(0, 1);
      expect(cross2(a, b)).toBe(1); // Should be positive (counter-clockwise)
      expect(cross2(b, a)).toBe(-1); // Should be negative (clockwise)
    });
  });

  describe(`length operations`, () => {
    it(`should compute squared length`, () => {
      const v = vec2(3, 4);
      expect(lengthSq2(v)).toBe(25);
    });

    it(`should compute length`, () => {
      const v = vec2(3, 4);
      expect(length2(v)).toBe(5);
    });

    it(`should normalize vectors`, () => {
      const v = vec2(3, 4);
      const normalized = normalize2(v);
      expect(length2(normalized)).toBeCloseTo(1, 10);
      expect(normalized[0]).toBeCloseTo(0.6, 10);
      expect(normalized[1]).toBeCloseTo(0.8, 10);
    });

    it(`should handle zero vector normalization`, () => {
      const normalized = normalize2(ZERO2);
      expect(normalized).toEqual([0, 0]);
    });
  });

  describe(`distance operations`, () => {
    it(`should compute squared distance`, () => {
      const a = vec2(0, 0);
      const b = vec2(3, 4);
      expect(distSq2(a, b)).toBe(25);
    });

    it(`should compute distance`, () => {
      const a = vec2(0, 0);
      const b = vec2(3, 4);
      expect(dist2(a, b)).toBe(5);
    });
  });

  describe(`vector identities`, () => {
    it(`should satisfy: ||normalize(v)|| ≈ 1`, () => {
      const vectors = [
        vec2(1, 0),
        vec2(0, 1),
        vec2(1, 1),
        vec2(3, 4),
        vec2(100, 200),
        vec2(0.001, 0.002),
      ];

      for (const v of vectors) {
        if (length2(v) > 0) {
          const normalized = normalize2(v);
          expect(length2(normalized)).toBeCloseTo(1, 10);
        }
      }
    });

    it(`should satisfy: ||normalize(v)|| ≈ 1 for random vectors (property test)`, () => {
      // Generate random vectors and verify normalization property
      for (let i = 0; i < 100; i++) {
        const x = (Math.random() - 0.5) * 1000;
        const y = (Math.random() - 0.5) * 1000;
        const v = vec2(x, y);

        if (length2(v) > 1e-10) {
          const normalized = normalize2(v);
          expect(length2(normalized)).toBeCloseTo(1, 10);
        }
      }
    });

    it(`should satisfy: a · b = ||a|| ||b|| cos(θ)`, () => {
      const a = vec2(1, 0);
      const b = vec2(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4));
      const dot = dot2(a, b);
      const expected = length2(a) * length2(b) * Math.cos(Math.PI / 4);
      expect(dot).toBeCloseTo(expected, 10);
    });

    it(`should satisfy: cross(a, b) = -cross(b, a)`, () => {
      const a = vec2(1, 2);
      const b = vec2(3, 4);
      expect(cross2(a, b)).toBe(-cross2(b, a));
    });
  });
});
