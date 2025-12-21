import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useDocument } from '../contexts/DocumentContext';
import { useSketch } from '../contexts/SketchContext';
import { useKernel } from '../contexts/KernelContext';
import { useViewer } from '../contexts/ViewerContext';
import type { DocumentUnits } from '../types/document';
import './StatusBar.css';

interface StatusBarProps {
  status?: string;
}

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const AutoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" />
  </svg>
);

// View mode icons
const PerspectiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2l8 4v12l-8 4-8-4V6l8-4z" />
    <path d="M12 22V10M12 10L4 6M12 10l8-4" />
  </svg>
);

const OrthographicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="16" height="16" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const WireframeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
    <path d="M12 21V12M3 8l9 4 9-4" />
  </svg>
);

const ShadedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" />
  </svg>
);

const UNIT_OPTIONS: DocumentUnits[] = ['mm', 'cm', 'm', 'in', 'ft'];

const StatusBar: React.FC<StatusBarProps> = ({ status }) => {
  const { mode, cycleMode } = useTheme();
  const { units, setUnits } = useDocument();
  const { mode: sketchMode, sketchMousePos } = useSketch();
  const { sketchSolveInfo, isRebuilding, errors } = useKernel();
  const { state: viewerState, actions: viewerActions } = useViewer();

  const getThemeIcon = () => {
    switch (mode) {
      case 'light': return <SunIcon />;
      case 'dark': return <MoonIcon />;
      case 'auto': return <AutoIcon />;
    }
  };

  const getThemeLabel = () => {
    switch (mode) {
      case 'light': return 'Light mode (click for dark)';
      case 'dark': return 'Dark mode (click for auto)';
      case 'auto': return 'Auto mode (click for light)';
    }
  };

  const handleUnitsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUnits(e.target.value as DocumentUnits);
  };

  // Get actual status
  const getStatus = () => {
    if (status) return status;
    if (isRebuilding) return 'Rebuilding...';
    if (errors.length > 0) return `${errors.length} error${errors.length > 1 ? 's' : ''}`;
    if (sketchMode.active) return 'Editing Sketch';
    return 'Ready';
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
    return 'X: 0.00 Y: 0.00 Z: 0.00';
  };

  const solveStatus = getSolveStatus();
  const currentStatus = getStatus();

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className={`status-bar-text ${errors.length > 0 ? 'status-error' : ''}`}>
          {currentStatus}
        </span>
        {solveStatus && (
          <span className="status-bar-solve">{solveStatus}</span>
        )}
      </div>
      <div className="status-bar-right">
        <span className="status-bar-coordinates">{getCoordinates()}</span>
        
        {/* Display mode buttons */}
        <div className="status-bar-view-controls">
          <button 
            className={`status-bar-button ${viewerState.projectionMode === 'orthographic' ? 'active' : ''}`}
            onClick={() => viewerActions.toggleProjection()}
            title={viewerState.projectionMode === 'perspective' ? 'Switch to Orthographic' : 'Switch to Perspective'}
          >
            {viewerState.projectionMode === 'perspective' ? <PerspectiveIcon /> : <OrthographicIcon />}
          </button>
          <button 
            className={`status-bar-button ${viewerState.displayMode === 'wireframe' ? 'active' : ''}`}
            onClick={() => viewerActions.setDisplayMode(viewerState.displayMode === 'wireframe' ? 'shaded' : 'wireframe')}
            title={viewerState.displayMode === 'wireframe' ? 'Switch to Shaded' : 'Switch to Wireframe'}
          >
            {viewerState.displayMode === 'wireframe' ? <WireframeIcon /> : <ShadedIcon />}
          </button>
        </div>
        
        <select 
          className="status-bar-units"
          value={units}
          onChange={handleUnitsChange}
          title="Document units"
        >
          {UNIT_OPTIONS.map(unit => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
        <button 
          className="status-bar-button" 
          onClick={cycleMode}
          aria-label={getThemeLabel()}
          title={getThemeLabel()}
        >
          {getThemeIcon()}
        </button>
      </div>
    </div>
  );
};

export default StatusBar;
