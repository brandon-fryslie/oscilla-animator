/**
 * DebugReplPanel Component
 *
 * A tabbed debug panel for runtime inspection:
 * - Overview: Patch status, time mode, health indicators
 * - Probes: Active probes with live values and sparklines
 * - Console: REPL for commands and evaluation
 *
 * Aligned with design-docs/11-Debugger
 */

import { observer } from 'mobx-react-lite';
import { useRef, useEffect, useState, useCallback } from 'react';
import { debugStore, type ConsoleLine } from '../stores/DebugStore';
import {
  type Probe,
  type Sample,
  type ValueSummary,
  formatValueSummary,
  getNumericValue,
} from '../debug/types';
import { TraceController } from '../debug/TraceController';
import { valueRecordToSummary } from '../debug/valueRecordToSummary';
import './DebugReplPanel.css';

// =============================================================================
// Types
// =============================================================================

type TabId = 'overview' | 'probes' | 'console';

interface DebugReplPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Overview Tab - Patch status and health
 */
const OverviewTab = observer(() => {
  const overview = debugStore.getOverview();

  const timeModeLabel = {
    finite: '⏱ Finite',
    cyclic: '∞ Cyclic',
    infinite: '∿ Infinite',
    unknown: '? Unknown',
  }[overview.timeMode];

  const healthColor = {
    ok: '#22c55e',
    warn: '#f59e0b',
    error: '#ef4444',
  }[overview.health];

  // Get trace controller mode
  const traceMode = TraceController.instance.getMode();
  const traceModeLabel = {
    off: 'Off (zero overhead)',
    timing: 'Timing (spans only)',
    full: 'Full (values + spans)',
  }[traceMode];

  return (
    <div className="debug-overview">
      <div className="overview-section">
        <div className="overview-label">Time Mode</div>
        <div className="overview-value">{timeModeLabel}</div>
        {overview.period !== undefined && overview.period !== null && (
          <div className="overview-detail">{overview.period}ms period</div>
        )}
      </div>

      <div className="overview-section">
        <div className="overview-label">Health</div>
        <div className="overview-value" style={{ color: healthColor }}>
          {overview.health === 'ok' ? '● OK' : overview.health === 'warn' ? '⚠ Warning' : '✕ Error'}
        </div>
      </div>

      <div className="overview-section">
        <div className="overview-label">Active Probes</div>
        <div className="overview-value">{overview.probeCount}</div>
        {overview.debuggedBlockIds.length > 0 && (
          <div className="overview-detail">
            {overview.debuggedBlockIds.slice(0, 3).join(', ')}
            {overview.debuggedBlockIds.length > 3 && ` +${overview.debuggedBlockIds.length - 3} more`}
          </div>
        )}
      </div>

      <div className="overview-section">
        <div className="overview-label">Trace Mode</div>
        <div className="overview-value">{traceModeLabel}</div>
        <div className="overview-controls">
          <button
            className={`trace-mode-btn ${traceMode === 'off' ? 'active' : ''}`}
            onClick={() => TraceController.instance.setMode('off')}
            title="Disable IR probes (zero overhead)"
          >
            Off
          </button>
          <button
            className={`trace-mode-btn ${traceMode === 'full' ? 'active' : ''}`}
            onClick={() => TraceController.instance.setMode('full')}
            title="Enable IR probes (full tracing)"
          >
            Full
          </button>
        </div>
      </div>

      <div className="overview-hint">
        Right-click blocks to probe them, or use the <code>probe</code> command.
      </div>
    </div>
  );
});

/**
 * Sparkline visualization
 */
function Sparkline({ samples, width = 60, height = 20 }: { samples: Sample[]; width?: number; height?: number }) {
  if (samples.length < 2) return null;

  const values = samples
    .map(s => getNumericValue(s.value))
    .filter((v): v is number => v !== null);

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Phase meter visualization (0-1)
 */
function PhaseMeter({ value, width = 60 }: { value: number; width?: number }) {
  const percentage = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div className="phase-meter" style={{ width }}>
      <div className="phase-meter-fill" style={{ width: `${percentage}%` }} />
      <div className="phase-meter-text">{(value * 100).toFixed(0)}%</div>
    </div>
  );
}

/**
 * Single Probe Card
 *
 * Supports both legacy DebugStore probes and IR TraceController probes.
 * For IR probes, tries to read from TraceController first.
 */
const ProbeCard = observer(({ probe }: { probe: Probe }) => {
  // Try to get value from IR TraceController first (for IR-compiled patches)
  let irValue: ValueSummary | null = null;
  const traceController = TraceController.instance;

  if (traceController.getMode() === 'full' && probe.target.kind === 'block') {
    // Probe IDs from IR follow pattern: blockId:portId (e.g., "someBlockId:signal")
    const blockId = probe.target.blockId;

    // Try common port IDs
    const portIds = ['signal', 'phase', 'field'];
    for (const portId of portIds) {
      const probeId = `${blockId}:${portId}`;
      const record = traceController.getProbeValue(probeId);
      if (record !== undefined) {
        irValue = valueRecordToSummary(record);
        if (irValue !== null) {
          break; // Use first available value
        }
      }
    }
  }

  // Fall back to legacy DebugStore value if no IR value found
  const legacyValue = probe.currentSample !== undefined && probe.currentSample !== null
    ? probe.currentSample.value
    : null;

  const value = irValue !== null ? irValue : legacyValue;
  const valueDisplay = value !== null ? formatValueSummary(value) : '—';

  const age = probe.currentSample !== undefined && probe.currentSample !== null
    ? Date.now() - probe.currentSample.timestamp
    : null;
  const isPhase = value?.t === 'phase';
  const numericValue = value !== null ? getNumericValue(value) : null;

  // Show indicator for IR vs legacy source
  const isIRProbe = irValue !== null;
  const sourceIndicator = isIRProbe ? 'IR' : 'Legacy';

  const handleRemove = () => {
    debugStore.removeProbe(probe.id);
  };

  return (
    <div className="probe-card">
      <div className="probe-header">
        <span className="probe-label">{probe.label}</span>
        <span className="probe-source-indicator" title={`Data source: ${sourceIndicator}`}>
          {isIRProbe ? '⚡' : '🔧'}
        </span>
        <button className="probe-remove" onClick={handleRemove} title="Remove probe">×</button>
      </div>

      <div className="probe-content">
        {isPhase && numericValue !== null ? (
          <PhaseMeter value={numericValue} />
        ) : (
          <div className="probe-value">{valueDisplay}</div>
        )}

        {probe.history.length > 1 && (
          <Sparkline samples={probe.history} />
        )}
      </div>

      <div className="probe-footer">
        {age !== null && <span className="probe-age">{age}ms ago</span>}
        <span className="probe-kind">{probe.artifactKind}</span>
      </div>
    </div>
  );
});

/**
 * Probes Tab - Active probes with visualizations
 */
const ProbesTab = observer(() => {
  const probes = Array.from(debugStore.probes.values()).filter(p => p.active);

  if (probes.length === 0) {
    return (
      <div className="probes-empty">
        <div className="probes-empty-icon">📡</div>
        <div className="probes-empty-text">No active probes</div>
        <div className="probes-empty-hint">
          Right-click a block and select "Debug This"
          <br />
          or type <code>probe Time</code> in the console
        </div>
      </div>
    );
  }

  return (
    <div className="probes-grid">
      {probes.map(probe => (
        <ProbeCard key={probe.id} probe={probe} />
      ))}
    </div>
  );
});

/**
 * Console Line
 */
const ConsoleLineView = ({ line }: { line: ConsoleLine }) => {
  const className = `console-line console-line-${line.type}`;
  return (
    <div className={className}>
      <span className="console-line-content">{line.content}</span>
    </div>
  );
};

/**
 * Console Tab - REPL interface
 */
const ConsoleTab = observer(() => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const lines = debugStore.consoleLines;

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current !== null && outputRef.current !== undefined) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines.length]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim().length > 0) {
      debugStore.executeCommand(inputValue);
      setInputValue('');
    }
  }, [inputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = debugStore.getPreviousCommand();
      if (prev !== null) setInputValue(prev);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = debugStore.getNextCommand();
      if (next !== null) setInputValue(next);
    }
  }, []);

  return (
    <div className="console-tab">
      <div className="console-output" ref={outputRef}>
        {lines.length === 0 ? (
          <div className="console-empty">
            <div className="console-empty-hint">
              Type <code>help</code> for available commands
            </div>
          </div>
        ) : (
          lines.map(line => <ConsoleLineView key={line.id} line={line} />)
        )}
      </div>

      <form className="console-input-form" onSubmit={handleSubmit}>
        <span className="console-prompt">{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          className="console-input"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const DebugReplPanel = observer(({ collapsed, onToggleCollapse }: DebugReplPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('probes');
  const probeCount = debugStore.probes.size;

  // Focus console input when switching to console tab
  useEffect(() => {
    if (!collapsed && activeTab === 'console') {
      const input = document.querySelector<HTMLInputElement>('.console-input');
      if (input !== null && input !== undefined) {
        input.focus();
      }
    }
  }, [collapsed, activeTab]);

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'probes', label: 'Probes', badge: probeCount > 0 ? probeCount : undefined },
    { id: 'console', label: 'Console' },
  ];

  return (
    <div className={`debug-panel ${collapsed ? 'collapsed' : ''}`}>
      <div
        className="panel-header debug-panel-header"
        onClick={onToggleCollapse}
        style={{ cursor: 'pointer' }}
      >
        <span className="panel-title">Debug</span>
        <div className="panel-header-actions">
          {!collapsed && activeTab === 'console' && debugStore.consoleLines.length > 0 && (
            <button
              className="panel-collapse-icon"
              onClick={e => {
                e.stopPropagation();
                debugStore.clearConsole();
              }}
              title="Clear console"
            >
              ⌫
            </button>
          )}
          <button
            className="panel-collapse-icon"
            onClick={e => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            title={collapsed ? 'Show debug' : 'Hide debug'}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="debug-panel-body">
          <div className="debug-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`debug-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.badge !== undefined && <span className="debug-tab-badge">{tab.badge}</span>}
              </button>
            ))}
          </div>

          <div className="debug-tab-content">
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'probes' && <ProbesTab />}
            {activeTab === 'console' && <ConsoleTab />}
          </div>
        </div>
      )}
    </div>
  );
});
