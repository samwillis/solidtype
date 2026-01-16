# Keyboard Shortcut Context Plan

## Problem Statement

Currently, keyboard handling in SolidType is fragmented across multiple components:

- **FloatingToolbar** - Handles Escape (clear selection), Ctrl+Enter (finish sketch), G (toggle grid)
- **useSketchTools** - Handles Escape (clear drawing chain), Delete/Backspace (delete sketch items)
- **FeatureTree** - Handles Delete/Backspace (delete features with confirmation)
- **useDimensionEditing** - Handles Escape/Enter (cancel/confirm dimension edit)
- **ConfirmDialog** - Handles Escape (cancel dialog)
- Various input fields with their own handlers

This fragmentation leads to:
1. **Conflicts** - Multiple handlers competing for the same key
2. **Inconsistency** - Same key does different things in unclear contexts
3. **Maintenance burden** - Hard to understand what a key does across the app
4. **No customization** - Users can't remap shortcuts

## Proposed Solution

### 1. Create `KeyboardShortcutContext`

A centralized context that manages all keyboard shortcuts with priority-based handling.

```tsx
// packages/app/src/editor/contexts/KeyboardShortcutContext.tsx

interface ShortcutHandler {
  /** Unique ID for this handler */
  id: string;
  /** Keys that trigger this handler (e.g., "Escape", "Delete", "Ctrl+Z") */
  keys: string[];
  /** Priority (higher = handled first) */
  priority: number;
  /** Condition for when this handler is active */
  condition: () => boolean;
  /** The handler function */
  handler: (e: KeyboardEvent) => void;
  /** Description for UI display */
  description: string;
}

interface KeyboardShortcutContextValue {
  /** Register a shortcut handler */
  registerShortcut: (handler: ShortcutHandler) => () => void;
  /** Get all active shortcuts (for help display) */
  getActiveShortcuts: () => ShortcutHandler[];
  /** Check if a shortcut is registered */
  hasShortcut: (keys: string[]) => boolean;
}
```

### 2. Priority Levels

Define clear priority levels for different contexts:

```typescript
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
```

### 3. Key Normalization

Normalize key combinations to a consistent format:

```typescript
function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.key);
  return parts.join("+");
}

// Examples:
// "Escape" -> "Escape"
// "Ctrl+Z" -> "Ctrl+Z"
// "Ctrl+Shift+Z" -> "Ctrl+Shift+Z"
// "Delete" -> "Delete"
// "Backspace" -> "Backspace"
```

### 4. Usage Pattern

Components register their shortcuts using a hook:

```tsx
// In useSketchTools.ts
useKeyboardShortcut({
  id: "sketch-escape",
  keys: ["Escape"],
  priority: ShortcutPriority.SKETCH_MODE,
  condition: () => sketchMode.active,
  handler: () => {
    clearDrawingChain();
    clearSketchSelection();
  },
  description: "Cancel current drawing / clear selection",
});

useKeyboardShortcut({
  id: "sketch-delete",
  keys: ["Delete", "Backspace"],
  priority: ShortcutPriority.SKETCH_MODE,
  condition: () => sketchMode.active && hasSelection(),
  handler: () => deleteSelectedItems(),
  description: "Delete selected sketch entities",
});
```

### 5. Input Field Handling

Automatically skip keyboard handling when focus is in an input:

```typescript
function shouldHandleEvent(e: KeyboardEvent): boolean {
  const target = e.target;
  
  // Skip if typing in an input
  if (target instanceof HTMLInputElement) return false;
  if (target instanceof HTMLTextAreaElement) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  
  return true;
}
```

### 6. Shortcut Help Panel

The context can provide data for a keyboard shortcuts help panel:

```tsx
function ShortcutHelpPanel() {
  const { getActiveShortcuts } = useKeyboardShortcuts();
  const shortcuts = getActiveShortcuts();
  
  return (
    <div className="shortcut-help">
      {shortcuts.map(s => (
        <div key={s.id}>
          <kbd>{s.keys.join(" / ")}</kbd>
          <span>{s.description}</span>
        </div>
      ))}
    </div>
  );
}
```

## Implementation Plan

### Phase 1: Core Context (2-3 hours)
1. Create `KeyboardShortcutContext.tsx`
2. Implement `KeyboardShortcutProvider` with event listener
3. Implement `useKeyboardShortcut` hook
4. Add priority-based dispatch logic

### Phase 2: Migrate Existing Handlers (2-3 hours)
1. Migrate FloatingToolbar shortcuts
2. Migrate useSketchTools shortcuts
3. Migrate FeatureTree shortcuts
4. Migrate useDimensionEditing shortcuts
5. Migrate ConfirmDialog shortcuts

### Phase 3: Consolidate and Clean Up (1-2 hours)
1. Remove old `window.addEventListener` calls
2. Add input field detection
3. Test all keyboard interactions

### Phase 4: Enhancements (optional, 2-3 hours)
1. Add shortcut help panel (? key to show)
2. Add shortcut customization (future)
3. Add shortcut conflict detection

## Default Shortcuts

### Global
| Key | Action |
|-----|--------|
| `?` | Show keyboard shortcuts help |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |

### Feature Tree (when focused)
| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete selected feature (with confirmation) |
| `Enter` | Edit sketch / start rename |
| `Escape` | Clear selection |

### Sketch Mode
| Key | Action |
|-----|--------|
| `Escape` | Cancel drawing / clear selection |
| `Delete` / `Backspace` | Delete selected entities |
| `Ctrl+Enter` | Finish sketch |
| `G` | Toggle snap-to-grid |
| `L` | Line tool |
| `A` | Arc tool |
| `C` | Circle tool |
| `R` | Rectangle tool |
| `S` | Select tool |

### 3D View
| Key | Action |
|-----|--------|
| `1` | Front view |
| `2` | Back view |
| `3` | Right view |
| `4` | Left view |
| `5` | Top view |
| `6` | Bottom view |
| `0` | Isometric view |
| `F` | Fit to view |

## Notes

- Use `e.preventDefault()` only when actually handling the event
- Use `e.stopPropagation()` sparingly - prefer priority-based dispatch
- Consider Mac vs Windows key differences (Cmd vs Ctrl)
- Keep shortcuts discoverable via tooltips and help panel
