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
        // Lanes are computed projections - just add the block
        // The lane assignment is determined by the block's type/outputs
        store.patchStore.addBlock(activeData.definition.type);
        return;
      }
    }

    // Handle placed block drag
    if (isPatchBlockDragData(activeData)) {
      // Delete if dropped on trash
      if (isTrashDropData(overData)) {
        store.patchStore.removeBlock(activeData.blockId);
        return;
      }

      // Move to lane - lanes are computed, so this is a no-op for now
      // In the future, this could update block metadata or position
      if (isLaneDropData(overData)) {
        // No action needed - lanes are automatically computed from block topology
        return;
      }

      // Reorder within lane - lanes are computed, so this is a no-op for now
      // Block ordering is determined by topological sort
      if (isPatchBlockDropData(overData)) {
        // No action needed - ordering is automatic based on connections
        return;
      }

      // Insert at specific position - lanes are computed, so this is a no-op for now
      if (isInsertionPointDropData(overData)) {
        // No action needed - lanes are automatically computed
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
