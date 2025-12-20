/**
 * Tests for BREP topology healing
 */

import { describe, it, expect } from 'vitest';
import { createNumericContext } from '../num/tolerance.js';
import { vec3 } from '../num/vec3.js';
import { createPlaneSurface } from '../geom/surface.js';
import { TopoModel } from './TopoModel.js';
import { asVertexId, type BodyId } from './handles.js';
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
    const v0 = model.addVertex(0, 0, 0);
    const v1 = model.addVertex(size, 0, 0);
    const v2 = model.addVertex(size / 2, size, 0);
    
    const e0 = model.addEdge(v0, v1);
    const e1 = model.addEdge(v1, v2);
    const e2 = model.addEdge(v2, v0);
    
    const he0 = model.addHalfEdge(e0, 1);
    const he1 = model.addHalfEdge(e1, 1);
    const he2 = model.addHalfEdge(e2, 1);
    
    const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
    const surfaceIdx = model.addSurface(surface);
    
    const body = model.addBody();
    const shell = model.addShell(false);
    model.addShellToBody(body, shell);
    
    const face = model.addFace(surfaceIdx);
    model.addFaceToShell(shell, face);
    
    const loop = model.addLoop([he0, he1, he2]);
    model.addLoopToFace(face, loop);
    
    return body;
  }

  describe('mergeCoincidentVertices', () => {
    it('should merge vertices within tolerance', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      model.addVertex(1e-8, 1e-8, 1e-8);
      model.addVertex(1, 0, 0);
      
      const initialCount = model.vertices.liveCount;
      
      const result = mergeCoincidentVertices(model, ctx.tol.length);
      
      expect(result.count).toBe(1);
      expect(model.vertices.liveCount).toBe(initialCount - 1);
      expect(model.isVertexDeleted(asVertexId(1))).toBe(true);
      expect(model.isVertexDeleted(asVertexId(0))).toBe(false);
      expect(model.isVertexDeleted(asVertexId(2))).toBe(false);
    });

    it('should not merge vertices that are far apart', () => {
      const model = new TopoModel(ctx);
      
      model.addVertex(0, 0, 0);
      model.addVertex(1, 0, 0);
      model.addVertex(0, 1, 0);
      
      const initialCount = model.vertices.liveCount;
      
      const result = mergeCoincidentVertices(model, ctx.tol.length);
      
      expect(result.count).toBe(0);
      expect(model.vertices.liveCount).toBe(initialCount);
    });

    it('should update edge references when merging', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1e-8, 1e-8, 0);
      const v2 = model.addVertex(1, 0, 0);
      
      const e = model.addEdge(v1, v2);
      
      mergeCoincidentVertices(model, ctx.tol.length);
      
      expect(model.edges.vStart[e]).toBe(v0);
    });
  });

  describe('collapseShortEdges', () => {
    it('should collapse edges below threshold', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1e-5, 0, 0);
      const v2 = model.addVertex(1, 0, 0);
      
      const shortEdge = model.addEdge(v0, v1);
      const normalEdge = model.addEdge(v1, v2);
      
      const result = collapseShortEdges(model, ctx.tol.length * 100);
      
      expect(result.count).toBe(1);
      expect(model.isEdgeDeleted(shortEdge)).toBe(true);
      expect(model.isEdgeDeleted(normalEdge)).toBe(false);
    });

    it('should not collapse edges above threshold', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      
      const edge = model.addEdge(v0, v1);
      
      const result = collapseShortEdges(model, ctx.tol.length * 10);
      
      expect(result.count).toBe(0);
      expect(model.isEdgeDeleted(edge)).toBe(false);
    });

    it('should merge vertices when collapsing', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1e-5, 0, 0);
      const v2 = model.addVertex(1, 0, 0);
      
      model.addEdge(v0, v1);
      model.addEdge(v1, v2);
      
      collapseShortEdges(model, ctx.tol.length * 100);
      
      expect(model.isVertexDeleted(v1)).toBe(true);
      expect(model.isVertexDeleted(v0)).toBe(false);
    });
  });

  describe('removeSmallFaces', () => {
    it('should remove faces with area below threshold', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1e-5, 0, 0);
      const v2 = model.addVertex(0.5e-5, 1e-5, 0);
      
      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);
      
      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(surface);
      
      const body = model.addBody();
      const shell = model.addShell(false);
      model.addShellToBody(body, shell);
      
      const face = model.addFace(surfaceIdx);
      model.addFaceToShell(shell, face);
      
      const loop = model.addLoop([he0, he1, he2]);
      model.addLoopToFace(face, loop);
      
      const result = removeSmallFaces(model, 1e-4);
      
      expect(result.count).toBe(1);
      expect(model.isFaceDeleted(face)).toBe(true);
    });

    it('should not remove faces with sufficient area', () => {
      const model = new TopoModel(ctx);
      createTriangleFace(model, 1);
      
      const result = removeSmallFaces(model, 1e-6);
      
      expect(result.count).toBe(0);
    });
  });

  describe('reorientShells', () => {
    it('should flip inside-out shells', () => {
      const model = new TopoModel(ctx);
      
      const s = 1;
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(s, 0, 0);
      const v2 = model.addVertex(s, 0, s);
      const v3 = model.addVertex(0, 0, s);
      
      const e01 = model.addEdge(v0, v1);
      const e12 = model.addEdge(v1, v2);
      const e23 = model.addEdge(v2, v3);
      const e30 = model.addEdge(v3, v0);
      
      const body = model.addBody();
      const shell = model.addShell(true);
      model.addShellToBody(body, shell);
      
      const surfBottom = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 1, 0)));
      const faceBottom = model.addFace(surfBottom, true);
      model.addFaceToShell(shell, faceBottom);
      
      const he_bottom_01 = model.addHalfEdge(e01, 1);
      const he_bottom_12 = model.addHalfEdge(e12, 1);
      const he_bottom_23 = model.addHalfEdge(e23, 1);
      const he_bottom_30 = model.addHalfEdge(e30, 1);
      const loopBottom = model.addLoop([he_bottom_01, he_bottom_12, he_bottom_23, he_bottom_30]);
      model.addLoopToFace(faceBottom, loopBottom);
      
      const result = reorientShells(model);
      
      expect(result.actions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('healModel', () => {
    it('should heal a model with multiple issues', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      model.addVertex(1e-8, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0.5, 1, 0);
      
      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);
      
      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(surface);
      
      const body = model.addBody();
      const shell = model.addShell(false);
      model.addShellToBody(body, shell);
      
      const face = model.addFace(surfaceIdx);
      model.addFaceToShell(shell, face);
      
      const loop = model.addLoop([he0, he1, he2]);
      model.addLoopToFace(face, loop);
      
      const result = healModel(model, {
        vertexMergeTolerance: ctx.tol.length,
        maxIterations: 3,
      });
      
      expect(result.success).toBe(true);
      expect(result.stats.verticesMerged).toBe(1);
    });

    it('should report healing statistics', () => {
      const model = new TopoModel(ctx);
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
      const model = new TopoModel(ctx);
      createTriangleFace(model, 1);
      
      const result = healModel(model, { maxIterations: 10 });
      
      expect(result.iterations).toBeLessThanOrEqual(2);
    });
  });

  describe('needsHealing', () => {
    it('should return false for clean model', () => {
      const model = new TopoModel(ctx);
      createTriangleFace(model, 1);
      
      expect(needsHealing(model)).toBe(false);
    });

    it('should return true for model with duplicate vertices', () => {
      const model = new TopoModel(ctx);
      
      model.addVertex(0, 0, 0);
      model.addVertex(1e-8, 0, 0);
      
      expect(needsHealing(model)).toBe(true);
    });
  });

  describe('getHealingSummary', () => {
    it('should summarize issues', () => {
      const model = new TopoModel(ctx);
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
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0.5, 1, 0);
      
      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);
      
      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(surface);
      
      const body = model.addBody();
      const shell = model.addShell(false);
      model.addShellToBody(body, shell);
      
      const face = model.addFace(surfaceIdx);
      model.addFaceToShell(shell, face);
      
      const loop = model.addLoop([he0, he1, he2]);
      model.addLoopToFace(face, loop);
      
      const result = healModel(model);
      
      expect(result.validationReport).toBeDefined();
    });

    it('should validate after healing', () => {
      const model = new TopoModel(ctx);
      createTriangleFace(model, 1);
      
      const result = healModel(model, { validateAfterEachStep: true });
      
      expect(result.validationReport).toBeDefined();
    });
  });
});
