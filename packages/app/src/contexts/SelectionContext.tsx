import React, { createContext, useContext, useMemo, useState } from 'react';

interface SelectionContextValue {
  highlightedSketchId: string | null;
  highlightedEntityIds: Set<string>;
  setHighlightedEntities: (args: { sketchId: string; entityIds: string[] }) => void;
  clearHighlightedEntities: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [highlightedSketchId, setHighlightedSketchId] = useState<string | null>(null);
  const [highlightedEntityIds, setHighlightedEntityIds] = useState<Set<string>>(() => new Set());

  const value = useMemo<SelectionContextValue>(() => {
    return {
      highlightedSketchId,
      highlightedEntityIds,
      setHighlightedEntities: ({ sketchId, entityIds }) => {
        setHighlightedSketchId((prev) => (prev === sketchId ? prev : sketchId));
        setHighlightedEntityIds((prev) => {
          // Avoid unnecessary updates (important for tests + render stability)
          if (prev.size === entityIds.length) {
            let allMatch = true;
            for (const id of entityIds) {
              if (!prev.has(id)) {
                allMatch = false;
                break;
              }
            }
            if (allMatch) return prev;
          }
          return new Set(entityIds);
        });
      },
      clearHighlightedEntities: () => {
        setHighlightedSketchId((prev) => (prev === null ? prev : null));
        setHighlightedEntityIds((prev) => (prev.size === 0 ? prev : new Set()));
      },
    };
  }, [highlightedSketchId, highlightedEntityIds]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
}

