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
  /** Send a live preview request for extrude */
  previewExtrude: (args: {
    sketchId: string;
    distance: number;
    direction: 'normal' | 'reverse';
    op: 'add' | 'cut';
  }) => void;
  /** Send a live preview request for revolve */
  previewRevolve: (args: {
    sketchId: string;
    axis: string;
    angle: number;
    op: 'add' | 'cut';
  }) => void;
  /** Clear any active preview mesh */
  clearPreview: () => void;
  /** Last preview error message (if any) */
  previewError: string | null;
  /** Latest sketch solve status/DOF by sketchId */
  sketchSolveInfo: Record<
    string,
    {
      status: string;
      dof?: {
        totalDOF: number;
        constrainedDOF: number;
        remainingDOF: number;
        isFullyConstrained: boolean;
        isOverConstrained: boolean;
      };
    }
  >;
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
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sketchSolveInfo, setSketchSolveInfo] = useState<
    Record<
      string,
      {
        status: string;
        dof?: {
          totalDOF: number;
          constrainedDOF: number;
          remainingDOF: number;
          isFullyConstrained: boolean;
          isOverConstrained: boolean;
        };
      }
    >
  >({});

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
          console.log('[Kernel] Rebuild starting');
          setIsRebuilding(true);
          // Clear old meshes at start of rebuild
          setMeshes(new Map());
          break;

        case 'rebuild-complete':
          console.log('[Kernel] Rebuild complete, bodies:', msg.bodies.length, 'errors:', msg.errors.length);
          if (msg.errors.length > 0) {
            console.log('[Kernel] Errors:', msg.errors);
          }
          setErrors(msg.errors);
          setFeatureStatus(msg.featureStatus);
          setBodies(msg.bodies);
          setIsRebuilding(false);
          break;

        case 'mesh':
          console.log('[Kernel] Received mesh for body:', msg.bodyId);
          setMeshes((prev) => {
            const next = new Map(prev);
            next.set(msg.bodyId, msg.mesh);
            return next;
          });
          break;

        case 'preview-error':
          setPreviewError(msg.message);
          break;

        case 'sketch-solved': {
          setSketchSolveInfo((prev) => ({
            ...prev,
            [msg.sketchId]: { status: msg.status, dof: msg.dof },
          }));

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
      console.error('Worker error details:', {
        message: err.message,
        filename: err.filename,
        lineno: err.lineno,
        colno: err.colno,
      });
      setIsRebuilding(false);
    };

    return () => {
      sync.disconnect();
      worker.terminate();
    };
  }, [doc]);

  const previewExtrude = (args: {
    sketchId: string;
    distance: number;
    direction: 'normal' | 'reverse';
    op: 'add' | 'cut';
  }) => {
    setPreviewError(null);
    workerRef.current?.postMessage({
      type: 'preview-extrude',
      ...args,
    });
  };

  const previewRevolve = (args: {
    sketchId: string;
    axis: string;
    angle: number;
    op: 'add' | 'cut';
  }) => {
    setPreviewError(null);
    workerRef.current?.postMessage({
      type: 'preview-revolve',
      ...args,
    });
  };

  const clearPreview = () => {
    setPreviewError(null);
    workerRef.current?.postMessage({ type: 'clear-preview' });
    setMeshes((prev) => {
      const next = new Map(prev);
      for (const key of Array.from(next.keys())) {
        if (key.startsWith('__preview')) next.delete(key);
      }
      return next;
    });
  };

  const value: KernelContextValue = {
    meshes,
    errors,
    featureStatus,
    bodies,
    isRebuilding,
    isReady,
    previewExtrude,
    previewRevolve,
    clearPreview,
    previewError,
    sketchSolveInfo,
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
