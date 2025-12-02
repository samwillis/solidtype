import React from 'react';
import './FeatureTree.css';

const FeatureTree: React.FC = () => {
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
};

export default FeatureTree;
