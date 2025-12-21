import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useDocument } from '../contexts/DocumentContext';
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

const UNIT_OPTIONS: DocumentUnits[] = ['mm', 'cm', 'm', 'in', 'ft'];

const StatusBar: React.FC<StatusBarProps> = ({ status = 'Ready' }) => {
  const { mode, cycleMode } = useTheme();
  const { units, setUnits } = useDocument();

  const getIcon = () => {
    switch (mode) {
      case 'light': return <SunIcon />;
      case 'dark': return <MoonIcon />;
      case 'auto': return <AutoIcon />;
    }
  };

  const getLabel = () => {
    switch (mode) {
      case 'light': return 'Light mode (click for dark)';
      case 'dark': return 'Dark mode (click for auto)';
      case 'auto': return 'Auto mode (click for light)';
    }
  };

  const handleUnitsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUnits(e.target.value as DocumentUnits);
  };

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className="status-bar-text">{status}</span>
      </div>
      <div className="status-bar-right">
        <span className="status-bar-coordinates">X: 0.00 Y: 0.00 Z: 0.00</span>
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
          aria-label={getLabel()}
          title={getLabel()}
        >
          {getIcon()}
        </button>
      </div>
    </div>
  );
};

export default StatusBar;
