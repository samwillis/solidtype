/**
 * Tool Approval Preferences Hook
 *
 * React hook for managing tool approval preferences.
 * Syncs with localStorage and provides reactive updates.
 */

import { useState, useCallback, useEffect } from "react";
import {
  loadApprovalPreferences,
  saveApprovalPreferences,
  type ToolApprovalPreferences,
} from "../lib/ai/approval-preferences";

/**
 * React hook for managing tool approval preferences
 */
export function useToolApprovalPrefs() {
  const [prefs, setPrefs] = useState<ToolApprovalPreferences>(() => loadApprovalPreferences());

  // Sync with localStorage changes (e.g., from other tabs)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "solidtype:ai-tool-preferences") {
        setPrefs(loadApprovalPreferences());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setYoloMode = useCallback((enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, yoloMode: enabled };
      saveApprovalPreferences(next);
      return next;
    });
  }, []);

  const toggleAlwaysAllow = useCallback((toolName: string) => {
    setPrefs((prev) => {
      const isAllowed = prev.alwaysAllow.includes(toolName);
      const next = {
        ...prev,
        alwaysAllow: isAllowed
          ? prev.alwaysAllow.filter((t) => t !== toolName)
          : [...prev.alwaysAllow, toolName],
      };
      saveApprovalPreferences(next);
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    const defaults = { yoloMode: false, alwaysAllow: [], alwaysConfirm: [] };
    saveApprovalPreferences(defaults);
    setPrefs(defaults);
  }, []);

  return {
    ...prefs,
    setYoloMode,
    toggleAlwaysAllow,
    resetPreferences,
  };
}
