/**
 * Tests for BREP topology model
 */

import { describe, it, expect } from 'vitest';
import { createNumericContext } from '../num/tolerance.js';
import { vec3, type Vec3 } from '../num/vec3.js';
import { createPlaneSurface } from '../geom/surface.js';
import { TopoModel } from './TopoModel.js';
import {
  NULL_ID,
  asVertexId,
  asFaceId,
  asLoopId,
  type BodyId,
  type HalfEdgeId,
} from './handles.js';

describe('TopoModel', () => {
  const ctx = createNumericContext();

  describe('constructor', () => {
    it('should create an empty model with all tables initialized', () => {
      const model = new TopoModel(ctx);
      
      expect(model.vertices.count).toBe(0);
      expect(model.edges.count).toBe(0);
      expect(model.halfEdges.count).toBe(0);
      expect(model.loops.count).toBe(0);
      expect(model.faces.count).toBe(0);
      expect(model.shells.count).toBe(0);
      expect(model.bodies.count).toBe(0);
      expect(model.curves).toHaveLength(0);
      expect(model.surfaces).toHaveLength(0);
      expect(model.faceLoops).toHaveLength(0);
      expect(model.shellFaces).toHaveLength(0);
      expect(model.bodyShells).toHaveLength(0);
    });
  });

  describe('Vertex operations', () => {
    it('should add vertices and retrieve their positions', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(1, 1, 0);
      
      expect(model.getVertexPosition(v0)).toEqual([0, 0, 0]);
      expect(model.getVertexPosition(v1)).toEqual([1, 0, 0]);
      expect(model.getVertexPosition(v2)).toEqual([1, 1, 0]);
      
      expect(model.vertices.count).toBe(3);
      expect(model.vertices.liveCount).toBe(3);
    });

    it('should add vertex from Vec3', () => {
      const model = new TopoModel(ctx);
      
      const p: Vec3 = [2.5, 3.5, 4.5];
      const v = model.addVertexVec3(p);
      
      expect(model.getVertexPosition(v)).toEqual(p);
    });
  });

  describe('Edge operations', () => {
    it('should add edges with vertex references', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(1, 1, 0);
      
      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      
      expect(model.getEdgeStartVertex(e0)).toBe(v0);
      expect(model.getEdgeEndVertex(e0)).toBe(v1);
      expect(model.getEdgeStartVertex(e1)).toBe(v1);
      expect(model.getEdgeEndVertex(e1)).toBe(v2);
      
      expect(model.edges.count).toBe(2);
    });

    it('should support edge parameter bounds', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      
      // Default bounds
      const e0 = model.addEdge(v0, v1);
      expect(model.getEdgeTStart(e0)).toBe(0);
      expect(model.getEdgeTEnd(e0)).toBe(1);
      
      // Custom bounds
      const e1 = model.addEdge(v0, v1, NULL_ID, 0.25, 0.75);
      expect(model.getEdgeTStart(e1)).toBe(0.25);
      expect(model.getEdgeTEnd(e1)).toBe(0.75);
    });
  });

  describe('Half-edge operations', () => {
    it('should create half-edges and link them correctly', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0.5, 1, 0);
      
      // Create a triangle
      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);
      
      // Create half-edges for forward direction
      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);
      
      // Link them in a loop
      model.linkHalfEdges(he0, he1);
      model.linkHalfEdges(he1, he2);
      model.linkHalfEdges(he2, he0);
      
      expect(model.getHalfEdgeNext(he0)).toBe(he1);
      expect(model.getHalfEdgeNext(he1)).toBe(he2);
      expect(model.getHalfEdgeNext(he2)).toBe(he0);
      
      expect(model.getHalfEdgePrev(he0)).toBe(he2);
      expect(model.getHalfEdgePrev(he1)).toBe(he0);
      expect(model.getHalfEdgePrev(he2)).toBe(he1);
    });

    it('should correctly compute start/end vertices based on direction', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      
      const e = model.addEdge(v0, v1);
      
      const heForward = model.addHalfEdge(e, 1);
      const heReverse = model.addHalfEdge(e, -1);
      
      // Forward: start=v0, end=v1
      expect(model.getHalfEdgeStartVertex(heForward)).toBe(v0);
      expect(model.getHalfEdgeEndVertex(heForward)).toBe(v1);
      
      // Reverse: start=v1, end=v0
      expect(model.getHalfEdgeStartVertex(heReverse)).toBe(v1);
      expect(model.getHalfEdgeEndVertex(heReverse)).toBe(v0);
    });

    it('should set up twin half-edges', () => {
      const model = new TopoModel(ctx);
      
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      
      const e = model.addEdge(v0, v1);
      
      const heForward = model.addHalfEdge(e, 1);
      const heReverse = model.addHalfEdge(e, -1);
      
      model.setHalfEdgeTwin(heForward, heReverse);
      
      expect(model.getHalfEdgeTwin(heForward)).toBe(heReverse);
      expect(model.getHalfEdgeTwin(heReverse)).toBe(heForward);
    });
  });

  describe('Loop operations', () => {
    it('should create a loop from half-edges', () => {
      const model = new TopoModel(ctx);
      
      // Create a triangle
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0.5, 1, 0);
      
      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);
      
      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);
      
      // Create the loop (addLoop now auto-links half-edges)
      const loop = model.addLoop([he0, he1, he2]);
      
      expect(model.getLoopFirstHalfEdge(loop)).toBe(he0);
      expect(model.getLoopHalfEdgeCount(loop)).toBe(3);
      
      // Check iteration
      const halfEdges = [...model.iterateLoopHalfEdges(loop)];
      expect(halfEdges).toEqual([he0, he1, he2]);
    });
  });

  describe('Face operations', () => {
    it('should create a face with a single loop', () => {
      const model = new TopoModel(ctx);
      
      // Create a planar face (triangle)
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
      
      // Create face and add loop to it
      const face = model.addFace(surfaceIdx);
      const loop = model.addLoop([he0, he1, he2]);
      model.addLoopToFace(face, loop);
      
      expect(model.getFaceOuterLoop(face)).toBe(loop);
      expect(model.getFaceLoopCount(face)).toBe(1);
      expect(model.getFaceLoops(face)).toEqual([loop]);
    });

    it('should support faces with multiple loops (holes)', () => {
      const model = new TopoModel(ctx);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(surface);
      
      // Create face
      const face = model.addFace(surfaceIdx);
      
      // Create outer loop (square)
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(1, 1, 0);
      const v3 = model.addVertex(0, 1, 0);
      
      const e01 = model.addEdge(v0, v1);
      const e12 = model.addEdge(v1, v2);
      const e23 = model.addEdge(v2, v3);
      const e30 = model.addEdge(v3, v0);
      
      const he01 = model.addHalfEdge(e01, 1);
      const he12 = model.addHalfEdge(e12, 1);
      const he23 = model.addHalfEdge(e23, 1);
      const he30 = model.addHalfEdge(e30, 1);
      
      const outerLoop = model.addLoop([he01, he12, he23, he30]);
      model.addLoopToFace(face, outerLoop);
      
      // Create inner loop (hole)
      const h0 = model.addVertex(0.25, 0.25, 0);
      const h1 = model.addVertex(0.75, 0.25, 0);
      const h2 = model.addVertex(0.75, 0.75, 0);
      const h3 = model.addVertex(0.25, 0.75, 0);
      
      const eh01 = model.addEdge(h0, h1);
      const eh12 = model.addEdge(h1, h2);
      const eh23 = model.addEdge(h2, h3);
      const eh30 = model.addEdge(h3, h0);
      
      const hh01 = model.addHalfEdge(eh01, -1); // reversed for hole
      const hh12 = model.addHalfEdge(eh30, -1);
      const hh23 = model.addHalfEdge(eh23, -1);
      const hh30 = model.addHalfEdge(eh12, -1);
      
      const innerLoop = model.addLoop([hh01, hh12, hh23, hh30]);
      model.addLoopToFace(face, innerLoop);
      
      expect(model.getFaceOuterLoop(face)).toBe(outerLoop);
      expect(model.getFaceLoopCount(face)).toBe(2);
      expect(model.getFaceLoops(face)).toEqual([outerLoop, innerLoop]);
    });
  });

  describe('Shell operations', () => {
    it('should create a shell with multiple faces', () => {
      const model = new TopoModel(ctx);
      
      // Create a simple body/shell structure
      const body = model.addBody();
      const shell = model.addShell();
      model.addShellToBody(body, shell);
      
      // Create two faces
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(surface);
      
      const face0 = model.addFace(surfaceIdx);
      const face1 = model.addFace(surfaceIdx);
      model.addFaceToShell(shell, face0);
      model.addFaceToShell(shell, face1);
      
      expect(model.getShellFaceCount(shell)).toBe(2);
      expect(model.getShellFaces(shell)).toEqual([face0, face1]);
    });

    it('should track closed/open shell state', () => {
      const model = new TopoModel(ctx);
      
      const shell = model.addShell(false);
      
      expect(model.isShellClosed(shell)).toBe(false);
      
      model.setShellClosed(shell, true);
      expect(model.isShellClosed(shell)).toBe(true);
      
      model.setShellClosed(shell, false);
      expect(model.isShellClosed(shell)).toBe(false);
    });
  });

  describe('Body operations', () => {
    it('should create a body with shells', () => {
      const model = new TopoModel(ctx);
      
      const body = model.addBody();
      const shell1 = model.addShell();
      const shell2 = model.addShell();
      model.addShellToBody(body, shell1);
      model.addShellToBody(body, shell2);
      
      expect(model.getBodyShellCount(body)).toBe(2);
      expect(model.getBodyShells(body)).toEqual([shell1, shell2]);
    });

    it('should iterate over bodies', () => {
      const model = new TopoModel(ctx);
      
      const body1 = model.addBody();
      const body2 = model.addBody();
      const body3 = model.addBody();
      
      const bodies = [...model.iterateBodies()];
      expect(bodies).toEqual([body1, body2, body3]);
    });
  });

  describe('Model statistics', () => {
    it('should return correct entity counts', () => {
      const model = new TopoModel(ctx);
      
      model.addVertex(0, 0, 0);
      model.addVertex(1, 0, 0);
      model.addVertex(0, 1, 0);
      
      const v0 = asVertexId(0);
      const v1 = asVertexId(1);
      const v2 = asVertexId(2);
      
      model.addEdge(v0, v1);
      model.addEdge(v1, v2);
      
      const stats = model.getStats();
      
      expect(stats.vertices).toBe(3);
      expect(stats.edges).toBe(2);
      expect(stats.halfEdges).toBe(0);
      expect(stats.loops).toBe(0);
      expect(stats.faces).toBe(0);
      expect(stats.shells).toBe(0);
      expect(stats.bodies).toBe(0);
    });
  });

  describe('Non-contiguous entity ordering', () => {
    it('should correctly handle faces added to shell in any order', () => {
      const model = new TopoModel(ctx);
      
      const body = model.addBody();
      const shell = model.addShell();
      model.addShellToBody(body, shell);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(surface);
      
      // Create faces with IDs 0, 1, 2 but add to shell in order 2, 0, 1
      const face0 = model.addFace(surfaceIdx);
      const face1 = model.addFace(surfaceIdx);
      const face2 = model.addFace(surfaceIdx);
      
      model.addFaceToShell(shell, face2);
      model.addFaceToShell(shell, face0);
      model.addFaceToShell(shell, face1);
      
      expect(model.getShellFaceCount(shell)).toBe(3);
      expect(model.getShellFaces(shell)).toEqual([face2, face0, face1]);
    });

    it('should correctly handle loops added to face in any order', () => {
      const model = new TopoModel(ctx);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = model.addSurface(surface);
      const face = model.addFace(surfaceIdx);
      
      // Create some dummy loops
      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const e01 = model.addEdge(v0, v1);
      const e10 = model.addEdge(v1, v0);
      
      const he0 = model.addHalfEdge(e01, 1);
      const he1 = model.addHalfEdge(e10, 1);
      model.linkHalfEdges(he0, he1);
      model.linkHalfEdges(he1, he0);
      const loop0 = model.addLoop([he0, he1]);
      
      const he2 = model.addHalfEdge(e01, -1);
      const he3 = model.addHalfEdge(e10, -1);
      model.linkHalfEdges(he2, he3);
      model.linkHalfEdges(he3, he2);
      const loop1 = model.addLoop([he2, he3]);
      
      // Add loops to face (first is outer, second is hole)
      model.addLoopToFace(face, loop0);
      model.addLoopToFace(face, loop1);
      
      expect(model.getFaceLoopCount(face)).toBe(2);
      expect(model.getFaceLoops(face)).toEqual([loop0, loop1]);
      expect(model.getFaceOuterLoop(face)).toBe(loop0);
    });
  });
});

describe('Building a cube', () => {
  const ctx = createNumericContext();

  /**
   * Helper to create a cube with proper topology
   */
  function createCube(model: TopoModel, size: number = 1): BodyId {
    const s = size;
    
    // Create 8 vertices
    const v0 = model.addVertex(0, 0, 0);
    const v1 = model.addVertex(s, 0, 0);
    const v2 = model.addVertex(s, 0, s);
    const v3 = model.addVertex(0, 0, s);
    const v4 = model.addVertex(0, s, 0);
    const v5 = model.addVertex(s, s, 0);
    const v6 = model.addVertex(s, s, s);
    const v7 = model.addVertex(0, s, s);
    
    // Create 12 edges (each edge shared by 2 faces)
    const e01 = model.addEdge(v0, v1);
    const e12 = model.addEdge(v1, v2);
    const e23 = model.addEdge(v2, v3);
    const e30 = model.addEdge(v3, v0);
    const e45 = model.addEdge(v4, v5);
    const e56 = model.addEdge(v5, v6);
    const e67 = model.addEdge(v6, v7);
    const e74 = model.addEdge(v7, v4);
    const e04 = model.addEdge(v0, v4);
    const e15 = model.addEdge(v1, v5);
    const e26 = model.addEdge(v2, v6);
    const e37 = model.addEdge(v3, v7);
    
    // Create body and shell
    const body = model.addBody();
    const shell = model.addShell(true);
    model.addShellToBody(body, shell);
    
    // Create surfaces for each face
    const surfBottom = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, -1, 0)));
    const surfTop = model.addSurface(createPlaneSurface(vec3(0, s, 0), vec3(0, 1, 0)));
    const surfFront = model.addSurface(createPlaneSurface(vec3(0, 0, s), vec3(0, 0, 1)));
    const surfBack = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, -1)));
    const surfLeft = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(-1, 0, 0)));
    const surfRight = model.addSurface(createPlaneSurface(vec3(s, 0, 0), vec3(1, 0, 0)));
    
    // Create 6 faces
    const faceBottom = model.addFace(surfBottom);
    const faceTop = model.addFace(surfTop);
    const faceFront = model.addFace(surfFront);
    const faceBack = model.addFace(surfBack);
    const faceLeft = model.addFace(surfLeft);
    const faceRight = model.addFace(surfRight);
    
    model.addFaceToShell(shell, faceBottom);
    model.addFaceToShell(shell, faceTop);
    model.addFaceToShell(shell, faceFront);
    model.addFaceToShell(shell, faceBack);
    model.addFaceToShell(shell, faceLeft);
    model.addFaceToShell(shell, faceRight);
    
    // Create half-edges for each face
    const he_bottom_01 = model.addHalfEdge(e01, 1);
    const he_bottom_12 = model.addHalfEdge(e12, 1);
    const he_bottom_23 = model.addHalfEdge(e23, 1);
    const he_bottom_30 = model.addHalfEdge(e30, 1);
    const loopBottom = model.addLoop([he_bottom_01, he_bottom_12, he_bottom_23, he_bottom_30]);
    model.addLoopToFace(faceBottom, loopBottom);
    
    const he_top_47 = model.addHalfEdge(e74, -1);
    const he_top_76 = model.addHalfEdge(e67, -1);
    const he_top_65 = model.addHalfEdge(e56, -1);
    const he_top_54 = model.addHalfEdge(e45, -1);
    const loopTop = model.addLoop([he_top_47, he_top_76, he_top_65, he_top_54]);
    model.addLoopToFace(faceTop, loopTop);
    
    const he_front_32 = model.addHalfEdge(e23, -1);
    const he_front_26 = model.addHalfEdge(e26, 1);
    const he_front_67 = model.addHalfEdge(e67, 1);
    const he_front_73 = model.addHalfEdge(e37, -1);
    const loopFront = model.addLoop([he_front_32, he_front_26, he_front_67, he_front_73]);
    model.addLoopToFace(faceFront, loopFront);
    
    const he_back_04 = model.addHalfEdge(e04, 1);
    const he_back_45 = model.addHalfEdge(e45, 1);
    const he_back_51 = model.addHalfEdge(e15, -1);
    const he_back_10 = model.addHalfEdge(e01, -1);
    const loopBack = model.addLoop([he_back_04, he_back_45, he_back_51, he_back_10]);
    model.addLoopToFace(faceBack, loopBack);
    
    const he_left_03 = model.addHalfEdge(e30, -1);
    const he_left_37 = model.addHalfEdge(e37, 1);
    const he_left_74 = model.addHalfEdge(e74, 1);
    const he_left_40 = model.addHalfEdge(e04, -1);
    const loopLeft = model.addLoop([he_left_03, he_left_37, he_left_74, he_left_40]);
    model.addLoopToFace(faceLeft, loopLeft);
    
    const he_right_15 = model.addHalfEdge(e15, 1);
    const he_right_56 = model.addHalfEdge(e56, 1);
    const he_right_62 = model.addHalfEdge(e26, -1);
    const he_right_21 = model.addHalfEdge(e12, -1);
    const loopRight = model.addLoop([he_right_15, he_right_56, he_right_62, he_right_21]);
    model.addLoopToFace(faceRight, loopRight);
    
    // Set up twins
    model.setHalfEdgeTwin(he_bottom_01, he_back_10);
    model.setHalfEdgeTwin(he_bottom_12, he_right_21);
    model.setHalfEdgeTwin(he_bottom_23, he_front_32);
    model.setHalfEdgeTwin(he_bottom_30, he_left_03);
    model.setHalfEdgeTwin(he_top_47, he_left_74);
    model.setHalfEdgeTwin(he_top_76, he_front_67);
    model.setHalfEdgeTwin(he_top_65, he_right_56);
    model.setHalfEdgeTwin(he_top_54, he_back_45);
    model.setHalfEdgeTwin(he_back_04, he_left_40);
    model.setHalfEdgeTwin(he_back_51, he_right_15);
    model.setHalfEdgeTwin(he_front_26, he_right_62);
    model.setHalfEdgeTwin(he_front_73, he_left_37);
    
    return body;
  }

  it('should create a cube with correct entity counts', () => {
    const model = new TopoModel(ctx);
    createCube(model, 1);
    
    const stats = model.getStats();
    
    expect(stats.vertices).toBe(8);
    expect(stats.edges).toBe(12);
    expect(stats.halfEdges).toBe(24);
    expect(stats.loops).toBe(6);
    expect(stats.faces).toBe(6);
    expect(stats.shells).toBe(1);
    expect(stats.bodies).toBe(1);
    expect(stats.surfaces).toBe(6);
  });

  it('should have consistent half-edge loops', () => {
    const model = new TopoModel(ctx);
    createCube(model, 1);
    
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const faceId = asFaceId(faceIdx);
      const loopCount = model.getFaceLoopCount(faceId);
      expect(loopCount).toBe(1);
      
      const outerLoop = model.getFaceOuterLoop(faceId);
      expect(outerLoop).not.toBeNull();
      
      const heCount = model.getLoopHalfEdgeCount(outerLoop!);
      expect(heCount).toBe(4);
      
      const halfEdges = [...model.iterateLoopHalfEdges(outerLoop!)];
      expect(halfEdges).toHaveLength(4);
      
      for (let i = 0; i < halfEdges.length; i++) {
        const he = halfEdges[i];
        const nextHe = halfEdges[(i + 1) % halfEdges.length];
        expect(model.getHalfEdgeNext(he)).toBe(nextHe);
        expect(model.getHalfEdgePrev(nextHe)).toBe(he);
      }
    }
  });

  it('should have all edges with twin half-edges', () => {
    const model = new TopoModel(ctx);
    createCube(model, 1);
    
    for (let heIdx = 0; heIdx < model.halfEdges.count; heIdx++) {
      const heId = heIdx as HalfEdgeId;
      const twin = model.getHalfEdgeTwin(heId);
      
      expect(twin).not.toBe(NULL_ID);
      expect(model.getHalfEdgeTwin(twin)).toBe(heId);
      expect(model.getHalfEdgeEdge(heId)).toBe(model.getHalfEdgeEdge(twin));
      expect(model.getHalfEdgeDirection(heId)).toBe(-model.getHalfEdgeDirection(twin));
    }
  });

  it('should have vertex connectivity forming closed loops', () => {
    const model = new TopoModel(ctx);
    createCube(model, 1);
    
    for (let loopIdx = 0; loopIdx < model.loops.count; loopIdx++) {
      const loopId = asLoopId(loopIdx);
      const halfEdges = [...model.iterateLoopHalfEdges(loopId)];
      
      for (let i = 0; i < halfEdges.length; i++) {
        const he = halfEdges[i];
        const nextHe = halfEdges[(i + 1) % halfEdges.length];
        
        const endVertex = model.getHalfEdgeEndVertex(he);
        const nextStartVertex = model.getHalfEdgeStartVertex(nextHe);
        
        expect(endVertex).toBe(nextStartVertex);
      }
    }
  });
});
