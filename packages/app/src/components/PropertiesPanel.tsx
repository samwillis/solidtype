import React from 'react';
import './PropertiesPanel.css';

const PropertiesPanel: React.FC = () => {
  return (
    <div className="properties-panel">
      <div className="panel-header">Properties</div>
      <div className="properties-panel-content">
        <div className="properties-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <p className="empty-title">No selection</p>
          <p className="empty-hint">Select to edit properties</p>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
