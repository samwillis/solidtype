import React from 'react';
import { useTsAnalysis } from '../hooks/useTsAnalysis';
import './ProblemsPanel.css';

const ProblemsPanel: React.FC = () => {
  const { diagnostics, isLoading, error } = useTsAnalysis();

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
              key={index}
              className={`problem-item ${getSeverityClass(diagnostic.category)}`}
              title={diagnostic.message}
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
