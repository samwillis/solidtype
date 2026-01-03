/**
 * Client-Side Tool Definitions
 *
 * Tool definitions for client-side operations (navigation, UI interactions).
 * These define the schemas - actual execution happens in the React hooks.
 */

import { z } from "zod";

// ============ Dashboard Client Tools ============

export const navigateToProjectSchema = {
  name: "navigateToProject" as const,
  description: "Navigate the user to a specific project",
  inputSchema: z.object({ projectId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
};

export const navigateToDocumentSchema = {
  name: "navigateToDocument" as const,
  description: "Open a document in the editor",
  inputSchema: z.object({ documentId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
};

export const dashboardClientToolSchemas = [navigateToProjectSchema, navigateToDocumentSchema];

// ============ Editor Client Tools ============

export const panToEntitySchema = {
  name: "panToEntity" as const,
  description: "Pan the 3D view to focus on a specific entity",
  inputSchema: z.object({
    entityId: z.string(),
    zoom: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
};

export const selectEntitySchema = {
  name: "selectEntity" as const,
  description: "Select an entity in the editor",
  inputSchema: z.object({
    entityId: z.string(),
    addToSelection: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
};

export const enterSketchModeSchema = {
  name: "enterSketchMode" as const,
  description: "Enter sketch editing mode for a specific sketch",
  inputSchema: z.object({ sketchId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
};

export const exitSketchModeSchema = {
  name: "exitSketchMode" as const,
  description: "Exit sketch editing mode",
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
};

export const setViewOrientationSchema = {
  name: "setViewOrientation" as const,
  description: "Set the 3D view orientation",
  inputSchema: z.object({
    orientation: z.enum(["front", "back", "top", "bottom", "left", "right", "iso"]),
  }),
  outputSchema: z.object({ success: z.boolean() }),
};

export const undoSchema = {
  name: "undo" as const,
  description: "Undo the last operation",
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
};

export const redoSchema = {
  name: "redo" as const,
  description: "Redo the last undone operation",
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
};

export const editorClientToolSchemas = [
  panToEntitySchema,
  selectEntitySchema,
  enterSketchModeSchema,
  exitSketchModeSchema,
  setViewOrientationSchema,
  undoSchema,
  redoSchema,
];

// Type for client tool names
export type DashboardClientToolName = (typeof dashboardClientToolSchemas)[number]["name"];
export type EditorClientToolName = (typeof editorClientToolSchemas)[number]["name"];
export type ClientToolName = DashboardClientToolName | EditorClientToolName;
