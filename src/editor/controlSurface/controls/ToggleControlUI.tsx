/**
 * Toggle Control Component
 *
 * Boolean, but expressive - used for enable/disable effects,
 * reverse order, lock/unlock behavior.
 *
 * UX notes from spec:
 * - Toggle is often better than "0/1 slider"
 * - Can drive visibility, weighting, or gating
 */

import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import type { ToggleControl } from '../types';

interface ToggleControlUIProps {
  control: ToggleControl;
  onChange: (value: boolean) => void;
  onReset: () => void;
}

export const ToggleControlUI = observer(function ToggleControlUI({ control, onChange, onReset }: ToggleControlUIProps) {
  const { value, label } = control;

  // Check if value is at default
  const isAtDefault = value === control.default;

  const handleToggle = useCallback(() => {
    onChange(!value);
  }, [value, onChange]);

  return (
    <div className="control-toggle">
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
        <button
          className={`toggle-switch ${value ? 'active' : ''}`}
          onClick={handleToggle}
          aria-pressed={value}
        >
          <span className="toggle-knob" />
          <span className="toggle-label">
            {value ? 'On' : 'Off'}
          </span>
        </button>
      </div>
    </div>
  );
});
