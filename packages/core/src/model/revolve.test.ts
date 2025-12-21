/**
 * Tests for revolve operation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TopoModel } from '../topo/TopoModel.js';
import { createNumericContext } from '../num/tolerance.js';
import {
  revolve,
  createAxisFromDirection,
  createAxisFromPoints,
  X_AXIS_REVOLVE,
  Y_AXIS_REVOLVE,
  Z_AXIS_REVOLVE,
} from './revolve.js';
import { createRectangleProfile, createPolygonProfile, createCircleProfile } from './sketchProfile.js';
import { YZ_PLANE, ZX_PLANE, createDatumPlaneFromNormal } from './planes.js';
import { vec2 } from '../num/vec2.js';
import { vec3 } from '../num/vec3.js';

describe('revolve', () => {
  let model: TopoModel;
  
  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  describe('full revolution', () => {
    it('revolves a rectangle to create a cylinder-like shape', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 2, 3, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      const stats = model.getStats();
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
      
      const shells = model.getBodyShells(result.body!);
      expect(shells).toHaveLength(1);
    });

    it('uses 8 segments minimum for full revolution', () => {
      const profile = createRectangleProfile(YZ_PLANE, 0.5, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
      
      const shells = model.getBodyShells(result.body!);
      const faces = model.getShellFaces(shells[0]);
      expect(faces.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('partial revolution', () => {
    it('revolves 90 degrees', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        angle: Math.PI / 2,
      });
      
      expect(result.success).toBe(true);
      
      const shells = model.getBodyShells(result.body!);
      const faces = model.getShellFaces(shells[0]);
      expect(faces.length).toBeGreaterThan(0);
    });

    it('revolves 180 degrees', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        angle: Math.PI,
      });
      
      expect(result.success).toBe(true);
    });

    it('handles negative angle', () => {
      const profile = createRectangleProfile(YZ_PLANE, 1, 1, 2, 0);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
        angle: -Math.PI / 2,
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
      
      const stats = model.getStats();
      expect(stats.faces).toBeGreaterThan(48);
    });
  });

  describe('different axes', () => {
    it('revolves around X axis', () => {
      const profile = createRectangleProfile(ZX_PLANE, 1, 1, 0, 2);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: X_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
    });

    it('revolves around Z axis', () => {
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
        vec3(0, 1, 1)
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
      const vertices = [vec2(2, 0), vec2(3, 0), vec2(2.5, 1)];
      const profile = createPolygonProfile(YZ_PLANE, vertices);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });
      
      expect(result.success).toBe(true);
      
      const stats = model.getStats();
      expect(stats.faces).toBeGreaterThanOrEqual(24);
    });

    it('revolves a circle to create torus side surfaces', () => {
      // In the YZ plane, x maps to world Y, y maps to world Z.
      // Offset in Z so the profile is not centered on the Y axis.
      const profile = createCircleProfile(YZ_PLANE, 1, 0, 3);
      const result = revolve(model, profile, {
        operation: 'add',
        axis: Y_AXIS_REVOLVE,
      });

      expect(result.success).toBe(true);
      const shells = model.getBodyShells(result.body!);
      const faces = model.getShellFaces(shells[0]);
      const kinds = new Set<string>();
      for (const f of faces) {
        const sIdx = model.getFaceSurfaceIndex(f);
        kinds.add(model.getSurface(sIdx).kind);
      }
      expect(kinds.has('torus')).toBe(true);
    });
  });
});
