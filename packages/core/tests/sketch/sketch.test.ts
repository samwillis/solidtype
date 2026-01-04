/**
 * Tests for Sketch Creation and Manipulation (SketchModel class)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SketchModel } from "../../src/sketch/SketchModel.js";
import { resetAllIds } from "../../src/sketch/idAllocator.js";
import {
  getSketchPoint,
  getSketchEntity,
  getAllSketchPoints,
  getAllSketchEntities,
  getFreePoints,
  countBaseDOF,
} from "../../src/sketch/types.js";
import { XY_PLANE, YZ_PLANE } from "../../src/model/planes.js";
import { curveLength2D } from "../../src/geom/curve2d.js";

describe("Sketch Creation", () => {
  beforeEach(() => {
    resetAllIds();
  });

  describe("constructor", () => {
    it("should create an empty sketch on XY plane", () => {
      const sketch = new SketchModel(XY_PLANE);
      expect(sketch.id).toBe(0);
      expect(sketch.plane).toBe(XY_PLANE);
      expect(sketch.points.size).toBe(0);
      expect(sketch.entities.size).toBe(0);
    });

    it("should create sketch with name", () => {
      const sketch = new SketchModel(YZ_PLANE, "My Sketch");
      expect(sketch.name).toBe("My Sketch");
    });

    it("should generate unique IDs", () => {
      const s1 = new SketchModel(XY_PLANE);
      const s2 = new SketchModel(XY_PLANE);
      expect(s1.id).toBe(0);
      expect(s2.id).toBe(1);
    });
  });

  describe("Point Operations", () => {
    it("should add a point with correct position", () => {
      const sketch = new SketchModel(XY_PLANE);
      const id = sketch.addPoint(5, 10);

      const point = getSketchPoint(sketch, id);
      expect(point).toBeDefined();
      expect(point!.x).toBe(5);
      expect(point!.y).toBe(10);
      expect(point!.fixed).toBe(false);
    });

    it("should add a fixed point", () => {
      const sketch = new SketchModel(XY_PLANE);
      const id = sketch.addFixedPoint(1, 2, "origin");

      const point = getSketchPoint(sketch, id);
      expect(point!.fixed).toBe(true);
      expect(point!.name).toBe("origin");
    });

    it("should update point position", () => {
      const sketch = new SketchModel(XY_PLANE);
      const id = sketch.addPoint(0, 0);

      sketch.setPointPosition(id, 100, 200);

      const point = getSketchPoint(sketch, id);
      expect(point!.x).toBe(100);
      expect(point!.y).toBe(200);
    });

    it("should toggle fixed status", () => {
      const sketch = new SketchModel(XY_PLANE);
      const id = sketch.addPoint(0, 0);

      expect(getSketchPoint(sketch, id)!.fixed).toBe(false);

      sketch.setPointFixed(id, true);
      expect(getSketchPoint(sketch, id)!.fixed).toBe(true);

      sketch.setPointFixed(id, false);
      expect(getSketchPoint(sketch, id)!.fixed).toBe(false);
    });

    it("should remove point and associated entities", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 10);
      const line = sketch.addLine(p1, p2);

      expect(sketch.entities.size).toBe(1);

      sketch.removePoint(p1);

      expect(sketch.points.has(p1)).toBe(false);
      expect(sketch.entities.has(line)).toBe(false);
    });
  });

  describe("Line Operations", () => {
    it("should add a line between points", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 10);
      const line = sketch.addLine(p1, p2);

      const entity = getSketchEntity(sketch, line);
      expect(entity).toBeDefined();
      expect(entity!.kind).toBe("line");
      if (entity!.kind === "line") {
        expect(entity!.start).toBe(p1);
        expect(entity!.end).toBe(p2);
      }
    });

    it("should add line by coordinates", () => {
      const sketch = new SketchModel(XY_PLANE);
      const result = sketch.addLineByCoords(0, 0, 5, 5);

      expect(sketch.points.size).toBe(2);
      expect(sketch.entities.size).toBe(1);

      const start = getSketchPoint(sketch, result.start);
      const end = getSketchPoint(sketch, result.end);
      expect(start!.x).toBe(0);
      expect(start!.y).toBe(0);
      expect(end!.x).toBe(5);
      expect(end!.y).toBe(5);
    });

    it("should add construction line", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const line = sketch.addLine(p1, p2, { construction: true });

      const entity = getSketchEntity(sketch, line);
      expect(entity!.construction).toBe(true);
    });

    it("should get line direction", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const line = sketch.addLine(p1, p2);

      const dir = sketch.getLineDirection(line);
      expect(dir).toEqual([10, 0]);
    });
  });

  describe("Arc Operations", () => {
    it("should add an arc", () => {
      const sketch = new SketchModel(XY_PLANE);
      const center = sketch.addPoint(0, 0);
      const start = sketch.addPoint(5, 0);
      const end = sketch.addPoint(0, 5);
      const arc = sketch.addArc(start, end, center, true);

      const entity = getSketchEntity(sketch, arc);
      expect(entity!.kind).toBe("arc");
      if (entity!.kind === "arc") {
        expect(entity!.start).toBe(start);
        expect(entity!.end).toBe(end);
        expect(entity!.center).toBe(center);
        expect(entity!.ccw).toBe(true);
      }
    });

    it("should add arc by coordinates", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addArcByCoords(5, 0, 0, 5, 0, 0);

      expect(sketch.points.size).toBe(3);
      expect(sketch.entities.size).toBe(1);
    });

    it("should add a circle", () => {
      const sketch = new SketchModel(XY_PLANE);
      const result = sketch.addCircle(5, 5, 3);

      expect(sketch.points.size).toBe(2);
      expect(sketch.entities.size).toBe(1);

      const center = getSketchPoint(sketch, result.center);
      expect(center!.x).toBe(5);
      expect(center!.y).toBe(5);
    });

    it("should get arc radius", () => {
      const sketch = new SketchModel(XY_PLANE);
      const result = sketch.addCircle(0, 0, 7);

      const radius = sketch.getArcRadius(result.arc);
      expect(radius).toBe(7);
    });
  });

  describe("Entity Removal", () => {
    it("should remove entity without affecting points", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 10);
      const line = sketch.addLine(p1, p2);

      sketch.removeEntity(line);

      expect(sketch.entities.has(line)).toBe(false);
      expect(sketch.points.has(p1)).toBe(true);
      expect(sketch.points.has(p2)).toBe(true);
    });
  });

  describe("Sketch Utilities", () => {
    it("should clone a sketch", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addPoint(1, 2);
      sketch.addPoint(3, 4);

      const cloned = sketch.clone();

      expect(cloned.id).toBe(sketch.id);
      expect(cloned.points.size).toBe(sketch.points.size);
      expect(cloned).not.toBe(sketch);
      expect(cloned.points).not.toBe(sketch.points);
    });

    it("should get and set sketch state", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addPoint(1, 2);
      sketch.addPoint(3, 4);
      sketch.addFixedPoint(0, 0);

      const state = sketch.getState();
      expect(state).toEqual([1, 2, 3, 4]);

      sketch.setState([10, 20, 30, 40]);

      const newState = sketch.getState();
      expect(newState).toEqual([10, 20, 30, 40]);
    });

    it("should get point state indices", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addFixedPoint(0, 0);
      const p3 = sketch.addPoint(1, 1);

      const indices = sketch.getPointStateIndices();

      expect(indices.get(p1)).toBe(0);
      expect(indices.has(p2)).toBe(false);
      expect(indices.get(p3)).toBe(2);
    });

    it("should count DOF correctly", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addPoint(0, 0);
      sketch.addPoint(1, 1);
      sketch.addFixedPoint(2, 2);

      expect(countBaseDOF(sketch)).toBe(4);
    });

    it("should get all points", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addPoint(0, 0);
      sketch.addPoint(1, 1);

      const points = getAllSketchPoints(sketch);
      expect(points.length).toBe(2);
    });

    it("should get all entities", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(1, 1);
      sketch.addLine(p1, p2);

      const entities = getAllSketchEntities(sketch);
      expect(entities.length).toBe(1);
    });

    it("should get free points only", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addPoint(0, 0);
      sketch.addFixedPoint(1, 1);
      sketch.addPoint(2, 2);

      const free = getFreePoints(sketch);
      expect(free.length).toBe(2);
      expect(free.every((p) => !p.fixed)).toBe(true);
    });
  });

  describe("Shape Helpers", () => {
    it("should add a rectangle", () => {
      const sketch = new SketchModel(XY_PLANE);
      const rect = sketch.addRectangle(0, 0, 10, 5);

      expect(rect.corners.length).toBe(4);
      expect(rect.sides.length).toBe(4);
      expect(sketch.points.size).toBe(4);
      expect(sketch.entities.size).toBe(4);

      const c0 = getSketchPoint(sketch, rect.corners[0])!;
      const c1 = getSketchPoint(sketch, rect.corners[1])!;
      const c2 = getSketchPoint(sketch, rect.corners[2])!;
      const c3 = getSketchPoint(sketch, rect.corners[3])!;

      expect(c0.x).toBe(-5);
      expect(c0.y).toBe(-2.5);
      expect(c1.x).toBe(5);
      expect(c1.y).toBe(-2.5);
      expect(c2.x).toBe(5);
      expect(c2.y).toBe(2.5);
      expect(c3.x).toBe(-5);
      expect(c3.y).toBe(2.5);
    });

    it("should add a triangle", () => {
      const sketch = new SketchModel(XY_PLANE);
      const tri = sketch.addTriangle(0, 0, 6);

      expect(tri.corners.length).toBe(3);
      expect(tri.sides.length).toBe(3);
      expect(sketch.points.size).toBe(3);
      expect(sketch.entities.size).toBe(3);
    });

    it("should add a polygon", () => {
      const sketch = new SketchModel(XY_PLANE);
      const hex = sketch.addPolygon(0, 0, 5, 6);

      expect(hex.corners.length).toBe(6);
      expect(hex.edges.length).toBe(6);
      expect(sketch.points.size).toBe(6);
      expect(sketch.entities.size).toBe(6);
    });
  });

  describe("Profile Conversion", () => {
    it("should convert a closed rectangle to profile", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addRectangle(0, 0, 10, 10);

      const profile = sketch.toProfile();

      expect(profile).not.toBeNull();
      expect(profile!.loops.length).toBe(1);
      expect(profile!.loops[0].curves.length).toBe(4);
      expect(profile!.loops[0].isOuter).toBe(true);
    });

    it("should exclude construction geometry from profile", () => {
      const sketch = new SketchModel(XY_PLANE);
      const rect = sketch.addRectangle(0, 0, 10, 10);

      const p1 = getSketchPoint(sketch, rect.corners[0])!;
      const p2 = getSketchPoint(sketch, rect.corners[2])!;
      const diagP1 = sketch.addPoint(p1.x, p1.y);
      const diagP2 = sketch.addPoint(p2.x, p2.y);
      sketch.addLine(diagP1, diagP2, { construction: true });

      const profile = sketch.toProfile();

      expect(profile!.loops[0].curves.length).toBe(4);
    });

    it("should return null for non-closed sketch", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addLineByCoords(0, 0, 10, 10);

      const profile = sketch.toProfile();

      expect(profile).toBeNull();
    });

    it("should convert a full circle to a single arc with 2π span", () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addCircle(0, 0, 5);
      const profile = sketch.toProfile();

      expect(profile).not.toBeNull();
      expect(profile!.loops.length).toBe(1);
      expect(profile!.loops[0].curves.length).toBe(1);

      const curve = profile!.loops[0].curves[0];
      expect(curve.kind).toBe("arc");
      expect(curveLength2D(curve)).toBeCloseTo(2 * Math.PI * 5, 6);
    });
  });
});
