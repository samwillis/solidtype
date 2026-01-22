import React from "react";
import { Tooltip } from "@base-ui/react";
import { Menu } from "@base-ui/react/menu";
import { ToolbarButton } from "./ToolbarButton";
import {
  SketchIcon,
  PlaneIcon,
  AxisIcon,
  ExtrudeIcon,
  RevolveIcon,
  BooleanIcon,
  UnionIcon,
  SubtractIcon,
  IntersectIcon,
  ChevronDownIcon,
} from "../Icons";

export interface FeatureModeToolsProps {
  // Sketch creation
  canStartSketch: boolean;
  onNewSketch: () => void;
  sketchTooltip: string;

  // Plane creation
  canCreatePlane: boolean;
  onCreatePlane: () => void;
  planeTooltip: string;

  // Axis creation
  canCreateAxis: boolean;
  onCreateAxis: () => void;
  onAddAxis: (definition: { kind: "datum"; role: "x" | "y" | "z" }) => void;

  // Extrude
  canExtrude: boolean;
  onExtrude: () => void;
  extrudeTooltip: string;

  // Revolve
  canRevolve: boolean;
  onRevolve: () => void;
  revolveTooltip: string;

  // Boolean
  canBoolean: boolean;
  onBoolean: (operation: "union" | "subtract" | "intersect") => void;
}

/**
 * FeatureModeTools - Feature creation tools for the toolbar
 *
 * Contains:
 * - Sketch/Plane/Axis creation buttons
 * - Extrude/Revolve buttons
 * - Boolean dropdown
 */
export const FeatureModeTools: React.FC<FeatureModeToolsProps> = ({
  canStartSketch,
  onNewSketch,
  sketchTooltip,
  canCreatePlane,
  onCreatePlane,
  planeTooltip,
  onCreateAxis,
  canCreateAxis,
  onAddAxis,
  canExtrude,
  onExtrude,
  extrudeTooltip,
  canRevolve,
  onRevolve,
  revolveTooltip,
  canBoolean,
  onBoolean,
}) => {
  return (
    <>
      {/* Sketch, Plane, Axis creation */}
      <div className="floating-toolbar-group">
        <ToolbarButton
          icon={<SketchIcon />}
          label="New Sketch"
          tooltip={sketchTooltip}
          onClick={onNewSketch}
          disabled={!canStartSketch}
        />
        <ToolbarButton
          icon={<PlaneIcon />}
          label="Plane"
          tooltip={planeTooltip}
          onClick={onCreatePlane}
          disabled={!canCreatePlane}
        />

        {/* Axis Creation Dropdown */}
        <Menu.Root>
          <Menu.Trigger
            className={`floating-toolbar-button floating-toolbar-dropdown-button ${
              !canCreateAxis ? "disabled" : ""
            }`}
            aria-label="Add Axis"
            disabled={!canCreateAxis}
          >
            <AxisIcon />
            <ChevronDownIcon />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup className="floating-toolbar-dropdown-menu">
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  onClick={onCreateAxis}
                  disabled={!canCreateAxis}
                >
                  Axis Tool...
                </Menu.Item>
                <Menu.Separator className="floating-toolbar-dropdown-separator" />
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  onClick={() => onAddAxis({ kind: "datum", role: "x" })}
                  disabled={!canCreateAxis}
                >
                  X Axis (datum)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  onClick={() => onAddAxis({ kind: "datum", role: "y" })}
                  disabled={!canCreateAxis}
                >
                  Y Axis (datum)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  onClick={() => onAddAxis({ kind: "datum", role: "z" })}
                  disabled={!canCreateAxis}
                >
                  Z Axis (datum)
                </Menu.Item>
                <Menu.Separator className="floating-toolbar-dropdown-separator" />
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  disabled
                  onClick={() => {
                    /* TODO: implement edge selection */
                  }}
                >
                  Along Edge (select edge)
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  disabled
                  onClick={() => {
                    /* TODO: implement two-point selection */
                  }}
                >
                  Between Two Points
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  disabled
                  onClick={() => {
                    /* TODO: implement sketch line selection */
                  }}
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
        <ToolbarButton
          icon={<ExtrudeIcon />}
          label="Extrude"
          tooltip={extrudeTooltip}
          onClick={onExtrude}
          disabled={!canExtrude}
        />
        <ToolbarButton
          icon={<RevolveIcon />}
          label="Revolve"
          tooltip={revolveTooltip}
          onClick={onRevolve}
          disabled={!canRevolve}
        />

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
                  onClick={() => onBoolean("union")}
                >
                  <UnionIcon />
                  <span>Union</span>
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  onClick={() => onBoolean("subtract")}
                >
                  <SubtractIcon />
                  <span>Subtract</span>
                </Menu.Item>
                <Menu.Item
                  className="floating-toolbar-dropdown-item"
                  onClick={() => onBoolean("intersect")}
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
  );
};
