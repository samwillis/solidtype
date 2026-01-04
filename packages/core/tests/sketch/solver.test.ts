/**
 * Tests for the 2D Constraint Solver
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SketchModel } from "../../src/sketch/SketchModel.js";
import { resetAllIds } from "../../src/sketch/idAllocator.js";
import { getSketchPoint } from "../../src/sketch/types.js";
import { solveSketch, analyzeDOF } from "../../src/sketch/solver.js";
import {
  coincident,
  horizontalPoints,
  horizontalLine,
  verticalPoints,
  verticalLine,
  parallel,
  perpendicular,
  equalLength,
  fixed,
  distance,
  angle,
  pointOnLine,
  pointOnArc,
  equalRadius,
  concentric,
  symmetric,
  midpoint,
  arcArcTangent,
  radiusDimension,
  pointToLineDistance,
  resetConstraintIdCounter,
} from "../../src/sketch/constraints.js";
import type { Constraint } from "../../src/sketch/constraints.js";
import { XY_PLANE } from "../../src/model/planes.js";

describe(`Sketch Solver`, () => {
  beforeEach(() => {
    resetAllIds();
    resetConstraintIdCounter();
  });

  describe(`Basic solving`, () => {
    it(`should handle empty sketch with no constraints`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const result = solveSketch(sketch, []);
      expect([`success`, `under_constrained`]).toContain(result.status);
      expect(result.satisfied).toBe(true);
    });

    it(`should handle fully fixed sketch`, () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addFixedPoint(0, 0);
      sketch.addFixedPoint(1, 1);
      const result = solveSketch(sketch, []);
      expect(result.status).toBe(`success`);
      expect(result.satisfied).toBe(true);
    });
  });

  describe(`Coincident constraint`, () => {
    it(`should make two points coincide`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(1, 1);
      sketch.addFixedPoint(0, 0);

      const constraints: Constraint[] = [coincident(p1, p2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(pt1.x, 6);
      expect(pt2.y).toBeCloseTo(pt1.y, 6);
    });

    it(`should work with fixed point`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(5, 3);
      const p2 = sketch.addPoint(0, 0);

      const constraints: Constraint[] = [coincident(p1, p2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(5, 6);
      expect(pt2.y).toBeCloseTo(3, 6);
    });
  });

  describe(`Horizontal constraint`, () => {
    it(`should make two points horizontal (same Y)`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 5);
      const p2 = sketch.addPoint(3, 0);

      const constraints: Constraint[] = [horizontalPoints(p1, p2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.y).toBeCloseTo(pt1.y, 6);
    });

    it(`should make a line horizontal`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 2);
      const p2 = sketch.addPoint(5, 7);
      const line = sketch.addLine(p1, p2);

      const constraints: Constraint[] = [horizontalLine(line)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.y).toBeCloseTo(pt1.y, 6);
    });
  });

  describe(`Vertical constraint`, () => {
    it(`should make two points vertical (same X)`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(5, 0);
      const p2 = sketch.addPoint(0, 8);

      const constraints: Constraint[] = [verticalPoints(p1, p2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(pt1.x, 6);
    });

    it(`should make a line vertical`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(3, 0);
      const p2 = sketch.addPoint(8, 5);
      const line = sketch.addLine(p1, p2);

      const constraints: Constraint[] = [verticalLine(line)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(pt1.x, 6);
    });
  });

  describe(`Distance constraint`, () => {
    it(`should maintain distance between points`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addPoint(1, 0);

      const targetDist = 5;
      const constraints: Constraint[] = [distance(p1, p2, targetDist)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      const actualDist = Math.sqrt((pt2.x - pt1.x) ** 2 + (pt2.y - pt1.y) ** 2);
      expect(actualDist).toBeCloseTo(targetDist, 6);
    });

    it(`should work with horizontal constraint`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addPoint(1, 1);

      const targetDist = 10;
      const constraints: Constraint[] = [distance(p1, p2, targetDist), horizontalPoints(p1, p2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(10, 6);
      expect(pt2.y).toBeCloseTo(0, 6);
    });
  });

  describe(`Fixed constraint`, () => {
    it(`should fix a point to a specific position`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(5, 5);

      const constraints: Constraint[] = [fixed(p1, [10, 20])];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt1 = getSketchPoint(sketch, p1)!;
      expect(pt1.x).toBeCloseTo(10, 5);
      expect(pt1.y).toBeCloseTo(20, 5);
    });
  });

  describe(`Parallel constraint`, () => {
    it(`should make two lines parallel`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addFixedPoint(10, 0);
      const line1 = sketch.addLine(p1, p2);

      const p3 = sketch.addFixedPoint(0, 5);
      const p4 = sketch.addPoint(5, 8);
      const line2 = sketch.addLine(p3, p4);

      const constraints: Constraint[] = [parallel(line1, line2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      expect(pt4.y).toBeCloseTo(pt3.y, 5);
    });
  });

  describe(`Perpendicular constraint`, () => {
    it(`should make two lines perpendicular`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addFixedPoint(10, 0);
      const line1 = sketch.addLine(p1, p2);

      const p3 = sketch.addFixedPoint(5, 0);
      const p4 = sketch.addPoint(8, 3);
      const line2 = sketch.addLine(p3, p4);

      const constraints: Constraint[] = [perpendicular(line1, line2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      expect(pt4.x).toBeCloseTo(pt3.x, 5);
    });
  });

  describe(`Equal length constraint`, () => {
    it(`should make two lines equal length`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addFixedPoint(10, 0);
      const line1 = sketch.addLine(p1, p2);

      const p3 = sketch.addFixedPoint(0, 5);
      const p4 = sketch.addPoint(3, 9);
      const line2 = sketch.addLine(p3, p4);

      const constraints: Constraint[] = [equalLength(line1, line2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      const len2 = Math.sqrt((pt4.x - pt3.x) ** 2 + (pt4.y - pt3.y) ** 2);
      expect(len2).toBeCloseTo(10, 5);
    });
  });

  describe(`Angle constraint`, () => {
    it(`should maintain angle between lines`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addFixedPoint(10, 0);
      const line1 = sketch.addLine(p1, p2);

      const p3 = sketch.addFixedPoint(0, 0);
      const p4 = sketch.addPoint(5, 1);
      const line2 = sketch.addLine(p3, p4);

      const targetAngle = Math.PI / 4;
      const constraints: Constraint[] = [angle(line1, line2, targetAngle), distance(p3, p4, 10)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      const actualAngle = Math.atan2(pt4.y - pt3.y, pt4.x - pt3.x);
      expect(actualAngle).toBeCloseTo(targetAngle, 4);
    });
  });

  describe(`Point on line constraint`, () => {
    it(`should constrain a point to lie on a line`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addFixedPoint(10, 10);
      const line = sketch.addLine(p1, p2);

      const p3 = sketch.addPoint(5, 3);

      const constraints: Constraint[] = [pointOnLine(p3, line)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt3 = getSketchPoint(sketch, p3)!;
      expect(pt3.x).toBeCloseTo(pt3.y, 5);
    });
  });

  describe(`Point on arc constraint`, () => {
    it(`should constrain a point to lie on an arc`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const center = sketch.addFixedPoint(0, 0);
      const arcStart = sketch.addFixedPoint(5, 0);
      const arcEnd = sketch.addFixedPoint(0, 5);
      const arc = sketch.addArc(arcStart, arcEnd, center);

      const p = sketch.addPoint(3, 3);

      const constraints: Constraint[] = [pointOnArc(p, arc)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt = getSketchPoint(sketch, p)!;
      const dist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
      expect(dist).toBeCloseTo(5, 5);
    });
  });

  describe(`Equal radius constraint`, () => {
    it(`should make two arcs have equal radius`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const c1 = sketch.addFixedPoint(0, 0);
      const s1 = sketch.addFixedPoint(5, 0);
      const e1 = sketch.addFixedPoint(0, 5);
      const arc1 = sketch.addArc(s1, e1, c1);

      const c2 = sketch.addFixedPoint(10, 0);
      const s2 = sketch.addPoint(13, 0);
      const e2 = sketch.addFixedPoint(10, 3);
      const arc2 = sketch.addArc(s2, e2, c2);

      const constraints: Constraint[] = [equalRadius(arc1, arc2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt_c2 = getSketchPoint(sketch, c2)!;
      const pt_s2 = getSketchPoint(sketch, s2)!;
      const r2 = Math.sqrt((pt_s2.x - pt_c2.x) ** 2 + (pt_s2.y - pt_c2.y) ** 2);
      expect(r2).toBeCloseTo(5, 5);
    });
  });

  describe(`Concentric constraint`, () => {
    it(`should make two arcs share the same center`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const c1 = sketch.addFixedPoint(0, 0);
      const s1 = sketch.addFixedPoint(5, 0);
      const e1 = sketch.addFixedPoint(0, 5);
      const arc1 = sketch.addArc(s1, e1, c1);

      const c2 = sketch.addPoint(3, 3);
      const s2 = sketch.addFixedPoint(6, 3);
      const e2 = sketch.addFixedPoint(3, 6);
      const arc2 = sketch.addArc(s2, e2, c2);

      const constraints: Constraint[] = [concentric(arc1, arc2)];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt_c1 = getSketchPoint(sketch, c1)!;
      const pt_c2 = getSketchPoint(sketch, c2)!;
      expect(pt_c2.x).toBeCloseTo(pt_c1.x, 5);
      expect(pt_c2.y).toBeCloseTo(pt_c1.y, 5);
    });
  });

  describe(`Complex sketches`, () => {
    it(`should solve a constrained rectangle`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const rect = sketch.addRectangle(0, 0, 10, 5);
      const [p0, p1, p2, p3] = rect.corners;
      const [l0, l1, l2, l3] = rect.sides;

      const constraints: Constraint[] = [
        fixed(p0, [-5, -2.5]),
        horizontalLine(l0),
        horizontalLine(l2),
        verticalLine(l1),
        verticalLine(l3),
        equalLength(l0, l2),
        equalLength(l1, l3),
        distance(p0, p1, 10),
        distance(p1, p2, 5),
      ];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt0 = getSketchPoint(sketch, p0)!;
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      const pt3 = getSketchPoint(sketch, p3)!;

      expect(pt0.x).toBeCloseTo(-5, 5);
      expect(pt0.y).toBeCloseTo(-2.5, 5);
      expect(pt1.x).toBeCloseTo(5, 5);
      expect(pt1.y).toBeCloseTo(-2.5, 5);
      expect(pt2.x).toBeCloseTo(5, 5);
      expect(pt2.y).toBeCloseTo(2.5, 5);
      expect(pt3.x).toBeCloseTo(-5, 5);
      expect(pt3.y).toBeCloseTo(2.5, 5);
    });

    it(`should solve an isosceles triangle`, () => {
      const sketch = new SketchModel(XY_PLANE);

      const p0 = sketch.addFixedPoint(0, 5);
      const p1 = sketch.addPoint(-3, 0);
      const p2 = sketch.addPoint(3, 0);

      const l0 = sketch.addLine(p0, p1);
      const l1 = sketch.addLine(p1, p2);
      const l2 = sketch.addLine(p2, p0);

      const constraints: Constraint[] = [
        horizontalLine(l1),
        equalLength(l0, l2),
        distance(p1, p2, 6),
      ];

      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe(`success`);

      const pt0 = getSketchPoint(sketch, p0)!;
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;

      expect(pt1.y).toBeCloseTo(pt2.y, 5);

      const baseLen = Math.sqrt((pt2.x - pt1.x) ** 2 + (pt2.y - pt1.y) ** 2);
      expect(baseLen).toBeCloseTo(6, 5);

      const len0 = Math.sqrt((pt1.x - pt0.x) ** 2 + (pt1.y - pt0.y) ** 2);
      const len2 = Math.sqrt((pt0.x - pt2.x) ** 2 + (pt0.y - pt2.y) ** 2);
      expect(len0).toBeCloseTo(len2, 5);
    });
  });

  describe(`Driven points (interactive dragging)`, () => {
    it(`should move point toward driven position when unconstrained`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);

      const constraints: Constraint[] = [];
      const drivenPoints = new Map([[p1, [10, 5] as [number, number]]]);

      const result = solveSketch(sketch, constraints, {
        drivenPoints,
        maxIterations: 100,
      });

      expect([`success`, `converged`]).toContain(result.status);

      const pt1 = getSketchPoint(sketch, p1)!;
      expect(pt1.x).toBeCloseTo(10, 3);
      expect(pt1.y).toBeCloseTo(5, 3);
    });

    it(`should balance driven position with constraint satisfaction`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addFixedPoint(0, 0);
      const p2 = sketch.addPoint(5, 0);

      const constraints: Constraint[] = [horizontalPoints(p1, p2)];

      const drivenPoints = new Map([[p2, [10, 0] as [number, number]]]);

      const result = solveSketch(sketch, constraints, {
        drivenPoints,
        maxIterations: 100,
      });

      expect([`success`, `converged`]).toContain(result.status);

      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.y).toBeCloseTo(0, 4);
      expect(pt2.x).toBeCloseTo(10, 3);
    });
  });

  describe(`DOF analysis`, () => {
    it(`should correctly count DOF for unconstrained sketch`, () => {
      const sketch = new SketchModel(XY_PLANE);
      sketch.addPoint(0, 0);
      sketch.addPoint(1, 1);

      const analysis = analyzeDOF(sketch, []);
      expect(analysis.totalDOF).toBe(4);
      expect(analysis.constrainedDOF).toBe(0);
      expect(analysis.remainingDOF).toBe(4);
      expect(analysis.isFullyConstrained).toBe(false);
      expect(analysis.isOverConstrained).toBe(false);
    });

    it(`should correctly count DOF for fully constrained sketch`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(1, 1);

      const constraints: Constraint[] = [fixed(p1, [0, 0]), fixed(p2, [1, 1])];

      const analysis = analyzeDOF(sketch, constraints);
      expect(analysis.totalDOF).toBe(4);
      expect(analysis.constrainedDOF).toBe(4);
      expect(analysis.remainingDOF).toBe(0);
      expect(analysis.isFullyConstrained).toBe(true);
      expect(analysis.isOverConstrained).toBe(false);
    });

    it(`should detect over-constrained sketch`, () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);

      const constraints: Constraint[] = [fixed(p1, [0, 0]), fixed(p1, [1, 1])];

      const analysis = analyzeDOF(sketch, constraints);
      expect(analysis.totalDOF).toBe(2);
      expect(analysis.constrainedDOF).toBe(4);
      expect(analysis.remainingDOF).toBe(-2);
      expect(analysis.isOverConstrained).toBe(true);
    });
  });

  describe(`New constraint types`, () => {
    describe(`symmetric constraint`, () => {
      it(`should make two points symmetric about a vertical line`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const lineStart = sketch.addPoint(5, 0, { fixed: true });
        const lineEnd = sketch.addPoint(5, 10, { fixed: true });
        const symmetryLine = sketch.addLine(lineStart, lineEnd);

        const p1 = sketch.addPoint(0, 5);
        const p2 = sketch.addPoint(8, 5);

        const constraints: Constraint[] = [symmetric(p1, p2, symmetryLine)];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const pt1 = getSketchPoint(sketch, p1)!;
        const pt2 = getSketchPoint(sketch, p2)!;

        const midX = (pt1.x + pt2.x) / 2;
        expect(midX).toBeCloseTo(5, 3);
        expect(pt1.y).toBeCloseTo(pt2.y, 3);
      });

      it(`should make two points symmetric about a horizontal line`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const lineStart = sketch.addPoint(0, 5, { fixed: true });
        const lineEnd = sketch.addPoint(10, 5, { fixed: true });
        const symmetryLine = sketch.addLine(lineStart, lineEnd);

        const p1 = sketch.addPoint(5, 0);
        const p2 = sketch.addPoint(5, 8);

        const constraints: Constraint[] = [symmetric(p1, p2, symmetryLine)];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const pt1 = getSketchPoint(sketch, p1)!;
        const pt2 = getSketchPoint(sketch, p2)!;

        const midY = (pt1.y + pt2.y) / 2;
        expect(midY).toBeCloseTo(5, 3);
        expect(pt1.x).toBeCloseTo(pt2.x, 3);
      });
    });

    describe(`midpoint constraint`, () => {
      it(`should place a point at the midpoint of a line`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const lineStart = sketch.addPoint(0, 0, { fixed: true });
        const lineEnd = sketch.addPoint(10, 0, { fixed: true });
        const line = sketch.addLine(lineStart, lineEnd);

        const p = sketch.addPoint(3, 3);

        const constraints: Constraint[] = [midpoint(p, line)];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const pt = getSketchPoint(sketch, p)!;
        expect(pt.x).toBeCloseTo(5, 4);
        expect(pt.y).toBeCloseTo(0, 4);
      });

      it(`should work with moving line endpoints`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const lineStart = sketch.addPoint(0, 0, { fixed: true });
        const lineEnd = sketch.addPoint(8, 8);
        const line = sketch.addLine(lineStart, lineEnd);

        const p = sketch.addPoint(0, 0);

        const constraints: Constraint[] = [midpoint(p, line), distance(lineStart, lineEnd, 10)];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const pt = getSketchPoint(sketch, p)!;
        const ptStart = getSketchPoint(sketch, lineStart)!;
        const ptEnd = getSketchPoint(sketch, lineEnd)!;

        expect(pt.x).toBeCloseTo((ptStart.x + ptEnd.x) / 2, 4);
        expect(pt.y).toBeCloseTo((ptStart.y + ptEnd.y) / 2, 4);
      });
    });

    describe(`arcArcTangent constraint`, () => {
      it(`should make two arcs externally tangent with fixed centers`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const c1 = sketch.addPoint(0, 0, { fixed: true });
        const s1 = sketch.addPoint(5, 0, { fixed: true });
        const arc1 = sketch.addArc(s1, s1, c1);

        const c2 = sketch.addPoint(12, 0, { fixed: true });
        const s2 = sketch.addPoint(19, 0, { fixed: true });
        const arc2 = sketch.addArc(s2, s2, c2);

        const r1 = 5;
        const r2 = 7;
        const centerDist = 12;
        expect(r1 + r2).toBe(centerDist);

        const constraints: Constraint[] = [arcArcTangent(arc1, arc2, false)];

        const result = solveSketch(sketch, constraints, { maxIterations: 10 });
        expect(result.status).toBe(`success`);
        expect(result.residual).toBeLessThan(1e-6);
      });

      it(`should make two arcs internally tangent with fixed centers`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const c1 = sketch.addPoint(0, 0, { fixed: true });
        const s1 = sketch.addPoint(10, 0);
        const arc1 = sketch.addArc(s1, s1, c1);

        const c2 = sketch.addPoint(5, 0, { fixed: true });
        const s2 = sketch.addPoint(10, 0);
        const arc2 = sketch.addArc(s2, s2, c2);

        const constraints: Constraint[] = [
          distance(c1, s1, 10),
          horizontalPoints(c1, s1),
          horizontalPoints(c2, s2),
          arcArcTangent(arc1, arc2, true),
        ];

        const result = solveSketch(sketch, constraints, { maxIterations: 200 });
        expect([`success`, `converged`]).toContain(result.status);

        const ptC1 = getSketchPoint(sketch, c1)!;
        const ptS1 = getSketchPoint(sketch, s1)!;
        const ptC2 = getSketchPoint(sketch, c2)!;
        const ptS2 = getSketchPoint(sketch, s2)!;

        const r1 = Math.sqrt((ptS1.x - ptC1.x) ** 2 + (ptS1.y - ptC1.y) ** 2);
        const r2 = Math.sqrt((ptS2.x - ptC2.x) ** 2 + (ptS2.y - ptC2.y) ** 2);

        expect(r1).toBeCloseTo(10, 3);
        expect(Math.abs(r1 - r2)).toBeCloseTo(5, 3);
      });

      it(`should adjust radius to achieve external tangency`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const c1 = sketch.addPoint(0, 0, { fixed: true });
        const s1 = sketch.addPoint(5, 0, { fixed: true });
        const arc1 = sketch.addArc(s1, s1, c1);

        const c2 = sketch.addPoint(12, 0, { fixed: true });
        const s2 = sketch.addPoint(17, 0);
        const arc2 = sketch.addArc(s2, s2, c2);

        const constraints: Constraint[] = [
          horizontalPoints(c2, s2),
          arcArcTangent(arc1, arc2, false),
        ];

        const result = solveSketch(sketch, constraints, { maxIterations: 200 });
        expect([`success`, `converged`]).toContain(result.status);

        const ptS2 = getSketchPoint(sketch, s2)!;
        expect(ptS2.x).toBeCloseTo(19, 2);
      });
    });

    describe(`radiusDimension constraint`, () => {
      it(`should set arc radius to specific value`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const center = sketch.addPoint(0, 0, { fixed: true });
        const start = sketch.addPoint(5, 0);
        const arc = sketch.addArc(start, center, center);

        const constraints: Constraint[] = [radiusDimension(arc, 10)];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const ptCenter = getSketchPoint(sketch, center)!;
        const ptStart = getSketchPoint(sketch, start)!;

        const radius = Math.sqrt((ptStart.x - ptCenter.x) ** 2 + (ptStart.y - ptCenter.y) ** 2);
        expect(radius).toBeCloseTo(10, 4);
      });

      it(`should work with combined constraints`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const center = sketch.addPoint(0, 0, { fixed: true });
        const start = sketch.addPoint(5, 5);
        const arc = sketch.addArc(start, center, center);

        const constraints: Constraint[] = [
          radiusDimension(arc, 8),
          horizontalPoints(center, start),
        ];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const ptStart = getSketchPoint(sketch, start)!;

        expect(ptStart.y).toBeCloseTo(0, 4);
        expect(Math.abs(ptStart.x)).toBeCloseTo(8, 4);
      });
    });

    describe(`pointToLineDistance constraint`, () => {
      it(`should constrain point distance to a fixed line`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const lineStart = sketch.addPoint(0, 0, { fixed: true });
        const lineEnd = sketch.addPoint(10, 0, { fixed: true });
        const line = sketch.addLine(lineStart, lineEnd);

        const p = sketch.addPoint(5, 3);

        const constraints: Constraint[] = [pointToLineDistance(p, line, 5)];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const pt = getSketchPoint(sketch, p)!;
        expect(Math.abs(pt.y)).toBeCloseTo(5, 4);
      });

      it(`should work with vertical line`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const lineStart = sketch.addPoint(0, 0, { fixed: true });
        const lineEnd = sketch.addPoint(0, 10, { fixed: true });
        const line = sketch.addLine(lineStart, lineEnd);

        const p = sketch.addPoint(5, 5);

        const constraints: Constraint[] = [pointToLineDistance(p, line, 3)];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const pt = getSketchPoint(sketch, p)!;
        expect(Math.abs(pt.x)).toBeCloseTo(3, 4);
      });

      it(`should work with combined constraints`, () => {
        const sketch = new SketchModel(XY_PLANE);
        const lineStart = sketch.addPoint(0, 0, { fixed: true });
        const lineEnd = sketch.addPoint(10, 0, { fixed: true });
        const line = sketch.addLine(lineStart, lineEnd);

        const p = sketch.addPoint(3, 1);

        const constraints: Constraint[] = [
          pointToLineDistance(p, line, 4),
          verticalPoints(lineStart, p),
        ];

        const result = solveSketch(sketch, constraints);
        expect([`success`, `converged`]).toContain(result.status);

        const pt = getSketchPoint(sketch, p)!;
        expect(pt.x).toBeCloseTo(0, 4);
        expect(Math.abs(pt.y)).toBeCloseTo(4, 4);
      });
    });
  });
});
