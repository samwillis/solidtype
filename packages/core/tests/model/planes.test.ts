/**
 * Tests for datum planes
 */

import { describe, it, expect } from "vitest";
import {
  XY_PLANE,
  YZ_PLANE,
  ZX_PLANE,
  TOP_PLANE,
  RIGHT_PLANE,
  FRONT_PLANE,
  createDatumPlaneFromNormal,
  createOffsetPlane,
  getPlaneOrigin,
  getPlaneNormal,
  getPlaneXDir,
  getPlaneYDir,
  planeToWorld,
  worldToPlane,
} from "../../src/model/planes.js";
import { vec3 } from "../../src/num/vec3.js";

describe("Standard datum planes", () => {
  it("XY_PLANE has correct properties", () => {
    expect(getPlaneOrigin(XY_PLANE)).toEqual([0, 0, 0]);
    expect(getPlaneNormal(XY_PLANE)).toEqual([0, 0, 1]);
    expect(getPlaneXDir(XY_PLANE)).toEqual([1, 0, 0]);
    expect(getPlaneYDir(XY_PLANE)).toEqual([0, 1, 0]);
  });

  it("YZ_PLANE has correct properties", () => {
    expect(getPlaneOrigin(YZ_PLANE)).toEqual([0, 0, 0]);
    expect(getPlaneNormal(YZ_PLANE)).toEqual([1, 0, 0]);
    expect(getPlaneXDir(YZ_PLANE)).toEqual([0, 1, 0]);
    expect(getPlaneYDir(YZ_PLANE)).toEqual([0, 0, 1]);
  });

  it("ZX_PLANE has correct properties", () => {
    expect(getPlaneOrigin(ZX_PLANE)).toEqual([0, 0, 0]);
    expect(getPlaneNormal(ZX_PLANE)).toEqual([0, 1, 0]);
    expect(getPlaneXDir(ZX_PLANE)).toEqual([0, 0, 1]);
    expect(getPlaneYDir(ZX_PLANE)).toEqual([1, 0, 0]);
  });

  it("aliases point to correct planes", () => {
    expect(TOP_PLANE).toBe(XY_PLANE);
    expect(RIGHT_PLANE).toBe(YZ_PLANE);
    expect(FRONT_PLANE).toBe(ZX_PLANE);
  });
});

describe("createDatumPlaneFromNormal", () => {
  it("creates a plane with specified normal", () => {
    const plane = createDatumPlaneFromNormal("test", vec3(1, 2, 3), vec3(0, 0, 1));

    expect(plane.name).toBe("test");
    expect(getPlaneOrigin(plane)).toEqual([1, 2, 3]);
    expect(getPlaneNormal(plane)).toEqual([0, 0, 1]);
  });

  it("normalizes the normal vector", () => {
    const plane = createDatumPlaneFromNormal(
      "test",
      vec3(0, 0, 0),
      vec3(0, 0, 10) // not unit length
    );

    const normal = getPlaneNormal(plane);
    const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    expect(len).toBeCloseTo(1, 10);
  });

  it("respects provided X direction", () => {
    const plane = createDatumPlaneFromNormal("test", vec3(0, 0, 0), vec3(0, 0, 1), vec3(1, 0, 0));

    expect(getPlaneXDir(plane)).toEqual([1, 0, 0]);
    expect(getPlaneYDir(plane)).toEqual([0, 1, 0]);
  });
});

describe("createOffsetPlane", () => {
  it("creates a plane offset from the base", () => {
    const offset = createOffsetPlane(XY_PLANE, 5);

    expect(getPlaneOrigin(offset)).toEqual([0, 0, 5]);
    expect(getPlaneNormal(offset)).toEqual([0, 0, 1]);
  });

  it("handles negative offset", () => {
    const offset = createOffsetPlane(XY_PLANE, -3);

    expect(getPlaneOrigin(offset)).toEqual([0, 0, -3]);
  });

  it("uses custom name if provided", () => {
    const offset = createOffsetPlane(XY_PLANE, 5, "custom");
    expect(offset.name).toBe("custom");
  });
});

describe("planeToWorld", () => {
  it("transforms XY plane coordinates to world", () => {
    const world = planeToWorld(XY_PLANE, 3, 4);
    expect(world).toEqual([3, 4, 0]);
  });

  it("transforms YZ plane coordinates to world", () => {
    const world = planeToWorld(YZ_PLANE, 3, 4);
    expect(world).toEqual([0, 3, 4]);
  });

  it("transforms ZX plane coordinates to world", () => {
    const world = planeToWorld(ZX_PLANE, 3, 4);
    expect(world).toEqual([4, 0, 3]);
  });

  it("handles offset planes", () => {
    const offset = createOffsetPlane(XY_PLANE, 10);
    const world = planeToWorld(offset, 3, 4);
    expect(world).toEqual([3, 4, 10]);
  });
});

describe("worldToPlane", () => {
  it("transforms world coordinates to XY plane", () => {
    const plane2D = worldToPlane(XY_PLANE, vec3(3, 4, 0));
    expect(plane2D[0]).toBeCloseTo(3);
    expect(plane2D[1]).toBeCloseTo(4);
  });

  it("transforms world coordinates to YZ plane", () => {
    const plane2D = worldToPlane(YZ_PLANE, vec3(0, 3, 4));
    expect(plane2D[0]).toBeCloseTo(3);
    expect(plane2D[1]).toBeCloseTo(4);
  });

  it("projects points onto plane", () => {
    // Point not on XY plane
    const plane2D = worldToPlane(XY_PLANE, vec3(3, 4, 5));
    expect(plane2D[0]).toBeCloseTo(3);
    expect(plane2D[1]).toBeCloseTo(4);
  });

  it("is inverse of planeToWorld", () => {
    const x = 7,
      y = 11;
    const world = planeToWorld(XY_PLANE, x, y);
    const back = worldToPlane(XY_PLANE, world);
    expect(back[0]).toBeCloseTo(x);
    expect(back[1]).toBeCloseTo(y);
  });
});
