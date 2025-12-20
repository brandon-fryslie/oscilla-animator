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
