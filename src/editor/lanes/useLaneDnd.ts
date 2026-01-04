import { useState } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useStore } from '../stores';
import type { BlockDefinition } from '../blocks';
import { getBlockDefinition } from '../blocks';
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

    // Look up the block definition to get the subcategory
    const blockDef = getBlockDefinition(blockType);
    const subcategory = blockDef?.subcategory ?? 'Compose';

    return colors[subcategory] ?? '#666';
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDefinition(null);
    setActivePlacedBlock(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Handle library block drag
    if (isLibraryBlockDragData(activeData)) {
      if (isLaneDropData(overData)) {
        const laneId = overData.laneId;
        const insertionIndex = overData.insertionIndex ?? undefined;
        store.patchStore.addBlockToLane(activeData.definition.type, laneId, insertionIndex);
        return;
      }
    }

    // Handle placed block drag
    if (isPatchBlockDragData(activeData)) {
      // Delete if dropped on trash
      if (isTrashDropData(overData)) {
        store.patchStore.deleteBlock(activeData.blockId);
        return;
      }

      // Move to lane
      if (isLaneDropData(overData)) {
        const laneId = overData.laneId;
        const insertionIndex = overData.insertionIndex ?? undefined;
        store.laneStore.moveBlockToLane(activeData.blockId, laneId, insertionIndex);
        return;
      }

      // Reorder within lane
      if (isPatchBlockDropData(overData)) {
        const sourceLaneId = store.laneStore.findLaneForBlock(activeData.blockId);
        const targetLaneId = store.laneStore.findLaneForBlock(overData.blockId);

        if (sourceLaneId === targetLaneId && sourceLaneId !== null) {
          store.laneStore.reorderBlocksInLane(
            sourceLaneId,
            activeData.blockId,
            overData.blockId
          );
        }
        return;
      }

      // Insert at specific position
      if (isInsertionPointDropData(overData)) {
        const laneId = overData.laneId;
        const insertionIndex = overData.insertionIndex;
        store.laneStore.moveBlockToLane(activeData.blockId, laneId, insertionIndex);
        return;
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
