import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer, EffectPass, RenderPass, SSAOEffect, NormalPass } from "postprocessing";
import { useTheme } from "../contexts/ThemeContext";
import { useViewer, ProjectionMode } from "../contexts/ViewerContext";
import { useKernel } from "../contexts/KernelContext";
import { useSelection } from "../contexts/SelectionContext";
import { useSketch } from "../contexts/SketchContext";
import { useDocument } from "../contexts/DocumentContext";
import { useRaycast } from "../hooks/useRaycast";
import { UserCursors3D } from "./UserCursors3D";
import { UserCursor2D } from "./UserCursor2D";
import { useFollowing } from "../../hooks/useFollowing";
import {
  findFeature,
  getSketchDataAsArrays,
  setSketchData,
  getFeaturesArray,
  parseFeature,
  type SketchDataArrays,
} from "../document/featureHelpers";
import type {
  SketchLine,
  SketchArc,
  SketchCircle,
  SketchEntity,
  SketchConstraint,
  PlaneFeature,
  OriginFeature,
  SketchFeature,
} from "../types/document";
// Use array-based SketchData for compatibility with existing code
type SketchData = SketchDataArrays;
// Removed sketch toolbar - buttons moved to main FloatingToolbar
import "./ToolbarComponents.css";
import "./Viewer.css";

// Point merge tolerance in sketch units (mm)
const POINT_MERGE_TOLERANCE_MM = 5;

// Angle tolerance for H/V inference (radians) - 5 degrees
const HV_INFERENCE_TOLERANCE = 5 * (Math.PI / 180);

/** Check if a line is near horizontal */
function isNearHorizontal(p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.abs(Math.atan2(dy, dx));
  return angle < HV_INFERENCE_TOLERANCE || angle > Math.PI - HV_INFERENCE_TOLERANCE;
}

/** Check if a line is near vertical */
function isNearVertical(p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.abs(Math.atan2(dy, dx));
  return Math.abs(angle - Math.PI / 2) < HV_INFERENCE_TOLERANCE;
}

/**
 * Calculate the circumcircle center from 3 points (for 3-point arc).
 * Returns null if points are collinear.
 */
function calculateCircumcircleCenter(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { x: number; y: number; radius: number } | null {
  const ax = p1.x,
    ay = p1.y;
  const bx = p2.x,
    by = p2.y;
  const cx = p3.x,
    cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

  if (Math.abs(d) < 1e-10) {
    // Points are collinear
    return null;
  }

  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;
  const cSq = cx * cx + cy * cy;

  const centerX = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
  const centerY = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;
  const radius = Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2);

  return { x: centerX, y: centerY, radius };
}

/** Get default color for a datum plane based on its ID */
function getDefaultPlaneColor(planeId: string): number {
  switch (planeId) {
    case "xy":
      return 0x0088ff; // Blue (Top plane)
    case "xz":
      return 0x00cc44; // Green (Front plane)
    case "yz":
      return 0xff4444; // Red (Right plane)
    default:
      return 0x888888; // Gray for custom planes
  }
}

/** Parse hex color string to number */
function parseHexColor(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  if (color.startsWith("#")) {
    const parsed = parseInt(color.slice(1), 16);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
}

/** Visual state for rendering features */
type FeatureDisplayState = "normal" | "hovered" | "selected";

/** Get opacity based on display state (reduced by 50% per user request) */
function getPlaneOpacity(state: FeatureDisplayState): {
  fill: number;
  border: number;
  grid: number;
} {
  switch (state) {
    case "selected":
      return { fill: 0.18, border: 0.5, grid: 0.4 };
    case "hovered":
      return { fill: 0.12, border: 0.4, grid: 0.3 };
    case "normal":
    default:
      return { fill: 0.06, border: 0.2, grid: 0.15 };
  }
}

/**
 * Calculate grid square size as 10% of widest side, rounded to nearest magnitude (power of 10)
 * Examples:
 * - 12x13mm → widest=13, 10%=1.3 → magnitude=1mm
 * - 143x178mm → widest=178, 10%=17.8 → magnitude=10mm
 * - 1000x1200mm → widest=1200, 10%=120 → magnitude=100mm
 */
function calculateGridSize(width: number, height: number): number {
  const widest = Math.max(width, height);
  const target = widest * 0.1;
  if (target <= 0) return 10; // fallback
  const magnitude = Math.pow(10, Math.round(Math.log10(target)));
  return magnitude;
}

/** Get line width based on display state */
function getPlaneLineWidth(state: FeatureDisplayState): number {
  switch (state) {
    case "selected":
      return 4;
    case "hovered":
      return 3;
    case "normal":
    default:
      return 2;
  }
}

/** Get origin opacity and scale based on display state */
function getOriginStyle(state: FeatureDisplayState): { opacity: number; scale: number } {
  switch (state) {
    case "selected":
      return { opacity: 1.0, scale: 1.3 };
    case "hovered":
      return { opacity: 0.8, scale: 1.15 };
    case "normal":
    default:
      return { opacity: 0.4, scale: 1.0 };
  }
}

/** Result of edge raycasting */
interface EdgeRaycastHit {
  bodyId: string;
  featureId: string;
  edgeIndex: number;
  distance: number;
  point: THREE.Vector3;
}

/**
 * Find the closest edge segment to a ray.
 * Returns null if no edge is within the threshold distance.
 */
function raycastEdges(
  raycaster: THREE.Raycaster,
  edgeGroup: THREE.Group,
  screenThreshold: number,
  camera: THREE.Camera,
  containerWidth: number
): EdgeRaycastHit | null {
  let closestHit: EdgeRaycastHit | null = null;
  let closestScreenDist = screenThreshold;

  const ray = raycaster.ray;

  edgeGroup.traverse((child) => {
    if (!(child instanceof LineSegments2)) return;

    const userData = child.userData as {
      bodyId?: string;
      featureId?: string;
      edgePositions?: Float32Array;
      edgeMap?: Uint32Array;
    };

    if (!userData.edgePositions || !userData.edgeMap) return;

    const positions = userData.edgePositions;
    const edgeMap = userData.edgeMap;

    // Each segment has 2 points = 6 floats
    const numSegments = positions.length / 6;

    for (let i = 0; i < numSegments; i++) {
      const p1 = new THREE.Vector3(
        positions[i * 6 + 0],
        positions[i * 6 + 1],
        positions[i * 6 + 2]
      );
      const p2 = new THREE.Vector3(
        positions[i * 6 + 3],
        positions[i * 6 + 4],
        positions[i * 6 + 5]
      );

      // Find closest point on ray to line segment
      const closestOnRay = new THREE.Vector3();
      const closestOnSegment = new THREE.Vector3();
      ray.distanceSqToSegment(p1, p2, closestOnRay, closestOnSegment);

      // Project to screen space to check pixel distance
      const screenPoint = closestOnSegment.clone().project(camera);
      const rayScreenPoint = closestOnRay.clone().project(camera);

      // Convert to pixel coordinates
      const screenDist =
        Math.sqrt(
          Math.pow((screenPoint.x - rayScreenPoint.x) * containerWidth * 0.5, 2) +
            Math.pow((screenPoint.y - rayScreenPoint.y) * containerWidth * 0.5, 2)
        );

      if (screenDist < closestScreenDist) {
        closestScreenDist = screenDist;
        closestHit = {
          bodyId: userData.bodyId || "",
          featureId: userData.featureId || "",
          edgeIndex: edgeMap[i],
          distance: closestOnRay.distanceTo(ray.origin),
          point: closestOnSegment.clone(),
        };
      }
    }
  });

  return closestHit;
}

const Viewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const aoEffectRef = useRef<SSAOEffect | null>(null);
  const aoEnabledRef = useRef(true); // Track AO state for render loop
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const animationFrameRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);
  const projectionModeRef = useRef<ProjectionMode>("perspective");
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const edgeGroupRef = useRef<THREE.Group | null>(null);
  const sketchGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);
  const constraintLabelsGroupRef = useRef<THREE.Group | null>(null);
  const planesGroupRef = useRef<THREE.Group | null>(null);
  const originGroupRef = useRef<THREE.Group | null>(null);
  const faceHighlightGroupRef = useRef<THREE.Group | null>(null);
  const snapIndicatorRef = useRef<THREE.Mesh | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const { theme } = useTheme();
  const { registerRefs, cameraStateRef, state: viewerState } = useViewer();
  const { meshes, bodies, sketchPlaneTransforms, featureStatus } = useKernel();
  const {
    selectFace,
    selectEdge,
    setHover,
    clearSelection: clearFaceSelection,
    selectedFeatureId,
    hoveredFeatureId,
    selectedFaces,
    selectedEdges,
    hover,
  } = useSelection();
  const {
    mode: sketchMode,
    previewLine,
    addPoint,
    addLine,
    addArc,
    addCircle,
    addRectangle,
    addAngledRectangle,
    addConstraint,
    findNearbyPoint,
    setSketchMousePos,
    setPreviewLine,
    finishSketch,
    cancelSketch,
    selectedPoints,
    selectedLines,
    selectedConstraints,
    setSelectedPoints,
    setSelectedLines,
    setSelectedConstraints,
    togglePointSelection,
    toggleLineSelection,
    toggleConstraintSelection,
    clearSelection: clearSketchSelection,
    deleteSelectedItems,
    toggleConstruction,
    updatePointPosition,
    getSketchPoints,
  } = useSketch();
  const { doc, features, units, awareness } = useDocument();

  // Sketch editing state
  const [tempStartPoint, setTempStartPoint] = useState<{
    x: number;
    y: number;
    id?: string;
  } | null>(null);
  // Second point for 3-point tools (like 3-point rectangle)
  const [tempSecondPoint, setTempSecondPoint] = useState<{
    x: number;
    y: number;
    id?: string;
  } | null>(null);
  // Chain mode: tracks the last endpoint for continuous line drawing
  const [chainLastEndpoint, setChainLastEndpoint] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const [arcStartPoint, setArcStartPoint] = useState<{ x: number; y: number; id?: string } | null>(
    null
  );
  const [arcEndPoint, setArcEndPoint] = useState<{ x: number; y: number; id?: string } | null>(
    null
  );
  // Arc center point for centerpoint arc mode
  const [arcCenterPoint, setArcCenterPoint] = useState<{
    x: number;
    y: number;
    id?: string;
  } | null>(null);
  // Tangent arc source: the line/arc we're drawing tangent from
  const [tangentSource, setTangentSource] = useState<{
    lineId: string;
    pointId: string; // The endpoint we're starting from
    direction: { x: number; y: number }; // Tangent direction at the endpoint
    point: { x: number; y: number };
  } | null>(null);
  const [circleCenterPoint, setCircleCenterPoint] = useState<{
    x: number;
    y: number;
    id?: string;
  } | null>(null);
  const [sketchPos, setSketchPos] = useState<{ x: number; y: number } | null>(null);

  // Inference indicator for showing H/V/parallel/perpendicular hints
  // TODO: Render this indicator in the viewport near the cursor
  const [_inferenceIndicator, setInferenceIndicator] = useState<{
    type: "horizontal" | "vertical" | "parallel" | "perpendicular" | null;
    position: { x: number; y: number };
  } | null>(null);

  // Preview shapes for tools (circle, arc, rectangle)
  const [previewCircle, setPreviewCircle] = useState<{
    center: { x: number; y: number };
    radius: number;
  } | null>(null);

  const [previewArc, setPreviewArc] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    bulge: { x: number; y: number };
  } | null>(null);

  const [previewRect, setPreviewRect] = useState<{
    corner1: { x: number; y: number };
    corner2: { x: number; y: number };
  } | null>(null);
  // For angled rectangle (4 corners, not axis-aligned)
  const [previewPolygon, setPreviewPolygon] = useState<{ x: number; y: number }[] | null>(null);

  // Snap target for visual indicator when hovering near a snap-able point
  const [snapTarget, setSnapTarget] = useState<{
    x: number;
    y: number;
    type: "point" | "endpoint" | "midpoint";
  } | null>(null);

  // Inline dimension editing state
  const [editingDimensionId, setEditingDimensionId] = useState<string | null>(null);
  const [editingDimensionValue, setEditingDimensionValue] = useState<string>("");
  const [editingDimensionPos, setEditingDimensionPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [editingDimensionType, setEditingDimensionType] = useState<"distance" | "angle">(
    "distance"
  );
  const editingDimensionWorldPos = useRef<THREE.Vector3 | null>(null);
  const dimensionInputRef = React.useRef<HTMLInputElement>(null);

  // Ref to hold dimension double-click handler for use in label creation
  const handleDimensionDblClickRef = useRef<
    | ((constraintId: string, constraintType: "distance" | "angle", element: HTMLElement) => void)
    | null
  >(null);

  // Dimension dragging state
  const [draggingDimensionId, setDraggingDimensionId] = useState<string | null>(null);
  const [dragCurrentOffset, setDragCurrentOffset] = useState<{ x: number; y: number } | null>(null);

  // Sketch entity dragging state (for dragging points and lines)
  const [draggingEntity, setDraggingEntity] = useState<{
    type: "point" | "line";
    id: string;
    /** For lines, store original positions of both endpoints */
    originalPositions?: { startX: number; startY: number; endX: number; endY: number };
    /** For lines, store the start and end point IDs */
    linePointIds?: { startId: string; endId: string };
    /** Initial click position in sketch coordinates */
    startPos: { x: number; y: number };
  } | null>(null);

  // Hovered draggable entity (for showing grab cursor)
  const [hoveredDraggable, setHoveredDraggable] = useState<{
    type: "point" | "line";
    id: string;
  } | null>(null);

  // Track mouse for sketch interactions
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingViewRef = useRef(false);
  const DRAG_THRESHOLD = 5;

  // Box selection state (for select tool drag to multi-select)
  const [boxSelection, setBoxSelection] = useState<{
    start: { x: number; y: number }; // Screen coords
    current: { x: number; y: number }; // Screen coords
    mode: "window" | "crossing"; // window = left-to-right (only inside), crossing = right-to-left (intersecting)
  } | null>(null);

  // Ref to track sketch mode for use in mouse handlers (to prevent rotation during sketch)
  const sketchModeRef = useRef(sketchMode);
  useEffect(() => {
    sketchModeRef.current = sketchMode;
  }, [sketchMode]);

  // Callback to apply followed user's camera to our viewer
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
    []
  );

  // User following for collaborative cursors and camera sync
  const { connectedUsers, followingUserId } = useFollowing({
    awareness,
    onCameraChange: handleFollowCameraChange,
  });

  // Get the user we're following (if any)
  const followedUser = followingUserId
    ? (connectedUsers.find((u) => u.user.id === followingUserId) ?? null)
    : null;

  // Ref to track the last cursor position for awareness broadcast
  const lastCursorRef = useRef<{
    position: [number, number, number];
    normal: [number, number, number] | undefined;
    visible: boolean;
  } | null>(null);

  // Raycast hook for 3D selection
  const { raycast, getFaceId } = useRaycast({
    camera: cameraRef,
    scene: sceneRef,
    container: containerRef,
    meshes,
    bodies,
  });

  // Use refs for callbacks to avoid effect re-runs
  const raycastRef = useRef(raycast);
  raycastRef.current = raycast;
  const getFaceIdRef = useRef(getFaceId);
  getFaceIdRef.current = getFaceId;
  const selectFaceRef = useRef(selectFace);
  selectFaceRef.current = selectFace;
  const selectEdgeRef = useRef(selectEdge);
  selectEdgeRef.current = selectEdge;
  const setHoverRef = useRef(setHover);
  setHoverRef.current = setHover;
  const clearSelectionRef = useRef(clearFaceSelection);
  clearSelectionRef.current = clearFaceSelection;

  // Request a render (for use by external controls)
  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  // Broadcast cursor position to awareness when being followed
  // Uses a ref to avoid triggering re-renders on every mouse move
  const awarenessRef = useRef(awareness);
  awarenessRef.current = awareness;

  const broadcastCursor = useCallback(
    (hit: { point: THREE.Vector3; normal: THREE.Vector3 | null } | null) => {
      if (!awarenessRef.current) {
        return;
      }

      if (!hit) {
        // Clear 3D cursor if not over model
        if (lastCursorRef.current?.visible) {
          awarenessRef.current.updateCursor3D({ position: [0, 0, 0], visible: false });
          lastCursorRef.current = { position: [0, 0, 0], normal: undefined, visible: false };
        }
        return;
      }

      const newPos: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];
      const newNormal: [number, number, number] | undefined = hit.normal
        ? [hit.normal.x, hit.normal.y, hit.normal.z]
        : undefined;

      // Only update if position changed significantly (1mm threshold)
      const last = lastCursorRef.current;
      if (
        last &&
        last.visible &&
        Math.abs(last.position[0] - newPos[0]) < 1 &&
        Math.abs(last.position[1] - newPos[1]) < 1 &&
        Math.abs(last.position[2] - newPos[2]) < 1
      ) {
        return;
      }

      lastCursorRef.current = { position: newPos, normal: newNormal, visible: true };
      awarenessRef.current.updateCursor3D({ position: newPos, normal: newNormal, visible: true });
    },
    []
  );

  // Ref for broadcastCursor to use in event handlers
  const broadcastCursorRef = useRef(broadcastCursor);
  broadcastCursorRef.current = broadcastCursor;

  // Broadcast camera state to awareness (for following)
  const broadcastCamera = useCallback(() => {
    if (!awarenessRef.current || !cameraRef.current) return;

    const camera = cameraRef.current;
    const target = targetRef.current;

    const viewerState = {
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z] as [
        number,
        number,
        number,
      ],
      cameraTarget: [target.x, target.y, target.z] as [number, number, number],
      cameraUp: [camera.up.x, camera.up.y, camera.up.z] as [number, number, number],
      zoom: camera.position.distanceTo(target),
    };

    awarenessRef.current.updateViewerState(viewerState);
  }, []);

  // Ref for broadcastCamera to use in event handlers
  const broadcastCameraRef = useRef(broadcastCamera);
  broadcastCameraRef.current = broadcastCamera;

  // Broadcast initial camera state when scene is ready
  // This ensures followers can see the camera state even if the user hasn't moved yet
  useEffect(() => {
    if (sceneReady && cameraRef.current) {
      broadcastCameraRef.current();
    }
  }, [sceneReady]);

  // Update camera projection
  const updateCamera = useCallback((projection: ProjectionMode) => {
    if (!containerRef.current || !cameraRef.current) return;

    const oldCamera = cameraRef.current;
    const container = containerRef.current;
    const aspect = container.clientWidth / container.clientHeight;
    const distance = oldCamera.position.distanceTo(targetRef.current);

    let newCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;

    if (projection === "orthographic") {
      const frustumSize = distance * 0.5;
      newCamera = new THREE.OrthographicCamera(
        -frustumSize * aspect,
        frustumSize * aspect,
        frustumSize,
        -frustumSize,
        0.1,
        1000
      );
    } else {
      newCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    }

    newCamera.position.copy(oldCamera.position);
    newCamera.up.copy(oldCamera.up);
    newCamera.lookAt(targetRef.current);

    cameraRef.current = newCamera;
    projectionModeRef.current = projection;
    needsRenderRef.current = true;
  }, []);

  // Convert screen coordinates to sketch coordinates via ray-plane intersection
  // Uses plane transform from kernel for accurate coordinate conversion on any plane
  const screenToSketch = useCallback(
    (screenX: number, screenY: number, planeId: string): { x: number; y: number } | null => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return null;

      // Get normalized device coordinates (-1 to 1)
      const rect = container.getBoundingClientRect();
      const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

      // Create ray from camera through mouse position
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      // Try to get plane transform from kernel (works for any plane/face)
      const sketchId = sketchMode.sketchId;
      const kernelTransform = sketchId ? sketchPlaneTransforms[sketchId] : null;

      let planeNormal: THREE.Vector3;
      let planePoint: THREE.Vector3;
      let xDir: THREE.Vector3;
      let yDir: THREE.Vector3;

      if (kernelTransform) {
        // Use the accurate plane transform from the kernel
        planePoint = new THREE.Vector3(...kernelTransform.origin);
        xDir = new THREE.Vector3(...kernelTransform.xDir);
        yDir = new THREE.Vector3(...kernelTransform.yDir);
        planeNormal = new THREE.Vector3(...kernelTransform.normal);
      } else {
        // Fallback for built-in planes before kernel responds
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
            // For face references or unknown planes, we need the kernel transform
            return null;
        }
      }

      // Intersect ray with plane
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);
      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, intersection);

      if (!hit) return null;

      // Convert world intersection point to sketch 2D coordinates
      const offset = intersection.clone().sub(planePoint);
      const sketchX = offset.dot(xDir);
      const sketchY = offset.dot(yDir);

      return { x: sketchX, y: sketchY };
    },
    [sketchMode.sketchId, sketchPlaneTransforms]
  );

  // Snap to grid helper (respects toggleable grid settings from viewer state)
  const snapToGrid = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      if (!viewerState.snapToGrid) {
        return { x, y };
      }
      const gridSize = viewerState.gridSize;
      return {
        x: Math.round(x / gridSize) * gridSize,
        y: Math.round(y / gridSize) * gridSize,
      };
    },
    [viewerState.snapToGrid, viewerState.gridSize]
  );

  // Get current sketch data (array format for compatibility)
  const getSketch = useCallback((): SketchData | null => {
    if (!sketchMode.sketchId) return null;
    const sketch = findFeature(doc.featuresById, sketchMode.sketchId);
    if (!sketch) return null;
    return getSketchDataAsArrays(sketch);
  }, [doc.featuresById, sketchMode.sketchId]);

  // Clear tool state when entering/exiting sketch mode, changing sketchId, or changing tools
  useEffect(() => {
    // Reset all draft state when sketch mode or tool changes
    setTempStartPoint(null);
    setTempSecondPoint(null);
    setChainLastEndpoint(null);
    setArcStartPoint(null);
    setArcEndPoint(null);
    setTangentSource(null);
    setArcCenterPoint(null);
    setCircleCenterPoint(null);
    setInferenceIndicator(null);
    setPreviewCircle(null);
    setPreviewArc(null);
    setPreviewRect(null);
  }, [sketchMode.active, sketchMode.sketchId, sketchMode.activeTool]);

  // Update preview line based on current tool state (chain mode aware)
  // Update preview shapes based on current tool state
  useEffect(() => {
    if (!sketchMode.active || !sketchPos) {
      setPreviewLine(null);
      setPreviewCircle(null);
      setPreviewArc(null);
      setPreviewRect(null);
      setInferenceIndicator(null);
      return;
    }

    // Reset all previews first
    setPreviewLine(null);
    setPreviewCircle(null);
    setPreviewArc(null);
    setPreviewRect(null);
    setPreviewPolygon(null);
    setInferenceIndicator(null);

    // LINE TOOL: Use chain endpoint if available, otherwise temp start
    if (sketchMode.activeTool === "line") {
      const startPt = chainLastEndpoint || tempStartPoint;
      if (startPt) {
        setPreviewLine({
          start: { x: startPt.x, y: startPt.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });

        // Update inference indicator
        if (isNearHorizontal(startPt, sketchPos)) {
          setInferenceIndicator({ type: "horizontal", position: sketchPos });
        } else if (isNearVertical(startPt, sketchPos)) {
          setInferenceIndicator({ type: "vertical", position: sketchPos });
        }
      }
    }

    // RECTANGLE TOOL (CORNER): Show rectangle preview from first corner to cursor
    else if (sketchMode.activeTool === "rectangle" && tempStartPoint) {
      setPreviewRect({
        corner1: { x: tempStartPoint.x, y: tempStartPoint.y },
        corner2: { x: sketchPos.x, y: sketchPos.y },
      });
    }

    // RECTANGLE TOOL (CENTER): Show rectangle preview from center, symmetric
    else if (sketchMode.activeTool === "rectangleCenter" && tempStartPoint) {
      const cx = tempStartPoint.x;
      const cy = tempStartPoint.y;
      const halfW = Math.abs(sketchPos.x - cx);
      const halfH = Math.abs(sketchPos.y - cy);
      setPreviewRect({
        corner1: { x: cx - halfW, y: cy - halfH },
        corner2: { x: cx + halfW, y: cy + halfH },
      });
    }

    // RECTANGLE TOOL (3-POINT): Angled rectangle defined by edge + width
    else if (sketchMode.activeTool === "rectangle3Point") {
      setPreviewPolygon(null); // Reset
      if (tempStartPoint && !tempSecondPoint) {
        // Step 1→2: Show line from first corner to cursor (defines edge)
        setPreviewLine({
          start: { x: tempStartPoint.x, y: tempStartPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (tempStartPoint && tempSecondPoint) {
        // Step 2→3: Show full rectangle preview with cursor defining width
        // Calculate the rectangle corners based on edge vector and width
        const edgeX = tempSecondPoint.x - tempStartPoint.x;
        const edgeY = tempSecondPoint.y - tempStartPoint.y;
        const edgeLen = Math.hypot(edgeX, edgeY);
        if (edgeLen > 0.01) {
          // Unit vector along edge
          const ux = edgeX / edgeLen;
          const uy = edgeY / edgeLen;
          // Perpendicular unit vector (to the left of the edge direction)
          const px = -uy;
          const py = ux;
          // Calculate signed width (distance from edge to cursor perpendicular to edge)
          const toCursorX = sketchPos.x - tempStartPoint.x;
          const toCursorY = sketchPos.y - tempStartPoint.y;
          const width = toCursorX * px + toCursorY * py;

          // Four corners of the angled rectangle (in order for closed polygon)
          const c1 = { x: tempStartPoint.x, y: tempStartPoint.y };
          const c2 = { x: tempSecondPoint.x, y: tempSecondPoint.y };
          const c3 = { x: tempSecondPoint.x + width * px, y: tempSecondPoint.y + width * py };
          const c4 = { x: tempStartPoint.x + width * px, y: tempStartPoint.y + width * py };

          setPreviewPolygon([c1, c2, c3, c4, c1]); // Close the polygon
          setPreviewLine(null);
        }
      }
    }

    // CIRCLE TOOL: Show circle preview from center with radius to cursor
    else if (sketchMode.activeTool === "circle" && circleCenterPoint) {
      const dx = sketchPos.x - circleCenterPoint.x;
      const dy = sketchPos.y - circleCenterPoint.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      setPreviewCircle({
        center: { x: circleCenterPoint.x, y: circleCenterPoint.y },
        radius,
      });
    }

    // 3-POINT ARC TOOL
    else if (sketchMode.activeTool === "arc") {
      if (arcStartPoint && !arcEndPoint) {
        // Step 1→2: Show line from start to cursor
        setPreviewLine({
          start: { x: arcStartPoint.x, y: arcStartPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (arcStartPoint && arcEndPoint) {
        // Step 2→3: Show arc preview through bulge point (cursor)
        setPreviewArc({
          start: arcStartPoint,
          end: arcEndPoint,
          bulge: sketchPos,
        });
      }
    }

    // CENTERPOINT ARC TOOL
    else if (sketchMode.activeTool === "arcCenterpoint") {
      if (arcCenterPoint && !arcStartPoint) {
        // Step 1→2: Show line from center to cursor (radius)
        setPreviewLine({
          start: { x: arcCenterPoint.x, y: arcCenterPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (arcCenterPoint && arcStartPoint) {
        // Step 2→3: Show arc preview from start to cursor around center
        setPreviewArc({
          start: arcStartPoint,
          end: sketchPos,
          bulge: arcCenterPoint,
        });
      }
    }

    // TANGENT ARC TOOL
    else if (sketchMode.activeTool === "arcTangent" && tangentSource) {
      // Show tangent arc preview from source point to cursor
      const P = tangentSource.point;
      const E = sketchPos;
      const T = tangentSource.direction;

      // Calculate the arc center using tangent constraint
      const N = { x: -T.y, y: T.x };
      const M = { x: (P.x + E.x) / 2, y: (P.y + E.y) / 2 };
      const PE = { x: E.x - P.x, y: E.y - P.y };
      const PElen = Math.hypot(PE.x, PE.y);

      if (PElen > 0.01) {
        const perpPE = { x: -PE.y / PElen, y: PE.x / PElen };
        const det = N.x * -perpPE.y - N.y * -perpPE.x;

        if (Math.abs(det) > 1e-10) {
          const dx = M.x - P.x;
          const dy = M.y - P.y;
          const s = (dx * -perpPE.y - dy * -perpPE.x) / det;
          const center = { x: P.x + s * N.x, y: P.y + s * N.y };

          // Use bulge as the center for preview rendering (centerpoint arc style)
          setPreviewArc({
            start: P,
            end: E,
            bulge: center, // Using center as the bulge for preview
          });
        }
      }
    }

    // 3-POINT CIRCLE TOOL
    else if (sketchMode.activeTool === "circle3Point") {
      if (arcStartPoint && !arcEndPoint) {
        // Step 1→2: Show line from first point to cursor
        setPreviewLine({
          start: { x: arcStartPoint.x, y: arcStartPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (arcStartPoint && arcEndPoint) {
        // Step 2→3: Show circle preview through three points
        const circleInfo = calculateCircumcircleCenter(arcStartPoint, arcEndPoint, sketchPos);
        if (circleInfo) {
          setPreviewCircle({
            center: { x: circleInfo.x, y: circleInfo.y },
            radius: circleInfo.radius,
          });
        }
      }
    }
  }, [
    sketchMode.active,
    sketchMode.activeTool,
    tempStartPoint,
    chainLastEndpoint,
    sketchPos,
    circleCenterPoint,
    arcStartPoint,
    arcEndPoint,
    arcCenterPoint,
    setPreviewLine,
  ]);

  // Update snap indicator visual
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;

    // Remove existing snap indicator
    if (snapIndicatorRef.current) {
      scene.remove(snapIndicatorRef.current);
      snapIndicatorRef.current.geometry.dispose();
      (snapIndicatorRef.current.material as THREE.Material).dispose();
      snapIndicatorRef.current = null;
    }

    // Don't show indicator if no snap target or not in sketch mode
    if (!snapTarget || !sketchMode.active || !sketchMode.planeId) return;

    // Get plane transform for positioning
    const sketchId = sketchMode.sketchId;
    const kernelTransform = sketchId ? sketchPlaneTransforms[sketchId] : null;

    let origin: THREE.Vector3;
    let xDir: THREE.Vector3;
    let yDir: THREE.Vector3;

    if (kernelTransform) {
      origin = new THREE.Vector3(...kernelTransform.origin);
      xDir = new THREE.Vector3(...kernelTransform.xDir);
      yDir = new THREE.Vector3(...kernelTransform.yDir);
    } else {
      // Fallback for built-in planes
      switch (sketchMode.planeId) {
        case "xy":
          origin = new THREE.Vector3(0, 0, 0);
          xDir = new THREE.Vector3(1, 0, 0);
          yDir = new THREE.Vector3(0, 1, 0);
          break;
        case "xz":
          origin = new THREE.Vector3(0, 0, 0);
          xDir = new THREE.Vector3(1, 0, 0);
          yDir = new THREE.Vector3(0, 0, 1);
          break;
        case "yz":
          origin = new THREE.Vector3(0, 0, 0);
          xDir = new THREE.Vector3(0, 1, 0);
          yDir = new THREE.Vector3(0, 0, 1);
          break;
        default:
          origin = new THREE.Vector3(0, 0, 0);
          xDir = new THREE.Vector3(1, 0, 0);
          yDir = new THREE.Vector3(0, 1, 0);
      }
    }

    // Calculate world position
    const worldPos = new THREE.Vector3(
      origin.x + snapTarget.x * xDir.x + snapTarget.y * yDir.x,
      origin.y + snapTarget.x * xDir.y + snapTarget.y * yDir.y,
      origin.z + snapTarget.x * xDir.z + snapTarget.y * yDir.z
    );

    // Create snap indicator (diamond shape)
    const geometry = new THREE.RingGeometry(1.5, 2.5, 4);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // Bright green
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const indicator = new THREE.Mesh(geometry, material);
    indicator.position.copy(worldPos);
    indicator.renderOrder = 999; // Always on top

    // Rotate to face camera (billboard effect)
    const normal = xDir.clone().cross(yDir).normalize();
    indicator.lookAt(worldPos.clone().add(normal));
    // Rotate 45 degrees to make a diamond
    indicator.rotation.z = Math.PI / 4;

    scene.add(indicator);
    snapIndicatorRef.current = indicator;
    needsRenderRef.current = true;

    return () => {
      if (snapIndicatorRef.current && scene) {
        scene.remove(snapIndicatorRef.current);
        snapIndicatorRef.current.geometry.dispose();
        (snapIndicatorRef.current.material as THREE.Material).dispose();
        snapIndicatorRef.current = null;
      }
    };
  }, [
    snapTarget,
    sketchMode.active,
    sketchMode.planeId,
    sketchMode.sketchId,
    sketchPlaneTransforms,
    sceneReady,
  ]);

  // Handle escape to cancel current draft operation and clear selection
  // Handle backspace/delete to delete selected items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sketchMode.active) return;

      if (e.key === "Escape") {
        // Clear any in-progress draft operations (including chain mode)
        setTempStartPoint(null);
        setChainLastEndpoint(null);
        setArcStartPoint(null);
        setArcEndPoint(null);
        setArcCenterPoint(null);
        setTangentSource(null);
        setCircleCenterPoint(null);
        setInferenceIndicator(null);
        setPreviewCircle(null);
        setPreviewArc(null);
        setPreviewRect(null);
        // Also clear sketch selection
        clearSketchSelection();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        // Delete selected items (points, lines, constraints)
        const hasSelection =
          selectedPoints.size > 0 || selectedLines.size > 0 || selectedConstraints.size > 0;
        if (hasSelection) {
          e.preventDefault();
          deleteSelectedItems();
        }
      } else if (e.key === "x" || e.key === "X") {
        // Toggle construction mode on selected lines
        if (selectedLines.size > 0) {
          e.preventDefault();
          toggleConstruction();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    sketchMode.active,
    clearSketchSelection,
    selectedPoints,
    selectedLines,
    selectedConstraints,
    deleteSelectedItems,
    toggleConstruction,
  ]);

  // Constraint value update
  const updateConstraintValue = useCallback(
    (constraintId: string, value: number) => {
      if (!sketchMode.sketchId) return;
      const sketchEl = findFeature(doc.featuresById, sketchMode.sketchId);
      if (!sketchEl) return;
      const data = getSketchDataAsArrays(sketchEl);
      const c = data.constraints.find((cc) => cc.id === constraintId);
      if (!c) return;

      if (c.type === "distance") {
        c.value = value;
      } else if (c.type === "angle") {
        c.value = value;
      } else {
        return;
      }

      doc.ydoc.transact(() => {
        setSketchData(sketchEl, data);
      });
    },
    [doc.featuresById, doc.ydoc, sketchMode.sketchId]
  );

  // Update constraint offset (for draggable dimensions)
  const updateConstraintOffset = useCallback(
    (constraintId: string, offsetX: number, offsetY: number) => {
      if (!sketchMode.sketchId) return;
      const sketchEl = findFeature(doc.featuresById, sketchMode.sketchId);
      if (!sketchEl) return;
      const data = getSketchDataAsArrays(sketchEl);
      const c = data.constraints.find((cc) => cc.id === constraintId);
      if (!c) return;

      if (c.type === "distance" || c.type === "angle") {
        c.offsetX = offsetX;
        c.offsetY = offsetY;
      } else {
        return;
      }

      doc.ydoc.transact(() => {
        setSketchData(sketchEl, data);
      });
    },
    [doc.featuresById, doc.ydoc, sketchMode.sketchId]
  );

  // Delete constraint
  const deleteConstraint = useCallback(
    (constraintId: string) => {
      if (!sketchMode.sketchId) return;
      const sketchEl = findFeature(doc.featuresById, sketchMode.sketchId);
      if (!sketchEl) return;
      const data = getSketchDataAsArrays(sketchEl);
      const next: SketchData = {
        ...data,
        constraints: data.constraints.filter((c) => c.id !== constraintId),
      };
      doc.ydoc.transact(() => {
        setSketchData(sketchEl, next);
      });
    },
    [doc.featuresById, doc.ydoc, sketchMode.sketchId]
  );

  // Register refs with context
  useEffect(() => {
    registerRefs({
      camera: cameraRef,
      scene: sceneRef,
      target: targetRef,
      container: containerRef,
      updateCamera,
      requestRender,
      screenToSketch,
    });
  }, [registerRefs, requestRender, updateCamera, screenToSketch]);

  // Update scene background when theme changes
  useEffect(() => {
    if (sceneRef.current) {
      // Get background color from CSS variable (use requestAnimationFrame to ensure CSS has updated)
      requestAnimationFrame(() => {
        if (!sceneRef.current) return;
        const viewerBgColor = getComputedStyle(document.documentElement)
          .getPropertyValue("--color-viewer-bg")
          .trim();
        const bgColor = viewerBgColor
          ? parseHexColor(viewerBgColor, theme === "dark" ? 0x1a1a1a : 0xfdfaf8)
          : theme === "dark"
            ? 0x1a1a1a
            : 0xfdfaf8;
        sceneRef.current.background = new THREE.Color(bgColor);
        needsRenderRef.current = true;
        // Force a render immediately to update the background
        if (rendererRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      });
    }
  }, [theme]);

  // Update meshes when kernel sends new mesh data
  useEffect(() => {
    const meshGroup = meshGroupRef.current;
    const edgeGroup = edgeGroupRef.current;
    if (!meshGroup || !edgeGroup) {
      console.log("[Viewer] meshGroup not ready yet, sceneReady:", sceneReady);
      return;
    }

    console.log("[Viewer] Updating meshes, count:", meshes.size, "sceneReady:", sceneReady);

    // Clear existing meshes
    while (meshGroup.children.length > 0) {
      const child = meshGroup.children[0];
      meshGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    }

    // Clear existing edge lines
    while (edgeGroup.children.length > 0) {
      const child = edgeGroup.children[0];
      edgeGroup.remove(child);
      if (child instanceof LineSegments2) {
        child.geometry.dispose();
        if (child.material instanceof LineMaterial) {
          child.material.dispose();
        }
      }
    }

    // Add new meshes
    meshes.forEach((meshData, bodyId) => {
      // Check if the feature is hidden
      const feature = features.find((f) => f.id === bodyId);
      if (feature && feature.visible === false) {
        console.log("[Viewer] Skipping hidden feature:", bodyId);
        return;
      }

      console.log(
        "[Viewer] Adding mesh for body:",
        bodyId,
        "positions:",
        meshData.positions.length / 3
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

      const isPreview = bodyId.startsWith("__preview");
      const isCutPreview = bodyId.includes("cut");

      // Get body color from bodies list if available
      const bodyInfo = bodies.find((b) => b.featureId === bodyId);
      const bodyColor = parseHexColor(bodyInfo?.color, 0x3b82f6); // Default to a nice blue

      // Enhanced CAD-style material with better visual properties
      const material = new THREE.MeshStandardMaterial({
        color: isPreview ? (isCutPreview ? 0xff4444 : 0x60a5fa) : bodyColor,
        side: THREE.DoubleSide,
        transparent: isPreview,
        opacity: isPreview ? 0.5 : 1,
        depthWrite: !isPreview,
        // CAD-style material properties for machined/plastic look
        metalness: 0.1,
        roughness: 0.4,
        // Slight environment map contribution for subtle reflections
        envMapIntensity: 0.5,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = bodyId;
      meshGroup.add(mesh);

      // Add CAD-style edge lines from B-Rep edges (not tessellation edges)
      if (!isPreview && containerRef.current && meshData.edges && meshData.edges.length > 0) {
        // Use LineSegmentsGeometry for disconnected line segments (pairs of points)
        const lineGeometry = new LineSegmentsGeometry();
        lineGeometry.setPositions(meshData.edges);

        // Strong dark edges for CAD-style appearance with proper width
        const edgeColor = theme === "dark" ? 0x000000 : 0x1a1a1a;
        const edgeMaterial = new LineMaterial({
          color: edgeColor,
          linewidth: 2.0, // Line width in pixels - thicker for visibility
          resolution: new THREE.Vector2(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight
          ),
          dashed: false,
        });

        // Use LineSegments2 for rendering disconnected segments
        const edgeLines = new LineSegments2(lineGeometry, edgeMaterial);
        edgeLines.computeLineDistances();
        edgeLines.name = `edges-${bodyId}`;
        // Store edge data for raycasting and selection
        edgeLines.userData = {
          bodyId,
          featureId: bodyId,
          edgePositions: meshData.edges,
          edgeMap: meshData.edgeMap,
        };
        edgeGroup.add(edgeLines);
      }
    });

    needsRenderRef.current = true;
  }, [meshes, bodies, sceneReady, features, theme]);

  // Toggle ambient occlusion based on viewerState
  useEffect(() => {
    // Update ref for render loop to check
    aoEnabledRef.current = viewerState.ambientOcclusion;
    needsRenderRef.current = true;
  }, [viewerState.ambientOcclusion]);

  // Toggle edge visibility based on viewerState
  useEffect(() => {
    const edgeGroup = edgeGroupRef.current;
    if (edgeGroup) {
      edgeGroup.visible = viewerState.showEdges;
      needsRenderRef.current = true;
    }
  }, [viewerState.showEdges]);

  // Render 3D face/edge selection highlights
  useEffect(() => {
    const faceHighlightGroup = faceHighlightGroupRef.current;
    if (!faceHighlightGroup || !sceneReady) return;

    // Clear existing highlights
    while (faceHighlightGroup.children.length > 0) {
      const child = faceHighlightGroup.children[0];
      faceHighlightGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Helper to extract triangles for a specific face from a mesh
    const extractFaceTriangles = (
      meshData: {
        positions: Float32Array;
        normals: Float32Array;
        indices: Uint32Array;
        faceMap?: Uint32Array;
      },
      targetFaceIndex: number
    ): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } | null => {
      if (!meshData.faceMap) return null;

      // Collect triangle indices that belong to this face
      const triangleIndices: number[] = [];
      for (let i = 0; i < meshData.faceMap.length; i++) {
        if (meshData.faceMap[i] === targetFaceIndex) {
          triangleIndices.push(i);
        }
      }

      if (triangleIndices.length === 0) return null;

      // Build new geometry with just these triangles
      // First, collect unique vertex indices
      const vertexMap = new Map<number, number>();
      const newPositions: number[] = [];
      const newNormals: number[] = [];
      const newIndices: number[] = [];

      for (const triIdx of triangleIndices) {
        const i0 = meshData.indices[triIdx * 3];
        const i1 = meshData.indices[triIdx * 3 + 1];
        const i2 = meshData.indices[triIdx * 3 + 2];

        for (const originalIdx of [i0, i1, i2]) {
          if (!vertexMap.has(originalIdx)) {
            const newIdx = newPositions.length / 3;
            vertexMap.set(originalIdx, newIdx);
            newPositions.push(
              meshData.positions[originalIdx * 3],
              meshData.positions[originalIdx * 3 + 1],
              meshData.positions[originalIdx * 3 + 2]
            );
            newNormals.push(
              meshData.normals[originalIdx * 3],
              meshData.normals[originalIdx * 3 + 1],
              meshData.normals[originalIdx * 3 + 2]
            );
          }
          newIndices.push(vertexMap.get(originalIdx)!);
        }
      }

      return {
        positions: new Float32Array(newPositions),
        normals: new Float32Array(newNormals),
        indices: new Uint32Array(newIndices),
      };
    };

    // Render hover highlight (if hovering over a face)
    if (hover && hover.type === "face") {
      const meshData = meshes.get(hover.bodyId);
      if (meshData) {
        const faceGeom = extractFaceTriangles(meshData, hover.index);
        if (faceGeom) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(faceGeom.positions, 3));
          geometry.setAttribute("normal", new THREE.BufferAttribute(faceGeom.normals, 3));
          geometry.setIndex(new THREE.BufferAttribute(faceGeom.indices, 1));

          const material = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
          });

          const highlightMesh = new THREE.Mesh(geometry, material);
          highlightMesh.name = `hover-face-${hover.bodyId}-${hover.index}`;
          highlightMesh.renderOrder = 100;
          faceHighlightGroup.add(highlightMesh);
        }
      }
    }

    // Render selected faces
    for (const selected of selectedFaces) {
      // Skip if this face is also being hovered (to avoid double-render)
      if (
        hover &&
        hover.type === "face" &&
        hover.bodyId === selected.bodyId &&
        hover.index === selected.faceIndex
      ) {
        // Render with combined selection+hover style
        const meshData = meshes.get(selected.bodyId);
        if (meshData) {
          const faceGeom = extractFaceTriangles(meshData, selected.faceIndex);
          if (faceGeom) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.BufferAttribute(faceGeom.positions, 3));
            geometry.setAttribute("normal", new THREE.BufferAttribute(faceGeom.normals, 3));
            geometry.setIndex(new THREE.BufferAttribute(faceGeom.indices, 1));

            const material = new THREE.MeshBasicMaterial({
              color: 0x00ffaa,
              transparent: true,
              opacity: 0.5,
              side: THREE.DoubleSide,
              depthTest: true,
              depthWrite: false,
            });

            const highlightMesh = new THREE.Mesh(geometry, material);
            highlightMesh.name = `selected-hover-face-${selected.bodyId}-${selected.faceIndex}`;
            highlightMesh.renderOrder = 100;
            faceHighlightGroup.add(highlightMesh);
          }
        }
        continue;
      }

      const meshData = meshes.get(selected.bodyId);
      if (meshData) {
        const faceGeom = extractFaceTriangles(meshData, selected.faceIndex);
        if (faceGeom) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(faceGeom.positions, 3));
          geometry.setAttribute("normal", new THREE.BufferAttribute(faceGeom.normals, 3));
          geometry.setIndex(new THREE.BufferAttribute(faceGeom.indices, 1));

          const material = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
          });

          const highlightMesh = new THREE.Mesh(geometry, material);
          highlightMesh.name = `selected-face-${selected.bodyId}-${selected.faceIndex}`;
          highlightMesh.renderOrder = 100;
          faceHighlightGroup.add(highlightMesh);
        }
      }
    }

    // Helper to extract edge segments for a specific edge from mesh data
    const extractEdgeSegments = (
      meshData: {
        edges?: Float32Array;
        edgeMap?: Uint32Array;
      },
      targetEdgeIndex: number
    ): Float32Array | null => {
      if (!meshData.edges || !meshData.edgeMap) return null;

      const segments: number[] = [];
      for (let i = 0; i < meshData.edgeMap.length; i++) {
        if (meshData.edgeMap[i] === targetEdgeIndex) {
          // Each segment has 2 points = 6 floats
          segments.push(
            meshData.edges[i * 6 + 0],
            meshData.edges[i * 6 + 1],
            meshData.edges[i * 6 + 2],
            meshData.edges[i * 6 + 3],
            meshData.edges[i * 6 + 4],
            meshData.edges[i * 6 + 5]
          );
        }
      }

      if (segments.length === 0) return null;
      return new Float32Array(segments);
    };

    // Render hover highlight for edges
    if (hover && hover.type === "edge" && containerRef.current) {
      const meshData = meshes.get(hover.bodyId);
      if (meshData) {
        const edgePositions = extractEdgeSegments(meshData, hover.index);
        if (edgePositions) {
          const lineGeometry = new LineSegmentsGeometry();
          lineGeometry.setPositions(edgePositions);

          const edgeMaterial = new LineMaterial({
            color: 0x00ff88,
            linewidth: 6.0,
            resolution: new THREE.Vector2(
              containerRef.current.clientWidth,
              containerRef.current.clientHeight
            ),
          });

          const highlightLine = new LineSegments2(lineGeometry, edgeMaterial);
          highlightLine.computeLineDistances();
          highlightLine.name = `hover-edge-${hover.bodyId}-${hover.index}`;
          highlightLine.renderOrder = 101;
          faceHighlightGroup.add(highlightLine);
        }
      }
    }

    // Render selected edges
    for (const selected of selectedEdges) {
      // Skip if this edge is also being hovered
      if (
        hover &&
        hover.type === "edge" &&
        hover.bodyId === selected.bodyId &&
        hover.index === selected.edgeIndex
      ) {
        continue;
      }

      const meshData = meshes.get(selected.bodyId);
      if (meshData && containerRef.current) {
        const edgePositions = extractEdgeSegments(meshData, selected.edgeIndex);
        if (edgePositions) {
          const lineGeometry = new LineSegmentsGeometry();
          lineGeometry.setPositions(edgePositions);

          const edgeMaterial = new LineMaterial({
            color: 0x4488ff,
            linewidth: 6.0,
            resolution: new THREE.Vector2(
              containerRef.current.clientWidth,
              containerRef.current.clientHeight
            ),
          });

          const highlightLine = new LineSegments2(lineGeometry, edgeMaterial);
          highlightLine.computeLineDistances();
          highlightLine.name = `selected-edge-${selected.bodyId}-${selected.edgeIndex}`;
          highlightLine.renderOrder = 101;
          faceHighlightGroup.add(highlightLine);
        }
      }
    }

    needsRenderRef.current = true;
  }, [meshes, selectedFaces, selectedEdges, hover, sceneReady]);

  // Render datum planes
  useEffect(() => {
    const planesGroup = planesGroupRef.current;
    if (!planesGroup || !sceneReady) return;

    // Clear existing planes
    while (planesGroup.children.length > 0) {
      const child = planesGroup.children[0];
      planesGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Get all plane features
    const featureElements = getFeaturesArray(doc);
    for (const element of featureElements) {
      const feature = parseFeature(element);
      if (!feature || feature.type !== "plane") continue;

      const planeFeature = feature as PlaneFeature;

      // Skip planes that are gated (after rebuild gate)
      const status = featureStatus[planeFeature.id];
      if (status === "gated") continue;

      // Check visibility - show if visible OR if selected/hovered in feature tree
      const isSelected = selectedFeatureId === planeFeature.id;
      const isHovered = hoveredFeatureId === planeFeature.id;
      if (!planeFeature.visible && !isSelected && !isHovered) continue;

      // Determine display state
      const displayState: FeatureDisplayState = isSelected
        ? "selected"
        : isHovered
          ? "hovered"
          : "normal";
      const opacities = getPlaneOpacity(displayState);
      const lineWidth = getPlaneLineWidth(displayState);

      // Get plane color (custom or default)
      const defaultColor = getDefaultPlaneColor(planeFeature.id);
      const planeColor = parseHexColor(planeFeature.color, defaultColor);

      // Get plane properties
      const normal = new THREE.Vector3(...planeFeature.normal);
      const origin = new THREE.Vector3(...planeFeature.origin);
      const xDir = new THREE.Vector3(...planeFeature.xDir);
      const yDir = new THREE.Vector3().crossVectors(normal, xDir).normalize();

      const width = planeFeature.width ?? 100;
      const height = planeFeature.height ?? 100;
      const offsetX = planeFeature.offsetX ?? 0;
      const offsetY = planeFeature.offsetY ?? 0;

      // Apply offset
      const center = origin
        .clone()
        .add(xDir.clone().multiplyScalar(offsetX))
        .add(yDir.clone().multiplyScalar(offsetY));

      // Create plane geometry
      const planeGeometry = new THREE.PlaneGeometry(width, height);

      // Create transparent plane material with state-based opacity
      const planeMaterial = new THREE.MeshBasicMaterial({
        color: planeColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: opacities.fill,
        depthWrite: false,
      });

      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
      planeMesh.name = `plane-${planeFeature.id}`;

      // Orient the plane using quaternion
      const quaternion = new THREE.Quaternion();
      const matrix = new THREE.Matrix4();
      matrix.makeBasis(xDir, yDir, normal);
      quaternion.setFromRotationMatrix(matrix);

      planeMesh.position.copy(center);
      planeMesh.quaternion.copy(quaternion);

      planesGroup.add(planeMesh);

      // Add plane border using Line2 for visibility
      const borderPositions = [
        -width / 2,
        -height / 2,
        0,
        width / 2,
        -height / 2,
        0,
        width / 2,
        height / 2,
        0,
        -width / 2,
        height / 2,
        0,
        -width / 2,
        -height / 2,
        0, // close the loop
      ];

      const borderGeometry = new LineGeometry();
      borderGeometry.setPositions(borderPositions);

      const borderMaterial = new LineMaterial({
        color: planeColor,
        linewidth: lineWidth,
        resolution: new THREE.Vector2(800, 600),
        transparent: true,
        opacity: opacities.border,
      });

      const border = new Line2(borderGeometry, borderMaterial);
      border.computeLineDistances();
      border.name = `plane-border-${planeFeature.id}`;

      // Apply same transform to border
      border.position.copy(center);
      border.quaternion.copy(quaternion);

      planesGroup.add(border);

      // Add grid lines
      const gridSize = calculateGridSize(width, height);
      const gridPositions: number[] = [];

      // Vertical grid lines (along height)
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const startX = Math.ceil(-halfWidth / gridSize) * gridSize;
      const endX = Math.floor(halfWidth / gridSize) * gridSize;
      const startY = Math.ceil(-halfHeight / gridSize) * gridSize;
      const endY = Math.floor(halfHeight / gridSize) * gridSize;

      // Vertical lines
      for (let x = startX; x <= endX; x += gridSize) {
        gridPositions.push(x, -halfHeight, 0);
        gridPositions.push(x, halfHeight, 0);
      }

      // Horizontal lines
      for (let y = startY; y <= endY; y += gridSize) {
        gridPositions.push(-halfWidth, y, 0);
        gridPositions.push(halfWidth, y, 0);
      }

      if (gridPositions.length > 0) {
        const gridGeometry = new THREE.BufferGeometry();
        gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(gridPositions, 3));

        const gridMaterial = new THREE.LineBasicMaterial({
          color: planeColor,
          transparent: true,
          opacity: opacities.grid,
          depthWrite: false,
        });

        const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
        grid.name = `plane-grid-${planeFeature.id}`;

        // Apply same transform to grid
        grid.position.copy(center);
        grid.quaternion.copy(quaternion);

        planesGroup.add(grid);
      }
    }

    needsRenderRef.current = true;
  }, [doc.featuresById, features, sceneReady, selectedFeatureId, hoveredFeatureId, featureStatus]);

  // Render origin
  useEffect(() => {
    const originGroup = originGroupRef.current;
    if (!originGroup || !sceneReady) return;

    // Clear existing origin geometry
    while (originGroup.children.length > 0) {
      const child = originGroup.children[0];
      originGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Find origin feature
    const featureElements = getFeaturesArray(doc);
    for (const element of featureElements) {
      const feature = parseFeature(element);
      if (!feature || feature.type !== "origin") continue;

      const originFeature = feature as OriginFeature;

      // Skip features that are gated (after rebuild gate)
      const status = featureStatus[originFeature.id];
      if (status === "gated") continue;

      // Show if visible OR if selected/hovered in feature tree
      const isSelected = selectedFeatureId === originFeature.id;
      const isHovered = hoveredFeatureId === originFeature.id;
      if (!originFeature.visible && !isSelected && !isHovered) continue;

      // Determine display state
      const displayState: FeatureDisplayState = isSelected
        ? "selected"
        : isHovered
          ? "hovered"
          : "normal";
      const style = getOriginStyle(displayState);

      // Draw origin axes (small XYZ arrows)
      const axisLength = 15 * style.scale;
      const axisRadius = 0.5 * style.scale;

      // X axis (red)
      const xAxisGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8);
      xAxisGeometry.rotateZ(-Math.PI / 2);
      xAxisGeometry.translate(axisLength / 2, 0, 0);
      const xAxisMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: style.opacity,
      });
      const xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
      originGroup.add(xAxis);

      // Y axis (green)
      const yAxisGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8);
      yAxisGeometry.translate(0, axisLength / 2, 0);
      const yAxisMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: style.opacity,
      });
      const yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
      originGroup.add(yAxis);

      // Z axis (blue)
      const zAxisGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8);
      zAxisGeometry.rotateX(Math.PI / 2);
      zAxisGeometry.translate(0, 0, axisLength / 2);
      const zAxisMaterial = new THREE.MeshBasicMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: style.opacity,
      });
      const zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
      originGroup.add(zAxis);

      // Center sphere
      const sphereGeometry = new THREE.SphereGeometry(axisRadius * 1.5, 8, 8);
      const sphereMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: style.opacity,
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      originGroup.add(sphere);
    }

    needsRenderRef.current = true;
  }, [doc.featuresById, features, sceneReady, selectedFeatureId, hoveredFeatureId, featureStatus]);

  // Update 3D sketch visualization
  useEffect(() => {
    const sketchGroup = sketchGroupRef.current;
    if (!sketchGroup || !sceneReady) {
      return;
    }

    // Clear existing sketch geometry
    while (sketchGroup.children.length > 0) {
      const child = sketchGroup.children[0];
      sketchGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Get renderer size for LineMaterial resolution
    const renderer = rendererRef.current;
    const rendererSize = renderer ? new THREE.Vector2() : null;
    if (renderer && rendererSize) {
      renderer.getSize(rendererSize);
    }

    // Helper to get plane transformation - uses kernel transform when available
    const getPlaneTransform = (planeId: string, sketchId?: string) => {
      // Try to use kernel transform for accurate plane coordinates
      if (sketchId && sketchPlaneTransforms[sketchId]) {
        const t = sketchPlaneTransforms[sketchId];
        return {
          origin: new THREE.Vector3(...t.origin),
          xDir: new THREE.Vector3(...t.xDir),
          yDir: new THREE.Vector3(...t.yDir),
        };
      }

      // Fallback for built-in planes
      switch (planeId) {
        case "xy":
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 1, 0),
          };
        case "xz":
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 0, 1),
          };
        case "yz":
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(0, 1, 0),
            yDir: new THREE.Vector3(0, 0, 1),
          };
        default:
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 1, 0),
          };
      }
    };

    // Helper to render a sketch
    const renderSketch = (
      sketchData: SketchData,
      planeId: string,
      color: number,
      pointSize: number,
      sketchId?: string
    ) => {
      const { origin, xDir, yDir } = getPlaneTransform(planeId, sketchId);

      const toWorld = (x: number, y: number): THREE.Vector3 => {
        return new THREE.Vector3(
          origin.x + x * xDir.x + y * yDir.x,
          origin.y + x * xDir.y + y * yDir.y,
          origin.z + x * xDir.z + y * yDir.z
        );
      };

      const pointMap = new Map<string, { x: number; y: number }>();
      for (const point of sketchData.points) {
        pointMap.set(point.id, { x: point.x, y: point.y });
      }

      const createLine2 = (
        positions: number[],
        lineColor: number,
        dashed: boolean = false
      ): Line2 => {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: lineColor,
          linewidth: dashed ? 1.2 : 1.5,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: dashed,
          dashScale: 10,
          dashSize: 2,
          gapSize: 1.5,
        });
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 2;
        return line;
      };

      // Construction geometry color (orange-ish)
      const constructionColor = 0xff8800;

      // Draw lines
      for (const entity of sketchData.entities) {
        if (entity.type === "line") {
          const startPoint = pointMap.get(entity.start);
          const endPoint = pointMap.get(entity.end);
          if (startPoint && endPoint) {
            const startWorld = toWorld(startPoint.x, startPoint.y);
            const endWorld = toWorld(endPoint.x, endPoint.y);
            const positions = [
              startWorld.x,
              startWorld.y,
              startWorld.z,
              endWorld.x,
              endWorld.y,
              endWorld.z,
            ];
            const isConstruction = (entity as { construction?: boolean }).construction === true;
            sketchGroup.add(
              createLine2(positions, isConstruction ? constructionColor : color, isConstruction)
            );
          }
        } else if (entity.type === "arc") {
          const startPoint = pointMap.get(entity.start);
          const endPoint = pointMap.get(entity.end);
          const centerPoint = pointMap.get(entity.center);
          if (startPoint && endPoint && centerPoint) {
            const r = Math.hypot(startPoint.x - centerPoint.x, startPoint.y - centerPoint.y);
            const startAngle = Math.atan2(
              startPoint.y - centerPoint.y,
              startPoint.x - centerPoint.x
            );
            const endAngle = Math.atan2(endPoint.y - centerPoint.y, endPoint.x - centerPoint.x);
            const isFullCircle = entity.start === entity.end;
            const segments = isFullCircle ? 64 : 32;
            const positions: number[] = [];

            if (isFullCircle) {
              for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const worldPos = toWorld(
                  centerPoint.x + r * Math.cos(angle),
                  centerPoint.y + r * Math.sin(angle)
                );
                positions.push(worldPos.x, worldPos.y, worldPos.z);
              }
            } else {
              let sweep = endAngle - startAngle;
              if (entity.ccw) {
                if (sweep <= 0) sweep += Math.PI * 2;
              } else {
                if (sweep >= 0) sweep -= Math.PI * 2;
              }
              for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const angle = startAngle + t * sweep;
                const worldPos = toWorld(
                  centerPoint.x + r * Math.cos(angle),
                  centerPoint.y + r * Math.sin(angle)
                );
                positions.push(worldPos.x, worldPos.y, worldPos.z);
              }
            }
            const isConstruction = (entity as { construction?: boolean }).construction === true;
            sketchGroup.add(
              createLine2(positions, isConstruction ? constructionColor : color, isConstruction)
            );
          }
        } else if (entity.type === "circle") {
          // Circle entity: center point + radius (no edge point needed)
          const centerPoint = pointMap.get(entity.center);
          if (centerPoint && entity.radius > 0) {
            const segments = 64;
            const positions: number[] = [];

            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * Math.PI * 2;
              const worldPos = toWorld(
                centerPoint.x + entity.radius * Math.cos(angle),
                centerPoint.y + entity.radius * Math.sin(angle)
              );
              positions.push(worldPos.x, worldPos.y, worldPos.z);
            }

            const isConstruction = (entity as { construction?: boolean }).construction === true;
            sketchGroup.add(
              createLine2(positions, isConstruction ? constructionColor : color, isConstruction)
            );
          }
        }
      }

      // Draw points as screen-space points (don't scale with zoom)
      // Point size is ~2x the line width (linewidth is 1.5, so point size is 3-4)
      const positions: number[] = [];
      for (const point of sketchData.points) {
        const worldPos = toWorld(point.x, point.y);
        positions.push(worldPos.x, worldPos.y, worldPos.z);
      }

      if (positions.length > 0) {
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

        const pointsMaterial = new THREE.PointsMaterial({
          color,
          size: pointSize * 3, // Screen-space size in pixels (2x line width)
          sizeAttenuation: false, // Don't scale with distance
          depthTest: false,
        });

        const points = new THREE.Points(pointsGeometry, pointsMaterial);
        points.renderOrder = 3;
        sketchGroup.add(points);
      }
    };

    // Render active sketch being edited (blue)
    if (sketchMode.active && sketchMode.sketchId && sketchMode.planeId) {
      const sketchElement = findFeature(doc.featuresById, sketchMode.sketchId);
      if (sketchElement) {
        const sketchData = getSketchDataAsArrays(sketchElement);
        console.log(
          "[Viewer] Rendering active sketch:",
          sketchMode.sketchId,
          "points:",
          sketchData.points.length
        );
        renderSketch(sketchData, sketchMode.planeId, 0x00aaff, 1.5, sketchMode.sketchId!); // Blue, larger points
      }

      // Helper: Get plane transform for preview rendering
      const getPreviewTransform = () => {
        return getPlaneTransform(sketchMode.planeId!, sketchMode.sketchId!);
      };

      const toWorldCoord = (x: number, y: number): THREE.Vector3 => {
        const { origin, xDir, yDir } = getPreviewTransform();
        return new THREE.Vector3(
          origin.x + x * xDir.x + y * yDir.x,
          origin.y + x * xDir.y + y * yDir.y,
          origin.z + x * xDir.z + y * yDir.z
        );
      };

      // Render preview line (green dashed) for line tool
      if (previewLine && sketchMode.planeId) {
        const startWorld = toWorldCoord(previewLine.start.x, previewLine.start.y);
        const endWorld = toWorldCoord(previewLine.end.x, previewLine.end.y);

        const geometry = new LineGeometry();
        geometry.setPositions([
          startWorld.x,
          startWorld.y,
          startWorld.z,
          endWorld.x,
          endWorld.y,
          endWorld.z,
        ]);
        const material = new LineMaterial({
          color: 0x00ff00, // Green for preview
          linewidth: 2,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: true,
          dashScale: 10,
          dashSize: 3,
          gapSize: 3,
        });
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 3; // On top of everything
        sketchGroup.add(line);
      }

      // Render preview circle (green dashed)
      if (previewCircle && sketchMode.planeId && previewCircle.radius > 0.01) {
        const segments = 64;
        const positions: number[] = [];

        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const x = previewCircle.center.x + previewCircle.radius * Math.cos(angle);
          const y = previewCircle.center.y + previewCircle.radius * Math.sin(angle);
          const pt = toWorldCoord(x, y);
          positions.push(pt.x, pt.y, pt.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0x00ff00,
          linewidth: 2,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: true,
          dashScale: 10,
          dashSize: 3,
          gapSize: 3,
        });
        const circle = new Line2(geometry, material);
        circle.computeLineDistances();
        circle.renderOrder = 3;
        sketchGroup.add(circle);
      }

      // Render preview rectangle (green dashed)
      if (previewRect && sketchMode.planeId) {
        const { corner1, corner2 } = previewRect;
        const minX = Math.min(corner1.x, corner2.x);
        const minY = Math.min(corner1.y, corner2.y);
        const maxX = Math.max(corner1.x, corner2.x);
        const maxY = Math.max(corner1.y, corner2.y);

        const p1 = toWorldCoord(minX, minY);
        const p2 = toWorldCoord(maxX, minY);
        const p3 = toWorldCoord(maxX, maxY);
        const p4 = toWorldCoord(minX, maxY);

        const positions = [
          p1.x,
          p1.y,
          p1.z,
          p2.x,
          p2.y,
          p2.z,
          p3.x,
          p3.y,
          p3.z,
          p4.x,
          p4.y,
          p4.z,
          p1.x,
          p1.y,
          p1.z, // Close the loop
        ];

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0x00ff00,
          linewidth: 2,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: true,
          dashScale: 10,
          dashSize: 3,
          gapSize: 3,
        });
        const rect = new Line2(geometry, material);
        rect.computeLineDistances();
        rect.renderOrder = 3;
        sketchGroup.add(rect);
      }

      // Render preview polygon (green dashed) - for angled rectangles
      if (previewPolygon && previewPolygon.length >= 3 && sketchMode.planeId) {
        const positions: number[] = [];
        for (const pt of previewPolygon) {
          const worldPt = toWorldCoord(pt.x, pt.y);
          positions.push(worldPt.x, worldPt.y, worldPt.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0x00ff00,
          linewidth: 2,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: true,
          dashScale: 10,
          dashSize: 3,
          gapSize: 3,
        });
        const polygon = new Line2(geometry, material);
        polygon.computeLineDistances();
        polygon.renderOrder = 3;
        sketchGroup.add(polygon);
      }

      // Render preview arc (green dashed) - 3 point arc through start, bulge, end
      if (previewArc && sketchMode.planeId) {
        const { start, end, bulge } = previewArc;

        // Calculate arc center from 3 points using circumcircle formula
        const ax = start.x,
          ay = start.y;
        const bx = bulge.x,
          by = bulge.y;
        const cx = end.x,
          cy = end.y;

        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

        if (Math.abs(d) > 1e-10) {
          const aSq = ax * ax + ay * ay;
          const bSq = bx * bx + by * by;
          const cSq = cx * cx + cy * cy;

          const centerX = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
          const centerY = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;
          const radius = Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2);

          // Calculate angles
          const startAngle = Math.atan2(ay - centerY, ax - centerX);
          const endAngle = Math.atan2(cy - centerY, cx - centerX);
          const bulgeAngle = Math.atan2(by - centerY, bx - centerX);

          // Determine direction (CCW or CW) based on bulge point position
          const normalizeAngle = (a: number) => (a + Math.PI * 2) % (Math.PI * 2);
          const startNorm = normalizeAngle(startAngle);
          const endNorm = normalizeAngle(endAngle);
          const bulgeNorm = normalizeAngle(bulgeAngle);

          // Check if bulge is between start and end going CCW
          let ccw: boolean;
          if (startNorm < endNorm) {
            ccw = bulgeNorm > startNorm && bulgeNorm < endNorm;
          } else {
            ccw = bulgeNorm > startNorm || bulgeNorm < endNorm;
          }

          // Generate arc points
          const segments = 32;
          const positions: number[] = [];

          let angleDiff: number;
          if (ccw) {
            angleDiff = endAngle - startAngle;
            if (angleDiff < 0) angleDiff += Math.PI * 2;
          } else {
            angleDiff = endAngle - startAngle;
            if (angleDiff > 0) angleDiff -= Math.PI * 2;
          }

          for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = startAngle + t * angleDiff;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            const pt = toWorldCoord(x, y);
            positions.push(pt.x, pt.y, pt.z);
          }

          if (positions.length >= 6) {
            const geometry = new LineGeometry();
            geometry.setPositions(positions);
            const material = new LineMaterial({
              color: 0x00ff00,
              linewidth: 2,
              resolution: rendererSize || new THREE.Vector2(800, 600),
              depthTest: false,
              dashed: true,
              dashScale: 10,
              dashSize: 3,
              gapSize: 3,
            });
            const arc = new Line2(geometry, material);
            arc.computeLineDistances();
            arc.renderOrder = 3;
            sketchGroup.add(arc);
          }
        } else {
          // Points are collinear - just draw a line from start to end
          const startWorld = toWorldCoord(start.x, start.y);
          const endWorld = toWorldCoord(end.x, end.y);

          const geometry = new LineGeometry();
          geometry.setPositions([
            startWorld.x,
            startWorld.y,
            startWorld.z,
            endWorld.x,
            endWorld.y,
            endWorld.z,
          ]);
          const material = new LineMaterial({
            color: 0x00ff00,
            linewidth: 2,
            resolution: rendererSize || new THREE.Vector2(800, 600),
            depthTest: false,
            dashed: true,
            dashScale: 10,
            dashSize: 3,
            gapSize: 3,
          });
          const line = new Line2(geometry, material);
          line.computeLineDistances();
          line.renderOrder = 3;
          sketchGroup.add(line);
        }
      }
    }

    // Render visible (non-active) sketches in grey
    const featureElements = getFeaturesArray(doc);
    for (const element of featureElements) {
      const feature = parseFeature(element);
      if (!feature || feature.type !== "sketch") continue;

      const sketchFeature = feature as SketchFeature;

      // Skip if this is the active sketch (already rendered above)
      if (sketchMode.active && sketchMode.sketchId === sketchFeature.id) continue;

      // Show if visible OR if selected/hovered in feature tree
      const isSelected = selectedFeatureId === sketchFeature.id;
      const isHovered = hoveredFeatureId === sketchFeature.id;
      if (!sketchFeature.visible && !isSelected && !isHovered) continue;

      // Convert data format to arrays
      const sketchData: SketchData = {
        points: Object.values(sketchFeature.data.pointsById),
        entities: Object.values(sketchFeature.data.entitiesById),
        constraints: Object.values(sketchFeature.data.constraintsById),
      };
      if (sketchData.points.length === 0 && sketchData.entities.length === 0) continue;

      // Get plane ID from SketchPlaneRef
      const planeId = sketchFeature.plane.ref;
      renderSketch(sketchData, planeId, 0x888888, 1.0, sketchFeature.id); // Grey, smaller points
    }

    needsRenderRef.current = true;
  }, [
    sketchMode.active,
    sketchMode.sketchId,
    sketchMode.planeId,
    doc.featuresById,
    features,
    sceneReady,
    selectedFeatureId,
    hoveredFeatureId,
    previewLine,
    previewCircle,
    previewArc,
    previewRect,
    sketchPlaneTransforms,
  ]);

  // Render selection highlights and constraint annotations (only when editing sketch)
  useEffect(() => {
    const selectionGroup = selectionGroupRef.current;
    const labelsGroup = constraintLabelsGroupRef.current;
    if (!selectionGroup || !labelsGroup || !sceneReady) return;

    // Clear existing selection geometry
    while (selectionGroup.children.length > 0) {
      const child = selectionGroup.children[0];
      selectionGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Clear existing labels
    while (labelsGroup.children.length > 0) {
      const child = labelsGroup.children[0];
      labelsGroup.remove(child);
    }

    // Only render when actively editing a sketch
    if (!sketchMode.active || !sketchMode.sketchId || !sketchMode.planeId) return;

    const sketch = getSketch();
    if (!sketch) return;

    // Get renderer size for LineMaterial resolution
    const renderer = rendererRef.current;
    const rendererSize = renderer ? new THREE.Vector2() : null;
    if (renderer && rendererSize) {
      renderer.getSize(rendererSize);
    }

    // Get plane transformation - uses kernel transform when available
    const getPlaneTransformForSketch = () => {
      // Try to use kernel transform for accurate plane coordinates
      if (sketchMode.sketchId && sketchPlaneTransforms[sketchMode.sketchId]) {
        const t = sketchPlaneTransforms[sketchMode.sketchId];
        return {
          origin: new THREE.Vector3(...t.origin),
          xDir: new THREE.Vector3(...t.xDir),
          yDir: new THREE.Vector3(...t.yDir),
        };
      }

      // Fallback for built-in planes
      switch (sketchMode.planeId) {
        case "xy":
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 1, 0),
          };
        case "xz":
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 0, 1),
          };
        case "yz":
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(0, 1, 0),
            yDir: new THREE.Vector3(0, 0, 1),
          };
        default:
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 1, 0),
          };
      }
    };

    const { origin, xDir, yDir } = getPlaneTransformForSketch();
    const toWorld = (x: number, y: number): THREE.Vector3 => {
      return new THREE.Vector3(
        origin.x + x * xDir.x + y * yDir.x,
        origin.y + x * xDir.y + y * yDir.y,
        origin.z + x * xDir.z + y * yDir.z
      );
    };

    // Draw selection highlights for selected entities (yellow glow)
    for (const entity of sketch.entities) {
      if (!selectedLines.has(entity.id)) continue;

      if (entity.type === "line") {
        const line = entity as SketchLine;
        const startPoint = sketch.points.find((p) => p.id === line.start);
        const endPoint = sketch.points.find((p) => p.id === line.end);
        if (!startPoint || !endPoint) continue;

        const startWorld = toWorld(startPoint.x, startPoint.y);
        const endWorld = toWorld(endPoint.x, endPoint.y);

        const geometry = new LineGeometry();
        geometry.setPositions([
          startWorld.x,
          startWorld.y,
          startWorld.z,
          endWorld.x,
          endWorld.y,
          endWorld.z,
        ]);
        const material = new LineMaterial({
          color: 0xffff00, // Yellow for selection
          linewidth: 6,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          transparent: true,
          opacity: 0.6,
        });
        const selLine = new Line2(geometry, material);
        selLine.computeLineDistances();
        selLine.renderOrder = 1; // Below main sketch lines
        selectionGroup.add(selLine);
      } else if (entity.type === "arc") {
        // Arc selection highlight
        const arc = entity as SketchArc;
        const startPoint = sketch.points.find((p) => p.id === arc.start);
        const endPoint = sketch.points.find((p) => p.id === arc.end);
        const centerPoint = sketch.points.find((p) => p.id === arc.center);
        if (!startPoint || !endPoint || !centerPoint) continue;

        const radius = Math.hypot(startPoint.x - centerPoint.x, startPoint.y - centerPoint.y);
        const startAngle = Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
        const endAngle = Math.atan2(endPoint.y - centerPoint.y, endPoint.x - centerPoint.x);

        let sweep = endAngle - startAngle;
        if (arc.ccw) {
          if (sweep <= 0) sweep += Math.PI * 2;
        } else {
          if (sweep >= 0) sweep -= Math.PI * 2;
        }

        const segments = 32;
        const positions: number[] = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = startAngle + t * sweep;
          const worldPos = toWorld(
            centerPoint.x + radius * Math.cos(angle),
            centerPoint.y + radius * Math.sin(angle)
          );
          positions.push(worldPos.x, worldPos.y, worldPos.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0xffff00,
          linewidth: 6,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          transparent: true,
          opacity: 0.6,
        });
        const selArc = new Line2(geometry, material);
        selArc.computeLineDistances();
        selArc.renderOrder = 1;
        selectionGroup.add(selArc);
      } else if (entity.type === "circle") {
        // Circle selection highlight
        const circle = entity as SketchCircle;
        const centerPoint = sketch.points.find((p) => p.id === circle.center);
        if (!centerPoint) continue;

        const radius = circle.radius;
        const segments = 64;
        const positions: number[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const worldPos = toWorld(
            centerPoint.x + radius * Math.cos(angle),
            centerPoint.y + radius * Math.sin(angle)
          );
          positions.push(worldPos.x, worldPos.y, worldPos.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0xffff00,
          linewidth: 6,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          transparent: true,
          opacity: 0.6,
        });
        const selCircle = new Line2(geometry, material);
        selCircle.computeLineDistances();
        selCircle.renderOrder = 1;
        selectionGroup.add(selCircle);
      }
    }

    // Draw selection highlights for selected points (yellow ring)
    for (const point of sketch.points) {
      if (!selectedPoints.has(point.id)) continue;

      const worldPos = toWorld(point.x, point.y);

      // Create a ring geometry
      const ringGeometry = new THREE.RingGeometry(3, 5, 16);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(worldPos);
      ring.renderOrder = 4;

      // Orient ring to face camera (will be updated in render loop)
      // For now, orient to sketch plane normal
      const planeNormal = new THREE.Vector3().crossVectors(xDir, yDir).normalize();
      ring.lookAt(worldPos.clone().add(planeNormal));

      selectionGroup.add(ring);
    }

    // Draw dimension annotations (distance and angle) - SolidWorks style
    for (const c of sketch.constraints) {
      if (c.type === "distance") {
        // Distance constraint: draw dimension line with arrows and value
        const [ptIdA, ptIdB] = c.points ?? [];
        const pA = sketch.points.find((p) => p.id === ptIdA);
        const pB = sketch.points.find((p) => p.id === ptIdB);
        if (!pA || !pB) continue;

        const midX = (pA.x + pB.x) / 2;
        const midY = (pA.y + pB.y) / 2;
        // Offset the dimension line perpendicular to the constraint
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const perpX = len > 0 ? -dy / len : 0;
        const perpY = len > 0 ? dx / len : 1;

        // Use stored offset or default to 15
        const storedOffsetX = c.offsetX ?? 0;
        const storedOffsetY = c.offsetY ?? 15;
        // If being dragged, use current drag offset
        const effectiveOffsetX =
          draggingDimensionId === c.id && dragCurrentOffset ? dragCurrentOffset.x : storedOffsetX;
        const effectiveOffsetY =
          draggingDimensionId === c.id && dragCurrentOffset ? dragCurrentOffset.y : storedOffsetY;

        const labelX = midX + perpX * effectiveOffsetY + (dx / len || 0) * effectiveOffsetX;
        const labelY = midY + perpY * effectiveOffsetY + (dy / len || 0) * effectiveOffsetX;
        const offset = effectiveOffsetY; // for extension lines

        // Draw extension lines
        const extA = toWorld(pA.x + perpX * offset * 0.7, pA.y + perpY * offset * 0.7);
        const extB = toWorld(pB.x + perpX * offset * 0.7, pB.y + perpY * offset * 0.7);
        const dimA = toWorld(pA.x + perpX * offset, pA.y + perpY * offset);
        const dimB = toWorld(pB.x + perpX * offset, pB.y + perpY * offset);
        const worldA = toWorld(pA.x, pA.y);
        const worldB = toWorld(pB.x, pB.y);

        // Extension lines (from point to dimension line)
        const extGeom1 = new LineGeometry();
        extGeom1.setPositions([worldA.x, worldA.y, worldA.z, extA.x, extA.y, extA.z]);
        const extMat1 = new LineMaterial({
          color: 0x00aa00,
          linewidth: 1,
          resolution: rendererSize ?? new THREE.Vector2(1, 1),
        });
        const extLine1 = new Line2(extGeom1, extMat1);
        extLine1.computeLineDistances();
        selectionGroup.add(extLine1);

        const extGeom2 = new LineGeometry();
        extGeom2.setPositions([worldB.x, worldB.y, worldB.z, extB.x, extB.y, extB.z]);
        const extMat2 = new LineMaterial({
          color: 0x00aa00,
          linewidth: 1,
          resolution: rendererSize ?? new THREE.Vector2(1, 1),
        });
        const extLine2 = new Line2(extGeom2, extMat2);
        extLine2.computeLineDistances();
        selectionGroup.add(extLine2);

        // Dimension line (between extension lines)
        const dimGeom = new LineGeometry();
        dimGeom.setPositions([dimA.x, dimA.y, dimA.z, dimB.x, dimB.y, dimB.z]);
        const dimMat = new LineMaterial({
          color: 0x00aa00,
          linewidth: 2,
          resolution: rendererSize ?? new THREE.Vector2(1, 1),
        });
        const dimLine = new Line2(dimGeom, dimMat);
        dimLine.computeLineDistances();
        selectionGroup.add(dimLine);

        // Create dimension label (editable on double-click, draggable)
        const labelPos = toWorld(labelX, labelY);
        const labelDiv = document.createElement("div");
        labelDiv.className = "dimension-label draggable-dimension";
        labelDiv.textContent = `${c.value.toFixed(1)}`;
        labelDiv.style.cssText = `
          background: rgba(0, 170, 0, 0.95);
          color: white;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: move;
          user-select: none;
          pointer-events: auto;
        `;
        labelDiv.dataset.constraintId = c.id;
        labelDiv.dataset.constraintType = "distance";
        labelDiv.dataset.storedOffsetX = String(storedOffsetX);
        labelDiv.dataset.storedOffsetY = String(storedOffsetY);
        // Store world position for camera tracking during inline edit
        labelDiv.dataset.worldX = String(labelPos.x);
        labelDiv.dataset.worldY = String(labelPos.y);
        labelDiv.dataset.worldZ = String(labelPos.z);
        // Stop mousedown from bubbling to prevent entity drag interference
        labelDiv.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });
        // Add click handler for selection
        labelDiv.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleConstraintSelection(c.id);
        });
        // Add double-click handler for editing
        labelDiv.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDimensionDblClickRef.current?.(c.id, "distance", labelDiv);
        });
        // Highlight if selected
        if (selectedConstraints.has(c.id)) {
          labelDiv.style.outline = "2px solid #ff6600";
          labelDiv.style.outlineOffset = "2px";
        }
        const labelObject = new CSS2DObject(labelDiv);
        labelObject.position.copy(labelPos);
        labelsGroup.add(labelObject);
      } else if (c.type === "angle") {
        // Angle constraint: draw arc between lines with angle value
        const [lineId1, lineId2] = c.lines ?? [];
        const line1 = sketch.entities.find((e) => e.type === "line" && e.id === lineId1) as
          | SketchLine
          | undefined;
        const line2 = sketch.entities.find((e) => e.type === "line" && e.id === lineId2) as
          | SketchLine
          | undefined;
        if (!line1 || !line2) continue;

        // Find intersection point of the two lines
        const l1p1 = sketch.points.find((p) => p.id === line1.start);
        const l1p2 = sketch.points.find((p) => p.id === line1.end);
        const l2p1 = sketch.points.find((p) => p.id === line2.start);
        const l2p2 = sketch.points.find((p) => p.id === line2.end);
        if (!l1p1 || !l1p2 || !l2p1 || !l2p2) continue;

        // Find common point (intersection)
        let centerPt: { x: number; y: number } | null = null;
        if (l1p1.id === l2p1.id || l1p1.id === l2p2.id) centerPt = { x: l1p1.x, y: l1p1.y };
        else if (l1p2.id === l2p1.id || l1p2.id === l2p2.id) centerPt = { x: l1p2.x, y: l1p2.y };
        else
          centerPt = {
            x: (l1p1.x + l1p2.x + l2p1.x + l2p2.x) / 4,
            y: (l1p1.y + l1p2.y + l2p1.y + l2p2.y) / 4,
          };

        // Place label near the center with user offset
        const baseOffset = 25;
        const dir1x = l1p2.x - l1p1.x;
        const dir1y = l1p2.y - l1p1.y;
        const dir2x = l2p2.x - l2p1.x;
        const dir2y = l2p2.y - l2p1.y;
        const avgDirX = (dir1x + dir2x) / 2;
        const avgDirY = (dir1y + dir2y) / 2;
        const avgLen = Math.sqrt(avgDirX * avgDirX + avgDirY * avgDirY) || 1;

        // Use stored offset or default
        const storedOffsetX = c.offsetX ?? 0;
        const storedOffsetY = c.offsetY ?? baseOffset;
        // If being dragged, use current drag offset
        const effectiveOffsetX =
          draggingDimensionId === c.id && dragCurrentOffset ? dragCurrentOffset.x : storedOffsetX;
        const effectiveOffsetY =
          draggingDimensionId === c.id && dragCurrentOffset ? dragCurrentOffset.y : storedOffsetY;

        const labelX = centerPt.x + (avgDirX / avgLen) * effectiveOffsetY + effectiveOffsetX;
        const labelY = centerPt.y + (avgDirY / avgLen) * effectiveOffsetY;

        // Create angle label (draggable)
        const labelPos = toWorld(labelX, labelY);
        const labelDiv = document.createElement("div");
        labelDiv.className = "dimension-label angle-label draggable-dimension";
        labelDiv.textContent = `${c.value.toFixed(1)}°`;
        labelDiv.style.cssText = `
          background: rgba(170, 85, 0, 0.95);
          color: white;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: move;
          user-select: none;
          pointer-events: auto;
        `;
        labelDiv.dataset.constraintId = c.id;
        labelDiv.dataset.constraintType = "angle";
        labelDiv.dataset.storedOffsetX = String(storedOffsetX);
        labelDiv.dataset.storedOffsetY = String(storedOffsetY);
        // Store world position for camera tracking during inline edit
        labelDiv.dataset.worldX = String(labelPos.x);
        labelDiv.dataset.worldY = String(labelPos.y);
        labelDiv.dataset.worldZ = String(labelPos.z);
        // Stop mousedown from bubbling to prevent entity drag interference
        labelDiv.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });
        // Add click handler for selection
        labelDiv.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleConstraintSelection(c.id);
        });
        // Add double-click handler for editing
        labelDiv.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDimensionDblClickRef.current?.(c.id, "angle", labelDiv);
        });
        // Highlight if selected
        if (selectedConstraints.has(c.id)) {
          labelDiv.style.outline = "2px solid #ff6600";
          labelDiv.style.outlineOffset = "2px";
        }
        const labelObject = new CSS2DObject(labelDiv);
        labelObject.position.copy(labelPos);
        labelsGroup.add(labelObject);
      }
    }

    // Draw constraint annotations (H, V, C, F, etc. labels) - only when editing
    for (const c of sketch.constraints) {
      // Skip dimension constraints (already drawn above)
      if (c.type === "distance" || c.type === "angle") continue;

      const label =
        c.type === "horizontal"
          ? "H"
          : c.type === "vertical"
            ? "V"
            : c.type === "coincident"
              ? "C"
              : c.type === "fixed"
                ? "F"
                : "?";

      let labelPos: THREE.Vector3 | null = null;

      if (c.type === "fixed") {
        const p = sketch.points.find((pt) => pt.id === c.point);
        if (p) {
          labelPos = toWorld(p.x + 5, p.y + 5);
        }
      } else if (c.type === "coincident" || c.type === "horizontal" || c.type === "vertical") {
        const [a, b] = c.points ?? [];
        const p1 = sketch.points.find((pt) => pt.id === a);
        const p2 = sketch.points.find((pt) => pt.id === b);
        if (p1 && p2 && (c.type === "horizontal" || c.type === "vertical")) {
          labelPos = toWorld((p1.x + p2.x) * 0.5 + 5, (p1.y + p2.y) * 0.5 + 5);
        } else if (p1) {
          labelPos = toWorld(p1.x + 5, p1.y + 5);
        } else if (p2) {
          labelPos = toWorld(p2.x + 5, p2.y + 5);
        }
      }

      if (labelPos) {
        // Create CSS2D label
        const labelDiv = document.createElement("div");
        labelDiv.className = "constraint-label";
        labelDiv.textContent = label;
        labelDiv.dataset.constraintId = c.id;
        const isSelected = selectedConstraints.has(c.id);
        labelDiv.style.cssText = `
          background: rgba(0, 120, 212, 0.9);
          color: white;
          padding: 2px 5px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          pointer-events: auto;
          ${isSelected ? "outline: 2px solid #ff6600; outline-offset: 2px;" : ""}
        `;
        // Add click handler for selection
        labelDiv.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleConstraintSelection(c.id);
        });
        const labelObject = new CSS2DObject(labelDiv);
        labelObject.position.copy(labelPos);
        labelsGroup.add(labelObject);
      }
    }

    needsRenderRef.current = true;
  }, [
    sketchMode.active,
    sketchMode.sketchId,
    sketchMode.planeId,
    selectedPoints,
    selectedLines,
    selectedConstraints,
    toggleConstraintSelection,
    getSketch,
    sceneReady,
    draggingDimensionId,
    dragCurrentOffset,
    sketchPlaneTransforms,
  ]);

  // Keep dimension double-click handler ref updated
  useEffect(() => {
    handleDimensionDblClickRef.current = (
      constraintId: string,
      constraintType: "distance" | "angle",
      element: HTMLElement
    ) => {
      const sketch = getSketch();
      if (!sketch) return;

      const constraint = sketch.constraints.find((c) => c.id === constraintId);
      if (!constraint || (constraint.type !== "distance" && constraint.type !== "angle")) return;

      const container = containerRef.current;
      if (!container) return;

      // Store the 3D world position for camera tracking
      const worldX = parseFloat(element.dataset.worldX ?? "0");
      const worldY = parseFloat(element.dataset.worldY ?? "0");
      const worldZ = parseFloat(element.dataset.worldZ ?? "0");
      editingDimensionWorldPos.current = new THREE.Vector3(worldX, worldY, worldZ);

      // Get the label's screen position for inline editing
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setEditingDimensionPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
      });
      setEditingDimensionId(constraintId);
      setEditingDimensionValue(String(constraint.value));
      setEditingDimensionType(constraintType);
    };
  }, [getSketch]);

  // Handle dimension label dragging for repositioning
  // Uses a drag threshold to allow double-clicks to work
  useEffect(() => {
    if (!sketchMode.active) return;

    let isPotentialDrag = false;
    let isDragging = false;
    let currentDragId: string | null = null;
    let currentTarget: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let initialOffsetX = 0;
    let initialOffsetY = 0;
    const DRAG_THRESHOLD = 5; // Pixels of movement before drag starts

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("draggable-dimension") && e.button === 0) {
        // Prepare for potential drag, but don't start yet (allows double-click)
        const constraintId = target.dataset.constraintId;
        if (constraintId) {
          isPotentialDrag = true;
          currentDragId = constraintId;
          currentTarget = target;
          startX = e.clientX;
          startY = e.clientY;
          initialOffsetX = parseFloat(target.dataset.storedOffsetX ?? "0");
          initialOffsetY = parseFloat(target.dataset.storedOffsetY ?? "15");
          // Don't prevent default or stop propagation here - allows double-click to fire
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPotentialDrag || !currentDragId) return;

      // Check if we've moved past the drag threshold
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!isDragging && distance >= DRAG_THRESHOLD) {
        // Start actual drag
        isDragging = true;
        setDraggingDimensionId(currentDragId);
        setDragCurrentOffset({ x: initialOffsetX, y: initialOffsetY });
      }

      if (isDragging) {
        // Calculate offset delta (scaled to sketch units - approximate)
        const deltaX = dx * 0.5; // Rough scaling factor
        const deltaY = -dy * 0.5; // Invert Y for sketch coords

        setDragCurrentOffset({
          x: initialOffsetX + deltaX,
          y: initialOffsetY + deltaY,
        });
      }
    };

    const handleMouseUp = (_e: MouseEvent) => {
      if (isDragging && currentDragId) {
        // Complete the drag - save to document
        // Get current offset from the state (we need to recalculate)
        const dx = _e.clientX - startX;
        const dy = _e.clientY - startY;
        const deltaX = dx * 0.5;
        const deltaY = -dy * 0.5;
        const finalOffsetX = initialOffsetX + deltaX;
        const finalOffsetY = initialOffsetY + deltaY;

        updateConstraintOffset(currentDragId, finalOffsetX, finalOffsetY);
      }

      // Reset all state
      isPotentialDrag = false;
      isDragging = false;
      currentDragId = null;
      currentTarget = null;
      setDraggingDimensionId(null);
      setDragCurrentOffset(null);
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
    };
  }, [sketchMode.active, updateConstraintOffset]);

  // Handle inline dimension edit submission
  const handleDimensionEditSubmit = useCallback(() => {
    if (!editingDimensionId) return;
    const value = parseFloat(editingDimensionValue);
    if (!isNaN(value) && value > 0) {
      updateConstraintValue(editingDimensionId, value);
    }
    setEditingDimensionId(null);
    setEditingDimensionValue("");
    setEditingDimensionPos(null);
  }, [editingDimensionId, editingDimensionValue, updateConstraintValue]);

  // Focus the dimension input when it appears
  useEffect(() => {
    if (editingDimensionId && dimensionInputRef.current) {
      dimensionInputRef.current.focus();
      dimensionInputRef.current.select();
    }
  }, [editingDimensionId]);

  // Update dimension input position as camera moves
  useEffect(() => {
    if (!editingDimensionId || !editingDimensionWorldPos.current) return;
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    let animationId: number | null = null;

    const updatePosition = () => {
      if (!editingDimensionWorldPos.current || !camera || !container) {
        animationId = requestAnimationFrame(updatePosition);
        return;
      }

      // Project 3D world position to screen coordinates
      const worldPos = editingDimensionWorldPos.current.clone();
      worldPos.project(camera);

      // Convert normalized device coordinates to screen coordinates
      const containerRect = container.getBoundingClientRect();
      const screenX = ((worldPos.x + 1) / 2) * containerRect.width;
      const screenY = ((-worldPos.y + 1) / 2) * containerRect.height;

      setEditingDimensionPos({ x: screenX, y: screenY });
      animationId = requestAnimationFrame(updatePosition);
    };

    animationId = requestAnimationFrame(updatePosition);

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [editingDimensionId]);

  // Clear world position ref when editing ends
  useEffect(() => {
    if (!editingDimensionId) {
      editingDimensionWorldPos.current = null;
    }
  }, [editingDimensionId]);

  // Reset camera to face the sketch plane normal
  const resetToSketchNormal = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera || !sketchMode.sketchId) return;

    // Get the plane transform from kernel
    const transform = sketchPlaneTransforms[sketchMode.sketchId];
    if (!transform) {
      // Fallback for built-in planes
      let normal: THREE.Vector3;
      let up: THREE.Vector3;
      switch (sketchMode.planeId) {
        case "xy":
          normal = new THREE.Vector3(0, 0, 1);
          up = new THREE.Vector3(0, 1, 0);
          break;
        case "xz":
          normal = new THREE.Vector3(0, 1, 0);
          up = new THREE.Vector3(0, 0, -1);
          break;
        case "yz":
          normal = new THREE.Vector3(1, 0, 0);
          up = new THREE.Vector3(0, 1, 0);
          break;
        default:
          return;
      }

      const distance = camera.position.distanceTo(targetRef.current);
      camera.position.copy(targetRef.current).add(normal.multiplyScalar(distance));
      camera.up.copy(up);
      camera.lookAt(targetRef.current);
      needsRenderRef.current = true;
      return;
    }

    // Use the kernel's plane transform
    const normal = new THREE.Vector3(...transform.normal);
    const yDir = new THREE.Vector3(...transform.yDir);
    const origin = new THREE.Vector3(...transform.origin);

    // Position camera along the plane normal
    const distance = camera.position.distanceTo(targetRef.current);
    const newTarget = origin.clone();
    camera.position.copy(newTarget).add(normal.clone().multiplyScalar(distance));
    targetRef.current.copy(newTarget);
    camera.up.copy(yDir);
    camera.lookAt(targetRef.current);
    needsRenderRef.current = true;
  }, [sketchMode.sketchId, sketchMode.planeId, sketchPlaneTransforms]);

  // Handle escape to cancel dimension editing
  useEffect(() => {
    if (!editingDimensionId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleDimensionEditSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingDimensionId(null);
        setEditingDimensionValue("");
        setEditingDimensionPos(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editingDimensionId, handleDimensionEditSubmit]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    // Use theme value directly - #FDFAF8 for light, #1a1a1a for dark
    const initialBgColor = theme === "dark" ? 0x1a1a1a : 0xfdfaf8;
    scene.background = new THREE.Color(initialBgColor);
    sceneRef.current = scene;

    // Camera setup - zoom out to show ~300mm working space
    const camera = new THREE.PerspectiveCamera(
      45, // Narrower FOV like CAD apps
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    );
    // Isometric-ish starting view - distance for ~300mm workspace
    const distance = 350;
    camera.position.set(distance * 0.577, distance * 0.577, distance * 0.577);
    camera.lookAt(targetRef.current);
    cameraRef.current = camera;

    // Renderer setup with improved tone mapping for better contrast
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap for performance
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing setup for ambient occlusion
    const composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Normal pass required for SSAO
    const normalPass = new NormalPass(scene, camera);
    composer.addPass(normalPass);

    // SSAO Effect - screen-space ambient occlusion for depth perception
    const ssaoEffect = new SSAOEffect(camera, normalPass.texture, {
      worldDistanceThreshold: 100, // Distance threshold in world units
      worldDistanceFalloff: 50,
      worldProximityThreshold: 5,
      worldProximityFalloff: 2,
      luminanceInfluence: 0.5, // How much scene luminance affects AO
      radius: 0.1, // Occlusion sampling radius
      intensity: 2.5, // AO intensity for visible effect
      bias: 0.025,
      samples: 16, // Quality samples
      rings: 4,
      color: new THREE.Color(0x000000), // Black AO shadows
    });
    aoEffectRef.current = ssaoEffect;

    // Effect pass to apply SSAO
    const effectPass = new EffectPass(camera, ssaoEffect);
    composer.addPass(effectPass);

    composerRef.current = composer;

    // Enhanced CAD-style lighting with better contrast
    // Stronger ambient for base visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Key light - main illumination from upper-front-right (stronger for contrast)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(200, 350, 300);
    scene.add(keyLight);

    // Fill light - softer from opposite side to reduce harsh shadows
    const fillLight = new THREE.DirectionalLight(0xf0f0ff, 0.4);
    fillLight.position.set(-200, 50, -100);
    scene.add(fillLight);

    // Rim/back light - highlights edges from behind (gives depth)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(-50, 100, -300);
    scene.add(rimLight);

    // Top light - soft overhead illumination
    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 400, 0);
    scene.add(topLight);

    // Hemisphere light for natural sky/ground gradient
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    scene.add(hemiLight);

    // Group for kernel meshes
    const meshGroup = new THREE.Group();
    meshGroup.name = "kernel-meshes";
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Group for edge lines (rendered on top of meshes)
    const edgeGroup = new THREE.Group();
    edgeGroup.name = "edge-lines";
    edgeGroup.renderOrder = 0.1; // Slightly above meshes
    scene.add(edgeGroup);
    edgeGroupRef.current = edgeGroup;

    // Group for sketch visualization (rendered in 3D space)
    const sketchGroup = new THREE.Group();
    sketchGroup.name = "sketch-3d";
    sketchGroup.renderOrder = 1; // Render on top of meshes
    scene.add(sketchGroup);
    sketchGroupRef.current = sketchGroup;

    // Group for selection highlights
    const selectionGroup = new THREE.Group();
    selectionGroup.name = "selection-highlights";
    selectionGroup.renderOrder = 0.5; // Below sketch lines
    scene.add(selectionGroup);
    selectionGroupRef.current = selectionGroup;

    // Group for constraint labels (CSS2D)
    const constraintLabelsGroup = new THREE.Group();
    constraintLabelsGroup.name = "constraint-labels";
    scene.add(constraintLabelsGroup);
    constraintLabelsGroupRef.current = constraintLabelsGroup;

    // CSS2D Renderer for constraint labels
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    containerRef.current.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    // Group for datum planes visualization
    const planesGroup = new THREE.Group();
    planesGroup.name = "datum-planes";
    planesGroup.renderOrder = 0; // Render behind sketches
    scene.add(planesGroup);
    planesGroupRef.current = planesGroup;

    // Group for origin visualization
    const originGroup = new THREE.Group();
    originGroup.name = "origin";
    originGroup.renderOrder = 0;
    scene.add(originGroup);
    originGroupRef.current = originGroup;

    // Group for 3D face/edge selection highlights
    const faceHighlightGroup = new THREE.Group();
    faceHighlightGroup.name = "face-highlights";
    faceHighlightGroup.renderOrder = 2; // Render on top of meshes
    scene.add(faceHighlightGroup);
    faceHighlightGroupRef.current = faceHighlightGroup;

    // Mark scene as ready so mesh/sketch effects can run
    setSceneReady(true);
    console.log("[Viewer] Scene setup complete, sceneReady: true");

    // Laptop-friendly controls:
    // - Left mouse drag: Rotate/orbit
    // - Left mouse + Shift: Pan
    // - Right mouse drag: Pan (alternative)
    // - Scroll wheel: Zoom

    let isDragging = false;
    let isRotating = false;
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      // Check if in sketch mode with an active tool - prevent rotation for left click
      const currentSketchMode = sketchModeRef.current;
      const hasActiveTool = currentSketchMode.active && currentSketchMode.activeTool !== "none";

      if (e.button === 0) {
        // Left mouse button
        e.preventDefault();

        // In sketch mode with a tool active, left click is for sketching/selection, not rotation
        // When tool is 'none', allow rotation like in normal mode
        if (hasActiveTool) {
          isDragging = false;
          isRotating = false;
          isPanning = false;
        } else if (e.shiftKey) {
          isDragging = true;
          isPanning = true;
          isRotating = false;
        } else {
          isDragging = true;
          isRotating = true;
          isPanning = false;
        }
      } else if (e.button === 1) {
        // Middle mouse - also rotate (allowed even in sketch mode)
        e.preventDefault();
        isDragging = true;
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          isPanning = true;
          isRotating = false;
        } else {
          isRotating = true;
          isPanning = false;
        }
      } else if (e.button === 2) {
        // Right mouse for panning (allowed even in sketch mode)
        e.preventDefault();
        isDragging = true;
        isPanning = true;
        isRotating = false;
      }
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !cameraRef.current) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      const currentCamera = cameraRef.current;

      if (isRotating) {
        // Orbit around target
        const spherical = new THREE.Spherical();
        const offset = currentCamera.position.clone().sub(targetRef.current);
        spherical.setFromVector3(offset);

        spherical.theta -= deltaX * 0.01;
        spherical.phi += deltaY * 0.01;
        // Clamp phi to avoid flipping
        spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));

        offset.setFromSpherical(spherical);
        currentCamera.position.copy(targetRef.current).add(offset);
        currentCamera.lookAt(targetRef.current);
        needsRenderRef.current = true;
        // Broadcast camera state for following users
        broadcastCameraRef.current();
      } else if (isPanning) {
        // Pan the camera and target
        const panSpeed = 0.01;

        // Get camera's right and up vectors
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        currentCamera.matrix.extractBasis(right, up, new THREE.Vector3());

        // Calculate pan offset
        const distance = currentCamera.position.distanceTo(targetRef.current);
        const panX = right.multiplyScalar(-deltaX * panSpeed * distance * 0.1);
        const panY = up.multiplyScalar(deltaY * panSpeed * distance * 0.1);
        const panOffset = panX.add(panY);

        currentCamera.position.add(panOffset);
        targetRef.current.add(panOffset);
        currentCamera.lookAt(targetRef.current);
        needsRenderRef.current = true;
        // Broadcast camera state for following users
        broadcastCameraRef.current();
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
      isRotating = false;
      isPanning = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;

      const currentCamera = cameraRef.current;

      // Zoom toward/away from target
      const zoomSpeed = 0.001;
      const distance = currentCamera.position.distanceTo(targetRef.current);
      const zoomFactor = 1 + e.deltaY * zoomSpeed;
      const newDistance = Math.max(10, Math.min(5000, distance * zoomFactor));

      const direction = currentCamera.position.clone().sub(targetRef.current).normalize();
      currentCamera.position.copy(targetRef.current).add(direction.multiplyScalar(newDistance));

      // Update orthographic camera frustum if needed
      if (currentCamera instanceof THREE.OrthographicCamera && containerRef.current) {
        const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        const frustumSize = newDistance * 0.5;
        currentCamera.left = -frustumSize * aspect;
        currentCamera.right = frustumSize * aspect;
        currentCamera.top = frustumSize;
        currentCamera.bottom = -frustumSize;
        currentCamera.updateProjectionMatrix();
      }

      // Broadcast camera state for following users
      broadcastCameraRef.current();

      needsRenderRef.current = true;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent context menu on right click

      // In sketch mode: right-click ends current tool operation
      if (sketchModeRef.current.active) {
        const tool = sketchModeRef.current.activeTool;
        if (tool === "line") {
          // End line chain
          setChainLastEndpoint(null);
          setTempStartPoint(null);
          setInferenceIndicator(null);
        } else if (tool === "arc" || tool === "arcCenterpoint" || tool === "arcTangent") {
          // Cancel arc in progress
          setArcStartPoint(null);
          setArcEndPoint(null);
          setArcCenterPoint(null);
          setTangentSource(null);
          setPreviewArc(null);
        } else if (tool === "circle") {
          // Cancel circle in progress
          setCircleCenterPoint(null);
          setPreviewCircle(null);
        } else if (tool === "rectangle") {
          // Cancel rectangle in progress
          setTempStartPoint(null);
          setPreviewRect(null);
        }
      }
    };

    // Click handler for 3D selection
    let clickStartPos = { x: 0, y: 0 };
    let clickStartTime = 0;

    const onClickStart = (e: MouseEvent) => {
      clickStartPos = { x: e.clientX, y: e.clientY };
      clickStartTime = Date.now();
    };

    const onClick = (e: MouseEvent) => {
      // Ignore if we dragged significantly (rotation/pan)
      const dx = e.clientX - clickStartPos.x;
      const dy = e.clientY - clickStartPos.y;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);
      const clickDuration = Date.now() - clickStartTime;

      if (dragDistance > 5 || clickDuration > 300) return;

      // Only handle left click
      if (e.button !== 0) return;

      // Don't select if modifier key for orbit/pan was held
      if (e.shiftKey) return;

      const hit = raycastRef.current(e.clientX, e.clientY);

      // Always check for edge hits first - edges should be selectable even on faces
      const edgeGroup = edgeGroupRef.current;
      const cam = cameraRef.current;
      const container = containerRef.current;
      let edgeHit: EdgeRaycastHit | null = null;

      if (edgeGroup && cam && container && viewerState.showEdges) {
        const rect = container.getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, cam);
        edgeHit = raycastEdges(raycaster, edgeGroup, 8, cam, rect.width);
      }

      // If we have an edge hit close enough, prefer edge selection
      if (edgeHit) {
        selectEdgeRef.current(
          {
            bodyId: edgeHit.bodyId,
            edgeIndex: edgeHit.edgeIndex,
            featureId: edgeHit.featureId,
          },
          e.ctrlKey || e.metaKey
        );
      } else if (hit) {
        // No edge nearby, select the face
        const faceId = getFaceIdRef.current(hit.bodyId, hit.faceIndex);
        selectFaceRef.current(
          {
            bodyId: hit.bodyId,
            faceIndex: faceId,
            featureId: hit.featureId,
          },
          e.ctrlKey || e.metaKey
        );
      } else {
        // Clicked empty space - clear selection
        clearSelectionRef.current();
      }
    };

    // Hover handler for 3D highlighting and cursor broadcasting
    const onHover = (e: MouseEvent) => {
      // Skip hover if dragging
      if (isDragging) {
        setHoverRef.current(null);
        broadcastCursorRef.current(null);
        // Still broadcast 2D cursor when dragging
        if (awarenessRef.current && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          awarenessRef.current.updateCursor2D({
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
            visible: true,
          });
        }
        return;
      }

      const hit = raycastRef.current(e.clientX, e.clientY);

      // Always check for edge hits first - edges should be hoverable even on faces
      const edgeGroup = edgeGroupRef.current;
      const cam = cameraRef.current;
      const container = containerRef.current;
      let edgeHit: EdgeRaycastHit | null = null;

      if (edgeGroup && cam && container && edgeGroup.visible) {
        const rect = container.getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, cam);
        edgeHit = raycastEdges(raycaster, edgeGroup, 8, cam, rect.width);
      }

      // If we have an edge hit close enough, show edge hover
      if (edgeHit) {
        setHoverRef.current({
          type: "edge",
          bodyId: edgeHit.bodyId,
          index: edgeHit.edgeIndex,
          featureId: edgeHit.featureId,
        });
        // Broadcast 3D cursor position for collaborative cursors
        broadcastCursorRef.current(hit);
        // Clear 2D cursor when over model
        if (awarenessRef.current) {
          awarenessRef.current.updateCursor2D({ x: 0, y: 0, visible: false });
        }
      } else if (hit) {
        const faceId = getFaceIdRef.current(hit.bodyId, hit.faceIndex);
        setHoverRef.current({
          type: "face",
          bodyId: hit.bodyId,
          index: faceId,
          featureId: hit.featureId,
        });
        // Broadcast 3D cursor position for collaborative cursors
        broadcastCursorRef.current(hit);
        // Clear 2D cursor when over model (3D cursor takes over)
        if (awarenessRef.current) {
          awarenessRef.current.updateCursor2D({ x: 0, y: 0, visible: false });
        }
      } else {
        setHoverRef.current(null);
        broadcastCursorRef.current(null);
        // Broadcast 2D cursor when not over model
        if (awarenessRef.current && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          awarenessRef.current.updateCursor2D({
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
            visible: true,
          });
        }
      }
    };

    renderer.domElement.addEventListener("mousedown", onClickStart);
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("mousemove", onHover);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    // Render loop - always render to avoid black frames
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (cameraRef.current) {
        // Update camera state ref for ViewCube sync every frame
        // Store camera direction and distance (position relative to target)
        const offset = cameraRef.current.position.clone().sub(targetRef.current);
        const distance = offset.length();
        const direction = offset.normalize();
        cameraStateRef.current.position.copy(direction);
        cameraStateRef.current.up.copy(cameraRef.current.up);
        cameraStateRef.current.distance = distance;
        cameraStateRef.current.version++;

        // Use composer for post-processing when AO is enabled, direct render otherwise
        if (composerRef.current && aoEnabledRef.current) {
          composerRef.current.render();
        } else {
          renderer.render(scene, cameraRef.current);
        }
        labelRenderer.render(scene, cameraRef.current);
      }
    };
    animate();

    // Initial render
    needsRenderRef.current = true;

    // Handle resize (both window and container)
    let resizeTimeout: number | null = null;

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !renderer) return;
      const currentCamera = cameraRef.current;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      // Skip if size is zero
      if (width === 0 || height === 0) return;

      const aspect = width / height;

      if (currentCamera instanceof THREE.PerspectiveCamera) {
        currentCamera.aspect = aspect;
      } else if (currentCamera instanceof THREE.OrthographicCamera) {
        const distance = currentCamera.position.distanceTo(targetRef.current);
        const frustumSize = distance * 0.5;
        currentCamera.left = -frustumSize * aspect;
        currentCamera.right = frustumSize * aspect;
        currentCamera.top = frustumSize;
        currentCamera.bottom = -frustumSize;
      }
      currentCamera.updateProjectionMatrix();
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);

      // Resize post-processing composer (handles all passes automatically)
      if (composerRef.current) {
        composerRef.current.setSize(width, height);
      }

      // Update LineMaterial resolution for edge lines
      if (edgeGroupRef.current) {
        edgeGroupRef.current.traverse((child) => {
          if (child instanceof LineSegments2 && child.material instanceof LineMaterial) {
            child.material.resolution.set(width, height);
          }
        });
      }

      // Immediately render to prevent black flash
      if (composerRef.current && aoEnabledRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, currentCamera);
      }
      labelRenderer.render(scene, currentCamera);
    };

    // Debounced resize for ResizeObserver to reduce flashing
    const debouncedResize = () => {
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      resizeTimeout = requestAnimationFrame(() => {
        handleResize();
      });
    };

    // Use ResizeObserver to detect container size changes (panel resize, AI panel toggle)
    const resizeObserver = new ResizeObserver(() => {
      debouncedResize();
    });
    resizeObserver.observe(containerRef.current);

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      setSceneReady(false);
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("mousedown", onClickStart);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("mousemove", onHover);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      if (containerRef.current && labelRenderer.domElement.parentNode) {
        labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
      }
      // Dispose post-processing composer
      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = null;
      }
      aoEffectRef.current = null;
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - theme changes are handled by a separate effect

  // Sketch editing mouse handlers
  useEffect(() => {
    if (!sketchMode.active || !sketchMode.planeId) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      // Track if we're dragging (for distinguishing clicks from drags)
      if (mouseDownPosRef.current && !isDraggingViewRef.current) {
        const dx = cx - mouseDownPosRef.current.x;
        const dy = cy - mouseDownPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          isDraggingViewRef.current = true;
        }
      }

      // Update box selection if active
      if (boxSelection && isDraggingViewRef.current) {
        const dx = cx - boxSelection.start.x;
        // Determine selection mode based on drag direction
        // Left-to-right = window (only inside), right-to-left = crossing (intersecting)
        const mode = dx >= 0 ? "window" : "crossing";
        setBoxSelection((prev) => (prev ? { ...prev, current: { x: cx, y: cy }, mode } : null));
      }

      // Update sketch coordinates using 3D ray casting
      const sketchCoords = screenToSketch(e.clientX, e.clientY, sketchMode.planeId!);
      if (sketchCoords) {
        const snapped = snapToGrid(sketchCoords.x, sketchCoords.y);
        setSketchPos(snapped);
        setSketchMousePos({ x: snapped.x, y: snapped.y });

        // Handle entity dragging
        if (draggingEntity) {
          if (draggingEntity.type === "point") {
            // For points, just set the position directly to the snapped mouse position
            const newX = snapped.x;
            const newY = snapped.y;
            updatePointPosition(draggingEntity.id, newX, newY);
          } else if (
            draggingEntity.type === "line" &&
            draggingEntity.originalPositions &&
            draggingEntity.linePointIds
          ) {
            // For lines, calculate delta from original drag start position
            // and apply to original endpoint positions (not updated positions)
            const dx = sketchCoords.x - draggingEntity.startPos.x;
            const dy = sketchCoords.y - draggingEntity.startPos.y;
            const orig = draggingEntity.originalPositions;
            const ids = draggingEntity.linePointIds;

            // Apply delta to original positions, then snap
            const newStartX = snapToGrid(orig.startX + dx, 0).x;
            const newStartY = snapToGrid(0, orig.startY + dy).y;
            const newEndX = snapToGrid(orig.endX + dx, 0).x;
            const newEndY = snapToGrid(0, orig.endY + dy).y;

            updatePointPosition(ids.startId, newStartX, newStartY);
            updatePointPosition(ids.endId, newEndX, newEndY);
            // Note: Do NOT update originalPositions or startPos here!
            // The delta should always be relative to the drag start.
          }
          isDraggingViewRef.current = true; // Prevent selection toggle
          return;
        }

        // Detect snap targets when using drawing tools
        if (
          sketchMode.activeTool === "line" ||
          sketchMode.activeTool === "arc" ||
          sketchMode.activeTool === "arcCenterpoint" ||
          sketchMode.activeTool === "arcTangent" ||
          sketchMode.activeTool === "circle" ||
          sketchMode.activeTool === "rectangle"
        ) {
          const nearbyPoint = findNearbyPoint(snapped.x, snapped.y, POINT_MERGE_TOLERANCE_MM);
          if (nearbyPoint) {
            setSnapTarget({ x: nearbyPoint.x, y: nearbyPoint.y, type: "point" });
          } else {
            setSnapTarget(null);
          }
          setHoveredDraggable(null);
        } else if (sketchMode.activeTool === "select") {
          // Detect hovering over draggable entities for cursor feedback
          setSnapTarget(null);
          const sketch = getSketch();
          if (sketch) {
            const tol = POINT_MERGE_TOLERANCE_MM;
            const nearbyPoint = findNearbyPoint(snapped.x, snapped.y, tol);
            if (nearbyPoint) {
              setHoveredDraggable({ type: "point", id: nearbyPoint.id });
            } else {
              // Check for nearby entity (line, arc, or circle)
              const nearbyEntity = findNearestEntityInSketch(sketch, snapped.x, snapped.y, tol);
              if (nearbyEntity) {
                // Use "line" type for hover feedback for all entity types (same cursor)
                setHoveredDraggable({ type: "line", id: nearbyEntity.entity.id });
              } else {
                setHoveredDraggable(null);
              }
            }
          } else {
            setHoveredDraggable(null);
          }
        } else {
          setSnapTarget(null);
          setHoveredDraggable(null);
        }
      } else {
        setSketchMousePos(null);
        setSketchPos(null);
        setSnapTarget(null);
        setHoveredDraggable(null);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseDownPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      isDraggingViewRef.current = false;

      // For select tool, check if we're clicking on a draggable entity
      if (sketchMode.activeTool === "select" && e.button === 0 && !e.shiftKey) {
        const sketchCoords = screenToSketch(e.clientX, e.clientY, sketchMode.planeId!);
        if (sketchCoords) {
          const tol = POINT_MERGE_TOLERANCE_MM;
          const sketch = getSketch();
          if (sketch) {
            // Check for point first (higher priority)
            const nearbyPoint = findNearbyPoint(sketchCoords.x, sketchCoords.y, tol);
            if (nearbyPoint) {
              setDraggingEntity({
                type: "point",
                id: nearbyPoint.id,
                startPos: { x: sketchCoords.x, y: sketchCoords.y },
              });
              return;
            }

            // Check for line
            const nearbyLine = findNearbyLineInSketch(sketch, sketchCoords.x, sketchCoords.y, tol);
            if (nearbyLine) {
              // Get the line's endpoints
              const startPt = sketch.points.find((p) => p.id === nearbyLine.start);
              const endPt = sketch.points.find((p) => p.id === nearbyLine.end);
              if (startPt && endPt) {
                setDraggingEntity({
                  type: "line",
                  id: nearbyLine.id,
                  originalPositions: {
                    startX: startPt.x,
                    startY: startPt.y,
                    endX: endPt.x,
                    endY: endPt.y,
                  },
                  linePointIds: {
                    startId: nearbyLine.start,
                    endId: nearbyLine.end,
                  },
                  startPos: { x: sketchCoords.x, y: sketchCoords.y },
                });
              }
              return;
            }

            // Click on empty space - start box selection
            const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setBoxSelection({
              start: screenPos,
              current: screenPos,
              mode: "window", // Will be updated based on drag direction
            });
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Only handle if mouseDown started inside this container
      if (!mouseDownPosRef.current) return;

      const wasDragging = isDraggingViewRef.current;
      const wasDraggingEntity = draggingEntity !== null;
      const wasBoxSelecting = boxSelection !== null;
      mouseDownPosRef.current = null;
      isDraggingViewRef.current = false;

      // Clear entity dragging state
      if (wasDraggingEntity) {
        setDraggingEntity(null);
      }

      // If we were dragging (rotating view or entity), don't trigger tool action
      // BUT allow box selection to complete
      if (wasDragging && !wasBoxSelecting) return;

      // If no tool is active (tool is 'none'), don't handle sketch clicks
      if (sketchMode.activeTool === "none") return;

      // Only handle left clicks
      if (e.button !== 0) return;

      // Don't handle if shift key (panning)
      if (e.shiftKey) return;

      // Convert to sketch coordinates
      const sketchCoords = screenToSketch(e.clientX, e.clientY, sketchMode.planeId!);
      if (!sketchCoords) return;

      const snappedPos = snapToGrid(sketchCoords.x, sketchCoords.y);

      // Handle sketch tool actions
      if (sketchMode.activeTool === "select") {
        const sketch = getSketch();
        if (!sketch) return;

        // Handle box selection completion
        if (boxSelection && wasDragging) {
          const { start, current, mode } = boxSelection;
          setBoxSelection(null);

          // Calculate selection box bounds in screen coordinates
          const minX = Math.min(start.x, current.x);
          const maxX = Math.max(start.x, current.x);
          const minY = Math.min(start.y, current.y);
          const maxY = Math.max(start.y, current.y);

          // Convert selection box corners to sketch coordinates
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;

          const topLeft = screenToSketch(minX + rect.left, minY + rect.top, sketchMode.planeId!);
          const bottomRight = screenToSketch(
            maxX + rect.left,
            maxY + rect.top,
            sketchMode.planeId!
          );
          if (!topLeft || !bottomRight) return;

          const boxMinX = Math.min(topLeft.x, bottomRight.x);
          const boxMaxX = Math.max(topLeft.x, bottomRight.x);
          const boxMinY = Math.min(topLeft.y, bottomRight.y);
          const boxMaxY = Math.max(topLeft.y, bottomRight.y);

          // Select entities based on mode
          const newSelectedPoints = new Set<string>();
          const newSelectedLines = new Set<string>();

          // Check points
          for (const point of sketch.points) {
            const inside =
              point.x >= boxMinX && point.x <= boxMaxX && point.y >= boxMinY && point.y <= boxMaxY;
            if (inside) {
              newSelectedPoints.add(point.id);
            }
          }

          // Check entities (lines, arcs, circles)
          for (const entity of sketch.entities) {
            let shouldSelect = false;

            if (entity.type === "line") {
              const startPt = sketch.points.find((p) => p.id === entity.start);
              const endPt = sketch.points.find((p) => p.id === entity.end);
              if (startPt && endPt) {
                const startInside =
                  startPt.x >= boxMinX &&
                  startPt.x <= boxMaxX &&
                  startPt.y >= boxMinY &&
                  startPt.y <= boxMaxY;
                const endInside =
                  endPt.x >= boxMinX &&
                  endPt.x <= boxMaxX &&
                  endPt.y >= boxMinY &&
                  endPt.y <= boxMaxY;
                if (mode === "window") {
                  // Window: both endpoints must be inside
                  shouldSelect = startInside && endInside;
                } else {
                  // Crossing: at least one endpoint inside, or line intersects box
                  shouldSelect =
                    startInside ||
                    endInside ||
                    lineIntersectsBox(startPt, endPt, boxMinX, boxMinY, boxMaxX, boxMaxY);
                }
              }
            } else if (entity.type === "arc" || entity.type === "circle") {
              // For arcs and circles, use center point for simplicity
              const center = sketch.points.find(
                (p) => p.id === (entity as SketchArc | SketchCircle).center
              );
              if (center) {
                const centerInside =
                  center.x >= boxMinX &&
                  center.x <= boxMaxX &&
                  center.y >= boxMinY &&
                  center.y <= boxMaxY;
                if (mode === "window") {
                  // For window mode, check if entire arc/circle is inside
                  // Simplified: just check center
                  shouldSelect = centerInside;
                } else {
                  // For crossing mode, check if center is inside or arc intersects box
                  shouldSelect = centerInside; // Simplified for now
                }
              }
            }

            if (shouldSelect) {
              newSelectedLines.add(entity.id);
            }
          }

          // Apply selection (add to existing if Ctrl/Shift held)
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            setSelectedPoints((prev) => new Set([...prev, ...newSelectedPoints]));
            setSelectedLines((prev) => new Set([...prev, ...newSelectedLines]));
          } else {
            setSelectedPoints(newSelectedPoints);
            setSelectedLines(newSelectedLines);
            setSelectedConstraints(new Set());
          }
          return;
        }

        const tol = POINT_MERGE_TOLERANCE_MM;
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, tol);

        if (nearbyPoint) {
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+click: toggle selection (preserves other selections)
            setSelectedPoints((prev) => {
              const next = new Set(prev);
              if (next.has(nearbyPoint.id)) {
                next.delete(nearbyPoint.id);
              } else {
                next.add(nearbyPoint.id);
              }
              return next;
            });
          } else if (e.shiftKey) {
            // Shift+click: add to selection (preserves other selections)
            setSelectedPoints((prev) => new Set([...prev, nearbyPoint.id]));
          } else {
            // Plain click: select only this (clear all others)
            setSelectedPoints(new Set([nearbyPoint.id]));
            setSelectedLines(new Set());
            setSelectedConstraints(new Set());
          }
          return;
        }

        // Check for nearby entity (line, arc, or circle)
        const nearbyEntity = findNearestEntityInSketch(sketch, snappedPos.x, snappedPos.y, tol);
        if (nearbyEntity) {
          const entityId = nearbyEntity.entity.id;
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+click: toggle selection (preserves other selections)
            setSelectedLines((prev) => {
              const next = new Set(prev);
              if (next.has(entityId)) {
                next.delete(entityId);
              } else {
                next.add(entityId);
              }
              return next;
            });
          } else if (e.shiftKey) {
            // Shift+click: add to selection (preserves other selections)
            setSelectedLines((prev) => new Set([...prev, entityId]));
          } else {
            // Plain click: select only this (clear all others)
            setSelectedLines(new Set([entityId]));
            setSelectedPoints(new Set());
            setSelectedConstraints(new Set());
          }
          return;
        }

        // Click on empty space: clear selection (unless modifier held)
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          clearSketchSelection();
        }
        return;
      }

      if (sketchMode.activeTool === "point") {
        // Point tool: single click to add a point
        // First check if we're clicking on an existing point
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        if (nearbyPoint) {
          // Don't add a duplicate point
          return;
        }

        // Check if we're near an entity (line/arc/circle) and should snap to it
        const sketch = getSketch();
        if (sketch) {
          const nearestEntity = findNearestEntityInSketch(
            sketch,
            snappedPos.x,
            snappedPos.y,
            POINT_MERGE_TOLERANCE_MM
          );

          if (nearestEntity) {
            // Add a point at the closest position on the entity
            const pointId = addPoint(nearestEntity.closestPoint.x, nearestEntity.closestPoint.y);
            if (pointId) {
              // Add appropriate constraint based on entity type
              if (nearestEntity.entity.type === "line") {
                addConstraint({
                  type: "pointOnLine",
                  point: pointId,
                  line: nearestEntity.entity.id,
                });
              } else if (
                nearestEntity.entity.type === "arc" ||
                nearestEntity.entity.type === "circle"
              ) {
                addConstraint({ type: "pointOnArc", point: pointId, arc: nearestEntity.entity.id });
              }
            }
            return;
          }
        }

        // Not near any entity - add a free point
        addPoint(snappedPos.x, snappedPos.y);
        return;
      }

      if (sketchMode.activeTool === "line") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        // Determine start point (chain mode or fresh start)
        const startSource = chainLastEndpoint || tempStartPoint;

        if (!startSource) {
          // First click - set start point
          if (nearbyPoint) {
            setTempStartPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          // Second+ click - create line
          let startId: string | null | undefined = startSource.id;
          let endId: string | null = null;

          if (!startId) {
            startId = addPoint(startSource.x, startSource.y);
          }

          if (nearbyPoint) {
            endId = nearbyPoint.id ?? null;
          } else {
            endId = addPoint(snappedPos.x, snappedPos.y);
          }

          if (startId && endId) {
            addLine(startId, endId);

            // Auto-constraints: apply H/V if near axis (unless Ctrl is held or autoConstraints is off)
            if (viewerState.autoConstraints && !e.ctrlKey && !e.metaKey) {
              const endPt = nearbyPoint || { x: snappedPos.x, y: snappedPos.y };

              if (isNearHorizontal(startSource, endPt)) {
                addConstraint({ type: "horizontal", points: [startId, endId] });
              } else if (isNearVertical(startSource, endPt)) {
                addConstraint({ type: "vertical", points: [startId, endId] });
              }
            }

            // Chain mode: if we clicked on an existing point, END the chain (closed loop)
            // Otherwise continue from the new endpoint
            if (nearbyPoint) {
              // Clicked on existing point - end chain (closing loop or connecting to existing geometry)
              setChainLastEndpoint(null);
              setTempStartPoint(null);
            } else {
              // Created new point - continue chain from it
              setChainLastEndpoint({ x: snappedPos.x, y: snappedPos.y, id: endId });
              setTempStartPoint(null);
            }
          }
        }
        return;
      }

      if (sketchMode.activeTool === "arc") {
        // 3-point arc: start → end → bulge (point on curve)
        // The bulge point is a point on the arc between start and end.
        // We calculate the actual center from these 3 points using circumcircle formula.
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!arcStartPoint) {
          // First click: start point
          setArcStartPoint(clickPoint);
        } else if (!arcEndPoint) {
          // Second click: end point
          setArcEndPoint(clickPoint);
        } else {
          // Third click: bulge point (on the curve between start and end)
          // Calculate the actual center from all three points
          const circleInfo = calculateCircumcircleCenter(arcStartPoint, arcEndPoint, clickPoint);

          if (circleInfo) {
            // Add start and end points
            const startId = arcStartPoint.id ?? addPoint(arcStartPoint.x, arcStartPoint.y);
            const endId = arcEndPoint.id ?? addPoint(arcEndPoint.x, arcEndPoint.y);
            // Add the calculated center point
            const centerId = addPoint(circleInfo.x, circleInfo.y);

            if (startId && endId && centerId) {
              // Determine CCW based on where the bulge point is relative to center
              const center = { x: circleInfo.x, y: circleInfo.y };
              const ccw = shouldArcBeCCW(arcStartPoint, arcEndPoint, clickPoint, center);
              addArc(startId, endId, centerId, ccw);
            }
          }

          setArcStartPoint(null);
          setArcEndPoint(null);
        }
        return;
      }

      if (sketchMode.activeTool === "arcCenterpoint") {
        // Centerpoint arc: center → start (defines radius) → end (defines angle)
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!arcCenterPoint) {
          // First click: center
          setArcCenterPoint(clickPoint);
        } else if (!arcStartPoint) {
          // Second click: start point (defines radius)
          setArcStartPoint(clickPoint);
        } else {
          // Third click: end point (defines angle)
          const centerId = arcCenterPoint.id ?? addPoint(arcCenterPoint.x, arcCenterPoint.y);
          const startId = arcStartPoint.id ?? addPoint(arcStartPoint.x, arcStartPoint.y);
          const endId = clickPoint.id ?? addPoint(clickPoint.x, clickPoint.y);

          if (centerId && startId && endId) {
            // Determine CCW: go the short way from start to end around center
            const ccw = shouldCenterpointArcBeCCW(arcCenterPoint, arcStartPoint, clickPoint);
            addArc(startId, endId, centerId, ccw);
          }

          // Reset for next arc
          setArcCenterPoint(null);
          setArcStartPoint(null);
        }
        return;
      }

      if (sketchMode.activeTool === "arcTangent") {
        // Tangent arc: click endpoint of line/arc → click end point
        // Arc is tangent to the source line/arc at the start point
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        if (!tangentSource) {
          // First click: must be at an endpoint of a line or arc
          if (!nearbyPoint?.id) {
            // Must click on an existing point that is an endpoint
            return;
          }

          // Find if this point is an endpoint of any line or arc
          const sketch = getSketch();
          if (!sketch) return;

          let foundSource: {
            entityId: string;
            entityType: "line" | "arc";
            direction: { x: number; y: number };
          } | null = null;

          for (const entity of sketch.entities) {
            if (entity.type === "line") {
              const startPt = sketch.points.find((p) => p.id === entity.start);
              const endPt = sketch.points.find((p) => p.id === entity.end);
              if (!startPt || !endPt) continue;

              if (entity.start === nearbyPoint.id) {
                // Point is the start of this line - tangent goes toward start (opposite of line direction)
                const dx = startPt.x - endPt.x;
                const dy = startPt.y - endPt.y;
                const len = Math.hypot(dx, dy);
                if (len > 0) {
                  foundSource = {
                    entityId: entity.id,
                    entityType: "line",
                    direction: { x: dx / len, y: dy / len },
                  };
                  break;
                }
              } else if (entity.end === nearbyPoint.id) {
                // Point is the end of this line - tangent continues in line direction
                const dx = endPt.x - startPt.x;
                const dy = endPt.y - startPt.y;
                const len = Math.hypot(dx, dy);
                if (len > 0) {
                  foundSource = {
                    entityId: entity.id,
                    entityType: "line",
                    direction: { x: dx / len, y: dy / len },
                  };
                  break;
                }
              }
            }
            // TODO: Handle arcs - tangent direction is perpendicular to radius at the point
          }

          if (!foundSource) {
            // Point is not an endpoint of any line/arc
            return;
          }

          setTangentSource({
            lineId: foundSource.entityId,
            pointId: nearbyPoint.id,
            direction: foundSource.direction,
            point: { x: nearbyPoint.x, y: nearbyPoint.y },
          });
        } else {
          // Second click: end point of the tangent arc
          // Calculate center such that arc is tangent to the source
          const endPoint = nearbyPoint
            ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id }
            : { x: snappedPos.x, y: snappedPos.y };

          // For a tangent arc from P with tangent direction T to end point E:
          // The center lies on the line perpendicular to T at P, and also on the
          // perpendicular bisector of segment PE.
          //
          // Perpendicular to T at P: P + s * (-T.y, T.x) for some s
          // Perpendicular bisector of PE: midpoint M + t * perpendicular to PE
          //
          // Solve for intersection:
          const P = tangentSource.point;
          const E = endPoint;
          const T = tangentSource.direction;

          // Perpendicular to tangent (normal direction)
          const N = { x: -T.y, y: T.x };

          // Midpoint of PE
          const M = { x: (P.x + E.x) / 2, y: (P.y + E.y) / 2 };

          // Direction of PE
          const PE = { x: E.x - P.x, y: E.y - P.y };
          const PElen = Math.hypot(PE.x, PE.y);

          if (PElen < 0.01) {
            setTangentSource(null);
            return;
          }

          // Perpendicular to PE (for bisector direction)
          const perpPE = { x: -PE.y / PElen, y: PE.x / PElen };

          // Line 1: P + s * N (perpendicular to tangent at P)
          // Line 2: M + t * perpPE (perpendicular bisector of PE)
          // Solve: P + s * N = M + t * perpPE
          // s * N.x - t * perpPE.x = M.x - P.x
          // s * N.y - t * perpPE.y = M.y - P.y

          // Use Cramer's rule
          const det = N.x * -perpPE.y - N.y * -perpPE.x;
          if (Math.abs(det) < 1e-10) {
            // Lines are parallel - can't form tangent arc (end point is on tangent line)
            setTangentSource(null);
            return;
          }

          const dx = M.x - P.x;
          const dy = M.y - P.y;
          const s = (dx * -perpPE.y - dy * -perpPE.x) / det;

          // Center of the arc
          const center = {
            x: P.x + s * N.x,
            y: P.y + s * N.y,
          };

          // Create the arc
          const startId = tangentSource.pointId;
          const endId = endPoint.id ?? addPoint(endPoint.x, endPoint.y);
          const centerId = addPoint(center.x, center.y);

          if (startId && endId && centerId) {
            // Determine CCW: the arc should curve away from the tangent direction
            // If s > 0, center is to the left of tangent direction (CCW)
            // If s < 0, center is to the right (CW)
            const ccw = s > 0;
            const arcId = addArc(startId, endId, centerId, ccw);

            // Add tangent constraint between the arc and the source line
            if (arcId) {
              addConstraint({
                type: "tangent",
                line: tangentSource.lineId,
                arc: arcId,
                connectionPoint: tangentSource.pointId,
              });
            }
          }

          setTangentSource(null);
        }
        return;
      }

      if (sketchMode.activeTool === "circle") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        if (!circleCenterPoint) {
          // First click: set center point
          if (nearbyPoint) {
            setCircleCenterPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setCircleCenterPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          // Second click: create circle with radius from center to click position
          // Only the center point is added - no edge point needed
          const centerId =
            circleCenterPoint.id ?? addPoint(circleCenterPoint.x, circleCenterPoint.y);

          // Calculate radius from center to click position
          const dx = snappedPos.x - circleCenterPoint.x;
          const dy = snappedPos.y - circleCenterPoint.y;
          const radius = Math.sqrt(dx * dx + dy * dy);

          if (centerId && radius > 0.01) {
            addCircle(centerId, radius);
          }

          setCircleCenterPoint(null);
        }
        return;
      }

      if (sketchMode.activeTool === "rectangle") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        if (!tempStartPoint) {
          // First click - set first corner
          if (nearbyPoint) {
            setTempStartPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          // Second click - create rectangle from corner to corner
          const x1 = tempStartPoint.x;
          const y1 = tempStartPoint.y;
          const x2 = nearbyPoint ? nearbyPoint.x : snappedPos.x;
          const y2 = nearbyPoint ? nearbyPoint.y : snappedPos.y;

          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);

          if (width > 0.01 && height > 0.01) {
            // Create corner-to-corner rectangle (min/max to ensure proper ordering)
            const minX = Math.min(x1, x2);
            const minY = Math.min(y1, y2);
            const maxX = Math.max(x1, x2);
            const maxY = Math.max(y1, y2);
            addRectangle(minX, minY, maxX, maxY);
          }

          setTempStartPoint(null);
        }
        return;
      }

      if (sketchMode.activeTool === "rectangleCenter") {
        // Center rectangle: first click is center, second click is corner
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        if (!tempStartPoint) {
          // First click - set center point
          if (nearbyPoint) {
            setTempStartPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          // Second click - create rectangle from center to corner
          const cx = tempStartPoint.x;
          const cy = tempStartPoint.y;
          const cornerX = nearbyPoint ? nearbyPoint.x : snappedPos.x;
          const cornerY = nearbyPoint ? nearbyPoint.y : snappedPos.y;

          // Half-widths from center to corner
          const halfW = Math.abs(cornerX - cx);
          const halfH = Math.abs(cornerY - cy);

          if (halfW > 0.01 && halfH > 0.01) {
            // Create rectangle centered at (cx, cy)
            addRectangle(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
          }

          setTempStartPoint(null);
        }
        return;
      }

      if (sketchMode.activeTool === "rectangle3Point") {
        // 3-point angled rectangle: corner A, corner B (defines edge), third point (defines width)
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!tempStartPoint) {
          // First click - set corner A
          setTempStartPoint(clickPoint);
        } else if (!tempSecondPoint) {
          // Second click - set corner B (defines one edge)
          setTempSecondPoint(clickPoint);
        } else {
          // Third click - defines width via perpendicular distance
          const edgeX = tempSecondPoint.x - tempStartPoint.x;
          const edgeY = tempSecondPoint.y - tempStartPoint.y;
          const edgeLen = Math.hypot(edgeX, edgeY);

          if (edgeLen > 0.01) {
            // Unit vector along edge
            const ux = edgeX / edgeLen;
            const uy = edgeY / edgeLen;
            // Perpendicular unit vector
            const px = -uy;
            const py = ux;
            // Calculate signed width
            const toCursorX = clickPoint.x - tempStartPoint.x;
            const toCursorY = clickPoint.y - tempStartPoint.y;
            const width = toCursorX * px + toCursorY * py;

            if (Math.abs(width) > 0.01) {
              // Four corners of the angled rectangle
              const c1 = tempStartPoint;
              const c2 = tempSecondPoint;
              const c3 = { x: tempSecondPoint.x + width * px, y: tempSecondPoint.y + width * py };
              const c4 = { x: tempStartPoint.x + width * px, y: tempStartPoint.y + width * py };

              // Add the angled rectangle
              addAngledRectangle(c1, c2, c3, c4);
            }
          }

          setTempStartPoint(null);
          setTempSecondPoint(null);
        }
        return;
      }

      if (sketchMode.activeTool === "circle3Point") {
        // 3-point circle: three points on the circumference
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!arcStartPoint) {
          // First point
          setArcStartPoint(clickPoint);
        } else if (!arcEndPoint) {
          // Second point
          setArcEndPoint(clickPoint);
        } else {
          // Third point - calculate circle through all three points
          const circleInfo = calculateCircumcircleCenter(arcStartPoint, arcEndPoint, clickPoint);

          if (circleInfo) {
            // Add center point and create circle
            const centerId = addPoint(circleInfo.x, circleInfo.y);

            if (centerId && circleInfo.radius > 0.01) {
              addCircle(centerId, circleInfo.radius);
            }
          }

          setArcStartPoint(null);
          setArcEndPoint(null);
        }
        return;
      }
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    sketchMode.active,
    sketchMode.planeId,
    sketchMode.activeTool,
    screenToSketch,
    snapToGrid,
    setSketchMousePos,
    getSketch,
    findNearbyPoint,
    togglePointSelection,
    toggleLineSelection,
    clearSketchSelection,
    setSelectedPoints,
    setSelectedLines,
    setSelectedConstraints,
    addPoint,
    addLine,
    addArc,
    addRectangle,
    addConstraint,
    tempStartPoint,
    chainLastEndpoint,
    arcStartPoint,
    arcEndPoint,
    arcCenterPoint,
    circleCenterPoint,
    draggingEntity,
    updatePointPosition,
    getSketchPoints,
    viewerState.autoConstraints,
  ]);

  // Determine cursor style based on current state
  const viewerCursor = useMemo(() => {
    if (draggingEntity) return "grabbing";
    if (hoveredDraggable) return "grab";
    if (sketchMode.active && sketchMode.activeTool === "select") return "default";
    return "default";
  }, [draggingEntity, hoveredDraggable, sketchMode.active, sketchMode.activeTool]);

  return (
    <div ref={containerRef} className="viewer-container" style={{ cursor: viewerCursor }}>
      {/* Collaborative 3D cursors */}
      <UserCursors3D
        scene={sceneRef.current}
        connectedUsers={connectedUsers}
        requestRender={requestRender}
      />
      {/* 2D cursor overlay for followed user when not over model */}
      <UserCursor2D followedUser={followedUser} containerRef={containerRef} />

      {/* Inline dimension edit - positioned at the label */}
      {editingDimensionId && editingDimensionPos && (
        <input
          ref={dimensionInputRef}
          type="number"
          className="dimension-inline-input"
          value={editingDimensionValue}
          onChange={(e) => setEditingDimensionValue(e.target.value)}
          onBlur={handleDimensionEditSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleDimensionEditSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditingDimensionId(null);
              setEditingDimensionValue("");
              setEditingDimensionPos(null);
            }
          }}
          step="0.1"
          min="0"
          style={{
            position: "absolute",
            left: `${editingDimensionPos.x}px`,
            top: `${editingDimensionPos.y}px`,
            transform: "translate(-50%, -50%)",
            background:
              editingDimensionType === "distance"
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
      {/* Box selection overlay */}
      {boxSelection && (
        <div
          style={{
            position: "absolute",
            left: Math.min(boxSelection.start.x, boxSelection.current.x),
            top: Math.min(boxSelection.start.y, boxSelection.current.y),
            width: Math.abs(boxSelection.current.x - boxSelection.start.x),
            height: Math.abs(boxSelection.current.y - boxSelection.start.y),
            border: `2px ${boxSelection.mode === "window" ? "solid" : "dashed"} #00aaff`,
            backgroundColor:
              boxSelection.mode === "window" ? "rgba(0, 170, 255, 0.1)" : "rgba(0, 255, 170, 0.1)",
            pointerEvents: "none",
            zIndex: 1000,
          }}
        />
      )}
    </div>
  );
};

// Helper functions for sketch editing

/**
 * Determine if an arc from start to end should go CCW to pass through a bulge point.
 * All three points (start, end, bulge) are on the arc.
 * Returns true if going CCW from start to end passes through bulge.
 */
function shouldArcBeCCW(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bulge: { x: number; y: number },
  center: { x: number; y: number }
): boolean {
  // Calculate angles from center to each point
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const bulgeAngle = Math.atan2(bulge.y - center.y, bulge.x - center.x);

  // Normalize angles to [0, 2π)
  const normalize = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sA = normalize(startAngle);
  const eA = normalize(endAngle);
  const bA = normalize(bulgeAngle);

  // Check if bulge is between start and end going CCW (increasing angle)
  // CCW sweep from start: start → bulge → end
  const ccwSweepToBulge = normalize(bA - sA);
  const ccwSweepToEnd = normalize(eA - sA);

  // If bulge is encountered before end when going CCW, use CCW
  // (bulge angle from start < end angle from start, both in CCW direction)
  return ccwSweepToBulge < ccwSweepToEnd;
}

/**
 * Determine if an arc from start to end around center should go CCW.
 * For centerpoint arcs: the end point determines direction.
 * Returns true if going CCW from start reaches end via the shorter arc.
 */
function shouldCenterpointArcBeCCW(
  center: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
): boolean {
  // Calculate angles from center
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

  // Calculate sweep in CCW direction (positive angle)
  let ccwSweep = endAngle - startAngle;
  if (ccwSweep <= 0) ccwSweep += 2 * Math.PI;

  // Calculate sweep in CW direction (negative angle, made positive)
  const cwSweep = 2 * Math.PI - ccwSweep;

  // Use the direction with the shorter sweep
  // This is the intuitive behavior: the arc goes the "short way" to the end point
  return ccwSweep <= cwSweep;
}

function findNearbyLineInSketch(
  sketch: SketchData,
  x: number,
  y: number,
  tolerance: number
): SketchLine | null {
  let best: { line: SketchLine; dist2: number } | null = null;

  const p: [number, number] = [x, y];
  for (const entity of sketch.entities) {
    if (entity.type !== "line") continue;
    const line = entity as SketchLine;
    const a = sketch.points.find((pt) => pt.id === line.start);
    const b = sketch.points.find((pt) => pt.id === line.end);
    if (!a || !b) continue;

    const d2 = pointSegmentDistanceSquared(p, [a.x, a.y], [b.x, b.y]);
    if (d2 <= tolerance * tolerance) {
      if (!best || d2 < best.dist2) {
        best = { line, dist2: d2 };
      }
    }
  }

  return best ? best.line : null;
}

function pointSegmentDistanceSquared(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 === 0) return apx * apx + apy * apy;

  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return dx * dx + dy * dy;
}

/**
 * Result of finding the nearest entity to a point
 */
interface NearestEntityResult {
  entity: SketchEntity;
  closestPoint: { x: number; y: number };
  distance: number;
}

/**
 * Find the nearest entity (line, arc, or circle) to a given point
 * Returns the entity, the closest point on it, and the distance
 */
function findNearestEntityInSketch(
  sketch: SketchData,
  x: number,
  y: number,
  tolerance: number
): NearestEntityResult | null {
  let best: NearestEntityResult | null = null;

  for (const entity of sketch.entities) {
    if (entity.type === "line") {
      const line = entity as SketchLine;
      const a = sketch.points.find((pt) => pt.id === line.start);
      const b = sketch.points.find((pt) => pt.id === line.end);
      if (!a || !b) continue;

      // Find closest point on line segment
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = x - a.x;
      const apy = y - a.y;
      const abLen2 = abx * abx + aby * aby;

      let closest: { x: number; y: number };
      if (abLen2 === 0) {
        closest = { x: a.x, y: a.y };
      } else {
        let t = (apx * abx + apy * aby) / abLen2;
        t = Math.max(0, Math.min(1, t));
        closest = { x: a.x + t * abx, y: a.y + t * aby };
      }

      const dx = x - closest.x;
      const dy = y - closest.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= tolerance && (!best || dist < best.distance)) {
        best = { entity, closestPoint: closest, distance: dist };
      }
    } else if (entity.type === "arc") {
      const arc = entity as SketchArc;
      const center = sketch.points.find((pt) => pt.id === arc.center);
      const start = sketch.points.find((pt) => pt.id === arc.start);
      if (!center || !start) continue;

      const radius = Math.hypot(start.x - center.x, start.y - center.y);
      if (radius < 0.001) continue;

      // Find closest point on circle (radial projection from center)
      const dx = x - center.x;
      const dy = y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) continue; // Point is at center, can't project

      const closest = {
        x: center.x + (dx / dist) * radius,
        y: center.y + (dy / dist) * radius,
      };

      // Check if closest point is within arc bounds
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const end = sketch.points.find((pt) => pt.id === arc.end);
      if (!end) continue;
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      const closestAngle = Math.atan2(closest.y - center.y, closest.x - center.x);

      // Check if closestAngle is between startAngle and endAngle (respecting ccw)
      const normalize = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const sA = normalize(startAngle);
      const eA = normalize(endAngle);
      const cA = normalize(closestAngle);

      let isOnArc = false;
      if (arc.ccw) {
        // CCW: sweep from start to end going counterclockwise
        const sweep = normalize(eA - sA);
        const toClosest = normalize(cA - sA);
        isOnArc = toClosest <= sweep;
      } else {
        // CW: sweep from start to end going clockwise (negative direction)
        const sweep = normalize(sA - eA);
        const toClosest = normalize(sA - cA);
        isOnArc = toClosest <= sweep;
      }

      if (!isOnArc) continue;

      const distToArc = Math.abs(dist - radius);
      if (distToArc <= tolerance && (!best || distToArc < best.distance)) {
        best = { entity, closestPoint: closest, distance: distToArc };
      }
    } else if (entity.type === "circle") {
      const circle = entity as SketchCircle;
      const center = sketch.points.find((pt) => pt.id === circle.center);
      if (!center) continue;

      const radius = circle.radius;
      if (radius < 0.001) continue;

      // Find closest point on circle
      const dx = x - center.x;
      const dy = y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) continue; // Point is at center

      const closest = {
        x: center.x + (dx / dist) * radius,
        y: center.y + (dy / dist) * radius,
      };

      const distToCircle = Math.abs(dist - radius);
      if (distToCircle <= tolerance && (!best || distToCircle < best.distance)) {
        best = { entity, closestPoint: closest, distance: distToCircle };
      }
    }
  }

  return best;
}

/**
 * Check if a line segment intersects a box (for box selection)
 */
function lineIntersectsBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): boolean {
  // Cohen-Sutherland line clipping algorithm outcode
  const INSIDE = 0;
  const LEFT = 1;
  const RIGHT = 2;
  const BOTTOM = 4;
  const TOP = 8;

  const computeOutCode = (x: number, y: number): number => {
    let code = INSIDE;
    if (x < minX) code |= LEFT;
    else if (x > maxX) code |= RIGHT;
    if (y < minY) code |= BOTTOM;
    else if (y > maxY) code |= TOP;
    return code;
  };

  let x0 = start.x,
    y0 = start.y,
    x1 = end.x,
    y1 = end.y;
  let outcode0 = computeOutCode(x0, y0);
  let outcode1 = computeOutCode(x1, y1);

  while (true) {
    if (!(outcode0 | outcode1)) {
      // Both points inside
      return true;
    } else if (outcode0 & outcode1) {
      // Both points share an outside zone - no intersection
      return false;
    } else {
      // At least one endpoint is outside - clip to box edge
      const outcodeOut = outcode0 !== 0 ? outcode0 : outcode1;
      let x = 0,
        y = 0;

      if (outcodeOut & TOP) {
        x = x0 + ((x1 - x0) * (maxY - y0)) / (y1 - y0);
        y = maxY;
      } else if (outcodeOut & BOTTOM) {
        x = x0 + ((x1 - x0) * (minY - y0)) / (y1 - y0);
        y = minY;
      } else if (outcodeOut & RIGHT) {
        y = y0 + ((y1 - y0) * (maxX - x0)) / (x1 - x0);
        x = maxX;
      } else if (outcodeOut & LEFT) {
        y = y0 + ((y1 - y0) * (minX - x0)) / (x1 - x0);
        x = minX;
      }

      if (outcodeOut === outcode0) {
        x0 = x;
        y0 = y;
        outcode0 = computeOutCode(x0, y0);
      } else {
        x1 = x;
        y1 = y;
        outcode1 = computeOutCode(x1, y1);
      }
    }
  }
}

export default Viewer;
