import React, { useMemo, useCallback, useState, useEffect } from "react";
import { Tooltip } from "@base-ui/react";
import { useSketch } from "../../contexts/SketchContext";
import { useDocument } from "../../contexts/DocumentContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useFeatureEdit } from "../../contexts/FeatureEditContext";
import { useKernel } from "../../contexts/KernelContext";
import { useViewer } from "../../contexts/ViewerContext";
import { useKeyboardShortcut, ShortcutPriority } from "../../contexts/KeyboardShortcutContext";
import { UndoRedoGroup } from "./UndoRedoGroup";
import { SketchModeTools } from "./SketchModeTools";
import { FeatureModeTools } from "./FeatureModeTools";
import { ExportMenu } from "./ExportMenu";
import "./FloatingToolbar.css";
import { defaultAxisToolFormData, defaultPlaneToolFormData } from "../../types/featureSchemas";

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
  const { undo, redo, canUndo, canRedo, features, addBoolean, addAxis } = useDocument();
  const {
    selectedFeatureId,
    selectFeature,
    clearSelection,
    setSelectionMode,
    setOnFaceSelected,
  } = useSelection();
  const { exportStl, exportStep, bodies, sketchPlaneTransforms } = useKernel();
  const { startExtrudeEdit, startRevolveEdit, startPlaneEdit, startAxisEdit, isEditing } =
    useFeatureEdit();
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

  const { selectedFaces, selectedEdges } = useSelection();
  const [isPickingSketchFace, setIsPickingSketchFace] = useState(false);
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

  const bodyFeatures = useMemo(() => {
    return features.filter((f) => f.type === "extrude" || f.type === "revolve");
  }, [features]);

  // Capability flags
  const canStartSketch = sketchPlaneRef !== null;
  const canCreatePlane = !isEditing;
  const canCreateAxis = !isEditing;
  const canExtrude = !isEditing && (selectedSketch !== null || sketches.length === 1);
  const canRevolve = !isEditing && (selectedSketch !== null || sketches.length === 1);
  const canBoolean = !isEditing && bodyFeatures.length >= 2;
  const canExport = bodies.length > 0;

  // Handlers
  const handleNewSketch = useCallback(() => {
    if (sketchPlaneRef) {
      startSketch(sketchPlaneRef);
      return;
    }

    // No plane/face selected yet: enter face-pick mode (Sketch on Face)
    setIsPickingSketchFace(true);
    setSelectionMode("selectFace");
    setOnFaceSelected((face) => {
      const faceRef = `face:${face.featureId}:${face.faceIndex}`;
      startSketch(faceRef);
      setIsPickingSketchFace(false);
      setSelectionMode("default");
      setOnFaceSelected(undefined);
    });
  }, [sketchPlaneRef, startSketch, setSelectionMode, setOnFaceSelected]);

  const handleCreatePlane = useCallback(() => {
    const base = { ...defaultPlaneToolFormData };
    if (selectedFaceRef && selectedFaces.length === 1) {
      base.ref1 = selectedFaceRef;
      base.mode = "offset";
    } else if (selectedFaces.length === 2) {
      base.ref1 = `face:${selectedFaces[0].featureId}:${selectedFaces[0].faceIndex}`;
      base.ref2 = `face:${selectedFaces[1].featureId}:${selectedFaces[1].faceIndex}`;
      base.mode = "midplane";
    } else if (selectedPlane && selectedEdges.length === 1) {
      base.ref1 = selectedPlane;
      base.ref2 = `edge:${selectedEdges[0].featureId}:${selectedEdges[0].edgeIndex}`;
      base.mode = "angle";
    } else if (selectedPlane) {
      base.ref1 = selectedPlane;
      base.mode = "offset";
    }
    startPlaneEdit(base);
  }, [selectedFaceRef, selectedFaces, selectedPlane, selectedEdges, startPlaneEdit]);

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

  const handleCreateAxis = useCallback(() => {
    const base = { ...defaultAxisToolFormData };
    if (selectedEdges.length === 1) {
      base.ref1 = `edge:${selectedEdges[0].featureId}:${selectedEdges[0].edgeIndex}`;
      base.mode = "linear";
    } else if (selectedFaces.length === 2) {
      base.ref1 = `face:${selectedFaces[0].featureId}:${selectedFaces[0].faceIndex}`;
      base.ref2 = `face:${selectedFaces[1].featureId}:${selectedFaces[1].faceIndex}`;
      base.mode = "twoPlanes";
    }
    startAxisEdit(base);
  }, [selectedEdges, selectedFaces, startAxisEdit]);

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
      if (isPickingSketchFace) {
        setIsPickingSketchFace(false);
        setSelectionMode("default");
        setOnFaceSelected(undefined);
        return true;
      }
      selectFeature(null);
      clearSelection();
      clearSketchSelection();
      return true;
    },
    description: "Clear selection",
    category: "General",
  });

  // Cleanup face-pick mode if component unmounts or sketch starts
  useEffect(() => {
    if (mode.active && isPickingSketchFace) {
      setIsPickingSketchFace(false);
      setSelectionMode("default");
      setOnFaceSelected(undefined);
    }
  }, [mode.active, isPickingSketchFace, setSelectionMode, setOnFaceSelected]);

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
    : isPickingSketchFace
      ? "Click a face to start sketch"
      : "New Sketch (select a plane or face first)";

  const planeTooltip = selectedFaceRef || selectedPlane
    ? "Create Plane (use current selection)"
    : "Create Plane (select references in viewport/tree)";

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
            canCreatePlane={canCreatePlane}
            onCreatePlane={handleCreatePlane}
            planeTooltip={planeTooltip}
            canCreateAxis={canCreateAxis}
            onCreateAxis={handleCreateAxis}
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
