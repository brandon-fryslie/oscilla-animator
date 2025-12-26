/**
 * BusBoard Component
 *
 * The "mixer console" for all buses in the patch.
 * Displays buses as vertical channel strips (DAW-style).
 */

import { observer } from 'mobx-react-lite';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from './stores';
import type { Bus } from './types';
import { BusChannel } from './BusChannel';
import { BusCreationDialog } from './BusCreationDialog';
import './BusBoard.css';

/**
 * Group buses by category.
 * Phase 3: All buses are Signal types → "Global Signals" group
 * Future: Field buses will be in "Per-Element Fields" group
 */
interface BusGroup {
  category: string;
  buses: Bus[];
}

/**
 * Group buses by origin: built-in first, then user-created.
 * No world-based filtering - all buses are shown.
 */
function groupBuses(buses: Bus[]): BusGroup[] {
  const builtInBuses = buses.filter(b => b.origin === 'built-in');
  const userBuses = buses.filter(b => b.origin !== 'built-in');

  const groups: BusGroup[] = [];

  if (builtInBuses.length > 0) {
    groups.push({
      category: 'Default Buses',
      buses: builtInBuses,
    });
  }

  if (userBuses.length > 0) {
    groups.push({
      category: 'Custom Buses',
      buses: userBuses,
    });
  }

  return groups;
}

/**
 * Filter buses by name (case-insensitive substring match).
 */
function filterBuses(buses: Bus[], filterText: string): Bus[] {
  if (filterText === undefined || filterText === null || filterText.length === 0) return buses;
  const lower = filterText.toLowerCase();
  return buses.filter(bus => bus.name.toLowerCase().includes(lower));
}

/**
 * Load group collapse state from localStorage.
 */
function loadGroupCollapseState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem('busboard-group-collapse');
    if (stored !== null && stored !== undefined && stored !== '') {
      return JSON.parse(stored) as Record<string, boolean>;
    }
  } catch (err) {
    console.warn('Failed to load Bus Board group collapse state:', err);
  }
  return {};
}

/**
 * Save group collapse state to localStorage.
 */
function saveGroupCollapseState(state: Record<string, boolean>): void {
  try {
    localStorage.setItem('busboard-group-collapse', JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to save Bus Board group collapse state:', err);
  }
}

/**
 * Bus Board - vertical mixer panel for all buses.
 */
export const BusBoard = observer((): React.ReactElement => {
  const store = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [isCreationDialogOpen, setIsCreationDialogOpen] = useState(false);

  // Filtering state
  const [filterText, setFilterText] = useState('');

  // Group collapse state (persisted in localStorage)
  const [groupCollapseState, setGroupCollapseState] = useState<Record<string, boolean>>(() =>
    loadGroupCollapseState()
  );

  // Persist group collapse state on change
  useEffect(() => {
    saveGroupCollapseState(groupCollapseState);
  }, [groupCollapseState]);

  // Filter and group buses
  const filteredBuses = useMemo(() =>
    filterBuses(store.busStore.buses, filterText),
    [store.busStore.buses, filterText]
  );

  const busGroups = useMemo(() =>
    groupBuses(filteredBuses),
    [filteredBuses]
  );

  const handleNewBus = () => {
    setIsCreationDialogOpen(true);
  };

  const handleSelectBus = (busId: string) => {
    setSelectedBusId(busId);
    // TODO WI-5: Set store.selectedBusId when bus selection is added to store
  };

  const handleBusCreated = (busId: string) => {
    // Select the newly created bus
    setSelectedBusId(busId);
    // TODO WI-5: Set store.selectedBusId when bus selection is added to store
  };

  const toggleGroupCollapse = (category: string) => {
    setGroupCollapseState(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const clearFilter = () => {
    setFilterText('');
  };

  const isGroupCollapsed = (category: string): boolean => {
    return groupCollapseState[category] ?? false;
  };

  return (
    <div className={`bus-board ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="bus-board-header">
        <span className="bus-board-title">Bus Board</span>
        <div className="bus-board-actions">
          <button
            className="bus-board-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand Bus Board' : 'Collapse Bus Board'}
          >
            {collapsed ? '◀' : '▶'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* New Bus Button */}
          <div className="bus-board-toolbar">
            <button
              className="bus-board-new-btn"
              onClick={handleNewBus}
              title="Create new bus"
            >
              + New Bus
            </button>
          </div>

          {/* Filter Input */}
          <div className="bus-board-filter">
            <input
              type="text"
              className="bus-board-filter-input"
              placeholder="Filter buses..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              title="Filter buses by name"
            />
            {filterText !== undefined && filterText !== null && filterText.length > 0 && (
              <button
                className="bus-board-filter-clear"
                onClick={clearFilter}
                title="Clear filter"
              >
                ×
              </button>
            )}
          </div>

          {/* Bus Channels (Grouped) */}
          <div className="bus-board-channels">
            {store.busStore.buses.length === 0 ? (
              <div className="bus-board-empty">
                <p>No buses yet</p>
                <p className="bus-board-empty-hint">
                  Click "New Bus" to create a signal bus
                </p>
              </div>
            ) : filteredBuses.length === 0 ? (
              <div className="bus-board-empty">
                <p>No buses match</p>
                <p className="bus-board-empty-hint">
                  Try a different filter
                </p>
              </div>
            ) : (
              busGroups.map((group) => {
                const collapsed = isGroupCollapsed(group.category);
                return (
                  <div key={group.category} className="bus-board-group">
                    {/* Group Header */}
                    <div
                      className="bus-board-group-header"
                      onClick={() => toggleGroupCollapse(group.category)}
                      title={collapsed ? 'Expand group' : 'Collapse group'}
                    >
                      <span className="bus-board-group-icon">
                        {collapsed ? '▶' : '▼'}
                      </span>
                      <span className="bus-board-group-title">
                        {group.category}
                      </span>
                      <span className="bus-board-group-count">
                        ({group.buses.length})
                      </span>
                    </div>

                    {/* Group Buses */}
                    {!collapsed && (
                      <div className="bus-board-group-buses">
                        {group.buses.map((bus) => (
                          <BusChannel
                            key={bus.id}
                            bus={bus}
                            isSelected={selectedBusId === bus.id}
                            onSelect={() => handleSelectBus(bus.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Bus Creation Dialog */}
      <BusCreationDialog
        isOpen={isCreationDialogOpen}
        onClose={() => setIsCreationDialogOpen(false)}
        onCreated={handleBusCreated}
      />
    </div>
  );
});
