/**
 * SketchCanvas - 2D overlay for sketch editing
 * 
 * Provides a 2D canvas overlay on top of the 3D viewer for creating
 * and editing sketch entities (lines, arcs, etc.)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useSketch } from '../contexts/SketchContext';
import { useDocument } from '../contexts/DocumentContext';
import { findFeature, getSketchData } from '../document/featureHelpers';
import type { SketchData, SketchLine } from '../types/document';
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
    findNearbyPoint,
  } = useSketch();
  const { doc } = useDocument();
  
  // View transform state
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [viewScale, setViewScale] = useState(20); // pixels per unit
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [tempStartPoint, setTempStartPoint] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });

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
      drawSketchEntities(ctx, sketch, sketchToCanvas);
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

    // Highlight nearby point when hovering
    if (mousePos && mode.activeTool === 'line') {
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
    mousePos,
    viewOffset,
    viewScale,
    sketchToCanvas,
    canvasToSketch,
    findNearbyPoint,
    snapToGrid,
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
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    
    const sketchPos = canvasToSketch(cx, cy);
    const snappedPos = snapToGrid(sketchPos.x, sketchPos.y);

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
  }, [
    isPanning,
    mode.activeTool,
    tempStartPoint,
    canvasToSketch,
    snapToGrid,
    findNearbyPoint,
    addPoint,
    addLine,
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

    setMousePos({ x: cx, y: cy });
  }, [isPanning, lastPanPos]);

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
    }
  }, []);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

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
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
          onClick={() => {}}
          label="Select"
        />
        <SketchToolButton 
          icon="line" 
          active={mode.activeTool === 'line'}
          onClick={() => {}}
          label="Line"
        />
      </div>
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
  sketchToCanvas: (x: number, y: number) => { x: number; y: number }
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
        ctx.strokeStyle = '#00aaff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Draw points
  for (const point of sketch.points) {
    const pos = sketchToCanvas(point.x, point.y);
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = point.fixed ? '#ffaa00' : '#00aaff';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export default SketchCanvas;
