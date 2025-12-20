import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useTheme } from '../contexts/ThemeContext';
import { useViewer, ProjectionMode } from '../contexts/ViewerContext';
import { useKernel } from '../contexts/KernelContext';
import './Viewer.css';

const Viewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const animationFrameRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);
  const projectionModeRef = useRef<ProjectionMode>('perspective');
  const meshGroupRef = useRef<THREE.Group | null>(null);

  const { theme } = useTheme();
  const { registerRefs, cameraStateRef } = useViewer();
  const { meshes } = useKernel();

  // Request a render (for use by external controls)
  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
  }, []);

  // Update camera projection
  const updateCamera = useCallback((projection: ProjectionMode) => {
    if (!containerRef.current || !cameraRef.current) return;
    
    const oldCamera = cameraRef.current;
    const container = containerRef.current;
    const aspect = container.clientWidth / container.clientHeight;
    const distance = oldCamera.position.distanceTo(targetRef.current);
    
    let newCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    
    if (projection === 'orthographic') {
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

  // Register refs with context
  useEffect(() => {
    registerRefs({
      camera: cameraRef,
      scene: sceneRef,
      target: targetRef,
      container: containerRef,
      updateCamera,
      requestRender,
    });
  }, [registerRefs, requestRender, updateCamera]);

  // Update scene background when theme changes
  useEffect(() => {
    if (sceneRef.current) {
      const bgColor = theme === 'dark' ? 0x1a1a1a : 0xe8e8e8;
      sceneRef.current.background = new THREE.Color(bgColor);
      needsRenderRef.current = true;
    }
  }, [theme]);

  // Update meshes when kernel sends new mesh data
  useEffect(() => {
    const meshGroup = meshGroupRef.current;
    if (!meshGroup) return;

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

    // Add new meshes
    meshes.forEach((meshData, bodyId) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(meshData.positions, 3)
      );
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(meshData.normals, 3)
      );
      geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

      const material = new THREE.MeshStandardMaterial({
        color: 0x0078d4,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = bodyId;
      meshGroup.add(mesh);
    });

    // If no meshes, show a placeholder cube
    if (meshes.size === 0) {
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshStandardMaterial({
        color: 0x0078d4,
        opacity: 0.3,
        transparent: true,
      });
      const placeholder = new THREE.Mesh(geometry, material);
      placeholder.name = 'placeholder';
      meshGroup.add(placeholder);
    }

    needsRenderRef.current = true;
  }, [meshes]);

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

    // Group for kernel meshes
    const meshGroup = new THREE.Group();
    meshGroup.name = 'kernel-meshes';
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x333333);
    scene.add(gridHelper);

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
      if (e.button === 0) {
        // Left mouse button
        e.preventDefault();
        isDragging = true;
        if (e.shiftKey) {
          isPanning = true;
          isRotating = false;
        } else {
          isRotating = true;
          isPanning = false;
        }
      } else if (e.button === 1) {
        // Middle mouse - also rotate
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
        // Right mouse for panning
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
      const newDistance = Math.max(1, Math.min(100, distance * zoomFactor));

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

    // Render loop - always render to avoid black frames
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (cameraRef.current) {
        // Update camera state ref for ViewCube sync every frame
        // Store camera direction (position relative to target, normalized)
        const direction = cameraRef.current.position.clone().sub(targetRef.current).normalize();
        cameraStateRef.current.position.copy(direction);
        cameraStateRef.current.up.copy(cameraRef.current.up);
        cameraStateRef.current.version++;
        
        renderer.render(scene, cameraRef.current);
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
      
      // Immediately render to prevent black flash
      renderer.render(scene, currentCamera);
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
    
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      resizeObserver.disconnect();
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
