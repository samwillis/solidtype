/**
 * Types for kernel worker communication
 */

// ============================================================================
// Message Types: Main Thread → Worker
// ============================================================================

export interface InitSyncMessage {
  type: "init-sync";
  port: MessagePort;
}

export interface YjsInitMessage {
  type: "yjs-init";
  data: Uint8Array;
}

export interface YjsUpdateMessage {
  type: "yjs-update";
  data: Uint8Array;
}

export interface PreviewExtrudeMessage {
  type: "preview-extrude";
  sketchId: string;
  distance: number;
  direction: "normal" | "reverse";
  op: "add" | "cut";
}

export interface PreviewRevolveMessage {
  type: "preview-revolve";
  sketchId: string;
  axis: string;
  angle: number;
  op: "add" | "cut";
}

export interface ClearPreviewMessage {
  type: "clear-preview";
}

export interface ExportStlMessage {
  type: "export-stl";
  binary?: boolean;
  name?: string;
}

export interface ExportJsonMessage {
  type: "export-json";
}

export interface ExportStepMessage {
  type: "export-step";
  name?: string;
}

export type MainToWorkerMessage =
  | InitSyncMessage
  | YjsInitMessage
  | YjsUpdateMessage
  | PreviewExtrudeMessage
  | PreviewRevolveMessage
  | ClearPreviewMessage
  | ExportStlMessage
  | ExportJsonMessage
  | ExportStepMessage;

// ============================================================================
// Message Types: Worker → Main Thread
// ============================================================================

export interface ReadyMessage {
  type: "ready";
}

export interface RebuildStartMessage {
  type: "rebuild-start";
}

export interface RebuildCompleteMessage {
  type: "rebuild-complete";
  bodies: BodyInfo[];
  featureStatus: Record<string, FeatureStatus>;
  errors: BuildError[];
  /**
   * Map from bodyKey to arrays of encoded PersistentRef strings
   * @see docs/CAD-PIPELINE-REWORK.md Phase 3
   */
  referenceIndex?: {
    [bodyKey: string]: {
      /** Encoded PersistentRef strings, indexed by faceIndex */
      faces: string[];
      /** Encoded PersistentRef strings, indexed by edgeIndex */
      edges: string[];
    };
  };
}

export interface MeshMessage {
  type: "mesh";
  bodyId: string;
  mesh: TransferableMesh;
  /** Body color (hex string like "#6699cc") */
  color?: string;
}

/** Plane transform for converting between sketch 2D and world 3D coordinates */
export interface PlaneTransform {
  /** Origin point of the plane in world coordinates */
  origin: [number, number, number];
  /** X direction of the sketch coordinate system in world coordinates (unit vector) */
  xDir: [number, number, number];
  /** Y direction of the sketch coordinate system in world coordinates (unit vector) */
  yDir: [number, number, number];
  /** Normal direction of the plane in world coordinates (unit vector) */
  normal: [number, number, number];
}

export interface SketchSolvedMessage {
  type: "sketch-solved";
  sketchId: string;
  points: Array<{ id: string; x: number; y: number }>;
  status: string;
  /** Plane transform for this sketch */
  planeTransform?: PlaneTransform;
  dof?: {
    totalDOF: number;
    constrainedDOF: number;
    remainingDOF: number;
    isFullyConstrained: boolean;
    isOverConstrained: boolean;
  };
}

export interface PreviewErrorMessage {
  type: "preview-error";
  message: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface StlExportedMessage {
  type: "stl-exported";
  /** Binary STL data (if binary format) */
  buffer?: ArrayBuffer;
  /** ASCII STL content (if ASCII format) */
  content?: string;
}

export interface JsonExportedMessage {
  type: "json-exported";
  content: string;
}

export interface StepExportedMessage {
  type: "step-exported";
  /** Binary STEP data */
  buffer: ArrayBuffer;
}

export type WorkerToMainMessage =
  | ReadyMessage
  | RebuildStartMessage
  | RebuildCompleteMessage
  | MeshMessage
  | SketchSolvedMessage
  | PreviewErrorMessage
  | ErrorMessage
  | StlExportedMessage
  | JsonExportedMessage
  | StepExportedMessage;

// ============================================================================
// Shared Types
// ============================================================================

export type FeatureStatus = "computed" | "error" | "suppressed" | "gated";

export interface BuildError {
  featureId: string;
  code:
    | "NO_CLOSED_PROFILE"
    | "SELF_INTERSECTING"
    | "INVALID_REFERENCE"
    | "BUILD_ERROR"
    | "SKETCH_NOT_FOUND";
  message: string;
}

export interface BodyInfo {
  id: string;
  featureId: string;
  faceCount: number;
  /** Display name for the body */
  name?: string;
  /** Display color for the body (hex string like "#6699cc") */
  color?: string;
}

export interface TransferableMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Maps triangle index to face ID for 3D selection */
  faceMap?: Uint32Array;
  /** B-Rep edge line segments [x1,y1,z1, x2,y2,z2, ...] for CAD-style edge rendering */
  edges?: Float32Array;
  /** Maps each edge segment to its edge index for 3D edge selection */
  edgeMap?: Uint32Array;
}

/** Request to resolve a persistent reference */
export interface ResolveRefMessage {
  type: "resolve-ref";
  ref: string;
  requestId: string;
}

/** Response for resolved reference */
export interface ResolveRefResultMessage {
  type: "resolve-ref-result";
  requestId: string;
  result: { faceId: number; bodyId: string } | null;
}
