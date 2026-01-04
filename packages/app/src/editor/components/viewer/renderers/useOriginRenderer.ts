/**
 * useOriginRenderer - Origin axes rendering hook
 *
 * Renders the origin XYZ axes and center sphere.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { getOriginStyle, type FeatureDisplayState } from "../viewer-utils";
import type { OriginFeature } from "../../../types/document";

/** Options for useOriginRenderer */
export interface OriginRendererOptions {
  originGroupRef: React.MutableRefObject<THREE.Group | null>;
  /** Document features to render origin from */
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
 * Hook to render the origin axes.
 */
export function useOriginRenderer(options: OriginRendererOptions): void {
  const {
    originGroupRef,
    features,
    featureStatus,
    selectedFeatureId,
    hoveredFeatureId,
    sceneReady,
    needsRenderRef,
  } = options;

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
    for (const feature of features) {
      if (feature.type !== "origin") continue;

      const originFeature = feature as unknown as OriginFeature;

      // Skip features that are gated
      const status = featureStatus[originFeature.id];
      if (status === "gated") continue;

      // Show if visible OR if selected/hovered
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

      // Draw origin axes
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
  }, [
    features,
    sceneReady,
    selectedFeatureId,
    hoveredFeatureId,
    featureStatus,
    originGroupRef,
    needsRenderRef,
  ]);
}
