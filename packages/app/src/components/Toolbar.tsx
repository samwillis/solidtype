import React, { useState, useMemo } from 'react';
import { Tooltip, Separator } from '@base-ui/react';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import ExtrudeDialog from './ExtrudeDialog';
import './Toolbar.css';

// Toolbar tool definition
interface ToolItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

// SVG Icons as simple components
const SketchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
  </svg>
);

const ExtrudeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2v10" />
    <path d="M5 12l7-4 7 4" />
    <path d="M5 12v6l7 4 7-4v-6" />
  </svg>
);

const RevolveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 12a9 9 0 11-9-9" />
    <path d="M12 3v9l5 5" />
  </svg>
);

const BoxIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CylinderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 5v14a9 3 0 01-18 0V5" />
  </svg>
);

const LineIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="5" y1="19" x2="19" y2="5" />
  </svg>
);

const RectangleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="5" width="18" height="14" rx="2" />
  </svg>
);

const PlaneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 4l16 8-16 8z" />
  </svg>
);

const UndoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H8" />
    <path d="M7 6l-4 4 4 4" />
  </svg>
);

const RedoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h5" />
    <path d="M17 6l4 4-4 4" />
  </svg>
);

const AIIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="8.5" cy="16" r="1.5" fill="currentColor" />
    <circle cx="15.5" cy="16" r="1.5" fill="currentColor" />
    <path d="M12 3v4" />
    <path d="M8 5l4-2 4 2" />
  </svg>
);

// Tool groups
const primitiveTools: ToolItem[] = [
  { id: 'box', label: 'Box', icon: <BoxIcon /> },
  { id: 'cylinder', label: 'Cylinder', icon: <CylinderIcon />, disabled: true },
  { id: 'plane', label: 'Plane', icon: <PlaneIcon />, disabled: true },
];

interface ToolButtonProps {
  tool: ToolItem;
}

const ToolButton: React.FC<ToolButtonProps> = ({ tool }) => {
  // Disabled buttons just render without tooltip
  if (tool.disabled) {
    return (
      <button
        className="toolbar-button disabled"
        onClick={tool.onClick}
        disabled
        aria-label={tool.label}
      >
        {tool.icon}
      </button>
    );
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={300}
        className="toolbar-button"
        onClick={tool.onClick}
        render={<button aria-label={tool.label} />}
      >
        {tool.icon}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" sideOffset={6}>
          <Tooltip.Popup className="toolbar-tooltip">
            {tool.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

interface ToolGroupProps {
  tools: ToolItem[];
}

const ToolGroup: React.FC<ToolGroupProps> = ({ tools }) => (
  <div className="toolbar-group">
    {tools.map((tool) => (
      <ToolButton key={tool.id} tool={tool} />
    ))}
  </div>
);

// Plane selector dialog
interface PlaneSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (planeId: string) => void;
}

const PlaneSelector: React.FC<PlaneSelectorProps> = ({ open, onClose, onSelect }) => {
  if (!open) return null;

  return (
    <div className="plane-selector-overlay" onClick={onClose}>
      <div className="plane-selector-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Select a Plane</h3>
        <div className="plane-selector-options">
          <button onClick={() => onSelect('xy')}>
            <span className="plane-icon plane-xy" />
            XY Plane (Top)
          </button>
          <button onClick={() => onSelect('xz')}>
            <span className="plane-icon plane-xz" />
            XZ Plane (Front)
          </button>
          <button onClick={() => onSelect('yz')}>
            <span className="plane-icon plane-yz" />
            YZ Plane (Right)
          </button>
        </div>
        <button className="plane-selector-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

// Finish Sketch button
const FinishSketchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface ToolbarProps {
  onToggleAIPanel?: () => void;
  aiPanelVisible?: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({ onToggleAIPanel, aiPanelVisible }) => {
  const { mode, startSketch, finishSketch, addRectangle } = useSketch();
  const { undo, redo, canUndo, canRedo, features, addExtrude } = useDocument();
  const [planeSelectorOpen, setPlaneSelectorOpen] = useState(false);
  const [extrudeDialogOpen, setExtrudeDialogOpen] = useState(false);
  const [selectedSketchId, setSelectedSketchId] = useState<string | null>(null);

  // Get available sketches for extrusion
  const sketches = useMemo(() => {
    return features.filter((f) => f.type === 'sketch');
  }, [features]);

  const handleNewSketch = () => {
    setPlaneSelectorOpen(true);
  };

  const handlePlaneSelect = (planeId: string) => {
    startSketch(planeId);
    setPlaneSelectorOpen(false);
  };

  const handleFinishSketch = () => {
    finishSketch();
  };

  const handleAddRectangle = () => {
    // Add a test rectangle at origin
    addRectangle(0, 0, 4, 3);
  };

  const handleExtrude = () => {
    // If there's only one sketch, use it directly
    if (sketches.length === 1) {
      setSelectedSketchId(sketches[0].id);
      setExtrudeDialogOpen(true);
    } else if (sketches.length > 1) {
      // For now, use the last sketch
      // TODO: Add sketch selector
      setSelectedSketchId(sketches[sketches.length - 1].id);
      setExtrudeDialogOpen(true);
    }
  };

  const handleExtrudeConfirm = (distance: number, _direction: 'normal' | 'reverse', op: 'add' | 'cut') => {
    if (selectedSketchId) {
      // TODO: Handle direction when extrude supports it
      addExtrude(selectedSketchId, distance, op);
    }
    setExtrudeDialogOpen(false);
    setSelectedSketchId(null);
  };

  const handleExtrudeCancel = () => {
    setExtrudeDialogOpen(false);
    setSelectedSketchId(null);
  };

  return (
    <Tooltip.Provider>
      <div className="toolbar">
        {/* Logo - Isometric cube inspired by SolidType branding */}
        <div className="toolbar-logo">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            {/* Top face - blue with grid pattern */}
            <path d="M16 4L28 10L16 16L4 10L16 4Z" fill="#3498db"/>
            {/* Grid lines on top */}
            <path d="M10 7L22 13M12 6L24 12M14 5L26 11" stroke="#2980b9" strokeWidth="0.5" opacity="0.6"/>
            <path d="M22 7L10 13M20 6L8 12M18 5L6 11" stroke="#2980b9" strokeWidth="0.5" opacity="0.6"/>
            {/* Left face - blue */}
            <path d="M4 10L16 16V28L4 22V10Z" fill="#2980b9"/>
            {/* Right face - orange */}
            <path d="M28 10L16 16V28L28 22V10Z" fill="#e67e22"/>
            {/* Code brackets on left face </> */}
            <path d="M8 14L6 16.5L8 19" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M12 14L14 16.5L12 19" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M11 13.5L9 19.5" stroke="white" strokeWidth="1" strokeLinecap="round" fill="none"/>
            {/* Code brackets on right face /> */}
            <path d="M20 14L22 16.5L20 19" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M24 14L26 16.5L24 19" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="toolbar-logo-text"><span className="logo-solid">Solid</span><span className="logo-type">Type</span></span>
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        {/* Undo/Redo */}
        <div className="toolbar-group">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`toolbar-button ${!canUndo ? 'disabled' : ''}`}
              onClick={undo}
              render={<button aria-label="Undo" disabled={!canUndo} />}
            >
              <UndoIcon />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="toolbar-tooltip">Undo</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`toolbar-button ${!canRedo ? 'disabled' : ''}`}
              onClick={redo}
              render={<button aria-label="Redo" disabled={!canRedo} />}
            >
              <RedoIcon />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="toolbar-tooltip">Redo</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        {/* Sketch mode indicator and tools */}
        {mode.active ? (
          <div className="toolbar-group">
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className="toolbar-button toolbar-button-finish"
                onClick={handleFinishSketch}
                render={<button aria-label="Finish Sketch" />}
              >
                <FinishSketchIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="bottom" sideOffset={6}>
                  <Tooltip.Popup className="toolbar-tooltip">Finish Sketch</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className="toolbar-button"
                render={<button aria-label="Line" />}
              >
                <LineIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="bottom" sideOffset={6}>
                  <Tooltip.Popup className="toolbar-tooltip">Line</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className="toolbar-button"
                onClick={handleAddRectangle}
                render={<button aria-label="Rectangle" />}
              >
                <RectangleIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="bottom" sideOffset={6}>
                  <Tooltip.Popup className="toolbar-tooltip">Rectangle</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        ) : (
          <>
            {/* Tool groups */}
            <div className="toolbar-group">
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className="toolbar-button"
                  onClick={handleNewSketch}
                  render={<button aria-label="New Sketch" />}
                >
                  <SketchIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="bottom" sideOffset={6}>
                    <Tooltip.Popup className="toolbar-tooltip">New Sketch</Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>
          </>
        )}
        <Separator orientation="vertical" className="toolbar-separator" />

        {/* Feature tools */}
        <div className="toolbar-group">
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className={`toolbar-button ${sketches.length === 0 ? 'disabled' : ''}`}
              onClick={handleExtrude}
              render={<button aria-label="Extrude" disabled={sketches.length === 0} />}
            >
              <ExtrudeIcon />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="toolbar-tooltip">Extrude</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              delay={300}
              className="toolbar-button disabled"
              render={<button aria-label="Revolve" disabled />}
            >
              <RevolveIcon />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom" sideOffset={6}>
                <Tooltip.Popup className="toolbar-tooltip">Revolve</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />
        <ToolGroup tools={primitiveTools} />

        {/* Spacer to push AI button to right */}
        <div className="toolbar-spacer" />

        {/* AI Panel Toggle */}
        <Tooltip.Root>
          <Tooltip.Trigger
            delay={300}
            className={`toolbar-button toolbar-button-ai ${aiPanelVisible ? 'active' : ''}`}
            onClick={onToggleAIPanel}
            render={<button aria-label="Toggle AI Assistant" />}
          >
            <AIIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom" sideOffset={6}>
              <Tooltip.Popup className="toolbar-tooltip">
                {aiPanelVisible ? 'Hide AI Assistant' : 'Show AI Assistant'}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>

        {/* Plane selector dialog */}
        <PlaneSelector
          open={planeSelectorOpen}
          onClose={() => setPlaneSelectorOpen(false)}
          onSelect={handlePlaneSelect}
        />

        {/* Extrude dialog */}
        <ExtrudeDialog
          open={extrudeDialogOpen}
          sketchId={selectedSketchId || ''}
          onConfirm={handleExtrudeConfirm}
          onCancel={handleExtrudeCancel}
        />
      </div>
    </Tooltip.Provider>
  );
};

export default Toolbar;
