/**
 * Tests for extrude operation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyModel, getModelStats, getBodyShells, getShellFaces } from '../topo/model.js';
import { createNumericContext } from '../num/tolerance.js';
import { extrude } from './extrude.js';
import { createRectangleProfile, createCircleProfile, createPolygonProfile } from './sketchProfile.js';
import { XY_PLANE, YZ_PLANE, createOffsetPlane } from './planes.js';
import { validateModel } from '../topo/validate.js';
import { vec2 } from '../num/vec2.js';
import type { TopoModel } from '../topo/model.js';

describe('extrude', () => {
  let model: TopoModel;
  
  beforeEach(() => {
    model = createEmptyModel(createNumericContext());
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
      
      // Check topology: box has 6 faces
      const shells = getBodyShells(model, result.body!);
      expect(shells).toHaveLength(1);
      
      const faces = getShellFaces(model, shells[0]);
      // 4 side faces + top + bottom = 6
      expect(faces.length).toBe(6);
    });

    it('creates correct number of vertices and edges', () => {
      const profile = createRectangleProfile(XY_PLANE, 1, 1);
      extrude(model, profile, {
        operation: 'add',
        distance: 1,
      });
      
      const stats = getModelStats(model);
      expect(stats.vertices).toBe(8);  // 4 bottom + 4 top
      expect(stats.edges).toBe(12);     // 4 bottom + 4 top + 4 side
      expect(stats.faces).toBe(6);      // box has 6 faces
    });

    it('extrudes a triangle to create a prism', () => {
      const vertices = [vec2(0, 0), vec2(2, 0), vec2(1, 1.5)];
      const profile = createPolygonProfile(XY_PLANE, vertices);
      const result = extrude(model, profile, {
        operation: 'add',
        distance: 2,
      });
      
      expect(result.success).toBe(true);
      
      const shells = getBodyShells(model, result.body!);
      const faces = getShellFaces(model, shells[0]);
      // 3 side faces + top + bottom = 5
      expect(faces.length).toBe(5);
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
      
      // Find min and max z values
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
        direction: [0, 1, 0], // extrude in Y direction
      });
      
      expect(result.success).toBe(true);
      
      // Find max y value
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
      
      // Find min and max z values - should be -2 and 2
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
      
      // Find min z - should be at -2 (below XY plane)
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
      
      // Should extrude in X direction
      const stats = getModelStats(model);
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
      
      // Find min and max z - should be 5 and 7
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
      // Create a regular pentagon
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
      
      const shells = getBodyShells(model, result.body!);
      const faces = getShellFaces(model, shells[0]);
      // 5 side faces + top + bottom = 7
      expect(faces.length).toBe(7);
    });
  });
});
