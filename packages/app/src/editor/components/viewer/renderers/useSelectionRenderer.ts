/**
 * useSelectionRenderer - Selection highlights rendering hook
 *
 * Renders 3D face/edge selection highlights and sketch selection highlights.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { getPlaneTransform, createToWorldFn, type PlaneTransformData } from "../plane-transform";
import type { SketchLine, SketchArc, SketchCircle } from "../../../types/document";
import type { SketchDataArrays } from "../sketch-helpers";
import type { MeshData } from "./useMeshRenderer";

/** Face selection info */
export interface FaceSelection {
  bodyId: string;
  faceIndex: number;
  featureId: string;
}

/** Edge selection info */
export interface EdgeSelection {
  bodyId: string;
  edgeIndex: number;
  featureId: string;
}

/** Hover target */
export interface HoverTarget {
  type: "face" | "edge";
  bodyId: string;
  index: number;
  featureId: string;
}

/** Options for useSelectionRenderer */
export interface SelectionRendererOptions {
  faceHighlightGroupRef: React.MutableRefObject<THREE.Group | null>;
  selectionGroupRef: React.MutableRefObject<THREE.Group | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  meshes: Map<string, MeshData>;
  selectedFaces: FaceSelection[];
  selectedEdges: EdgeSelection[];
  hover: HoverTarget | null;
  /** Sketch mode for sketch selection rendering */
  sketchMode: {
    active: boolean;
    sketchId: string | null;
    planeId: string | null;
  };
  /** Current sketch data */
  getSketch: () => SketchDataArrays | null;
  /** Selected points in sketch */
  selectedPoints: Set<string>;
  /** Selected lines in sketch */
  selectedLines: Set<string>;
  /** Sketch plane transforms from kernel */
  sketchPlaneTransforms: Record<string, PlaneTransformData>;
  sceneReady: boolean;
  needsRenderRef: React.MutableRefObject<boolean>;
}

/**
 * Hook to render selection highlights for 3D faces/edges and sketch entities.
 */
export function useSelectionRenderer(options: SelectionRendererOptions): void {
  const {
    faceHighlightGroupRef,
    selectionGroupRef,
    rendererRef,
    containerRef,
    meshes,
    selectedFaces,
    selectedEdges,
    hover,
    sketchMode,
    getSketch,
    selectedPoints,
    selectedLines,
    sketchPlaneTransforms,
    sceneReady,
    needsRenderRef,
  } = options;

  // 3D face/edge highlights
  useEffect(() => {
    const faceHighlightGroup = faceHighlightGroupRef.current;
    if (!faceHighlightGroup || !sceneReady) return;

    // Clear existing highlights
    while (faceHighlightGroup.children.length > 0) {
      const child = faceHighlightGroup.children[0];
      faceHighlightGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Helper to extract triangles for a specific face
    const extractFaceTriangles = (
      meshData: MeshData,
      targetFaceIndex: number
    ): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } | null => {
      if (!meshData.faceMap) return null;

      const triangleIndices: number[] = [];
      for (let i = 0; i < meshData.faceMap.length; i++) {
        if (meshData.faceMap[i] === targetFaceIndex) {
          triangleIndices.push(i);
        }
      }

      if (triangleIndices.length === 0) return null;

      const vertexMap = new Map<number, number>();
      const newPositions: number[] = [];
      const newNormals: number[] = [];
      const newIndices: number[] = [];

      for (const triIdx of triangleIndices) {
        const i0 = meshData.indices[triIdx * 3];
        const i1 = meshData.indices[triIdx * 3 + 1];
        const i2 = meshData.indices[triIdx * 3 + 2];

        for (const originalIdx of [i0, i1, i2]) {
          if (!vertexMap.has(originalIdx)) {
            const newIdx = newPositions.length / 3;
            vertexMap.set(originalIdx, newIdx);
            newPositions.push(
              meshData.positions[originalIdx * 3],
              meshData.positions[originalIdx * 3 + 1],
              meshData.positions[originalIdx * 3 + 2]
            );
            newNormals.push(
              meshData.normals[originalIdx * 3],
              meshData.normals[originalIdx * 3 + 1],
              meshData.normals[originalIdx * 3 + 2]
            );
          }
          newIndices.push(vertexMap.get(originalIdx)!);
        }
      }

      return {
        positions: new Float32Array(newPositions),
        normals: new Float32Array(newNormals),
        indices: new Uint32Array(newIndices),
      };
    };

    // Helper to extract edge segments
    const extractEdgeSegments = (
      meshData: MeshData,
      targetEdgeIndex: number
    ): Float32Array | null => {
      if (!meshData.edges || !meshData.edgeMap) return null;

      const segments: number[] = [];
      for (let i = 0; i < meshData.edgeMap.length; i++) {
        if (meshData.edgeMap[i] === targetEdgeIndex) {
          segments.push(
            meshData.edges[i * 6 + 0],
            meshData.edges[i * 6 + 1],
            meshData.edges[i * 6 + 2],
            meshData.edges[i * 6 + 3],
            meshData.edges[i * 6 + 4],
            meshData.edges[i * 6 + 5]
          );
        }
      }

      if (segments.length === 0) return null;
      return new Float32Array(segments);
    };

    // Render hover highlight for faces
    if (hover && hover.type === "face") {
      const meshData = meshes.get(hover.bodyId);
      if (meshData) {
        const faceGeom = extractFaceTriangles(meshData, hover.index);
        if (faceGeom) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(faceGeom.positions, 3));
          geometry.setAttribute("normal", new THREE.BufferAttribute(faceGeom.normals, 3));
          geometry.setIndex(new THREE.BufferAttribute(faceGeom.indices, 1));

          const material = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
          });

          const highlightMesh = new THREE.Mesh(geometry, material);
          highlightMesh.name = `hover-face-${hover.bodyId}-${hover.index}`;
          highlightMesh.renderOrder = 100;
          faceHighlightGroup.add(highlightMesh);
        }
      }
    }

    // Render selected faces
    for (const selected of selectedFaces) {
      const isHovered =
        hover &&
        hover.type === "face" &&
        hover.bodyId === selected.bodyId &&
        hover.index === selected.faceIndex;

      const meshData = meshes.get(selected.bodyId);
      if (meshData) {
        const faceGeom = extractFaceTriangles(meshData, selected.faceIndex);
        if (faceGeom) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(faceGeom.positions, 3));
          geometry.setAttribute("normal", new THREE.BufferAttribute(faceGeom.normals, 3));
          geometry.setIndex(new THREE.BufferAttribute(faceGeom.indices, 1));

          const material = new THREE.MeshBasicMaterial({
            color: isHovered ? 0x00ffaa : 0x4488ff,
            transparent: true,
            opacity: isHovered ? 0.5 : 0.4,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
          });

          const highlightMesh = new THREE.Mesh(geometry, material);
          highlightMesh.name = `selected-face-${selected.bodyId}-${selected.faceIndex}`;
          highlightMesh.renderOrder = 100;
          faceHighlightGroup.add(highlightMesh);
        }
      }
    }

    // Render hover highlight for edges
    if (hover && hover.type === "edge" && containerRef.current) {
      const meshData = meshes.get(hover.bodyId);
      if (meshData) {
        const edgePositions = extractEdgeSegments(meshData, hover.index);
        if (edgePositions) {
          const lineGeometry = new LineSegmentsGeometry();
          lineGeometry.setPositions(edgePositions);

          const edgeMaterial = new LineMaterial({
            color: 0x00ff88,
            linewidth: 6.0,
            resolution: new THREE.Vector2(
              containerRef.current.clientWidth,
              containerRef.current.clientHeight
            ),
          });

          const highlightLine = new LineSegments2(lineGeometry, edgeMaterial);
          highlightLine.computeLineDistances();
          highlightLine.name = `hover-edge-${hover.bodyId}-${hover.index}`;
          highlightLine.renderOrder = 101;
          faceHighlightGroup.add(highlightLine);
        }
      }
    }

    // Render selected edges
    for (const selected of selectedEdges) {
      const isHovered =
        hover &&
        hover.type === "edge" &&
        hover.bodyId === selected.bodyId &&
        hover.index === selected.edgeIndex;
      if (isHovered) continue;

      const meshData = meshes.get(selected.bodyId);
      if (meshData && containerRef.current) {
        const edgePositions = extractEdgeSegments(meshData, selected.edgeIndex);
        if (edgePositions) {
          const lineGeometry = new LineSegmentsGeometry();
          lineGeometry.setPositions(edgePositions);

          const edgeMaterial = new LineMaterial({
            color: 0x4488ff,
            linewidth: 6.0,
            resolution: new THREE.Vector2(
              containerRef.current.clientWidth,
              containerRef.current.clientHeight
            ),
          });

          const highlightLine = new LineSegments2(lineGeometry, edgeMaterial);
          highlightLine.computeLineDistances();
          highlightLine.name = `selected-edge-${selected.bodyId}-${selected.edgeIndex}`;
          highlightLine.renderOrder = 101;
          faceHighlightGroup.add(highlightLine);
        }
      }
    }

    needsRenderRef.current = true;
  }, [
    meshes,
    selectedFaces,
    selectedEdges,
    hover,
    sceneReady,
    faceHighlightGroupRef,
    containerRef,
    needsRenderRef,
  ]);

  // Sketch selection highlights
  useEffect(() => {
    const selectionGroup = selectionGroupRef.current;
    if (!selectionGroup || !sceneReady) return;

    // Clear existing selection geometry
    while (selectionGroup.children.length > 0) {
      const child = selectionGroup.children[0];
      selectionGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Only render when actively editing a sketch
    if (!sketchMode.active || !sketchMode.sketchId || !sketchMode.planeId) return;

    const sketch = getSketch();
    if (!sketch) return;

    // Get renderer size
    const renderer = rendererRef.current;
    const rendererSize = renderer ? new THREE.Vector2() : null;
    if (renderer && rendererSize) {
      renderer.getSize(rendererSize);
    }

    // Get plane transform
    const transform = getPlaneTransform(
      sketchMode.planeId,
      sketchMode.sketchId,
      sketchPlaneTransforms
    );
    const toWorld = createToWorldFn(transform);

    // Draw selection highlights for selected entities
    for (const entity of sketch.entities) {
      if (!selectedLines.has(entity.id)) continue;

      if (entity.type === "line") {
        const line = entity as SketchLine;
        const startPoint = sketch.points.find((p) => p.id === line.start);
        const endPoint = sketch.points.find((p) => p.id === line.end);
        if (!startPoint || !endPoint) continue;

        const startWorld = toWorld(startPoint.x, startPoint.y);
        const endWorld = toWorld(endPoint.x, endPoint.y);

        const geometry = new LineGeometry();
        geometry.setPositions([
          startWorld.x,
          startWorld.y,
          startWorld.z,
          endWorld.x,
          endWorld.y,
          endWorld.z,
        ]);
        const material = new LineMaterial({
          color: 0xffff00,
          linewidth: 6,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          transparent: true,
          opacity: 0.6,
        });
        const selLine = new Line2(geometry, material);
        selLine.computeLineDistances();
        selLine.renderOrder = 1;
        selectionGroup.add(selLine);
      } else if (entity.type === "arc") {
        const arc = entity as SketchArc;
        const startPoint = sketch.points.find((p) => p.id === arc.start);
        const endPoint = sketch.points.find((p) => p.id === arc.end);
        const centerPoint = sketch.points.find((p) => p.id === arc.center);
        if (!startPoint || !endPoint || !centerPoint) continue;

        const radius = Math.hypot(startPoint.x - centerPoint.x, startPoint.y - centerPoint.y);
        const startAngle = Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
        const endAngle = Math.atan2(endPoint.y - centerPoint.y, endPoint.x - centerPoint.x);

        let sweep = endAngle - startAngle;
        if (arc.ccw) {
          if (sweep <= 0) sweep += Math.PI * 2;
        } else {
          if (sweep >= 0) sweep -= Math.PI * 2;
        }

        const segments = 32;
        const positions: number[] = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = startAngle + t * sweep;
          const worldPos = toWorld(
            centerPoint.x + radius * Math.cos(angle),
            centerPoint.y + radius * Math.sin(angle)
          );
          positions.push(worldPos.x, worldPos.y, worldPos.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0xffff00,
          linewidth: 6,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          transparent: true,
          opacity: 0.6,
        });
        const selArc = new Line2(geometry, material);
        selArc.computeLineDistances();
        selArc.renderOrder = 1;
        selectionGroup.add(selArc);
      } else if (entity.type === "circle") {
        const circle = entity as SketchCircle;
        const centerPoint = sketch.points.find((p) => p.id === circle.center);
        if (!centerPoint) continue;

        const radius = circle.radius;
        const segments = 64;
        const positions: number[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const worldPos = toWorld(
            centerPoint.x + radius * Math.cos(angle),
            centerPoint.y + radius * Math.sin(angle)
          );
          positions.push(worldPos.x, worldPos.y, worldPos.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0xffff00,
          linewidth: 6,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          transparent: true,
          opacity: 0.6,
        });
        const selCircle = new Line2(geometry, material);
        selCircle.computeLineDistances();
        selCircle.renderOrder = 1;
        selectionGroup.add(selCircle);
      }
    }

    // Draw selection highlights for selected points
    for (const point of sketch.points) {
      if (!selectedPoints.has(point.id)) continue;

      const worldPos = toWorld(point.x, point.y);

      const ringGeometry = new THREE.RingGeometry(3, 5, 16);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(worldPos);
      ring.renderOrder = 4;

      // Orient ring to sketch plane normal
      const { xDir, yDir } = transform;
      const planeNormal = new THREE.Vector3().crossVectors(xDir, yDir).normalize();
      ring.lookAt(worldPos.clone().add(planeNormal));

      selectionGroup.add(ring);
    }

    needsRenderRef.current = true;
  }, [
    sketchMode.active,
    sketchMode.sketchId,
    sketchMode.planeId,
    selectedPoints,
    selectedLines,
    getSketch,
    sceneReady,
    sketchPlaneTransforms,
    selectionGroupRef,
    rendererRef,
    needsRenderRef,
  ]);
}
