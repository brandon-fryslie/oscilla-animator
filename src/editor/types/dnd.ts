/**
 * Drag-and-Drop Type Definitions
 *
 * Strongly-typed payload definitions for the dnd-kit library.
 * These types replace `any` in the DND system with proper type safety.
 */

import type { BlockDefinition } from '../blocks';
import type { BlockId, LaneKind, LaneId } from '../types';

// =============================================================================
// DND Data Types (for active.data.current payloads)
// =============================================================================

/**
 * Payload when dragging a block from the library.
 * Set by: BlockLibrary draggable blocks
 */
export interface LibraryBlockDragData {
  /** Discriminator for drag type */
  type: 'library-block';
  /** Block definition being dragged */
  definition: BlockDefinition;
  /** Block type string (for convenience) */
  blockType: string;
}

/**
 * Payload when dragging a block that's already placed in the patch.
 * Set by: PatchBay draggable blocks
 */
export interface PatchBlockDragData {
  /** Discriminator for drag type */
  type: 'patch-block';
  /** ID of the block being dragged */
  blockId: BlockId;
  /** Lane the block is currently in */
  sourceLaneId: LaneId;
  /** Index within the source lane */
  sourceIndex: number;
}

/**
 * Payload for lane drop targets.
 * Set by: Lane components
 */
export interface LaneDropData {
  /** Discriminator for drop target type */
  type: 'lane';
  /** ID of the lane */
  laneId: LaneId;
  /** Lane kind (for filtering) */
  laneKind: LaneKind;
  /** Optional: lane name (legacy support) */
  laneName?: string;
}

/**
 * Payload for block drop targets (reordering).
 * Set by: Block components when used as drop targets
 */
export interface PatchBlockDropData {
  /** Discriminator for drop target type */
  type: 'patch-target';
  /** ID of the target lane */
  laneId: LaneId;
  /** Target index in the lane */
  index: number;
}

/**
 * Payload for insertion point drop targets.
 * Set by: Lane components when dragging between blocks
 */
export interface InsertionPointDropData {
  /** Discriminator for drop target type */
  type: 'insertion-point';
  /** ID of the target lane */
  laneId: LaneId;
  /** Target index in the lane */
  index: number;
}

/**
 * Payload for trash zone drop target.
 * Set by: TrashZone component
 */
export interface TrashDropData {
  /** Discriminator for drop target type */
  type: 'trash';
}

/**
 * Union of all active drag data types.
 * This is what you get from active.data.current when dragging.
 */
export type ActiveDragData =
  | LibraryBlockDragData
  | PatchBlockDragData;

/**
 * Union of all drop target data types.
 * This is what you get from over.data.current when hovering.
 */
export type DropTargetData =
  | LaneDropData
  | PatchBlockDropData
  | InsertionPointDropData
  | TrashDropData;

/**
 * Combined union of all DND data.
 */
export type DndData = ActiveDragData | DropTargetData;

// =============================================================================
// Type Guards for DND Data
// =============================================================================

/**
 * Check if data is LibraryBlockDragData.
 */
export function isLibraryBlockDragData(data: unknown): data is LibraryBlockDragData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'library-block' &&
    'definition' in data &&
    'blockType' in data
  );
}

/**
 * Check if data is PatchBlockDragData.
 */
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

/**
 * Check if data is LaneDropData.
 */
export function isLaneDropData(data: unknown): data is LaneDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'lane' &&
    ('laneId' in data || 'laneName' in data)
  );
}

/**
 * Check if data is PatchBlockDropData.
 */
export function isPatchBlockDropData(data: unknown): data is PatchBlockDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'patch-target' &&
    'laneId' in data &&
    'index' in data
  );
}

/**
 * Check if data is InsertionPointDropData.
 */
export function isInsertionPointDropData(data: unknown): data is InsertionPointDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'insertion-point' &&
    'laneId' in data &&
    'index' in data
  );
}

/**
 * Check if data is TrashDropData.
 */
export function isTrashDropData(data: unknown): data is TrashDropData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'trash'
  );
}

/**
 * Type guard for any DND data.
 */
export function isDndData(data: unknown): data is DndData {
  return (
    isLibraryBlockDragData(data) ||
    isPatchBlockDragData(data) ||
    isLaneDropData(data) ||
    isPatchBlockDropData(data) ||
    isInsertionPointDropData(data) ||
    isTrashDropData(data)
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the lane ID from drop data.
 * Handles both laneId and legacy laneName.
 */
export function getLaneIdFromDropData(data: LaneDropData): LaneId {
  return data.laneId ?? (data.laneName as LaneId);
}

/**
 * Extract block definition from drag data.
 * Returns null if not a library block drag.
 */
export function getBlockDefinitionFromDragData(
  data: unknown
): BlockDefinition | null {
  if (isLibraryBlockDragData(data)) {
    return data.definition;
  }
  return null;
}

/**
 * Extract lane kind from drag data.
 * Returns null if not available.
 */
export function getLaneKindFromDragData(data: unknown): LaneKind | null {
  if (isLibraryBlockDragData(data)) {
    return data.definition.laneKind ?? null;
  }
  if (isLaneDropData(data)) {
    return data.laneKind;
  }
  return null;
}
