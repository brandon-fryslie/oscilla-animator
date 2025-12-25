/**
 * RootStore Event Listener Tests
 *
 * Tests that RootStore event listeners correctly coordinate cross-store actions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';

describe('RootStore - Event Listeners', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  describe('BusDeleted event listener', () => {
    it('clears selectedBusId when selected bus is deleted', () => {
      // Create and select a bus
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      root.uiStore.uiState.selectedBusId = busId;
      expect(root.uiStore.uiState.selectedBusId).toBe(busId);

      // Delete the selected bus
      root.busStore.deleteBus(busId);

      // Selection should be cleared by event listener
      expect(root.uiStore.uiState.selectedBusId).toBeNull();
    });

    it('preserves selectedBusId when non-selected bus is deleted', () => {
      // Create two buses
      const busId1 = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'bus1',
        'last'
      );

      const busId2 = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'bus2',
        'last'
      );

      // Select bus1
      root.uiStore.uiState.selectedBusId = busId1;

      // Delete bus2 (not selected)
      root.busStore.deleteBus(busId2);

      // Selection should remain on bus1
      expect(root.uiStore.uiState.selectedBusId).toBe(busId1);
    });

    it('does nothing when no bus is selected', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      root.uiStore.uiState.selectedBusId = null;

      // Delete bus with no selection
      root.busStore.deleteBus(busId);

      // Selection should remain null
      expect(root.uiStore.uiState.selectedBusId).toBeNull();
    });

    it('handles default buses being deleted', () => {
      // Get one of the default buses
      const phaseA = root.busStore.buses.find(b => b.name === 'phaseA');
      expect(phaseA).toBeDefined();

      if (phaseA) {
        root.uiStore.uiState.selectedBusId = phaseA.id;

        root.busStore.deleteBus(phaseA.id);

        expect(root.uiStore.uiState.selectedBusId).toBeNull();
      }
    });
  });

  describe('BlockRemoved event listener', () => {
    it('clears selectedBlockId when selected block is removed', () => {
      // Create and select a block
      const blockId = root.patchStore.addBlock('FieldConstNumber');

      root.uiStore.uiState.selectedBlockId = blockId;
      expect(root.uiStore.uiState.selectedBlockId).toBe(blockId);

      // Remove the selected block
      root.patchStore.removeBlock(blockId);

      // Selection should be cleared by event listener
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
    });

    it('preserves selectedBlockId when non-selected block is removed', () => {
      // Create two blocks
      const blockId1 = root.patchStore.addBlock('FieldConstNumber');
      const blockId2 = root.patchStore.addBlock('FieldConstNumber');

      // Select block1
      root.uiStore.uiState.selectedBlockId = blockId1;

      // Remove block2 (not selected)
      root.patchStore.removeBlock(blockId2);

      // Selection should remain on block1
      expect(root.uiStore.uiState.selectedBlockId).toBe(blockId1);
    });

    it('does nothing when no block is selected', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber');

      root.uiStore.uiState.selectedBlockId = null;

      // Remove block with no selection
      root.patchStore.removeBlock(blockId);

      // Selection should remain null
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
    });

    it('handles multiple block removals correctly', () => {
      const blockId1 = root.patchStore.addBlock('FieldConstNumber');
      const blockId2 = root.patchStore.addBlock('FieldConstNumber');
      const blockId3 = root.patchStore.addBlock('FieldConstNumber');

      // Select block1
      root.uiStore.uiState.selectedBlockId = blockId1;

      // Remove block1 (selected)
      root.patchStore.removeBlock(blockId1);
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();

      // Select block2
      root.uiStore.uiState.selectedBlockId = blockId2;

      // Remove block3 (not selected)
      root.patchStore.removeBlock(blockId3);
      expect(root.uiStore.uiState.selectedBlockId).toBe(blockId2);

      // Remove block2 (selected)
      root.patchStore.removeBlock(blockId2);
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
    });

    it('selection clearing is synchronous with block removal', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber');

      root.uiStore.uiState.selectedBlockId = blockId;

      // Remove block
      root.patchStore.removeBlock(blockId);

      // Selection should be cleared immediately (synchronous event handling)
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();

      // Block should also be removed from store
      const block = root.patchStore.blocks.find(b => b.id === blockId);
      expect(block).toBeUndefined();
    });
  });

  describe('BlockReplaced event listener', () => {
    it('updates selectedBlockId when selected block is replaced', () => {
      // Create and select a block
      const oldBlockId = root.patchStore.addBlock('Oscillator');

      root.uiStore.selectBlock(oldBlockId);
      expect(root.uiStore.uiState.selectedBlockId).toBe(oldBlockId);

      // Replace the selected block
      const result = root.patchStore.replaceBlock(oldBlockId, 'Shaper');

      // Selection should be updated to new block ID by event listener
      expect(result.success).toBe(true);
      expect(root.uiStore.uiState.selectedBlockId).toBe(result.newBlockId);
      expect(root.uiStore.uiState.selectedBlockId).not.toBe(oldBlockId);
    });

    it('preserves selectedBlockId when non-selected block is replaced', () => {
      // Create two blocks
      const blockId1 = root.patchStore.addBlock('FieldConstNumber');
      const blockId2 = root.patchStore.addBlock('AddSignal');

      // Select block1
      root.uiStore.selectBlock(blockId1);

      // Replace block2 (not selected)
      const result = root.patchStore.replaceBlock(blockId2, 'MulSignal');

      // Selection should remain on block1 (not updated)
      expect(result.success).toBe(true);
      expect(root.uiStore.uiState.selectedBlockId).toBe(blockId1);
    });

    it('does nothing when no block is selected', () => {
      const blockId = root.patchStore.addBlock('Oscillator');

      root.uiStore.uiState.selectedBlockId = null;

      // Replace block with no selection
      const result = root.patchStore.replaceBlock(blockId, 'Shaper');

      // Selection should remain null
      expect(result.success).toBe(true);
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
    });

    it('selection update is synchronous with block replacement', () => {
      const oldBlockId = root.patchStore.addBlock('Oscillator');

      root.uiStore.selectBlock(oldBlockId);

      // Replace block
      const result = root.patchStore.replaceBlock(oldBlockId, 'Shaper');

      // Selection should be updated immediately (synchronous event handling)
      expect(root.uiStore.uiState.selectedBlockId).toBe(result.newBlockId);

      // New block should exist in store
      const newBlock = root.patchStore.blocks.find(b => b.id === result.newBlockId);
      expect(newBlock).toBeDefined();
      expect(newBlock?.type).toBe('Shaper');

      // Old block should not exist
      const oldBlock = root.patchStore.blocks.find(b => b.id === oldBlockId);
      expect(oldBlock).toBeUndefined();
    });

    it('handles multiple replacements in sequence', () => {
      const blockId1 = root.patchStore.addBlock('Oscillator');

      // Select and replace first time
      root.uiStore.selectBlock(blockId1);
      const result1 = root.patchStore.replaceBlock(blockId1, 'Shaper');
      expect(root.uiStore.uiState.selectedBlockId).toBe(result1.newBlockId);

      // Replace again (now replacing the Shaper block)
      const result2 = root.patchStore.replaceBlock(result1.newBlockId!, 'ColorLFO');
      expect(root.uiStore.uiState.selectedBlockId).toBe(result2.newBlockId);

      // Replace a third time
      const result3 = root.patchStore.replaceBlock(result2.newBlockId!, 'Oscillator');
      expect(root.uiStore.uiState.selectedBlockId).toBe(result3.newBlockId);

      // Verify final block exists and has correct type
      const finalBlock = root.patchStore.blocks.find(b => b.id === result3.newBlockId);
      expect(finalBlock).toBeDefined();
      expect(finalBlock?.type).toBe('Oscillator');
    });
  });

  describe('Event listener invariants', () => {
    it('event handlers do not throw errors', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      root.uiStore.uiState.selectedBusId = busId;

      // Should not throw
      expect(() => root.busStore.deleteBus(busId)).not.toThrow();
    });

    it('event handlers are non-blocking (synchronous)', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      root.uiStore.uiState.selectedBusId = busId;

      // Delete should complete synchronously
      root.busStore.deleteBus(busId);

      // Selection should already be cleared (not waiting for async)
      expect(root.uiStore.uiState.selectedBusId).toBeNull();
    });

    it('block removal event handler does not throw errors', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber');

      root.uiStore.uiState.selectedBlockId = blockId;

      // Should not throw
      expect(() => root.patchStore.removeBlock(blockId)).not.toThrow();
    });

    it('block removal event handler is non-blocking', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber');

      root.uiStore.uiState.selectedBlockId = blockId;

      // Remove should complete synchronously
      root.patchStore.removeBlock(blockId);

      // Selection should already be cleared (not waiting for async)
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
    });

    it('block replacement event handler does not throw errors', () => {
      const blockId = root.patchStore.addBlock('Oscillator');

      root.uiStore.selectBlock(blockId);

      // Should not throw
      expect(() => root.patchStore.replaceBlock(blockId, 'Shaper')).not.toThrow();
    });

    it('block replacement event handler is non-blocking', () => {
      const blockId = root.patchStore.addBlock('Oscillator');

      root.uiStore.selectBlock(blockId);

      // Replace should complete synchronously
      const result = root.patchStore.replaceBlock(blockId, 'Shaper');

      // Selection should already be updated (not waiting for async)
      expect(root.uiStore.uiState.selectedBlockId).toBe(result.newBlockId);
    });
  });

  describe('Default bus creation events', () => {
    it('default buses exist at startup', () => {
      // Verify default buses exist
      const busNames = root.busStore.buses.map(b => b.name);
      expect(busNames).toContain('phaseA');
      expect(busNames).toContain('phaseB');
      expect(busNames).toContain('energy');
      expect(busNames).toContain('pulse');
      expect(busNames).toContain('palette');
      expect(busNames).toContain('progress');
      expect(root.busStore.buses.length).toBe(6);
    });
  });
});
