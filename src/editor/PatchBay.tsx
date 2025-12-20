/**
 * PatchBay Component
 *
 * Visual representation of the lane-based patch bay.
 * Displays lanes with blocks and connections.
 * Lanes are drop targets for blocks from the library.
 *
 * Per lanes-overview.md:
 * - Lanes represent value domains (not timeline tracks)
 * - Chain lanes: left-to-right pipeline
 * - Patchbay lanes: fan-out sources
 */

import { observer } from 'mobx-react-lite';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useStore } from './stores';
import type { Lane, LaneKind, Block, Slot, PortRef } from './types';
import { getBlockDefinition } from './blocks';
import { LayoutSelector } from './LayoutSelector';
import { BlockContextMenu } from './BlockContextMenu';
import {
  buildPortColorMap,
  getPortColor,
  isPortConnected,
  areTypesCompatible,
  describeSlotType,
  formatTypeDescriptor,
} from './portUtils';
import './PatchBay.css';

/**
 * Lane colors by kind for visual identification.
 */
const LANE_KIND_COLORS: Record<LaneKind, string> = {
  Scene: '#4a9eff',     // Blue - what exists
  Phase: '#22c55e',     // Green - timing
  Fields: '#a855f7',    // Purple - per-element
  Scalars: '#f59e0b',   // Amber - constants
  Spec: '#ec4899',      // Pink - intent
  Program: '#ef4444',   // Red - behavior
  Output: '#6366f1',    // Indigo - export
};

/**
 * Port component - renders an input or output connection point.
 */
function Port({
  slot,
  blockId,
  direction,
  connectionColor,
  isConnected,
  isHovered,
  isSelected,
  isCompatible,
  onHover,
  onClick,
  onContextMenu,
}: {
  slot: Slot;
  blockId: string;
  direction: 'input' | 'output';
  connectionColor: string | null;
  isConnected: boolean;
  isHovered: boolean;
  isSelected: boolean;
  isCompatible: boolean;
  onHover: (port: PortRef | null) => void;
  onClick: (port: PortRef) => void;
  onContextMenu: (e: React.MouseEvent, port: PortRef) => void;
}) {
  const portRef: PortRef = { blockId, slotId: slot.id, direction };
  const typeDescriptor = describeSlotType(slot.type);
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
  const worldBadge = worldGlyph[typeDescriptor.world] ?? null;
  const domainBadge = typeDescriptor.domain;

  const handleMouseEnter = () => onHover(portRef);
  const handleMouseLeave = () => onHover(null);
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(portRef);
  };
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, portRef);
  };

  // Determine port styling
  let portStyle: React.CSSProperties = {};
  if (connectionColor) {
    portStyle.backgroundColor = connectionColor;
    portStyle.borderColor = connectionColor;
  }
  if (isCompatible && !isConnected) {
    portStyle.boxShadow = '0 0 8px 2px rgba(74, 222, 128, 0.6)';
  }

  const className = [
    'port',
    direction,
    isConnected ? 'connected' : '',
    isHovered ? 'hovered' : '',
    isSelected ? 'selected' : '',
    isCompatible ? 'compatible' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      style={portStyle}
      title={`${slot.label} (${slot.type}) · ${formatTypeDescriptor(typeDescriptor)}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <span className="port-badges">
        {worldBadge && <span className={`port-badge world ${typeDescriptor.world}`}>{worldBadge}</span>}
        {domainBadge && <span className="port-badge domain">{domainBadge}</span>}
      </span>
      <span className="port-label">{slot.label}</span>
    </div>
  );
}

/**
 * Draggable block in a lane.
 * Can be reordered within lane, moved to another lane, or dragged to trash.
 * Shows input/output ports for wiring.
 */
const DraggablePatchBlock = observer(({
  block,
  laneId,
  index,
  laneColor,
  isSelected,
  onSelect,
  portColorMap,
}: {
  block: Block;
  laneId: string;
  index: number;
  laneColor: string;
  isSelected: boolean;
  onSelect: () => void;
  portColorMap: Map<string, string>;
}) => {
  const store = useStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `patch-block-${block.id}`,
    data: {
      type: 'patch-block',
      blockId: block.id,
      sourceLaneId: laneId,
      sourceIndex: index,
    },
  });

  const { setNodeRef: setDropRef, isOver: isOverDropTarget } = useDroppable({
    id: `patch-target-${block.id}`,
    data: {
      type: 'patch-target',
      blockId: block.id,
      laneId,
      index,
    },
  });

  const setRefs = (node: HTMLElement | null) => {
    setNodeRef(node);
    setDropRef(node);
  };

  const definition = getBlockDefinition(block.type);
  const blockColor = definition?.color ?? laneColor;

  // Get hovered/selected port state
  const hoveredPort = store.uiStore.uiState.hoveredPort;
  const selectedPort = store.uiStore.uiState.selectedPort;
  const connections = store.patchStore.connections;

  // Check if we need to highlight compatible ports
  const sourcePort = hoveredPort ?? selectedPort;
  const sourceSlot = sourcePort
    ? (() => {
        const sourceBlock = store.patchStore.blocks.find((b) => b.id === sourcePort.blockId);
        if (!sourceBlock) return null;
        const slots =
          sourcePort.direction === 'input' ? sourceBlock.inputs : sourceBlock.outputs;
        return slots.find((s) => s.id === sourcePort.slotId) ?? null;
      })()
    : null;

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : undefined,
      }
    : undefined;

  const hasInputs = block.inputs.length > 0;
  const hasOutputs = block.outputs.length > 0;

  // Handle block context menu (right-click on block content, not ports)
  const handleBlockContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    store.uiStore.openBlockContextMenu(e.clientX, e.clientY, block.id);
  };

  return (
    <div
      ref={setRefs}
      style={{
        ...style,
        '--block-color': blockColor,
      } as React.CSSProperties}
      className={`block ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isOverDropTarget ? 'drop-target' : ''} ${hasInputs ? 'has-inputs' : ''} ${hasOutputs ? 'has-outputs' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Input ports (left side) */}
      {hasInputs && (
        <div className="block-ports inputs">
          {block.inputs.map((slot) => {
            const portConnColor = getPortColor(block.id, slot.id, portColorMap);
            const connected = isPortConnected(block.id, slot.id, 'input', connections);
            const isThisHovered =
              hoveredPort?.blockId === block.id &&
              hoveredPort?.slotId === slot.id &&
              hoveredPort?.direction === 'input';
            const isThisSelected =
              selectedPort?.blockId === block.id &&
              selectedPort?.slotId === slot.id &&
              selectedPort?.direction === 'input';

            // Check if compatible with source port (and source is on different block)
            let compatible = false;
            if (sourcePort && sourceSlot && sourcePort.blockId !== block.id) {
              // Source is output, we're checking this input
              if (sourcePort.direction === 'output') {
                compatible = areTypesCompatible(sourceSlot.type, slot.type);
              }
            }

            return (
              <Port
                key={slot.id}
                slot={slot}
                blockId={block.id}
                direction="input"
                connectionColor={portConnColor}
                isConnected={connected}
                isHovered={isThisHovered}
                isSelected={isThisSelected}
                isCompatible={compatible}
                onHover={(p) => store.uiStore.setHoveredPort(p)}
                onClick={(p) => store.uiStore.setSelectedPort(p)}
                onContextMenu={(e, p) => store.uiStore.openContextMenu(e.clientX, e.clientY, p)}
              />
            );
          })}
        </div>
      )}

      {/* Drag handle */}
      <div
        className="block-drag-handle"
        style={{ backgroundColor: blockColor }}
        {...listeners}
        {...attributes}
      >
        <span className="block-grip">⋮⋮</span>
      </div>

      <div className="block-content" onContextMenu={handleBlockContextMenu}>
        <div className="block-label">{block.label}</div>
        <div className="block-type">{block.type}</div>
      </div>

      {/* Output ports (right side) */}
      {hasOutputs && (
        <div className="block-ports outputs">
          {block.outputs.map((slot) => {
            const portConnColor = getPortColor(block.id, slot.id, portColorMap);
            const connected = isPortConnected(block.id, slot.id, 'output', connections);
            const isThisHovered =
              hoveredPort?.blockId === block.id &&
              hoveredPort?.slotId === slot.id &&
              hoveredPort?.direction === 'output';
            const isThisSelected =
              selectedPort?.blockId === block.id &&
              selectedPort?.slotId === slot.id &&
              selectedPort?.direction === 'output';

            // Check if compatible with source port (and source is on different block)
            let compatible = false;
            if (sourcePort && sourceSlot && sourcePort.blockId !== block.id) {
              // Source is input, we're checking this output
              if (sourcePort.direction === 'input') {
                compatible = areTypesCompatible(slot.type, sourceSlot.type);
              }
            }

            return (
              <Port
                key={slot.id}
                slot={slot}
                blockId={block.id}
                direction="output"
                connectionColor={portConnColor}
                isConnected={connected}
                isHovered={isThisHovered}
                isSelected={isThisSelected}
                isCompatible={compatible}
                onHover={(p) => store.uiStore.setHoveredPort(p)}
                onClick={(p) => store.uiStore.setSelectedPort(p)}
                onContextMenu={(e, p) => store.uiStore.openContextMenu(e.clientX, e.clientY, p)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

/**
 * Get type hint text for a lane (shows what types flow in/out).
 */
function getLaneTypeHint(kind: LaneKind): string {
  const hints: Record<LaneKind, string> = {
    Scene: 'Scene, Targets',
    Phase: 'PhaseMachine, Signal<Unit>',
    Fields: 'Field<T>',
    Scalars: 'Scalar<T>',
    Spec: 'Spec:* → Program',
    Program: 'Program → Program',
    Output: 'Program',
  };
  return hints[kind] || '';
}

/**
 * Droppable lane component.
 * Supports collapse/expand and displays flow style indicator.
 * Click sets active lane for palette filtering.
 */
const DroppableLane = observer(({
  lane,
  isActive,
  isSuggested,
  portColorMap,
}: {
  lane: Lane;
  isActive: boolean;
  isSuggested: boolean;
  portColorMap: Map<string, string>;
}) => {
  const store = useStore();
  const { isOver, setNodeRef } = useDroppable({
    id: `lane-${lane.id}`,
    data: {
      type: 'lane',
      laneId: lane.id,
      laneName: lane.id, // Legacy compatibility
    },
  });

  const laneColor = LANE_KIND_COLORS[lane.kind];
  const isCollapsed = lane.collapsed;
  const isPinned = lane.pinned;
  const showTypeHints = store.uiStore.settings.showTypeHints;
  const typeHint = getLaneTypeHint(lane.kind);

  const handleHeaderClick = (e: React.MouseEvent) => {
    // Set active lane on click (for palette filtering)
    store.uiStore.setActiveLane(lane.id);

    // Double-click toggles collapse
    if (e.detail === 2) {
      store.patchStore.toggleLaneCollapsed(lane.id);
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.patchStore.toggleLaneCollapsed(lane.id);
  };

  return (
    <div
      ref={setNodeRef}
      className={`lane ${isOver ? 'drop-target' : ''} ${isCollapsed ? 'collapsed' : ''} ${lane.flowStyle} ${isActive ? 'active' : ''} ${isSuggested ? 'suggested' : ''}`}
      data-lane={lane.id}
      data-lane-kind={lane.kind}
      data-flow-style={lane.flowStyle}
      style={{
        '--lane-color': laneColor,
      } as React.CSSProperties}
    >
      <div className="lane-header" onClick={handleHeaderClick}>
        <div className="lane-color-bar" style={{ backgroundColor: laneColor }} />
        <div className="lane-info">
          <div className="lane-title-row">
            <span className="lane-chevron" onClick={handleChevronClick}>
              {isCollapsed ? '▸' : '▾'}
            </span>
            <h3 className="lane-label">{lane.label}</h3>
            <span className="lane-kind-badge" style={{ backgroundColor: laneColor }}>
              {lane.kind}
            </span>
            {showTypeHints && typeHint && (
              <span className="lane-type-hint" title={`Expected types: ${typeHint}`}>
                ({typeHint})
              </span>
            )}
            {isPinned && <span className="lane-pinned-badge">📌</span>}
            <span className={`lane-flow-badge ${lane.flowStyle}`}>
              {lane.flowStyle === 'chain' ? '→' : '⤵'}
            </span>
          </div>
          {!isCollapsed && <p className="lane-description">{lane.description}</p>}
        </div>
        <div className="lane-block-count">{lane.blockIds.length}</div>
      </div>

      {!isCollapsed && (
        <div className="lane-content">
          {lane.blockIds.length === 0 && (
            <div className="lane-empty">
              {isOver ? 'Drop here' : 'Drag blocks here'}
            </div>
          )}

          {lane.blockIds.map((blockId, index) => {
            const block = store.patchStore.blocks.find((b) => b.id === blockId);
            if (!block) return null;

            const isSelected = store.uiStore.uiState.selectedBlockId === blockId;

            return (
              <DraggablePatchBlock
                key={blockId}
                block={block}
                laneId={lane.id}
                index={index}
                laneColor={laneColor}
                isSelected={isSelected}
                onSelect={() => store.uiStore.selectBlock(blockId)}
                portColorMap={portColorMap}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

/**
 * PatchBay renders lanes with blocks.
 * Per lanes-overview.md: visual hierarchy from Scene → Output
 */
export const PatchBay = observer(() => {
  const store = useStore();
  const activeLaneId = store.uiStore.uiState.activeLaneId;
  const draggingLaneKind = store.uiStore.uiState.draggingLaneKind;

  // Build port color map for visual connection indication
  const portColorMap = buildPortColorMap(store.patchStore.connections);

  // Click anywhere in patch-bay (except ports/blocks which stop propagation) clears port selection
  const handleBackgroundClick = () => {
    // Clear port selection - blocks already clear this via selectBlock
    // This handles clicks on lane backgrounds, headers, empty areas, etc.
    if (store.uiStore.uiState.selectedPort) {
      store.uiStore.setSelectedPort(null);
    }
  };

  return (
    <div className="patch-bay" onClick={handleBackgroundClick}>
      <LayoutSelector />
      <div className="patch-bay-lanes" onClick={handleBackgroundClick}>
        {store.patchStore.lanes.map((lane) => (
          <DroppableLane
            key={lane.id}
            lane={lane}
            isActive={lane.id === activeLaneId}
            isSuggested={draggingLaneKind !== null && lane.kind === draggingLaneKind}
            portColorMap={portColorMap}
          />
        ))}
      </div>
      <BlockContextMenu />
    </div>
  );
});
