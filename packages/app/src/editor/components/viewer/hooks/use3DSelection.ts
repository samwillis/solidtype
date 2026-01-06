/**
 * use3DSelection - 3D face/edge selection and hover hook
 *
 * Handles click and hover events for 3D selection of faces and edges.
 */

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { raycastEdges, type EdgeRaycastHit } from "../viewer-utils";

/** Selection target for faces */
export interface FaceSelection {
  bodyId: string;
  faceIndex: number;
  featureId: string;
}

/** Selection target for edges */
export interface EdgeSelection {
  bodyId: string;
  edgeIndex: number;
  featureId: string;
}

/** Hover target */
export interface HoverTarget {
  type: "face" | "edge";
  bodyId: string;
  index: number;
  featureId: string;
}

/** Raycast hit result */
export interface RaycastHit {
  bodyId: string;
  faceIndex: number;
  featureId: string;
  point: THREE.Vector3;
  normal: THREE.Vector3 | null;
}

/** Options for use3DSelection */
export interface Selection3DOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>;
  edgeGroupRef: React.MutableRefObject<THREE.Group | null>;
  /** Function to raycast for face hits */
  raycast: (clientX: number, clientY: number) => RaycastHit | null;
  /** Function to get named face ID from body and index */
  getFaceId: (bodyId: string, faceIndex: number) => number;
  /** Callback when face is selected */
  onSelectFace: (selection: FaceSelection, addToSelection: boolean) => void;
  /** Callback when edge is selected */
  onSelectEdge: (selection: EdgeSelection, addToSelection: boolean) => void;
  /** Callback when selection is cleared */
  onClearSelection: () => void;
  /** Callback when hover changes */
  onHover: (target: HoverTarget | null) => void;
  /** Callback to broadcast 3D cursor position */
  onCursorBroadcast?: (hit: RaycastHit | null) => void;
  /** Callback to broadcast 2D cursor position */
  onCursor2DBroadcast?: (x: number, y: number, visible: boolean) => void;
  /** Whether edges are visible (for edge selection) */
  showEdges: boolean;
}

/**
 * Hook to handle 3D face/edge selection and hover.
 */
export function use3DSelection(options: Selection3DOptions): void {
  const {
    containerRef,
    cameraRef,
    edgeGroupRef,
    raycast,
    getFaceId,
    onSelectFace,
    onSelectEdge,
    onClearSelection,
    onHover,
    onCursorBroadcast,
    onCursor2DBroadcast,
    showEdges,
  } = options;

  // Use refs for callbacks to avoid effect re-runs
  // This is an intentional pattern to sync refs with latest callbacks without triggering effect dependencies
  /* eslint-disable react-hooks/refs */
  const raycastRef = useRef(raycast);
  raycastRef.current = raycast;
  const getFaceIdRef = useRef(getFaceId);
  getFaceIdRef.current = getFaceId;
  const onSelectFaceRef = useRef(onSelectFace);
  onSelectFaceRef.current = onSelectFace;
  const onSelectEdgeRef = useRef(onSelectEdge);
  onSelectEdgeRef.current = onSelectEdge;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onCursorBroadcastRef = useRef(onCursorBroadcast);
  onCursorBroadcastRef.current = onCursorBroadcast;
  const onCursor2DBroadcastRef = useRef(onCursor2DBroadcast);
  onCursor2DBroadcastRef.current = onCursor2DBroadcast;
  const showEdgesRef = useRef(showEdges);
  showEdgesRef.current = showEdges;
  /* eslint-enable react-hooks/refs */

  // Perform edge raycast
  const performEdgeRaycast = useCallback(
    (clientX: number, clientY: number): EdgeRaycastHit | null => {
      const edgeGroup = edgeGroupRef.current;
      const cam = cameraRef.current;
      const container = containerRef.current;

      if (!edgeGroup || !cam || !container || !showEdgesRef.current) {
        return null;
      }

      const rect = container.getBoundingClientRect();
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, cam);
      return raycastEdges(raycaster, edgeGroup, 8, cam, rect.width);
    },
    [containerRef, cameraRef, edgeGroupRef]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let clickStartPos = { x: 0, y: 0 };
    let clickStartTime = 0;
    let isDragging = false;
    let isMouseDown = false;

    const onClickStart = (e: MouseEvent) => {
      clickStartPos = { x: e.clientX, y: e.clientY };
      clickStartTime = Date.now();
      isMouseDown = true;
    };

    const onMouseMove = () => {
      // Only set dragging if mouse button is pressed
      if (isMouseDown) {
        isDragging = true;
      }
    };

    const onClick = (e: MouseEvent) => {
      // Ignore if we dragged significantly
      const dx = e.clientX - clickStartPos.x;
      const dy = e.clientY - clickStartPos.y;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);
      const clickDuration = Date.now() - clickStartTime;

      if (dragDistance > 5 || clickDuration > 300) return;

      // Only handle left click
      if (e.button !== 0) return;

      // Don't select if shift key for orbit/pan was held
      if (e.shiftKey) return;

      const hit = raycastRef.current(e.clientX, e.clientY);
      const edgeHit = performEdgeRaycast(e.clientX, e.clientY);

      // Prefer edge selection if we have an edge hit
      if (edgeHit) {
        onSelectEdgeRef.current(
          {
            bodyId: edgeHit.bodyId,
            edgeIndex: edgeHit.edgeIndex,
            featureId: edgeHit.featureId,
          },
          e.ctrlKey || e.metaKey
        );
      } else if (hit) {
        const faceId = getFaceIdRef.current(hit.bodyId, hit.faceIndex);
        onSelectFaceRef.current(
          {
            bodyId: hit.bodyId,
            faceIndex: faceId,
            featureId: hit.featureId,
          },
          e.ctrlKey || e.metaKey
        );
      } else {
        onClearSelectionRef.current();
      }
    };

    const onHoverHandler = (e: MouseEvent) => {
      // Skip hover if dragging
      if (isDragging) {
        onHoverRef.current(null);
        onCursorBroadcastRef.current?.(null);
        // Broadcast 2D cursor when dragging
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          onCursor2DBroadcastRef.current?.(
            (e.clientX - rect.left) / rect.width,
            (e.clientY - rect.top) / rect.height,
            true
          );
        }
        return;
      }

      const hit = raycastRef.current(e.clientX, e.clientY);
      const edgeHit = performEdgeRaycast(e.clientX, e.clientY);

      if (edgeHit) {
        onHoverRef.current({
          type: "edge",
          bodyId: edgeHit.bodyId,
          index: edgeHit.edgeIndex,
          featureId: edgeHit.featureId,
        });
        onCursorBroadcastRef.current?.(hit);
        onCursor2DBroadcastRef.current?.(0, 0, false);
      } else if (hit) {
        const faceId = getFaceIdRef.current(hit.bodyId, hit.faceIndex);
        onHoverRef.current({
          type: "face",
          bodyId: hit.bodyId,
          index: faceId,
          featureId: hit.featureId,
        });
        onCursorBroadcastRef.current?.(hit);
        onCursor2DBroadcastRef.current?.(0, 0, false);
      } else {
        onHoverRef.current(null);
        onCursorBroadcastRef.current?.(null);
        // Broadcast 2D cursor when not over model
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          onCursor2DBroadcastRef.current?.(
            (e.clientX - rect.left) / rect.width,
            (e.clientY - rect.top) / rect.height,
            true
          );
        }
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      isMouseDown = false;
    };

    // Get the renderer's DOM element (it should be a child of container)
    const rendererElement = container.querySelector("canvas");
    if (!rendererElement) return;

    rendererElement.addEventListener("mousedown", onClickStart);
    rendererElement.addEventListener("click", onClick);
    rendererElement.addEventListener("mousemove", onHoverHandler);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      rendererElement.removeEventListener("mousedown", onClickStart);
      rendererElement.removeEventListener("click", onClick);
      rendererElement.removeEventListener("mousemove", onHoverHandler);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [containerRef, performEdgeRaycast]);
}
