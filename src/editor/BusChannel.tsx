/**
 * BusChannel Component
 *
 * Individual channel strip for a single bus (DAW mixer metaphor).
 */

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import type { Bus, BusCombineMode, CoreDomain } from './types';
import { useStore } from './stores';
import { BusViz } from './BusViz';
import './BusBoard.css';

interface BusChannelProps {
  bus: Bus;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Get domain icon for bus type badge.
 */
function getDomainIcon(domain: string): string {
  const icons: Record<string, string> = {
    number: '◆',
    vec2: '⬡',
    color: '■',
    boolean: '▢',
    time: '⏱',
    phase: '◷',
    rate: '⟲',
    trigger: '◉',
  };
  return icons[domain] ?? '?';
}

/**
 * Get domain-appropriate combine mode options.
 */
function getCombineModeOptions(domain: string): BusCombineMode[] {
  const options: Record<string, BusCombineMode[]> = {
    number: ['sum', 'average', 'max', 'min', 'last'],
    vec2: ['sum', 'average', 'last'],
    color: ['layer', 'last'],
    phase: ['last'],
    time: ['last'],
    rate: ['last'],
    trigger: ['last'], // Note: spec says "or" but type doesn't include it yet
    boolean: ['last'],
  };
  return options[domain] ?? ['last'];
}

/**
 * Check if domain is a core domain (for type guard).
 */
function isCoreDomain(domain: string): domain is CoreDomain {
  return ['number', 'vec2', 'color', 'boolean', 'time', 'phase', 'rate', 'trigger'].includes(domain);
}

/**
 * Individual bus channel strip.
 */
export const BusChannel = observer(({ bus, isSelected, onSelect }: BusChannelProps): React.ReactElement => {
  const store = useStore();
  const publishers = store.busStore.getPublishersByBus(bus.id);
  const listeners = store.busStore.getListenersByBus(bus.id);
  const subscriberCount = listeners.length;

  const domainIcon = getDomainIcon(bus.type.domain);
  const combineOptions = getCombineModeOptions(bus.type.domain);

  // Drag-and-drop state
  const [draggedPublisherId, setDraggedPublisherId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleNameChange = (e: React.FocusEvent<HTMLInputElement>): void => {
    const newName = e.target.value.trim();
    if (newName.length > 0 && newName !== bus.name) {
      store.busStore.updateBus(bus.id, { name: newName });
    }
  };

  const handleCombineModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    store.busStore.updateBus(bus.id, { combineMode: e.target.value as BusCombineMode });
  };

  const handleDragStart = (e: React.DragEvent, publisherId: string) => {
    setDraggedPublisherId(publisherId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', publisherId);
  };

  const handleDragEnd = () => {
    setDraggedPublisherId(null);
    setDropTargetIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(targetIndex);
  };

  const handleDragLeave = () => {
    setDropTargetIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number): void => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedPublisherId === undefined || draggedPublisherId === null) return;

    const draggedIndex = publishers.findIndex(p => p.id === draggedPublisherId);
    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      setDraggedPublisherId(null);
      setDropTargetIndex(null);
      return;
    }

    // Recalculate sortKeys for all publishers
    const reordered = [...publishers];
    const [movedPublisher] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, movedPublisher);

    // Assign new sortKeys with gaps (10, 20, 30, ...)
    reordered.forEach((pub, index) => {
      const newSortKey = (index + 1) * 10;
      if (pub.sortKey !== newSortKey) {
        store.busStore.updatePublisher(pub.id, { sortKey: newSortKey });
      }
    });

    setDraggedPublisherId(null);
    setDropTargetIndex(null);
  };

  return (
    <div
      className={`bus-channel ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="bus-channel-header">
        <input
          className="bus-channel-name"
          type="text"
          defaultValue={bus.name}
          onBlur={handleNameChange}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="bus-channel-type-badge">
          <span className="bus-type-icon">{domainIcon}</span>
          <span className="bus-type-label">Signal:{bus.type.domain}</span>
        </div>
        <div className="bus-channel-active-indicator" title="Active indicator (placeholder)">
          ●
        </div>
      </div>

      {/* Live Visualization */}
      <div className="bus-channel-viz" title={`${bus.type.domain} visualization`}>
        {isCoreDomain(bus.type.domain) ? (
          <BusViz
            domain={bus.type.domain}
            defaultValue={bus.defaultValue}
            size={20}
          />
        ) : (
          <div className="bus-viz-placeholder">
            {/* Fallback for non-core domains */}
            <span className="bus-viz-icon">{domainIcon}</span>
          </div>
        )}
      </div>

      {/* Combine Mode */}
      <div className="bus-channel-combine">
        <label className="bus-channel-combine-label">Combine:</label>
        <select
          className="bus-channel-combine-select"
          value={bus.combineMode}
          onChange={handleCombineModeChange}
          onClick={(e) => e.stopPropagation()}
        >
          {combineOptions.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>

      {/* Publishers List */}
      <div className="bus-channel-publishers">
        <div className="bus-channel-section-header">Publishers ({publishers.length})</div>
        {publishers.length === 0 ? (
          <div className="bus-channel-empty">No publishers</div>
        ) : (
          <div className="bus-channel-publisher-list">
            {publishers.map((pub, index) => {
              const block = store.patchStore.blocks.find((b) => b.id === pub.from.blockId);
              const blockLabel = block !== undefined && block !== null ? block.label : pub.from.blockId;
              const isDragging = pub.id === draggedPublisherId;
              const isDropTarget = index === dropTargetIndex;

              return (
                <div
                  key={pub.id}
                  className={`bus-channel-publisher-row ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, pub.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  title={`Drag to reorder | ${blockLabel}.${pub.from.slotId}`}
                >
                  <span className="bus-publisher-drag-handle" title="Drag to reorder">
                    ⋮⋮
                  </span>
                  <span className="bus-publisher-label" title={`${blockLabel}.${pub.from.slotId}`}>
                    {blockLabel}.{pub.from.slotId}
                  </span>
                  <button
                    className="bus-publisher-mute-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.busStore.updatePublisher(pub.id, { enabled: !pub.enabled });
                    }}
                    title={pub.enabled ? 'Disable publisher' : 'Enable publisher'}
                  >
                    {pub.enabled ? '◼' : '◻'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscriber Count */}
      <div className="bus-channel-subscribers">
        <span className="bus-channel-subscriber-count">
          Used by {subscriberCount} input{subscriberCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
});
