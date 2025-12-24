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
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { LensDefinition, TypeDesc } from '../types';
import { LENS_PRESETS, createLensFromPreset, type LensPreset } from '../lens-presets';
import { getEasingNames } from '../lenses';

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
  /** Close the editor */
  onClose: () => void;
}

/**
 * Default params for each lens type
 */
const DEFAULT_LENS_PARAMS: Record<string, Record<string, unknown>> = {
  ease: { easing: 'easeInOutSine' },
  slew: { rate: 2.0 },
  quantize: { steps: 4 },
  scale: { scale: 1, offset: 0 },
  warp: { power: 1 },
  broadcast: {},
  perElementOffset: { range: 1.0 },
  clamp: { min: 0, max: 1 },
  offset: { amount: 0 },
  deadzone: { threshold: 0.05 },
  mapRange: { inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
  Gain: { gain: 1, bias: 0 },
  Clamp: { min: 0, max: 1 },
  Ease: { amount: 1 },
  Slew: { riseMs: 100, fallMs: 100 },
  PhaseOffset: { offset: 0 },
  PingPong: { enabled: true },
  Rotate2D: { turns: 0 },
  HueShift: { turns: 0 },
};

/**
 * Available lens types for adding
 */
const LENS_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'ease', label: 'Ease', description: 'Apply easing curve' },
  { value: 'slew', label: 'Slew', description: 'Smooth rate limiting' },
  { value: 'quantize', label: 'Quantize', description: 'Snap to steps' },
  { value: 'scale', label: 'Scale', description: 'Linear scale + offset' },
  { value: 'warp', label: 'Warp', description: 'Phase warping' },
  { value: 'broadcast', label: 'Broadcast', description: 'Signal to field' },
  { value: 'perElementOffset', label: 'Per-Element Offset', description: 'Offset per element' },
  { value: 'clamp', label: 'Clamp', description: 'Clamp to range' },
];

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
        <div className="lens-chain-item-params">
          <LensParamsEditor lens={lens} onChange={handleParamChange} />
        </div>
      )}
    </div>
  );
}

/**
 * Parameter editor for a single lens.
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
    case 'Ease':
      if (lens.type === 'Ease') {
        return (
          <div className="lens-param-row">
            <label className="lens-param-label">Amount</label>
            <input
              type="range"
              className="lens-param-slider"
              value={(lens.params.amount as number) ?? 1}
              min={0}
              max={1}
              step={0.01}
              onChange={(e) => onChange('amount', parseFloat(e.target.value))}
            />
            <span className="lens-param-value">
              {((lens.params.amount as number) ?? 1).toFixed(2)}
            </span>
          </div>
        );
      }
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
    case 'Slew':
      if (lens.type === 'Slew') {
        return (
          <>
            <div className="lens-param-row">
              <label className="lens-param-label">Rise (ms)</label>
              <input
                type="number"
                className="lens-param-input"
                value={(lens.params.riseMs as number) ?? 100}
                step={10}
                min={0}
                onChange={(e) => onChange('riseMs', parseFloat(e.target.value) || 100)}
              />
            </div>
            <div className="lens-param-row">
              <label className="lens-param-label">Fall (ms)</label>
              <input
                type="number"
                className="lens-param-input"
                value={(lens.params.fallMs as number) ?? 100}
                step={10}
                min={0}
                onChange={(e) => onChange('fallMs', parseFloat(e.target.value) || 100)}
              />
            </div>
          </>
        );
      }
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
    case 'Gain':
      return (
        <>
          <div className="lens-param-row">
            <label className="lens-param-label">{lens.type === 'Gain' ? 'Gain' : 'Scale'}</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.scale as number) ?? (lens.params.gain as number) ?? 1}
              step={0.1}
              onChange={(e) =>
                onChange(lens.type === 'Gain' ? 'gain' : 'scale', parseFloat(e.target.value) || 1)
              }
            />
          </div>
          <div className="lens-param-row">
            <label className="lens-param-label">{lens.type === 'Gain' ? 'Bias' : 'Offset'}</label>
            <input
              type="number"
              className="lens-param-input"
              value={(lens.params.offset as number) ?? (lens.params.bias as number) ?? 0}
              step={0.1}
              onChange={(e) =>
                onChange(lens.type === 'Gain' ? 'bias' : 'offset', parseFloat(e.target.value) || 0)
              }
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

    case 'clamp':
    case 'Clamp':
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

    case 'PhaseOffset':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Offset</label>
          <input
            type="range"
            className="lens-param-slider"
            value={(lens.params.offset as number) ?? 0}
            min={0}
            max={1}
            step={0.01}
            onChange={(e) => onChange('offset', parseFloat(e.target.value))}
          />
          <span className="lens-param-value">
            {((lens.params.offset as number) ?? 0).toFixed(2)}
          </span>
        </div>
      );

    case 'PingPong':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Enabled</label>
          <input
            type="checkbox"
            checked={(lens.params.enabled as boolean) ?? true}
            onChange={(e) => onChange('enabled', e.target.checked)}
          />
        </div>
      );

    case 'Rotate2D':
    case 'HueShift':
      return (
        <div className="lens-param-row">
          <label className="lens-param-label">Turns</label>
          <input
            type="range"
            className="lens-param-slider"
            value={(lens.params.turns as number) ?? 0}
            min={0}
            max={1}
            step={0.01}
            onChange={(e) => onChange('turns', parseFloat(e.target.value))}
          />
          <span className="lens-param-value">
            {((lens.params.turns as number) ?? 0).toFixed(2)}
          </span>
        </div>
      );

    case 'broadcast':
      return (
        <div className="lens-param-row lens-param-hint">
          No parameters needed
        </div>
      );

    default:
      return (
        <div className="lens-param-row lens-param-hint">
          Unknown lens type: {lens.type}
        </div>
      );
  }
}

/**
 * Main lens chain editor component.
 */
export function LensChainEditor({
  lensChain,
  onChange,
  sourceType,
  targetType,
  onClose,
}: LensChainEditorProps): React.ReactElement {
  // Track enabled state per lens (default all enabled)
  const [enabledStates, setEnabledStates] = useState<boolean[]>(
    () => lensChain.map(() => true)
  );

  // Show add lens UI
  const [showAddLens, setShowAddLens] = useState(false);

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

  // Preview lens (shown when hovering over add options)
  const [previewLens, setPreviewLens] = useState<LensDefinition | null>(null);

  // Load recent lenses on mount
  useEffect(() => {
    setRecentLenses(getRecentLenses());
  }, [showAddLens]);

  // Clear preview when add panel closes
  useEffect(() => {
    if (!showAddLens) {
      setPreviewLens(null);
    }
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
    (type: string) => {
      const params = DEFAULT_LENS_PARAMS[type] ?? {};
      const newLens: LensDefinition = { type, params };
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

  // Preview handlers for hover
  const handlePreviewLens = useCallback((type: string) => {
    const params = DEFAULT_LENS_PARAMS[type] ?? {};
    setPreviewLens({ type, params });
  }, []);

  const handlePreviewPreset = useCallback((presetId: string) => {
    const lens = createLensFromPreset(presetId);
    if (lens != null) {
      setPreviewLens(lens);
    }
  }, []);

  const handlePreviewRecent = useCallback((recent: RecentLens) => {
    setPreviewLens({ type: recent.type, params: { ...recent.params } });
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewLens(null);
  }, []);

  // Build display chain with preview
  const displayChain = useMemo(() => {
    if (previewLens) {
      return [...lensChain, previewLens];
    }
    return lensChain;
  }, [lensChain, previewLens]);

  return (
    <div className="lens-chain-editor">
      <div className="lens-chain-header">
        <span className="lens-chain-title">Lens Chain</span>
        <button className="lens-chain-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>

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
          {/* Preview indicator */}
          {previewLens && (
            <div className="lens-preview-indicator">
              <span className="lens-preview-label">Preview:</span>
              <span className="lens-preview-chain">
                {displayChain.map((lens, i) => {
                  const isPreview = i === displayChain.length - 1;
                  const params = Object.entries(lens.params)
                    .map(([k, v]) => `${k}:${String(v)}`)
                    .join(', ');
                  return (
                    <span key={i} className={isPreview ? 'preview-lens' : ''}>
                      {i > 0 && ' → '}
                      {params !== '' ? `${lens.type}(${params})` : lens.type}
                    </span>
                  );
                })}
              </span>
            </div>
          )}

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
                  return (
                    <button
                      key={`recent-${idx}`}
                      className="lens-recent-btn"
                      onClick={() => handleAddRecent(recent)}
                      onMouseEnter={() => handlePreviewRecent(recent)}
                      onMouseLeave={clearPreview}
                      title={paramsStr || 'No params'}
                    >
                      {label}
                      {paramsStr && <span className="lens-recent-params">({paramsStr})</span>}
                    </button>
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
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      className="lens-preset-btn"
                      onClick={() => handleAddPreset(preset.id)}
                      onMouseEnter={() => handlePreviewPreset(preset.id)}
                      onMouseLeave={clearPreview}
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="lens-add-section">
            <div className="lens-add-section-title">Custom</div>
            <div className="lens-type-list">
              {LENS_TYPES.map((t) => (
                <button
                  key={t.value}
                  className="lens-type-btn"
                  onClick={() => handleAddLens(t.value)}
                  onMouseEnter={() => handlePreviewLens(t.value)}
                  onMouseLeave={clearPreview}
                  title={t.description}
                >
                  {t.label}
                </button>
              ))}
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
        <button className="lens-chain-clear" onClick={() => onChange([])}>
          Clear All
        </button>
        <button className="lens-chain-done" onClick={onClose}>
          Done
        </button>
      </div>
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
          onClose={onClose}
        />
      </div>
    </>
  );
}
