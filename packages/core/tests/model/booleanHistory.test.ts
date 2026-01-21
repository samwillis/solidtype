/**
 * Phase 8: Boolean History Tracking Tests
 *
 * Tests the tracking of faces through boolean operations using Modified() and IsDeleted() APIs.
 * This enables persistent references to survive boolean operations.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 8
 * @see docs/BOOLEAN-HISTORY-OPTIONS.md
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initOCCT,
  setOC,
  booleanOpWithHistory,
  extrude,
  sketchProfileToFace,
  getPlaneNormal,
} from "../../src/kernel/index.js";
import { XY_PLANE } from "../../src/model/planes.js";
import { createRectangleProfile } from "../../src/model/sketchProfile.js";

describe("Boolean History Tracking (Phase 8)", () => {
  beforeAll(async () => {
    const oc = await initOCCT();
    setOC(oc);
  });

  describe("booleanOpWithHistory", () => {
    it("returns face mappings for union of overlapping boxes", () => {
      // Create two overlapping boxes
      const profile1 = createRectangleProfile(XY_PLANE, 20, 20, 0, 0);
      const face1 = sketchProfileToFace(profile1);
      const box1 = extrude(face1, getPlaneNormal(profile1.plane), 20);

      const profile2 = createRectangleProfile(XY_PLANE, 20, 20, 10, 0);
      const face2 = sketchProfileToFace(profile2);
      const box2 = extrude(face2, getPlaneNormal(profile2.plane), 20);

      // Perform union with history
      const result = booleanOpWithHistory(box1, box2, "union");

      expect(result.success).toBe(true);
      expect(result.shape).toBeDefined();
      expect(result.baseFaceMap).toBeDefined();
      expect(result.toolFaceMap).toBeDefined();

      // Both boxes have 6 faces
      expect(result.baseFaceMap!.length).toBe(6);
      expect(result.toolFaceMap!.length).toBe(6);

      // Count different fates
      const baseDeleted = result.baseFaceMap!.filter((m) => m.isDeleted).length;
      const baseModified = result.baseFaceMap!.filter(
        (m) => !m.isDeleted && m.outputHashes.length > 0
      ).length;
      const toolDeleted = result.toolFaceMap!.filter((m) => m.isDeleted).length;
      const toolModified = result.toolFaceMap!.filter(
        (m) => !m.isDeleted && m.outputHashes.length > 0
      ).length;

      console.log(`Base: ${baseDeleted} deleted, ${baseModified} modified/unchanged`);
      console.log(`Tool: ${toolDeleted} deleted, ${toolModified} modified/unchanged`);

      // Some faces should be deleted (internal faces where boxes overlap)
      expect(baseDeleted + toolDeleted).toBeGreaterThan(0);

      // Some faces should be modified or unchanged
      expect(baseModified + toolModified).toBeGreaterThan(0);

      // Cleanup
      result.shape!.dispose();
      box1.dispose();
      box2.dispose();
      face1.dispose();
      face2.dispose();
    });

    it("returns face mappings for subtraction (cut)", () => {
      // Create base box and cutting box
      const profile1 = createRectangleProfile(XY_PLANE, 30, 30, 0, 0);
      const face1 = sketchProfileToFace(profile1);
      const baseBox = extrude(face1, getPlaneNormal(profile1.plane), 20);

      const profile2 = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const face2 = sketchProfileToFace(profile2);
      const cutter = extrude(face2, getPlaneNormal(profile2.plane), 30);

      // Perform subtraction with history
      const result = booleanOpWithHistory(baseBox, cutter, "subtract");

      expect(result.success).toBe(true);
      expect(result.shape).toBeDefined();
      expect(result.baseFaceMap).toBeDefined();
      expect(result.toolFaceMap).toBeDefined();

      // Check that we get history for both shapes
      expect(result.baseFaceMap!.length).toBe(6);
      expect(result.toolFaceMap!.length).toBe(6);

      // In a cut, the tool faces that create the pocket should be tracked
      // Some base faces should be modified (the top face gets a hole)
      const baseModified = result.baseFaceMap!.filter(
        (m) => !m.isDeleted && m.outputHashes.length > 1
      );
      console.log(`Base faces split into multiple: ${baseModified.length}`);

      // Cleanup
      result.shape!.dispose();
      baseBox.dispose();
      cutter.dispose();
      face1.dispose();
      face2.dispose();
    });

    it("tracks unchanged faces correctly", () => {
      // Create two non-overlapping boxes that only touch at an edge
      const profile1 = createRectangleProfile(XY_PLANE, 10, 10, -10, 0);
      const face1 = sketchProfileToFace(profile1);
      const box1 = extrude(face1, getPlaneNormal(profile1.plane), 10);

      const profile2 = createRectangleProfile(XY_PLANE, 10, 10, 10, 0);
      const face2 = sketchProfileToFace(profile2);
      const box2 = extrude(face2, getPlaneNormal(profile2.plane), 10);

      // Perform union with history
      const result = booleanOpWithHistory(box1, box2, "union");

      expect(result.success).toBe(true);

      // Most faces should be unchanged (outputHash === inputHash)
      const baseUnchanged = result.baseFaceMap!.filter(
        (m) => !m.isDeleted && m.outputHashes.length === 1 && m.outputHashes[0] === m.inputHash
      );
      const toolUnchanged = result.toolFaceMap!.filter(
        (m) => !m.isDeleted && m.outputHashes.length === 1 && m.outputHashes[0] === m.inputHash
      );

      console.log(`Base unchanged: ${baseUnchanged.length}/6`);
      console.log(`Tool unchanged: ${toolUnchanged.length}/6`);

      // Most faces should survive unchanged for non-overlapping boxes
      expect(baseUnchanged.length + toolUnchanged.length).toBeGreaterThanOrEqual(8);

      // Cleanup
      result.shape!.dispose();
      box1.dispose();
      box2.dispose();
      face1.dispose();
      face2.dispose();
    });

    it("provides output hashes that can be used for tracking", () => {
      // Create overlapping boxes
      const profile1 = createRectangleProfile(XY_PLANE, 20, 20, 0, 0);
      const face1 = sketchProfileToFace(profile1);
      const box1 = extrude(face1, getPlaneNormal(profile1.plane), 20);

      const profile2 = createRectangleProfile(XY_PLANE, 20, 20, 5, 5);
      const face2 = sketchProfileToFace(profile2);
      const box2 = extrude(face2, getPlaneNormal(profile2.plane), 20);

      const result = booleanOpWithHistory(box1, box2, "union");

      expect(result.success).toBe(true);

      // Collect all output hashes from both face maps
      const allOutputHashes = new Set<number>();
      for (const mapping of result.baseFaceMap!) {
        for (const hash of mapping.outputHashes) {
          allOutputHashes.add(hash);
        }
      }
      for (const mapping of result.toolFaceMap!) {
        for (const hash of mapping.outputHashes) {
          allOutputHashes.add(hash);
        }
      }

      console.log(`Total unique output face hashes: ${allOutputHashes.size}`);

      // Should have some output faces
      expect(allOutputHashes.size).toBeGreaterThan(0);

      // Cleanup
      result.shape!.dispose();
      box1.dispose();
      box2.dispose();
      face1.dispose();
      face2.dispose();
    });
  });
});
