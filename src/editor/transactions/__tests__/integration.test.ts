/**
 * @file Integration Tests for Undo/Redo
 * @description End-to-end tests verifying undo/redo works for store operations.
 *
 * These tests verify that store methods correctly use the transaction system
 * and that undo/redo produces the expected state changes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { autorun } from 'mobx';
import type { Block, Bus, Connection } from '../../types';

describe('Undo/Redo Integration', () => {
  let rootStore: RootStore;

  beforeEach(() => {
    rootStore = new RootStore();
    rootStore.clearPatch();
  });

  // Helper to create a minimal test block
  const createTestBlock = (id: string, type: string = 'test'): Block => ({
    id,
    type,
    label: `Test ${type}`,
    inputs: [{ id: 'in', type: 'Signal<number>', label: 'Input', direction: 'input' as const }],
    outputs: [{ id: 'out', type: 'Signal<number>', label: 'Output', direction: 'output' as const }],
    params: { value: 1 },
    category: 'Other',
  });

  // Helper to create a minimal test bus
  const createTestBus = (id: string, name: string): Bus => ({
    id,
    name,
    type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    combineMode: 'last',
    defaultValue: 0,
    sortKey: 0,
    origin: 'user',
  });

  // =============================================================================
  // Block Operations (via direct runTx)
  // =============================================================================

  describe('Block Operations (Transaction System)', () => {
    it('undoes block addition', async () => {
      const block = createTestBlock('block-1');
      const initialCount = rootStore.patchStore.blocks.length;

      // Add block via transaction
      const { runTx } = await import('../TxBuilder');
      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      expect(rootStore.patchStore.blocks.length).toBe(initialCount + 1);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeDefined();

      // Undo
      const undoResult = rootStore.historyStore.undo();
      expect(undoResult).toBe(true);
      expect(rootStore.patchStore.blocks.length).toBe(initialCount);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeUndefined();

      // Redo
      const redoResult = rootStore.historyStore.redo();
      expect(redoResult).toBe(true);
      expect(rootStore.patchStore.blocks.length).toBe(initialCount + 1);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeDefined();
    });

    it('undoes block removal', async () => {
      const { runTx } = await import('../TxBuilder');
      const block = createTestBlock('block-1');

      // Add block
      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));
      const initialCount = rootStore.patchStore.blocks.length;

      // Remove block
      runTx(rootStore, { label: 'Remove' }, tx => tx.remove('blocks', 'block-1'));
      expect(rootStore.patchStore.blocks.length).toBe(initialCount - 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.length).toBe(initialCount);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeDefined();

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.blocks.length).toBe(initialCount - 1);
    });

    it('undoes block update', async () => {
      const { runTx } = await import('../TxBuilder');
      const block = createTestBlock('block-1');

      // Add block
      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));

      // Update block
      const updated = { ...block, label: 'Updated Label' };
      runTx(rootStore, { label: 'Update' }, tx => tx.replace('blocks', 'block-1', updated));
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.label).toBe('Updated Label');

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.label).toBe('Test test');

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.label).toBe('Updated Label');
    });

    it('undoes block cascade removal', async () => {
      const { runTx } = await import('../TxBuilder');
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2');

      // Add blocks
      runTx(rootStore, { label: 'Add blocks' }, tx => {
        tx.add('blocks', block1);
        tx.add('blocks', block2);
      });

      // Add connection
      const connection: Connection = {
        id: 'conn-1',
        from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
        to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
      };
      runTx(rootStore, { label: 'Connect' }, tx => tx.add('connections', connection));

      const initialBlocks = rootStore.patchStore.blocks.length;
      const initialConnections = rootStore.patchStore.connections.length;

      // Remove block with cascade
      runTx(rootStore, { label: 'Remove' }, tx => tx.removeBlockCascade('block-2'));
      expect(rootStore.patchStore.blocks.length).toBe(initialBlocks - 1);
      expect(rootStore.patchStore.connections.length).toBe(initialConnections - 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.length).toBe(initialBlocks);
      expect(rootStore.patchStore.connections.length).toBe(initialConnections);
    });

    it('handles multiple param updates', async () => {
      const { runTx } = await import('../TxBuilder');
      const block = createTestBlock('block-1');

      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));

      // First update
      const updated1 = { ...block, params: { value: 2 } };
      runTx(rootStore, { label: 'Update 1' }, tx => tx.replace('blocks', 'block-1', updated1));
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.params.value).toBe(2);

      // Second update
      const updated2 = { ...updated1, params: { value: 3 } };
      runTx(rootStore, { label: 'Update 2' }, tx => tx.replace('blocks', 'block-1', updated2));
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.params.value).toBe(3);

      // Undo once
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.params.value).toBe(2);

      // Undo again
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.params.value).toBe(1);

      // Redo twice
      rootStore.historyStore.redo();
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')!.params.value).toBe(3);
    });
  });

  // =============================================================================
  // Connection Operations
  // =============================================================================

  describe('Connection Operations', () => {
    it('undoes connection addition', async () => {
      const { runTx } = await import('../TxBuilder');
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2');

      runTx(rootStore, { label: 'Add blocks' }, tx => {
        tx.add('blocks', block1);
        tx.add('blocks', block2);
      });

      const initialConnections = rootStore.patchStore.connections.length;

      // Add connection
      const connection: Connection = {
        id: 'conn-1',
        from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
        to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
      };
      runTx(rootStore, { label: 'Connect' }, tx => tx.add('connections', connection));
      expect(rootStore.patchStore.connections.length).toBe(initialConnections + 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.connections.length).toBe(initialConnections);

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.connections.length).toBe(initialConnections + 1);
    });

    it('undoes connection removal', async () => {
      const { runTx } = await import('../TxBuilder');
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2');
      const connection: Connection = {
        id: 'conn-1',
        from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
        to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
      };

      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('blocks', block1);
        tx.add('blocks', block2);
        tx.add('connections', connection);
      });

      const initialConnections = rootStore.patchStore.connections.length;

      // Remove connection
      runTx(rootStore, { label: 'Disconnect' }, tx => tx.remove('connections', 'conn-1'));
      expect(rootStore.patchStore.connections.length).toBe(initialConnections - 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.connections.length).toBe(initialConnections);
      expect(rootStore.patchStore.connections.find(c => c.id === 'conn-1')).toBeDefined();

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.connections.length).toBe(initialConnections - 1);
    });
  });

  // =============================================================================
  // Bus Operations
  // =============================================================================

  describe('Bus Operations', () => {
    it('undoes bus creation', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'TestBus');
      const initialCount = rootStore.busStore.buses.length;

      // Add bus
      runTx(rootStore, { label: 'Create Bus' }, tx => tx.add('buses', bus));
      expect(rootStore.busStore.buses.length).toBe(initialCount + 1);
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')).toBeDefined();

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.busStore.buses.length).toBe(initialCount);
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')).toBeUndefined();

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.busStore.buses.length).toBe(initialCount + 1);
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')).toBeDefined();
    });

    it('undoes bus deletion with cascade', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'TestBus');
      const block = createTestBlock('block-1');

      // Setup bus with publisher
      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('buses', bus);
        tx.add('blocks', block);
        tx.add('publishers', {
          id: 'pub-1',
          busId: 'bus-1',
          from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
          enabled: true,
          sortKey: 0,
        });
      });

      const initialBuses = rootStore.busStore.buses.length;
      const initialPublishers = rootStore.busStore.publishers.length;

      // Delete bus (cascade)
      runTx(rootStore, { label: 'Delete Bus' }, tx => tx.removeBusCascade('bus-1'));
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')).toBeUndefined();
      expect(rootStore.busStore.publishers.find(p => p.id === 'pub-1')).toBeUndefined();

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.busStore.buses.length).toBe(initialBuses);
      expect(rootStore.busStore.publishers.length).toBe(initialPublishers);
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')).toBeDefined();
      expect(rootStore.busStore.publishers.find(p => p.id === 'pub-1')).toBeDefined();
    });

    it('undoes bus update', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'Original');

      runTx(rootStore, { label: 'Add' }, tx => tx.add('buses', bus));

      // Update bus
      const updated = { ...bus, name: 'Updated' };
      runTx(rootStore, { label: 'Update' }, tx => tx.replace('buses', 'bus-1', updated));
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')!.name).toBe('Updated');

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')!.name).toBe('Original');

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')!.name).toBe('Updated');
    });
  });

  // =============================================================================
  // Publisher/Listener Operations
  // =============================================================================

  describe('Publisher/Listener Operations', () => {
    it('undoes publisher addition', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'TestBus');
      const block = createTestBlock('block-1');

      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('buses', bus);
        tx.add('blocks', block);
      });

      const initialCount = rootStore.busStore.publishers.length;

      // Add publisher
      runTx(rootStore, { label: 'Add Publisher' }, tx => {
        tx.add('publishers', {
          id: 'pub-1',
          busId: 'bus-1',
          from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
          enabled: true,
          sortKey: 0,
        });
      });
      expect(rootStore.busStore.publishers.length).toBe(initialCount + 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.busStore.publishers.length).toBe(initialCount);

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.busStore.publishers.length).toBe(initialCount + 1);
    });

    it('undoes listener addition', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'TestBus');
      const block = createTestBlock('block-1');

      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('buses', bus);
        tx.add('blocks', block);
      });

      const initialCount = rootStore.busStore.listeners.length;

      // Add listener
      runTx(rootStore, { label: 'Add Listener' }, tx => {
        tx.add('listeners', {
          id: 'listener-1',
          busId: 'bus-1',
          to: { blockId: 'block-1', slotId: 'in', direction: 'input' },
          enabled: true,
        });
      });
      expect(rootStore.busStore.listeners.length).toBe(initialCount + 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.busStore.listeners.length).toBe(initialCount);

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.busStore.listeners.length).toBe(initialCount + 1);
    });

    it('undoes publisher update', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'TestBus');
      const block = createTestBlock('block-1');
      const publisher = {
        id: 'pub-1',
        busId: 'bus-1',
        from: { blockId: 'block-1', slotId: 'out', direction: 'output' as const },
        enabled: true,
        sortKey: 0,
      };

      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('buses', bus);
        tx.add('blocks', block);
        tx.add('publishers', publisher);
      });

      // Update publisher
      const updated = { ...publisher, enabled: false };
      runTx(rootStore, { label: 'Update' }, tx => tx.replace('publishers', 'pub-1', updated));
      expect(rootStore.busStore.publishers.find(p => p.id === 'pub-1')!.enabled).toBe(false);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.busStore.publishers.find(p => p.id === 'pub-1')!.enabled).toBe(true);

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.busStore.publishers.find(p => p.id === 'pub-1')!.enabled).toBe(false);
    });

    it('undoes listener update', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'TestBus');
      const block = createTestBlock('block-1');
      const listener = {
        id: 'listener-1',
        busId: 'bus-1',
        to: { blockId: 'block-1', slotId: 'in', direction: 'input' as const },
        enabled: true,
      };

      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('buses', bus);
        tx.add('blocks', block);
        tx.add('listeners', listener);
      });

      // Update listener
      const updated = { ...listener, enabled: false };
      runTx(rootStore, { label: 'Update' }, tx => tx.replace('listeners', 'listener-1', updated));
      expect(rootStore.busStore.listeners.find(l => l.id === 'listener-1')!.enabled).toBe(false);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.busStore.listeners.find(l => l.id === 'listener-1')!.enabled).toBe(true);

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.busStore.listeners.find(l => l.id === 'listener-1')!.enabled).toBe(false);
    });
  });

  // =============================================================================
  // Multi-Step Undo/Redo
  // =============================================================================

  describe('Multi-Step Undo/Redo', () => {
    it('handles multiple operations with undo/redo', async () => {
      const { runTx } = await import('../TxBuilder');
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2');

      // Step 1: Add block 1
      runTx(rootStore, { label: 'Add block 1' }, tx => tx.add('blocks', block1));
      expect(rootStore.patchStore.blocks.length).toBe(1);

      // Step 2: Add block 2
      runTx(rootStore, { label: 'Add block 2' }, tx => tx.add('blocks', block2));
      expect(rootStore.patchStore.blocks.length).toBe(2);

      // Step 3: Connect blocks
      const connection: Connection = {
        id: 'conn-1',
        from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
        to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
      };
      runTx(rootStore, { label: 'Connect' }, tx => tx.add('connections', connection));
      expect(rootStore.patchStore.connections.length).toBe(1);

      // Undo connect
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.connections.length).toBe(0);

      // Undo add block 2
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.length).toBe(1);

      // Undo add block 1
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.length).toBe(0);

      // Redo all
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.blocks.length).toBe(1);

      rootStore.historyStore.redo();
      expect(rootStore.patchStore.blocks.length).toBe(2);

      rootStore.historyStore.redo();
      expect(rootStore.patchStore.connections.length).toBe(1);
    });

    it('handles complex bus workflow', async () => {
      const { runTx } = await import('../TxBuilder');
      const bus = createTestBus('bus-1', 'TestBus');
      const block = createTestBlock('block-1');

      // Create bus
      runTx(rootStore, { label: 'Create bus' }, tx => tx.add('buses', bus));
      runTx(rootStore, { label: 'Create block' }, tx => tx.add('blocks', block));
      runTx(rootStore, { label: 'Add publisher' }, tx => {
        tx.add('publishers', {
          id: 'pub-1',
          busId: 'bus-1',
          from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
          enabled: true,
          sortKey: 0,
        });
      });
      runTx(rootStore, { label: 'Update bus' }, tx => {
        const updated = { ...bus, name: 'UpdatedBus' };
        tx.replace('buses', 'bus-1', updated);
      });

      // Verify state
      expect(rootStore.busStore.buses.length).toBeGreaterThan(0);
      expect(rootStore.busStore.publishers.length).toBe(1);
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')!.name).toBe('UpdatedBus');

      // Undo all operations
      rootStore.historyStore.undo(); // Update bus
      expect(rootStore.busStore.buses.find(b => b.id === 'bus-1')!.name).toBe('TestBus');

      rootStore.historyStore.undo(); // Remove publisher
      expect(rootStore.busStore.publishers.length).toBe(0);

      rootStore.historyStore.undo(); // Remove block
      rootStore.historyStore.undo(); // Remove bus
    });
  });

  // =============================================================================
  // MobX Reactivity
  // =============================================================================

  describe('MobX Reactivity', () => {
    it('triggers MobX reactions on undo/redo', async () => {
      const { runTx } = await import('../TxBuilder');
      const block = createTestBlock('block-1');
      const reactions: string[] = [];

      // Setup observer
      const dispose = autorun(() => {
        const count = rootStore.patchStore.blocks.length;
        reactions.push(`blocks:${count}`);
      });

      // Initial state
      expect(reactions).toContain('blocks:0');
      reactions.length = 0;

      // Add block
      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));
      expect(reactions).toContain('blocks:1');
      reactions.length = 0;

      // Undo
      rootStore.historyStore.undo();
      expect(reactions).toContain('blocks:0');
      reactions.length = 0;

      // Redo
      rootStore.historyStore.redo();
      expect(reactions).toContain('blocks:1');

      dispose();
    });

    it('triggers reactions for param changes', async () => {
      const { runTx } = await import('../TxBuilder');
      const block = createTestBlock('block-1');
      const reactions: number[] = [];

      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));

      const dispose = autorun(() => {
        const b = rootStore.patchStore.blocks.find(b => b.id === 'block-1');
        if (b) {
          reactions.push(b.params.value as number);
        }
      });

      // Initial reaction
      expect(reactions).toContain(1);
      reactions.length = 0;

      // Update param
      const updated = { ...block, params: { value: 42 } };
      runTx(rootStore, { label: 'Update' }, tx => tx.replace('blocks', 'block-1', updated));
      expect(reactions).toContain(42);
      reactions.length = 0;

      // Undo
      rootStore.historyStore.undo();
      expect(reactions).toContain(1);
      reactions.length = 0;

      // Redo
      rootStore.historyStore.redo();
      expect(reactions).toContain(42);

      dispose();
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('handles undo at root gracefully', () => {
      const result = rootStore.historyStore.undo();
      expect(result).toBe(false);
      expect(rootStore.patchStore.blocks.length).toBe(0);
    });

    it('handles redo at leaf gracefully', () => {
      const result = rootStore.historyStore.redo();
      expect(result).toBe(false);
    });

    it('handles branching after undo', async () => {
      const { runTx } = await import('../TxBuilder');
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2');

      // Create initial state
      runTx(rootStore, { label: 'Add block 1' }, tx => tx.add('blocks', block1));

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.blocks.length).toBe(0);

      // New operation (creates branch)
      runTx(rootStore, { label: 'Add block 2' }, tx => tx.add('blocks', block2));
      expect(rootStore.patchStore.blocks.length).toBe(1);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-2')).toBeDefined();
    });
  });
});
