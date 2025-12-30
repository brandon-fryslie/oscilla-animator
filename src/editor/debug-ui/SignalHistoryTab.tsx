/**
 * Signal History Tab
 *
 * Displays waveform visualizations for all probes with history enabled.
 * Shows real-time signal evolution over time.
 */

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { TraceController } from '../debug/TraceController';
import { SignalGraph } from './SignalGraph';
import './SignalHistoryTab.css';

export const SignalHistoryTab = observer(function SignalHistoryTab() {
  const traceController = TraceController.instance;
  const [selectedProbeId, setSelectedProbeId] = useState<string | null>(null);

  // Get all probes with history buffers
  const probesWithHistory = traceController.getProbesWithHistory();
  const activeProbeIds = traceController.getActiveProbeIds();

  // If trace mode is off, show message
  if (traceController.getMode() === 'off') {
    return (
      <div className="signal-history-tab">
        <div className="signal-history-empty">
          <div className="signal-history-empty-icon">📈</div>
          <div className="signal-history-empty-text">Signal history disabled</div>
          <div className="signal-history-empty-hint">
            Enable trace mode (Full) in the Overview tab to record signal history.
          </div>
        </div>
      </div>
    );
  }

  // If no probes with history, show instructions
  if (probesWithHistory.length === 0) {
    return (
      <div className="signal-history-tab">
        <div className="signal-history-empty">
          <div className="signal-history-empty-icon">📊</div>
          <div className="signal-history-empty-text">No signal history</div>
          <div className="signal-history-empty-hint">
            Click "Show History" on a probe card in the Debug REPL to start recording.
          </div>
        </div>
      </div>
    );
  }

  // Show probe selector and graphs
  return (
    <div className="signal-history-tab">
      <div className="signal-history-header">
        <div className="signal-history-title">Signal History</div>
        <div className="signal-history-count">{probesWithHistory.length} probe{probesWithHistory.length !== 1 ? 's' : ''}</div>
      </div>

      <div className="signal-history-selector">
        {probesWithHistory.map((probeId) => {
          const isActive = activeProbeIds.includes(probeId);
          const isSelected = selectedProbeId === probeId;

          return (
            <button
              key={probeId}
              className={`signal-history-probe-button ${isSelected ? 'selected' : ''} ${!isActive ? 'inactive' : ''}`}
              onClick={() => setSelectedProbeId(isSelected ? null : probeId)}
              title={isActive ? probeId : `${probeId} (inactive)`}
            >
              {probeId}
            </button>
          );
        })}
      </div>

      <div className="signal-history-graphs">
        {probesWithHistory.map((probeId) => {
          // Skip if not selected (when a selection exists)
          if (selectedProbeId !== null && selectedProbeId !== probeId) {
            return null;
          }

          const history = traceController.getHistory(probeId);
          if (!history) return null;

          return (
            <div key={probeId} className="signal-history-graph-container">
              <SignalGraph
                buffer={history}
                width={800}
                height={200}
                label={probeId}
                color="#3b82f6"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
