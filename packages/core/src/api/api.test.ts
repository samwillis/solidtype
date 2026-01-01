/**
 * Tests for the Object-Oriented API
 *
 * NOTE: These tests are SKIPPED because they test the old TopoModel-based API.
 * The API has been refactored to use OpenCascade.js (OCCT) which requires WASM
 * loading that doesn't work in Node.js without special configuration.
 *
 * See SolidSession.test.ts for the new OCCT-based tests.
 */

import { describe, it, expect } from "vitest";
import { SolidSession, Sketch } from "./index.js";

// Skip all old API tests - they use the deprecated TopoModel-based architecture
describe.skip(`Object-Oriented API (Legacy - TopoModel-based)`, () => {
  it(`should pass smoke test`, () => {
    expect(true).toBe(true);
  });

  describe(`SolidSession`, () => {
    it(`should create a session`, () => {
      const session = new SolidSession();
      expect(session).toBeDefined();
    });

    it(`should extrude a rectangle profile`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);

      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
      });

      expect(result.success).toBe(true);
      expect(result.body).toBeInstanceOf(Body);
    });

    it(`should get faces from extruded body`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);

      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
      });

      const faces = result.body!.getFaces();
      // A rectangular extrusion should have 6 faces
      expect(faces.length).toBe(6);

      for (const face of faces) {
        expect(face).toBeInstanceOf(Face);
      }
    });

    it(`should tessellate an extruded body`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);

      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
      });

      const mesh = result.body!.tessellate();

      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.indices.length).toBeGreaterThan(0);
    });

    it(`should create persistent refs for extruded faces`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);

      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
      });

      // Feature ID should be assigned
      expect(result.featureId).toBeDefined();

      // Persistent refs for top and bottom caps
      expect(result.topCapRefs).toBeDefined();
      expect(result.topCapRefs!.length).toBe(1);
      expect(result.bottomCapRefs).toBeDefined();
      expect(result.bottomCapRefs!.length).toBe(1);

      // Side face refs
      expect(result.sideRefs).toBeDefined();
      expect(result.sideRefs![0].length).toBe(4);
    });

    it(`should resolve persistent refs`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);

      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
      });

      const topCapRef = result.topCapRefs![0];
      const resolved = result.body!.resolve(topCapRef);

      expect(resolved).not.toBeNull();
      expect(resolved).toBeInstanceOf(Face);
    });

    it(`should perform boolean union`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();

      const profile1 = session.createRectangleProfile(plane, 10, 10, 0, 0);
      const result1 = session.extrude(profile1, {
        operation: `add`,
        distance: 5,
      });

      const profile2 = session.createRectangleProfile(plane, 10, 10, 5, 0);
      const result2 = session.extrude(profile2, {
        operation: `add`,
        distance: 5,
      });

      const unionResult = session.union(result1.body!, result2.body!);

      expect(unionResult.success).toBe(true);
      expect(unionResult.body).toBeInstanceOf(Body);
    });

    it(`should perform boolean subtract`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();

      const profile1 = session.createRectangleProfile(plane, 20, 20, 0, 0);
      const result1 = session.extrude(profile1, {
        operation: `add`,
        distance: 10,
      });

      const profile2 = session.createRectangleProfile(plane, 5, 5, 0, 0);
      const result2 = session.extrude(profile2, {
        operation: `add`,
        distance: 15,
      });

      const subtractResult = session.subtract(result1.body!, result2.body!);

      expect(subtractResult.success).toBe(true);
      expect(subtractResult.body).toBeInstanceOf(Body);
    });

    it(`should revolve a profile`, () => {
      const session = new SolidSession();
      const plane = session.getZXPlane();

      // Create a profile offset from Y axis
      const profile = session.createRectangleProfile(plane, 2, 5, 5, 0);

      const result = session.revolve(profile, {
        operation: `add`,
        axis: { origin: vec3(0, 0, 0), direction: vec3(0, 1, 0) },
        segments: 8,
      });

      expect(result.success).toBe(true);
      expect(result.body).toBeInstanceOf(Body);
    });

    it(`should select face by ray and find existing ref`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);

      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
      });

      expect(result.success).toBe(true);

      // Ray pointing down at the top face (from above)
      const selection = result.body!.selectFaceByRay({
        origin: vec3(0, 0, 10),
        direction: vec3(0, 0, -1),
      });

      expect(selection).not.toBeNull();
      expect(selection!.face).toBeInstanceOf(Face);
      expect(selection!.distance).toBeGreaterThan(0);

      // The face was created by extrude, so it should have a PersistentRef
      expect(selection!.persistentRef).not.toBeNull();
    });

    it(`should use getRefForFace to find refs directly`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const profile = session.createRectangleProfile(plane, 10, 10);

      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
      });

      expect(result.success).toBe(true);

      // Get all faces
      const faces = result.body!.getFaces();
      expect(faces.length).toBe(6);

      // Each face should have a PersistentRef
      for (const face of faces) {
        const ref = result.body!.getRefForFace(face.id);
        expect(ref).not.toBeNull();
      }
    });

    it(`should track refs through boolean operations`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();

      // Create first box
      const profile1 = session.createRectangleProfile(plane, 10, 10, 0, 0);
      const result1 = session.extrude(profile1, {
        operation: `add`,
        distance: 5,
      });

      // Save the top cap ref from first extrude
      const originalTopCapRef = result1.topCapRefs![0];

      // Create second overlapping box
      const profile2 = session.createRectangleProfile(plane, 10, 10, 5, 0);
      const result2 = session.extrude(profile2, {
        operation: `add`,
        distance: 5,
      });

      // Union them
      const unionResult = session.union(result1.body!, result2.body!);
      expect(unionResult.success).toBe(true);

      // The original ref should still resolve to a face in the result body
      const resolved = unionResult.body!.resolve(originalTopCapRef);
      expect(resolved).not.toBeNull();
      expect(resolved).toBeInstanceOf(Face);
    });
  });

  describe(`Sketch`, () => {
    it(`should create a sketch`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const sketch = session.createSketch(plane, `test-sketch`);

      expect(sketch).toBeInstanceOf(Sketch);
      expect(sketch.getPlane()).toBe(plane);
    });

    it(`should add points and lines`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const sketch = session.createSketch(plane);

      const p1 = sketch.addPoint(0, 0);
      const p2 = sketch.addPoint(10, 0);
      const line = sketch.addLine(p1, p2);

      expect(sketch.getPoint(p1)).toBeDefined();
      expect(sketch.getPoint(p2)).toBeDefined();
      expect(sketch.getEntity(line)).toBeDefined();
    });

    it(`should add rectangle`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const sketch = session.createSketch(plane);

      const rect = sketch.addRectangle(0, 0, 10, 10);

      expect(rect.corners.length).toBe(4);
      expect(rect.sides.length).toBe(4);
    });

    it(`should convert to profile`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const sketch = session.createSketch(plane);

      sketch.addRectangle(0, 0, 10, 10);
      const profile = sketch.toProfile();

      expect(profile).not.toBeNull();
      expect(profile!.loops.length).toBeGreaterThan(0);
    });

    it(`should extrude sketch directly`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();
      const sketch = session.createSketch(plane);

      sketch.addRectangle(-5, -5, 10, 10);

      const result = session.extrudeSketch(sketch, {
        operation: `add`,
        distance: 5,
      });

      expect(result.success).toBe(true);
      expect(result.body).toBeInstanceOf(Body);
    });
  });

  describe(`sketch-based boolean operations (app-like flow)`, () => {
    it(`should union two sketch-based extrusions`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();

      // First extrusion: 4x4x2 box at origin
      const sketch1 = session.createSketch(plane);
      sketch1.addRectangle(-2, -2, 4, 4);
      const result1 = session.extrudeSketch(sketch1, {
        operation: `add`,
        distance: 2,
      });
      expect(result1.success).toBe(true);
      expect(result1.body).toBeDefined();

      // Second extrusion: 2x2x4 at corner
      const sketch2 = session.createSketch(plane);
      sketch2.addRectangle(0, 0, 2, 2);
      const result2 = session.extrudeSketch(sketch2, {
        operation: `add`,
        distance: 4,
      });
      expect(result2.success).toBe(true);
      expect(result2.body).toBeDefined();

      // Union the two bodies
      const unionResult = session.union(result1.body!, result2.body!);
      expect(unionResult.success).toBe(true);
      expect(unionResult.body).toBeDefined();

      // L-shaped union should have multiple faces
      const faces = unionResult.body!.getFaces();
      expect(faces.length).toBeGreaterThanOrEqual(10);

      // Tessellate and verify valid mesh
      const mesh = unionResult.body!.tessellate();
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.normals.length).toBeGreaterThan(0);
      expect(mesh.indices.length).toBeGreaterThan(0);
    });

    it(`should subtract sketch-based extrusion (through cut)`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();

      // Base: 4x4x2 box
      const sketch1 = session.createSketch(plane);
      sketch1.addRectangle(-2, -2, 4, 4);
      const result1 = session.extrudeSketch(sketch1, {
        operation: `add`,
        distance: 2,
      });
      expect(result1.success).toBe(true);

      // Tool: 2x2x4 through the center
      const sketch2 = session.createSketch(plane);
      sketch2.addRectangle(-1, -1, 2, 2);
      const result2 = session.extrudeSketch(sketch2, {
        operation: `add`,
        distance: 4,
      });
      expect(result2.success).toBe(true);

      // Subtract
      const subResult = session.subtract(result1.body!, result2.body!);
      expect(subResult.success).toBe(true);
      expect(subResult.body).toBeDefined();

      // Through-cut should have 8-16 faces (varies based on face splitting/merging)
      const faces = subResult.body!.getFaces();
      expect(faces.length).toBeGreaterThanOrEqual(8);
      expect(faces.length).toBeLessThanOrEqual(16);

      // Tessellate and verify
      const mesh = subResult.body!.tessellate();
      expect(mesh.positions.length).toBeGreaterThan(0);

      // Verify no NaN values
      for (let i = 0; i < mesh.positions.length; i++) {
        expect(Number.isFinite(mesh.positions[i])).toBe(true);
      }
    });

    it(`should handle sequential sketch-based operations`, () => {
      const session = new SolidSession();
      const plane = session.getXYPlane();

      // First extrusion
      const sketch1 = session.createSketch(plane);
      sketch1.addRectangle(-3, -3, 6, 6);
      const result1 = session.extrudeSketch(sketch1, {
        operation: `add`,
        distance: 2,
      });
      expect(result1.success).toBe(true);

      // Second extrusion (to union)
      const sketch2 = session.createSketch(plane);
      sketch2.addRectangle(1, 1, 2, 2);
      const result2 = session.extrudeSketch(sketch2, {
        operation: `add`,
        distance: 4,
      });
      expect(result2.success).toBe(true);

      // Union
      const unionResult = session.union(result1.body!, result2.body!);
      expect(unionResult.success).toBe(true);

      // Third extrusion (to subtract)
      const sketch3 = session.createSketch(plane);
      sketch3.addRectangle(-1, -1, 1, 1);
      const result3 = session.extrudeSketch(sketch3, {
        operation: `add`,
        distance: 4,
      });
      expect(result3.success).toBe(true);

      // Subtract from the union result
      const subResult = session.subtract(unionResult.body!, result3.body!);
      expect(subResult.success).toBe(true);
      expect(subResult.body).toBeDefined();

      // Verify faces exist
      const faces = subResult.body!.getFaces();
      expect(faces.length).toBeGreaterThan(6);

      // Tessellate and verify valid mesh
      const mesh = subResult.body!.tessellate();
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.indices.length).toBeGreaterThan(0);

      // Check all indices are valid
      const vertexCount = mesh.positions.length / 3;
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(vertexCount);
      }
    });
  });
});
