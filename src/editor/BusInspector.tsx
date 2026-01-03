/**
 * Bus Inspector Component
 *
 * Shows details for selected BusBlocks.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import { InspectorContainer } from './components/InspectorContainer';
import './BusInspector.css';

interface BusInspectorProps {
  busId?: string;
}

export const BusInspector = observer(({ busId: propBusId }: BusInspectorProps) => {
  const store = useStore();
  const busId = propBusId ?? store.uiStore.uiState.selectedBusId;

  if (busId === null) {
    return (
      <InspectorContainer
        title="Bus"
        color="#666"
        onBack={() => store.uiStore.deselectBus()}
        backLabel="Back"
      >
        <div className="inspector-empty">
          <p>No bus selected</p>
        </div>
      </InspectorContainer>
    );
  }

  const busBlock = store.patchStore.busBlocks.find(b => b.id === busId);

  return (
    <InspectorContainer
      title={busBlock?.label ?? 'Bus'}
      color="#4f46e5"
      onBack={() => store.uiStore.deselectBus()}
      backLabel="Back"
    >
      <div className="inspector-disabled">
        <p>Bus inspector not yet implemented</p>
        {busBlock && <p className="inspector-hint">Bus: {busBlock.type}</p>}
      </div>
    </InspectorContainer>
  );
});
