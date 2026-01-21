/**
 * Fork-Merge Reference Tests
 *
 * Tests that PersistentRefs and loop IDs remain stable and consistent
 * across Yjs document forks and merges.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 6 Testing Strategy
 */

import { describe, test, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { createDocument, type SolidTypeDoc } from "../../src/editor/document/createDocument";
import { createSketch } from "../../src/editor/commands";
import { addPointToSketch, addLineToSketch } from "../../src/editor/document/featureHelpers";
import { computeProfileLoops } from "../../src/editor/kernel/referenceIndex";
import { encodePersistentRef, decodePersistentRef } from "../../src/editor/naming";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Get sketch data for profile loop computation
 */
function getSketchDataFromDoc(doc: SolidTypeDoc, sketchId: string) {
  const sketchMap = doc.featuresById.get(sketchId);
  if (!sketchMap) throw new Error(`Sketch ${sketchId} not found`);

  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  if (!dataMap) {
    return { pointsById: {}, entitiesById: {} };
  }

  const pointsById = (dataMap.get("pointsById") as Y.Map<unknown>)?.toJSON() ?? {};
  const entitiesById = (dataMap.get("entitiesById") as Y.Map<unknown>)?.toJSON() ?? {};

  return { pointsById, entitiesById };
}

/**
 * Create a simple rectangle sketch with known IDs
 */
function createRectangleSketch(
  doc: SolidTypeDoc,
  options: {
    pointIds: [string, string, string, string];
    lineIds: [string, string, string, string];
  }
): string {
  const result = createSketch(doc, { planeRef: "plane:xy" });
  if (!result.ok) throw new Error(result.error);
  const sketchId = result.value.featureId;
  const sketchMap = doc.featuresById.get(sketchId)!;

  // Get the nested data map
  const dataMap = sketchMap.get("data") as Y.Map<unknown>;
  const pointsById = dataMap.get("pointsById") as Y.Map<unknown>;
  const entitiesById = dataMap.get("entitiesById") as Y.Map<unknown>;

  // Add points manually with known IDs
  doc.ydoc.transact(() => {
    // Rectangle coordinates: (0,0), (10,0), (10,10), (0,10)
    const coords = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    for (let i = 0; i < 4; i++) {
      const pointMap = new Y.Map();
      pointsById.set(options.pointIds[i], pointMap);
      pointMap.set("id", options.pointIds[i]);
      pointMap.set("x", coords[i][0]);
      pointMap.set("y", coords[i][1]);
    }

    // Add lines with known IDs connecting the points (closed loop)
    const lineConnections = [
      [0, 1], // bottom
      [1, 2], // right
      [2, 3], // top
      [3, 0], // left
    ];

    for (let i = 0; i < 4; i++) {
      const lineMap = new Y.Map();
      entitiesById.set(options.lineIds[i], lineMap);
      lineMap.set("id", options.lineIds[i]);
      lineMap.set("type", "line");
      lineMap.set("start", options.pointIds[lineConnections[i][0]]);
      lineMap.set("end", options.pointIds[lineConnections[i][1]]);
    }
  });

  return sketchId;
}

// ============================================================================
// Fork-Merge Tests
// ============================================================================

describe("Fork-Merge Reference Stability", () => {
  describe("Loop ID Consistency", () => {
    test("two documents with same entities produce identical loopId", () => {
      // Create two separate documents
      const docA = createDocument();
      const docB = createDocument();

      // Add identical sketches with the same entity IDs
      const pointIds: [string, string, string, string] = ["p1", "p2", "p3", "p4"];
      const lineIds: [string, string, string, string] = ["l1", "l2", "l3", "l4"];

      const sketchIdA = createRectangleSketch(docA, { pointIds, lineIds });
      const sketchIdB = createRectangleSketch(docB, { pointIds, lineIds });

      // Compute profile loops for both
      const dataA = getSketchDataFromDoc(docA, sketchIdA);
      const dataB = getSketchDataFromDoc(docB, sketchIdB);

      const loopsA = computeProfileLoops(dataA.entitiesById, dataA.pointsById);
      const loopsB = computeProfileLoops(dataB.entitiesById, dataB.pointsById);

      // Should have one loop each
      expect(loopsA.length).toBe(1);
      expect(loopsB.length).toBe(1);

      // Loop IDs should be identical (deterministic from entity IDs)
      expect(loopsA[0].loopId).toBe(loopsB[0].loopId);
    });

    test("loopId is stable after fork and merge", () => {
      // Create original document
      const docA = createDocument();
      const pointIds: [string, string, string, string] = ["p1", "p2", "p3", "p4"];
      const lineIds: [string, string, string, string] = ["l1", "l2", "l3", "l4"];
      const sketchId = createRectangleSketch(docA, { pointIds, lineIds });

      // Get original loop ID
      const originalData = getSketchDataFromDoc(docA, sketchId);
      const originalLoops = computeProfileLoops(originalData.entitiesById, originalData.pointsById);
      expect(originalLoops.length).toBe(1);
      const originalLoopId = originalLoops[0].loopId;

      // Fork the document (create a new doc from state)
      const docB = new Y.Doc();
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA.ydoc));

      // Make a divergent edit in docA (add a constraint)
      const sketchMapA = docA.featuresById.get(sketchId)!;
      const dataMapA = sketchMapA.get("data") as Y.Map<unknown>;
      const constraintsById = dataMapA.get("constraintsById") as Y.Map<unknown>;
      const constraintMap = new Y.Map();
      constraintsById.set("c1", constraintMap);
      constraintMap.set("id", "c1");
      constraintMap.set("type", "horizontal");
      constraintMap.set("p1", "p1");
      constraintMap.set("p2", "p2");

      // Make a different edit in docB (different constraint)
      const rootB = docB.getMap("root");
      const featuresByIdB = rootB.get("featuresById") as Y.Map<Y.Map<unknown>>;
      const sketchMapB = featuresByIdB.get(sketchId)!;
      const dataMapB = sketchMapB.get("data") as Y.Map<unknown>;
      const constraintsByIdB = dataMapB.get("constraintsById") as Y.Map<unknown>;
      const constraintMapB = new Y.Map();
      constraintsByIdB.set("c2", constraintMapB);
      constraintMapB.set("id", "c2");
      constraintMapB.set("type", "vertical");
      constraintMapB.set("p1", "p1");
      constraintMapB.set("p2", "p4");

      // Merge: apply B's updates to A
      Y.applyUpdate(docA.ydoc, Y.encodeStateAsUpdate(docB));

      // Loop ID should still be the same (constraints don't affect loop topology)
      const mergedData = getSketchDataFromDoc(docA, sketchId);
      const mergedLoops = computeProfileLoops(mergedData.entitiesById, mergedData.pointsById);
      expect(mergedLoops.length).toBe(1);
      expect(mergedLoops[0].loopId).toBe(originalLoopId);

      // Both constraints should be present after merge
      const mergedSketch = docA.featuresById.get(sketchId)!;
      const mergedDataMap = mergedSketch.get("data") as Y.Map<unknown>;
      const mergedConstraints = mergedDataMap.get("constraintsById") as Y.Map<unknown>;
      expect(mergedConstraints.has("c1")).toBe(true);
      expect(mergedConstraints.has("c2")).toBe(true);
    });
  });

  describe("PersistentRef Encoding Stability", () => {
    test("encoded refs are deterministic", () => {
      const ref1 = encodePersistentRef({
        v: 1,
        expectedType: "face",
        originFeatureId: "feat-123",
        localSelector: { kind: "extrude.cap", data: { end: "start", loopId: "loop:abc" } },
        fingerprint: { centroid: [0, 0, 5], normal: [0, 0, 1], size: 100 },
      });

      const ref2 = encodePersistentRef({
        v: 1,
        expectedType: "face",
        originFeatureId: "feat-123",
        localSelector: { kind: "extrude.cap", data: { end: "start", loopId: "loop:abc" } },
        fingerprint: { centroid: [0, 0, 5], normal: [0, 0, 1], size: 100 },
      });

      // Same input should produce identical output
      expect(ref1).toBe(ref2);
    });

    test("refs survive encode/decode roundtrip", () => {
      const original = {
        v: 1 as const,
        expectedType: "face" as const,
        originFeatureId: "feat-456",
        localSelector: {
          kind: "extrude.side" as const,
          data: { loopId: "loop:xyz", segmentId: "seg-789" },
        },
        fingerprint: { centroid: [5, 5, 2.5], normal: [1, 0, 0], size: 50 },
      };

      const encoded = encodePersistentRef(original);
      const decoded = decodePersistentRef(encoded);

      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.ref.v).toBe(1);
        expect(decoded.ref.expectedType).toBe("face");
        expect(decoded.ref.originFeatureId).toBe("feat-456");
        expect(decoded.ref.localSelector.kind).toBe("extrude.side");
        expect((decoded.ref.localSelector.data as { loopId: string }).loopId).toBe("loop:xyz");
      }
    });
  });

  describe("Document Merge Scenarios", () => {
    test("document remains buildable after fork and merge", () => {
      // Create document with sketch
      const docA = createDocument();
      const result = createSketch(docA, { planeRef: "plane:xy" });
      expect(result.ok).toBe(true);
      const sketchId = result.value!.featureId;
      const sketchMap = docA.featuresById.get(sketchId)!;

      // Add a simple line
      const p1 = addPointToSketch(sketchMap, 0, 0);
      const p2 = addPointToSketch(sketchMap, 10, 0);
      addLineToSketch(sketchMap, p1, p2);

      // Fork
      const docB = new Y.Doc();
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA.ydoc));

      // Add another line in docA
      const p3 = addPointToSketch(sketchMap, 10, 10);
      addLineToSketch(sketchMap, p2, p3);

      // Add yet another line in docB
      const rootB = docB.getMap("root");
      const featuresByIdB = rootB.get("featuresById") as Y.Map<Y.Map<unknown>>;
      const sketchMapB = featuresByIdB.get(sketchId)!;
      const dataMapB = sketchMapB.get("data") as Y.Map<unknown>;
      const pointsByIdB = dataMapB.get("pointsById") as Y.Map<unknown>;
      const entitiesByIdB = dataMapB.get("entitiesById") as Y.Map<unknown>;

      // Add point and line in docB
      const p4Map = new Y.Map();
      pointsByIdB.set("p4", p4Map);
      p4Map.set("id", "p4");
      p4Map.set("x", 0);
      p4Map.set("y", 10);

      const l3Map = new Y.Map();
      entitiesByIdB.set("l3", l3Map);
      l3Map.set("id", "l3");
      l3Map.set("type", "line");
      l3Map.set("start", p1);
      l3Map.set("end", "p4");

      // Merge B into A
      Y.applyUpdate(docA.ydoc, Y.encodeStateAsUpdate(docB));

      // Document should have all entities from both branches
      const mergedSketch = docA.featuresById.get(sketchId)!;
      const mergedData = mergedSketch.get("data") as Y.Map<unknown>;
      const points = mergedData.get("pointsById") as Y.Map<unknown>;
      const entities = mergedData.get("entitiesById") as Y.Map<unknown>;

      // Should have all points and lines
      expect(points.size).toBeGreaterThanOrEqual(4); // p1, p2, p3, p4
      expect(entities.size).toBeGreaterThanOrEqual(3); // l1, l2, l3
    });
  });
});
