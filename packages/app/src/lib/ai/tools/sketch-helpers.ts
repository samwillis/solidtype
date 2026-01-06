/**
 * High-Level Sketch Helper Tool Definitions
 *
 * Convenience tools that combine multiple primitive operations.
 * These provide common sketch patterns as single tool calls.
 */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

/**
 * Create a fully constrained centered rectangle
 */
export const createCenteredRectangleDef = toolDefinition({
  name: "createCenteredRectangle",
  description: "Create a fully constrained rectangle centered at the origin",
  inputSchema: z.object({
    width: z.number().positive().describe("Width of the rectangle"),
    height: z.number().positive().describe("Height of the rectangle"),
    centerX: z.number().default(0).describe("X coordinate of center"),
    centerY: z.number().default(0).describe("Y coordinate of center"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
    constraintIds: z.array(z.string()),
  }),
});

/**
 * Create a circle with fixed center and radius
 */
export const createCircleWithRadiusDef = toolDefinition({
  name: "createCircleWithRadius",
  description: "Create a circle at a specified location with a fixed radius, fully constrained",
  inputSchema: z.object({
    radius: z.number().positive().describe("Radius of the circle"),
    centerX: z.number().default(0).describe("X coordinate of center"),
    centerY: z.number().default(0).describe("Y coordinate of center"),
  }),
  outputSchema: z.object({
    circleId: z.string(),
    centerPointId: z.string(),
    constraintIds: z.array(z.string()),
  }),
});

/**
 * Create a symmetric profile about the Y axis
 */
export const createSymmetricProfileDef = toolDefinition({
  name: "createSymmetricProfile",
  description: "Create a profile that is symmetric about the Y axis",
  inputSchema: z.object({
    halfProfile: z
      .array(
        z.object({
          x: z.number().min(0).describe("X coordinate (must be >= 0 for right half)"),
          y: z.number().describe("Y coordinate"),
        })
      )
      .min(2)
      .describe("Points defining the right half of the profile (from bottom to top)"),
    closed: z.boolean().default(true).describe("Whether to close the profile"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
    symmetryConstraintIds: z.array(z.string()),
  }),
});

/**
 * Create a bolt circle (multiple circles arranged in a circle pattern)
 */
export const createBoltCircleDef = toolDefinition({
  name: "createBoltCircle",
  description: "Create a pattern of circles arranged in a circular pattern",
  inputSchema: z.object({
    patternCenter: z.object({ x: z.number(), y: z.number() }).describe("Center of the pattern"),
    patternRadius: z.number().positive().describe("Radius of the pattern"),
    holeRadius: z.number().positive().describe("Radius of each hole"),
    count: z.number().int().min(2).max(36).describe("Number of holes"),
    startAngle: z.number().default(0).describe("Starting angle in degrees"),
  }),
  outputSchema: z.object({
    circleIds: z.array(z.string()),
    centerPointIds: z.array(z.string()),
  }),
});

/**
 * Create construction geometry for centering
 */
export const createCenterlinesAtOriginDef = toolDefinition({
  name: "createCenterlinesAtOrigin",
  description: "Create horizontal and vertical construction lines through the origin",
  inputSchema: z.object({
    length: z.number().positive().default(100).describe("Length of centerlines"),
  }),
  outputSchema: z.object({
    horizontalLineId: z.string(),
    verticalLineId: z.string(),
    centerPointId: z.string(),
  }),
});

/**
 * Create a chamfered rectangle
 */
export const createChamferedRectangleDef = toolDefinition({
  name: "createChamferedRectangle",
  description: "Create a rectangle with chamfered corners",
  inputSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    chamferSize: z.number().positive().describe("Size of the chamfer cut"),
    centerX: z.number().default(0),
    centerY: z.number().default(0),
    corners: z
      .array(z.enum(["topLeft", "topRight", "bottomLeft", "bottomRight"]))
      .default(["topLeft", "topRight", "bottomLeft", "bottomRight"])
      .describe("Which corners to chamfer"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
    constraintIds: z.array(z.string()),
  }),
});

/**
 * Create a rounded rectangle (filleted corners)
 */
export const createRoundedRectangleDef = toolDefinition({
  name: "createRoundedRectangle",
  description: "Create a rectangle with rounded corners",
  inputSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    cornerRadius: z.number().positive().describe("Radius of corner arcs"),
    centerX: z.number().default(0),
    centerY: z.number().default(0),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    arcIds: z.array(z.string()),
    pointIds: z.array(z.string()),
    constraintIds: z.array(z.string()),
  }),
});

// ============ Export All Helper Tool Definitions ============

export const sketchHelperToolDefs = [
  createCenteredRectangleDef,
  createCircleWithRadiusDef,
  createSymmetricProfileDef,
  createBoltCircleDef,
  createCenterlinesAtOriginDef,
  createChamferedRectangleDef,
  createRoundedRectangleDef,
];

// Type for helper tool names
export type SketchHelperToolName = (typeof sketchHelperToolDefs)[number]["name"];
