/**
 * SketchContext - manages sketch editing mode state
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import * as Y from "yjs";
import { useDocument } from "./DocumentContext";
import { useViewer, type ViewPreset } from "./ViewerContext";
import {
  addPointToSketch,
  addLineToSketch,
  addArcToSketch,
  addCircleToSketch,
  addConstraintToSketch,
  getSketchData,
  getSketchDataAsArrays,
  setSketchData,
  updatePointPosition,
  toggleEntityConstruction,
  type NewSketchConstraint,
} from "../document/featureHelpers";
import type { SketchData, SketchPoint, SketchLine, DatumPlaneRole } from "../document/schema";
import { findDatumPlaneByRole } from "../document/createDocument";

// Constraint types that can be applied
export type ConstraintType =
  | "horizontal"
  | "vertical"
  | "coincident"
  | "fixed"
  | "distance"
  | "angle"
  // Advanced constraints (Phase 19)
  | "parallel"
  | "perpendicular"
  | "equalLength"
  | "tangent"
  | "symmetric";

// ============================================================================
// Types
// ============================================================================

export type SketchTool =
  | "none"
  | "select"
  | "point" // Standalone point
  | "line"
  | "arc" // 3-point arc (start → end → bulge)
  | "arcCenterpoint" // Centerpoint arc (center → start → end)
  | "arcTangent" // Tangent arc from endpoint
  | "circle" // Centerpoint circle
  | "circle3Point" // 3-point circle
  | "rectangle" // Corner-corner rectangle
  | "rectangleCenter" // Center rectangle
  | "rectangle3Point" // 3-point angled rectangle (corner A → corner B → width)
  | "rectangleCenter"; // Center-corner rectangle

export interface SketchModeState {
  active: boolean;
  sketchId: string | null;
  planeId: string | null;
  activeTool: SketchTool;
  tempPoints: { x: number; y: number }[];
  /** Whether this is a new sketch (should be deleted on cancel) or editing existing */
  isNewSketch: boolean;
}

/** Mouse position in sketch coordinates */
export interface SketchMousePos {
  x: number;
  y: number;
}

/** Preview line for draft rendering in 3D */
export interface SketchPreviewLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface SketchContextValue {
  mode: SketchModeState;
  /** Current mouse position in sketch coordinates (for status bar display) */
  sketchMousePos: SketchMousePos | null;
  setSketchMousePos: (pos: SketchMousePos | null) => void;
  /** Preview line for draft rendering (set by SketchCanvas, rendered by Viewer) */
  previewLine: SketchPreviewLine | null;
  setPreviewLine: (line: SketchPreviewLine | null) => void;
  /** Start a new sketch on the given plane (role like 'xy' or plane UUID) */
  startSketch: (planeIdOrRole: string) => void;
  /** Edit an existing sketch */
  editSketch: (sketchId: string, planeId: string) => void;
  finishSketch: () => void;
  cancelSketch: () => void;
  setTool: (tool: SketchTool) => void;
  addPoint: (x: number, y: number) => string | null;
  addLine: (startId: string, endId: string) => string | null;
  addArc: (startId: string, endId: string, centerId: string, ccw?: boolean) => string | null;
  /** Add a circle with center point and radius (no edge point needed) */
  addCircle: (centerId: string, radius: number) => string | null;
  addTempPoint: (x: number, y: number) => void;
  clearTempPoints: () => void;
  getSketchPoints: () => SketchPoint[];
  updatePointPosition: (pointId: string, x: number, y: number) => void;
  findNearbyPoint: (x: number, y: number, tolerance: number) => SketchPoint | null;
  /** Draw a rectangle from corner (x1, y1) to corner (x2, y2) */
  addRectangle: (x1: number, y1: number, x2: number, y2: number) => void;
  /** Draw an angled (non-axis-aligned) rectangle with 4 corner points */
  addAngledRectangle: (
    c1: { x: number; y: number; id?: string },
    c2: { x: number; y: number; id?: string },
    c3: { x: number; y: number; id?: string },
    c4: { x: number; y: number; id?: string }
  ) => void;
  addConstraint: (constraint: NewSketchConstraint) => string | null;

  // Selection state for constraints
  selectedPoints: Set<string>;
  selectedLines: Set<string>;
  selectedConstraints: Set<string>;
  setSelectedPoints: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedLines: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedConstraints: React.Dispatch<React.SetStateAction<Set<string>>>;
  togglePointSelection: (pointId: string, clearOthers?: boolean) => void;
  toggleLineSelection: (lineId: string, clearOthers?: boolean) => void;
  toggleConstraintSelection: (constraintId: string, clearOthers?: boolean) => void;
  clearSelection: () => void;

  // Deletion helpers
  deleteSelectedItems: () => void;

  // Constraint helpers
  canApplyConstraint: (type: ConstraintType) => boolean;
  applyConstraint: (type: ConstraintType) => void;
  getSketchData: () => SketchData | null;

  // Construction geometry helpers
  toggleConstruction: () => void;
  hasSelectedEntities: () => boolean;
}

// ============================================================================
// Context
// ============================================================================

const SketchContext = createContext<SketchContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SketchProviderProps {
  children: React.ReactNode;
}

export function SketchProvider({ children }: SketchProviderProps) {
  const {
    doc,
    addSketch,
    deleteFeature,
    undoManager,
    rebuildGate,
    setRebuildGate,
    awareness,
    features,
  } = useDocument();
  const { actions, state } = useViewer();

  const [mode, setMode] = useState<SketchModeState>({
    active: false,
    sketchId: null,
    planeId: null,
    activeTool: "line",
    tempPoints: [],
    isNewSketch: false,
  });

  // Store the undo stack position when we start editing, so we can revert on cancel
  const undoStackPositionRef = useRef<number>(0);

  // Store the previous rebuild gate position to restore when exiting sketch mode
  const previousRebuildGateRef = useRef<string | null>(null);

  // Track if we're currently following someone's sketch mode (to avoid feedback loops)
  const isFollowingSketchRef = useRef(false);

  // Track the last followed user's sketch state to detect changes
  const lastFollowedSketchIdRef = useRef<string | null>(null);

  // Mouse position in sketch coordinates (shared with StatusBar)
  const [sketchMousePos, setSketchMousePosInternal] = useState<SketchMousePos | null>(null);

  // Wrap setSketchMousePos to also broadcast to awareness
  const setSketchMousePos = useCallback(
    (pos: SketchMousePos | null) => {
      setSketchMousePosInternal(pos);

      // Broadcast sketch cursor position to awareness
      if (awareness && mode.active && mode.sketchId) {
        awareness.updateSketchCursor({
          sketchId: mode.sketchId,
          cursorPosition: pos ? [pos.x, pos.y] : [0, 0],
          activeToolId: mode.activeTool,
        });
      }
    },
    [awareness, mode.active, mode.sketchId, mode.activeTool]
  );

  // Preview line for draft rendering (shared with Viewer)
  const [previewLine, setPreviewLine] = useState<SketchPreviewLine | null>(null);

  /**
   * Get plane ID from role or UUID
   */
  const resolvePlaneId = useCallback(
    (planeIdOrRole: string): string => {
      // Check if it's a datum plane role
      if (planeIdOrRole === "xy" || planeIdOrRole === "xz" || planeIdOrRole === "yz") {
        const planeId = findDatumPlaneByRole(doc, planeIdOrRole as DatumPlaneRole);
        if (!planeId) {
          throw new Error(`Datum plane '${planeIdOrRole}' not found`);
        }
        return planeId;
      }
      // Otherwise assume it's a UUID
      return planeIdOrRole;
    },
    [doc]
  );

  /**
   * Get view preset for a plane
   */
  const getViewForPlane = useCallback(
    (planeIdOrRole: string): ViewPreset => {
      // Check for role-based planes
      if (planeIdOrRole === "xy") return "front";
      if (planeIdOrRole === "xz") return "top";
      if (planeIdOrRole === "yz") return "right";

      // Check if it's a UUID that matches a datum plane
      const datumIds = {
        xy: findDatumPlaneByRole(doc, "xy"),
        xz: findDatumPlaneByRole(doc, "xz"),
        yz: findDatumPlaneByRole(doc, "yz"),
      };

      if (planeIdOrRole === datumIds.xy) return "front";
      if (planeIdOrRole === datumIds.xz) return "top";
      if (planeIdOrRole === datumIds.yz) return "right";

      // Default for custom planes
      return "isometric";
    },
    [doc]
  );

  const startSketch = useCallback(
    (planeIdOrRole: string) => {
      // Resolve plane ID
      const planeId = resolvePlaneId(planeIdOrRole);

      // Create new sketch in Yjs (using the role string so it creates proper ref)
      const sketchId = addSketch(planeIdOrRole);

      // Store the current rebuild gate position so we can restore it when finishing
      previousRebuildGateRef.current = rebuildGate;

      // Move the rebuild gate to immediately after the new sketch
      setRebuildGate(sketchId);

      // Rotate camera to face the sketch plane normal
      const targetView = getViewForPlane(planeIdOrRole);
      if (state.currentView !== targetView) {
        actions.setView(targetView);
      }

      setMode({
        active: true,
        sketchId,
        planeId,
        activeTool: "line",
        tempPoints: [],
        isNewSketch: true,
      });

      // Broadcast sketch state for followers
      awareness?.updateSketchCursor({
        sketchId,
        cursorPosition: [0, 0],
        activeToolId: "line",
      });
    },
    [
      addSketch,
      resolvePlaneId,
      getViewForPlane,
      actions,
      state.currentView,
      rebuildGate,
      setRebuildGate,
      awareness,
    ]
  );

  const editSketch = useCallback(
    (sketchId: string, planeId: string) => {
      // Store current undo stack position so we can revert on cancel
      undoStackPositionRef.current = undoManager.undoStack.length;

      // Store the current rebuild gate position so we can restore it when finishing
      previousRebuildGateRef.current = rebuildGate;

      // Move the rebuild gate to immediately after the sketch being edited
      setRebuildGate(sketchId);

      // Rotate camera to face the sketch plane
      const targetView = getViewForPlane(planeId);
      if (state.currentView !== targetView) {
        actions.setView(targetView);
      }

      setMode({
        active: true,
        sketchId,
        planeId,
        activeTool: "line",
        tempPoints: [],
        isNewSketch: false,
      });

      // Broadcast sketch state for followers
      awareness?.updateSketchCursor({
        sketchId,
        cursorPosition: [0, 0],
        activeToolId: "line",
      });
    },
    [
      getViewForPlane,
      actions,
      state.currentView,
      undoManager,
      rebuildGate,
      setRebuildGate,
      awareness,
    ]
  );

  const finishSketch = useCallback(() => {
    // Restore the rebuild gate to its previous position
    setRebuildGate(previousRebuildGateRef.current);
    previousRebuildGateRef.current = null;

    setMode({
      active: false,
      sketchId: null,
      planeId: null,
      activeTool: "line",
      tempPoints: [],
      isNewSketch: false,
    });

    // Clear sketch state for followers
    awareness?.clearSketchState();
  }, [setRebuildGate, awareness]);

  const cancelSketch = useCallback(() => {
    const { sketchId, isNewSketch } = mode;

    if (isNewSketch && sketchId) {
      // New sketch - delete it entirely
      deleteFeature(sketchId);
    } else if (!isNewSketch && sketchId) {
      // Existing sketch - undo all changes made during editing
      const targetPosition = undoStackPositionRef.current;
      const currentPosition = undoManager.undoStack.length;
      const undoCount = currentPosition - targetPosition;

      for (let i = 0; i < undoCount; i++) {
        undoManager.undo();
      }
    }

    // Restore the rebuild gate to its previous position
    setRebuildGate(previousRebuildGateRef.current);
    previousRebuildGateRef.current = null;

    setMode({
      active: false,
      sketchId: null,
      planeId: null,
      activeTool: "line",
      tempPoints: [],
      isNewSketch: false,
    });

    // Clear sketch state for followers
    awareness?.clearSketchState();
  }, [mode, deleteFeature, undoManager, setRebuildGate, awareness]);

  const setTool = useCallback((tool: SketchTool) => {
    setMode((prev) => ({
      ...prev,
      activeTool: tool,
      tempPoints: [], // Clear temp points when changing tools
    }));
  }, []);

  const getSketchElement = useCallback((): Y.Map<unknown> | null => {
    if (!mode.sketchId || !doc) return null;
    return doc.featuresById.get(mode.sketchId) ?? null;
  }, [doc, mode.sketchId]);

  const addPoint = useCallback(
    (x: number, y: number): string | null => {
      const sketch = getSketchElement();
      if (!sketch) return null;
      return addPointToSketch(sketch, x, y);
    },
    [getSketchElement]
  );

  const addLine = useCallback(
    (startId: string, endId: string): string | null => {
      const sketch = getSketchElement();
      if (!sketch) return null;
      return addLineToSketch(sketch, startId, endId);
    },
    [getSketchElement]
  );

  const addArc = useCallback(
    (startId: string, endId: string, centerId: string, ccw: boolean = true): string | null => {
      const sketch = getSketchElement();
      if (!sketch) return null;
      return addArcToSketch(sketch, startId, endId, centerId, ccw);
    },
    [getSketchElement]
  );

  const addCircle = useCallback(
    (centerId: string, radius: number): string | null => {
      const sketch = getSketchElement();
      if (!sketch) return null;
      return addCircleToSketch(sketch, centerId, radius);
    },
    [getSketchElement]
  );

  const addTempPoint = useCallback((x: number, y: number) => {
    setMode((prev) => ({
      ...prev,
      tempPoints: [...prev.tempPoints, { x, y }],
    }));
  }, []);

  const clearTempPoints = useCallback(() => {
    setMode((prev) => ({
      ...prev,
      tempPoints: [],
    }));
  }, []);

  const getSketchPoints = useCallback((): SketchPoint[] => {
    const sketch = getSketchElement();
    if (!sketch) return [];
    const { points } = getSketchDataAsArrays(sketch);
    return points;
  }, [getSketchElement]);

  const handleUpdatePointPosition = useCallback(
    (pointId: string, x: number, y: number) => {
      const sketch = getSketchElement();
      if (!sketch) return;
      updatePointPosition(sketch, pointId, x, y);
    },
    [getSketchElement]
  );

  const findNearbyPoint = useCallback(
    (x: number, y: number, tolerance: number): SketchPoint | null => {
      const points = getSketchPoints();
      for (const point of points) {
        const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
        if (dist < tolerance) {
          return point;
        }
      }
      return null;
    },
    [getSketchPoints]
  );

  const addRectangle = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const sketch = getSketchElement();
      if (!sketch) return;

      // Ensure proper min/max ordering for corners
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const maxX = Math.max(x1, x2);
      const maxY = Math.max(y1, y2);

      // Add 4 corner points (bottom-left, bottom-right, top-right, top-left)
      const p1 = addPointToSketch(sketch, minX, minY); // bottom-left
      const p2 = addPointToSketch(sketch, maxX, minY); // bottom-right
      const p3 = addPointToSketch(sketch, maxX, maxY); // top-right
      const p4 = addPointToSketch(sketch, minX, maxY); // top-left

      // Add 4 lines
      addLineToSketch(sketch, p1, p2); // bottom (horizontal)
      addLineToSketch(sketch, p2, p3); // right (vertical)
      addLineToSketch(sketch, p3, p4); // top (horizontal)
      addLineToSketch(sketch, p4, p1); // left (vertical)

      // Add auto-constraints for rectangle edges
      addConstraintToSketch(sketch, { type: "horizontal", points: [p1, p2] }); // bottom
      addConstraintToSketch(sketch, { type: "horizontal", points: [p3, p4] }); // top
      addConstraintToSketch(sketch, { type: "vertical", points: [p2, p3] }); // right
      addConstraintToSketch(sketch, { type: "vertical", points: [p4, p1] }); // left
    },
    [getSketchElement]
  );

  /**
   * Add an angled rectangle with 4 corner points (not axis-aligned)
   * Corners should be in order: c1 -> c2 -> c3 -> c4 -> c1
   */
  const addAngledRectangle = useCallback(
    (
      c1: { x: number; y: number; id?: string },
      c2: { x: number; y: number; id?: string },
      c3: { x: number; y: number; id?: string },
      c4: { x: number; y: number; id?: string }
    ) => {
      const sketch = getSketchElement();
      if (!sketch) return;

      // Add 4 corner points (using existing if id provided)
      const p1 = c1.id ?? addPointToSketch(sketch, c1.x, c1.y);
      const p2 = c2.id ?? addPointToSketch(sketch, c2.x, c2.y);
      const p3 = c3.id ?? addPointToSketch(sketch, c3.x, c3.y);
      const p4 = c4.id ?? addPointToSketch(sketch, c4.x, c4.y);

      // Add 4 lines forming the rectangle
      const l1 = addLineToSketch(sketch, p1, p2); // edge 1 (c1 -> c2)
      const l2 = addLineToSketch(sketch, p2, p3); // edge 2 (c2 -> c3)
      const l3 = addLineToSketch(sketch, p3, p4); // edge 3 (c3 -> c4)
      const l4 = addLineToSketch(sketch, p4, p1); // edge 4 (c4 -> c1)

      // Add constraints for rectangle shape:
      // - Opposite edges are parallel
      // - All corners are perpendicular
      addConstraintToSketch(sketch, { type: "parallel", lines: [l1, l3] }); // edge 1 || edge 3
      addConstraintToSketch(sketch, { type: "parallel", lines: [l2, l4] }); // edge 2 || edge 4
      addConstraintToSketch(sketch, { type: "perpendicular", lines: [l1, l2] }); // edge 1 ⊥ edge 2
      // One perpendicular constraint is enough - the parallel constraints will ensure the rest
    },
    [getSketchElement]
  );

  const addConstraint = useCallback(
    (constraint: NewSketchConstraint): string | null => {
      const sketch = getSketchElement();
      if (!sketch) return null;
      return addConstraintToSketch(sketch, constraint);
    },
    [getSketchElement]
  );

  // Selection state for constraints
  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(() => new Set());
  const [selectedLines, setSelectedLines] = useState<Set<string>>(() => new Set());
  const [selectedConstraints, setSelectedConstraints] = useState<Set<string>>(() => new Set());

  // Toggle functions that preserve other selection types (for Ctrl+click multi-select)
  const togglePointSelection = useCallback((pointId: string, clearOthers: boolean = true) => {
    setSelectedPoints((prev) => {
      const next = new Set(prev);
      if (next.has(pointId)) {
        next.delete(pointId);
      } else {
        next.add(pointId);
      }
      return next;
    });
    // Only clear other types if not in multi-select mode
    if (clearOthers) {
      setSelectedLines(new Set());
      setSelectedConstraints(new Set());
    }
  }, []);

  const toggleLineSelection = useCallback((lineId: string, clearOthers: boolean = true) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
    // Only clear other types if not in multi-select mode
    if (clearOthers) {
      setSelectedPoints(new Set());
      setSelectedConstraints(new Set());
    }
  }, []);

  const toggleConstraintSelection = useCallback(
    (constraintId: string, clearOthers: boolean = true) => {
      setSelectedConstraints((prev) => {
        const next = new Set(prev);
        if (next.has(constraintId)) {
          next.delete(constraintId);
        } else {
          next.add(constraintId);
        }
        return next;
      });
      // Only clear other types if not in multi-select mode
      if (clearOthers) {
        setSelectedPoints(new Set());
        setSelectedLines(new Set());
      }
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedPoints(new Set());
    setSelectedLines(new Set());
    setSelectedConstraints(new Set());
  }, []);

  // Get current sketch data
  const getSketchDataFn = useCallback((): SketchData | null => {
    const sketch = getSketchElement();
    if (!sketch) return null;
    return getSketchData(sketch);
  }, [getSketchElement]);

  // Delete selected points, lines, and constraints
  const deleteSelectedItems = useCallback(() => {
    const sketchEl = getSketchElement();
    if (!sketchEl) return;

    const { points, entities, constraints } = getSketchDataAsArrays(sketchEl);
    const pointsToDelete = new Set(selectedPoints);
    const linesToDelete = new Set(selectedLines);
    const constraintsToDelete = new Set(selectedConstraints);

    // Find lines that will be deleted (either selected or with deleted endpoints)
    const findLinesToDelete = (): Set<string> => {
      const allLinesToDelete = new Set(linesToDelete);
      for (const entity of entities) {
        if (entity.type === "line") {
          if (pointsToDelete.has(entity.start) || pointsToDelete.has(entity.end)) {
            allLinesToDelete.add(entity.id);
          }
        } else if (entity.type === "arc") {
          if (
            pointsToDelete.has(entity.start) ||
            pointsToDelete.has(entity.end) ||
            pointsToDelete.has(entity.center)
          ) {
            allLinesToDelete.add(entity.id);
          }
        }
      }
      return allLinesToDelete;
    };

    const actualLinesToDelete = findLinesToDelete();

    // Remove constraints that reference deleted items
    const filteredConstraints = constraints.filter((c) => {
      if (constraintsToDelete.has(c.id)) return false;

      // Check if constraint references deleted points
      if (c.type === "fixed" && pointsToDelete.has(c.point)) return false;
      if (
        c.type === "coincident" ||
        c.type === "horizontal" ||
        c.type === "vertical" ||
        c.type === "distance" ||
        c.type === "symmetric"
      ) {
        if (c.points?.some((p) => pointsToDelete.has(p))) return false;
      }
      if (
        c.type === "angle" ||
        c.type === "parallel" ||
        c.type === "perpendicular" ||
        c.type === "equalLength"
      ) {
        if (c.lines?.some((l) => actualLinesToDelete.has(l))) return false;
      }
      if (c.type === "tangent") {
        if (actualLinesToDelete.has(c.line) || actualLinesToDelete.has(c.arc)) return false;
      }
      if (c.type === "symmetric") {
        if (actualLinesToDelete.has(c.axis)) return false;
      }

      return true;
    });

    // Remove entities (lines/arcs)
    const filteredEntities = entities.filter((e) => !actualLinesToDelete.has(e.id));

    // Find orphaned points (points not referenced by any remaining entity)
    const usedPoints = new Set<string>();
    for (const entity of filteredEntities) {
      if (entity.type === "line") {
        usedPoints.add(entity.start);
        usedPoints.add(entity.end);
      } else if (entity.type === "arc") {
        usedPoints.add(entity.start);
        usedPoints.add(entity.end);
        usedPoints.add(entity.center);
      }
    }

    // Remove selected points and orphaned points
    const filteredPoints = points.filter((p) => {
      if (pointsToDelete.has(p.id)) return false;
      // Keep points that are still used by entities
      return usedPoints.has(p.id);
    });

    // Update sketch data
    setSketchData(sketchEl, {
      points: filteredPoints,
      entities: filteredEntities,
      constraints: filteredConstraints,
    });
    clearSelection();
  }, [getSketchElement, selectedPoints, selectedLines, selectedConstraints, clearSelection]);

  // Check if a constraint can be applied with current selection
  const canApplyConstraint = useCallback(
    (type: ConstraintType): boolean => {
      const sketch = getSketchDataFn();
      if (!sketch) return false;
      const pointCount = selectedPoints.size;
      const lineCount = selectedLines.size;

      switch (type) {
        case "horizontal":
        case "vertical":
          return pointCount === 2 || lineCount === 1;
        case "coincident":
          return pointCount === 2;
        case "fixed":
          return pointCount === 1;
        case "distance":
          return pointCount === 2 || lineCount === 1;
        case "angle":
          return lineCount === 2;
        // Advanced constraints (Phase 19)
        case "parallel":
        case "perpendicular":
        case "equalLength":
          return lineCount === 2;
        case "tangent":
          // Need 1 line and 1 arc, but we're simplifying to lines.length >= 1
          return lineCount === 2;
        case "symmetric":
          // Need 2 points and 1 line (axis)
          return pointCount === 2 && lineCount === 1;
        default:
          return false;
      }
    },
    [getSketchDataFn, selectedPoints, selectedLines]
  );

  // Build and apply a constraint
  const applyConstraint = useCallback(
    (type: ConstraintType) => {
      const sketch = getSketchDataFn();
      if (!sketch) return;

      const pointIds = Array.from(selectedPoints);
      const lineIds = Array.from(selectedLines);
      let constraint: NewSketchConstraint | null = null;

      if (type === "fixed") {
        if (pointIds.length !== 1) return;
        constraint = { type: "fixed", point: pointIds[0] };
      } else if (type === "coincident") {
        if (pointIds.length !== 2) return;
        constraint = { type: "coincident", points: [pointIds[0], pointIds[1]] };
      } else if (type === "horizontal" || type === "vertical") {
        if (pointIds.length === 2) {
          constraint = { type, points: [pointIds[0], pointIds[1]] };
        } else if (lineIds.length === 1) {
          const line = Object.values(sketch.entitiesById).find(
            (e) => e.type === "line" && e.id === lineIds[0]
          ) as SketchLine | undefined;
          if (!line) return;
          constraint = { type, points: [line.start, line.end] };
        }
      } else if (type === "distance") {
        if (pointIds.length === 2) {
          // Calculate current distance
          const p1 = sketch.pointsById[pointIds[0]];
          const p2 = sketch.pointsById[pointIds[1]];
          if (!p1 || !p2) return;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          constraint = { type: "distance", points: [pointIds[0], pointIds[1]], value: dist };
        } else if (lineIds.length === 1) {
          const line = Object.values(sketch.entitiesById).find(
            (e) => e.type === "line" && e.id === lineIds[0]
          ) as SketchLine | undefined;
          if (!line) return;
          const p1 = sketch.pointsById[line.start];
          const p2 = sketch.pointsById[line.end];
          if (!p1 || !p2) return;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          constraint = { type: "distance", points: [line.start, line.end], value: dist };
        }
      } else if (type === "angle") {
        if (lineIds.length !== 2) return;
        // Default to 90 degrees
        constraint = { type: "angle", lines: [lineIds[0], lineIds[1]], value: 90 };
      }
      // Advanced constraints (Phase 19)
      else if (type === "parallel") {
        if (lineIds.length !== 2) return;
        constraint = { type: "parallel", lines: [lineIds[0], lineIds[1]] };
      } else if (type === "perpendicular") {
        if (lineIds.length !== 2) return;
        constraint = { type: "perpendicular", lines: [lineIds[0], lineIds[1]] };
      } else if (type === "equalLength") {
        if (lineIds.length !== 2) return;
        constraint = { type: "equalLength", lines: [lineIds[0], lineIds[1]] };
      } else if (type === "tangent") {
        // Simplified: treat as two-line constraint (full would need line+arc)
        if (lineIds.length !== 2) return;
        constraint = { type: "tangent", line: lineIds[0], arc: lineIds[1], connectionPoint: "" };
      } else if (type === "symmetric") {
        if (pointIds.length !== 2 || lineIds.length !== 1) return;
        constraint = { type: "symmetric", points: [pointIds[0], pointIds[1]], axis: lineIds[0] };
      }

      if (constraint) {
        addConstraint(constraint);
        clearSelection();
      }
    },
    [getSketchDataFn, selectedPoints, selectedLines, addConstraint, clearSelection]
  );

  // Check if there are selected entities (lines or arcs)
  const hasSelectedEntities = useCallback((): boolean => {
    return selectedLines.size > 0;
  }, [selectedLines]);

  // Toggle construction mode on selected entities
  const toggleConstruction = useCallback((): void => {
    const sketch = getSketchElement();
    if (!sketch) return;

    for (const lineId of selectedLines) {
      toggleEntityConstruction(sketch, lineId);
    }
  }, [getSketchElement, selectedLines]);

  // Sync sketch mode when following another user
  useEffect(() => {
    if (!awareness || !doc) return;

    const handleUsersChange = () => {
      // Get our local state to check if we're following someone
      const localState = awareness.getLocalState();
      const followingUserId = localState?.following?.userId;

      if (!followingUserId) {
        // Not following anyone - reset tracking state
        lastFollowedSketchIdRef.current = null;
        isFollowingSketchRef.current = false;
        return;
      }

      // Find the followed user's state
      const connectedUsers = awareness.getConnectedUsers();
      const followedUser = connectedUsers.find((u) => u.user.id === followingUserId);
      if (!followedUser) {
        // Followed user not found (maybe left)
        lastFollowedSketchIdRef.current = null;
        return;
      }

      const followedSketchId = followedUser.sketch?.sketchId ?? null;
      const lastSketchId = lastFollowedSketchIdRef.current;

      // Check if the followed user's sketch state changed
      if (followedSketchId !== lastSketchId) {
        lastFollowedSketchIdRef.current = followedSketchId;

        if (followedSketchId && !lastSketchId) {
          // Followed user entered a sketch - we should enter it too
          // Get the sketch feature to find its plane
          const sketchFeature = doc.featuresById.get(followedSketchId);
          if (sketchFeature) {
            const planeRef = sketchFeature.get("plane") as
              | { kind: string; ref: string }
              | undefined;
            if (planeRef?.ref) {
              isFollowingSketchRef.current = true;

              // NOTE: We do NOT call setView here when following.
              // The followed user's camera state will be applied via the
              // normal camera following mechanism, which already has their
              // camera oriented to the sketch plane. Calling setView here
              // causes a race condition where both try to control the camera.

              setMode({
                active: true,
                sketchId: followedSketchId,
                planeId: planeRef.ref,
                activeTool: "line",
                tempPoints: [],
                isNewSketch: false,
              });

              // Don't broadcast - we're following, not leading
              isFollowingSketchRef.current = false;
            }
          }
        } else if (!followedSketchId && lastSketchId) {
          // Followed user exited a sketch - we should exit too
          // Only exit if we're in the same sketch
          if (mode.active && mode.sketchId === lastSketchId) {
            isFollowingSketchRef.current = true;

            setMode({
              active: false,
              sketchId: null,
              planeId: null,
              activeTool: "line",
              tempPoints: [],
              isNewSketch: false,
            });

            isFollowingSketchRef.current = false;
          }
        } else if (followedSketchId && lastSketchId && followedSketchId !== lastSketchId) {
          // Followed user switched to a different sketch
          const sketchFeature = doc.featuresById.get(followedSketchId);
          if (sketchFeature) {
            const planeRef = sketchFeature.get("plane") as
              | { kind: string; ref: string }
              | undefined;
            if (planeRef?.ref) {
              isFollowingSketchRef.current = true;

              // NOTE: We do NOT call setView here when following.
              // Camera orientation comes from the followed user's camera state.

              setMode({
                active: true,
                sketchId: followedSketchId,
                planeId: planeRef.ref,
                activeTool: "line",
                tempPoints: [],
                isNewSketch: false,
              });

              isFollowingSketchRef.current = false;
            }
          }
        }
      }
    };

    // Subscribe to awareness changes
    const unsubscribe = awareness.onUsersChange(handleUsersChange);

    // Check initial state
    handleUsersChange();

    return unsubscribe;
    // Note: getViewForPlane, state.currentView, and actions are intentionally
    // not included - we don't set the view when following, we rely on camera following
  }, [awareness, doc, features, mode.active, mode.sketchId]);

  const value: SketchContextValue = {
    mode,
    sketchMousePos,
    setSketchMousePos,
    previewLine,
    setPreviewLine,
    startSketch,
    editSketch,
    finishSketch,
    cancelSketch,
    setTool,
    addPoint,
    addLine,
    addArc,
    addCircle,
    addTempPoint,
    clearTempPoints,
    getSketchPoints,
    updatePointPosition: handleUpdatePointPosition,
    findNearbyPoint,
    addRectangle,
    addAngledRectangle,
    addConstraint,
    // Selection state
    selectedPoints,
    selectedLines,
    selectedConstraints,
    setSelectedPoints,
    setSelectedLines,
    setSelectedConstraints,
    togglePointSelection,
    toggleLineSelection,
    toggleConstraintSelection,
    clearSelection,
    // Deletion helpers
    deleteSelectedItems,
    // Constraint helpers
    canApplyConstraint,
    applyConstraint,
    getSketchData: getSketchDataFn,
    // Construction geometry helpers
    toggleConstruction,
    hasSelectedEntities,
  };

  return <SketchContext.Provider value={value}>{children}</SketchContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useSketch() {
  const ctx = useContext(SketchContext);
  if (!ctx) {
    throw new Error("useSketch must be used within SketchProvider");
  }
  return ctx;
}
