/**
 * Connection Inspector Component
 *
 * Displays connection details (wire, publisher, listener) when a connection is selected.
 * Provides disconnect/swap actions and embedded lens editing for bus connections.
 */

import { observer } from 'mobx-react-lite';
import { useCallback, useMemo } from 'react';
import { useStore } from './stores';
import { InspectorContainer } from './components/InspectorContainer';
import { describeSlotType } from './portUtils';
import type { Connection, Publisher, Listener, Block, Slot, SlotType } from './types';
import './ConnectionInspector.css';

/**
 * Connection data resolved from ID, including full endpoint information.
 */
type ResolvedConnection =
  | { kind: 'wire'; connection: Connection; sourceBlock: Block; sourceSlot: Slot; targetBlock: Block; targetSlot: Slot }
  | { kind: 'publisher'; publisher: Publisher; sourceBlock: Block; sourceSlot: Slot; busName: string }
  | { kind: 'listener'; listener: Listener; busName: string; targetBlock: Block; targetSlot: Slot };

/**
 * Type badge component - shows S/F/C world and domain.
 */
function TypeBadges({ type }: { type: SlotType }) {
  const desc = describeSlotType(type);
  const worldGlyph: Record<string, string | null> = {
    signal: 'S',
    field: 'F',
    scalar: 'C',
    event: 'E',
    scene: 'SC',
    program: 'P',
    render: 'R',
    filter: 'FX',
    stroke: 'ST',
    unknown: null,
  };
  const worldBadge = worldGlyph[desc.world] ?? null;

  return (
    <span className="conn-type-badges">
      {worldBadge && <span className={`conn-type-badge world ${desc.world}`}>{worldBadge}</span>}
      {desc.domain && <span className="conn-type-badge domain">{desc.domain}</span>}
    </span>
  );
}

/**
 * Endpoint display - shows block + port with type info.
 */
function EndpointDisplay({
  label,
  blockName,
  portName,
  portType,
  onNavigate,
}: {
  label: string;
  blockName: string;
  portName: string;
  portType: SlotType;
  onNavigate?: () => void;
}) {
  return (
    <div className="conn-endpoint">
      <span className="conn-endpoint-label">{label}</span>
      <div className="conn-endpoint-content">
        <button
          className="conn-endpoint-block"
          onClick={onNavigate}
          disabled={!onNavigate}
          title={onNavigate ? `Navigate to ${blockName}` : undefined}
        >
          {blockName}
        </button>
        <span className="conn-endpoint-port">
          {portName}
          <TypeBadges type={portType} />
        </span>
        <code className="conn-endpoint-type">{portType}</code>
      </div>
    </div>
  );
}

/**
 * Bus endpoint display - shows bus name for publisher/listener connections.
 */
function BusEndpointDisplay({
  label,
  busName,
  onNavigate,
}: {
  label: string;
  busName: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="conn-endpoint conn-endpoint-bus">
      <span className="conn-endpoint-label">{label}</span>
      <div className="conn-endpoint-content">
        <button
          className="conn-endpoint-bus-name"
          onClick={onNavigate}
          disabled={!onNavigate}
          title={onNavigate ? `Navigate to bus "${busName}"` : undefined}
        >
          {busName}
        </button>
      </div>
    </div>
  );
}

/**
 * Wire Connection Inspector - displays wire details with lens support.
 */
const WireConnectionView = observer(({
  connection,
  sourceBlock,
  sourceSlot,
  targetBlock,
  targetSlot,
  onDisconnect,
  onBack,
}: {
  connection: Connection;
  sourceBlock: Block;
  sourceSlot: Slot;
  targetBlock: Block;
  targetSlot: Slot;
  onDisconnect: () => void;
  onBack: () => void;
}) => {
  const store = useStore();

  const navigateToSource = useCallback(() => {
    store.uiStore.selectBlock(sourceBlock.id);
  }, [store, sourceBlock.id]);

  const navigateToTarget = useCallback(() => {
    store.uiStore.selectBlock(targetBlock.id);
  }, [store, targetBlock.id]);

  const handleToggleEnabled = useCallback(() => {
    store.patchStore.setConnectionEnabled(connection.id, connection.enabled === false);
  }, [store, connection.id, connection.enabled]);

  const handleRemoveLens = useCallback((index: number) => {
    store.patchStore.removeLensFromConnection(connection.id, index);
  }, [store, connection.id]);

  const handleToggleLensEnabled = useCallback((index: number) => {
    const lens = connection.lensStack?.[index];
    if (lens) {
      store.patchStore.updateConnectionLens(connection.id, index, { enabled: !lens.enabled });
    }
  }, [store, connection.id, connection.lensStack]);

  const hasLenses = connection.lensStack && connection.lensStack.length > 0;
  const isEnabled = connection.enabled !== false;

  return (
    <InspectorContainer
      title="Wire Connection"
      typeCode={sourceSlot.type}
      category="Wire"
      color="#10b981"
      onBack={onBack}
      backLabel="Back"
    >
      <div className="conn-section">
        <EndpointDisplay
          label="From"
          blockName={sourceBlock.label}
          portName={sourceSlot.label}
          portType={sourceSlot.type}
          onNavigate={navigateToSource}
        />
        <div className="conn-arrow">→</div>
        <EndpointDisplay
          label="To"
          blockName={targetBlock.label}
          portName={targetSlot.label}
          portType={targetSlot.type}
          onNavigate={navigateToTarget}
        />
      </div>

      <div className="conn-section">
        <label className="conn-toggle-row">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggleEnabled}
          />
          <span>Enabled</span>
        </label>
      </div>

      {/* Lens section */}
      <div className="conn-section">
        <h4 className="conn-section-title">Lenses</h4>
        {hasLenses ? (
          <div className="conn-lens-list">
            {connection.lensStack!.map((lens, i) => (
              <div key={i} className={`conn-lens-item ${lens.enabled === false ? 'disabled' : ''}`}>
                <label className="conn-lens-toggle">
                  <input
                    type="checkbox"
                    checked={lens.enabled !== false}
                    onChange={() => handleToggleLensEnabled(i)}
                  />
                </label>
                <span className="conn-lens-name">{lens.lensId}</span>
                <button
                  className="conn-lens-remove"
                  onClick={() => handleRemoveLens(i)}
                  title="Remove lens"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="conn-hint">No lenses applied</p>
        )}
        {/* TODO: Add lens picker button for adding new lenses */}
      </div>

      <div className="conn-actions">
        <button className="conn-action-btn conn-action-danger" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </InspectorContainer>
  );
});

/**
 * Publisher Connection Inspector - displays publisher details with lens editing.
 */
const PublisherConnectionView = observer(({
  publisher,
  sourceBlock,
  sourceSlot,
  busName,
  busId,
  onDisconnect,
  onBack,
}: {
  publisher: Publisher;
  sourceBlock: Block;
  sourceSlot: Slot;
  busName: string;
  busId: string;
  onDisconnect: () => void;
  onBack: () => void;
}) => {
  const store = useStore();

  const navigateToSource = useCallback(() => {
    store.uiStore.selectBlock(sourceBlock.id);
  }, [store, sourceBlock.id]);

  const navigateToBus = useCallback(() => {
    store.uiStore.selectBus(busId);
  }, [store, busId]);

  const handleToggleEnabled = useCallback(() => {
    store.busStore.updatePublisher(publisher.id, { enabled: !publisher.enabled });
  }, [store, publisher.id, publisher.enabled]);

  const handleRemoveLens = useCallback((index: number) => {
    const currentStack = publisher.lensStack ?? [];
    const newStack = currentStack.filter((_, i) => i !== index);
    store.busStore.updatePublisher(publisher.id, {
      lensStack: newStack.length > 0 ? newStack : undefined,
    });
  }, [store, publisher.id, publisher.lensStack]);

  const handleToggleLensEnabled = useCallback((index: number) => {
    const currentStack = publisher.lensStack ?? [];
    const lens = currentStack[index];
    if (lens) {
      const newStack = currentStack.map((l, i) =>
        i === index ? { ...l, enabled: !l.enabled } : l
      );
      store.busStore.updatePublisher(publisher.id, { lensStack: newStack });
    }
  }, [store, publisher.id, publisher.lensStack]);

  const hasLenses = publisher.lensStack && publisher.lensStack.length > 0;

  return (
    <InspectorContainer
      title="Publisher"
      typeCode={sourceSlot.type}
      category="Bus Publisher"
      color="#4f46e5"
      onBack={onBack}
      backLabel="Back"
    >
      <div className="conn-section">
        <EndpointDisplay
          label="From"
          blockName={sourceBlock.label}
          portName={sourceSlot.label}
          portType={sourceSlot.type}
          onNavigate={navigateToSource}
        />
        <div className="conn-arrow">→</div>
        <BusEndpointDisplay
          label="To Bus"
          busName={busName}
          onNavigate={navigateToBus}
        />
      </div>

      <div className="conn-section">
        <label className="conn-toggle-row">
          <input
            type="checkbox"
            checked={publisher.enabled}
            onChange={handleToggleEnabled}
          />
          <span>Enabled</span>
        </label>
      </div>

      {/* Lens section with editable list */}
      <div className="conn-section">
        <h4 className="conn-section-title">Lenses</h4>
        {hasLenses ? (
          <div className="conn-lens-list">
            {publisher.lensStack!.map((lens, i) => (
              <div key={i} className={`conn-lens-item ${lens.enabled === false ? 'disabled' : ''}`}>
                <label className="conn-lens-toggle">
                  <input
                    type="checkbox"
                    checked={lens.enabled !== false}
                    onChange={() => handleToggleLensEnabled(i)}
                  />
                </label>
                <span className="conn-lens-name">{lens.lensId}</span>
                <button
                  className="conn-lens-remove"
                  onClick={() => handleRemoveLens(i)}
                  title="Remove lens"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="conn-hint">No lenses applied</p>
        )}
      </div>

      <div className="conn-actions">
        <button className="conn-action-btn conn-action-danger" onClick={onDisconnect}>
          Remove Publisher
        </button>
      </div>
    </InspectorContainer>
  );
});

/**
 * Listener Connection Inspector - displays listener details with lens editing.
 */
const ListenerConnectionView = observer(({
  listener,
  busName,
  busId,
  targetBlock,
  targetSlot,
  onDisconnect,
  onBack,
}: {
  listener: Listener;
  busName: string;
  busId: string;
  targetBlock: Block;
  targetSlot: Slot;
  onDisconnect: () => void;
  onBack: () => void;
}) => {
  const store = useStore();

  const navigateToBus = useCallback(() => {
    store.uiStore.selectBus(busId);
  }, [store, busId]);

  const navigateToTarget = useCallback(() => {
    store.uiStore.selectBlock(targetBlock.id);
  }, [store, targetBlock.id]);

  const handleToggleEnabled = useCallback(() => {
    store.busStore.updateListener(listener.id, { enabled: !listener.enabled });
  }, [store, listener.id, listener.enabled]);

  const handleRemoveLens = useCallback((index: number) => {
    const currentStack = listener.lensStack ?? [];
    const newStack = currentStack.filter((_, i) => i !== index);
    store.busStore.updateListener(listener.id, {
      lensStack: newStack.length > 0 ? newStack : undefined,
    });
  }, [store, listener.id, listener.lensStack]);

  const handleToggleLensEnabled = useCallback((index: number) => {
    const currentStack = listener.lensStack ?? [];
    const lens = currentStack[index];
    if (lens) {
      const newStack = currentStack.map((l, i) =>
        i === index ? { ...l, enabled: !l.enabled } : l
      );
      store.busStore.updateListener(listener.id, { lensStack: newStack });
    }
  }, [store, listener.id, listener.lensStack]);

  const hasLenses = listener.lensStack && listener.lensStack.length > 0;

  return (
    <InspectorContainer
      title="Listener"
      typeCode={targetSlot.type}
      category="Bus Listener"
      color="#8b5cf6"
      onBack={onBack}
      backLabel="Back"
    >
      <div className="conn-section">
        <BusEndpointDisplay
          label="From Bus"
          busName={busName}
          onNavigate={navigateToBus}
        />
        <div className="conn-arrow">→</div>
        <EndpointDisplay
          label="To"
          blockName={targetBlock.label}
          portName={targetSlot.label}
          portType={targetSlot.type}
          onNavigate={navigateToTarget}
        />
      </div>

      <div className="conn-section">
        <label className="conn-toggle-row">
          <input
            type="checkbox"
            checked={listener.enabled}
            onChange={handleToggleEnabled}
          />
          <span>Enabled</span>
        </label>
      </div>

      {/* Lens section with editable list */}
      <div className="conn-section">
        <h4 className="conn-section-title">Lenses</h4>
        {hasLenses ? (
          <div className="conn-lens-list">
            {listener.lensStack!.map((lens, i) => (
              <div key={i} className={`conn-lens-item ${lens.enabled === false ? 'disabled' : ''}`}>
                <label className="conn-lens-toggle">
                  <input
                    type="checkbox"
                    checked={lens.enabled !== false}
                    onChange={() => handleToggleLensEnabled(i)}
                  />
                </label>
                <span className="conn-lens-name">{lens.lensId}</span>
                <button
                  className="conn-lens-remove"
                  onClick={() => handleRemoveLens(i)}
                  title="Remove lens"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="conn-hint">No lenses applied</p>
        )}
      </div>

      <div className="conn-actions">
        <button className="conn-action-btn conn-action-danger" onClick={onDisconnect}>
          Remove Listener
        </button>
      </div>
    </InspectorContainer>
  );
});

/**
 * Main Connection Inspector - resolves connection and renders appropriate view.
 */
export const ConnectionInspector = observer(() => {
  const store = useStore();
  const selectedConnection = store.uiStore.uiState.selectedConnection;

  // Resolve connection data
  const resolved = useMemo((): ResolvedConnection | null => {
    if (!selectedConnection) return null;

    const { type, id } = selectedConnection;

    if (type === 'wire') {
      const connection = store.patchStore.connections.find(c => c.id === id);
      if (!connection) return null;

      const sourceBlock = store.patchStore.blocks.find(b => b.id === connection.from.blockId);
      const targetBlock = store.patchStore.blocks.find(b => b.id === connection.to.blockId);
      if (!sourceBlock || !targetBlock) return null;

      const sourceSlot = sourceBlock.outputs.find(s => s.id === connection.from.slotId);
      const targetSlot = targetBlock.inputs.find(s => s.id === connection.to.slotId);
      if (!sourceSlot || !targetSlot) return null;

      return { kind: 'wire', connection, sourceBlock, sourceSlot, targetBlock, targetSlot };
    }

    if (type === 'publisher') {
      const publisher = store.busStore.publishers.find(p => p.id === id);
      if (!publisher) return null;

      const sourceBlock = store.patchStore.blocks.find(b => b.id === publisher.from.blockId);
      if (!sourceBlock) return null;

      const sourceSlot = sourceBlock.outputs.find(s => s.id === publisher.from.slotId);
      if (!sourceSlot) return null;

      const bus = store.busStore.buses.find(b => b.id === publisher.busId);
      const busName = bus?.name ?? publisher.busId;

      return { kind: 'publisher', publisher, sourceBlock, sourceSlot, busName };
    }

    if (type === 'listener') {
      const listener = store.busStore.listeners.find(l => l.id === id);
      if (!listener) return null;

      const targetBlock = store.patchStore.blocks.find(b => b.id === listener.to.blockId);
      if (!targetBlock) return null;

      const targetSlot = targetBlock.inputs.find(s => s.id === listener.to.slotId);
      if (!targetSlot) return null;

      const bus = store.busStore.buses.find(b => b.id === listener.busId);
      const busName = bus?.name ?? listener.busId;

      return { kind: 'listener', listener, busName, targetBlock, targetSlot };
    }

    return null;
  }, [selectedConnection, store.patchStore.connections, store.patchStore.blocks, store.busStore.publishers, store.busStore.listeners, store.busStore.buses]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    const entry = store.uiStore.popInspectorHistory();
    if (!entry) {
      // No history - just clear selection
      store.uiStore.deselectConnection();
    }
  }, [store]);

  // Handle disconnect actions
  const handleDisconnectWire = useCallback(() => {
    if (resolved?.kind === 'wire') {
      store.patchStore.disconnect(resolved.connection.id);
      store.uiStore.deselectConnection();
    }
  }, [store, resolved]);

  const handleDisconnectPublisher = useCallback(() => {
    if (resolved?.kind === 'publisher') {
      store.busStore.removePublisher(resolved.publisher.id);
      store.uiStore.deselectConnection();
    }
  }, [store, resolved]);

  const handleDisconnectListener = useCallback(() => {
    if (resolved?.kind === 'listener') {
      store.busStore.removeListener(resolved.listener.id);
      store.uiStore.deselectConnection();
    }
  }, [store, resolved]);

  // No connection selected
  if (!resolved) {
    return (
      <InspectorContainer
        title="Connection"
        color="#666"
        onBack={() => store.uiStore.deselectConnection()}
        backLabel="Back"
      >
        <div className="conn-empty">
          <p>Connection not found</p>
        </div>
      </InspectorContainer>
    );
  }

  // Render appropriate view based on connection type
  switch (resolved.kind) {
    case 'wire':
      return (
        <WireConnectionView
          connection={resolved.connection}
          sourceBlock={resolved.sourceBlock}
          sourceSlot={resolved.sourceSlot}
          targetBlock={resolved.targetBlock}
          targetSlot={resolved.targetSlot}
          onDisconnect={handleDisconnectWire}
          onBack={handleBack}
        />
      );

    case 'publisher':
      return (
        <PublisherConnectionView
          publisher={resolved.publisher}
          sourceBlock={resolved.sourceBlock}
          sourceSlot={resolved.sourceSlot}
          busName={resolved.busName}
          busId={resolved.publisher.busId}
          onDisconnect={handleDisconnectPublisher}
          onBack={handleBack}
        />
      );

    case 'listener':
      return (
        <ListenerConnectionView
          listener={resolved.listener}
          busName={resolved.busName}
          busId={resolved.listener.busId}
          targetBlock={resolved.targetBlock}
          targetSlot={resolved.targetSlot}
          onDisconnect={handleDisconnectListener}
          onBack={handleBack}
        />
      );
  }
});
