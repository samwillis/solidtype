/**
 * SketchCanvas - 2D overlay for sketch editing
 * 
 * Provides a 2D canvas overlay on top of the 3D viewer for creating
 * and editing sketch entities (lines, arcs, etc.)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import { useKernel } from '../contexts/KernelContext';
import { useSelection } from '../contexts/SelectionContext';
import { findFeature, getSketchData, setSketchData } from '../document/featureHelpers';
import type { NewSketchConstraint, SketchConstraint, SketchData, SketchLine } from '../types/document';
import './SketchCanvas.css';

// Point merge tolerance in canvas units
const POINT_MERGE_TOLERANCE = 10;

// Grid size in sketch units
const GRID_SIZE = 1;

const SketchCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    mode,
    addPoint,
    addLine,
    addArc,
    findNearbyPoint,
    updatePointPosition,
    setTool,
    addConstraint,
  } = useSketch();
  const { doc } = useDocument();
  const { sketchSolveInfo } = useKernel();
  const { highlightedSketchId, highlightedEntityIds } = useSelection();
  
  // View transform state
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [viewScale, setViewScale] = useState(20); // pixels per unit
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [tempStartPoint, setTempStartPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [arcStartPoint, setArcStartPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [arcEndPoint, setArcEndPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [circleCenterPoint, setCircleCenterPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragLatestRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const justFinishedDragRef = useRef(false);

  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(() => new Set());
  const [selectedLines, setSelectedLines] = useState<Set<string>>(() => new Set());

  const updateConstraintValue = useCallback((constraintId: string, value: number) => {
    if (!mode.sketchId) return;
    const sketchEl = findFeature(doc.features, mode.sketchId);
    if (!sketchEl) return;
    const data = getSketchData(sketchEl);
    const c = data.constraints.find((cc) => cc.id === constraintId);
    if (!c) return;

    if (c.type === 'distance') {
      c.value = value;
    } else if (c.type === 'angle') {
      c.value = value;
    } else {
      return;
    }

    doc.ydoc.transact(() => {
      setSketchData(sketchEl, data);
    });
  }, [doc.features, doc.ydoc, mode.sketchId]);

  const deleteConstraint = useCallback((constraintId: string) => {
    if (!mode.sketchId) return;
    const sketchEl = findFeature(doc.features, mode.sketchId);
    if (!sketchEl) return;
    const data = getSketchData(sketchEl);
    const next: SketchData = {
      ...data,
      constraints: data.constraints.filter((c) => c.id !== constraintId),
    };
    doc.ydoc.transact(() => {
      setSketchData(sketchEl, next);
    });
  }, [doc.features, doc.ydoc, mode.sketchId]);

  // Get sketch data
  const getSketch = useCallback((): SketchData | null => {
    if (!mode.sketchId) return null;
    const sketch = findFeature(doc.features, mode.sketchId);
    if (!sketch) return null;
    return getSketchData(sketch);
  }, [doc.features, mode.sketchId]);

  // Convert sketch coordinates to canvas coordinates
  const sketchToCanvas = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const centerX = canvas.width / 2 + viewOffset.x;
    const centerY = canvas.height / 2 + viewOffset.y;
    
    return {
      x: centerX + sx * viewScale,
      y: centerY - sy * viewScale, // Y is inverted
    };
  }, [viewOffset, viewScale]);

  // Convert canvas coordinates to sketch coordinates
  const canvasToSketch = useCallback((cx: number, cy: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const centerX = canvas.width / 2 + viewOffset.x;
    const centerY = canvas.height / 2 + viewOffset.y;
    
    return {
      x: (cx - centerX) / viewScale,
      y: -(cy - centerY) / viewScale, // Y is inverted
    };
  }, [viewOffset, viewScale]);

  // Snap to grid
  const snapToGrid = useCallback((x: number, y: number): { x: number; y: number } => {
    return {
      x: Math.round(x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(y / GRID_SIZE) * GRID_SIZE,
    };
  }, []);

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(ctx, canvas, viewOffset, viewScale);

    // Draw axes
    drawAxes(ctx, canvas, viewOffset, viewScale);

    // Draw sketch entities
    const sketch = getSketch();
    if (sketch) {
      drawSketchEntities(
        ctx,
        sketch,
        sketchToCanvas,
        selectedPoints,
        selectedLines,
        highlightedSketchId === mode.sketchId ? highlightedEntityIds : undefined
      );
    }

    // Draw temp line if in line tool mode
    if (mode.activeTool === 'line' && tempStartPoint && mousePos) {
      const startCanvas = sketchToCanvas(tempStartPoint.x, tempStartPoint.y);
      const endSketch = canvasToSketch(mousePos.x, mousePos.y);
      const snappedEnd = snapToGrid(endSketch.x, endSketch.y);
      const endCanvas = sketchToCanvas(snappedEnd.x, snappedEnd.y);
      
      ctx.beginPath();
      ctx.moveTo(startCanvas.x, startCanvas.y);
      ctx.lineTo(endCanvas.x, endCanvas.y);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw temp arc preview
    if (mode.activeTool === 'arc' && arcStartPoint && arcEndPoint && mousePos) {
      const start = arcStartPoint;
      const end = arcEndPoint;
      const thirdSketch = canvasToSketch(mousePos.x, mousePos.y);
      const third = snapToGrid(thirdSketch.x, thirdSketch.y);

      const center = calculateArcCenter(
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
        third
      );

      if (center) {
        const startCanvas = sketchToCanvas(start.x, start.y);
        const endCanvas = sketchToCanvas(end.x, end.y);
        const centerCanvas = sketchToCanvas(center.x, center.y);

        const r = Math.hypot(startCanvas.x - centerCanvas.x, startCanvas.y - centerCanvas.y);
        const a0 = Math.atan2(startCanvas.y - centerCanvas.y, startCanvas.x - centerCanvas.x);
        const a1 = Math.atan2(endCanvas.y - centerCanvas.y, endCanvas.x - centerCanvas.x);

        const ccw = isCounterClockwise(
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
          third
        );

        ctx.beginPath();
        ctx.arc(centerCanvas.x, centerCanvas.y, r, a0, a1, ccw);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw temp circle preview
    if (mode.activeTool === 'circle' && circleCenterPoint && mousePos) {
      const centerSketch = { x: circleCenterPoint.x, y: circleCenterPoint.y };
      const edgeSketch = canvasToSketch(mousePos.x, mousePos.y);
      const edge = snapToGrid(edgeSketch.x, edgeSketch.y);
      const radius = Math.hypot(edge.x - centerSketch.x, edge.y - centerSketch.y);
      if (radius > 1e-9) {
        const c = sketchToCanvas(centerSketch.x, centerSketch.y);
        const r = radius * viewScale;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Highlight nearby point when hovering
    if (mousePos && (mode.activeTool === 'line' || mode.activeTool === 'arc' || mode.activeTool === 'circle')) {
      const sketchPos = canvasToSketch(mousePos.x, mousePos.y);
      const nearbyPoint = findNearbyPoint(
        sketchPos.x,
        sketchPos.y,
        POINT_MERGE_TOLERANCE / viewScale
      );
      if (nearbyPoint) {
        const canvasPos = sketchToCanvas(nearbyPoint.x, nearbyPoint.y);
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [
    getSketch,
    mode.activeTool,
    tempStartPoint,
    arcStartPoint,
    arcEndPoint,
    circleCenterPoint,
    mousePos,
    viewOffset,
    viewScale,
    sketchToCanvas,
    canvasToSketch,
    findNearbyPoint,
    snapToGrid,
    selectedLines,
    selectedPoints,
  ]);

  // Resize canvas when container resizes
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    });

    resizeObserver.observe(container);
    
    // Initial size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    draw();

    return () => resizeObserver.disconnect();
  }, [draw]);

  // Redraw when dependencies change
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle mouse click
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isPanning) return;
    if (justFinishedDragRef.current) {
      justFinishedDragRef.current = false;
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    
    const sketchPos = canvasToSketch(cx, cy);
    const snappedPos = snapToGrid(sketchPos.x, sketchPos.y);

    if (mode.activeTool === 'select') {
      const sketch = getSketch();
      if (!sketch) return;

      const tol = POINT_MERGE_TOLERANCE / viewScale;
      const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, tol);
      if (nearbyPoint) {
        setSelectedPoints((prev) => {
          const next = new Set(prev);
          if (next.has(nearbyPoint.id)) next.delete(nearbyPoint.id);
          else next.add(nearbyPoint.id);
          return next;
        });
        // Selecting a point clears line selection to keep UI simple
        setSelectedLines(new Set());
        return;
      }

      const nearbyLine = findNearbyLine(sketch, snappedPos.x, snappedPos.y, tol);
      if (nearbyLine) {
        setSelectedLines((prev) => {
          const next = new Set(prev);
          if (next.has(nearbyLine.id)) next.delete(nearbyLine.id);
          else next.add(nearbyLine.id);
          return next;
        });
        setSelectedPoints(new Set());
        return;
      }

      // Clicked empty space: clear selection
      setSelectedPoints(new Set());
      setSelectedLines(new Set());
      return;
    }

    if (mode.activeTool === 'line') {
      // Check for nearby existing point
      const nearbyPoint = findNearbyPoint(
        snappedPos.x,
        snappedPos.y,
        POINT_MERGE_TOLERANCE / viewScale
      );

      if (!tempStartPoint) {
        // First click - start line
        if (nearbyPoint) {
          setTempStartPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
        } else {
          setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
        }
      } else {
        // Second click - end line
        let startId: string | null | undefined = tempStartPoint.id;
        let endId: string | null = null;

        // Add start point if it doesn't exist
        if (!startId) {
          startId = addPoint(tempStartPoint.x, tempStartPoint.y);
        }

        // Add end point or reuse existing
        if (nearbyPoint) {
          endId = nearbyPoint.id ?? null;
        } else {
          endId = addPoint(snappedPos.x, snappedPos.y);
        }

        // Add line
        if (startId && endId) {
          addLine(startId, endId);
        }

        // Clear temp start and prepare for next line
        setTempStartPoint(null);
      }
    }

    if (mode.activeTool === 'arc') {
      const nearbyPoint = findNearbyPoint(
        snappedPos.x,
        snappedPos.y,
        POINT_MERGE_TOLERANCE / viewScale
      );

      if (!arcStartPoint) {
        if (nearbyPoint) {
          setArcStartPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
        } else {
          setArcStartPoint({ x: snappedPos.x, y: snappedPos.y });
        }
        setArcEndPoint(null);
        return;
      }

      if (!arcEndPoint) {
        if (nearbyPoint) {
          setArcEndPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
        } else {
          setArcEndPoint({ x: snappedPos.x, y: snappedPos.y });
        }
        return;
      }

      // Third click: define curvature via a point on the arc
      const start = arcStartPoint;
      const end = arcEndPoint;
      const third = snappedPos;
      const center = calculateArcCenter({ x: start.x, y: start.y }, { x: end.x, y: end.y }, third);
      if (!center) {
        // Collinear: reset to start over
        setArcStartPoint(null);
        setArcEndPoint(null);
        return;
      }

      const ccw = isCounterClockwise({ x: start.x, y: start.y }, { x: end.x, y: end.y }, third);

      let startId: string | null | undefined = start.id;
      let endId: string | null | undefined = end.id;
      if (!startId) startId = addPoint(start.x, start.y);
      if (!endId) endId = addPoint(end.x, end.y);
      const centerId = addPoint(center.x, center.y);

      if (startId && endId && centerId) {
        addArc(startId, endId, centerId, ccw);
      }

      setArcStartPoint(null);
      setArcEndPoint(null);
      return;
    }

    if (mode.activeTool === 'circle') {
      const nearbyPoint = findNearbyPoint(
        snappedPos.x,
        snappedPos.y,
        POINT_MERGE_TOLERANCE / viewScale
      );

      if (!circleCenterPoint) {
        if (nearbyPoint) {
          setCircleCenterPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
        } else {
          setCircleCenterPoint({ x: snappedPos.x, y: snappedPos.y });
        }
        return;
      }

      const center = circleCenterPoint;
      const radius = Math.hypot(snappedPos.x - center.x, snappedPos.y - center.y);
      if (radius <= 1e-9) {
        setCircleCenterPoint(null);
        return;
      }

      let centerId: string | null | undefined = center.id;
      if (!centerId) centerId = addPoint(center.x, center.y);

      // Use the clicked edge point as start/end to preserve the user's intent.
      let startEndId: string | null | undefined = nearbyPoint?.id ?? undefined;
      if (!startEndId) startEndId = addPoint(snappedPos.x, snappedPos.y);

      if (centerId && startEndId) {
        addArc(startEndId, startEndId, centerId, true);
      }

      setCircleCenterPoint(null);
      return;
    }
  }, [
    isPanning,
    mode.activeTool,
    getSketch,
    tempStartPoint,
    arcStartPoint,
    arcEndPoint,
    circleCenterPoint,
    canvasToSketch,
    snapToGrid,
    findNearbyPoint,
    addPoint,
    addLine,
    addArc,
    viewScale,
  ]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (isPanning) {
      const dx = cx - lastPanPos.x;
      const dy = cy - lastPanPos.y;
      setViewOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPos({ x: cx, y: cy });
    }

    if (draggingPointId) {
      const sketchPos = canvasToSketch(cx, cy);
      // Drag is intentionally "free" (no constraints yet), but we keep grid snap for now.
      const snapped = snapToGrid(sketchPos.x, sketchPos.y);

      dragLatestRef.current = { id: draggingPointId, x: snapped.x, y: snapped.y };
      if (dragRafRef.current === null) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          const latest = dragLatestRef.current;
          if (latest) {
            updatePointPosition(latest.id, latest.x, latest.y);
          }
        });
      }
    }

    setMousePos({ x: cx, y: cy });
  }, [isPanning, lastPanPos, draggingPointId, canvasToSketch, snapToGrid, updatePointPosition]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Middle mouse or left + shift for panning
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      setIsPanning(true);
      setLastPanPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      return;
    }

    if (e.button !== 0) return;
    if (mode.activeTool !== 'select') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const sketchPos = canvasToSketch(cx, cy);

    const nearbyPoint = findNearbyPoint(
      sketchPos.x,
      sketchPos.y,
      POINT_MERGE_TOLERANCE / viewScale
    );

    if (!nearbyPoint || nearbyPoint.fixed) return;

    e.preventDefault();
    setDraggingPointId(nearbyPoint.id);
  }, [canvasToSketch, findNearbyPoint, mode.activeTool, viewScale]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    if (draggingPointId) {
      justFinishedDragRef.current = true;
    }
    setDraggingPointId(null);
  }, [draggingPointId]);

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewScale((prev) => Math.max(5, Math.min(100, prev * zoomFactor)));
  }, []);

  // Handle escape to cancel current operation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTempStartPoint(null);
        setArcStartPoint(null);
        setArcEndPoint(null);
        setCircleCenterPoint(null);
        setDraggingPointId(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cleanup any pending drag RAF
  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  if (!mode.active) return null;

  return (
    <div 
      ref={containerRef} 
      className="sketch-canvas-container"
    >
      <canvas
        ref={canvasRef}
        className="sketch-canvas"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="sketch-toolbar">
        <SketchToolButton 
          icon="cursor" 
          active={mode.activeTool === 'select'}
          onClick={() => setTool('select')}
          label="Select"
        />
        <SketchToolButton 
          icon="line" 
          active={mode.activeTool === 'line'}
          onClick={() => setTool('line')}
          label="Line"
        />
        <SketchToolButton
          icon="arc"
          active={mode.activeTool === 'arc'}
          onClick={() => setTool('arc')}
          label="Arc"
        />
        <SketchToolButton
          icon="circle"
          active={mode.activeTool === 'circle'}
          onClick={() => setTool('circle')}
          label="Circle"
        />
      </div>

      <div className="sketch-constraints-toolbar">
        <button
          className="sketch-constraint-btn"
          onClick={() => {
            const constraint = buildConstraintFromSelection('horizontal', selectedPoints, selectedLines, getSketch());
            if (constraint) {
              addConstraint(constraint);
              setSelectedPoints(new Set());
              setSelectedLines(new Set());
            }
          }}
          disabled={!canBuildConstraint('horizontal', selectedPoints, selectedLines, getSketch())}
          title="Horizontal"
        >
          H
        </button>
        <button
          className="sketch-constraint-btn"
          onClick={() => {
            const constraint = buildConstraintFromSelection('vertical', selectedPoints, selectedLines, getSketch());
            if (constraint) {
              addConstraint(constraint);
              setSelectedPoints(new Set());
              setSelectedLines(new Set());
            }
          }}
          disabled={!canBuildConstraint('vertical', selectedPoints, selectedLines, getSketch())}
          title="Vertical"
        >
          V
        </button>
        <button
          className="sketch-constraint-btn"
          onClick={() => {
            const constraint = buildConstraintFromSelection('coincident', selectedPoints, selectedLines, getSketch());
            if (constraint) {
              addConstraint(constraint);
              setSelectedPoints(new Set());
              setSelectedLines(new Set());
            }
          }}
          disabled={!canBuildConstraint('coincident', selectedPoints, selectedLines, getSketch())}
          title="Coincident"
        >
          C
        </button>
        <button
          className="sketch-constraint-btn"
          onClick={() => {
            const constraint = buildConstraintFromSelection('fixed', selectedPoints, selectedLines, getSketch());
            if (constraint) {
              addConstraint(constraint);
              setSelectedPoints(new Set());
              setSelectedLines(new Set());
            }
          }}
          disabled={!canBuildConstraint('fixed', selectedPoints, selectedLines, getSketch())}
          title="Fixed"
        >
          F
        </button>
        <button
          className="sketch-constraint-btn"
          onClick={() => {
            const sketch = getSketch();
            const constraint = buildDimensionConstraintFromSelection('distance', selectedPoints, selectedLines, sketch);
            if (!constraint) return;
            addConstraint(constraint);
            setSelectedPoints(new Set());
            setSelectedLines(new Set());
          }}
          disabled={!canBuildConstraint('distance', selectedPoints, selectedLines, getSketch())}
          title="Distance"
        >
          D
        </button>
        <button
          className="sketch-constraint-btn"
          onClick={() => {
            const sketch = getSketch();
            const constraint = buildDimensionConstraintFromSelection('angle', selectedPoints, selectedLines, sketch);
            if (!constraint) return;
            addConstraint(constraint);
            setSelectedPoints(new Set());
            setSelectedLines(new Set());
          }}
          disabled={!canBuildConstraint('angle', selectedPoints, selectedLines, getSketch())}
          title="Angle"
        >
          ∠
        </button>
      </div>

      {/* Simple dimension editor (Phase 08) */}
      {(() => {
        const sketch = getSketch();
        if (!sketch) return null;
        const dims = sketch.constraints.filter((c) => c.type === 'distance' || c.type === 'angle') as Array<
          Extract<SketchConstraint, { type: 'distance' | 'angle' }>
        >;
        if (dims.length === 0) return null;

        return (
          <div className="sketch-dimensions-panel">
            <div className="sketch-dimensions-title">Dimensions</div>
            {dims.map((c) => (
              <div key={c.id} className="sketch-dimension-row">
                <span className="sketch-dimension-label">
                  {c.type === 'distance' ? 'D' : '∠'} {c.id}
                </span>
                <input
                  className="sketch-dimension-input"
                  type="number"
                  value={c.value}
                  onChange={(e) => updateConstraintValue(c.id, parseFloat(e.target.value) || 0)}
                  step={c.type === 'distance' ? 1 : 1}
                />
                <span className="sketch-dimension-unit">
                  {c.type === 'distance' ? '' : '°'}
                </span>
                <button
                  className="sketch-dimension-delete"
                  type="button"
                  title="Delete constraint"
                  onClick={() => deleteConstraint(c.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        );
      })()}
      <div className="sketch-info">
        {mousePos && (
          <span>
            {(() => {
              const pos = canvasToSketch(mousePos.x, mousePos.y);
              const snapped = snapToGrid(pos.x, pos.y);
              return `X: ${snapped.x.toFixed(1)}, Y: ${snapped.y.toFixed(1)}`;
            })()}
          </span>
        )}
        {mode.sketchId && sketchSolveInfo[mode.sketchId] && (
          <span className="sketch-solve-status">
            {(() => {
              const info = sketchSolveInfo[mode.sketchId!];
              const dof = info.dof;
              if (!dof) return `Solve: ${info.status}`;
              const tag = dof.isOverConstrained
                ? 'Over'
                : dof.isFullyConstrained
                  ? 'Fully'
                  : `DOF ${dof.remainingDOF}`;
              return `Solve: ${info.status} • ${tag}`;
            })()}
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Helper Components
// ============================================================================

interface SketchToolButtonProps {
  icon: string;
  active: boolean;
  onClick: () => void;
  label: string;
}

const SketchToolButton: React.FC<SketchToolButtonProps> = ({
  icon,
  active,
  onClick,
  label,
}) => (
  <button
    className={`sketch-tool-btn ${active ? 'active' : ''}`}
    onClick={onClick}
    title={label}
  >
    {icon === 'cursor' && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3l7 19 2-7 7-2z" />
      </svg>
    )}
    {icon === 'line' && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="19" x2="19" y2="5" />
      </svg>
    )}
    {icon === 'arc' && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 18a8 8 0 0112 0" />
      </svg>
    )}
    {icon === 'circle' && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="7" />
      </svg>
    )}
  </button>
);

// ============================================================================
// Drawing Helpers
// ============================================================================

function drawGrid(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viewOffset: { x: number; y: number },
  viewScale: number
): void {
  const gridSpacing = viewScale; // 1 unit = viewScale pixels
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;

  const centerX = canvas.width / 2 + viewOffset.x;
  const centerY = canvas.height / 2 + viewOffset.y;

  // Vertical lines
  const startX = centerX % gridSpacing;
  for (let x = startX; x < canvas.width; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Horizontal lines
  const startY = centerY % gridSpacing;
  for (let y = startY; y < canvas.height; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viewOffset: { x: number; y: number },
  _viewScale: number
): void {
  const centerX = canvas.width / 2 + viewOffset.x;
  const centerY = canvas.height / 2 + viewOffset.y;

  // X axis (red)
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(canvas.width, centerY);
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Y axis (green)
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, canvas.height);
  ctx.strokeStyle = '#44ff44';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Origin dot
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function drawSketchEntities(
  ctx: CanvasRenderingContext2D,
  sketch: SketchData,
  sketchToCanvas: (x: number, y: number) => { x: number; y: number },
  selectedPoints: Set<string>,
  selectedLines: Set<string>,
  highlightedLines?: Set<string>
): void {
  // Draw lines
  for (const entity of sketch.entities) {
    if (entity.type === 'line') {
      const line = entity as SketchLine;
      const startPoint = sketch.points.find((p) => p.id === line.start);
      const endPoint = sketch.points.find((p) => p.id === line.end);
      
      if (startPoint && endPoint) {
        const start = sketchToCanvas(startPoint.x, startPoint.y);
        const end = sketchToCanvas(endPoint.x, endPoint.y);
        
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        const isSelected = selectedLines.has(line.id);
        const isHighlighted = highlightedLines?.has(line.id) ?? false;
        ctx.strokeStyle = isSelected ? '#ffff00' : isHighlighted ? '#ffaa00' : '#00aaff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Draw arcs
  for (const entity of sketch.entities) {
    if (entity.type !== 'arc') continue;
    const start = sketch.points.find((p) => p.id === (entity as any).start);
    const end = sketch.points.find((p) => p.id === (entity as any).end);
    const center = sketch.points.find((p) => p.id === (entity as any).center);
    const ccw = Boolean((entity as any).ccw);
    if (!start || !end || !center) continue;

    const s = sketchToCanvas(start.x, start.y);
    const e = sketchToCanvas(end.x, end.y);
    const c = sketchToCanvas(center.x, center.y);
    const r = Math.hypot(s.x - c.x, s.y - c.y);

    ctx.beginPath();
    if (start.id === end.id) {
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    } else {
      const a0 = Math.atan2(s.y - c.y, s.x - c.x);
      const a1 = Math.atan2(e.y - c.y, e.x - c.x);
      ctx.arc(c.x, c.y, r, a0, a1, ccw);
    }
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw points
  for (const point of sketch.points) {
    const pos = sketchToCanvas(point.x, point.y);
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = selectedPoints.has(point.id)
      ? '#ffff00'
      : point.fixed
        ? '#ffaa00'
        : '#00aaff';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Constraint indicators (lightweight visual hints)
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (const c of sketch.constraints) {
    // Skip dimensions here (handled in a panel; on-canvas dims can come later).
    if (c.type === 'distance' || c.type === 'angle') continue;
    const label =
      c.type === 'horizontal'
        ? 'H'
        : c.type === 'vertical'
          ? 'V'
          : c.type === 'coincident'
            ? 'C'
            : c.type === 'fixed'
              ? 'F'
              : '?';

    if (c.type === 'fixed') {
      const p = sketch.points.find((pt) => pt.id === c.point);
      if (!p) continue;
      const pos = sketchToCanvas(p.x, p.y);
      ctx.fillText(label, pos.x + 6, pos.y - 6);
      continue;
    }

    if (c.type === 'coincident' || c.type === 'horizontal' || c.type === 'vertical') {
      const [a, b] = c.points ?? [];
      const p1 = sketch.points.find((pt) => pt.id === a);
      const p2 = sketch.points.find((pt) => pt.id === b);
      const p = p1 ?? p2;
      if (!p) continue;
      if (p1 && p2 && (c.type === 'horizontal' || c.type === 'vertical')) {
        const mid = sketchToCanvas((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5);
        ctx.fillText(label, mid.x + 6, mid.y - 6);
      } else {
        const pos = sketchToCanvas(p.x, p.y);
        ctx.fillText(label, pos.x + 6, pos.y - 6);
      }
      continue;
    }
  }
}

function calculateArcCenter(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { x: number; y: number } | null {
  const ax = p1.x;
  const ay = p1.y;
  const bx = p2.x;
  const by = p2.y;
  const cx = p3.x;
  const cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;

  return { x: ux, y: uy };
}

function isCounterClockwise(
  start: { x: number; y: number },
  end: { x: number; y: number },
  third: { x: number; y: number }
): boolean {
  const v1x = end.x - start.x;
  const v1y = end.y - start.y;
  const v2x = third.x - start.x;
  const v2y = third.y - start.y;
  return v1x * v2y - v1y * v2x > 0;
}

function canBuildConstraint(
  type: SketchConstraint['type'],
  selectedPoints: Set<string>,
  selectedLines: Set<string>,
  sketch: SketchData | null
): boolean {
  if (!sketch) return false;
  const points = Array.from(selectedPoints);
  const lines = Array.from(selectedLines);

  switch (type) {
    case 'horizontal':
    case 'vertical':
      return points.length === 2 || lines.length === 1;
    case 'coincident':
      return points.length === 2;
    case 'fixed':
      return points.length === 1;
    case 'distance':
      return points.length === 2 || lines.length === 1;
    case 'angle':
      return lines.length === 2;
    default:
      return false;
  }
}

function buildConstraintFromSelection(
  type: SketchConstraint['type'],
  selectedPoints: Set<string>,
  selectedLines: Set<string>,
  sketch: SketchData | null
): NewSketchConstraint | null {
  if (!sketch) return null;
  const points = Array.from(selectedPoints);
  const lines = Array.from(selectedLines);

  if (type === 'fixed') {
    if (points.length !== 1) return null;
    return { type: 'fixed', point: points[0] };
  }

  if (type === 'coincident') {
    if (points.length !== 2) return null;
    return { type: 'coincident', points: [points[0], points[1]] };
  }

  if (type === 'horizontal' || type === 'vertical') {
    if (points.length === 2) {
      return { type, points: [points[0], points[1]] };
    }
    if (lines.length === 1) {
      const line = sketch.entities.find((e) => e.type === 'line' && e.id === lines[0]) as SketchLine | undefined;
      if (!line) return null;
      return { type, points: [line.start, line.end] };
    }
    return null;
  }

  return null;
}

function buildDimensionConstraintFromSelection(
  type: 'distance' | 'angle',
  selectedPoints: Set<string>,
  selectedLines: Set<string>,
  sketch: SketchData | null
): NewSketchConstraint | null {
  if (!sketch) return null;
  const points = Array.from(selectedPoints);
  const lines = Array.from(selectedLines);

  if (type === 'distance') {
    let p1: string | null = null;
    let p2: string | null = null;

    if (points.length === 2) {
      p1 = points[0];
      p2 = points[1];
    } else if (lines.length === 1) {
      const line = sketch.entities.find((e) => e.type === 'line' && e.id === lines[0]) as SketchLine | undefined;
      if (!line) return null;
      p1 = line.start;
      p2 = line.end;
    } else {
      return null;
    }

    const a = sketch.points.find((p) => p.id === p1);
    const b = sketch.points.find((p) => p.id === p2);
    if (!a || !b) return null;
    const current = Math.hypot(b.x - a.x, b.y - a.y);
    const raw = window.prompt('Distance', String(Number.isFinite(current) ? current.toFixed(3) : 10));
    if (raw === null) return null;
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return { type: 'distance', points: [p1, p2], value };
  }

  // angle
  if (lines.length !== 2) return null;
  const l1 = sketch.entities.find((e) => e.type === 'line' && e.id === lines[0]) as SketchLine | undefined;
  const l2 = sketch.entities.find((e) => e.type === 'line' && e.id === lines[1]) as SketchLine | undefined;
  if (!l1 || !l2) return null;

  const a0 = sketch.points.find((p) => p.id === l1.start);
  const a1 = sketch.points.find((p) => p.id === l1.end);
  const b0 = sketch.points.find((p) => p.id === l2.start);
  const b1 = sketch.points.find((p) => p.id === l2.end);
  if (!a0 || !a1 || !b0 || !b1) return null;

  const ax = a1.x - a0.x;
  const ay = a1.y - a0.y;
  const bx = b1.x - b0.x;
  const by = b1.y - b0.y;
  const aLen = Math.hypot(ax, ay);
  const bLen = Math.hypot(bx, by);
  if (aLen === 0 || bLen === 0) return null;

  const dot = (ax * bx + ay * by) / (aLen * bLen);
  const clamped = Math.max(-1, Math.min(1, dot));
  const currentDeg = (Math.acos(clamped) * 180) / Math.PI;
  const raw = window.prompt('Angle (deg)', String(Number.isFinite(currentDeg) ? currentDeg.toFixed(2) : 90));
  if (raw === null) return null;
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return null;

  return { type: 'angle', lines: [l1.id, l2.id], value };
}

function findNearbyLine(
  sketch: SketchData,
  x: number,
  y: number,
  tolerance: number
): SketchLine | null {
  let best: { line: SketchLine; dist2: number } | null = null;

  const p: [number, number] = [x, y];
  for (const entity of sketch.entities) {
    if (entity.type !== 'line') continue;
    const line = entity as SketchLine;
    const a = sketch.points.find((pt) => pt.id === line.start);
    const b = sketch.points.find((pt) => pt.id === line.end);
    if (!a || !b) continue;

    const d2 = pointSegmentDistanceSquared(p, [a.x, a.y], [b.x, b.y]);
    if (d2 <= tolerance * tolerance) {
      if (!best || d2 < best.dist2) {
        best = { line, dist2: d2 };
      }
    }
  }

  return best ? best.line : null;
}

function pointSegmentDistanceSquared(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 === 0) return apx * apx + apy * apy;

  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return dx * dx + dy * dy;
}

export default SketchCanvas;
