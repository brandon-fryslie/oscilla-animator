/**
 * Number Control Component
 *
 * The workhorse control - used for timing, distances, intensities, weights.
 *
 * UX notes from spec:
 * - Slider is primary
 * - Numeric field is secondary (click-to-edit)
 * - Curve matters more than step for "feel"
 * - Exp curves are huge for time and motion
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import type { NumberControl } from '../types';

interface NumberControlUIProps {
  control: NumberControl;
  onChange: (value: number) => void;
  onReset: () => void;
}

/**
 * Apply response curve to normalize a value from [0,1] to the curve shape.
 */
function applyCurve(normalized: number, curve: NumberControl['curve']): number {
  switch (curve) {
    case 'exp':
      // Exponential - more resolution at low end
      return normalized * normalized;
    case 'log':
      // Logarithmic - more resolution at high end
      return Math.sqrt(normalized);
    case 'sCurve':
      // S-curve (smoothstep) - more resolution at extremes
      return normalized * normalized * (3 - 2 * normalized);
    case 'linear':
    default:
      return normalized;
  }
}

/**
 * Invert the curve to get slider position from actual value.
 */
function invertCurve(curved: number, curve: NumberControl['curve']): number {
  switch (curve) {
    case 'exp':
      return Math.sqrt(curved);
    case 'log':
      return curved * curved;
    case 'sCurve':
      // Approximate inverse of smoothstep
      // For now, use linear approximation
      return curved;
    case 'linear':
    default:
      return curved;
  }
}

export const NumberControlUI = observer(function NumberControlUI({ control, onChange, onReset }: NumberControlUIProps) {
  const { min, max, value, step, unit, curve, label } = control;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Normalize value to [0, 1]
  const normalizedValue = (value - min) / (max - min);

  // Apply inverse curve for slider position
  const sliderPosition = invertCurve(normalizedValue, curve);

  // Handle slider change
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sliderVal = parseFloat(e.target.value);
      // Apply curve to get actual normalized value
      const curvedVal = applyCurve(sliderVal, curve);
      // Denormalize to actual range
      let newValue = curvedVal * (max - min) + min;
      // Apply step if specified
      if (step !== undefined && step !== null && step !== 0 && !isNaN(step)) {
        newValue = Math.round(newValue / step) * step;
      }
      // Clamp to range
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(newValue);
    },
    [min, max, step, curve, onChange]
  );

  // Handle direct numeric input
  const handleInputSubmit = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
    }
    setIsEditing(false);
  }, [editValue, min, max, onChange]);

  // Start editing
  const handleStartEdit = useCallback(() => {
    setEditValue(formatValue(value, step));
    setIsEditing(true);
  }, [value, step]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Format display value
  const displayValue = formatValue(value, step);

  // Check if value is at default
  const isAtDefault = value === control.default;

  return (
    <div className="control-number">
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
        <input
          type="range"
          className="control-slider"
          min={0}
          max={1}
          step={0.001}
          value={sliderPosition}
          onChange={handleSliderChange}
        />

        <div className="control-value-container">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="control-value-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleInputSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInputSubmit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
            />
          ) : (
            <span
              className="control-value"
              onClick={handleStartEdit}
              title="Click to edit"
            >
              {displayValue}
              {unit && <span className="control-unit">{unit}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Format a value for display based on precision.
 */
function formatValue(value: number, step?: number): string {
  if (step !== undefined) {
    // Determine decimal places from step
    const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
    return value.toFixed(decimals);
  }
  // Default formatting
  if (value === Math.floor(value)) {
    return String(value);
  }
  return value.toFixed(2);
}
