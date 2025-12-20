import React from 'react';
import './StatusBar.css';

interface StatusBarProps {
  status?: string;
}

const StatusBar: React.FC<StatusBarProps> = ({ status = 'Ready' }) => {
  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className="status-bar-text">{status}</span>
      </div>
      <div className="status-bar-right">
        <span className="status-bar-coordinates">X: 0.00 Y: 0.00 Z: 0.00</span>
      </div>
    </div>
  );
};

export default StatusBar;
