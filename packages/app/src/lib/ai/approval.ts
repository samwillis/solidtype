/**
 * Tool Approval Registry
 *
 * Unified approval rules for all AI tools.
 * Combines default rules with user preferences.
 */

import { loadApprovalPreferences, type ToolApprovalPreferences } from "./approval-preferences";

export type ApprovalLevel = "auto" | "notify" | "confirm";
export type AIChatContext = "dashboard" | "editor";

/**
 * Dashboard tool approval rules
 *
 * Default: auto for everything except destructive operations
 * Only deletions require confirmation
 */
export const DASHBOARD_TOOL_APPROVAL: Record<string, ApprovalLevel> = {
  // Destructive operations - require confirmation
  deleteDocument: "confirm",
  deleteFolder: "confirm",
  deleteBranch: "confirm",
  deleteWorkspace: "confirm",
  deleteProject: "confirm",

  // All other dashboard tools auto-execute by default
  // (reads, creates, renames, moves, navigation, etc.)
};

/**
 * Dashboard default level for unlisted tools
 */
export const DASHBOARD_DEFAULT_LEVEL: ApprovalLevel = "auto";

/**
 * Sketch tool approval rules
 *
 * Default: auto for all sketch tools
 * Sketch operations are easily undoable, so no confirmation needed
 */
export const SKETCH_TOOL_APPROVAL: Record<string, ApprovalLevel> = {
  // All sketch tools auto-execute - everything is undoable
};

/**
 * Sketch default level for unlisted tools
 */
export const SKETCH_DEFAULT_LEVEL: ApprovalLevel = "auto";

/**
 * 3D Modeling tool approval rules
 *
 * Default: auto for all modeling tools
 * Modeling operations are undoable via Yjs, so no confirmation needed
 */
export const MODELING_TOOL_APPROVAL: Record<string, ApprovalLevel> = {
  // All modeling tools auto-execute - everything is undoable
};

/**
 * Modeling default level for unlisted tools
 */
export const MODELING_DEFAULT_LEVEL: ApprovalLevel = "auto";

/**
 * Get approval level for a tool in a given context.
 *
 * Priority order:
 * 1. YOLO mode -> always "auto"
 * 2. User's "alwaysAllow" list -> "auto"
 * 3. User's "alwaysConfirm" list -> "confirm"
 * 4. Default context-specific rules
 * 5. Unknown tool -> "confirm" (safe default)
 */
export function getApprovalLevel(
  toolName: string,
  context: AIChatContext,
  userPrefs?: ToolApprovalPreferences
): ApprovalLevel {
  // Load preferences if not provided
  const prefs = userPrefs ?? loadApprovalPreferences();

  // YOLO mode: auto-approve everything
  if (prefs.yoloMode) {
    return "auto";
  }

  // User has explicitly allowed this tool
  if (prefs.alwaysAllow.includes(toolName)) {
    return "auto";
  }

  // User has explicitly required confirmation for this tool
  if (prefs.alwaysConfirm.includes(toolName)) {
    return "confirm";
  }

  // Check context-specific default rules
  if (context === "dashboard") {
    // Dashboard: only destructive ops require confirmation
    if (toolName in DASHBOARD_TOOL_APPROVAL) {
      return DASHBOARD_TOOL_APPROVAL[toolName];
    }
    return DASHBOARD_DEFAULT_LEVEL; // "auto" for non-destructive
  } else {
    // Editor context: all sketch/modeling ops are auto (undoable)
    if (toolName in SKETCH_TOOL_APPROVAL) {
      return SKETCH_TOOL_APPROVAL[toolName];
    }
    if (toolName in MODELING_TOOL_APPROVAL) {
      return MODELING_TOOL_APPROVAL[toolName];
    }
    // Default to auto for editor tools (everything is undoable)
    return SKETCH_DEFAULT_LEVEL; // "auto"
  }
}

/**
 * Get the default approval level (ignoring user preferences)
 */
export function getDefaultApprovalLevel(toolName: string, context: AIChatContext): ApprovalLevel {
  if (context === "dashboard") {
    return DASHBOARD_TOOL_APPROVAL[toolName] ?? DASHBOARD_DEFAULT_LEVEL;
  }
  return SKETCH_TOOL_APPROVAL[toolName] ?? MODELING_TOOL_APPROVAL[toolName] ?? SKETCH_DEFAULT_LEVEL;
}

/**
 * Check if a tool requires any form of user awareness
 */
export function requiresUserAwareness(
  toolName: string,
  context: AIChatContext,
  userPrefs?: ToolApprovalPreferences
): boolean {
  const level = getApprovalLevel(toolName, context, userPrefs);
  return level !== "auto";
}
