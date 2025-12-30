/**
 * LensChainEditor Component
 *
 * Edits a chain of lenses for a modulation table cell.
 * Features:
 * - Reorderable list of transforms
 * - Add/remove lenses
 * - Per-lens enable toggle
 * - Parameter editing for each lens
 * - Compact chip display with expand
 * - Recently used lens tracking
 * - Registry-driven lens catalog (Sprint 4)
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import Tippy from '@tippyjs/react';
import type { LensDefinition, TypeDesc } from '../types';
import { LENS_PRESETS, createLensFromPreset, type LensPreset } from '../lens-presets';
import { getAllLenses, getLens } from '../lenses/LensRegistry';
import { listLensesFor } from '../transforms/catalog';
import type { TransformScope } from '../transforms/types';

/**
 * Recently used lens storage
 */
const RECENT_LENSES_KEY = 'oscilla-recent-lenses';
const MAX_RECENT_LENSES = 6;

interface RecentLens {
  presetId?: string;
  type: string;
  params: Record<string, unknown>;
  usedAt: number;
}

function getRecentLenses(): RecentLens[] {
  try {
    const stored = localStorage.getItem(RECENT_LENSES_KEY);
    if (stored != null && stored !== '') {
      return JSON.parse(stored) as RecentLens[];
    }
  } catch {
    // Ignore errors
  }
  return [];
}

function addRecentLens(lens: LensDefinition, presetId?: string): void {
  try {
    const recent = getRecentLenses();
    // Remove duplicates (same type and similar params)
    const filtered = recent.filter(
      (r) => r.type !== lens.type || JSON.stringify(r.params) !== JSON.stringify(lens.params)
    );
    // Add new lens at the beginning
    filtered.unshift({
      presetId,
      type: lens.type,
      params: lens.params,
      usedAt: Date.now(),
    });
    // Keep only MAX_RECENT_LENSES
    const trimmed = filtered.slice(0, MAX_RECENT_LENSES);
    localStorage.setItem(RECENT_LENSES_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore errors
  }
}

interface LensChainEditorProps {
  /** Current lens chain */
  lensChain: readonly LensDefinition[];
  /** Callback when chain changes */
  onChange: (chain: LensDefinition[]) => void;
  /** Source type (bus) */
  sourceType?: TypeDesc;
  /** Target type (port) */
  targetType?: TypeDesc;
  /** Scope for filtering lenses (wire, publisher, listener) */
  scope?: TransformScope;
  /** Close the editor (optional for inline mode) */
  onClose?: () => void;
  /** Inline mode - collapsible section, no popup controls */
  inline?: boolean;
}

/**
 * Get default params for a lens from its registry definition
 */
function getDefaultParamsForLens(lensId: string): Record<string, unknown> {
  const def = getLens(lensId);
  if (!def) return {};

  const defaults: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(def.params)) {
    defaults[key] = spec.default;
  }
  return defaults;
}

// =============================================================================
// Easing functions for curve preview (duplicated from lenses/index.ts for isolation)
// =============================================================================
const easingFunctions: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeInElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
  },
  easeOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) {
      return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2;
    }
    return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1;
  },
  easeInBounce: (t) => 1 - easingFunctions.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: (t) => {
    return t < 0.5
      ? (1 - easingFunctions.easeOutBounce(1 - 2 * t)) / 2
      : (1 + easingFunctions.easeOutBounce(2 * t - 1)) / 2;
  },
};

/**
 * Get a pure transform function for a lens (input 0-1, output typically 0-1)
 * Returns null for lenses that can't be visualized as a simple curve
 */
function getLensTransformFn(lens: LensDefinition): ((t: number) => number) | null {
  const params = lens.params ?? {};

  switch (lens.type) {
    case 'ease':
    case 'Ease': {
      const easingName = (params.easing as string) || 'easeInOutSine';
      const easingFn = easingFunctions[easingName] ?? easingFunctions.easeInOutSine;
      return (t) => easingFn(Math.max(0, Math.min(1, t)));
    }

    case 'quantize': {
      const steps = (params.steps as number) ?? 4;
      return (t) => Math.round(t * steps) / steps;
    }

    case 'scale':
    case 'Gain': {
      const scale = (params.scale as number) ?? (params.gain as number) ?? 1;
      const offset = (params.offset as number) ?? (params.bias as number) ?? 0;
      return (t) => t * scale + offset;
    }

    case 'warp': {
      const power = (params.power as number) ?? 1;
      return (t) => Math.pow(Math.max(0, Math.min(1, t)), power);
    }

    case 'clamp':
    case 'Clamp': {
      const min = (params.min as number) ?? 0;
      const max = (params.max as number) ?? 1;
      return (t) => Math.max(min, Math.min(max, t));
    }

    case 'offset': {
      const amount = (params.amount as number) ?? 0;
      return (t) => t + amount;
    }

    case 'deadzone': {
      const threshold = (params.threshold as number) ?? (params.width as number) ?? 0.05;
      return (t) => Math.abs(t) < threshold ? 0 : t;
    }

    case 'mapRange': {
      const inMin = (params.inMin as number) ?? 0;
      const inMax = (params.inMax as number) ?? 1;
      const outMin = (params.outMin as number) ?? 0;
      const outMax = (params.outMax as number) ?? 1;
      return (t) => {
        const normalized = (t - inMin) / (inMax - inMin);
        return outMin + normalized * (outMax - outMin);
      };
    }

    case 'phaseOffset':
    case 'PhaseOffset': {
      const off = (params.offset as number) ?? 0;
      return (t) => (t + off) % 1;
    }

    case 'pingPong':
    case 'PingPong': {
      return (t) => t < 0.5 ? t * 2 : 2 - t * 2;
    }

    case 'slew':
    case 'Slew': {
      // Show a smoothed step response (approximation)
      const riseMs = (params.riseMs as number) ?? (params.rate != null ? 500 / (params.rate as number) : 100);
      const k = 1000 / riseMs; // steepness
      return (t) => {
        // Simulate slew on a step from 0 to 1 at t=0.3
        if (t < 0.3) return 0;
        const elapsed = (t - 0.3) * 2; // scale time
        return Math.min(1, 1 - Math.exp(-k * elapsed));
      };
    }

    case 'hueShift':
    case 'HueShift':
    case 'rotate2d':
    case 'Rotate2D': {
      const turns = (params.turns as number) ?? 0;
      return (t) => (t + turns) % 1;
    }

    case 'polarity': {
      const invert = (params.invert as boolean) ?? false;
      return (t) => invert ? -t : t;
    }

    // These lenses convert to fields or have no meaningful curve
    case 'broadcast':
    case 'perElementOffset':
      return null;

    default:
      // For unknown types, show identity
      return (t) => t;
  }
}

/**
 * SVG curve preview for a lens transformation with animated sparkline
 */
function LensCurvePreview({
  lens,
  width = 100,
  height = 60,
}: {
  lens: LensDefinition;
  width?: number;
  height?: number;
}): React.ReactElement | null {
  const transformFn = getLensTransformFn(lens);

  if (!transformFn) {
    return (
      <div className="lens-curve-no-preview">
        <span>Field transform</span>
      </div>
    );
  }

  // Sample the curve
  const numSamples = 50;
  const points: { x: number; y: number }[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const v = transformFn(t);
    points.push({ x: t, y: v });
    minY = Math.min(minY, v);
    maxY = Math.max(maxY, v);
  }

  // Add padding to Y range
  const yRange = maxY - minY || 1;
  const yPadding = yRange * 0.1;
  minY -= yPadding;
  maxY += yPadding;

  // Build SVG path
  const padding = 4;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const svgPoints = points.map((p) => ({
    x: padding + p.x * plotWidth,
    y: padding + (1 - (p.y - minY) / (maxY - minY)) * plotHeight,
  }));

  const pathData = svgPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // Reference line (identity: y = x)
  const refPath = `M ${padding} ${height - padding} L ${width - padding} ${padding}`;

  // Animation path for the dot (same as curve path)
  const animationDuration = 1.5; // seconds

  return (
    <svg
      className="lens-curve-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Background */}
      <rect
        x={padding}
        y={padding}
        width={plotWidth}
        height={plotHeight}
        fill="rgba(0,0,0,0.3)"
        rx={2}
      />
      {/* Reference line (identity) */}
      <path
        d={refPath}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1}
        fill="none"
        strokeDasharray="2,2"
      />
      {/* Faded curve (trail) */}
      <path
        d={pathData}
        stroke="rgba(74, 158, 255, 0.3)"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Animated glowing segment */}
      <path
        d={pathData}
        stroke="#4a9eff"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={plotWidth * 0.15}
        strokeDashoffset={plotWidth * 1.5}
        className="lens-curve-animated-path"
        style={{
          animation: `lens-sparkline ${animationDuration}s ease-in-out infinite`,
        }}
      />
      {/* Animated dot */}
      <circle r={4} fill="#4a9eff" className="lens-curve-dot">
        <animateMotion
          dur={`${animationDuration}s`}
          repeatCount="indefinite"
          path={pathData}
          calcMode="spline"
          keySplines="0.4 0 0.6 1"
          keyTimes="0;1"
        />
      </circle>
      {/* Glow effect on dot */}
      <circle r={6} fill="rgba(74, 158, 255, 0.4)" className="lens-curve-dot-glow">
        <animateMotion
          dur={`${animationDuration}s`}
          repeatCount="indefinite"
          path={pathData}
          calcMode="spline"
          keySplines="0.4 0 0.6 1"
          keyTimes="0;1"
        />
      </circle>
    </svg>
  );
}

/**
 * Preview tooltip content for lens hover
 */
function LensPreviewTooltip({
  existingChain,
  previewLens,
}: {
  existingChain: readonly LensDefinition[];
  previewLens: LensDefinition;
}): React.ReactElement {
  return (
    <div className="lens-preview-tooltip">
      <LensCurvePreview lens={previewLens} />
      <div className="lens-preview-info">
        <span className="lens-preview-name">{previewLens.type}</span>
        {Object.keys(previewLens.params).length > 0 && (
          <span className="lens-preview-params">
            {Object.entries(previewLens.params)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(', ')}
          </span>
        )}
        {existingChain.length > 0 && (
          <span className="lens-preview-chain-hint">
            Chain: {existingChain.map(l => l.type).join(' → ')} → <strong>{previewLens.type}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Single lens item in the chain.
 */
function LensChainItem({
  lens,
  index: _index,
  isEnabled,
  onUpdate,
  onRemove,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  lens: LensDefinition;
  index: number;
  isEnabled: boolean;
  onUpdate: (params: Record<string, unknown>) => void;
  onRemove: () => void;
  onToggleEnabled: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const handleParamChange = useCallback(
    (key: string, value: unknown) => {
      onUpdate({ ...lens.params, [key]: value });
    },
    [lens.params, onUpdate]
  );

  return (
    <div className={`lens-chain-item ${!isEnabled ? 'disabled' : ''}`}>
      <div className="lens-chain-item-header">
        <button
          className="lens-reorder-btn"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Move up"
        >
          ▲
        </button>
        <button
          className="lens-reorder-btn"
          onClick={onMoveDown}
          disabled={isLast}
          title="Move down"
        >
          ▼
        </button>

        <button
          className="lens-expand-btn"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>

        <span className="lens-chain-item-type">{lens.type}</span>

        <label className="lens-enable-toggle" title={isEnabled ? 'Disable' : 'Enable'}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={onToggleEnabled}
          />
        </label>

        <button className="lens-remove-btn" onClick={onRemove} title="Remove lens">
          ×
        </button>
      </div>

      {expanded && (
        <div className="lens-chain-item-body">
          <div className="lens-chain-item-curve">
            <LensCurvePreview lens={lens} width={72} height={48} />
          </div>
          <div className="lens-chain-item-params">
            <LensParamsEditor lens={lens} onChange={handleParamChange} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Parameter editor for a single lens - now registry-driven!
 * Renders params dynamically from LensDef.params schema using UIControlHint.
 */
function LensParamsEditor({
  lens,
  onChange,
}: {
  lens: LensDefinition;
  onChange: (key: string, value: unknown) => void;
}) {
  // Get lens definition from registry
  const def = getLens(lens.type);

  if (!def || Object.keys(def.params).length === 0) {
    return (
      <div className="lens-param-row lens-param-hint">
        No parameters available
      </div>
    );
  }

  // Render each param based on its UIControlHint
  return (
    <>
      {Object.entries(def.params).map(([key, spec]) => {
        const value = lens.params[key] ?? spec.default;
        const hint = spec.uiHint;

        switch (hint.kind) {
          case 'number':
            return (
              <div key={key} className="lens-param-row">
                <label className="lens-param-label">{key}</label>
                <input
                  type="number"
                  className="lens-param-input"
                  value={value as number}
                  step={hint.step ?? 1}
                  min={hint.min}
                  max={hint.max}
                  onChange={(e) => onChange(key, parseFloat(e.target.value) || spec.default as number)}
                />
              </div>
            );

          case 'slider':
            return (
              <div key={key} className="lens-param-row">
                <label className="lens-param-label">{key}</label>
                <input
                  type="range"
                  className="lens-param-slider"
                  value={value as number}
                  min={hint.min ?? 0}
                  max={hint.max ?? 1}
                  step={hint.step ?? 0.01}
                  onChange={(e) => onChange(key, parseFloat(e.target.value))}
                />
                <span className="lens-param-value">
                  {(value as number).toFixed(2)}
                </span>
              </div>
            );

          case 'boolean':
            return (
              <div key={key} className="lens-param-row">
                <label className="lens-param-label">{key}</label>
                <input
                  type="checkbox"
                  checked={value as boolean}
                  onChange={(e) => onChange(key, e.target.checked)}
                />
              </div>
            );

          case 'text':
            return (
              <div key={key} className="lens-param-row">
                <label className="lens-param-label">{key}</label>
                <input
                  type="text"
                  className="lens-param-input"
                  value={value as string}
                  onChange={(e) => onChange(key, e.target.value)}
                />
              </div>
            );

          case 'select':
            return (
              <div key={key} className="lens-param-row">
                <label className="lens-param-label">{key}</label>
                <select
                  className="lens-param-input"
                  value={value as string}
                  onChange={(e) => onChange(key, e.target.value)}
                >
                  {hint.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            );

          case 'xy':
            return (
              <div key={key} className="lens-param-row">
                <label className="lens-param-label">{key}</label>
                <div className="lens-param-xy">
                  <input
                    type="number"
                    className="lens-param-input lens-param-xy-input"
                    value={(value as { x: number; y: number }).x}
                    step={0.1}
                    onChange={(e) => onChange(key, { ...(value as { x: number; y: number }), x: parseFloat(e.target.value) })}
                    placeholder="x"
                  />
                  <input
                    type="number"
                    className="lens-param-input lens-param-xy-input"
                    value={(value as { x: number; y: number }).y}
                    step={0.1}
                    onChange={(e) => onChange(key, { ...(value as { x: number; y: number }), y: parseFloat(e.target.value) })}
                    placeholder="y"
                  />
                </div>
              </div>
            );

          default:
            return (
              <div key={key} className="lens-param-row lens-param-hint">
                Unknown control type for {key}
              </div>
            );
        }
      })}
    </>
  );
}

/**
 * Main lens chain editor component.
 */
export function LensChainEditor({
  lensChain,
  onChange,
  sourceType,
  targetType,
  scope,
  onClose,
  inline = false,
}: LensChainEditorProps): React.ReactElement {
  // Track enabled state per lens (default all enabled)
  const [enabledStates, setEnabledStates] = useState<boolean[]>(
    () => lensChain.map(() => true)
  );

  // Show add lens UI
  const [showAddLens, setShowAddLens] = useState(false);

  // Collapsed state for inline mode
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Available presets
  const presetsByCategory = useMemo(() => {
    const categories: Record<string, LensPreset[]> = {};
    LENS_PRESETS.forEach((p) => {
      if (categories[p.category] == null) categories[p.category] = [];
      categories[p.category].push(p);
    });
    return categories;
  }, []);

  // Recently used lenses
  const [recentLenses, setRecentLenses] = useState<RecentLens[]>([]);

  // Get available lens types from registry, filtered by scope and domain
  const availableLenses = useMemo(() => {
    if (!scope || !targetType) {
      // Fallback: all lenses
      return getAllLenses();
    }
    // Use catalog filtering by scope and domain
    return listLensesFor(scope, targetType);
  }, [scope, targetType]);

  // Load recent lenses on mount
  useEffect(() => {
    setRecentLenses(getRecentLenses());
  }, [showAddLens]);

  const handleUpdateLens = useCallback(
    (index: number, params: Record<string, unknown>) => {
      const newChain = [...lensChain];
      newChain[index] = { ...newChain[index], params };
      onChange(newChain);
    },
    [lensChain, onChange]
  );

  const handleRemoveLens = useCallback(
    (index: number) => {
      const newChain = lensChain.filter((_, i) => i !== index);
      const newEnabled = enabledStates.filter((_, i) => i !== index);
      setEnabledStates(newEnabled);
      onChange([...newChain]);
    },
    [lensChain, enabledStates, onChange]
  );

  const handleToggleEnabled = useCallback(
    (index: number) => {
      setEnabledStates((prev) => {
        const next = [...prev];
        next[index] = !next[index];
        return next;
      });
    },
    []
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newChain = [...lensChain];
      [newChain[index - 1], newChain[index]] = [newChain[index], newChain[index - 1]];
      const newEnabled = [...enabledStates];
      [newEnabled[index - 1], newEnabled[index]] = [newEnabled[index], newEnabled[index - 1]];
      setEnabledStates(newEnabled);
      onChange(newChain);
    },
    [lensChain, enabledStates, onChange]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index === lensChain.length - 1) return;
      const newChain = [...lensChain];
      [newChain[index], newChain[index + 1]] = [newChain[index + 1], newChain[index]];
      const newEnabled = [...enabledStates];
      [newEnabled[index], newEnabled[index + 1]] = [newEnabled[index + 1], newEnabled[index]];
      setEnabledStates(newEnabled);
      onChange(newChain);
    },
    [lensChain, enabledStates, onChange]
  );

  const handleAddLens = useCallback(
    (lensId: string) => {
      const params = getDefaultParamsForLens(lensId);
      const newLens: LensDefinition = { type: lensId, params };
      onChange([...lensChain, newLens]);
      setEnabledStates((prev) => [...prev, true]);
      addRecentLens(newLens);
      setRecentLenses(getRecentLenses());
      setShowAddLens(false);
    },
    [lensChain, onChange]
  );

  const handleAddPreset = useCallback(
    (presetId: string) => {
      const lens = createLensFromPreset(presetId);
      if (lens) {
        onChange([...lensChain, lens]);
        setEnabledStates((prev) => [...prev, true]);
        addRecentLens(lens, presetId);
        setRecentLenses(getRecentLenses());
      }
      setShowAddLens(false);
    },
    [lensChain, onChange]
  );

  const handleAddRecent = useCallback(
    (recent: RecentLens) => {
      const newLens: LensDefinition = { type: recent.type, params: { ...recent.params } };
      onChange([...lensChain, newLens]);
      setEnabledStates((prev) => [...prev, true]);
      addRecentLens(newLens, recent.presetId);
      setRecentLenses(getRecentLenses());
      setShowAddLens(false);
    },
    [lensChain, onChange]
  );

  // Create preview lens for a given type
  const getPreviewLensForType = useCallback((lensId: string): LensDefinition => {
    const params = getDefaultParamsForLens(lensId);
    return { type: lensId, params };
  }, []);

  // Create preview lens for a preset
  const getPreviewLensForPreset = useCallback((presetId: string): LensDefinition | null => {
    return createLensFromPreset(presetId);
  }, []);

  // Create preview lens for a recent entry
  const getPreviewLensForRecent = useCallback((recent: RecentLens): LensDefinition => {
    return { type: recent.type, params: { ...recent.params } };
  }, []);

  return (
    <div className={`lens-chain-editor ${inline ? 'lens-chain-editor--inline' : ''}`}>
      {/* Header - collapsible in inline mode */}
      {inline ? (
        <button
          className={`lens-chain-header lens-chain-header--collapsible ${isCollapsed ? 'collapsed' : ''}`}
          onClick={() => setIsCollapsed(!isCollapsed)}
          type="button"
        >
          <span className="lens-chain-collapse-icon">{isCollapsed ? '▸' : '▾'}</span>
          <span className="lens-chain-title">Lenses</span>
          {lensChain.length > 0 && (
            <span className="lens-chain-count">{lensChain.length}</span>
          )}
        </button>
      ) : (
        <div className="lens-chain-header">
          <span className="lens-chain-title">Lens Chain</span>
          {onClose && (
            <button className="lens-chain-close" onClick={onClose} title="Close">
              ×
            </button>
          )}
        </div>
      )}

      {/* Content - hidden when collapsed in inline mode */}
      {(!inline || !isCollapsed) && (
        <>
          {/* Type info */}
          {sourceType && targetType && (
            <div className="lens-chain-types">
              <span className="type-badge source">
                {sourceType.world}:{sourceType.domain}
              </span>
              <span className="type-arrow">→</span>
              <span className="type-badge target">
                {targetType.world}:{targetType.domain}
              </span>
            </div>
          )}

          {/* Lens list */}
          <div className="lens-chain-list">
            {lensChain.length === 0 ? (
              <div className="lens-chain-empty">
                No lenses applied. Signal passes through directly.
              </div>
            ) : (
              lensChain.map((lens, index) => (
                <LensChainItem
                  key={`${lens.type}-${index}`}
                  lens={lens}
                  index={index}
                  isEnabled={enabledStates[index] ?? true}
                  onUpdate={(params) => handleUpdateLens(index, params)}
                  onRemove={() => handleRemoveLens(index)}
                  onToggleEnabled={() => handleToggleEnabled(index)}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  isFirst={index === 0}
                  isLast={index === lensChain.length - 1}
                />
              ))
            )}
          </div>

          {/* Add lens */}
          {showAddLens ? (
            <div className="lens-chain-add-panel">
              {/* Recently Used */}
              {recentLenses.length > 0 && (
                <div className="lens-add-section lens-recent-section">
                  <div className="lens-add-section-title">Recently Used</div>
              <div className="lens-recent-list">
                {recentLenses.map((recent, idx) => {
                  const preset = recent.presetId != null
                    ? LENS_PRESETS.find((p) => p.id === recent.presetId)
                    : null;
                  const label = preset?.name ?? recent.type;
                  const paramsStr = Object.entries(recent.params)
                    .map(([k, v]) => `${k}:${String(v)}`)
                    .join(', ');
                  const previewLens = getPreviewLensForRecent(recent);
                  return (
                    <Tippy
                      key={`recent-${idx}`}
                      content={
                        <LensPreviewTooltip
                          existingChain={lensChain}
                          previewLens={previewLens}
                        />
                      }
                      placement="top"
                      delay={[150, 0]}
                      theme="dark-custom"
                      arrow={true}
                    >
                      <button
                        className="lens-recent-btn"
                        onClick={() => handleAddRecent(recent)}
                      >
                        {label}
                        {paramsStr && <span className="lens-recent-params">({paramsStr})</span>}
                      </button>
                    </Tippy>
                  );
                })}
              </div>
            </div>
          )}

          <div className="lens-add-section">
            <div className="lens-add-section-title">Presets</div>
            <div className="lens-preset-grid">
              {Object.entries(presetsByCategory).map(([category, presets]) => (
                <div key={category} className="lens-preset-category">
                  <div className="lens-preset-category-label">{category}</div>
                  {presets.map((preset) => {
                    const previewLens = getPreviewLensForPreset(preset.id);
                    return (
                      <Tippy
                        key={preset.id}
                        content={
                          previewLens ? (
                            <LensPreviewTooltip
                              existingChain={lensChain}
                              previewLens={previewLens}
                            />
                          ) : (
                            preset.description
                          )
                        }
                        placement="top"
                        delay={[150, 0]}
                        theme="dark-custom"
                        arrow={true}
                      >
                        <button
                          className="lens-preset-btn"
                          onClick={() => handleAddPreset(preset.id)}
                        >
                          {preset.name}
                        </button>
                      </Tippy>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="lens-add-section">
            <div className="lens-add-section-title">All Lenses</div>
            <div className="lens-type-list">
              {availableLenses.map((def) => {
                const previewLens = getPreviewLensForType(def.id);
                return (
                  <Tippy
                    key={def.id}
                    content={
                      <LensPreviewTooltip
                        existingChain={lensChain}
                        previewLens={previewLens}
                      />
                    }
                    placement="top"
                    delay={[150, 0]}
                    theme="dark-custom"
                    arrow={true}
                  >
                    <button
                      className="lens-type-btn"
                      onClick={() => handleAddLens(def.id)}
                    >
                      {def.label}
                    </button>
                  </Tippy>
                );
              })}
            </div>
          </div>

              <button
                className="lens-add-cancel"
                onClick={() => setShowAddLens(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="lens-chain-add-btn"
              onClick={() => setShowAddLens(true)}
            >
              + Add Lens
            </button>
          )}

          {/* Actions */}
          <div className="lens-chain-actions">
            {lensChain.length > 0 && (
              <button className="lens-chain-clear" onClick={() => onChange([])}>
                Clear All
              </button>
            )}
            {!inline && onClose && (
              <button className="lens-chain-done" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Popover wrapper for the lens chain editor.
 */
export function LensChainEditorPopover({
  isOpen,
  position,
  lensChain,
  onChange,
  sourceType,
  targetType,
  scope,
  onClose,
}: LensChainEditorProps & {
  isOpen: boolean;
  position: { x: number; y: number };
}): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <>
      <div className="lens-popover-overlay" onClick={onClose} />
      <div
        className="lens-popover"
        style={{
          left: Math.min(position.x, window.innerWidth - 320),
          top: Math.min(position.y, window.innerHeight - 400),
        }}
      >
        <LensChainEditor
          lensChain={lensChain}
          onChange={onChange}
          sourceType={sourceType}
          targetType={targetType}
          scope={scope}
          onClose={onClose}
        />
      </div>
    </>
  );
}
