import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { useTheme } from '../contexts/ThemeContext';
import { useViewer, ProjectionMode } from '../contexts/ViewerContext';
import { useKernel } from '../contexts/KernelContext';
import { useSelection } from '../contexts/SelectionContext';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import { useRaycast } from '../hooks/useRaycast';
import { findFeature, getSketchData, getFeaturesArray, parseFeature } from '../document/featureHelpers';
import type { SketchData, PlaneFeature, OriginFeature, SketchFeature } from '../types/document';
import './Viewer.css';

/** Get default color for a datum plane based on its ID */
function getDefaultPlaneColor(planeId: string): number {
  switch (planeId) {
    case 'xy': return 0x0088ff; // Blue (Top plane)
    case 'xz': return 0x00cc44; // Green (Front plane)
    case 'yz': return 0xff4444; // Red (Right plane)
    default: return 0x888888;   // Gray for custom planes
  }
}

/** Parse hex color string to number */
function parseHexColor(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  if (color.startsWith('#')) {
    const parsed = parseInt(color.slice(1), 16);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
}

/** Visual state for rendering features */
type FeatureDisplayState = 'normal' | 'hovered' | 'selected';

/** Get opacity based on display state (reduced by 50% per user request) */
function getPlaneOpacity(state: FeatureDisplayState): { fill: number; border: number; grid: number } {
  switch (state) {
    case 'selected': return { fill: 0.18, border: 0.5, grid: 0.4 };
    case 'hovered': return { fill: 0.12, border: 0.4, grid: 0.3 };
    case 'normal':
    default: return { fill: 0.06, border: 0.2, grid: 0.15 };
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
    case 'selected': return 4;
    case 'hovered': return 3;
    case 'normal':
    default: return 2;
  }
}

/** Get origin opacity and scale based on display state */
function getOriginStyle(state: FeatureDisplayState): { opacity: number; scale: number } {
  switch (state) {
    case 'selected': return { opacity: 1.0, scale: 1.3 };
    case 'hovered': return { opacity: 0.8, scale: 1.15 };
    case 'normal':
    default: return { opacity: 0.4, scale: 1.0 };
  }
}

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
  const sketchGroupRef = useRef<THREE.Group | null>(null);
  const planesGroupRef = useRef<THREE.Group | null>(null);
  const originGroupRef = useRef<THREE.Group | null>(null);
  const [sceneReady, setSceneReady] = React.useState(false);

  const { theme } = useTheme();
  const { registerRefs, cameraStateRef } = useViewer();
  const { meshes, bodies } = useKernel();
  const { selectFace, setHover, clearSelection, selectedFeatureId, hoveredFeatureId } = useSelection();
  const { mode: sketchMode, previewLine } = useSketch();
  const { doc, features } = useDocument();
  
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
  const setHoverRef = useRef(setHover);
  setHoverRef.current = setHover;
  const clearSelectionRef = useRef(clearSelection);
  clearSelectionRef.current = clearSelection;

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

  // Convert screen coordinates to sketch coordinates via ray-plane intersection
  const screenToSketch = useCallback((screenX: number, screenY: number, planeId: string): { x: number; y: number } | null => {
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

    // Define sketch plane based on planeId
    let planeNormal: THREE.Vector3;
    let planePoint: THREE.Vector3;
    let xDir: THREE.Vector3;
    let yDir: THREE.Vector3;

    switch (planeId) {
      case 'xy':
        planeNormal = new THREE.Vector3(0, 0, 1);
        planePoint = new THREE.Vector3(0, 0, 0);
        xDir = new THREE.Vector3(1, 0, 0);
        yDir = new THREE.Vector3(0, 1, 0);
        break;
      case 'xz':
        planeNormal = new THREE.Vector3(0, 1, 0);
        planePoint = new THREE.Vector3(0, 0, 0);
        xDir = new THREE.Vector3(1, 0, 0);
        yDir = new THREE.Vector3(0, 0, -1);
        break;
      case 'yz':
        planeNormal = new THREE.Vector3(1, 0, 0);
        planePoint = new THREE.Vector3(0, 0, 0);
        xDir = new THREE.Vector3(0, 0, -1);
        yDir = new THREE.Vector3(0, 1, 0);
        break;
      default:
        return null;
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
      screenToSketch,
    });
  }, [registerRefs, requestRender, updateCamera, screenToSketch]);

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
    if (!meshGroup) {
      console.log('[Viewer] meshGroup not ready yet, sceneReady:', sceneReady);
      return;
    }

    console.log('[Viewer] Updating meshes, count:', meshes.size, 'sceneReady:', sceneReady);

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
      console.log('[Viewer] Adding mesh for body:', bodyId, 'positions:', meshData.positions.length / 3);
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

      const isPreview = bodyId.startsWith('__preview');
      const isCutPreview = bodyId.includes('cut');
      const material = new THREE.MeshStandardMaterial({
        color: isPreview ? (isCutPreview ? 0xff4444 : 0x44aaff) : 0x0078d4,
        side: THREE.DoubleSide,
        transparent: isPreview,
        opacity: isPreview ? 0.45 : 1,
        depthWrite: !isPreview,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = bodyId;
      meshGroup.add(mesh);
    });


    needsRenderRef.current = true;
  }, [meshes, sceneReady]);

  // Render datum planes
  useEffect(() => {
    const planesGroup = planesGroupRef.current;
    if (!planesGroup || !sceneReady) return;

    // Clear existing planes
    while (planesGroup.children.length > 0) {
      const child = planesGroup.children[0];
      planesGroup.remove(child);
      if ('geometry' in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ('material' in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material.dispose();
      }
    }

    // Get all plane features
    const featureElements = getFeaturesArray(doc.features);
    for (const element of featureElements) {
      const feature = parseFeature(element);
      if (!feature || feature.type !== 'plane') continue;
      
      const planeFeature = feature as PlaneFeature;
      
      // Check visibility - show if visible OR if selected/hovered in feature tree
      const isSelected = selectedFeatureId === planeFeature.id;
      const isHovered = hoveredFeatureId === planeFeature.id;
      if (!planeFeature.visible && !isSelected && !isHovered) continue;
      
      // Determine display state
      const displayState: FeatureDisplayState = isSelected ? 'selected' : isHovered ? 'hovered' : 'normal';
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
      const center = origin.clone()
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
        -width / 2, -height / 2, 0,
         width / 2, -height / 2, 0,
         width / 2,  height / 2, 0,
        -width / 2,  height / 2, 0,
        -width / 2, -height / 2, 0, // close the loop
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
        gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
        
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
  }, [doc.features, features, sceneReady, selectedFeatureId, hoveredFeatureId]);

  // Render origin
  useEffect(() => {
    const originGroup = originGroupRef.current;
    if (!originGroup || !sceneReady) return;

    // Clear existing origin geometry
    while (originGroup.children.length > 0) {
      const child = originGroup.children[0];
      originGroup.remove(child);
      if ('geometry' in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ('material' in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material.dispose();
      }
    }

    // Find origin feature
    const featureElements = getFeaturesArray(doc.features);
    for (const element of featureElements) {
      const feature = parseFeature(element);
      if (!feature || feature.type !== 'origin') continue;
      
      const originFeature = feature as OriginFeature;
      
      // Show if visible OR if selected/hovered in feature tree
      const isSelected = selectedFeatureId === originFeature.id;
      const isHovered = hoveredFeatureId === originFeature.id;
      if (!originFeature.visible && !isSelected && !isHovered) continue;
      
      // Determine display state
      const displayState: FeatureDisplayState = isSelected ? 'selected' : isHovered ? 'hovered' : 'normal';
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
  }, [doc.features, features, sceneReady, selectedFeatureId, hoveredFeatureId]);

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
      if ('geometry' in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ('material' in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material.dispose();
      }
    }

    // Get renderer size for LineMaterial resolution
    const renderer = rendererRef.current;
    const rendererSize = renderer ? new THREE.Vector2() : null;
    if (renderer && rendererSize) {
      renderer.getSize(rendererSize);
    }

    // Helper to get plane transformation
    const getPlaneTransform = (planeId: string) => {
      switch (planeId) {
        case 'xy':
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 1, 0),
          };
        case 'xz':
          return {
            origin: new THREE.Vector3(0, 0, 0),
            xDir: new THREE.Vector3(1, 0, 0),
            yDir: new THREE.Vector3(0, 0, 1),
          };
        case 'yz':
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
      pointSize: number
    ) => {
      const { origin, xDir, yDir } = getPlaneTransform(planeId);

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

      const createLine2 = (positions: number[], lineColor: number): Line2 => {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: lineColor,
          linewidth: 1.5,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
        });
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 2;
        return line;
      };

      // Draw lines
      for (const entity of sketchData.entities) {
        if (entity.type === 'line') {
          const startPoint = pointMap.get(entity.start);
          const endPoint = pointMap.get(entity.end);
          if (startPoint && endPoint) {
            const startWorld = toWorld(startPoint.x, startPoint.y);
            const endWorld = toWorld(endPoint.x, endPoint.y);
            const positions = [
              startWorld.x, startWorld.y, startWorld.z,
              endWorld.x, endWorld.y, endWorld.z,
            ];
            sketchGroup.add(createLine2(positions, color));
          }
        } else if (entity.type === 'arc') {
          const startPoint = pointMap.get(entity.start);
          const endPoint = pointMap.get(entity.end);
          const centerPoint = pointMap.get(entity.center);
          if (startPoint && endPoint && centerPoint) {
            const r = Math.hypot(startPoint.x - centerPoint.x, startPoint.y - centerPoint.y);
            const startAngle = Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
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
              if (entity.ccw) { if (sweep <= 0) sweep += Math.PI * 2; }
              else { if (sweep >= 0) sweep -= Math.PI * 2; }
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
            sketchGroup.add(createLine2(positions, color));
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
        pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        
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
      const sketchElement = findFeature(doc.features, sketchMode.sketchId);
      if (sketchElement) {
        const sketchData = getSketchData(sketchElement);
        console.log('[Viewer] Rendering active sketch:', sketchMode.sketchId, 'points:', sketchData.points.length);
        renderSketch(sketchData, sketchMode.planeId, 0x00aaff, 1.5); // Blue, larger points
      }
      
      // Render preview line (green dashed) for line tool
      if (previewLine && sketchMode.planeId) {
        const { origin, xDir, yDir } = getPlaneTransform(sketchMode.planeId);
        
        const toWorld = (x: number, y: number): THREE.Vector3 => {
          return new THREE.Vector3(
            origin.x + x * xDir.x + y * yDir.x,
            origin.y + x * xDir.y + y * yDir.y,
            origin.z + x * xDir.z + y * yDir.z
          );
        };
        
        const startWorld = toWorld(previewLine.start.x, previewLine.start.y);
        const endWorld = toWorld(previewLine.end.x, previewLine.end.y);
        
        const geometry = new LineGeometry();
        geometry.setPositions([
          startWorld.x, startWorld.y, startWorld.z,
          endWorld.x, endWorld.y, endWorld.z,
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
    }

    // Render visible (non-active) sketches in grey
    const featureElements = getFeaturesArray(doc.features);
    for (const element of featureElements) {
      const feature = parseFeature(element);
      if (!feature || feature.type !== 'sketch') continue;
      
      const sketchFeature = feature as SketchFeature;
      
      // Skip if this is the active sketch (already rendered above)
      if (sketchMode.active && sketchMode.sketchId === sketchFeature.id) continue;
      
      // Show if visible OR if selected/hovered in feature tree
      const isSelected = selectedFeatureId === sketchFeature.id;
      const isHovered = hoveredFeatureId === sketchFeature.id;
      if (!sketchFeature.visible && !isSelected && !isHovered) continue;
      
      const sketchData = sketchFeature.data;
      if (!sketchData || (sketchData.points.length === 0 && sketchData.entities.length === 0)) continue;
      
      renderSketch(sketchData, sketchFeature.plane, 0x888888, 1.0); // Grey, smaller points
    }

    needsRenderRef.current = true;
  }, [sketchMode.active, sketchMode.sketchId, sketchMode.planeId, doc.features, features, sceneReady, selectedFeatureId, hoveredFeatureId, previewLine]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const initialBgColor = theme === 'dark' ? 0x1a1a1a : 0xe8e8e8;
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

    // Group for sketch visualization (rendered in 3D space)
    const sketchGroup = new THREE.Group();
    sketchGroup.name = 'sketch-3d';
    sketchGroup.renderOrder = 1; // Render on top of meshes
    scene.add(sketchGroup);
    sketchGroupRef.current = sketchGroup;

    // Group for datum planes visualization
    const planesGroup = new THREE.Group();
    planesGroup.name = 'datum-planes';
    planesGroup.renderOrder = 0; // Render behind sketches
    scene.add(planesGroup);
    planesGroupRef.current = planesGroup;

    // Group for origin visualization
    const originGroup = new THREE.Group();
    originGroup.name = 'origin';
    originGroup.renderOrder = 0;
    scene.add(originGroup);
    originGroupRef.current = originGroup;

    // Mark scene as ready so mesh/sketch effects can run
    setSceneReady(true);
    console.log('[Viewer] Scene setup complete, sceneReady: true');

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
      
      needsRenderRef.current = true;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent context menu on right click
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
      
      if (hit) {
        const faceId = getFaceIdRef.current(hit.bodyId, hit.faceIndex);
        selectFaceRef.current({
          bodyId: hit.bodyId,
          faceIndex: faceId,
          featureId: hit.featureId,
        }, e.ctrlKey || e.metaKey);
      } else {
        // Clicked empty space - clear selection
        clearSelectionRef.current();
      }
    };
    
    // Hover handler for 3D highlighting
    const onHover = (e: MouseEvent) => {
      // Skip hover if dragging
      if (isDragging) {
        setHoverRef.current(null);
        return;
      }
      
      const hit = raycastRef.current(e.clientX, e.clientY);
      
      if (hit) {
        const faceId = getFaceIdRef.current(hit.bodyId, hit.faceIndex);
        setHoverRef.current({
          type: 'face',
          bodyId: hit.bodyId,
          index: faceId,
          featureId: hit.featureId,
        });
      } else {
        setHoverRef.current(null);
      }
    };

    renderer.domElement.addEventListener('mousedown', onClickStart);
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onHover);
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
        // Store camera direction and distance (position relative to target)
        const offset = cameraRef.current.position.clone().sub(targetRef.current);
        const distance = offset.length();
        const direction = offset.normalize();
        cameraStateRef.current.position.copy(direction);
        cameraStateRef.current.up.copy(cameraRef.current.up);
        cameraStateRef.current.distance = distance;
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
      setSceneReady(false);
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onClickStart);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onHover);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - theme changes are handled by a separate effect

  return <div ref={containerRef} className="viewer-container" />;
};

export default Viewer;
