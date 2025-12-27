/**
 * DiagnosticBadge Component
 *
 * Inline diagnostic badge that appears on blocks with errors/warnings.
 * Shows severity icon and count, positioned in top-right corner.
 * Clicking badge expands DiagnosticsConsole and scrolls to diagnostic.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import type { Severity } from '../diagnostics/types';
import './DiagnosticBadge.css';

export interface DiagnosticBadgeProps {
  /** Block ID to check for diagnostics */
  blockId: string;
}

/**
 * Get icon for severity level (matches DiagnosticsConsole)
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
 * Determine highest severity from a list of diagnostics.
 * Priority: fatal > error > warn > info > hint
 */
function getHighestSeverity(severities: Severity[]): Severity | null {
  const priority: Record<Severity, number> = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    hint: 4,
  };

  let highestSev: Severity | null = null;
  let highestPri = Infinity;

  for (const sev of severities) {
    const pri = priority[sev];
    if (pri < highestPri) {
      highestPri = pri;
      highestSev = sev;
    }
  }

  return highestSev;
}

/**
 * DiagnosticBadge component - shows diagnostic count and severity for a block
 */
export const DiagnosticBadge = observer(function DiagnosticBadge({ blockId }: DiagnosticBadgeProps) {
  const { diagnosticStore } = useStore();

  // Get diagnostics for this block
  const diagnostics = diagnosticStore.getDiagnosticsForBlock(blockId);

  // No diagnostics - hide badge
  if (diagnostics.length === 0) {
    return null;
  }

  // Determine highest severity
  const severities = diagnostics.map(d => d.severity);
  const highestSeverity = getHighestSeverity(severities);

  if (!highestSeverity) {
    return null;
  }

  const count = diagnostics.length;
  const icon = getSeverityIcon(highestSeverity);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent block selection

    // TODO: Expand DiagnosticsConsole and scroll to first diagnostic for this block
    // This will require adding a method to UIStore or DiagnosticStore
    // For now, just log the action
    console.log(`[DiagnosticBadge] Clicked badge for block ${blockId} with ${count} diagnostic(s)`);
  };

  return (
    <div
      className={`diagnostic-badge severity-${highestSeverity}`}
      onClick={handleClick}
      title={`${count} diagnostic${count > 1 ? 's' : ''}: ${highestSeverity}`}
    >
      <span className="diagnostic-badge-icon">{icon}</span>
      <span className="diagnostic-badge-count">{count}</span>
    </div>
  );
});
