/**
 * Debug Drawer Component
 *
 * Slide-up panel with tab navigation for detailed diagnostics.
 * Currently supports:
 * - Overview tab: Patch summary and bus heatmap
 * - Buses tab: Live bus values with meters
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import { OverviewTab } from './OverviewTab';
import { BusesTab } from './BusesTab';
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
      </div>
    </div>
  );
});
