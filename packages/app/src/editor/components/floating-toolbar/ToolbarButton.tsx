import React from "react";
import { Tooltip } from "@base-ui/react";

export interface ToolbarButtonProps {
  /** Icon element to display */
  icon: React.ReactNode;
  /** Accessible label for the button */
  label: string;
  /** Tooltip text (defaults to label if not provided) */
  tooltip?: string;
  /** Click handler */
  onClick?: () => void;
  /** Whether the button is in an active/selected state */
  active?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * ToolbarButton - A reusable toolbar button with tooltip
 *
 * Wraps the common pattern of Tooltip.Root > Tooltip.Trigger > button
 * used throughout the FloatingToolbar.
 */
export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon,
  label,
  tooltip,
  onClick,
  active = false,
  disabled = false,
  className = "",
}) => {
  const buttonClasses = [
    "floating-toolbar-button",
    active ? "active" : "",
    disabled ? "disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={300}
        className={buttonClasses}
        onClick={onClick}
        render={<button aria-label={label} disabled={disabled} />}
      >
        {icon}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6}>
          <Tooltip.Popup className="floating-toolbar-tooltip">{tooltip || label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};
