/**
 * Shared toolbar components used by main toolbar and sketch toolbar
 */

import React from "react";
import { Tooltip, Separator } from "@base-ui/react";
import "./ToolbarComponents.css";

// ============================================================================
// ToolbarButton - Icon button with tooltip
// ============================================================================

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon,
  label,
  tooltip,
  onClick,
  disabled = false,
  active = false,
  className = "",
}) => {
  const buttonClass = `toolbar-button ${active ? "active" : ""} ${disabled ? "disabled" : ""} ${className}`;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={300}
        className={buttonClass}
        onClick={disabled ? undefined : onClick}
        render={<button aria-label={label} disabled={disabled} />}
      >
        {icon}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" sideOffset={6}>
          <Tooltip.Popup className="toolbar-tooltip">{tooltip || label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

// ============================================================================
// ToolbarSeparator - Vertical divider between button groups
// ============================================================================

export const ToolbarSeparator: React.FC = () => {
  return <Separator orientation="vertical" className="toolbar-separator" />;
};

// ============================================================================
// ToolbarGroup - Container for grouping buttons
// ============================================================================

interface ToolbarGroupProps {
  children: React.ReactNode;
  className?: string;
}

export const ToolbarGroup: React.FC<ToolbarGroupProps> = ({ children, className = "" }) => {
  return <div className={`toolbar-group ${className}`}>{children}</div>;
};
