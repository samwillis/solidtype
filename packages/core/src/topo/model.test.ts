/**
 * Tests for BREP topology model
 */

import { describe, it, expect } from 'vitest';
import { createNumericContext } from '../num/tolerance.js';
import { vec3, type Vec3 } from '../num/vec3.js';
import { createPlaneSurface } from '../geom/surface.js';
import {
  createEmptyModel,
  addVertex,
  addVertexVec3,
  getVertexPosition,
  addEdge,
  getEdgeStartVertex,
  getEdgeEndVertex,
  getEdgeTStart,
  getEdgeTEnd,
  addHalfEdge,
  setHalfEdgeTwin,
  linkHalfEdges,
  getHalfEdgeEdge,
  getHalfEdgeNext,
  getHalfEdgePrev,
  getHalfEdgeTwin,
  getHalfEdgeDirection,
  getHalfEdgeStartVertex,
  getHalfEdgeEndVertex,
  addLoop,
  addLoopToFace,
  getLoopFirstHalfEdge,
  getLoopHalfEdgeCount,
  iterateLoopHalfEdges,
  addFace,
  addFaceToShell,
  getFaceOuterLoop,
  getFaceLoops,
  getFaceLoopCount,
  addShell,
  addShellToBody,
  getShellFaces,
  getShellFaceCount,
  isShellClosed,
  setShellClosed,
  addBody,
  getBodyShells,
  getBodyShellCount,
  iterateBodies,
  addSurface,
  getModelStats,
  type TopoModel,
  type BodyId,
  type LoopId,
  type HalfEdgeId,
  NULL_ID,
  asVertexId,
  asFaceId,
  asLoopId,
} from './model.js';

describe('TopoModel', () => {
  const ctx = createNumericContext();

  describe('createEmptyModel', () => {
    it('should create an empty model with all tables initialized', () => {
      const model = createEmptyModel(ctx);
      
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
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 1, 1, 0);
      
      expect(getVertexPosition(model, v0)).toEqual([0, 0, 0]);
      expect(getVertexPosition(model, v1)).toEqual([1, 0, 0]);
      expect(getVertexPosition(model, v2)).toEqual([1, 1, 0]);
      
      expect(model.vertices.count).toBe(3);
      expect(model.vertices.liveCount).toBe(3);
    });

    it('should add vertex from Vec3', () => {
      const model = createEmptyModel(ctx);
      
      const p: Vec3 = [2.5, 3.5, 4.5];
      const v = addVertexVec3(model, p);
      
      expect(getVertexPosition(model, v)).toEqual(p);
    });
  });

  describe('Edge operations', () => {
    it('should add edges with vertex references', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 1, 1, 0);
      
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      
      expect(getEdgeStartVertex(model, e0)).toBe(v0);
      expect(getEdgeEndVertex(model, e0)).toBe(v1);
      expect(getEdgeStartVertex(model, e1)).toBe(v1);
      expect(getEdgeEndVertex(model, e1)).toBe(v2);
      
      expect(model.edges.count).toBe(2);
    });

    it('should support edge parameter bounds', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      
      // Default bounds
      const e0 = addEdge(model, v0, v1);
      expect(getEdgeTStart(model, e0)).toBe(0);
      expect(getEdgeTEnd(model, e0)).toBe(1);
      
      // Custom bounds
      const e1 = addEdge(model, v0, v1, NULL_ID, 0.25, 0.75);
      expect(getEdgeTStart(model, e1)).toBe(0.25);
      expect(getEdgeTEnd(model, e1)).toBe(0.75);
    });
  });

  describe('Half-edge operations', () => {
    it('should create half-edges and link them correctly', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 0.5, 1, 0);
      
      // Create a triangle
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      const e2 = addEdge(model, v2, v0);
      
      // Create half-edges for forward direction
      const he0 = addHalfEdge(model, e0, 1);
      const he1 = addHalfEdge(model, e1, 1);
      const he2 = addHalfEdge(model, e2, 1);
      
      // Link them in a loop
      linkHalfEdges(model, he0, he1);
      linkHalfEdges(model, he1, he2);
      linkHalfEdges(model, he2, he0);
      
      expect(getHalfEdgeNext(model, he0)).toBe(he1);
      expect(getHalfEdgeNext(model, he1)).toBe(he2);
      expect(getHalfEdgeNext(model, he2)).toBe(he0);
      
      expect(getHalfEdgePrev(model, he0)).toBe(he2);
      expect(getHalfEdgePrev(model, he1)).toBe(he0);
      expect(getHalfEdgePrev(model, he2)).toBe(he1);
    });

    it('should correctly compute start/end vertices based on direction', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      
      const e = addEdge(model, v0, v1);
      
      const heForward = addHalfEdge(model, e, 1);
      const heReverse = addHalfEdge(model, e, -1);
      
      // Forward: start=v0, end=v1
      expect(getHalfEdgeStartVertex(model, heForward)).toBe(v0);
      expect(getHalfEdgeEndVertex(model, heForward)).toBe(v1);
      
      // Reverse: start=v1, end=v0
      expect(getHalfEdgeStartVertex(model, heReverse)).toBe(v1);
      expect(getHalfEdgeEndVertex(model, heReverse)).toBe(v0);
    });

    it('should set up twin half-edges', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      
      const e = addEdge(model, v0, v1);
      
      const heForward = addHalfEdge(model, e, 1);
      const heReverse = addHalfEdge(model, e, -1);
      
      setHalfEdgeTwin(model, heForward, heReverse);
      
      expect(getHalfEdgeTwin(model, heForward)).toBe(heReverse);
      expect(getHalfEdgeTwin(model, heReverse)).toBe(heForward);
    });
  });

  describe('Loop operations', () => {
    it('should create a loop from half-edges', () => {
      const model = createEmptyModel(ctx);
      
      // Create a triangle
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 0.5, 1, 0);
      
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      const e2 = addEdge(model, v2, v0);
      
      const he0 = addHalfEdge(model, e0, 1);
      const he1 = addHalfEdge(model, e1, 1);
      const he2 = addHalfEdge(model, e2, 1);
      
      // Create the loop (addLoop now auto-links half-edges)
      const loop = addLoop(model, [he0, he1, he2]);
      
      expect(getLoopFirstHalfEdge(model, loop)).toBe(he0);
      expect(getLoopHalfEdgeCount(model, loop)).toBe(3);
      
      // Check iteration
      const halfEdges = [...iterateLoopHalfEdges(model, loop)];
      expect(halfEdges).toEqual([he0, he1, he2]);
    });
  });

  describe('Face operations', () => {
    it('should create a face with a single loop', () => {
      const model = createEmptyModel(ctx);
      
      // Create a planar face (triangle)
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
      
      // Create face and add loop to it
      const face = addFace(model, surfaceIdx);
      const loop = addLoop(model, [he0, he1, he2]);
      addLoopToFace(model, face, loop);
      
      expect(getFaceOuterLoop(model, face)).toBe(loop);
      expect(getFaceLoopCount(model, face)).toBe(1);
      expect(getFaceLoops(model, face)).toEqual([loop]);
    });

    it('should support faces with multiple loops (holes)', () => {
      const model = createEmptyModel(ctx);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = addSurface(model, surface);
      
      // Create face
      const face = addFace(model, surfaceIdx);
      
      // Create outer loop (square)
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 1, 1, 0);
      const v3 = addVertex(model, 0, 1, 0);
      
      const e01 = addEdge(model, v0, v1);
      const e12 = addEdge(model, v1, v2);
      const e23 = addEdge(model, v2, v3);
      const e30 = addEdge(model, v3, v0);
      
      const he01 = addHalfEdge(model, e01, 1);
      const he12 = addHalfEdge(model, e12, 1);
      const he23 = addHalfEdge(model, e23, 1);
      const he30 = addHalfEdge(model, e30, 1);
      
      const outerLoop = addLoop(model, [he01, he12, he23, he30]);
      addLoopToFace(model, face, outerLoop);
      
      // Create inner loop (hole)
      const h0 = addVertex(model, 0.25, 0.25, 0);
      const h1 = addVertex(model, 0.75, 0.25, 0);
      const h2 = addVertex(model, 0.75, 0.75, 0);
      const h3 = addVertex(model, 0.25, 0.75, 0);
      
      const eh01 = addEdge(model, h0, h1);
      const eh12 = addEdge(model, h1, h2);
      const eh23 = addEdge(model, h2, h3);
      const eh30 = addEdge(model, h3, h0);
      
      const hh01 = addHalfEdge(model, eh01, -1); // reversed for hole
      const hh12 = addHalfEdge(model, eh30, -1);
      const hh23 = addHalfEdge(model, eh23, -1);
      const hh30 = addHalfEdge(model, eh12, -1);
      
      const innerLoop = addLoop(model, [hh01, hh12, hh23, hh30]);
      addLoopToFace(model, face, innerLoop);
      
      expect(getFaceOuterLoop(model, face)).toBe(outerLoop);
      expect(getFaceLoopCount(model, face)).toBe(2);
      expect(getFaceLoops(model, face)).toEqual([outerLoop, innerLoop]);
    });
  });

  describe('Shell operations', () => {
    it('should create a shell with multiple faces', () => {
      const model = createEmptyModel(ctx);
      
      // Create a simple body/shell structure
      const body = addBody(model);
      const shell = addShell(model);
      addShellToBody(model, body, shell);
      
      // Create two faces
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = addSurface(model, surface);
      
      const face0 = addFace(model, surfaceIdx);
      const face1 = addFace(model, surfaceIdx);
      addFaceToShell(model, shell, face0);
      addFaceToShell(model, shell, face1);
      
      expect(getShellFaceCount(model, shell)).toBe(2);
      expect(getShellFaces(model, shell)).toEqual([face0, face1]);
    });

    it('should track closed/open shell state', () => {
      const model = createEmptyModel(ctx);
      
      const shell = addShell(model, false);
      
      expect(isShellClosed(model, shell)).toBe(false);
      
      setShellClosed(model, shell, true);
      expect(isShellClosed(model, shell)).toBe(true);
      
      setShellClosed(model, shell, false);
      expect(isShellClosed(model, shell)).toBe(false);
    });
  });

  describe('Body operations', () => {
    it('should create a body with shells', () => {
      const model = createEmptyModel(ctx);
      
      const body = addBody(model);
      const shell1 = addShell(model);
      const shell2 = addShell(model);
      addShellToBody(model, body, shell1);
      addShellToBody(model, body, shell2);
      
      expect(getBodyShellCount(model, body)).toBe(2);
      expect(getBodyShells(model, body)).toEqual([shell1, shell2]);
    });

    it('should iterate over bodies', () => {
      const model = createEmptyModel(ctx);
      
      const body1 = addBody(model);
      const body2 = addBody(model);
      const body3 = addBody(model);
      
      const bodies = [...iterateBodies(model)];
      expect(bodies).toEqual([body1, body2, body3]);
    });
  });

  describe('Model statistics', () => {
    it('should return correct entity counts', () => {
      const model = createEmptyModel(ctx);
      
      addVertex(model, 0, 0, 0);
      addVertex(model, 1, 0, 0);
      addVertex(model, 0, 1, 0);
      
      const v0 = asVertexId(0);
      const v1 = asVertexId(1);
      const v2 = asVertexId(2);
      
      addEdge(model, v0, v1);
      addEdge(model, v1, v2);
      
      const stats = getModelStats(model);
      
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
      const model = createEmptyModel(ctx);
      
      const body = addBody(model);
      const shell = addShell(model);
      addShellToBody(model, body, shell);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = addSurface(model, surface);
      
      // Create faces with IDs 0, 1, 2 but add to shell in order 2, 0, 1
      const face0 = addFace(model, surfaceIdx);
      const face1 = addFace(model, surfaceIdx);
      const face2 = addFace(model, surfaceIdx);
      
      addFaceToShell(model, shell, face2);
      addFaceToShell(model, shell, face0);
      addFaceToShell(model, shell, face1);
      
      expect(getShellFaceCount(model, shell)).toBe(3);
      expect(getShellFaces(model, shell)).toEqual([face2, face0, face1]);
    });

    it('should correctly handle loops added to face in any order', () => {
      const model = createEmptyModel(ctx);
      
      const surface = createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1));
      const surfaceIdx = addSurface(model, surface);
      const face = addFace(model, surfaceIdx);
      
      // Create some dummy loops
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const e01 = addEdge(model, v0, v1);
      const e10 = addEdge(model, v1, v0);
      
      const he0 = addHalfEdge(model, e01, 1);
      const he1 = addHalfEdge(model, e10, 1);
      linkHalfEdges(model, he0, he1);
      linkHalfEdges(model, he1, he0);
      const loop0 = addLoop(model, [he0, he1]);
      
      const he2 = addHalfEdge(model, e01, -1);
      const he3 = addHalfEdge(model, e10, -1);
      linkHalfEdges(model, he2, he3);
      linkHalfEdges(model, he3, he2);
      const loop1 = addLoop(model, [he2, he3]);
      
      // Add loops to face (first is outer, second is hole)
      addLoopToFace(model, face, loop0);
      addLoopToFace(model, face, loop1);
      
      expect(getFaceLoopCount(model, face)).toBe(2);
      expect(getFaceLoops(model, face)).toEqual([loop0, loop1]);
      expect(getFaceOuterLoop(model, face)).toBe(loop0);
    });
  });
});

describe('Building a cube', () => {
  const ctx = createNumericContext();

  /**
   * Helper to create a cube with proper topology
   * 
   * Cube vertices:
   *      4-------5
   *     /|      /|
   *    7-------6 |
   *    | 0-----|-1
   *    |/      |/
   *    3-------2
   * 
   * Faces:
   * - Front (z=1): 3,2,6,7
   * - Back (z=0): 0,4,5,1
   * - Left (x=0): 0,3,7,4
   * - Right (x=1): 1,5,6,2
   * - Bottom (y=0): 0,1,2,3
   * - Top (y=1): 4,7,6,5
   */
  function createCube(model: TopoModel, size: number = 1): BodyId {
    const s = size;
    
    // Create 8 vertices
    const v0 = addVertex(model, 0, 0, 0);
    const v1 = addVertex(model, s, 0, 0);
    const v2 = addVertex(model, s, 0, s);
    const v3 = addVertex(model, 0, 0, s);
    const v4 = addVertex(model, 0, s, 0);
    const v5 = addVertex(model, s, s, 0);
    const v6 = addVertex(model, s, s, s);
    const v7 = addVertex(model, 0, s, s);
    
    // Create 12 edges (each edge shared by 2 faces)
    // Bottom face edges
    const e01 = addEdge(model, v0, v1);
    const e12 = addEdge(model, v1, v2);
    const e23 = addEdge(model, v2, v3);
    const e30 = addEdge(model, v3, v0);
    
    // Top face edges
    const e45 = addEdge(model, v4, v5);
    const e56 = addEdge(model, v5, v6);
    const e67 = addEdge(model, v6, v7);
    const e74 = addEdge(model, v7, v4);
    
    // Vertical edges
    const e04 = addEdge(model, v0, v4);
    const e15 = addEdge(model, v1, v5);
    const e26 = addEdge(model, v2, v6);
    const e37 = addEdge(model, v3, v7);
    
    // Create body and shell
    const body = addBody(model);
    const shell = addShell(model, true); // closed shell
    addShellToBody(model, body, shell);
    
    // Create surfaces for each face (all planar)
    const surfBottom = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, -1, 0)));
    const surfTop = addSurface(model, createPlaneSurface(vec3(0, s, 0), vec3(0, 1, 0)));
    const surfFront = addSurface(model, createPlaneSurface(vec3(0, 0, s), vec3(0, 0, 1)));
    const surfBack = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, -1)));
    const surfLeft = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(-1, 0, 0)));
    const surfRight = addSurface(model, createPlaneSurface(vec3(s, 0, 0), vec3(1, 0, 0)));
    
    // Create 6 faces and add to shell
    const faceBottom = addFace(model, surfBottom);
    const faceTop = addFace(model, surfTop);
    const faceFront = addFace(model, surfFront);
    const faceBack = addFace(model, surfBack);
    const faceLeft = addFace(model, surfLeft);
    const faceRight = addFace(model, surfRight);
    
    addFaceToShell(model, shell, faceBottom);
    addFaceToShell(model, shell, faceTop);
    addFaceToShell(model, shell, faceFront);
    addFaceToShell(model, shell, faceBack);
    addFaceToShell(model, shell, faceLeft);
    addFaceToShell(model, shell, faceRight);
    
    // Create half-edges for each face (outward-facing normal convention)
    // Each edge needs 2 half-edges (one for each adjacent face)
    
    // Bottom face (0,1,2,3) - normal pointing down, CCW when viewed from below
    const he_bottom_01 = addHalfEdge(model, e01, 1);
    const he_bottom_12 = addHalfEdge(model, e12, 1);
    const he_bottom_23 = addHalfEdge(model, e23, 1);
    const he_bottom_30 = addHalfEdge(model, e30, 1);
    const loopBottom = addLoop(model, [he_bottom_01, he_bottom_12, he_bottom_23, he_bottom_30]);
    addLoopToFace(model, faceBottom, loopBottom);
    
    // Top face (4,7,6,5) - normal pointing up, CCW when viewed from above
    const he_top_47 = addHalfEdge(model, e74, -1);
    const he_top_76 = addHalfEdge(model, e67, -1);
    const he_top_65 = addHalfEdge(model, e56, -1);
    const he_top_54 = addHalfEdge(model, e45, -1);
    const loopTop = addLoop(model, [he_top_47, he_top_76, he_top_65, he_top_54]);
    addLoopToFace(model, faceTop, loopTop);
    
    // Front face (3,2,6,7) - normal pointing +Z
    const he_front_32 = addHalfEdge(model, e23, -1);
    const he_front_26 = addHalfEdge(model, e26, 1);
    const he_front_67 = addHalfEdge(model, e67, 1);
    const he_front_73 = addHalfEdge(model, e37, -1);
    const loopFront = addLoop(model, [he_front_32, he_front_26, he_front_67, he_front_73]);
    addLoopToFace(model, faceFront, loopFront);
    
    // Back face (0,4,5,1) - normal pointing -Z
    const he_back_04 = addHalfEdge(model, e04, 1);
    const he_back_45 = addHalfEdge(model, e45, 1);
    const he_back_51 = addHalfEdge(model, e15, -1);
    const he_back_10 = addHalfEdge(model, e01, -1);
    const loopBack = addLoop(model, [he_back_04, he_back_45, he_back_51, he_back_10]);
    addLoopToFace(model, faceBack, loopBack);
    
    // Left face (0,3,7,4) - normal pointing -X
    const he_left_03 = addHalfEdge(model, e30, -1);
    const he_left_37 = addHalfEdge(model, e37, 1);
    const he_left_74 = addHalfEdge(model, e74, 1);
    const he_left_40 = addHalfEdge(model, e04, -1);
    const loopLeft = addLoop(model, [he_left_03, he_left_37, he_left_74, he_left_40]);
    addLoopToFace(model, faceLeft, loopLeft);
    
    // Right face (1,5,6,2) - normal pointing +X
    const he_right_15 = addHalfEdge(model, e15, 1);
    const he_right_56 = addHalfEdge(model, e56, 1);
    const he_right_62 = addHalfEdge(model, e26, -1);
    const he_right_21 = addHalfEdge(model, e12, -1);
    const loopRight = addLoop(model, [he_right_15, he_right_56, he_right_62, he_right_21]);
    addLoopToFace(model, faceRight, loopRight);
    
    // Set up twins (each edge should have exactly 2 half-edges)
    setHalfEdgeTwin(model, he_bottom_01, he_back_10);
    setHalfEdgeTwin(model, he_bottom_12, he_right_21);
    setHalfEdgeTwin(model, he_bottom_23, he_front_32);
    setHalfEdgeTwin(model, he_bottom_30, he_left_03);
    
    setHalfEdgeTwin(model, he_top_47, he_left_74);
    setHalfEdgeTwin(model, he_top_76, he_front_67);
    setHalfEdgeTwin(model, he_top_65, he_right_56);
    setHalfEdgeTwin(model, he_top_54, he_back_45);
    
    setHalfEdgeTwin(model, he_back_04, he_left_40);
    setHalfEdgeTwin(model, he_back_51, he_right_15);
    setHalfEdgeTwin(model, he_front_26, he_right_62);
    setHalfEdgeTwin(model, he_front_73, he_left_37);
    
    return body;
  }

  it('should create a cube with correct entity counts', () => {
    const model = createEmptyModel(ctx);
    createCube(model, 1);
    
    const stats = getModelStats(model);
    
    expect(stats.vertices).toBe(8);
    expect(stats.edges).toBe(12);
    expect(stats.halfEdges).toBe(24); // 12 edges * 2 half-edges each
    expect(stats.loops).toBe(6); // 6 faces, 1 loop each
    expect(stats.faces).toBe(6);
    expect(stats.shells).toBe(1);
    expect(stats.bodies).toBe(1);
    expect(stats.surfaces).toBe(6);
  });

  it('should have consistent half-edge loops', () => {
    const model = createEmptyModel(ctx);
    createCube(model, 1);
    
    // Check that each face's loop has 4 half-edges forming a closed cycle
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const faceId = asFaceId(faceIdx);
      const loopCount = getFaceLoopCount(model, faceId);
      expect(loopCount).toBe(1);
      
      const outerLoop = getFaceOuterLoop(model, faceId);
      expect(outerLoop).not.toBeNull();
      
      const heCount = getLoopHalfEdgeCount(model, outerLoop!);
      expect(heCount).toBe(4);
      
      // Verify the loop is closed (iterating returns to start)
      const halfEdges = [...iterateLoopHalfEdges(model, outerLoop!)];
      expect(halfEdges).toHaveLength(4);
      
      // Verify next/prev consistency
      for (let i = 0; i < halfEdges.length; i++) {
        const he = halfEdges[i];
        const nextHe = halfEdges[(i + 1) % halfEdges.length];
        expect(getHalfEdgeNext(model, he)).toBe(nextHe);
        expect(getHalfEdgePrev(model, nextHe)).toBe(he);
      }
    }
  });

  it('should have all edges with twin half-edges', () => {
    const model = createEmptyModel(ctx);
    createCube(model, 1);
    
    // Check that every half-edge has a twin
    for (let heIdx = 0; heIdx < model.halfEdges.count; heIdx++) {
      const heId = heIdx as HalfEdgeId;
      const twin = getHalfEdgeTwin(model, heId);
      
      // Each half-edge should have a twin
      expect(twin).not.toBe(NULL_ID);
      
      // Twin's twin should be the original
      expect(getHalfEdgeTwin(model, twin)).toBe(heId);
      
      // They should share the same edge
      expect(getHalfEdgeEdge(model, heId)).toBe(getHalfEdgeEdge(model, twin));
      
      // They should have opposite directions
      expect(getHalfEdgeDirection(model, heId)).toBe(-getHalfEdgeDirection(model, twin));
    }
  });

  it('should have vertex connectivity forming closed loops', () => {
    const model = createEmptyModel(ctx);
    createCube(model, 1);
    
    // For each loop, the end vertex of each half-edge should equal start of next
    for (let loopIdx = 0; loopIdx < model.loops.count; loopIdx++) {
      const loopId = asLoopId(loopIdx);
      const halfEdges = [...iterateLoopHalfEdges(model, loopId)];
      
      for (let i = 0; i < halfEdges.length; i++) {
        const he = halfEdges[i];
        const nextHe = halfEdges[(i + 1) % halfEdges.length];
        
        const endVertex = getHalfEdgeEndVertex(model, he);
        const nextStartVertex = getHalfEdgeStartVertex(model, nextHe);
        
        expect(endVertex).toBe(nextStartVertex);
      }
    }
  });
});
