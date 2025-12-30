/**
 * Debug Drawer Component
 *
 * Slide-up panel with tab navigation for detailed diagnostics.
 * Currently supports:
 * - Overview tab: Patch summary and bus heatmap
 * - Buses tab: Live bus values with meters
 * - IR tab: Compiled IR structure visualization
 * - Schedule tab: Execution schedule visualization
 * - Signal History tab: Waveform visualization for probed signals
 * - Runtime State tab: ValueStore and StateBuffer inspector
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import { OverviewTab } from './OverviewTab';
import { BusesTab } from './BusesTab';
import { IRTab } from './IRTab';
import { ScheduleTab } from './ScheduleTab';
import { SignalHistoryTab } from './SignalHistoryTab';
import { RuntimeStateTab } from './RuntimeStateTab';
import './DebugDrawer.css';

/**
 * DebugDrawer - Slide-up diagnostics panel
 */
export const DebugDrawer = observer(function DebugDrawer() {
  const { debugUIStore } = useStore();
  const { isDrawerOpen, activeTab } = debugUIStore;

  if (!isDrawerOpen) {
    return null;
  }

  return (
    <div className="debug-drawer">
      <div className="debug-drawer-header">
        <div className="debug-drawer-tabs">
          <button
            className={`debug-drawer-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => debugUIStore.setActiveTab('overview')}
            type="button"
          >
            Overview
          </button>
          <button
            className={`debug-drawer-tab ${activeTab === 'buses' ? 'active' : ''}`}
            onClick={() => debugUIStore.setActiveTab('buses')}
            type="button"
          >
            Buses
          </button>
          <button
            className={`debug-drawer-tab ${activeTab === 'ir' ? 'active' : ''}`}
            onClick={() => debugUIStore.setActiveTab('ir')}
            type="button"
          >
            IR
          </button>
          <button
            className={`debug-drawer-tab ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => debugUIStore.setActiveTab('schedule')}
            type="button"
          >
            Schedule
          </button>
          <button
            className={`debug-drawer-tab ${activeTab === 'signal-history' ? 'active' : ''}`}
            onClick={() => debugUIStore.setActiveTab('signal-history')}
            type="button"
          >
            Signal History
          </button>
          <button
            className={`debug-drawer-tab ${activeTab === 'runtime-state' ? 'active' : ''}`}
            onClick={() => debugUIStore.setActiveTab('runtime-state')}
            type="button"
          >
            Runtime State
          </button>
        </div>

        <button
          className="debug-drawer-close"
          onClick={() => debugUIStore.closeDrawer()}
          title="Close drawer"
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="debug-drawer-content">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'buses' && <BusesTab />}
        {activeTab === 'ir' && <IRTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'signal-history' && <SignalHistoryTab />}
        {activeTab === 'runtime-state' && <RuntimeStateTab />}
      </div>
    </div>
  );
});
