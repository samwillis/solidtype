import React from "react";
import { ToolbarButton } from "./ToolbarButton";
import { UndoIcon, RedoIcon } from "../Icons";

export interface UndoRedoGroupProps {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * UndoRedoGroup - Undo and Redo buttons for the toolbar
 */
export const UndoRedoGroup: React.FC<UndoRedoGroupProps> = ({ undo, redo, canUndo, canRedo }) => {
  return (
    <div className="floating-toolbar-group">
      <ToolbarButton icon={<UndoIcon />} label="Undo" onClick={undo} disabled={!canUndo} />
      <ToolbarButton icon={<RedoIcon />} label="Redo" onClick={redo} disabled={!canRedo} />
    </div>
  );
};
