/**
 * Patch Adapter
 *
 * Converts between RootStore format and SemanticValidator's PatchDocument format.
 * This allows the Validator to work with store data without tight coupling.
 */

import type { Block } from '../types';
import type { PatchDocument } from './types';
import type { RootStore } from '../stores/RootStore';
import { getBlockDefinition } from '../blocks/registry';

/**
 * Convert RootStore state to PatchDocument format for validation.
 *
 * This is a lightweight adapter - no deep cloning, just reshaping references.
 */
export function storeToPatchDocument(root: RootStore): PatchDocument {
  return {
    blocks: root.patchStore.blocks.map(block => blockToDocumentBlock(block)),
    edges: root.patchStore.edges,
  };
}

/**
 * Convert a Block to the minimal shape needed by PatchDocument.
 * Looks up the block definition from the registry to extract inputs/outputs.
 */
function blockToDocumentBlock(block: Block): PatchDocument['blocks'][number] {
  const blockDef = getBlockDefinition(block.type);

  if (!blockDef) {
    // Unknown block type - return minimal block with empty slots
    console.warn(`[patchAdapter] Unknown block type: ${block.type}`);
    return {
      id: block.id,
      type: block.type,
      inputs: [],
      outputs: [],
    };
  }

  return {
    id: block.id,
    type: block.type,
    // Keep slot.type as a string (it's a SlotType, which is a string type)
    inputs: blockDef.inputs.map(slot => ({ id: slot.id, type: slot.type })),
    outputs: blockDef.outputs.map(slot => ({ id: slot.id, type: slot.type })),
  };
}
