import { describe, it, expect } from "vitest";
import {
  orient2D,
  orient3D,
  classifyPointPlane,
  distanceToPlane,
  isPointOnSegment2D,
  isPointOnSegment3D,
} from "../../src/num/predicates.js";
import { vec2 } from "../../src/num/vec2.js";
import { vec3 } from "../../src/num/vec3.js";
import { createNumericContext } from "../../src/num/tolerance.js";

describe("predicates", () => {
  const ctx = createNumericContext({ length: 1e-6, angle: 1e-8 });

  describe("orient2D", () => {
    it("should return positive for left turn", () => {
      const a = vec2(0, 0);
      const b = vec2(1, 0);
      const c = vec2(0, 1); // Left of line a->b
      expect(orient2D(a, b, c, ctx)).toBeGreaterThan(0);
    });

    it("should return negative for right turn", () => {
      const a = vec2(0, 0);
      const b = vec2(1, 0);
      const c = vec2(0, -1); // Right of line a->b
      expect(orient2D(a, b, c, ctx)).toBeLessThan(0);
    });

    it("should return zero for collinear points", () => {
      const a = vec2(0, 0);
      const b = vec2(1, 0);
      const c = vec2(2, 0); // On line a->b
      expect(orient2D(a, b, c, ctx)).toBe(0);
    });

    it("should handle degenerate case (a == b)", () => {
      const a = vec2(0, 0);
      const b = vec2(0, 0);
      const c = vec2(1, 1);
      // When a == b, any point is considered collinear
      expect(orient2D(a, b, c, ctx)).toBe(0);
    });
  });

  describe("orient3D", () => {
    it("should return positive for point above plane", () => {
      const a = vec3(0, 0, 0);
      const b = vec3(1, 0, 0);
      const c = vec3(0, 1, 0);
      const d = vec3(0, 0, 1); // Above plane (in +z direction)
      expect(orient3D(a, b, c, d, ctx)).toBeGreaterThan(0);
    });

    it("should return negative for point below plane", () => {
      const a = vec3(0, 0, 0);
      const b = vec3(1, 0, 0);
      const c = vec3(0, 1, 0);
      const d = vec3(0, 0, -1); // Below plane (in -z direction)
      expect(orient3D(a, b, c, d, ctx)).toBeLessThan(0);
    });

    it("should return zero for coplanar point", () => {
      const a = vec3(0, 0, 0);
      const b = vec3(1, 0, 0);
      const c = vec3(0, 1, 0);
      const d = vec3(0.5, 0.5, 0); // On plane
      expect(orient3D(a, b, c, d, ctx)).toBe(0);
    });
  });

  describe("classifyPointPlane", () => {
    it("should classify point on plane", () => {
      const origin = vec3(0, 0, 0);
      const normal = vec3(0, 0, 1);
      const point = vec3(1, 1, 0);
      expect(classifyPointPlane(point, origin, normal, ctx)).toBe("on");
    });

    it("should classify point above plane", () => {
      const origin = vec3(0, 0, 0);
      const normal = vec3(0, 0, 1);
      const point = vec3(1, 1, 1);
      expect(classifyPointPlane(point, origin, normal, ctx)).toBe("above");
    });

    it("should classify point below plane", () => {
      const origin = vec3(0, 0, 0);
      const normal = vec3(0, 0, 1);
      const point = vec3(1, 1, -1);
      expect(classifyPointPlane(point, origin, normal, ctx)).toBe("below");
    });
  });

  describe("distanceToPlane", () => {
    it("should compute signed distance", () => {
      const origin = vec3(0, 0, 0);
      const normal = vec3(0, 0, 1);
      const pointAbove = vec3(0, 0, 5);
      expect(distanceToPlane(pointAbove, origin, normal)).toBe(5);

      const pointBelow = vec3(0, 0, -3);
      expect(distanceToPlane(pointBelow, origin, normal)).toBe(-3);
    });

    it("should return zero for point on plane", () => {
      const origin = vec3(0, 0, 0);
      const normal = vec3(0, 0, 1);
      const point = vec3(1, 2, 0);
      expect(distanceToPlane(point, origin, normal)).toBe(0);
    });
  });

  describe("isPointOnSegment2D", () => {
    it("should identify point on segment", () => {
      const start = vec2(0, 0);
      const end = vec2(10, 0);
      const point = vec2(5, 0);
      expect(isPointOnSegment2D(point, start, end, ctx)).toBe(true);
    });

    it("should identify point at segment endpoint", () => {
      const start = vec2(0, 0);
      const end = vec2(10, 0);
      expect(isPointOnSegment2D(start, start, end, ctx)).toBe(true);
      expect(isPointOnSegment2D(end, start, end, ctx)).toBe(true);
    });

    it("should reject point off segment", () => {
      const start = vec2(0, 0);
      const end = vec2(10, 0);
      const point = vec2(5, 1); // Not collinear
      expect(isPointOnSegment2D(point, start, end, ctx)).toBe(false);
    });

    it("should reject point beyond segment", () => {
      const start = vec2(0, 0);
      const end = vec2(10, 0);
      const point = vec2(15, 0); // Collinear but beyond end
      expect(isPointOnSegment2D(point, start, end, ctx)).toBe(false);
    });
  });

  describe("isPointOnSegment3D", () => {
    it("should identify point on segment", () => {
      const start = vec3(0, 0, 0);
      const end = vec3(10, 0, 0);
      const point = vec3(5, 0, 0);
      expect(isPointOnSegment3D(point, start, end, ctx)).toBe(true);
    });

    it("should identify point at segment endpoint", () => {
      const start = vec3(0, 0, 0);
      const end = vec3(10, 0, 0);
      expect(isPointOnSegment3D(start, start, end, ctx)).toBe(true);
      expect(isPointOnSegment3D(end, start, end, ctx)).toBe(true);
    });

    it("should reject point off segment", () => {
      const start = vec3(0, 0, 0);
      const end = vec3(10, 0, 0);
      const point = vec3(5, 1, 0); // Not collinear
      expect(isPointOnSegment3D(point, start, end, ctx)).toBe(false);
    });
  });

  describe("property tests with random triangles", () => {
    it("should correctly orient points for random triangles (property test)", () => {
      // Generate random triangles and verify orientation is consistent
      for (let i = 0; i < 50; i++) {
        // Create a random triangle
        const a = vec2(Math.random() * 100, Math.random() * 100);
        const b = vec2(Math.random() * 100, Math.random() * 100);
        const c = vec2(Math.random() * 100, Math.random() * 100);

        // Skip degenerate cases (collinear points)
        const orient = orient2D(a, b, c, ctx);
        if (orient === 0) continue; // Skip collinear

        // Create a point known to be inside the triangle
        // (using barycentric coordinates: center of triangle)
        const center = vec2((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);

        // The center should have the same orientation relative to each edge
        // as the opposite vertex
        const orientAB = orient2D(a, b, center, ctx);
        const orientBC = orient2D(b, c, center, ctx);
        const orientCA = orient2D(c, a, center, ctx);

        // All should have the same sign (all positive or all negative)
        const signs = [orientAB, orientBC, orientCA].filter((s) => s !== 0);
        if (signs.length > 0) {
          const firstSign = Math.sign(signs[0]);
          for (const sign of signs) {
            expect(Math.sign(sign)).toBe(firstSign);
          }
        }
      }
    });

    it("should handle near-degenerate triangles", () => {
      // Test with triangles that are almost collinear
      const a = vec2(0, 0);
      const b = vec2(1, 0);
      const c = vec2(2, ctx.tol.length * 0.1); // Very close to collinear

      const orient = orient2D(a, b, c, ctx);
      // Should be considered collinear (within tolerance)
      expect(orient).toBe(0);
    });
  });
});
