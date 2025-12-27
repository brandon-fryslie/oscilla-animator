/**
 * ProbeToggle Component
 *
 * Toggle button to enable/disable Probe Mode.
 * When active, cursor changes to crosshair and hovering
 * over buses/blocks shows ProbeCard popups.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import './ProbeToggle.css';

/**
 * ProbeToggle - Enable/disable Probe Mode
 */
export const ProbeToggle = observer(function ProbeToggle() {
  const { debugUIStore } = useStore();
  const isActive = debugUIStore.probeMode;

  return (
    <button
      className={`probe-toggle ${isActive ? 'probe-toggle-active' : ''}`}
      onClick={() => debugUIStore.toggleProbeMode()}
      title={isActive ? 'Disable Probe Mode' : 'Enable Probe Mode (inspect buses/blocks)'}
      type="button"
    >
      <svg
        className="probe-toggle-icon"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        {/* Probe/crosshair icon */}
        <circle cx="8" cy="8" r="5" />
        <line x1="8" y1="1" x2="8" y2="4" />
        <line x1="8" y1="12" x2="8" y2="15" />
        <line x1="1" y1="8" x2="4" y2="8" />
        <line x1="12" y1="8" x2="15" y2="8" />
      </svg>
      <span className="probe-toggle-label">Probe</span>
    </button>
  );
});
