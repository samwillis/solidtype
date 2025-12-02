/**
 * useModelBuild Hook
 * 
 * Manages the model build pipeline:
 * 1. Subscribes to TS analysis results (jsBundle)
 * 2. Sends transpiled JS to model worker
 * 3. Returns build results (checkpoints, meshes, errors)
 * 
 * Only triggers a build when:
 * - TS diagnostics are clean (no errors)
 * - jsBundle has changed since last build
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTsAnalysis } from './useTsAnalysis';
import type { FeatureCheckpoint, BuiltBodyHandle, ModelingError } from '@solidtype/dsl';
import type {
  ModelWorkerMessage,
  ModelWorkerResponse,
  SerializedMesh,
} from '../workers/model-worker.types';

export interface ModelBuildState {
  /** Whether the model is currently building */
  isBuilding: boolean;
  /** Whether the last build was successful */
  success: boolean;
  /** Built bodies */
  bodies: BuiltBodyHandle[];
  /** Feature checkpoints for the tree */
  checkpoints: FeatureCheckpoint[];
  /** Meshes for rendering */
  meshes: SerializedMesh[];
  /** Modeling errors */
  errors: ModelingError[];
  /** Runtime error from code execution */
  runtimeError?: string;
  /** Last valid checkpoint (for partial builds) */
  lastValidCheckpointId?: string;
}

const initialState: ModelBuildState = {
  isBuilding: false,
  success: false,
  bodies: [],
  checkpoints: [],
  meshes: [],
  errors: [],
};

/**
 * Hook for building models from DSL code
 */
export function useModelBuild(): ModelBuildState {
  const { diagnostics, jsBundle, isLoading: tsLoading } = useTsAnalysis();
  const [state, setState] = useState<ModelBuildState>(initialState);
  
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const currentRequestIdRef = useRef(0);
  const lastBundleHashRef = useRef<string>('');

  // Initialize worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/model-worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent<ModelWorkerResponse>) => {
        const response = event.data;
        
        // Ignore stale responses
        if (response.requestId < currentRequestIdRef.current) {
          return;
        }

        if (response.kind === 'buildResult') {
          setState({
            isBuilding: false,
            success: true,
            bodies: response.bodies,
            checkpoints: response.checkpoints,
            meshes: response.meshes,
            errors: [],
            lastValidCheckpointId: response.lastValidCheckpointId,
          });
        } else {
          setState({
            isBuilding: false,
            success: false,
            bodies: [],
            checkpoints: response.partialCheckpoints ?? [],
            meshes: response.partialMeshes ?? [],
            errors: response.errors,
            runtimeError: response.runtimeError,
            lastValidCheckpointId: response.lastValidCheckpointId,
          });
        }
      };

      worker.onerror = (err) => {
        console.error('[useModelBuild] Worker error:', err);
        setState(prev => ({
          ...prev,
          isBuilding: false,
          success: false,
          runtimeError: `Worker error: ${err.message}`,
        }));
      };

      workerRef.current = worker;

      return () => {
        worker.terminate();
      };
    } catch (err) {
      console.error('[useModelBuild] Failed to create worker:', err);
      return undefined;
    }
  }, []);

  // Create a hash of the bundle for change detection
  const getBundleHash = useCallback((bundle: Record<string, string>): string => {
    const keys = Object.keys(bundle).sort();
    return keys.map(k => `${k}:${bundle[k].length}`).join('|');
  }, []);

  // Build when bundle changes and there are no TS errors
  useEffect(() => {
    if (tsLoading || !workerRef.current) return;

    // Check for TypeScript errors
    const hasErrors = diagnostics.some(d => d.category === 'error');
    if (hasErrors) {
      // Don't build if there are TS errors
      return;
    }

    // Check if bundle has changed
    const bundleHash = getBundleHash(jsBundle);
    if (bundleHash === lastBundleHashRef.current) {
      return;
    }
    lastBundleHashRef.current = bundleHash;

    // Get the Part.tsx code
    const jsCode = jsBundle['Part.tsx'];
    if (!jsCode) {
      // No Part.tsx file, nothing to build
      return;
    }

    // Start build
    const requestId = ++requestIdRef.current;
    currentRequestIdRef.current = requestId;
    
    setState(prev => ({ ...prev, isBuilding: true }));

    const message: ModelWorkerMessage = {
      kind: 'buildModel',
      requestId,
      jsCode,
      entryFunction: 'Part',
      props: {},
    };

    workerRef.current.postMessage(message);
  }, [diagnostics, jsBundle, tsLoading, getBundleHash]);

  return state;
}

/**
 * Hook to trigger a rebuild with specific props
 */
export function useModelRebuild() {
  const workerRef = useRef<Worker | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/model-worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const rebuild = useCallback((
    jsCode: string,
    props: Record<string, unknown> = {}
  ): Promise<ModelWorkerResponse> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({
          kind: 'buildError',
          requestId: 0,
          success: false,
          errors: [],
          runtimeError: 'Worker not initialized',
        });
        return;
      }

      setIsRebuilding(true);

      const handler = (event: MessageEvent<ModelWorkerResponse>) => {
        workerRef.current?.removeEventListener('message', handler);
        setIsRebuilding(false);
        resolve(event.data);
      };

      workerRef.current.addEventListener('message', handler);

      workerRef.current.postMessage({
        kind: 'buildModel',
        requestId: Date.now(),
        jsCode,
        entryFunction: 'Part',
        props,
      } as ModelWorkerMessage);
    });
  }, []);

  return { rebuild, isRebuilding };
}
