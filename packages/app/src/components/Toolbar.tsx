import React, { useState, useMemo } from 'react';
import { Tooltip, Separator } from '@base-ui/react';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import ExtrudeDialog from './ExtrudeDialog';
import RevolveDialog from './RevolveDialog';
import './Toolbar.css';


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


const SelectIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 3l14 10-6 2-4 6L5 3z" />
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

const ArcIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 19a14 14 0 0 1 14-14" />
  </svg>
);

const CircleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const ConstraintsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 12h16" />
    <path d="M12 4v16" />
    <circle cx="4" cy="12" r="2" fill="currentColor" />
    <circle cx="20" cy="12" r="2" fill="currentColor" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
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

interface ToolbarProps {
  onToggleAIPanel?: () => void;
  aiPanelVisible?: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({ onToggleAIPanel, aiPanelVisible }) => {
  const { mode, startSketch, addRectangle, setTool, canApplyConstraint, applyConstraint } = useSketch();
  const { undo, redo, canUndo, canRedo, features, addExtrude, addRevolve } = useDocument();
  const [planeSelectorOpen, setPlaneSelectorOpen] = useState(false);
  const [extrudeDialogOpen, setExtrudeDialogOpen] = useState(false);
  const [revolveDialogOpen, setRevolveDialogOpen] = useState(false);
  const [selectedSketchId, setSelectedSketchId] = useState<string | null>(null);
  const [constraintsDropdownOpen, setConstraintsDropdownOpen] = useState(false);
  const constraintsDropdownRef = React.useRef<HTMLDivElement>(null);

  // Close constraints dropdown when clicking outside
  React.useEffect(() => {
    if (!constraintsDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (constraintsDropdownRef.current && !constraintsDropdownRef.current.contains(e.target as Node)) {
        setConstraintsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [constraintsDropdownOpen]);

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

  const handleRevolve = () => {
    if (sketches.length === 1) {
      setSelectedSketchId(sketches[0].id);
      setRevolveDialogOpen(true);
    } else if (sketches.length > 1) {
      // For now, use the last sketch
      setSelectedSketchId(sketches[sketches.length - 1].id);
      setRevolveDialogOpen(true);
    }
  };

  const handleExtrudeConfirm = (distance: number, direction: 'normal' | 'reverse', op: 'add' | 'cut') => {
    if (selectedSketchId) {
      addExtrude(selectedSketchId, distance, op, direction);
    }
    setExtrudeDialogOpen(false);
    setSelectedSketchId(null);
  };

  const handleExtrudeCancel = () => {
    setExtrudeDialogOpen(false);
    setSelectedSketchId(null);
  };

  const handleRevolveConfirm = (axis: string, angle: number, op: 'add' | 'cut') => {
    if (selectedSketchId) {
      addRevolve(selectedSketchId, axis, angle, op);
    }
    setRevolveDialogOpen(false);
    setSelectedSketchId(null);
  };

  const handleRevolveCancel = () => {
    setRevolveDialogOpen(false);
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
                className={`toolbar-button ${mode.activeTool === 'select' ? 'active' : ''}`}
                onClick={() => setTool('select')}
                render={<button aria-label="Select" />}
              >
                <SelectIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="bottom" sideOffset={6}>
                  <Tooltip.Popup className="toolbar-tooltip">Select</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className={`toolbar-button ${mode.activeTool === 'line' ? 'active' : ''}`}
                onClick={() => setTool('line')}
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
                className={`toolbar-button ${mode.activeTool === 'arc' ? 'active' : ''}`}
                onClick={() => setTool('arc')}
                render={<button aria-label="Arc" />}
              >
                <ArcIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="bottom" sideOffset={6}>
                  <Tooltip.Popup className="toolbar-tooltip">Arc</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger
                delay={300}
                className={`toolbar-button ${mode.activeTool === 'circle' ? 'active' : ''}`}
                onClick={() => setTool('circle')}
                render={<button aria-label="Circle" />}
              >
                <CircleIcon />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="bottom" sideOffset={6}>
                  <Tooltip.Popup className="toolbar-tooltip">Circle</Tooltip.Popup>
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

            {/* Constraints dropdown */}
            <div className="toolbar-dropdown-container" ref={constraintsDropdownRef}>
              <button
                className={`toolbar-button toolbar-dropdown-button ${constraintsDropdownOpen ? 'active' : ''}`}
                onClick={() => setConstraintsDropdownOpen(!constraintsDropdownOpen)}
                aria-label="Constraints"
                title="Constraints"
              >
                <ConstraintsIcon />
                <ChevronDownIcon />
              </button>
              {constraintsDropdownOpen && (
                <div className="toolbar-dropdown-menu">
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('horizontal'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('horizontal')}
                  >
                    <span className="toolbar-dropdown-key">H</span> Horizontal
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('vertical'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('vertical')}
                  >
                    <span className="toolbar-dropdown-key">V</span> Vertical
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('coincident'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('coincident')}
                  >
                    <span className="toolbar-dropdown-key">C</span> Coincident
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('fixed'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('fixed')}
                  >
                    <span className="toolbar-dropdown-key">F</span> Fixed
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('distance'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('distance')}
                  >
                    <span className="toolbar-dropdown-key">D</span> Distance
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('angle'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('angle')}
                  >
                    <span className="toolbar-dropdown-key">∠</span> Angle
                  </button>
                </div>
              )}
            </div>
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
              className={`toolbar-button ${sketches.length === 0 ? 'disabled' : ''}`}
              onClick={handleRevolve}
              render={<button aria-label="Revolve" disabled={sketches.length === 0} />}
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

        {/* Revolve dialog */}
        <RevolveDialog
          open={revolveDialogOpen}
          sketchId={selectedSketchId || ''}
          onConfirm={handleRevolveConfirm}
          onCancel={handleRevolveCancel}
        />
      </div>
    </Tooltip.Provider>
  );
};

export default Toolbar;
