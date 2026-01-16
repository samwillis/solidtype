import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { useKeyboardShortcut, ShortcutPriority } from "../contexts/KeyboardShortcutContext";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut: Escape to close dialog
  useKeyboardShortcut({
    id: "confirm-dialog-escape",
    keys: ["Escape"],
    priority: ShortcutPriority.MODAL,
    condition: () => open,
    handler: () => {
      onCancel();
      return true;
    },
    description: "Close dialog",
    category: "Dialog",
    editable: "allow", // Should work even if a field inside the dialog is focused
  });

  if (!open) return null;

  // Use portal to render at document body level, escaping any overflow:hidden containers
  return createPortal(
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div ref={dialogRef} className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-dialog-title">{title}</h3>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-button cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-dialog-button confirm ${danger ? "danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
