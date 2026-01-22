import React, { useCallback } from "react";
import { Tooltip } from "@base-ui/react";
import { Menu } from "@base-ui/react/menu";
import { ToolbarButton } from "./ToolbarButton";
import {
  SelectIcon,
  PointIcon,
  LineIcon,
  ArcIcon,
  CircleIcon,
  RectangleIcon,
  ConstraintsIcon,
  ChevronDownIcon,
  OptionsIcon,
  NormalViewIcon,
  CheckIcon,
  CloseIcon,
} from "../Icons";
import type { SketchTool, ConstraintType } from "../../contexts/SketchContext";

export interface SketchModeToolsProps {
  // Tool state
  activeTool: SketchTool;
  setTool: (tool: SketchTool) => void;

  // Sketch actions
  finishSketch: () => void;
  cancelSketch: () => void;

  // Constraints
  canApplyConstraint: (type: ConstraintType) => boolean;
  applyConstraint: (type: ConstraintType) => void;

  // Construction mode
  hasSelectedEntities: () => boolean;
  toggleConstruction: () => void;

  // Viewer state
  snapToGrid: boolean;
  gridSize: number;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;

  // Normal view
  onNormalView: () => void;
}

/**
 * SketchModeTools - All sketch mode tools and actions
 *
 * Contains:
 * - Basic tools (Select, Point, Line)
 * - Flyout menus (Arc, Circle, Rectangle)
 * - Constraints dropdown
 * - Construction toggle + Options menu
 * - Accept/Cancel actions
 */
export const SketchModeTools: React.FC<SketchModeToolsProps> = ({
  activeTool,
  setTool,
  finishSketch,
  cancelSketch,
  canApplyConstraint,
  applyConstraint,
  hasSelectedEntities,
  toggleConstruction,
  snapToGrid,
  gridSize,
  toggleSnapToGrid,
  setGridSize,
  onNormalView,
}) => {
  // Toggle tool - clicking an active tool toggles it off
  const toggleTool = useCallback(
    (tool: Exclude<SketchTool, "none">) => {
      if (activeTool === tool) {
        setTool("none");
      } else {
        setTool(tool);
      }
    },
    [activeTool, setTool]
  );

  const isArcActive =
    activeTool === "arc" || activeTool === "arcCenterpoint" || activeTool === "arcTangent";
  const isCircleActive = activeTool === "circle" || activeTool === "circle3Point";
  const isRectangleActive =
    activeTool === "rectangle" ||
    activeTool === "rectangleCenter" ||
    activeTool === "rectangle3Point";
  const isModifyActive = [
    "trim",
    "extend",
    "offset",
    "mirror",
    "fillet",
    "chamfer",
  ].includes(activeTool);

  return (
    <div className="floating-toolbar-group">
      {/* Basic Tools */}
      <ToolbarButton
        icon={<SelectIcon />}
        label="Select"
        onClick={() => toggleTool("select")}
        active={activeTool === "select"}
      />
      <ToolbarButton
        icon={<PointIcon />}
        label="Point"
        onClick={() => toggleTool("point")}
        active={activeTool === "point"}
      />
      <ToolbarButton
        icon={<LineIcon />}
        label="Line"
        onClick={() => toggleTool("line")}
        active={activeTool === "line"}
      />

      {/* Arc Tool with Flyout Menu */}
      <div className="floating-toolbar-button-group">
        <Tooltip.Root>
          <Tooltip.Trigger
            delay={300}
            className={`floating-toolbar-button ${isArcActive ? "active" : ""}`}
            onClick={() =>
              toggleTool(
                activeTool === "arcCenterpoint"
                  ? "arcCenterpoint"
                  : activeTool === "arcTangent"
                    ? "arcTangent"
                    : "arc"
              )
            }
            render={<button aria-label="Arc" />}
          >
            <ArcIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="top" sideOffset={6}>
              <Tooltip.Popup className="floating-toolbar-tooltip">
                {activeTool === "arcCenterpoint"
                  ? "Arc (Centerpoint)"
                  : activeTool === "arcTangent"
                    ? "Arc (Tangent)"
                    : "Arc (3-Point)"}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Menu.Root>
          <Menu.Trigger
            className="floating-toolbar-flyout-trigger"
            render={<button aria-label="Arc options" />}
          >
            <ChevronDownIcon />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup className="floating-toolbar-menu">
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("arc")}>
                  3-Point Arc (Start → End → Bulge)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-menu-item"
                  onClick={() => setTool("arcCenterpoint")}
                >
                  Centerpoint Arc (Center → Start → End)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-menu-item"
                  onClick={() => setTool("arcTangent")}
                >
                  Tangent Arc (Click endpoint, then end)
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {/* Circle Tool with Flyout Menu */}
      <div className="floating-toolbar-button-group">
        <Tooltip.Root>
          <Tooltip.Trigger
            delay={300}
            className={`floating-toolbar-button ${isCircleActive ? "active" : ""}`}
            onClick={() => toggleTool(activeTool === "circle3Point" ? "circle3Point" : "circle")}
            render={<button aria-label="Circle" />}
          >
            <CircleIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="top" sideOffset={6}>
              <Tooltip.Popup className="floating-toolbar-tooltip">
                {activeTool === "circle3Point" ? "Circle (3-Point)" : "Circle (Center)"}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Menu.Root>
          <Menu.Trigger
            className="floating-toolbar-flyout-trigger"
            render={<button aria-label="Circle options" />}
          >
            <ChevronDownIcon />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup className="floating-toolbar-menu">
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("circle")}>
                  Centerpoint Circle (Center → Radius)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-menu-item"
                  onClick={() => setTool("circle3Point")}
                >
                  3-Point Circle
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {/* Rectangle Tool with Flyout Menu */}
      <div className="floating-toolbar-button-group">
        <Tooltip.Root>
          <Tooltip.Trigger
            delay={300}
            className={`floating-toolbar-button ${isRectangleActive ? "active" : ""}`}
            onClick={() =>
              toggleTool(
                activeTool === "rectangleCenter"
                  ? "rectangleCenter"
                  : activeTool === "rectangle3Point"
                    ? "rectangle3Point"
                    : "rectangle"
              )
            }
            render={<button aria-label="Rectangle" />}
          >
            <RectangleIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="top" sideOffset={6}>
              <Tooltip.Popup className="floating-toolbar-tooltip">
                {activeTool === "rectangleCenter"
                  ? "Rectangle (Center)"
                  : activeTool === "rectangle3Point"
                    ? "Rectangle (3-Point)"
                    : "Rectangle (Corner)"}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Menu.Root>
          <Menu.Trigger
            className="floating-toolbar-flyout-trigger"
            render={<button aria-label="Rectangle options" />}
          >
            <ChevronDownIcon />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup className="floating-toolbar-menu">
                <Menu.Item
                  className="floating-toolbar-menu-item"
                  onClick={() => setTool("rectangle")}
                >
                  Corner Rectangle (Click two corners)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-menu-item"
                  onClick={() => setTool("rectangleCenter")}
                >
                  Center Rectangle (Click center, then corner)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-menu-item"
                  onClick={() => setTool("rectangle3Point")}
                >
                  3-Point Rectangle (Edge + Width, any angle)
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {/* Modify Tools Menu */}
      <div className="floating-toolbar-button-group">
        <Tooltip.Root>
          <Tooltip.Trigger
            delay={300}
            className={`floating-toolbar-button ${isModifyActive ? "active" : ""}`}
            onClick={() => toggleTool("trim")}
            render={<button aria-label="Modify tools" />}
          >
            <OptionsIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="top" sideOffset={6}>
              <Tooltip.Popup className="floating-toolbar-tooltip">Modify</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Menu.Root>
          <Menu.Trigger
            className="floating-toolbar-flyout-trigger"
            render={<button aria-label="Modify options" />}
          >
            <ChevronDownIcon />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup className="floating-toolbar-menu">
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("trim")}>
                  Trim
                </Menu.Item>
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("extend")}>
                  Extend
                </Menu.Item>
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("offset")}>
                  Offset
                </Menu.Item>
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("mirror")}>
                  Mirror
                </Menu.Item>
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("fillet")}>
                  Fillet
                </Menu.Item>
                <Menu.Item className="floating-toolbar-menu-item" onClick={() => setTool("chamfer")}>
                  Chamfer
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

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
      <ToolbarButton
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="4 2" />
          </svg>
        }
        label="Toggle Construction"
        tooltip="Toggle Construction (X)"
        onClick={() => hasSelectedEntities() && toggleConstruction()}
        disabled={!hasSelectedEntities()}
      />

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
              <Menu.Item className="floating-toolbar-dropdown-item" onClick={toggleSnapToGrid}>
                {snapToGrid && <CheckIcon />} Snap to Grid (G)
              </Menu.Item>
              <Menu.Separator className="floating-toolbar-dropdown-separator" />
              {/* Grid Size options */}
              <div className="floating-toolbar-dropdown-label">Grid Size</div>
              <Menu.Item
                className="floating-toolbar-dropdown-item"
                onClick={() => setGridSize(0.5)}
              >
                {gridSize === 0.5 && <CheckIcon />} 0.5mm
              </Menu.Item>
              <Menu.Item className="floating-toolbar-dropdown-item" onClick={() => setGridSize(1)}>
                {gridSize === 1 && <CheckIcon />} 1mm
              </Menu.Item>
              <Menu.Item className="floating-toolbar-dropdown-item" onClick={() => setGridSize(2)}>
                {gridSize === 2 && <CheckIcon />} 2mm
              </Menu.Item>
              <Menu.Item className="floating-toolbar-dropdown-item" onClick={() => setGridSize(5)}>
                {gridSize === 5 && <CheckIcon />} 5mm
              </Menu.Item>
              <Menu.Item className="floating-toolbar-dropdown-item" onClick={() => setGridSize(10)}>
                {gridSize === 10 && <CheckIcon />} 10mm
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Sketch mode actions: Normal to Sketch, Accept, Cancel */}
      <div className="floating-toolbar-separator" />
      <div className="floating-toolbar-group">
        <ToolbarButton
          icon={<NormalViewIcon />}
          label="Normal to Sketch"
          tooltip="View Normal to Sketch Plane"
          onClick={onNormalView}
        />
        <ToolbarButton
          icon={<CheckIcon />}
          label="Accept Sketch"
          tooltip="Accept Sketch (Ctrl+Enter)"
          onClick={finishSketch}
        />
        <ToolbarButton icon={<CloseIcon />} label="Cancel Sketch" onClick={cancelSketch} />
      </div>
    </div>
  );
};
