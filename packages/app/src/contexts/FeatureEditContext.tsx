/**
 * FeatureEditContext - manages feature editing/creation state
 * 
 * When creating new features (extrude, revolve), this context tracks
 * the editing state and provides accept/cancel functionality.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useDocument } from './DocumentContext';
import { useKernel } from './KernelContext';
import type { ExtrudeFormData, RevolveFormData } from '../types/featureSchemas';

// ============================================================================
// Types
// ============================================================================

export type FeatureEditMode = 
  | { type: 'none' }
  | { type: 'extrude'; sketchId: string; data: ExtrudeFormData }
  | { type: 'revolve'; sketchId: string; data: RevolveFormData };

interface FeatureEditContextValue {
  editMode: FeatureEditMode;
  
  /** Start creating a new extrude feature */
  startExtrudeEdit: (sketchId: string) => void;
  
  /** Start creating a new revolve feature */
  startRevolveEdit: (sketchId: string) => void;
  
  /** Update the form data while editing */
  updateFormData: (data: Partial<ExtrudeFormData> | Partial<RevolveFormData>) => void;
  
  /** Accept the current edit and create the feature */
  acceptEdit: () => void;
  
  /** Cancel the current edit */
  cancelEdit: () => void;
  
  /** Whether we're currently editing a feature */
  isEditing: boolean;
}

// ============================================================================
// Context
// ============================================================================

const FeatureEditContext = createContext<FeatureEditContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface FeatureEditProviderProps {
  children: React.ReactNode;
}

export function FeatureEditProvider({ children }: FeatureEditProviderProps) {
  const { addExtrude, addRevolve, getFeatureById, features } = useDocument();
  const { previewExtrude, previewRevolve, clearPreview } = useKernel();
  
  const [editMode, setEditMode] = useState<FeatureEditMode>({ type: 'none' });
  const previewTimerRef = useRef<number | null>(null);
  
  // Generate next feature name
  const getNextName = useCallback((prefix: string): string => {
    let maxNum = 0;
    for (const feature of features) {
      const name = feature.name || feature.id;
      const match = name.match(new RegExp(`^${prefix}(\\d+)$`));
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
    return `${prefix}${maxNum + 1}`;
  }, [features]);
  
  // Schedule preview update (debounced)
  const schedulePreview = useCallback((mode: FeatureEditMode) => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    
    previewTimerRef.current = window.setTimeout(() => {
      if (mode.type === 'extrude') {
        previewExtrude({
          sketchId: mode.sketchId,
          distance: mode.data.distance ?? 10,
          direction: mode.data.direction,
          op: mode.data.op,
        });
      } else if (mode.type === 'revolve') {
        previewRevolve({
          sketchId: mode.sketchId,
          axis: mode.data.axis,
          angle: mode.data.angle,
          op: mode.data.op,
        });
      }
    }, 80);
  }, [previewExtrude, previewRevolve]);
  
  const startExtrudeEdit = useCallback((sketchId: string) => {
    const name = getNextName('Extrude');
    
    const newMode: FeatureEditMode = {
      type: 'extrude',
      sketchId,
      data: {
        name,
        sketch: sketchId,
        op: 'add',
        direction: 'normal',
        extent: 'blind',
        distance: 10,
      },
    };
    
    setEditMode(newMode);
    schedulePreview(newMode);
  }, [getNextName, schedulePreview]);
  
  const startRevolveEdit = useCallback((sketchId: string) => {
    const sketch = getFeatureById(sketchId);
    const name = getNextName('Revolve');
    
    // Find first line in sketch to use as default axis
    let defaultAxis = '';
    if (sketch?.type === 'sketch' && sketch.data) {
      const firstLine = sketch.data.entities.find(e => e.type === 'line');
      if (firstLine) {
        defaultAxis = firstLine.id;
      }
    }
    
    const newMode: FeatureEditMode = {
      type: 'revolve',
      sketchId,
      data: {
        name,
        sketch: sketchId,
        axis: defaultAxis,
        angle: 360,
        op: 'add',
      },
    };
    
    setEditMode(newMode);
    schedulePreview(newMode);
  }, [getFeatureById, getNextName, schedulePreview]);
  
  const updateFormData = useCallback((data: Partial<ExtrudeFormData> | Partial<RevolveFormData>) => {
    setEditMode(prev => {
      if (prev.type === 'none') return prev;
      
      const newMode = {
        ...prev,
        data: { ...prev.data, ...data },
      } as FeatureEditMode;
      
      schedulePreview(newMode);
      return newMode;
    });
  }, [schedulePreview]);
  
  const acceptEdit = useCallback(() => {
    if (editMode.type === 'extrude') {
      const { data, sketchId } = editMode;
      addExtrude(sketchId, data.distance ?? 10, data.op, data.direction);
    } else if (editMode.type === 'revolve') {
      const { data, sketchId } = editMode;
      addRevolve(sketchId, data.axis, data.angle, data.op);
    }
    
    clearPreview();
    setEditMode({ type: 'none' });
  }, [editMode, addExtrude, addRevolve, clearPreview]);
  
  const cancelEdit = useCallback(() => {
    clearPreview();
    setEditMode({ type: 'none' });
  }, [clearPreview]);
  
  const value: FeatureEditContextValue = {
    editMode,
    startExtrudeEdit,
    startRevolveEdit,
    updateFormData,
    acceptEdit,
    cancelEdit,
    isEditing: editMode.type !== 'none',
  };
  
  return (
    <FeatureEditContext.Provider value={value}>
      {children}
    </FeatureEditContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useFeatureEdit() {
  const ctx = useContext(FeatureEditContext);
  if (!ctx) {
    throw new Error('useFeatureEdit must be used within FeatureEditProvider');
  }
  return ctx;
}
