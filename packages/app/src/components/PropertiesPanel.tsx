import React from 'react';
import './PropertiesPanel.css';

const PropertiesPanel: React.FC = () => {
  return (
    <div className="properties-panel">
      <div className="properties-panel-header">
        <h3>Properties</h3>
      </div>
      <div className="properties-panel-content">
        <div className="properties-panel-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <p className="properties-panel-empty-title">No selection</p>
          <p className="properties-panel-empty-hint">
            Select a feature or geometry element to view and edit its properties.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
