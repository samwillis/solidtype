/**
 * AI Tool Registry
 *
 * Re-exports all tool definitions and implementations.
 */

// Tool definitions (schemas only)
export { dashboardToolDefs } from "./dashboard";

// Client tool schemas (browser-side navigation/UI)
export { dashboardClientToolSchemas, editorClientToolSchemas } from "./client-tools";
export type { DashboardClientToolName, EditorClientToolName, ClientToolName } from "./client-tools";

// Tool implementations (server-side) - Phase 24
export { getDashboardTools } from "./dashboard-impl";

// Tool execution registry (server vs local)
export {
  getToolExecutionMode,
  isLocalTool,
  isServerTool,
  registerToolExecutionMode,
} from "./execution-registry";
export type { ToolExecutionMode } from "./execution-registry";
