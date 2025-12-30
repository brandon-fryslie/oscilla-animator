/**
 * FieldVisualizationMode Component
 *
 * Mode selector and display for field probes.
 * Supports: Text, Heatmap, Histogram modes.
 *
 * Integrates with ProbeCard to visualize field data.
 */

import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { computeFieldStats, formatFieldStats } from '../debug/FieldStats';
import { FieldHeatmap } from './FieldHeatmap';
import { FieldHistogram } from './FieldHistogram';
import './FieldVisualizationMode.css';

export type FieldMode = 'text' | 'heatmap' | 'histogram';

interface FieldVisualizationModeProps {
  /** Probe identifier for persistence */
  probeId: string;

  /** Field values (if available) */
  fieldValues: Float32Array | null;

  /** Initial mode (default: 'text') */
  initialMode?: FieldMode;
}

/**
 * Storage key for mode persistence.
 */
function getModeStorageKey(probeId: string): string {
  return `oscilla.debug.field.${probeId}.mode`;
}

/**
 * Load mode from localStorage.
 */
function loadMode(probeId: string, defaultMode: FieldMode = 'text'): FieldMode {
  if (typeof window === 'undefined') return defaultMode;

  try {
    const stored = window.localStorage.getItem(getModeStorageKey(probeId));
    if (stored === 'text' || stored === 'heatmap' || stored === 'histogram') {
      return stored;
    }
  } catch (err) {
    console.warn('[FieldVisualizationMode] Failed to load mode from localStorage:', err);
  }

  return defaultMode;
}

/**
 * Save mode to localStorage.
 */
function saveMode(probeId: string, mode: FieldMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getModeStorageKey(probeId), mode);
  } catch (err) {
    console.warn('[FieldVisualizationMode] Failed to save mode to localStorage:', err);
  }
}

export const FieldVisualizationMode = observer(function FieldVisualizationMode({
  probeId,
  fieldValues,
  initialMode = 'text',
}: FieldVisualizationModeProps) {
  // Load persisted mode or use initial mode
  const [mode, setMode] = useState<FieldMode>(() => loadMode(probeId, initialMode));

  // Save mode when it changes
  useEffect(() => {
    saveMode(probeId, mode);
  }, [probeId, mode]);

  // Handle mode change
  const handleModeChange = (newMode: FieldMode) => {
    setMode(newMode);
  };

  // Handle case where field values are not available
  if (fieldValues === null || fieldValues.length === 0) {
    return (
      <div className="field-visualization-empty">
        <span className="field-visualization-empty-text">No field data available</span>
      </div>
    );
  }

  // Compute stats for visualization
  const stats = computeFieldStats(fieldValues);

  return (
    <div className="field-visualization">
      {/* Mode selector */}
      <div className="field-visualization-mode-selector">
        <button
          className={`field-mode-btn ${mode === 'text' ? 'active' : ''}`}
          onClick={() => handleModeChange('text')}
          title="Text mode: Show first 5 values"
        >
          Text
        </button>
        <button
          className={`field-mode-btn ${mode === 'heatmap' ? 'active' : ''}`}
          onClick={() => handleModeChange('heatmap')}
          title="Heatmap mode: Colored grid visualization"
        >
          Heatmap
        </button>
        <button
          className={`field-mode-btn ${mode === 'histogram' ? 'active' : ''}`}
          onClick={() => handleModeChange('histogram')}
          title="Histogram mode: Distribution chart"
        >
          Histogram
        </button>
      </div>

      {/* Mode display */}
      <div className="field-visualization-content">
        {mode === 'text' && (
          <div className="field-text-mode">
            <div className="field-stats">{formatFieldStats(stats)}</div>
            <div className="field-sample">
              {Array.from(fieldValues.slice(0, 5), (v, i) => (
                <div key={i} className="field-sample-row">
                  <span className="field-sample-index">[{i}]</span>
                  <span className="field-sample-value">{v.toFixed(3)}</span>
                </div>
              ))}
              {fieldValues.length > 5 && (
                <div className="field-sample-more">
                  ... and {fieldValues.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'heatmap' && (
          <FieldHeatmap
            fieldValues={fieldValues}
            stats={stats}
            width={280}
            height={280}
          />
        )}

        {mode === 'histogram' && (
          <FieldHistogram
            fieldValues={fieldValues}
            stats={stats}
            bins={20}
            width={280}
            height={180}
          />
        )}
      </div>
    </div>
  );
});
