/**
 * Tests for extrude operation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TopoModel } from '../topo/TopoModel.js';
import { createNumericContext } from '../num/tolerance.js';
import { extrude } from './extrude.js';
import { createRectangleProfile, createPolygonProfile, createCircleProfile } from './sketchProfile.js';
import { XY_PLANE, YZ_PLANE, createOffsetPlane } from './planes.js';
import { vec2 } from '../num/vec2.js';

describe('extrude', () => {
  let model: TopoModel;
  
  beforeEach(() => {
    model = new TopoModel(createNumericContext());
  });

  describe('basic extrusion', () => {
    it('extrudes a rectangle to create a box', () => {
      const profile = createRectangleProfile(XY_PLANE, 2, 2);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 3,
      });
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      const shells = model.getBodyShells(result.body!);
      expect(shells).toHaveLength(1);
      
      const faces = model.getShellFaces(shells[0]);
      expect(faces.length).toBe(6);
    });

    it('creates correct number of vertices and edges', () => {
      const profile = createRectangleProfile(XY_PLANE, 1, 1);
      extrude(model, profile, {
        operation: 'add',
        distance: 1,
      });
      
      const stats = model.getStats();
      expect(stats.vertices).toBe(8);
      expect(stats.edges).toBe(12);
      expect(stats.faces).toBe(6);
    });

    it('extrudes a triangle to create a prism', () => {
      const vertices = [vec2(0, 0), vec2(2, 0), vec2(1, 1.5)];
      const profile = createPolygonProfile(XY_PLANE, vertices);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 2,
      });
      
      expect(result.success).toBe(true);
      
      const shells = model.getBodyShells(result.body!);
      const faces = model.getShellFaces(shells[0]);
      expect(faces.length).toBe(5);
    });

    it('extrudes a circle profile and creates cylindrical side faces', () => {
      const profile = createCircleProfile(XY_PLANE, 5);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 3,
      });

      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();

      const shells = model.getBodyShells(result.body!);
      const faces = model.getShellFaces(shells[0]);

      const hasCylinder = faces.some((faceId) => {
        const surfaceIdx = model.getFaceSurfaceIndex(faceId);
        const surface = model.getSurface(surfaceIdx);
        return surface.kind === 'cylinder';
      });

      expect(hasCylinder).toBe(true);
    });
  });

  describe('extrusion direction', () => {
    it('extrudes along plane normal by default', () => {
      const profile = createRectangleProfile(XY_PLANE, 1, 1);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 2,
      });
      
      expect(result.success).toBe(true);
      
      const zValues = [];
      for (let i = 0; i < model.vertices.count; i++) {
        zValues.push(model.vertices.z[i]);
      }
      const minZ = Math.min(...zValues);
      const maxZ = Math.max(...zValues);
      
      expect(minZ).toBeCloseTo(0);
      expect(maxZ).toBeCloseTo(2);
    });

    it('extrudes in custom direction', () => {
      const profile = createRectangleProfile(XY_PLANE, 1, 1);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 2,
        direction: [0, 1, 0],
      });
      
      expect(result.success).toBe(true);
      
      const yValues = [];
      for (let i = 0; i < model.vertices.count; i++) {
        yValues.push(model.vertices.y[i]);
      }
      const maxY = Math.max(...yValues);
      expect(maxY).toBeGreaterThan(0);
    });
  });

  describe('symmetric extrusion', () => {
    it('extrudes symmetrically in both directions', () => {
      const profile = createRectangleProfile(XY_PLANE, 2, 2);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 4,
        symmetric: true,
      });
      
      expect(result.success).toBe(true);
      
      const zValues = [];
      for (let i = 0; i < model.vertices.count; i++) {
        zValues.push(model.vertices.z[i]);
      }
      const minZ = Math.min(...zValues);
      const maxZ = Math.max(...zValues);
      
      expect(minZ).toBeCloseTo(-2);
      expect(maxZ).toBeCloseTo(2);
    });
  });

  describe('negative extrusion', () => {
    it('handles negative distance', () => {
      const profile = createRectangleProfile(XY_PLANE, 1, 1);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: -2,
      });
      
      expect(result.success).toBe(true);
      
      const zValues = [];
      for (let i = 0; i < model.vertices.count; i++) {
        zValues.push(model.vertices.z[i]);
      }
      const minZ = Math.min(...zValues);
      const maxZ = Math.max(...zValues);
      
      expect(minZ).toBeCloseTo(-2);
      expect(maxZ).toBeCloseTo(0);
    });
  });

  describe('extrusion on different planes', () => {
    it('extrudes on YZ plane', () => {
      const profile = createRectangleProfile(YZ_PLANE, 2, 2);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 3,
      });
      
      expect(result.success).toBe(true);
      
      const stats = model.getStats();
      expect(stats.faces).toBe(6);
    });

    it('extrudes on offset plane', () => {
      const offsetPlane = createOffsetPlane(XY_PLANE, 5);
      const profile = createRectangleProfile(offsetPlane, 1, 1);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 2,
      });
      
      expect(result.success).toBe(true);
      
      const zValues = [];
      for (let i = 0; i < model.vertices.count; i++) {
        zValues.push(model.vertices.z[i]);
      }
      const minZ = Math.min(...zValues);
      const maxZ = Math.max(...zValues);
      
      expect(minZ).toBeCloseTo(5);
      expect(maxZ).toBeCloseTo(7);
    });
  });

  describe('error handling', () => {
    it('fails for empty profile', () => {
      const profile = { id: 0, plane: XY_PLANE, loops: [] } as any;
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 1,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no loops');
    });

    it('fails for zero distance', () => {
      const profile = createRectangleProfile(XY_PLANE, 1, 1);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 0,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('too small');
    });

    it('fails for cut without target body', () => {
      const profile = createRectangleProfile(XY_PLANE, 1, 1);
      const result = extrude(model, profile, {
        operation: 'cut',
        distance: 1,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('target body');
    });
  });

  describe('complex profiles', () => {
    it('extrudes a pentagon', () => {
      const radius = 2;
      const vertices = [];
      for (let i = 0; i < 5; i++) {
        const angle = (2 * Math.PI * i) / 5 - Math.PI / 2;
        vertices.push(vec2(radius * Math.cos(angle), radius * Math.sin(angle)));
      }
      
      const profile = createPolygonProfile(XY_PLANE, vertices);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 1,
      });
      
      expect(result.success).toBe(true);
      
      const shells = model.getBodyShells(result.body!);
      const faces = model.getShellFaces(shells[0]);
      expect(faces.length).toBe(7);
    });
  });
});
