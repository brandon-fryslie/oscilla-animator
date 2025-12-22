/**
 * DiagnosticsConsole Component
 *
 * Displays patch diagnostics grouped by severity.
 * Shows errors first, then warnings, then info/hints.
 *
 * Features:
 * - Severity counts header
 * - Click to "go to target" (navigates to the entity)
 * - Mute/unmute individual diagnostics
 * - Action buttons for diagnostic fixes
 * - Empty state when patch is healthy
 */

import { memo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import type { Diagnostic, Severity, TargetRef, DiagnosticAction } from '../diagnostics/types';
import './DiagnosticsConsole.css';

// =============================================================================
// Types
// =============================================================================

export interface DiagnosticsConsoleProps {
  /** Collapse level for space efficiency */
  collapsed?: boolean;
  /** Called when collapse state changes */
  onCollapsedChange?: (collapsed: boolean) => void;
}

// =============================================================================
// Helper Functions
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
      return '\u23F1\uFE0F'; // ⏱️ Timer
    case 'insertBlock':
      return '\u2795'; // ➕ Plus
    case 'removeBlock':
      return '\uD83D\uDDD1\uFE0F'; // 🗑️ Trash
    case 'addAdapter':
      return '\uD83D\uDD0C'; // 🔌 Plug
    case 'openDocs':
      return '\uD83D\uDCD6'; // 📖 Book
    case 'goToTarget':
      return '\uD83C\uDFAF'; // 🎯 Target
    case 'muteDiagnostic':
      return '\uD83D\uDD15'; // 🔕 Bell with slash
    default:
      return '\uD83D\uDD27'; // 🔧 Wrench
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
// Subcomponents
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
      className={`diagnostic-row ${getSeverityClass(diagnostic.severity)} ${isMuted ? 'muted' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <span className="diagnostic-icon">{getSeverityIcon(diagnostic.severity)}</span>
      <div className="diagnostic-content">
        <span className="diagnostic-code">{diagnostic.code}</span>
        <span className="diagnostic-title">{diagnostic.title}</span>
        <span className="diagnostic-message">{diagnostic.message}</span>
        <span className="diagnostic-target">{formatTarget(diagnostic.primaryTarget)}</span>
      </div>
      {diagnostic.metadata.occurrenceCount > 1 && (
        <span className="diagnostic-count">x{diagnostic.metadata.occurrenceCount}</span>
      )}
      {diagnostic.actions?.map((action, index) => (
        <button
          key={index}
          className="diagnostic-action-btn"
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
        className={`diagnostic-mute-btn ${isMuted ? 'unmute' : 'mute'}`}
        onClick={handleMuteToggle}
        title={isMuted ? 'Unmute' : 'Mute'}
        aria-label={isMuted ? 'Unmute diagnostic' : 'Mute diagnostic'}
      >
        {isMuted ? '\uD83D\uDD14' : '\uD83D\uDD15'}
      </button>
    </div>
  );
});

interface SeverityBadgeProps {
  severity: Severity;
  count: number;
}

const SeverityBadge = memo(function SeverityBadge({ severity, count }: SeverityBadgeProps) {
  if (count === 0) return null;
  return (
    <span className={`severity-badge ${getSeverityClass(severity)}`}>
      {getSeverityIcon(severity)} {count}
    </span>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const DiagnosticsConsole = observer(function DiagnosticsConsole({
  collapsed = false,
  onCollapsedChange,
}: DiagnosticsConsoleProps) {
  const { diagnosticStore, actionExecutor } = useStore();

  const handleGoToTarget = useCallback(
    (target: TargetRef) => {
      // Execute goToTarget action via ActionExecutor
      const success = actionExecutor.execute({ kind: 'goToTarget', target });
      if (!success) {
        console.warn('[DiagnosticsConsole] Failed to navigate to target:', target);
      }
    },
    [actionExecutor]
  );

  const handleExecuteAction = useCallback(
    (action: DiagnosticAction) => {
      const success = actionExecutor.execute(action);
      if (!success) {
        console.warn('[DiagnosticsConsole] Failed to execute action:', action);
      }
      // Could add toast feedback here in future
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

  const handleToggleCollapse = useCallback(() => {
    onCollapsedChange?.(!collapsed);
  }, [collapsed, onCollapsedChange]);

  // Get diagnostics grouped by severity (errors first)
  const diagnostics = diagnosticStore.activeDiagnostics;
  const errorCount = diagnosticStore.errorCount;
  const warningCount = diagnosticStore.warningCount;
  const infoCount = diagnosticStore.infoCount;
  const hintCount = diagnosticStore.hintCount;
  const fatalCount = diagnosticStore.fatalCount;
  const totalCount = diagnosticStore.totalCount;
  const mutedCount = diagnosticStore.mutedCount;

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

  const isHealthy = totalCount === 0;

  if (collapsed) {
    return (
      <div className="diagnostics-console collapsed" onClick={handleToggleCollapse}>
        <span className="diagnostics-chip">
          {isHealthy ? (
            <>
              <span className="healthy-icon">{'\u2705'}</span>
              <span className="healthy-text">Healthy</span>
            </>
          ) : (
            <>
              <SeverityBadge severity="fatal" count={fatalCount} />
              <SeverityBadge severity="error" count={errorCount} />
              <SeverityBadge severity="warn" count={warningCount} />
            </>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="diagnostics-console">
      <div className="diagnostics-header">
        <span className="diagnostics-title">Diagnostics</span>
        <div className="diagnostics-counts">
          <SeverityBadge severity="fatal" count={fatalCount} />
          <SeverityBadge severity="error" count={errorCount} />
          <SeverityBadge severity="warn" count={warningCount} />
          <SeverityBadge severity="info" count={infoCount} />
          <SeverityBadge severity="hint" count={hintCount} />
          {mutedCount > 0 && (
            <span className="muted-count" title={`${mutedCount} muted`}>
              {'\uD83D\uDD15'} {mutedCount}
            </span>
          )}
        </div>
        {onCollapsedChange && (
          <button
            className="collapse-btn"
            onClick={handleToggleCollapse}
            title="Collapse"
            aria-label="Collapse diagnostics"
          >
            {'\u25BC'}
          </button>
        )}
      </div>

      <div className="diagnostics-body">
        {isHealthy ? (
          <div className="diagnostics-healthy">
            <span className="healthy-icon">{'\u2705'}</span>
            <span className="healthy-message">Patch is healthy</span>
          </div>
        ) : (
          <div className="diagnostics-list">
            {sortedDiagnostics.map((diag) => (
              <DiagnosticRow
                key={diag.id}
                diagnostic={diag}
                isMuted={diagnosticStore.isMuted(diag.id)}
                onGoToTarget={handleGoToTarget}
                onMute={handleMute}
                onUnmute={handleUnmute}
                onExecuteAction={handleExecuteAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default DiagnosticsConsole;
