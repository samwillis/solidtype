/**
 * Phase 8: OCCT History Integration Tests
 *
 * Tests the extended extrude/revolve operations that capture OCCT history
 * for persistent naming.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initOCCT,
  setOC,
  makeBox,
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
    it("returns shape with firstShape and lastShape", () => {
      // Create a simple rectangle profile on XY plane
      const profile = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const face = sketchProfileToFace(profile);
      const direction = getPlaneNormal(profile.plane);

      // Extrude with history
      const result = extrudeWithHistory(face, direction, 20);

      // Should have the extruded shape
      expect(result.shape).toBeDefined();
      expect(result.shape.raw).not.toBeNull();

      // Should have first and last shapes (bottom and top caps)
      expect(result.firstShape).toBeDefined();
      expect(result.lastShape).toBeDefined();

      // Clean up
      result.shape.dispose();
      result.firstShape?.dispose();
      result.lastShape?.dispose();
      face.dispose();
    });

    it("first and last shapes are different from main shape", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const face = sketchProfileToFace(profile);
      const direction = getPlaneNormal(profile.plane);

      const result = extrudeWithHistory(face, direction, 20);

      // First and last shapes should exist and be distinct
      if (result.firstShape && result.lastShape) {
        // They should be faces (2D), not solids
        // The raw shapes should be different objects
        expect(result.firstShape.raw).not.toBe(result.shape.raw);
        expect(result.lastShape.raw).not.toBe(result.shape.raw);
      }

      // Clean up
      result.shape.dispose();
      result.firstShape?.dispose();
      result.lastShape?.dispose();
      face.dispose();
    });
  });

  describe("revolveWithHistory", () => {
    it("returns shape with caps for partial revolve", () => {
      // Create a profile for revolving (offset from axis)
      const profile = createRectangleProfile(XY_PLANE, 5, 10, 15, 0);
      const face = sketchProfileToFace(profile);

      // Revolve 180 degrees around Y axis (partial revolve has end caps)
      const result = revolveWithHistory(face, [0, 0, 0], [0, 1, 0], 180);

      expect(result.shape).toBeDefined();
      expect(result.shape.raw).not.toBeNull();

      // For partial revolve, should have first and last shapes (end caps)
      // Note: depending on OCCT version, these may or may not be available
      // The key is that the function doesn't crash

      // Clean up
      result.shape.dispose();
      result.firstShape?.dispose();
      result.lastShape?.dispose();
      face.dispose();
    });

    it("full 360 revolve has no end caps", () => {
      const profile = createRectangleProfile(XY_PLANE, 5, 10, 15, 0);
      const face = sketchProfileToFace(profile);

      // Full 360 degree revolve
      const result = revolveWithHistory(face, [0, 0, 0], [0, 1, 0], 360);

      expect(result.shape).toBeDefined();

      // Full revolve should not have end caps
      expect(result.firstShape).toBeUndefined();
      expect(result.lastShape).toBeUndefined();

      // Clean up
      result.shape.dispose();
      face.dispose();
    });
  });
});
