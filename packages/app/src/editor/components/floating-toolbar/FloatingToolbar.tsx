import React, { useMemo, useCallback } from "react";
import { Tooltip } from "@base-ui/react";
import { useSketch } from "../../contexts/SketchContext";
import { useDocument } from "../../contexts/DocumentContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useFeatureEdit } from "../../contexts/FeatureEditContext";
import { useKernel } from "../../contexts/KernelContext";
import { useViewer } from "../../contexts/ViewerContext";
import {
  useKeyboardShortcut,
  ShortcutPriority,
} from "../../contexts/KeyboardShortcutContext";
import { UndoRedoGroup } from "./UndoRedoGroup";
import { SketchModeTools } from "./SketchModeTools";
import { FeatureModeTools } from "./FeatureModeTools";
import { ExportMenu } from "./ExportMenu";
import "./FloatingToolbar.css";

/**
 * FloatingToolbar - Main toolbar for the CAD editor
 *
 * Provides quick access to:
 * - Sketch tools (line, rectangle, arc, circle)
 * - Feature creation (extrude, revolve, boolean)
 * - Constraint application
 * - Undo/redo operations
 * - Export functionality
 *
 * The toolbar adapts its available tools based on the current mode
 * (normal view vs active sketch editing).
 */
const FloatingToolbar: React.FC = () => {
  const {
    mode,
    startSketch,
    finishSketch,
    cancelSketch,
    setTool,
    canApplyConstraint,
    applyConstraint,
    clearSelection: clearSketchSelection,
    toggleConstruction,
    hasSelectedEntities,
  } = useSketch();
  const { undo, redo, canUndo, canRedo, features, addBoolean, addOffsetPlane, addAxis } =
    useDocument();
  const { selectedFeatureId, selectFeature, clearSelection } = useSelection();
  const { exportStl, exportStep, bodies, sketchPlaneTransforms } = useKernel();
  const { startExtrudeEdit, startRevolveEdit, isEditing } = useFeatureEdit();
  const { actions: viewerActions, state: viewerState } = useViewer();

  // Derived state
  const sketches = useMemo(() => {
    return features.filter((f) => f.type === "sketch");
  }, [features]);

  const selectedPlane = useMemo(() => {
    if (!selectedFeatureId) return null;
    const feature = features.find((f) => f.id === selectedFeatureId);
    if (feature?.type === "plane") {
      return feature.id;
    }
    return null;
  }, [selectedFeatureId, features]);

  const { selectedFaces } = useSelection();
  const selectedFaceRef = useMemo(() => {
    if (selectedFaces.length !== 1) return null;
    const face = selectedFaces[0];
    return `face:${face.featureId}:${face.faceIndex}`;
  }, [selectedFaces]);

  const sketchPlaneRef = selectedPlane || selectedFaceRef;

  const selectedSketch = useMemo(() => {
    if (!selectedFeatureId) return null;
    const feature = features.find((f) => f.id === selectedFeatureId);
    if (feature?.type === "sketch") {
      return feature;
    }
    return null;
  }, [selectedFeatureId, features]);

  const selectedDatumPlane = useMemo(() => {
    if (!selectedFeatureId) return null;
    const feature = features.find((f) => f.id === selectedFeatureId);
    if (feature?.type === "plane") {
      return feature;
    }
    return null;
  }, [selectedFeatureId, features]);

  const bodyFeatures = useMemo(() => {
    return features.filter((f) => f.type === "extrude" || f.type === "revolve");
  }, [features]);

  // Capability flags
  const canStartSketch = sketchPlaneRef !== null;
  const canExtrude = !isEditing && (selectedSketch !== null || sketches.length === 1);
  const canRevolve = !isEditing && (selectedSketch !== null || sketches.length === 1);
  const canBoolean = !isEditing && bodyFeatures.length >= 2;
  const canExport = bodies.length > 0;

  // Handlers
  const handleNewSketch = useCallback(() => {
    if (!sketchPlaneRef) return;
    startSketch(sketchPlaneRef);
  }, [sketchPlaneRef, startSketch]);

  const handleCreateOffsetPlane = useCallback(() => {
    if (!selectedDatumPlane) return;
    addOffsetPlane(selectedDatumPlane.id, 10);
  }, [selectedDatumPlane, addOffsetPlane]);

  const handleExtrude = useCallback(() => {
    const sketchId = selectedSketch?.id || (sketches.length === 1 ? sketches[0].id : null);
    if (sketchId) {
      startExtrudeEdit(sketchId);
    }
  }, [selectedSketch, sketches, startExtrudeEdit]);

  const handleRevolve = useCallback(() => {
    const sketchId = selectedSketch?.id || (sketches.length === 1 ? sketches[0].id : null);
    if (sketchId) {
      startRevolveEdit(sketchId);
    }
  }, [selectedSketch, sketches, startRevolveEdit]);

  const handleBoolean = useCallback(
    (operation: "union" | "subtract" | "intersect") => {
      if (bodyFeatures.length < 2) return;
      const target = bodyFeatures[bodyFeatures.length - 2];
      const tool = bodyFeatures[bodyFeatures.length - 1];
      addBoolean(operation, target.id, tool.id);
    },
    [bodyFeatures, addBoolean]
  );

  const handleAddAxis = useCallback(
    (definition: { kind: "datum"; role: "x" | "y" | "z" }) => {
      addAxis({ definition });
    },
    [addAxis]
  );

  const handleNormalView = useCallback(() => {
    if (mode.sketchId) {
      const transform = sketchPlaneTransforms[mode.sketchId];
      if (transform) {
        viewerActions.setViewToPlane(transform);
      } else if (mode.planeId) {
        const planeViewMap: Record<string, string> = {
          xy: "top",
          xz: "front",
          yz: "right",
        };
        const view = planeViewMap[mode.planeId];
        if (view) {
          viewerActions.setView(view as "top" | "front" | "right");
        }
      }
    }
  }, [mode.sketchId, mode.planeId, sketchPlaneTransforms, viewerActions]);

  // Keyboard shortcut: Mod+Enter to finish sketch
  useKeyboardShortcut({
    id: "floating-toolbar-finish-sketch",
    keys: ["Mod+Enter"],
    priority: ShortcutPriority.SKETCH_MODE,
    condition: () => mode.active,
    handler: () => {
      finishSketch();
      return true;
    },
    description: "Finish editing sketch",
    category: "Sketch",
  });

  // Keyboard shortcut: Escape to clear selection (outside sketch mode)
  // In sketch mode, useSketchTools handles Escape
  useKeyboardShortcut({
    id: "floating-toolbar-escape",
    keys: ["Escape"],
    priority: ShortcutPriority.GLOBAL,
    condition: () => !mode.active,
    handler: () => {
      selectFeature(null);
      clearSelection();
      clearSketchSelection();
      return true;
    },
    description: "Clear selection",
    category: "General",
  });

  // Keyboard shortcut: G to toggle snap-to-grid
  useKeyboardShortcut({
    id: "floating-toolbar-toggle-grid",
    keys: ["G"],
    priority: ShortcutPriority.SKETCH_MODE,
    condition: () => mode.active,
    handler: () => {
      viewerActions.toggleSnapToGrid();
      return true;
    },
    description: "Toggle snap-to-grid",
    category: "Sketch",
  });

  // Tooltip texts
  const sketchTooltip = canStartSketch
    ? selectedFaceRef
      ? "New Sketch on Face"
      : `New Sketch on ${(selectedPlane || "").toUpperCase()}`
    : "New Sketch (select a plane or face first)";

  const planeTooltip = selectedDatumPlane
    ? "Add Offset Plane (edit distance in Properties)"
    : "Add Offset Plane (select a plane first)";

  const extrudeTooltip = selectedSketch
    ? `Extrude ${selectedSketch.name || selectedSketch.id}`
    : "Extrude (select a sketch)";

  const revolveTooltip = selectedSketch
    ? `Revolve ${selectedSketch.name || selectedSketch.id}`
    : "Revolve (select a sketch)";

  return (
    <Tooltip.Provider>
      <div className="floating-toolbar">
        <UndoRedoGroup undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />

        <div className="floating-toolbar-separator" />

        {mode.active ? (
          <SketchModeTools
            activeTool={mode.activeTool}
            setTool={setTool}
            finishSketch={finishSketch}
            cancelSketch={cancelSketch}
            canApplyConstraint={canApplyConstraint}
            applyConstraint={applyConstraint}
            hasSelectedEntities={hasSelectedEntities}
            toggleConstruction={toggleConstruction}
            snapToGrid={viewerState.snapToGrid}
            gridSize={viewerState.gridSize}
            toggleSnapToGrid={viewerActions.toggleSnapToGrid}
            setGridSize={viewerActions.setGridSize}
            onNormalView={handleNormalView}
          />
        ) : (
          <FeatureModeTools
            canStartSketch={canStartSketch}
            onNewSketch={handleNewSketch}
            sketchTooltip={sketchTooltip}
            canCreatePlane={!!selectedDatumPlane}
            onCreateOffsetPlane={handleCreateOffsetPlane}
            planeTooltip={planeTooltip}
            onAddAxis={handleAddAxis}
            canExtrude={canExtrude}
            onExtrude={handleExtrude}
            extrudeTooltip={extrudeTooltip}
            canRevolve={canRevolve}
            onRevolve={handleRevolve}
            revolveTooltip={revolveTooltip}
            canBoolean={canBoolean}
            onBoolean={handleBoolean}
          />
        )}

        <div className="floating-toolbar-separator" />

        <ExportMenu canExport={canExport} exportStl={exportStl} exportStep={exportStep} />
      </div>
    </Tooltip.Provider>
  );
};

export default FloatingToolbar;
