/**
 * Tests for the 2D Constraint Solver
 * 
 * Tests each constraint type individually and in combination.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSketch,
  addPoint,
  addFixedPoint,
  addLine,
  addArc,
  addRectangle,
  resetSketchIdCounter,
} from './sketch.js';
import { getSketchPoint } from './types.js';
import { solveSketch, analyzeDOF } from './solver.js';
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
  tangent,
  pointOnLine,
  pointOnArc,
  equalRadius,
  concentric,
  resetConstraintIdCounter,
} from './constraints.js';
import type { Constraint } from './constraints.js';
import { XY_PLANE } from '../model/planes.js';

describe('Sketch Solver', () => {
  beforeEach(() => {
    resetSketchIdCounter();
    resetConstraintIdCounter();
  });

  describe('Basic solving', () => {
    it('should handle empty sketch with no constraints', () => {
      const sketch = createSketch(XY_PLANE);
      const result = solveSketch(sketch, []);
      // Empty sketch with no points has nothing to solve - returns success
      // A sketch with free points but no constraints would be under_constrained
      expect(['success', 'under_constrained']).toContain(result.status);
      expect(result.satisfied).toBe(true);
    });

    it('should handle fully fixed sketch', () => {
      const sketch = createSketch(XY_PLANE);
      addFixedPoint(sketch, 0, 0);
      addFixedPoint(sketch, 1, 1);
      const result = solveSketch(sketch, []);
      expect(result.status).toBe('success');
      expect(result.satisfied).toBe(true);
    });
  });

  describe('Coincident constraint', () => {
    it('should make two points coincide', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 1, 1);
      // Fix p1 to prevent system from being under-constrained
      const p1Fixed = addFixedPoint(sketch, 0, 0);
      
      const constraints: Constraint[] = [
        coincident(p1, p2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(pt1.x, 6);
      expect(pt2.y).toBeCloseTo(pt1.y, 6);
    });

    it('should work with fixed point', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 5, 3);
      const p2 = addPoint(sketch, 0, 0);
      
      const constraints: Constraint[] = [
        coincident(p1, p2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(5, 6);
      expect(pt2.y).toBeCloseTo(3, 6);
    });
  });

  describe('Horizontal constraint', () => {
    it('should make two points horizontal (same Y)', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 0, 5);
      const p2 = addPoint(sketch, 3, 0);
      
      const constraints: Constraint[] = [
        horizontalPoints(p1, p2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.y).toBeCloseTo(pt1.y, 6);
    });

    it('should make a line horizontal', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 0, 2);
      const p2 = addPoint(sketch, 5, 7);
      const line = addLine(sketch, p1, p2);
      
      const constraints: Constraint[] = [
        horizontalLine(line),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.y).toBeCloseTo(pt1.y, 6);
    });
  });

  describe('Vertical constraint', () => {
    it('should make two points vertical (same X)', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 5, 0);
      const p2 = addPoint(sketch, 0, 8);
      
      const constraints: Constraint[] = [
        verticalPoints(p1, p2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(pt1.x, 6);
    });

    it('should make a line vertical', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 3, 0);
      const p2 = addPoint(sketch, 8, 5);
      const line = addLine(sketch, p1, p2);
      
      const constraints: Constraint[] = [
        verticalLine(line),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(pt1.x, 6);
    });
  });

  describe('Distance constraint', () => {
    it('should maintain distance between points', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 1, 0);
      
      const targetDist = 5;
      const constraints: Constraint[] = [
        distance(p1, p2, targetDist),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      const actualDist = Math.sqrt((pt2.x - pt1.x) ** 2 + (pt2.y - pt1.y) ** 2);
      expect(actualDist).toBeCloseTo(targetDist, 6);
    });

    it('should work with horizontal constraint', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 1, 1);
      
      const targetDist = 10;
      const constraints: Constraint[] = [
        distance(p1, p2, targetDist),
        horizontalPoints(p1, p2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt2 = getSketchPoint(sketch, p2)!;
      expect(pt2.x).toBeCloseTo(10, 6);
      expect(pt2.y).toBeCloseTo(0, 6);
    });
  });

  describe('Fixed constraint', () => {
    it('should fix a point to a specific position', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 5, 5);
      
      const constraints: Constraint[] = [
        fixed(p1, [10, 20]),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt1 = getSketchPoint(sketch, p1)!;
      expect(pt1.x).toBeCloseTo(10, 5);
      expect(pt1.y).toBeCloseTo(20, 5);
    });
  });

  describe('Parallel constraint', () => {
    it('should make two lines parallel', () => {
      const sketch = createSketch(XY_PLANE);
      // Line 1: horizontal (fixed)
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addFixedPoint(sketch, 10, 0);
      const line1 = addLine(sketch, p1, p2);
      
      // Line 2: starts at angle
      const p3 = addFixedPoint(sketch, 0, 5);
      const p4 = addPoint(sketch, 5, 8); // Not horizontal yet
      const line2 = addLine(sketch, p3, p4);
      
      const constraints: Constraint[] = [
        parallel(line1, line2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      // Check that the lines are parallel (same direction)
      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      
      // For parallel horizontal lines, y should be the same
      expect(pt4.y).toBeCloseTo(pt3.y, 5);
    });
  });

  describe('Perpendicular constraint', () => {
    it('should make two lines perpendicular', () => {
      const sketch = createSketch(XY_PLANE);
      // Line 1: horizontal
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addFixedPoint(sketch, 10, 0);
      const line1 = addLine(sketch, p1, p2);
      
      // Line 2: starts at angle
      const p3 = addFixedPoint(sketch, 5, 0);
      const p4 = addPoint(sketch, 8, 3);
      const line2 = addLine(sketch, p3, p4);
      
      const constraints: Constraint[] = [
        perpendicular(line1, line2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      // Check that line2 is vertical (perpendicular to horizontal line1)
      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      expect(pt4.x).toBeCloseTo(pt3.x, 5);
    });
  });

  describe('Equal length constraint', () => {
    it('should make two lines equal length', () => {
      const sketch = createSketch(XY_PLANE);
      // Line 1: length 10
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addFixedPoint(sketch, 10, 0);
      const line1 = addLine(sketch, p1, p2);
      
      // Line 2: initially length ~5
      const p3 = addFixedPoint(sketch, 0, 5);
      const p4 = addPoint(sketch, 3, 9);
      const line2 = addLine(sketch, p3, p4);
      
      const constraints: Constraint[] = [
        equalLength(line1, line2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      const len2 = Math.sqrt((pt4.x - pt3.x) ** 2 + (pt4.y - pt3.y) ** 2);
      expect(len2).toBeCloseTo(10, 5);
    });
  });

  describe('Angle constraint', () => {
    it('should maintain angle between lines', () => {
      const sketch = createSketch(XY_PLANE);
      // Line 1: along X axis
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addFixedPoint(sketch, 10, 0);
      const line1 = addLine(sketch, p1, p2);
      
      // Line 2: initially at some angle
      const p3 = addFixedPoint(sketch, 0, 0);
      const p4 = addPoint(sketch, 5, 1);
      const line2 = addLine(sketch, p3, p4);
      
      // Constrain to 45 degrees
      const targetAngle = Math.PI / 4;
      const constraints: Constraint[] = [
        angle(line1, line2, targetAngle),
        distance(p3, p4, 10), // Fix length to prevent degenerate solution
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt3 = getSketchPoint(sketch, p3)!;
      const pt4 = getSketchPoint(sketch, p4)!;
      const actualAngle = Math.atan2(pt4.y - pt3.y, pt4.x - pt3.x);
      expect(actualAngle).toBeCloseTo(targetAngle, 4);
    });
  });

  describe('Point on line constraint', () => {
    it('should constrain a point to lie on a line', () => {
      const sketch = createSketch(XY_PLANE);
      // Line: y = x (diagonal)
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addFixedPoint(sketch, 10, 10);
      const line = addLine(sketch, p1, p2);
      
      // Point initially off the line
      const p3 = addPoint(sketch, 5, 3);
      
      const constraints: Constraint[] = [
        pointOnLine(p3, line),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      // Point should now be on y = x
      const pt3 = getSketchPoint(sketch, p3)!;
      expect(pt3.x).toBeCloseTo(pt3.y, 5);
    });
  });

  describe('Point on arc constraint', () => {
    it('should constrain a point to lie on an arc', () => {
      const sketch = createSketch(XY_PLANE);
      // Arc: center at origin, radius 5
      const center = addFixedPoint(sketch, 0, 0);
      const arcStart = addFixedPoint(sketch, 5, 0);
      const arcEnd = addFixedPoint(sketch, 0, 5);
      const arc = addArc(sketch, arcStart, arcEnd, center);
      
      // Point initially at wrong distance
      const p = addPoint(sketch, 3, 3);
      
      const constraints: Constraint[] = [
        pointOnArc(p, arc),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      // Point should now be at radius 5 from origin
      const pt = getSketchPoint(sketch, p)!;
      const dist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
      expect(dist).toBeCloseTo(5, 5);
    });
  });

  describe('Equal radius constraint', () => {
    it('should make two arcs have equal radius', () => {
      const sketch = createSketch(XY_PLANE);
      // Arc 1: radius 5
      const c1 = addFixedPoint(sketch, 0, 0);
      const s1 = addFixedPoint(sketch, 5, 0);
      const e1 = addFixedPoint(sketch, 0, 5);
      const arc1 = addArc(sketch, s1, e1, c1);
      
      // Arc 2: initially different radius
      const c2 = addFixedPoint(sketch, 10, 0);
      const s2 = addPoint(sketch, 13, 0); // radius 3
      const e2 = addFixedPoint(sketch, 10, 3);
      const arc2 = addArc(sketch, s2, e2, c2);
      
      const constraints: Constraint[] = [
        equalRadius(arc1, arc2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      // Check radii are equal
      const pt_c2 = getSketchPoint(sketch, c2)!;
      const pt_s2 = getSketchPoint(sketch, s2)!;
      const r2 = Math.sqrt((pt_s2.x - pt_c2.x) ** 2 + (pt_s2.y - pt_c2.y) ** 2);
      expect(r2).toBeCloseTo(5, 5);
    });
  });

  describe('Concentric constraint', () => {
    it('should make two arcs share the same center', () => {
      const sketch = createSketch(XY_PLANE);
      // Arc 1
      const c1 = addFixedPoint(sketch, 0, 0);
      const s1 = addFixedPoint(sketch, 5, 0);
      const e1 = addFixedPoint(sketch, 0, 5);
      const arc1 = addArc(sketch, s1, e1, c1);
      
      // Arc 2 with different center
      const c2 = addPoint(sketch, 3, 3);
      const s2 = addFixedPoint(sketch, 6, 3);
      const e2 = addFixedPoint(sketch, 3, 6);
      const arc2 = addArc(sketch, s2, e2, c2);
      
      const constraints: Constraint[] = [
        concentric(arc1, arc2),
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      // Centers should match
      const pt_c1 = getSketchPoint(sketch, c1)!;
      const pt_c2 = getSketchPoint(sketch, c2)!;
      expect(pt_c2.x).toBeCloseTo(pt_c1.x, 5);
      expect(pt_c2.y).toBeCloseTo(pt_c1.y, 5);
    });
  });

  describe('Complex sketches', () => {
    it('should solve a constrained rectangle', () => {
      const sketch = createSketch(XY_PLANE);
      const rect = addRectangle(sketch, 0, 0, 10, 5);
      const [p0, p1, p2, p3] = rect.corners;
      const [l0, l1, l2, l3] = rect.sides;
      
      // Fix one corner
      const constraints: Constraint[] = [
        fixed(p0, [-5, -2.5]),
        horizontalLine(l0),
        horizontalLine(l2),
        verticalLine(l1),
        verticalLine(l3),
        equalLength(l0, l2), // Top and bottom equal
        equalLength(l1, l3), // Left and right equal
        distance(p0, p1, 10), // Width = 10
        distance(p1, p2, 5),  // Height = 5
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      // Verify rectangle properties
      const pt0 = getSketchPoint(sketch, p0)!;
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      const pt3 = getSketchPoint(sketch, p3)!;
      
      // Check corners are at expected positions
      expect(pt0.x).toBeCloseTo(-5, 5);
      expect(pt0.y).toBeCloseTo(-2.5, 5);
      expect(pt1.x).toBeCloseTo(5, 5);
      expect(pt1.y).toBeCloseTo(-2.5, 5);
      expect(pt2.x).toBeCloseTo(5, 5);
      expect(pt2.y).toBeCloseTo(2.5, 5);
      expect(pt3.x).toBeCloseTo(-5, 5);
      expect(pt3.y).toBeCloseTo(2.5, 5);
    });

    it('should solve an isosceles triangle', () => {
      const sketch = createSketch(XY_PLANE);
      
      // Create triangle points
      const p0 = addFixedPoint(sketch, 0, 5); // Top vertex
      const p1 = addPoint(sketch, -3, 0);     // Bottom left
      const p2 = addPoint(sketch, 3, 0);      // Bottom right
      
      const l0 = addLine(sketch, p0, p1);
      const l1 = addLine(sketch, p1, p2);
      const l2 = addLine(sketch, p2, p0);
      
      const constraints: Constraint[] = [
        horizontalLine(l1),           // Base is horizontal
        equalLength(l0, l2),          // Two sides equal (isosceles)
        distance(p1, p2, 6),          // Base length
      ];
      
      const result = solveSketch(sketch, constraints);
      expect(result.status).toBe('success');
      
      const pt0 = getSketchPoint(sketch, p0)!;
      const pt1 = getSketchPoint(sketch, p1)!;
      const pt2 = getSketchPoint(sketch, p2)!;
      
      // Check base is horizontal
      expect(pt1.y).toBeCloseTo(pt2.y, 5);
      
      // Check base length
      const baseLen = Math.sqrt((pt2.x - pt1.x) ** 2 + (pt2.y - pt1.y) ** 2);
      expect(baseLen).toBeCloseTo(6, 5);
      
      // Check isosceles (equal side lengths)
      const len0 = Math.sqrt((pt1.x - pt0.x) ** 2 + (pt1.y - pt0.y) ** 2);
      const len2 = Math.sqrt((pt0.x - pt2.x) ** 2 + (pt0.y - pt2.y) ** 2);
      expect(len0).toBeCloseTo(len2, 5);
    });
  });

  describe('Driven points (interactive dragging)', () => {
    it('should move point toward driven position when unconstrained', () => {
      const sketch = createSketch(XY_PLANE);
      // Single point with no constraints - should move freely to driven position
      const p1 = addPoint(sketch, 0, 0);
      
      const constraints: Constraint[] = [];
      
      // "Drag" p1 to position (10, 5)
      const drivenPoints = new Map([[p1, [10, 5] as [number, number]]]);
      
      const result = solveSketch(sketch, constraints, { 
        drivenPoints,
        maxIterations: 100,
      });
      
      expect(['success', 'converged']).toContain(result.status);
      
      const pt1 = getSketchPoint(sketch, p1)!;
      // Point should move close to the driven position
      expect(pt1.x).toBeCloseTo(10, 3);
      expect(pt1.y).toBeCloseTo(5, 3);
    });

    it('should balance driven position with constraint satisfaction', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addFixedPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 5, 0);
      
      // Horizontal constraint
      const constraints: Constraint[] = [
        horizontalPoints(p1, p2),
      ];
      
      // "Drag" p2 to position (10, 0) - compatible with horizontal constraint
      const drivenPoints = new Map([[p2, [10, 0] as [number, number]]]);
      
      const result = solveSketch(sketch, constraints, { 
        drivenPoints,
        maxIterations: 100,
      });
      
      expect(['success', 'converged']).toContain(result.status);
      
      const pt2 = getSketchPoint(sketch, p2)!;
      // Should satisfy both the constraint and get close to driven position
      expect(pt2.y).toBeCloseTo(0, 4);
      expect(pt2.x).toBeCloseTo(10, 3);
    });
  });

  describe('DOF analysis', () => {
    it('should correctly count DOF for unconstrained sketch', () => {
      const sketch = createSketch(XY_PLANE);
      addPoint(sketch, 0, 0);
      addPoint(sketch, 1, 1);
      
      const analysis = analyzeDOF(sketch, []);
      expect(analysis.totalDOF).toBe(4); // 2 points * 2 DOF each
      expect(analysis.constrainedDOF).toBe(0);
      expect(analysis.remainingDOF).toBe(4);
      expect(analysis.isFullyConstrained).toBe(false);
      expect(analysis.isOverConstrained).toBe(false);
    });

    it('should correctly count DOF for fully constrained sketch', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 1, 1);
      
      const constraints: Constraint[] = [
        fixed(p1, [0, 0]),
        fixed(p2, [1, 1]),
      ];
      
      const analysis = analyzeDOF(sketch, constraints);
      expect(analysis.totalDOF).toBe(4);
      expect(analysis.constrainedDOF).toBe(4); // 2 fixed constraints * 2 equations each
      expect(analysis.remainingDOF).toBe(0);
      expect(analysis.isFullyConstrained).toBe(true);
      expect(analysis.isOverConstrained).toBe(false);
    });

    it('should detect over-constrained sketch', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      
      // 3 constraints for 2 DOF = over-constrained
      const constraints: Constraint[] = [
        fixed(p1, [0, 0]),
        fixed(p1, [1, 1]), // Conflicting!
      ];
      
      const analysis = analyzeDOF(sketch, constraints);
      expect(analysis.totalDOF).toBe(2);
      expect(analysis.constrainedDOF).toBe(4);
      expect(analysis.remainingDOF).toBe(-2);
      expect(analysis.isOverConstrained).toBe(true);
    });
  });
});
