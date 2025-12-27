/**
 * Overview Tab Component
 *
 * Displays:
 * - Patch mode (time model kind)
 * - Bus heatmap (activity visualization)
 * - Top 3 issues (simple heuristics)
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';

export const OverviewTab = observer(function OverviewTab() {
  const { debugUIStore, busStore } = useStore();
  const snapshot = debugUIStore.latestHealthSnapshot;

  // Get time model from DebugUIStore (wired to IR program metadata)
  const timeModelKind = debugUIStore.timeModelKind;

  // Format time model for display
  const timeModelDisplay =
    timeModelKind === 'finite' ? 'Finite Duration' :
    timeModelKind === 'cyclic' ? 'Cyclic Loop' : 'Infinite Loop';

  // Detect issues using simple heuristics
  const issues: string[] = [];

  // Check for buses with no publishers
  for (const bus of busStore.buses) {
    const publisherCount = busStore.publishers.filter(p => p.busId === bus.id).length;
    if (publisherCount === 0) {
      issues.push(`Bus "${bus.name}" has no publishers`);
    }
  }

  // Check for NaN values
  if (snapshot && snapshot.evalStats.nanCount > 0) {
    issues.push(`${snapshot.evalStats.nanCount} NaN value(s) detected`);
  }

  // Check for low FPS
  if (snapshot && snapshot.frameBudget.fpsEstimate < 30 && snapshot.frameBudget.fpsEstimate > 0) {
    issues.push(`FPS below 30 (${Math.round(snapshot.frameBudget.fpsEstimate)} fps)`);
  }

  // Take top 3 issues
  const topIssues = issues.slice(0, 3);

  return (
    <div className="overview-tab">
      <section className="overview-section">
        <h3 className="overview-section-title">Patch Mode</h3>
        <div className="overview-patch-mode">{timeModelDisplay}</div>
      </section>

      <section className="overview-section">
        <h3 className="overview-section-title">Bus Heatmap</h3>
        <div className="bus-heatmap">
          {busStore.buses.map(bus => (
            <div key={bus.id} className="bus-heatmap-cell" title={bus.name}>
              <div className="bus-heatmap-cell-name">{bus.name}</div>
              <div className="bus-heatmap-cell-indicator" />
            </div>
          ))}
          {busStore.buses.length === 0 && (
            <div className="bus-heatmap-empty">No buses in patch</div>
          )}
        </div>
      </section>

      <section className="overview-section">
        <h3 className="overview-section-title">Top Issues</h3>
        {topIssues.length > 0 ? (
          <ul className="overview-issues">
            {topIssues.map((issue, i) => (
              <li key={i} className="overview-issue">
                {issue}
              </li>
            ))}
          </ul>
        ) : (
          <div className="overview-no-issues">No issues detected</div>
        )}
      </section>
    </div>
  );
});
