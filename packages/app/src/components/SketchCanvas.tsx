/**
 * SketchCanvas - 2D overlay for sketch editing
 * 
 * Provides a 2D canvas overlay on top of the 3D viewer for creating
 * and editing sketch entities (lines, arcs, etc.)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import { useSelection } from '../contexts/SelectionContext';
import { useViewer } from '../contexts/ViewerContext';
import { findFeature, getSketchData, setSketchData } from '../document/featureHelpers';
import type { SketchConstraint, SketchData, SketchLine } from '../types/document';
import './SketchCanvas.css';

// Point merge tolerance in sketch units (mm)
const POINT_MERGE_TOLERANCE_MM = 5;

// Grid size in sketch units
const GRID_SIZE = 1;

// Camera FOV in degrees (must match Viewer.tsx)
const CAMERA_FOV = 45;

const SketchCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    mode,
    addPoint,
    addLine,
    addArc,
    addRectangle,
    findNearbyPoint,
    setSketchMousePos,
    setPreviewLine,
    finishSketch,
    cancelSketch,
    selectedPoints,
    selectedLines,
    togglePointSelection,
    toggleLineSelection,
    clearSelection,
  } = useSketch();
  const { doc, units } = useDocument();
  const { highlightedSketchId, highlightedEntityIds } = useSelection();
  const { cameraStateRef, screenToSketch } = useViewer();
  
  // View transform state (kept for 2D canvas drawing only)
  const [viewOffset] = useState({ x: 0, y: 0 });
  const [cameraVersion, setCameraVersion] = useState(0);
  // Store sketch coordinates from ray casting
  const [sketchPos, setSketchPos] = useState<{ x: number; y: number } | null>(null);
  
  // Poll camera state to sync viewScale with 3D camera
  useEffect(() => {
    if (!mode.active) return;
    const interval = setInterval(() => {
      if (cameraStateRef.current.version !== cameraVersion) {
        setCameraVersion(cameraStateRef.current.version);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [mode.active, cameraStateRef, cameraVersion]);
  
  // Compute viewScale from camera distance (for 2D canvas drawing only)
  const viewScale = useMemo(() => {
    const canvas = canvasRef.current;
    if (!canvas) return 2; // Default fallback
    
    // Get camera distance from cameraStateRef
    const distance = cameraStateRef.current.distance || 350;
    
    // Calculate pixels per mm based on perspective projection
    // At distance D with FOV, visible height = 2 * D * tan(FOV/2)
    const fovRad = (CAMERA_FOV * Math.PI) / 180;
    const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
    const pixelsPerMm = canvas.height / visibleHeight;
    
    return Math.max(0.5, pixelsPerMm);
  }, [cameraVersion, cameraStateRef]);
  
  // Convert screen coordinates to sketch coordinates using 3D ray casting
  const screenToSketchCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!mode.planeId) return null;
    return screenToSketch(clientX, clientY, mode.planeId);
  }, [mode.planeId, screenToSketch]);
  const [tempStartPoint, setTempStartPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [arcStartPoint, setArcStartPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [arcEndPoint, setArcEndPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [circleCenterPoint, setCircleCenterPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  
  // Track mouse down position for distinguishing clicks from drags
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingViewRef = useRef(false);
  const DRAG_THRESHOLD = 5; // pixels of movement to consider it a drag

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


  // Snap to grid
  const snapToGrid = useCallback((x: number, y: number): { x: number; y: number } => {
    return {
      x: Math.round(x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(y / GRID_SIZE) * GRID_SIZE,
    };
  }, []);

  // Draw the canvas (now only draws temporary construction elements)
  // The actual sketch geometry is rendered in 3D by the Viewer component
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear canvas (transparent background - 3D view shows through)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get sketch data for selection highlighting (drawn as subtle overlays)
    const sketch = getSketch();
    if (sketch) {
      // Draw selection highlights only (not the main geometry which is in 3D)
      drawSketchSelectionHighlights(
        ctx,
        sketch,
        sketchToCanvas,
        selectedPoints,
        selectedLines,
        highlightedSketchId === mode.sketchId ? highlightedEntityIds : undefined
      );
    }

    // Note: Preview lines (line, arc, circle) are now rendered in 3D by the Viewer
    // using the previewLine context value for perfect alignment with the 3D scene.
    // Only selection highlights are drawn on the 2D canvas overlay.
  }, [
    getSketch,
    mode.sketchId,
    sketchToCanvas,
    selectedLines,
    selectedPoints,
    highlightedSketchId,
    highlightedEntityIds,
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

  // Update preview line in context for 3D rendering by Viewer
  useEffect(() => {
    if (!mode.active) {
      setPreviewLine(null);
      return;
    }
    
    // Line tool: preview from tempStartPoint to current mouse position
    if (mode.activeTool === 'line' && tempStartPoint && sketchPos) {
      setPreviewLine({
        start: { x: tempStartPoint.x, y: tempStartPoint.y },
        end: { x: sketchPos.x, y: sketchPos.y },
      });
    } else {
      setPreviewLine(null);
    }
  }, [mode.active, mode.activeTool, tempStartPoint, sketchPos, setPreviewLine]);

  // Note: Mouse handling has been moved to document-level event listeners
  // to allow events to pass through to the Viewer for rotation

  // Handle escape to cancel current operation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTempStartPoint(null);
        setArcStartPoint(null);
        setArcEndPoint(null);
        setCircleCenterPoint(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Use document-level event listeners so events pass through to Viewer for rotation
  // but we can still detect clicks for sketch operations
  useEffect(() => {
    if (!mode.active) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const isWithinCanvas = (e: MouseEvent): boolean => {
      const rect = canvas.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right &&
             e.clientY >= rect.top && e.clientY <= rect.bottom;
    };
    
    const onDocumentMouseDown = (e: MouseEvent) => {
      if (!isWithinCanvas(e)) return;
      
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      
      mouseDownPosRef.current = { x: cx, y: cy };
      isDraggingViewRef.current = false;
    };
    
    const onDocumentMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      
      // Track if we're dragging
      if (mouseDownPosRef.current && !isDraggingViewRef.current) {
        const dx = cx - mouseDownPosRef.current.x;
        const dy = cy - mouseDownPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          isDraggingViewRef.current = true;
        }
      }
      
      // Update sketch coordinates using 3D ray casting
      if (isWithinCanvas(e)) {
        const sketchCoords = screenToSketchCoords(e.clientX, e.clientY);
        if (sketchCoords) {
          const snapped = snapToGrid(sketchCoords.x, sketchCoords.y);
          setSketchPos(snapped);
          setSketchMousePos({ x: snapped.x, y: snapped.y });
        }
      } else {
        setSketchMousePos(null);
        setSketchPos(null);
      }
    };
    
    const onDocumentMouseUp = (e: MouseEvent) => {
      if (!isWithinCanvas(e)) {
        mouseDownPosRef.current = null;
        isDraggingViewRef.current = false;
        return;
      }
      
      const wasDragging = isDraggingViewRef.current;
      mouseDownPosRef.current = null;
      isDraggingViewRef.current = false;
      
      // If we were dragging (rotating), don't trigger tool action
      if (wasDragging) return;
      
      // This was a click - trigger tool action
      if (e.button !== 0) return;
      
      // Pass screen coordinates (clientX/clientY) for 3D ray casting
      const clickEvent = new CustomEvent('sketchclick', {
        detail: { clientX: e.clientX, clientY: e.clientY }
      });
      canvas.dispatchEvent(clickEvent);
    };
    
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);
    
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('mousemove', onDocumentMouseMove);
      document.removeEventListener('mouseup', onDocumentMouseUp);
    };
  }, [mode.active]);

  // Handle custom sketch click events
  useEffect(() => {
    if (!mode.active) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const onSketchClick = (e: Event) => {
      const { clientX, clientY } = (e as CustomEvent).detail;
      
      // Convert screen coordinates to sketch coordinates using 3D ray casting
      const sketchCoords = screenToSketchCoords(clientX, clientY);
      if (!sketchCoords) return;
      
      const snappedPos = snapToGrid(sketchCoords.x, sketchCoords.y);

      if (mode.activeTool === 'select') {
        const sketch = getSketch();
        if (!sketch) return;

        const tol = POINT_MERGE_TOLERANCE_MM;
        const nearbyPoint = findNearbyPoint(snappedPos.x, snappedPos.y, tol);
        if (nearbyPoint) {
          togglePointSelection(nearbyPoint.id);
          return;
        }

        const nearbyLine = findNearbyLine(sketch, snappedPos.x, snappedPos.y, tol);
        if (nearbyLine) {
          toggleLineSelection(nearbyLine.id);
          return;
        }

        clearSelection();
        return;
      }

      if (mode.activeTool === 'line') {
        const nearbyPoint = findNearbyPoint(
          snappedPos.x,
          snappedPos.y,
          POINT_MERGE_TOLERANCE_MM
        );

        if (!tempStartPoint) {
          if (nearbyPoint) {
            setTempStartPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
          } else {
            setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          let startId: string | null | undefined = tempStartPoint.id;
          let endId: string | null = null;

          if (!startId) {
            startId = addPoint(tempStartPoint.x, tempStartPoint.y);
          }

          if (nearbyPoint) {
            endId = nearbyPoint.id ?? null;
          } else {
            endId = addPoint(snappedPos.x, snappedPos.y);
          }

          if (startId && endId) {
            addLine(startId, endId);
          }

          setTempStartPoint(null);
        }
        return;
      }

      if (mode.activeTool === 'arc') {
        const nearbyPoint = findNearbyPoint(
          snappedPos.x,
          snappedPos.y,
          POINT_MERGE_TOLERANCE_MM
        );

        if (!arcStartPoint) {
          if (nearbyPoint) {
            setArcStartPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
          } else {
            setArcStartPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else if (!arcEndPoint) {
          if (nearbyPoint) {
            setArcEndPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
          } else {
            setArcEndPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          let startId = arcStartPoint.id;
          let endId = arcEndPoint.id;
          let centerId: string | null = null;

          if (!startId) {
            startId = addPoint(arcStartPoint.x, arcStartPoint.y) ?? undefined;
          }
          if (!endId) {
            endId = addPoint(arcEndPoint.x, arcEndPoint.y) ?? undefined;
          }

          if (nearbyPoint) {
            centerId = nearbyPoint.id ?? null;
          } else {
            centerId = addPoint(snappedPos.x, snappedPos.y);
          }

          if (startId && endId && centerId) {
            const ccw = isCounterClockwise(
              { x: arcStartPoint.x, y: arcStartPoint.y },
              { x: arcEndPoint.x, y: arcEndPoint.y },
              { x: snappedPos.x, y: snappedPos.y }
            );
            addArc(startId, endId, centerId, ccw);
          }

          setArcStartPoint(null);
          setArcEndPoint(null);
        }
        return;
      }

      if (mode.activeTool === 'circle') {
        const nearbyPoint = findNearbyPoint(
          snappedPos.x,
          snappedPos.y,
          POINT_MERGE_TOLERANCE_MM
        );

        if (!circleCenterPoint) {
          if (nearbyPoint) {
            setCircleCenterPoint({ x: nearbyPoint.x, y: nearbyPoint.y, id: nearbyPoint.id ?? undefined });
          } else {
            setCircleCenterPoint({ x: snappedPos.x, y: snappedPos.y });
          }
        } else {
          let centerId = circleCenterPoint.id;
          let edgeId: string | null = null;

          if (!centerId) {
            centerId = addPoint(circleCenterPoint.x, circleCenterPoint.y) ?? undefined;
          }

          if (nearbyPoint) {
            edgeId = nearbyPoint.id ?? null;
          } else {
            edgeId = addPoint(snappedPos.x, snappedPos.y);
          }

          if (centerId && edgeId) {
            addArc(edgeId, edgeId, centerId, true);
          }

          setCircleCenterPoint(null);
        }
        return;
      }

      if (mode.activeTool === 'rectangle') {
        if (!tempStartPoint) {
          setTempStartPoint({ x: snappedPos.x, y: snappedPos.y });
        } else {
          const x1 = tempStartPoint.x;
          const y1 = tempStartPoint.y;
          const x2 = snappedPos.x;
          const y2 = snappedPos.y;

          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;

          if (width > 0.001 && height > 0.001) {
            addRectangle(centerX, centerY, width, height);
          }

          setTempStartPoint(null);
        }
        return;
      }
    };
    
    canvas.addEventListener('sketchclick', onSketchClick);
    return () => canvas.removeEventListener('sketchclick', onSketchClick);
  }, [
    mode.active,
    mode.activeTool,
    screenToSketchCoords,
    snapToGrid,
    getSketch,
    findNearbyPoint,
    tempStartPoint,
    arcStartPoint,
    arcEndPoint,
    circleCenterPoint,
    addPoint,
    addLine,
    addArc,
    addRectangle,
  ]);

  if (!mode.active) return null;

  return (
    <div 
      ref={containerRef} 
      className="sketch-canvas-container"
    >
      <canvas
        ref={canvasRef}
        className="sketch-canvas"
      />
      <div className="sketch-actions-overlay">
        <button 
          className="sketch-action-btn sketch-action-accept"
          onClick={finishSketch}
          title="Accept Sketch (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Accept
        </button>
        <button 
          className="sketch-action-btn sketch-action-cancel"
          onClick={cancelSketch}
          title="Cancel Sketch (Escape)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Cancel
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
                  {c.type === 'distance' ? units : '°'}
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
    </div>
  );
};

// ============================================================================
// Helper Components
// ============================================================================

// ============================================================================
// Drawing Helpers
// ============================================================================

/**
 * Draw selection highlights only (main geometry is rendered in 3D by Viewer using Line2)
 */
function drawSketchSelectionHighlights(
  ctx: CanvasRenderingContext2D,
  sketch: SketchData,
  sketchToCanvas: (x: number, y: number) => { x: number; y: number },
  selectedPoints: Set<string>,
  selectedLines: Set<string>,
  highlightedLines?: Set<string>
): void {
  // Only draw selected/highlighted lines with a subtle glow effect
  for (const entity of sketch.entities) {
    if (entity.type === 'line') {
      const line = entity as SketchLine;
      const isSelected = selectedLines.has(line.id);
      const isHighlighted = highlightedLines?.has(line.id) ?? false;
      
      if (!isSelected && !isHighlighted) continue;
      
      const startPoint = sketch.points.find((p) => p.id === line.start);
      const endPoint = sketch.points.find((p) => p.id === line.end);
      
      if (startPoint && endPoint) {
        const start = sketchToCanvas(startPoint.x, startPoint.y);
        const end = sketchToCanvas(endPoint.x, endPoint.y);
        
        // Draw glow effect for selection
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = isSelected ? 'rgba(255, 255, 0, 0.6)' : 'rgba(255, 170, 0, 0.4)';
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    }
  }

  // Draw selection highlights for points
  for (const point of sketch.points) {
    if (!selectedPoints.has(point.id)) continue;
    
    const pos = sketchToCanvas(point.x, point.y);
    
    // Draw selection ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Constraint indicators (lightweight visual hints) - keep these as 2D overlay
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  
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
      ctx.strokeText(label, pos.x + 6, pos.y - 6);
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
        ctx.strokeText(label, mid.x + 6, mid.y - 6);
        ctx.fillText(label, mid.x + 6, mid.y - 6);
      } else {
        const pos = sketchToCanvas(p.x, p.y);
        ctx.strokeText(label, pos.x + 6, pos.y - 6);
        ctx.fillText(label, pos.x + 6, pos.y - 6);
      }
      continue;
    }
  }
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
