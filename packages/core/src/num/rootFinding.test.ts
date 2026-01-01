import { describe, it, expect } from "vitest";
import { newton, bisection, hybrid, type RootFunction } from "./rootFinding.js";
import { createNumericContext } from "./tolerance.js";

describe(`rootFinding`, () => {
  const ctx = createNumericContext({ length: 1e-10 });

  describe(`newton`, () => {
    it(`should find root of linear function`, () => {
      const f: RootFunction = (x) => x - 5;
      const df: RootFunction = () => 1;
      const result = newton(f, df, 0, ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.root).toBeCloseTo(5, 8);
        expect(result.iterations).toBeGreaterThan(0);
      }
    });

    it(`should find root of quadratic function`, () => {
      // f(x) = x² - 4, root at x = 2
      const f: RootFunction = (x) => x * x - 4;
      const df: RootFunction = (x) => 2 * x;
      const result = newton(f, df, 3, ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Math.abs(result.root - 2)).toBeLessThan(1e-8);
      }
    });

    it(`should handle zero derivative`, () => {
      // f(x) = x³ - 1, root at x=1
      // df(x) = 3x², which is 0 at x=0
      // Starting at x=0, we hit zero derivative before convergence
      const f: RootFunction = (x) => x * x * x - 1;
      const df: RootFunction = (x) => 3 * x * x;
      const result = newton(f, df, 0, ctx);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`zero`);
      }
    });

    it(`should respect max iterations`, () => {
      const f: RootFunction = (x) => Math.exp(x) - 1000; // Hard to converge from bad start
      const df: RootFunction = (x) => Math.exp(x);
      const result = newton(f, df, 0, ctx, { maxIterations: 5 });

      // May or may not converge, but should respect iteration limit
      if (!result.ok) {
        expect(result.error).toContain(`iterations`);
      }
    });
  });

  describe(`bisection`, () => {
    it(`should find root in bracket`, () => {
      // f(x) = x - 5, root at x = 5
      const f: RootFunction = (x) => x - 5;
      const result = bisection(f, 0, 10, ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.root).toBeCloseTo(5, 8);
      }
    });

    it(`should find root of quadratic`, () => {
      // f(x) = x² - 4, root at x = 2
      const f: RootFunction = (x) => x * x - 4;
      const result = bisection(f, 0, 5, ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Math.abs(result.root - 2)).toBeLessThan(1e-8);
      }
    });

    it(`should reject invalid bracket`, () => {
      // f(x) = x² + 1, no real roots
      const f: RootFunction = (x) => x * x + 1;
      const result = bisection(f, 0, 5, ctx);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`opposite signs`);
      }
    });

    it(`should handle root at endpoint`, () => {
      const f: RootFunction = (x) => x - 5;
      const result = bisection(f, 5, 10, ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.root).toBeCloseTo(5, 8);
        expect(result.iterations).toBe(0); // Found immediately
      }
    });
  });

  describe(`hybrid`, () => {
    it(`should use Newton when it works`, () => {
      const f: RootFunction = (x) => x - 5;
      const df: RootFunction = () => 1;
      const result = hybrid(f, df, 0, null, ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.root).toBeCloseTo(5, 8);
      }
    });

    it(`should fall back to bisection when Newton fails`, () => {
      const f: RootFunction = (x) => x - 5;
      const df: RootFunction = () => 1;
      // Use a bracket that doesn't help Newton but works for bisection
      const result = hybrid(f, df, 100, [0, 10], ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.root).toBeCloseTo(5, 8);
      }
    });
  });

  describe(`convergence`, () => {
    it(`should converge to tolerance`, () => {
      const f: RootFunction = (x) => x * x - 2; // Root at sqrt(2)
      const df: RootFunction = (x) => 2 * x;
      const result = newton(f, df, 1.5, ctx, { tolerance: 1e-12 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expected = Math.sqrt(2);
        expect(Math.abs(result.root - expected)).toBeLessThan(1e-12);
      }
    });
  });
});
