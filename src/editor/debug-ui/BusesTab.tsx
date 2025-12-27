/**
 * Buses Tab Component
 *
 * Lists all buses with live values and publisher/listener counts.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import { BusValueMeter } from './BusValueMeter';

export const BusesTab = observer(function BusesTab() {
  const { busStore, debugUIStore } = useStore();
  const snapshot = debugUIStore.latestHealthSnapshot;

  if (busStore.buses.length === 0) {
    return (
      <div className="buses-tab">
        <div className="buses-empty">No buses in patch</div>
      </div>
    );
  }

  return (
    <div className="buses-tab">
      {busStore.buses.map(bus => {
        const publisherCount = busStore.publishers.filter(p => p.busId === bus.id).length;
        const listenerCount = busStore.listeners.filter(l => l.busId === bus.id).length;
        const busValue = snapshot?.busValues?.[bus.id];

        return (
          <div key={bus.id} className="bus-row">
            <div className="bus-row-name">{bus.name}</div>
            <div className="bus-row-type">{bus.type?.domain || 'unknown'}</div>
            <div className="bus-row-meter">
              {busValue ? (
                <BusValueMeter value={busValue} busType={bus.type?.domain || 'number'} />
              ) : (
                <span style={{ color: '#666', fontStyle: 'italic' }}>No value</span>
              )}
            </div>
            <div className="bus-row-counts">
              <span>{publisherCount} pub</span>
              <span>{listenerCount} listen</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
