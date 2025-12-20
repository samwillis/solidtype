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
  addLoopToFace,
  addFace,
  addFaceToShell,
  addShell,
  addShellToBody,
  setShellClosed,
  addBody,
  addSurface,
  type TopoModel,
  type BodyId,
  NULL_ID,
  asSurfaceIndex,
  asLoopId,
} from './model.js';
import {
  validateModel,
  isValidModel,
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
    const shell = addShell(model, false); // open shell
    addShellToBody(model, body, shell);
    
    const face = addFace(model, surfaceIdx);
    addFaceToShell(model, shell, face);
    
    const loop = addLoop(model, [he0, he1, he2]);
    addLoopToFace(model, face, loop);
    
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
    const shell = addShell(model, true); // closed
    addShellToBody(model, body, shell);
    
    const surfBottom = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, -1, 0)));
    const surfTop = addSurface(model, createPlaneSurface(vec3(0, s, 0), vec3(0, 1, 0)));
    const surfFront = addSurface(model, createPlaneSurface(vec3(0, 0, s), vec3(0, 0, 1)));
    const surfBack = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, -1)));
    const surfLeft = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(-1, 0, 0)));
    const surfRight = addSurface(model, createPlaneSurface(vec3(s, 0, 0), vec3(1, 0, 0)));
    
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
    
    // Bottom face
    const he_bottom_01 = addHalfEdge(model, e01, 1);
    const he_bottom_12 = addHalfEdge(model, e12, 1);
    const he_bottom_23 = addHalfEdge(model, e23, 1);
    const he_bottom_30 = addHalfEdge(model, e30, 1);
    const loopBottom = addLoop(model, [he_bottom_01, he_bottom_12, he_bottom_23, he_bottom_30]);
    addLoopToFace(model, faceBottom, loopBottom);
    
    // Top face
    const he_top_47 = addHalfEdge(model, e74, -1);
    const he_top_76 = addHalfEdge(model, e67, -1);
    const he_top_65 = addHalfEdge(model, e56, -1);
    const he_top_54 = addHalfEdge(model, e45, -1);
    const loopTop = addLoop(model, [he_top_47, he_top_76, he_top_65, he_top_54]);
    addLoopToFace(model, faceTop, loopTop);
    
    // Front face
    const he_front_32 = addHalfEdge(model, e23, -1);
    const he_front_26 = addHalfEdge(model, e26, 1);
    const he_front_67 = addHalfEdge(model, e67, 1);
    const he_front_73 = addHalfEdge(model, e37, -1);
    const loopFront = addLoop(model, [he_front_32, he_front_26, he_front_67, he_front_73]);
    addLoopToFace(model, faceFront, loopFront);
    
    // Back face
    const he_back_04 = addHalfEdge(model, e04, 1);
    const he_back_45 = addHalfEdge(model, e45, 1);
    const he_back_51 = addHalfEdge(model, e15, -1);
    const he_back_10 = addHalfEdge(model, e01, -1);
    const loopBack = addLoop(model, [he_back_04, he_back_45, he_back_51, he_back_10]);
    addLoopToFace(model, faceBack, loopBack);
    
    // Left face
    const he_left_03 = addHalfEdge(model, e30, -1);
    const he_left_37 = addHalfEdge(model, e37, 1);
    const he_left_74 = addHalfEdge(model, e74, 1);
    const he_left_40 = addHalfEdge(model, e04, -1);
    const loopLeft = addLoop(model, [he_left_03, he_left_37, he_left_74, he_left_40]);
    addLoopToFace(model, faceLeft, loopLeft);
    
    // Right face
    const he_right_15 = addHalfEdge(model, e15, 1);
    const he_right_56 = addHalfEdge(model, e56, 1);
    const he_right_62 = addHalfEdge(model, e26, -1);
    const he_right_21 = addHalfEdge(model, e12, -1);
    const loopRight = addLoop(model, [he_right_15, he_right_56, he_right_62, he_right_21]);
    addLoopToFace(model, faceRight, loopRight);
    
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
      const shell = addShell(model);
      addShellToBody(model, body, shell);
      
      // Create face with invalid surface index
      const face = addFace(model, asSurfaceIndex(999)); // invalid surface
      addFaceToShell(model, shell, face);
      
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
      const dirMismatch = report.issues.filter(i => i.kind === 'twinDirectionMismatch');
      expect(dirMismatch.length).toBeGreaterThan(0);
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
      const _he1 = addHalfEdge(model, e, 1);
      const _he2 = addHalfEdge(model, e, -1);
      const _he3 = addHalfEdge(model, e, 1); // extra
      
      const report = validateModel(model, { checkManifold: true });
      
      expect(report.isValid).toBe(false);
      const nonManifold = report.issues.filter(i => i.kind === 'nonManifoldEdge');
      expect(nonManifold.length).toBeGreaterThan(0);
    });

    it('should detect boundary edges in closed shells as errors', () => {
      const model = createEmptyModel(ctx);
      
      // Create a single face and mark shell as closed (incorrect)
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 1, 1, 0);
      const v3 = addVertex(model, 0, 1, 0);
      
      const e01 = addEdge(model, v0, v1);
      const e12 = addEdge(model, v1, v2);
      const e23 = addEdge(model, v2, v3);
      const e30 = addEdge(model, v3, v0);
      
      const body = addBody(model);
      const shell = addShell(model, true); // claim it's closed
      addShellToBody(model, body, shell);
      
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = addFace(model, surface);
      addFaceToShell(model, shell, face);
      
      // Create half-edges but no twins (incomplete)
      const he01 = addHalfEdge(model, e01, 1);
      const he12 = addHalfEdge(model, e12, 1);
      const he23 = addHalfEdge(model, e23, 1);
      const he30 = addHalfEdge(model, e30, 1);
      
      const loop = addLoop(model, [he01, he12, he23, he30]);
      addLoopToFace(model, face, loop);
      
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
    it('should detect null vertex references in edges', () => {
      const model = createEmptyModel(ctx);
      
      // Create vertices but then create edge using NULL_ID as vertex
      addVertex(model, 0, 0, 0); // Create a valid vertex
      
      // Use the internal method to add an edge with invalid references
      // This tests that validation catches edges with null vertex references
      const body = addBody(model);
      const shell = addShell(model);
      addShellToBody(model, body, shell);
      
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = addFace(model, surface);
      addFaceToShell(model, shell, face);
      
      // Create edge with first vertex being NULL_ID
      const v0 = addVertex(model, 0, 0, 0);
      // Create an edge and then manually set its vertices to null via internal API
      const edge = addEdge(model, v0, v0);
      // Update edge to have null vertex using internal method
      model.setEdgeVertices(edge, NULL_ID as any, v0);
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const nullRef = report.issues.filter(i => i.kind === 'nullReference');
      expect(nullRef.length).toBeGreaterThan(0);
    });

    it('should detect face without loops', () => {
      const model = createEmptyModel(ctx);
      
      const body = addBody(model);
      const shell = addShell(model);
      addShellToBody(model, body, shell);
      
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = addFace(model, surface);
      addFaceToShell(model, shell, face);
      
      // Don't add any loops to the face
      
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
      const shell = addShell(model);
      addShellToBody(model, body, shell);
      
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = addFace(model, surface);
      addFaceToShell(model, shell, face);
      
      // Manually set up loop structure
      model.halfEdges.loop[he01] = 0;
      model.halfEdges.loop[he23] = 0;
      model.loops.face[0] = face;
      model.loops.firstHalfEdge[0] = he01;
      model.loops.halfEdgeCount[0] = 2;
      model.loops.flags[0] = 0;
      model.loops.count = 1;
      model.loops.liveCount = 1;
      
      // Add loop to face's loop array
      model.faceLoops[face] = [asLoopId(0)];
      
      const report = validateModel(model);
      
      // Should detect that vertex at end of he01 (v1) doesn't match start of he23 (v2)
      const vertexMismatch = report.issues.filter(i => i.kind === 'vertexMismatch');
      expect(vertexMismatch.length).toBeGreaterThan(0);
    });
  });

  describe('Consistency checks', () => {
    it('should detect loop-face reference mismatch', () => {
      const model = createEmptyModel(ctx);
      
      const body = addBody(model);
      const shell = addShell(model);
      addShellToBody(model, body, shell);
      
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      
      const face0 = addFace(model, surface);
      const face1 = addFace(model, surface);
      addFaceToShell(model, shell, face0);
      addFaceToShell(model, shell, face1);
      
      // Create a loop
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 0.5, 1, 0);
      
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      const e2 = addEdge(model, v2, v0);
      
      const he0 = addHalfEdge(model, e0, 1);
      const he1 = addHalfEdge(model, e1, 1);
      const he2 = addHalfEdge(model, e2, 1);
      
      const loop = addLoop(model, [he0, he1, he2]);
      
      // Add loop to face0 but set loop's face to face1 (mismatch)
      model.faceLoops[face0] = [loop];
      model.loops.face[loop] = face1;
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const mismatch = report.issues.filter(i => i.kind === 'loopFaceMismatch');
      expect(mismatch.length).toBeGreaterThan(0);
    });

    it('should detect face-shell reference mismatch', () => {
      const model = createEmptyModel(ctx);
      
      const body = addBody(model);
      const shell0 = addShell(model);
      const shell1 = addShell(model);
      addShellToBody(model, body, shell0);
      addShellToBody(model, body, shell1);
      
      const surface = addSurface(model, createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      
      const face = addFace(model, surface);
      
      // Add face to shell0's list but set face's shell to shell1 (mismatch)
      model.shellFaces[shell0] = [face];
      model.faces.shell[face] = shell1;
      
      // Add a loop to the face to avoid "no loops" error
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1, 0, 0);
      const v2 = addVertex(model, 0.5, 1, 0);
      const e0 = addEdge(model, v0, v1);
      const e1 = addEdge(model, v1, v2);
      const e2 = addEdge(model, v2, v0);
      const he0 = addHalfEdge(model, e0, 1);
      const he1 = addHalfEdge(model, e1, 1);
      const he2 = addHalfEdge(model, e2, 1);
      const loop = addLoop(model, [he0, he1, he2]);
      addLoopToFace(model, face, loop);
      
      const report = validateModel(model);
      
      expect(report.isValid).toBe(false);
      const mismatch = report.issues.filter(i => i.kind === 'faceShellMismatch');
      expect(mismatch.length).toBeGreaterThan(0);
    });
  });

  describe('Duplicate vertices', () => {
    it('should detect near-coincident vertices', () => {
      const model = createEmptyModel(ctx);
      
      // Create two vertices at nearly the same position
      addVertex(model, 0, 0, 0);
      addVertex(model, 1e-8, 1e-8, 0); // within tolerance
      addVertex(model, 1, 0, 0); // far away
      
      const report = validateModel(model, { checkDuplicateVertices: true });
      
      const duplicates = report.issues.filter(i => i.kind === 'duplicateVertex');
      expect(duplicates.length).toBe(1);
    });

    it('should not flag vertices that are far apart', () => {
      const model = createEmptyModel(ctx);
      
      addVertex(model, 0, 0, 0);
      addVertex(model, 1, 0, 0);
      addVertex(model, 0, 1, 0);
      
      const report = validateModel(model, { checkDuplicateVertices: true });
      
      const duplicates = report.issues.filter(i => i.kind === 'duplicateVertex');
      expect(duplicates.length).toBe(0);
    });
  });

  describe('Short edges', () => {
    it('should detect short edges', () => {
      const model = createEmptyModel(ctx);
      
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 1e-5, 0, 0); // very short edge
      const v2 = addVertex(model, 1, 0, 0); // normal length
      
      addEdge(model, v0, v1); // short edge
      addEdge(model, v1, v2); // normal edge
      
      const report = validateModel(model, { checkDegenerate: true, shortEdgeMultiplier: 1000 });
      
      const shortEdges = report.issues.filter(i => i.kind === 'shortEdge');
      expect(shortEdges.length).toBe(1);
    });
  });

  describe('Sliver faces', () => {
    it('should detect sliver faces with very poor aspect ratio', () => {
      const model = createEmptyModel(ctx);
      
      // Create a very thin triangle (sliver)
      const v0 = addVertex(model, 0, 0, 0);
      const v1 = addVertex(model, 10, 0, 0); // long edge
      const v2 = addVertex(model, 5, 0.001, 0); // very thin
      
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
      
      const report = validateModel(model, { 
        checkSlivers: true,
        sliverAspectRatioThreshold: 0.1 // 10% threshold
      });
      
      const slivers = report.issues.filter(i => i.kind === 'sliverFace');
      expect(slivers.length).toBe(1);
    });

    it('should not flag normal faces as slivers', () => {
      const model = createEmptyModel(ctx);
      createTriangleFace(model); // normal equilateral-ish triangle
      
      const report = validateModel(model, { checkSlivers: true });
      
      const slivers = report.issues.filter(i => i.kind === 'sliverFace');
      expect(slivers.length).toBe(0);
    });
  });
});
