import { useState } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useStore } from './stores';
import type { BlockDefinition } from './blocks';
import type { LaneId } from './types';

export function useEditorDnd() {
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

    if (data?.type === 'library-block') {
      setActiveDefinition(data.definition);
      // Set dragging lane kind for highlighting suggested lanes
      store.uiStore.setDraggingLaneKind(data.definition?.laneKind ?? null);
    } else if (data?.type === 'patch-block') {
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
    if (activeData?.type === 'patch-block' && overData?.type === 'patch-target') {
      const blockId = activeData.blockId as string;
      const sourceLaneId = activeData.sourceLaneId as string;
      const targetLaneId = overData.laneId as LaneId;
      const targetIndex = overData.index as number;

      if (sourceLaneId === targetLaneId) {
        if (activeData.sourceIndex !== targetIndex) {
          store.patchStore.reorderBlockInLane(sourceLaneId as LaneId, blockId, targetIndex);
        }
      } else {
        store.patchStore.moveBlockToLane(blockId, targetLaneId);
      }
      return;
    }

    // Dropping library block onto a lane
    if (activeData?.type === 'library-block' && overData?.type === 'lane') {
      const blockType = activeData.blockType as string;
      const laneId = (overData.laneId ?? overData.laneName) as LaneId;
      store.patchStore.addBlock(blockType, laneId);
    }

    // Dropping placed block onto trash
    if (activeData?.type === 'patch-block' && overData?.type === 'trash') {
      const blockId = activeData.blockId as string;
      store.patchStore.removeBlock(blockId);
    }

    // Dropping placed block onto a lane (move/reorder)
    if (activeData?.type === 'patch-block' && overData?.type === 'lane') {
      const blockId = activeData.blockId as string;
      const sourceLaneId = activeData.sourceLaneId as string;
      const targetLaneId = (overData.laneId ?? overData.laneName) as LaneId;

      if (sourceLaneId !== targetLaneId) {
        // Move to different lane
        store.patchStore.moveBlockToLane(blockId, targetLaneId);
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
