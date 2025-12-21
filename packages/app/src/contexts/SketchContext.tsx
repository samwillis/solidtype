/**
 * SketchContext - manages sketch editing mode state
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from 'react';
import { useDocument } from './DocumentContext';
import {
  findFeature,
  addPointToSketch,
  addLineToSketch,
  addArcToSketch,
  addConstraintToSketch,
  getSketchData,
  setSketchData,
} from '../document/featureHelpers';
import type { NewSketchConstraint, SketchPoint } from '../types/document';

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
}

interface SketchContextValue {
  mode: SketchModeState;
  startSketch: (planeId: string) => void;
  finishSketch: () => void;
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
  const { doc, addSketch } = useDocument();
  
  const [mode, setMode] = useState<SketchModeState>({
    active: false,
    sketchId: null,
    planeId: null,
    activeTool: 'line',
    tempPoints: [],
  });

  const startSketch = useCallback((planeId: string) => {
    // Create new sketch in Yjs
    const sketchId = addSketch(planeId);
    
    setMode({
      active: true,
      sketchId,
      planeId,
      activeTool: 'line',
      tempPoints: [],
    });
  }, [addSketch]);

  const finishSketch = useCallback(() => {
    setMode({
      active: false,
      sketchId: null,
      planeId: null,
      activeTool: 'line',
      tempPoints: [],
    });
  }, []);

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

  const value: SketchContextValue = {
    mode,
    startSketch,
    finishSketch,
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
