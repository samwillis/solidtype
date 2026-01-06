/**
 * Modeling Tool Tests
 *
 * Tests for 3D modeling AI tool implementations.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { v4 as uuid } from "uuid";
import type { SolidTypeDoc } from "../../../../../src/editor/document/createDocument";
import * as modelingImpl from "../../../../../src/lib/ai/tools/modeling-impl";
import {
  isModelingTool,
  executeModelingTool,
} from "../../../../../src/lib/ai/runtime/modeling-tool-executor";

// Helper to create a minimal test document
function createTestDocument(): SolidTypeDoc {
  const ydoc = new Y.Doc();
  const metadata = ydoc.getMap("metadata");
  const featuresById = ydoc.getMap("featuresById") as Y.Map<Y.Map<unknown>>;
  const featureOrder = ydoc.getArray("featureOrder") as Y.Array<string>;

  metadata.set("name", "Test Document");
  metadata.set("units", "mm");

  return {
    ydoc,
    metadata,
    featuresById,
    featureOrder,
    undoManager: new Y.UndoManager([featuresById, featureOrder]),
  } as unknown as SolidTypeDoc;
}

// Helper to create a test sketch in the document
function createTestSketch(doc: SolidTypeDoc, sketchId?: string): string {
  const id = sketchId || uuid();
  const sketchFeature = new Y.Map();
  sketchFeature.set("type", "sketch");
  sketchFeature.set("name", "Test Sketch");
  sketchFeature.set("plane", { kind: "datumRole", ref: "xy" });

  const sketchData = new Y.Map();
  sketchData.set("pointsById", new Y.Map());
  sketchData.set("entitiesById", new Y.Map());
  sketchData.set("constraintsById", new Y.Map());
  sketchFeature.set("data", sketchData);

  doc.ydoc.transact(() => {
    doc.featuresById.set(id, sketchFeature);
    doc.featureOrder.push([id]);
  });

  return id;
}

describe("isModelingTool", () => {
  it("identifies query tools", () => {
    expect(isModelingTool("getCurrentSelection")).toBe(true);
    expect(isModelingTool("getModelContext")).toBe(true);
    expect(isModelingTool("findFaces")).toBe(true);
    expect(isModelingTool("findEdges")).toBe(true);
    expect(isModelingTool("measureDistance")).toBe(true);
    expect(isModelingTool("getBoundingBox")).toBe(true);
    expect(isModelingTool("measureAngle")).toBe(true);
  });

  it("identifies feature tools", () => {
    expect(isModelingTool("createExtrude")).toBe(true);
    expect(isModelingTool("createRevolve")).toBe(true);
    expect(isModelingTool("createFillet")).toBe(true);
    expect(isModelingTool("createChamfer")).toBe(true);
    expect(isModelingTool("createLinearPattern")).toBe(true);
    expect(isModelingTool("createCircularPattern")).toBe(true);
  });

  it("identifies modify tools", () => {
    expect(isModelingTool("modifyFeature")).toBe(true);
    expect(isModelingTool("deleteFeature")).toBe(true);
    expect(isModelingTool("reorderFeature")).toBe(true);
    expect(isModelingTool("suppressFeature")).toBe(true);
    expect(isModelingTool("renameFeature")).toBe(true);
  });

  it("identifies helper tools", () => {
    expect(isModelingTool("createBox")).toBe(true);
    expect(isModelingTool("createCylinder")).toBe(true);
    expect(isModelingTool("createHole")).toBe(true);
    expect(isModelingTool("createShell")).toBe(true);
  });

  it("returns false for non-modeling tools", () => {
    expect(isModelingTool("addLine")).toBe(false);
    expect(isModelingTool("addCircle")).toBe(false);
    expect(isModelingTool("listWorkspaces")).toBe(false);
  });
});

describe("executeModelingTool", () => {
  let doc: SolidTypeDoc;

  beforeEach(() => {
    doc = createTestDocument();
  });

  it("executes getModelContext", () => {
    createTestSketch(doc);
    const result = executeModelingTool("getModelContext", {}, { doc });
    expect(result).toHaveProperty("documentName", "Test Document");
    expect(result).toHaveProperty("featureCount", 1);
  });

  it("executes createExtrude", () => {
    const sketchId = createTestSketch(doc);
    const result = executeModelingTool(
      "createExtrude",
      { sketchId, distance: 10, op: "add" },
      { doc }
    ) as { featureId: string; status: string };

    expect(result.status).toBe("ok");
    expect(result.featureId).toBeDefined();

    // Verify feature was created
    const feature = doc.featuresById.get(result.featureId);
    expect(feature).toBeDefined();
    expect(feature?.get("type")).toBe("extrude");
    expect(feature?.get("distance")).toBe(10);
  });

  it("returns error for createExtrude with invalid sketch", () => {
    const result = executeModelingTool(
      "createExtrude",
      { sketchId: "nonexistent", distance: 10, op: "add" },
      { doc }
    ) as { status: string; error: string };

    expect(result.status).toBe("error");
    expect(result.error).toContain("not found");
  });

  it("throws for unknown tool", () => {
    expect(() => executeModelingTool("unknownTool", {}, { doc })).toThrow(
      "Unknown modeling tool"
    );
  });
});

describe("Feature Tools", () => {
  let doc: SolidTypeDoc;

  beforeEach(() => {
    doc = createTestDocument();
  });

  describe("createExtrudeImpl", () => {
    it("creates an extrude feature", () => {
      const sketchId = createTestSketch(doc);
      const result = modelingImpl.createExtrudeImpl(
        { sketchId, distance: 20, op: "cut", direction: "reverse", name: "Test Extrude" },
        { doc }
      ) as { featureId: string; status: string };

      expect(result.status).toBe("ok");
      const feature = doc.featuresById.get(result.featureId)!;
      expect(feature.get("type")).toBe("extrude");
      expect(feature.get("name")).toBe("Test Extrude");
      expect(feature.get("distance")).toBe(20);
      expect(feature.get("op")).toBe("cut");
      expect(feature.get("direction")).toBe("reverse");
    });
  });

  describe("createRevolveImpl", () => {
    it("creates a revolve feature", () => {
      const sketchId = createTestSketch(doc);
      const result = modelingImpl.createRevolveImpl(
        { sketchId, axisLineId: "line1", angle: 180, op: "add" },
        { doc }
      ) as { featureId: string; status: string };

      expect(result.status).toBe("ok");
      const feature = doc.featuresById.get(result.featureId)!;
      expect(feature.get("type")).toBe("revolve");
      expect(feature.get("angle")).toBe(180);
    });
  });

  describe("createFilletImpl", () => {
    it("creates a fillet feature", () => {
      const result = modelingImpl.createFilletImpl(
        { edgeRefs: ["edge1", "edge2"], radius: 2 },
        { doc }
      ) as { featureId: string; status: string };

      expect(result.status).toBe("ok");
      const feature = doc.featuresById.get(result.featureId)!;
      expect(feature.get("type")).toBe("fillet");
      expect(feature.get("radius")).toBe(2);
    });
  });

  describe("createChamferImpl", () => {
    it("creates a chamfer feature", () => {
      const result = modelingImpl.createChamferImpl(
        { edgeRefs: ["edge1"], distance: 1.5 },
        { doc }
      ) as { featureId: string; status: string };

      expect(result.status).toBe("ok");
      const feature = doc.featuresById.get(result.featureId)!;
      expect(feature.get("type")).toBe("chamfer");
      expect(feature.get("distance")).toBe(1.5);
    });
  });

  describe("createLinearPatternImpl", () => {
    it("creates a linear pattern feature", () => {
      const result = modelingImpl.createLinearPatternImpl(
        { featureIds: ["f1", "f2"], directionX: 1, directionY: 0, directionZ: 0, count: 5, spacing: 10 },
        { doc }
      ) as { featureId: string; status: string };

      expect(result.status).toBe("ok");
      const feature = doc.featuresById.get(result.featureId)!;
      expect(feature.get("type")).toBe("linearPattern");
      expect(feature.get("count")).toBe(5);
      expect(feature.get("spacing")).toBe(10);
      expect(feature.get("direction")).toEqual([1, 0, 0]);
    });
  });
});

describe("Modify Tools", () => {
  let doc: SolidTypeDoc;

  beforeEach(() => {
    doc = createTestDocument();
  });

  describe("modifyFeatureImpl", () => {
    it("modifies feature properties with string value", () => {
      const sketchId = createTestSketch(doc);
      const result = modelingImpl.modifyFeatureImpl(
        { featureId: sketchId, parameterName: "name", stringValue: "Modified Sketch" },
        { doc }
      ) as { success: boolean };

      expect(result.success).toBe(true);
      expect(doc.featuresById.get(sketchId)?.get("name")).toBe("Modified Sketch");
    });

    it("modifies feature properties with number value", () => {
      const sketchId = createTestSketch(doc);
      const result = modelingImpl.modifyFeatureImpl(
        { featureId: sketchId, parameterName: "distance", numberValue: 25 },
        { doc }
      ) as { success: boolean };

      expect(result.success).toBe(true);
      expect(doc.featuresById.get(sketchId)?.get("distance")).toBe(25);
    });

    it("returns error for nonexistent feature", () => {
      const result = modelingImpl.modifyFeatureImpl(
        { featureId: "nonexistent", parameterName: "name", stringValue: "New" },
        { doc }
      ) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("deleteFeatureImpl", () => {
    it("deletes a feature", () => {
      const sketchId = createTestSketch(doc);
      expect(doc.featuresById.has(sketchId)).toBe(true);

      const result = modelingImpl.deleteFeatureImpl(
        { featureId: sketchId },
        { doc }
      ) as { success: boolean; deletedIds: string[] };

      expect(result.success).toBe(true);
      expect(result.deletedIds).toContain(sketchId);
      expect(doc.featuresById.has(sketchId)).toBe(false);
    });
  });

  describe("reorderFeatureImpl", () => {
    it("reorders a feature to the beginning", () => {
      const sketch1 = createTestSketch(doc);
      const sketch2 = createTestSketch(doc);

      expect(doc.featureOrder.toArray()).toEqual([sketch1, sketch2]);

      const result = modelingImpl.reorderFeatureImpl(
        { featureId: sketch2, afterFeatureId: null },
        { doc }
      ) as { success: boolean };

      expect(result.success).toBe(true);
      expect(doc.featureOrder.toArray()).toEqual([sketch2, sketch1]);
    });
  });

  describe("suppressFeatureImpl", () => {
    it("suppresses a feature", () => {
      const sketchId = createTestSketch(doc);
      const result = modelingImpl.suppressFeatureImpl(
        { featureId: sketchId, suppressed: true },
        { doc }
      ) as { success: boolean };

      expect(result.success).toBe(true);
      expect(doc.featuresById.get(sketchId)?.get("suppressed")).toBe(true);
    });
  });

  describe("renameFeatureImpl", () => {
    it("renames a feature", () => {
      const sketchId = createTestSketch(doc);
      const result = modelingImpl.renameFeatureImpl(
        { featureId: sketchId, name: "Renamed Feature" },
        { doc }
      ) as { success: boolean };

      expect(result.success).toBe(true);
      expect(doc.featuresById.get(sketchId)?.get("name")).toBe("Renamed Feature");
    });
  });

  describe("duplicateFeatureImpl", () => {
    it("duplicates a feature", () => {
      const sketchId = createTestSketch(doc);
      const result = modelingImpl.duplicateFeatureImpl(
        { featureId: sketchId },
        { doc }
      ) as { success: boolean; newFeatureId: string };

      expect(result.success).toBe(true);
      expect(result.newFeatureId).toBeDefined();
      expect(doc.featuresById.has(result.newFeatureId)).toBe(true);

      const newFeature = doc.featuresById.get(result.newFeatureId)!;
      expect(newFeature.get("name")).toBe("Test Sketch (Copy)");
    });
  });
});

describe("Helper Tools", () => {
  let doc: SolidTypeDoc;

  beforeEach(() => {
    doc = createTestDocument();
  });

  describe("createBoxImpl", () => {
    it("creates a box (sketch + extrude)", () => {
      const result = modelingImpl.createBoxImpl(
        { width: 50, height: 30, depth: 20, centered: true, name: "Test Box" },
        { doc }
      ) as { sketchId: string; extrudeId: string };

      expect(result.sketchId).toBeDefined();
      expect(result.extrudeId).toBeDefined();

      // Verify sketch
      const sketch = doc.featuresById.get(result.sketchId)!;
      expect(sketch.get("type")).toBe("sketch");
      expect(sketch.get("name")).toBe("Test Box Sketch");

      // Verify extrude
      const extrude = doc.featuresById.get(result.extrudeId)!;
      expect(extrude.get("type")).toBe("extrude");
      expect(extrude.get("name")).toBe("Test Box");
      expect(extrude.get("distance")).toBe(30);
      expect(extrude.get("sketch")).toBe(result.sketchId);

      // Verify sketch data has 4 points and 4 lines
      const data = sketch.get("data") as Y.Map<Y.Map<unknown>>;
      const points = data.get("pointsById") as Y.Map<unknown>;
      const entities = data.get("entitiesById") as Y.Map<unknown>;
      expect(points.size).toBe(4);
      expect(entities.size).toBe(4);
    });

    it("creates an uncentered box", () => {
      const result = modelingImpl.createBoxImpl(
        { width: 100, height: 50, depth: 75, centered: false },
        { doc }
      ) as { sketchId: string };

      const sketch = doc.featuresById.get(result.sketchId)!;
      const data = sketch.get("data") as Y.Map<Y.Map<unknown>>;
      const points = data.get("pointsById") as Y.Map<{ x: number; y: number }>;

      // Find corner at origin
      const pointValues = Array.from(points.values());
      const originCorner = pointValues.find((p) => p.x === 0 && p.y === 0);
      expect(originCorner).toBeDefined();
    });
  });

  describe("createCylinderImpl", () => {
    it("creates a cylinder (sketch + extrude)", () => {
      const result = modelingImpl.createCylinderImpl(
        { radius: 10, height: 25, name: "Test Cylinder" },
        { doc }
      ) as { sketchId: string; extrudeId: string };

      expect(result.sketchId).toBeDefined();
      expect(result.extrudeId).toBeDefined();

      // Verify sketch has a circle
      const sketch = doc.featuresById.get(result.sketchId)!;
      const data = sketch.get("data") as Y.Map<Y.Map<unknown>>;
      const entities = data.get("entitiesById") as Y.Map<{ type: string; radius: number }>;
      const entityValues = Array.from(entities.values());
      const circle = entityValues.find((e) => e.type === "circle");
      expect(circle).toBeDefined();
      expect(circle?.radius).toBe(10);

      // Verify extrude
      const extrude = doc.featuresById.get(result.extrudeId)!;
      expect(extrude.get("distance")).toBe(25);
    });
  });

  describe("createShellImpl", () => {
    it("creates a shell feature", () => {
      const result = modelingImpl.createShellImpl(
        { thickness: 2, openFaces: ["face1"] },
        { doc }
      ) as { featureId: string; status: string };

      expect(result.status).toBe("ok");
      const feature = doc.featuresById.get(result.featureId)!;
      expect(feature.get("type")).toBe("shell");
      expect(feature.get("thickness")).toBe(2);
    });
  });
});

describe("Query Tools", () => {
  let doc: SolidTypeDoc;

  beforeEach(() => {
    doc = createTestDocument();
  });

  describe("getModelContextImpl", () => {
    it("returns document info with no features", () => {
      const result = modelingImpl.getModelContextImpl({}, { doc }) as {
        documentName: string;
        featureCount: number;
        features: unknown[];
      };

      expect(result.documentName).toBe("Test Document");
      expect(result.featureCount).toBe(0);
      expect(result.features).toEqual([]);
    });

    it("returns document info with features", () => {
      createTestSketch(doc);
      createTestSketch(doc);

      const result = modelingImpl.getModelContextImpl({}, { doc }) as {
        featureCount: number;
        features: Array<{ id: string; type: string }>;
      };

      expect(result.featureCount).toBe(2);
      expect(result.features.length).toBe(2);
      expect(result.features[0].type).toBe("sketch");
    });
  });

  describe("getCurrentSelectionImpl", () => {
    it("returns empty selection", () => {
      const result = modelingImpl.getCurrentSelectionImpl({}, { doc }) as {
        type: string;
        items: unknown[];
      };

      expect(result.type).toBe("none");
      expect(result.items).toEqual([]);
    });
  });
});
