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
      const laneId = root.patchStore.lanes[0]?.id ?? '';
      const blockId = root.patchStore.addBlock('Constant', laneId);

      root.uiStore.uiState.selectedBlockId = blockId;
      expect(root.uiStore.uiState.selectedBlockId).toBe(blockId);

      // Remove the selected block
      root.patchStore.removeBlock(blockId);

      // Selection should be cleared by event listener
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
    });

    it('preserves selectedBlockId when non-selected block is removed', () => {
      // Create two blocks
      const laneId = root.patchStore.lanes[0]?.id ?? '';
      const blockId1 = root.patchStore.addBlock('Constant', laneId);
      const blockId2 = root.patchStore.addBlock('Constant', laneId);

      // Select block1
      root.uiStore.uiState.selectedBlockId = blockId1;

      // Remove block2 (not selected)
      root.patchStore.removeBlock(blockId2);

      // Selection should remain on block1
      expect(root.uiStore.uiState.selectedBlockId).toBe(blockId1);
    });

    it('does nothing when no block is selected', () => {
      const laneId = root.patchStore.lanes[0]?.id ?? '';
      const blockId = root.patchStore.addBlock('Constant', laneId);

      root.uiStore.uiState.selectedBlockId = null;

      // Remove block with no selection
      root.patchStore.removeBlock(blockId);

      // Selection should remain null
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
    });

    it('handles multiple block removals correctly', () => {
      const laneId = root.patchStore.lanes[0]?.id ?? '';
      const blockId1 = root.patchStore.addBlock('Constant', laneId);
      const blockId2 = root.patchStore.addBlock('Constant', laneId);
      const blockId3 = root.patchStore.addBlock('Constant', laneId);

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
      const laneId = root.patchStore.lanes[0]?.id ?? '';
      const blockId = root.patchStore.addBlock('Constant', laneId);

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
      const laneId = root.patchStore.lanes[0]?.id ?? '';
      const blockId = root.patchStore.addBlock('Constant', laneId);

      root.uiStore.uiState.selectedBlockId = blockId;

      // Should not throw
      expect(() => root.patchStore.removeBlock(blockId)).not.toThrow();
    });

    it('block removal event handler is non-blocking', () => {
      const laneId = root.patchStore.lanes[0]?.id ?? '';
      const blockId = root.patchStore.addBlock('Constant', laneId);

      root.uiStore.uiState.selectedBlockId = blockId;

      // Remove should complete synchronously
      root.patchStore.removeBlock(blockId);

      // Selection should already be cleared (not waiting for async)
      expect(root.uiStore.uiState.selectedBlockId).toBeNull();
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
      expect(root.busStore.buses.length).toBe(5);
    });
  });
});
