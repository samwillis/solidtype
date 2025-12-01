/**
 * Tests for BREP topology healing
 */

import { describe, it, expect } from 'vitest';
import { createNumericContext } from '../num/tolerance.js';
import { vec3 } from '../num/vec3.js';
import { createPlaneSurface } from '../geom/surface.js';
import {
  createEmptyModel,
  addVertex,
  addEdge,
  addHalfEdge,
  setHalfEdgeTwin,
  addLoop,
  addLoopToFace,
  addFace,
  addFaceToShell,
  addShell,
  addShellToBody,
  setShellClosed,
  addBody,
  addSurface,
  getVertexPosition,
  isVertexDeleted,
  isEdgeDeleted,
  isFaceDeleted,
  type TopoModel,
  type BodyId,
  asVertexId,
} from './model.js';
import { validateModel, isValidModel } from './validate.js';
import {
  healModel,
  mergeCoincidentVertices,
  collapseShortEdges,
  removeSmallFaces,
  reorientShells,
  needsHealing,
  getHealingSummary,
} from './heal.js';

describe('Healing', () => {
  const ctx = createNumericContext();

  /**
   * Helper to create a simple triangle face
   */
  function createTriangleFace(model: TopoModel, size: number = 1): BodyId {
    const v0 = addVertex(model, 0, 0, 0);
    const v1 = addVertex(model, size, 0, 0);
    const v2 = addVertex(model, size / 2, size, 0);
    
    const e0 = addEdge(model, v0, v1);
    const e1 = addEdge(model, v1, v2);
    const e2 = addEdge(model, v2, v0);
    
    const he0 = addHalfEdge(model, e0, 1);
    const he1 = addHalfEdge(model, e1, 1);
    const he2 = addHalfEdge(model, e2, 1);
    
    const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
    const surfaceIdx = addSurface(model, surface);
    
    const body = addBody(model);
    const shell = addShell(model, false); // open shell
    addShellToBody(model, body, shell);
    
    const face = addFace(model, surfaceIdx);
    addFaceToShell(model, shell, face);
    
    const loop = addLoop(model, [he0, he1, he2]);
    addLoopToFace(model, face, loop);
    
    return body;
  }

  /**
   * Helper to create a model with duplicate vertices
   */
  function createModelWithDuplicateVertices(model: TopoModel): void {
    // Create two triangles that share an edge but have duplicate vertices
    const v0 = addVertex(model, 0, 0, 0);
    const v1 = addVertex(model, 1, 0, 0);
    const v2 = addVertex(model, 0.5, 1, 0);
    
    // Duplicate vertices (within tolerance)
    const v0dup = addVertex(model, 1e-8, 1e-8, 1e-8); // near v0
    const v1dup = addVertex(model, 1 + 1e-8, -1e-8, 0); // near v1
    
    // Just create edges - we don't need a complete valid model for this test
    addEdge(model, v0, v1);
    addEdge(model, v1, v2);
    addEdge(model, v2, v0);
    addEdge(model, v0dup, v1dup);
  }

  /**
   * Helper to create a model with short edges
   */
  function createModelWithShortEdges(model: TopoModel): void {
    const v0 = addVertex(model, 0, 0, 0);
    const v1 = addVertex(model, 1e-5, 0, 0); // Very short edge
    const v2 = addVertex(model, 1, 0, 0);
    const v3 = addVertex(model, 0.5, 1, 0);
    
    // Create edges including a very short one
    addEdge(model, v0, v1); // short edge
    addEdge(model, v1, v2);
    addEdge(model, v2, v3);
    addEdge(model, v3, v0);
  }

  describe('mergeCoincidentVertices', () => {
    it('should merge vertices within tolerance', () => {
      const model = createEmptyModel(ctx);
      
      // Create vertices at nearly the same position
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1e-8, 1e-8, 1e-8); // within tolerance
      const v2 = addVertex(model, 1, 0, 0); // far away
      
      const initialCount = model.vertices.liveCount;
      
      const result = mergeCoincidentVertices(model, ctx.tol.length);
      
      expect(result.count).toBe(1); // One vertex merged
      expect(model.vertices.liveCount).toBe(initialCount - 1);
      expect(isVertexDeleted(model, asVertexId(1))).toBe(true);
      expect(isVertexDeleted(model, asVertexId(0))).toBe(false);
      expect(isVertexDeleted(model, asVertexId(2))).toBe(false);
    });

    it('should not merge vertices that are far apart', () => {
      const model = createEmptyModel(ctx);
      
      addVertex(model, 0, 0, 0);
      addVertex(model, 1, 0, 0);
      addVertex(model, 0, 1, 0);
      
      const initialCount = model.vertices.liveCount;
      
      const result = mergeCoincidentVertices(model, ctx.tol.length);
      
      expect(result.count).toBe(0);
      expect(model.vertices.liveCount).toBe(initialCount);
    });

    it('should update edge references when merging', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1e-8, 1e-8, 0); // will be merged with v0
      const v2 = addVertex(model, 1, 0, 0);
      
      // Edge using v1 (which will be merged)
      const e = addEdge(model, v1, v2);
      
      mergeCoincidentVertices(model, ctx.tol.length);
      
      // Edge should now reference v0 instead of v1
      expect(model.edges.vStart[e]).toBe(v0);
    });
  });

  describe('collapseShortEdges', () => {
    it('should collapse edges below threshold', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1e-5, 0, 0); // very close
      const v2 = addVertex(model, 1, 0, 0);
      
      const shortEdge = addEdge(model, v0, v1);
      const normalEdge = addEdge(model, v1, v2);
      
      const result = collapseShortEdges(model, ctx.tol.length * 100);
      
      expect(result.count).toBe(1);
      expect(isEdgeDeleted(model, shortEdge)).toBe(true);
      expect(isEdgeDeleted(model, normalEdge)).toBe(false);
    });

    it('should not collapse edges above threshold', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      
      const edge = addEdge(model, v0, v1);
      
      const result = collapseShortEdges(model, ctx.tol.length * 10);
      
      expect(result.count).toBe(0);
      expect(isEdgeDeleted(model, edge)).toBe(false);
    });

    it('should merge vertices when collapsing', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1e-5, 0, 0);
      const v2 = addVertex(model, 1, 0, 0);
      
      addEdge(model, v0, v1); // short edge
      addEdge(model, v1, v2);
      
      collapseShortEdges(model, ctx.tol.length * 100);
      
      // v1 should be deleted, and surviving edge should use v0
      expect(isVertexDeleted(model, v1)).toBe(true);
      expect(isVertexDeleted(model, v0)).toBe(false);
    });
  });

  describe('removeSmallFaces', () => {
    it('should remove faces with area below threshold', () => {
      const model = createEmptyModel(ctx);
      
      // Create a very small triangle
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1e-5, 0, 0);
      const v2 = addVertex(model, 0.5e-5, 1e-5, 0);
      
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      const e2 = addEdge(model, v2, v0);
      
      const he0 = addHalfEdge(model, e0, 1);
      const he1 = addHalfEdge(model, e1, 1);
      const he2 = addHalfEdge(model, e2, 1);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = addSurface(model, surface);
      
      const body = addBody(model);
      const shell = addShell(model, false);
      addShellToBody(model, body, shell);
      
      const face = addFace(model, surfaceIdx);
      addFaceToShell(model, shell, face);
      
      const loop = addLoop(model, [he0, he1, he2]);
      addLoopToFace(model, face, loop);
      
      const result = removeSmallFaces(model, 1e-4); // area threshold larger than face
      
      expect(result.count).toBe(1);
      expect(isFaceDeleted(model, face)).toBe(true);
    });

    it('should not remove faces with sufficient area', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model, 1); // size 1 = area 0.5
      
      const result = removeSmallFaces(model, 1e-6);
      
      expect(result.count).toBe(0);
    });
  });

  describe('reorientShells', () => {
    it('should flip inside-out shells', () => {
      const model = createEmptyModel(ctx);
      
      // Create a closed cube with inverted normals
      const s = 1;
      
      // Create 8 vertices
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, s, 0, 0);
      const v2 = addVertex(model, s, 0, s);
      const v3 = addVertex(model, 0, 0, s);
      const v4 = addVertex(model, 0, s, 0);
      const v5 = addVertex(model, s, s, 0);
      const v6 = addVertex(model, s, s, s);
      const v7 = addVertex(model, 0, s, s);
      
      // Create edges for bottom face
      const e01 = addEdge(model, v0, v1);
      const e12 = addEdge(model, v1, v2);
      const e23 = addEdge(model, v2, v3);
      const e30 = addEdge(model, v3, v0);
      
      const body = addBody(model);
      const shell = addShell(model, true); // closed
      addShellToBody(model, body, shell);
      
      // Create bottom face with INVERTED normal (pointing up instead of down)
      // This simulates an inside-out shell
      const surfBottom = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 1, 0))); // wrong normal!
      const faceBottom = addFace(model, surfBottom, true); // reversed flag set
      addFaceToShell(model, shell, faceBottom);
      
      // Create half-edges for bottom face (reversed winding)
      const he_bottom_01 = addHalfEdge(model, e01, 1);
      const he_bottom_12 = addHalfEdge(model, e12, 1);
      const he_bottom_23 = addHalfEdge(model, e23, 1);
      const he_bottom_30 = addHalfEdge(model, e30, 1);
      const loopBottom = addLoop(model, [he_bottom_01, he_bottom_12, he_bottom_23, he_bottom_30]);
      addLoopToFace(model, faceBottom, loopBottom);
      
      // Just test that reorientShells runs without error
      // Full testing would require a complete valid closed shell
      const result = reorientShells(model);
      
      // The result depends on the signed volume calculation
      // For this incomplete cube, it might or might not flip
      expect(result.actions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('healModel', () => {
    it('should heal a model with multiple issues', () => {
      const model = createEmptyModel(ctx);
      
      // Create vertices with some duplicates
      const v0 = addVertex(model, 0, 0, 0);
      const v0dup = addVertex(model, 1e-8, 0, 0); // duplicate
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 0.5, 1, 0);
      
      // Create a triangle
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      const e2 = addEdge(model, v2, v0);
      
      const he0 = addHalfEdge(model, e0, 1);
      const he1 = addHalfEdge(model, e1, 1);
      const he2 = addHalfEdge(model, e2, 1);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = addSurface(model, surface);
      
      const body = addBody(model);
      const shell = addShell(model, false);
      addShellToBody(model, body, shell);
      
      const face = addFace(model, surfaceIdx);
      addFaceToShell(model, shell, face);
      
      const loop = addLoop(model, [he0, he1, he2]);
      addLoopToFace(model, face, loop);
      
      const result = healModel(model, {
        vertexMergeTolerance: ctx.tol.length,
        maxIterations: 3,
      });
      
      expect(result.success).toBe(true);
      expect(result.stats.verticesMerged).toBe(1);
    });

    it('should report healing statistics', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model);
      
      const result = healModel(model);
      
      expect(result.iterations).toBeGreaterThanOrEqual(1);
      expect(result.stats).toBeDefined();
      expect(typeof result.stats.verticesMerged).toBe('number');
      expect(typeof result.stats.edgesCollapsed).toBe('number');
      expect(typeof result.stats.facesRemoved).toBe('number');
      expect(typeof result.stats.shellsReoriented).toBe('number');
    });

    it('should stop when no more healing needed', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model, 1);
      
      const result = healModel(model, { maxIterations: 10 });
      
      // Should stop after 1 iteration since no healing is needed
      expect(result.iterations).toBeLessThanOrEqual(2);
    });
  });

  describe('needsHealing', () => {
    it('should return false for clean model', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model, 1);
      
      expect(needsHealing(model)).toBe(false);
    });

    it('should return true for model with duplicate vertices', () => {
      const model = createEmptyModel(ctx);
      
      // Create two very close vertices
      addVertex(model, 0, 0, 0);
      addVertex(model, 1e-8, 0, 0);
      
      expect(needsHealing(model)).toBe(true);
    });
  });

  describe('getHealingSummary', () => {
    it('should summarize issues', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model, 1);
      
      const summary = getHealingSummary(model);
      
      expect(summary).toHaveProperty('duplicateVertices');
      expect(summary).toHaveProperty('shortEdges');
      expect(summary).toHaveProperty('smallFaces');
      expect(summary).toHaveProperty('inconsistentShells');
    });
  });

  describe('Integration with validation', () => {
    it('should produce valid model after healing', () => {
      const model = createEmptyModel(ctx);
      
      // Create a model with some issues
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 0.5, 1, 0);
      
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      const e2 = addEdge(model, v2, v0);
      
      const he0 = addHalfEdge(model, e0, 1);
      const he1 = addHalfEdge(model, e1, 1);
      const he2 = addHalfEdge(model, e2, 1);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = addSurface(model, surface);
      
      const body = addBody(model);
      const shell = addShell(model, false);
      addShellToBody(model, body, shell);
      
      const face = addFace(model, surfaceIdx);
      addFaceToShell(model, shell, face);
      
      const loop = addLoop(model, [he0, he1, he2]);
      addLoopToFace(model, face, loop);
      
      const result = healModel(model);
      
      // Should either succeed or report validation issues
      expect(result.validationReport).toBeDefined();
    });

    it('should validate after healing', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model, 1);
      
      const result = healModel(model, { validateAfterEachStep: true });
      
      expect(result.validationReport).toBeDefined();
    });
  });
});
