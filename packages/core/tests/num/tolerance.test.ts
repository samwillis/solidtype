import { describe, it, expect } from "vitest";
import {
  DEFAULT_TOLERANCES,
  createNumericContext,
  isZero,
  eqLength,
  eqAngle,
  clampToZero,
  eq,
  lt,
  lte,
  gt,
  gte,
} from "../../src/num/tolerance.js";

describe("tolerance", () => {
  describe("context creation", () => {
    it("should create default context", () => {
      const ctx = createNumericContext();
      expect(ctx.tol.length).toBe(DEFAULT_TOLERANCES.length);
      expect(ctx.tol.angle).toBe(DEFAULT_TOLERANCES.angle);
    });

    it("should create context with custom tolerances", () => {
      const ctx = createNumericContext({ length: 1e-3 });
      expect(ctx.tol.length).toBe(1e-3);
      expect(ctx.tol.angle).toBe(DEFAULT_TOLERANCES.angle);
    });
  });

  describe("isZero", () => {
    it("should identify zero values", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      expect(isZero(0, ctx)).toBe(true);
      expect(isZero(1e-7, ctx)).toBe(true);
      expect(isZero(1e-5, ctx)).toBe(false);
      expect(isZero(-1e-7, ctx)).toBe(true);
    });
  });

  describe("eqLength", () => {
    it("should compare lengths within tolerance", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      expect(eqLength(1.0, 1.0, ctx)).toBe(true);
      expect(eqLength(1.0, 1.0 + 1e-7, ctx)).toBe(true);
      expect(eqLength(1.0, 1.0 + 1e-5, ctx)).toBe(false);
    });
  });

  describe("eqAngle", () => {
    it("should compare angles within tolerance", () => {
      const ctx = createNumericContext({ angle: 1e-8 });
      expect(eqAngle(0, 0, ctx)).toBe(true);
      expect(eqAngle(Math.PI, Math.PI, ctx)).toBe(true);
      expect(eqAngle(0, 1e-9, ctx)).toBe(true);
      expect(eqAngle(0, 1e-7, ctx)).toBe(false);
    });

    it("should handle angle wrap-around", () => {
      const ctx = createNumericContext({ angle: 1e-6 });
      // 2π - small should be equal to small (within tolerance)
      expect(eqAngle(0, 2 * Math.PI - 1e-7, ctx)).toBe(true);
      expect(eqAngle(Math.PI, Math.PI + 2 * Math.PI, ctx)).toBe(true);
    });
  });

  describe("clampToZero", () => {
    it("should clamp small values to zero", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      expect(clampToZero(0, ctx)).toBe(0);
      expect(clampToZero(1e-7, ctx)).toBe(0);
      expect(clampToZero(1e-5, ctx)).toBe(1e-5);
      expect(clampToZero(-1e-7, ctx)).toBe(0);
    });
  });

  describe("comparison operators", () => {
    it("should compare with tolerance", () => {
      const ctx = createNumericContext({ length: 1e-6 });

      // eq
      expect(eq(1.0, 1.0 + 1e-7, ctx)).toBe(true);
      expect(eq(1.0, 1.0 + 1e-5, ctx)).toBe(false);

      // lt
      expect(lt(1.0, 1.0 + 1e-5, ctx)).toBe(true);
      expect(lt(1.0, 1.0 + 1e-7, ctx)).toBe(false);

      // lte
      expect(lte(1.0, 1.0 + 1e-7, ctx)).toBe(true);
      expect(lte(1.0, 1.0 + 1e-5, ctx)).toBe(true);

      // gt
      expect(gt(1.0 + 1e-5, 1.0, ctx)).toBe(true);
      expect(gt(1.0 + 1e-7, 1.0, ctx)).toBe(false);

      // gte
      expect(gte(1.0 + 1e-7, 1.0, ctx)).toBe(true);
      expect(gte(1.0 + 1e-5, 1.0, ctx)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle exact values", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      expect(eqLength(1.0, 1.0, ctx)).toBe(true);
      expect(eq(1.0, 1.0, ctx)).toBe(true);
    });

    it("should handle values just within tolerance", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      const tol = ctx.tol.length;
      expect(eqLength(1.0, 1.0 + tol * 0.9, ctx)).toBe(true);
    });

    it("should handle values just outside tolerance", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      const tol = ctx.tol.length;
      expect(eqLength(1.0, 1.0 + tol * 1.1, ctx)).toBe(false);
    });

    it("should handle very small values", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      expect(isZero(1e-10, ctx)).toBe(true);
      expect(isZero(1e-5, ctx)).toBe(false);
    });

    it("should handle very large values", () => {
      const ctx = createNumericContext({ length: 1e-6 });
      const large = 1e10;
      expect(eqLength(large, large + 1e-5, ctx)).toBe(false); // Difference is significant
      expect(eqLength(large, large + 1e-7, ctx)).toBe(true); // Difference is within tolerance
    });

    it("should handle zero tolerance edge case", () => {
      const ctx = createNumericContext({ length: 0 });
      // With zero tolerance, only exact equality should pass
      expect(eqLength(1.0, 1.0, ctx)).toBe(true);
      // Note: With zero tolerance, any non-zero difference fails
      // But due to floating point precision, 1.0 + 1e-15 might still compare equal
      // depending on how JavaScript handles it
      expect(eqLength(1.0, 1.0 + Number.EPSILON, ctx)).toBe(false);
    });
  });
});
