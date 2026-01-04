/**
 * Prints Tab Component
 *
 * Shows print lens output in the debug drawer.
 * Displays a scrollable list of print log entries with label, value, and timestamp.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import { useRef, useEffect } from 'react';
import type { PrintLogEntry } from '../stores/DebugUIStore';

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toFixed(4);
  }
  if (typeof value === 'object' && value !== null) {
    // Handle field data
    if ('type' in value && (value as { type: string }).type === 'field') {
      const field = value as { type: string; count: number; sample: number[] };
      const sampleStr = field.sample.map(v => v.toFixed(2)).join(', ');
      return `Field[${field.count}]: [${sampleStr}${field.count > 5 ? ', ...' : ''}]`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format timestamp as relative time
 */
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(timestamp).toLocaleTimeString();
}

export const PrintsTab = observer(function PrintsTab() {
  const { debugUIStore } = useStore();
  const { printLogs } = debugUIStore;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [printLogs.length]);

  if (printLogs.length === 0) {
    return (
      <div className="prints-tab">
        <div className="prints-empty">
          <p>No print logs yet</p>
          <p className="prints-hint">
            Add a Print lens to a connection to see values here.
            Right-click an output port → Add Print Lens
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="prints-tab">
      <div className="prints-header">
        <span className="prints-count">{printLogs.length} entries</span>
        <button
          className="prints-clear-btn"
          onClick={() => debugUIStore.clearPrintLogs()}
          title="Clear all print logs"
        >
          Clear
        </button>
      </div>
      <div className="prints-list" ref={scrollRef}>
        {printLogs.map((entry: PrintLogEntry) => (
          <div key={entry.id} className="print-entry">
            <span className="print-label">{entry.label}</span>
            <span className="print-value">{formatValue(entry.value)}</span>
            <span className="print-time">{formatTime(entry.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
