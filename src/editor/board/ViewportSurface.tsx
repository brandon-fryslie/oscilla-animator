/**
 * ViewportSurface Component
 *
 * Handles pan/zoom transforms and user interactions.
 * Applies CSS transform to child content.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md (D2)
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import type { ViewportState } from '../stores/ViewportStore';
import './Board.css';

export interface ViewportSurfaceProps {
  viewport: ViewportState;
  onViewportChange: (state: Partial<ViewportState>) => void;
  onZoomToFit: () => void;
  children: React.ReactNode;
}

/**
 * ViewportSurface handles pan/zoom and applies transform to children.
 */
export const ViewportSurface = observer<ViewportSurfaceProps>(function ViewportSurface({
  viewport,
  onViewportChange,
  onZoomToFit,
  children,
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Mouse down - start panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only pan with left mouse button or middle button
      if (e.button !== 0 && e.button !== 1) return;

      setIsPanning(true);
      setPanStart({ x: e.clientX - viewport.panX, y: e.clientY - viewport.panY });
      e.preventDefault();
    },
    [viewport.panX, viewport.panY]
  );

  // Mouse move - pan
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isPanning) return;

      const panX = e.clientX - panStart.x;
      const panY = e.clientY - panStart.y;

      onViewportChange({ panX, panY });
    },
    [isPanning, panStart, onViewportChange]
  );

  // Mouse up - stop panning
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Wheel - zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const surface = surfaceRef.current;
      if (!surface) return;

      // Get mouse position relative to surface
      const rect = surface.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Compute zoom delta
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = viewport.zoom * delta;

      // Zoom to cursor position
      // World point under cursor should remain under cursor after zoom
      const worldX = (mouseX - viewport.panX) / viewport.zoom;
      const worldY = (mouseY - viewport.panY) / viewport.zoom;

      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;

      onViewportChange({
        zoom: newZoom,
        panX: newPanX,
        panY: newPanY,
      });
    },
    [viewport, onViewportChange]
  );

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // F - zoom to fit
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        onZoomToFit();
      }

      // Ctrl/Cmd + - zoom out
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '-' || e.key === '_')
      ) {
        e.preventDefault();
        const newZoom = viewport.zoom * 0.9;
        onViewportChange({ zoom: newZoom });
      }

      // Ctrl/Cmd + = zoom in
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '=' || e.key === '+')
      ) {
        e.preventDefault();
        const newZoom = viewport.zoom * 1.1;
        onViewportChange({ zoom: newZoom });
      }

      // Ctrl/Cmd + 0 - reset zoom
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        onViewportChange({ zoom: 1.0 });
      }
    },
    [viewport.zoom, onViewportChange, onZoomToFit]
  );

  // Set up event listeners
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    // Mouse events
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Wheel event (passive: false to allow preventDefault)
    surface.addEventListener('wheel', handleWheel, { passive: false });

    // Keyboard events
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      surface.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleMouseMove, handleMouseUp, handleWheel, handleKeyDown]);

  // Apply transform to content
  const transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;

  return (
    <div
      ref={surfaceRef}
      className={`viewport-surface ${isPanning ? 'panning' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="viewport-content no-select" style={{ transform }}>
        {children}
      </div>
    </div>
  );
});
