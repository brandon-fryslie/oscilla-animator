/**
 * Inspector Component
 *
 * Property editor for selected block (right panel).
 * Also shows block definition preview when clicking unplaced blocks.
 */

import { useState, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import type { PortRef, Block, Slot, Connection, DefaultSourceState } from './types';
import { getBlockDefinition, getBlockDefinitions, type BlockDefinition } from './blocks';
import { findCompatiblePorts, getConnectionsForPort, areTypesCompatible, describeSlotType, formatSlotType, slotCompatibilityHint, isInputDriven } from './portUtils';
import { InspectorContainer } from './components/InspectorContainer';
import { ConnectionInspector } from './ConnectionInspector';
import { BusInspector } from './BusInspector';
import './Inspector.css';

/**
 * Check if two blocks have compatible port signatures for replacement.
 */
function getPortCompatibility(
  currentBlock: Block,
  candidateDef: BlockDefinition
): boolean {
  // Check all current inputs have a compatible match
  for (const currentInput of currentBlock.inputs) {
    const candidateInput = candidateDef.inputs.find(i => i.id === currentInput.id);
    if (!candidateInput || !areTypesCompatible(candidateInput.type, currentInput.type)) {
      return false;
    }
  }
  // Check all current outputs have a compatible match
  for (const currentOutput of currentBlock.outputs) {
    const candidateOutput = candidateDef.outputs.find(o => o.id === currentOutput.id);
    if (!candidateOutput || !areTypesCompatible(currentOutput.type, candidateOutput.type)) {
      return false;
    }
  }
  return true;
}


/**
 * Port wiring panel - shows when a port is selected.
 * Lists compatible ports and allows creating connections.
 */
const PortWiringPanel = observer(({
  portRef,
  block,
  slot,
}: {
  portRef: PortRef;
  block: Block;
  slot: Slot;
}) => {
  const store = useStore();
  const [hoveredTarget, setHoveredTarget] = useState<PortRef | null>(null);

  // Find compatible ports on placed blocks
  const compatible = findCompatiblePorts(
    portRef,
    slot,
    store.patchStore.blocks,
    store.patchStore.connections
  );

  // Find compatible library blocks (not yet placed)
  const compatibleLibraryBlocks = useMemo(() => {
    const results: Array<{ definition: BlockDefinition; slot: Slot }> = [];
    const lookingForDirection = portRef.direction === 'output' ? 'input' : 'output';

    for (const def of getBlockDefinitions()) {
      const slotsToCheck = lookingForDirection === 'input' ? def.inputs : def.outputs;
      for (const targetSlot of slotsToCheck) {
        const isCompatible =
          portRef.direction === 'output'
            ? areTypesCompatible(slot.type, targetSlot.type)
            : areTypesCompatible(targetSlot.type, slot.type);
        if (isCompatible) {
          results.push({ definition: def, slot: targetSlot });
          break; // Only show each block once (first compatible slot)
        }
      }
    }
    return results;
  }, [portRef.direction, slot.type]);

  const adapterDefinitions = useMemo(
    () => getBlockDefinitions().filter((d) => d.subcategory === 'Adapters'),
    []
  );

  const { suggestions: adapterSuggestions, nearMisses } = useMemo(() => {
    const suggestions: Array<{
      block: Block;
      slot: Slot;
      adapter: BlockDefinition;
      adapterInput: Slot;
      adapterOutput: Slot;
    }> = [];
    const nearMisses: Array<{ block: Block; slot: Slot }> = [];
    const sourceDesc = describeSlotType(slot.type);
    if (!sourceDesc.domain) return { suggestions, nearMisses };
    const lookingForDirection = portRef.direction === 'output' ? 'input' : 'output';

    for (const b of store.patchStore.blocks) {
      if (b.id === block.id) continue;
      const slotsToCheck = lookingForDirection === 'input' ? b.inputs : b.outputs;
      for (const s of slotsToCheck) {
        // Skip already compatible
        const compatible =
          portRef.direction === 'output'
            ? areTypesCompatible(slot.type, s.type)
            : areTypesCompatible(s.type, slot.type);
        if (compatible) continue;

        const desc = describeSlotType(s.type);
        if (!desc.domain) continue;
        // Same domain but different world -> likely needs adapter
        const domainMatches = desc.domain === sourceDesc.domain;
        const worldMismatch = desc.world !== sourceDesc.world;
        if (domainMatches && worldMismatch) {
          // Try to find an adapter that bridges
          const adapter = adapterDefinitions.find((def) => {
            // Adapter must have one input and one output that can bridge
            for (const adapterInput of def.inputs) {
              for (const adapterOutput of def.outputs) {
                if (portRef.direction === 'output') {
                  const inputOk = areTypesCompatible(slot.type, adapterInput.type);
                  const outputOk = areTypesCompatible(adapterOutput.type, s.type);
                  if (inputOk && outputOk) {
                    suggestions.push({
                      block: b,
                      slot: s,
                      adapter: def,
                      adapterInput,
                      adapterOutput,
                    });
                    return true;
                  }
                } else {
                  const inputOk = areTypesCompatible(s.type, adapterInput.type);
                  const outputOk = areTypesCompatible(adapterOutput.type, slot.type);
                  if (inputOk && outputOk) {
                    suggestions.push({
                      block: b,
                      slot: s,
                      adapter: def,
                      adapterInput,
                      adapterOutput,
                    });
                    return true;
                  }
                }
              }
            }
            return false;
          });

          if (!adapter) {
            nearMisses.push({ block: b, slot: s });
          }
          break; // only list block once
        }
      }
    }
    return { suggestions, nearMisses };
  }, [block.id, portRef.direction, slot.type, store.patchStore.blocks.length, adapterDefinitions]);

  // Get existing wire connections for this port
  const existingConnections = getConnectionsForPort(
    portRef.blockId,
    portRef.slotId,
    portRef.direction,
    store.patchStore.connections
  );

  // Get existing bus connections for this port
  const busConnections = useMemo(() => {
    if (portRef.direction === 'output') {
      // Output ports have publishers (block → bus)
      return store.busStore.publishers
        .filter(p => p.from.blockId === portRef.blockId && p.from.slotId === portRef.slotId)
        .map(p => ({
          type: 'publisher' as const,
          id: p.id,
          busId: p.busId,
          busName: store.busStore.buses.find(b => b.id === p.busId)?.name ?? p.busId,
          enabled: p.enabled,
        }));
    } else {
      // Input ports have listeners (bus → block)
      return store.busStore.listeners
        .filter(l => l.to.blockId === portRef.blockId && l.to.slotId === portRef.slotId)
        .map(l => ({
          type: 'listener' as const,
          id: l.id,
          busId: l.busId,
          busName: store.busStore.buses.find(b => b.id === l.busId)?.name ?? l.busId,
          enabled: l.enabled,
          hasLenses: (l.lensStack?.length ?? 0) > 0,
        }));
    }
  }, [portRef.blockId, portRef.slotId, portRef.direction, store.busStore.publishers, store.busStore.listeners, store.busStore.buses]);

  const hasBusConnections = busConnections.length > 0;
  const hasAnyConnections = existingConnections.length > 0 || hasBusConnections;

  const handleConnect = (target: { block: Block; slot: Slot; portRef: PortRef }) => {
    if (portRef.direction === 'output') {
      // This port is an OUTPUT, target is an INPUT.
      // An output can connect to multiple inputs, so we just add.
      store.patchStore.connect(portRef.blockId, portRef.slotId, target.portRef.blockId, target.portRef.slotId);
    } else {
      // This port is an INPUT, target is an OUTPUT.
      // An input can only have one writer. Remove existing connections first.
      const existing = getConnectionsForPort(portRef.blockId, portRef.slotId, 'input', store.patchStore.connections);
      for (const conn of existing) {
        store.patchStore.disconnect(conn.id);
      }
      // Now, add the new connection.
      store.patchStore.connect(target.portRef.blockId, target.portRef.slotId, portRef.blockId, portRef.slotId);
    }
    // Clear selection after connecting
    store.uiStore.setSelectedPort(null);
  };

  /**
   * Add a library block to its suggested lane and connect to the selected port.
   */
  const handleAddAndConnect = (def: BlockDefinition, targetSlot: Slot) => {
    // Add the block
    const newBlockId = store.patchStore.addBlock(def.type, def.defaultParams);

    // Connect the ports
    if (portRef.direction === 'output') {
      // Selected port is output, new block's slot is input
      store.patchStore.connect(portRef.blockId, portRef.slotId, newBlockId, targetSlot.id);
    } else {
      // Selected port is input, new block's slot is output
      store.patchStore.connect(newBlockId, targetSlot.id, portRef.blockId, portRef.slotId);
    }

    // Clear selection
    store.uiStore.setSelectedPort(null);
  };

  const handleDisconnect = (connectionId: string) => {
    store.patchStore.disconnect(connectionId);
  };

  const handleDisconnectBus = (busConnectionType: 'publisher' | 'listener', connectionId: string) => {
    if (busConnectionType === 'publisher') {
      store.busStore.removePublisher(connectionId);
    } else {
      store.busStore.removeListener(connectionId);
    }
  };

  const isInputOccupied = (blockId: string, slotId: string): boolean => {
    return store.patchStore.connections.some(
      (c) => c.to.blockId === blockId && c.to.slotId === slotId
    );
  };

  const handleInsertAdapter = (suggestion: {
    block: Block;
    slot: Slot;
    adapter: BlockDefinition;
    adapterInput: Slot;
    adapterOutput: Slot;
  }) => {
    // Guard against overwriting occupied inputs
    if (portRef.direction === 'output' && isInputOccupied(suggestion.block.id, suggestion.slot.id)) {
      return;
    }
    if (portRef.direction === 'input' && isInputOccupied(portRef.blockId, portRef.slotId)) {
      return;
    }

    const adapterId = store.patchStore.addBlock(
      suggestion.adapter.type,
      suggestion.adapter.defaultParams
    );

    if (portRef.direction === 'output') {
      // source -> adapter -> target
      store.patchStore.connect(portRef.blockId, portRef.slotId, adapterId, suggestion.adapterInput.id);
      store.patchStore.connect(adapterId, suggestion.adapterOutput.id, suggestion.block.id, suggestion.slot.id);
    } else {
      // target -> adapter -> source
      store.patchStore.connect(suggestion.block.id, suggestion.slot.id, adapterId, suggestion.adapterInput.id);
      store.patchStore.connect(adapterId, suggestion.adapterOutput.id, portRef.blockId, portRef.slotId);
    }

    store.uiStore.setSelectedPort(null);
  };

  // Hover highlighting - set hovered port in store
  const handleTargetHover = (target: PortRef | null) => {
    setHoveredTarget(target);
    store.uiStore.setHoveredPort(target);
  };

  const definition = getBlockDefinition(block.type);
  const blockColor = definition?.color ?? '#666';

  const renderTypeBadges = (type: Slot['type']) => {
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
      <span className="port-badges">
        {worldBadge && <span className={`port-badge world ${desc.world}`}>{worldBadge}</span>}
        {desc.domain && <span className="port-badge domain">{desc.domain}</span>}
      </span>
    );
  };

  const handleBack = () => {
    store.uiStore.setSelectedPort(null);
  };

  return (
    <InspectorContainer
      title={slot.label}
      typeCode={slot.type}
      category={portRef.direction === 'input' ? 'Input' : 'Output'}
      color={blockColor}
      onBack={handleBack}
      backLabel="Back to Block"
    >
        <div className="wiring-section">
          <div className="wiring-info">
            <div className="wiring-info-row">
              <span className="wiring-info-label">Block:</span>
              <span className="wiring-info-value">{block.label}</span>
            </div>
            <div className="wiring-info-row">
              <span className="wiring-info-label">Type:</span>
              <code className="wiring-info-value">{slot.type}</code>
              {renderTypeBadges(slot.type)}
              <span className="wiring-info-hint">{formatSlotType(slot.type)}</span>
            </div>
          </div>
        </div>

        {/* Existing connections (wire + bus) */}
        {hasAnyConnections && (
          <div className="wiring-section">
            <h4>Connected to</h4>
            <ul className="wiring-connection-list">
              {/* Wire connections (green) */}
              {existingConnections.map((conn) => {
                const otherBlockId = portRef.direction === 'output' ? conn.to.blockId : conn.from.blockId;
                const otherSlotId = portRef.direction === 'output' ? conn.to.slotId : conn.from.slotId;
                const otherBlock = store.patchStore.blocks.find((b) => b.id === otherBlockId);
                const otherSlots = portRef.direction === 'output' ? otherBlock?.inputs : otherBlock?.outputs;
                const otherSlot = otherSlots?.find((s) => s.id === otherSlotId);

                return (
                  <li
                    key={conn.id}
                    className="wiring-connection-item wiring-connection-wire clickable"
                    onClick={() => store.uiStore.selectConnection('wire', conn.id)}
                    title="Click to inspect wire connection"
                  >
                    <span className="wiring-connection-type-icon">⚡</span>
                    <span className="wiring-target-block">{otherBlock?.label ?? 'Unknown'}</span>
                    <span className="wiring-target-slot">
                      {otherSlot?.label ?? otherSlotId}
                      {otherSlot ? renderTypeBadges(otherSlot.type) : null}
                    </span>
                    <button
                      className="wiring-disconnect-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDisconnect(conn.id);
                      }}
                      title="Disconnect"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
              {/* Bus connections (blue) */}
              {busConnections.map((busConn) => (
                <li
                  key={busConn.id}
                  className={`wiring-connection-item wiring-connection-bus clickable ${!busConn.enabled ? 'disabled' : ''}`}
                  onClick={() => store.uiStore.selectConnection(busConn.type, busConn.id)}
                  title={`Click to inspect ${busConn.type}`}
                >
                  <span className="wiring-connection-type-icon">📡</span>
                  <span className="wiring-target-bus">{busConn.busName}</span>
                  {'hasLenses' in busConn && busConn.hasLenses && (
                    <span className="wiring-lens-indicator" title="Has lenses">🔧</span>
                  )}
                  {!busConn.enabled && (
                    <span className="wiring-disabled-badge">disabled</span>
                  )}
                  <button
                    className="wiring-disconnect-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnectBus(busConn.type, busConn.id);
                    }}
                    title={`Remove ${busConn.type}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Compatible targets (placed blocks) */}
        <div className="wiring-section">
          <h4>
            {portRef.direction === 'output' ? 'Available inputs' : 'Available outputs'}
            <span className="wiring-count">{compatible.length}</span>
          </h4>
          {compatible.length === 0 ? (
            <p className="wiring-empty">
              No compatible ports found. {slotCompatibilityHint(slot.type)}
            </p>
          ) : (
            <ul className="wiring-target-list">
              {compatible.map((target) => (
                <li
                  key={`${target.block.id}:${target.slot.id}`}
                  className={`wiring-target-item ${
                    hoveredTarget?.blockId === target.block.id &&
                    hoveredTarget?.slotId === target.slot.id
                      ? 'hovered'
                      : ''
                  }`}
                  onMouseEnter={() => handleTargetHover(target.portRef)}
                  onMouseLeave={() => handleTargetHover(null)}
                  onClick={() => handleConnect(target)}
                >
                  <span className="wiring-target-block">{target.block.label}</span>
                  <span className="wiring-target-slot">
                    {target.slot.label}
                    {renderTypeBadges(target.slot.type)}
                  </span>
                  <code className="wiring-target-type">{target.slot.type}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new block (library blocks with compatible ports) */}
        {compatibleLibraryBlocks.length > 0 && (
          <div className="wiring-section">
            <h4>
              Add new block
              <span className="wiring-count">{compatibleLibraryBlocks.length}</span>
            </h4>
            <ul className="wiring-library-list">
              {compatibleLibraryBlocks.map(({ definition: def, slot: targetSlot }) => (
                <li
                  key={`${def.type}:${targetSlot.id}`}
                  className="wiring-library-item"
                  onDoubleClick={() => handleAddAndConnect(def, targetSlot)}
                  title="Double-click to add and connect"
                >
                  <div
                    className="wiring-library-color"
                    style={{ backgroundColor: def.color }}
                  />
                  <span className="wiring-library-block">{def.label}</span>
                  <span className="wiring-library-slot">
                    {targetSlot.label}
                    {renderTypeBadges(targetSlot.type)}
                  </span>
                  <code className="wiring-library-type">{targetSlot.type}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {adapterSuggestions.length > 0 && (
          <div className="wiring-section">
            <h4>Adapter suggestions</h4>
            <p className="wiring-hint">
              These ports share the domain but differ in world (S vs F vs C). Insert an adapter to bridge them.
            </p>
            <ul className="wiring-target-list">
              {adapterSuggestions.map((target) => (
                <li key={`${target.block.id}:${target.slot.id}:${target.adapter.type}`} className="wiring-target-item near-match">
                  <div className="wiring-target-block">{target.block.label}</div>
                  <div className="wiring-target-slot">
                    {target.slot.label}
                    {renderTypeBadges(target.slot.type)}
                  </div>
                  <div className="wiring-target-type">
                    <code>{target.slot.type}</code>
                  </div>
                  <button
                    className="wiring-adapter-btn"
                    onClick={() => handleInsertAdapter(target)}
                  >
                    Insert {target.adapter.label ?? target.adapter.type}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Near matches without adapter */}
        {nearMisses.length > 0 && (
          <div className="wiring-section">
            <h4>Near matches (no adapter yet)</h4>
            <p className="wiring-hint">
              Same domain, different world. Add or create an adapter block to bridge these.
            </p>
            <ul className="wiring-target-list">
              {nearMisses.map((target) => (
                <li key={`${target.block.id}:${target.slot.id}`} className="wiring-target-item near-match">
                  <span className="wiring-target-block">{target.block.label}</span>
                  <span className="wiring-target-slot">
                    {target.slot.label}
                    {renderTypeBadges(target.slot.type)}
                  </span>
                  <code className="wiring-target-type">{target.slot.type}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
    </InspectorContainer>
  );
});

/**
 * Preview display for a block definition (not yet placed).
 * Uses InspectorContainer for consistent styling.
 */
function DefinitionPreview({ definition }: { definition: BlockDefinition }) {
  const store = useStore();

  const handleClose = () => {
    store.uiStore.setPreviewedDefinition(null);
  };

  return (
    <InspectorContainer
      title={definition.label}
      typeCode={definition.type}
      category={definition.subcategory ?? 'Block'}
      color={definition.color}
      onBack={handleClose}
      backLabel="Close Preview"
    >
      {/* Description */}
      {definition.description && (
        <p className="insp-description">{definition.description}</p>
      )}

      {/* Side-by-side Inputs/Outputs */}
      <div className="ports-row">
        <div className="ports-col">
          <span className="ports-header">Inputs</span>
          {definition.inputs.length === 0
            ? <span className="ports-none">None</span>
            : definition.inputs.map(slot => (
                <div key={slot.id} className="port-item">
                  <span className="port-item-label">{slot.label}</span>
                  <span className="port-disconnected-icon">○</span>
                </div>
              ))
          }
        </div>
        <div className="ports-col">
          <span className="ports-header">Outputs</span>
          {definition.outputs.length === 0
            ? <span className="ports-none">None</span>
            : definition.outputs.map(slot => (
                <div key={slot.id} className="port-item">
                  <span className="port-item-label">{slot.label}</span>
                  <span className="port-disconnected-icon">○</span>
                </div>
              ))
          }
        </div>
      </div>

      {/* Parameters preview */}
      {definition.paramSchema.length > 0 && (
        <div className="insp-section">
          <span className="insp-section-title">Parameters</span>
          <div className="param-preview-list">
            {definition.paramSchema.map(param => (
              <div key={param.key} className="param-preview-item">
                <span className="param-preview-key">{param.label}</span>
                <span className="param-preview-type">{param.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="insp-hint">Drag to patch bay to use</p>
    </InspectorContainer>
  );
}

/**
 * Port item with connection indicator and navigation
 * - Green dot (●) = wire connection
 * - Blue dot (●) = bus connection
 * - Hollow dot (○) = not connected
 * - Red/orange indicator for errors/warnings
 */
const PortItem = observer(({
  slot,
  blockId,
  direction,
  connections,
  blocks,
  onNavigate
}: {
  slot: Slot;
  blockId: string;
  direction: 'input' | 'output';
  connections: readonly Connection[];
  blocks: readonly Block[];
  onNavigate: (blockId: string) => void;
}) => {
  const store = useStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const portRef: PortRef = { blockId, slotId: slot.id, direction };

  // Check for diagnostics on this port
  const portDiagnostics = useMemo(() => {
    return store.diagnosticStore.activeDiagnostics.filter(d => {
      if (d.primaryTarget.kind === 'port') {
        const ref = d.primaryTarget.portRef;
        return ref.blockId === blockId && ref.slotId === slot.id && ref.direction === direction;
      }
      // Also check affected targets
      return d.affectedTargets?.some(t =>
        t.kind === 'port' &&
        t.portRef.blockId === blockId &&
        t.portRef.slotId === slot.id &&
        t.portRef.direction === direction
      );
    });
  }, [store.diagnosticStore.activeDiagnostics, blockId, slot.id, direction]);

  const hasError = portDiagnostics.some(d => d.severity === 'error' || d.severity === 'fatal');
  const hasWarning = portDiagnostics.some(d => d.severity === 'warn');

  // Find wire connection for this port
  const wireConnection = connections.find(c =>
    direction === 'input'
      ? (c.to.blockId === blockId && c.to.slotId === slot.id)
      : (c.from.blockId === blockId && c.from.slotId === slot.id)
  );

  // Find bus connection for this port
  const busConnection = direction === 'input'
    ? store.busStore.listeners.find(l => l.to.blockId === blockId && l.to.slotId === slot.id)
    : store.busStore.publishers.find(p => p.from.blockId === blockId && p.from.slotId === slot.id);

  const connectedBus = busConnection
    ? store.busStore.buses.find(b => b.id === busConnection.busId)
    : null;

  const connectedBlockId = wireConnection
    ? (direction === 'input' ? wireConnection.from.blockId : wireConnection.to.blockId)
    : null;
  const connectedBlock = connectedBlockId
    ? blocks.find(b => b.id === connectedBlockId)
    : null;

  const handleClick = useCallback(() => {
    store.uiStore.setSelectedPort(portRef);
  }, [store, portRef]);

  const handleDoubleClick = useCallback(() => {
    if (connectedBlockId) {
      onNavigate(connectedBlockId);
    } else if (connectedBus) {
      store.uiStore.selectBus(connectedBus.id);
    }
  }, [onNavigate, connectedBlockId, connectedBus, store]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    if (wireConnection) {
      store.patchStore.disconnect(wireConnection.id);
    }
    if (busConnection) {
      if (direction === 'input') {
        store.busStore.removeListener(busConnection.id);
      } else {
        store.busStore.removePublisher(busConnection.id);
      }
    }
    closeContextMenu();
  }, [wireConnection, busConnection, store, direction, closeContextMenu]);

  const handleGoToBlock = useCallback(() => {
    if (connectedBlockId) onNavigate(connectedBlockId);
    closeContextMenu();
  }, [connectedBlockId, onNavigate, closeContextMenu]);

  const handleGoToBus = useCallback(() => {
    if (connectedBus) store.uiStore.selectBus(connectedBus.id);
    closeContextMenu();
  }, [connectedBus, store, closeContextMenu]);

  const isSelected = store.uiStore.uiState.selectedPort?.blockId === blockId &&
                     store.uiStore.uiState.selectedPort?.slotId === slot.id &&
                     store.uiStore.uiState.selectedPort?.direction === direction;

  // Determine icon and color
  let iconClass = 'port-disconnected-icon';
  let icon = '○';
  let title = 'Not connected (click to wire, right-click for options)';

  if (wireConnection) {
    iconClass = 'port-wire-icon';
    icon = '●';
    title = `Wire: ${connectedBlock?.label ?? 'Unknown'}`;
  } else if (busConnection) {
    iconClass = 'port-bus-icon';
    icon = '●';
    title = `Bus: ${connectedBus?.name ?? busConnection.busId}`;
  }

  if (wireConnection && busConnection) {
    title = `Wire: ${connectedBlock?.label ?? 'Unknown'} + Bus: ${connectedBus?.name ?? busConnection.busId}`;
  }

  // Build class name for port item
  const portItemClass = [
    'port-item',
    isSelected ? 'selected' : '',
    hasError ? 'has-error' : '',
    hasWarning ? 'has-warning' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={portItemClass}>
      <span className="port-item-label">{slot.label}</span>
      {/* Error/warning indicator */}
      {hasError && (
        <span className="port-error-icon" title={portDiagnostics.find(d => d.severity === 'error' || d.severity === 'fatal')?.title}>
          ⚠
        </span>
      )}
      {!hasError && hasWarning && (
        <span className="port-warning-icon" title={portDiagnostics.find(d => d.severity === 'warn')?.title}>
          ⚠
        </span>
      )}
      <span
        className={iconClass}
        title={title}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {icon}
      </span>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="port-context-backdrop" onClick={closeContextMenu} />
          <div
            className="port-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="port-context-header">{slot.label}</div>
            {wireConnection && (
              <>
                <button className="port-context-item" onClick={handleGoToBlock}>
                  Go to: {connectedBlock?.label ?? 'Block'}
                </button>
                <button className="port-context-item danger" onClick={handleDisconnect}>
                  Disconnect wire
                </button>
              </>
            )}
            {busConnection && (
              <>
                <button className="port-context-item" onClick={handleGoToBus}>
                  Go to bus: {connectedBus?.name ?? busConnection.busId}
                </button>
                <button className="port-context-item danger" onClick={handleDisconnect}>
                  Remove bus {direction === 'input' ? 'listener' : 'publisher'}
                </button>
              </>
            )}
            {!wireConnection && !busConnection && (
              <div className="port-context-empty">No connections</div>
            )}
            <button className="port-context-item" onClick={() => { handleClick(); closeContextMenu(); }}>
              Open wiring panel
            </button>
          </div>
        </>
      )}
    </div>
  );
});

/**
 * Compatible blocks section - shows blocks that can replace the current one
 */
const CompatibleBlocksSection = observer(({ block }: { block: Block }) => {
  const store = useStore();
  const [expanded, setExpanded] = useState(false);

  const compatibleBlocks = useMemo(() => {
    const results: BlockDefinition[] = [];
    for (const def of getBlockDefinitions()) {
      if (def.type === block.type) continue;
      if (def.type.startsWith('macro:')) continue;
      if (getPortCompatibility(block, def)) {
        results.push(def);
      }
    }
    return results.sort((a, b) => a.label.localeCompare(b.label));
  }, [block.type, block.inputs, block.outputs]);

  const handleReplace = useCallback((newDef: BlockDefinition) => {
    const incoming = store.patchStore.connections.filter(c => c.to.blockId === block.id);
    const outgoing = store.patchStore.connections.filter(c => c.from.blockId === block.id);
    const lane = store.viewStore.lanes.find(l => l.blockIds.includes(block.id));
    if (!lane) return;

    const savedIn = incoming.map(c => ({ from: c.from.blockId, fromSlot: c.from.slotId, toSlot: c.to.slotId }));
    const savedOut = outgoing.map(c => ({ to: c.to.blockId, toSlot: c.to.slotId, fromSlot: c.from.slotId }));

    store.patchStore.removeBlock(block.id);
    const newId = store.patchStore.addBlock(newDef.type, newDef.defaultParams);

    for (const c of savedIn) {
      const newBlock = store.patchStore.blocks.find(b => b.id === newId);
      if (newBlock?.inputs.find(i => i.id === c.toSlot)) {
        store.patchStore.connect(c.from, c.fromSlot, newId, c.toSlot);
      }
    }
    for (const c of savedOut) {
      const newBlock = store.patchStore.blocks.find(b => b.id === newId);
      if (newBlock?.outputs.find(o => o.id === c.fromSlot)) {
        store.patchStore.connect(newId, c.fromSlot, c.to, c.toSlot);
      }
    }
    store.uiStore.selectBlock(newId);
  }, [block, store]);

  if (compatibleBlocks.length === 0) return null;

  return (
    <div className="insp-section">
      <div className="insp-section-header" onClick={() => setExpanded(!expanded)}>
        <span className="insp-section-title">Replace</span>
        <span className="insp-count">{compatibleBlocks.length}</span>
        <span className="insp-toggle">{expanded ? '−' : '+'}</span>
      </div>
      {expanded && (
        <div className="replace-list">
          {compatibleBlocks.map(def => (
            <div
              key={def.type}
              className="replace-item"
              onDoubleClick={() => handleReplace(def)}
              title="Double-click to replace"
            >
              <span className="replace-color" style={{ background: def.color }} />
              <span className="replace-label">{def.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * Bus tag component with click/right-click actions
 */
const BusTag = observer(({
  busId,
  connectionId,
  direction,
  className,
}: {
  busId: string;
  connectionId: string;
  direction: 'publish' | 'listen';
  className: string;
}) => {
  const store = useStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const bus = store.busStore.buses.find(b => b.id === busId);
  const busName = bus?.name ?? busId;

  const handleClick = useCallback(() => {
    store.uiStore.selectBus(busId);
  }, [store, busId]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleRemove = useCallback(() => {
    if (direction === 'publish') {
      store.busStore.removePublisher(connectionId);
    } else {
      store.busStore.removeListener(connectionId);
    }
    closeContextMenu();
  }, [store, connectionId, direction, closeContextMenu]);

  const handleGoToBus = useCallback(() => {
    store.uiStore.selectBus(busId);
    closeContextMenu();
  }, [store, busId, closeContextMenu]);

  return (
    <>
      <span
        className={className}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={`Click to inspect "${busName}" bus, right-click for options`}
      >
        {busName}
      </span>
      {contextMenu && (
        <>
          <div className="port-context-backdrop" onClick={closeContextMenu} />
          <div
            className="port-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="port-context-header">Bus: {busName}</div>
            <button className="port-context-item" onClick={handleGoToBus}>
              Inspect bus
            </button>
            <button className="port-context-item danger" onClick={handleRemove}>
              Remove {direction === 'publish' ? 'publisher' : 'listener'}
            </button>
          </div>
        </>
      )}
    </>
  );
});

/**
 * Bus connections section - shows bus publishers and listeners for a block
 * Click to inspect bus, right-click for options
 */
const BusConnectionsSection = observer(({ block }: { block: Block }) => {
  const store = useStore();

  // Find bus publications from this block
  const publications = store.busStore.publishers.filter(p => p.from.blockId === block.id);
  // Find bus subscriptions to this block
  const subscriptions = store.busStore.listeners.filter(l => l.to.blockId === block.id);

  if (publications.length === 0 && subscriptions.length === 0) return null;

  return (
    <div className="insp-section">
      <span className="insp-section-title">Buses</span>
      {publications.length > 0 && (
        <div className="bus-group">
          <span className="bus-direction">Publishes to:</span>
          {publications.map(p => (
            <BusTag
              key={p.id}
              busId={p.busId}
              connectionId={p.id}
              direction="publish"
              className="bus-tag publish"
            />
          ))}
        </div>
      )}
      {subscriptions.length > 0 && (
        <div className="bus-group">
          <span className="bus-direction">Listens to:</span>
          {subscriptions.map(l => (
            <BusTag
              key={l.id}
              busId={l.busId}
              connectionId={l.id}
              direction="listen"
              className="bus-tag listen"
            />
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * Render a control for editing a DefaultSource value based on its uiHint.
 */
function DefaultSourceControl({
  ds,
  isDriven,
  onChange,
}: {
  ds: DefaultSourceState;
  isDriven: boolean;
  onChange: (value: unknown) => void;
}) {
  const uiHint = ds.uiHint;

  // Slider control
  if (uiHint?.kind === 'slider') {
    return (
      <input
        type="range"
        className="param-input"
        min={uiHint.min}
        max={uiHint.max}
        step={uiHint.step}
        value={typeof ds.value === 'number' ? ds.value : 0}
        disabled={isDriven}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    );
  }

  // Number control
  if (uiHint?.kind === 'number' || typeof ds.value === 'number') {
    const min = uiHint?.kind === 'number' ? uiHint.min : undefined;
    const max = uiHint?.kind === 'number' ? uiHint.max : undefined;
    const step = uiHint?.kind === 'number' ? uiHint.step : 0.1;
    return (
      <input
        type="number"
        className="param-input"
        min={min}
        max={max}
        step={step}
        value={typeof ds.value === 'number' ? ds.value : 0}
        disabled={isDriven}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    );
  }

  // Select control
  if (uiHint?.kind === 'select') {
    return (
      <select
        className="param-input"
        value={String(ds.value)}
        disabled={isDriven}
        onChange={(e) => onChange(e.target.value)}
      >
        {uiHint.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  // Color control
  if (uiHint?.kind === 'color') {
    return (
      <input
        type="color"
        className="param-input"
        value={String(ds.value || '#000000')}
        disabled={isDriven}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Boolean control
  if (uiHint?.kind === 'boolean' || typeof ds.value === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(ds.value)}
        disabled={isDriven}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  // XY control (vec2)
  if (uiHint?.kind === 'xy') {
    const value = ds.value as { x?: number; y?: number } | undefined;
    const x = value?.x ?? 0;
    const y = value?.y ?? 0;
    return (
      <div className="param-xy">
        <input
          type="number"
          className="param-input"
          placeholder="x"
          value={x}
          disabled={isDriven}
          onChange={(e) => onChange({ x: parseFloat(e.target.value) || 0, y })}
        />
        <input
          type="number"
          className="param-input"
          placeholder="y"
          value={y}
          disabled={isDriven}
          onChange={(e) => onChange({ x, y: parseFloat(e.target.value) || 0 })}
        />
      </div>
    );
  }

  // Text fallback
  return (
    <input
      type="text"
      className="param-input"
      value={String(ds.value ?? '')}
      disabled={isDriven}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Diagnostics section - shows errors and warnings for a block
 */
const DiagnosticsSection = observer(({ block }: { block: Block }) => {
  const store = useStore();

  // Get diagnostics for this block (including port-level)
  const blockDiagnostics = useMemo(() => {
    return store.diagnosticStore.activeDiagnostics.filter(d => {
      // Block-level diagnostics
      if (d.primaryTarget.kind === 'block' && d.primaryTarget.blockId === block.id) {
        return true;
      }
      // Port-level diagnostics on this block
      if (d.primaryTarget.kind === 'port' && d.primaryTarget.portRef.blockId === block.id) {
        return true;
      }
      // Check affected targets
      return d.affectedTargets?.some(t =>
        (t.kind === 'block' && t.blockId === block.id) ||
        (t.kind === 'port' && t.portRef.blockId === block.id)
      );
    });
  }, [store.diagnosticStore.activeDiagnostics, block.id]);

  const errors = blockDiagnostics.filter(d => d.severity === 'error' || d.severity === 'fatal');
  const warnings = blockDiagnostics.filter(d => d.severity === 'warn');

  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="insp-section diagnostics-section">
      <span className="insp-section-title">
        Diagnostics
        {errors.length > 0 && <span className="diag-badge error">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>}
        {warnings.length > 0 && <span className="diag-badge warning">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>}
      </span>
      <div className="diagnostics-list">
        {errors.map(d => (
          <div key={d.id} className="diagnostic-item error">
            <span className="diagnostic-icon">⚠</span>
            <div className="diagnostic-content">
              <span className="diagnostic-title">{d.title}</span>
              <span className="diagnostic-message">{d.message}</span>
            </div>
          </div>
        ))}
        {warnings.map(d => (
          <div key={d.id} className="diagnostic-item warning">
            <span className="diagnostic-icon">⚠</span>
            <div className="diagnostic-content">
              <span className="diagnostic-title">{d.title}</span>
              <span className="diagnostic-message">{d.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Default Sources section - shows editable controls for undriven inputs
 * Priority: Wire > Bus Listener > DefaultSource
 * Only show controls when input is NOT driven (no wire, no bus)
 */
const DefaultSourcesSection = observer(({ block }: { block: Block }) => {
  const store = useStore();
  const connections = store.patchStore.connections;
  const listeners = store.busStore.listeners;

  // Find inputs that have default sources
  const inputsWithDefaults = useMemo(() => {
    const results: Array<{
      slot: Slot;
      ds: DefaultSourceState;
      isDriven: boolean;
    }> = [];

    for (const slot of block.inputs) {
      const ds = store.defaultSourceStore.getDefaultSourceForInput(block.id, slot.id);
      if (!ds) continue;

      const driven = isInputDriven(block.id, slot.id, connections, listeners);
      results.push({ slot, ds, isDriven: driven });
    }

    return results;
  }, [block.id, block.inputs, connections, listeners, store.defaultSourceStore.sources]);

  // Only show if there are any default sources
  if (inputsWithDefaults.length === 0) return null;

  const handleChange = (blockId: string, slotId: string, value: unknown) => {
    store.defaultSourceStore.setDefaultValueForInput(blockId, slotId, value);
  };

  // Separate into primary (undriven) and secondary (driven) sections
  const undrivenInputs = inputsWithDefaults.filter((i) => !i.isDriven);
  const drivenInputs = inputsWithDefaults.filter((i) => i.isDriven);

  return (
    <div className="insp-section">
      <span className="insp-section-title">
        Default Values
        {undrivenInputs.length > 0 && (
          <span className="insp-count">{undrivenInputs.length} active</span>
        )}
      </span>

      {/* Active (undriven) inputs - editable */}
      {undrivenInputs.length > 0 && (
        <div className="param-grid">
          {undrivenInputs.map(({ slot, ds }) => (
            <div key={slot.id} className="param-row">
              <label className="param-key">{slot.label}</label>
              <DefaultSourceControl
                ds={ds}
                isDriven={false}
                onChange={(val) => handleChange(block.id, slot.id, val)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Driven inputs - show what's overriding them */}
      {drivenInputs.length > 0 && undrivenInputs.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #252525' }}>
          <span className="insp-section-title" style={{ fontSize: 8, color: '#444' }}>
            Overridden by wire/bus
          </span>
        </div>
      )}
      {drivenInputs.length > 0 && (
        <div className="param-grid" style={{ marginTop: 4 }}>
          {drivenInputs.map(({ slot, ds }) => (
            <div key={slot.id} className="param-row param-row-driven">
              <label className="param-key">
                {slot.label}
                <span className="driven-badge">driven</span>
              </label>
              <DefaultSourceControl
                ds={ds}
                isDriven={true}
                onChange={() => {}}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// New BlockInspectorWiringPanel
const BlockInspectorWiringPanel = observer(({
  sourcePortRef,
  sourcePortBlock,
  sourcePortSlot,
}: {
  sourcePortRef: PortRef;
  sourcePortBlock: Block;
  sourcePortSlot: Slot;
}) => {
  const store = useStore();

  const compatibleTargets = findCompatiblePorts(
    sourcePortRef,
    sourcePortSlot,
    store.patchStore.blocks,
    store.patchStore.connections
  );

  const handleConnect = useCallback((target: { block: Block; slot: Slot; portRef: PortRef }) => {
    // Logic from PortWiringPanel's handleConnect
    if (sourcePortRef.direction === 'output') {
      // Current port is output, target is input
      store.patchStore.connect(sourcePortRef.blockId, sourcePortRef.slotId, target.portRef.blockId, target.portRef.slotId);
    } else {
      // Current port is input, target is output
      // Remove existing connections to this input port first
      const existing = getConnectionsForPort(sourcePortRef.blockId, sourcePortRef.slotId, 'input', store.patchStore.connections);
      for (const conn of existing) {
        store.patchStore.disconnect(conn.id);
      }
      store.patchStore.connect(target.portRef.blockId, target.portRef.slotId, sourcePortRef.blockId, sourcePortRef.slotId);
    }
    store.uiStore.setSelectedPort(null); // Clear selection after connecting
  }, [store, sourcePortRef, sourcePortBlock.id, sourcePortSlot.id]);

  const handleCancel = useCallback(() => {
    store.uiStore.setSelectedPort(null); // Clear selection
  }, [store]);

  const renderTypeBadges = (type: Slot['type']) => {
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
      <span className="port-badges">
        {worldBadge && <span className={`port-badge world ${desc.world}`}>{worldBadge}</span>}
        {desc.domain && <span className="port-badge domain">{desc.domain}</span>}
      </span>
    );
  };

  const blockColor = getBlockDefinition(sourcePortBlock.type)?.color ?? '#666';


  return (
    <div className="inspector insp-compact wiring-suggestions-panel">
      <div className="insp-header" style={{ borderLeftColor: blockColor }}>
        <div className="insp-title-row">
          <span className="insp-title">{sourcePortSlot.label}</span>
          <span className="insp-category" style={{ background: blockColor }}>
            {sourcePortRef.direction === 'input' ? 'Input' : 'Output'} Port
          </span>
        </div>
        <code className="insp-type">{sourcePortSlot.type}</code>
      </div>

      <div className="insp-body">
        <div className="insp-section">
          <span className="insp-section-title">
            {sourcePortRef.direction === 'output' ? 'Compatible Inputs' : 'Compatible Outputs'}
          </span>
          {compatibleTargets.length === 0 ? (
            <p className="insp-hint">No compatible ports found.</p>
          ) : (
            <ul className="wiring-target-list">
              {compatibleTargets.map((target) => (
                <li
                  key={`${target.block.id}:${target.slot.id}`}
                  className="wiring-target-item"
                  onClick={() => handleConnect(target)}
                  title={`Connect to ${target.block.label}.${target.slot.label}`}
                >
                  <span className="wiring-target-block">{target.block.label}</span>
                  <span className="wiring-target-slot">
                    {target.slot.label}
                    {renderTypeBadges(target.slot.type)}
                  </span>
                  <code className="wiring-target-type">{target.slot.type}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="insp-cancel-btn" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
});

/**
 * Inspector displays and edits parameters of selected block.
 * Compact, Ableton-style layout.
 */
export const Inspector = observer(() => {
  const store = useStore();
  const block = store.selectedBlock;
  const selectedBus = store.selectedBus;
  const previewedDefinition = store.uiStore.previewedDefinition;
  const selectedPortInfo = store.selectedPortInfo;
  const selectedConnection = store.uiStore.uiState.selectedConnection;

  const navigateToBlock = useCallback((blockId: string) => {
    store.uiStore.selectBlock(blockId);
  }, [store]);

  // Show connection inspector if a connection is selected
  if (selectedConnection) {
    return <ConnectionInspector />;
  }

  // Show bus inspector if a bus is selected
  if (selectedBus) {
    return <BusInspector busId={selectedBus.id} />;
  }

  // Show port wiring panel if a port is selected
  if (selectedPortInfo) {
    return (
      <PortWiringPanel
        portRef={store.uiStore.uiState.selectedPort!}
        block={selectedPortInfo.block}
        slot={selectedPortInfo.slot}
      />
    );
  }

  // Show previewed definition if no block is selected
  if (!block && previewedDefinition) {
    return <DefinitionPreview definition={previewedDefinition} />;
  }

  if (!block) {
    return (
      <InspectorContainer
        title="Inspector"
        color="#666"
      >
        <div className="inspector-empty">
          <p>No block selected</p>
        </div>
      </InspectorContainer>
    );
  }

  const definition = getBlockDefinition(block.type);
  const blockColor = definition?.color ?? '#666';

  const handleDeselectBlock = () => {
    store.uiStore.deselectBlock();
  };

  return (
    <InspectorContainer
      title={block.label}
      typeCode={block.type}
      category={block.category}
      color={blockColor}
      onBack={handleDeselectBlock}
      backLabel="Deselect"
    >
                  {/* Wiring Panel for selected port on current block */}
                  {store.uiStore.uiState.selectedPort &&
                   store.uiStore.uiState.selectedPort.blockId === block.id ? (
                    <BlockInspectorWiringPanel
                      sourcePortRef={store.uiStore.uiState.selectedPort}
                      sourcePortBlock={block}
                      sourcePortSlot={block.inputs.find(s => s.id === store.uiStore.uiState.selectedPort?.slotId) || block.outputs.find(s => s.id === store.uiStore.uiState.selectedPort?.slotId)!}
                    />
                  ) : (
                    <>
                      {/* Original content of Block Inspector */}
                      {/* Side-by-side Inputs/Outputs */}
                      <div className="ports-row">
                        <div className="ports-col">
                          <span className="ports-header">Inputs</span>
                          {block.inputs.length === 0
                            ? <span className="ports-none">None</span>
                            : block.inputs.map(slot => (
                                <PortItem
                                  key={slot.id}
                                  slot={slot}
                                  blockId={block.id}
                                  direction="input"
                                  connections={store.patchStore.connections}
                                  blocks={store.patchStore.blocks}
                                  onNavigate={navigateToBlock}
                                />
                              ))
                          }
                        </div>
                        <div className="ports-col">
                          <span className="ports-header">Outputs</span>
                          {block.outputs.length === 0
                            ? <span className="ports-none">None</span>
                            : block.outputs.map(slot => (
                                <PortItem
                                  key={slot.id}
                                  slot={slot}
                                  blockId={block.id}
                                  direction="output"
                                  connections={store.patchStore.connections}
                                  blocks={store.patchStore.blocks}
                                  onNavigate={navigateToBlock}
                                />
                              ))
                          }
                        </div>
                      </div>

                      {/* Diagnostics - show errors/warnings first */}
                      <DiagnosticsSection block={block} />

                      {/* Bus connections - show first for visibility */}
                      <BusConnectionsSection block={block} />

                      {/* Default Sources - editable when not driven */}
                      <DefaultSourcesSection block={block} />

                      {/* Compatible replacement blocks */}
                      <CompatibleBlocksSection block={block} />

                      {/* Delete */}
                      <button
                        className="insp-delete"
                        onClick={() => store.patchStore.removeBlock(block.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
    </InspectorContainer>
  );
});
