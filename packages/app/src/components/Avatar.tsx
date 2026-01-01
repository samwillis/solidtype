/**
 * Reusable Avatar component
 *
 * Displays user initials with a generated background color.
 * Used in dashboard, editor, and presence indicators.
 */

import React from "react";
import { generateAvatarColor, getInitials } from "../lib/user-avatar";

export interface AvatarUser {
  id: string;
  name?: string | null;
  email?: string | null;
  /** Optional override for avatar color */
  color?: string;
}

export interface AvatarProps {
  /** User to display */
  user: AvatarUser;
  /** Size in pixels (default: 24) */
  size?: number;
  /** Font size for initials (default: auto based on size) */
  fontSize?: number;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Whether this avatar is highlighted (e.g., following a user) */
  highlighted?: boolean;
  /** Border color when highlighted */
  highlightColor?: string;
  /** Click handler */
  onClick?: () => void;
  /** Title/tooltip text */
  title?: string;
}

export function Avatar({
  user,
  size = 24,
  fontSize,
  className = "",
  style,
  highlighted = false,
  highlightColor,
  onClick,
  title,
}: AvatarProps) {
  const initials = getInitials(user.name, user.email);
  // Always use user.id for color generation to ensure consistency across all users' views
  const backgroundColor = user.color || generateAvatarColor(user.id);
  const computedFontSize = fontSize ?? Math.round(size * 0.45);

  const avatarStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: "50%",
    backgroundColor,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: computedFontSize,
    fontWeight: 500,
    color: "white",
    cursor: onClick ? "pointer" : "default",
    border: highlighted
      ? `2px solid ${highlightColor || backgroundColor}`
      : "2px solid transparent",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease, transform 0.15s ease",
    ...style,
  };

  const Component = onClick ? "button" : "div";

  return (
    <Component
      className={`avatar ${className}`.trim()}
      style={avatarStyle}
      onClick={onClick}
      title={title}
      aria-label={title || user.name || user.email || "User avatar"}
    >
      {initials}
    </Component>
  );
}

export default Avatar;
