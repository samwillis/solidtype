import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSketch } from "../contexts/SketchContext";
import FeatureTree from "./FeatureTree";
import "./FloatingFeatureTreePanel.css";
import logo from "../../../../../artwork/colour-icon-bold.svg";

const FloatingFeatureTreePanel: React.FC = () => {
  const { mode: sketchMode } = useSketch();
  const [isExpanded, setIsExpanded] = useState(true);

  const isDisabled = sketchMode.active;

  return (
    <div
      className={`floating-feature-tree-panel ${isDisabled ? "disabled" : ""} ${isExpanded ? "expanded" : "collapsed"}`}
    >
      <div className="floating-feature-tree-panel-header">
        <Link to="/" className="floating-feature-tree-panel-logo">
          <img src={logo} alt="SolidType" className="floating-feature-tree-logo" />
        </Link>
        <button
          className="floating-feature-tree-panel-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          title={isExpanded ? "Collapse" : "Expand"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {isExpanded ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
          </svg>
        </button>
      </div>
      {isExpanded && (
        <div className="floating-feature-tree-panel-content">
          <FeatureTree />
        </div>
      )}
    </div>
  );
};

export default FloatingFeatureTreePanel;
