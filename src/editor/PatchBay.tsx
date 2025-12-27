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

import React, { useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import { useStore } from './stores';
import type { Lane, LaneKind, Block, Slot, PortRef, Bus } from './types';
import { getBlockDefinition } from './blocks';
import { LayoutSelector } from './LayoutSelector';
import { BlockContextMenu } from './BlockContextMenu';
import {
  buildPortColorMap,
  getPortColor,
  areTypesCompatible,
  describeSlotType,
} from './portUtils';
import { isDefined } from './types/helpers';
import './PatchBay.css';
import { DiagnosticBadge } from './components/DiagnosticBadge';


/**
 * Get a color for a bus based on its domain type.
 */
function getBusDomainColor(bus: Bus): string {
  const domainColors: Record<string, string> = {
    number: '#60a5fa',  // blue
    vec2: '#4ade80',    // green
    color: '#f472b6',   // pink
    boolean: '#fbbf24', // yellow
    time: '#c084fc',    // purple
    phase: '#22d3ee',   // cyan
    rate: '#f97316',    // orange
    trigger: '#ef4444', // red
  };
  return domainColors[bus.type.domain] ?? '#666';
}

/**
 * Connection info for tooltip display
 */
interface ConnectionInfo {
  hasBlockConnection: boolean;
  hasBusConnection: boolean;
  busName?: string;
  busColor?: string;
  connectedBlockLabel?: string;
}

/**
 * Default source info for tooltip display
 */
interface DefaultSourceInfo {
  hasDefaultSource: boolean;
  value?: unknown;
  uiHint?: { kind: string };
}

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
 * Collapsed port indicator - shows when there are >4 ports
 * Clicking navigates to the block inspector to see all ports
 */
function CollapsedPortIndicator({
  count,
  direction,
  onClick,
}: {
  count: number;
  direction: 'input' | 'output';
  onClick: () => void;
}) {
  const arrow = direction === 'input' ? '→' : '←';
  return (
    <Tippy
      content={`${count} ${direction}s - click to view in Inspector`}
      placement="top"
      delay={[200, 0]}
    >
      <div
        className={`port-collapsed-indicator ${direction}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <span className="port-collapsed-count">{count}</span>
        <span className="port-collapsed-arrow">{arrow}</span>
      </div>
    </Tippy>
  );
}

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
  isHovered,
  isSelected,
  isCompatible,
  connectionInfo,
  defaultSourceInfo,
  hasPortError,
  hasPortWarning,
  onHover,
  onClick,
  onContextMenu,
}: {
  slot: Slot;
  blockId: string;
  direction: 'input' | 'output';
  connectionColor: string | null;
  isHovered: boolean;
  isSelected: boolean;
  isCompatible: boolean;
  connectionInfo: ConnectionInfo;
  defaultSourceInfo?: DefaultSourceInfo;
  hasPortError?: boolean;
  hasPortWarning?: boolean;
  onHover: (port: PortRef | null) => void;
  onClick: (port: PortRef) => void;
  onContextMenu: (e: React.MouseEvent, port: PortRef) => void;
}) {
  const portRef: PortRef = { blockId, slotId: slot.id, direction };
  const typeDescriptor = describeSlotType(slot.type);
  const typeGlyph = PORT_GLYPHS[typeDescriptor.world] ?? '○';

  // Determine what glyph to show:
  // - Unconnected: dash
  // - Bus-only: bus icon (⊛)
  // - Block-only or Block+Bus: type glyph
  const hasBusOnly = connectionInfo.hasBusConnection && !connectionInfo.hasBlockConnection;
  const hasAnyConnection = connectionInfo.hasBusConnection || connectionInfo.hasBlockConnection;
  const displayGlyph = !hasAnyConnection ? '–' : hasBusOnly ? '⊛' : typeGlyph;

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

  // Determine port styling - grey when unconnected
  // Use bus color if only bus connected, connection color if block connected
  const effectiveColor = connectionInfo.hasBusConnection && !connectionInfo.hasBlockConnection
    ? connectionInfo.busColor ?? connectionColor
    : connectionColor;

  const portStyle: React.CSSProperties = {
    ...(hasAnyConnection && isDefined(effectiveColor) ? {
      backgroundColor: effectiveColor,
      borderColor: effectiveColor,
      color: '#fff',
    } : {
      backgroundColor: '#4a5568',
      borderColor: '#4a5568',
      color: '#9ca3af',
    }),
    ...(isCompatible && !hasAnyConnection && {
      boxShadow: '0 0 8px 2px rgba(74, 222, 128, 0.6)',
    }),
  };

  const className = [
    'port',
    direction,
    hasAnyConnection ? 'connected' : 'disconnected',
    connectionInfo.hasBusConnection ? 'bus-connected' : '',
    isHovered ? 'hovered' : '',
    isSelected ? 'selected' : '',
    isCompatible ? 'compatible' : '',
    hasPortError ? 'has-error' : '',
    hasPortWarning ? 'has-warning' : '',
  ].filter(Boolean).join(' ');

  // Build connection status text for tooltip
  const getConnectionStatusText = () => {
    if (!connectionInfo.hasBlockConnection && !connectionInfo.hasBusConnection) {
      return null;
    }
    const parts: string[] = [];
    if (connectionInfo.hasBlockConnection) {
      parts.push(`Block${connectionInfo.connectedBlockLabel ? `: ${connectionInfo.connectedBlockLabel}` : ''}`);
    }
    if (connectionInfo.hasBusConnection && connectionInfo.busName) {
      parts.push(`Bus: ${connectionInfo.busName}`);
    }
    return parts.join(' + ');
  };

  const connectionStatusText = getConnectionStatusText();

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
        {connectionStatusText && (
          <div className={`port-tooltip-status connected ${connectionInfo.hasBusConnection ? 'has-bus' : ''}`}>
            ● {connectionStatusText}
          </div>
        )}
        {/* Default source info - shown when no connections but has default */}
        {!connectionStatusText && defaultSourceInfo?.hasDefaultSource && (
          <div className="port-tooltip-status default-source">
            ◆ Default: {formatDefaultValue(defaultSourceInfo.value)}
          </div>
        )}
        {/* Value source summary - always show where value comes from */}
        {!connectionStatusText && !defaultSourceInfo?.hasDefaultSource && direction === 'input' && (
          <div className="port-tooltip-status unconnected">
            ○ No value source
          </div>
        )}
      </div>
    </div>
  );

  // Helper to format default values for display
  function formatDefaultValue(value: unknown): string {
    if (value === undefined || value === null) return 'null';
    if (typeof value === 'number') return value.toFixed(2);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return `"${value.slice(0, 20)}${value.length > 20 ? '...' : ''}"`;
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('x' in obj && 'y' in obj) return `(${(obj.x as number)?.toFixed(1)}, ${(obj.y as number)?.toFixed(1)})`;
      if ('r' in obj && 'g' in obj && 'b' in obj) return `rgb(${obj.r}, ${obj.g}, ${obj.b})`;
      return JSON.stringify(value).slice(0, 30);
    }
    return String(value);
  }

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
        <span className={`port-glyph ${hasAnyConnection ? typeDescriptor.world : 'disconnected'}`}>{displayGlyph}</span>
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
  isMultiSelected,
  onSelect,
  portColorMap,
}: {
  block: Block;
  laneId: string;
  index: number;
  laneColor: string;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (shiftKey: boolean) => void;
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

  // Get diagnostics state
  const diagnostics = store.diagnosticStore.getDiagnosticsForBlock(block.id);
  // console.log(`[DraggablePatchBlock] Render ${block.id}: Found ${diagnostics.length} diagnostics`);
  const hasError = diagnostics.some(d => d.severity === 'error' || d.severity === 'fatal');
  const hasWarning = !hasError && diagnostics.some(d => d.severity === 'warn');

  // Tutorial highlighting
  const isTutorialHighlighted = store.tutorialStore.getHighlightedBlockIds().includes(block.id);

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

  // Get bus connection info for this block's ports
  const buses = store.busStore.buses;
  const busListeners = store.busStore.listeners;
  const publishers = store.busStore.publishers;

  // Helper to get port-level diagnostics
  const getPortDiagnostics = (slotId: string, direction: 'input' | 'output') => {
    return store.diagnosticStore.activeDiagnostics.filter(d => {
      if (d.primaryTarget.kind === 'port') {
        const ref = d.primaryTarget.portRef;
        return ref.blockId === block.id && ref.slotId === slotId && ref.direction === direction;
      }
      return d.affectedTargets?.some(t =>
        t.kind === 'port' &&
        t.portRef.blockId === block.id &&
        t.portRef.slotId === slotId &&
        t.portRef.direction === direction
      );
    });
  };

  // Helper to get default source info for an input port
  const getDefaultSourceInfo = (slotId: string): DefaultSourceInfo => {
    const ds = store.defaultSourceStore.getDefaultSourceForInput(block.id, slotId);
    if (!ds) return { hasDefaultSource: false };
    return {
      hasDefaultSource: true,
      value: ds.value,
      uiHint: ds.uiHint,
    };
  };

  // Helper to get connection info for a specific port
  const getConnectionInfo = (slotId: string, direction: 'input' | 'output'): ConnectionInfo => {
    // Check for block-to-block connections
    const hasBlockConnection = direction === 'input'
      ? connections.some((c) => c.to.blockId === block.id && c.to.slotId === slotId)
      : connections.some((c) => c.from.blockId === block.id && c.from.slotId === slotId);

    // Get connected block label for block-to-block connections
    let connectedBlockLabel: string | undefined;
    if (hasBlockConnection) {
      const conn = direction === 'input'
        ? connections.find((c) => c.to.blockId === block.id && c.to.slotId === slotId)
        : connections.find((c) => c.from.blockId === block.id && c.from.slotId === slotId);
      if (conn) {
        const otherBlockId = direction === 'input' ? conn.from.blockId : conn.to.blockId;
        const otherBlock = store.patchStore.blocks.find((b) => b.id === otherBlockId);
        connectedBlockLabel = otherBlock?.label;
      }
    }

    // Check for bus connections
    let hasBusConnection = false;
    let busName: string | undefined;
    let busColor: string | undefined;

    if (direction === 'input') {
      // Input ports can have listeners (bus → input)
      const busListener = busListeners.find(
        (l) => l.to.blockId === block.id && l.to.slotId === slotId
      );
      if (busListener) {
        hasBusConnection = true;
        const bus = buses.find((b) => b.id === busListener.busId);
        busName = bus?.name;
        busColor = bus ? getBusDomainColor(bus) : undefined;
      }
    } else {
      // Output ports can have publishers (output → bus)
      const publisher = publishers.find(
        (p) => p.from.blockId === block.id && p.from.slotId === slotId
      );
      if (publisher) {
        hasBusConnection = true;
        const bus = buses.find((b) => b.id === publisher.busId);
        busName = bus?.name;
        busColor = bus ? getBusDomainColor(bus) : undefined;
      }
    }

    return {
      hasBlockConnection,
      hasBusConnection,
      busName,
      busColor,
      connectedBlockLabel,
    };
  };

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
      className={`block ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isDragging ? 'dragging' : ''} ${isOverDropTarget ? 'drop-target' : ''} ${hasInputs ? 'has-inputs' : ''} ${hasOutputs ? 'has-outputs' : ''} ${hasError ? 'has-error' : ''} ${hasWarning ? 'has-warning' : ''} ${isTutorialHighlighted ? 'tutorial-highlight' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.shiftKey);
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
          {block.inputs.length > 4 ? (
            <CollapsedPortIndicator
              count={block.inputs.length}
              direction="input"
              onClick={() => store.uiStore.selectBlock(block.id)}
            />
          ) : (
            block.inputs.map((slot) => {
              const portConnColor = getPortColor(block.id, slot.id, portColorMap);
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

              const connInfo = getConnectionInfo(slot.id, 'input');
              const defaultInfo = getDefaultSourceInfo(slot.id);
              const portDiags = getPortDiagnostics(slot.id, 'input');
              const portHasError = portDiags.some(d => d.severity === 'error' || d.severity === 'fatal');
              const portHasWarning = !portHasError && portDiags.some(d => d.severity === 'warn');

              return (
                <Port
                  key={slot.id}
                  slot={slot}
                  blockId={block.id}
                  direction="input"
                  connectionColor={portConnColor}
                  isHovered={isThisHovered}
                  isSelected={isThisSelected}
                  isCompatible={compatible}
                  connectionInfo={connInfo}
                  defaultSourceInfo={defaultInfo}
                  hasPortError={portHasError}
                  hasPortWarning={portHasWarning}
                  onHover={(p) => store.uiStore.setHoveredPort(p)}
                  onClick={(p) => store.uiStore.setSelectedPort(p)}
                  onContextMenu={(e, p) => store.uiStore.openContextMenu(e.clientX, e.clientY, p)}
                />
              );
            })
          )}
        </div>
      )}

      <div className="block-content">
        <div className="block-label">{block.label}</div>
        <div className="block-type">{block.type}</div>
      </div>

      {/* Output ports (right side) */}
      {hasOutputs && (
        <div className="block-ports outputs">
          {block.outputs.length > 4 ? (
            <CollapsedPortIndicator
              count={block.outputs.length}
              direction="output"
              onClick={() => store.uiStore.selectBlock(block.id)}
            />
          ) : (
            block.outputs.map((slot) => {
              const portConnColor = getPortColor(block.id, slot.id, portColorMap);
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

              const connInfo = getConnectionInfo(slot.id, 'output');
              const portDiags = getPortDiagnostics(slot.id, 'output');
              const portHasError = portDiags.some(d => d.severity === 'error' || d.severity === 'fatal');
              const portHasWarning = !portHasError && portDiags.some(d => d.severity === 'warn');

              return (
                <Port
                  key={slot.id}
                  slot={slot}
                  blockId={block.id}
                  direction="output"
                  connectionColor={portConnColor}
                  isHovered={isThisHovered}
                  isSelected={isThisSelected}
                  isCompatible={compatible}
                  connectionInfo={connInfo}
                  hasPortError={portHasError}
                  hasPortWarning={portHasWarning}
                  onHover={(p) => store.uiStore.setHoveredPort(p)}
                  onClick={(p) => store.uiStore.setSelectedPort(p)}
                  onContextMenu={(e, p) => store.uiStore.openContextMenu(e.clientX, e.clientY, p)}
                />
              );
            })
          )}
        </div>
      )}

      {/* Diagnostic Badge */}
      <DiagnosticBadge blockId={block.id} />

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
      laneName: lane.id,
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
      store.viewStore.toggleLaneCollapsed(lane.id);
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.viewStore.toggleLaneCollapsed(lane.id);
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
                const isMultiSelected = store.uiStore.uiState.selectedBlockIds.has(blockId);

                return (
                  <React.Fragment key={blockId}>
                    <DraggablePatchBlock
                      block={block}
                      laneId={lane.id}
                      index={index}
                      laneColor={laneColor}
                      isSelected={isSelected}
                      isMultiSelected={isMultiSelected}
                      onSelect={(shiftKey) => {
                        if (shiftKey) {
                          store.uiStore.toggleBlockSelection(blockId);
                        } else {
                          store.uiStore.selectBlock(blockId);
                        }
                      }}
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
 * SelectionRectangle component - renders the drag-select box
 */
const SelectionRectangle = observer(() => {
  const store = useStore();
  const rect = store.uiStore.uiState.selectionRectangle;

  if (!rect) return null;

  const left = Math.min(rect.startX, rect.currentX);
  const top = Math.min(rect.startY, rect.currentY);
  const width = Math.abs(rect.currentX - rect.startX);
  const height = Math.abs(rect.currentY - rect.startY);

  return (
    <div
      className="selection-rectangle"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        border: '2px dashed #4a9eff',
        backgroundColor: 'rgba(74, 158, 255, 0.1)',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    />
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
  const patchBayRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);

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

  // Drag-select handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start selection on background, not on blocks/ports
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.lane-content, .patch-bay-lanes')) {
      // Don't start selection if clicking on a lane header or other interactive elements
      if ((e.target as HTMLElement).closest('.lane-header, .block, .port')) {
        return;
      }

      setIsSelecting(true);
      store.uiStore.startSelectionRectangle(e.clientX, e.clientY);
    }
  }, [store]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isSelecting && store.uiStore.uiState.selectionRectangle) {
      store.uiStore.updateSelectionRectangle(e.clientX, e.clientY);
    }
  }, [isSelecting, store]);

  const handleMouseUp = useCallback(() => {
    if (isSelecting && store.uiStore.uiState.selectionRectangle) {
      const rect = store.uiStore.uiState.selectionRectangle;
      const left = Math.min(rect.startX, rect.currentX);
      const top = Math.min(rect.startY, rect.currentY);
      const right = Math.max(rect.startX, rect.currentX);
      const bottom = Math.max(rect.startY, rect.currentY);

      // Find all blocks within the selection rectangle
      const selectedIds = new Set<string>();

      // Get all block elements and check if they intersect with selection rect
      if (patchBayRef.current) {
        const blockElements = patchBayRef.current.querySelectorAll('[class*="block "]');
        blockElements.forEach((elem) => {
          const elemRect = elem.getBoundingClientRect();

          // Check if rectangles intersect
          if (
            elemRect.left < right &&
            elemRect.right > left &&
            elemRect.top < bottom &&
            elemRect.bottom > top
          ) {
            // Extract block ID from the draggable ID
            const draggableId = (elem as HTMLElement).getAttribute('data-rbd-draggable-id');
            if (draggableId) {
              const blockId = draggableId.replace('patch-block-', '');
              selectedIds.add(blockId);
            }

            // Also try to find block ID from the block's data
            const block = store.patchStore.blocks.find(b => {
              const blockElem = elem.querySelector('.block-label');
              return blockElem?.textContent === b.label;
            });
            if (block) {
              selectedIds.add(block.id);
            }
          }
        });
      }

      if (selectedIds.size > 0) {
        store.uiStore.setBlockSelection(selectedIds);
      }

      store.uiStore.endSelectionRectangle();
      setIsSelecting(false);
    }
  }, [isSelecting, store]);

  return (
    <div
      ref={patchBayRef}
      className="patch-bay"
      onClick={handleBackgroundClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <LayoutSelector />
      <div className="patch-bay-lanes" onClick={handleBackgroundClick}>
        {store.viewStore.lanes.map((lane) => (
          <DroppableLane
            key={lane.id}
            lane={lane}
            isActive={lane.id === activeLaneId}
            isSuggested={draggingLaneKind !== null && lane.kind === draggingLaneKind}
            portColorMap={portColorMap}
          />
        ))}
      </div>
      <SelectionRectangle />
      <BlockContextMenu />
    </div>
  );
});
