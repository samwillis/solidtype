/**
 * KeyboardShortcutContext - Centralized keyboard shortcut management
 *
 * Provides a unified system for registering and handling keyboard shortcuts
 * with priority-based dispatch, editable element handling, and IME support.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";

// ============================================================================
// Types
// ============================================================================

/** How to handle shortcuts when focus is in an editable element */
export type EditablePolicy = "ignore" | "allow" | "only";

/** How to handle key repeat */
export type RepeatPolicy = "ignore" | "allow";

/** Priority levels for different contexts */
export const ShortcutPriority = {
  /** Modal dialogs - highest priority, blocks everything */
  MODAL: 1000,
  /** Inline editing (dimension input, rename input) */
  INLINE_EDIT: 900,
  /** Sketch mode operations */
  SKETCH_MODE: 500,
  /** 3D selection operations */
  SELECTION_3D: 400,
  /** Feature tree operations */
  FEATURE_TREE: 300,
  /** General/global shortcuts */
  GLOBAL: 100,
} as const;

export interface ShortcutHandler {
  /** Unique ID for this handler (also serves as command ID) */
  id: string;
  /** Keys that trigger this handler (e.g., "Escape", "Mod+Z") */
  keys: string[];
  /** Priority (higher = handled first) */
  priority: number;
  /** Condition for when this handler is active */
  condition: () => boolean;
  /** The handler function - returns true if handled */
  handler: (e: KeyboardEvent) => boolean;
  /** Description for UI display */
  description: string;
  /** How to handle when focus is in an editable element (default: "ignore") */
  editable?: EditablePolicy;
  /** How to handle key repeat (default: "ignore") */
  repeat?: RepeatPolicy;
  /** Whether to call preventDefault when handled (default: true) */
  preventDefault?: boolean;
  /** Category for grouping in help panel */
  category?: string;
}

export interface KeyboardShortcutContextValue {
  /** Register a shortcut handler - returns cleanup function */
  registerShortcut: (handler: ShortcutHandler) => () => void;
  /** Get all registered shortcuts (for help display) */
  getAllShortcuts: () => ShortcutHandler[];
  /** Get active shortcuts (condition is true) */
  getActiveShortcuts: () => ShortcutHandler[];
  /** Check if a shortcut key combo is registered */
  hasShortcut: (key: string) => boolean;
}

// ============================================================================
// Utilities
// ============================================================================

const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().indexOf("MAC") >= 0;

/**
 * Normalize a KeyboardEvent to a canonical key combo string.
 * Uses "Mod" for the platform-specific modifier (Cmd on Mac, Ctrl elsewhere).
 */
export function normalizeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = [];

  // Use "Mod" for platform-agnostic modifier
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  // On Mac, Ctrl is a separate modifier (rarely used for shortcuts)
  if (isMac && e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // Normalize letter keys to uppercase
  let key = e.key;
  if (key.length === 1 && key >= "a" && key <= "z") {
    key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join("+");
}

/**
 * Convert a canonical key combo to a display string for the current platform.
 */
export function displayKeyCombo(combo: string): string {
  if (isMac) {
    return combo
      .replace(/Mod\+/g, "⌘")
      .replace(/Alt\+/g, "⌥")
      .replace(/Shift\+/g, "⇧")
      .replace(/Ctrl\+/g, "⌃");
  }
  return combo.replace(/Mod\+/g, "Ctrl+");
}

/**
 * Check if the current focus is in an editable element.
 * Uses composedPath for Shadow DOM support.
 */
function isEditableFocused(e: KeyboardEvent): boolean {
  // Use composedPath for Shadow DOM support
  const path = e.composedPath();
  for (const el of path) {
    if (!(el instanceof HTMLElement)) continue;

    // Check for input/textarea
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return true;
    }

    // Check for contentEditable
    if (el.isContentEditable) {
      return true;
    }

    // Check for select elements
    if (el instanceof HTMLSelectElement) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Context
// ============================================================================

const KeyboardShortcutContext = createContext<KeyboardShortcutContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface KeyboardShortcutProviderProps {
  children: React.ReactNode;
}

export function KeyboardShortcutProvider({ children }: KeyboardShortcutProviderProps) {
  // Store handlers in a ref to avoid re-renders on registration
  const handlersRef = useRef<Map<string, ShortcutHandler>>(new Map());
  // Track registration order for tie-breaking
  const registrationOrderRef = useRef<Map<string, number>>(new Map());
  const orderCounterRef = useRef(0);

  // Build index of key combos to handler IDs for fast lookup
  const keyIndexRef = useRef<Map<string, Set<string>>>(new Map());

  const rebuildKeyIndex = useCallback(() => {
    const index = new Map<string, Set<string>>();
    for (const [id, handler] of handlersRef.current) {
      for (const key of handler.keys) {
        const normalizedKey = key.toUpperCase();
        if (!index.has(normalizedKey)) {
          index.set(normalizedKey, new Set());
        }
        index.get(normalizedKey)!.add(id);
      }
    }
    keyIndexRef.current = index;
  }, []);

  const registerShortcut = useCallback(
    (handler: ShortcutHandler) => {
      handlersRef.current.set(handler.id, handler);
      registrationOrderRef.current.set(handler.id, orderCounterRef.current++);
      rebuildKeyIndex();

      // Return cleanup function
      return () => {
        handlersRef.current.delete(handler.id);
        registrationOrderRef.current.delete(handler.id);
        rebuildKeyIndex();
      };
    },
    [rebuildKeyIndex]
  );

  const getAllShortcuts = useCallback(() => {
    return Array.from(handlersRef.current.values());
  }, []);

  const getActiveShortcuts = useCallback(() => {
    return Array.from(handlersRef.current.values()).filter((h) => {
      try {
        return h.condition();
      } catch {
        return false;
      }
    });
  }, []);

  const hasShortcut = useCallback((key: string) => {
    const normalizedKey = key.toUpperCase();
    return keyIndexRef.current.has(normalizedKey);
  }, []);

  // Main keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if composing (IME input)
      if (e.isComposing) return;

      // Normalize the key combo
      const combo = normalizeKeyEvent(e);
      const normalizedCombo = combo.toUpperCase();

      // Find handlers for this key combo
      const handlerIds = keyIndexRef.current.get(normalizedCombo);
      if (!handlerIds || handlerIds.size === 0) return;

      // Get candidate handlers
      const candidates: ShortcutHandler[] = [];
      for (const id of handlerIds) {
        const handler = handlersRef.current.get(id);
        if (!handler) continue;
        candidates.push(handler);
      }

      // Sort by priority (desc), then registration order (desc - most recent first)
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        const orderA = registrationOrderRef.current.get(a.id) ?? 0;
        const orderB = registrationOrderRef.current.get(b.id) ?? 0;
        return orderB - orderA;
      });

      // Check if focus is in an editable element
      const inEditable = isEditableFocused(e);

      // Try handlers in priority order
      for (const handler of candidates) {
        // Check editable policy
        const editablePolicy = handler.editable ?? "ignore";
        if (editablePolicy === "ignore" && inEditable) continue;
        if (editablePolicy === "only" && !inEditable) continue;
        // "allow" means we process regardless of editable state

        // Check repeat policy
        const repeatPolicy = handler.repeat ?? "ignore";
        if (repeatPolicy === "ignore" && e.repeat) continue;

        // Check condition
        let conditionMet = false;
        try {
          conditionMet = handler.condition();
        } catch {
          conditionMet = false;
        }
        if (!conditionMet) continue;

        // Try to handle
        let handled = false;
        try {
          handled = handler.handler(e);
        } catch (err) {
          console.error(`[KeyboardShortcut] Handler "${handler.id}" threw:`, err);
          handled = false;
        }

        if (handled) {
          // Prevent default unless explicitly disabled
          if (handler.preventDefault !== false) {
            e.preventDefault();
          }
          // Stop processing - this handler consumed the event
          return;
        }
      }
    };

    // Attach in capture phase for early interception
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  const value = useMemo<KeyboardShortcutContextValue>(
    () => ({
      registerShortcut,
      getAllShortcuts,
      getActiveShortcuts,
      hasShortcut,
    }),
    [registerShortcut, getAllShortcuts, getActiveShortcuts, hasShortcut]
  );

  return (
    <KeyboardShortcutContext.Provider value={value}>
      {children}
    </KeyboardShortcutContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the keyboard shortcut context.
 */
export function useKeyboardShortcuts() {
  const ctx = useContext(KeyboardShortcutContext);
  if (!ctx) {
    throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutProvider");
  }
  return ctx;
}

/**
 * Register a keyboard shortcut. Automatically cleans up on unmount.
 *
 * @example
 * ```tsx
 * useKeyboardShortcut({
 *   id: "sketch-escape",
 *   keys: ["Escape"],
 *   priority: ShortcutPriority.SKETCH_MODE,
 *   condition: () => sketchMode.active,
 *   handler: () => {
 *     clearDrawingChain();
 *     return true;
 *   },
 *   description: "Cancel current drawing",
 * });
 * ```
 */
export function useKeyboardShortcut(handler: ShortcutHandler) {
  const ctx = useContext(KeyboardShortcutContext);

  // Store handler in a ref so we can update it without re-registering
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx) {
      // Not in provider - fall back to direct window listener
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.isComposing) return;

        const combo = normalizeKeyEvent(e);
        const h = handlerRef.current;

        // Check if this key matches
        const matches = h.keys.some((k) => k.toUpperCase() === combo.toUpperCase());
        if (!matches) return;

        // Check editable policy
        const editablePolicy = h.editable ?? "ignore";
        const inEditable = isEditableFocused(e);
        if (editablePolicy === "ignore" && inEditable) return;
        if (editablePolicy === "only" && !inEditable) return;

        // Check repeat policy
        const repeatPolicy = h.repeat ?? "ignore";
        if (repeatPolicy === "ignore" && e.repeat) return;

        // Check condition
        try {
          if (!h.condition()) return;
        } catch {
          return;
        }

        // Handle
        try {
          const handled = h.handler(e);
          if (handled && h.preventDefault !== false) {
            e.preventDefault();
          }
        } catch (err) {
          console.error(`[KeyboardShortcut] Handler "${h.id}" threw:`, err);
        }
      };

      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }

    // Create a wrapper that uses the current ref value
    const wrappedHandler: ShortcutHandler = {
      ...handlerRef.current,
      condition: () => handlerRef.current.condition(),
      handler: (e) => handlerRef.current.handler(e),
    };

    return ctx.registerShortcut(wrappedHandler);
  }, [ctx, handler.id, handler.keys.join(","), handler.priority]);
}

/**
 * Hook to register multiple shortcuts at once.
 */
export function useKeyboardShortcuts_Multi(handlers: ShortcutHandler[]) {
  const ctx = useContext(KeyboardShortcutContext);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!ctx) return;

    const cleanups: (() => void)[] = [];

    for (const handler of handlersRef.current) {
      const wrappedHandler: ShortcutHandler = {
        ...handler,
        condition: () => {
          const h = handlersRef.current.find((h) => h.id === handler.id);
          return h ? h.condition() : false;
        },
        handler: (e) => {
          const h = handlersRef.current.find((h) => h.id === handler.id);
          return h ? h.handler(e) : false;
        },
      };
      cleanups.push(ctx.registerShortcut(wrappedHandler));
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [ctx, handlers.map((h) => h.id).join(",")]);
}
