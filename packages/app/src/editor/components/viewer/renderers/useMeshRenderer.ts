/**
 * useMeshRenderer - Mesh and edge line rendering hook
 *
 * Updates the mesh group when kernel mesh data changes.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { parseHexColor } from "../viewer-utils";

/** Mesh data from kernel */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  faceMap?: Uint32Array;
  edges?: Float32Array;
  edgeMap?: Uint32Array;
}

/** Body info from kernel */
export interface BodyInfo {
  featureId: string;
  color?: string;
}

/** Feature for visibility check */
export interface Feature {
  id: string;
  visible?: boolean;
}

/** Options for useMeshRenderer */
export interface MeshRendererOptions {
  meshGroupRef: React.MutableRefObject<THREE.Group | null>;
  edgeGroupRef: React.MutableRefObject<THREE.Group | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  meshes: Map<string, MeshData>;
  bodies: BodyInfo[];
  features: Feature[];
  theme: "light" | "dark";
  sceneReady: boolean;
  needsRenderRef: React.MutableRefObject<boolean>;
}

/**
 * Hook to render meshes and edge lines from kernel data.
 */
export function useMeshRenderer(options: MeshRendererOptions): void {
  const {
    meshGroupRef,
    edgeGroupRef,
    containerRef,
    meshes,
    bodies,
    features,
    theme,
    sceneReady,
    needsRenderRef,
  } = options;

  useEffect(() => {
    const meshGroup = meshGroupRef.current;
    const edgeGroup = edgeGroupRef.current;
    if (!meshGroup || !edgeGroup) {
      return;
    }

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

    // Clear existing edge lines
    while (edgeGroup.children.length > 0) {
      const child = edgeGroup.children[0];
      edgeGroup.remove(child);
      if (child instanceof LineSegments2) {
        child.geometry.dispose();
        if (child.material instanceof LineMaterial) {
          child.material.dispose();
        }
      }
    }

    // Add new meshes
    meshes.forEach((meshData, bodyId) => {
      // Check if the feature is hidden
      const feature = features.find((f) => f.id === bodyId);
      if (feature && feature.visible === false) {
        return;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

      const isPreview = bodyId.startsWith("__preview");
      const isCutPreview = bodyId.includes("cut");

      // Get body color from bodies list if available
      const bodyInfo = bodies.find((b) => b.featureId === bodyId);
      const bodyColor = parseHexColor(bodyInfo?.color, 0x3b82f6);

      // Enhanced CAD-style material
      const material = new THREE.MeshStandardMaterial({
        color: isPreview ? (isCutPreview ? 0xff4444 : 0x60a5fa) : bodyColor,
        side: THREE.DoubleSide,
        transparent: isPreview,
        opacity: isPreview ? 0.5 : 1,
        depthWrite: !isPreview,
        metalness: 0.1,
        roughness: 0.4,
        envMapIntensity: 0.5,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = bodyId;
      meshGroup.add(mesh);

      // Add CAD-style edge lines from B-Rep edges
      if (!isPreview && containerRef.current && meshData.edges && meshData.edges.length > 0) {
        const lineGeometry = new LineSegmentsGeometry();
        lineGeometry.setPositions(meshData.edges);

        const edgeColor = theme === "dark" ? 0x000000 : 0x1a1a1a;
        const edgeMaterial = new LineMaterial({
          color: edgeColor,
          linewidth: 2.0,
          resolution: new THREE.Vector2(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight
          ),
          dashed: false,
        });

        const edgeLines = new LineSegments2(lineGeometry, edgeMaterial);
        edgeLines.computeLineDistances();
        edgeLines.name = `edges-${bodyId}`;
        edgeLines.userData = {
          bodyId,
          featureId: bodyId,
          edgePositions: meshData.edges,
          edgeMap: meshData.edgeMap,
        };
        edgeGroup.add(edgeLines);
      }
    });

    needsRenderRef.current = true;
  }, [
    meshes,
    bodies,
    sceneReady,
    features,
    theme,
    meshGroupRef,
    edgeGroupRef,
    containerRef,
    needsRenderRef,
  ]);
}
