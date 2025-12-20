import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer, ViewPreset } from '../contexts/ViewerContext';
import { useTheme } from '../contexts/ThemeContext';
import './ViewCube.css';

const ViewCube: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const cubeRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const animationFrameRef = useRef<number | null>(null);
  const hoveredRef = useRef<string | null>(null);

  const { actions, cameraRotationRef } = useViewer();
  const { theme } = useTheme();
  const lastRotationVersionRef = useRef(-1);

  // Map mesh names to view presets
  const getViewPreset = (name: string): ViewPreset | null => {
    const mapping: Record<string, ViewPreset> = {
      'face-front': 'front',
      'face-back': 'back',
      'face-top': 'top',
      'face-bottom': 'bottom',
      'face-left': 'left',
      'face-right': 'right',
      // Edges
      'edge-front-top': 'front-top',
      'edge-front-bottom': 'front-bottom',
      'edge-front-left': 'front-left',
      'edge-front-right': 'front-right',
      'edge-back-top': 'back-top',
      'edge-back-bottom': 'back-bottom',
      'edge-back-left': 'back-left',
      'edge-back-right': 'back-right',
      'edge-top-left': 'top-left',
      'edge-top-right': 'top-right',
      'edge-bottom-left': 'bottom-left',
      'edge-bottom-right': 'bottom-right',
      // Corners
      'corner-front-top-left': 'front-top-left',
      'corner-front-top-right': 'front-top-right',
      'corner-front-bottom-left': 'front-bottom-left',
      'corner-front-bottom-right': 'front-bottom-right',
      'corner-back-top-left': 'back-top-left',
      'corner-back-top-right': 'back-top-right',
      'corner-back-bottom-left': 'back-bottom-left',
      'corner-back-bottom-right': 'back-bottom-right',
    };
    return mapping[name] || null;
  };

  const createCube = useCallback((isDark: boolean) => {
    const group = new THREE.Group();
    
    const faceColor = isDark ? 0x3c3c3c : 0xf0f0f0;
    const edgeColor = isDark ? 0x505050 : 0xd0d0d0;
    const cornerColor = isDark ? 0x606060 : 0xc0c0c0;
    const textColor = isDark ? '#cccccc' : '#333333';
    const hoverColor = 0x0078d4;
    
    const cubeSize = 1;
    const edgeSize = 0.15;
    const cornerSize = 0.15;
    
    // Create face materials with text
    const createFaceMaterial = (label: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = isDark ? '#3c3c3c' : '#f0f0f0';
      ctx.fillRect(0, 0, 128, 128);
      
      ctx.fillStyle = textColor;
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 64, 64);
      
      const texture = new THREE.CanvasTexture(canvas);
      return new THREE.MeshBasicMaterial({ map: texture });
    };

    // Face geometry (slightly inset from edges)
    const faceSize = cubeSize - edgeSize * 2;
    const faceGeometry = new THREE.PlaneGeometry(faceSize, faceSize);
    
    // Create faces
    const faces = [
      { name: 'face-front', label: 'FRONT', position: [0, 0, cubeSize / 2], rotation: [0, 0, 0] },
      { name: 'face-back', label: 'BACK', position: [0, 0, -cubeSize / 2], rotation: [0, Math.PI, 0] },
      { name: 'face-right', label: 'RIGHT', position: [cubeSize / 2, 0, 0], rotation: [0, Math.PI / 2, 0] },
      { name: 'face-left', label: 'LEFT', position: [-cubeSize / 2, 0, 0], rotation: [0, -Math.PI / 2, 0] },
      { name: 'face-top', label: 'TOP', position: [0, cubeSize / 2, 0], rotation: [-Math.PI / 2, 0, 0] },
      { name: 'face-bottom', label: 'BOTTOM', position: [0, -cubeSize / 2, 0], rotation: [Math.PI / 2, 0, 0] },
    ];

    faces.forEach(({ name, label, position, rotation }) => {
      const material = createFaceMaterial(label);
      const mesh = new THREE.Mesh(faceGeometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.name = name;
      mesh.userData = { type: 'face', hoverColor, originalColor: faceColor };
      group.add(mesh);
    });

    // Edge geometry
    const edgeLongGeometry = new THREE.BoxGeometry(faceSize, edgeSize, edgeSize);
    const edgeShortGeometry = new THREE.BoxGeometry(edgeSize, faceSize, edgeSize);
    const edgeVertGeometry = new THREE.BoxGeometry(edgeSize, edgeSize, faceSize);
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: edgeColor });

    // Horizontal edges (along X)
    const horizontalEdges = [
      { name: 'edge-front-top', position: [0, cubeSize / 2 - edgeSize / 2, cubeSize / 2 - edgeSize / 2], geometry: edgeLongGeometry },
      { name: 'edge-front-bottom', position: [0, -cubeSize / 2 + edgeSize / 2, cubeSize / 2 - edgeSize / 2], geometry: edgeLongGeometry },
      { name: 'edge-back-top', position: [0, cubeSize / 2 - edgeSize / 2, -cubeSize / 2 + edgeSize / 2], geometry: edgeLongGeometry },
      { name: 'edge-back-bottom', position: [0, -cubeSize / 2 + edgeSize / 2, -cubeSize / 2 + edgeSize / 2], geometry: edgeLongGeometry },
    ];

    // Vertical edges (along Y)
    const verticalEdges = [
      { name: 'edge-front-left', position: [-cubeSize / 2 + edgeSize / 2, 0, cubeSize / 2 - edgeSize / 2], geometry: edgeShortGeometry },
      { name: 'edge-front-right', position: [cubeSize / 2 - edgeSize / 2, 0, cubeSize / 2 - edgeSize / 2], geometry: edgeShortGeometry },
      { name: 'edge-back-left', position: [-cubeSize / 2 + edgeSize / 2, 0, -cubeSize / 2 + edgeSize / 2], geometry: edgeShortGeometry },
      { name: 'edge-back-right', position: [cubeSize / 2 - edgeSize / 2, 0, -cubeSize / 2 + edgeSize / 2], geometry: edgeShortGeometry },
    ];

    // Depth edges (along Z)
    const depthEdges = [
      { name: 'edge-top-left', position: [-cubeSize / 2 + edgeSize / 2, cubeSize / 2 - edgeSize / 2, 0], geometry: edgeVertGeometry },
      { name: 'edge-top-right', position: [cubeSize / 2 - edgeSize / 2, cubeSize / 2 - edgeSize / 2, 0], geometry: edgeVertGeometry },
      { name: 'edge-bottom-left', position: [-cubeSize / 2 + edgeSize / 2, -cubeSize / 2 + edgeSize / 2, 0], geometry: edgeVertGeometry },
      { name: 'edge-bottom-right', position: [cubeSize / 2 - edgeSize / 2, -cubeSize / 2 + edgeSize / 2, 0], geometry: edgeVertGeometry },
    ];

    [...horizontalEdges, ...verticalEdges, ...depthEdges].forEach(({ name, position, geometry }) => {
      const mesh = new THREE.Mesh(geometry, edgeMaterial.clone());
      mesh.position.set(position[0], position[1], position[2]);
      mesh.name = name;
      mesh.userData = { type: 'edge', hoverColor, originalColor: edgeColor };
      group.add(mesh);
    });

    // Corner geometry
    const cornerGeometry = new THREE.BoxGeometry(cornerSize, cornerSize, cornerSize);
    const cornerMaterial = new THREE.MeshBasicMaterial({ color: cornerColor });

    const corners = [
      { name: 'corner-front-top-left', position: [-cubeSize / 2 + cornerSize / 2, cubeSize / 2 - cornerSize / 2, cubeSize / 2 - cornerSize / 2] },
      { name: 'corner-front-top-right', position: [cubeSize / 2 - cornerSize / 2, cubeSize / 2 - cornerSize / 2, cubeSize / 2 - cornerSize / 2] },
      { name: 'corner-front-bottom-left', position: [-cubeSize / 2 + cornerSize / 2, -cubeSize / 2 + cornerSize / 2, cubeSize / 2 - cornerSize / 2] },
      { name: 'corner-front-bottom-right', position: [cubeSize / 2 - cornerSize / 2, -cubeSize / 2 + cornerSize / 2, cubeSize / 2 - cornerSize / 2] },
      { name: 'corner-back-top-left', position: [-cubeSize / 2 + cornerSize / 2, cubeSize / 2 - cornerSize / 2, -cubeSize / 2 + cornerSize / 2] },
      { name: 'corner-back-top-right', position: [cubeSize / 2 - cornerSize / 2, cubeSize / 2 - cornerSize / 2, -cubeSize / 2 + cornerSize / 2] },
      { name: 'corner-back-bottom-left', position: [-cubeSize / 2 + cornerSize / 2, -cubeSize / 2 + cornerSize / 2, -cubeSize / 2 + cornerSize / 2] },
      { name: 'corner-back-bottom-right', position: [cubeSize / 2 - cornerSize / 2, -cubeSize / 2 + cornerSize / 2, -cubeSize / 2 + cornerSize / 2] },
    ];

    corners.forEach(({ name, position }) => {
      const mesh = new THREE.Mesh(cornerGeometry, cornerMaterial.clone());
      mesh.position.set(position[0], position[1], position[2]);
      mesh.name = name;
      mesh.userData = { type: 'corner', hoverColor, originalColor: cornerColor };
      group.add(mesh);
    });

    return group;
  }, []);


  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const size = 80;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup (orthographic for consistent look)
    const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 100);
    camera.position.set(2, 2, 2);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create the cube
    const isDark = theme === 'dark';
    const cube = createCube(isDark);
    scene.add(cube);
    cubeRef.current = cube;

    // Handle mouse events
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / size) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / size) * 2 + 1;
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / size) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / size) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(cube.children, true);
      
      if (intersects.length > 0) {
        const object = intersects[0].object;
        const preset = getViewPreset(object.name);
        if (preset) {
          actions.setView(preset);
        }
      }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClick);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Sync cube rotation with main camera
      if (cubeRef.current && cameraRotationRef.current.version !== lastRotationVersionRef.current) {
        lastRotationVersionRef.current = cameraRotationRef.current.version;
        // Apply camera rotation to cube (inverted so cube shows orientation from camera's POV)
        const quaternion = cameraRotationRef.current.quaternion.clone().invert();
        cubeRef.current.quaternion.copy(quaternion);
      }

      // Raycast for hover effect
      if (cubeRef.current) {
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const intersects = raycasterRef.current.intersectObjects(cubeRef.current.children, true);
        
        // Reset previous hover
        cubeRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.userData.originalColor !== undefined) {
            const mat = child.material as THREE.MeshBasicMaterial;
            if (child.name !== hoveredRef.current) {
              mat.color.setHex(child.userData.originalColor);
            }
          }
        });

        // Apply new hover
        if (intersects.length > 0) {
          const object = intersects[0].object;
          if (object instanceof THREE.Mesh && object.userData.hoverColor) {
            const mat = object.material as THREE.MeshBasicMaterial;
            mat.color.setHex(object.userData.hoverColor);
            hoveredRef.current = object.name;
            container.style.cursor = 'pointer';
          }
        } else {
          hoveredRef.current = null;
          container.style.cursor = 'default';
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClick);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (container && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [theme, createCube, actions]);

  return <div ref={containerRef} className="view-cube" />;
};

export default ViewCube;
