/**
 * Tests for BREP topology validation
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
  addFace,
  setFaceLoops,
  addShell,
  setShellFaces,
  setShellClosed,
  addBody,
  setBodyShells,
  addSurface,
  type TopoModel,
  type BodyId,
  asVertexId,
  asFaceId,
  asHalfEdgeId,
  NULL_ID,
} from './model.js';
import {
  validateModel,
  isValidModel,
  type ValidationReport,
} from './validate.js';

describe('Validation', () => {
  const ctx = createNumericContext();

  /**
   * Helper to create a simple valid triangle face
   */
  function createTriangleFace(model: TopoModel): BodyId {
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
    const shell = addShell(model, body, false); // open shell
    const face = addFace(model, shell, surfaceIdx);
    const loop = addLoop(model, face, [he0, he1, he2]);
    
    setFaceLoops(model, face, [loop]);
    setShellFaces(model, shell, [face]);
    setBodyShells(model, body, [shell]);
    
    return body;
  }

  /**
   * Helper to create a simple closed cube
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
    
    // Create 12 edges
    const e01 = addEdge(model, v0, v1);
    const e12 = addEdge(model, v1, v2);
    const e23 = addEdge(model, v2, v3);
    const e30 = addEdge(model, v3, v0);
    const e45 = addEdge(model, v4, v5);
    const e56 = addEdge(model, v5, v6);
    const e67 = addEdge(model, v6, v7);
    const e74 = addEdge(model, v7, v4);
    const e04 = addEdge(model, v0, v4);
    const e15 = addEdge(model, v1, v5);
    const e26 = addEdge(model, v2, v6);
    const e37 = addEdge(model, v3, v7);
    
    const body = addBody(model);
    const shell = addShell(model, body, true);
    
    const surfBottom = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, -1, 0)));
    const surfTop = addSurface(model, createPlaneSurface(vec3(0, s, 0), vec3(0, 1, 0)));
    const surfFront = addSurface(model, createPlaneSurface(vec3(0, 0, s), vec3(0, 0, 1)));
    const surfBack = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, -1)));
    const surfLeft = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(-1, 0, 0)));
    const surfRight = addSurface(model, createPlaneSurface(vec3(s, 0, 0), vec3(1, 0, 0)));
    
    const faceBottom = addFace(model, shell, surfBottom);
    const faceTop = addFace(model, shell, surfTop);
    const faceFront = addFace(model, shell, surfFront);
    const faceBack = addFace(model, shell, surfBack);
    const faceLeft = addFace(model, shell, surfLeft);
    const faceRight = addFace(model, shell, surfRight);
    
    setShellFaces(model, shell, [faceBottom, faceTop, faceFront, faceBack, faceLeft, faceRight]);
    setBodyShells(model, body, [shell]);
    
    // Bottom face
    const he_bottom_01 = addHalfEdge(model, e01, 1);
    const he_bottom_12 = addHalfEdge(model, e12, 1);
    const he_bottom_23 = addHalfEdge(model, e23, 1);
    const he_bottom_30 = addHalfEdge(model, e30, 1);
    const loopBottom = addLoop(model, faceBottom, [he_bottom_01, he_bottom_12, he_bottom_23, he_bottom_30]);
    setFaceLoops(model, faceBottom, [loopBottom]);
    
    // Top face
    const he_top_47 = addHalfEdge(model, e74, -1);
    const he_top_76 = addHalfEdge(model, e67, -1);
    const he_top_65 = addHalfEdge(model, e56, -1);
    const he_top_54 = addHalfEdge(model, e45, -1);
    const loopTop = addLoop(model, faceTop, [he_top_47, he_top_76, he_top_65, he_top_54]);
    setFaceLoops(model, faceTop, [loopTop]);
    
    // Front face
    const he_front_32 = addHalfEdge(model, e23, -1);
    const he_front_26 = addHalfEdge(model, e26, 1);
    const he_front_67 = addHalfEdge(model, e67, 1);
    const he_front_73 = addHalfEdge(model, e37, -1);
    const loopFront = addLoop(model, faceFront, [he_front_32, he_front_26, he_front_67, he_front_73]);
    setFaceLoops(model, faceFront, [loopFront]);
    
    // Back face
    const he_back_04 = addHalfEdge(model, e04, 1);
    const he_back_45 = addHalfEdge(model, e45, 1);
    const he_back_51 = addHalfEdge(model, e15, -1);
    const he_back_10 = addHalfEdge(model, e01, -1);
    const loopBack = addLoop(model, faceBack, [he_back_04, he_back_45, he_back_51, he_back_10]);
    setFaceLoops(model, faceBack, [loopBack]);
    
    // Left face
    const he_left_03 = addHalfEdge(model, e30, -1);
    const he_left_37 = addHalfEdge(model, e37, 1);
    const he_left_74 = addHalfEdge(model, e74, 1);
    const he_left_40 = addHalfEdge(model, e04, -1);
    const loopLeft = addLoop(model, faceLeft, [he_left_03, he_left_37, he_left_74, he_left_40]);
    setFaceLoops(model, faceLeft, [loopLeft]);
    
    // Right face
    const he_right_15 = addHalfEdge(model, e15, 1);
    const he_right_56 = addHalfEdge(model, e56, 1);
    const he_right_62 = addHalfEdge(model, e26, -1);
    const he_right_21 = addHalfEdge(model, e12, -1);
    const loopRight = addLoop(model, faceRight, [he_right_15, he_right_56, he_right_62, he_right_21]);
    setFaceLoops(model, faceRight, [loopRight]);
    
    // Set up twins
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

  describe('Valid models', () => {
    it('should validate an empty model', () => {
      const model = createEmptyModel(ctx);
      const report = validateModel(model);
      
      expect(report.isValid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it('should validate a simple triangle face (open shell)', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model);
      
      const report = validateModel(model, { checkBoundary: false });
      
      expect(report.isValid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it('should validate a cube (closed shell)', () => {
      const model = createEmptyModel(ctx);
      createCube(model, 1);
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it('should report boundary edges as info for open shells', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model);
      
      const report = validateModel(model, { checkBoundary: true });
      
      // Should report boundary edges as info
      expect(report.infoCount).toBeGreaterThan(0);
      const boundaryIssues = report.issues.filter(i => i.kind === 'boundaryEdge');
      expect(boundaryIssues.length).toBe(3); // triangle has 3 boundary edges
    });

    it('should pass isValidModel for valid models', () => {
      const model = createEmptyModel(ctx);
      createCube(model, 1);
      
      expect(isValidModel(model)).toBe(true);
    });
  });

  describe('Invalid models - structural issues', () => {
    it('should detect broken loop cycles', () => {
      const model = createEmptyModel(ctx);
      
      // Create a half-edge with broken next/prev
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const e = addEdge(model, v0, v1);
      const he = addHalfEdge(model, e, 1);
      
      // Manually corrupt the next pointer to create a broken cycle
      model.halfEdges.next[he] = 999; // invalid
      model.halfEdges.prev[999] = he;
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const brokenCycleIssues = report.issues.filter(i => 
        i.kind === 'invalidIndex' || i.kind === 'brokenLoopCycle'
      );
      expect(brokenCycleIssues.length).toBeGreaterThan(0);
    });

    it('should detect missing surface reference', () => {
      const model = createEmptyModel(ctx);
      
      const body = addBody(model);
      const shell = addShell(model, body);
      
      // Create face with invalid surface index
      const face = addFace(model, shell, 999 as any); // invalid surface
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const surfaceMissing = report.issues.filter(i => i.kind === 'surfaceMissing');
      expect(surfaceMissing.length).toBeGreaterThan(0);
    });

    it('should detect twin mismatch', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const e = addEdge(model, v0, v1);
      
      const he1 = addHalfEdge(model, e, 1);
      const he2 = addHalfEdge(model, e, -1);
      const he3 = addHalfEdge(model, e, 1); // extra half-edge
      
      // Set up incorrect twin (he1 points to he2, but he2 points to he3)
      model.halfEdges.twin[he1] = he2;
      model.halfEdges.twin[he2] = he3;
      model.halfEdges.twin[he3] = he2;
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const twinMismatch = report.issues.filter(i => i.kind === 'twinMismatch');
      expect(twinMismatch.length).toBeGreaterThan(0);
    });

    it('should detect half-edges with same direction as twin', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const e = addEdge(model, v0, v1);
      
      // Create two half-edges with the same direction (wrong)
      const he1 = addHalfEdge(model, e, 1);
      const he2 = addHalfEdge(model, e, 1); // should be -1
      
      setHalfEdgeTwin(model, he1, he2);
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const pairMismatch = report.issues.filter(i => i.kind === 'halfEdgePairMismatch');
      expect(pairMismatch.length).toBeGreaterThan(0);
    });
  });

  describe('Invalid models - degenerate entities', () => {
    it('should detect zero-length edges', () => {
      const model = createEmptyModel(ctx);
      
      // Create an edge with the same start and end position
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 0, 0, 0); // same position
      const e = addEdge(model, v0, v1);
      
      const report = validateModel(model, { checkDegenerate: true });
      
      const zeroLengthIssues = report.issues.filter(i => i.kind === 'zeroLengthEdge');
      expect(zeroLengthIssues.length).toBe(1);
    });
  });

  describe('Invalid models - manifold issues', () => {
    it('should detect non-manifold edges (more than 2 half-edges)', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const e = addEdge(model, v0, v1);
      
      // Create 3 half-edges for the same edge (non-manifold)
      const he1 = addHalfEdge(model, e, 1);
      const he2 = addHalfEdge(model, e, -1);
      const he3 = addHalfEdge(model, e, 1); // extra
      
      const report = validateModel(model, { checkManifold: true });
      
      expect(report.isValid).toBe(false);
      const nonManifold = report.issues.filter(i => i.kind === 'nonManifoldEdge');
      expect(nonManifold.length).toBeGreaterThan(0);
    });

    it('should detect boundary edges in closed shells as errors', () => {
      const model = createEmptyModel(ctx);
      
      // Create a cube but don't create twins for one edge
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 1, 1, 0);
      const v3 = addVertex(model, 0, 1, 0);
      
      const e01 = addEdge(model, v0, v1);
      const e12 = addEdge(model, v1, v2);
      const e23 = addEdge(model, v2, v3);
      const e30 = addEdge(model, v3, v0);
      
      const body = addBody(model);
      const shell = addShell(model, body, true); // claim it's closed
      
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = addFace(model, shell, surface);
      
      // Create half-edges but no twins (incomplete)
      const he01 = addHalfEdge(model, e01, 1);
      const he12 = addHalfEdge(model, e12, 1);
      const he23 = addHalfEdge(model, e23, 1);
      const he30 = addHalfEdge(model, e30, 1);
      
      const loop = addLoop(model, face, [he01, he12, he23, he30]);
      setFaceLoops(model, face, [loop]);
      setShellFaces(model, shell, [face]);
      setBodyShells(model, body, [shell]);
      
      const report = validateModel(model, { checkManifold: true });
      
      // Should report boundary edges as errors (shell claims to be closed)
      expect(report.isValid).toBe(false);
      const boundaryErrors = report.issues.filter(
        i => i.kind === 'boundaryEdge' && i.severity === 'error'
      );
      expect(boundaryErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Invalid models - reference issues', () => {
    it('should detect invalid vertex references in edges', () => {
      const model = createEmptyModel(ctx);
      
      // Create edge referencing non-existent vertices
      model.edges.vStart[0] = 999;
      model.edges.vEnd[0] = 998;
      model.edges.curveIndex[0] = NULL_ID;
      model.edges.halfEdge[0] = NULL_ID;
      model.edges.flags[0] = 0;
      model.edges.count = 1;
      model.edges.liveCount = 1;
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const invalidIndex = report.issues.filter(i => i.kind === 'invalidIndex');
      expect(invalidIndex.length).toBeGreaterThan(0);
    });

    it('should detect face without loops', () => {
      const model = createEmptyModel(ctx);
      
      const body = addBody(model);
      const shell = addShell(model, body);
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = addFace(model, shell, surface);
      
      // Don't add any loops to the face
      setShellFaces(model, shell, [face]);
      setBodyShells(model, body, [shell]);
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const noLoops = report.issues.filter(i => 
        i.kind === 'nullReference' && i.message.includes('no loops')
      );
      expect(noLoops.length).toBeGreaterThan(0);
    });
  });

  describe('Vertex connectivity', () => {
    it('should detect vertex mismatch in half-edge sequence', () => {
      const model = createEmptyModel(ctx);
      
      // Create vertices and edges that don't connect properly
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 2, 0, 0);
      const v3 = addVertex(model, 3, 0, 0); // disconnected
      
      // Edge from v0 to v1
      const e01 = addEdge(model, v0, v1);
      // Edge from v2 to v3 (not connected!)
      const e23 = addEdge(model, v2, v3);
      
      // Half-edges that should form a loop but vertices don't match
      const he01 = addHalfEdge(model, e01, 1); // ends at v1
      const he23 = addHalfEdge(model, e23, 1); // starts at v2 (mismatch!)
      
      // Link them together incorrectly
      model.halfEdges.next[he01] = he23;
      model.halfEdges.prev[he23] = he01;
      
      const body = addBody(model);
      const shell = addShell(model, body);
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = addFace(model, shell, surface);
      
      model.halfEdges.loop[he01] = 0;
      model.halfEdges.loop[he23] = 0;
      model.loops.face[0] = face;
      model.loops.firstHalfEdge[0] = he01;
      model.loops.halfEdgeCount[0] = 2;
      model.loops.flags[0] = 0;
      model.loops.count = 1;
      model.loops.liveCount = 1;
      
      setShellFaces(model, shell, [face]);
      setBodyShells(model, body, [shell]);
      model.faces.firstLoop[face] = 0;
      model.faces.loopCount[face] = 1;
      
      const report = validateModel(model);
      
      // Should detect that vertex at end of he01 (v1) doesn't match start of he23 (v2)
      const vertexMismatch = report.issues.filter(i => i.kind === 'vertexMismatch');
      expect(vertexMismatch.length).toBeGreaterThan(0);
    });
  });
});
