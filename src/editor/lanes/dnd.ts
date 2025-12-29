import type { BlockId } from '../types';
import type { LaneViewId } from './types';

export interface PatchBlockDragData {
  type: 'patch-block';
  blockId: BlockId;
  sourceLaneId: LaneViewId;
  sourceIndex: number;
}

export interface LaneDropData {
  type: 'lane';
  laneId: LaneViewId;
}

export interface PatchBlockDropData {
  type: 'patch-target';
  laneId: LaneViewId;
  index: number;
}

export interface InsertionPointDropData {
  type: 'insertion-point';
  laneId: LaneViewId;
  index: number;
}

export type LaneDropTargetData = LaneDropData | PatchBlockDropData | InsertionPointDropData;

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
    'laneId' in data &&
    'index' in data
  );
}

export function isInsertionPointDropData(data: unknown): data is InsertionPointDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'insertion-point' &&
    'laneId' in data &&
    'index' in data
  );
}
