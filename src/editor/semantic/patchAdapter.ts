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
    blocks: root.patchStore.blocks.map(block => blockToDocumentBlock(block)),
    edges: root.patchStore.edges,
  };
}

/**
 * Convert a Block to the minimal shape needed by PatchDocument.
 * TODO: Block doesn't have inputs/outputs; we need to get them from BlockDef.
 * For now, return empty arrays to fix type errors.
 */
function blockToDocumentBlock(block: Block): PatchDocument['blocks'][number] {
  // TODO: Get BlockDef from registry to extract inputs/outputs
  // const blockDef = registry.getBlockDef(block.type);
  // if (!blockDef) { return minimal block }

  return {
    id: block.id,
    type: block.type,
    inputs: [],  // TODO: Get from BlockDef
    outputs: [], // TODO: Get from BlockDef
  };
}
