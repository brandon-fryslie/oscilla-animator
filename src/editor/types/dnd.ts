/**
 * Drag-and-Drop Type Definitions (lane-agnostic)
 */

import type { BlockDefinition } from '../blocks';

export interface LibraryBlockDragData {
  type: 'library-block';
  definition: BlockDefinition;
  blockType: string;
}

export interface PatchBlockDragData {
  type: 'patch-block';
  blockId: string;
  sourceLaneId: string;
  sourceIndex: number;
}

export interface LaneDropData {
  type: 'lane';
  laneId: string;
}

export interface PatchBlockDropData {
  type: 'patch-target';
  blockId: string;
  laneId: string;
  index: number;
}

export interface TrashDropData {
  type: 'trash';
}

export type ActiveDragData = LibraryBlockDragData | PatchBlockDragData;
export type DropTargetData = TrashDropData | LaneDropData | PatchBlockDropData;
export type DndData = ActiveDragData | DropTargetData;
export type AnyData = DndData;

export function isLibraryBlockDragData(data: unknown): data is LibraryBlockDragData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'library-block' &&
    'definition' in data &&
    'blockType' in data
  );
}

export function isPatchBlockDragData(data: unknown): data is PatchBlockDragData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'patch-block' &&
    'blockId' in data &&
    'sourceLaneId' in data &&
    'sourceIndex' in data
  );
}

export function isLaneDropData(data: unknown): data is LaneDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'lane' &&
    'laneId' in data
  );
}

export function isPatchBlockDropData(data: unknown): data is PatchBlockDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'patch-target' &&
    'blockId' in data &&
    'laneId' in data &&
    'index' in data
  );
}

export function isTrashDropData(data: unknown): data is TrashDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'trash'
  );
}

export function getLaneIdFromDropData(data: LaneDropData | PatchBlockDropData): string {
  return data.laneId;
}
