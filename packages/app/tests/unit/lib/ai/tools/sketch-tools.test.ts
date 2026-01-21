/**
 * Sketch AI Tools Unit Tests
 *
 * Tests for sketch tool definitions and implementations.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as Y from "yjs";

// Import tool definitions
import {
  createSketchDef,
  enterSketchDef,
  exitSketchDef,
  getSketchStatusDef,
  addLineDef,
  addCircleDef,
  addArcDef,
  addRectangleDef,
  addPolygonDef,
  addSlotDef,
  addPointDef,
  movePointDef,
  mergePointsDef,
  addConstraintDef,
  removeConstraintDef,
  modifyConstraintValueDef,
  deleteEntityDef,
  deletePointDef,
  toggleConstructionDef,
  sketchToolDefs,
} from "../../../../../src/lib/ai/tools/sketch";

import {
  createCenteredRectangleDef,
  createCircleWithRadiusDef,
  createSymmetricProfileDef,
  createBoltCircleDef,
  createCenterlinesAtOriginDef,
  createChamferedRectangleDef,
  createRoundedRectangleDef,
  sketchHelperToolDefs,
} from "../../../../../src/lib/ai/tools/sketch-helpers";

import {
  getToolExecutionMode,
  isLocalTool,
} from "../../../../../src/lib/ai/tools/execution-registry";
import { getApprovalLevel } from "../../../../../src/lib/ai/approval";

describe("Sketch Tool Definitions", () => {
  describe("Tool Definition Structure", () => {
    it("should have all required sketch tools defined", () => {
      const toolNames = sketchToolDefs.map((def) => def.name);

      // Lifecycle tools
      expect(toolNames).toContain("createSketch");
      expect(toolNames).toContain("enterSketch");
      expect(toolNames).toContain("exitSketch");
      expect(toolNames).toContain("getSketchStatus");

      // Geometry tools
      expect(toolNames).toContain("addLine");
      expect(toolNames).toContain("addCircle");
      expect(toolNames).toContain("addArc");
      expect(toolNames).toContain("addRectangle");
      expect(toolNames).toContain("addPolygon");
      expect(toolNames).toContain("addSlot");

      // Point tools
      expect(toolNames).toContain("addPoint");
      expect(toolNames).toContain("movePoint");
      expect(toolNames).toContain("mergePoints");

      // Constraint tools
      expect(toolNames).toContain("addConstraint");
      expect(toolNames).toContain("removeConstraint");
      expect(toolNames).toContain("modifyConstraintValue");

      // Deletion tools
      expect(toolNames).toContain("deleteEntity");
      expect(toolNames).toContain("deletePoint");

      // Construction tools
      expect(toolNames).toContain("toggleConstruction");
    });

    it("should have all helper tools defined", () => {
      const helperToolNames = sketchHelperToolDefs.map((def) => def.name);

      expect(helperToolNames).toContain("createCenteredRectangle");
      expect(helperToolNames).toContain("createCircleWithRadius");
      expect(helperToolNames).toContain("createSymmetricProfile");
      expect(helperToolNames).toContain("createBoltCircle");
      expect(helperToolNames).toContain("createCenterlinesAtOrigin");
      expect(helperToolNames).toContain("createChamferedRectangle");
      expect(helperToolNames).toContain("createRoundedRectangle");
    });

    it("all tool definitions should have name and inputSchema", () => {
      for (const def of sketchToolDefs) {
        expect(def.name).toBeDefined();
        expect(typeof def.name).toBe("string");
        expect(def.inputSchema).toBeDefined();
      }

      for (const def of sketchHelperToolDefs) {
        expect(def.name).toBeDefined();
        expect(typeof def.name).toBe("string");
        expect(def.inputSchema).toBeDefined();
      }
    });
  });

  describe("Input Schema Validation", () => {
    it("createSketch should validate plane input", () => {
      // New flattened schema format (OpenAI doesn't support oneOf/discriminatedUnion)
      const validInputs = [
        { planeType: "datumRole", planeRef: "xy", enterSketch: true },
        { planeType: "planeFeatureId", planeRef: "550e8400-e29b-41d4-a716-446655440000" },
        { planeType: "faceRef", planeRef: "face:feature1:0", name: "My Sketch" },
      ];

      for (const input of validInputs) {
        const result = createSketchDef.inputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it("addLine should validate start and end points", () => {
      const validInput = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 50 },
      };

      const result = addLineDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("addLine should accept optional point IDs", () => {
      const validInput = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 50 },
        startPointId: "point-1",
        endPointId: "point-2",
        construction: true,
      };

      const result = addLineDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("addCircle should validate center and radius", () => {
      const validInput = {
        center: { x: 50, y: 50 },
        radius: 25,
      };

      const result = addCircleDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("addCircle should reject non-positive radius", () => {
      const invalidInput = {
        center: { x: 50, y: 50 },
        radius: -10,
      };

      const result = addCircleDef.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it("addRectangle should validate corners", () => {
      const validInput = {
        corner1: { x: 0, y: 0 },
        corner2: { x: 100, y: 50 },
        centered: false,
      };

      const result = addRectangleDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("addPolygon should validate sides range", () => {
      const validInput = {
        center: { x: 0, y: 0 },
        radius: 50,
        sides: 6, // hexagon
      };

      const result = addPolygonDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // Too few sides
      const invalidInput1 = { ...validInput, sides: 2 };
      expect(addPolygonDef.inputSchema.safeParse(invalidInput1).success).toBe(false);

      // Too many sides
      const invalidInput2 = { ...validInput, sides: 101 };
      expect(addPolygonDef.inputSchema.safeParse(invalidInput2).success).toBe(false);
    });

    it("addConstraint should validate different constraint types", () => {
      // Flattened schema (no nested constraint object) for OpenAI compatibility
      const constraints = [
        { type: "horizontal", points: ["p1", "p2"] },
        { type: "vertical", points: ["p1", "p2"] },
        { type: "coincident", points: ["p1", "p2"] },
        { type: "fixed", point: "p1" },
        { type: "distance", points: ["p1", "p2"], value: 50 },
        { type: "angle", lines: ["l1", "l2"], value: 90 },
        { type: "parallel", lines: ["l1", "l2"] },
        { type: "perpendicular", lines: ["l1", "l2"] },
        { type: "tangent", line: "l1", arc: "a1" },
        { type: "symmetric", points: ["p1", "p2"], axis: "l1" },
      ];

      for (const input of constraints) {
        const result = addConstraintDef.inputSchema.safeParse(input);
        expect(result.success, `Failed for constraint type: ${input.type}`).toBe(true);
      }
    });

    it("addSlot should validate center, length, and width", () => {
      const validInput = {
        center: { x: 0, y: 0 },
        length: 100,
        width: 30,
        angle: 45,
      };

      const result = addSlotDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });
});

describe("Sketch Tool Execution Mode", () => {
  it("all sketch tools should execute locally", () => {
    const sketchToolNames = [
      "createSketch",
      "enterSketch",
      "exitSketch",
      "getSketchStatus",
      "addLine",
      "addCircle",
      "addArc",
      "addRectangle",
      "addPolygon",
      "addSlot",
      "addPoint",
      "movePoint",
      "mergePoints",
      "addConstraint",
      "removeConstraint",
      "modifyConstraintValue",
      "deleteEntity",
      "deletePoint",
      "toggleConstruction",
    ];

    for (const toolName of sketchToolNames) {
      expect(getToolExecutionMode(toolName), `${toolName} should be local`).toBe("local");
      expect(isLocalTool(toolName)).toBe(true);
    }
  });

  it("all helper tools should execute locally", () => {
    const helperToolNames = [
      "createCenteredRectangle",
      "createCircleWithRadius",
      "createSymmetricProfile",
      "createBoltCircle",
      "createCenterlinesAtOrigin",
      "createChamferedRectangle",
      "createRoundedRectangle",
    ];

    for (const toolName of helperToolNames) {
      expect(getToolExecutionMode(toolName), `${toolName} should be local`).toBe("local");
    }
  });
});

describe("Sketch Tool Approval Levels", () => {
  it("all sketch tools should auto-approve (undoable via Yjs)", () => {
    const sketchToolNames = [
      "createSketch",
      "enterSketch",
      "exitSketch",
      "addLine",
      "addCircle",
      "addArc",
      "addRectangle",
      "addPolygon",
      "addSlot",
      "addPoint",
      "movePoint",
      "mergePoints",
      "addConstraint",
      "removeConstraint",
      "modifyConstraintValue",
      "deleteEntity",
      "deletePoint",
      "toggleConstruction",
    ];

    for (const toolName of sketchToolNames) {
      expect(getApprovalLevel(toolName, "editor"), `${toolName} should be auto`).toBe("auto");
    }
  });

  it("all helper tools should auto-approve", () => {
    const helperToolNames = [
      "createCenteredRectangle",
      "createCircleWithRadius",
      "createSymmetricProfile",
      "createBoltCircle",
      "createCenterlinesAtOrigin",
      "createChamferedRectangle",
      "createRoundedRectangle",
    ];

    for (const toolName of helperToolNames) {
      expect(getApprovalLevel(toolName, "editor"), `${toolName} should be auto`).toBe("auto");
    }
  });
});

describe("Sketch Helper Tool Definitions", () => {
  describe("createCenteredRectangle", () => {
    it("should validate width and height", () => {
      const validInput = {
        width: 100,
        height: 50,
        centerX: 0,
        centerY: 0,
      };

      const result = createCenteredRectangleDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("should reject non-positive dimensions", () => {
      const invalidInput = {
        width: -10,
        height: 50,
      };

      const result = createCenteredRectangleDef.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe("createCircleWithRadius", () => {
    it("should validate radius", () => {
      const validInput = {
        radius: 25,
      };

      const result = createCircleWithRadiusDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("should accept center coordinates", () => {
      const validInput = {
        radius: 25,
        centerX: 50,
        centerY: 50,
      };

      const result = createCircleWithRadiusDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  describe("createSymmetricProfile", () => {
    it("should validate half profile points", () => {
      const validInput = {
        halfProfile: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 100 },
          { x: 0, y: 100 },
        ],
        closed: true,
      };

      const result = createSymmetricProfileDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("should require at least 2 points", () => {
      const invalidInput = {
        halfProfile: [{ x: 0, y: 0 }],
        closed: true,
      };

      const result = createSymmetricProfileDef.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe("createBoltCircle", () => {
    it("should validate bolt circle parameters", () => {
      const validInput = {
        patternCenter: { x: 0, y: 0 },
        patternRadius: 50,
        holeRadius: 5,
        count: 6,
        startAngle: 0,
      };

      const result = createBoltCircleDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("should reject invalid hole count", () => {
      const invalidInput = {
        patternCenter: { x: 0, y: 0 },
        patternRadius: 50,
        holeRadius: 5,
        count: 1, // Too few
      };

      const result = createBoltCircleDef.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe("createRoundedRectangle", () => {
    it("should validate rounded rectangle parameters", () => {
      const validInput = {
        width: 100,
        height: 50,
        cornerRadius: 10,
        centerX: 0,
        centerY: 0,
      };

      const result = createRoundedRectangleDef.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });
});

describe("Tool Definition Count", () => {
  it("should have correct number of sketch tools", () => {
    // 5 lifecycle + 6 geometry + 3 point + 3 constraint + 2 deletion + 1 construction = 20
    expect(sketchToolDefs.length).toBe(20);
  });

  it("should have correct number of helper tools", () => {
    expect(sketchHelperToolDefs.length).toBe(7);
  });
});
