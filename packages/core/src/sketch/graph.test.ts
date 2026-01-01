/**
 * Tests for Constraint Graph & Partitioning
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SketchModel } from "./SketchModel.js";
import { resetAllIds } from "./idAllocator.js";
import { XY_PLANE } from "../model/planes.js";
import { coincident, horizontalPoints, verticalPoints, distance, fixed } from "./constraints.js";
import {
  buildConstraintGraph,
  findConnectedComponents,
  analyzeComponentDOF,
  detectConflicts,
  analyzeConstraintGraph,
  partitionForSolving,
  canSolve,
} from "./graph.js";

describe("Constraint Graph", () => {
  beforeEach(() => {
    resetAllIds();
  });

  describe("buildConstraintGraph", () => {
    it("should create nodes for all points", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const p3 = sketch.addPoint(10, 10);

      const nodes = buildConstraintGraph(sketch, []);

      expect(nodes.size).toBe(3);
      expect(nodes.has(p1)).toBe(true);
      expect(nodes.has(p2)).toBe(true);
      expect(nodes.has(p3)).toBe(true);
    });

    it("should create edges between constrained points", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);

      const constraints = [coincident(p1, p2)];
      const nodes = buildConstraintGraph(sketch, constraints);

      const node1 = nodes.get(p1)!;
      const node2 = nodes.get(p2)!;

      expect(node1.neighbors.has(p2)).toBe(true);
      expect(node2.neighbors.has(p1)).toBe(true);
    });

    it("should mark fixed points", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0, { fixed: true });
      const p2 = sketch.addPoint(10, 0);

      const nodes = buildConstraintGraph(sketch, []);

      expect(nodes.get(p1)!.fixed).toBe(true);
      expect(nodes.get(p2)!.fixed).toBe(false);
    });
  });

  describe("findConnectedComponents", () => {
    it("should find single component when all points are connected", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const p3 = sketch.addPoint(10, 10);

      const constraints = [coincident(p1, p2), coincident(p2, p3)];

      const nodes = buildConstraintGraph(sketch, constraints);
      const components = findConnectedComponents(nodes);

      expect(components.length).toBe(1);
      expect(components[0].length).toBe(3);
    });

    it("should find multiple components when points are not connected", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const p3 = sketch.addPoint(20, 0);
      const p4 = sketch.addPoint(30, 0);

      const constraints = [coincident(p1, p2), coincident(p3, p4)];

      const nodes = buildConstraintGraph(sketch, constraints);
      const components = findConnectedComponents(nodes);

      expect(components.length).toBe(2);
      expect(components[0].length).toBe(2);
      expect(components[1].length).toBe(2);
    });

    it("should handle isolated points", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      sketch.addPoint(20, 0); // Isolated

      const constraints = [coincident(p1, p2)];

      const nodes = buildConstraintGraph(sketch, constraints);
      const components = findConnectedComponents(nodes);

      expect(components.length).toBe(2);
    });
  });

  describe("analyzeComponentDOF", () => {
    it("should calculate base DOF correctly", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);

      const component = analyzeComponentDOF(sketch, [p1, p2], []);

      expect(component.baseDOF).toBe(4);
    });

    it("should not count fixed points in base DOF", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0, { fixed: true });
      const p2 = sketch.addPoint(10, 0);

      const component = analyzeComponentDOF(sketch, [p1, p2], []);

      expect(component.baseDOF).toBe(2);
    });

    it("should detect under-constrained component", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);

      const constraints = [horizontalPoints(p1, p2)];
      const component = analyzeComponentDOF(sketch, [p1, p2], constraints);

      expect(component.isUnderConstrained).toBe(true);
      expect(component.remainingDOF).toBe(3);
    });

    it("should detect fully constrained component", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0, { fixed: true });
      const p2 = sketch.addPoint(10, 0);

      const constraints = [horizontalPoints(p1, p2), distance(p1, p2, 10)];
      const component = analyzeComponentDOF(sketch, [p1, p2], constraints);

      expect(component.isFullyConstrained).toBe(true);
      expect(component.remainingDOF).toBe(0);
    });

    it("should detect over-constrained component", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0, { fixed: true });
      const p2 = sketch.addPoint(10, 0);

      const constraints = [horizontalPoints(p1, p2), verticalPoints(p1, p2), distance(p1, p2, 10)];
      const component = analyzeComponentDOF(sketch, [p1, p2], constraints);

      expect(component.isOverConstrained).toBe(true);
      expect(component.remainingDOF).toBeLessThan(0);
    });
  });

  describe("detectConflicts", () => {
    it("should detect conflicting fixed constraints", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);

      const constraints = [fixed(p1, [0, 0]), fixed(p1, [10, 10])];

      const conflicts = detectConflicts(sketch, constraints);

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].message).toContain("Conflicting fixed positions");
    });

    it("should detect conflicting distance constraints", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);

      const constraints = [distance(p1, p2, 10), distance(p1, p2, 20)];

      const conflicts = detectConflicts(sketch, constraints);

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].message).toContain("Conflicting distance");
    });

    it("should not flag identical fixed constraints", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);

      const constraints = [fixed(p1, [10, 20]), fixed(p1, [10, 20])];

      const conflicts = detectConflicts(sketch, constraints);

      expect(conflicts.length).toBe(0);
    });
  });

  describe("analyzeConstraintGraph", () => {
    it("should return complete analysis", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      sketch.addPoint(20, 0);

      const constraints = [coincident(p1, p2), horizontalPoints(p1, p2)];

      const analysis = analyzeConstraintGraph(sketch, constraints);

      expect(analysis.nodes.size).toBe(3);
      expect(analysis.components.length).toBe(2);
      expect(analysis.globalDOF.total).toBe(6);
      expect(analysis.globalDOF.constrained).toBe(3);
    });
  });

  describe("partitionForSolving", () => {
    it("should create separate partitions for disconnected components", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const p3 = sketch.addPoint(20, 0);
      const p4 = sketch.addPoint(30, 0);

      const constraints = [coincident(p1, p2), coincident(p3, p4)];

      const partitions = partitionForSolving(sketch, constraints);

      expect(partitions.length).toBe(2);
    });

    it("should include only relevant constraints in each partition", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const p3 = sketch.addPoint(20, 0);

      const c1 = coincident(p1, p2);
      const c2 = fixed(p3, 20, 0);

      const partitions = partitionForSolving(sketch, [c1, c2]);

      const partition12 = partitions.find(
        (p) => p.sketch.points.has(p1) && p.sketch.points.has(p2)
      );

      expect(partition12).toBeDefined();
      expect(partition12!.constraints).toHaveLength(1);
      expect(partition12!.constraints[0]).toBe(c1);
    });
  });

  describe("canSolve", () => {
    it("should return solvable for valid sketch", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0, { fixed: true });
      const p2 = sketch.addPoint(10, 0);

      const constraints = [horizontalPoints(p1, p2), distance(p1, p2, 10)];

      const result = canSolve(sketch, constraints);

      expect(result.solvable).toBe(true);
    });

    it("should return not solvable for conflicting constraints", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0);

      const constraints = [fixed(p1, [0, 0]), fixed(p1, [10, 10])];

      const result = canSolve(sketch, constraints);

      expect(result.solvable).toBe(false);
      expect(result.message).toMatch(/conflict|over-constrained/i);
    });

    it("should return not solvable for over-constrained sketch", () => {
      const sketch = new SketchModel(XY_PLANE);
      const p1 = sketch.addPoint(0, 0, { fixed: true });
      const p2 = sketch.addPoint(10, 0);

      const constraints = [
        fixed(p2, 10, 0),
        horizontalPoints(p1, p2),
        verticalPoints(p1, p2),
        distance(p1, p2, 10),
      ];

      const result = canSolve(sketch, constraints);

      expect(result.solvable).toBe(false);
      expect(result.message).toContain("over-constrained");
    });
  });
});
