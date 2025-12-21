/**
 * LogWindow Component
 *
 * Collapsible log viewer with filtering by level and component.
 * Three size modes: collapsed, compact (2 lines), full.
 * Includes diagnostics panel on the right side.
 */

import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { useStore } from './stores';
import type { LogLevel, LogComponent } from './logTypes';
import {
  LOG_LEVELS,
  LOG_LEVEL_CONFIG,
  LOG_COMPONENTS,
  LOG_COMPONENT_CONFIG,
} from './logTypes';
import { StatusBadge } from './StatusBadge';
import type { Diagnostic, Severity, TargetRef, DiagnosticAction } from './diagnostics/types';
import './LogWindow.css';

type LogSize = 'collapsed' | 'compact' | 'full';

/**
 * Format timestamp as HH:MM:SS.mmm
 */
function formatTimestamp(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Multiselect dropdown for filtering.
 */
interface MultiSelectProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: Set<T>;
  getLabel: (option: T) => string;
  onToggle: (option: T) => void;
}

function MultiSelect<T extends string>({
  label,
  options,
  selected,
  getLabel,
  onToggle,
}: MultiSelectProps<T>) {

  return (
    <div className="log-filter">
      <span className="log-filter-label">{label}:</span>
      <div className="log-filter-options">
        {options.map((option) => (
          <label key={option} className="log-filter-option">
            <input
              type="checkbox"
              checked={selected.has(option)}
              onChange={() => onToggle(option)}
            />
            <span>{getLabel(option)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Diagnostic Helper Functions
// =============================================================================

/**
 * Get icon for severity level
 */
function getSeverityIcon(severity: Severity): string {
  switch (severity) {
    case 'fatal':
      return '\u26D4'; // No entry
    case 'error':
      return '\u274C'; // X mark
    case 'warn':
      return '\u26A0'; // Warning triangle
    case 'info':
      return '\u2139'; // Info circle
    case 'hint':
      return '\uD83D\uDCA1'; // Light bulb
    default:
      return '\u2022'; // Bullet
  }
}

/**
 * Get CSS class for severity level
 */
function getSeverityClass(severity: Severity): string {
  return `severity-${severity}`;
}

/**
 * Format a TargetRef for display
 */
function formatTarget(target: TargetRef): string {
  switch (target.kind) {
    case 'block':
      return `Block: ${target.blockId}`;
    case 'port':
      return `Port: ${target.blockId}.${target.portId}`;
    case 'bus':
      return `Bus: ${target.busId}`;
    case 'binding':
      return `Binding: ${target.busId} -> ${target.blockId}`;
    case 'timeRoot':
      return `TimeRoot: ${target.blockId}`;
    case 'graphSpan':
      if (target.blockIds.length === 0) return 'Patch';
      return `Blocks: ${target.blockIds.join(', ')}`;
    case 'composite':
      return `Composite: ${target.compositeDefId}`;
    default:
      return 'Unknown target';
  }
}

/**
 * Get icon for a diagnostic action
 */
function getActionIcon(action: DiagnosticAction): string {
  switch (action.kind) {
    case 'createTimeRoot':
      return '\u23F1\uFE0F'; // Timer
    case 'insertBlock':
      return '\u2795'; // Plus
    case 'removeBlock':
      return '\uD83D\uDDD1\uFE0F'; // Trash
    case 'addAdapter':
      return '\uD83D\uDD0C'; // Plug
    case 'openDocs':
      return '\uD83D\uDCD6'; // Book
    case 'goToTarget':
      return '\uD83C\uDFAF'; // Target
    case 'muteDiagnostic':
      return '\uD83D\uDD15'; // Bell with slash
    default:
      return '\uD83D\uDD27'; // Wrench
  }
}

/**
 * Get label for a diagnostic action
 */
function getActionLabel(action: DiagnosticAction): string {
  switch (action.kind) {
    case 'createTimeRoot':
      return `Create ${action.timeRootKind} TimeRoot`;
    case 'insertBlock':
      return `Insert ${action.blockType}`;
    case 'removeBlock':
      return 'Remove block';
    case 'addAdapter':
      return `Add ${action.adapterType} adapter`;
    case 'openDocs':
      return 'Open documentation';
    case 'goToTarget':
      return 'Go to target';
    case 'muteDiagnostic':
      return 'Mute diagnostic';
    default:
      return 'Execute action';
  }
}

// =============================================================================
// Diagnostic Row Component
// =============================================================================

interface DiagnosticRowProps {
  diagnostic: Diagnostic;
  isMuted: boolean;
  onGoToTarget: (target: TargetRef) => void;
  onMute: (id: string) => void;
  onUnmute: (id: string) => void;
  onExecuteAction: (action: DiagnosticAction) => void;
}

const DiagnosticRow = memo(function DiagnosticRow({
  diagnostic,
  isMuted,
  onGoToTarget,
  onMute,
  onUnmute,
  onExecuteAction,
}: DiagnosticRowProps) {
  const handleClick = useCallback(() => {
    onGoToTarget(diagnostic.primaryTarget);
  }, [diagnostic.primaryTarget, onGoToTarget]);

  const handleMuteToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isMuted) {
        onUnmute(diagnostic.id);
      } else {
        onMute(diagnostic.id);
      }
    },
    [diagnostic.id, isMuted, onMute, onUnmute]
  );

  return (
    <div
      className={`diag-row ${getSeverityClass(diagnostic.severity)} ${isMuted ? 'muted' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="Click to navigate to target"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <span className="diag-icon">{getSeverityIcon(diagnostic.severity)}</span>
      <div className="diag-content">
        <span className="diag-code">{diagnostic.code}</span>
        <span className="diag-title">{diagnostic.title}</span>
        <span className="diag-target">{formatTarget(diagnostic.primaryTarget)}</span>
      </div>
      {diagnostic.metadata.occurrenceCount > 1 && (
        <span className="diag-count">x{diagnostic.metadata.occurrenceCount}</span>
      )}
      {diagnostic.actions?.map((action, index) => (
        <button
          key={index}
          className="diag-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onExecuteAction(action);
          }}
          title={getActionLabel(action)}
        >
          {getActionIcon(action)}
        </button>
      ))}
      <button
        className={`diag-mute-btn ${isMuted ? 'unmute' : 'mute'}`}
        onClick={handleMuteToggle}
        title={isMuted ? 'Unmute' : 'Mute'}
        aria-label={isMuted ? 'Unmute diagnostic' : 'Mute diagnostic'}
      >
        {isMuted ? '\uD83D\uDD14' : '\uD83D\uDD15'}
      </button>
    </div>
  );
});

// =============================================================================
// Severity Badge Component
// =============================================================================

interface SeverityBadgeProps {
  severity: Severity;
  count: number;
}

const SeverityBadge = memo(function SeverityBadge({ severity, count }: SeverityBadgeProps) {
  if (count === 0) return null;
  return (
    <span className={`diag-severity-badge ${getSeverityClass(severity)}`}>
      {getSeverityIcon(severity)} {count}
    </span>
  );
});

/**
 * LogWindow - collapsible log viewer with filters and diagnostics panel.
 */
export const LogWindow = observer(() => {
  const store = useStore();
  const logStore = store.logStore;
  const diagnosticStore = store.diagnosticStore;
  const actionExecutor = store.actionExecutor;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<LogSize>('compact');

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (logStore.autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0; // Newest at top
    }
  }, [logStore.filteredEntries.length, logStore.autoScroll]);

  const handleToggleLevel = (level: LogLevel) => {
    logStore.toggleLevel(level);
  };

  const handleToggleComponent = (component: LogComponent) => {
    logStore.toggleComponent(component);
  };

  const handleClear = () => {
    logStore.clear();
  };

  const cycleSize = () => {
    setSize((prev) => {
      if (prev === 'collapsed') return 'compact';
      if (prev === 'compact') return 'full';
      return 'collapsed';
    });
  };

  // Diagnostic handlers
  const handleGoToTarget = useCallback(
    (target: TargetRef) => {
      const success = actionExecutor.execute({ kind: 'goToTarget', target });
      if (!success) {
        console.warn('[LogWindow] Failed to navigate to target:', target);
      }
    },
    [actionExecutor]
  );

  const handleExecuteAction = useCallback(
    (action: DiagnosticAction) => {
      const success = actionExecutor.execute(action);
      if (!success) {
        console.warn('[LogWindow] Failed to execute action:', action);
      }
    },
    [actionExecutor]
  );

  const handleMute = useCallback(
    (id: string) => {
      diagnosticStore.muteDiagnostic(id);
    },
    [diagnosticStore]
  );

  const handleUnmute = useCallback(
    (id: string) => {
      diagnosticStore.unmuteDiagnostic(id);
    },
    [diagnosticStore]
  );

  // Get diagnostics sorted by severity
  const diagnostics = diagnosticStore.activeDiagnostics;
  const diagErrorCount = diagnosticStore.errorCount;
  const diagWarningCount = diagnosticStore.warningCount;
  const diagInfoCount = diagnosticStore.infoCount;
  const diagHintCount = diagnosticStore.hintCount;
  const diagFatalCount = diagnosticStore.fatalCount;
  const diagTotalCount = diagnosticStore.totalCount;
  const diagMutedCount = diagnosticStore.mutedCount;

  // Sort diagnostics: fatal > error > warn > info > hint
  const severityOrder: Record<Severity, number> = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    hint: 4,
  };

  const sortedDiagnostics = [...diagnostics].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  const isDiagnosticsHealthy = diagTotalCount === 0;

  const sizeIcon = size === 'collapsed' ? '\u25B2' : size === 'compact' ? '\u25C6' : '\u25BC';
  const sizeTitle = size === 'collapsed' ? 'Expand logs' : size === 'compact' ? 'Full size' : 'Collapse';

  return (
    <div className={`log-window log-window-${size}`}>
      {/* Header bar - clickable to cycle sizes */}
      <div
        className="log-header"
        onClick={cycleSize}
        title={sizeTitle}
        style={{ cursor: 'pointer' }}
      >
        <span className="log-size-icon">{sizeIcon}</span>
        <span className="log-title">Logs</span>

        {size !== 'collapsed' && (
          <>
            <div className="log-filters" onClick={(e) => e.stopPropagation()}>
              <MultiSelect
                label="Level"
                options={LOG_LEVELS}
                selected={logStore.enabledLevels}
                getLabel={(level) => LOG_LEVEL_CONFIG[level].label}
                onToggle={handleToggleLevel}
              />
              <MultiSelect
                label="Source"
                options={LOG_COMPONENTS}
                selected={logStore.enabledComponents}
                getLabel={(component) => LOG_COMPONENT_CONFIG[component].label}
                onToggle={handleToggleComponent}
              />
            </div>
            <label
              className="log-auto-clear-option"
              title="Auto-clear logs when loading a macro"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={logStore.autoClearOnMacro}
                onChange={(e) => logStore.setAutoClearOnMacro(e.target.checked)}
              />
              <span>Auto-clear</span>
            </label>
            <button className="log-clear-btn" onClick={(e) => { e.stopPropagation(); handleClear(); }}>
              Clear
            </button>
          </>
        )}

        {/* Right side: badges + status */}
        <div className="log-right-group">
          {logStore.errorCount > 0 && (
            <span className="log-badge log-badge-error">{logStore.errorCount}</span>
          )}
          {logStore.warningCount > 0 && (
            <span className="log-badge log-badge-warning">{logStore.warningCount}</span>
          )}
          {/* Diagnostic badges */}
          {diagFatalCount > 0 && (
            <span className="log-badge log-badge-fatal" title="Fatal diagnostics">{diagFatalCount} fatal</span>
          )}
          {diagErrorCount > 0 && (
            <span className="log-badge log-badge-diag-error" title="Diagnostic errors">{diagErrorCount} diag</span>
          )}
          <StatusBadge />
        </div>
      </div>

      {/* Log entries and diagnostics panel - hidden when collapsed */}
      {size !== 'collapsed' && (
        <div className="log-body">
          {/* Left: Log entries */}
          <div className="log-entries" ref={scrollRef}>
            {logStore.filteredEntries.length === 0 ? (
              <div className="log-empty">No log entries</div>
            ) : (
              logStore.filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`log-entry log-entry-${entry.level}`}
                >
                  <span className="log-timestamp">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span
                    className="log-level"
                    style={{ color: LOG_LEVEL_CONFIG[entry.level].color }}
                  >
                    {LOG_LEVEL_CONFIG[entry.level].label}
                  </span>
                  <span className="log-component">
                    [{LOG_COMPONENT_CONFIG[entry.component].label}]
                  </span>
                  <span className="log-message">{entry.message}</span>
                  {entry.details && (
                    <details className="log-details">
                      <summary>Details</summary>
                      <pre>{entry.details}</pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Right: Diagnostics panel */}
          <div className="diag-panel">
            <div className="diag-header">
              <span className="diag-title">Diagnostics</span>
              <div className="diag-counts">
                <SeverityBadge severity="fatal" count={diagFatalCount} />
                <SeverityBadge severity="error" count={diagErrorCount} />
                <SeverityBadge severity="warn" count={diagWarningCount} />
                <SeverityBadge severity="info" count={diagInfoCount} />
                <SeverityBadge severity="hint" count={diagHintCount} />
                {diagMutedCount > 0 && (
                  <span className="diag-muted-count" title={`${diagMutedCount} muted`}>
                    {'\uD83D\uDD15'} {diagMutedCount}
                  </span>
                )}
              </div>
            </div>
            <div className="diag-entries">
              {isDiagnosticsHealthy ? (
                <div className="diag-healthy">
                  <span className="diag-healthy-icon">{'\u2705'}</span>
                  <span className="diag-healthy-text">All clear</span>
                </div>
              ) : (
                sortedDiagnostics.map((diag) => (
                  <DiagnosticRow
                    key={diag.id}
                    diagnostic={diag}
                    isMuted={diagnosticStore.isMuted(diag.id)}
                    onGoToTarget={handleGoToTarget}
                    onMute={handleMute}
                    onUnmute={handleUnmute}
                    onExecuteAction={handleExecuteAction}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
