import React, { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useModelBuild } from '../hooks/useModelBuild';
import type { SerializedMesh } from '../workers/model-worker.types';
import './Viewer.css';

/**
 * Convert a SerializedMesh to a THREE.BufferGeometry
 */
function meshToGeometry(mesh: SerializedMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return geometry;
}

const Viewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Get model build state
  const { meshes, isBuilding, success, errors, runtimeError } = useModelBuild();

  // Material for the meshes
  const material = useMemo(() => new THREE.MeshStandardMaterial({ 
    color: 0x4a90e2,
    metalness: 0.3,
    roughness: 0.5,
    flatShading: false,
  }), []);

  // Setup scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x8899aa, 0.3);
    fillLight.position.set(-10, 5, -10);
    scene.add(fillLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xe0e0e0);
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(3);
    axesHelper.position.set(-8, 0, -8);
    scene.add(axesHelper);

    // Mesh group for model geometry
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Orbit controls (simple manual implementation)
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      const spherical = new THREE.Spherical();
      spherical.setFromVector3(camera.position);
      spherical.theta -= deltaX * 0.01;
      spherical.phi += deltaY * 0.01;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0, 0);

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const distance = camera.position.length();
      const newDistance = distance + e.deltaY * 0.05;
      if (newDistance > 2 && newDistance < 100) {
        camera.position.normalize().multiplyScalar(newDistance);
      }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

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
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      material.dispose();
    };
  }, [material]);

  // Update meshes when model changes
  useEffect(() => {
    const meshGroup = meshGroupRef.current;
    if (!meshGroup) return;

    // Clear existing meshes
    while (meshGroup.children.length > 0) {
      const child = meshGroup.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
      meshGroup.remove(child);
    }

    // Add new meshes
    for (const serializedMesh of meshes) {
      const geometry = meshToGeometry(serializedMesh);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = serializedMesh.id;
      meshGroup.add(mesh);
    }
  }, [meshes, material]);

  // Determine status message
  let statusMessage = '';
  let statusClass = '';
  if (isBuilding) {
    statusMessage = 'Building...';
    statusClass = 'building';
  } else if (runtimeError) {
    statusMessage = `Runtime Error: ${runtimeError}`;
    statusClass = 'error';
  } else if (errors.length > 0) {
    statusMessage = `${errors.length} modeling error${errors.length > 1 ? 's' : ''}`;
    statusClass = 'error';
  } else if (success && meshes.length > 0) {
    statusMessage = `${meshes.length} ${meshes.length === 1 ? 'body' : 'bodies'}`;
    statusClass = 'success';
  }

  return (
    <div className="viewer-wrapper">
      <div ref={containerRef} className="viewer-container" />
      {statusMessage && (
        <div className={`viewer-status ${statusClass}`}>
          {statusMessage}
        </div>
      )}
    </div>
  );
};

export default Viewer;
