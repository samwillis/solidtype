/**
 * SketchContext - manages sketch editing mode state
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useDocument } from './DocumentContext';
import { useViewer, type ViewPreset } from './ViewerContext';
import {
  findFeature,
  addPointToSketch,
  addLineToSketch,
  addArcToSketch,
  addConstraintToSketch,
  getSketchData,
  setSketchData,
} from '../document/featureHelpers';
import type { NewSketchConstraint, SketchData, SketchLine, SketchPoint } from '../types/document';

// Constraint types that can be applied
export type ConstraintType = 
  | 'horizontal' | 'vertical' | 'coincident' | 'fixed' | 'distance' | 'angle'
  // Advanced constraints (Phase 19)
  | 'parallel' | 'perpendicular' | 'equalLength' | 'tangent' | 'symmetric';

// ============================================================================
// Types
// ============================================================================

export type SketchTool = 'select' | 'line' | 'arc' | 'circle' | 'rectangle';

export interface SketchModeState {
  active: boolean;
  sketchId: string | null;
  planeId: string | null;
  activeTool: SketchTool;
  tempPoints: { x: number; y: number }[];
  /** Whether this is a new sketch (should be deleted on cancel) or editing existing */
  isNewSketch: boolean;
}

/** Mouse position in sketch coordinates */
export interface SketchMousePos {
  x: number;
  y: number;
}

/** Preview line for draft rendering in 3D */
export interface SketchPreviewLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface SketchContextValue {
  mode: SketchModeState;
  /** Current mouse position in sketch coordinates (for status bar display) */
  sketchMousePos: SketchMousePos | null;
  setSketchMousePos: (pos: SketchMousePos | null) => void;
  /** Preview line for draft rendering (set by SketchCanvas, rendered by Viewer) */
  previewLine: SketchPreviewLine | null;
  setPreviewLine: (line: SketchPreviewLine | null) => void;
  /** Start a new sketch on the given plane */
  startSketch: (planeId: string) => void;
  /** Edit an existing sketch */
  editSketch: (sketchId: string, planeId: string) => void;
  finishSketch: () => void;
  cancelSketch: () => void;
  setTool: (tool: SketchTool) => void;
  addPoint: (x: number, y: number) => string | null;
  addLine: (startId: string, endId: string) => string | null;
  addArc: (startId: string, endId: string, centerId: string, ccw?: boolean) => string | null;
  addTempPoint: (x: number, y: number) => void;
  clearTempPoints: () => void;
  getSketchPoints: () => SketchPoint[];
  updatePointPosition: (pointId: string, x: number, y: number) => void;
  findNearbyPoint: (x: number, y: number, tolerance: number) => SketchPoint | null;
  /** Draw a rectangle at the given center with width and height */
  addRectangle: (centerX: number, centerY: number, width: number, height: number) => void;
  addConstraint: (constraint: NewSketchConstraint) => string | null;
  
  // Selection state for constraints
  selectedPoints: Set<string>;
  selectedLines: Set<string>;
  setSelectedPoints: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedLines: React.Dispatch<React.SetStateAction<Set<string>>>;
  togglePointSelection: (pointId: string) => void;
  toggleLineSelection: (lineId: string) => void;
  clearSelection: () => void;
  
  // Constraint helpers
  canApplyConstraint: (type: ConstraintType) => boolean;
  applyConstraint: (type: ConstraintType) => void;
  getSketchData: () => SketchData | null;
}

// ============================================================================
// Context
// ============================================================================

const SketchContext = createContext<SketchContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SketchProviderProps {
  children: React.ReactNode;
}

export function SketchProvider({ children }: SketchProviderProps) {
  const { doc, addSketch, deleteFeature, undoManager } = useDocument();
  const { actions, state } = useViewer();
  
  const [mode, setMode] = useState<SketchModeState>({
    active: false,
    sketchId: null,
    planeId: null,
    activeTool: 'line',
    tempPoints: [],
    isNewSketch: false,
  });
  
  // Store the undo stack position when we start editing, so we can revert on cancel
  const undoStackPositionRef = useRef<number>(0);
  
  // Mouse position in sketch coordinates (shared with StatusBar)
  const [sketchMousePos, setSketchMousePos] = useState<SketchMousePos | null>(null);
  
  // Preview line for draft rendering (shared with Viewer)
  const [previewLine, setPreviewLine] = useState<SketchPreviewLine | null>(null);

  const startSketch = useCallback((planeId: string) => {
    // Create new sketch in Yjs
    const sketchId = addSketch(planeId);
    
    // Rotate camera to face the sketch plane normal
    // Map plane ID to appropriate view preset
    // XY plane (Z=0, normal=+Z) → front view (camera at +Z looking at origin)
    // XZ plane (Y=0, normal=+Y) → top view (camera at +Y looking down)
    // YZ plane (X=0, normal=+X) → right view (camera at +X looking at origin)
    let targetView: ViewPreset;
    switch (planeId) {
      case 'xy':
        targetView = 'front';
        break;
      case 'xz':
        targetView = 'top';
        break;
      case 'yz':
        targetView = 'right';
        break;
      default:
        // For face references or custom planes, default to isometric
        targetView = 'isometric';
    }
    
    // If not already in a standard view, switch to the plane-normal view
    if (state.currentView !== targetView) {
      actions.setView(targetView);
    }
    
    setMode({
      active: true,
      sketchId,
      planeId,
      activeTool: 'line',
      tempPoints: [],
      isNewSketch: true,
    });
  }, [addSketch, actions, state.currentView]);

  const editSketch = useCallback((sketchId: string, planeId: string) => {
    // Store current undo stack position so we can revert on cancel
    undoStackPositionRef.current = undoManager.undoStack.length;
    
    // Rotate camera to face the sketch plane
    let targetView: ViewPreset;
    switch (planeId) {
      case 'xy':
        targetView = 'front';
        break;
      case 'xz':
        targetView = 'top';
        break;
      case 'yz':
        targetView = 'right';
        break;
      default:
        targetView = 'isometric';
    }
    
    if (state.currentView !== targetView) {
      actions.setView(targetView);
    }
    
    setMode({
      active: true,
      sketchId,
      planeId,
      activeTool: 'line',
      tempPoints: [],
      isNewSketch: false,
    });
  }, [actions, state.currentView, undoManager]);

  const finishSketch = useCallback(() => {
    setMode({
      active: false,
      sketchId: null,
      planeId: null,
      activeTool: 'line',
      tempPoints: [],
      isNewSketch: false,
    });
  }, []);

  const cancelSketch = useCallback(() => {
    const { sketchId, isNewSketch } = mode;
    
    if (isNewSketch && sketchId) {
      // New sketch - delete it entirely
      deleteFeature(sketchId);
    } else if (!isNewSketch && sketchId) {
      // Existing sketch - undo all changes made during editing
      const targetPosition = undoStackPositionRef.current;
      const currentPosition = undoManager.undoStack.length;
      const undoCount = currentPosition - targetPosition;
      
      for (let i = 0; i < undoCount; i++) {
        undoManager.undo();
      }
    }
    
    setMode({
      active: false,
      sketchId: null,
      planeId: null,
      activeTool: 'line',
      tempPoints: [],
      isNewSketch: false,
    });
  }, [mode, deleteFeature, undoManager]);

  const setTool = useCallback((tool: SketchTool) => {
    setMode((prev) => ({
      ...prev,
      activeTool: tool,
      tempPoints: [], // Clear temp points when changing tools
    }));
  }, []);

  const getSketchElement = useCallback(() => {
    if (!mode.sketchId) return null;
    return findFeature(doc.features, mode.sketchId);
  }, [doc.features, mode.sketchId]);

  const addPoint = useCallback((x: number, y: number): string | null => {
    const sketch = getSketchElement();
    if (!sketch) return null;
    return addPointToSketch(sketch, x, y);
  }, [getSketchElement]);

  const addLine = useCallback((startId: string, endId: string): string | null => {
    const sketch = getSketchElement();
    if (!sketch) return null;
    return addLineToSketch(sketch, startId, endId);
  }, [getSketchElement]);

  const addArc = useCallback((startId: string, endId: string, centerId: string, ccw: boolean = true): string | null => {
    const sketch = getSketchElement();
    if (!sketch) return null;
    return addArcToSketch(sketch, startId, endId, centerId, ccw);
  }, [getSketchElement]);

  const addTempPoint = useCallback((x: number, y: number) => {
    setMode((prev) => ({
      ...prev,
      tempPoints: [...prev.tempPoints, { x, y }],
    }));
  }, []);

  const clearTempPoints = useCallback(() => {
    setMode((prev) => ({
      ...prev,
      tempPoints: [],
    }));
  }, []);

  const getSketchPoints = useCallback((): SketchPoint[] => {
    const sketch = getSketchElement();
    if (!sketch) return [];
    return getSketchData(sketch).points;
  }, [getSketchElement]);

  const updatePointPosition = useCallback((pointId: string, x: number, y: number) => {
    const sketch = getSketchElement();
    if (!sketch) return;
    
    const data = getSketchData(sketch);
    const point = data.points.find((p) => p.id === pointId);
    if (point) {
      point.x = x;
      point.y = y;
      setSketchData(sketch, data);
    }
  }, [getSketchElement]);

  const findNearbyPoint = useCallback((x: number, y: number, tolerance: number): SketchPoint | null => {
    const points = getSketchPoints();
    for (const point of points) {
      const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
      if (dist < tolerance) {
        return point;
      }
    }
    return null;
  }, [getSketchPoints]);

  const addRectangle = useCallback((centerX: number, centerY: number, width: number, height: number) => {
    const sketch = getSketchElement();
    if (!sketch) return;

    const halfW = width / 2;
    const halfH = height / 2;

    // Add 4 corner points
    const p1 = addPointToSketch(sketch, centerX - halfW, centerY - halfH);
    const p2 = addPointToSketch(sketch, centerX + halfW, centerY - halfH);
    const p3 = addPointToSketch(sketch, centerX + halfW, centerY + halfH);
    const p4 = addPointToSketch(sketch, centerX - halfW, centerY + halfH);

    // Add 4 lines
    addLineToSketch(sketch, p1, p2);
    addLineToSketch(sketch, p2, p3);
    addLineToSketch(sketch, p3, p4);
    addLineToSketch(sketch, p4, p1);
  }, [getSketchElement]);

  const addConstraint = useCallback((constraint: NewSketchConstraint): string | null => {
    const sketch = getSketchElement();
    if (!sketch) return null;
    return addConstraintToSketch(sketch, constraint);
  }, [getSketchElement]);

  // Selection state for constraints
  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(() => new Set());
  const [selectedLines, setSelectedLines] = useState<Set<string>>(() => new Set());

  const togglePointSelection = useCallback((pointId: string) => {
    setSelectedPoints((prev) => {
      const next = new Set(prev);
      if (next.has(pointId)) {
        next.delete(pointId);
      } else {
        next.add(pointId);
      }
      return next;
    });
    setSelectedLines(new Set());
  }, []);

  const toggleLineSelection = useCallback((lineId: string) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
    setSelectedPoints(new Set());
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPoints(new Set());
    setSelectedLines(new Set());
  }, []);

  // Get current sketch data
  const getSketchDataFn = useCallback((): SketchData | null => {
    const sketch = getSketchElement();
    if (!sketch) return null;
    return getSketchData(sketch);
  }, [getSketchElement]);

  // Check if a constraint can be applied with current selection
  const canApplyConstraint = useCallback((type: ConstraintType): boolean => {
    const sketch = getSketchDataFn();
    if (!sketch) return false;
    const points = Array.from(selectedPoints);
    const lines = Array.from(selectedLines);

    switch (type) {
      case 'horizontal':
      case 'vertical':
        return points.length === 2 || lines.length === 1;
      case 'coincident':
        return points.length === 2;
      case 'fixed':
        return points.length === 1;
      case 'distance':
        return points.length === 2 || lines.length === 1;
      case 'angle':
        return lines.length === 2;
      // Advanced constraints (Phase 19)
      case 'parallel':
      case 'perpendicular':
      case 'equalLength':
        return lines.length === 2;
      case 'tangent':
        // Need 1 line and 1 arc, but we're simplifying to lines.length >= 1
        // Full implementation would check for arc selection
        return lines.length === 2;
      case 'symmetric':
        // Need 2 points and 1 line (axis)
        return points.length === 2 && lines.length === 1;
      default:
        return false;
    }
  }, [getSketchDataFn, selectedPoints, selectedLines]);

  // Build and apply a constraint
  const applyConstraint = useCallback((type: ConstraintType) => {
    const sketch = getSketchDataFn();
    if (!sketch) return;
    
    const points = Array.from(selectedPoints);
    const lines = Array.from(selectedLines);
    let constraint: NewSketchConstraint | null = null;

    if (type === 'fixed') {
      if (points.length !== 1) return;
      constraint = { type: 'fixed', point: points[0] };
    } else if (type === 'coincident') {
      if (points.length !== 2) return;
      constraint = { type: 'coincident', points: [points[0], points[1]] };
    } else if (type === 'horizontal' || type === 'vertical') {
      if (points.length === 2) {
        constraint = { type, points: [points[0], points[1]] };
      } else if (lines.length === 1) {
        const line = sketch.entities.find((e) => e.type === 'line' && e.id === lines[0]) as SketchLine | undefined;
        if (!line) return;
        constraint = { type, points: [line.start, line.end] };
      }
    } else if (type === 'distance') {
      if (points.length === 2) {
        // Calculate current distance
        const p1 = sketch.points.find((p) => p.id === points[0]);
        const p2 = sketch.points.find((p) => p.id === points[1]);
        if (!p1 || !p2) return;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        constraint = { type: 'distance', points: [points[0], points[1]], value: dist };
      } else if (lines.length === 1) {
        const line = sketch.entities.find((e) => e.type === 'line' && e.id === lines[0]) as SketchLine | undefined;
        if (!line) return;
        const p1 = sketch.points.find((p) => p.id === line.start);
        const p2 = sketch.points.find((p) => p.id === line.end);
        if (!p1 || !p2) return;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        constraint = { type: 'distance', points: [line.start, line.end], value: dist };
      }
    } else if (type === 'angle') {
      if (lines.length !== 2) return;
      const line1 = sketch.entities.find((e) => e.type === 'line' && e.id === lines[0]) as SketchLine | undefined;
      const line2 = sketch.entities.find((e) => e.type === 'line' && e.id === lines[1]) as SketchLine | undefined;
      if (!line1 || !line2) return;
      // Default to 90 degrees
      constraint = { type: 'angle', lines: [lines[0], lines[1]], value: 90 };
    }
    // Advanced constraints (Phase 19)
    else if (type === 'parallel') {
      if (lines.length !== 2) return;
      constraint = { type: 'parallel', lines: [lines[0], lines[1]] };
    } else if (type === 'perpendicular') {
      if (lines.length !== 2) return;
      constraint = { type: 'perpendicular', lines: [lines[0], lines[1]] };
    } else if (type === 'equalLength') {
      if (lines.length !== 2) return;
      constraint = { type: 'equalLength', lines: [lines[0], lines[1]] };
    } else if (type === 'tangent') {
      // Simplified: treat as two-line constraint (full would need line+arc)
      if (lines.length !== 2) return;
      constraint = { type: 'tangent', line: lines[0], arc: lines[1], connectionPoint: '' };
    } else if (type === 'symmetric') {
      if (points.length !== 2 || lines.length !== 1) return;
      constraint = { type: 'symmetric', points: [points[0], points[1]], axis: lines[0] };
    }

    if (constraint) {
      addConstraint(constraint);
      clearSelection();
    }
  }, [getSketchDataFn, selectedPoints, selectedLines, addConstraint, clearSelection]);

  const value: SketchContextValue = {
    mode,
    sketchMousePos,
    setSketchMousePos,
    previewLine,
    setPreviewLine,
    startSketch,
    editSketch,
    finishSketch,
    cancelSketch,
    setTool,
    addPoint,
    addLine,
    addArc,
    addTempPoint,
    clearTempPoints,
    getSketchPoints,
    updatePointPosition,
    findNearbyPoint,
    addRectangle,
    addConstraint,
    // Selection state
    selectedPoints,
    selectedLines,
    setSelectedPoints,
    setSelectedLines,
    togglePointSelection,
    toggleLineSelection,
    clearSelection,
    // Constraint helpers
    canApplyConstraint,
    applyConstraint,
    getSketchData: getSketchDataFn,
  };

  return (
    <SketchContext.Provider value={value}>{children}</SketchContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useSketch() {
  const ctx = useContext(SketchContext);
  if (!ctx) {
    throw new Error('useSketch must be used within SketchProvider');
  }
  return ctx;
}
