/**
 * LensSelector Component
 *
 * Reusable component for selecting and configuring bus lenses.
 * Supports two modes: preset selection and custom configuration.
 */

import { useState } from 'react';
import type { LensDefinition, LensType } from '../types';
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

const LENS_TYPES: { value: LensType; label: string; description: string }[] = [
  { value: 'ease', label: 'Ease', description: 'Apply easing curve' },
  { value: 'slew', label: 'Slew', description: 'Smooth rate limiting' },
  { value: 'quantize', label: 'Quantize', description: 'Snap to steps' },
  { value: 'scale', label: 'Scale', description: 'Linear scale + offset' },
  { value: 'warp', label: 'Warp', description: 'Phase warping' },
];

/**
 * LensSelector - main component for selecting and configuring lenses.
 */
export function LensSelector({ value, onChange, compact = false }: LensSelectorProps) {
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

  const handleTypeChange = (type: LensType) => {
    // Create default params for each type
    const defaultParams: Record<LensType, Record<string, unknown>> = {
      ease: { easing: 'easeInOutSine' },
      slew: { rate: 2.0 },
      quantize: { steps: 4 },
      scale: { scale: 1, offset: 0 },
      warp: { power: 1 },
      broadcast: {},
      perElementOffset: { range: 1.0 },
    };

    onChange({ type, params: defaultParams[type] });
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
              onChange={(e) => handleTypeChange(e.target.value as LensType)}
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
        <div className="lens-param-row">
          <label className="lens-param-label">Rate</label>
          <input
            type="number"
            className="lens-param-input"
            value={(lens.params.rate as number) ?? 2.0}
            step={0.1}
            min={0.01}
            onChange={(e) => onChange('rate', parseFloat(e.target.value) || 2.0)}
          />
          <span className="lens-param-unit">/sec</span>
        </div>
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

    case 'warp':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Power</label>
          <input
            type="number"
            className="lens-param-input"
            value={(lens.params.power as number) ?? 1}
            step={0.1}
            min={0.1}
            onChange={(e) => onChange('power', parseFloat(e.target.value) || 1)}
          />
        </div>
      );

    case 'perElementOffset':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Range</label>
          <input
            type="number"
            className="lens-param-input"
            value={(lens.params.range as number) ?? 1.0}
            step={0.1}
            min={0}
            onChange={(e) => onChange('range', parseFloat(e.target.value) || 1.0)}
          />
        </div>
      );

    case 'broadcast':
      return (
        <div className="lens-param-row">
          <span className="lens-param-hint">No parameters needed</span>
        </div>
      );

    default:
      return null;
  }
}

/**
 * LensBadge - small display of current lens for compact views.
 */
export function LensBadge({ lens }: { lens?: LensDefinition }) {
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
