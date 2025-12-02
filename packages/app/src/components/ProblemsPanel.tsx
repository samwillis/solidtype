import React from 'react';
import { useTsAnalysis } from '../hooks/useTsAnalysis';
import { useActiveFileContext } from '../contexts/ActiveFileContext';
import type { TsDiagnostic } from '../workers/ts-worker.types';
import './ProblemsPanel.css';

interface ProblemsPanelProps {
  onNavigateToError?: (diagnostic: TsDiagnostic) => void;
}

const ProblemsPanel: React.FC<ProblemsPanelProps> = ({ onNavigateToError }) => {
  const { diagnostics, isLoading, error } = useTsAnalysis();
  const { setActiveFilename } = useActiveFileContext();

  const handleProblemClick = (diagnostic: TsDiagnostic) => {
    // Navigate to the file if it's different from current
    if (diagnostic.file) {
      setActiveFilename(diagnostic.file);
    }
    
    // Wait a bit for file to load, then navigate to position
    setTimeout(() => {
      const navigateFn = (window as any).__codeEditorNavigateToError;
      if (navigateFn) {
        navigateFn(diagnostic);
      }
    }, 100);
    
    // Call custom navigation handler if provided
    if (onNavigateToError) {
      onNavigateToError(diagnostic);
    }
  };

  // Generate stable key for diagnostic
  const getDiagnosticKey = (diagnostic: TsDiagnostic, index: number): string => {
    if (diagnostic.file && diagnostic.start) {
      return `${diagnostic.file}-${diagnostic.start.line}-${diagnostic.start.column}-${diagnostic.code || index}`;
    }
    return `diagnostic-${index}-${diagnostic.message.slice(0, 20)}`;
  };

  const getIcon = (category: string) => {
    switch (category) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'suggestion':
        return '💡';
      default:
        return 'ℹ️';
    }
  };

  const getSeverityClass = (category: string) => {
    switch (category) {
      case 'error':
        return 'problem-error';
      case 'warning':
        return 'problem-warning';
      case 'suggestion':
        return 'problem-suggestion';
      default:
        return 'problem-message';
    }
  };

  if (error) {
    return (
      <div className="problems-panel">
        <div className="problems-panel-header">
          <h3>Problems</h3>
        </div>
        <div className="problems-panel-content">
          <div className="problem-item problem-error">
            <span className="problem-icon">❌</span>
            <span className="problem-message">{error.message}</span>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="problems-panel">
        <div className="problems-panel-header">
          <h3>Problems</h3>
        </div>
        <div className="problems-panel-content">
          <div className="problems-loading">Analyzing...</div>
        </div>
      </div>
    );
  }

  if (diagnostics.length === 0) {
    return (
      <div className="problems-panel">
        <div className="problems-panel-header">
          <h3>Problems</h3>
        </div>
        <div className="problems-panel-content">
          <div className="problems-empty">No problems found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="problems-panel">
      <div className="problems-panel-header">
        <h3>Problems ({diagnostics.length})</h3>
      </div>
      <div className="problems-panel-content">
        <div className="problems-list">
          {diagnostics.map((diagnostic, index) => (
            <div
              key={getDiagnosticKey(diagnostic, index)}
              className={`problem-item ${getSeverityClass(diagnostic.category)}`}
              title={diagnostic.message}
              onClick={() => handleProblemClick(diagnostic)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleProblemClick(diagnostic);
                }
              }}
            >
              <span className="problem-icon">{getIcon(diagnostic.category)}</span>
              <div className="problem-details">
                {diagnostic.file && (
                  <div className="problem-file">{diagnostic.file}</div>
                )}
                {diagnostic.start && (
                  <div className="problem-location">
                    {diagnostic.start.line}:{diagnostic.start.column}
                    {diagnostic.end &&
                      diagnostic.end.line !== diagnostic.start.line &&
                      ` - ${diagnostic.end.line}:${diagnostic.end.column}`}
                  </div>
                )}
                <div className="problem-message">{diagnostic.message}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProblemsPanel;
