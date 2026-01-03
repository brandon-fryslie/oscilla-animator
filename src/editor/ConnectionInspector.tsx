/**
 * Connection Inspector Component
 *
 * Shows details for selected connections/edges.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import { InspectorContainer } from './components/InspectorContainer';
import './ConnectionInspector.css';

export const ConnectionInspector = observer(() => {
  const store = useStore();

  return (
    <InspectorContainer
      title="Connection"
      color="#666"
      onBack={() => store.uiStore.deselectConnection()}
      backLabel="Back"
    >
      <div className="conn-empty">
        <p>Connection inspector not yet implemented</p>
      </div>
    </InspectorContainer>
  );
});
