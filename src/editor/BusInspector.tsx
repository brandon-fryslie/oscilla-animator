/**
 * Bus Inspector Component
 *
 * Shows detailed bus information when a bus is selected from the Bus Board.
 * Displays: name, type, combine mode, default value, publishers, listeners, and diagnostics.
 */

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useStore } from './stores';
import type { Bus, Publisher, Listener, CoreDomain, BusCombineMode, LensDefinition } from './types';
import { formatTypeDesc, getCombineModesForDomain } from './semantic';
import { LensSelector, LensBadge } from './components/LensSelector';
import { InspectorContainer } from './components/InspectorContainer';
import { createLensInstanceFromDefinition, lensInstanceToDefinition } from './lenses/lensInstances';
import './BusInspector.css';

interface BusInspectorProps {
  busId: string;
}

/**
 * Default value editor component (typed by domain).
 */
function DefaultValueEditor({
  bus,
  onUpdate,
}: {
  bus: Bus;
  onUpdate: (value: unknown) => void;
}) {
  const domain = bus.type.domain as CoreDomain;
  const value = bus.defaultValue;

  switch (domain) {
    case 'float':
    case 'int':
    case 'time':
    case 'rate':
      return (
        <div className="default-value-editor">
          <input
            type="number"
            value={typeof value === 'number' ? value : 0}
            step={domain === 'rate' ? 0.1 : 1}
            onChange={(e) => onUpdate(parseFloat(e.target.value) || 0)}
          />
          {domain === 'time' && <span className="value-unit">seconds</span>}
          {domain === 'rate' && <span className="value-unit">×</span>}
        </div>
      );

    case 'vec2':
      const vec2Value = typeof value === 'object' && value !== null && 'x' in value && 'y' in value
        ? (value as { x: number; y: number })
        : { x: 0, y: 0 };
      return (
        <div className="default-value-editor vec2-editor">
          <label>
            <span>x:</span>
            <input
              type="number"
              value={vec2Value.x}
              onChange={(e) => onUpdate({ ...vec2Value, x: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <label>
            <span>y:</span>
            <input
              type="number"
              value={vec2Value.y}
              onChange={(e) => onUpdate({ ...vec2Value, y: parseFloat(e.target.value) || 0 })}
            />
          </label>
        </div>
      );

    case 'color':
      const colorValue = typeof value === 'string' ? value : '#000000';
      return (
        <div className="default-value-editor color-editor">
          <input
            type="color"
            value={colorValue}
            onChange={(e) => onUpdate(e.target.value)}
          />
          <input
            type="text"
            value={colorValue}
            onChange={(e) => onUpdate(e.target.value)}
            placeholder="#000000"
          />
        </div>
      );

    case 'boolean':
    case 'trigger':
      return (
        <div className="default-value-editor">
          <input
            type="checkbox"
            checked={typeof value === 'boolean' ? value : false}
            onChange={(e) => onUpdate(e.target.checked)}
          />
        </div>
      );

    default:
      return (
        <div className="default-value-editor">
          <span className="value-readonly">Not editable</span>
        </div>
      );
  }
}

/**
 * Publisher list item.
 */
const PublisherItem = observer(({
  publisher,
}: {
  publisher: Publisher;
}) => {
  const store = useStore();
  const block = store.patchStore.blocks.find(b => b.id === publisher.from.blockId);
  const blockName = block?.label ?? 'Unknown Block';
  const portName = publisher.from.slotId;

  const handleJumpToBlock = () => {
    store.uiStore.selectBlock(publisher.from.blockId);
    // TODO: Scroll PatchBay to show block
  };

  const handleToggleEnabled = () => {
    store.busStore.updatePublisher(publisher.id, { enabled: !publisher.enabled });
  };

  return (
    <li className={`bus-routing-item ${!publisher.enabled ? 'disabled' : ''}`}>
      <div className="routing-item-info">
        <span className="routing-block-name">{blockName}</span>
        <span className="routing-port-name">{portName}</span>
      </div>
      <div className="routing-item-actions">
        <button
          className="routing-toggle-btn"
          onClick={handleToggleEnabled}
          title={publisher.enabled ? 'Disable' : 'Enable'}
        >
          {publisher.enabled ? '✓' : '○'}
        </button>
        <button
          className="routing-jump-btn"
          onClick={handleJumpToBlock}
          title="Jump to block"
        >
          →
        </button>
      </div>
    </li>
  );
});

/**
 * Listener list item with lens display and editing.
 */
const ListenerItem = observer(({
  listener,
}: {
  listener: Listener;
}) => {
  const store = useStore();
  const [isEditingLens, setIsEditingLens] = useState(false);
  const block = store.patchStore.blocks.find(b => b.id === listener.to.blockId);
  const blockName = block?.label ?? 'Unknown Block';
  const portName = listener.to.slotId;
  const primaryLens = listener.lensStack?.[0];
  const lensDefinition = primaryLens
    ? lensInstanceToDefinition(primaryLens, store.defaultSourceStore)
    : undefined;

  const handleJumpToBlock = () => {
    store.uiStore.selectBlock(listener.to.blockId);
  };

  const handleToggleEnabled = () => {
    store.busStore.updateListener(listener.id, { enabled: !listener.enabled });
  };

  const handleEditLens = () => {
    setIsEditingLens(!isEditingLens);
  };

  const handleLensChange = (lens: LensDefinition | undefined) => {
    if (!lens) {
      store.busStore.updateListener(listener.id, { lensStack: undefined });
      return;
    }
    const instance = createLensInstanceFromDefinition(
      lens,
      listener.id,
      0,
      store.defaultSourceStore
    );
    store.busStore.updateListener(listener.id, { lensStack: [instance] });
  };

  return (
    <li className={`bus-routing-item ${!listener.enabled ? 'disabled' : ''} ${isEditingLens ? 'expanded' : ''}`}>
      <div className="routing-item-row">
        <div className="routing-item-info">
          <span className="routing-block-name">{blockName}</span>
          <span className="routing-port-name">{portName}</span>
          <LensBadge lens={lensDefinition} />
        </div>
        <div className="routing-item-actions">
          <button
            className={`routing-lens-btn ${lensDefinition ? 'has-lens' : ''}`}
            onClick={handleEditLens}
            title={lensDefinition ? 'Edit lens' : 'Add lens'}
          >
            {lensDefinition ? '🔧' : '+🔧'}
          </button>
          <button
            className="routing-toggle-btn"
            onClick={handleToggleEnabled}
            title={listener.enabled ? 'Disable' : 'Enable'}
          >
            {listener.enabled ? '✓' : '○'}
          </button>
          <button
            className="routing-jump-btn"
            onClick={handleJumpToBlock}
            title="Jump to block"
          >
            →
          </button>
        </div>
      </div>
      {isEditingLens && (
        <div className="routing-item-lens-editor">
          <LensSelector
            value={lensDefinition}
            onChange={handleLensChange}
          />
        </div>
      )}
    </li>
  );
});

/**
 * Bus Inspector Panel - displays when a bus is selected.
 */
export const BusInspector = observer(({ busId }: BusInspectorProps) => {
  const store = useStore();
  const bus = store.busStore.getBusById(busId);

  const handleBack = () => {
    store.uiStore.deselectBus();
  };

  if (!bus) {
    return (
      <InspectorContainer
        title="Bus Not Found"
        color="#666"
        onBack={handleBack}
        backLabel="Back"
      >
        <div className="inspector-empty">
          <p>Bus not found</p>
        </div>
      </InspectorContainer>
    );
  }

  const allPublishers = store.busStore.publishers.filter(p => p.busId === busId);
  const allListeners = store.busStore.listeners.filter(l => l.busId === busId);
  const typeDisplay = formatTypeDesc(bus.type);
  const domain = bus.type.domain as CoreDomain;
  const availableCombineModes = getCombineModesForDomain(domain);

  const handleCombineModeChange = (newMode: BusCombineMode) => {
    store.busStore.updateBus(busId, { combineMode: newMode });
  };

  const handleDefaultValueChange = (newValue: unknown) => {
    store.busStore.updateBus(busId, { defaultValue: newValue });
  };

  return (
    <InspectorContainer
      title={bus.name}
      typeCode={typeDisplay}
      category="Bus"
      color="#4f46e5"
      onBack={handleBack}
      backLabel="Back"
      className="bus-inspector"
    >
        {/* Section A: Summary */}
        <div className="inspector-section">
          <h3>Summary</h3>

          <div className="bus-property">
            <label>Type</label>
            <code className="bus-type-readonly">{typeDisplay}</code>
          </div>

          <div className="bus-property">
            <label>Combine Mode</label>
            <select
              className="bus-combine-select"
              value={bus.combineMode}
              onChange={(e) => handleCombineModeChange(e.target.value as BusCombineMode)}
            >
              {availableCombineModes.map(mode => (
                <option key={mode} value={mode}>
                  {mode === 'last' && (domain === 'trigger' || domain === 'boolean') ? 'OR' : mode}
                </option>
              ))}
            </select>
          </div>

          <div className="bus-property">
            <label>Default Value</label>
            <DefaultValueEditor bus={bus} onUpdate={handleDefaultValueChange} />
          </div>
        </div>

        {/* Section B: Publishers List */}
        <div className="inspector-section">
          <h3>
            Publishers
            <span className="section-count">{allPublishers.length}</span>
          </h3>
          {allPublishers.length === 0 ? (
            <p className="inspector-hint">No publishers</p>
          ) : (
            <ul className="bus-routing-list">
              {allPublishers
                .sort((a: Publisher, b: Publisher) => a.sortKey - b.sortKey)
                .map((pub: Publisher) => (
                  <PublisherItem key={pub.id} publisher={pub} />
                ))}
            </ul>
          )}
        </div>

        {/* Section C: Listeners List */}
        <div className="inspector-section">
          <h3>
            Listeners
            <span className="section-count">{allListeners.length}</span>
          </h3>
          {allListeners.length === 0 ? (
            <p className="inspector-hint">No listeners</p>
          ) : (
            <ul className="bus-routing-list">
              {allListeners.map(listener => (
                <ListenerItem key={listener.id} listener={listener} />
              ))}
            </ul>
          )}
        </div>

        {/* Section D: Diagnostics (Stub) */}
        <div className="inspector-section">
          <h3>Diagnostics</h3>
          <p className="inspector-hint">No issues detected</p>
        </div>
    </InspectorContainer>
  );
});
