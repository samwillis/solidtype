import React, { useState } from 'react';
import { Tabs, Tooltip } from '@base-ui/react';
import './Toolbar.css';

// Toolbar tool definition
interface ToolItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

// Toolbar mode (tab) definition
interface ToolbarMode {
  id: string;
  label: string;
  tools: ToolItem[];
}

// SVG Icons as simple components
const SketchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

const ExtrudeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2v10" />
    <path d="M5 12l7-4 7 4" />
    <path d="M5 12v6l7 4 7-4v-6" />
  </svg>
);

const RevolveIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 11-9-9" />
    <path d="M12 3v9l5 5" />
  </svg>
);

const BoxIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CylinderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 5v14a9 3 0 01-18 0V5" />
  </svg>
);

const BooleanIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="9" r="6" />
    <circle cx="15" cy="15" r="6" />
  </svg>
);

const LineIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="19" x2="19" y2="5" />
  </svg>
);

const ArcIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 17a9 9 0 0114 0" />
  </svg>
);

const RectangleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
  </svg>
);

const CircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const DimensionIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 8h18" />
    <path d="M3 16h18" />
    <path d="M8 3v18" />
    <path d="M16 3v18" />
  </svg>
);

const ConstraintIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const FilletIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 19h8a8 8 0 008-8V3" />
  </svg>
);

const ChamferIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 19h8l8-8V3" />
  </svg>
);

const PlaneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4l16 8-16 8z" />
  </svg>
);

// Define toolbar modes with their tools
const toolbarModes: ToolbarMode[] = [
  {
    id: 'features',
    label: 'Features',
    tools: [
      { id: 'extrude', label: 'Extrude', icon: <ExtrudeIcon /> },
      { id: 'revolve', label: 'Revolve', icon: <RevolveIcon /> },
      { id: 'fillet', label: 'Fillet', icon: <FilletIcon />, disabled: true },
      { id: 'chamfer', label: 'Chamfer', icon: <ChamferIcon />, disabled: true },
      { id: 'boolean', label: 'Boolean', icon: <BooleanIcon />, disabled: true },
    ],
  },
  {
    id: 'sketch',
    label: 'Sketch',
    tools: [
      { id: 'new-sketch', label: 'New Sketch', icon: <SketchIcon /> },
      { id: 'line', label: 'Line', icon: <LineIcon />, disabled: true },
      { id: 'arc', label: 'Arc', icon: <ArcIcon />, disabled: true },
      { id: 'rectangle', label: 'Rectangle', icon: <RectangleIcon />, disabled: true },
      { id: 'circle', label: 'Circle', icon: <CircleIcon />, disabled: true },
      { id: 'dimension', label: 'Dimension', icon: <DimensionIcon />, disabled: true },
      { id: 'constraint', label: 'Constraint', icon: <ConstraintIcon />, disabled: true },
    ],
  },
  {
    id: 'primitives',
    label: 'Primitives',
    tools: [
      { id: 'box', label: 'Box', icon: <BoxIcon /> },
      { id: 'cylinder', label: 'Cylinder', icon: <CylinderIcon />, disabled: true },
      { id: 'plane', label: 'Plane', icon: <PlaneIcon />, disabled: true },
    ],
  },
];

interface ToolButtonProps {
  tool: ToolItem;
}

const ToolButton: React.FC<ToolButtonProps> = ({ tool }) => {
  const button = (
    <button
      className={`toolbar-tool-button ${tool.disabled ? 'disabled' : ''}`}
      onClick={tool.onClick}
      disabled={tool.disabled}
      aria-label={tool.label}
    >
      {tool.icon}
      <span className="toolbar-tool-label">{tool.label}</span>
    </button>
  );

  if (tool.disabled) {
    return button;
  }

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger render={button} />
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={8}>
            <Tooltip.Popup className="toolbar-tooltip">
              {tool.label}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

const Toolbar: React.FC = () => {
  const [activeMode, setActiveMode] = useState<string>('features');

  return (
    <div className="toolbar">
      <Tabs.Root
        value={activeMode}
        onValueChange={(value) => setActiveMode(value)}
        className="toolbar-tabs"
      >
        <Tabs.List className="toolbar-tabs-list">
          {toolbarModes.map((mode) => (
            <Tabs.Tab
              key={mode.id}
              value={mode.id}
              className="toolbar-tabs-trigger"
            >
              {mode.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        
        <div className="toolbar-content">
          {toolbarModes.map((mode) => (
            <Tabs.Panel key={mode.id} value={mode.id} className="toolbar-panel">
              <div className="toolbar-tools">
                {mode.tools.map((tool) => (
                  <ToolButton key={tool.id} tool={tool} />
                ))}
              </div>
            </Tabs.Panel>
          ))}
        </div>
      </Tabs.Root>
    </div>
  );
};

export default Toolbar;
