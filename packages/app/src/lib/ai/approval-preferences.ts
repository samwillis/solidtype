/**
 * Tool Approval User Preferences
 *
 * Stores user preferences for tool approval in localStorage.
 * Includes YOLO mode (auto-approve all) and per-tool settings.
 */

import { z } from "zod";

/**
 * User's tool approval preferences
 */
export const ToolApprovalPreferencesSchema = z.object({
  // YOLO mode - auto-approve all tools without confirmation
  yoloMode: z.boolean().default(false),

  // Per-tool overrides: tools in this list skip confirmation
  alwaysAllow: z.array(z.string()).default([]),

  // Tools that always require confirmation (overrides defaults)
  alwaysConfirm: z.array(z.string()).default([]),
});

export type ToolApprovalPreferences = z.infer<typeof ToolApprovalPreferencesSchema>;

const STORAGE_KEY = "solidtype:ai-tool-preferences";

/**
 * Load preferences from localStorage
 */
export function loadApprovalPreferences(): ToolApprovalPreferences {
  if (typeof window === "undefined") {
    return { yoloMode: false, alwaysAllow: [], alwaysConfirm: [] };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { yoloMode: false, alwaysAllow: [], alwaysConfirm: [] };
    return ToolApprovalPreferencesSchema.parse(JSON.parse(stored));
  } catch {
    return { yoloMode: false, alwaysAllow: [], alwaysConfirm: [] };
  }
}

/**
 * Save preferences to localStorage
 */
export function saveApprovalPreferences(prefs: ToolApprovalPreferences): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Add a tool to the "always allow" list
 */
export function addAlwaysAllow(toolName: string): void {
  const prefs = loadApprovalPreferences();
  if (!prefs.alwaysAllow.includes(toolName)) {
    prefs.alwaysAllow.push(toolName);
    prefs.alwaysConfirm = prefs.alwaysConfirm.filter((t) => t !== toolName);
    saveApprovalPreferences(prefs);
  }
}

/**
 * Remove a tool from the "always allow" list
 */
export function removeAlwaysAllow(toolName: string): void {
  const prefs = loadApprovalPreferences();
  prefs.alwaysAllow = prefs.alwaysAllow.filter((t) => t !== toolName);
  saveApprovalPreferences(prefs);
}
