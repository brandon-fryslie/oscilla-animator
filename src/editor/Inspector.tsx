/**
 * Inspector Component
 *
 * Shows details for selected blocks, buses, or connections.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import { InspectorContainer } from './components/InspectorContainer';
import { ConnectionInspector } from './ConnectionInspector';
import { BusInspector } from './BusInspector';
import './Inspector.css';

export const Inspector = observer(() => {
  const store = useStore();
  const selectedBlockId = store.uiStore.uiState.selectedBlockId;
  const selectedConnection = store.uiStore.uiState.selectedConnection;
  const selectedBusId = store.uiStore.uiState.selectedBusId;

  // Show connection inspector if connection selected
  if (selectedConnection !== null) {
    return <ConnectionInspector />;
  }

  // Show bus inspector if bus selected
  if (selectedBusId !== null) {
    return <BusInspector />;
  }

  // Show block inspector if block selected
  if (selectedBlockId !== null) {
    const block = store.patchStore.blocks.find(b => b.id === selectedBlockId);
    if (block !== undefined) {
      return (
        <InspectorContainer
          title={block.label}
          color="#666"
        >
          <div className="inspector-disabled">
            <p>Block inspector not yet implemented</p>
            <p className="inspector-hint">Block: {block.type}</p>
          </div>
        </InspectorContainer>
      );
    }
  }

  // No selection
  return (
    <InspectorContainer
      title="Inspector"
      color="#666"
    >
      <div className="inspector-empty">
        <p>Select a block, bus, or connection to inspect</p>
      </div>
    </InspectorContainer>
  );
});
