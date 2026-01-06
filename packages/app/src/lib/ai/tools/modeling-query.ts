/**
 * Modeling Query Tool Definitions
 *
 * Tool definitions for querying 3D model state (selection, faces, edges, measurements).
 * These are read-only tools that provide context to the AI.
 */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============ Selection Tools ============

export const getCurrentSelectionDef = toolDefinition({
  name: "getCurrentSelection",
  description: "Get the currently selected faces, edges, or features in the 3D view",
  inputSchema: z.object({}),
  outputSchema: z.object({
    type: z.enum(["none", "feature", "face", "edge", "vertex"]),
    items: z.array(
      z.object({
        persistentRef: z.string().describe("Persistent reference for this geometry"),
        featureId: z.string().describe("ID of the feature that created this geometry"),
        geometryInfo: z
          .object({
            surfaceType: z.string().optional(),
            curveType: z.string().optional(),
            area: z.number().optional(),
            length: z.number().optional(),
          })
          .optional(),
      })
    ),
  }),
});

export const getModelContextDef = toolDefinition({
  name: "getModelContext",
  description: "Get current model state including all features and build status",
  inputSchema: z.object({}),
  outputSchema: z.object({
    documentName: z.string(),
    units: z.string(),
    featureCount: z.number(),
    features: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        name: z.string().nullish(),
        status: z.enum(["ok", "error", "pending", "suppressed"]),
      })
    ),
    errors: z.array(
      z.object({
        featureId: z.string(),
        code: z.string(),
        message: z.string(),
      })
    ),
  }),
});

// ============ Geometry Query Tools ============

export const findFacesDef = toolDefinition({
  name: "findFaces",
  description: "Find faces matching specific criteria (surface type, orientation, area)",
  inputSchema: z.object({
    surfaceType: z
      .enum(["plane", "cylinder", "cone", "sphere", "torus", "any"])
      .nullish()
      .describe("Filter by surface type"),
    orientation: z
      .enum(["top", "bottom", "front", "back", "left", "right", "any"])
      .nullish()
      .describe("Filter by face orientation (normal direction)"),
    featureId: z.string().nullish().describe("Only search faces from this feature"),
    minArea: z.number().nullish().describe("Minimum face area"),
  }),
  outputSchema: z.array(
    z.object({
      persistentRef: z.string(),
      featureId: z.string(),
      surfaceType: z.string(),
      area: z.number(),
      normal: z.tuple([z.number(), z.number(), z.number()]),
    })
  ),
});

export const findEdgesDef = toolDefinition({
  name: "findEdges",
  description: "Find edges matching specific criteria (curve type, convexity)",
  inputSchema: z.object({
    curveType: z
      .enum(["line", "circle", "arc", "ellipse", "spline", "any"])
      .nullish()
      .describe("Filter by curve type"),
    faceRef: z.string().nullish().describe("Only edges on this face"),
    featureId: z.string().nullish().describe("Only edges from this feature"),
    convexity: z
      .enum(["convex", "concave", "any"])
      .nullish()
      .describe("Filter by edge convexity"),
  }),
  outputSchema: z.array(
    z.object({
      persistentRef: z.string(),
      curveType: z.string(),
      length: z.number(),
      convexity: z.enum(["convex", "concave", "unknown"]),
    })
  ),
});

// ============ Measurement Tools ============

export const measureDistanceDef = toolDefinition({
  name: "measureDistance",
  description: "Measure distance between two geometry references (points, edges, faces)",
  inputSchema: z.object({
    ref1: z.string().describe("First geometry reference"),
    ref2: z.string().describe("Second geometry reference"),
  }),
  outputSchema: z.object({
    distance: z.number(),
    type: z.enum(["minimum", "center-to-center"]),
  }),
});

export const getBoundingBoxDef = toolDefinition({
  name: "getBoundingBox",
  description: "Get the axis-aligned bounding box of the model or a specific feature",
  inputSchema: z.object({
    featureId: z.string().nullish().describe("Feature ID, or omit for entire model"),
  }),
  outputSchema: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
    size: z.tuple([z.number(), z.number(), z.number()]),
    center: z.tuple([z.number(), z.number(), z.number()]),
  }),
});

export const measureAngleDef = toolDefinition({
  name: "measureAngle",
  description: "Measure angle between two faces or edges",
  inputSchema: z.object({
    ref1: z.string().describe("First geometry reference (face or edge)"),
    ref2: z.string().describe("Second geometry reference (face or edge)"),
  }),
  outputSchema: z.object({
    angleDegrees: z.number(),
    angleRadians: z.number(),
  }),
});

// ============ Export All Query Tools ============

export const modelingQueryToolDefs = {
  getCurrentSelection: getCurrentSelectionDef,
  getModelContext: getModelContextDef,
  findFaces: findFacesDef,
  findEdges: findEdgesDef,
  measureDistance: measureDistanceDef,
  getBoundingBox: getBoundingBoxDef,
  measureAngle: measureAngleDef,
};
