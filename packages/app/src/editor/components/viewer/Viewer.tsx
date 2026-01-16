/**
 * Viewer - 3D CAD Viewport Component
 *
 * The main 3D rendering viewport for the CAD editor. This is an orchestration
 * component that composes hooks and renderers for:
 * - Three.js scene setup with post-processing (SSAO)
 * - Camera controls (orbit, zoom, pan)
 * - Mesh and edge rendering for solid bodies
 * - Sketch visualization and editing
 * - Face and edge selection with highlighting
 * - Datum plane and origin rendering
 * - Constraint annotations and dimension editing
 * - Multi-user cursor awareness
 *
 * The heavy lifting is done by extracted hooks and renderers in the ./hooks
 * and ./renderers directories.
 */

import React, { useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { useTheme } from "../../contexts/ThemeContext";
import { useViewer, type ProjectionMode } from "../../contexts/ViewerContext";
import { useKernel } from "../../contexts/KernelContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useSketch } from "../../contexts/SketchContext";
import { useDocument } from "../../contexts/DocumentContext";
import { UserCursors3D } from "../UserCursors3D";
import { UserCursor2D } from "../UserCursor2D";
import { SketchCursors } from "../SketchCursors";
import { useFollowing } from "../../../hooks/useFollowing";
import {
  findFeature,
  getSketchDataAsArrays,
  type SketchDataArrays,
} from "../../document/featureHelpers";

// Hooks
import { useSceneSetup } from "./hooks/useSceneSetup";
import { useViewerControls } from "./hooks/useViewerControls";
import { useDimensionEditing } from "./hooks/useDimensionEditing";
import { useSketchTools } from "./hooks/useSketchTools";
import { use3DSelection, type RaycastHit } from "./hooks/use3DSelection";

// Renderers
import { useMeshRenderer } from "./renderers/useMeshRenderer";
import { usePlaneRenderer } from "./renderers/usePlaneRenderer";
import { useOriginRenderer } from "./renderers/useOriginRenderer";
import { useSketchRenderer } from "./renderers/useSketchRenderer";
import { useSelectionRenderer } from "./renderers/useSelectionRenderer";
import { useConstraintRenderer } from "./renderers/useConstraintRenderer";

import "../ToolbarComponents.css";
import "../Viewer.css";

const Viewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Context hooks
  const { theme } = useTheme();
  const { registerRefs, cameraStateRef, state: viewerState } = useViewer();
  const { meshes, bodies, sketchPlaneTransforms, featureStatus } = useKernel();
  const {
    selectedFeatureId,
    hoveredFeatureId,
    selectedFaces,
    selectedEdges,
    hover,
    selectFace,
    selectEdge,
    clearSelection,
    setHover,
  } = useSelection();
  const {
    mode: sketchMode,
    previewLine,
    setPreviewLine,
    setSketchMousePos,
    selectedPoints,
    selectedLines,
    selectedConstraints,
    setSelectedPoints,
    setSelectedLines,
    setSelectedConstraints,
    clearSelection: clearSketchSelection,
    toggleConstraintSelection,
    addPoint,
    addLine,
    addArc,
    addCircle,
    addRectangle,
    addAngledRectangle,
    addConstraint,
    updatePointPosition,
    findNearbyPoint,
  } = useSketch();
  const { doc, features, awareness } = useDocument();

  // Projection mode ref
  const projectionModeRef = useRef<ProjectionMode>("perspective");
  const aoEnabledRef = useRef(true);

  // Update AO state
  React.useEffect(() => {
    aoEnabledRef.current = viewerState.ambientOcclusion;
  }, [viewerState.ambientOcclusion]);

  // Sketch mode ref for controls
  const sketchModeRef = useRef({ active: false, activeTool: "none" });
  React.useEffect(() => {
    sketchModeRef.current = { active: sketchMode.active, activeTool: sketchMode.activeTool };
  }, [sketchMode.active, sketchMode.activeTool]);

  // Scene setup
  const {
    sceneRef,
    cameraRef,
    rendererRef,
    composerRef,
    labelRendererRef,
    targetRef,
    needsRenderRef,
    groupRefs,
    sceneReady,
    requestRender,
  } = useSceneSetup(containerRef);

  // Following setup
  const handleFollowCameraChange = useCallback(
    (camera: {
      cameraPosition: [number, number, number];
      cameraTarget: [number, number, number];
      cameraUp: [number, number, number];
      zoom: number;
    }) => {
      if (!cameraRef.current) return;
      const cam = cameraRef.current;
      cam.position.set(...camera.cameraPosition);
      cam.up.set(...camera.cameraUp);
      targetRef.current.set(...camera.cameraTarget);
      cam.lookAt(targetRef.current);
      needsRenderRef.current = true;
    },
    [cameraRef, targetRef, needsRenderRef]
  );

  const { connectedUsers, followingUserId } = useFollowing({
    awareness,
    onCameraChange: handleFollowCameraChange,
  });

  const followedUser = followingUserId
    ? (connectedUsers.find((u) => u.user.id === followingUserId) ?? null)
    : null;

  // Camera broadcast
  const broadcastCamera = useCallback(() => {
    if (!awareness || !cameraRef.current) return;
    const camera = cameraRef.current;
    const target = targetRef.current;
    awareness.updateViewerState({
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      cameraTarget: [target.x, target.y, target.z],
      cameraUp: [camera.up.x, camera.up.y, camera.up.z],
      zoom: camera.position.distanceTo(target),
    });
  }, [awareness, cameraRef, targetRef]);

  // Viewer controls
  const { updateCamera } = useViewerControls({
    containerRef,
    sceneRef,
    cameraRef,
    rendererRef,
    composerRef,
    labelRendererRef,
    targetRef,
    needsRenderRef,
    edgeGroupRef: groupRefs.edgeGroup,
    cameraStateRef,
    projectionModeRef,
    aoEnabledRef,
    onCameraChange: broadcastCamera,
    sketchModeRef,
    sceneReady,
  });

  // Get sketch data
  const getSketch = useCallback((): SketchDataArrays | null => {
    if (!sketchMode.sketchId) return null;
    const sketch = findFeature(doc.featuresById, sketchMode.sketchId);
    if (!sketch) return null;
    return getSketchDataAsArrays(sketch);
  }, [doc.featuresById, sketchMode.sketchId]);

  // Screen to sketch conversion
  const screenToSketch = useCallback(
    (screenX: number, screenY: number, _planeId: string): { x: number; y: number } | null => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return null;

      const sketchId = sketchMode.sketchId;
      const kernelTransform = sketchId ? sketchPlaneTransforms[sketchId] : null;

      let planePoint: THREE.Vector3;
      let xDir: THREE.Vector3;
      let yDir: THREE.Vector3;
      let planeNormal: THREE.Vector3;

      if (kernelTransform) {
        planePoint = new THREE.Vector3(...kernelTransform.origin);
        xDir = new THREE.Vector3(...kernelTransform.xDir);
        yDir = new THREE.Vector3(...kernelTransform.yDir);
        planeNormal = new THREE.Vector3(...kernelTransform.normal);
      } else if (sketchMode.planeRole) {
        // Fallback to standard datum plane transforms (matching kernel's coordinate system)
        switch (sketchMode.planeRole) {
          case "xy":
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(1, 0, 0);
            yDir = new THREE.Vector3(0, 1, 0);
            planeNormal = new THREE.Vector3(0, 0, 1);
            break;
          case "yz":
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(0, 1, 0);
            yDir = new THREE.Vector3(0, 0, 1);
            planeNormal = new THREE.Vector3(1, 0, 0);
            break;
          case "xz":
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(0, 0, 1);
            yDir = new THREE.Vector3(1, 0, 0);
            planeNormal = new THREE.Vector3(0, 1, 0);
            break;
        }
      } else {
        return null;
      }

      const rect = container.getBoundingClientRect();
      const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);
      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, intersection);

      if (!hit) return null;

      const offset = intersection.clone().sub(planePoint);
      const sketchX = offset.dot(xDir);
      const sketchY = offset.dot(yDir);

      return { x: sketchX, y: sketchY };
    },
    [cameraRef, sketchMode.sketchId, sketchMode.planeRole, sketchPlaneTransforms]
  );

  // Sketch to screen conversion (inverse of screenToSketch)
  // Used for rendering other users' sketch cursors
  const sketchToScreen = useCallback(
    (sketchPoint: [number, number]): { x: number; y: number } | null => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return null;

      const sketchId = sketchMode.sketchId;
      if (!sketchId) return null;

      const kernelTransform = sketchPlaneTransforms[sketchId];

      let planePoint: THREE.Vector3;
      let xDir: THREE.Vector3;
      let yDir: THREE.Vector3;

      if (kernelTransform) {
        planePoint = new THREE.Vector3(...kernelTransform.origin);
        xDir = new THREE.Vector3(...kernelTransform.xDir);
        yDir = new THREE.Vector3(...kernelTransform.yDir);
      } else if (sketchMode.planeRole) {
        // Fallback to standard datum plane transforms (matching kernel's coordinate system)
        switch (sketchMode.planeRole) {
          case "xy":
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(1, 0, 0);
            yDir = new THREE.Vector3(0, 1, 0);
            break;
          case "yz":
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(0, 1, 0);
            yDir = new THREE.Vector3(0, 0, 1);
            break;
          case "xz":
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(0, 0, 1);
            yDir = new THREE.Vector3(1, 0, 0);
            break;
        }
      } else {
        return null;
      }

      // Convert 2D sketch coords to 3D world point
      const [sketchX, sketchY] = sketchPoint;
      const worldPoint = planePoint
        .clone()
        .add(xDir.clone().multiplyScalar(sketchX))
        .add(yDir.clone().multiplyScalar(sketchY));

      // Project to screen coordinates
      const screenPos = worldPoint.clone().project(camera);
      const rect = container.getBoundingClientRect();

      return {
        x: ((screenPos.x + 1) / 2) * rect.width,
        y: ((-screenPos.y + 1) / 2) * rect.height,
      };
    },
    [cameraRef, sketchMode.sketchId, sketchMode.planeRole, sketchPlaneTransforms]
  );

  // Constraint value update
  const updateConstraintValue = useCallback(
    (constraintId: string, value: number) => {
      if (!sketchMode.sketchId) return;
      const sketchEl = findFeature(doc.featuresById, sketchMode.sketchId);
      if (!sketchEl) return;
      const data = getSketchDataAsArrays(sketchEl);
      const c = data.constraints.find((cc) => cc.id === constraintId);
      if (!c) return;

      if (c.type === "distance" || c.type === "angle") {
        (c as { value: number }).value = value;
      } else {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import to avoid circular dependency
      const { setSketchData } = require("../../document/featureHelpers");
      doc.ydoc.transact(() => {
        setSketchData(sketchEl, data);
      });
    },
    [doc.featuresById, doc.ydoc, sketchMode.sketchId]
  );

  // Constraint offset update
  const updateConstraintOffset = useCallback(
    (constraintId: string, offsetX: number, offsetY: number) => {
      if (!sketchMode.sketchId) return;
      const sketchEl = findFeature(doc.featuresById, sketchMode.sketchId);
      if (!sketchEl) return;
      const data = getSketchDataAsArrays(sketchEl);
      const c = data.constraints.find((cc) => cc.id === constraintId);
      if (!c) return;

      if (c.type === "distance" || c.type === "angle") {
        (c as { offsetX?: number; offsetY?: number }).offsetX = offsetX;
        (c as { offsetX?: number; offsetY?: number }).offsetY = offsetY;
      } else {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import to avoid circular dependency
      const { setSketchData } = require("../../document/featureHelpers");
      doc.ydoc.transact(() => {
        setSketchData(sketchEl, data);
      });
    },
    [doc.featuresById, doc.ydoc, sketchMode.sketchId]
  );

  // Dimension editing
  const {
    editingState: dimensionEditingState,
    draggingState: dimensionDraggingState,
    inputRef: dimensionInputRef,
    startEditing: startDimensionEditing,
    submitEdit: submitDimensionEdit,
    cancelEdit: cancelDimensionEdit,
    setEditingValue: setDimensionEditingValue,
  } = useDimensionEditing({
    containerRef,
    cameraRef: cameraRef as React.MutableRefObject<THREE.Camera | null>,
    sketchModeActive: sketchMode.active,
    getSketch,
    updateConstraintValue,
    updateConstraintOffset,
  });

  // Snap to grid helper
  const snapToGrid = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      if (!viewerState.snapToGrid) return { x, y };
      const size = viewerState.gridSize;
      return {
        x: Math.round(x / size) * size,
        y: Math.round(y / size) * size,
      };
    },
    [viewerState.snapToGrid, viewerState.gridSize]
  );

  // Wrapper for addConstraint to match useSketchTools type
  const addConstraintWrapper = useCallback(
    (constraint: { type: string; [key: string]: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type bridge between generic and specific constraint types
      addConstraint(constraint as any);
    },
    [addConstraint]
  );

  // Sketch tools (handles canvas mouse events for drawing)
  const {
    previewShapes,
    snapTarget: _snapTarget,
    boxSelection,
  } = useSketchTools({
    containerRef,
    sketchMode,
    screenToSketch,
    snapToGrid,
    getSketch,
    findNearbyPoint,
    addPoint,
    addLine,
    addArc,
    addCircle,
    addRectangle,
    addAngledRectangle,
    addConstraint: addConstraintWrapper,
    updatePointPosition,
    setSelectedPoints,
    setSelectedLines,
    setSelectedConstraints,
    clearSketchSelection,
    autoConstraints: viewerState.autoConstraints,
    setSketchMousePos,
    setPreviewLine,
    sceneReady,
  });

  // 3D face/edge raycast for selection
  const raycast3D = useCallback(
    (clientX: number, clientY: number): RaycastHit | null => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      const meshGroup = groupRefs.meshGroup.current;

      if (!camera || !container || !meshGroup) return null;

      const rect = container.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const intersects = raycaster.intersectObjects(meshGroup.children, true);
      if (intersects.length === 0) return null;

      const hit = intersects[0];
      const mesh = hit.object as THREE.Mesh;

      // Get body and feature info from mesh userData
      const bodyId = mesh.userData?.bodyId as string | undefined;
      const featureId = mesh.userData?.featureId as string | undefined;
      const faceMap = mesh.userData?.faceMap as Uint32Array | undefined;

      if (!bodyId || !featureId) return null;

      // Convert triangle index to B-Rep face index using faceMap
      const triangleIndex = hit.faceIndex ?? 0;
      const faceIndex = faceMap ? faceMap[triangleIndex] : triangleIndex;

      return {
        bodyId,
        faceIndex,
        featureId,
        point: hit.point,
        normal: hit.face?.normal ?? null,
      };
    },
    [cameraRef, containerRef, groupRefs.meshGroup]
  );

  // Get face ID from body and face index
  // For now, just return the face index - proper named face mapping can be added later
  const getFaceId = useCallback((_bodyId: string, faceIndex: number): number => {
    return faceIndex;
  }, []);

  // Handle face selection (only when not in sketch mode)
  const handleSelectFace = useCallback(
    (selection: { bodyId: string; faceIndex: number; featureId: string }, multi: boolean) => {
      if (sketchMode.active) return; // Don't handle 3D selection during sketch mode
      selectFace(selection, multi);
    },
    [sketchMode.active, selectFace]
  );

  // Handle edge selection (only when not in sketch mode)
  const handleSelectEdge = useCallback(
    (selection: { bodyId: string; edgeIndex: number; featureId: string }, multi: boolean) => {
      if (sketchMode.active) return; // Don't handle 3D selection during sketch mode
      selectEdge(selection, multi);
    },
    [sketchMode.active, selectEdge]
  );

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    if (sketchMode.active) return;
    clearSelection();
  }, [sketchMode.active, clearSelection]);

  // Handle hover
  const handleHover = useCallback(
    (
      target: { type: "face" | "edge"; bodyId: string; index: number; featureId: string } | null
    ) => {
      if (sketchMode.active) {
        setHover(null);
        return;
      }
      if (target) {
        setHover({
          type: target.type,
          bodyId: target.bodyId,
          index: target.index,
          featureId: target.featureId,
        });
      } else {
        setHover(null);
      }
    },
    [sketchMode.active, setHover]
  );

  // Handle 3D cursor broadcast for collaborative awareness
  const handleCursorBroadcast = useCallback(
    (hit: RaycastHit | null) => {
      if (!awareness) return;
      if (hit) {
        awareness.updateCursor3D({
          position: [hit.point.x, hit.point.y, hit.point.z],
          normal: hit.normal ? [hit.normal.x, hit.normal.y, hit.normal.z] : undefined,
          visible: true,
        });
      } else {
        awareness.updateCursor3D({
          position: [0, 0, 0],
          visible: false,
        });
      }
    },
    [awareness]
  );

  // Handle 2D cursor broadcast for collaborative awareness (when not over 3D model)
  const handleCursor2DBroadcast = useCallback(
    (x: number, y: number, visible: boolean) => {
      if (!awareness) return;
      awareness.updateCursor2D({ x, y, visible });
    },
    [awareness]
  );

  // 3D selection (face/edge click and hover)
  use3DSelection({
    containerRef,
    cameraRef: cameraRef as React.MutableRefObject<
      THREE.PerspectiveCamera | THREE.OrthographicCamera | null
    >,
    edgeGroupRef: groupRefs.edgeGroup,
    raycast: raycast3D,
    getFaceId,
    onSelectFace: handleSelectFace,
    onSelectEdge: handleSelectEdge,
    onClearSelection: handleClearSelection,
    onHover: handleHover,
    onCursorBroadcast: handleCursorBroadcast,
    onCursor2DBroadcast: handleCursor2DBroadcast,
    showEdges: viewerState.showEdges,
    sceneReady,
  });

  // Register refs with context
  // Re-run when sceneReady changes to apply any pending view changes
  React.useEffect(() => {
    registerRefs({
      camera: cameraRef,
      scene: sceneRef,
      target: targetRef,
      container: containerRef,
      updateCamera,
      requestRender,
      broadcastCamera,
      screenToSketch,
    });
  }, [
    registerRefs,
    requestRender,
    updateCamera,
    broadcastCamera,
    screenToSketch,
    cameraRef,
    sceneRef,
    targetRef,
    sceneReady, // Re-register when scene becomes ready to apply pending views
  ]);

  // Toggle edge visibility
  /* eslint-disable react-hooks/immutability -- modifying Three.js object is intentional */
  React.useEffect(() => {
    const edgeGroup = groupRefs.edgeGroup.current;
    if (edgeGroup) {
      edgeGroup.visible = viewerState.showEdges;
      needsRenderRef.current = true;
    }
  }, [viewerState.showEdges, groupRefs.edgeGroup, needsRenderRef]);
  /* eslint-enable react-hooks/immutability */

  // Renderers
  useMeshRenderer({
    meshGroupRef: groupRefs.meshGroup,
    edgeGroupRef: groupRefs.edgeGroup,
    containerRef,
    meshes,
    bodies,
    features,
    theme,
    sceneReady,
    needsRenderRef,
  });

  usePlaneRenderer({
    planesGroupRef: groupRefs.planesGroup,
    features,
    featureStatus,
    selectedFeatureId,
    hoveredFeatureId,
    sceneReady,
    needsRenderRef,
  });

  useOriginRenderer({
    originGroupRef: groupRefs.originGroup,
    features,
    featureStatus,
    selectedFeatureId,
    hoveredFeatureId,
    sceneReady,
    needsRenderRef,
  });

  // Merge previewLine from context with other preview shapes from useSketchTools
  const mergedPreviewShapes = useMemo(
    () => ({
      ...previewShapes,
      line: previewLine, // previewLine comes from context (set by useSketchTools via setPreviewLine)
    }),
    [previewShapes, previewLine]
  );

  useSketchRenderer({
    sketchGroupRef: groupRefs.sketchGroup,
    rendererRef,
    sketchMode,
    getActiveSketch: getSketch,
    features,
    selectedFeatureId,
    hoveredFeatureId,
    previewShapes: mergedPreviewShapes,
    sketchPlaneTransforms,
    sceneReady,
    needsRenderRef,
  });

  useSelectionRenderer({
    faceHighlightGroupRef: groupRefs.faceHighlightGroup,
    selectionGroupRef: groupRefs.selectionGroup,
    rendererRef,
    containerRef,
    meshes,
    selectedFaces,
    selectedEdges,
    hover,
    sketchMode,
    getSketch,
    selectedPoints,
    selectedLines,
    sketchPlaneTransforms,
    sceneReady,
    needsRenderRef,
  });

  useConstraintRenderer({
    constraintLabelsGroupRef: groupRefs.constraintLabelsGroup,
    selectionGroupRef: groupRefs.selectionGroup,
    rendererRef,
    sketchMode,
    getSketch,
    selectedConstraints,
    toggleConstraintSelection,
    draggingState: dimensionDraggingState,
    onDimensionDoubleClick: startDimensionEditing,
    sketchPlaneTransforms,
    sceneReady,
    needsRenderRef,
  });

  // Cursor style
  const viewerCursor = useMemo(() => {
    if (sketchMode.active && sketchMode.activeTool === "select") return "default";
    return "default";
  }, [sketchMode.active, sketchMode.activeTool]);

  // Selection box dimensions (screen coordinates)
  const selectionBoxStyle = useMemo(() => {
    if (!boxSelection) return null;
    const { start, current } = boxSelection;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    return { left, top, width, height };
  }, [boxSelection]);

  return (
    <div ref={containerRef} className="viewer-container" style={{ cursor: viewerCursor }}>
      {/* Collaborative 3D cursors */}
      <UserCursors3D
        scene={sceneRef.current}
        connectedUsers={connectedUsers}
        requestRender={requestRender}
      />
      {/* 2D cursor overlay for followed user */}
      <UserCursor2D followedUser={followedUser} containerRef={containerRef} />

      {/* Sketch cursors for other users in the same sketch */}
      {sketchMode.active && sketchMode.sketchId && (
        <SketchCursors
          connectedUsers={connectedUsers}
          sketchId={sketchMode.sketchId}
          transformPoint={sketchToScreen}
          followingUserId={followingUserId}
        />
      )}

      {/* Selection box overlay for sketch mode drag selection */}
      {boxSelection && selectionBoxStyle && (
        <div
          className={`selection-box-overlay mode-${boxSelection.mode}`}
          style={{
            left: selectionBoxStyle.left,
            top: selectionBoxStyle.top,
            width: selectionBoxStyle.width,
            height: selectionBoxStyle.height,
          }}
        />
      )}

      {/* Inline dimension edit */}
      {dimensionEditingState.id && dimensionEditingState.position && (
        <input
          ref={dimensionInputRef as React.RefObject<HTMLInputElement>}
          type="number"
          className="dimension-inline-input"
          value={dimensionEditingState.value}
          onChange={(e) => setDimensionEditingValue(e.target.value)}
          onBlur={submitDimensionEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitDimensionEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelDimensionEdit();
            }
          }}
          step="0.1"
          min="0"
          style={{
            position: "absolute",
            left: `${dimensionEditingState.position.x}px`,
            top: `${dimensionEditingState.position.y}px`,
            transform: "translate(-50%, -50%)",
            background:
              dimensionEditingState.type === "distance"
                ? "rgba(0, 170, 0, 0.95)"
                : "rgba(170, 85, 0, 0.95)",
            color: "white",
            border: "2px solid white",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "13px",
            fontWeight: 600,
            width: "70px",
            textAlign: "center",
            outline: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            zIndex: 1000,
          }}
        />
      )}
    </div>
  );
};

export default Viewer;
