import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer, ViewPreset } from '../contexts/ViewerContext';
import { useTheme } from '../contexts/ThemeContext';
import './ViewCube.css';

const ViewCube: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const cubeRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const mouseScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const hoveredRef = useRef<string | null>(null);

  const { actions, cameraStateRef } = useViewer();
  const { theme } = useTheme();
  const lastVersionRef = useRef(-1);

  // Get display name for a mesh
  const getDisplayName = (name: string): string => {
    const mapping: Record<string, string> = {
      'face-front': 'Front',
      'face-back': 'Back',
      'face-top': 'Top',
      'face-bottom': 'Bottom',
      'face-left': 'Left',
      'face-right': 'Right',
      'edge-front-top': 'Front Top',
      'edge-front-bottom': 'Front Bottom',
      'edge-front-left': 'Front Left',
      'edge-front-right': 'Front Right',
      'edge-back-top': 'Back Top',
      'edge-back-bottom': 'Back Bottom',
      'edge-back-left': 'Back Left',
      'edge-back-right': 'Back Right',
      'edge-top-left': 'Top Left',
      'edge-top-right': 'Top Right',
      'edge-bottom-left': 'Bottom Left',
      'edge-bottom-right': 'Bottom Right',
      'corner-front-top-left': 'Front Top Left',
      'corner-front-top-right': 'Front Top Right',
      'corner-front-bottom-left': 'Front Bottom Left',
      'corner-front-bottom-right': 'Front Bottom Right',
      'corner-back-top-left': 'Back Top Left',
      'corner-back-top-right': 'Back Top Right',
      'corner-back-bottom-left': 'Back Bottom Left',
      'corner-back-bottom-right': 'Back Bottom Right',
    };
    return mapping[name] || name;
  };

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
    
    const faceColor = isDark ? 0x3c3c3c : 0xe8e8e8;
    const edgeColor = isDark ? 0x505050 : 0xc8c8c8;
    const cornerColor = isDark ? 0x606060 : 0xb8b8b8;
    const textColor = isDark ? '#ffffff' : '#222222';
    const faceBackground = isDark ? '#3c3c3c' : '#e8e8e8';
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
      
      ctx.fillStyle = faceBackground;
      ctx.fillRect(0, 0, 128, 128);
      
      ctx.fillStyle = textColor;
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
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
    const size = 130;

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
      mouseScreenRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseLeave = () => {
      mouseRef.current.x = -999;
      mouseRef.current.y = -999;
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
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
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('click', onClick);

    // Animation loop
    const cameraDistance = 3;
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Sync ViewCube camera with main camera
      if (cameraStateRef.current.version !== lastVersionRef.current) {
        lastVersionRef.current = cameraStateRef.current.version;
        // Move ViewCube camera to match main camera's viewing direction
        const direction = cameraStateRef.current.position;
        camera.position.copy(direction).multiplyScalar(cameraDistance);
        camera.up.copy(cameraStateRef.current.up);
        camera.lookAt(0, 0, 0);
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
            
            // Show tooltip
            if (tooltipRef.current) {
              tooltipRef.current.textContent = getDisplayName(object.name);
              tooltipRef.current.style.display = 'block';
              tooltipRef.current.style.left = `${mouseScreenRef.current.x + 12}px`;
              tooltipRef.current.style.top = `${mouseScreenRef.current.y + 12}px`;
            }
          }
        } else {
          hoveredRef.current = null;
          container.style.cursor = 'default';
          
          // Hide tooltip
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none';
          }
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
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

  return (
    <>
      <div ref={containerRef} className="view-cube" />
      <div ref={tooltipRef} className="view-cube-tooltip" style={{ display: 'none' }} />
    </>
  );
};

export default ViewCube;
