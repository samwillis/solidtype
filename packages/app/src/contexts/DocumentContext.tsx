/**
 * Document Context - provides access to the Yjs document throughout the app
 */

import React, { createContext, useContext, useMemo, useEffect, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { createDocument, type SolidTypeDoc } from '../document/createDocument';
import {
  getFeaturesArray,
  parseFeature,
  addSketchFeature,
  addExtrudeFeature,
  addRevolveFeature,
  findFeature,
} from '../document/featureHelpers';
import type { Feature, DocumentUnits } from '../types/document';

// ============================================================================
// Context Types
// ============================================================================

interface DocumentContextValue {
  doc: SolidTypeDoc;
  features: Feature[];
  rebuildGate: string | null;
  setRebuildGate: (featureId: string | null) => void;
  undoManager: Y.UndoManager;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Units
  units: DocumentUnits;
  setUnits: (units: DocumentUnits) => void;
  // Feature operations
  addSketch: (planeId: string, name?: string) => string;
  addExtrude: (
    sketchId: string,
    distance: number,
    op?: 'add' | 'cut',
    direction?: 'normal' | 'reverse'
  ) => string;
  addRevolve: (
    sketchId: string,
    axis: string,
    angle: number,
    op?: 'add' | 'cut'
  ) => string;
  getFeatureById: (id: string) => Feature | null;
}

// ============================================================================
// Context
// ============================================================================

const DocumentContext = createContext<DocumentContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface DocumentProviderProps {
  children: React.ReactNode;
}

export function DocumentProvider({ children }: DocumentProviderProps) {
  // Create the document once
  const doc = useMemo(() => createDocument(), []);
  
  // Create undo manager
  const undoManager = useMemo(() => {
    return new Y.UndoManager([doc.features, doc.state], {
      trackedOrigins: new Set([null, 'local']),
    });
  }, [doc]);
  
  // Local state
  const [rebuildGate, setRebuildGateState] = useState<string | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [units, setUnitsState] = useState<DocumentUnits>('mm');

  // Sync rebuild gate from Yjs
  useEffect(() => {
    const state = doc.state;
    const updateGate = () => {
      setRebuildGateState(state.get('rebuildGate') as string | null);
    };
    updateGate();
    state.observe(updateGate);
    return () => state.unobserve(updateGate);
  }, [doc]);

  // Sync units from Yjs meta
  useEffect(() => {
    const meta = doc.meta;
    const updateUnits = () => {
      const u = meta.get('units') as DocumentUnits | undefined;
      setUnitsState(u ?? 'mm');
    };
    updateUnits();
    meta.observe(updateUnits);
    return () => meta.unobserve(updateUnits);
  }, [doc]);

  // Sync features from Yjs
  useEffect(() => {
    const updateFeatures = () => {
      const elements = getFeaturesArray(doc.features);
      const parsed = elements.map(parseFeature).filter((f): f is Feature => f !== null);
      setFeatures(parsed);
    };
    
    updateFeatures();
    doc.features.observeDeep(updateFeatures);
    return () => doc.features.unobserveDeep(updateFeatures);
  }, [doc]);

  // Track undo/redo state
  useEffect(() => {
    const updateUndoState = () => {
      setCanUndo(undoManager.undoStack.length > 0);
      setCanRedo(undoManager.redoStack.length > 0);
    };
    
    undoManager.on('stack-item-added', updateUndoState);
    undoManager.on('stack-item-popped', updateUndoState);
    
    return () => {
      undoManager.off('stack-item-added', updateUndoState);
      undoManager.off('stack-item-popped', updateUndoState);
    };
  }, [undoManager]);

  // Actions
  const setRebuildGate = useCallback((featureId: string | null) => {
    doc.state.set('rebuildGate', featureId);
  }, [doc]);

  const setUnits = useCallback((newUnits: DocumentUnits) => {
    doc.meta.set('units', newUnits);
  }, [doc]);

  const undo = useCallback(() => {
    undoManager.undo();
  }, [undoManager]);

  const redo = useCallback(() => {
    undoManager.redo();
  }, [undoManager]);

  const addSketch = useCallback((planeId: string, name?: string) => {
    return addSketchFeature(doc, planeId, name);
  }, [doc]);

  const addExtrude = useCallback((
    sketchId: string,
    distance: number,
    op: 'add' | 'cut' = 'add',
    direction: 'normal' | 'reverse' = 'normal'
  ) => {
    return addExtrudeFeature(doc, sketchId, distance, op, direction);
  }, [doc]);

  const addRevolve = useCallback((
    sketchId: string,
    axis: string,
    angle: number,
    op: 'add' | 'cut' = 'add'
  ) => {
    return addRevolveFeature(doc, sketchId, axis, angle, op);
  }, [doc]);

  const getFeatureById = useCallback((id: string): Feature | null => {
    const element = findFeature(doc.features, id);
    return element ? parseFeature(element) : null;
  }, [doc]);

  const value: DocumentContextValue = {
    doc,
    features,
    rebuildGate,
    setRebuildGate,
    undoManager,
    undo,
    redo,
    canUndo,
    canRedo,
    units,
    setUnits,
    addSketch,
    addExtrude,
    addRevolve,
    getFeatureById,
  };

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useDocument() {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error('useDocument must be used within DocumentProvider');
  }
  return ctx;
}
