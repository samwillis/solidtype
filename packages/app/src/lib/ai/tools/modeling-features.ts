/**
 * Modeling Feature Tool Definitions
 *
 * Tool definitions for creating 3D features (extrude, revolve, fillet, chamfer, patterns).
 * These modify the Yjs document by adding new features.
 */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============ Primary Feature Tools ============

export const createExtrudeDef = toolDefinition({
  name: "createExtrude",
  description: "Extrude a sketch profile to create or cut 3D geometry",
  inputSchema: z.object({
    sketchId: z.string().describe("ID of the sketch to extrude"),
    distance: z.number().positive().describe("Extrusion distance in document units"),
    op: z.enum(["add", "cut"]).describe("Boolean operation: add material or cut away"),
    direction: z
      .enum(["normal", "reverse", "symmetric"])
      .default("normal")
      .describe("Extrusion direction relative to sketch plane"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createRevolveDef = toolDefinition({
  name: "createRevolve",
  description: "Revolve a sketch profile around an axis line to create rotational geometry",
  inputSchema: z.object({
    sketchId: z.string().describe("ID of the sketch to revolve"),
    axisLineId: z.string().describe("ID of the line entity in the sketch to use as axis"),
    angle: z.number().min(0).max(360).describe("Revolve angle in degrees"),
    op: z.enum(["add", "cut"]).describe("Boolean operation"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createLoftDef = toolDefinition({
  name: "createLoft",
  description: "Create a lofted solid between two or more sketch profiles",
  inputSchema: z.object({
    sketchIds: z.array(z.string()).min(2).describe("IDs of sketches to loft between"),
    op: z.enum(["add", "cut"]).describe("Boolean operation"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createSweepDef = toolDefinition({
  name: "createSweep",
  description: "Sweep a sketch profile along a path curve",
  inputSchema: z.object({
    profileSketchId: z.string().describe("ID of the profile sketch"),
    pathSketchId: z.string().describe("ID of the sketch containing the path"),
    pathEntityId: z.string().describe("ID of the path entity (line, arc, or spline)"),
    op: z.enum(["add", "cut"]).describe("Boolean operation"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

// ============ Detail Feature Tools ============

export const createFilletDef = toolDefinition({
  name: "createFillet",
  description: "Add rounded fillets to one or more edges",
  inputSchema: z.object({
    edgeRefs: z.array(z.string()).min(1).describe("Persistent references to edges"),
    radius: z.number().positive().describe("Fillet radius"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createChamferDef = toolDefinition({
  name: "createChamfer",
  description: "Add angled chamfers to one or more edges",
  inputSchema: z.object({
    edgeRefs: z.array(z.string()).min(1).describe("Persistent references to edges"),
    distance: z.number().positive().describe("Chamfer distance"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createDraftDef = toolDefinition({
  name: "createDraft",
  description: "Add draft angle to faces for mold release",
  inputSchema: z.object({
    faceRefs: z.array(z.string()).min(1).describe("Persistent references to faces"),
    angle: z.number().min(0).max(45).describe("Draft angle in degrees"),
    pullDirectionX: z.number().describe("Pull direction vector X component"),
    pullDirectionY: z.number().describe("Pull direction vector Y component"),
    pullDirectionZ: z.number().describe("Pull direction vector Z component"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

// ============ Pattern Tools ============

export const createLinearPatternDef = toolDefinition({
  name: "createLinearPattern",
  description: "Create a linear pattern of features along a direction",
  inputSchema: z.object({
    featureIds: z.array(z.string()).min(1).describe("Feature IDs to pattern"),
    directionX: z.number().describe("Pattern direction vector X component"),
    directionY: z.number().describe("Pattern direction vector Y component"),
    directionZ: z.number().describe("Pattern direction vector Z component"),
    count: z.number().int().min(2).describe("Number of instances"),
    spacing: z.number().positive().describe("Distance between instances"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createCircularPatternDef = toolDefinition({
  name: "createCircularPattern",
  description: "Create a circular pattern of features around an axis",
  inputSchema: z.object({
    featureIds: z.array(z.string()).min(1).describe("Feature IDs to pattern"),
    axisX: z.number().describe("Axis direction vector X component"),
    axisY: z.number().describe("Axis direction vector Y component"),
    axisZ: z.number().describe("Axis direction vector Z component"),
    axisPointX: z.number().describe("Point on axis X coordinate"),
    axisPointY: z.number().describe("Point on axis Y coordinate"),
    axisPointZ: z.number().describe("Point on axis Z coordinate"),
    count: z.number().int().min(2).describe("Number of instances"),
    totalAngle: z.number().default(360).describe("Total angle of pattern in degrees"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createMirrorDef = toolDefinition({
  name: "createMirror",
  description: "Mirror features across a plane",
  inputSchema: z.object({
    featureIds: z.array(z.string()).min(1).describe("Feature IDs to mirror"),
    planeRef: z.string().describe("Reference to mirror plane (datum or face)"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

// ============ Export All Feature Tools ============

export const modelingFeatureToolDefs = {
  createExtrude: createExtrudeDef,
  createRevolve: createRevolveDef,
  createLoft: createLoftDef,
  createSweep: createSweepDef,
  createFillet: createFilletDef,
  createChamfer: createChamferDef,
  createDraft: createDraftDef,
  createLinearPattern: createLinearPatternDef,
  createCircularPattern: createCircularPatternDef,
  createMirror: createMirrorDef,
};
