import { describe, it, expect } from "vitest";
import { identity4, zero4, mul4, transformPoint3, transformDirection3 } from "../../src/num/mat4.js";
import { vec3 } from "../../src/num/vec3.js";

describe(`mat4`, () => {
  describe(`basic operations`, () => {
    it(`should create identity matrix`, () => {
      const I = identity4();
      expect(I[0]).toBe(1);
      expect(I[5]).toBe(1);
      expect(I[10]).toBe(1);
      expect(I[15]).toBe(1);
      expect(I[1]).toBe(0);
      expect(I[2]).toBe(0);
    });

    it(`should create zero matrix`, () => {
      const Z = zero4();
      for (let i = 0; i < 16; i++) {
        expect(Z[i]).toBe(0);
      }
    });

    it(`should multiply identity by identity`, () => {
      const I = identity4();
      const result = mul4(I, I);
      expect(result).toEqual(I);
    });

    it(`should multiply matrix by identity`, () => {
      const I = identity4();
      const m = identity4();
      m[12] = 5; // Add translation
      m[13] = 6;
      m[14] = 7;
      const result = mul4(m, I);
      expect(result).toEqual(m);
    });
  });

  describe(`transformations`, () => {
    it(`should transform point with identity`, () => {
      const I = identity4();
      const p = vec3(1, 2, 3);
      const result = transformPoint3(I, p);
      expect(result).toEqual([1, 2, 3]);
    });

    it(`should transform point with translation`, () => {
      const m = identity4();
      m[12] = 5; // Translation x
      m[13] = 6; // Translation y
      m[14] = 7; // Translation z
      const p = vec3(1, 2, 3);
      const result = transformPoint3(m, p);
      expect(result).toEqual([6, 8, 10]);
    });

    it(`should transform direction (ignoring translation)`, () => {
      const m = identity4();
      m[12] = 5; // Translation (should be ignored)
      m[13] = 6;
      m[14] = 7;
      const d = vec3(1, 0, 0);
      const result = transformDirection3(m, d);
      expect(result).toEqual([1, 0, 0]); // Should not include translation
    });

    it(`should transform direction with scaling`, () => {
      const m = identity4();
      m[0] = 2; // Scale x
      m[5] = 3; // Scale y
      m[10] = 4; // Scale z
      const d = vec3(1, 1, 1);
      const result = transformDirection3(m, d);
      expect(result).toEqual([2, 3, 4]);
    });
  });
});
