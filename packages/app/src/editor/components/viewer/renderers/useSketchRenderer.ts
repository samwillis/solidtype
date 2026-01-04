/**
 * useSketchRenderer - Sketch entity and preview shape rendering hook
 *
 * Renders sketch entities (lines, arcs, circles) and preview shapes.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { getPlaneTransform, createToWorldFn, type PlaneTransformData } from "../plane-transform";
import type { SketchFeature, SketchArc, SketchCircle } from "../../../types/document";
import type { SketchDataArrays } from "../sketch-helpers";

/** Preview shapes to render */
export interface PreviewShapes {
  line: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
  circle: { center: { x: number; y: number }; radius: number } | null;
  arc: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    bulge: { x: number; y: number };
  } | null;
  rect: { corner1: { x: number; y: number }; corner2: { x: number; y: number } } | null;
  polygon: { x: number; y: number }[] | null;
}

/** Options for useSketchRenderer */
export interface SketchRendererOptions {
  sketchGroupRef: React.MutableRefObject<THREE.Group | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  sketchMode: {
    active: boolean;
    sketchId: string | null;
    planeId: string | null;
    activeTool: string;
  };
  /** Function to get current sketch data */
  getActiveSketch: () => SketchDataArrays | null;
  /** All document features for rendering non-active sketches */
  features: Array<{ id: string; type: string; visible?: boolean; [key: string]: unknown }>;
  /** Currently selected feature ID */
  selectedFeatureId: string | null;
  /** Currently hovered feature ID */
  hoveredFeatureId: string | null;
  /** Preview shapes to render */
  previewShapes: PreviewShapes;
  /** Sketch plane transforms from kernel */
  sketchPlaneTransforms: Record<string, PlaneTransformData>;
  sceneReady: boolean;
  needsRenderRef: React.MutableRefObject<boolean>;
}

/**
 * Hook to render sketch entities and preview shapes.
 */
export function useSketchRenderer(options: SketchRendererOptions): void {
  const {
    sketchGroupRef,
    rendererRef,
    sketchMode,
    getActiveSketch,
    features,
    selectedFeatureId,
    hoveredFeatureId,
    previewShapes,
    sketchPlaneTransforms,
    sceneReady,
    needsRenderRef,
  } = options;

  useEffect(() => {
    const sketchGroup = sketchGroupRef.current;
    if (!sketchGroup || !sceneReady) {
      return;
    }

    // Clear existing sketch geometry
    while (sketchGroup.children.length > 0) {
      const child = sketchGroup.children[0];
      sketchGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }

    // Get renderer size for LineMaterial resolution
    const renderer = rendererRef.current;
    const rendererSize = renderer ? new THREE.Vector2() : null;
    if (renderer && rendererSize) {
      renderer.getSize(rendererSize);
    }

    // Helper to render a sketch
    const renderSketch = (
      sketchData: SketchDataArrays,
      planeId: string,
      color: number,
      pointSize: number,
      sketchId?: string
    ) => {
      const transform = getPlaneTransform(planeId, sketchId, sketchPlaneTransforms);
      const toWorld = createToWorldFn(transform);

      const pointMap = new Map<string, { x: number; y: number }>();
      for (const point of sketchData.points) {
        pointMap.set(point.id, { x: point.x, y: point.y });
      }

      const createLine2 = (
        positions: number[],
        lineColor: number,
        dashed: boolean = false
      ): Line2 => {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: lineColor,
          linewidth: dashed ? 1.2 : 1.5,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: dashed,
          dashScale: 10,
          dashSize: 2,
          gapSize: 1.5,
        });
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        line.renderOrder = 2;
        return line;
      };

      // Construction geometry color
      const constructionColor = 0xff8800;

      // Draw lines
      for (const entity of sketchData.entities) {
        if (entity.type === "line") {
          const startPoint = pointMap.get(entity.start);
          const endPoint = pointMap.get(entity.end);
          if (startPoint && endPoint) {
            const startWorld = toWorld(startPoint.x, startPoint.y);
            const endWorld = toWorld(endPoint.x, endPoint.y);
            const positions = [
              startWorld.x,
              startWorld.y,
              startWorld.z,
              endWorld.x,
              endWorld.y,
              endWorld.z,
            ];
            const isConstruction = (entity as { construction?: boolean }).construction === true;
            sketchGroup.add(
              createLine2(positions, isConstruction ? constructionColor : color, isConstruction)
            );
          }
        } else if (entity.type === "arc") {
          const arc = entity as SketchArc;
          const startPoint = pointMap.get(arc.start);
          const endPoint = pointMap.get(arc.end);
          const centerPoint = pointMap.get(arc.center);
          if (startPoint && endPoint && centerPoint) {
            const r = Math.hypot(startPoint.x - centerPoint.x, startPoint.y - centerPoint.y);
            const startAngle = Math.atan2(
              startPoint.y - centerPoint.y,
              startPoint.x - centerPoint.x
            );
            const endAngle = Math.atan2(endPoint.y - centerPoint.y, endPoint.x - centerPoint.x);
            const isFullCircle = arc.start === arc.end;
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
              if (arc.ccw) {
                if (sweep <= 0) sweep += Math.PI * 2;
              } else {
                if (sweep >= 0) sweep -= Math.PI * 2;
              }
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
            const isConstruction = (entity as { construction?: boolean }).construction === true;
            sketchGroup.add(
              createLine2(positions, isConstruction ? constructionColor : color, isConstruction)
            );
          }
        } else if (entity.type === "circle") {
          const circle = entity as SketchCircle;
          const centerPoint = pointMap.get(circle.center);
          if (centerPoint && circle.radius > 0) {
            const segments = 64;
            const positions: number[] = [];

            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * Math.PI * 2;
              const worldPos = toWorld(
                centerPoint.x + circle.radius * Math.cos(angle),
                centerPoint.y + circle.radius * Math.sin(angle)
              );
              positions.push(worldPos.x, worldPos.y, worldPos.z);
            }

            const isConstruction = (entity as { construction?: boolean }).construction === true;
            sketchGroup.add(
              createLine2(positions, isConstruction ? constructionColor : color, isConstruction)
            );
          }
        }
      }

      // Draw points
      const pointPositions: number[] = [];
      for (const point of sketchData.points) {
        const worldPos = toWorld(point.x, point.y);
        pointPositions.push(worldPos.x, worldPos.y, worldPos.z);
      }

      if (pointPositions.length > 0) {
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(pointPositions, 3)
        );

        const pointsMaterial = new THREE.PointsMaterial({
          color,
          size: pointSize * 3,
          sizeAttenuation: false,
          depthTest: false,
        });

        const points = new THREE.Points(pointsGeometry, pointsMaterial);
        points.renderOrder = 3;
        sketchGroup.add(points);
      }
    };

    // Render active sketch
    if (sketchMode.active && sketchMode.sketchId && sketchMode.planeId) {
      const sketchData = getActiveSketch();
      if (sketchData) {
        renderSketch(sketchData, sketchMode.planeId, 0x00aaff, 1.5, sketchMode.sketchId);
      }

      // Get transform for preview rendering
      const transform = getPlaneTransform(
        sketchMode.planeId,
        sketchMode.sketchId,
        sketchPlaneTransforms
      );
      const toWorld = createToWorldFn(transform);

      // Render preview line
      if (previewShapes.line && sketchMode.planeId) {
        const startWorld = toWorld(previewShapes.line.start.x, previewShapes.line.start.y);
        const endWorld = toWorld(previewShapes.line.end.x, previewShapes.line.end.y);

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
          color: 0x00ff00,
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
        line.renderOrder = 3;
        sketchGroup.add(line);
      }

      // Render preview circle
      if (previewShapes.circle && sketchMode.planeId && previewShapes.circle.radius > 0.01) {
        const segments = 64;
        const positions: number[] = [];

        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const x = previewShapes.circle.center.x + previewShapes.circle.radius * Math.cos(angle);
          const y = previewShapes.circle.center.y + previewShapes.circle.radius * Math.sin(angle);
          const pt = toWorld(x, y);
          positions.push(pt.x, pt.y, pt.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0x00ff00,
          linewidth: 2,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: true,
          dashScale: 10,
          dashSize: 3,
          gapSize: 3,
        });
        const circle = new Line2(geometry, material);
        circle.computeLineDistances();
        circle.renderOrder = 3;
        sketchGroup.add(circle);
      }

      // Render preview rectangle
      if (previewShapes.rect && sketchMode.planeId) {
        const { corner1, corner2 } = previewShapes.rect;
        const minX = Math.min(corner1.x, corner2.x);
        const minY = Math.min(corner1.y, corner2.y);
        const maxX = Math.max(corner1.x, corner2.x);
        const maxY = Math.max(corner1.y, corner2.y);

        const p1 = toWorld(minX, minY);
        const p2 = toWorld(maxX, minY);
        const p3 = toWorld(maxX, maxY);
        const p4 = toWorld(minX, maxY);

        const positions = [
          p1.x,
          p1.y,
          p1.z,
          p2.x,
          p2.y,
          p2.z,
          p3.x,
          p3.y,
          p3.z,
          p4.x,
          p4.y,
          p4.z,
          p1.x,
          p1.y,
          p1.z,
        ];

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0x00ff00,
          linewidth: 2,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: true,
          dashScale: 10,
          dashSize: 3,
          gapSize: 3,
        });
        const rect = new Line2(geometry, material);
        rect.computeLineDistances();
        rect.renderOrder = 3;
        sketchGroup.add(rect);
      }

      // Render preview polygon
      if (previewShapes.polygon && previewShapes.polygon.length >= 3 && sketchMode.planeId) {
        const positions: number[] = [];
        for (const pt of previewShapes.polygon) {
          const worldPt = toWorld(pt.x, pt.y);
          positions.push(worldPt.x, worldPt.y, worldPt.z);
        }

        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const material = new LineMaterial({
          color: 0x00ff00,
          linewidth: 2,
          resolution: rendererSize || new THREE.Vector2(800, 600),
          depthTest: false,
          dashed: true,
          dashScale: 10,
          dashSize: 3,
          gapSize: 3,
        });
        const polygon = new Line2(geometry, material);
        polygon.computeLineDistances();
        polygon.renderOrder = 3;
        sketchGroup.add(polygon);
      }

      // Render preview arc
      if (previewShapes.arc && sketchMode.planeId) {
        const { start, end, bulge } = previewShapes.arc;

        const ax = start.x,
          ay = start.y;
        const bx = bulge.x,
          by = bulge.y;
        const cx = end.x,
          cy = end.y;

        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

        if (Math.abs(d) > 1e-10) {
          const aSq = ax * ax + ay * ay;
          const bSq = bx * bx + by * by;
          const cSq = cx * cx + cy * cy;

          const centerX = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
          const centerY = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;
          const radius = Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2);

          const startAngle = Math.atan2(ay - centerY, ax - centerX);
          const endAngle = Math.atan2(cy - centerY, cx - centerX);
          const bulgeAngle = Math.atan2(by - centerY, bx - centerX);

          const normalizeAngle = (a: number) => (a + Math.PI * 2) % (Math.PI * 2);
          const startNorm = normalizeAngle(startAngle);
          const endNorm = normalizeAngle(endAngle);
          const bulgeNorm = normalizeAngle(bulgeAngle);

          let ccw: boolean;
          if (startNorm < endNorm) {
            ccw = bulgeNorm > startNorm && bulgeNorm < endNorm;
          } else {
            ccw = bulgeNorm > startNorm || bulgeNorm < endNorm;
          }

          const segments = 32;
          const positions: number[] = [];

          let angleDiff: number;
          if (ccw) {
            angleDiff = endAngle - startAngle;
            if (angleDiff < 0) angleDiff += Math.PI * 2;
          } else {
            angleDiff = endAngle - startAngle;
            if (angleDiff > 0) angleDiff -= Math.PI * 2;
          }

          for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = startAngle + t * angleDiff;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            const pt = toWorld(x, y);
            positions.push(pt.x, pt.y, pt.z);
          }

          if (positions.length >= 6) {
            const geometry = new LineGeometry();
            geometry.setPositions(positions);
            const material = new LineMaterial({
              color: 0x00ff00,
              linewidth: 2,
              resolution: rendererSize || new THREE.Vector2(800, 600),
              depthTest: false,
              dashed: true,
              dashScale: 10,
              dashSize: 3,
              gapSize: 3,
            });
            const arc = new Line2(geometry, material);
            arc.computeLineDistances();
            arc.renderOrder = 3;
            sketchGroup.add(arc);
          }
        } else {
          // Collinear - draw line
          const startWorld = toWorld(start.x, start.y);
          const endWorld = toWorld(end.x, end.y);

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
            color: 0x00ff00,
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
          line.renderOrder = 3;
          sketchGroup.add(line);
        }
      }
    }

    // Render visible (non-active) sketches in grey
    for (const feature of features) {
      if (feature.type !== "sketch") continue;

      const sketchFeature = feature as unknown as SketchFeature;

      // Skip if this is the active sketch
      if (sketchMode.active && sketchMode.sketchId === sketchFeature.id) continue;

      // Show if visible OR if selected/hovered
      const isSelected = selectedFeatureId === sketchFeature.id;
      const isHovered = hoveredFeatureId === sketchFeature.id;
      if (!sketchFeature.visible && !isSelected && !isHovered) continue;

      // Convert data format to arrays
      const sketchData: SketchDataArrays = {
        points: Object.values(sketchFeature.data.pointsById),
        entities: Object.values(sketchFeature.data.entitiesById),
        constraints: Object.values(sketchFeature.data.constraintsById),
      };
      if (sketchData.points.length === 0 && sketchData.entities.length === 0) continue;

      const planeId = sketchFeature.plane.ref;
      renderSketch(sketchData, planeId, 0x888888, 1.0, sketchFeature.id);
    }

    needsRenderRef.current = true;
  }, [
    sketchMode.active,
    sketchMode.sketchId,
    sketchMode.planeId,
    getActiveSketch,
    features,
    sceneReady,
    selectedFeatureId,
    hoveredFeatureId,
    previewShapes,
    sketchPlaneTransforms,
    sketchGroupRef,
    rendererRef,
    needsRenderRef,
  ]);
}
