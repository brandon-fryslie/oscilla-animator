/**
 * LensSelector Component
 *
 * Reusable component for selecting and configuring bus lenses.
 * Supports two modes: preset selection and custom configuration.
 */

import { useState } from 'react';
import type { LensDefinition } from '../types';
import { LENS_PRESETS, createLensFromPreset } from '../lens-presets';
import { getEasingNames } from '../lenses';
import './LensSelector.css';

interface LensSelectorProps {
  /** Current lens configuration (undefined = no lens) */
  value?: LensDefinition;
  /** Callback when lens changes */
  onChange: (lens: LensDefinition | undefined) => void;
  /** Whether to show in compact mode */
  compact?: boolean;
}

type Mode = 'preset' | 'custom';

const LENS_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'scale', label: 'Gain', description: 'Linear gain + offset' },
  { value: 'polarity', label: 'Polarity', description: 'Invert or pass through' },
  { value: 'clamp', label: 'Clamp', description: 'Clamp to a min/max range' },
  { value: 'deadzone', label: 'Deadzone', description: 'Zero small values' },
  { value: 'quantize', label: 'Quantize', description: 'Snap to steps' },
  { value: 'ease', label: 'Ease', description: 'Apply easing curve' },
  { value: 'mapRange', label: 'Map Range', description: 'Remap input range' },
  { value: 'slew', label: 'Slew', description: 'Smooth rate limiting' },
];

/**
 * LensSelector - main component for selecting and configuring lenses.
 */
export function LensSelector({ value, onChange, compact = false }: LensSelectorProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>(value ? 'custom' : 'preset');

  // Determine current preset ID if value matches a preset
  const currentPresetId = value
    ? LENS_PRESETS.find(
        (p) =>
          p.lens.type === value.type &&
          JSON.stringify(p.lens.params) === JSON.stringify(value.params)
      )?.id
    : undefined;

  const handlePresetChange = (presetId: string) => {
    if (presetId === '') {
      onChange(undefined);
    } else {
      const lens = createLensFromPreset(presetId);
      if (lens) {
        onChange(lens);
      }
    }
  };

  const handleTypeChange = (type: string) => {
    // Create default params for each type
    const defaultParams: Record<string, Record<string, unknown>> = {
      scale: { scale: 1, offset: 0 },
      polarity: { invert: false },
      clamp: { min: 0, max: 1 },
      deadzone: { width: 0.05 },
      quantize: { steps: 4 },
      ease: { easing: 'easeInOutSine' },
      mapRange: { inMin: 0, inMax: 1, outMin: 0, outMax: 1, clamp: true },
      slew: { riseMs: 120, fallMs: 120 },
    };

    const params = defaultParams[type];
    onChange({ type, params: params !== undefined ? params : {} });
  };

  const handleParamChange = (key: string, paramValue: unknown) => {
    if (!value) return;
    onChange({
      ...value,
      params: { ...value.params, [key]: paramValue },
    });
  };

  const handleClear = () => {
    onChange(undefined);
  };

  if (compact) {
    return (
      <div className="lens-selector lens-selector--compact">
        <select
          className="lens-preset-select"
          value={currentPresetId ?? ''}
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          <option value="">No lens</option>
          <optgroup label="Easing">
            {LENS_PRESETS.filter((p) => p.category === 'easing').map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Timing">
            {LENS_PRESETS.filter((p) => p.category === 'timing').map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Quantize">
            {LENS_PRESETS.filter((p) => p.category === 'quantize').map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Scaling">
            {LENS_PRESETS.filter((p) => p.category === 'scaling').map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    );
  }

  return (
    <div className="lens-selector">
      {/* Mode toggle */}
      <div className="lens-mode-toggle">
        <button
          className={`lens-mode-btn ${mode === 'preset' ? 'active' : ''}`}
          onClick={() => setMode('preset')}
        >
          Preset
        </button>
        <button
          className={`lens-mode-btn ${mode === 'custom' ? 'active' : ''}`}
          onClick={() => setMode('custom')}
        >
          Custom
        </button>
        {value && (
          <button className="lens-clear-btn" onClick={handleClear} title="Remove lens">
            ×
          </button>
        )}
      </div>

      {/* Preset mode */}
      {mode === 'preset' && (
        <div className="lens-preset-panel">
          <div className="lens-preset-grid">
            {LENS_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`lens-preset-chip ${currentPresetId === preset.id ? 'active' : ''}`}
                onClick={() => handlePresetChange(preset.id)}
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom mode */}
      {mode === 'custom' && (
        <div className="lens-custom-panel">
          {/* Type selector */}
          <div className="lens-param-row">
            <label className="lens-param-label">Type</label>
            <select
              className="lens-type-select"
              value={value?.type ?? ''}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <option value="">Select type...</option>
              {LENS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Type-specific parameters */}
          {value && <LensParamsEditor lens={value} onChange={handleParamChange} />}
        </div>
      )}
    </div>
  );
}

/**
 * LensParamsEditor - renders parameter inputs for a specific lens type.
 */
function LensParamsEditor({
  lens,
  onChange,
}: {
  lens: LensDefinition;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (lens.type) {
    case 'ease':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Easing</label>
          <select
            className="lens-param-input"
            value={(lens.params.easing as string) ?? 'easeInOutSine'}
            onChange={(e) => onChange('easing', e.target.value)}
          >
            {getEasingNames().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      );

    case 'slew':
      return (
        <>
          <div className="lens-param-row">
            <label className="lens-param-label">Rise (ms)</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.riseMs as number) ?? 120}
              step={1}
              min={0}
              onChange={(e) => onChange('riseMs', parseFloat(e.target.value) || 120)}
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">Fall (ms)</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.fallMs as number) ?? 120}
              step={1}
              min={0}
              onChange={(e) => onChange('fallMs', parseFloat(e.target.value) || 120)}
            />
          </div>
        </>
      );

    case 'quantize':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Steps</label>
          <input
            type="number"
            className="lens-param-input"
            value={(lens.params.steps as number) ?? 4}
            step={1}
            min={1}
            max={32}
            onChange={(e) => onChange('steps', parseInt(e.target.value, 10) || 4)}
          />
        </div>
      );

    case 'scale':
      return (
        <>
          <div className="lens-param-row">
            <label className="lens-param-label">Scale</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.scale as number) ?? 1}
              step={0.1}
              onChange={(e) => onChange('scale', parseFloat(e.target.value) || 1)}
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">Offset</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.offset as number) ?? 0}
              step={0.1}
              onChange={(e) => onChange('offset', parseFloat(e.target.value) || 0)}
            />
          </div>
        </>
      );

    case 'polarity':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Invert</label>
          <input
            type="checkbox"
            checked={(lens.params.invert as boolean) ?? false}
            onChange={(e) => onChange('invert', e.target.checked)}
          />
        </div>
      );

    case 'clamp':
      return (
        <>
          <div className="lens-param-row">
            <label className="lens-param-label">Min</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.min as number) ?? 0}
              step={0.1}
              onChange={(e) => onChange('min', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">Max</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.max as number) ?? 1}
              step={0.1}
              onChange={(e) => onChange('max', parseFloat(e.target.value) || 1)}
            />
          </div>
        </>
      );

    case 'deadzone':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Width</label>
          <input
            type="number"
            className="lens-param-input"
            value={(lens.params.width as number) ?? 0.05}
            step={0.01}
            min={0}
            onChange={(e) => onChange('width', parseFloat(e.target.value) || 0.05)}
          />
        </div>
      );

    case 'mapRange':
      return (
        <>
          <div className="lens-param-row">
            <label className="lens-param-label">In Min</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.inMin as number) ?? 0}
              step={0.1}
              onChange={(e) => onChange('inMin', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">In Max</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.inMax as number) ?? 1}
              step={0.1}
              onChange={(e) => onChange('inMax', parseFloat(e.target.value) || 1)}
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">Out Min</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.outMin as number) ?? 0}
              step={0.1}
              onChange={(e) => onChange('outMin', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">Out Max</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.outMax as number) ?? 1}
              step={0.1}
              onChange={(e) => onChange('outMax', parseFloat(e.target.value) || 1)}
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">Clamp</label>
            <input
              type="checkbox"
              checked={(lens.params.clamp as boolean) ?? true}
              onChange={(e) => onChange('clamp', e.target.checked)}
            />
          </div>
        </>
      );

    default:
      return null;
  }
}

/**
 * LensBadge - small display of current lens for compact views.
 */
export function LensBadge({ lens }: { lens?: LensDefinition }): React.ReactElement | null {
  if (!lens) return null;

  const preset = LENS_PRESETS.find(
    (p) =>
      p.lens.type === lens.type &&
      JSON.stringify(p.lens.params) === JSON.stringify(lens.params)
  );

  return (
    <span className="lens-badge" title={preset?.description ?? `${lens.type} lens`}>
      {preset?.name ?? lens.type}
    </span>
  );
}
