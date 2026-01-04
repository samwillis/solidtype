/**
 * Tests for the OCCT-based SolidSession
 *
 * These tests verify the new OpenCascade.js integration.
 *
 * NOTE: These tests are skipped by default because they require WASM loading
 * which doesn't work well in Node.js/vitest without additional configuration.
 * Run these tests in a browser environment or configure vitest for WASM support.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SolidSession } from "../../src/api/SolidSession.js";
import { XY_PLANE, createDatumPlaneFromNormal } from "../../src/model/planes.js";
import { vec3 } from "../../src/num/vec3.js";

// OCCT tests - enabled with Node.js wasmBinary loading
describe(`SolidSession (OCCT)`, () => {
  let session: SolidSession;

  beforeAll(async () => {
    session = new SolidSession();
    await session.init();
  });

  afterAll(() => {
    session.dispose();
  });

  describe(`initialization`, () => {
    it(`initializes successfully`, () => {
      expect(session.isInitialized()).toBe(true);
    });

    it(`init is idempotent`, async () => {
      await session.init(); // Should not throw
      expect(session.isInitialized()).toBe(true);
    });
  });

  describe(`primitives`, () => {
    it(`creates a box`, () => {
      const bodyId = session.createBox(10, 20, 30);
      expect(session.hasBody(bodyId)).toBe(true);

      const mesh = session.tessellate(bodyId);
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.indices.length).toBeGreaterThan(0);

      // Box should have at least 8 vertices
      expect(mesh.positions.length / 3).toBeGreaterThanOrEqual(8);

      // Clean up
      session.deleteBody(bodyId);
      expect(session.hasBody(bodyId)).toBe(false);
    });

    it(`creates a centered box`, () => {
      const bodyId = session.createBox(10, 10, 10, true);
      const bbox = session.getBoundingBox(bodyId);

      // Centered box should have min at -5, max at 5
      expect(bbox.min[0]).toBeCloseTo(-5, 1);
      expect(bbox.max[0]).toBeCloseTo(5, 1);

      session.deleteBody(bodyId);
    });

    it(`creates a cylinder`, () => {
      const bodyId = session.createCylinder(5, 20);
      expect(session.hasBody(bodyId)).toBe(true);

      const mesh = session.tessellate(bodyId);
      expect(mesh.positions.length).toBeGreaterThan(0);

      session.deleteBody(bodyId);
    });

    it(`creates a sphere`, () => {
      const bodyId = session.createSphere(10);
      expect(session.hasBody(bodyId)).toBe(true);

      const mesh = session.tessellate(bodyId);
      expect(mesh.positions.length).toBeGreaterThan(0);

      session.deleteBody(bodyId);
    });
  });

  describe(`profiles`, () => {
    it(`creates a rectangle profile`, () => {
      const profile = session.createRectangleProfile(XY_PLANE, 10, 20);
      expect(profile).toBeDefined();
      expect(profile.loops.length).toBe(1);
    });

    it(`creates a circle profile`, () => {
      const profile = session.createCircleProfile(XY_PLANE, 5);
      expect(profile).toBeDefined();
      expect(profile.loops.length).toBe(1);
    });

    it(`creates a polygon profile`, () => {
      const profile = session.createPolygonProfile(XY_PLANE, [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]);
      expect(profile).toBeDefined();
      expect(profile.loops.length).toBe(1);
    });
  });

  describe(`extrude`, () => {
    it(`extrudes a rectangle profile`, () => {
      const profile = session.createRectangleProfile(XY_PLANE, 10, 20);
      const result = session.extrude(profile, {
        operation: `new`,
        distance: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(result.value);
        expect(mesh.positions.length).toBeGreaterThan(0);

        session.deleteBody(result.value);
      }
    });

    it(`extrudes a circle profile`, () => {
      const profile = session.createCircleProfile(XY_PLANE, 5);
      const result = session.extrude(profile, {
        operation: `new`,
        distance: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(result.value);
        expect(mesh.positions.length).toBeGreaterThan(0);

        session.deleteBody(result.value);
      }
    });

    it(`extrudes with add operation`, () => {
      // Create base body
      const baseId = session.createBox(20, 20, 5);

      // Create profile on top of the box
      const topPlane = session.createDatumPlane(vec3(0, 0, 5), vec3(0, 0, 1));
      const profile = session.createRectangleProfile(topPlane, 5, 5);

      // Extrude and add to base
      const result = session.extrude(profile, {
        operation: `add`,
        distance: 5,
        targetBody: baseId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(baseId); // Should modify existing body
        const mesh = session.tessellate(baseId);
        expect(mesh.positions.length).toBeGreaterThan(0);
      }

      session.deleteBody(baseId);
    });

    it(`extrudes with cut operation`, () => {
      // Create base box
      const baseId = session.createBox(20, 20, 20, true);

      // Create profile for the cut
      const profile = session.createRectangleProfile(XY_PLANE, 5, 5);

      // Extrude and cut from base
      const result = session.extrude(profile, {
        operation: `cut`,
        distance: 25, // Through the entire box
        targetBody: baseId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(baseId);
        expect(mesh.positions.length).toBeGreaterThan(0);
      }

      session.deleteBody(baseId);
    });
  });

  describe(`boolean operations`, () => {
    it(`unions two boxes`, () => {
      const boxA = session.createBox(10, 10, 10);
      const boxB = session.createBox(10, 10, 10);

      const result = session.union(boxA, boxB);

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(result.value);
        expect(mesh.positions.length).toBeGreaterThan(0);
        session.deleteBody(result.value);
      }

      session.deleteBody(boxA);
      session.deleteBody(boxB);
    });

    it(`subtracts one box from another`, () => {
      const boxA = session.createBox(20, 20, 20, true);
      const boxB = session.createBox(10, 10, 30, true); // Smaller, taller box

      const result = session.subtract(boxA, boxB);

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(result.value);
        expect(mesh.positions.length).toBeGreaterThan(0);
        session.deleteBody(result.value);
      }

      session.deleteBody(boxA);
      session.deleteBody(boxB);
    });

    it(`intersects two boxes`, () => {
      const boxA = session.createBox(20, 20, 20, true);
      const boxB = session.createBox(10, 10, 10, true);

      const result = session.intersect(boxA, boxB);

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(result.value);
        expect(mesh.positions.length).toBeGreaterThan(0);

        // Intersection should be the smaller box
        const bbox = session.getBoundingBox(result.value);
        expect(bbox.max[0] - bbox.min[0]).toBeCloseTo(10, 1);

        session.deleteBody(result.value);
      }

      session.deleteBody(boxA);
      session.deleteBody(boxB);
    });
  });

  describe(`tilted geometry (the failing case)`, () => {
    it(`handles boolean cut with tilted geometry`, () => {
      // This was the failing case with our custom kernel
      const baseId = session.createBox(20, 20, 20, true);

      // Create a tilted plane (20 degrees)
      const angle = (20 * Math.PI) / 180;
      const normal = vec3(Math.sin(angle), 0, Math.cos(angle));
      const tiltedPlane = createDatumPlaneFromNormal(`tilted`, vec3(0, 0, 0), normal);

      const profile = session.createRectangleProfile(tiltedPlane, 10, 10);
      const result = session.extrude(profile, {
        operation: `cut`,
        distance: 30,
        targetBody: baseId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(baseId);
        expect(mesh.positions.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
      }

      session.deleteBody(baseId);
    });
  });

  describe(`fillet and chamfer`, () => {
    it(`fillets all edges of a box`, () => {
      const boxId = session.createBox(20, 20, 20, true);

      const result = session.fillet(boxId, { radius: 2 });

      expect(result.success).toBe(true);
      const mesh = session.tessellate(boxId);
      expect(mesh.positions.length).toBeGreaterThan(0);

      session.deleteBody(boxId);
    });

    it(`chamfers all edges of a box`, () => {
      const boxId = session.createBox(20, 20, 20, true);

      const result = session.chamfer(boxId, 2);

      expect(result.success).toBe(true);
      const mesh = session.tessellate(boxId);
      expect(mesh.positions.length).toBeGreaterThan(0);

      session.deleteBody(boxId);
    });
  });

  describe(`tessellation quality`, () => {
    it(`tessellates with different quality levels`, () => {
      const sphereId = session.createSphere(10);

      const lowMesh = session.tessellate(sphereId, `low`);
      const medMesh = session.tessellate(sphereId, `medium`);
      const highMesh = session.tessellate(sphereId, `high`);

      // Higher quality should have more triangles
      expect(medMesh.indices.length).toBeGreaterThanOrEqual(lowMesh.indices.length);
      expect(highMesh.indices.length).toBeGreaterThanOrEqual(medMesh.indices.length);

      session.deleteBody(sphereId);
    });
  });

  describe(`bounding box`, () => {
    it(`returns correct bounding box for a box`, () => {
      const bodyId = session.createBox(10, 20, 30);
      const bbox = session.getBoundingBox(bodyId);

      // Box at origin, so max should be dimensions
      expect(bbox.max[0] - bbox.min[0]).toBeCloseTo(10, 1);
      expect(bbox.max[1] - bbox.min[1]).toBeCloseTo(20, 1);
      expect(bbox.max[2] - bbox.min[2]).toBeCloseTo(30, 1);

      session.deleteBody(bodyId);
    });
  });

  describe(`sketch-based workflow`, () => {
    it(`creates and extrudes a sketch`, () => {
      const sketch = session.createSketch(XY_PLANE, `test-sketch`);

      // Add a rectangle
      const rect = sketch.addRectangle(0, 0, 10, 10);
      expect(rect.corners.length).toBe(4);
      expect(rect.sides.length).toBe(4);

      // Extrude the sketch
      const result = session.extrudeSketch(sketch, {
        operation: `new`,
        distance: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const mesh = session.tessellate(result.value);
        expect(mesh.positions.length).toBeGreaterThan(0);
        session.deleteBody(result.value);
      }
    });
  });
});
