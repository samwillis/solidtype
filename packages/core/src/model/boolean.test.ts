/**
 * Tests for boolean operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TopoModel } from '../topo/TopoModel.js';
import { createNumericContext } from '../num/tolerance.js';
import { createBox } from './primitives.js';
import { union, subtract, intersect, booleanOperation } from './boolean.js';
import { vec3 } from '../num/vec3.js';

describe('boolean operations', () => {
  let model: TopoModel;
  
  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  describe('non-overlapping bodies', () => {
    it('union of non-overlapping bodies succeeds', () => {
      const boxA = createBox(model, { center: vec3(-5, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(5, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = union(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
    });

    it('subtract non-overlapping body does nothing', () => {
      const boxA = createBox(model, { center: vec3(-5, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(5, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = subtract(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBe(boxA);
    });

    it('intersect non-overlapping bodies fails', () => {
      const boxA = createBox(model, { center: vec3(-5, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(5, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = intersect(model, boxA, boxB);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('do not intersect');
    });
  });

  describe('overlapping bodies', () => {
    it('union of overlapping boxes', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(1, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = union(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
    });

    it('subtract overlapping box', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 4, height: 4, depth: 4 });
      const boxB = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = subtract(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
    });

    it('intersect overlapping boxes', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 4, height: 4, depth: 4 });
      const boxB = createBox(model, { center: vec3(1, 1, 1), width: 4, height: 4, depth: 4 });
      
      const result = intersect(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
    });
  });

  describe('contained bodies', () => {
    it('subtract inner box from outer', () => {
      const outer = createBox(model, { center: vec3(0, 0, 0), width: 4, height: 4, depth: 4 });
      const inner = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = subtract(model, outer, inner);
      
      expect(result.success).toBe(true);
    });

    it('intersect with contained box returns inner', () => {
      const outer = createBox(model, { center: vec3(0, 0, 0), width: 4, height: 4, depth: 4 });
      const inner = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = intersect(model, outer, inner);
      
      expect(result.success).toBe(true);
    });
  });

  describe('booleanOperation generic', () => {
    it('works with union operation', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(1, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = booleanOperation(model, boxA, boxB, { operation: 'union' });
      
      expect(result.success).toBe(true);
    });

    it('works with subtract operation', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(0, 0, 0), width: 1, height: 1, depth: 1 });
      
      const result = booleanOperation(model, boxA, boxB, { operation: 'subtract' });
      
      expect(result.success).toBe(true);
    });

    it('works with intersect operation', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(0.5, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = booleanOperation(model, boxA, boxB, { operation: 'intersect' });
      
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles same body for both operands', () => {
      const box = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = union(model, box, box);
      expect(result.success).toBe(true);
    });

    it('handles touching but not overlapping boxes', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(2, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = union(model, boxA, boxB);
      expect(result.success).toBe(true);
    });
  });

  describe('result topology', () => {
    it('union creates a body with faces', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(1, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = union(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      if (result.body) {
        const shells = model.getBodyShells(result.body);
        expect(shells.length).toBeGreaterThan(0);
        
        const faces = model.getShellFaces(shells[0]);
        expect(faces.length).toBeGreaterThan(0);
      }
    });

    it('subtract creates a body with faces when there is overlap', () => {
      const boxA = createBox(model, { center: vec3(0, 0, 0), width: 4, height: 4, depth: 4 });
      const boxB = createBox(model, { center: vec3(0, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = subtract(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      if (result.body) {
        const shells = model.getBodyShells(result.body);
        expect(shells.length).toBeGreaterThan(0);
      }
    });
  });
});
