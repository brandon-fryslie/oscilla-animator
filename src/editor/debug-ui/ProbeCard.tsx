/**
 * ProbeCard Component
 *
 * Floating popup that displays information about a hovered element
 * when in Probe Mode. Shows:
 * - For buses: name, type, current value, publisher/listener counts, sparkline
 * - For blocks: type, label, probe values from TraceController
 */

import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import { BusValueMeter } from './BusValueMeter';
import { TraceController } from '../debug/TraceController';
import { valueRecordToSummary } from '../debug/valueRecordToSummary';
import { formatValueSummary } from '../debug/types';
import './ProbeCard.css';

/**
 * Probe target types (mirrored from DebugUIStore for import simplicity)
 */
type ProbeTarget =
  | { type: 'bus'; busId: string }
  | { type: 'block'; blockId: string }
  | null;

interface ProbeCardProps {
  target: ProbeTarget;
  position: { x: number; y: number };
}

/**
 * ProbeCard - Floating inspection card for Probe Mode
 */
export const ProbeCard = observer(function ProbeCard({ target, position }: ProbeCardProps) {
  const { busStore, patchStore, debugUIStore } = useStore();

  if (target === null) {
    return null;
  }

  // Position card near cursor (offset +10px x, +10px y)
  const style: React.CSSProperties = {
    left: position.x + 10,
    top: position.y + 10,
  };

  if (target.type === 'bus') {
    const bus = busStore.buses.find(b => b.id === target.busId);
    if (bus === undefined) {
      return null;
    }

    // Count publishers and listeners
    const publisherCount = busStore.publishers.filter(p => p.busId === bus.id).length;
    const listenerCount = busStore.listeners.filter(l => l.busId === bus.id).length;

    // Get bus value from health snapshot if available
    const snapshot = debugUIStore.latestHealthSnapshot;
    const busValue = snapshot?.busValues?.[bus.id];

    return (
      <div className="probe-card" style={style}>
        <div className="probe-card-header">
          <span className="probe-card-type">Bus</span>
          <span className="probe-card-name">{bus.name}</span>
        </div>

        <div className="probe-card-body">
          <div className="probe-card-row">
            <span className="probe-card-label">Type:</span>
            <span className="probe-card-value">{bus.type?.domain ?? 'unknown'}</span>
          </div>

          <div className="probe-card-row">
            <span className="probe-card-label">Publishers:</span>
            <span className="probe-card-value">{publisherCount}</span>
          </div>

          <div className="probe-card-row">
            <span className="probe-card-label">Listeners:</span>
            <span className="probe-card-value">{listenerCount}</span>
          </div>

          {busValue !== undefined && busValue !== null && (
            <div className="probe-card-meter">
              <BusValueMeter value={busValue} busType={bus.type?.domain ?? 'float'} />
            </div>
          )}

          {(busValue === undefined || busValue === null) && (
            <div className="probe-card-no-value">
              No live value available
            </div>
          )}
        </div>
      </div>
    );
  }

  if (target.type === 'block') {
    const block = patchStore.blocks.find(b => b.id === target.blockId);
    if (block === undefined) {
      return null;
    }

    // Get TraceController to read probe values
    const traceController = TraceController.instance;

    // Common port IDs to check for probes (based on DebugDisplay ports)
    // In reality, any block input port could have a probe if registered
    const commonPorts = ['signal', 'phase', 'field', 'domain', 'value', 'input'];

    // Collect probe values for this block
    const probeValues: Array<{ portId: string; value: string }> = [];

    for (const portId of commonPorts) {
      const probeId = `${block.id}:${portId}`;
      const valueRecord = traceController.getProbeValue(probeId);

      if (valueRecord !== undefined) {
        const summary = valueRecordToSummary(valueRecord);
        if (summary !== null) {
          const formattedValue = formatValueSummary(summary);
          probeValues.push({ portId, value: formattedValue });
        }
      }
    }

    return (
      <div className="probe-card" style={style}>
        <div className="probe-card-header">
          <span className="probe-card-type">Block</span>
          <span className="probe-card-name">{(block.label !== undefined && block.label.length > 0) ? block.label : block.type}</span>
        </div>

        <div className="probe-card-body">
          <div className="probe-card-row">
            <span className="probe-card-label">Type:</span>
            <span className="probe-card-value">{block.type}</span>
          </div>

          {probeValues.length === 0 && (
            <div className="probe-card-placeholder">
              No probes registered for this block
            </div>
          )}

          {probeValues.length > 0 && (
            <>
              {probeValues.map(({ portId, value }) => (
                <div key={portId} className="probe-card-row">
                  <span className="probe-card-label">{portId}:</span>
                  <span className="probe-card-value">{value}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
});
