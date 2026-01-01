/**
 * Tests for BREP topology validation
 */

import { describe, it, expect } from "vitest";
import { createNumericContext } from "../num/tolerance.js";
import { vec3 } from "../num/vec3.js";
import { createPlaneSurface } from "../geom/surface.js";
import { TopoModel } from "./TopoModel.js";
import { NULL_ID, asSurfaceIndex, asLoopId, type BodyId } from "./handles.js";
import { validateModel, isValidModel } from "./validate.js";

describe(`Validation`, () => {
  const ctx = createNumericContext();

  /**
   * Helper to create a simple valid triangle face
   */
  function createTriangleFace(model: TopoModel): BodyId {
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

    return body;
  }

  /**
   * Helper to create a simple closed cube
   */
  function createCube(model: TopoModel, size: number = 1): BodyId {
    const s = size;

    const v0 = model.addVertex(0, 0, 0);
    const v1 = model.addVertex(s, 0, 0);
    const v2 = model.addVertex(s, 0, s);
    const v3 = model.addVertex(0, 0, s);
    const v4 = model.addVertex(0, s, 0);
    const v5 = model.addVertex(s, s, 0);
    const v6 = model.addVertex(s, s, s);
    const v7 = model.addVertex(0, s, s);

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

    const body = model.addBody();
    const shell = model.addShell(true);
    model.addShellToBody(body, shell);

    const surfBottom = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, -1, 0)));
    const surfTop = model.addSurface(createPlaneSurface(vec3(0, s, 0), vec3(0, 1, 0)));
    const surfFront = model.addSurface(createPlaneSurface(vec3(0, 0, s), vec3(0, 0, 1)));
    const surfBack = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, -1)));
    const surfLeft = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(-1, 0, 0)));
    const surfRight = model.addSurface(createPlaneSurface(vec3(s, 0, 0), vec3(1, 0, 0)));

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

  describe(`Valid models`, () => {
    it(`should validate an empty model`, () => {
      const model = new TopoModel(ctx);
      const report = validateModel(model);

      expect(report.isValid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it(`should validate a simple triangle face (open shell)`, () => {
      const model = new TopoModel(ctx);
      createTriangleFace(model);

      const report = validateModel(model, { checkBoundary: false });

      expect(report.isValid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it(`should validate a cube (closed shell)`, () => {
      const model = new TopoModel(ctx);
      createCube(model, 1);

      const report = validateModel(model);

      expect(report.isValid).toBe(true);
      expect(report.errorCount).toBe(0);
    });

    it(`should report boundary edges as info for open shells`, () => {
      const model = new TopoModel(ctx);
      createTriangleFace(model);

      const report = validateModel(model, { checkBoundary: true });

      expect(report.infoCount).toBeGreaterThan(0);
      const boundaryIssues = report.issues.filter((i) => i.kind === `boundaryEdge`);
      expect(boundaryIssues.length).toBe(3);
    });

    it(`should pass isValidModel for valid models`, () => {
      const model = new TopoModel(ctx);
      createCube(model, 1);

      expect(isValidModel(model)).toBe(true);
    });
  });

  describe(`Invalid models - structural issues`, () => {
    it(`should detect broken loop cycles`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const e = model.addEdge(v0, v1);
      const he = model.addHalfEdge(e, 1);

      model.halfEdges.next[he] = 999;
      model.halfEdges.prev[999] = he;

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const brokenCycleIssues = report.issues.filter(
        (i) => i.kind === `invalidIndex` || i.kind === `brokenLoopCycle`
      );
      expect(brokenCycleIssues.length).toBeGreaterThan(0);
    });

    it(`should detect missing surface reference`, () => {
      const model = new TopoModel(ctx);

      const body = model.addBody();
      const shell = model.addShell();
      model.addShellToBody(body, shell);

      const face = model.addFace(asSurfaceIndex(999));
      model.addFaceToShell(shell, face);

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const surfaceMissing = report.issues.filter((i) => i.kind === `surfaceMissing`);
      expect(surfaceMissing.length).toBeGreaterThan(0);
    });

    it(`should detect twin mismatch`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const e = model.addEdge(v0, v1);

      const he1 = model.addHalfEdge(e, 1);
      const he2 = model.addHalfEdge(e, -1);
      const he3 = model.addHalfEdge(e, 1);

      model.halfEdges.twin[he1] = he2;
      model.halfEdges.twin[he2] = he3;
      model.halfEdges.twin[he3] = he2;

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const twinMismatch = report.issues.filter((i) => i.kind === `twinMismatch`);
      expect(twinMismatch.length).toBeGreaterThan(0);
    });

    it(`should detect half-edges with same direction as twin`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const e = model.addEdge(v0, v1);

      const he1 = model.addHalfEdge(e, 1);
      const he2 = model.addHalfEdge(e, 1);

      model.setHalfEdgeTwin(he1, he2);

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const dirMismatch = report.issues.filter((i) => i.kind === `twinDirectionMismatch`);
      expect(dirMismatch.length).toBeGreaterThan(0);
    });
  });

  describe(`Invalid models - degenerate entities`, () => {
    it(`should detect zero-length edges`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(0, 0, 0);
      model.addEdge(v0, v1);

      const report = validateModel(model, { checkDegenerate: true });

      const zeroLengthIssues = report.issues.filter((i) => i.kind === `zeroLengthEdge`);
      expect(zeroLengthIssues.length).toBe(1);
    });
  });

  describe(`Invalid models - manifold issues`, () => {
    it(`should detect non-manifold edges (more than 2 half-edges)`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const e = model.addEdge(v0, v1);

      model.addHalfEdge(e, 1);
      model.addHalfEdge(e, -1);
      model.addHalfEdge(e, 1);

      const report = validateModel(model, { checkManifold: true });

      expect(report.isValid).toBe(false);
      const nonManifold = report.issues.filter((i) => i.kind === `nonManifoldEdge`);
      expect(nonManifold.length).toBeGreaterThan(0);
    });

    it(`should detect boundary edges in closed shells as errors`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(1, 1, 0);
      const v3 = model.addVertex(0, 1, 0);

      const e01 = model.addEdge(v0, v1);
      const e12 = model.addEdge(v1, v2);
      const e23 = model.addEdge(v2, v3);
      const e30 = model.addEdge(v3, v0);

      const body = model.addBody();
      const shell = model.addShell(true);
      model.addShellToBody(body, shell);

      const surface = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = model.addFace(surface);
      model.addFaceToShell(shell, face);

      const he01 = model.addHalfEdge(e01, 1);
      const he12 = model.addHalfEdge(e12, 1);
      const he23 = model.addHalfEdge(e23, 1);
      const he30 = model.addHalfEdge(e30, 1);

      const loop = model.addLoop([he01, he12, he23, he30]);
      model.addLoopToFace(face, loop);

      const report = validateModel(model, { checkManifold: true });

      expect(report.isValid).toBe(false);
      const boundaryErrors = report.issues.filter(
        (i) => i.kind === `boundaryEdge` && i.severity === `error`
      );
      expect(boundaryErrors.length).toBeGreaterThan(0);
    });
  });

  describe(`Invalid models - reference issues`, () => {
    it(`should detect null vertex references in edges`, () => {
      const model = new TopoModel(ctx);

      model.addVertex(0, 0, 0);

      const body = model.addBody();
      const shell = model.addShell();
      model.addShellToBody(body, shell);

      const surface = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = model.addFace(surface);
      model.addFaceToShell(shell, face);

      const v0 = model.addVertex(0, 0, 0);
      const edge = model.addEdge(v0, v0);
      model.setEdgeVertices(edge, NULL_ID as any, v0);

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const nullRef = report.issues.filter((i) => i.kind === `nullReference`);
      expect(nullRef.length).toBeGreaterThan(0);
    });

    it(`should detect face without loops`, () => {
      const model = new TopoModel(ctx);

      const body = model.addBody();
      const shell = model.addShell();
      model.addShellToBody(body, shell);

      const surface = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = model.addFace(surface);
      model.addFaceToShell(shell, face);

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const noLoops = report.issues.filter(
        (i) => i.kind === `nullReference` && i.message.includes(`no loops`)
      );
      expect(noLoops.length).toBeGreaterThan(0);
    });
  });

  describe(`Vertex connectivity`, () => {
    it(`should detect vertex mismatch in half-edge sequence`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(2, 0, 0);
      const v3 = model.addVertex(3, 0, 0);

      const e01 = model.addEdge(v0, v1);
      const e23 = model.addEdge(v2, v3);

      const he01 = model.addHalfEdge(e01, 1);
      const he23 = model.addHalfEdge(e23, 1);

      model.halfEdges.next[he01] = he23;
      model.halfEdges.prev[he23] = he01;

      const body = model.addBody();
      const shell = model.addShell();
      model.addShellToBody(body, shell);

      const surface = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));
      const face = model.addFace(surface);
      model.addFaceToShell(shell, face);

      model.halfEdges.loop[he01] = 0;
      model.halfEdges.loop[he23] = 0;
      model.loops.face[0] = face;
      model.loops.firstHalfEdge[0] = he01;
      model.loops.halfEdgeCount[0] = 2;
      model.loops.flags[0] = 0;
      model.loops.count = 1;
      model.loops.liveCount = 1;

      model.faceLoops[face] = [asLoopId(0)];

      const report = validateModel(model);

      const vertexMismatch = report.issues.filter((i) => i.kind === `vertexMismatch`);
      expect(vertexMismatch.length).toBeGreaterThan(0);
    });
  });

  describe(`Consistency checks`, () => {
    it(`should detect loop-face reference mismatch`, () => {
      const model = new TopoModel(ctx);

      const body = model.addBody();
      const shell = model.addShell();
      model.addShellToBody(body, shell);

      const surface = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));

      const face0 = model.addFace(surface);
      const face1 = model.addFace(surface);
      model.addFaceToShell(shell, face0);
      model.addFaceToShell(shell, face1);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0.5, 1, 0);

      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);

      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);

      const loop = model.addLoop([he0, he1, he2]);

      model.faceLoops[face0] = [loop];
      model.loops.face[loop] = face1;

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const mismatch = report.issues.filter((i) => i.kind === `loopFaceMismatch`);
      expect(mismatch.length).toBeGreaterThan(0);
    });

    it(`should detect face-shell reference mismatch`, () => {
      const model = new TopoModel(ctx);

      const body = model.addBody();
      const shell0 = model.addShell();
      const shell1 = model.addShell();
      model.addShellToBody(body, shell0);
      model.addShellToBody(body, shell1);

      const surface = model.addSurface(createPlaneSurface(vec3(0, 0, 0), vec3(0, 0, 1)));

      const face = model.addFace(surface);

      model.shellFaces[shell0] = [face];
      model.faces.shell[face] = shell1;

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1, 0, 0);
      const v2 = model.addVertex(0.5, 1, 0);
      const e0 = model.addEdge(v0, v1);
      const e1 = model.addEdge(v1, v2);
      const e2 = model.addEdge(v2, v0);
      const he0 = model.addHalfEdge(e0, 1);
      const he1 = model.addHalfEdge(e1, 1);
      const he2 = model.addHalfEdge(e2, 1);
      const loop = model.addLoop([he0, he1, he2]);
      model.addLoopToFace(face, loop);

      const report = validateModel(model);

      expect(report.isValid).toBe(false);
      const mismatch = report.issues.filter((i) => i.kind === `faceShellMismatch`);
      expect(mismatch.length).toBeGreaterThan(0);
    });
  });

  describe(`Duplicate vertices`, () => {
    it(`should detect near-coincident vertices`, () => {
      const model = new TopoModel(ctx);

      model.addVertex(0, 0, 0);
      model.addVertex(1e-8, 1e-8, 0);
      model.addVertex(1, 0, 0);

      const report = validateModel(model, { checkDuplicateVertices: true });

      const duplicates = report.issues.filter((i) => i.kind === `duplicateVertex`);
      expect(duplicates.length).toBe(1);
    });

    it(`should not flag vertices that are far apart`, () => {
      const model = new TopoModel(ctx);

      model.addVertex(0, 0, 0);
      model.addVertex(1, 0, 0);
      model.addVertex(0, 1, 0);

      const report = validateModel(model, { checkDuplicateVertices: true });

      const duplicates = report.issues.filter((i) => i.kind === `duplicateVertex`);
      expect(duplicates.length).toBe(0);
    });
  });

  describe(`Short edges`, () => {
    it(`should detect short edges`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(1e-5, 0, 0);
      const v2 = model.addVertex(1, 0, 0);

      model.addEdge(v0, v1);
      model.addEdge(v1, v2);

      const report = validateModel(model, { checkDegenerate: true, shortEdgeMultiplier: 1000 });

      const shortEdges = report.issues.filter((i) => i.kind === `shortEdge`);
      expect(shortEdges.length).toBe(1);
    });
  });

  describe(`Sliver faces`, () => {
    it(`should detect sliver faces with very poor aspect ratio`, () => {
      const model = new TopoModel(ctx);

      const v0 = model.addVertex(0, 0, 0);
      const v1 = model.addVertex(10, 0, 0);
      const v2 = model.addVertex(5, 0.001, 0);

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

      const report = validateModel(model, {
        checkSlivers: true,
        sliverAspectRatioThreshold: 0.1,
      });

      const slivers = report.issues.filter((i) => i.kind === `sliverFace`);
      expect(slivers.length).toBe(1);
    });

    it(`should not flag normal faces as slivers`, () => {
      const model = new TopoModel(ctx);
      createTriangleFace(model);

      const report = validateModel(model, { checkSlivers: true });

      const slivers = report.issues.filter((i) => i.kind === `sliverFace`);
      expect(slivers.length).toBe(0);
    });
  });
});
