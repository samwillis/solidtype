/**
 * Zod schemas for feature validation
 * Used with Tanstack Form for feature editing
 */

import { z } from "zod/v4";

// ============================================================================
// Common Schemas
// ============================================================================

export const featureBaseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  suppressed: z.boolean().optional(),
});

// ============================================================================
// Extrude Feature Schema
// ============================================================================

export const extrudeExtentSchema = z.enum(["blind", "toFace", "toVertex", "throughAll"]);

/** Merge scope for add operations - SolidWorks-like multi-body support */
export const mergeScopeSchema = z.enum(["auto", "new", "specific"]);

export const extrudeFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sketch: z.string().min(1, "Sketch is required"),
  op: z.enum(["add", "cut"]),
  direction: z.enum(["normal", "reverse"]),
  extent: extrudeExtentSchema,
  distance: z.number().min(0.1, "Distance must be at least 0.1"),
  extentRef: z.string().optional(),
  // Multi-body merge options
  mergeScope: mergeScopeSchema.optional(),
  targetBodies: z.array(z.string()).optional(),
  resultBodyName: z.string().optional(),
  resultBodyColor: z.string().optional(),
});

export type ExtrudeFormData = z.infer<typeof extrudeFormSchema>;

export const defaultExtrudeFormData: ExtrudeFormData = {
  name: "Extrude",
  sketch: "",
  op: "add",
  direction: "normal",
  extent: "blind",
  distance: 10,
  mergeScope: "auto",
};

// ============================================================================
// Revolve Feature Schema
// ============================================================================

export const revolveFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sketch: z.string().min(1, "Sketch is required"),
  axis: z.string().min(1, "Axis is required"),
  angle: z.number().min(1, "Angle must be at least 1").max(360, "Angle must be at most 360"),
  op: z.enum(["add", "cut"]),
  // Multi-body merge options
  mergeScope: mergeScopeSchema.optional(),
  targetBodies: z.array(z.string()).optional(),
  resultBodyName: z.string().optional(),
  resultBodyColor: z.string().optional(),
});

export type RevolveFormData = z.infer<typeof revolveFormSchema>;

export const defaultRevolveFormData: RevolveFormData = {
  name: "Revolve",
  sketch: "",
  axis: "",
  angle: 360,
  op: "add",
  mergeScope: "auto",
};

// ============================================================================
// Sketch Feature Schema (for properties, not geometry)
// ============================================================================

export const sketchFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  plane: z.string().min(1, "Plane is required"),
  visible: z.boolean().optional(),
});

export type SketchFormData = z.infer<typeof sketchFormSchema>;

// ============================================================================
// Plane Feature Schema
// ============================================================================

export const planeFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  visible: z.boolean().optional(),
  width: z.number().min(1, "Width must be at least 1"),
  height: z.number().min(1, "Height must be at least 1"),
  offsetX: z.number(),
  offsetY: z.number(),
  color: z.string().optional(),
});

export type PlaneFormData = z.infer<typeof planeFormSchema>;

// ============================================================================
// Reference Plane Tool Schema (Phase 28)
// ============================================================================

export const planeToolModeSchema = z.enum(["auto", "offset", "midplane", "angle", "threePoint"]);

export const planeToolFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mode: planeToolModeSchema,
  ref1: z.string().optional(),
  ref2: z.string().optional(),
  ref3: z.string().optional(),
  offset: z.number(),
  angle: z.number(),
  flipNormal: z.boolean(),
  width: z.number().min(1),
  height: z.number().min(1),
});

export type PlaneToolFormData = z.infer<typeof planeToolFormSchema>;

export const defaultPlaneToolFormData: PlaneToolFormData = {
  name: "Plane",
  mode: "auto",
  offset: 0,
  angle: 0,
  flipNormal: false,
  width: 100,
  height: 100,
};

// ============================================================================
// Reference Axis Tool Schema (Phase 28)
// ============================================================================

export const axisToolModeSchema = z.enum(["auto", "linear", "twoPoints", "twoPlanes"]);

export const axisToolFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mode: axisToolModeSchema,
  ref1: z.string().optional(),
  ref2: z.string().optional(),
  length: z.number().min(1),
});

export type AxisToolFormData = z.infer<typeof axisToolFormSchema>;

export const defaultAxisToolFormData: AxisToolFormData = {
  name: "Axis",
  mode: "auto",
  length: 100,
};

// ============================================================================
// Boolean Feature Schema (Phase 17)
// ============================================================================

export const booleanOperationSchema = z.enum(["union", "subtract", "intersect"]);

export const booleanFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  operation: booleanOperationSchema,
  target: z.string().min(1, "Target body is required"),
  tool: z.string().min(1, "Tool body is required"),
});

export type BooleanFormData = z.infer<typeof booleanFormSchema>;

export const defaultBooleanFormData: BooleanFormData = {
  name: "Boolean",
  operation: "union",
  target: "",
  tool: "",
};
