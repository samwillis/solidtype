/**
 * KernelContext - provides access to the CAD kernel running in a Web Worker
 */

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useDocument } from "./DocumentContext";
import { YjsWorkerSync } from "../worker/YjsWorkerSync";
import { findFeature, getSketchDataAsArrays, setSketchData } from "../document/featureHelpers";
import type {
  WorkerToMainMessage,
  TransferableMesh,
  BuildError,
  BodyInfo,
  FeatureStatus,
  PlaneTransform,
  RebuildCompleteMessage,
} from "../worker/types";

// ============================================================================
// Context Types
// ============================================================================

/** Type for the ReferenceIndex from the worker (Phase 3) */
type ReferenceIndex = RebuildCompleteMessage["referenceIndex"];

interface KernelContextValue {
  /** Map of body IDs to their meshes */
  meshes: Map<string, TransferableMesh>;
  /** Current build errors */
  errors: BuildError[];
  /** Feature status from last rebuild */
  featureStatus: Record<string, FeatureStatus>;
  /** Body info from last rebuild */
  bodies: BodyInfo[];
  /** Reference index mapping mesh indices to PersistentRefs (Phase 3) */
  referenceIndex: ReferenceIndex;
  /** Whether a rebuild is in progress */
  isRebuilding: boolean;
  /** Whether the worker is ready */
  isReady: boolean;
  /** Send a live preview request for extrude */
  previewExtrude: (args: {
    sketchId: string;
    distance: number;
    direction: "normal" | "reverse";
    op: "add" | "cut";
  }) => void;
  /** Send a live preview request for revolve */
  previewRevolve: (args: {
    sketchId: string;
    axis: string;
    angle: number;
    op: "add" | "cut";
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
  /** Plane transforms for sketches (from kernel) */
  sketchPlaneTransforms: Record<string, PlaneTransform>;
  /** Export model to STL format (Phase 18) */
  exportStl: (options?: { binary?: boolean; name?: string }) => Promise<ArrayBuffer | string>;
  /** Export model to STEP format */
  exportStep: (options?: { name?: string }) => Promise<ArrayBuffer>;
  /** Export full document JSON for debugging/support */
  exportJson: () => Promise<string>;
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

  // For STL export promise resolution (Phase 18)
  const stlResolveRef = useRef<{
    resolve: (value: ArrayBuffer | string) => void;
    reject: (reason: Error) => void;
  } | null>(null);
  // For STEP export promise resolution
  const stepResolveRef = useRef<{
    resolve: (value: ArrayBuffer) => void;
    reject: (reason: Error) => void;
  } | null>(null);
  // For JSON export promise resolution
  const jsonResolveRef = useRef<{
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
  } | null>(null);

  const [meshes, setMeshes] = useState<Map<string, TransferableMesh>>(new Map());
  const [errors, setErrors] = useState<BuildError[]>([]);
  const [featureStatus, setFeatureStatus] = useState<Record<string, FeatureStatus>>({});
  const [bodies, setBodies] = useState<BodyInfo[]>([]);
  const [referenceIndex, setReferenceIndex] = useState<ReferenceIndex>(undefined);
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
  const [sketchPlaneTransforms, setSketchPlaneTransforms] = useState<
    Record<string, PlaneTransform>
  >({});

  useEffect(() => {
    // Don't create worker until doc is loaded
    if (!doc) return;

    // Create kernel worker
    const worker = new Worker(new URL("../worker/kernel.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    // Set up Yjs sync
    const sync = new YjsWorkerSync(doc.ydoc, worker);
    syncRef.current = sync;

    // Handle messages from worker
    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "ready":
          setIsReady(true);
          break;

        case "rebuild-start":
          console.log("[Kernel] Rebuild starting");
          setIsRebuilding(true);
          // Clear old meshes at start of rebuild
          setMeshes(new Map());
          break;

        case "rebuild-complete":
          console.log(
            "[Kernel] Rebuild complete, bodies:",
            msg.bodies.length,
            "errors:",
            msg.errors.length
          );
          if (msg.errors.length > 0) {
            console.log("[Kernel] Errors:", msg.errors);
          }
          setErrors(msg.errors);
          setFeatureStatus(msg.featureStatus);
          setBodies(msg.bodies);
          setReferenceIndex(msg.referenceIndex);
          setIsRebuilding(false);
          break;

        case "mesh":
          console.log("[Kernel] Received mesh for body:", msg.bodyId);
          setMeshes((prev) => {
            const next = new Map(prev);
            next.set(msg.bodyId, msg.mesh);
            return next;
          });
          break;

        case "preview-error":
          setPreviewError(msg.message);
          break;

        case "sketch-solved": {
          setSketchSolveInfo((prev) => ({
            ...prev,
            [msg.sketchId]: { status: msg.status, dof: msg.dof },
          }));

          // Store the plane transform for this sketch
          if (msg.planeTransform) {
            setSketchPlaneTransforms((prev) => ({
              ...prev,
              [msg.sketchId]: msg.planeTransform!,
            }));
          }

          const sketchEl = findFeature(doc.featuresById, msg.sketchId);
          if (sketchEl) {
            const data = getSketchDataAsArrays(sketchEl);

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

        case "stl-exported":
          if (stlResolveRef.current) {
            if (msg.buffer) {
              stlResolveRef.current.resolve(msg.buffer);
            } else if (msg.content) {
              stlResolveRef.current.resolve(msg.content);
            } else {
              stlResolveRef.current.reject(new Error("Invalid STL export response"));
            }
            stlResolveRef.current = null;
          }
          break;

        case "json-exported":
          if (jsonResolveRef.current) {
            jsonResolveRef.current.resolve(msg.content);
            jsonResolveRef.current = null;
          }
          break;

        case "step-exported":
          if (stepResolveRef.current) {
            stepResolveRef.current.resolve(msg.buffer);
            stepResolveRef.current = null;
          }
          break;

        case "error":
          console.error("Kernel worker error:", msg.message);
          // Also reject pending export promises if any
          if (stlResolveRef.current) {
            stlResolveRef.current.reject(new Error(msg.message));
            stlResolveRef.current = null;
          }
          if (stepResolveRef.current) {
            stepResolveRef.current.reject(new Error(msg.message));
            stepResolveRef.current = null;
          }
          if (jsonResolveRef.current) {
            jsonResolveRef.current.reject(new Error(msg.message));
            jsonResolveRef.current = null;
          }
          setIsRebuilding(false);
          break;
      }
    };

    worker.onerror = (err) => {
      console.error("Kernel worker error:", err);
      console.error("Worker error details:", {
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
    direction: "normal" | "reverse";
    op: "add" | "cut";
  }) => {
    setPreviewError(null);
    workerRef.current?.postMessage({
      type: "preview-extrude",
      ...args,
    });
  };

  const previewRevolve = (args: {
    sketchId: string;
    axis: string;
    angle: number;
    op: "add" | "cut";
  }) => {
    setPreviewError(null);
    workerRef.current?.postMessage({
      type: "preview-revolve",
      ...args,
    });
  };

  const clearPreview = () => {
    setPreviewError(null);
    workerRef.current?.postMessage({ type: "clear-preview" });
    setMeshes((prev) => {
      const next = new Map(prev);
      for (const key of Array.from(next.keys())) {
        if (key.startsWith("__preview")) next.delete(key);
      }
      return next;
    });
  };

  // Export STL (Phase 18)
  const exportStl = (options?: {
    binary?: boolean;
    name?: string;
  }): Promise<ArrayBuffer | string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker not ready"));
        return;
      }
      stlResolveRef.current = { resolve, reject };
      workerRef.current.postMessage({
        type: "export-stl",
        binary: options?.binary ?? true,
        name: options?.name ?? "model",
      });
    });
  };

  const exportJson = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker not ready"));
        return;
      }
      jsonResolveRef.current = { resolve, reject };
      workerRef.current.postMessage({ type: "export-json" });
    });
  };

  // Export STEP
  const exportStep = (options?: { name?: string }): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker not ready"));
        return;
      }
      stepResolveRef.current = { resolve, reject };
      workerRef.current.postMessage({
        type: "export-step",
        name: options?.name ?? "model",
      });
    });
  };

  const value: KernelContextValue = {
    meshes,
    errors,
    featureStatus,
    bodies,
    referenceIndex,
    isRebuilding,
    isReady,
    previewExtrude,
    previewRevolve,
    clearPreview,
    previewError,
    sketchSolveInfo,
    sketchPlaneTransforms,
    exportStl,
    exportStep,
    exportJson,
  };

  return <KernelContext.Provider value={value}>{children}</KernelContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useKernel() {
  const ctx = useContext(KernelContext);
  if (!ctx) {
    throw new Error("useKernel must be used within KernelProvider");
  }
  return ctx;
}
