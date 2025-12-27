/**
 * Replace Block Utilities
 *
 * Utilities for finding compatible replacement blocks and mapping connections
 * when replacing one block with another.
 */

import type { Block, Connection, BlockId, Slot } from './types';
import type { BlockDefinition } from './blocks/types';
import { getBlockForm } from './blocks/types';
import { areTypesCompatible } from './portUtils';
import { getBlockDefinition } from './blocks/registry';

export interface ConnectionMapping {
  /** Connections that can be preserved with direct remapping */
  preserved: Array<{
    connectionId: string;
    fromBlockId: BlockId;
    fromSlot: string;
    toBlockId: BlockId;
    toSlot: string;
  }>;
  /** Connections that must be dropped (no compatible slot on new block) */
  dropped: Array<{
    connectionId: string;
    reason: string;
  }>;
}

export interface ReplacementResult {
  success: boolean;
  newBlockId?: BlockId;
  preservedConnections: number;
  droppedConnections: Array<{ connectionId: string; reason: string }>;
  error?: string;
}

/**
 * Find all block definitions compatible with replacing the given block.
 *
 * Compatibility is determined by:
 * 1. Same lane kind (blocks must be in the same lane type)
 * 2. For connected blocks: must be able to receive all currently connected
 *    inputs and provide all currently connected outputs
 * 3. For unconnected blocks: any block in the same lane kind is valid
 */
export function findCompatibleReplacements(
  block: Block,
  connections: Connection[],
  allDefinitions: readonly BlockDefinition[]
): BlockDefinition[] {
  // Get connected slots
  const connectedInputs = new Set<string>();
  const connectedOutputs = new Set<string>();

  for (const conn of connections) {
    if (conn.to.blockId === block.id) {
      connectedInputs.add(conn.to.slotId);
    }
    if (conn.from.blockId === block.id) {
      connectedOutputs.add(conn.from.slotId);
    }
  }

  // Find matching slots
  const inputSlots = block.inputs.filter(s => connectedInputs.has(s.id));
  const outputSlots = block.outputs.filter(s => connectedOutputs.has(s.id));

  // Get block's lane kind from its definition or infer from category
  const blockLaneKind = getLaneKindFromBlock(block);

  // Filter compatible definitions
  return allDefinitions.filter(def => {
    // Don't suggest the same block type
    if (def.type === block.type) return false;

    // Must be in the same lane kind for valid replacement
    if (def.laneKind !== blockLaneKind) return false;

    // Don't suggest macros as replacements (they expand into multiple blocks)
    if (getBlockForm(def) === 'macro') return false;

    // Check if the new definition has compatible slots for all connected inputs
    for (const inputSlot of inputSlots) {
      const hasCompatibleInput = def.inputs.some(defSlot =>
        areTypesCompatible(inputSlot.type, defSlot.type)
      );
      if (!hasCompatibleInput) return false;
    }

    // Check if the new definition has compatible slots for all connected outputs
    for (const outputSlot of outputSlots) {
      const hasCompatibleOutput = def.outputs.some(defSlot =>
        areTypesCompatible(defSlot.type, outputSlot.type)
      );
      if (!hasCompatibleOutput) return false;
    }

    return true;
  });
}

/**
 * Get the lane kind from a block instance by looking up its definition.
 * Falls back to 'Scalars' if unknown (most common lane for math/utility blocks).
 */
function getLaneKindFromBlock(block: Block): string {
  // Look up the block definition to get the lane kind
  const def = getBlockDefinition(block.type);
  if (def?.laneKind) {
    return def.laneKind;
  }

  // Fallback: Check if block has a category that maps to a lane kind
  const categoryToLane: Record<string, string> = {
    'Time': 'Phase',
    'Math': 'Scalars',
    'Fields': 'Fields',
    'Field': 'Fields',
    'Render': 'Program',
    'Output': 'Program',
    'Program': 'Program',
    'Scene': 'Scene',
  };

  if (block.category && categoryToLane[block.category]) {
    return categoryToLane[block.category];
  }

  // Default to Scalars for most utility blocks (a valid LaneKind)
  return 'Scalars';
}

/**
 * Map connections from old block to new block definition.
 * Returns which connections can be preserved and which must be dropped.
 */
export function mapConnections(
  oldBlock: Block,
  newDef: BlockDefinition,
  connections: Connection[]
): ConnectionMapping {
  const preserved: ConnectionMapping['preserved'] = [];
  const dropped: ConnectionMapping['dropped'] = [];

  // Track which new slots have been used (for inputs - only one connection per input)
  const usedInputSlots = new Set<string>();

  for (const conn of connections) {
    // Handle input connections (to this block)
    if (conn.to.blockId === oldBlock.id) {
      const oldSlot = oldBlock.inputs.find(s => s.id === conn.to.slotId);
      if (!oldSlot) {
        dropped.push({
          connectionId: conn.id,
          reason: `Old slot ${conn.to.slotId} not found`,
        });
        continue;
      }

      // Find compatible new input slot
      const newSlot = findCompatibleSlot(oldSlot, newDef.inputs, usedInputSlots);
      if (newSlot) {
        usedInputSlots.add(newSlot.id);
        preserved.push({
          connectionId: conn.id,
          fromBlockId: conn.from.blockId,
          fromSlot: conn.from.slotId,
          toBlockId: oldBlock.id, // Will be replaced with new block ID
          toSlot: newSlot.id,
        });
      } else {
        dropped.push({
          connectionId: conn.id,
          reason: `No compatible input slot for ${oldSlot.label} (${oldSlot.type})`,
        });
      }
    }

    // Handle output connections (from this block)
    if (conn.from.blockId === oldBlock.id) {
      const oldSlot = oldBlock.outputs.find(s => s.id === conn.from.slotId);
      if (!oldSlot) {
        dropped.push({
          connectionId: conn.id,
          reason: `Old slot ${conn.from.slotId} not found`,
        });
        continue;
      }

      // Find compatible new output slot (outputs can have multiple connections)
      const newSlot = findCompatibleSlot(oldSlot, newDef.outputs, new Set());
      if (newSlot) {
        preserved.push({
          connectionId: conn.id,
          fromBlockId: oldBlock.id, // Will be replaced with new block ID
          fromSlot: newSlot.id,
          toBlockId: conn.to.blockId,
          toSlot: conn.to.slotId,
        });
      } else {
        dropped.push({
          connectionId: conn.id,
          reason: `No compatible output slot for ${oldSlot.label} (${oldSlot.type})`,
        });
      }
    }
  }

  return { preserved, dropped };
}

/**
 * Find a compatible slot in the candidate list that hasn't been used yet.
 * Prefers exact position match first, then type match.
 */
function findCompatibleSlot(
  oldSlot: Slot,
  candidateSlots: readonly Slot[],
  usedSlots: Set<string>
): Slot | null {
  // Try exact type match first
  for (const candidate of candidateSlots) {
    if (usedSlots.has(candidate.id)) continue;
    if (areTypesCompatible(oldSlot.type, candidate.type)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Copy compatible parameters from old block to new block definition.
 * Only copies parameters that exist in both blocks with the same key.
 */
export function copyCompatibleParams(
  oldParams: Record<string, unknown>,
  newDef: BlockDefinition
): Record<string, unknown> {
  const newParams = { ...newDef.defaultParams };

  // Copy any keys that exist in both old and new defaultParams
  for (const key of Object.keys(newDef.defaultParams)) {
    if (key in oldParams) {
      newParams[key] = oldParams[key];
    }
  }

  return newParams;
}
