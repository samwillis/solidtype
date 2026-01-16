/**
 * useSketchTools - Sketch tool state and mouse handlers hook
 *
 * Manages all sketch tool state (temp points, previews, snap targets, etc.)
 * and handles mouse interactions for sketch editing.
 */

import { useState, useEffect, useRef } from "react";
import {
  useKeyboardShortcut,
  ShortcutPriority,
} from "../../../contexts/KeyboardShortcutContext";
import {
  POINT_MERGE_TOLERANCE_MM,
  isNearHorizontal,
  isNearVertical,
  calculateCircumcircleCenter,
} from "../viewer-utils";
import {
  shouldArcBeCCW,
  shouldCenterpointArcBeCCW,
  findNearbyLineInSketch,
  findNearestEntityInSketch,
  lineIntersectsBox,
  type SketchDataArrays,
} from "../sketch-helpers";
import type { SketchArc, SketchCircle } from "../../../types/document";

/** Point with optional ID for existing points */
export interface SketchPoint {
  x: number;
  y: number;
  id?: string;
}

/** Preview shapes for rendering */
export interface PreviewShapes {
  line: { start: SketchPoint; end: SketchPoint } | null;
  circle: { center: SketchPoint; radius: number } | null;
  arc: { start: SketchPoint; end: SketchPoint; bulge: SketchPoint } | null;
  rect: { corner1: SketchPoint; corner2: SketchPoint } | null;
  polygon: SketchPoint[] | null;
}

/** Snap target for visual indicator */
export interface SnapTarget {
  x: number;
  y: number;
  type: "point" | "endpoint" | "midpoint";
}

/** Entity being dragged */
export interface DraggingEntity {
  type: "point" | "line";
  id: string;
  originalPositions?: { startX: number; startY: number; endX: number; endY: number };
  linePointIds?: { startId: string; endId: string };
  startPos: { x: number; y: number };
}

/** Box selection state */
export interface BoxSelection {
  start: { x: number; y: number };
  current: { x: number; y: number };
  mode: "window" | "crossing";
}

/** Tangent source for tangent arc */
export interface TangentSource {
  lineId: string;
  pointId: string;
  direction: { x: number; y: number };
  point: { x: number; y: number };
}

/** Options for useSketchTools */
export interface SketchToolsOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current sketch mode from context */
  sketchMode: {
    active: boolean;
    sketchId: string | null;
    planeId: string | null;
    activeTool: string;
  };
  /** Function to convert screen coords to sketch coords */
  screenToSketch: (
    screenX: number,
    screenY: number,
    planeId: string
  ) => { x: number; y: number } | null;
  /** Function to snap to grid */
  snapToGrid: (x: number, y: number) => { x: number; y: number };
  /** Function to get current sketch data */
  getSketch: () => SketchDataArrays | null;
  /** Function to find nearby point */
  findNearbyPoint: (
    x: number,
    y: number,
    tolerance: number
  ) => { x: number; y: number; id: string | null } | null;
  /** Sketch context functions */
  addPoint: (x: number, y: number) => string | null;
  addLine: (startId: string, endId: string) => string | null;
  addArc: (startId: string, endId: string, centerId: string, ccw: boolean) => string | null;
  addCircle: (centerId: string, radius: number) => string | null;
  addRectangle: (minX: number, minY: number, maxX: number, maxY: number) => void;
  addAngledRectangle: (c1: SketchPoint, c2: SketchPoint, c3: SketchPoint, c4: SketchPoint) => void;
  addConstraint: (constraint: { type: string; [key: string]: unknown }) => void;
  updatePointPosition: (id: string, x: number, y: number) => void;
  /** Selection functions */
  setSelectedPoints: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedLines: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedConstraints: React.Dispatch<React.SetStateAction<Set<string>>>;
  clearSketchSelection: () => void;
  /** Delete selected sketch items */
  deleteSelectedItems: () => void;
  /** Viewer state */
  autoConstraints: boolean;
  /** Callback to set mouse position in context */
  setSketchMousePos: (pos: { x: number; y: number } | null) => void;
  /** Callback to set preview line in context */
  setPreviewLine: (line: { start: SketchPoint; end: SketchPoint } | null) => void;
  /** Whether the scene is ready (used to trigger effect re-run) */
  sceneReady: boolean;
}

/** Result of useSketchTools */
export interface SketchToolsResult {
  sketchPos: { x: number; y: number } | null;
  previewShapes: PreviewShapes;
  snapTarget: SnapTarget | null;
  boxSelection: BoxSelection | null;
  draggingEntity: DraggingEntity | null;
  hoveredDraggable: { type: "point" | "line"; id: string } | null;
}

/**
 * Hook to manage sketch tool state and mouse handlers.
 */
export function useSketchTools(options: SketchToolsOptions): SketchToolsResult {
  const {
    containerRef,
    sketchMode,
    screenToSketch,
    snapToGrid,
    getSketch,
    findNearbyPoint,
    addPoint,
    addLine,
    addArc,
    addCircle,
    addRectangle,
    addAngledRectangle,
    addConstraint,
    updatePointPosition,
    setSelectedPoints,
    setSelectedLines,
    setSelectedConstraints,
    clearSketchSelection,
    deleteSelectedItems,
    autoConstraints,
    setSketchMousePos,
    setPreviewLine,
    sceneReady,
  } = options;

  // Tool state
  const [tempStartPoint, setTempStartPoint] = useState<SketchPoint | null>(null);
  const [tempSecondPoint, setTempSecondPoint] = useState<SketchPoint | null>(null);
  const [chainLastEndpoint, setChainLastEndpoint] = useState<(SketchPoint & { id: string }) | null>(
    null
  );
  const [arcStartPoint, setArcStartPoint] = useState<SketchPoint | null>(null);
  const [arcEndPoint, setArcEndPoint] = useState<SketchPoint | null>(null);
  const [arcCenterPoint, setArcCenterPoint] = useState<SketchPoint | null>(null);
  const [tangentSource, setTangentSource] = useState<TangentSource | null>(null);
  const [circleCenterPoint, setCircleCenterPoint] = useState<SketchPoint | null>(null);
  const [sketchPos, setSketchPos] = useState<{ x: number; y: number } | null>(null);

  // Preview shapes
  const [previewCircle, setPreviewCircle] = useState<{
    center: SketchPoint;
    radius: number;
  } | null>(null);
  const [previewArc, setPreviewArc] = useState<{
    start: SketchPoint;
    end: SketchPoint;
    bulge: SketchPoint;
  } | null>(null);
  const [previewRect, setPreviewRect] = useState<{
    corner1: SketchPoint;
    corner2: SketchPoint;
  } | null>(null);
  const [previewPolygon, setPreviewPolygon] = useState<SketchPoint[] | null>(null);

  // Snap and drag state
  const [snapTarget, setSnapTarget] = useState<SnapTarget | null>(null);
  const [draggingEntity, setDraggingEntity] = useState<DraggingEntity | null>(null);
  const [hoveredDraggable, setHoveredDraggable] = useState<{
    type: "point" | "line";
    id: string;
  } | null>(null);
  const [boxSelection, setBoxSelection] = useState<BoxSelection | null>(null);

  // Mouse tracking refs
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingViewRef = useRef(false);
  const DRAG_THRESHOLD = 5;

  // Clear tool state when mode/tool changes
  /* eslint-disable react-hooks/set-state-in-effect -- reset state on mode change */
  useEffect(() => {
    setTempStartPoint(null);
    setTempSecondPoint(null);
    setChainLastEndpoint(null);
    setArcStartPoint(null);
    setArcEndPoint(null);
    setArcCenterPoint(null);
    setTangentSource(null);
    setCircleCenterPoint(null);
    setPreviewCircle(null);
    setPreviewArc(null);
    setPreviewRect(null);
    setPreviewPolygon(null);
    setBoxSelection(null);
  }, [sketchMode.active, sketchMode.sketchId, sketchMode.activeTool]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Update preview shapes based on current state
  /* eslint-disable react-hooks/set-state-in-effect -- clear previews on mode/position change */
  useEffect(() => {
    if (!sketchMode.active || !sketchPos) {
      setPreviewLine(null);
      setPreviewCircle(null);
      setPreviewArc(null);
      setPreviewRect(null);
      setPreviewPolygon(null);
      return;
    }

    // Reset all
    setPreviewLine(null);
    setPreviewCircle(null);
    setPreviewArc(null);
    setPreviewRect(null);
    setPreviewPolygon(null);

    if (sketchMode.activeTool === "line") {
      const startPt = chainLastEndpoint || tempStartPoint;
      if (startPt) {
        setPreviewLine({
          start: { x: startPt.x, y: startPt.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      }
    } else if (sketchMode.activeTool === "rectangle" && tempStartPoint) {
      setPreviewRect({
        corner1: { x: tempStartPoint.x, y: tempStartPoint.y },
        corner2: { x: sketchPos.x, y: sketchPos.y },
      });
    } else if (sketchMode.activeTool === "rectangleCenter" && tempStartPoint) {
      const cx = tempStartPoint.x;
      const cy = tempStartPoint.y;
      const halfW = Math.abs(sketchPos.x - cx);
      const halfH = Math.abs(sketchPos.y - cy);
      setPreviewRect({
        corner1: { x: cx - halfW, y: cy - halfH },
        corner2: { x: cx + halfW, y: cy + halfH },
      });
    } else if (sketchMode.activeTool === "rectangle3Point") {
      if (tempStartPoint && !tempSecondPoint) {
        setPreviewLine({
          start: { x: tempStartPoint.x, y: tempStartPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (tempStartPoint && tempSecondPoint) {
        const edgeX = tempSecondPoint.x - tempStartPoint.x;
        const edgeY = tempSecondPoint.y - tempStartPoint.y;
        const edgeLen = Math.hypot(edgeX, edgeY);
        if (edgeLen > 0.01) {
          const ux = edgeX / edgeLen;
          const uy = edgeY / edgeLen;
          const px = -uy;
          const py = ux;
          const toCursorX = sketchPos.x - tempStartPoint.x;
          const toCursorY = sketchPos.y - tempStartPoint.y;
          const width = toCursorX * px + toCursorY * py;

          const c1 = { x: tempStartPoint.x, y: tempStartPoint.y };
          const c2 = { x: tempSecondPoint.x, y: tempSecondPoint.y };
          const c3 = { x: tempSecondPoint.x + width * px, y: tempSecondPoint.y + width * py };
          const c4 = { x: tempStartPoint.x + width * px, y: tempStartPoint.y + width * py };

          setPreviewPolygon([c1, c2, c3, c4, c1]);
        }
      }
    } else if (sketchMode.activeTool === "circle" && circleCenterPoint) {
      const dx = sketchPos.x - circleCenterPoint.x;
      const dy = sketchPos.y - circleCenterPoint.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      setPreviewCircle({
        center: { x: circleCenterPoint.x, y: circleCenterPoint.y },
        radius,
      });
    } else if (sketchMode.activeTool === "arc") {
      if (arcStartPoint && !arcEndPoint) {
        setPreviewLine({
          start: { x: arcStartPoint.x, y: arcStartPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (arcStartPoint && arcEndPoint) {
        setPreviewArc({
          start: arcStartPoint,
          end: arcEndPoint,
          bulge: sketchPos,
        });
      }
    } else if (sketchMode.activeTool === "arcCenterpoint") {
      if (arcCenterPoint && !arcStartPoint) {
        setPreviewLine({
          start: { x: arcCenterPoint.x, y: arcCenterPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (arcCenterPoint && arcStartPoint) {
        setPreviewArc({
          start: arcStartPoint,
          end: sketchPos,
          bulge: arcCenterPoint,
        });
      }
    } else if (sketchMode.activeTool === "arcTangent" && tangentSource) {
      const P = tangentSource.point;
      const E = sketchPos;
      const T = tangentSource.direction;

      const N = { x: -T.y, y: T.x };
      const M = { x: (P.x + E.x) / 2, y: (P.y + E.y) / 2 };
      const PE = { x: E.x - P.x, y: E.y - P.y };
      const PElen = Math.hypot(PE.x, PE.y);

      if (PElen > 0.01) {
        const perpPE = { x: -PE.y / PElen, y: PE.x / PElen };
        const det = N.x * -perpPE.y - N.y * -perpPE.x;

        if (Math.abs(det) > 1e-10) {
          const dx = M.x - P.x;
          const dy = M.y - P.y;
          const s = (dx * -perpPE.y - dy * -perpPE.x) / det;
          const center = { x: P.x + s * N.x, y: P.y + s * N.y };

          setPreviewArc({
            start: P,
            end: E,
            bulge: center,
          });
        }
      }
    } else if (sketchMode.activeTool === "circle3Point") {
      if (arcStartPoint && !arcEndPoint) {
        setPreviewLine({
          start: { x: arcStartPoint.x, y: arcStartPoint.y },
          end: { x: sketchPos.x, y: sketchPos.y },
        });
      } else if (arcStartPoint && arcEndPoint) {
        const circleInfo = calculateCircumcircleCenter(arcStartPoint, arcEndPoint, sketchPos);
        if (circleInfo) {
          setPreviewCircle({
            center: { x: circleInfo.x, y: circleInfo.y },
            radius: circleInfo.radius,
          });
        }
      }
    }
  }, [
    sketchMode.active,
    sketchMode.activeTool,
    tempStartPoint,
    tempSecondPoint,
    chainLastEndpoint,
    sketchPos,
    circleCenterPoint,
    arcStartPoint,
    arcEndPoint,
    arcCenterPoint,
    tangentSource,
    setPreviewLine,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keyboard shortcut: Escape to cancel drawing and clear selection
  useKeyboardShortcut({
    id: "sketch-escape",
    keys: ["Escape"],
    priority: ShortcutPriority.SKETCH_MODE,
    condition: () => sketchMode.active,
    handler: () => {
      // Clear all temporary drawing state
      setTempStartPoint(null);
      setTempSecondPoint(null);
      setChainLastEndpoint(null);
      setArcStartPoint(null);
      setArcEndPoint(null);
      setArcCenterPoint(null);
      setCircleCenterPoint(null);
      setTangentSource(null);
      setPreviewLine(null);
      setPreviewCircle(null);
      setPreviewArc(null);
      setPreviewRect(null);
      setPreviewPolygon(null);
      // Also clear sketch selection
      clearSketchSelection();
      return true;
    },
    description: "Cancel drawing / clear selection",
    category: "Sketch",
  });

  // Keyboard shortcut: Delete/Backspace to delete selected items
  useKeyboardShortcut({
    id: "sketch-delete",
    keys: ["Delete", "Backspace"],
    priority: ShortcutPriority.SKETCH_MODE,
    condition: () => sketchMode.active,
    handler: () => {
      deleteSelectedItems();
      return true;
    },
    description: "Delete selected entities",
    category: "Sketch",
    // Default editable policy is "ignore", so this won't fire in inputs
  });

  // Mouse handlers effect
  useEffect(() => {
    if (!sketchMode.active || !sketchMode.planeId) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      if (mouseDownPosRef.current && !isDraggingViewRef.current) {
        const dx = cx - mouseDownPosRef.current.x;
        const dy = cy - mouseDownPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          isDraggingViewRef.current = true;
        }
      }

      // Update box selection
      if (boxSelection && isDraggingViewRef.current) {
        const dx = cx - boxSelection.start.x;
        const mode = dx >= 0 ? "window" : "crossing";
        setBoxSelection((prev) => (prev ? { ...prev, current: { x: cx, y: cy }, mode } : null));
      }

      const sketchCoords = screenToSketch(e.clientX, e.clientY, sketchMode.planeId!);
      if (sketchCoords) {
        const snapped = snapToGrid(sketchCoords.x, sketchCoords.y);
        setSketchPos(snapped);
        setSketchMousePos({ x: snapped.x, y: snapped.y });

        // Handle entity dragging
        if (draggingEntity) {
          if (draggingEntity.type === "point") {
            updatePointPosition(draggingEntity.id, snapped.x, snapped.y);
          } else if (
            draggingEntity.type === "line" &&
            draggingEntity.originalPositions &&
            draggingEntity.linePointIds
          ) {
            const dx = sketchCoords.x - draggingEntity.startPos.x;
            const dy = sketchCoords.y - draggingEntity.startPos.y;
            const orig = draggingEntity.originalPositions;
            const ids = draggingEntity.linePointIds;

            const newStartX = snapToGrid(orig.startX + dx, 0).x;
            const newStartY = snapToGrid(0, orig.startY + dy).y;
            const newEndX = snapToGrid(orig.endX + dx, 0).x;
            const newEndY = snapToGrid(0, orig.endY + dy).y;

            updatePointPosition(ids.startId, newStartX, newStartY);
            updatePointPosition(ids.endId, newEndX, newEndY);
          }
          isDraggingViewRef.current = true;
          return;
        }

        // Detect snap targets for drawing tools
        if (
          ["line", "arc", "arcCenterpoint", "arcTangent", "circle", "rectangle"].includes(
            sketchMode.activeTool
          )
        ) {
          const nearbyPoint = findNearbyPoint(snapped.x, snapped.y, POINT_MERGE_TOLERANCE_MM);
          if (nearbyPoint) {
            setSnapTarget({ x: nearbyPoint.x, y: nearbyPoint.y, type: "point" });
          } else {
            setSnapTarget(null);
          }
          setHoveredDraggable(null);
        } else if (sketchMode.activeTool === "select") {
          setSnapTarget(null);
          const sketch = getSketch();
          if (sketch) {
            const tol = POINT_MERGE_TOLERANCE_MM;
            const nearbyPoint = findNearbyPoint(snapped.x, snapped.y, tol);
            if (nearbyPoint) {
              setHoveredDraggable({ type: "point", id: nearbyPoint.id! });
            } else {
              const nearbyEntity = findNearestEntityInSketch(sketch, snapped.x, snapped.y, tol);
              if (nearbyEntity) {
                setHoveredDraggable({ type: "line", id: nearbyEntity.entity.id });
              } else {
                setHoveredDraggable(null);
              }
            }
          } else {
            setHoveredDraggable(null);
          }
        } else {
          setSnapTarget(null);
          setHoveredDraggable(null);
        }
      } else {
        setSketchMousePos(null);
        setSketchPos(null);
        setSnapTarget(null);
        setHoveredDraggable(null);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseDownPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      isDraggingViewRef.current = false;

      if (sketchMode.activeTool === "select" && e.button === 0 && !e.shiftKey) {
        const sketchCoords = screenToSketch(e.clientX, e.clientY, sketchMode.planeId!);
        if (sketchCoords) {
          const tol = POINT_MERGE_TOLERANCE_MM;
          const sketch = getSketch();
          if (sketch) {
            const nearbyPoint = findNearbyPoint(sketchCoords.x, sketchCoords.y, tol);
            if (nearbyPoint) {
              setDraggingEntity({
                type: "point",
                id: nearbyPoint.id!,
                startPos: { x: sketchCoords.x, y: sketchCoords.y },
              });
              return;
            }

            const nearbyLine = findNearbyLineInSketch(sketch, sketchCoords.x, sketchCoords.y, tol);
            if (nearbyLine) {
              const startPt = sketch.points.find((p) => p.id === nearbyLine.start);
              const endPt = sketch.points.find((p) => p.id === nearbyLine.end);
              if (startPt && endPt) {
                setDraggingEntity({
                  type: "line",
                  id: nearbyLine.id,
                  originalPositions: {
                    startX: startPt.x,
                    startY: startPt.y,
                    endX: endPt.x,
                    endY: endPt.y,
                  },
                  linePointIds: {
                    startId: nearbyLine.start,
                    endId: nearbyLine.end,
                  },
                  startPos: { x: sketchCoords.x, y: sketchCoords.y },
                });
              }
              return;
            }

            const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setBoxSelection({
              start: screenPos,
              current: screenPos,
              mode: "window",
            });
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!mouseDownPosRef.current) return;

      const wasDragging = isDraggingViewRef.current;
      const wasDraggingEntity = draggingEntity !== null;
      const wasBoxSelecting = boxSelection !== null;
      mouseDownPosRef.current = null;
      isDraggingViewRef.current = false;

      if (wasDraggingEntity) {
        setDraggingEntity(null);
      }

      if (wasDragging && !wasBoxSelecting) return;
      if (sketchMode.activeTool === "none") return;
      if (e.button !== 0) return;
      if (e.shiftKey) return;

      const sketchCoords = screenToSketch(e.clientX, e.clientY, sketchMode.planeId!);
      if (!sketchCoords) return;

      const snappedPos = snapToGrid(sketchCoords.x, sketchCoords.y);

      // Handle select tool
      if (sketchMode.activeTool === "select") {
        const sketch = getSketch();
        if (!sketch) return;

        // Handle box selection completion
        if (boxSelection && wasDragging) {
          const { start, current, mode } = boxSelection;
          setBoxSelection(null);

          const minX = Math.min(start.x, current.x);
          const maxX = Math.max(start.x, current.x);
          const minY = Math.min(start.y, current.y);
          const maxY = Math.max(start.y, current.y);

          const rect = container.getBoundingClientRect();
          const topLeft = screenToSketch(minX + rect.left, minY + rect.top, sketchMode.planeId!);
          const bottomRight = screenToSketch(
            maxX + rect.left,
            maxY + rect.top,
            sketchMode.planeId!
          );
          if (!topLeft || !bottomRight) return;

          const boxMinX = Math.min(topLeft.x, bottomRight.x);
          const boxMaxX = Math.max(topLeft.x, bottomRight.x);
          const boxMinY = Math.min(topLeft.y, bottomRight.y);
          const boxMaxY = Math.max(topLeft.y, bottomRight.y);

          const newSelectedPoints = new Set<string>();
          const newSelectedLines = new Set<string>();

          for (const point of sketch.points) {
            const inside =
              point.x >= boxMinX && point.x <= boxMaxX && point.y >= boxMinY && point.y <= boxMaxY;
            if (inside) newSelectedPoints.add(point.id);
          }

          for (const entity of sketch.entities) {
            let shouldSelect = false;
            if (entity.type === "line") {
              const startPt = sketch.points.find((p) => p.id === entity.start);
              const endPt = sketch.points.find((p) => p.id === entity.end);
              if (startPt && endPt) {
                const startInside =
                  startPt.x >= boxMinX &&
                  startPt.x <= boxMaxX &&
                  startPt.y >= boxMinY &&
                  startPt.y <= boxMaxY;
                const endInside =
                  endPt.x >= boxMinX &&
                  endPt.x <= boxMaxX &&
                  endPt.y >= boxMinY &&
                  endPt.y <= boxMaxY;
                if (mode === "window") {
                  shouldSelect = startInside && endInside;
                } else {
                  shouldSelect =
                    startInside ||
                    endInside ||
                    lineIntersectsBox(startPt, endPt, boxMinX, boxMinY, boxMaxX, boxMaxY);
                }
              }
            } else if (entity.type === "arc" || entity.type === "circle") {
              const center = sketch.points.find(
                (p) => p.id === (entity as SketchArc | SketchCircle).center
              );
              if (center) {
                const centerInside =
                  center.x >= boxMinX &&
                  center.x <= boxMaxX &&
                  center.y >= boxMinY &&
                  center.y <= boxMaxY;
                shouldSelect = centerInside;
              }
            }
            if (shouldSelect) newSelectedLines.add(entity.id);
          }

          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            setSelectedPoints((prev) => new Set([...prev, ...newSelectedPoints]));
            setSelectedLines((prev) => new Set([...prev, ...newSelectedLines]));
          } else {
            setSelectedPoints(newSelectedPoints);
            setSelectedLines(newSelectedLines);
            setSelectedConstraints(new Set());
          }
          return;
        }

        // Single click selection
        const tol = POINT_MERGE_TOLERANCE_MM;
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, tol);

        if (nearbyPoint) {
          if (e.ctrlKey || e.metaKey) {
            setSelectedPoints((prev) => {
              const next = new Set(prev);
              if (next.has(nearbyPoint.id!)) next.delete(nearbyPoint.id!);
              else next.add(nearbyPoint.id!);
              return next;
            });
          } else if (e.shiftKey) {
            setSelectedPoints((prev) => new Set([...prev, nearbyPoint.id!]));
          } else {
            setSelectedPoints(new Set([nearbyPoint.id!]));
            setSelectedLines(new Set());
            setSelectedConstraints(new Set());
          }
          return;
        }

        const nearbyEntity = findNearestEntityInSketch(sketch, snappedPos.x, snappedPos.y, tol);
        if (nearbyEntity) {
          const entityId = nearbyEntity.entity.id;
          if (e.ctrlKey || e.metaKey) {
            setSelectedLines((prev) => {
              const next = new Set(prev);
              if (next.has(entityId)) next.delete(entityId);
              else next.add(entityId);
              return next;
            });
          } else if (e.shiftKey) {
            setSelectedLines((prev) => new Set([...prev, entityId]));
          } else {
            setSelectedLines(new Set([entityId]));
            setSelectedPoints(new Set());
            setSelectedConstraints(new Set());
          }
          return;
        }

        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          clearSketchSelection();
        }
        return;
      }

      // Handle point tool
      if (sketchMode.activeTool === "point") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        if (nearbyPoint) return;

        const sketch = getSketch();
        if (sketch) {
          const nearestEntity = findNearestEntityInSketch(
            sketch,
            snappedPos.x,
            snappedPos.y,
            POINT_MERGE_TOLERANCE_MM
          );
          if (nearestEntity) {
            const pointId = addPoint(nearestEntity.closestPoint.x, nearestEntity.closestPoint.y);
            if (pointId) {
              if (nearestEntity.entity.type === "line") {
                addConstraint({
                  type: "pointOnLine",
                  point: pointId,
                  line: nearestEntity.entity.id,
                });
              } else if (
                nearestEntity.entity.type === "arc" ||
                nearestEntity.entity.type === "circle"
              ) {
                addConstraint({ type: "pointOnArc", point: pointId, arc: nearestEntity.entity.id });
              }
            }
            return;
          }
        }
        addPoint(snappedPos.x, snappedPos.y);
        return;
      }

      // Handle line tool
      if (sketchMode.activeTool === "line") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const startSource = chainLastEndpoint || tempStartPoint;

        if (!startSource) {
          if (nearbyPoint) {
            setTempStartPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          let startId: string | null | undefined = startSource.id;
          let endId: string | null = null;

          if (!startId) startId = addPoint(startSource.x, startSource.y);
          if (nearbyPoint) endId = nearbyPoint.id ?? null;
          else endId = addPoint(snappedPos.x, snappedPos.y);

          if (startId && endId) {
            addLine(startId, endId);

            if (autoConstraints && !e.ctrlKey && !e.metaKey) {
              const endPt = nearbyPoint || { x: snappedPos.x, y: snappedPos.y };
              if (isNearHorizontal(startSource, endPt)) {
                addConstraint({ type: "horizontal", points: [startId, endId] });
              } else if (isNearVertical(startSource, endPt)) {
                addConstraint({ type: "vertical", points: [startId, endId] });
              }
            }

            if (nearbyPoint) {
              setChainLastEndpoint(null);
              setTempStartPoint(null);
            } else {
              setChainLastEndpoint({ x: snappedPos.x, y: snappedPos.y, id: endId });
              setTempStartPoint(null);
            }
          }
        }
        return;
      }

      // Handle arc tool (3-point)
      if (sketchMode.activeTool === "arc") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!arcStartPoint) {
          setArcStartPoint(clickPoint);
        } else if (!arcEndPoint) {
          setArcEndPoint(clickPoint);
        } else {
          const circleInfo = calculateCircumcircleCenter(arcStartPoint, arcEndPoint, clickPoint);
          if (circleInfo) {
            const startId = arcStartPoint.id ?? addPoint(arcStartPoint.x, arcStartPoint.y);
            const endId = arcEndPoint.id ?? addPoint(arcEndPoint.x, arcEndPoint.y);
            const centerId = addPoint(circleInfo.x, circleInfo.y);

            if (startId && endId && centerId) {
              const center = { x: circleInfo.x, y: circleInfo.y };
              const ccw = shouldArcBeCCW(arcStartPoint, arcEndPoint, clickPoint, center);
              addArc(startId, endId, centerId, ccw);
            }
          }
          setArcStartPoint(null);
          setArcEndPoint(null);
        }
        return;
      }

      // Handle centerpoint arc
      if (sketchMode.activeTool === "arcCenterpoint") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!arcCenterPoint) {
          setArcCenterPoint(clickPoint);
        } else if (!arcStartPoint) {
          setArcStartPoint(clickPoint);
        } else {
          const centerId = arcCenterPoint.id ?? addPoint(arcCenterPoint.x, arcCenterPoint.y);
          const startId = arcStartPoint.id ?? addPoint(arcStartPoint.x, arcStartPoint.y);
          const endId = clickPoint.id ?? addPoint(clickPoint.x, clickPoint.y);

          if (centerId && startId && endId) {
            const ccw = shouldCenterpointArcBeCCW(arcCenterPoint, arcStartPoint, clickPoint);
            addArc(startId, endId, centerId, ccw);
          }
          setArcCenterPoint(null);
          setArcStartPoint(null);
        }
        return;
      }

      // Handle circle tool
      if (sketchMode.activeTool === "circle") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        if (!circleCenterPoint) {
          if (nearbyPoint) {
            setCircleCenterPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setCircleCenterPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          const centerId =
            circleCenterPoint.id ?? addPoint(circleCenterPoint.x, circleCenterPoint.y);
          const dx = snappedPos.x - circleCenterPoint.x;
          const dy = snappedPos.y - circleCenterPoint.y;
          const radius = Math.sqrt(dx * dx + dy * dy);

          if (centerId && radius > 0.01) {
            addCircle(centerId, radius);
          }
          setCircleCenterPoint(null);
        }
        return;
      }

      // Handle rectangle tool
      if (sketchMode.activeTool === "rectangle") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        if (!tempStartPoint) {
          if (nearbyPoint) {
            setTempStartPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          const x1 = tempStartPoint.x;
          const y1 = tempStartPoint.y;
          const x2 = nearbyPoint ? nearbyPoint.x : snappedPos.x;
          const y2 = nearbyPoint ? nearbyPoint.y : snappedPos.y;

          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);

          if (width > 0.01 && height > 0.01) {
            const minX = Math.min(x1, x2);
            const minY = Math.min(y1, y2);
            const maxX = Math.max(x1, x2);
            const maxY = Math.max(y1, y2);
            addRectangle(minX, minY, maxX, maxY);
          }
          setTempStartPoint(null);
        }
        return;
      }

      // Handle center rectangle tool
      if (sketchMode.activeTool === "rectangleCenter") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);

        if (!tempStartPoint) {
          if (nearbyPoint) {
            setTempStartPoint({
              x: nearbyPoint.x,
              y: nearbyPoint.y,
              id: nearbyPoint.id ?? undefined,
            });
          } else {
            setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          const cx = tempStartPoint.x;
          const cy = tempStartPoint.y;
          const cornerX = nearbyPoint ? nearbyPoint.x : snappedPos.x;
          const cornerY = nearbyPoint ? nearbyPoint.y : snappedPos.y;

          const halfW = Math.abs(cornerX - cx);
          const halfH = Math.abs(cornerY - cy);

          if (halfW > 0.01 && halfH > 0.01) {
            addRectangle(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
          }
          setTempStartPoint(null);
        }
        return;
      }

      // Handle 3-point rectangle
      if (sketchMode.activeTool === "rectangle3Point") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!tempStartPoint) {
          setTempStartPoint(clickPoint);
        } else if (!tempSecondPoint) {
          setTempSecondPoint(clickPoint);
        } else {
          const edgeX = tempSecondPoint.x - tempStartPoint.x;
          const edgeY = tempSecondPoint.y - tempStartPoint.y;
          const edgeLen = Math.hypot(edgeX, edgeY);

          if (edgeLen > 0.01) {
            const ux = edgeX / edgeLen;
            const uy = edgeY / edgeLen;
            const px = -uy;
            const py = ux;
            const toCursorX = clickPoint.x - tempStartPoint.x;
            const toCursorY = clickPoint.y - tempStartPoint.y;
            const width = toCursorX * px + toCursorY * py;

            if (Math.abs(width) > 0.01) {
              const c1 = tempStartPoint;
              const c2 = tempSecondPoint;
              const c3 = { x: tempSecondPoint.x + width * px, y: tempSecondPoint.y + width * py };
              const c4 = { x: tempStartPoint.x + width * px, y: tempStartPoint.y + width * py };
              addAngledRectangle(c1, c2, c3, c4);
            }
          }
          setTempStartPoint(null);
          setTempSecondPoint(null);
        }
        return;
      }

      // Handle 3-point circle
      if (sketchMode.activeTool === "circle3Point") {
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, POINT_MERGE_TOLERANCE_MM);
        const clickPoint = nearbyPoint
          ? { x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined }
          : { x: snappedPos.x, y: snappedPos.y };

        if (!arcStartPoint) {
          setArcStartPoint(clickPoint);
        } else if (!arcEndPoint) {
          setArcEndPoint(clickPoint);
        } else {
          const circleInfo = calculateCircumcircleCenter(arcStartPoint, arcEndPoint, clickPoint);
          if (circleInfo) {
            const centerId = addPoint(circleInfo.x, circleInfo.y);
            if (centerId && circleInfo.radius > 0.01) {
              addCircle(centerId, circleInfo.radius);
            }
          }
          setArcStartPoint(null);
          setArcEndPoint(null);
        }
        return;
      }
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    containerRef,
    sketchMode.active,
    sketchMode.planeId,
    sketchMode.activeTool,
    screenToSketch,
    snapToGrid,
    getSketch,
    findNearbyPoint,
    addPoint,
    addLine,
    addArc,
    addCircle,
    addRectangle,
    addAngledRectangle,
    addConstraint,
    updatePointPosition,
    setSelectedPoints,
    setSelectedLines,
    setSelectedConstraints,
    clearSketchSelection,
    deleteSelectedItems,
    autoConstraints,
    setSketchMousePos,
    tempStartPoint,
    tempSecondPoint,
    chainLastEndpoint,
    arcStartPoint,
    arcEndPoint,
    arcCenterPoint,
    tangentSource,
    circleCenterPoint,
    draggingEntity,
    boxSelection,
    sceneReady,
  ]);

  return {
    sketchPos,
    previewShapes: {
      line: null, // Managed by setPreviewLine callback
      circle: previewCircle,
      arc: previewArc,
      rect: previewRect,
      polygon: previewPolygon,
    },
    snapTarget,
    boxSelection,
    draggingEntity,
    hoveredDraggable,
  };
}
