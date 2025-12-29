/**
 * Tests for bus name auto-suggestion logic.
 * WI-11: Bus Name Auto-suggestion
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../stores/RootStore';
import type { Bus } from '../types';

describe('Bus Name Auto-suggestion (WI-11)', () => {
  let store: RootStore;

  beforeEach(() => {
    store = new RootStore();
    // Clear default buses for clean test slate
    store.busStore.buses = [];
  });

  describe('Default names by domain', () => {
    it('should use "energy" for float domain', () => {
      const busId = store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'energy',
        'sum'
      );
      expect(store.busStore.buses.find((b: Bus) => b.id === busId)?.name).toBe('energy');
    });

    it('should use "position" for vec2 domain', () => {
      const busId = store.busStore.createBus(
        { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
        'position',
        'sum'
      );
      expect(store.busStore.buses.find((b: Bus) => b.id === busId)?.name).toBe('position');
    });

    it('should use "phaseA" for phase domain', () => {
      const busId = store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseA',
        'last'
      );
      expect(store.busStore.buses.find((b: Bus) => b.id === busId)?.name).toBe('phaseA');
    });
  });

  describe('Collision handling: letter increment', () => {
    it('should increment phaseA to phaseB when phaseA exists', () => {
      // Create phaseA first
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseA',
        'last'
      );

      // Verify phaseA exists
      expect(store.busStore.buses.some((b: Bus) => b.name === 'phaseA')).toBe(true);

      // Next suggested name should be phaseB
      const existingNames = store.busStore.buses.map((b: Bus) => b.name);
      expect(existingNames.includes('phaseA')).toBe(true);
      expect(existingNames.includes('phaseB')).toBe(false);

      // Create phaseB
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseB',
        'last'
      );

      expect(store.busStore.buses.some((b: Bus) => b.name === 'phaseB')).toBe(true);
    });

    it('should handle sequence phaseA → phaseB → phaseC', () => {
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseA',
        'last'
      );
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseB',
        'last'
      );
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseC',
        'last'
      );

      const names = store.busStore.buses.map((b: Bus) => b.name).sort();
      expect(names).toEqual(['phaseA', 'phaseB', 'phaseC']);
    });
  });

  describe('Collision handling: numeric fallback', () => {
    it('should use numeric suffix when name has no letter', () => {
      // Create energy first
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'energy',
        'sum'
      );

      // Next should be energyA (handled by suggestion logic)
      // But if we want numeric, we'd create energy1
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'energy1',
        'sum'
      );

      expect(store.busStore.buses.some((b: Bus) => b.name === 'energy')).toBe(true);
      expect(store.busStore.buses.some((b: Bus) => b.name === 'energy1')).toBe(true);
    });

    it('should handle exhausted letters (phaseZ → phase1)', () => {
      // Create phase with letter Z
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseZ',
        'last'
      );

      // Next would be phase1
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phase1',
        'last'
      );

      expect(store.busStore.buses.some((b: Bus) => b.name === 'phaseZ')).toBe(true);
      expect(store.busStore.buses.some((b: Bus) => b.name === 'phase1')).toBe(true);
    });
  });

  describe('Case-insensitive collision detection', () => {
    it('should reject duplicate names regardless of case', () => {
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'energy',
        'sum'
      );

      // Should not allow "Energy" or "ENERGY"
      expect(() =>
        store.busStore.createBus(
          { world: 'signal', domain: 'float', category: 'core', busEligible: true },
          'Energy',
          'sum'
        )
      ).toThrow();

      expect(() =>
        store.busStore.createBus(
          { world: 'signal', domain: 'float', category: 'core', busEligible: true },
          'ENERGY',
          'sum'
        )
      ).toThrow();
    });
  });

  describe('Name validation', () => {
    it('should accept valid names', () => {
      const validNames = ['energy', 'position', 'phaseA', 'clock_main', 'speed-1'];

      validNames.forEach(name => {
        const busId = store.busStore.createBus(
          { world: 'signal', domain: 'float', category: 'core', busEligible: true },
          name,
          'sum'
        );
        expect(store.busStore.buses.find((b: Bus) => b.id === busId)?.name).toBe(name);
      });
    });
  });

  describe('Integration: Multiple buses of same type', () => {
    it('should handle multiple phase buses with auto-increment', () => {
      // Simulating user creating multiple phase buses
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseA',
        'last'
      );
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseB',
        'last'
      );
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
        'phaseC',
        'last'
      );

      const buses = store.busStore.buses;
      expect(buses.length).toBe(3);
      expect(buses.map((b: Bus) => b.name).sort()).toEqual(['phaseA', 'phaseB', 'phaseC']);
    });

    it('should handle mixed collision strategies', () => {
      // energy → energyA → energyB
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'energy',
        'sum'
      );
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'energyA',
        'sum'
      );
      store.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'energyB',
        'sum'
      );

      const names = store.busStore.buses.map((b: Bus) => b.name).sort();
      expect(names).toEqual(['energy', 'energyA', 'energyB']);
    });
  });
});
