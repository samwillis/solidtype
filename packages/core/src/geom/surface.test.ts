/**
 * Tests for 3D surface evaluators
 */

import { describe, it, expect } from "vitest";
import type {
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  SphereSurface,
  TorusSurface,
} from "./surface.js";
import { evalSurface, surfaceNormal, createPlaneSurface } from "./surface.js";
import { vec3, X_AXIS, Y_AXIS, Z_AXIS } from "../num/vec3.js";
import { createNumericContext } from "../num/tolerance.js";
import { length3, dot3 } from "../num/vec3.js";

describe("surface", () => {
  const _ctx = createNumericContext();

  describe("evalSurface", () => {
    it("evaluates plane surface", () => {
      const plane: PlaneSurface = {
        kind: "plane",
        origin: vec3(0, 0, 0),
        normal: Z_AXIS,
        xDir: X_AXIS,
        yDir: Y_AXIS,
      };

      const p = evalSurface(plane, 5, 10);
      expect(p[0]).toBeCloseTo(5, 10);
      expect(p[1]).toBeCloseTo(10, 10);
      expect(p[2]).toBeCloseTo(0, 10);
    });

    it("evaluates cylinder surface", () => {
      const cylinder: CylinderSurface = {
        kind: "cylinder",
        center: vec3(0, 0, 0),
        axis: Z_AXIS,
        radius: 5,
      };

      // At u=0, v=0 (angle 0)
      const p = evalSurface(cylinder, 0, 0);
      expect(p[0]).toBeCloseTo(5, 10);
      expect(p[1]).toBeCloseTo(0, 10);
      expect(p[2]).toBeCloseTo(0, 10);
    });

    it("evaluates cone surface", () => {
      const cone: ConeSurface = {
        kind: "cone",
        apex: vec3(0, 0, 0),
        axis: Z_AXIS,
        halfAngle: Math.PI / 4, // 45 degrees
      };

      // At u=1, v=0
      const p = evalSurface(cone, 1, 0);
      expect(p[2]).toBeCloseTo(1, 10);
      // Radius at u=1 should be tan(π/4) = 1
      const radius = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
      expect(radius).toBeCloseTo(1, 5);
    });

    it("evaluates sphere surface", () => {
      const sphere: SphereSurface = {
        kind: "sphere",
        center: vec3(0, 0, 0),
        radius: 5,
      };

      // At u=0 (north pole), v=0
      const p = evalSurface(sphere, 0, 0);
      expect(p[0]).toBeCloseTo(0, 10);
      expect(p[1]).toBeCloseTo(0, 10);
      expect(p[2]).toBeCloseTo(5, 10);
    });
  });

  describe("surfaceNormal", () => {
    it("computes plane normal", () => {
      const plane: PlaneSurface = {
        kind: "plane",
        origin: vec3(0, 0, 0),
        normal: Z_AXIS,
        xDir: X_AXIS,
        yDir: Y_AXIS,
      };

      const normal = surfaceNormal(plane, 0, 0);
      expect(normal[0]).toBeCloseTo(0, 10);
      expect(normal[1]).toBeCloseTo(0, 10);
      expect(normal[2]).toBeCloseTo(1, 10);
      expect(length3(normal)).toBeCloseTo(1, 10);
    });

    it("computes cylinder normal", () => {
      const cylinder: CylinderSurface = {
        kind: "cylinder",
        center: vec3(0, 0, 0),
        axis: Z_AXIS,
        radius: 5,
      };

      const normal = surfaceNormal(cylinder, 0, 0);
      // At v=0, normal should point in +X direction
      expect(normal[0]).toBeCloseTo(1, 10);
      expect(normal[1]).toBeCloseTo(0, 10);
      expect(normal[2]).toBeCloseTo(0, 10);
      expect(length3(normal)).toBeCloseTo(1, 10);
    });

    it("computes cone normal", () => {
      const cone: ConeSurface = {
        kind: "cone",
        apex: vec3(0, 0, 0),
        axis: Z_AXIS,
        halfAngle: Math.PI / 4, // 45 degrees
      };

      // At v=0, normal should point in +X direction (perpendicular to axis)
      const normal = surfaceNormal(cone, 1, 0);
      expect(normal[0]).toBeCloseTo(1, 10);
      expect(normal[1]).toBeCloseTo(0, 10);
      expect(normal[2]).toBeCloseTo(0, 10);
      expect(length3(normal)).toBeCloseTo(1, 10);
    });

    it("computes sphere normal", () => {
      const sphere: SphereSurface = {
        kind: "sphere",
        center: vec3(0, 0, 0),
        radius: 5,
      };

      const normal = surfaceNormal(sphere, 0, 0);
      // At north pole, normal should point in +Z
      expect(normal[0]).toBeCloseTo(0, 10);
      expect(normal[1]).toBeCloseTo(0, 10);
      expect(normal[2]).toBeCloseTo(1, 10);
      expect(length3(normal)).toBeCloseTo(1, 10);
    });

    it("computes torus normal and evaluates point", () => {
      const torus: TorusSurface = {
        kind: "torus",
        center: vec3(0, 0, 0),
        axis: Z_AXIS,
        majorRadius: 3,
        minorRadius: 1,
      };

      const p = evalSurface(torus, 0, 0);
      expect(p[0]).toBeCloseTo(4, 10);
      expect(p[1]).toBeCloseTo(0, 10);
      expect(p[2]).toBeCloseTo(0, 10);

      const n0 = surfaceNormal(torus, 0, 0);
      expect(n0[0]).toBeCloseTo(1, 10);
      expect(n0[1]).toBeCloseTo(0, 10);
      expect(n0[2]).toBeCloseTo(0, 10);

      const n1 = surfaceNormal(torus, Math.PI / 2, 0);
      expect(n1[0]).toBeCloseTo(0, 10);
      expect(n1[1]).toBeCloseTo(0, 10);
      expect(n1[2]).toBeCloseTo(1, 10);
    });
  });

  describe("createPlaneSurface", () => {
    it("creates plane from origin and normal", () => {
      const plane = createPlaneSurface(vec3(0, 0, 0), Z_AXIS);

      expect(plane.kind).toBe("plane");
      expect(plane.origin).toEqual(vec3(0, 0, 0));
      expect(plane.normal[2]).toBeCloseTo(1, 10);

      // xDir and yDir should be orthonormal
      expect(length3(plane.xDir)).toBeCloseTo(1, 10);
      expect(length3(plane.yDir)).toBeCloseTo(1, 10);
      expect(dot3(plane.xDir, plane.normal)).toBeCloseTo(0, 5);
      expect(dot3(plane.yDir, plane.normal)).toBeCloseTo(0, 5);
      expect(dot3(plane.xDir, plane.yDir)).toBeCloseTo(0, 5);
    });
  });

  describe("edge cases", () => {
    it("handles zero-radius cylinder", () => {
      const cylinder: CylinderSurface = {
        kind: "cylinder",
        center: vec3(0, 0, 0),
        axis: Z_AXIS,
        radius: 0,
      };

      const p = evalSurface(cylinder, 0, 0);
      expect(p[0]).toBeCloseTo(0, 10);
      expect(p[1]).toBeCloseTo(0, 10);
      expect(p[2]).toBeCloseTo(0, 10);
    });

    it("handles zero-radius sphere", () => {
      const sphere: SphereSurface = {
        kind: "sphere",
        center: vec3(1, 2, 3),
        radius: 0,
      };

      const p = evalSurface(sphere, 0, 0);
      expect(p[0]).toBeCloseTo(1, 10);
      expect(p[1]).toBeCloseTo(2, 10);
      expect(p[2]).toBeCloseTo(3, 10);
    });

    it("handles cone at apex (u=0)", () => {
      const cone: ConeSurface = {
        kind: "cone",
        apex: vec3(0, 0, 0),
        axis: Z_AXIS,
        halfAngle: Math.PI / 4,
      };

      const p = evalSurface(cone, 0, 0);
      expect(p[0]).toBeCloseTo(0, 10);
      expect(p[1]).toBeCloseTo(0, 10);
      expect(p[2]).toBeCloseTo(0, 10);

      // Normal at apex should still be valid (perpendicular to axis)
      const normal = surfaceNormal(cone, 0, 0);
      expect(length3(normal)).toBeCloseTo(1, 10);
      expect(dot3(normal, cone.axis)).toBeCloseTo(0, 5);
    });

    it("handles sphere at south pole (u=π)", () => {
      const sphere: SphereSurface = {
        kind: "sphere",
        center: vec3(0, 0, 0),
        radius: 5,
      };

      const p = evalSurface(sphere, Math.PI, 0);
      expect(p[0]).toBeCloseTo(0, 10);
      expect(p[1]).toBeCloseTo(0, 10);
      expect(p[2]).toBeCloseTo(-5, 10);

      const normal = surfaceNormal(sphere, Math.PI, 0);
      expect(normal[0]).toBeCloseTo(0, 10);
      expect(normal[1]).toBeCloseTo(0, 10);
      expect(normal[2]).toBeCloseTo(-1, 10);
      expect(length3(normal)).toBeCloseTo(1, 10);
    });
  });
});
