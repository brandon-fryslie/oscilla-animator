/**
 * Inspector Component
 *
 * Property editor for selected block (right panel).
 * Also shows block definition preview when clicking unplaced blocks.
 */

import { useState, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import type { PortRef, Block, Slot, Connection } from './types';
import { getBlockDefinition, getBlockDefinitions, type BlockDefinition } from './blocks';
import { findCompatiblePorts, getConnectionsForPort, areTypesCompatible, describeSlotType, formatSlotType, slotCompatibilityHint } from './portUtils';
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
    () => getBlockDefinitions().filter((d) => d.category === 'Adapters'),
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

  // Get existing connections for this port
  const existingConnections = getConnectionsForPort(
    portRef.blockId,
    portRef.slotId,
    portRef.direction,
    store.patchStore.connections
  );

  const handleConnect = (target: { block: Block; slot: Slot; portRef: PortRef }) => {
    if (portRef.direction === 'output') {
      // This port is output, target is input
      store.patchStore.connect(portRef.blockId, portRef.slotId, target.portRef.blockId, target.portRef.slotId);
    } else {
      // This port is input, target is output
      store.patchStore.connect(target.portRef.blockId, target.portRef.slotId, portRef.blockId, portRef.slotId);
    }
    // Clear selection after connecting
    store.uiStore.setSelectedPort(null);
  };

  /**
   * Add a library block to its suggested lane and connect to the selected port.
   */
  const handleAddAndConnect = (def: BlockDefinition, targetSlot: Slot) => {
    // Find the suggested lane
    const targetLane = store.patchStore.lanes.find((lane) => lane.kind === def.laneKind);
    if (!targetLane) return;

    // Add the block
    const newBlockId = store.patchStore.addBlock(def.type, targetLane.id, def.defaultParams);

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

  const findLaneIdForBlock = (blockId: string): string | null => {
    const lane = store.patchStore.lanes.find((l) => l.blockIds.includes(blockId));
    return lane?.id ?? null;
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
    // Determine lane to place adapter
    const laneByKind = store.patchStore.lanes.find((l) => l.kind === suggestion.adapter.laneKind);
    const laneOfTarget = findLaneIdForBlock(suggestion.block.id);
    const laneFallback = store.patchStore.lanes[0]?.id ?? null;
    const laneId = laneByKind?.id ?? laneOfTarget ?? laneFallback;
    if (!laneId) return;

    // Guard against overwriting occupied inputs
    if (portRef.direction === 'output' && isInputOccupied(suggestion.block.id, suggestion.slot.id)) {
      return;
    }
    if (portRef.direction === 'input' && isInputOccupied(portRef.blockId, portRef.slotId)) {
      return;
    }

    const adapterId = store.patchStore.addBlock(
      suggestion.adapter.type,
      laneId,
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

  return (
    <div className="port-wiring-panel">
      <div className="wiring-panel-header" style={{ borderLeftColor: blockColor }}>
        <div className="wiring-panel-title">
          <span className="wiring-port-direction">
            {portRef.direction === 'input' ? '← Input' : 'Output →'}
          </span>
          <h3>{slot.label}</h3>
        </div>
      </div>

      <div className="wiring-panel-body">
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

        {/* Existing connections */}
        {existingConnections.length > 0 && (
          <div className="wiring-section">
            <h4>Connected to</h4>
            <ul className="wiring-connection-list">
              {existingConnections.map((conn) => {
                const otherBlockId = portRef.direction === 'output' ? conn.to.blockId : conn.from.blockId;
                const otherSlotId = portRef.direction === 'output' ? conn.to.slotId : conn.from.slotId;
                const otherBlock = store.patchStore.blocks.find((b) => b.id === otherBlockId);
                const otherSlots = portRef.direction === 'output' ? otherBlock?.inputs : otherBlock?.outputs;
                const otherSlot = otherSlots?.find((s) => s.id === otherSlotId);

                return (
                  <li key={conn.id} className="wiring-connection-item">
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
      </div>
    </div>
  );
});

/**
 * Preview display for a block definition (not yet placed).
 * Uses compact styling consistent with placed block inspector.
 */
function DefinitionPreview({ definition }: { definition: BlockDefinition }) {
  return (
    <div className="inspector insp-compact">
      <div className="insp-header" style={{ borderLeftColor: definition.color }}>
        <div className="insp-title-row">
          <span className="insp-title">{definition.label}</span>
          <span className="insp-category" style={{ background: definition.color }}>{definition.category}</span>
        </div>
        <code className="insp-type">{definition.type}</code>
      </div>

      <div className="insp-body">
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
      </div>
    </div>
  );
}

/**
 * Port item with connection indicator and navigation
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
  // Find connection for this port
  const connection = connections.find(c =>
    direction === 'input'
      ? (c.to.blockId === blockId && c.to.slotId === slot.id)
      : (c.from.blockId === blockId && c.from.slotId === slot.id)
  );

  const connectedBlockId = connection
    ? (direction === 'input' ? connection.from.blockId : connection.to.blockId)
    : null;
  const connectedBlock = connectedBlockId
    ? blocks.find(b => b.id === connectedBlockId)
    : null;

  return (
    <div className="port-item">
      <span className="port-item-label">{slot.label}</span>
      {connection ? (
        <span
          className="port-connected-icon"
          title={`Connected to: ${connectedBlock?.label ?? 'Unknown'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (connectedBlockId) onNavigate(connectedBlockId);
          }}
        >
          ●
        </span>
      ) : (
        <span className="port-disconnected-icon" title="Not connected">○</span>
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
      if (def.form === 'macro') continue;
      if (getPortCompatibility(block, def)) {
        results.push(def);
      }
    }
    return results.sort((a, b) => a.label.localeCompare(b.label));
  }, [block.type, block.inputs, block.outputs]);

  const handleReplace = useCallback((newDef: BlockDefinition) => {
    const incoming = store.patchStore.connections.filter(c => c.to.blockId === block.id);
    const outgoing = store.patchStore.connections.filter(c => c.from.blockId === block.id);
    const lane = store.patchStore.lanes.find(l => l.blockIds.includes(block.id));
    if (!lane) return;

    const savedIn = incoming.map(c => ({ from: c.from.blockId, fromSlot: c.from.slotId, toSlot: c.to.slotId }));
    const savedOut = outgoing.map(c => ({ to: c.to.blockId, toSlot: c.to.slotId, fromSlot: c.from.slotId }));

    store.patchStore.removeBlock(block.id);
    const newId = store.patchStore.addBlock(newDef.type, lane.id, newDef.defaultParams);

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
 * Bus connections section
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
          <span className="bus-direction">Publishes:</span>
          {publications.map(p => (
            <span key={p.id} className="bus-tag publish">{p.busId}</span>
          ))}
        </div>
      )}
      {subscriptions.length > 0 && (
        <div className="bus-group">
          <span className="bus-direction">Listens:</span>
          {subscriptions.map(l => (
            <span key={l.id} className="bus-tag listen">{l.busId}</span>
          ))}
        </div>
      )}
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
  const previewedDefinition = store.uiStore.previewedDefinition;
  const selectedPortInfo = store.selectedPortInfo;

  const navigateToBlock = useCallback((blockId: string) => {
    store.uiStore.selectBlock(blockId);
  }, [store]);

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
      <div className="inspector insp-compact">
        <div className="inspector-empty">
          <p>No block selected</p>
        </div>
      </div>
    );
  }

  const definition = getBlockDefinition(block.type);
  const blockColor = definition?.color ?? '#666';

  return (
    <div className="inspector insp-compact">
      {/* Compact header */}
      <div className="insp-header" style={{ borderLeftColor: blockColor }}>
        <div className="insp-title-row">
          <span className="insp-title">{block.label}</span>
          <span className="insp-category" style={{ background: blockColor }}>{block.category}</span>
        </div>
        <code className="insp-type">{block.type}</code>
      </div>

      <div className="insp-body">
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

        {/* Parameters */}
        {Object.keys(block.params).length > 0 && (
          <div className="insp-section">
            <span className="insp-section-title">Parameters</span>
            <div className="param-grid">
              {Object.entries(block.params).map(([key, value]) => {
                const schema = definition?.paramSchema.find(s => s.key === key);
                const label = schema?.label ?? key;
                return (
                  <div key={key} className="param-row">
                    <label className="param-key">{label}</label>
                    {schema?.type === 'select' && schema.options ? (
                      <select
                        className="param-input"
                        value={String(value)}
                        onChange={e => store.patchStore.updateBlockParams(block.id, { [key]: e.target.value })}
                      >
                        {schema.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : typeof value === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={e => store.patchStore.updateBlockParams(block.id, { [key]: e.target.checked })}
                      />
                    ) : typeof value === 'number' ? (
                      <input
                        type="number"
                        className="param-input"
                        value={value}
                        step={schema?.step ?? (value < 1 ? 0.1 : 1)}
                        min={schema?.min}
                        max={schema?.max}
                        onChange={e => store.patchStore.updateBlockParams(block.id, { [key]: parseFloat(e.target.value) || 0 })}
                      />
                    ) : (
                      <input
                        type="text"
                        className="param-input"
                        value={String(value)}
                        onChange={e => store.patchStore.updateBlockParams(block.id, { [key]: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bus connections */}
        <BusConnectionsSection block={block} />

        {/* Compatible replacement blocks */}
        <CompatibleBlocksSection block={block} />

        {/* Delete */}
        <button
          className="insp-delete"
          onClick={() => store.patchStore.removeBlock(block.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
});
