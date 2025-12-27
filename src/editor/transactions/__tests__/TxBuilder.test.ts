/**
 * @file TxBuilder Tests
 * @description Tests for transaction builder and runTx function.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { runTx } from '../TxBuilder';
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

      const result = runTx(rootStore, { label: 'Add Block' }, tx => {
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
        runTx(rootStore, { label: 'Invalid Op' }, tx => {
          // Directly push an invalid op (bypass add() validation)
          (tx as any).ops.push({
            type: 'Add',
            table: 'blocks',
            entity: { type: 'test' }, // Missing id
          });
        });
      }).toThrow('Add op missing entity id');
    });

    it('applies ops atomically (all-or-nothing)', () => {
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

      expect(rootStore.patchStore.blocks).toHaveLength(2);
    });
  });

  describe('runTx()', () => {
    it('increments patch revision', () => {
      const initialRevision = rootStore.patchStore.patchRevision;

      runTx(rootStore, { label: 'Test' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Test',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      expect(rootStore.patchStore.patchRevision).toBe(initialRevision + 1);
    });

    it('emits GraphCommitted event with correct diff summary', () => {
      let emittedEvent: any;
      rootStore.events.on('GraphCommitted', (event) => {
        emittedEvent = event;
      });

      runTx(rootStore, { label: 'Add Blocks' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      expect(emittedEvent).toBeDefined();
      expect(emittedEvent.type).toBe('GraphCommitted');
      expect(emittedEvent.label).toBe('Add Blocks');

      const diffSummary = emittedEvent.diffSummary;
      expect(diffSummary).toMatchObject({
        blocksAdded: 2,
        blocksRemoved: 0,
        // Uses bindingsChanged instead of separate connection counts
        bindingsChanged: 0,
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

      let connections1: any[] = [];
      let connections2: any[] = [];

      runTx(rootStore, { label: 'Query' }, tx => {
        connections1 = (tx as any).getConnectionsForBlock('block-1');
        connections2 = (tx as any).getConnectionsForBlock('block-2');
      });

      expect(connections1).toHaveLength(1);
      expect(connections2).toHaveLength(1);
    });
  });

  describe('cascade helpers', () => {
    describe('removeBlockCascade()', () => {
      it('removes block and all dependencies', () => {
        // Setup: Create a block with connections, publishers, and listeners
        const block: Block = {
          id: 'block-1',
          type: 'test',
          label: 'Test Block',
          inputs: [{ id: 'in', label: 'In', type: 'Signal<number>', direction: 'input' }],
          outputs: [{ id: 'out', label: 'Out', type: 'Signal<number>', direction: 'output' }],
          params: {},
          category: 'Other',
        };

        const otherBlock: Block = {
          id: 'block-2',
          type: 'test',
          label: 'Other Block',
          inputs: [{ id: 'in', label: 'In', type: 'Signal<number>', direction: 'input' }],
          outputs: [{ id: 'out', label: 'Out', type: 'Signal<number>', direction: 'output' }],
          params: {},
          category: 'Other',
        };

        const bus: Bus = {
          id: 'bus-1',
          name: 'Test Bus',
          type: {
            world: 'signal',
            domain: 'number',
            category: 'core',
            busEligible: true,
          },
          combineMode: 'sum',
          defaultValue: 0,
          sortKey: 0,
        };

        runTx(rootStore, { label: 'Setup' }, tx => {
          tx.add('blocks', block);
          tx.add('blocks', otherBlock);
          tx.add('buses', bus);

          // Add connection from block-1 to block-2
          tx.add('connections', {
            id: 'conn-1',
            from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
            to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
          });

          // Add publisher from block-1
          tx.add('publishers', {
            id: 'pub-1',
            busId: 'bus-1',
            from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
            sortKey: 0,
            enabled: true,
          });

          // Add listener to block-1
          tx.add('listeners', {
            id: 'lis-1',
            busId: 'bus-1',
            to: { blockId: 'block-1', slotId: 'in', direction: 'input' },
            enabled: true,
          });
        });

        // Verify setup
        expect(rootStore.patchStore.blocks).toHaveLength(2);
        expect(rootStore.patchStore.connections).toHaveLength(1);
        expect(rootStore.busStore.publishers).toHaveLength(1);
        expect(rootStore.busStore.listeners).toHaveLength(1);

        // Remove block with cascade
        const result = runTx(rootStore, { label: 'Remove Block Cascade' }, tx => {
          tx.removeBlockCascade('block-1');
        });

        // Verify block removed
        expect(rootStore.patchStore.blocks).toHaveLength(1);
        expect(rootStore.patchStore.blocks[0].id).toBe('block-2');

        // Verify connections removed
        expect(rootStore.patchStore.connections).toHaveLength(0);

        // Verify publishers removed
        expect(rootStore.busStore.publishers).toHaveLength(0);

        // Verify listeners removed
        expect(rootStore.busStore.listeners).toHaveLength(0);

        // Verify cascade generated Many op
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0].type).toBe('Many');
        const manyOp = result.ops[0] as any;
        expect(manyOp.ops.length).toBeGreaterThan(1);

        // Verify inverse can recreate everything
        expect(result.inverseOps).toHaveLength(1);
        expect(result.inverseOps[0].type).toBe('Many');
      });

      it('throws if block does not exist', () => {
        expect(() => {
          runTx(rootStore, { label: 'Remove Nonexistent' }, tx => {
            tx.removeBlockCascade('nonexistent');
          });
        }).toThrow('Block nonexistent not found');
      });
    });

    describe('removeBusCascade()', () => {
      it('removes bus and all routing', () => {
        // Setup: Create bus with publishers and listeners
        const block1: Block = {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
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

        const bus: Bus = {
          id: 'bus-1',
          name: 'Test Bus',
          type: {
            world: 'signal',
            domain: 'number',
            category: 'core',
            busEligible: true,
          },
          combineMode: 'sum',
          defaultValue: 0,
          sortKey: 0,
        };

        // Record initial counts (default buses exist)
        const initialBusCount = rootStore.busStore.buses.length;

        runTx(rootStore, { label: 'Setup' }, tx => {
          tx.add('blocks', block1);
          tx.add('blocks', block2);
          tx.add('buses', bus);

          tx.add('publishers', {
            id: 'pub-1',
            busId: 'bus-1',
            from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
            sortKey: 0,
            enabled: true,
          });

          tx.add('listeners', {
            id: 'lis-1',
            busId: 'bus-1',
            to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
            enabled: true,
          });
        });

        // Verify setup (our bus added to defaults)
        expect(rootStore.busStore.buses).toHaveLength(initialBusCount + 1);
        expect(rootStore.busStore.publishers).toHaveLength(1);
        expect(rootStore.busStore.listeners).toHaveLength(1);

        // Remove bus with cascade
        const result = runTx(rootStore, { label: 'Remove Bus Cascade' }, tx => {
          tx.removeBusCascade('bus-1');
        });

        // Verify bus removed (back to initial count)
        expect(rootStore.busStore.buses).toHaveLength(initialBusCount);

        // Verify publishers removed
        expect(rootStore.busStore.publishers).toHaveLength(0);

        // Verify listeners removed
        expect(rootStore.busStore.listeners).toHaveLength(0);

        // Verify cascade generated Many op
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0].type).toBe('Many');
        const manyOp = result.ops[0] as any;
        expect(manyOp.ops).toHaveLength(3); // 1 publisher + 1 listener + 1 bus
      });

      it('throws if bus does not exist', () => {
        expect(() => {
          runTx(rootStore, { label: 'Remove Nonexistent Bus' }, tx => {
            tx.removeBusCascade('nonexistent');
          });
        }).toThrow('Bus nonexistent not found');
      });
    });
  });
});
