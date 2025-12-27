/**
 * Debug HUD Component
 *
 * Compact status display with 4 indicator lights:
 * - Clock: Time model kind
 * - Health: System health (NaN/Inf counts)
 * - Performance: FPS estimate
 * - Stability: Scrub-safe vs Live-only
 *
 * Each light is clickable and opens the Debug Drawer to the relevant tab.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import './DebugHUD.css';

/**
 * Status light component
 */
interface StatusLightProps {
  label: string;
  status: 'ok' | 'warning' | 'error' | 'info';
  value?: string;
  tooltip: string;
  onClick: () => void;
}

function StatusLight({ label, status, value, tooltip, onClick }: StatusLightProps) {
  const colorClass = {
    ok: 'status-light-ok',
    warning: 'status-light-warning',
    error: 'status-light-error',
    info: 'status-light-info',
  }[status];

  return (
    <button
      className={`status-light ${colorClass}`}
      title={tooltip}
      onClick={onClick}
      type="button"
    >
      <div className="status-light-label">{label}</div>
      {value && <div className="status-light-value">{value}</div>}
    </button>
  );
}

/**
 * Main HUD component
 */
export const DebugHUD = observer(function DebugHUD() {
  const { debugUIStore } = useStore();
  const snapshot = debugUIStore.latestHealthSnapshot;

  // Extract data from snapshot
  const fps = snapshot?.frameBudget.fpsEstimate ?? 0;
  const healthStatus = debugUIStore.healthStatus;
  const stabilityStatus = debugUIStore.stabilityStatus;

  // Get time model kind from DebugUIStore (wired to IR program metadata)
  const timeModelKind = debugUIStore.timeModelKind;

  // Format time model for display
  const timeModelDisplay =
    timeModelKind === 'finite' ? 'Finite' :
    timeModelKind === 'cyclic' ? 'Cyclic' : 'Infinite';

  // Format FPS for display
  const fpsDisplay = fps > 0 ? Math.round(fps).toString() : '--';

  // FPS status color
  const fpsStatus: 'ok' | 'warning' | 'error' =
    fps >= 55 ? 'ok' : fps >= 30 ? 'warning' : 'error';

  // Stability display
  const stabilityDisplay = stabilityStatus === 'stable' ? 'Scrub-safe' : 'Live-only';
  const stabilityDisplayStatus = stabilityStatus === 'stable' ? 'ok' : 'warning';

  return (
    <div className="debug-hud">
      <StatusLight
        label="Clock"
        status="info"
        value={timeModelDisplay}
        tooltip={`Time model: ${timeModelKind}`}
        onClick={() => debugUIStore.openDrawer('overview')}
      />

      <StatusLight
        label="Health"
        status={healthStatus}
        tooltip={
          healthStatus === 'ok'
            ? 'System healthy'
            : healthStatus === 'warning'
            ? 'Some NaN/Inf values detected'
            : 'Many NaN/Inf values detected'
        }
        onClick={() => debugUIStore.openDrawer('overview')}
      />

      <StatusLight
        label="Performance"
        status={fpsStatus}
        value={`${fpsDisplay} fps`}
        tooltip={`Current FPS: ${fpsDisplay}`}
        onClick={() => debugUIStore.openDrawer('overview')}
      />

      <StatusLight
        label="Stability"
        status={stabilityDisplayStatus}
        value={stabilityDisplay}
        tooltip={
          stabilityStatus === 'stable'
            ? 'FPS stable - scrubbing supported'
            : 'FPS varies - live playback only'
        }
        onClick={() => debugUIStore.openDrawer('overview')}
      />
    </div>
  );
});
