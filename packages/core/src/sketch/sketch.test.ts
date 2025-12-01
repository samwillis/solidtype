/**
 * Tests for Sketch Creation and Manipulation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSketch,
  addPoint,
  addFixedPoint,
  addLine,
  addLineByCoords,
  addArc,
  addArcByCoords,
  addCircle,
  addRectangle,
  addTriangle,
  addPolygon,
  setPointPosition,
  setPointFixed,
  removePoint,
  removeEntity,
  cloneSketch,
  getSketchState,
  setSketchState,
  getPointStateIndices,
  sketchToProfile,
  getLineDirection,
  getArcRadius,
  resetSketchIdCounter,
} from './sketch.js';
import {
  getSketchPoint,
  getSketchEntity,
  getAllSketchPoints,
  getAllSketchEntities,
  getFreePoints,
  countBaseDOF,
} from './types.js';
import { XY_PLANE, YZ_PLANE } from '../model/planes.js';

describe('Sketch Creation', () => {
  beforeEach(() => {
    resetSketchIdCounter();
  });

  describe('createSketch', () => {
    it('should create an empty sketch on XY plane', () => {
      const sketch = createSketch(XY_PLANE);
      expect(sketch.id).toBe(0);
      expect(sketch.plane).toBe(XY_PLANE);
      expect(sketch.points.size).toBe(0);
      expect(sketch.entities.size).toBe(0);
    });

    it('should create sketch with name', () => {
      const sketch = createSketch(YZ_PLANE, 'My Sketch');
      expect(sketch.name).toBe('My Sketch');
    });

    it('should generate unique IDs', () => {
      const s1 = createSketch(XY_PLANE);
      const s2 = createSketch(XY_PLANE);
      expect(s1.id).toBe(0);
      expect(s2.id).toBe(1);
    });
  });

  describe('Point Operations', () => {
    it('should add a point with correct position', () => {
      const sketch = createSketch(XY_PLANE);
      const id = addPoint(sketch, 5, 10);
      
      const point = getSketchPoint(sketch, id);
      expect(point).toBeDefined();
      expect(point!.x).toBe(5);
      expect(point!.y).toBe(10);
      expect(point!.fixed).toBe(false);
    });

    it('should add a fixed point', () => {
      const sketch = createSketch(XY_PLANE);
      const id = addFixedPoint(sketch, 1, 2, 'origin');
      
      const point = getSketchPoint(sketch, id);
      expect(point!.fixed).toBe(true);
      expect(point!.name).toBe('origin');
    });

    it('should update point position', () => {
      const sketch = createSketch(XY_PLANE);
      const id = addPoint(sketch, 0, 0);
      
      setPointPosition(sketch, id, 100, 200);
      
      const point = getSketchPoint(sketch, id);
      expect(point!.x).toBe(100);
      expect(point!.y).toBe(200);
    });

    it('should toggle fixed status', () => {
      const sketch = createSketch(XY_PLANE);
      const id = addPoint(sketch, 0, 0);
      
      expect(getSketchPoint(sketch, id)!.fixed).toBe(false);
      
      setPointFixed(sketch, id, true);
      expect(getSketchPoint(sketch, id)!.fixed).toBe(true);
      
      setPointFixed(sketch, id, false);
      expect(getSketchPoint(sketch, id)!.fixed).toBe(false);
    });

    it('should remove point and associated entities', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 10, 10);
      const line = addLine(sketch, p1, p2);
      
      expect(sketch.entities.size).toBe(1);
      
      removePoint(sketch, p1);
      
      expect(sketch.points.has(p1)).toBe(false);
      expect(sketch.entities.has(line)).toBe(false); // Line should be removed too
    });
  });

  describe('Line Operations', () => {
    it('should add a line between points', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 10, 10);
      const line = addLine(sketch, p1, p2);
      
      const entity = getSketchEntity(sketch, line);
      expect(entity).toBeDefined();
      expect(entity!.kind).toBe('line');
      if (entity!.kind === 'line') {
        expect(entity!.start).toBe(p1);
        expect(entity!.end).toBe(p2);
      }
    });

    it('should add line by coordinates', () => {
      const sketch = createSketch(XY_PLANE);
      const result = addLineByCoords(sketch, 0, 0, 5, 5);
      
      expect(sketch.points.size).toBe(2);
      expect(sketch.entities.size).toBe(1);
      
      const start = getSketchPoint(sketch, result.start);
      const end = getSketchPoint(sketch, result.end);
      expect(start!.x).toBe(0);
      expect(start!.y).toBe(0);
      expect(end!.x).toBe(5);
      expect(end!.y).toBe(5);
    });

    it('should add construction line', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 10, 0);
      const line = addLine(sketch, p1, p2, { construction: true });
      
      const entity = getSketchEntity(sketch, line);
      expect(entity!.construction).toBe(true);
    });

    it('should get line direction', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 10, 0);
      const line = addLine(sketch, p1, p2);
      
      const dir = getLineDirection(sketch, line);
      expect(dir).toEqual([10, 0]);
    });
  });

  describe('Arc Operations', () => {
    it('should add an arc', () => {
      const sketch = createSketch(XY_PLANE);
      const center = addPoint(sketch, 0, 0);
      const start = addPoint(sketch, 5, 0);
      const end = addPoint(sketch, 0, 5);
      const arc = addArc(sketch, start, end, center, true);
      
      const entity = getSketchEntity(sketch, arc);
      expect(entity!.kind).toBe('arc');
      if (entity!.kind === 'arc') {
        expect(entity!.start).toBe(start);
        expect(entity!.end).toBe(end);
        expect(entity!.center).toBe(center);
        expect(entity!.ccw).toBe(true);
      }
    });

    it('should add arc by coordinates', () => {
      const sketch = createSketch(XY_PLANE);
      const result = addArcByCoords(sketch, 5, 0, 0, 5, 0, 0);
      
      expect(sketch.points.size).toBe(3);
      expect(sketch.entities.size).toBe(1);
    });

    it('should add a circle', () => {
      const sketch = createSketch(XY_PLANE);
      const result = addCircle(sketch, 5, 5, 3);
      
      // Circle creates center and one point on the circumference
      expect(sketch.points.size).toBe(2);
      expect(sketch.entities.size).toBe(1);
      
      const center = getSketchPoint(sketch, result.center);
      expect(center!.x).toBe(5);
      expect(center!.y).toBe(5);
    });

    it('should get arc radius', () => {
      const sketch = createSketch(XY_PLANE);
      const result = addCircle(sketch, 0, 0, 7);
      
      const radius = getArcRadius(sketch, result.arc);
      expect(radius).toBe(7);
    });
  });

  describe('Entity Removal', () => {
    it('should remove entity without affecting points', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 10, 10);
      const line = addLine(sketch, p1, p2);
      
      removeEntity(sketch, line);
      
      expect(sketch.entities.has(line)).toBe(false);
      expect(sketch.points.has(p1)).toBe(true); // Points remain
      expect(sketch.points.has(p2)).toBe(true);
    });
  });

  describe('Sketch Utilities', () => {
    it('should clone a sketch', () => {
      const sketch = createSketch(XY_PLANE);
      addPoint(sketch, 1, 2);
      addPoint(sketch, 3, 4);
      
      const cloned = cloneSketch(sketch);
      
      expect(cloned.id).toBe(sketch.id);
      expect(cloned.points.size).toBe(sketch.points.size);
      expect(cloned).not.toBe(sketch);
      expect(cloned.points).not.toBe(sketch.points);
    });

    it('should get and set sketch state', () => {
      const sketch = createSketch(XY_PLANE);
      addPoint(sketch, 1, 2);
      addPoint(sketch, 3, 4);
      addFixedPoint(sketch, 0, 0); // Fixed point not in state
      
      const state = getSketchState(sketch);
      expect(state).toEqual([1, 2, 3, 4]); // Only non-fixed points
      
      setSketchState(sketch, [10, 20, 30, 40]);
      
      const newState = getSketchState(sketch);
      expect(newState).toEqual([10, 20, 30, 40]);
    });

    it('should get point state indices', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addFixedPoint(sketch, 0, 0);
      const p3 = addPoint(sketch, 1, 1);
      
      const indices = getPointStateIndices(sketch);
      
      expect(indices.get(p1)).toBe(0);
      expect(indices.has(p2)).toBe(false); // Fixed point not included
      expect(indices.get(p3)).toBe(2);
    });

    it('should count DOF correctly', () => {
      const sketch = createSketch(XY_PLANE);
      addPoint(sketch, 0, 0); // 2 DOF
      addPoint(sketch, 1, 1); // 2 DOF
      addFixedPoint(sketch, 2, 2); // 0 DOF
      
      expect(countBaseDOF(sketch)).toBe(4);
    });

    it('should get all points', () => {
      const sketch = createSketch(XY_PLANE);
      addPoint(sketch, 0, 0);
      addPoint(sketch, 1, 1);
      
      const points = getAllSketchPoints(sketch);
      expect(points.length).toBe(2);
    });

    it('should get all entities', () => {
      const sketch = createSketch(XY_PLANE);
      const p1 = addPoint(sketch, 0, 0);
      const p2 = addPoint(sketch, 1, 1);
      addLine(sketch, p1, p2);
      
      const entities = getAllSketchEntities(sketch);
      expect(entities.length).toBe(1);
    });

    it('should get free points only', () => {
      const sketch = createSketch(XY_PLANE);
      addPoint(sketch, 0, 0);
      addFixedPoint(sketch, 1, 1);
      addPoint(sketch, 2, 2);
      
      const free = getFreePoints(sketch);
      expect(free.length).toBe(2);
      expect(free.every(p => !p.fixed)).toBe(true);
    });
  });

  describe('Shape Helpers', () => {
    it('should add a rectangle', () => {
      const sketch = createSketch(XY_PLANE);
      const rect = addRectangle(sketch, 0, 0, 10, 5);
      
      expect(rect.corners.length).toBe(4);
      expect(rect.sides.length).toBe(4);
      expect(sketch.points.size).toBe(4);
      expect(sketch.entities.size).toBe(4);
      
      // Check corners are at expected positions
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

    it('should add a triangle', () => {
      const sketch = createSketch(XY_PLANE);
      const tri = addTriangle(sketch, 0, 0, 6);
      
      expect(tri.corners.length).toBe(3);
      expect(tri.sides.length).toBe(3);
      expect(sketch.points.size).toBe(3);
      expect(sketch.entities.size).toBe(3);
    });

    it('should add a polygon', () => {
      const sketch = createSketch(XY_PLANE);
      const hex = addPolygon(sketch, 0, 0, 5, 6); // Hexagon
      
      expect(hex.corners.length).toBe(6);
      expect(hex.edges.length).toBe(6);
      expect(sketch.points.size).toBe(6);
      expect(sketch.entities.size).toBe(6);
    });
  });

  describe('Profile Conversion', () => {
    it('should convert a closed rectangle to profile', () => {
      const sketch = createSketch(XY_PLANE);
      addRectangle(sketch, 0, 0, 10, 10);
      
      const profile = sketchToProfile(sketch);
      
      expect(profile).not.toBeNull();
      expect(profile!.loops.length).toBe(1);
      expect(profile!.loops[0].curves.length).toBe(4);
      expect(profile!.loops[0].isOuter).toBe(true);
    });

    it('should exclude construction geometry from profile', () => {
      const sketch = createSketch(XY_PLANE);
      const rect = addRectangle(sketch, 0, 0, 10, 10);
      
      // Add construction line
      const p1 = getSketchPoint(sketch, rect.corners[0])!;
      const p2 = getSketchPoint(sketch, rect.corners[2])!;
      const diagP1 = addPoint(sketch, p1.x, p1.y);
      const diagP2 = addPoint(sketch, p2.x, p2.y);
      addLine(sketch, diagP1, diagP2, { construction: true });
      
      const profile = sketchToProfile(sketch);
      
      // Should only have 4 curves (the rectangle), not the diagonal
      expect(profile!.loops[0].curves.length).toBe(4);
    });

    it('should return null for non-closed sketch', () => {
      const sketch = createSketch(XY_PLANE);
      // Just a single line, not closed
      addLineByCoords(sketch, 0, 0, 10, 10);
      
      const profile = sketchToProfile(sketch);
      
      expect(profile).toBeNull();
    });
  });
});
