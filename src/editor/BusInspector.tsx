/**
 * Bus Inspector Component
 *
 * Shows detailed bus information when a bus is selected from the Bus Board.
 * Displays: name, type, combine mode, default value, publishers, listeners, and diagnostics.
 */

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useStore } from './stores';
import type { Bus, CoreDomain, BusCombineMode, LensDefinition } from './types';
import { formatTypeDesc, getCombineModesForDomain } from './semantic';
import { LensSelector, LensBadge } from './components/LensSelector';
import { InspectorContainer } from './components/InspectorContainer';
import { createLensInstanceFromDefinition, lensInstanceToDefinition } from './lenses/lensInstances';
import { getPublishersForBus, getListenersForBus, setBindingEnabled, type NormalizedBinding } from './bindings';
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
 * Unified binding item component for both publishers and listeners.
 * Supports enable/disable toggle, jump-to-block, and lens editing (listeners only).
 */
const BindingItem = observer(({
  binding,
  direction,
}: {
  binding: NormalizedBinding;
  direction: 'input' | 'output';
}) => {
  const store = useStore();
  const [isEditingLens, setIsEditingLens] = useState(false);

  // Determine which endpoint to show (opposite of the bus)
  const portRef = direction === 'output'
    ? (binding.kind === 'publisher' ? binding.from : null)
    : (binding.kind === 'listener' ? binding.to : null);

  if (!portRef) {
    return null;
  }

  const block = store.patchStore.blocks.find(b => b.id === portRef.blockId);
  const blockName = block?.label ?? 'Unknown Block';
  const portName = portRef.slotId;

  // For listeners, handle lens display and editing
  const primaryLens = binding.kind === 'listener' && binding.lensStack.length > 0
    ? binding.lensStack[0]
    : undefined;
  const lensDefinition = primaryLens
    ? lensInstanceToDefinition(primaryLens, store.defaultSourceStore)
    : undefined;

  const handleJumpToBlock = () => {
    store.uiStore.selectBlock(portRef.blockId);
  };

  const handleToggleEnabled = () => {
    setBindingEnabled(store, { kind: binding.kind, id: binding.id }, !binding.enabled);
  };

  const handleEditLens = () => {
    if (binding.kind !== 'listener') return;
    setIsEditingLens(!isEditingLens);
  };

  const handleLensChange = (lens: LensDefinition | undefined) => {
    if (binding.kind !== 'listener') return;
    if (!lens) {
      store.busStore.updateListener(binding.id, { lensStack: undefined });
      return;
    }
    const instance = createLensInstanceFromDefinition(
      lens,
      binding.id,
      0,
      store.defaultSourceStore
    );
    store.busStore.updateListener(binding.id, { lensStack: [instance] });
  };

  const showLensControls = binding.kind === 'listener';

  return (
    <li className={`bus-routing-item ${!binding.enabled ? 'disabled' : ''} ${isEditingLens ? 'expanded' : ''}`}>
      <div className="routing-item-row">
        <div className="routing-item-info">
          <span className="routing-block-name">{blockName}</span>
          <span className="routing-port-name">{portName}</span>
          {showLensControls && <LensBadge lens={lensDefinition} />}
        </div>
        <div className="routing-item-actions">
          {showLensControls && (
            <button
              className={`routing-lens-btn ${lensDefinition ? 'has-lens' : ''}`}
              onClick={handleEditLens}
              title={lensDefinition ? 'Edit lens' : 'Add lens'}
            >
              {lensDefinition ? '🔧' : '+🔧'}
            </button>
          )}
          <button
            className="routing-toggle-btn"
            onClick={handleToggleEnabled}
            title={binding.enabled ? 'Disable' : 'Enable'}
          >
            {binding.enabled ? '✓' : '○'}
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
      {isEditingLens && showLensControls && (
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

  // Use binding facade to get publishers and listeners
  const allPublishers = getPublishersForBus(store, busId);
  const allListeners = getListenersForBus(store, busId);

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
                .sort((a, b) => {
                  // Publishers have sortKey
                  if (a.kind === 'publisher' && b.kind === 'publisher') {
                    return a.sortKey - b.sortKey;
                  }
                  return 0;
                })
                .map((binding) => (
                  <BindingItem key={binding.id} binding={binding} direction="output" />
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
              {allListeners.map(binding => (
                <BindingItem key={binding.id} binding={binding} direction="input" />
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
