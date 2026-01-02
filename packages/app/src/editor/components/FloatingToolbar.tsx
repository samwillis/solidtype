import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Tooltip } from "@base-ui/react";
import { Menu } from "@base-ui/react/menu";
import { useSketch } from "../contexts/SketchContext";
import { useDocument } from "../contexts/DocumentContext";
import { useSelection } from "../contexts/SelectionContext";
import { useFeatureEdit } from "../contexts/FeatureEditContext";
import { useKernel } from "../contexts/KernelContext";
import { useViewer } from "../contexts/ViewerContext";
import {
  SketchIcon,
  ExtrudeIcon,
  RevolveIcon,
  PlaneIcon,
  AxisIcon,
  SelectIcon,
  LineIcon,
  RectangleIcon,
  ArcIcon,
  CircleIcon,
  ConstraintsIcon,
  BooleanIcon,
  UnionIcon,
  SubtractIcon,
  IntersectIcon,
  ChevronDownIcon,
  UndoIcon,
  RedoIcon,
  ExportIcon,
  AIIcon,
  NormalViewIcon,
  CheckIcon,
  CloseIcon,
  OptionsIcon,
} from "./Icons";
import "./FloatingToolbar.css";

interface FloatingToolbarProps {}

const FloatingToolbar: React.FC<FloatingToolbarProps> = () => {
  const {
    mode,
    startSketch,
    finishSketch,
    cancelSketch,
    addRectangle,
    setTool,
    canApplyConstraint,
    applyConstraint,
    clearSelection: clearSketchSelection,
    toggleConstruction,
    hasSelectedEntities,
  } = useSketch();
  const { undo, redo, canUndo, canRedo, features, addBoolean, addOffsetPlane, addAxis } = useDocument();
  const { selectedFeatureId, selectFeature, clearSelection } = useSelection();
  const { exportStl, exportStep, exportJson, bodies, sketchPlaneTransforms } = useKernel();
  const { startExtrudeEdit, startRevolveEdit, isEditing } = useFeatureEdit();
  const { actions: viewerActions, state: viewerState } = useViewer();
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingStep, setIsExportingStep] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);

  // Toggle tool - clicking an active tool toggles it off
  const toggleTool = useCallback(
    (tool: "select" | "line" | "arc" | "circle" | "rectangle") => {
      if (mode.activeTool === tool) {
        setTool("none");
      } else {
        setTool(tool);
      }
    },
    [mode.activeTool, setTool]
  );

  const canExport = bodies.length > 0 && !isExporting;

  const handleExportStl = useCallback(async () => {
    if (!canExport) return;

    setIsExporting(true);
    try {
      const result = await exportStl({ binary: true, name: "model" });

      if (result instanceof ArrayBuffer) {
        const blob = new Blob([result], { type: "model/stl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "model.stl";
        a.click();
        URL.revokeObjectURL(url);
      } else if (typeof result === "string") {
        const blob = new Blob([result], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "model.stl";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  }, [canExport, exportStl]);

  const handleExportStep = useCallback(async () => {
    if (!canExport || isExportingStep) return;

    setIsExportingStep(true);
    try {
      const result = await exportStep({ name: "model" });

      const blob = new Blob([result], { type: "application/step" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "model.step";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("STEP export failed:", err);
      alert(`STEP export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExportingStep(false);
    }
  }, [canExport, exportStep, isExportingStep]);

  const handleExportJson = useCallback(async () => {
    if (!canExport || isExportingJson) return;
    setIsExportingJson(true);
    try {
      const content = await exportJson();
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "model.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export JSON failed:", err);
      alert(`Export JSON failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExportingJson(false);
    }
  }, [canExport, exportJson, isExportingJson]);

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

  // Get selected datum plane for offset plane creation
  const selectedDatumPlane = useMemo(() => {
    if (!selectedFeatureId) return null;
    const feature = features.find((f) => f.id === selectedFeatureId);
    if (feature?.type === "plane") {
      return feature;
    }
    return null;
  }, [selectedFeatureId, features]);

  // Handle creating an offset plane (default 10mm, user can edit in Properties panel)
  const handleCreateOffsetPlane = useCallback(
    (offset: number) => {
      if (!selectedDatumPlane) return;
      addOffsetPlane(selectedDatumPlane.id, offset);
    },
    [selectedDatumPlane, addOffsetPlane]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === "Enter" && mode.active) {
        e.preventDefault();
        finishSketch();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (mode.active) {
          clearSketchSelection();
        } else {
          selectFeature(null);
          clearSelection();
          clearSketchSelection();
        }
        return;
      }

      // Toggle snap-to-grid with 'G' key (only in sketch mode)
      if (e.key === "g" || e.key === "G") {
        if (mode.active) {
          e.preventDefault();
          viewerActions.toggleSnapToGrid();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode.active,
    finishSketch,
    cancelSketch,
    selectFeature,
    clearSelection,
    clearSketchSelection,
    viewerActions,
  ]);

  const handleNewSketch = () => {
    if (!sketchPlaneRef) return;
    startSketch(sketchPlaneRef);
  };

  const handleAddRectangle = () => {
    addRectangle(0, 0, 4, 3);
  };

  const canStartSketch = sketchPlaneRef !== null;
  const canExtrude = !isEditing && (selectedSketch !== null || sketches.length === 1);
  const canRevolve = !isEditing && (selectedSketch !== null || sketches.length === 1);

  const handleExtrude = () => {
    const sketchId = selectedSketch?.id || (sketches.length === 1 ? sketches[0].id : null);
    if (sketchId) {
      startExtrudeEdit(sketchId);
    }
  };

  const bodyFeatures = useMemo(() => {
    return features.filter((f) => f.type === "extrude" || f.type === "revolve");
  }, [features]);

  const canBoolean = !isEditing && bodyFeatures.length >= 2;

  const handleBoolean = (operation: "union" | "subtract" | "intersect") => {
    if (bodyFeatures.length < 2) return;

    const target = bodyFeatures[bodyFeatures.length - 2];
    const tool = bodyFeatures[bodyFeatures.length - 1];

    addBoolean(operation, target.id, tool.id);
  };

  const handleRevolve = () => {
    const sketchId = selectedSketch?.id || (sketches.length === 1 ? sketches[0].id : null);
    if (sketchId) {
      startRevolveEdit(sketchId);
    }
  };

  return (
    <Tooltip.Provider>
      <div className="floating-toolbar">
        {/* Undo/Redo */}
        <div className="floating-toolbar-group">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`floating-toolbar-button ${!canUndo ? "disabled" : ""}`}
              onClick={undo}
              render={<button aria-label="Undo" disabled={!canUndo} />}
            >
              <UndoIcon />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="top" sideOffset={6}>
                <Tooltip.Popup className="floating-toolbar-tooltip">Undo</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`floating-toolbar-button ${!canRedo ? "disabled" : ""}`}
              onClick={redo}
              render={<button aria-label="Redo" disabled={!canRedo} />}
            >
              <RedoIcon />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="top" sideOffset={6}>
                <Tooltip.Popup className="floating-toolbar-tooltip">Redo</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>

        <div className="floating-toolbar-separator" />

        {/* Sketch mode indicator and tools */}
        {mode.active ? (
          <div className="floating-toolbar-group">
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className={`floating-toolbar-button ${mode.activeTool === "select" ? "active" : ""}`}
                onClick={() => toggleTool("select")}
                render={<button aria-label="Select" />}
              >
                <SelectIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="top" sideOffset={6}>
                  <Tooltip.Popup className="floating-toolbar-tooltip">Select</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className={`floating-toolbar-button ${mode.activeTool === "line" ? "active" : ""}`}
                onClick={() => toggleTool("line")}
                render={<button aria-label="Line" />}
              >
                <LineIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="top" sideOffset={6}>
                  <Tooltip.Popup className="floating-toolbar-tooltip">Line</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className={`floating-toolbar-button ${mode.activeTool === "arc" ? "active" : ""}`}
                onClick={() => toggleTool("arc")}
                render={<button aria-label="Arc" />}
              >
                <ArcIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="top" sideOffset={6}>
                  <Tooltip.Popup className="floating-toolbar-tooltip">Arc</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className={`floating-toolbar-button ${mode.activeTool === "circle" ? "active" : ""}`}
                onClick={() => toggleTool("circle")}
                render={<button aria-label="Circle" />}
              >
                <CircleIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="top" sideOffset={6}>
                  <Tooltip.Popup className="floating-toolbar-tooltip">Circle</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className="floating-toolbar-button"
                onClick={handleAddRectangle}
                render={<button aria-label="Rectangle" />}
              >
                <RectangleIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="top" sideOffset={6}>
                  <Tooltip.Popup className="floating-toolbar-tooltip">Rectangle</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>

            {/* Constraints dropdown */}
            <Menu.Root>
              <Menu.Trigger
                className="floating-toolbar-button floating-toolbar-dropdown-button"
                aria-label="Constraints"
              >
                <ConstraintsIcon />
                <ChevronDownIcon />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={4}>
                  <Menu.Popup className="floating-toolbar-dropdown-menu">
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("horizontal")}
                      disabled={!canApplyConstraint("horizontal")}
                    >
                      <span className="floating-toolbar-dropdown-key">H</span> Horizontal
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("vertical")}
                      disabled={!canApplyConstraint("vertical")}
                    >
                      <span className="floating-toolbar-dropdown-key">V</span> Vertical
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("coincident")}
                      disabled={!canApplyConstraint("coincident")}
                    >
                      <span className="floating-toolbar-dropdown-key">C</span> Coincident
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("fixed")}
                      disabled={!canApplyConstraint("fixed")}
                    >
                      <span className="floating-toolbar-dropdown-key">F</span> Fixed
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("distance")}
                      disabled={!canApplyConstraint("distance")}
                    >
                      <span className="floating-toolbar-dropdown-key">D</span> Distance
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("angle")}
                      disabled={!canApplyConstraint("angle")}
                    >
                      <span className="floating-toolbar-dropdown-key">∠</span> Angle
                    </Menu.Item>
                    <Menu.Separator className="floating-toolbar-dropdown-separator" />
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("parallel")}
                      disabled={!canApplyConstraint("parallel")}
                    >
                      <span className="floating-toolbar-dropdown-key">∥</span> Parallel
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("perpendicular")}
                      disabled={!canApplyConstraint("perpendicular")}
                    >
                      <span className="floating-toolbar-dropdown-key">⊥</span> Perpendicular
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("equalLength")}
                      disabled={!canApplyConstraint("equalLength")}
                    >
                      <span className="floating-toolbar-dropdown-key">=</span> Equal Length
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("tangent")}
                      disabled={!canApplyConstraint("tangent")}
                    >
                      <span className="floating-toolbar-dropdown-key">⌒</span> Tangent
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => applyConstraint("symmetric")}
                      disabled={!canApplyConstraint("symmetric")}
                    >
                      <span className="floating-toolbar-dropdown-key">⇔</span> Symmetric
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>

            {/* Construction mode toggle */}
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className={`floating-toolbar-button ${hasSelectedEntities() ? "" : "disabled"}`}
                onClick={() => hasSelectedEntities() && toggleConstruction()}
                disabled={!hasSelectedEntities()}
                render={<button aria-label="Toggle Construction" />}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="4 2" />
                </svg>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="top" sideOffset={6}>
                  <Tooltip.Popup className="floating-toolbar-tooltip">
                    Toggle Construction (X)
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>

            {/* Sketch Options Menu */}
            <Menu.Root>
              <Menu.Trigger
                className="floating-toolbar-button floating-toolbar-dropdown-button"
                aria-label="Sketch Options"
              >
                <OptionsIcon />
                <ChevronDownIcon />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="bottom" sideOffset={6} align="start">
                  <Menu.Popup className="floating-toolbar-dropdown-menu">
                    {/* Snap to Grid toggle */}
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => viewerActions.toggleSnapToGrid()}
                    >
                      {viewerState.snapToGrid && <CheckIcon />} Snap to Grid (G)
                    </Menu.Item>
                    <Menu.Separator className="floating-toolbar-dropdown-separator" />
                    {/* Grid Size options */}
                    <div className="floating-toolbar-dropdown-label">Grid Size</div>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => viewerActions.setGridSize(0.5)}
                    >
                      {viewerState.gridSize === 0.5 && <CheckIcon />} 0.5mm
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => viewerActions.setGridSize(1)}
                    >
                      {viewerState.gridSize === 1 && <CheckIcon />} 1mm
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => viewerActions.setGridSize(2)}
                    >
                      {viewerState.gridSize === 2 && <CheckIcon />} 2mm
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => viewerActions.setGridSize(5)}
                    >
                      {viewerState.gridSize === 5 && <CheckIcon />} 5mm
                    </Menu.Item>
                    <Menu.Item
                      className="floating-toolbar-dropdown-item"
                      onClick={() => viewerActions.setGridSize(10)}
                    >
                      {viewerState.gridSize === 10 && <CheckIcon />} 10mm
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>

            {/* Sketch mode actions: Normal to Sketch, Accept, Cancel */}
            <div className="floating-toolbar-separator" />
            <div className="floating-toolbar-group">
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className="floating-toolbar-button"
                  onClick={() => {
                    // Reset camera to sketch normal using actual plane transform
                    if (mode.sketchId) {
                      const transform = sketchPlaneTransforms[mode.sketchId];
                      if (transform) {
                        // Use the kernel's plane transform
                        viewerActions.setViewToPlane(transform);
                      } else if (mode.planeId) {
                        // Fallback for built-in planes when transform not yet available
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
                  }}
                  render={<button aria-label="Normal to Sketch" />}
                >
                  <NormalViewIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      View Normal to Sketch Plane
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className="floating-toolbar-button"
                  onClick={finishSketch}
                  render={<button aria-label="Accept Sketch" />}
                >
                  <CheckIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      Accept Sketch (Ctrl+Enter)
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className="floating-toolbar-button"
                  onClick={cancelSketch}
                  render={<button aria-label="Cancel Sketch" />}
                >
                  <CloseIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      Cancel Sketch
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>
          </div>
        ) : (
          <>
            {/* Feature mode: Sketch, Plane, Extrude, Revolve */}
            <div className="floating-toolbar-group">
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className={`floating-toolbar-button ${!canStartSketch ? "disabled" : ""}`}
                  onClick={handleNewSketch}
                  render={<button aria-label="New Sketch" disabled={!canStartSketch} />}
                >
                  <SketchIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      {canStartSketch
                        ? selectedFaceRef
                          ? `New Sketch on Face`
                          : `New Sketch on ${(selectedPlane || "").toUpperCase()}`
                        : "New Sketch (select a plane or face first)"}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
              {/* Plane Creation Button */}
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className={`floating-toolbar-button ${!selectedDatumPlane ? "disabled" : ""}`}
                  onClick={() => handleCreateOffsetPlane(10)}
                  render={<button aria-label="Add Offset Plane" disabled={!selectedDatumPlane} />}
                >
                  <PlaneIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      {selectedDatumPlane
                        ? "Add Offset Plane (edit distance in Properties)"
                        : "Add Offset Plane (select a plane first)"}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>

              {/* Axis Creation Dropdown */}
              <Menu.Root>
                <Menu.Trigger
                  className="floating-toolbar-button floating-toolbar-dropdown-button"
                  aria-label="Add Axis"
                >
                  <AxisIcon />
                  <ChevronDownIcon />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={4}>
                    <Menu.Popup className="floating-toolbar-dropdown-menu">
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        onClick={() => addAxis({ definition: { kind: "datum", role: "x" } })}
                      >
                        X Axis (datum)
                      </Menu.Item>
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        onClick={() => addAxis({ definition: { kind: "datum", role: "y" } })}
                      >
                        Y Axis (datum)
                      </Menu.Item>
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        onClick={() => addAxis({ definition: { kind: "datum", role: "z" } })}
                      >
                        Z Axis (datum)
                      </Menu.Item>
                      <Menu.Separator className="floating-toolbar-dropdown-separator" />
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        disabled
                        onClick={() => {/* TODO: implement edge selection */}}
                      >
                        Along Edge (select edge)
                      </Menu.Item>
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        disabled
                        onClick={() => {/* TODO: implement two-point selection */}}
                      >
                        Between Two Points
                      </Menu.Item>
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        disabled
                        onClick={() => {/* TODO: implement sketch line selection */}}
                      >
                        Along Sketch Line
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>

            <div className="floating-toolbar-separator" />

            {/* Feature tools */}
            <div className="floating-toolbar-group">
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className={`floating-toolbar-button ${!canExtrude ? "disabled" : ""}`}
                  onClick={handleExtrude}
                  render={<button aria-label="Extrude" disabled={!canExtrude} />}
                >
                  <ExtrudeIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      {selectedSketch
                        ? `Extrude ${selectedSketch.name || selectedSketch.id}`
                        : "Extrude (select a sketch)"}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className={`floating-toolbar-button ${!canRevolve ? "disabled" : ""}`}
                  onClick={handleRevolve}
                  render={<button aria-label="Revolve" disabled={!canRevolve} />}
                >
                  <RevolveIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      {selectedSketch
                        ? `Revolve ${selectedSketch.name || selectedSketch.id}`
                        : "Revolve (select a sketch)"}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>

              {/* Boolean Operations Dropdown */}
              <Menu.Root>
                <Tooltip.Root>
                  <Tooltip.Trigger
                    delay={300}
                    render={
                      <Menu.Trigger
                        className={`floating-toolbar-button ${!canBoolean ? "disabled" : ""}`}
                        aria-label="Boolean"
                        disabled={!canBoolean}
                      >
                        <BooleanIcon />
                        <ChevronDownIcon />
                      </Menu.Trigger>
                    }
                  />
                  <Tooltip.Portal>
                    <Tooltip.Positioner side="top" sideOffset={6}>
                      <Tooltip.Popup className="floating-toolbar-tooltip">
                        Boolean Operations {canBoolean ? "" : "(need 2+ bodies)"}
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={4}>
                    <Menu.Popup className="floating-toolbar-dropdown">
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        onClick={() => handleBoolean("union")}
                      >
                        <UnionIcon />
                        <span>Union</span>
                      </Menu.Item>
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        onClick={() => handleBoolean("subtract")}
                      >
                        <SubtractIcon />
                        <span>Subtract</span>
                      </Menu.Item>
                      <Menu.Item
                        className="floating-toolbar-dropdown-item"
                        onClick={() => handleBoolean("intersect")}
                      >
                        <IntersectIcon />
                        <span>Intersect</span>
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          </>
        )}

        <div className="floating-toolbar-separator" />

        {/* Export */}
        <div className="floating-toolbar-group">
          <Menu.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
                render={
                  <Menu.Trigger
                    className={`floating-toolbar-button has-dropdown ${!canExport ? "disabled" : ""} ${isExporting || isExportingStep ? "loading" : ""}`}
                    disabled={!canExport}
                    aria-label="Export"
                  />
                }
            >
              <ExportIcon />
                <ChevronDownIcon className="dropdown-indicator" />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="top" sideOffset={6}>
                <Tooltip.Popup className="floating-toolbar-tooltip">
                    {isExporting || isExportingStep
                    ? "Exporting..."
                    : canExport
                        ? "Export Model"
                        : "Export (no bodies)"}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
            <Menu.Portal>
              <Menu.Positioner side="top" sideOffset={8}>
                <Menu.Popup className="floating-toolbar-dropdown">
                  <Menu.Item
                    className="floating-toolbar-dropdown-item"
                    onClick={handleExportStl}
                    disabled={!canExport || isExporting}
                  >
                    <span>STL (Mesh)</span>
                    <span className="floating-toolbar-dropdown-hint">.stl</span>
                  </Menu.Item>
                  <Menu.Item
                    className="floating-toolbar-dropdown-item"
                    onClick={handleExportStep}
                    disabled={!canExport || isExportingStep}
                  >
                    <span>STEP (CAD)</span>
                    <span className="floating-toolbar-dropdown-hint">.step</span>
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>

    </Tooltip.Provider>
  );
};

export default FloatingToolbar;
