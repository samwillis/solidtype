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
          <p>No selection</p>
          <p className="properties-panel-hint">
            Select a feature or geometry to edit properties.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
