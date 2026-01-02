import React from "react";
import { useSketch } from "../contexts/SketchContext";
import { useDocument } from "../contexts/DocumentContext";
import { useKernel } from "../contexts/KernelContext";
import "./StatusOverlay.css";

interface StatusOverlayProps {
  status?: string;
}

const StatusOverlay: React.FC<StatusOverlayProps> = ({ status }) => {
  const { units, syncStatus, isCloudDocument } = useDocument();
  const { mode: sketchMode, sketchMousePos } = useSketch();
  const { isRebuilding, errors } = useKernel();

  // Format coordinates
  const getCoordinates = () => {
    if (sketchMode.active && sketchMousePos) {
      return `${sketchMousePos.x.toFixed(2)}, ${sketchMousePos.y.toFixed(2)} ${units}`;
    }
    return null;
  };

  const coordinates = getCoordinates();

  // Determine what to show
  const showConnectionIcon = isCloudDocument;
  const showErrors = errors.length > 0;
  const showRebuilding = isRebuilding;
  const showCoordinates = !!coordinates;
  const showCustomStatus = !!status;

  // Don't render if nothing to show
  if (
    !showConnectionIcon &&
    !showErrors &&
    !showRebuilding &&
    !showCoordinates &&
    !showCustomStatus
  ) {
    return null;
  }

  // Get connection icon class
  const getConnectionClass = () => {
    switch (syncStatus) {
      case "synced":
        return "connected";
      case "connected":
        return "connected";
      case "connecting":
        return "connecting";
      case "error":
        return "error";
      case "disconnected":
        return "offline";
      default:
        return "offline";
    }
  };

  return (
    <div className="status-overlay">
      {/* Connection status icon */}
      {showConnectionIcon && (
        <span className={`status-icon status-icon-${getConnectionClass()}`} title={syncStatus}>
          ●
        </span>
      )}

      {/* Errors */}
      {showErrors && (
        <span className="status-text status-error">
          {errors.length} error{errors.length > 1 ? "s" : ""}
        </span>
      )}

      {/* Rebuilding */}
      {showRebuilding && !showErrors && <span className="status-text">Rebuilding...</span>}

      {/* Custom status */}
      {showCustomStatus && !showRebuilding && !showErrors && (
        <span className="status-text">{status}</span>
      )}

      {/* Coordinates when sketching */}
      {showCoordinates && <span className="status-coords">{coordinates}</span>}
    </div>
  );
};

export default StatusOverlay;
