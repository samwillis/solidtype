/**
 * Commands Invariants Tests
 *
 * Regression tests to ensure UI and AI produce identical Yjs state
 * when performing the same operations.
 *
 * @see docs/CAD-PIPELINE-REWORK.md Phase 0
 */

import { describe, test, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { createDocument, type SolidTypeDoc } from "../../src/editor/document/createDocument";
import {
  createSketch,
  createExtrude,
  createRevolve,
  createBoolean,
  deleteFeature,
  renameFeature,
  suppressFeature,
  reorderFeature,
} from "../../src/editor/commands";
import { addPointToSketch, addLineToSketch } from "../../src/editor/document/featureHelpers";
import { uuid } from "../../src/editor/document/yjs";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Normalize Yjs state for comparison.
 * Removes timestamps and sorts keys for deterministic comparison.
 */
function normalizeYjsState(ydoc: Y.Doc): Record<string, unknown> {
  const root = ydoc.getMap("root");
  const snapshot = root.toJSON() as Record<string, unknown>;

  // Remove timestamps from meta
  if (snapshot.meta && typeof snapshot.meta === "object") {
    const meta = snapshot.meta as Record<string, unknown>;
    delete meta.created;
    delete meta.modified;
  }

  // Sort keys recursively for deterministic comparison
  return sortKeys(snapshot);
}

/**
 * Recursively sort object keys for deterministic comparison
 */
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Create a sketch with a simple rectangle for testing
 */
function addTestSketchWithRectangle(doc: SolidTypeDoc, planeRef: string): string {
  const result = createSketch(doc, { planeRef });
  if (!result.ok) throw new Error(result.error);

  const sketchMap = doc.featuresById.get(result.value.featureId)!;

  // Add rectangle points
  const p1 = addPointToSketch(sketchMap, 0, 0);
  const p2 = addPointToSketch(sketchMap, 10, 0);
  const p3 = addPointToSketch(sketchMap, 10, 10);
  const p4 = addPointToSketch(sketchMap, 0, 10);

  // Add rectangle lines
  addLineToSketch(sketchMap, p1, p2);
  addLineToSketch(sketchMap, p2, p3);
  addLineToSketch(sketchMap, p3, p4);
  addLineToSketch(sketchMap, p4, p1);

  return result.value.featureId;
}

// ============================================================================
// Invariant A: UI and AI produce identical Yjs state
// ============================================================================

describe("Invariant A: UI and AI produce identical doc state", () => {
  let docA: SolidTypeDoc;
  let docB: SolidTypeDoc;

  beforeEach(() => {
    // Create two identical documents
    docA = createDocument();
    docB = createDocument();
  });

  test("createSketch produces identical state", () => {
    // Both paths use the commands module now
    const resultA = createSketch(docA, { planeRef: "xy", name: "TestSketch" });
    const resultB = createSketch(docB, { planeRef: "xy", name: "TestSketch" });

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    // Feature order should have same length
    expect(docA.featureOrder.length).toBe(docB.featureOrder.length);

    // The sketch should exist in both
    if (resultA.ok && resultB.ok) {
      const sketchA = docA.featuresById.get(resultA.value.featureId);
      const sketchB = docB.featuresById.get(resultB.value.featureId);

      expect(sketchA).toBeDefined();
      expect(sketchB).toBeDefined();

      // Type should match
      expect(sketchA?.get("type")).toBe("sketch");
      expect(sketchB?.get("type")).toBe("sketch");

      // Name should match
      expect(sketchA?.get("name")).toBe("TestSketch");
      expect(sketchB?.get("name")).toBe("TestSketch");
    }
  });

  test("createExtrude produces identical state structure", () => {
    // Create identical sketches first
    const sketchResultA = createSketch(docA, { planeRef: "xy" });
    const sketchResultB = createSketch(docB, { planeRef: "xy" });

    expect(sketchResultA.ok).toBe(true);
    expect(sketchResultB.ok).toBe(true);

    if (!sketchResultA.ok || !sketchResultB.ok) return;

    // Create extrudes
    const extrudeResultA = createExtrude(docA, {
      sketchId: sketchResultA.value.featureId,
      distance: 10,
      op: "add",
      direction: "normal",
    });

    const extrudeResultB = createExtrude(docB, {
      sketchId: sketchResultB.value.featureId,
      distance: 10,
      op: "add",
      direction: "normal",
    });

    expect(extrudeResultA.ok).toBe(true);
    expect(extrudeResultB.ok).toBe(true);

    // Feature order should have same length
    expect(docA.featureOrder.length).toBe(docB.featureOrder.length);

    if (extrudeResultA.ok && extrudeResultB.ok) {
      const extrudeA = docA.featuresById.get(extrudeResultA.value.featureId);
      const extrudeB = docB.featuresById.get(extrudeResultB.value.featureId);

      expect(extrudeA?.get("type")).toBe("extrude");
      expect(extrudeB?.get("type")).toBe("extrude");

      expect(extrudeA?.get("distance")).toBe(10);
      expect(extrudeB?.get("distance")).toBe(10);

      expect(extrudeA?.get("op")).toBe("add");
      expect(extrudeB?.get("op")).toBe("add");

      expect(extrudeA?.get("direction")).toBe("normal");
      expect(extrudeB?.get("direction")).toBe("normal");

      expect(extrudeA?.get("extent")).toBe("blind");
      expect(extrudeB?.get("extent")).toBe("blind");
    }
  });

  test("createRevolve produces identical state structure", () => {
    // Create identical sketches
    const sketchResultA = createSketch(docA, { planeRef: "xy" });
    const sketchResultB = createSketch(docB, { planeRef: "xy" });

    expect(sketchResultA.ok).toBe(true);
    expect(sketchResultB.ok).toBe(true);

    if (!sketchResultA.ok || !sketchResultB.ok) return;

    const axisId = uuid(); // Same axis ID for both

    const revolveResultA = createRevolve(docA, {
      sketchId: sketchResultA.value.featureId,
      axisId,
      angle: 180,
      op: "add",
    });

    const revolveResultB = createRevolve(docB, {
      sketchId: sketchResultB.value.featureId,
      axisId,
      angle: 180,
      op: "add",
    });

    expect(revolveResultA.ok).toBe(true);
    expect(revolveResultB.ok).toBe(true);

    if (revolveResultA.ok && revolveResultB.ok) {
      const revolveA = docA.featuresById.get(revolveResultA.value.featureId);
      const revolveB = docB.featuresById.get(revolveResultB.value.featureId);

      expect(revolveA?.get("type")).toBe("revolve");
      expect(revolveB?.get("type")).toBe("revolve");

      expect(revolveA?.get("angle")).toBe(180);
      expect(revolveB?.get("angle")).toBe(180);
    }
  });
});

// ============================================================================
// Invariant B: Rebuild gate is respected by all paths
// ============================================================================

describe("Invariant B: Rebuild gate is respected", () => {
  test("features are inserted after rebuild gate", () => {
    const doc = createDocument();

    // Create first sketch
    const sketch1Result = createSketch(doc, { planeRef: "xy", name: "Sketch1" });
    expect(sketch1Result.ok).toBe(true);
    if (!sketch1Result.ok) return;

    // Set rebuild gate to first sketch
    doc.state.set("rebuildGate", sketch1Result.value.featureId);

    // Create second sketch - should be inserted after gate
    const sketch2Result = createSketch(doc, { planeRef: "xy", name: "Sketch2" });
    expect(sketch2Result.ok).toBe(true);
    if (!sketch2Result.ok) return;

    // Verify order
    const order = doc.featureOrder.toArray();
    const sketch1Index = order.indexOf(sketch1Result.value.featureId);
    const sketch2Index = order.indexOf(sketch2Result.value.featureId);

    expect(sketch2Index).toBe(sketch1Index + 1);

    // Verify gate was moved
    expect(doc.state.get("rebuildGate")).toBe(sketch2Result.value.featureId);
  });
});

// ============================================================================
// Invariant C: Fork+merge doesn't crash document operations
// ============================================================================

describe("Invariant C: Fork+merge document operations", () => {
  test("document remains valid after Yjs fork and merge", () => {
    // Create original document with sketch + extrude
    const docA = createDocument();
    const sketchResult = createSketch(docA, { planeRef: "xy" });
    expect(sketchResult.ok).toBe(true);
    if (!sketchResult.ok) return;

    const extrudeResult = createExtrude(docA, {
      sketchId: sketchResult.value.featureId,
      distance: 10,
    });
    expect(extrudeResult.ok).toBe(true);

    // Create fork (docB) from docA's state
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA.ydoc));

    // Make divergent edits on docA
    const sketch2Result = createSketch(docA, { planeRef: "xz", name: "SketchA" });
    expect(sketch2Result.ok).toBe(true);

    // Make divergent edits on docB
    const rootB = docB.getMap("root");
    const featuresByIdB = rootB.get("featuresById") as Y.Map<Y.Map<unknown>>;
    const featureOrderB = rootB.get("featureOrder") as Y.Array<string>;

    // Add a new sketch to docB (simulating another user's edit)
    const newSketchId = uuid();
    const newSketch = new Y.Map<unknown>();
    docB.transact(() => {
      featuresByIdB.set(newSketchId, newSketch);
      newSketch.set("id", newSketchId);
      newSketch.set("type", "sketch");
      newSketch.set("name", "SketchB");
      newSketch.set("plane", { kind: "datumRole", ref: "yz" });
      featureOrderB.push([newSketchId]);
    });

    // Merge docB into docA
    Y.applyUpdate(docA.ydoc, Y.encodeStateAsUpdate(docB));

    // Verify document is still valid
    expect(docA.featureOrder.length).toBeGreaterThanOrEqual(7); // 4 default + 3 added

    // Verify both sketches exist
    if (sketch2Result.ok) {
      expect(docA.featuresById.get(sketch2Result.value.featureId)).toBeDefined();
    }
    expect(docA.featuresById.get(newSketchId)).toBeDefined();

    // Verify we can still create features after merge
    const postMergeSketch = createSketch(docA, { planeRef: "xy", name: "PostMerge" });
    expect(postMergeSketch.ok).toBe(true);
  });
});

// ============================================================================
// Invariant D: Command validation
// ============================================================================

describe("Invariant D: Command validation", () => {
  test("createExtrude fails with invalid sketch ID", () => {
    const doc = createDocument();

    const result = createExtrude(doc, {
      sketchId: "nonexistent-sketch-id",
      distance: 10,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not found");
    }
  });

  test("createRevolve fails without axis", () => {
    const doc = createDocument();
    const sketchResult = createSketch(doc, { planeRef: "xy" });
    expect(sketchResult.ok).toBe(true);
    if (!sketchResult.ok) return;

    const result = createRevolve(doc, {
      sketchId: sketchResult.value.featureId,
      axisId: "", // Empty axis
      angle: 180,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("axis");
    }
  });

  test("deleteFeature fails for datum planes", () => {
    const doc = createDocument();

    // Try to delete a datum plane (should fail)
    const xyPlaneId = doc.featureOrder.toArray()[1]; // XY plane is at index 1

    const result = deleteFeature(doc, { featureId: xyPlaneId });
    expect(result.ok).toBe(false);
  });

  test("renameFeature updates name correctly", () => {
    const doc = createDocument();
    const sketchResult = createSketch(doc, { planeRef: "xy", name: "Original" });
    expect(sketchResult.ok).toBe(true);
    if (!sketchResult.ok) return;

    const result = renameFeature(doc, {
      featureId: sketchResult.value.featureId,
      name: "Renamed",
    });

    expect(result.ok).toBe(true);
    expect(doc.featuresById.get(sketchResult.value.featureId)?.get("name")).toBe("Renamed");
  });

  test("suppressFeature toggles suppressed state", () => {
    const doc = createDocument();
    const sketchResult = createSketch(doc, { planeRef: "xy" });
    expect(sketchResult.ok).toBe(true);
    if (!sketchResult.ok) return;

    // Suppress
    const suppressResult = suppressFeature(doc, {
      featureId: sketchResult.value.featureId,
      suppressed: true,
    });
    expect(suppressResult.ok).toBe(true);
    expect(doc.featuresById.get(sketchResult.value.featureId)?.get("suppressed")).toBe(true);

    // Unsuppress
    const unsuppressResult = suppressFeature(doc, {
      featureId: sketchResult.value.featureId,
      suppressed: false,
    });
    expect(unsuppressResult.ok).toBe(true);
    expect(doc.featuresById.get(sketchResult.value.featureId)?.get("suppressed")).toBe(false);
  });
});

// ============================================================================
// Invariant E: Undo/Redo works identically for all paths
// ============================================================================

describe("Invariant E: Undo/Redo consistency", () => {
  test("undo reverses command", () => {
    const doc = createDocument();
    const undoManager = new Y.UndoManager([doc.featuresById, doc.featureOrder, doc.state]);

    const initialCount = doc.featureOrder.length;

    const sketchResult = createSketch(doc, { planeRef: "xy" });
    expect(sketchResult.ok).toBe(true);
    expect(doc.featureOrder.length).toBe(initialCount + 1);

    undoManager.undo();
    expect(doc.featureOrder.length).toBe(initialCount);
  });

  test("redo restores command", () => {
    const doc = createDocument();
    const undoManager = new Y.UndoManager([doc.featuresById, doc.featureOrder, doc.state]);

    const initialCount = doc.featureOrder.length;

    const sketchResult = createSketch(doc, { planeRef: "xy" });
    expect(sketchResult.ok).toBe(true);

    undoManager.undo();
    expect(doc.featureOrder.length).toBe(initialCount);

    undoManager.redo();
    expect(doc.featureOrder.length).toBe(initialCount + 1);
  });
});
