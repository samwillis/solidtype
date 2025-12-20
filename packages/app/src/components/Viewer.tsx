import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useTheme } from '../contexts/ThemeContext';
import { useViewer } from '../contexts/ViewerContext';
import './Viewer.css';

const Viewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const animationFrameRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);

  const { theme } = useTheme();
  const { registerRefs } = useViewer();

  // Request a render (for use by external controls)
  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  // Register refs with context
  useEffect(() => {
    registerRefs({
      camera: cameraRef,
      scene: sceneRef,
      target: targetRef,
      requestRender,
    });
  }, [registerRefs, requestRender]);

  // Update scene background when theme changes
  useEffect(() => {
    if (sceneRef.current) {
      const bgColor = theme === 'dark' ? 0x1a1a1a : 0xe8e8e8;
      sceneRef.current.background = new THREE.Color(bgColor);
      needsRenderRef.current = true;
    }
  }, [theme]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const initialBgColor = theme === 'dark' ? 0x1a1a1a : 0xe8e8e8;
    scene.background = new THREE.Color(initialBgColor);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      45, // Narrower FOV like CAD apps
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    // Isometric-ish starting view
    const distance = 8;
    camera.position.set(distance * 0.577, distance * 0.577, distance * 0.577);
    camera.lookAt(targetRef.current);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    // Test cube (static, no spinning)
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x0078d4 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x333333);
    scene.add(gridHelper);

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(3);
    scene.add(axesHelper);

    // SolidWorks-style controls:
    // - Middle mouse drag: Rotate/orbit
    // - Middle mouse + Ctrl: Pan
    // - Middle mouse + Shift: Zoom
    // - Scroll wheel: Zoom
    // - Right mouse drag: Pan (alternative)

    let isDragging = false;
    let isRotating = false;
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      // Middle mouse button (button 1) or right mouse button (button 2)
      if (e.button === 1) {
        // Middle mouse
        e.preventDefault();
        isDragging = true;
        if (e.ctrlKey || e.metaKey) {
          isPanning = true;
          isRotating = false;
        } else {
          isRotating = true;
          isPanning = false;
        }
      } else if (e.button === 2) {
        // Right mouse for panning
        e.preventDefault();
        isDragging = true;
        isPanning = true;
        isRotating = false;
      }
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      if (isRotating) {
        // Orbit around target
        const spherical = new THREE.Spherical();
        const offset = camera.position.clone().sub(targetRef.current);
        spherical.setFromVector3(offset);

        spherical.theta -= deltaX * 0.01;
        spherical.phi += deltaY * 0.01;
        // Clamp phi to avoid flipping
        spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));

        offset.setFromSpherical(spherical);
        camera.position.copy(targetRef.current).add(offset);
        camera.lookAt(targetRef.current);
        needsRenderRef.current = true;
      } else if (isPanning) {
        // Pan the camera and target
        const panSpeed = 0.01;
        
        // Get camera's right and up vectors
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.matrix.extractBasis(right, up, new THREE.Vector3());

        // Calculate pan offset
        const distance = camera.position.distanceTo(targetRef.current);
        const panX = right.multiplyScalar(-deltaX * panSpeed * distance * 0.1);
        const panY = up.multiplyScalar(deltaY * panSpeed * distance * 0.1);
        const panOffset = panX.add(panY);

        camera.position.add(panOffset);
        targetRef.current.add(panOffset);
        camera.lookAt(targetRef.current);
        needsRenderRef.current = true;
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
      
      // Zoom toward/away from target
      const zoomSpeed = 0.001;
      const distance = camera.position.distanceTo(targetRef.current);
      const zoomFactor = 1 + e.deltaY * zoomSpeed;
      const newDistance = Math.max(1, Math.min(100, distance * zoomFactor));

      const direction = camera.position.clone().sub(targetRef.current).normalize();
      camera.position.copy(targetRef.current).add(direction.multiplyScalar(newDistance));
      needsRenderRef.current = true;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent context menu on right click
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Render loop (only renders when needed)
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (needsRenderRef.current) {
        renderer.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    animate();

    // Initial render
    needsRenderRef.current = true;

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect =
        containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      );
      needsRenderRef.current = true;
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [theme]);

  return <div ref={containerRef} className="viewer-container" />;
};

export default Viewer;
