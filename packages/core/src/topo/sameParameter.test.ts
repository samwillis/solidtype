/**
 * Tests for SameParameter validation
 */

import { describe, it, expect } from "vitest";
import { TopoModel } from "./TopoModel.js";
import { createNumericContext } from "../num/tolerance.js";
import { createPlaneSurface } from "../geom/surface.js";
import { vec3 } from "../num/vec3.js";
import { vec2 } from "../num/vec2.js";
import type { Line2D } from "../geom/curve2d.js";
import { validateHalfEdgeSameParameter, hasPCurve, loopHasAllPCurves } from "./sameParameter.js";

describe("SameParameter validation", () => {
  const ctx = createNumericContext();

  describe("hasPCurve", () => {
    it("should return false for half-edge without p-curve", () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const edge = model.addEdge(v0, v1);
      const he = model.addHalfEdge(edge, 1);

      expect(hasPCurve(model, he)).toBe(false);
    });

    it("should return true for half-edge with p-curve", () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const edge = model.addEdge(v0, v1);
      const he = model.addHalfEdge(edge, 1);

      // Add a p-curve
      const plane = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(plane);

      const line2d: Line2D = { kind: "line", p0: vec2(0, 0), p1: vec2(1, 0) };
      const curve2dIdx = model.addCurve2D(line2d);
      const pcurveIdx = model.addPCurve(curve2dIdx, surfaceIdx);

      model.setHalfEdgePCurve(he, pcurveIdx);

      expect(hasPCurve(model, he)).toBe(true);
    });
  });

  describe("validateHalfEdgeSameParameter", () => {
    it("should validate matching edge and p-curve", () => {
      const model = new TopoModel(ctx);

      // Create edge from (0,0,0) to (1,0,0) on XY plane
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const edge = model.addEdge(v0, v1);
      const he = model.addHalfEdge(edge, 1);

      // Create plane surface with explicit xDir to match edge direction
      // We want xDir = (1,0,0) so that UV (u,0) maps to (u,0,0)
      const plane = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1), vec3(1, 0, 0));
      const surfaceIdx = model.addSurface(plane);

      // Create matching p-curve (line from (0,0) to (1,0) in UV)
      // With xDir = (1,0,0), UV (u,0) gives point (u,0,0)
      const line2d: Line2D = { kind: "line", p0: vec2(0, 0), p1: vec2(1, 0) };
      const curve2dIdx = model.addCurve2D(line2d);
      const pcurveIdx = model.addPCurve(curve2dIdx, surfaceIdx);

      model.setHalfEdgePCurve(he, pcurveIdx);

      const result = validateHalfEdgeSameParameter(model, he, ctx);

      expect(result.valid).toBe(true);
      expect(result.maxDeviation).toBeLessThan(ctx.tol.length);
    });

    it("should detect deviation in mismatched edge and p-curve", () => {
      const model = new TopoModel(ctx);

      // Create edge from (0,0,0) to (1,0,0) on XY plane
      // For linear edges without curve, validation uses vertex interpolation
      // We need the p-curve to evaluate to a DIFFERENT 3D point than the edge
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const edge = model.addEdge(v0, v1);
      const he = model.addHalfEdge(edge, 1);

      // Create plane surface with explicit xDir to match edge direction
      const plane = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1), vec3(1, 0, 0));
      const surfaceIdx = model.addSurface(plane);

      // Create WRONG p-curve (line from (0,0) to (0,1) in UV - perpendicular!)
      // At t=0.5, edge gives (0.5, 0, 0), but p-curve gives UV (0, 0.5)
      // With xDir=(1,0,0), yDir=(0,1,0), UV (0,0.5) -> (0, 0.5, 0)
      const line2d: Line2D = { kind: "line", p0: vec2(0, 0), p1: vec2(0, 1) };
      const curve2dIdx = model.addCurve2D(line2d);
      const pcurveIdx = model.addPCurve(curve2dIdx, surfaceIdx);

      model.setHalfEdgePCurve(he, pcurveIdx);

      const result = validateHalfEdgeSameParameter(model, he, ctx);

      // Should report deviation - at t=0.5, distance is sqrt(0.5^2 + 0.5^2) ≈ 0.707
      expect(result.valid).toBe(false);
      expect(result.maxDeviation).toBeGreaterThan(0.5);
    });

    it("should pass validation for half-edge without p-curve", () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const edge = model.addEdge(v0, v1);
      const he = model.addHalfEdge(edge, 1);

      // No p-curve set - validation should pass (nothing to validate)
      const result = validateHalfEdgeSameParameter(model, he, ctx);

      expect(result.valid).toBe(true);
    });
  });

  describe("loopHasAllPCurves", () => {
    it("should return true when all half-edges have p-curves", () => {
      const model = new TopoModel(ctx);

      // Create a triangle
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0, 1, 0);

      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);

      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);

      const loop = model.addLoop([he0, he1, he2]);

      // Add p-curves
      const plane = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(plane);

      const line2d: Line2D = { kind: "line", p0: vec2(0, 0), p1: vec2(1, 0) };
      const curve2dIdx = model.addCurve2D(line2d);
      const pcurveIdx = model.addPCurve(curve2dIdx, surfaceIdx);

      model.setHalfEdgePCurve(he0, pcurveIdx);
      model.setHalfEdgePCurve(he1, pcurveIdx);
      model.setHalfEdgePCurve(he2, pcurveIdx);

      expect(loopHasAllPCurves(model, loop)).toBe(true);
    });

    it("should return false when some half-edges lack p-curves", () => {
      const model = new TopoModel(ctx);

      // Create a triangle
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0, 1, 0);

      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);

      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);

      const loop = model.addLoop([he0, he1, he2]);

      // Only add p-curve to first half-edge
      const plane = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(plane);

      const line2d: Line2D = { kind: "line", p0: vec2(0, 0), p1: vec2(1, 0) };
      const curve2dIdx = model.addCurve2D(line2d);
      const pcurveIdx = model.addPCurve(curve2dIdx, surfaceIdx);

      model.setHalfEdgePCurve(he0, pcurveIdx);
      // he1 and he2 have no p-curves

      expect(loopHasAllPCurves(model, loop)).toBe(false);
    });
  });
});
