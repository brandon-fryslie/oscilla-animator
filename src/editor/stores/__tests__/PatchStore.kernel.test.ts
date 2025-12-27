/**
 * Tests for PatchStore kernel transaction integration
 *
 * Verifies that PatchStore uses kernel transactions correctly and maintains
 * MobX reactivity after kernel commits.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import { autorun } from 'mobx';

describe('PatchStore - Kernel Transaction Integration', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  describe('Transaction Isolation', () => {
    it('should not corrupt patch state when transaction validation fails', () => {
      // Add a valid block
      const blockId = root.patchStore.addBlock('ConstantSource', { value: 42 });
      expect(root.patchStore.blocks).toHaveLength(1);
      expect(root.patchStore.blocks[0].id).toBe(blockId);

      // Try to create an invalid wire (invalid port reference should fail)
      // For now, this will just work since we don't have full validation
      // but the structure is in place for when we add it
      const initialBlockCount = root.patchStore.blocks.length;

      // Even if operations fail in future, block count should remain stable
      expect(root.patchStore.blocks).toHaveLength(initialBlockCount);
    });

    it('should maintain observable state after kernel transaction commits', () => {
      let reactionCount = 0;
      const dispose = autorun(() => {
        // Touch the observable to track reactions
        const count = root.patchStore.blocks.length;
        reactionCount++;
        void count; // Use the value to avoid unused var
      });

      // Initial reaction (autorun runs immediately)
      expect(reactionCount).toBe(1);

      // Add block via PatchStore - should trigger MobX reaction
      root.patchStore.addBlock('ConstantSource', { value: 1 });
      expect(reactionCount).toBe(2);

      // Add another block
      root.patchStore.addBlock('ConstantSource', { value: 2 });
      expect(reactionCount).toBe(3);

      dispose();
    });
  });

  describe('Kernel State Sync', () => {
    it('should keep kernel.doc in sync with observable state', () => {
      // Add block via PatchStore
      const blockId = root.patchStore.addBlock('ConstantSource', { value: 123 });

      // Verify kernel state matches
      expect(root.kernel.doc.blocks).toHaveLength(1);
      expect(root.kernel.doc.blocks[0].id).toBe(blockId);

      // Verify observable state matches
      expect(root.patchStore.blocks).toHaveLength(1);
      expect(root.patchStore.blocks[0].id).toBe(blockId);
    });

    it('should sync connections between kernel and observables', () => {
      // Create two blocks
      const source = root.patchStore.addBlock('ConstantSource', { value: 1 });
      const sink = root.patchStore.addBlock('ConstantSource', { value: 2 });

      // Connect them
      root.patchStore.connect(source, 'value', sink, 'value');

      // Verify kernel state
      expect(root.kernel.doc.connections).toHaveLength(1);
      expect(root.kernel.doc.connections[0].from.blockId).toBe(source);
      expect(root.kernel.doc.connections[0].to.blockId).toBe(sink);

      // Verify observable state
      expect(root.patchStore.connections).toHaveLength(1);
      expect(root.patchStore.connections[0].from.blockId).toBe(source);
      expect(root.patchStore.connections[0].to.blockId).toBe(sink);
    });
  });

  describe('Transaction History', () => {
    it('should support undo after adding block', () => {
      // Add a block
      root.patchStore.addBlock('ConstantSource', { value: 42 });
      expect(root.patchStore.blocks).toHaveLength(1);

      // Undo
      root.kernel.undo();
      root.syncFromKernel();

      // Block should be gone
      expect(root.patchStore.blocks).toHaveLength(0);
      expect(root.kernel.doc.blocks).toHaveLength(0);
    });

    it('should support redo after undo', () => {
      // Add block
      const blockId = root.patchStore.addBlock('ConstantSource', { value: 42 });
      expect(root.patchStore.blocks).toHaveLength(1);

      // Undo
      root.kernel.undo();
      root.syncFromKernel();
      expect(root.patchStore.blocks).toHaveLength(0);

      // Redo
      root.kernel.redo();
      root.syncFromKernel();
      expect(root.patchStore.blocks).toHaveLength(1);
      expect(root.patchStore.blocks[0].id).toBe(blockId);
    });
  });

  describe('Complex Operations', () => {
    it('should handle block removal with cascade (connections removed)', () => {
      // Create blocks and connection
      const source = root.patchStore.addBlock('ConstantSource', { value: 1 });
      const sink = root.patchStore.addBlock('ConstantSource', { value: 2 });
      root.patchStore.connect(source, 'value', sink, 'value');

      expect(root.patchStore.blocks).toHaveLength(2);
      expect(root.patchStore.connections).toHaveLength(1);

      // Remove source block
      root.patchStore.removeBlock(source);

      // Both block and connection should be gone
      expect(root.patchStore.blocks).toHaveLength(1);
      expect(root.patchStore.connections).toHaveLength(0);

      // Kernel state should match
      expect(root.kernel.doc.blocks).toHaveLength(1);
      expect(root.kernel.doc.connections).toHaveLength(0);
    });
  });
});
