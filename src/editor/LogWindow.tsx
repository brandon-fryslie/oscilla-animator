/**
 * LogWindow Component
 *
 * Collapsible log viewer with filtering by level and component.
 * Three size modes: collapsed, compact (2 lines), full.
 */

import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState } from 'react';
import { useStore } from './stores';
import type { LogLevel, LogComponent } from './logTypes';
import {
  LOG_LEVELS,
  LOG_LEVEL_CONFIG,
  LOG_COMPONENTS,
  LOG_COMPONENT_CONFIG,
} from './logTypes';
import { StatusBadge } from './StatusBadge';
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

/**
 * LogWindow - collapsible log viewer with filters.
 */
export const LogWindow = observer(() => {
  const store = useStore();
  const logStore = store.logStore;
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

  const sizeIcon = size === 'collapsed' ? '▲' : size === 'compact' ? '◆' : '▼';
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
          <StatusBadge />
        </div>
      </div>

      {/* Log entries - hidden when collapsed */}
      {size !== 'collapsed' && (
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
      )}
    </div>
  );
});
