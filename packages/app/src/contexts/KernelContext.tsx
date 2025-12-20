/**
 * KernelContext - provides access to the CAD kernel running in a Web Worker
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDocument } from './DocumentContext';
import { YjsWorkerSync } from '../worker/YjsWorkerSync';
import { findFeature, getSketchData, setSketchData } from '../document/featureHelpers';
import type {
  WorkerToMainMessage,
  TransferableMesh,
  BuildError,
  BodyInfo,
  FeatureStatus,
} from '../worker/types';

// ============================================================================
// Context Types
// ============================================================================

interface KernelContextValue {
  /** Map of body IDs to their meshes */
  meshes: Map<string, TransferableMesh>;
  /** Current build errors */
  errors: BuildError[];
  /** Feature status from last rebuild */
  featureStatus: Record<string, FeatureStatus>;
  /** Body info from last rebuild */
  bodies: BodyInfo[];
  /** Whether a rebuild is in progress */
  isRebuilding: boolean;
  /** Whether the worker is ready */
  isReady: boolean;
}

// ============================================================================
// Context
// ============================================================================

const KernelContext = createContext<KernelContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface KernelProviderProps {
  children: React.ReactNode;
}

export function KernelProvider({ children }: KernelProviderProps) {
  const { doc } = useDocument();
  const workerRef = useRef<Worker | null>(null);
  const syncRef = useRef<YjsWorkerSync | null>(null);

  const [meshes, setMeshes] = useState<Map<string, TransferableMesh>>(
    new Map()
  );
  const [errors, setErrors] = useState<BuildError[]>([]);
  const [featureStatus, setFeatureStatus] = useState<
    Record<string, FeatureStatus>
  >({});
  const [bodies, setBodies] = useState<BodyInfo[]>([]);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Create kernel worker
    const worker = new Worker(
      new URL('../worker/kernel.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // Set up Yjs sync
    const sync = new YjsWorkerSync(doc.ydoc, worker);
    syncRef.current = sync;

    // Handle messages from worker
    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'ready':
          setIsReady(true);
          break;

        case 'rebuild-start':
          setIsRebuilding(true);
          // Clear old meshes at start of rebuild
          setMeshes(new Map());
          break;

        case 'rebuild-complete':
          setErrors(msg.errors);
          setFeatureStatus(msg.featureStatus);
          setBodies(msg.bodies);
          setIsRebuilding(false);
          break;

        case 'mesh':
          setMeshes((prev) => {
            const next = new Map(prev);
            next.set(msg.bodyId, msg.mesh);
            return next;
          });
          break;

        case 'sketch-solved': {
          const sketchEl = findFeature(doc.features, msg.sketchId);
          if (sketchEl) {
            const data = getSketchData(sketchEl);

            let changed = false;
            for (const solved of msg.points) {
              const p = data.points.find((pt) => pt.id === solved.id);
              if (!p) continue;
              const dx = solved.x - p.x;
              const dy = solved.y - p.y;
              if (Math.hypot(dx, dy) > 1e-9) {
                p.x = solved.x;
                p.y = solved.y;
                changed = true;
              }
            }

            if (changed) {
              // Apply as a normal local change so the worker mirror also sees it
              // (this converges quickly because the worker will stop emitting once stable).
              doc.ydoc.transact(() => {
                setSketchData(sketchEl, data);
              });
            }
          }
          break;
        }

        case 'error':
          console.error('Kernel worker error:', msg.message);
          setIsRebuilding(false);
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('Kernel worker error:', err);
      setIsRebuilding(false);
    };

    return () => {
      sync.disconnect();
      worker.terminate();
    };
  }, [doc]);

  const value: KernelContextValue = {
    meshes,
    errors,
    featureStatus,
    bodies,
    isRebuilding,
    isReady,
  };

  return (
    <KernelContext.Provider value={value}>{children}</KernelContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useKernel() {
  const ctx = useContext(KernelContext);
  if (!ctx) {
    throw new Error('useKernel must be used within KernelProvider');
  }
  return ctx;
}
