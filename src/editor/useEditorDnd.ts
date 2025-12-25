import { useState } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useStore } from './stores';
import type { BlockDefinition } from './blocks';
import {
  isLibraryBlockDragData,
  isPatchBlockDragData,
  isLaneDropData,
  isPatchBlockDropData,
  isTrashDropData,
  getLaneIdFromDropData,
} from './types/dnd';

export function useEditorDnd(): {
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
      // Set dragging lane kind for highlighting suggested lanes
      store.uiStore.setDraggingLaneKind(data.definition.laneKind ?? null);
    } else if (isPatchBlockDragData(data)) {
      // Dragging a placed block
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
    // Import would create circular dep, so inline the lookup
    const colors: Record<string, string> = {
      Scene: '#4a9eff',
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
    store.uiStore.setDraggingLaneKind(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Dropping placed block onto another block (reorder/move)
    if (isPatchBlockDragData(activeData) && isPatchBlockDropData(overData)) {
      const { blockId, sourceLaneId, sourceIndex } = activeData;
      const { laneId: targetLaneId, index: targetIndex } = overData;

      if (sourceLaneId === targetLaneId) {
        if (sourceIndex !== targetIndex) {
          store.viewStore.reorderBlockInLane(sourceLaneId, blockId, targetIndex);
        }
      } else {
        store.viewStore.moveBlockToLane(blockId, targetLaneId);
      }
      return;
    }

    // Dropping library block onto a lane
    if (isLibraryBlockDragData(activeData) && isLaneDropData(overData)) {
      const { blockType } = activeData;
      const laneId = getLaneIdFromDropData(overData);
      const blockId = store.patchStore.addBlock(blockType);

      // Explicitly move to the target lane since user dropped it there
      store.viewStore.moveBlockToLane(blockId, laneId);
    }

    // Dropping placed block onto trash
    if (isPatchBlockDragData(activeData) && isTrashDropData(overData)) {
      store.patchStore.removeBlock(activeData.blockId);
    }

    // Dropping placed block onto a lane (move/reorder)
    if (isPatchBlockDragData(activeData) && isLaneDropData(overData)) {
      const { blockId, sourceLaneId } = activeData;
      const targetLaneId = getLaneIdFromDropData(overData);

      if (sourceLaneId !== targetLaneId) {
        // Move to different lane
        store.viewStore.moveBlockToLane(blockId, targetLaneId);
      }
      // Note: reordering within same lane would need drop position info
      // For now, moving to same lane just keeps it in place
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
