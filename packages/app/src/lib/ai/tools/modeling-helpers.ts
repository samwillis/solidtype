/**
 * Modeling Helper Tool Definitions
 *
 * High-level geometry helpers that combine multiple operations into single tools.
 * These make common modeling tasks easier for the AI.
 */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============ Primitive Creation Helpers ============

export const createBoxDef = toolDefinition({
  name: "createBox",
  description:
    "Create a box primitive (creates a sketch with rectangle and extrudes it)",
  inputSchema: z.object({
    width: z.number().positive().describe("Width (X dimension)"),
    height: z.number().positive().describe("Height (Z dimension / extrusion)"),
    depth: z.number().positive().describe("Depth (Y dimension)"),
    centered: z
      .boolean()
      .default(true)
      .describe("If true, box is centered at origin; if false, corner at origin"),
    plane: z
      .enum(["xy", "xz", "yz"])
      .default("xy")
      .describe("Plane for the base sketch"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    extrudeId: z.string(),
  }),
});

export const createCylinderDef = toolDefinition({
  name: "createCylinder",
  description: "Create a cylinder primitive (creates a sketch with circle and extrudes it)",
  inputSchema: z.object({
    radius: z.number().positive().describe("Cylinder radius"),
    height: z.number().positive().describe("Cylinder height"),
    centered: z
      .boolean()
      .default(true)
      .describe("If true, circle centered at origin"),
    plane: z
      .enum(["xy", "xz", "yz"])
      .default("xy")
      .describe("Plane for the base sketch"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    extrudeId: z.string(),
  }),
});

export const createSphereDef = toolDefinition({
  name: "createSphere",
  description: "Create a sphere primitive (creates a semicircle sketch and revolves it)",
  inputSchema: z.object({
    radius: z.number().positive().describe("Sphere radius"),
    centerX: z.number().default(0).describe("Center point X coordinate"),
    centerY: z.number().default(0).describe("Center point Y coordinate"),
    centerZ: z.number().default(0).describe("Center point Z coordinate"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    revolveId: z.string(),
  }),
});

export const createConeDef = toolDefinition({
  name: "createCone",
  description: "Create a cone primitive",
  inputSchema: z.object({
    baseRadius: z.number().positive().describe("Base radius"),
    topRadius: z.number().min(0).describe("Top radius (0 for a point)"),
    height: z.number().positive().describe("Cone height"),
    plane: z
      .enum(["xy", "xz", "yz"])
      .default("xy")
      .describe("Plane for the base sketch"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    revolveId: z.string(),
  }),
});

// ============ Common Feature Helpers ============

export const createHoleDef = toolDefinition({
  name: "createHole",
  description: "Create a hole on a face (creates a sketch with circle and cuts)",
  inputSchema: z.object({
    faceRef: z.string().describe("Persistent reference to the face"),
    diameter: z.number().positive().describe("Hole diameter"),
    depthValue: z.number().nullish().describe("Hole depth in units (omit for through-all)"),
    throughAll: z.boolean().default(false).describe("If true, hole goes through entire body"),
    positionU: z.number().nullish().describe("Position along face U parameter (0-1), omit for center"),
    positionV: z.number().nullish().describe("Position along face V parameter (0-1), omit for center"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
  }),
});

export const createPocketDef = toolDefinition({
  name: "createPocket",
  description: "Create a rectangular pocket on a face",
  inputSchema: z.object({
    faceRef: z.string().describe("Persistent reference to the face"),
    width: z.number().positive().describe("Pocket width"),
    length: z.number().positive().describe("Pocket length"),
    depth: z.number().positive().describe("Pocket depth"),
    cornerRadius: z.number().min(0).default(0).describe("Corner radius (0 for sharp corners)"),
    positionU: z.number().nullish().describe("Position along face U parameter (0-1), omit for center"),
    positionV: z.number().nullish().describe("Position along face V parameter (0-1), omit for center"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
    filletId: z.string().nullish(),
  }),
});

export const createBossDef = toolDefinition({
  name: "createBoss",
  description: "Create a raised boss on a face",
  inputSchema: z.object({
    faceRef: z.string().describe("Persistent reference to the face"),
    shape: z.enum(["circle", "rectangle"]).describe("Boss shape"),
    diameter: z.number().positive().nullish().describe("Diameter (for circle)"),
    width: z.number().positive().nullish().describe("Width (for rectangle)"),
    length: z.number().positive().nullish().describe("Length (for rectangle)"),
    height: z.number().positive().describe("Boss height"),
    positionU: z.number().nullish().describe("Position along face U parameter (0-1), omit for center"),
    positionV: z.number().nullish().describe("Position along face V parameter (0-1), omit for center"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    featureId: z.string(),
  }),
});

export const createShellDef = toolDefinition({
  name: "createShell",
  description: "Hollow out a solid body with uniform wall thickness",
  inputSchema: z.object({
    thickness: z.number().positive().describe("Wall thickness"),
    openFaces: z
      .array(z.string())
      .nullish()
      .describe("Face references to leave open (remove)"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const createRibDef = toolDefinition({
  name: "createRib",
  description: "Create a rib (thin wall feature) from a sketch line",
  inputSchema: z.object({
    sketchId: z.string().describe("Sketch containing the rib profile"),
    lineId: z.string().describe("Line entity ID in the sketch"),
    thickness: z.number().positive().describe("Rib thickness"),
    direction: z
      .enum(["left", "right", "symmetric"])
      .default("symmetric")
      .describe("Which side of the line to add material"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

// ============ Common Operations ============

export const filletAllEdgesDef = toolDefinition({
  name: "filletAllEdges",
  description: "Add fillets to all edges of a feature or the entire model",
  inputSchema: z.object({
    radius: z.number().positive().describe("Fillet radius"),
    featureId: z
      .string()
      .nullish()
      .describe("Feature ID to fillet; omit for all edges on model"),
    excludeEdges: z
      .array(z.string())
      .nullish()
      .describe("Edge references to exclude from filleting"),
    name: z.string().nullish().describe("Optional feature name"),
  }),
  outputSchema: z.object({
    featureId: z.string(),
    filletedEdgeCount: z.number(),
    status: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

// ============ Export All Helper Tools ============

export const modelingHelperToolDefs = {
  createBox: createBoxDef,
  createCylinder: createCylinderDef,
  createSphere: createSphereDef,
  createCone: createConeDef,
  createHole: createHoleDef,
  createPocket: createPocketDef,
  createBoss: createBossDef,
  createShell: createShellDef,
  createRib: createRibDef,
  filletAllEdges: filletAllEdgesDef,
};
