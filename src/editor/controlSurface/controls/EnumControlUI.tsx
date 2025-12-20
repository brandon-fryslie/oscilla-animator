/**
 * Enum Control Component
 *
 * Modes without magic - used for converge/cascade/diagonal,
 * easing families, palette selection.
 *
 * UX notes from spec:
 * - Segmented buttons feel best for small enums (2-4 options)
 * - Dropdowns are fine for large sets (5+ options)
 * - Radio buttons for emphasis on selection
 */

import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import type { EnumControl } from '../types';

interface EnumControlUIProps {
  control: EnumControl;
  onChange: (value: string) => void;
  onReset: () => void;
}

export const EnumControlUI = observer(function EnumControlUI({ control, onChange, onReset }: EnumControlUIProps) {
  const { options, value, presentation, label } = control;

  // Auto-select presentation based on option count
  const effectivePresentation = presentation ?? (options.length <= 4 ? 'segmented' : 'dropdown');

  // Check if value is at default
  const isAtDefault = value === control.default;

  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <div className="control-enum">
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
        {effectivePresentation === 'segmented' && (
          <SegmentedButtons
            options={options}
            value={value}
            onChange={handleChange}
          />
        )}

        {effectivePresentation === 'dropdown' && (
          <Dropdown
            options={options}
            value={value}
            onChange={handleChange}
          />
        )}

        {effectivePresentation === 'radio' && (
          <RadioButtons
            options={options}
            value={value}
            onChange={handleChange}
            name={control.id}
          />
        )}
      </div>
    </div>
  );
});

// =============================================================================
// Sub-components
// =============================================================================

interface OptionsProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}

function SegmentedButtons({ options, value, onChange }: OptionsProps) {
  return (
    <div className="enum-segmented">
      {options.map((option) => (
        <button
          key={option}
          className={`enum-segment ${value === option ? 'active' : ''}`}
          onClick={() => onChange(option)}
        >
          {formatOptionLabel(option)}
        </button>
      ))}
    </div>
  );
}

function Dropdown({ options, value, onChange }: OptionsProps) {
  return (
    <select
      className="enum-dropdown"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {formatOptionLabel(option)}
        </option>
      ))}
    </select>
  );
}

interface RadioButtonsProps extends OptionsProps {
  name: string;
}

function RadioButtons({ options, value, onChange, name }: RadioButtonsProps) {
  return (
    <div className="enum-radio-group">
      {options.map((option) => (
        <label key={option} className="enum-radio">
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span className="enum-radio-label">{formatOptionLabel(option)}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Format an option value as a human-readable label.
 * Converts camelCase to Title Case.
 */
function formatOptionLabel(value: string): string {
  // Handle camelCase
  const spaced = value.replace(/([A-Z])/g, ' $1');
  // Capitalize first letter
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
