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
  const { selectedFeatureId, hoveredFeatureId, selectedFaces, selectedEdges, hover } =
    useSelection();
  const {
    mode: sketchMode,
    previewLine,
    selectedPoints,
    selectedLines,
    selectedConstraints,
    toggleConstraintSelection,
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
    (screenX: number, screenY: number, planeId: string): { x: number; y: number } | null => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return null;

      const rect = container.getBoundingClientRect();
      const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const sketchId = sketchMode.sketchId;
      const kernelTransform = sketchId ? sketchPlaneTransforms[sketchId] : null;

      let planeNormal: THREE.Vector3;
      let planePoint: THREE.Vector3;
      let xDir: THREE.Vector3;
      let yDir: THREE.Vector3;

      if (kernelTransform) {
        planePoint = new THREE.Vector3(...kernelTransform.origin);
        xDir = new THREE.Vector3(...kernelTransform.xDir);
        yDir = new THREE.Vector3(...kernelTransform.yDir);
        planeNormal = new THREE.Vector3(...kernelTransform.normal);
      } else {
        switch (planeId) {
          case "xy":
            planeNormal = new THREE.Vector3(0, 0, 1);
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(1, 0, 0);
            yDir = new THREE.Vector3(0, 1, 0);
            break;
          case "xz":
            planeNormal = new THREE.Vector3(0, 1, 0);
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(1, 0, 0);
            yDir = new THREE.Vector3(0, 0, 1);
            break;
          case "yz":
            planeNormal = new THREE.Vector3(1, 0, 0);
            planePoint = new THREE.Vector3(0, 0, 0);
            xDir = new THREE.Vector3(0, 1, 0);
            yDir = new THREE.Vector3(0, 0, 1);
            break;
          default:
            return null;
        }
      }

      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);
      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, intersection);

      if (!hit) return null;

      const offset = intersection.clone().sub(planePoint);
      const sketchX = offset.dot(xDir);
      const sketchY = offset.dot(yDir);

      return { x: sketchX, y: sketchY };
    },
    [cameraRef, sketchMode.sketchId, sketchPlaneTransforms]
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

  // Register refs with context
  React.useEffect(() => {
    registerRefs({
      camera: cameraRef,
      scene: sceneRef,
      target: targetRef,
      container: containerRef,
      updateCamera,
      requestRender,
      screenToSketch,
    });
  }, [registerRefs, requestRender, updateCamera, screenToSketch, cameraRef, sceneRef, targetRef]);

  // Toggle edge visibility
  React.useEffect(() => {
    const edgeGroup = groupRefs.edgeGroup.current;
    if (edgeGroup) {
      edgeGroup.visible = viewerState.showEdges;
      needsRenderRef.current = true;
    }
  }, [viewerState.showEdges, groupRefs.edgeGroup, needsRenderRef]);

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

  useSketchRenderer({
    sketchGroupRef: groupRefs.sketchGroup,
    rendererRef,
    sketchMode,
    getActiveSketch: getSketch,
    features,
    selectedFeatureId,
    hoveredFeatureId,
    previewShapes: {
      line: previewLine,
      circle: null,
      arc: null,
      rect: null,
      polygon: null,
    },
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
