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

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
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
 * Lane abbreviations for compact header display.
 */
const LANE_KIND_ABBREV: Record<LaneKind, string> = {
  Scene: 'S',
  Phase: 'P',
  Fields: 'F',
  Scalars: 'C',
  Spec: 'X',
  Program: 'R',
  Output: 'O',
};

/**
 * Port glyph mapping - single character symbols for port types
 */
const PORT_GLYPHS: Record<string, string> = {
  // By world
  signal: '~',
  field: '⊛',
  scalar: '◆',
  event: '⚡',
  scene: '◐',
  program: '▶',
  render: '◉',
  filter: '⨍',
  stroke: '╱',
  unknown: '○',
};

/**
 * Port component - renders a compact input or output connection point.
 * Shows grey dash when unconnected, colored glyph when connected.
 * Tooltip appears above/below to avoid covering other blocks.
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
  const typeGlyph = PORT_GLYPHS[typeDescriptor.world] ?? '○';

  // Show dash when unconnected, type glyph when connected
  const displayGlyph = isConnected ? typeGlyph : '–';

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

  // Determine port styling - grey when unconnected, connectionColor when connected
  const portStyle: React.CSSProperties = {
    ...(isConnected && connectionColor ? {
      backgroundColor: connectionColor,
      borderColor: connectionColor,
      color: '#fff',
    } : {
      backgroundColor: '#4a5568',
      borderColor: '#4a5568',
      color: '#9ca3af',
    }),
    ...(isCompatible && !isConnected && {
      boxShadow: '0 0 8px 2px rgba(74, 222, 128, 0.6)',
    }),
  };

  const className = [
    'port',
    direction,
    isConnected ? 'connected' : 'disconnected',
    isHovered ? 'hovered' : '',
    isSelected ? 'selected' : '',
    isCompatible ? 'compatible' : '',
  ].filter(Boolean).join(' ');

  const tooltipContent = (
    <div className="port-tooltip">
      <div className="port-tooltip-header">
        <span className={`port-tooltip-glyph ${typeDescriptor.world}`}>{typeGlyph}</span>
        <span className="port-tooltip-label">{slot.label}</span>
      </div>
      <div className="port-tooltip-details">
        <div className="port-tooltip-row">
          <span className="port-tooltip-key">Type</span>
          <span className="port-tooltip-value">{slot.type}</span>
        </div>
        <div className="port-tooltip-row">
          <span className="port-tooltip-key">World</span>
          <span className={`port-tooltip-value world-${typeDescriptor.world}`}>{typeDescriptor.world}</span>
        </div>
        <div className="port-tooltip-row">
          <span className="port-tooltip-key">Domain</span>
          <span className="port-tooltip-value">{typeDescriptor.domain}</span>
        </div>
        {isConnected && (
          <div className="port-tooltip-status connected">● Connected</div>
        )}
      </div>
    </div>
  );

  return (
    <Tippy
      content={tooltipContent}
      placement="top-start"
      delay={[300, 0]}
      duration={150}
      interactive={false}
      appendTo={() => document.body}
      offset={[0, 45]}
      popperOptions={{
        modifiers: [
          {
            name: 'flip',
            options: {
              fallbackPlacements: ['bottom-start'],
              padding: 50,
            },
          },
          {
            name: 'preventOverflow',
            options: {
              padding: 12,
              boundary: 'viewport',
            },
          },
        ],
      }}
    >
      <div
        className={className}
        style={portStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <span className={`port-glyph ${isConnected ? typeDescriptor.world : 'disconnected'}`}>{displayGlyph}</span>
      </div>
    </Tippy>
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
      onContextMenu={handleBlockContextMenu}
      {...listeners}
      {...attributes}
    >
      {/* Block color indicator */}
      <div className="block-color-indicator" style={{ backgroundColor: blockColor }} />

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

      <div className="block-content">
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
 * Insertion point drop zone - appears between blocks for precise positioning.
 */
function InsertionPoint({
  laneId,
  index,
}: {
  laneId: string;
  index: number;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `insert-${laneId}-${index}`,
    data: {
      type: 'insertion-point',
      laneId,
      index,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`insertion-point ${isOver ? 'active' : ''}`}
    />
  );
}

/**
 * Droppable lane component.
 * Compact header with letter abbreviation, horizontal scrolling content.
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
  const laneAbbrev = LANE_KIND_ABBREV[lane.kind];
  const isCollapsed = lane.collapsed;
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
      {/* Compact lane header - shows letter abbreviation */}
      <div
        className="lane-header"
        onClick={handleHeaderClick}
        title={`${lane.kind}: ${lane.description}\n${typeHint}`}
      >
        <div className="lane-color-fill" style={{ backgroundColor: laneColor }}>
          <span className="lane-abbrev">{laneAbbrev}</span>
        </div>
        <span className="lane-chevron" onClick={handleChevronClick}>
          {isCollapsed ? '▸' : '▾'}
        </span>
        {lane.blockIds.length > 0 && (
          <span className="lane-count">{lane.blockIds.length}</span>
        )}
      </div>

      {!isCollapsed && (
        <div className="lane-content">
          {lane.blockIds.length === 0 ? (
            <div className="lane-empty">
              {isOver ? 'Drop' : '+'}
            </div>
          ) : (
            <>
              {/* Insertion point before first block */}
              <InsertionPoint laneId={lane.id} index={0} />

              {lane.blockIds.map((blockId, index) => {
                const block = store.patchStore.blocks.find((b) => b.id === blockId);
                if (!block) return null;

                const isSelected = store.uiStore.uiState.selectedBlockId === blockId;

                return (
                  <React.Fragment key={blockId}>
                    <DraggablePatchBlock
                      block={block}
                      laneId={lane.id}
                      index={index}
                      laneColor={laneColor}
                      isSelected={isSelected}
                      onSelect={() => store.uiStore.selectBlock(blockId)}
                      portColorMap={portColorMap}
                    />
                    {/* Insertion point after each block */}
                    <InsertionPoint laneId={lane.id} index={index + 1} />
                  </React.Fragment>
                );
              })}
            </>
          )}
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
