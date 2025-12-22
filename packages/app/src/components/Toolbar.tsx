import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Tooltip, Separator } from '@base-ui/react';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import { useSelection } from '../contexts/SelectionContext';
import { useFeatureEdit } from '../contexts/FeatureEditContext';
import { useKernel } from '../contexts/KernelContext';
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

const PlaneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 6l8 4 8-4" />
    <path d="M4 6v8l8 4 8-4V6" />
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

// Boolean operation icons (Phase 17)
const BooleanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="12" r="6" />
    <circle cx="15" cy="12" r="6" />
  </svg>
);

const UnionIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 6a6 6 0 1 0 0 12 6 6 0 0 0 6-6 6 6 0 1 1 0-6" />
    <path d="M15 18a6 6 0 0 0 0-12" />
  </svg>
);

const SubtractIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="12" r="6" />
    <path d="M15 6a6 6 0 1 1 0 12" strokeDasharray="4 2" />
  </svg>
);

const IntersectIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="12" r="6" strokeDasharray="4 2" />
    <circle cx="15" cy="12" r="6" strokeDasharray="4 2" />
    <path d="M12 6v12" />
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

// Export icon (Phase 18)
const ExportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);





interface ToolbarProps {
  onToggleAIPanel?: () => void;
  aiPanelVisible?: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({ onToggleAIPanel, aiPanelVisible }) => {
  const { mode, startSketch, finishSketch, cancelSketch, addRectangle, setTool, canApplyConstraint, applyConstraint, clearSelection: clearSketchSelection } = useSketch();
  const { undo, redo, canUndo, canRedo, features, addBoolean } = useDocument();
  const { selectedFeatureId, selectFeature, clearSelection } = useSelection();
  const { exportStl, bodies } = useKernel();
  const { startExtrudeEdit, startRevolveEdit, isEditing } = useFeatureEdit();
  const [constraintsDropdownOpen, setConstraintsDropdownOpen] = useState(false);
  const [booleanDropdownOpen, setBooleanDropdownOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const constraintsDropdownRef = React.useRef<HTMLDivElement>(null);
  const booleanDropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Toggle tool - clicking an active tool (except select) switches back to select
  const toggleTool = useCallback((tool: 'select' | 'line' | 'arc' | 'circle' | 'rectangle') => {
    if (mode.activeTool === tool && tool !== 'select') {
      // Clicking active tool again goes back to select
      setTool('select');
    } else {
      setTool(tool);
    }
  }, [mode.activeTool, setTool]);

  // Check if we can export (have bodies to export)
  const canExport = bodies.length > 0 && !isExporting;
  
  // Handle STL export (Phase 18)
  const handleExportStl = useCallback(async () => {
    if (!canExport) return;
    
    setIsExporting(true);
    try {
      const result = await exportStl({ binary: true, name: 'model' });
      
      // Download the file
      if (result instanceof ArrayBuffer) {
        const blob = new Blob([result], { type: 'model/stl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'model.stl';
        a.click();
        URL.revokeObjectURL(url);
      } else if (typeof result === 'string') {
        const blob = new Blob([result], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'model.stl';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  }, [canExport, exportStl]);

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

  // Close boolean dropdown when clicking outside
  React.useEffect(() => {
    if (!booleanDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (booleanDropdownRef.current && !booleanDropdownRef.current.contains(e.target as Node)) {
        setBooleanDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [booleanDropdownOpen]);

  // Get available sketches for extrusion
  const sketches = useMemo(() => {
    return features.filter((f) => f.type === 'sketch');
  }, [features]);

  // Check if a plane is selected (for starting sketch on selected plane)
  const selectedPlane = useMemo(() => {
    if (!selectedFeatureId) return null;
    const feature = features.find(f => f.id === selectedFeatureId);
    if (feature?.type === 'plane') {
      return feature.id;
    }
    return null;
  }, [selectedFeatureId, features]);
  
  // Check if a face is selected (Phase 15: sketch on face)
  const { selectedFaces } = useSelection();
  const selectedFaceRef = useMemo(() => {
    if (selectedFaces.length !== 1) return null;
    const face = selectedFaces[0];
    // Create face reference in format expected by worker
    return `face:${face.featureId}:${face.faceIndex}`;
  }, [selectedFaces]);
  
  // Effective plane/face reference for sketching
  const sketchPlaneRef = selectedPlane || selectedFaceRef;

  // Check if a sketch is selected (for extrude/revolve)
  const selectedSketch = useMemo(() => {
    if (!selectedFeatureId) return null;
    const feature = features.find(f => f.id === selectedFeatureId);
    if (feature?.type === 'sketch') {
      return feature;
    }
    return null;
  }, [selectedFeatureId, features]);

  // Keyboard shortcuts for sketch mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      // Cmd/Ctrl + Enter to accept sketch
      if (modKey && e.key === 'Enter' && mode.active) {
        e.preventDefault();
        finishSketch();
        return;
      }
      
      // Escape behavior:
      // - In sketch mode: clear selection and end draft line, NOT cancel sketch
      // - Outside sketch mode: clear all selections
      if (e.key === 'Escape') {
        e.preventDefault();
        if (mode.active) {
          // In sketch mode - just clear selection, don't cancel
          clearSketchSelection();
        } else {
          // Clear selection from feature tree and 3D view
          selectFeature(null);
          clearSelection();
          clearSketchSelection();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode.active, finishSketch, cancelSketch, selectFeature, clearSelection, clearSketchSelection]);

  const handleNewSketch = () => {
    // Plane must be selected (button should be disabled otherwise)
    if (!sketchPlaneRef) return;
    startSketch(sketchPlaneRef);
  };

  const handleAddRectangle = () => {
    // Add a test rectangle at origin
    addRectangle(0, 0, 4, 3);
  };

  // Check if sketch button should be enabled (only when plane or face is selected)
  const canStartSketch = sketchPlaneRef !== null;

  // Check if extrude/revolve can be used (also disabled when already editing a feature)
  const canExtrude = !isEditing && (selectedSketch !== null || sketches.length === 1);
  const canRevolve = !isEditing && (selectedSketch !== null || sketches.length === 1);

  const handleExtrude = () => {
    const sketchId = selectedSketch?.id || (sketches.length === 1 ? sketches[0].id : null);
    if (sketchId) {
      startExtrudeEdit(sketchId);
    }
  };

  // Get all body-creating features (extrude, revolve) for boolean operations (Phase 17)
  const bodyFeatures = useMemo(() => {
    return features.filter(f => f.type === 'extrude' || f.type === 'revolve');
  }, [features]);
  
  // Check if boolean operations are available (need at least 2 bodies)
  const canBoolean = !isEditing && bodyFeatures.length >= 2;
  
  // Handle boolean operation
  const handleBoolean = (operation: 'union' | 'subtract' | 'intersect') => {
    if (bodyFeatures.length < 2) return;
    
    // For now, use the last two body features
    // In a more complete implementation, we'd let the user select bodies
    const target = bodyFeatures[bodyFeatures.length - 2];
    const tool = bodyFeatures[bodyFeatures.length - 1];
    
    // Add boolean feature to document
    addBoolean(operation, target.id, tool.id);
    
    setBooleanDropdownOpen(false);
  };

  const handleRevolve = () => {
    const sketchId = selectedSketch?.id || (sketches.length === 1 ? sketches[0].id : null);
    if (sketchId) {
      startRevolveEdit(sketchId);
    }
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
                onClick={() => toggleTool('select')}
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
                onClick={() => toggleTool('line')}
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
                onClick={() => toggleTool('arc')}
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
                onClick={() => toggleTool('circle')}
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
                  {/* Advanced constraints (Phase 19) */}
                  <div className="toolbar-dropdown-separator" />
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('parallel'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('parallel')}
                  >
                    <span className="toolbar-dropdown-key">∥</span> Parallel
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('perpendicular'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('perpendicular')}
                  >
                    <span className="toolbar-dropdown-key">⊥</span> Perpendicular
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('equalLength'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('equalLength')}
                  >
                    <span className="toolbar-dropdown-key">=</span> Equal Length
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('tangent'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('tangent')}
                  >
                    <span className="toolbar-dropdown-key">⌒</span> Tangent
                  </button>
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => { applyConstraint('symmetric'); setConstraintsDropdownOpen(false); }}
                    disabled={!canApplyConstraint('symmetric')}
                  >
                    <span className="toolbar-dropdown-key">⇔</span> Symmetric
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Feature mode: Sketch, Plane, Extrude, Revolve */}
            <div className="toolbar-group">
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className={`toolbar-button ${!canStartSketch ? 'disabled' : ''}`}
                  onClick={handleNewSketch}
                  render={<button aria-label="New Sketch" disabled={!canStartSketch} />}
                >
                  <SketchIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="bottom" sideOffset={6}>
                    <Tooltip.Popup className="toolbar-tooltip">
                      {canStartSketch 
                        ? (selectedFaceRef 
                            ? `New Sketch on Face` 
                            : `New Sketch on ${(selectedPlane || '').toUpperCase()}`)
                        : 'New Sketch (select a plane or face first)'}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className="toolbar-button disabled"
                  render={<button aria-label="Plane" disabled />}
                >
                  <PlaneIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="bottom" sideOffset={6}>
                    <Tooltip.Popup className="toolbar-tooltip">Plane (coming soon)</Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>
            
            <Separator orientation="vertical" className="toolbar-separator" />

            {/* Feature tools - only visible in feature mode */}
            <div className="toolbar-group">
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className={`toolbar-button ${!canExtrude ? 'disabled' : ''}`}
                  onClick={handleExtrude}
                  render={<button aria-label="Extrude" disabled={!canExtrude} />}
                >
                  <ExtrudeIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="bottom" sideOffset={6}>
                    <Tooltip.Popup className="toolbar-tooltip">
                      {selectedSketch ? `Extrude ${selectedSketch.name || selectedSketch.id}` : 'Extrude (select a sketch)'}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger
                  delay={300}
                  className={`toolbar-button ${!canRevolve ? 'disabled' : ''}`}
                  onClick={handleRevolve}
                  render={<button aria-label="Revolve" disabled={!canRevolve} />}
                >
                  <RevolveIcon />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="bottom" sideOffset={6}>
                    <Tooltip.Popup className="toolbar-tooltip">
                      {selectedSketch ? `Revolve ${selectedSketch.name || selectedSketch.id}` : 'Revolve (select a sketch)'}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>

              {/* Boolean Operations Dropdown (Phase 17) */}
              <div ref={booleanDropdownRef} className="toolbar-dropdown-wrapper">
                <Tooltip.Root>
                  <Tooltip.Trigger
                    delay={300}
                    className={`toolbar-button ${!canBoolean ? 'disabled' : ''} ${booleanDropdownOpen ? 'active' : ''}`}
                    onClick={() => canBoolean && setBooleanDropdownOpen(!booleanDropdownOpen)}
                    render={<button aria-label="Boolean" disabled={!canBoolean} />}
                  >
                    <BooleanIcon />
                    <ChevronDownIcon />
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Positioner side="bottom" sideOffset={6}>
                      <Tooltip.Popup className="toolbar-tooltip">
                        Boolean Operations {canBoolean ? '' : '(need 2+ bodies)'}
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
                {booleanDropdownOpen && (
                  <div className="toolbar-dropdown">
                    <button 
                      className="toolbar-dropdown-item"
                      onClick={() => handleBoolean('union')}
                    >
                      <UnionIcon />
                      <span>Union</span>
                    </button>
                    <button 
                      className="toolbar-dropdown-item"
                      onClick={() => handleBoolean('subtract')}
                    >
                      <SubtractIcon />
                      <span>Subtract</span>
                    </button>
                    <button 
                      className="toolbar-dropdown-item"
                      onClick={() => handleBoolean('intersect')}
                    >
                      <IntersectIcon />
                      <span>Intersect</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Spacer to push right-side buttons to right */}
        <div className="toolbar-spacer" />

        {/* Export STL (Phase 18) */}
        <Tooltip.Root>
          <Tooltip.Trigger
            delay={300}
            className={`toolbar-button ${!canExport ? 'disabled' : ''} ${isExporting ? 'loading' : ''}`}
            onClick={handleExportStl}
            render={<button aria-label="Export STL" disabled={!canExport} />}
          >
            <ExportIcon />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom" sideOffset={6}>
              <Tooltip.Popup className="toolbar-tooltip">
                {isExporting ? 'Exporting...' : (canExport ? 'Export STL' : 'Export STL (no bodies)')}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>

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
      </div>
    </Tooltip.Provider>
  );
};

export default Toolbar;
