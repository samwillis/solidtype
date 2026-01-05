/**
 * UserCursor2D - Displays a 2D cursor overlay for the user being followed
 *
 * When following another user and they're not hovering over the 3D model,
 * this component shows their cursor position as a 2D overlay.
 */

import { useMemo } from "react";
import type { UserAwarenessState } from "../../lib/awareness-state";
import "./UserCursor2D.css";

interface UserCursor2DProps {
  /** The user being followed */
  followedUser: UserAwarenessState | null;
  /** Container dimensions for positioning */
  containerRef: React.RefObject<HTMLDivElement>;
}

export function UserCursor2D({ followedUser, containerRef }: UserCursor2DProps) {
  /* eslint-disable react-hooks/refs -- reading container dimensions is safe during render */
  const cursorStyle = useMemo(() => {
    if (!followedUser?.cursor2D?.visible || !containerRef.current) {
      return null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = followedUser.cursor2D.x * rect.width;
    const y = followedUser.cursor2D.y * rect.height;

    return {
      left: `${x}px`,
      top: `${y}px`,
      "--cursor-color": followedUser.user.color,
    } as React.CSSProperties;
  }, [followedUser, containerRef]);
  /* eslint-enable react-hooks/refs */

  // Don't render if no cursor data or if 3D cursor is visible
  if (!cursorStyle || followedUser?.cursor3D?.visible) {
    return null;
  }

  return (
    <div className="user-cursor-2d" style={cursorStyle}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35z"
          fill="var(--cursor-color)"
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
      <span className="user-cursor-2d-label">{followedUser?.user.name}</span>
    </div>
  );
}
