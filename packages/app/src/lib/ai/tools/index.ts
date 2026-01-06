/**
 * AI Tool Registry
 *
 * Re-exports all tool definitions and implementations.
 */

// Tool definitions (schemas only)
export { dashboardToolDefs } from "./dashboard";
export { sketchToolDefs } from "./sketch";
export type { SketchToolName } from "./sketch";
export { sketchHelperToolDefs } from "./sketch-helpers";
export type { SketchHelperToolName } from "./sketch-helpers";

// Modeling tool definitions (Phase 26)
export { modelingQueryToolDefs } from "./modeling-query";
export { modelingFeatureToolDefs } from "./modeling-features";
export { modelingModifyToolDefs } from "./modeling-modify";
export { modelingHelperToolDefs } from "./modeling-helpers";

// Client tool schemas (browser-side navigation/UI)
export { dashboardClientToolSchemas, editorClientToolSchemas } from "./client-tools";
export type { DashboardClientToolName, EditorClientToolName, ClientToolName } from "./client-tools";

// Tool implementations (server-side) - Phase 24
export { getDashboardTools } from "./dashboard-impl";

// Sketch tool implementations (local/browser-side) - Phase 25
export * from "./sketch-impl";
export type { SketchToolContext } from "./sketch-impl";

// Tool execution registry (server vs local)
export {
  getToolExecutionMode,
  isLocalTool,
  isServerTool,
  registerToolExecutionMode,
} from "./execution-registry";
export type { ToolExecutionMode } from "./execution-registry";
