import React, { useMemo } from 'react';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import { useKernel } from '../contexts/KernelContext';
import './StatusOverlay.css';

interface StatusOverlayProps {
  status?: string;
}

const StatusOverlay: React.FC<StatusOverlayProps> = ({ status }) => {
  const { units } = useDocument();
  const { mode: sketchMode, sketchMousePos } = useSketch();
  const { sketchSolveInfo, isRebuilding, errors } = useKernel();

  // Get actual status
  const getStatus = () => {
    if (status) return status;
    if (isRebuilding) return 'Rebuilding...';
    if (errors.length > 0) return `${errors.length} error${errors.length > 1 ? 's' : ''}`;
    if (sketchMode.active) return 'Editing Sketch';
    return null; // Don't show "Ready" - only show when there's something to show
  };

  // Get solve status for active sketch
  const getSolveStatus = () => {
    if (!sketchMode.active || !sketchMode.sketchId) return null;
    const info = sketchSolveInfo[sketchMode.sketchId];
    if (!info) return null;
    
    const dof = info.dof;
    if (!dof) return `Solve: ${info.status}`;
    
    const tag = dof.isOverConstrained
      ? 'Over'
      : dof.isFullyConstrained
        ? 'Fully'
        : `DOF ${dof.remainingDOF}`;
    return `Solve: ${info.status} • ${tag}`;
  };

  // Format coordinates
  const getCoordinates = () => {
    if (sketchMode.active && sketchMousePos) {
      return `X: ${sketchMousePos.x.toFixed(2)} Y: ${sketchMousePos.y.toFixed(2)} ${units}`;
    }
    return null;
  };

  const currentStatus = getStatus();
  const solveStatus = getSolveStatus();
  const coordinates = getCoordinates();

  // Only render if there's something to show
  if (!currentStatus && !solveStatus && !coordinates) {
    return null;
  }

  return (
    <div className="status-overlay">
      {currentStatus && (
        <div className={`status-overlay-item ${errors.length > 0 ? 'status-error' : ''}`}>
          {currentStatus}
        </div>
      )}
      {solveStatus && (
        <div className="status-overlay-item status-solve">
          {solveStatus}
        </div>
      )}
      {coordinates && (
        <div className="status-overlay-item status-coordinates">
          {coordinates}
        </div>
      )}
    </div>
  );
};

export default StatusOverlay;
