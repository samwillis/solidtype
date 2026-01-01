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
  } = useSketch();
  const { undo, redo, canUndo, canRedo, features, addBoolean } = useDocument();
  const { selectedFeatureId, selectFeature, clearSelection } = useSelection();
  const { exportStl, exportJson, bodies, sketchPlaneTransforms } = useKernel();
  const { startExtrudeEdit, startRevolveEdit, isEditing } = useFeatureEdit();
  const { actions: viewerActions } = useViewer();
  const [isExporting, setIsExporting] = useState(false);
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

            {/* Sketch mode actions: Normal to Sketch, Accept, Cancel */}
            <div className="floating-toolbar-separator" />
            <div className="floating-toolbar-group">
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className="floating-toolbar-button"
                  onClick={() => {
                    // Reset camera to sketch normal - get view for the sketch plane
                    if (mode.sketchId && mode.planeId) {
                      // Map plane IDs to view presets
                      const planeViewMap: Record<string, string> = {
                        xy: "top",
                        xz: "front",
                        yz: "right",
                        top: "top",
                        front: "front",
                        right: "right",
                      };
                      const view = planeViewMap[mode.planeId] || "top";
                      viewerActions.setView(view as any);
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
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className="floating-toolbar-button disabled"
                  render={<button aria-label="Plane" disabled />}
                >
                  <PlaneIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={6}>
                    <Tooltip.Popup className="floating-toolbar-tooltip">
                      Plane (coming soon)
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
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
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`floating-toolbar-button ${!canExport ? "disabled" : ""} ${isExporting ? "loading" : ""}`}
              onClick={handleExportStl}
              render={<button aria-label="Export STL" disabled={!canExport} />}
            >
              <ExportIcon />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="top" sideOffset={6}>
                <Tooltip.Popup className="floating-toolbar-tooltip">
                  {isExporting
                    ? "Exporting..."
                    : canExport
                      ? "Export STL"
                      : "Export STL (no bodies)"}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );
};

export default FloatingToolbar;
