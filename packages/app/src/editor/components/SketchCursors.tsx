/**
 * Sketch Cursors Component
 *
 * Displays other users' cursors in the 2D sketch view.
 * Shows cursor position and user name label.
 */

import React from "react";
import type { UserAwarenessState } from "../../lib/awareness-state";
import "./SketchCursors.css";

interface SketchCursorsProps {
  /** Connected users with sketch state */
  connectedUsers: UserAwarenessState[];
  /** Current sketch ID to filter users */
  sketchId: string;
  /** Transform from sketch coordinates to screen coordinates */
  transformPoint?: (point: [number, number]) => { x: number; y: number };
}

export const SketchCursors: React.FC<SketchCursorsProps> = ({
  connectedUsers,
  sketchId,
  transformPoint,
}) => {
  // Filter to users in the same sketch
  const usersInSketch = connectedUsers.filter(
    (u) => u.sketch?.sketchId === sketchId && u.sketch?.cursorPosition
  );

  if (usersInSketch.length === 0) {
    return null;
  }

  return (
    <svg className="sketch-cursors-overlay" pointerEvents="none">
      {usersInSketch.map((user) => {
        const cursorPos = user.sketch!.cursorPosition;
        const screenPos = transformPoint
          ? transformPoint(cursorPos)
          : { x: cursorPos[0], y: cursorPos[1] };

        return (
          <g
            key={user.user.id}
            transform={`translate(${screenPos.x}, ${screenPos.y})`}
            className="sketch-cursor"
          >
            {/* Cursor arrow */}
            <path
              d="M0 0 L0 16 L4 12 L7 18 L9 17 L6 11 L12 10 Z"
              fill={user.user.color}
              stroke="white"
              strokeWidth={1}
              className="sketch-cursor-arrow"
            />

            {/* User name label */}
            <g transform="translate(14, 8)">
              <rect
                x={0}
                y={-10}
                width={user.user.name.length * 7 + 8}
                height={16}
                rx={3}
                fill={user.user.color}
                className="sketch-cursor-label-bg"
              />
              <text
                x={4}
                y={2}
                fill="white"
                fontSize={11}
                fontWeight={500}
                className="sketch-cursor-label-text"
              >
                {user.user.name}
              </text>
            </g>

            {/* Active tool indicator */}
            {user.sketch?.activeToolId && (
              <circle cx={-4} cy={-4} r={4} fill={user.user.color} stroke="white" strokeWidth={1} />
            )}
          </g>
        );
      })}
    </svg>
  );
};
