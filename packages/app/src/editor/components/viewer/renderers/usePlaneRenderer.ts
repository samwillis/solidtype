/**
 * usePlaneRenderer - Datum planes rendering hook
 *
 * Renders datum planes with fill, border, and grid.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import {
  getDefaultPlaneColor,
  parseHexColor,
  getPlaneOpacity,
  calculateGridSize,
  getPlaneLineWidth,
  type FeatureDisplayState,
} from "../viewer-utils";
import type { PlaneFeature } from "../../../types/document";

/** Options for usePlaneRenderer */
export interface PlaneRendererOptions {
  planesGroupRef: React.MutableRefObject<THREE.Group | null>;
  /** Document features to render planes from */
  features: Array<{ id: string; type: string; visible?: boolean; [key: string]: unknown }>;
  /** Feature status map (for gated features) */
  featureStatus: Record<string, string>;
  /** Currently selected feature ID */
  selectedFeatureId: string | null;
  /** Currently hovered feature ID */
  hoveredFeatureId: string | null;
  sceneReady: boolean;
  needsRenderRef: React.MutableRefObject<boolean>;
}

/**
 * Hook to render datum planes.
 */
export function usePlaneRenderer(options: PlaneRendererOptions): void {
  const {
    planesGroupRef,
    features,
    featureStatus,
    selectedFeatureId,
    hoveredFeatureId,
    sceneReady,
    needsRenderRef,
  } = options;

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

    // Render plane features
    for (const feature of features) {
      if (feature.type !== "plane") continue;

      const planeFeature = feature as unknown as PlaneFeature;

      // Skip planes that are gated
      const status = featureStatus[planeFeature.id];
      if (status === "gated") continue;

      // Check visibility
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

      // Get plane color
      const defaultColor = getDefaultPlaneColor(planeFeature.id);
      const planeColor = parseHexColor(planeFeature.color, defaultColor);

      // Get plane properties
      const normal = new THREE.Vector3(...planeFeature.normal);
      const origin = new THREE.Vector3(...planeFeature.origin);
      const xDir = new THREE.Vector3(...planeFeature.xDir);
      const yDir = new THREE.Vector3().crossVectors(normal, xDir).normalize();

      const width = planeFeature.width ?? 100;
      const height = planeFeature.height ?? 100;
      const offsetX = planeFeature.displayOffsetX ?? 0;
      const offsetY = planeFeature.displayOffsetY ?? 0;

      // Apply offset
      const center = origin
        .clone()
        .add(xDir.clone().multiplyScalar(offsetX))
        .add(yDir.clone().multiplyScalar(offsetY));

      // Create plane geometry
      const planeGeometry = new THREE.PlaneGeometry(width, height);

      // Create transparent plane material
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

      // Add plane border
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
        0,
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

      border.position.copy(center);
      border.quaternion.copy(quaternion);

      planesGroup.add(border);

      // Add grid lines
      const gridSize = calculateGridSize(width, height);
      const gridPositions: number[] = [];

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

        grid.position.copy(center);
        grid.quaternion.copy(quaternion);

        planesGroup.add(grid);
      }
    }

    needsRenderRef.current = true;
  }, [
    features,
    sceneReady,
    selectedFeatureId,
    hoveredFeatureId,
    featureStatus,
    planesGroupRef,
    needsRenderRef,
  ]);
}
