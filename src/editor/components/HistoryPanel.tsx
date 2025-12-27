/**
 * HistoryPanel Component
 *
 * Displays revision history for undo/redo navigation.
 * Shows revisions in chronological order with current revision highlighted.
 * Provides undo/redo buttons with enabled/disabled state.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import './HistoryPanel.css';

interface HistoryPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Format timestamp as time string (HH:MM:SS)
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const HistoryPanel = observer(({ collapsed, onToggleCollapse }: HistoryPanelProps) => {
  const { historyStore } = useStore();

  // Get all revisions sorted by ID (newest first)
  const revisions = Array.from(historyStore.revisions.values()).sort(
    (a, b) => b.id - a.id
  );

  const canUndo = historyStore.canUndo;
  const canRedo = historyStore.canRedo;
  const currentRevisionId = historyStore.currentRevisionId;

  return (
    <div className={`history-panel ${collapsed ? 'collapsed' : ''}`}>
      <div
        className="panel-header"
        onClick={onToggleCollapse}
        style={{ cursor: 'pointer' }}
      >
        <span className="panel-title">History</span>
        <div className="panel-header-actions">
          <button
            className="panel-collapse-icon"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            title={collapsed ? 'Show history' : 'Hide history'}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="history-content">
          {/* Undo/Redo Buttons */}
          <div className="history-actions">
            <button
              className="history-btn"
              onClick={() => historyStore.undo()}
              disabled={!canUndo}
              title="Undo (Cmd/Ctrl+Z)"
            >
              ← Undo
            </button>
            <button
              className="history-btn"
              onClick={() => historyStore.redo()}
              disabled={!canRedo}
              title="Redo (Cmd/Ctrl+Shift+Z)"
            >
              Redo →
            </button>
          </div>

          {/* Revision List */}
          <div className="history-list">
            {revisions.length === 0 && (
              <div className="history-empty">No revisions yet</div>
            )}

            {currentRevisionId === 0 && (
              <div className="history-item current">
                <div className="history-item-header">
                  <span className="history-item-label">Initial State</span>
                  <span className="history-item-indicator">●</span>
                </div>
              </div>
            )}

            {revisions.map((rev) => {
              const isCurrent = rev.id === currentRevisionId;
              return (
                <div
                  key={rev.id}
                  className={`history-item ${isCurrent ? 'current' : ''}`}
                >
                  <div className="history-item-header">
                    <span className="history-item-label">{rev.label}</span>
                    {isCurrent && <span className="history-item-indicator">●</span>}
                  </div>
                  <div className="history-item-meta">
                    <span className="history-item-time">{formatTime(rev.timestamp)}</span>
                    <span className="history-item-id">#{rev.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
