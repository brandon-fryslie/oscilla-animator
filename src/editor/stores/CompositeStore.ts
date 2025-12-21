/**
 * @file Composite Store
 * @description Manages saved block groups (composites).
 */
import { makeObservable, observable, action } from 'mobx';
import type { Block, BlockId, Composite, Connection, LaneId } from '../types';
import type { RootStore } from './RootStore';

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

  saveComposite(composite: Composite): void {
    this.composites.push(composite);
  }

  deleteComposite(id: string): void {
    this.composites = this.composites.filter((c) => c.id !== id);
  }

  instantiateComposite(compositeId: string, laneId: LaneId, _position: { x: number; y: number }): void {
    const composite = this.composites.find((c) => c.id === compositeId);
    if (!composite) {
      throw new Error(`Composite "${compositeId}" not found`);
    }

    const lane = this.root.patchStore.lanes.find((l) => l.id === laneId);
    if (!lane) {
      throw new Error(`Lane "${laneId}" not found for composite instantiation`);
    }

    // Create new blocks with updated IDs
    const idMap = new Map<BlockId, BlockId>();
    for (const block of composite.blocks) {
      const newId = this.root.patchStore.generateBlockId();
      idMap.set(block.id, newId);

      const newBlock: Block = {
        ...block,
        id: newId,
      };

      this.root.patchStore.blocks.push(newBlock);
      lane.blockIds.push(newId);
    }

    // Create new connections with updated IDs
    for (const conn of composite.connections) {
      const fromId = idMap.get(conn.from.blockId);
      const toId = idMap.get(conn.to.blockId);
      if (!fromId) {
        throw new Error(`Composite connection references unknown source block "${conn.from.blockId}"`);
      }
      if (!toId) {
        throw new Error(`Composite connection references unknown target block "${conn.to.blockId}"`);
      }

      const newConn: Connection = {
        id: this.root.patchStore.generateConnectionId(),
        from: { blockId: fromId, slotId: conn.from.slotId },
        to: { blockId: toId, slotId: conn.to.slotId },
      };

      this.root.patchStore.connections.push(newConn);
    }
  }
}
