/**
 * @file TxBuilder Tests
 * @description Tests for transaction builder and runTx function.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { runTx, TxBuilder } from '../TxBuilder';
import type { Block, Bus } from '../../types';

describe('TxBuilder', () => {
  let rootStore: RootStore;

  beforeEach(() => {
    rootStore = new RootStore();
    rootStore.clearPatch();
  });

  describe('add()', () => {
    it('adds a block to the store', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test Block',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const result = runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      expect(rootStore.patchStore.blocks).toHaveLength(1);
      expect(rootStore.patchStore.blocks[0]).toEqual(block);
      expect(result.ops).toHaveLength(1);
      expect(result.ops[0]).toMatchObject({
        type: 'Add',
        table: 'blocks',
        entity: block,
      });
    });

    it('throws if entity already exists', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      expect(() => {
        runTx(rootStore, { label: 'Add Duplicate' }, tx => {
          tx.add('blocks', block);
        });
      }).toThrow('already exists');
    });

    it('throws if entity has no id', () => {
      expect(() => {
        runTx(rootStore, { label: 'Add Invalid' }, tx => {
          tx.add('blocks', { type: 'test' } as any);
        });
      }).toThrow('without id');
    });
  });

  describe('remove()', () => {
    it('removes a block from the store', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));

      const result = runTx(rootStore, { label: 'Remove' }, tx => {
        tx.remove('blocks', 'block-1');
      });

      expect(rootStore.patchStore.blocks).toHaveLength(0);
      expect(result.ops[0]).toMatchObject({
        type: 'Remove',
        table: 'blocks',
        id: 'block-1',
        removed: block,
      });
    });

    it('throws if entity does not exist', () => {
      expect(() => {
        runTx(rootStore, { label: 'Remove Missing' }, tx => {
          tx.remove('blocks', 'nonexistent');
        });
      }).toThrow('not found');
    });
  });

  describe('replace()', () => {
    it('replaces a block with updated version', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Original',
        inputs: [],
        outputs: [],
        params: { value: 1 },
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));

      const updated: Block = {
        ...block,
        label: 'Updated',
        params: { value: 2 },
      };

      const result = runTx(rootStore, { label: 'Update' }, tx => {
        tx.replace('blocks', 'block-1', updated);
      });

      expect(rootStore.patchStore.blocks[0].label).toBe('Updated');
      expect(rootStore.patchStore.blocks[0].params).toEqual({ value: 2 });
      expect(result.ops[0]).toMatchObject({
        type: 'Update',
        table: 'blocks',
        id: 'block-1',
      });
    });

    it('preserves MobX reactivity by mutating in place', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Original',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));

      const originalReference = rootStore.patchStore.blocks[0];

      const updated: Block = { ...block, label: 'Updated' };

      runTx(rootStore, { label: 'Update' }, tx => {
        tx.replace('blocks', 'block-1', updated);
      });

      // Same object reference (mutated in place)
      expect(rootStore.patchStore.blocks[0]).toBe(originalReference);
      expect(rootStore.patchStore.blocks[0].label).toBe('Updated');
    });

    it('throws if entity does not exist', () => {
      expect(() => {
        runTx(rootStore, { label: 'Update Missing' }, tx => {
          const block: Block = {
            id: 'nonexistent',
            type: 'test',
            label: 'Test',
            inputs: [],
            outputs: [],
            params: {},
            category: 'Other',
          };
          tx.replace('blocks', 'nonexistent', block);
        });
      }).toThrow('not found');
    });

    it('throws if id mismatch', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));

      expect(() => {
        runTx(rootStore, { label: 'Update with Wrong ID' }, tx => {
          const updated = { ...block, id: 'block-2' };
          tx.replace('blocks', 'block-1', updated as Block);
        });
      }).toThrow('id mismatch');
    });
  });

  describe('many()', () => {
    it('groups multiple ops together', () => {
      const block1: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Block 1',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const block2: Block = {
        id: 'block-2',
        type: 'test',
        label: 'Block 2',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const result = runTx(rootStore, { label: 'Add Multiple' }, tx => {
        tx.many(() => {
          tx.add('blocks', block1);
          tx.add('blocks', block2);
        });
      });

      expect(rootStore.patchStore.blocks).toHaveLength(2);
      expect(result.ops).toHaveLength(1);
      expect(result.ops[0].type).toBe('Many');
      expect((result.ops[0] as any).ops).toHaveLength(2);
    });
  });

  // NOTE: setBlockPosition tests skipped - ViewStore doesn't have blockPositions Map yet
  // This will be implemented when we migrate ViewStateStore to use transactions

  describe('commit()', () => {
    it('computes inverse ops correctly', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const result = runTx(rootStore, { label: 'Add' }, tx => {
        tx.add('blocks', block);
      });

      expect(result.inverseOps).toHaveLength(1);
      expect(result.inverseOps[0]).toMatchObject({
        type: 'Remove',
        table: 'blocks',
        id: 'block-1',
        removed: block,
      });
    });

    it('validates ops before applying', () => {
      expect(() => {
        runTx(rootStore, { label: 'Invalid' }, tx => {
          // Force an invalid op by bypassing type checks
          (tx as any).ops.push({
            type: 'Add',
            table: 'blocks',
            entity: { type: 'test' }, // Missing id
          });
        });
      }).toThrow('missing entity id');
    });
  });

  describe('runTx()', () => {
    it('increments patch revision', () => {
      const initialRevision = rootStore.patchStore.patchRevision;

      runTx(rootStore, { label: 'Test' }, tx => {
        // Empty transaction
      });

      expect(rootStore.patchStore.patchRevision).toBe(initialRevision + 1);
    });

    it('emits GraphCommitted event', () => {
      let eventEmitted = false;
      let eventPayload: any;

      rootStore.events.on('GraphCommitted', event => {
        eventEmitted = true;
        eventPayload = event;
      });

      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      expect(eventEmitted).toBe(true);
      expect(eventPayload.type).toBe('GraphCommitted');
      expect(eventPayload.label).toBe('Add Block');
      expect(eventPayload.diff.blocksAdded).toBe(1);
    });

    it('computes diff summary correctly', () => {
      let diffSummary: any;

      rootStore.events.on('GraphCommitted', event => {
        diffSummary = event.diff;
      });

      const block1: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Block 1',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const block2: Block = {
        id: 'block-2',
        type: 'test',
        label: 'Block 2',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add Multiple' }, tx => {
        tx.add('blocks', block1);
        tx.add('blocks', block2);
      });

      expect(diffSummary).toMatchObject({
        blocksAdded: 2,
        blocksRemoved: 0,
        connectionsAdded: 0,
        connectionsRemoved: 0,
      });
    });

    it('rolls back on error', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      expect(() => {
        runTx(rootStore, { label: 'Failed Transaction' }, tx => {
          tx.add('blocks', block);
          throw new Error('Intentional error');
        });
      }).toThrow('Intentional error');

      // Store should be unchanged
      expect(rootStore.patchStore.blocks).toHaveLength(0);
    });
  });

  describe('lookup helpers', () => {
    it('getConnectionsForBlock returns all connections involving block', () => {
      const block1: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Block 1',
        inputs: [{ id: 'in', label: 'In', type: 'Signal<number>', direction: 'input' }],
        outputs: [{ id: 'out', label: 'Out', type: 'Signal<number>', direction: 'output' }],
        params: {},
        category: 'Other',
      };

      const block2: Block = {
        id: 'block-2',
        type: 'test',
        label: 'Block 2',
        inputs: [{ id: 'in', label: 'In', type: 'Signal<number>', direction: 'input' }],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('blocks', block1);
        tx.add('blocks', block2);
        tx.add('connections', {
          id: 'conn-1',
          from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
          to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
        });
      });

      let connections1: any[];
      let connections2: any[];

      runTx(rootStore, { label: 'Query' }, tx => {
        connections1 = (tx as any).getConnectionsForBlock('block-1');
        connections2 = (tx as any).getConnectionsForBlock('block-2');
      });

      expect(connections1).toHaveLength(1);
      expect(connections2).toHaveLength(1);
    });
  });
});
