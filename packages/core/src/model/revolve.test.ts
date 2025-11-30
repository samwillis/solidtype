/**
 * Tests for revolve operation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyModel, getModelStats, getBodyShells, getShellFaces } from '../topo/model.js';
import { createNumericContext } from '../num/tolerance.js';
import {
  revolve,
  createAxisFromDirection,
  createAxisFromPoints,
  X_AXIS_REVOLVE,
  Y_AXIS_REVOLVE,
  Z_AXIS_REVOLVE,
} from './revolve.js';
import { createRectangleProfile, createPolygonProfile } from './sketchProfile.js';
import { YZ_PLANE, ZX_PLANE, createDatumPlaneFromNormal } from './planes.js';
import { vec2 } from '../num/vec2.js';
import { vec3 } from '../num/vec3.js';
import type { TopoModel } from '../topo/model.js';

describe('revolve', () => {
  let model: TopoModel;
  
  beforeEach(() => {
    model = createEmptyModel(createNumericContext());
  });

  describe('full revolution', () => {
    it('revolves a rectangle to create a cylinder-like shape', () => {
      // Profile on YZ plane, offset from Y axis
      const profile = createRectangleProfile(YZ_PLANE, 1, 2, 3, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        // Full revolution by default
      });
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      const stats = getModelStats(model);
      expect(stats.faces).toBeGreaterThan(0);
      expect(stats.bodies).toBe(1);
    });

    it('creates closed shell for full revolution', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
      
      const shells = getBodyShells(model, result.body!);
      expect(shells).toHaveLength(1);
    });

    it('uses 8 segments minimum for full revolution', () => {
      const profile = createRectangleProfile(YZ_PLANE, 0.5, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
      
      // Each profile edge creates segments faces around the revolution
      // For a rectangle (4 edges) with 8 segments: 4 * 8 = 32 side faces
      const shells = getBodyShells(model, result.body!);
      const faces = getShellFaces(model, shells[0]);
      expect(faces.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('partial revolution', () => {
    it('revolves 90 degrees', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        angle: Math.PI / 2, // 90 degrees
      });
      
      expect(result.success).toBe(true);
      
      // Partial revolution should have end caps
      const shells = getBodyShells(model, result.body!);
      const faces = getShellFaces(model, shells[0]);
      // Should have end caps
      expect(faces.length).toBeGreaterThan(0);
    });

    it('revolves 180 degrees', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        angle: Math.PI, // 180 degrees
      });
      
      expect(result.success).toBe(true);
    });

    it('handles negative angle', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        angle: -Math.PI / 2, // -90 degrees
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('custom segments', () => {
    it('uses specified number of segments', () => {
      const profile = createRectangleProfile(YZ_PLANE, 0.5, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        segments: 16,
      });
      
      expect(result.success).toBe(true);
      
      const stats = getModelStats(model);
      // More segments = more faces
      expect(stats.faces).toBeGreaterThan(48);
    });
  });

  describe('different axes', () => {
    it('revolves around X axis', () => {
      // Profile on ZX plane
      const profile = createRectangleProfile(ZX_PLANE, 1, 1, 0, 2);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: X_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
    });

    it('revolves around Z axis', () => {
      // Use a custom plane parallel to XY but offset
      const plane = createDatumPlaneFromNormal('XYoffset', vec3(2, 0, 0), vec3(1, 0, 0));
      const profile = createRectangleProfile(plane, 1, 1, 0, 0.5);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Z_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
    });

    it('revolves around custom axis', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const customAxis = createAxisFromDirection(
        vec3(0, 0, 0),
        vec3(0, 1, 1) // diagonal axis
      );
      const result = revolve(model, profile, {
        operation: 'add',
        axis: customAxis,
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('axis creation helpers', () => {
    it('createAxisFromDirection works', () => {
      const axis = createAxisFromDirection(vec3(1, 2, 3), vec3(0, 0, 1));
      
      expect(axis.origin).toEqual([1, 2, 3]);
      expect(axis.direction).toEqual([0, 0, 1]);
    });

    it('createAxisFromPoints works', () => {
      const axis = createAxisFromPoints(vec3(0, 0, 0), vec3(0, 0, 5));
      
      expect(axis.origin).toEqual([0, 0, 0]);
      expect(axis.direction).toEqual([0, 0, 5]);
    });
  });

  describe('error handling', () => {
    it('fails for empty profile', () => {
      const profile = { id: 0, plane: YZ_PLANE, loops: [] } as any;
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no loops');
    });

    it('fails for zero angle', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        angle: 0,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('too small');
    });

    it('fails for cut without target body', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'cut',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('target body');
    });
  });

  describe('complex profiles', () => {
    it('revolves a triangle', () => {
      // Triangle profile offset from axis
      const vertices = [vec2(2, 0), vec2(3, 0), vec2(2.5, 1)];
      const profile = createPolygonProfile(YZ_PLANE, vertices);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
      
      // Triangle has 3 edges, each creates faces around the revolution
      const stats = getModelStats(model);
      expect(stats.faces).toBeGreaterThanOrEqual(24); // 3 * 8 minimum
    });
  });
});
