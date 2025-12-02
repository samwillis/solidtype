import React, { useEffect } from 'react';
import { useModelBuild } from '../hooks/useModelBuild';
import { useFeatureSelection } from '../contexts/FeatureSelectionContext';
import type { FeatureCheckpoint } from '@solidtype/dsl';
import './FeatureTree.css';

/**
 * Get an icon for a feature kind
 */
function getFeatureIcon(kind: FeatureCheckpoint['kind']): string {
  switch (kind) {
    case 'Sketch':
      return '📐';
    case 'Extrude':
      return '📦';
    case 'Revolve':
      return '🔄';
    case 'Sweep':
      return '➰';
    case 'Boolean':
      return '🔗';
    case 'Group':
      return '📁';
    default:
      return '◾';
  }
}

interface FeatureItemProps {
  checkpoint: FeatureCheckpoint;
  isSelected: boolean;
  isBreakpoint: boolean;
  hasError: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ 
  checkpoint, 
  isSelected,
  isBreakpoint,
  hasError,
  onClick,
  onDoubleClick,
}) => {
  const icon = getFeatureIcon(checkpoint.kind);
  
  const classNames = [
    'feature-item',
    isSelected ? 'selected' : '',
    isBreakpoint ? 'breakpoint' : '',
    hasError ? 'has-error' : '',
    checkpoint.hasGeometry ? 'has-geometry' : '',
  ].filter(Boolean).join(' ');
  
  return (
    <div 
      className={classNames}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={isBreakpoint ? 'Breakpoint set - double-click to clear' : 'Double-click to set breakpoint'}
    >
      {isBreakpoint && <span className="breakpoint-marker">●</span>}
      <span className="feature-icon">{icon}</span>
      <span className="feature-label">{checkpoint.label}</span>
      {hasError && <span className="error-indicator" title="Has errors">⚠️</span>}
      {checkpoint.hasGeometry && !hasError && (
        <span className="feature-geometry-indicator" title="Has geometry">●</span>
      )}
    </div>
  );
};

const FeatureTree: React.FC = () => {
  const { checkpoints, isBuilding, errors } = useModelBuild();
  const { 
    selectedFeatureId, 
    breakpointFeatureId, 
    selectFeature, 
    setBreakpoint,
    setCheckpoints,
  } = useFeatureSelection();

  // Update checkpoints in context when they change
  useEffect(() => {
    setCheckpoints(checkpoints);
  }, [checkpoints, setCheckpoints]);

  // Build set of feature IDs that have errors
  const errorFeatureIds = new Set<string>(
    errors.filter((e): e is typeof e & { featureId: string } => !!e.featureId).map(e => e.featureId)
  );

  if (isBuilding) {
    return (
      <div className="feature-tree">
        <div className="feature-tree-loading">
          <span className="loading-spinner">⏳</span>
          <span>Building model...</span>
        </div>
      </div>
    );
  }

  if (checkpoints.length === 0) {
    return (
      <div className="feature-tree">
        <div className="feature-tree-empty">
          <p>No features yet.</p>
          <p className="feature-tree-hint">
            Create a model in the code editor to see features here.
          </p>
        </div>
      </div>
    );
  }

  const handleFeatureClick = (featureId: string) => {
    selectFeature(featureId === selectedFeatureId ? null : featureId);
  };

  const handleFeatureDoubleClick = (featureId: string) => {
    // Toggle breakpoint on double-click
    setBreakpoint(featureId === breakpointFeatureId ? null : featureId);
  };

  return (
    <div className="feature-tree">
      <div className="feature-tree-header">
        <span>Features</span>
        <span className="feature-count">{checkpoints.length}</span>
      </div>
      <div className="feature-list">
        {checkpoints.map((checkpoint) => (
          <FeatureItem
            key={checkpoint.id}
            checkpoint={checkpoint}
            isSelected={checkpoint.id === selectedFeatureId}
            isBreakpoint={checkpoint.id === breakpointFeatureId}
            hasError={errorFeatureIds.has(checkpoint.id)}
            onClick={() => handleFeatureClick(checkpoint.id)}
            onDoubleClick={() => handleFeatureDoubleClick(checkpoint.id)}
          />
        ))}
      </div>
      {breakpointFeatureId && (
        <div className="breakpoint-info">
          <span>🔴 Breakpoint at: {checkpoints.find(c => c.id === breakpointFeatureId)?.label}</span>
          <button onClick={() => setBreakpoint(null)} className="clear-breakpoint">
            Clear
          </button>
        </div>
      )}
      {errors.length > 0 && (
        <div className="feature-errors">
          <div className="feature-errors-header">
            ⚠️ {errors.length} {errors.length === 1 ? 'error' : 'errors'}
          </div>
          {errors.map((error, i) => (
            <div key={i} className="feature-error-item">
              {error.featureId && <span className="error-feature">[{error.featureId}]</span>}
              <span className="error-message">{error.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureTree;
