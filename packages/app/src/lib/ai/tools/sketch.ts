/**
 * Sketch Tool Definitions
 *
 * Tool definitions for 2D sketch operations (geometry, constraints, lifecycle).
 * These are Zod schemas that define the tool interfaces.
 */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============ Sketch Lifecycle Tools ============

export const createSketchDef = toolDefinition({
  name: "createSketch",
  description: "Create a new 2D sketch on a plane or face",
  inputSchema: z.object({
    // Use separate fields instead of discriminatedUnion (OpenAI doesn't support oneOf)
    planeType: z
      .enum(["datumRole", "planeFeatureId", "faceRef"])
      .describe(
        "Type of plane reference: 'datumRole' for xy/xz/yz planes, 'planeFeatureId' for a plane feature, 'faceRef' for a face"
      ),
    planeRef: z
      .string()
      .describe(
        "Reference value: 'xy', 'xz', or 'yz' for datumRole; feature ID for planeFeatureId; face reference for faceRef"
      ),
    name: z.string().nullish().describe("Optional name for the sketch"),
    enterSketch: z
      .boolean()
      .default(true)
      .describe("Whether to enter sketch editing mode after creation"),
  }),
  outputSchema: z.object({
    sketchId: z.string(),
    entered: z.boolean(),
  }),
});

export const enterSketchDef = toolDefinition({
  name: "enterSketch",
  description: "Enter an existing sketch for editing",
  inputSchema: z.object({
    sketchId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    sketchId: z.string(),
  }),
});

export const exitSketchDef = toolDefinition({
  name: "exitSketch",
  description: "Exit sketch editing mode and return to 3D view",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const getSketchStatusDef = toolDefinition({
  name: "getSketchStatus",
  description: "Get the current sketch status including solver state and degrees of freedom",
  inputSchema: z.object({}),
  outputSchema: z.object({
    sketchId: z.string(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
    degreesOfFreedom: z.number(),
    pointCount: z.number(),
    entityCount: z.number(),
    constraintCount: z.number(),
  }),
});

// ============ Geometry Creation Tools ============

export const addLineDef = toolDefinition({
  name: "addLine",
  description: "Add a line to the current sketch",
  inputSchema: z.object({
    start: z.object({ x: z.number(), y: z.number() }).describe("Start point coordinates"),
    end: z.object({ x: z.number(), y: z.number() }).describe("End point coordinates"),
    startPointId: z.string().nullish().describe("Reuse existing point by ID for start"),
    endPointId: z.string().nullish().describe("Reuse existing point by ID for end"),
    construction: z.boolean().nullish().describe("Whether this is construction geometry"),
  }),
  outputSchema: z.object({
    lineId: z.string(),
    startPointId: z.string(),
    endPointId: z.string(),
  }),
});

export const addCircleDef = toolDefinition({
  name: "addCircle",
  description: "Add a circle to the current sketch",
  inputSchema: z.object({
    center: z.object({ x: z.number(), y: z.number() }).describe("Center point coordinates"),
    radius: z.number().positive().describe("Circle radius"),
    centerPointId: z.string().nullish().describe("Reuse existing point by ID for center"),
    construction: z.boolean().nullish().describe("Whether this is construction geometry"),
  }),
  outputSchema: z.object({
    circleId: z.string(),
    centerPointId: z.string(),
  }),
});

export const addArcDef = toolDefinition({
  name: "addArc",
  description: "Add an arc to the current sketch",
  inputSchema: z.object({
    start: z.object({ x: z.number(), y: z.number() }).describe("Start point coordinates"),
    end: z.object({ x: z.number(), y: z.number() }).describe("End point coordinates"),
    center: z.object({ x: z.number(), y: z.number() }).describe("Center point coordinates"),
    ccw: z.boolean().default(true).describe("Counter-clockwise direction"),
    startPointId: z.string().nullish().describe("Reuse existing point by ID for start"),
    endPointId: z.string().nullish().describe("Reuse existing point by ID for end"),
    centerPointId: z.string().nullish().describe("Reuse existing point by ID for center"),
    construction: z.boolean().nullish().describe("Whether this is construction geometry"),
  }),
  outputSchema: z.object({
    arcId: z.string(),
    startPointId: z.string(),
    endPointId: z.string(),
    centerPointId: z.string(),
  }),
});

export const addRectangleDef = toolDefinition({
  name: "addRectangle",
  description: "Add a rectangle (4 connected lines) to the current sketch",
  inputSchema: z.object({
    corner1: z.object({ x: z.number(), y: z.number() }).describe("First corner coordinates"),
    corner2: z.object({ x: z.number(), y: z.number() }).describe("Opposite corner coordinates"),
    centered: z
      .boolean()
      .default(false)
      .describe("If true, corner1 is center and corner2 defines half-size"),
    construction: z.boolean().nullish().describe("Whether this is construction geometry"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
    constraintIds: z.array(z.string()),
  }),
});

export const addPolygonDef = toolDefinition({
  name: "addPolygon",
  description: "Add a regular polygon to the current sketch",
  inputSchema: z.object({
    center: z.object({ x: z.number(), y: z.number() }).describe("Center point coordinates"),
    radius: z.number().positive().describe("Radius from center to vertices"),
    sides: z.number().int().min(3).max(100).describe("Number of sides"),
    rotation: z.number().default(0).describe("Rotation angle in degrees"),
    construction: z.boolean().nullish().describe("Whether this is construction geometry"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    pointIds: z.array(z.string()),
  }),
});

export const addSlotDef = toolDefinition({
  name: "addSlot",
  description: "Add a slot (rounded rectangle) to the current sketch",
  inputSchema: z.object({
    center: z.object({ x: z.number(), y: z.number() }).describe("Center point coordinates"),
    length: z.number().positive().describe("Overall length of the slot"),
    width: z.number().positive().describe("Width of the slot"),
    angle: z.number().default(0).describe("Rotation angle in degrees"),
    construction: z.boolean().nullish().describe("Whether this is construction geometry"),
  }),
  outputSchema: z.object({
    lineIds: z.array(z.string()),
    arcIds: z.array(z.string()),
    pointIds: z.array(z.string()),
  }),
});

// ============ Point Manipulation Tools ============

export const addPointDef = toolDefinition({
  name: "addPoint",
  description: "Add a standalone point to the current sketch",
  inputSchema: z.object({
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    fixed: z.boolean().nullish().describe("Whether the point should be fixed"),
  }),
  outputSchema: z.object({
    pointId: z.string(),
  }),
});

export const movePointDef = toolDefinition({
  name: "movePoint",
  description: "Move a point to a new location",
  inputSchema: z.object({
    pointId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const mergePointsDef = toolDefinition({
  name: "mergePoints",
  description: "Merge two points into one (adds coincident constraint)",
  inputSchema: z.object({
    keepPointId: z.string().describe("The point to keep"),
    removePointId: z.string().describe("The point to remove"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    constraintId: z.string(),
  }),
});

// ============ Constraint Tools ============

// Constraint input schemas
const HorizontalConstraintInput = z.object({
  type: z.literal("horizontal"),
  points: z.tuple([z.string(), z.string()]),
});

const VerticalConstraintInput = z.object({
  type: z.literal("vertical"),
  points: z.tuple([z.string(), z.string()]),
});

const CoincidentConstraintInput = z.object({
  type: z.literal("coincident"),
  points: z.tuple([z.string(), z.string()]),
});

const FixedConstraintInput = z.object({
  type: z.literal("fixed"),
  point: z.string(),
});

const DistanceConstraintInput = z.object({
  type: z.literal("distance"),
  points: z.tuple([z.string(), z.string()]),
  value: z.number().positive(),
});

const HorizontalDistanceConstraintInput = z.object({
  type: z.literal("horizontalDistance"),
  points: z.tuple([z.string(), z.string()]),
  value: z.number(),
});

const VerticalDistanceConstraintInput = z.object({
  type: z.literal("verticalDistance"),
  points: z.tuple([z.string(), z.string()]),
  value: z.number(),
});

const AngleConstraintInput = z.object({
  type: z.literal("angle"),
  lines: z.tuple([z.string(), z.string()]),
  value: z.number(),
});

const RadiusConstraintInput = z.object({
  type: z.literal("radius"),
  arc: z.string(),
  value: z.number().positive(),
});

const ParallelConstraintInput = z.object({
  type: z.literal("parallel"),
  lines: z.tuple([z.string(), z.string()]),
});

const PerpendicularConstraintInput = z.object({
  type: z.literal("perpendicular"),
  lines: z.tuple([z.string(), z.string()]),
});

const EqualLengthConstraintInput = z.object({
  type: z.literal("equalLength"),
  lines: z.tuple([z.string(), z.string()]),
});

const CollinearConstraintInput = z.object({
  type: z.literal("collinear"),
  lines: z.tuple([z.string(), z.string()]),
});

const TangentConstraintInput = z.object({
  type: z.literal("tangent"),
  line: z.string(),
  arc: z.string(),
});

const EqualRadiusConstraintInput = z.object({
  type: z.literal("equalRadius"),
  arcs: z.tuple([z.string(), z.string()]),
});

const ConcentricConstraintInput = z.object({
  type: z.literal("concentric"),
  arcs: z.tuple([z.string(), z.string()]),
});

const SymmetricConstraintInput = z.object({
  type: z.literal("symmetric"),
  points: z.tuple([z.string(), z.string()]),
  axis: z.string(),
});

const PointOnLineConstraintInput = z.object({
  type: z.literal("pointOnLine"),
  point: z.string(),
  line: z.string(),
});

const PointOnArcConstraintInput = z.object({
  type: z.literal("pointOnArc"),
  point: z.string(),
  arc: z.string(),
});

const MidpointConstraintInput = z.object({
  type: z.literal("midpoint"),
  point: z.string(),
  line: z.string(),
});

// OpenAI doesn't support oneOf/discriminatedUnion, so we flatten constraint parameters
export const addConstraintDef = toolDefinition({
  name: "addConstraint",
  description: `Add a constraint to sketch elements. Required parameters depend on type:
- horizontal/vertical/coincident: points (2 point IDs)
- fixed: point (1 point ID)
- distance/horizontalDistance/verticalDistance: points (2 point IDs) + value
- angle: lines (2 line IDs) + value (degrees)
- radius: arc (arc ID) + value
- parallel/perpendicular/equalLength/collinear: lines (2 line IDs)
- tangent: line + arc
- equalRadius/concentric: arcs (2 arc IDs)
- symmetric: points (2 point IDs) + axis (line ID)
- pointOnLine: point + line
- pointOnArc: point + arc
- midpoint: point + line`,
  inputSchema: z.object({
    type: z
      .enum([
        "horizontal",
        "vertical",
        "coincident",
        "fixed",
        "distance",
        "horizontalDistance",
        "verticalDistance",
        "angle",
        "radius",
        "parallel",
        "perpendicular",
        "equalLength",
        "collinear",
        "tangent",
        "equalRadius",
        "concentric",
        "symmetric",
        "pointOnLine",
        "pointOnArc",
        "midpoint",
      ])
      .describe("Type of constraint to add"),
    // Point references
    point: z
      .string()
      .nullish()
      .describe("Single point ID (for fixed, pointOnLine, pointOnArc, midpoint)"),
    points: z
      .array(z.string())
      .optional()
      .describe("Array of 2 point IDs (for horizontal, vertical, coincident, distance, symmetric)"),
    // Line references
    line: z.string().nullish().describe("Single line ID (for tangent, pointOnLine, midpoint)"),
    lines: z
      .array(z.string())
      .nullish()
      .describe("Array of 2 line IDs (for parallel, perpendicular, etc.)"),
    // Arc references
    arc: z.string().nullish().describe("Single arc ID (for radius, tangent, pointOnArc)"),
    arcs: z
      .array(z.string())
      .nullish()
      .describe("Array of 2 arc IDs (for equalRadius, concentric)"),
    // Value for dimensional constraints
    value: z
      .number()
      .nullish()
      .describe("Value for dimensional constraints (distance, angle, radius)"),
    // Axis for symmetric constraint
    axis: z.string().nullish().describe("Axis line ID for symmetric constraint"),
  }),
  outputSchema: z.object({
    constraintId: z.string(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const removeConstraintDef = toolDefinition({
  name: "removeConstraint",
  description: "Remove a constraint from the sketch",
  inputSchema: z.object({
    constraintId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

export const modifyConstraintValueDef = toolDefinition({
  name: "modifyConstraintValue",
  description: "Change the value of a dimensional constraint",
  inputSchema: z.object({
    constraintId: z.string(),
    value: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    solverStatus: z.enum(["solved", "underconstrained", "overconstrained", "inconsistent"]),
  }),
});

// ============ Geometry Deletion Tools ============

export const deleteEntityDef = toolDefinition({
  name: "deleteEntity",
  description: "Delete a geometry entity (line, arc, circle) and its associated constraints",
  inputSchema: z.object({
    entityId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedConstraints: z.array(z.string()),
  }),
});

export const deletePointDef = toolDefinition({
  name: "deletePoint",
  description: "Delete a point and all entities/constraints that reference it",
  inputSchema: z.object({
    pointId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedEntities: z.array(z.string()),
    deletedConstraints: z.array(z.string()),
  }),
});

// ============ Construction Geometry ============

export const toggleConstructionDef = toolDefinition({
  name: "toggleConstruction",
  description: "Toggle an entity between regular and construction geometry",
  inputSchema: z.object({
    entityId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    isConstruction: z.boolean(),
  }),
});

// ============ Export All Sketch Tool Definitions ============

export const sketchToolDefs = [
  // Lifecycle
  createSketchDef,
  enterSketchDef,
  exitSketchDef,
  getSketchStatusDef,
  // Geometry
  addLineDef,
  addCircleDef,
  addArcDef,
  addRectangleDef,
  addPolygonDef,
  addSlotDef,
  // Points
  addPointDef,
  movePointDef,
  mergePointsDef,
  // Constraints
  addConstraintDef,
  removeConstraintDef,
  modifyConstraintValueDef,
  // Deletion
  deleteEntityDef,
  deletePointDef,
  // Construction
  toggleConstructionDef,
];

// Type for sketch tool names
export type SketchToolName = (typeof sketchToolDefs)[number]["name"];
