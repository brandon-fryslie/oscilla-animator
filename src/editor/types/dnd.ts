/**
 * Drag-and-Drop Type Definitions (lane-agnostic)
 */

import type { BlockDefinition } from '../blocks';

export interface LibraryBlockDragData {
  type: 'library-block';
  definition: BlockDefinition;
  blockType: string;
}

export interface TrashDropData {
  type: 'trash';
}

export type ActiveDragData = LibraryBlockDragData;
export type DropTargetData = TrashDropData;
export type DndData = ActiveDragData | DropTargetData;

export function isLibraryBlockDragData(data: unknown): data is LibraryBlockDragData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'library-block' &&
    'definition' in data &&
    'blockType' in data
  );
}

export function isTrashDropData(data: unknown): data is TrashDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'trash'
  );
}
