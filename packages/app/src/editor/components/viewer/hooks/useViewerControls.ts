/**
 * useViewerControls - Camera controls and animation loop hook
 *
 * Handles orbit, pan, zoom, resize, and the main render loop.
 */

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { EffectComposer } from "postprocessing";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ProjectionMode } from "../../../contexts/ViewerContext";

/** Options for useViewerControls */
export interface ViewerControlsOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  composerRef: React.MutableRefObject<EffectComposer | null>;
  labelRendererRef: React.MutableRefObject<CSS2DRenderer | null>;
  targetRef: React.MutableRefObject<THREE.Vector3>;
  needsRenderRef: React.MutableRefObject<boolean>;
  edgeGroupRef: React.MutableRefObject<THREE.Group | null>;
  cameraStateRef: React.MutableRefObject<{
    position: THREE.Vector3;
    up: THREE.Vector3;
    distance: number;
    version: number;
  }>;
  projectionModeRef: React.MutableRefObject<ProjectionMode>;
  aoEnabledRef: React.MutableRefObject<boolean>;
  /** Callback to broadcast camera state to awareness for following */
  onCameraChange?: () => void;
  /** Whether sketch mode is active (affects control behavior) */
  sketchModeRef: React.MutableRefObject<{ active: boolean; activeTool: string }>;
}

/**
 * Hook to handle viewer camera controls (orbit, pan, zoom) and the animation loop.
 */
export function useViewerControls(options: ViewerControlsOptions): {
  updateCamera: (projection: ProjectionMode) => void;
} {
  const {
    containerRef,
    sceneRef,
    cameraRef,
    rendererRef,
    composerRef,
    labelRendererRef,
    targetRef,
    needsRenderRef,
    edgeGroupRef,
    cameraStateRef,
    projectionModeRef,
    aoEnabledRef,
    onCameraChange,
    sketchModeRef,
  } = options;

  const animationFrameRef = useRef<number | null>(null);
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;

  // Update camera projection
  const updateCamera = useCallback(
    (projection: ProjectionMode) => {
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
    },
    [containerRef, cameraRef, targetRef, projectionModeRef, needsRenderRef]
  );

  // Main controls and animation loop effect
  useEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const labelRenderer = labelRendererRef.current;
    const scene = sceneRef.current;

    if (!container || !renderer || !labelRenderer || !scene) return;

    let isDragging = false;
    let isRotating = false;
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      const currentSketchMode = sketchModeRef.current;
      const hasActiveTool = currentSketchMode.active && currentSketchMode.activeTool !== "none";

      if (e.button === 0) {
        e.preventDefault();

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
        const spherical = new THREE.Spherical();
        const offset = currentCamera.position.clone().sub(targetRef.current);
        spherical.setFromVector3(offset);

        spherical.theta -= deltaX * 0.01;
        spherical.phi += deltaY * 0.01;
        spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));

        offset.setFromSpherical(spherical);
        currentCamera.position.copy(targetRef.current).add(offset);
        currentCamera.lookAt(targetRef.current);
        needsRenderRef.current = true;
        onCameraChangeRef.current?.();
      } else if (isPanning) {
        const panSpeed = 0.01;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        currentCamera.matrix.extractBasis(right, up, new THREE.Vector3());

        const distance = currentCamera.position.distanceTo(targetRef.current);
        const panX = right.multiplyScalar(-deltaX * panSpeed * distance * 0.1);
        const panY = up.multiplyScalar(deltaY * panSpeed * distance * 0.1);
        const panOffset = panX.add(panY);

        currentCamera.position.add(panOffset);
        targetRef.current.add(panOffset);
        currentCamera.lookAt(targetRef.current);
        needsRenderRef.current = true;
        onCameraChangeRef.current?.();
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
      const zoomSpeed = 0.001;
      const distance = currentCamera.position.distanceTo(targetRef.current);
      const zoomFactor = 1 + e.deltaY * zoomSpeed;
      const newDistance = Math.max(10, Math.min(5000, distance * zoomFactor));

      const direction = currentCamera.position.clone().sub(targetRef.current).normalize();
      currentCamera.position.copy(targetRef.current).add(direction.multiplyScalar(newDistance));

      if (currentCamera instanceof THREE.OrthographicCamera && containerRef.current) {
        const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        const frustumSize = newDistance * 0.5;
        currentCamera.left = -frustumSize * aspect;
        currentCamera.right = frustumSize * aspect;
        currentCamera.top = frustumSize;
        currentCamera.bottom = -frustumSize;
        currentCamera.updateProjectionMatrix();
      }

      onCameraChangeRef.current?.();
      needsRenderRef.current = true;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (cameraRef.current && scene) {
        // Update camera state ref for ViewCube sync
        const offset = cameraRef.current.position.clone().sub(targetRef.current);
        const distance = offset.length();
        const direction = offset.normalize();
        cameraStateRef.current.position.copy(direction);
        cameraStateRef.current.up.copy(cameraRef.current.up);
        cameraStateRef.current.distance = distance;
        cameraStateRef.current.version++;

        // Use composer for post-processing when AO is enabled
        if (composerRef.current && aoEnabledRef.current) {
          composerRef.current.render();
        } else {
          renderer.render(scene, cameraRef.current);
        }
        labelRenderer.render(scene, cameraRef.current);
      }
    };
    animate();

    // Handle resize
    let resizeTimeout: number | null = null;

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !renderer) return;
      const currentCamera = cameraRef.current;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

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

      // Immediately render
      if (composerRef.current && aoEnabledRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, currentCamera);
      }
      labelRenderer.render(scene, currentCamera);
    };

    const debouncedResize = () => {
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      resizeTimeout = requestAnimationFrame(() => {
        handleResize();
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      debouncedResize();
    });
    resizeObserver.observe(container);

    window.addEventListener("resize", handleResize);

    // Attach event listeners
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    // Cleanup
    return () => {
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    containerRef,
    sceneRef,
    cameraRef,
    rendererRef,
    composerRef,
    labelRendererRef,
    targetRef,
    needsRenderRef,
    edgeGroupRef,
    cameraStateRef,
    aoEnabledRef,
    sketchModeRef,
  ]);

  return { updateCamera };
}
