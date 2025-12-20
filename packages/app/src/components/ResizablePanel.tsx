import React, { useRef, useState, useCallback, useEffect } from 'react';
import './ResizablePanel.css';

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  side: 'left' | 'right';
  visible?: boolean;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  defaultWidth,
  minWidth = 150,
  maxWidth = 600,
  side,
  visible = true,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const delta = side === 'left' 
        ? e.clientX - startXRef.current
        : startXRef.current - e.clientX;
      
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [side, minWidth, maxWidth]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className={`resizable-panel resizable-panel-${side}`}
      style={{ width }}
    >
      <div className="resizable-panel-content">
        {children}
      </div>
      <div
        className={`resizable-panel-handle resizable-panel-handle-${side}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

interface ResizableSplitProps {
  topChild: React.ReactNode;
  bottomChild: React.ReactNode;
  defaultRatio?: number; // 0-1, ratio of top section
  minTopHeight?: number;
  minBottomHeight?: number;
}

export const ResizableSplit: React.FC<ResizableSplitProps> = ({
  topChild,
  bottomChild,
  defaultRatio = 0.5,
  minTopHeight = 100,
  minBottomHeight = 100,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(defaultRatio);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const containerHeight = rect.height;
      const mouseY = e.clientY - rect.top;
      
      // Calculate new ratio, respecting min heights
      const newRatio = Math.min(
        1 - minBottomHeight / containerHeight,
        Math.max(minTopHeight / containerHeight, mouseY / containerHeight)
      );
      
      setRatio(newRatio);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minTopHeight, minBottomHeight]);

  return (
    <div ref={containerRef} className="resizable-split">
      <div className="resizable-split-top" style={{ flex: ratio }}>
        {topChild}
      </div>
      <div className="resizable-split-handle" onMouseDown={handleMouseDown}>
        <div className="resizable-split-handle-line" />
      </div>
      <div className="resizable-split-bottom" style={{ flex: 1 - ratio }}>
        {bottomChild}
      </div>
    </div>
  );
};
