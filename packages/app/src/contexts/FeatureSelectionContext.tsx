/**
 * Feature Selection Context
 * 
 * Manages the currently selected feature in the model tree.
 * Used to coordinate selection between the feature tree, viewer, and code editor.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { FeatureCheckpoint } from '@solidtype/dsl';

interface FeatureSelectionContextType {
  /** Currently selected feature ID */
  selectedFeatureId: string | null;
  /** All available checkpoints */
  checkpoints: FeatureCheckpoint[];
  /** Breakpoint feature ID (build stops here) */
  breakpointFeatureId: string | null;
  /** Select a feature by ID */
  selectFeature: (featureId: string | null) => void;
  /** Set a breakpoint at a feature */
  setBreakpoint: (featureId: string | null) => void;
  /** Update checkpoints (from model build) */
  setCheckpoints: (checkpoints: FeatureCheckpoint[]) => void;
  /** Get the selected checkpoint object */
  getSelectedCheckpoint: () => FeatureCheckpoint | null;
}

const FeatureSelectionContext = createContext<FeatureSelectionContextType | null>(null);

export function useFeatureSelection(): FeatureSelectionContextType {
  const context = useContext(FeatureSelectionContext);
  if (!context) {
    throw new Error('useFeatureSelection must be used within a FeatureSelectionProvider');
  }
  return context;
}

interface FeatureSelectionProviderProps {
  children: React.ReactNode;
}

export function FeatureSelectionProvider({ children }: FeatureSelectionProviderProps) {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [breakpointFeatureId, setBreakpointFeatureId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<FeatureCheckpoint[]>([]);

  const selectFeature = useCallback((featureId: string | null) => {
    setSelectedFeatureId(featureId);
  }, []);

  const setBreakpoint = useCallback((featureId: string | null) => {
    setBreakpointFeatureId(featureId);
  }, []);

  const getSelectedCheckpoint = useCallback((): FeatureCheckpoint | null => {
    if (!selectedFeatureId) return null;
    return checkpoints.find(c => c.id === selectedFeatureId) ?? null;
  }, [selectedFeatureId, checkpoints]);

  const value: FeatureSelectionContextType = {
    selectedFeatureId,
    checkpoints,
    breakpointFeatureId,
    selectFeature,
    setBreakpoint,
    setCheckpoints,
    getSelectedCheckpoint,
  };

  return (
    <FeatureSelectionContext.Provider value={value}>
      {children}
    </FeatureSelectionContext.Provider>
  );
}
