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
import type { Connection, Publisher, Listener, Block, Slot, SlotType, TypeDesc, AdapterStep, LensDefinition, LensInstance } from './types';
import { parseRowKey, type TableCell, type TableRow, type TableColumn } from './modulation-table/types';
import { findAdapterPath } from './adapters/autoAdapter';
import { isDirectlyCompatible, SLOT_TYPE_TO_TYPE_DESC } from './types';
import { LensChainEditor } from './modulation-table/LensChainEditor';
import { lensInstanceToDefinition, createLensInstanceFromDefinition } from './lenses/lensInstances';
import './ConnectionInspector.css';

/**
 * Connection data resolved from ID, including full endpoint information.
 */
type ResolvedConnection =
  | { kind: 'wire'; connection: Connection; sourceBlock: Block; sourceSlot: Slot; targetBlock: Block; targetSlot: Slot }
  | { kind: 'publisher'; publisher: Publisher; sourceBlock: Block; sourceSlot: Slot; busName: string }
  | { kind: 'listener'; listener: Listener; busName: string; targetBlock: Block; targetSlot: Slot }
  | { kind: 'cell'; cellInfo: CellInspectorInfo };

/**
 * Detailed cell info for inspector display
 */
type CellInspectorInfo = {
  cell: TableCell;
  row: TableRow;
  column: TableColumn;
  block: Block;
  slot: Slot;
  // Computed compatibility info
  compatibility: {
    status: 'compatible' | 'convertible' | 'incompatible';
    adapterChain?: AdapterStep[];
    incompatibilityReason?: string;
  };
};

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
      {(worldBadge !== null && worldBadge !== undefined) && <span className={`conn-type-badge world ${desc.world}`}>{worldBadge}</span>}
      {(desc.domain !== null && desc.domain !== undefined) && <span className="conn-type-badge domain">{desc.domain}</span>}
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
          disabled={onNavigate === undefined}
          title={onNavigate !== undefined ? `Navigate to ${blockName}` : undefined}
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
          disabled={onNavigate === undefined}
          title={onNavigate !== undefined ? `Navigate to bus "${busName}"` : undefined}
        >
          {busName}
        </button>
      </div>
    </div>
  );
}

/**
 * Wire Connection Inspector - displays wire details with full lens editing.
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

  // Convert LensInstance[] to LensDefinition[] for the editor
  const lensChain = useMemo((): LensDefinition[] => {
    if (connection.lensStack === undefined || connection.lensStack.length === 0) return [];
    return connection.lensStack.map(lens =>
      lensInstanceToDefinition(lens, store.defaultSourceStore)
    );
  }, [connection.lensStack, store.defaultSourceStore]);

  // Handle lens chain changes from the editor
  const handleLensChainChange = useCallback((chain: LensDefinition[]) => {
    const bindingId = `wire:${connection.id}`;
    const instances: LensInstance[] = chain.map((def, index) =>
      createLensInstanceFromDefinition(def, bindingId, index, store.defaultSourceStore)
    );
    store.patchStore.updateConnection(connection.id, {
      lensStack: instances.length > 0 ? instances : undefined,
    });
  }, [store, connection.id]);

  // Get type descriptors for lens editor
  const sourceType = useMemo(() => SLOT_TYPE_TO_TYPE_DESC[sourceSlot.type], [sourceSlot.type]);
  const targetType = useMemo(() => SLOT_TYPE_TO_TYPE_DESC[targetSlot.type], [targetSlot.type]);

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

      {/* Inline lens editor */}
      <div className="conn-section conn-lens-section">
        <LensChainEditor
          lensChain={lensChain}
          onChange={handleLensChainChange}
          sourceType={sourceType}
          targetType={targetType}
          inline={true}
        />
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
 * Publisher Connection Inspector - displays publisher details with full lens editing.
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

  // Convert LensInstance[] to LensDefinition[] for the editor
  const lensChain = useMemo((): LensDefinition[] => {
    if (publisher.lensStack === undefined || publisher.lensStack.length === 0) return [];
    return publisher.lensStack.map(lens =>
      lensInstanceToDefinition(lens, store.defaultSourceStore)
    );
  }, [publisher.lensStack, store.defaultSourceStore]);

  // Handle lens chain changes from the editor
  const handleLensChainChange = useCallback((chain: LensDefinition[]) => {
    const bindingId = `pub:${publisher.id}`;
    const instances: LensInstance[] = chain.map((def, index) =>
      createLensInstanceFromDefinition(def, bindingId, index, store.defaultSourceStore)
    );
    store.busStore.updatePublisher(publisher.id, {
      lensStack: instances.length > 0 ? instances : undefined,
    });
  }, [store, publisher.id]);

  // Get type descriptors for lens editor
  const sourceType = useMemo(() => SLOT_TYPE_TO_TYPE_DESC[sourceSlot.type], [sourceSlot.type]);
  const bus = store.busStore.buses.find(b => b.id === busId);
  const targetType = bus?.type;

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

      {/* Inline lens editor */}
      <div className="conn-section conn-lens-section">
        <LensChainEditor
          lensChain={lensChain}
          onChange={handleLensChainChange}
          sourceType={sourceType}
          targetType={targetType}
          inline={true}
        />
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
 * Listener Connection Inspector - displays listener details with full lens editing.
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

  // Convert LensInstance[] to LensDefinition[] for the editor
  const lensChain = useMemo((): LensDefinition[] => {
    if (listener.lensStack === undefined || listener.lensStack.length === 0) return [];
    return listener.lensStack.map(lens =>
      lensInstanceToDefinition(lens, store.defaultSourceStore)
    );
  }, [listener.lensStack, store.defaultSourceStore]);

  // Handle lens chain changes from the editor
  const handleLensChainChange = useCallback((chain: LensDefinition[]) => {
    const bindingId = `lis:${listener.id}`;
    const instances: LensInstance[] = chain.map((def, index) =>
      createLensInstanceFromDefinition(def, bindingId, index, store.defaultSourceStore)
    );
    store.busStore.updateListener(listener.id, {
      lensStack: instances.length > 0 ? instances : undefined,
    });
  }, [store, listener.id]);

  // Get type descriptors for lens editor
  const bus = store.busStore.buses.find(b => b.id === busId);
  const sourceType = bus?.type;
  const targetType = useMemo(() => SLOT_TYPE_TO_TYPE_DESC[targetSlot.type], [targetSlot.type]);

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

      {/* Inline lens editor */}
      <div className="conn-section conn-lens-section">
        <LensChainEditor
          lensChain={lensChain}
          onChange={handleLensChainChange}
          sourceType={sourceType}
          targetType={targetType}
          inline={true}
        />
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
 * Type description display for showing type compatibility info.
 */
function TypeDescription({ typeDesc, label }: { typeDesc: TypeDesc; label: string }) {
  return (
    <div className="conn-type-desc">
      <span className="conn-type-desc-label">{label}</span>
      <span className="conn-type-desc-value">
        <span className={`conn-type-world ${typeDesc.world}`}>{typeDesc.world}</span>
        {(typeDesc.domain !== null && typeDesc.domain !== undefined) && <span className="conn-type-domain">{typeDesc.domain}</span>}
      </span>
    </div>
  );
}

/**
 * Adapter chain display - shows required adapters for type conversion.
 */
function AdapterChainDisplay({ chain }: { chain: AdapterStep[] }) {
  if (chain.length === 0) return null;

  return (
    <div className="conn-adapter-chain">
      <h4 className="conn-section-title">Required Adapters</h4>
      <div className="conn-adapter-steps">
        {chain.map((step, i) => (
          <div key={i} className="conn-adapter-step">
            <span className="conn-adapter-name">{step.adapterId}</span>
          </div>
        ))}
      </div>
      <p className="conn-hint">These adapters will be applied automatically when connecting.</p>
    </div>
  );
}

/**
 * Cell Connection View - displays cell details from ModulationTable.
 * Handles bound, unbound, convertible, and incompatible cells.
 * For bound cells, provides full lens editing.
 */
const CellConnectionView = observer(({
  cellInfo,
  onBack,
}: {
  cellInfo: CellInspectorInfo;
  onBack: () => void;
}) => {
  const store = useStore();
  const { cell, row, column, block, slot, compatibility } = cellInfo;

  const navigateToBlock = useCallback(() => {
    store.uiStore.selectBlock(block.id);
  }, [store, block.id]);

  const navigateToBus = useCallback(() => {
    store.uiStore.selectBus(column.busId);
  }, [store, column.busId]);

  const handleConnect = useCallback(() => {
    // Parse rowKey to get block/port info
    const parsed = parseRowKey(row.key);
    if (parsed === null) return;

    const { blockId, portId, direction } = parsed;

    if (direction === 'input') {
      // For inputs: create listener (bus → port)
      // Check for existing listener on this port and remove it (one listener per port)
      const existingListener = store.busStore.listeners.find(
        l => l.to.blockId === blockId && l.to.slotId === portId
      );
      if (existingListener !== undefined) {
        store.busStore.removeListener(existingListener.id);
      }

      // Find adapter chain if needed
      let adapterChain: AdapterStep[] | undefined;
      if (compatibility.status === 'convertible' && compatibility.adapterChain !== undefined) {
        adapterChain = compatibility.adapterChain;
      }

      store.busStore.addListener(column.busId, blockId, portId, adapterChain);
    } else {
      // For outputs: create publisher (port → bus)
      store.busStore.addPublisher(column.busId, blockId, portId);
    }
  }, [store, row.key, column.busId, compatibility]);

  const handleDisconnect = useCallback(() => {
    // Parse rowKey to get block/port info
    const parsed = parseRowKey(row.key);
    if (parsed === null) return;

    const { blockId, portId, direction } = parsed;

    if (direction === 'input') {
      // Find and remove the listener for this port
      const listener = store.busStore.listeners.find(
        l => l.to.blockId === blockId && l.to.slotId === portId && l.busId === column.busId
      );
      if (listener !== undefined) {
        store.busStore.removeListener(listener.id);
      }
    } else {
      // Find and remove the publisher for this port + bus
      const publisher = store.busStore.publishers.find(
        p => p.from.blockId === blockId && p.from.slotId === portId && p.busId === column.busId
      );
      if (publisher !== undefined) {
        store.busStore.removePublisher(publisher.id);
      }
    }
    store.uiStore.deselectConnection();
  }, [store, row.key, column.busId]);

  // Get the binding (listener or publisher) for lens editing
  const binding = useMemo(() => {
    if (cell.listenerId !== undefined) {
      return store.busStore.listeners.find(l => l.id === cell.listenerId);
    }
    if (cell.publisherId !== undefined) {
      return store.busStore.publishers.find(p => p.id === cell.publisherId);
    }
    return null;
  }, [store.busStore.listeners, store.busStore.publishers, cell.listenerId, cell.publisherId]);

  // Convert LensInstance[] to LensDefinition[] for the editor
  const lensChain = useMemo((): LensDefinition[] => {
    if (binding?.lensStack === undefined || binding.lensStack.length === 0) return [];
    return binding.lensStack.map(lens =>
      lensInstanceToDefinition(lens, store.defaultSourceStore)
    );
  }, [binding?.lensStack, store.defaultSourceStore]);

  // Handle lens chain changes from the editor
  const handleLensChainChange = useCallback((chain: LensDefinition[]) => {
    if (binding == null) return;

    const bindingType = cell.listenerId !== undefined ? 'lis' : 'pub';
    const bindingId = `${bindingType}:${binding.id}`;
    const instances: LensInstance[] = chain.map((def, index) =>
      createLensInstanceFromDefinition(def, bindingId, index, store.defaultSourceStore)
    );

    if (cell.listenerId !== undefined) {
      store.busStore.updateListener(cell.listenerId, {
        lensStack: instances.length > 0 ? instances : undefined,
      });
    } else if (cell.publisherId !== undefined) {
      store.busStore.updatePublisher(cell.publisherId, {
        lensStack: instances.length > 0 ? instances : undefined,
      });
    }
  }, [store, binding, cell.listenerId, cell.publisherId]);

  const isBound = cell.status === 'bound';
  const isConvertible = compatibility.status === 'convertible';
  const isIncompatible = compatibility.status === 'incompatible';
  const directionLabel = row.direction === 'input' ? 'Listener' : 'Publisher';
  const category = isBound ? `Bound ${directionLabel}` :
                   isConvertible ? `Convertible (${directionLabel})` :
                   isIncompatible ? 'Incompatible' : `Available ${directionLabel}`;
  const color = isBound ? '#4f46e5' :
                isConvertible ? '#f59e0b' :
                isIncompatible ? '#ef4444' : '#10b981';

  return (
    <InspectorContainer
      title={`Cell: ${block.label} → ${column.name}`}
      typeCode={slot.type}
      category={category}
      color={color}
      onBack={onBack}
      backLabel="Back"
    >
      {/* Endpoints */}
      <div className="conn-section">
        <EndpointDisplay
          label={row.direction === 'output' ? 'From (Publisher)' : 'To (Listener)'}
          blockName={block.label}
          portName={slot.label}
          portType={slot.type}
          onNavigate={navigateToBlock}
        />
        <div className="conn-arrow">{row.direction === 'output' ? '→' : '←'}</div>
        <BusEndpointDisplay
          label={row.direction === 'output' ? 'To Bus' : 'From Bus'}
          busName={column.name}
          onNavigate={navigateToBus}
        />
      </div>

      {/* Type Compatibility Info */}
      <div className="conn-section">
        <h4 className="conn-section-title">Type Compatibility</h4>
        <div className="conn-type-comparison">
          <TypeDescription typeDesc={row.type} label="Port Type" />
          <div className="conn-type-compat-arrow">{row.direction === 'output' ? '→' : '←'}</div>
          <TypeDescription typeDesc={column.type} label="Bus Type" />
        </div>

        {compatibility.status === 'compatible' && (
          <p className="conn-status conn-status-compatible">Types are directly compatible</p>
        )}

        {compatibility.status === 'convertible' && compatibility.adapterChain !== undefined && (
          <>
            <p className="conn-status conn-status-convertible">Types can be converted with adapters</p>
            <AdapterChainDisplay chain={compatibility.adapterChain} />
          </>
        )}

        {compatibility.status === 'incompatible' && (
          <div className="conn-status conn-status-incompatible">
            <p className="conn-incompatible-header">Types are incompatible</p>
            <p className="conn-incompatible-reason">
              {compatibility.incompatibilityReason ?? 'No conversion path available'}
            </p>
          </div>
        )}
      </div>

      {/* Inline lens editor (only for bound cells) */}
      {isBound && (
        <div className="conn-section conn-lens-section">
          <LensChainEditor
            lensChain={lensChain}
            onChange={handleLensChainChange}
            sourceType={row.direction === 'output' ? row.type : column.type}
            targetType={row.direction === 'output' ? column.type : row.type}
            inline={true}
          />
        </div>
      )}

      {/* Actions */}
      <div className="conn-actions">
        {isBound ? (
          <button className="conn-action-btn conn-action-danger" onClick={handleDisconnect}>
            Disconnect
          </button>
        ) : isIncompatible ? (
          <button className="conn-action-btn" disabled title="Cannot connect incompatible types">
            Cannot Connect
          </button>
        ) : (
          <button className="conn-action-btn conn-action-primary" onClick={handleConnect}>
            {isConvertible ? 'Connect (with Adapters)' : 'Connect'}
          </button>
        )}
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
    if (selectedConnection === null) return null;

    const type = selectedConnection.type;

    const id = type === "cell" ? null : selectedConnection.id;
    if (type === 'wire') {
      const connection = store.patchStore.connections.find(c => c.id === id);
      if (connection === undefined) return null;

      const sourceBlock = store.patchStore.blocks.find(b => b.id === connection.from.blockId);
      const targetBlock = store.patchStore.blocks.find(b => b.id === connection.to.blockId);
      if (sourceBlock === undefined || targetBlock === undefined) return null;

      const sourceSlot = sourceBlock.outputs.find(s => s.id === connection.from.slotId);
      const targetSlot = targetBlock.inputs.find(s => s.id === connection.to.slotId);
      if (sourceSlot === undefined || targetSlot === undefined) return null;

      return { kind: 'wire', connection, sourceBlock, sourceSlot, targetBlock, targetSlot };
    }

    if (type === 'publisher') {
      const publisher = store.busStore.publishers.find(p => p.id === id);
      if (publisher === undefined) return null;

      const sourceBlock = store.patchStore.blocks.find(b => b.id === publisher.from.blockId);
      if (sourceBlock === undefined) return null;

      const sourceSlot = sourceBlock.outputs.find(s => s.id === publisher.from.slotId);
      if (sourceSlot === undefined) return null;

      const bus = store.busStore.buses.find(b => b.id === publisher.busId);
      const busName = bus?.name ?? publisher.busId;

      return { kind: 'publisher', publisher, sourceBlock, sourceSlot, busName };
    }

    if (type === 'listener') {
      const listener = store.busStore.listeners.find(l => l.id === id);
      if (listener === undefined) return null;

      const targetBlock = store.patchStore.blocks.find(b => b.id === listener.to.blockId);
      if (targetBlock === undefined) return null;

      const targetSlot = targetBlock.inputs.find(s => s.id === listener.to.slotId);
      if (targetSlot === undefined) return null;

      const bus = store.busStore.buses.find(b => b.id === listener.busId);
      const busName = bus?.name ?? listener.busId;

      return { kind: 'listener', listener, busName, targetBlock, targetSlot };
    }

    if (type === 'cell') {
      const { rowKey, busId, direction } = selectedConnection;

      // Parse rowKey to get block/port info
      const parsed = parseRowKey(rowKey);
      if (parsed === null) return null;

      // Get block and slot
      const block = store.patchStore.blocks.find(b => b.id === parsed.blockId);
      if (block === undefined) return null;

      const slot = direction === 'input'
        ? block.inputs.find(s => s.id === parsed.portId)
        : block.outputs.find(s => s.id === parsed.portId);
      if (slot === undefined) return null;

      // Get bus for column info
      const bus = store.busStore.buses.find(b => b.id === busId);
      if (bus === undefined) return null;

      // Build column info using slot type descriptor
      const slotTypeDesc = SLOT_TYPE_TO_TYPE_DESC[slot.type];
      if (slotTypeDesc === undefined) return null;

      const column: TableColumn = {
        busId: bus.id,
        name: bus.name,
        type: bus.type,
        combineMode: bus.combineMode,
        enabled: true,
        publisherCount: store.busStore.publishers.filter(p => p.busId === bus.id).length,
        listenerCount: store.busStore.listeners.filter(l => l.busId === bus.id).length,
        activity: 0,
      };

      // Build row info
      const row: TableRow = {
        key: rowKey,
        label: slot.label,
        groupKey: `${direction === 'input' ? 'listeners' : 'publishers'}:${block.id}`,
        blockId: block.id,
        portId: slot.id,
        direction: direction,
        type: slotTypeDesc,
        semantics: slotTypeDesc.semantics,
      };

      // Check if bound
      let isBound = false;
      let listenerId: string | undefined;
      let publisherId: string | undefined;
      let enabled: boolean | undefined;

      if (direction === 'input') {
        const listener = store.busStore.listeners.find(
          l => l.to.blockId === block.id && l.to.slotId === slot.id && l.busId === busId
        );
        if (listener !== undefined) {
          isBound = true;
          listenerId = listener.id;
          enabled = listener.enabled;
        }
      } else {
        const publisher = store.busStore.publishers.find(
          p => p.from.blockId === block.id && p.from.slotId === slot.id && p.busId === busId
        );
        if (publisher !== undefined) {
          isBound = true;
          publisherId = publisher.id;
          enabled = publisher.enabled;
        }
      }

      // Build cell info
      const cell: TableCell = {
        rowKey,
        busId,
        direction,
        listenerId,
        publisherId,
        enabled,
        status: isBound ? 'bound' : 'empty',
      };

      // Compute compatibility info
      let compatibility: CellInspectorInfo['compatibility'];
      if (isBound || isDirectlyCompatible(column.type, row.type)) {
        compatibility = { status: 'compatible' };
      } else {
        // Check for adapter path
        const adapterResult = findAdapterPath(column.type, row.type, direction === 'input' ? 'listener' : 'publisher');
        if (adapterResult.ok && adapterResult.chain !== undefined) {
          compatibility = {
            status: 'convertible',
            adapterChain: adapterResult.chain,
          };
        } else {
          compatibility = {
            status: 'incompatible',
            incompatibilityReason: adapterResult.reason ?? `Cannot convert ${column.type.world}:${column.type.domain ?? 'unknown'} to ${row.type.world}:${row.type.domain ?? 'unknown'}`,
          };
        }
      }

      return {
        kind: 'cell',
        cellInfo: { cell, row, column, block, slot, compatibility },
      };
    }

    return null;
  }, [selectedConnection, store.patchStore.connections, store.patchStore.blocks, store.busStore.publishers, store.busStore.listeners, store.busStore.buses]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    const entry = store.uiStore.popInspectorHistory();
    if (entry === null) {
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
  if (resolved === null) {
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

    case 'cell':
      return (
        <CellConnectionView
          cellInfo={resolved.cellInfo}
          onBack={handleBack}
        />
      );
  }
});
