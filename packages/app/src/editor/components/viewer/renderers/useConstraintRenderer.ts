/**
 * useConstraintRenderer - Constraint labels and dimension lines rendering hook
 *
 * Renders constraint annotations (H, V, C, F) and dimension lines with labels.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { getPlaneTransform, createToWorldFn, type PlaneTransformData } from "../plane-transform";
import type { SketchLine } from "../../../types/document";
import type { SketchDataArrays } from "../sketch-helpers";

/** Constraint with common fields */
interface SketchConstraint {
  id: string;
  type: string;
  value?: number;
  points?: string[];
  lines?: string[];
  point?: string;
  offsetX?: number;
  offsetY?: number;
}

/** Dimension dragging state */
export interface DimensionDraggingState {
  id: string | null;
  currentOffset: { x: number; y: number } | null;
}

/** Options for useConstraintRenderer */
export interface ConstraintRendererOptions {
  constraintLabelsGroupRef: React.MutableRefObject<THREE.Group | null>;
  selectionGroupRef: React.MutableRefObject<THREE.Group | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  sketchMode: {
    active: boolean;
    sketchId: string | null;
    planeId: string | null;
    planeRole: "xy" | "xz" | "yz" | null;
  };
  /** Function to get current sketch data */
  getSketch: () => SketchDataArrays | null;
  /** Selected constraints */
  selectedConstraints: Set<string>;
  /** Toggle constraint selection */
  toggleConstraintSelection: (id: string) => void;
  /** Dimension dragging state */
  draggingState: DimensionDraggingState;
  /** Handler for dimension double-click to edit */
  onDimensionDoubleClick: (
    constraintId: string,
    constraintType: "distance" | "angle",
    element: HTMLElement
  ) => void;
  /** Sketch plane transforms from kernel */
  sketchPlaneTransforms: Record<string, PlaneTransformData>;
  sceneReady: boolean;
  needsRenderRef: React.MutableRefObject<boolean>;
}

/**
 * Hook to render constraint annotations and dimension lines.
 */
export function useConstraintRenderer(options: ConstraintRendererOptions): void {
  const {
    constraintLabelsGroupRef,
    selectionGroupRef,
    rendererRef,
    sketchMode,
    getSketch,
    selectedConstraints,
    toggleConstraintSelection,
    draggingState,
    onDimensionDoubleClick,
    sketchPlaneTransforms,
    sceneReady,
    needsRenderRef,
  } = options;

  // Refs for callbacks - sync with latest values
  /* eslint-disable react-hooks/refs -- intentional pattern to sync ref with latest callback */
  const toggleConstraintSelectionRef = useRef(toggleConstraintSelection);
  toggleConstraintSelectionRef.current = toggleConstraintSelection;
  const onDimensionDoubleClickRef = useRef(onDimensionDoubleClick);
  onDimensionDoubleClickRef.current = onDimensionDoubleClick;
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    const labelsGroup = constraintLabelsGroupRef.current;
    const selectionGroup = selectionGroupRef.current;
    if (!labelsGroup || !selectionGroup || !sceneReady) return;

    // Clear existing labels (but don't clear selectionGroup - that's for sketch selection highlights)
    while (labelsGroup.children.length > 0) {
      const child = labelsGroup.children[0];
      labelsGroup.remove(child);
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

    // Get plane transform (kernel or fallback using planeRole)
    const transform = getPlaneTransform(
      sketchMode.sketchId,
      sketchPlaneTransforms,
      sketchMode.planeRole
    );
    if (!transform) return;

    const toWorld = createToWorldFn(transform);

    // Draw dimension annotations (distance and angle)
    for (const c of sketch.constraints as SketchConstraint[]) {
      if (c.type === "distance") {
        const [ptIdA, ptIdB] = c.points ?? [];
        const pA = sketch.points.find((p) => p.id === ptIdA);
        const pB = sketch.points.find((p) => p.id === ptIdB);
        if (!pA || !pB) continue;

        const midX = (pA.x + pB.x) / 2;
        const midY = (pA.y + pB.y) / 2;
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const perpX = len > 0 ? -dy / len : 0;
        const perpY = len > 0 ? dx / len : 1;

        const storedOffsetX = c.offsetX ?? 0;
        const storedOffsetY = c.offsetY ?? 15;
        const effectiveOffsetX =
          draggingState.id === c.id && draggingState.currentOffset
            ? draggingState.currentOffset.x
            : storedOffsetX;
        const effectiveOffsetY =
          draggingState.id === c.id && draggingState.currentOffset
            ? draggingState.currentOffset.y
            : storedOffsetY;

        const labelX = midX + perpX * effectiveOffsetY + (dx / len || 0) * effectiveOffsetX;
        const labelY = midY + perpY * effectiveOffsetY + (dy / len || 0) * effectiveOffsetX;
        const offset = effectiveOffsetY;

        // Draw extension lines
        const extA = toWorld(pA.x + perpX * offset * 0.7, pA.y + perpY * offset * 0.7);
        const extB = toWorld(pB.x + perpX * offset * 0.7, pB.y + perpY * offset * 0.7);
        const dimA = toWorld(pA.x + perpX * offset, pA.y + perpY * offset);
        const dimB = toWorld(pB.x + perpX * offset, pB.y + perpY * offset);
        const worldA = toWorld(pA.x, pA.y);
        const worldB = toWorld(pB.x, pB.y);

        // Extension line 1
        const extGeom1 = new LineGeometry();
        extGeom1.setPositions([worldA.x, worldA.y, worldA.z, extA.x, extA.y, extA.z]);
        const extMat1 = new LineMaterial({
          color: 0x00aa00,
          linewidth: 1,
          resolution: rendererSize ?? new THREE.Vector2(1, 1),
        });
        const extLine1 = new Line2(extGeom1, extMat1);
        extLine1.computeLineDistances();
        selectionGroup.add(extLine1);

        // Extension line 2
        const extGeom2 = new LineGeometry();
        extGeom2.setPositions([worldB.x, worldB.y, worldB.z, extB.x, extB.y, extB.z]);
        const extMat2 = new LineMaterial({
          color: 0x00aa00,
          linewidth: 1,
          resolution: rendererSize ?? new THREE.Vector2(1, 1),
        });
        const extLine2 = new Line2(extGeom2, extMat2);
        extLine2.computeLineDistances();
        selectionGroup.add(extLine2);

        // Dimension line
        const dimGeom = new LineGeometry();
        dimGeom.setPositions([dimA.x, dimA.y, dimA.z, dimB.x, dimB.y, dimB.z]);
        const dimMat = new LineMaterial({
          color: 0x00aa00,
          linewidth: 2,
          resolution: rendererSize ?? new THREE.Vector2(1, 1),
        });
        const dimLine = new Line2(dimGeom, dimMat);
        dimLine.computeLineDistances();
        selectionGroup.add(dimLine);

        // Create dimension label
        const labelPos = toWorld(labelX, labelY);
        const labelDiv = document.createElement("div");
        labelDiv.className = "dimension-label draggable-dimension";
        labelDiv.textContent = `${c.value?.toFixed(1) ?? "0"}`;
        labelDiv.style.cssText = `
          background: rgba(0, 170, 0, 0.95);
          color: white;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: move;
          user-select: none;
          pointer-events: auto;
        `;
        labelDiv.dataset.constraintId = c.id;
        labelDiv.dataset.constraintType = "distance";
        labelDiv.dataset.storedOffsetX = String(storedOffsetX);
        labelDiv.dataset.storedOffsetY = String(storedOffsetY);
        labelDiv.dataset.worldX = String(labelPos.x);
        labelDiv.dataset.worldY = String(labelPos.y);
        labelDiv.dataset.worldZ = String(labelPos.z);

        labelDiv.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });
        labelDiv.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleConstraintSelectionRef.current(c.id);
        });
        labelDiv.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDimensionDoubleClickRef.current(c.id, "distance", labelDiv);
        });

        if (selectedConstraints.has(c.id)) {
          labelDiv.style.outline = "2px solid #ff6600";
          labelDiv.style.outlineOffset = "2px";
        }

        const labelObject = new CSS2DObject(labelDiv);
        labelObject.position.copy(labelPos);
        labelsGroup.add(labelObject);
      } else if (c.type === "angle") {
        const [lineId1, lineId2] = c.lines ?? [];
        const line1 = sketch.entities.find((e) => e.type === "line" && e.id === lineId1) as
          | SketchLine
          | undefined;
        const line2 = sketch.entities.find((e) => e.type === "line" && e.id === lineId2) as
          | SketchLine
          | undefined;
        if (!line1 || !line2) continue;

        const l1p1 = sketch.points.find((p) => p.id === line1.start);
        const l1p2 = sketch.points.find((p) => p.id === line1.end);
        const l2p1 = sketch.points.find((p) => p.id === line2.start);
        const l2p2 = sketch.points.find((p) => p.id === line2.end);
        if (!l1p1 || !l1p2 || !l2p1 || !l2p2) continue;

        let centerPt: { x: number; y: number } | null = null;
        if (l1p1.id === l2p1.id || l1p1.id === l2p2.id) centerPt = { x: l1p1.x, y: l1p1.y };
        else if (l1p2.id === l2p1.id || l1p2.id === l2p2.id) centerPt = { x: l1p2.x, y: l1p2.y };
        else
          centerPt = {
            x: (l1p1.x + l1p2.x + l2p1.x + l2p2.x) / 4,
            y: (l1p1.y + l1p2.y + l2p1.y + l2p2.y) / 4,
          };

        const baseOffset = 25;
        const dir1x = l1p2.x - l1p1.x;
        const dir1y = l1p2.y - l1p1.y;
        const dir2x = l2p2.x - l2p1.x;
        const dir2y = l2p2.y - l2p1.y;
        const avgDirX = (dir1x + dir2x) / 2;
        const avgDirY = (dir1y + dir2y) / 2;
        const avgLen = Math.sqrt(avgDirX * avgDirX + avgDirY * avgDirY) || 1;

        const storedOffsetX = c.offsetX ?? 0;
        const storedOffsetY = c.offsetY ?? baseOffset;
        const effectiveOffsetX =
          draggingState.id === c.id && draggingState.currentOffset
            ? draggingState.currentOffset.x
            : storedOffsetX;
        const effectiveOffsetY =
          draggingState.id === c.id && draggingState.currentOffset
            ? draggingState.currentOffset.y
            : storedOffsetY;

        const labelX = centerPt.x + (avgDirX / avgLen) * effectiveOffsetY + effectiveOffsetX;
        const labelY = centerPt.y + (avgDirY / avgLen) * effectiveOffsetY;

        const labelPos = toWorld(labelX, labelY);
        const labelDiv = document.createElement("div");
        labelDiv.className = "dimension-label angle-label draggable-dimension";
        labelDiv.textContent = `${c.value?.toFixed(1) ?? "0"}°`;
        labelDiv.style.cssText = `
          background: rgba(170, 85, 0, 0.95);
          color: white;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: move;
          user-select: none;
          pointer-events: auto;
        `;
        labelDiv.dataset.constraintId = c.id;
        labelDiv.dataset.constraintType = "angle";
        labelDiv.dataset.storedOffsetX = String(storedOffsetX);
        labelDiv.dataset.storedOffsetY = String(storedOffsetY);
        labelDiv.dataset.worldX = String(labelPos.x);
        labelDiv.dataset.worldY = String(labelPos.y);
        labelDiv.dataset.worldZ = String(labelPos.z);

        labelDiv.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });
        labelDiv.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleConstraintSelectionRef.current(c.id);
        });
        labelDiv.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDimensionDoubleClickRef.current(c.id, "angle", labelDiv);
        });

        if (selectedConstraints.has(c.id)) {
          labelDiv.style.outline = "2px solid #ff6600";
          labelDiv.style.outlineOffset = "2px";
        }

        const labelObject = new CSS2DObject(labelDiv);
        labelObject.position.copy(labelPos);
        labelsGroup.add(labelObject);
      }
    }

    // Draw constraint annotations (H, V, C, F)
    for (const c of sketch.constraints as SketchConstraint[]) {
      if (c.type === "distance" || c.type === "angle") continue;

      const label =
        c.type === "horizontal"
          ? "H"
          : c.type === "vertical"
            ? "V"
            : c.type === "coincident"
              ? "C"
              : c.type === "fixed"
                ? "F"
                : "?";

      let labelPos: THREE.Vector3 | null = null;

      if (c.type === "fixed") {
        const p = sketch.points.find((pt) => pt.id === c.point);
        if (p) {
          labelPos = toWorld(p.x + 5, p.y + 5);
        }
      } else if (c.type === "coincident" || c.type === "horizontal" || c.type === "vertical") {
        const [a, b] = c.points ?? [];
        const p1 = sketch.points.find((pt) => pt.id === a);
        const p2 = sketch.points.find((pt) => pt.id === b);
        if (p1 && p2 && (c.type === "horizontal" || c.type === "vertical")) {
          labelPos = toWorld((p1.x + p2.x) * 0.5 + 5, (p1.y + p2.y) * 0.5 + 5);
        } else if (p1) {
          labelPos = toWorld(p1.x + 5, p1.y + 5);
        } else if (p2) {
          labelPos = toWorld(p2.x + 5, p2.y + 5);
        }
      }

      if (labelPos) {
        const labelDiv = document.createElement("div");
        labelDiv.className = "constraint-label";
        labelDiv.textContent = label;
        labelDiv.dataset.constraintId = c.id;
        const isSelected = selectedConstraints.has(c.id);
        labelDiv.style.cssText = `
          background: rgba(0, 120, 212, 0.9);
          color: white;
          padding: 2px 5px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          pointer-events: auto;
          ${isSelected ? "outline: 2px solid #ff6600; outline-offset: 2px;" : ""}
        `;

        labelDiv.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleConstraintSelectionRef.current(c.id);
        });

        const labelObject = new CSS2DObject(labelDiv);
        labelObject.position.copy(labelPos);
        labelsGroup.add(labelObject);
      }
    }

    needsRenderRef.current = true;
  }, [
    sketchMode.active,
    sketchMode.sketchId,
    sketchMode.planeId,
    selectedConstraints,
    getSketch,
    sceneReady,
    draggingState,
    sketchPlaneTransforms,
    constraintLabelsGroupRef,
    selectionGroupRef,
    rendererRef,
    needsRenderRef,
  ]);
}
