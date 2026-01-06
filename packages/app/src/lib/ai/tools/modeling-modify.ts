/**
 * Modeling Modification Tool Definitions
 *
 * Tool definitions for modifying existing features (edit parameters, delete, reorder, suppress).
 */

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// ============ Feature Modification Tools ============

export const modifyFeatureDef = toolDefinition({
  name: "modifyFeature",
  description: "Change parameters of an existing feature",
  inputSchema: z.object({
    featureId: z.string().describe("ID of the feature to modify"),
    changes: z
      .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .describe("Key-value pairs of parameters to change"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rebuildStatus: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const deleteFeatureDef = toolDefinition({
  name: "deleteFeature",
  description: "Delete a feature from the model (dependent features may also be affected)",
  inputSchema: z.object({
    featureId: z.string().describe("ID of the feature to delete"),
    deleteChildren: z
      .boolean()
      .default(false)
      .describe("Also delete features that depend on this one"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedIds: z.array(z.string()).describe("IDs of all deleted features"),
    error: z.string().nullish(),
  }),
});

export const reorderFeatureDef = toolDefinition({
  name: "reorderFeature",
  description: "Move a feature in the tree (affects rebuild order)",
  inputSchema: z.object({
    featureId: z.string().describe("ID of the feature to move"),
    afterFeatureId: z
      .string()
      .nullable()
      .describe("Insert after this feature ID, or null to move to start"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rebuildStatus: z.enum(["ok", "error"]),
    error: z.string().nullish(),
  }),
});

export const suppressFeatureDef = toolDefinition({
  name: "suppressFeature",
  description: "Suppress or unsuppress a feature (suppressed features are skipped during rebuild)",
  inputSchema: z.object({
    featureId: z.string().describe("ID of the feature to suppress/unsuppress"),
    suppressed: z.boolean().describe("True to suppress, false to unsuppress"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

export const renameFeatureDef = toolDefinition({
  name: "renameFeature",
  description: "Rename a feature",
  inputSchema: z.object({
    featureId: z.string().describe("ID of the feature to rename"),
    name: z.string().describe("New name for the feature"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

export const duplicateFeatureDef = toolDefinition({
  name: "duplicateFeature",
  description: "Duplicate a feature with optional parameter changes",
  inputSchema: z.object({
    featureId: z.string().describe("ID of the feature to duplicate"),
    changes: z
      .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .nullish()
      .describe("Optional parameter overrides for the duplicate"),
    insertAfter: z
      .string()
      .nullish()
      .describe("Insert after this feature ID, or omit to insert after original"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    newFeatureId: z.string().nullish(),
    error: z.string().nullish(),
  }),
});

// ============ Undo/Redo Tools ============

export const undoDef = toolDefinition({
  name: "undo",
  description: "Undo the last operation",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    undoneAction: z.string().nullish(),
  }),
});

export const redoDef = toolDefinition({
  name: "redo",
  description: "Redo the last undone operation",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    redoneAction: z.string().nullish(),
  }),
});

// ============ Export All Modification Tools ============

export const modelingModifyToolDefs = {
  modifyFeature: modifyFeatureDef,
  deleteFeature: deleteFeatureDef,
  reorderFeature: reorderFeatureDef,
  suppressFeature: suppressFeatureDef,
  renameFeature: renameFeatureDef,
  duplicateFeature: duplicateFeatureDef,
  undo: undoDef,
  redo: redoDef,
};
