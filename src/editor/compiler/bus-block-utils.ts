/**
 * BusBlock Recognition Utilities
 *
 * Sprint: Bus-Block Unification - Sprint 2 (Compiler Unification)
 * Created: 2026-01-01
 *
 * Provides utilities for the compiler to recognize and work with BusBlocks.
 * This enables the compiler to treat buses as regular blocks in the graph.
 *
 * P0 Deliverable: Compiler BusBlock Recognition
 * - getBusBlocks(patch): Block[] - returns all BusBlocks
 * - getBusById(patch, busId): Block | undefined - lookup by ID
 */

import type { Block } from '../types';

/**
 * Minimal Patch interface for bus block utilities.
 * Only requires blocks array.
 */
export interface PatchWithBlocks {
  readonly blocks: readonly Block[];
}

/**
 * Get all BusBlocks from a patch.
 *
 * Recognizes BusBlocks by block.type === 'BusBlock'.
 *
 * @param patch - Patch containing blocks
 * @returns Array of BusBlock instances
 */
export function getBusBlocks(patch: PatchWithBlocks): Block[] {
  return patch.blocks.filter((block) => block.type === 'BusBlock');
}

/**
 * Get a BusBlock by its bus ID.
 *
 * This looks up a BusBlock using the bus ID stored in params.busId.
 * The block's own ID should match params.busId for stable references.
 *
 * @param patch - Patch containing blocks
 * @param busId - Bus ID to look up
 * @returns BusBlock if found, undefined otherwise
 */
export function getBusById(
  patch: PatchWithBlocks,
  busId: string
): Block | undefined {
  return patch.blocks.find((block) => {
    // Check if this is a BusBlock
    if (block.type !== 'BusBlock') {
      return false;
    }

    // Check if the busId matches
    // The block ID should equal the bus ID for stable references
    return block.id === busId || block.params?.busId === busId;
  });
}

/**
 * Get the combine policy from a BusBlock.
 *
 * This reads the combine mode from the BusBlock's params,
 * which stores the original bus combine policy.
 *
 * @param busBlock - BusBlock instance
 * @returns Combine mode string (e.g., 'last', 'sum', 'product')
 */
export function getBusBlockCombineMode(busBlock: Block): string {
  if (busBlock.type !== 'BusBlock') {
    throw new Error(
      `getBusBlockCombineMode called on non-BusBlock: ${busBlock.type}`
    );
  }

  const combine = busBlock.params?.combine;
  if (typeof combine === 'object' && combine !== null && 'mode' in combine) {
    return combine.mode as string;
  }

  // Default to 'last' if combine mode not found
  return 'last';
}

/**
 * Get the default value from a BusBlock.
 *
 * This reads the fallback value from the BusBlock's params,
 * which stores the original bus default value.
 *
 * @param busBlock - BusBlock instance
 * @returns Default value (typically a number or 0)
 */
export function getBusBlockDefaultValue(busBlock: Block): unknown {
  if (busBlock.type !== 'BusBlock') {
    throw new Error(
      `getBusBlockDefaultValue called on non-BusBlock: ${busBlock.type}`
    );
  }

  return busBlock.params?.defaultValue ?? 0;
}

/**
 * Check if a block is a BusBlock.
 *
 * @param block - Block to check
 * @returns true if block is a BusBlock
 */
export function isBusBlock(block: Block): boolean {
  return block.type === 'BusBlock';
}
