import { useState } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useStore } from '../stores';
import type { BlockDefinition } from '../blocks';
import { isLibraryBlockDragData, isTrashDropData } from '../types/dnd';
import {
  isPatchBlockDragData,
  isLaneDropData,
  isPatchBlockDropData,
  isInsertionPointDropData,
} from './dnd';

export function useLaneDnd(): {
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  activeDefinition: BlockDefinition | null;
  activePlacedBlock: { label: string; color: string; blockId: string } | null;
  isDraggingPlacedBlock: boolean;
} {
  const store = useStore();
  const [activeDefinition, setActiveDefinition] = useState<BlockDefinition | null>(null);
  const [activePlacedBlock, setActivePlacedBlock] = useState<{
    label: string;
    color: string;
    blockId: string;
  } | null>(null);

  const isDraggingPlacedBlock = activePlacedBlock !== null;

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const data = active.data.current;

    if (isLibraryBlockDragData(data)) {
      setActiveDefinition(data.definition);
    } else if (isPatchBlockDragData(data)) {
      const block = store.patchStore.blocks.find((b) => b.id === data.blockId);
      if (block) {
        setActivePlacedBlock({
          label: block.label,
          color: getBlockColor(block.type),
          blockId: block.id,
        });
      }
    }
  }

  function getBlockColor(blockType: string): string {
    const colors: Record<string, string> = {
      Sources: '#4a9eff',
      Fields: '#a855f7',
      Time: '#22c55e',
      Math: '#f59e0b',
      Compose: '#ec4899',
      Render: '#ef4444',
    };
    const block = store.patchStore.blocks.find((b) => b.type === blockType);
    return colors[block?.category ?? 'Compose'] ?? '#666';
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDefinition(null);
    setActivePlacedBlock(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (isPatchBlockDragData(activeData) && isPatchBlockDropData(overData)) {
      const { blockId, sourceLaneId, sourceIndex } = activeData;
      const { laneId: targetLaneId, index: targetIndex } = overData;
      if (sourceLaneId !== targetLaneId) return;
      if (sourceIndex !== targetIndex) {
        store.viewStore.reorderBlockInLane(sourceLaneId, blockId, targetIndex);
      }
      return;
    }

    if (isLibraryBlockDragData(activeData) && isLaneDropData(overData)) {
      const { blockType } = activeData;
      const blockId = store.patchStore.addBlock(blockType);
      store.viewStore.insertBlockInLane(overData.laneId, blockId, 0);
      return;
    }

    if (isLibraryBlockDragData(activeData) && isInsertionPointDropData(overData)) {
      const { blockType } = activeData;
      const blockId = store.patchStore.addBlock(blockType);
      store.viewStore.insertBlockInLane(overData.laneId, blockId, overData.index);
      return;
    }

    if (isPatchBlockDragData(activeData) && isInsertionPointDropData(overData)) {
      const { blockId, sourceLaneId, sourceIndex } = activeData;
      const { laneId: targetLaneId, index: targetIndex } = overData;

      if (sourceLaneId !== targetLaneId) return;
      const adjustedIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      if (sourceIndex !== adjustedIndex) {
        store.viewStore.reorderBlockInLane(sourceLaneId, blockId, adjustedIndex);
      }
      return;
    }

    if (isPatchBlockDragData(activeData) && isTrashDropData(overData)) {
      store.patchStore.removeBlock(activeData.blockId);
      return;
    }

    if (isPatchBlockDragData(activeData) && isLaneDropData(overData)) {
      const { blockId, sourceLaneId } = activeData;
      if (sourceLaneId === overData.laneId) {
        store.viewStore.insertBlockInLane(overData.laneId, blockId, 0);
      }
    }
  }

  return {
    handleDragStart,
    handleDragEnd,
    activeDefinition,
    activePlacedBlock,
    isDraggingPlacedBlock,
  };
}
