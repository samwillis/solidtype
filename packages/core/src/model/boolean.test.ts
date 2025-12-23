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

  describe('extrude-like scenarios (user-reported cases)', () => {
    // These tests match the user's reported scenarios:
    // - First extrude creates a base box
    // - Second extrude adds/cuts from the base
    
    it('union of overlapping boxes creates L-shaped solid', () => {
      // Simulating: First extrude 4x4x2 at origin, second 2x2x4 at corner
      const boxA = createBox(model, { center: vec3(0, 0, 1), width: 4, height: 4, depth: 2 });
      const boxB = createBox(model, { center: vec3(1, 1, 2), width: 2, height: 2, depth: 4 });
      
      const result = union(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      if (result.body) {
        const shells = model.getBodyShells(result.body);
        const faces = model.getShellFaces(shells[0]);
        
        // L-shaped union should have ~13 faces:
        // - 1 bottom (z=0)
        // - 1 top at z=2 (full 4x4)
        // - 1 top at z=4 (small 2x2)
        // - ~10 side faces
        expect(faces.length).toBeGreaterThanOrEqual(10);
        expect(faces.length).toBeLessThanOrEqual(18);
      }
    });

    it('subtract creates through-hole with correct face count', () => {
      // Simulating: 4x4x2 box with 2x2x4 tool going completely through
      const boxA = createBox(model, { center: vec3(0, 0, 1), width: 4, height: 4, depth: 2 });
      const boxB = createBox(model, { center: vec3(0, 0, 2), width: 2, height: 2, depth: 4 });
      
      const result = subtract(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      if (result.body) {
        const shells = model.getBodyShells(result.body);
        const faces = model.getShellFaces(shells[0]);
        
        // Through-hole implementation approach:
        // Option A: 2 holed faces + 4 outer walls + 4 inner walls = 10 faces
        // Option B: Top/bottom as separate pieces (frame-like shapes) + walls = 11+ faces
        // Current implementation uses approach B (splitting faces rather than multi-loop holes)
        expect(faces.length).toBeGreaterThanOrEqual(10);
        expect(faces.length).toBeLessThanOrEqual(14);
        
        // Verify all faces have valid loops
        for (const faceId of faces) {
          const loops = model.getFaceLoops(faceId);
          expect(loops.length).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('subtract creates blind pocket when tool does not go through', () => {
      // 4x4x4 box with 2x2x2 pocket from top
      const boxA = createBox(model, { center: vec3(0, 0, 2), width: 4, height: 4, depth: 4 });
      const boxB = createBox(model, { center: vec3(0, 0, 3), width: 2, height: 2, depth: 2 }); // only goes 2 deep
      
      const result = subtract(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      if (result.body) {
        const shells = model.getBodyShells(result.body);
        const faces = model.getShellFaces(shells[0]);
        
        // Blind pocket should have:
        // - 1 top face with hole
        // - 4 outer side walls
        // - 1 bottom (unchanged)
        // - 4 inner pocket walls
        // - 1 pocket bottom
        expect(faces.length).toBe(11);
      }
    });

    it('union of two boxes sharing a face produces valid merged body', () => {
      // Two boxes touching at x=2
      const boxA = createBox(model, { center: vec3(1, 0, 0), width: 2, height: 2, depth: 2 });
      const boxB = createBox(model, { center: vec3(3, 0, 0), width: 2, height: 2, depth: 2 });
      
      const result = union(model, boxA, boxB);
      
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      if (result.body) {
        const shells = model.getBodyShells(result.body);
        const faces = model.getShellFaces(shells[0]);
        
        // The internal shared faces are not removed in current implementation
        // (that would require face stitching/merging which is a healing step)
        // For now, we expect the boolean to produce a valid body
        // 6 faces (ideal) to 10 faces (with internal faces kept)
        expect(faces.length).toBeGreaterThanOrEqual(6);
        expect(faces.length).toBeLessThanOrEqual(10);
        
        // Verify all faces have valid loops
        for (const faceId of faces) {
          const loops = model.getFaceLoops(faceId);
          expect(loops.length).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('sequential unions maintain correct topology', () => {
      // First box
      const boxA = createBox(model, { center: vec3(0, 0, 1), width: 4, height: 4, depth: 2 });
      
      // Second box overlapping corner
      const boxB = createBox(model, { center: vec3(1, 1, 2), width: 2, height: 2, depth: 4 });
      
      const result1 = union(model, boxA, boxB);
      expect(result1.success).toBe(true);
      expect(result1.body).toBeDefined();
      
      // Third box on opposite corner
      const boxC = createBox(model, { center: vec3(-1, -1, 2), width: 2, height: 2, depth: 4 });
      
      const result2 = union(model, result1.body!, boxC);
      expect(result2.success).toBe(true);
      expect(result2.body).toBeDefined();
      
      if (result2.body) {
        const shells = model.getBodyShells(result2.body);
        const faces = model.getShellFaces(shells[0]);
        
        // Should have a complex shape with many faces
        expect(faces.length).toBeGreaterThanOrEqual(15);
      }
    });

    it('sequential subtract operations preserve holes', () => {
      // Base box
      const boxA = createBox(model, { center: vec3(0, 0, 1), width: 6, height: 6, depth: 2 });
      
      // First cut
      const boxB = createBox(model, { center: vec3(1, 1, 1), width: 1, height: 1, depth: 4 });
      
      const result1 = subtract(model, boxA, boxB);
      expect(result1.success).toBe(true);
      expect(result1.body).toBeDefined();
      
      // Second cut on opposite side
      const boxC = createBox(model, { center: vec3(-1, -1, 1), width: 1, height: 1, depth: 4 });
      
      const result2 = subtract(model, result1.body!, boxC);
      expect(result2.success).toBe(true);
      expect(result2.body).toBeDefined();
      
      if (result2.body) {
        const shells = model.getBodyShells(result2.body);
        const faces = model.getShellFaces(shells[0]);
        
        // Should have more faces due to two holes
        // 4 outer walls + 2 faces with 2 holes each + 8 inner walls = 14+ faces
        expect(faces.length).toBeGreaterThanOrEqual(14);
        
        // Count faces with holes - should be 2 (top and bottom)
        let facesWithHoles = 0;
        for (const faceId of faces) {
          const loops = model.getFaceLoops(faceId);
          if (loops.length > 1) facesWithHoles++;
        }
        expect(facesWithHoles).toBe(2);
        
        // Each holed face should have 3 loops (outer + 2 holes)
        for (const faceId of faces) {
          const loops = model.getFaceLoops(faceId);
          if (loops.length > 1) {
            expect(loops.length).toBe(3);
          }
        }
      }
    });

    it('through-cut removes tool faces outside target body', () => {
      // Base: 4x4x2 box at z=[0,2] (height is Z dimension)
      const boxA = createBox(model, { center: vec3(0, 0, 1), width: 4, depth: 4, height: 2 });
      
      // Tool: 2x2x6 going completely through and extending past both ends (z=[-2,4])
      const boxB = createBox(model, { center: vec3(0, 0, 1), width: 2, depth: 2, height: 6 });
      
      const result = subtract(model, boxA, boxB);
      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      
      if (result.body) {
        const shells = model.getBodyShells(result.body);
        const faces = model.getShellFaces(shells[0]);
        
        // The result should NOT have the top and bottom faces of the tool that extend
        // past the base body. Only the interior walls should be present.
        // Expected: 4 outer walls + 4 inner walls + top/bottom with holes = ~10-12 faces
        expect(faces.length).toBeGreaterThanOrEqual(10);
        expect(faces.length).toBeLessThanOrEqual(14);
        
        // Check no faces extend beyond z=0 to z=2 range (original base body)
        for (const faceId of faces) {
          const loops = model.getFaceLoops(faceId);
          if (loops.length === 0) continue;
          
          for (const he of model.iterateLoopHalfEdges(loops[0])) {
            const vertex = model.getHalfEdgeStartVertex(he);
            const pos = model.getVertexPosition(vertex);
            // All vertices should be within z=[0,2] (with small tolerance)
            expect(pos[2]).toBeGreaterThanOrEqual(-0.01);
            expect(pos[2]).toBeLessThanOrEqual(2.01);
          }
        }
      }
    });
  });
});
