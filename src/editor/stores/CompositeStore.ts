/**
 * @file Composite Store
 * @description Manages saved block groups (composites).
 */
import { makeObservable, observable, action } from 'mobx';
import type { BlockId, Composite } from '../types';
import type { RootStore } from './RootStore';

/**
 * TimeRoot block types that are forbidden in composites.
 */
const TIME_ROOT_BLOCK_TYPES = new Set([
  'FiniteTimeRoot',
  'InfiniteTimeRoot',
]);

/**
 * Validation result for composite definition.
 */
interface CompositeValidationResult {
  ok: boolean;
  errors: Array<{
    code: string;
    message: string;
    blockId?: string;
  }>;
}

/**
 * Check if a block type is a TimeRoot block.
 */
function isTimeRootBlock(blockType: string): boolean {
  return TIME_ROOT_BLOCK_TYPES.has(blockType);
}

/**
 * Validate a composite definition.
 * Enforces that composites cannot contain TimeRoot blocks.
 */
export function validateCompositeDefinition(composite: Composite): CompositeValidationResult {
  const errors: Array<{
    code: string;
    message: string;
    blockId?: string;
  }> = [];

  // Check all blocks in the composite for TimeRoot types
  for (const block of composite.blocks) {
    if (isTimeRootBlock(block.type)) {
      errors.push({
        code: 'E_COMPOSITE_CONTAINS_TIMEROOT',
        message: `Composite definitions cannot contain TimeRoot blocks. Found ${block.type} in composite "${composite.name}". TimeRoot defines patch-level time topology and must be unique.`,
        blockId: block.id,
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export class CompositeStore {
  composites: Composite[] = []; // Saved macros

  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    makeObservable(this, {
      composites: observable,
      saveComposite: action,
      deleteComposite: action,
      instantiateComposite: action,
    });
  }

  // =============================================================================
  // Actions - Composite Management
  // =============================================================================

  /**
   * Save a composite definition.
   * Validates that the composite doesn't contain TimeRoot blocks.
   * @throws Error if validation fails
   */
  saveComposite(composite: Composite): void {
    const validation = validateCompositeDefinition(composite);

    if (!validation.ok) {
      const errorMessages = validation.errors.map(e => e.message).join('\n');
      throw new Error(`Composite validation failed:\n${errorMessages}`);
    }

    // Check if composite with same ID already exists and replace it
    const existingIndex = this.composites.findIndex(c => c.id === composite.id);
    if (existingIndex >= 0) {
      this.composites[existingIndex] = composite;
    } else {
      this.composites.push(composite);
    }
  }

  deleteComposite(id: string): void {
    this.composites = this.composites.filter((c) => c.id !== id);
  }

  instantiateComposite(compositeId: string, _position: { x: number; y: number }): void {
    const composite = this.composites.find((c) => c.id === compositeId);
    if (composite === undefined) {
      throw new Error(`Composite "${compositeId}" not found`);
    }

    // Create new blocks with updated IDs
    const idMap = new Map<BlockId, BlockId>();
    for (const block of composite.blocks) {
      // Use addBlock to ensure proper initialization and event emission
      const newId = this.root.patchStore.addBlock(block.type, block.params);
      idMap.set(block.id, newId);
    }

    // Create new connections with updated IDs
    for (const conn of composite.connections) {
      const fromId = idMap.get(conn.from.blockId);
      const toId = idMap.get(conn.to.blockId);
      if (fromId === undefined) {
        throw new Error(`Composite connection references unknown source block "${conn.from.blockId}"`);
      }
      if (toId === undefined) {
        throw new Error(`Composite connection references unknown target block "${conn.to.blockId}"`);
      }

      this.root.patchStore.connect(fromId, conn.from.slotId, toId, conn.to.slotId);
    }
  }
}
