/**
 * Selection Context - manages selection state for both sketch entities and 3D geometry
 */

import React, { createContext, useContext, useMemo, useState } from "react";

// ============================================================================
// Types
// ============================================================================

/** Selected face in 3D view */
export interface SelectedFace {
  bodyId: string;
  faceIndex: number;
  featureId: string;
  /** Persistent reference string for the face (e.g., "face:e1:top") */
  persistentRef?: string;
}

/** Selected edge in 3D view */
export interface SelectedEdge {
  bodyId: string;
  edgeIndex: number;
  featureId: string;
  /** Persistent reference string for the edge */
  persistentRef?: string;
}

/** Hover state for 3D geometry */
export interface HoverState {
  type: "face" | "edge";
  bodyId: string;
  index: number;
  featureId: string;
}

/** Selection mode for different operations */
export type SelectionMode =
  | "default" // Normal selection
  | "selectFace" // Selecting a face for an operation (e.g., sketch on face)
  | "selectEdge" // Selecting an edge for an operation (e.g., fillet)
  | "selectVertex"; // Selecting a vertex

interface SelectionContextValue {
  // 2D sketch selection (existing)
  highlightedSketchId: string | null;
  highlightedEntityIds: Set<string>;
  setHighlightedEntities: (args: { sketchId: string; entityIds: string[] }) => void;
  clearHighlightedEntities: () => void;

  // 3D selection (new)
  selectedFaces: SelectedFace[];
  selectedEdges: SelectedEdge[];
  selectedFeatureId: string | null;
  /** Feature ID being hovered in the feature tree */
  hoveredFeatureId: string | null;
  hover: HoverState | null;
  selectionMode: SelectionMode;

  // 3D selection actions
  selectFace: (face: SelectedFace, multi?: boolean) => void;
  selectEdge: (edge: SelectedEdge, multi?: boolean) => void;
  selectFeature: (featureId: string | null) => void;
  /** Set the hovered feature ID (for feature tree hover) */
  setHoveredFeature: (featureId: string | null) => void;
  clearSelection: () => void;
  setHover: (hover: HoverState | null) => void;
  setSelectionMode: (mode: SelectionMode) => void;

  // Callbacks for face/edge selection completion
  onFaceSelected?: (face: SelectedFace) => void;
  setOnFaceSelected: (callback: ((face: SelectedFace) => void) | undefined) => void;
}

// ============================================================================
// Context
// ============================================================================

const SelectionContext = createContext<SelectionContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  // 2D sketch selection state
  const [highlightedSketchId, setHighlightedSketchId] = useState<string | null>(null);
  const [highlightedEntityIds, setHighlightedEntityIds] = useState<Set<string>>(() => new Set());

  // 3D selection state
  const [selectedFaces, setSelectedFaces] = useState<SelectedFace[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<SelectedEdge[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("default");

  // Callbacks for selection completion
  const [onFaceSelected, setOnFaceSelectedState] = useState<
    ((face: SelectedFace) => void) | undefined
  >(undefined);

  const value = useMemo<SelectionContextValue>(() => {
    return {
      // 2D sketch selection
      highlightedSketchId,
      highlightedEntityIds,
      setHighlightedEntities: ({ sketchId, entityIds }) => {
        setHighlightedSketchId((prev) => (prev === sketchId ? prev : sketchId));
        setHighlightedEntityIds((prev) => {
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

      // 3D selection
      selectedFaces,
      selectedEdges,
      selectedFeatureId,
      hoveredFeatureId,
      hover,
      selectionMode,

      selectFace: (face: SelectedFace, multi = false) => {
        // If in selectFace mode, call the callback and return
        if (selectionMode === "selectFace" && onFaceSelected) {
          onFaceSelected(face);
          return;
        }

        setSelectedFaces((prev) => {
          if (multi) {
            // Toggle selection
            const exists = prev.some(
              (f) => f.bodyId === face.bodyId && f.faceIndex === face.faceIndex
            );
            if (exists) {
              return prev.filter(
                (f) => !(f.bodyId === face.bodyId && f.faceIndex === face.faceIndex)
              );
            }
            return [...prev, face];
          }
          return [face];
        });
        setSelectedEdges([]);
        setSelectedFeatureId(face.featureId);
      },

      selectEdge: (edge: SelectedEdge, multi = false) => {
        setSelectedEdges((prev) => {
          if (multi) {
            const exists = prev.some(
              (e) => e.bodyId === edge.bodyId && e.edgeIndex === edge.edgeIndex
            );
            if (exists) {
              return prev.filter(
                (e) => !(e.bodyId === edge.bodyId && e.edgeIndex === edge.edgeIndex)
              );
            }
            return [...prev, edge];
          }
          return [edge];
        });
        setSelectedFaces([]);
        setSelectedFeatureId(edge.featureId);
      },

      selectFeature: (featureId: string | null) => {
        setSelectedFeatureId(featureId);
        setSelectedFaces([]);
        setSelectedEdges([]);
      },

      setHoveredFeature: (featureId: string | null) => {
        setHoveredFeatureId(featureId);
      },

      clearSelection: () => {
        setSelectedFaces([]);
        setSelectedEdges([]);
        setSelectedFeatureId(null);
        setHover(null);
      },

      setHover,
      setSelectionMode,

      onFaceSelected,
      setOnFaceSelected: (callback) => {
        setOnFaceSelectedState(() => callback);
      },
    };
  }, [
    highlightedSketchId,
    highlightedEntityIds,
    selectedFaces,
    selectedEdges,
    selectedFeatureId,
    hoveredFeatureId,
    hover,
    selectionMode,
    onFaceSelected,
  ]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}
