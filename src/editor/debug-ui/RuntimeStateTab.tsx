/**
 * RuntimeStateTab Component
 *
 * Tab for inspecting runtime state snapshots.
 * Provides:
 * - Capture button to take snapshot
 * - Search/filter input
 * - RuntimeStateTree for viewing snapshot
 *
 * References:
 * - .agent_planning/debug-export/PLAN-2025-12-30-031000.md Sprint 8
 * - .agent_planning/debug-export/DOD-2025-12-30-031000.md Deliverable 8.3
 */

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { captureRuntimeSnapshot, type RuntimeSnapshot } from '../debug/RuntimeSnapshot';
import { RuntimeStateTree } from './RuntimeStateTree';
import './RuntimeStateTab.css';

/**
 * Get runtime state from global executor (if available)
 *
 * NOTE: This is a temporary implementation. Ideally runtime state should
 * be accessible through a proper service/store rather than window globals.
 */
function getRuntimeState() {
  // Try to access runtime through window global (similar to __compilerService pattern)
  const global = window as unknown as {
    __executor?: {
      runtime?: unknown;
    };
  };

  return global.__executor?.runtime ?? null;
}

/**
 * RuntimeStateTab - Inspector tab in DebugDrawer
 */
export const RuntimeStateTab = observer(function RuntimeStateTab() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCapture = () => {
    setError(null);

    try {
      // Get current runtime state
      const runtime = getRuntimeState();
      if (!runtime) {
        setError('No runtime available. Ensure a patch is compiled and executing.');
        return;
      }

      const newSnapshot = captureRuntimeSnapshot(runtime as  import('../runtime/executor/RuntimeState').RuntimeState);
      setSnapshot(newSnapshot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to capture snapshot: ${message}`);
      console.error('RuntimeStateTab: Failed to capture snapshot', err);
    }
  };

  return (
    <div className="runtime-state-tab">
      <div className="runtime-state-header">
        <button
          className="capture-button"
          onClick={handleCapture}
          type="button"
        >
          Capture Snapshot
        </button>

        <input
          className="search-input"
          type="text"
          placeholder="Search slots, types, or nodes..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
      </div>

      {error && (
        <div className="runtime-state-error">
          {error}
        </div>
      )}

      {snapshot && (
        <div className="runtime-state-metadata">
          <span>Frame: {snapshot.metadata.frameId}</span>
          <span>Slots: {snapshot.metadata.slotCount}</span>
          <span>State Cells: {snapshot.metadata.stateCellCount}</span>
          <span>Captured: {new Date(snapshot.metadata.timestamp).toLocaleTimeString()}</span>
        </div>
      )}

      <div className="runtime-state-content">
        <RuntimeStateTree snapshot={snapshot} searchFilter={searchFilter} />
      </div>
    </div>
  );
});
