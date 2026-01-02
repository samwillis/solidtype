/**
 * Document Context - provides access to the Yjs document throughout the app
 *
 * Supports two modes:
 * 1. Local mode (no documentId) - creates a new local-only document
 * 2. Cloud mode (with documentId) - loads document from Durable Streams
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import * as Y from "yjs";
import { createDocument, loadDocument, type SolidTypeDoc } from "../document/createDocument";
import {
  getAllFeatures,
  parseFeature,
  addSketchFeature,
  addExtrudeFeature,
  addRevolveFeature,
  addBooleanFeature,
  addOffsetPlane as addOffsetPlaneFeature,
  addAxisFeature,
  deleteFeature,
  renameFeature,
  toggleFeatureVisibility,
} from "../document/featureHelpers";
import type { AxisFeatureOptions } from "../document/featureHelpers";
import type { Feature } from "../document/schema";
import { createDocumentSync, type DocumentSync } from "../../lib/yjs-sync";
import { SolidTypeAwareness } from "../../lib/awareness-provider";
import { useSession } from "../../lib/auth-client";

// ============================================================================
// Context Types
// ============================================================================

/** Supported unit systems */
export type DocumentUnits = "mm" | "cm" | "m" | "in" | "ft";

/** Sync status for cloud documents */
export type SyncStatus = "disconnected" | "connecting" | "connected" | "synced" | "error";

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
    op?: "add" | "cut",
    direction?: "normal" | "reverse"
  ) => string;
  addRevolve: (sketchId: string, axis: string, angle: number, op?: "add" | "cut") => string;
  /** Add a boolean operation (Phase 17) */
  addBoolean: (
    operation: "union" | "subtract" | "intersect",
    target: string,
    tool: string
  ) => string;
  /** Add an offset plane from a datum plane or face */
  addOffsetPlane: (basePlaneId: string, offset: number, name?: string) => string;
  /** Add an axis feature */
  addAxis: (options: AxisFeatureOptions) => string;
  getFeatureById: (id: string) => Feature | null;
  deleteFeature: (id: string) => boolean;
  renameFeature: (id: string, name: string) => boolean;
  toggleVisibility: (id: string) => boolean;
  // Cloud sync status (only when documentId is provided)
  syncStatus: SyncStatus;
  isCloudDocument: boolean;
  syncError: Error | null;
  // Awareness for presence (only available for cloud documents)
  awareness: SolidTypeAwareness | null;
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
  documentId?: string; // Optional: if provided, load document from database
}

export function DocumentProvider({ children, documentId }: DocumentProviderProps) {
  // Track whether we're loading a cloud document
  const isCloudDocument = Boolean(documentId);

  // Get session for user info (needed for awareness)
  const { data: session } = useSession();

  // Sync state for cloud documents
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isCloudDocument ? "connecting" : "synced"
  );
  const [syncError, setSyncError] = useState<Error | null>(null);

  // Document sync instance (only for cloud documents)
  const syncRef = useRef<DocumentSync | null>(null);

  // Awareness provider (only for cloud documents)
  const [awareness, setAwareness] = useState<SolidTypeAwareness | null>(null);

  // For cloud documents, we create the Y.Doc first and populate it AFTER sync
  // to avoid conflicts between local initialization and remote data
  const ydoc = useMemo(() => {
    if (isCloudDocument) {
      // Create empty Y.Doc - will be populated by sync
      return new Y.Doc();
    }
    return null;
  }, [isCloudDocument]);

  // For local documents, create immediately with defaults
  const localDoc = useMemo(() => {
    if (!isCloudDocument) {
      return createDocument();
    }
    return null;
  }, [isCloudDocument]);

  // Cloud document wrapper - created AFTER sync completes
  const [cloudDoc, setCloudDoc] = useState<SolidTypeDoc | null>(null);

  // The active document (either local or cloud)
  const doc = localDoc || cloudDoc;

  // Connect to Durable Streams for cloud documents
  useEffect(() => {
    if (!isCloudDocument || !documentId || !ydoc) {
      return;
    }

    // Create sync provider
    const sync = createDocumentSync(documentId, ydoc);
    syncRef.current = sync;

    // Set up status listeners
    const unsubStatus = sync.onStatus((status) => {
      if (status === "connected") {
        setSyncStatus("connected");
      } else if (status === "connecting") {
        setSyncStatus("connecting");
      } else {
        setSyncStatus("disconnected");
      }
    });

    const unsubSynced = sync.onSynced((synced) => {
      if (synced) {
        setSyncStatus("synced");
        setSyncError(null);

        // Now that sync is complete, check if we have data or need to initialize
        const root = ydoc.getMap("root");
        const hasData =
          root.has("featureOrder") && (root.get("featureOrder") as Y.Array<string>).length > 0;

        console.debug(
          `[DocumentContext] Document synced, hasData=${hasData}, root keys:`,
          Array.from(root.keys())
        );

        if (!hasData) {
          // New/empty document - create structure and default features
          console.debug(`[DocumentContext] Initializing empty document with default features`);
          ydoc.transact(() => {
            // Initialize structure if needed
            if (!root.has("meta")) {
              root.set("meta", new Y.Map());
            }
            if (!root.has("state")) {
              root.set("state", new Y.Map());
            }
            if (!root.has("featuresById")) {
              root.set("featuresById", new Y.Map());
            }
            if (!root.has("featureOrder")) {
              root.set("featureOrder", new Y.Array());
            }

            // Initialize meta
            const meta = root.get("meta") as Y.Map<unknown>;
            meta.set("schemaVersion", 2);
            meta.set("name", "Untitled");
            meta.set("created", Date.now());
            meta.set("modified", Date.now());
            meta.set("units", "mm");

            // Initialize state
            const state = root.get("state") as Y.Map<unknown>;
            state.set("rebuildGate", null);
          }, "system");
        }

        // Now create the document wrapper with the actual data
        const wrappedDoc = loadDocument(ydoc);

        // If document was empty, create default features
        if (!hasData) {
          ydoc.transact(() => {
            createDefaultFeatures(wrappedDoc);
          }, "system");
        }

        setCloudDoc(wrappedDoc);
      }
    });

    const unsubError = sync.onError((error) => {
      console.error("[DocumentContext] Sync error:", error);
      setSyncStatus("error");
      setSyncError(error);
    });

    // Connect to streams
    sync.connect();

    // Cleanup on unmount
    return () => {
      unsubStatus();
      unsubSynced();
      unsubError();
      sync.destroy();
      syncRef.current = null;
      setCloudDoc(null);
    };
  }, [isCloudDocument, documentId, ydoc]);

  // Create awareness wrapper for cloud documents (needs session for user info)
  // This wraps the awareness from the document sync provider - NOT a separate connection
  useEffect(() => {
    if (!isCloudDocument || !documentId || !session?.user || !syncRef.current) {
      setAwareness(null);
      return;
    }

    // Get the awareness from the document sync provider
    const syncAwareness = syncRef.current.awareness;

    // Create awareness wrapper with user info (uses the EXISTING awareness, doesn't create a new connection)
    const awarenessProvider = new SolidTypeAwareness(
      syncAwareness,
      documentId,
      "main", // TODO: Get actual branch ID when branching is fully wired
      {
        id: session.user.id,
        name: session.user.name || session.user.email || "Anonymous",
      }
    );

    // Connect is now a no-op since the document sync provider handles the connection
    awarenessProvider.connect();

    setAwareness(awarenessProvider);

    // Cleanup on unmount
    return () => {
      awarenessProvider.disconnect();
      setAwareness(null);
    };
  }, [isCloudDocument, documentId, session?.user, syncStatus]); // Use syncStatus to re-run when connected

  // Create undo manager - track featuresById, featureOrder, and state
  // Only created once doc is available
  const undoManager = useMemo(() => {
    if (!doc) return null;
    return new Y.UndoManager([doc.featuresById, doc.featureOrder, doc.state], {
      trackedOrigins: new Set([null, "local"]),
    });
  }, [doc]);

  // Local state
  const [rebuildGate, setRebuildGateState] = useState<string | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [units, setUnitsState] = useState<DocumentUnits>("mm");

  // Sync rebuild gate from Yjs
  useEffect(() => {
    if (!doc) return;
    const state = doc.state;
    const updateGate = () => {
      setRebuildGateState(state.get("rebuildGate") as string | null);
    };
    updateGate();
    state.observe(updateGate);
    return () => state.unobserve(updateGate);
  }, [doc]);

  // Sync units from Yjs meta
  useEffect(() => {
    if (!doc) return;
    const meta = doc.meta;
    const updateUnits = () => {
      const u = meta.get("units") as DocumentUnits | undefined;
      setUnitsState(u ?? "mm");
    };
    updateUnits();
    meta.observe(updateUnits);
    return () => meta.unobserve(updateUnits);
  }, [doc]);

  // Sync features from Yjs
  useEffect(() => {
    if (!doc) return;
    const updateFeatures = () => {
      const parsed = getAllFeatures(doc);
      setFeatures(parsed);
    };

    updateFeatures();

    // Observe both featuresById and featureOrder
    const handleFeaturesChange = () => updateFeatures();
    doc.featuresById.observeDeep(handleFeaturesChange);
    doc.featureOrder.observe(handleFeaturesChange);

    return () => {
      doc.featuresById.unobserveDeep(handleFeaturesChange);
      doc.featureOrder.unobserve(handleFeaturesChange);
    };
  }, [doc]);

  // Track undo/redo state
  useEffect(() => {
    if (!undoManager) return;
    const updateUndoState = () => {
      setCanUndo(undoManager.undoStack.length > 0);
      setCanRedo(undoManager.redoStack.length > 0);
    };

    undoManager.on("stack-item-added", updateUndoState);
    undoManager.on("stack-item-popped", updateUndoState);

    return () => {
      undoManager.off("stack-item-added", updateUndoState);
      undoManager.off("stack-item-popped", updateUndoState);
    };
  }, [undoManager]);

  // Actions - all require doc to be available
  const setRebuildGate = useCallback(
    (featureId: string | null) => {
      if (!doc) return;
      doc.state.set("rebuildGate", featureId);
    },
    [doc]
  );

  const setUnits = useCallback(
    (newUnits: DocumentUnits) => {
      if (!doc) return;
      doc.meta.set("units", newUnits);
    },
    [doc]
  );

  const undo = useCallback(() => {
    undoManager?.undo();
  }, [undoManager]);

  const redo = useCallback(() => {
    undoManager?.redo();
  }, [undoManager]);

  const addSketch = useCallback(
    (planeId: string, name?: string) => {
      if (!doc) return "";
      return addSketchFeature(doc, planeId, name);
    },
    [doc]
  );

  const addExtrude = useCallback(
    (
      sketchId: string,
      distance: number,
      op: "add" | "cut" = "add",
      direction: "normal" | "reverse" = "normal"
    ) => {
      if (!doc) return "";
      return addExtrudeFeature(doc, sketchId, distance, op, direction);
    },
    [doc]
  );

  const addRevolve = useCallback(
    (sketchId: string, axis: string, angle: number, op: "add" | "cut" = "add") => {
      if (!doc) return "";
      return addRevolveFeature(doc, sketchId, axis, angle, op);
    },
    [doc]
  );

  const addBoolean = useCallback(
    (operation: "union" | "subtract" | "intersect", target: string, tool: string) => {
      if (!doc) return "";
      return addBooleanFeature(doc, { operation, target, tool });
    },
    [doc]
  );

  const addOffsetPlane = useCallback(
    (basePlaneId: string, offset: number, name?: string) => {
      if (!doc) return "";
      return addOffsetPlaneFeature(doc, {
        baseRef: { kind: "planeFeatureId", ref: basePlaneId },
        offset,
        name,
      });
    },
    [doc]
  );

  const addAxis = useCallback(
    (options: AxisFeatureOptions) => {
      if (!doc) return "";
      return addAxisFeature(doc, options);
    },
    [doc]
  );

  const getFeatureById = useCallback(
    (id: string): Feature | null => {
      if (!doc) return null;
      const featureMap = doc.featuresById.get(id);
      return featureMap ? parseFeature(featureMap) : null;
    },
    [doc]
  );

  const handleDeleteFeature = useCallback(
    (id: string): boolean => {
      if (!doc) return false;
      // If deleting the gated feature, clear the gate
      if (rebuildGate === id) {
        doc.state.set("rebuildGate", null);
      }
      return deleteFeature(doc, id);
    },
    [doc, rebuildGate]
  );

  const handleRenameFeature = useCallback(
    (id: string, name: string): boolean => {
      if (!doc) return false;
      return renameFeature(doc, id, name);
    },
    [doc]
  );

  const handleToggleVisibility = useCallback(
    (id: string): boolean => {
      if (!doc) return false;
      return toggleFeatureVisibility(doc, id);
    },
    [doc]
  );

  // If cloud document is still loading (doc is null), show loading spinner
  // Don't render children to prevent crashes from accessing doc properties
  if (!doc) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "var(--bg-primary, #1a1a1a)",
          color: "var(--text-secondary, #888)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <div>Loading document...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const value: DocumentContextValue = {
    doc,
    features,
    rebuildGate,
    setRebuildGate,
    undoManager: undoManager!,
    undo,
    redo,
    canUndo,
    canRedo,
    units,
    setUnits,
    addSketch,
    addExtrude,
    addRevolve,
    addBoolean,
    addOffsetPlane,
    addAxis,
    getFeatureById,
    deleteFeature: handleDeleteFeature,
    renameFeature: handleRenameFeature,
    toggleVisibility: handleToggleVisibility,
    // Cloud sync info
    syncStatus,
    isCloudDocument,
    syncError,
    // Awareness for presence
    awareness,
  };

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useDocument() {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error("useDocument must be used within DocumentProvider");
  }
  return ctx;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create default features for an empty cloud document
 * (Origin + 3 datum planes)
 */
function createDefaultFeatures(doc: SolidTypeDoc): void {
  const uuid = () => crypto.randomUUID();

  const DEFAULT_PLANE_WIDTH = 100;
  const DEFAULT_PLANE_HEIGHT = 100;

  // Generate UUIDs for default features
  const originId = uuid();
  const xyPlaneId = uuid();
  const xzPlaneId = uuid();
  const yzPlaneId = uuid();

  const createFeatureMap = () => new Y.Map<unknown>();
  const setMapProperties = (map: Y.Map<unknown>, props: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(props)) {
      map.set(key, value);
    }
  };

  // Add origin
  const origin = createFeatureMap();
  doc.featuresById.set(originId, origin);
  setMapProperties(origin, {
    id: originId,
    type: "origin",
    name: "Origin",
    visible: false,
  });

  // Add XY plane
  const xyPlane = createFeatureMap();
  doc.featuresById.set(xyPlaneId, xyPlane);
  setMapProperties(xyPlane, {
    id: xyPlaneId,
    type: "plane",
    name: "XY Plane",
    role: "xy",
    normal: [0, 0, 1],
    origin: [0, 0, 0],
    xDir: [1, 0, 0],
    visible: true,
    width: DEFAULT_PLANE_WIDTH,
    height: DEFAULT_PLANE_HEIGHT,
    offsetX: 0,
    offsetY: 0,
  });

  // Add XZ plane
  const xzPlane = createFeatureMap();
  doc.featuresById.set(xzPlaneId, xzPlane);
  setMapProperties(xzPlane, {
    id: xzPlaneId,
    type: "plane",
    name: "XZ Plane",
    role: "xz",
    normal: [0, 1, 0],
    origin: [0, 0, 0],
    xDir: [1, 0, 0],
    visible: true,
    width: DEFAULT_PLANE_WIDTH,
    height: DEFAULT_PLANE_HEIGHT,
    offsetX: 0,
    offsetY: 0,
  });

  // Add YZ plane
  const yzPlane = createFeatureMap();
  doc.featuresById.set(yzPlaneId, yzPlane);
  setMapProperties(yzPlane, {
    id: yzPlaneId,
    type: "plane",
    name: "YZ Plane",
    role: "yz",
    normal: [1, 0, 0],
    origin: [0, 0, 0],
    xDir: [0, 1, 0],
    visible: true,
    width: DEFAULT_PLANE_WIDTH,
    height: DEFAULT_PLANE_HEIGHT,
    offsetX: 0,
    offsetY: 0,
  });

  // Pinned order: [origin, xy, xz, yz]
  doc.featureOrder.push([originId, xyPlaneId, xzPlaneId, yzPlaneId]);
}
