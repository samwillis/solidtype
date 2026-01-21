/**
 * Phase 8: OCCT History Integration Tests
 *
 * Tests the extended extrude/revolve operations that capture OCCT history
 * for persistent naming.
 *
 * Key findings:
 * - OpenCascade.js uses Size() instead of Extent() for lists
 * - Use First_1() to access list elements (not Value(i))
 * - firstShapeHash/lastShapeHash identify cap faces
 * - sideFaceMappings maps profile edges to generated side faces
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initOCCT,
  setOC,
  extrudeWithHistory,
  revolveWithHistory,
  sketchProfileToFace,
  getPlaneNormal,
} from "../../src/kernel/index.js";
import { XY_PLANE } from "../../src/model/planes.js";
import { createRectangleProfile } from "../../src/model/sketchProfile.js";

describe("OCCT History Integration (Phase 8)", () => {
  beforeAll(async () => {
    const oc = await initOCCT();
    setOC(oc);
  });

  describe("extrudeWithHistory", () => {
    it("returns shape with firstShapeHash and lastShapeHash", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const face = sketchProfileToFace(profile);
      const direction = getPlaneNormal(profile.plane);

      const result = extrudeWithHistory(face, direction, 20);

      // Should have the extruded shape
      expect(result.shape).toBeDefined();
      expect(result.shape.raw).not.toBeNull();

      // Should have first and last shape hashes (bottom and top caps)
      expect(result.firstShapeHash).toBeDefined();
      expect(result.lastShapeHash).toBeDefined();
      expect(typeof result.firstShapeHash).toBe("number");
      expect(typeof result.lastShapeHash).toBe("number");

      // Hashes should be different (bottom and top are different faces)
      expect(result.firstShapeHash).not.toBe(result.lastShapeHash);

      result.shape.dispose();
      face.dispose();
    });

    it("returns sideFaceMappings for each profile edge", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 20, 0, 0);
      const face = sketchProfileToFace(profile);
      const direction = getPlaneNormal(profile.plane);

      const result = extrudeWithHistory(face, direction, 15);

      // Should have 4 side face mappings (one for each edge of the rectangle)
      expect(result.sideFaceMappings).toBeDefined();
      expect(Array.isArray(result.sideFaceMappings)).toBe(true);
      expect(result.sideFaceMappings.length).toBe(4);

      // Each mapping should have required fields
      for (const mapping of result.sideFaceMappings) {
        expect(typeof mapping.profileEdgeHash).toBe("number");
        expect(typeof mapping.generatedFaceHash).toBe("number");
        expect(typeof mapping.profileEdgeIndex).toBe("number");
      }

      // All generated face hashes should be unique
      const faceHashes = result.sideFaceMappings.map((m) => m.generatedFaceHash);
      const uniqueHashes = new Set(faceHashes);
      expect(uniqueHashes.size).toBe(faceHashes.length);

      // Profile edge indices should be sequential
      const indices = result.sideFaceMappings.map((m) => m.profileEdgeIndex).sort((a, b) => a - b);
      expect(indices).toEqual([0, 1, 2, 3]);

      result.shape.dispose();
      face.dispose();
    });

    it("cap hashes can be matched with tessellation", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const face = sketchProfileToFace(profile);
      const direction = getPlaneNormal(profile.plane);

      const result = extrudeWithHistory(face, direction, 20);

      // The cap hashes should not match any side face hashes
      const sideFaceHashes = new Set(result.sideFaceMappings.map((m) => m.generatedFaceHash));
      expect(sideFaceHashes.has(result.firstShapeHash!)).toBe(false);
      expect(sideFaceHashes.has(result.lastShapeHash!)).toBe(false);

      result.shape.dispose();
      face.dispose();
    });
  });

  describe("revolveWithHistory", () => {
    it("returns shape with caps for partial revolve", () => {
      const profile = createRectangleProfile(XY_PLANE, 5, 10, 15, 0);
      const face = sketchProfileToFace(profile);

      const result = revolveWithHistory(face, [0, 0, 0], [0, 1, 0], 180);

      expect(result.shape).toBeDefined();
      expect(result.shape.raw).not.toBeNull();

      // For partial revolve, should have cap hashes
      expect(result.firstShapeHash).toBeDefined();
      expect(result.lastShapeHash).toBeDefined();

      // Should have side face mappings (4 edges = 4 side surfaces)
      expect(result.sideFaceMappings).toBeDefined();
      expect(result.sideFaceMappings.length).toBe(4);

      result.shape.dispose();
      face.dispose();
    });

    it("full 360 revolve has no end caps", () => {
      const profile = createRectangleProfile(XY_PLANE, 5, 10, 15, 0);
      const face = sketchProfileToFace(profile);

      const result = revolveWithHistory(face, [0, 0, 0], [0, 1, 0], 360);

      expect(result.shape).toBeDefined();

      // Full revolve should not have end cap hashes
      expect(result.firstShapeHash).toBeUndefined();
      expect(result.lastShapeHash).toBeUndefined();

      // Should still have side face mappings
      expect(result.sideFaceMappings).toBeDefined();
      expect(result.sideFaceMappings.length).toBe(4);

      result.shape.dispose();
      face.dispose();
    });
  });
});
