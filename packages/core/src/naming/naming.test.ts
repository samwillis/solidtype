/**
 * Tests for the persistent naming subsystem
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TopoModel } from "../topo/TopoModel.js";
import { createNumericContext } from "../num/tolerance.js";
import { extrude } from "../model/extrude.js";
import { revolve, Y_AXIS_REVOLVE } from "../model/revolve.js";
import { booleanOperation } from "../model/boolean.js";
import { createRectangleProfile } from "../model/sketchProfile.js";
import { XY_PLANE, ZX_PLANE } from "../model/planes.js";
import {
  createNamingStrategy,
  DefaultNamingStrategy,
  subshapeRefsMatch,
  fingerprintDistance,
  extrudeTopCapSelector,
  extrudeSideSelector,
  createPersistentRef,
} from "./index.js";
import type { NamingStrategy, SubshapeRef } from "./types.js";
import type { BodyId, FaceId, EdgeId } from "../topo/handles.js";
import { vec3 } from "../num/vec3.js";

describe("Naming System", () => {
  let model: TopoModel;
  let naming: NamingStrategy;

  beforeEach(() => {
    const ctx = createNumericContext();
    model = new TopoModel(ctx);
    naming = createNamingStrategy();
  });

  describe("NamingStrategy basics", () => {
    it("should allocate unique feature IDs", () => {
      const id1 = naming.allocateFeatureId();
      const id2 = naming.allocateFeatureId();
      const id3 = naming.allocateFeatureId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it("should allocate unique step IDs", () => {
      const id1 = naming.allocateStepId();
      const id2 = naming.allocateStepId();

      expect(id1).not.toBe(id2);
    });

    it("should record births and create PersistentRefs", () => {
      const featureId = naming.allocateFeatureId();
      const selector = extrudeTopCapSelector(0);
      const subshape: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 0 as FaceId,
      };

      const ref = naming.recordBirth(featureId, selector, subshape);

      expect(ref.originFeatureId).toBe(featureId);
      expect(ref.localSelector.kind).toBe("extrude.topCap");
      expect(ref.expectedType).toBe("face");
    });

    it("should resolve PersistentRef to SubshapeRef", () => {
      // Create a simple body for testing
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);
      expect(result.topCapRefs).toBeDefined();
      expect(result.topCapRefs!.length).toBe(1);

      // Resolve the top cap ref
      const topCapRef = result.topCapRefs![0];
      const resolved = naming.resolve(topCapRef, model);

      expect(resolved.status).toBe("found");
      if (resolved.status === "found") {
        expect(resolved.ref.type).toBe("face");
        expect(resolved.ref.body).toBe(result.body);
      }
    });

    it("should clear all naming data", () => {
      const featureId = naming.allocateFeatureId();
      const selector = extrudeTopCapSelector(0);
      const subshape: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 0 as FaceId,
      };

      naming.recordBirth(featureId, selector, subshape);
      naming.clear();

      // After clear, the ref should not be resolvable
      const ref = createPersistentRef(featureId, selector, "face");
      const resolved = naming.resolve(ref, model);

      expect(resolved.status).toBe("not_found");
    });

    it("should get all refs for a feature", () => {
      const featureId = naming.allocateFeatureId();

      // Record multiple births
      naming.recordBirth(featureId, extrudeTopCapSelector(0), {
        body: 0 as BodyId,
        type: "face",
        id: 0 as FaceId,
      });
      naming.recordBirth(featureId, extrudeSideSelector(0, 0), {
        body: 0 as BodyId,
        type: "face",
        id: 1 as FaceId,
      });
      naming.recordBirth(featureId, extrudeSideSelector(0, 1), {
        body: 0 as BodyId,
        type: "face",
        id: 2 as FaceId,
      });

      const refs = naming.getFeatureRefs(featureId);

      expect(refs.length).toBe(3);
    });
  });

  describe("Extrude with naming", () => {
    it("should create PersistentRefs for all faces", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);
      expect(result.featureId).toBeDefined();

      // Should have refs for top cap, bottom cap, and 4 side faces
      expect(result.topCapRefs?.length).toBe(1);
      expect(result.bottomCapRefs?.length).toBe(1);
      expect(result.sideRefs?.length).toBe(1); // 1 loop
      expect(result.sideRefs![0].length).toBe(4); // 4 sides
    });

    it("should create PersistentRefs for edges", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);

      // Should have refs for side edges, top edges, bottom edges
      expect(result.sideEdgeRefs?.length).toBe(1); // 1 loop
      expect(result.sideEdgeRefs![0].length).toBe(4); // 4 vertical edges
      expect(result.topEdgeRefs?.length).toBe(1);
      expect(result.topEdgeRefs![0].length).toBe(4);
      expect(result.bottomEdgeRefs?.length).toBe(1);
      expect(result.bottomEdgeRefs![0].length).toBe(4);
    });

    it("should resolve top cap ref correctly", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      const topCapRef = result.topCapRefs![0];
      const resolved = naming.resolve(topCapRef, model);

      expect(resolved.status).toBe("found");
      if (resolved.status === "found") {
        expect(resolved.ref.type).toBe("face");
      }
    });

    it("should resolve side face refs correctly", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      // Resolve each side face
      for (let i = 0; i < 4; i++) {
        const sideRef = result.sideRefs![0][i];
        const resolved = naming.resolve(sideRef, model);

        expect(resolved.status).toBe("found");
        if (resolved.status === "found") {
          expect(resolved.ref.type).toBe("face");
        }
      }
    });

    it("should resolve edge refs correctly", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      // Check a side edge ref
      const sideEdgeRef = result.sideEdgeRefs![0][0];
      const resolved = naming.resolve(sideEdgeRef, model);

      expect(resolved.status).toBe("found");
      if (resolved.status === "found") {
        expect(resolved.ref.type).toBe("edge");
      }
    });
  });

  describe("Revolve with naming", () => {
    it("should create PersistentRefs for side faces", () => {
      const profile = createRectangleProfile(ZX_PLANE, 2, 5, 5, 0); // Offset from axis
      const result = revolve(model, profile, {
        operation: "add",
        axis: Y_AXIS_REVOLVE,
        segments: 8,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);
      expect(result.featureId).toBeDefined();
      expect(result.sideRefs).toBeDefined();

      // Should have 4 profile segments, each with 8 ring segments
      expect(result.sideRefs!.length).toBe(4);
      expect(result.sideRefs![0].length).toBe(8);
    });

    it("should create PersistentRefs for cap faces (partial revolution)", () => {
      const profile = createRectangleProfile(ZX_PLANE, 2, 5, 5, 0);
      const result = revolve(model, profile, {
        operation: "add",
        axis: Y_AXIS_REVOLVE,
        angle: Math.PI / 2, // 90 degrees
        segments: 4,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);
      expect(result.startCapRef).toBeDefined();
      expect(result.endCapRef).toBeDefined();
    });

    it("should not create cap refs for full revolution", () => {
      const profile = createRectangleProfile(ZX_PLANE, 2, 5, 5, 0);
      const result = revolve(model, profile, {
        operation: "add",
        axis: Y_AXIS_REVOLVE,
        angle: 2 * Math.PI,
        segments: 8,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);
      expect(result.startCapRef).toBeUndefined();
      expect(result.endCapRef).toBeUndefined();
    });
  });

  describe("Boolean with naming and evolution", () => {
    it("should create evolution mappings for union", () => {
      // Create two overlapping boxes
      const profile1 = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const result1 = extrude(model, profile1, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      // Second box overlaps with first (offset by 5 in X)
      const profile2 = createRectangleProfile(XY_PLANE, 10, 10, 5, 0);
      const result2 = extrude(model, profile2, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Union them
      const boolResult = booleanOperation(model, result1.body!, result2.body!, {
        operation: "union",
        namingStrategy: naming,
      });

      expect(boolResult.success).toBe(true);
      expect(boolResult.featureId).toBeDefined();
      expect(boolResult.stepId).toBeDefined();
      expect(boolResult.faceRefsFromA).toBeDefined();
      expect(boolResult.faceRefsFromB).toBeDefined();
      expect(boolResult.evolutionMappings).toBeDefined();
    });

    it("should track face evolution through subtract", () => {
      // Create a large box
      const profile1 = createRectangleProfile(XY_PLANE, 20, 20, 0, 0);
      const result1 = extrude(model, profile1, {
        operation: "add",
        distance: 10,
        namingStrategy: naming,
      });

      // Create a smaller box to subtract
      const profile2 = createRectangleProfile(XY_PLANE, 5, 5, 0, 0);
      const result2 = extrude(model, profile2, {
        operation: "add",
        distance: 15, // Taller than first box
        namingStrategy: naming,
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Subtract
      const boolResult = booleanOperation(model, result1.body!, result2.body!, {
        operation: "subtract",
        namingStrategy: naming,
      });

      expect(boolResult.success).toBe(true);
      expect(boolResult.evolutionMappings).toBeDefined();
      expect(boolResult.evolutionMappings!.length).toBeGreaterThan(0);
    });
  });

  describe("Fingerprint computation", () => {
    it("should compute face fingerprints", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);

      // Get fingerprint of top cap
      const topCapRef = result.topCapRefs![0];
      expect(topCapRef.fingerprint).toBeDefined();

      // Top cap should have Z-pointing normal (approximately)
      const normal = topCapRef.fingerprint!.normal;
      expect(normal).toBeDefined();
      expect(Math.abs(normal![2])).toBeGreaterThan(0.9); // Should point in Z direction
    });

    it("should compute similar fingerprints for similar faces", () => {
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      const topFp = result.topCapRefs![0].fingerprint!;
      const bottomFp = result.bottomCapRefs![0].fingerprint!;

      // Top and bottom should have similar areas
      expect(Math.abs(topFp.approxAreaOrLength - bottomFp.approxAreaOrLength)).toBeLessThan(1);

      // But different centroids (Z differs by 5)
      expect(Math.abs(topFp.centroid[2] - bottomFp.centroid[2])).toBeGreaterThan(4);
    });

    it("should compute fingerprint distance correctly", () => {
      const fp1 = {
        centroid: vec3(0, 0, 0),
        approxAreaOrLength: 100,
        normal: vec3(0, 0, 1),
      };

      const fp2 = {
        centroid: vec3(0, 0, 0),
        approxAreaOrLength: 100,
        normal: vec3(0, 0, 1),
      };

      // Identical fingerprints should have distance 0
      expect(fingerprintDistance(fp1, fp2)).toBe(0);

      // Different centroid should increase distance
      const fp3 = {
        centroid: vec3(1, 0, 0),
        approxAreaOrLength: 100,
        normal: vec3(0, 0, 1),
      };

      expect(fingerprintDistance(fp1, fp3)).toBeGreaterThan(0);

      // Different normal should increase distance
      const fp4 = {
        centroid: vec3(0, 0, 0),
        approxAreaOrLength: 100,
        normal: vec3(0, 0, -1),
      };

      expect(fingerprintDistance(fp1, fp4)).toBeGreaterThan(0);
    });
  });

  describe("SubshapeRef matching", () => {
    it("should match identical refs", () => {
      const ref1: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 5 as FaceId,
      };
      const ref2: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 5 as FaceId,
      };

      expect(subshapeRefsMatch(ref1, ref2)).toBe(true);
    });

    it("should not match refs with different IDs", () => {
      const ref1: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 5 as FaceId,
      };
      const ref2: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 6 as FaceId,
      };

      expect(subshapeRefsMatch(ref1, ref2)).toBe(false);
    });

    it("should not match refs with different types", () => {
      const ref1: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 5 as FaceId,
      };
      const ref2: SubshapeRef = {
        body: 0 as BodyId,
        type: "edge",
        id: 5 as EdgeId,
      };

      expect(subshapeRefsMatch(ref1, ref2)).toBe(false);
    });

    it("should not match refs with different bodies", () => {
      const ref1: SubshapeRef = {
        body: 0 as BodyId,
        type: "face",
        id: 5 as FaceId,
      };
      const ref2: SubshapeRef = {
        body: 1 as BodyId,
        type: "face",
        id: 5 as FaceId,
      };

      expect(subshapeRefsMatch(ref1, ref2)).toBe(false);
    });
  });

  describe("Selector constructors", () => {
    it("should create extrude selectors correctly", () => {
      const topCap = extrudeTopCapSelector(0);
      expect(topCap.kind).toBe("extrude.topCap");
      expect(topCap.data.loop).toBe(0);

      const side = extrudeSideSelector(1, 2);
      expect(side.kind).toBe("extrude.side");
      expect(side.data.loop).toBe(1);
      expect(side.data.segment).toBe(2);
    });
  });

  describe("Parametric rebuild scenario", () => {
    it("should resolve refs after body ID change via updateBodyMapping", () => {
      // Step 1: Create initial extrude
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result1 = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result1.success).toBe(true);
      const topCapRef = result1.topCapRefs![0];
      const originalBody = result1.body!;

      // Step 2: Verify initial resolution
      const resolved1 = naming.resolve(topCapRef, model);
      expect(resolved1.status).toBe("found");
      if (resolved1.status === "found") {
        expect(resolved1.ref.body).toBe(originalBody);
      }

      // Step 3: "Rebuild" - create a new extrude with different height
      // This simulates what happens when parameters change
      const result2 = extrude(model, profile, {
        operation: "add",
        distance: 10, // Different height
        namingStrategy: naming,
      });

      expect(result2.success).toBe(true);
      const newBody = result2.body!;

      // The old body and new body are different
      expect(newBody).not.toBe(originalBody);

      // Step 4: Update body mapping (simulating rebuild tracking)
      (naming as DefaultNamingStrategy).updateBodyMapping(originalBody, newBody);

      // Step 5: The original ref should now resolve to the new body
      const resolved2 = naming.resolve(topCapRef, model);
      expect(resolved2.status).toBe("found");
      if (resolved2.status === "found") {
        expect(resolved2.ref.body).toBe(newBody);
      }
    });

    it("should track refs through evolution after boolean operation", () => {
      // Step 1: Create first box
      const profile1 = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const result1 = extrude(model, profile1, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result1.success).toBe(true);
      const topCapRef1 = result1.topCapRefs![0];
      const body1 = result1.body!;

      // Step 2: Verify initial resolution
      const resolvedBefore = naming.resolve(topCapRef1, model);
      expect(resolvedBefore.status).toBe("found");
      if (resolvedBefore.status === "found") {
        expect(resolvedBefore.ref.body).toBe(body1);
      }

      // Step 3: Create second overlapping box
      const profile2 = createRectangleProfile(XY_PLANE, 10, 10, 5, 0);
      const result2 = extrude(model, profile2, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result2.success).toBe(true);

      // Step 4: Union the boxes
      const boolResult = booleanOperation(model, body1, result2.body!, {
        operation: "union",
        namingStrategy: naming,
      });

      expect(boolResult.success).toBe(true);
      const resultBody = boolResult.body!;

      // Step 5: The original top cap ref should now resolve to the result body
      // through evolution tracking
      const resolvedAfter = naming.resolve(topCapRef1, model);
      expect(resolvedAfter.status).toBe("found");
      if (resolvedAfter.status === "found") {
        expect(resolvedAfter.ref.body).toBe(resultBody);
        expect(resolvedAfter.ref.type).toBe("face");
      }
    });

    it("should provide reverse lookup for subshapes", () => {
      // Create extrude with naming
      const profile = createRectangleProfile(XY_PLANE, 10, 10);
      const result = extrude(model, profile, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result.success).toBe(true);
      const topCapRef = result.topCapRefs![0];

      // Resolve to get the face ID
      const resolved = naming.resolve(topCapRef, model);
      expect(resolved.status).toBe("found");

      if (resolved.status === "found") {
        // Now use reverse lookup
        const _lookupResult = naming.lookupRefForSubshape(resolved.ref);

        expect(lookupResult).not.toBeNull();
        expect(lookupResult?.originFeatureId).toBe(topCapRef.originFeatureId);
        expect(lookupResult?.localSelector.kind).toBe(topCapRef.localSelector.kind);
      }
    });

    it("should update reverse lookup through evolution", () => {
      // Step 1: Create first box
      const profile1 = createRectangleProfile(XY_PLANE, 10, 10, 0, 0);
      const result1 = extrude(model, profile1, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      expect(result1.success).toBe(true);
      const topCapRef = result1.topCapRefs![0];
      const body1 = result1.body!;

      // Step 2: Get the original face ID
      const resolvedOriginal = naming.resolve(topCapRef, model);
      expect(resolvedOriginal.status).toBe("found");

      // Step 3: Create overlapping box and union
      const profile2 = createRectangleProfile(XY_PLANE, 10, 10, 5, 0);
      const result2 = extrude(model, profile2, {
        operation: "add",
        distance: 5,
        namingStrategy: naming,
      });

      const boolResult = booleanOperation(model, body1, result2.body!, {
        operation: "union",
        namingStrategy: naming,
      });

      expect(boolResult.success).toBe(true);

      // Step 4: Resolve to get the new face location
      const resolvedAfterBool = naming.resolve(topCapRef, model);
      expect(resolvedAfterBool.status).toBe("found");

      if (resolvedAfterBool.status === "found") {
        // Step 5: Reverse lookup should find the original ref
        const lookupResult = naming.lookupRefForSubshape(resolvedAfterBool.ref);

        expect(lookupResult).not.toBeNull();
        expect(lookupResult?.originFeatureId).toBe(topCapRef.originFeatureId);
      }
    });
  });
});
