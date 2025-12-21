/**
 * Patch Adapter
 *
 * Converts between RootStore format and SemanticValidator's PatchDocument format.
 * This allows the Validator to work with store data without tight coupling.
 */

import type { Block } from '../types';
import type { PatchDocument } from './types';
import type { RootStore } from '../stores/RootStore';

/**
 * Convert RootStore state to PatchDocument format for validation.
 *
 * This is a lightweight adapter - no deep cloning, just reshaping references.
 */
export function storeToPatchDocument(root: RootStore): PatchDocument {
  return {
    blocks: root.patchStore.blocks.map(blockToDocumentBlock),
    connections: root.patchStore.connections,
    buses: root.busStore.buses,
    publishers: root.busStore.publishers,
    listeners: root.busStore.listeners,
  };
}

/**
 * Convert a Block to the minimal shape needed by PatchDocument.
 */
function blockToDocumentBlock(block: Block): PatchDocument['blocks'][number] {
  return {
    id: block.id,
    type: block.type,
    inputs: block.inputs.map(slot => ({ id: slot.id, type: slot.type })),
    outputs: block.outputs.map(slot => ({ id: slot.id, type: slot.type })),
  };
}
