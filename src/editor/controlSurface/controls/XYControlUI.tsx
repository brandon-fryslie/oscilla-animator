/**
 * XY Control Component
 *
 * Spatial intuition - used for origin points, direction + magnitude, offsets.
 *
 * UX notes from spec:
 * - Hugely powerful
 * - Visual feedback is key
 * - This often replaces four number fields
 */

import { useCallback, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { XYControl } from '../types';

interface XYControlUIProps {
  control: XYControl;
  onChange: (value: { x: number; y: number }) => void;
  onReset: () => void;
}

export const XYControlUI = observer(function XYControlUI({ control, onChange, onReset }: XYControlUIProps) {
  const { x, y, aspect, boundsHint, label } = control;
  const padRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Normalize values to [0, 1] for pad display
  const normalizedX = (x.value - x.min) / (x.max - x.min);
  const normalizedY = (y.value - y.min) / (y.max - y.min);

  // Check if value is at default
  const isAtDefault = x.value === x.default && y.value === y.default;

  const updateFromPadPosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!padRef.current) return;

      const rect = padRef.current.getBoundingClientRect();
      let normX = (clientX - rect.left) / rect.width;
      let normY = (clientY - rect.top) / rect.height;

      // Clamp to [0, 1]
      normX = Math.max(0, Math.min(1, normX));
      normY = Math.max(0, Math.min(1, normY));

      // Apply aspect constraints
      if (aspect === 'lockX') {
        normX = normalizedX;
      } else if (aspect === 'lockY') {
        normY = normalizedY;
      }

      // Denormalize to actual ranges
      const newX = normX * (x.max - x.min) + x.min;
      const newY = normY * (y.max - y.min) + y.min;

      onChange({ x: newX, y: newY });
    },
    [x, y, aspect, normalizedX, normalizedY, onChange]
  );

  // Mouse/touch handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateFromPadPosition(e.clientX, e.clientY);
    },
    [updateFromPadPosition]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updateFromPadPosition(e.clientX, e.clientY);
    },
    [isDragging, updateFromPadPosition]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle direct numeric input for X
  const handleXChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        const clamped = Math.max(x.min, Math.min(x.max, val));
        onChange({ x: clamped, y: y.value });
      }
    },
    [x, y, onChange]
  );

  // Handle direct numeric input for Y
  const handleYChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        const clamped = Math.max(y.min, Math.min(y.max, val));
        onChange({ x: x.value, y: clamped });
      }
    },
    [x, y, onChange]
  );

  return (
    <div className="control-xy">
      <div className="control-header">
        <span className="control-label">{label}</span>
        {!isAtDefault && (
          <button
            className="control-reset-btn"
            onClick={onReset}
            title="Reset to default"
          >
            ↺
          </button>
        )}
      </div>

      <div className="control-body">
        {/* XY Pad */}
        <div
          ref={padRef}
          className={`xy-pad ${isDragging ? 'dragging' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Crosshairs */}
          <div
            className="xy-crosshair xy-crosshair-h"
            style={{ top: `${normalizedY * 100}%` }}
          />
          <div
            className="xy-crosshair xy-crosshair-v"
            style={{ left: `${normalizedX * 100}%` }}
          />

          {/* Indicator */}
          <div
            className="xy-indicator"
            style={{
              left: `${normalizedX * 100}%`,
              top: `${normalizedY * 100}%`,
            }}
          />

          {/* Bounds hint */}
          {boundsHint && (
            <span className="xy-bounds-hint">
              {boundsHint === 'viewport' ? '↔ Viewport' : '□ Unit'}
            </span>
          )}
        </div>

        {/* Numeric inputs */}
        <div className="xy-inputs">
          <div className="xy-input-row">
            <label className="xy-input-label">X</label>
            <input
              type="number"
              className="xy-input"
              value={x.value.toFixed(0)}
              onChange={handleXChange}
              disabled={aspect === 'lockX'}
            />
          </div>
          <div className="xy-input-row">
            <label className="xy-input-label">Y</label>
            <input
              type="number"
              className="xy-input"
              value={y.value.toFixed(0)}
              onChange={handleYChange}
              disabled={aspect === 'lockY'}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
