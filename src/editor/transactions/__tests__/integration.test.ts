/**
 * @file Integration Tests for Undo/Redo
 * @description End-to-end tests verifying undo/redo works for store operations.
 *
 * These tests verify that store methods correctly use the transaction system
 * and that undo/redo produces the expected state changes.
 *
 * NOTE: Bus operation tests have been removed pending BusBlock architecture refactoring.
 * Publishers and Listeners have been replaced with unified Edge architecture.
 * These tests should be rewritten once the new architecture is complete.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { autorun } from 'mobx';
import type { Block, Edge } from '../../types';

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
    inputs: [{ id: 'in', type: 'Signal<float>', label: 'Input', direction: 'input' as const }],
    outputs: [{ id: 'out', type: 'Signal<float>', label: 'Output', direction: 'output' as const }],
    params: { value: 1 },
    category: 'Other',
  });

  // =============================================================================
  // Block Operations (via direct runTx)
  // =============================================================================

  describe('Block Operations (Transaction System)', () => {
    it('undoes block addition', async () => {
      const block = createTestBlock('block-1');
      const initialCount = rootStore.patchStore.userBlocks.length;

      // Add block via transaction
      const { runTx } = await import('../TxBuilder');
      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      expect(rootStore.patchStore.userBlocks.length).toBe(initialCount + 1);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeDefined();

      // Undo
      const undoResult = rootStore.historyStore.undo();
      expect(undoResult).toBe(true);
      expect(rootStore.patchStore.userBlocks.length).toBe(initialCount);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeUndefined();

      // Redo
      const redoResult = rootStore.historyStore.redo();
      expect(redoResult).toBe(true);
      expect(rootStore.patchStore.userBlocks.length).toBe(initialCount + 1);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeDefined();
    });

    it('undoes block removal', async () => {
      const { runTx } = await import('../TxBuilder');
      const block = createTestBlock('block-1');

      // Add block
      runTx(rootStore, { label: 'Add' }, tx => tx.add('blocks', block));
      const initialCount = rootStore.patchStore.userBlocks.length;

      // Remove block
      runTx(rootStore, { label: 'Remove' }, tx => tx.remove('blocks', 'block-1'));
      expect(rootStore.patchStore.userBlocks.length).toBe(initialCount - 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks.length).toBe(initialCount);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-1')).toBeDefined();

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.userBlocks.length).toBe(initialCount - 1);
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

      // Add edge
      const edge: Edge = {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
        to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
        enabled: true,
      role: { kind: 'user' },
      };
      runTx(rootStore, { label: 'Connect' }, tx => tx.add('edges', edge));

      const initialBlocks = rootStore.patchStore.userBlocks.length;
      const initialEdges = rootStore.patchStore.edges.length;

      // Remove block with cascade
      runTx(rootStore, { label: 'Remove' }, tx => tx.removeBlockCascade('block-2'));
      expect(rootStore.patchStore.userBlocks.length).toBe(initialBlocks - 1);
      expect(rootStore.patchStore.edges.length).toBe(initialEdges - 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks.length).toBe(initialBlocks);
      expect(rootStore.patchStore.edges.length).toBe(initialEdges);
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

      const initialEdges = rootStore.patchStore.edges.length;

      // Add edge
      const edge: Edge = {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
        to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
        enabled: true,
      role: { kind: 'user' },
      };
      runTx(rootStore, { label: 'Connect' }, tx => tx.add('edges', edge));
      expect(rootStore.patchStore.edges.length).toBe(initialEdges + 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.edges.length).toBe(initialEdges);

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.edges.length).toBe(initialEdges + 1);
    });

    it('undoes edge removal', async () => {
      const { runTx } = await import('../TxBuilder');
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2');
      const edge: Edge = {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
        to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
        enabled: true,
      role: { kind: 'user' },
      };

      runTx(rootStore, { label: 'Setup' }, tx => {
        tx.add('blocks', block1);
        tx.add('blocks', block2);
        tx.add('edges', edge);
      });

      const initialEdges = rootStore.patchStore.edges.length;

      // Remove edge
      runTx(rootStore, { label: 'Disconnect' }, tx => tx.remove('edges', 'edge-1'));
      expect(rootStore.patchStore.edges.length).toBe(initialEdges - 1);

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.edges.length).toBe(initialEdges);
      expect(rootStore.patchStore.edges.find(e => e.id === 'edge-1')).toBeDefined();

      // Redo
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.edges.length).toBe(initialEdges - 1);
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
      expect(rootStore.patchStore.userBlocks.length).toBe(1);

      // Step 2: Add block 2
      runTx(rootStore, { label: 'Add block 2' }, tx => tx.add('blocks', block2));
      expect(rootStore.patchStore.userBlocks.length).toBe(2);

      // Step 3: Connect blocks
      const edge: Edge = {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
        to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
        enabled: true,
      role: { kind: 'user' },
      };
      runTx(rootStore, { label: 'Connect' }, tx => tx.add('edges', edge));
      expect(rootStore.patchStore.edges.length).toBe(1);

      // Undo connect
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.edges.length).toBe(0);

      // Undo add block 2
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks.length).toBe(1);

      // Undo add block 1
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks.length).toBe(0);

      // Redo all
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.userBlocks.length).toBe(1);

      rootStore.historyStore.redo();
      expect(rootStore.patchStore.userBlocks.length).toBe(2);

      rootStore.historyStore.redo();
      expect(rootStore.patchStore.edges.length).toBe(1);
    });

    // TODO: Rewrite bus workflow test for new BusBlock/Edge architecture
    // The old test used publishers/listeners arrays which have been removed.
    // New test should verify BusBlock creation and edge-based pub/sub connections.
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
        const count = rootStore.patchStore.userBlocks.length;
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
      expect(rootStore.patchStore.userBlocks.length).toBe(0);
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
      expect(rootStore.patchStore.userBlocks.length).toBe(0);

      // New operation (creates branch)
      runTx(rootStore, { label: 'Add block 2' }, tx => tx.add('blocks', block2));
      expect(rootStore.patchStore.userBlocks.length).toBe(1);
      expect(rootStore.patchStore.blocks.find(b => b.id === 'block-2')).toBeDefined();
    });
  });
});
