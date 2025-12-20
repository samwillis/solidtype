import React from 'react';
import './FeatureTree.css';

// Feature item type
interface Feature {
  id: string;
  name: string;
  type: 'sketch' | 'extrude' | 'revolve' | 'boolean' | 'primitive';
  suppressed?: boolean;
}

// Placeholder features for demo
const placeholderFeatures: Feature[] = [];

// Feature type icons
const FeatureIcon: React.FC<{ type: Feature['type'] }> = ({ type }) => {
  const iconClass = `feature-icon feature-icon-${type}`;
  
  switch (type) {
    case 'sketch':
      return (
        <svg className={iconClass} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        </svg>
      );
    case 'extrude':
      return (
        <svg className={iconClass} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2v10" />
          <path d="M5 12l7-4 7 4" />
          <path d="M5 12v6l7 4 7-4v-6" />
        </svg>
      );
    case 'revolve':
      return (
        <svg className={iconClass} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 12a9 9 0 11-9-9" />
          <path d="M12 3v9l5 5" />
        </svg>
      );
    case 'boolean':
      return (
        <svg className={iconClass} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="9" cy="9" r="6" />
          <circle cx="15" cy="15" r="6" />
        </svg>
      );
    case 'primitive':
      return (
        <svg className={iconClass} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        </svg>
      );
    default:
      return null;
  }
};

const FeatureTree: React.FC = () => {
  if (placeholderFeatures.length === 0) {
    return (
      <div className="feature-tree">
        <div className="panel-header">Feature Tree</div>
        <div className="feature-tree-content">
          <div className="feature-tree-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <p className="empty-title">No features</p>
            <p className="empty-hint">Use toolbar to add features</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="feature-tree">
      <div className="panel-header">Feature Tree</div>
      <div className="feature-tree-content">
        <ul className="feature-tree-list">
          {placeholderFeatures.map((feature) => (
            <li
              key={feature.id}
              className={`feature-tree-item ${feature.suppressed ? 'suppressed' : ''}`}
            >
              <FeatureIcon type={feature.type} />
              <span className="feature-tree-item-name">{feature.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default FeatureTree;
