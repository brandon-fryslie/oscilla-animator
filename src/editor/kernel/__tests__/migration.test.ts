/**
 * Tests for Patch Migration
 *
 * Validates that legacy patches are correctly migrated to edges-authoritative format.
 *
 * Sprint: Phase 0.5 - Sprint 1: Make Edges Authoritative
 */

import { describe, it, expect } from 'vitest';
import type { Patch, Connection, Publisher, Listener, TypeDesc } from '../../types';
import { migratePatchToEdges, patchNeedsMigration, getMigrationSummary } from '../migration';

describe('Patch Migration', () => {
  describe('migratePatchToEdges', () => {
    it('should handle patches that already have edges (no-op)', () => {
      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [
          {
            id: 'e1',
            from: { kind: 'port', blockId: 'a', slotId: 'out' },
            to: { kind: 'port', blockId: 'b', slotId: 'in' },
            enabled: true,
          },
        ],
        settings: { seed: 0, speed: 1 },
      };

      const migrated = migratePatchToEdges(patch);

      // Should return the same patch (no changes)
      expect(migrated.edges).toHaveLength(1);
      expect(migrated.edges![0].id).toBe('e1');
    });

    it('should convert legacy connections to edges', () => {
      const connection: Connection = {
        id: 'c1',
        from: { blockId: 'osc', slotId: 'out', direction: 'output' },
        to: { blockId: 'gain', slotId: 'in', direction: 'input' },
        enabled: true,
      };

      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [connection],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      const migrated = migratePatchToEdges(patch);

      // Should have created an edge from the connection
      expect(migrated.edges).toHaveLength(1);
      expect(migrated.edges![0]).toMatchObject({
        id: 'c1',
        from: { kind: 'port', blockId: 'osc', slotId: 'out' },
        to: { kind: 'port', blockId: 'gain', slotId: 'in' },
        enabled: true,
      });

      // Legacy connection should still be present
      expect(migrated.connections).toHaveLength(1);
    });

    it('should convert legacy publishers to edges', () => {
      const busType: TypeDesc = {
        world: 'signal',
        domain: 'vec2',
        category: 'core',
        busEligible: true,
      };

      const publisher: Publisher = {
        id: 'p1',
        from: { blockId: 'osc', slotId: 'out', direction: 'output' },
        busId: 'pos',
        enabled: true,
        weight: 1.5,
        sortKey: 10,
      };

      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [{ id: 'pos', name: 'Position', type: busType, combine: { when: 'multi', mode: 'last' }, defaultValue: null, sortKey: 0 }],
        publishers: [publisher],
        listeners: [],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      const migrated = migratePatchToEdges(patch);

      // Should have created an edge from the publisher
      expect(migrated.edges).toHaveLength(1);
      expect(migrated.edges![0]).toMatchObject({
        id: 'p1',
        from: { kind: 'port', blockId: 'osc', slotId: 'out' },
        to: { kind: 'bus', busId: 'pos' },
        enabled: true,
        weight: 1.5,
        sortKey: 10,
      });

      // Legacy publisher should still be present
      expect(migrated.publishers).toHaveLength(1);
    });

    it('should convert legacy listeners to edges', () => {
      const busType: TypeDesc = {
        world: 'signal',
        domain: 'vec2',
        category: 'core',
        busEligible: true,
      };

      const listener: Listener = {
        id: 'l1',
        busId: 'pos',
        to: { blockId: 'renderer', slotId: 'positions', direction: 'input' },
        enabled: true,
      };

      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [{ id: 'pos', name: 'Position', type: busType, combine: { when: 'multi', mode: 'last' }, defaultValue: null, sortKey: 0 }],
        publishers: [],
        listeners: [listener],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      const migrated = migratePatchToEdges(patch);

      // Should have created an edge from the listener
      expect(migrated.edges).toHaveLength(1);
      expect(migrated.edges![0]).toMatchObject({
        id: 'l1',
        from: { kind: 'bus', busId: 'pos' },
        to: { kind: 'port', blockId: 'renderer', slotId: 'positions' },
        enabled: true,
      });

      // Legacy listener should still be present
      expect(migrated.listeners).toHaveLength(1);
    });

    it('should convert all edge types in a single patch', () => {
      const busType: TypeDesc = {
        world: 'signal',
        domain: 'float',
        category: 'core',
        busEligible: true,
      };

      const connection: Connection = {
        id: 'c1',
        from: { blockId: 'a', slotId: 'out', direction: 'output' },
        to: { blockId: 'b', slotId: 'in', direction: 'input' },
        enabled: true,
      };

      const publisher: Publisher = {
        id: 'p1',
        from: { blockId: 'c', slotId: 'out', direction: 'output' },
        busId: 'bus1',
        enabled: true,
        sortKey: 0,
      };

      const listener: Listener = {
        id: 'l1',
        busId: 'bus1',
        to: { blockId: 'd', slotId: 'in', direction: 'input' },
        enabled: true,
      };

      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [connection],
        buses: [{ id: 'bus1', name: 'Bus', type: busType, combine: { when: 'multi', mode: 'sum' }, defaultValue: 0, sortKey: 0 }],
        publishers: [publisher],
        listeners: [listener],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      const migrated = migratePatchToEdges(patch);

      // Should have created 3 edges (1 connection + 1 publisher + 1 listener)
      expect(migrated.edges).toHaveLength(3);

      // Verify each edge type
      const wireEdge = migrated.edges!.find((e) => e.id === 'c1');
      expect(wireEdge).toMatchObject({
        from: { kind: 'port', blockId: 'a' },
        to: { kind: 'port', blockId: 'b' },
      });

      const publisherEdge = migrated.edges!.find((e) => e.id === 'p1');
      expect(publisherEdge).toMatchObject({
        from: { kind: 'port', blockId: 'c' },
        to: { kind: 'bus', busId: 'bus1' },
      });

      const listenerEdge = migrated.edges!.find((e) => e.id === 'l1');
      expect(listenerEdge).toMatchObject({
        from: { kind: 'bus', busId: 'bus1' },
        to: { kind: 'port', blockId: 'd' },
      });
    });

    it('should preserve edge metadata (transforms)', () => {
      const connection: Connection = {
        id: 'c1',
        from: { blockId: 'a', slotId: 'out', direction: 'output' },
        to: { blockId: 'b', slotId: 'in', direction: 'input' },
        enabled: true,
        lensStack: [{ lensId: "mul", params: { factor: { kind: "literal", value: 2 } }, enabled: true }],
        adapterChain: [{ adapterId: 'float-to-vec2', params: {} }],
      };

      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [connection],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      const migrated = migratePatchToEdges(patch);

      // Edge uses unified transforms field (adapters first, then lenses)
      expect(migrated.edges![0]).toMatchObject({
        id: 'c1',
        transforms: [
          { adapterId: 'float-to-vec2', params: {} },
          { kind: 'lens', lens: { lensId: "mul", params: { factor: { kind: "literal", value: 2 } }, enabled: true } },
        ],
      });
    });

    it('should handle empty patches', () => {
      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      const migrated = migratePatchToEdges(patch);

      // Should ensure edges array exists (even if empty)
      expect(migrated.edges).toBeDefined();
      expect(migrated.edges).toHaveLength(0);
    });

    it('should handle patches with undefined edges field', () => {
      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        // edges field is undefined (old patch format)
        settings: { seed: 0, speed: 1 },
      } as Patch;

      const migrated = migratePatchToEdges(patch);

      // Should create edges array
      expect(migrated.edges).toBeDefined();
      expect(migrated.edges).toHaveLength(0);
    });
  });

  describe('patchNeedsMigration', () => {
    it('should return true for patches with legacy connections but no edges', () => {
      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [
          {
            id: 'c1',
            from: { blockId: 'a', slotId: 'out', direction: 'output' },
            to: { blockId: 'b', slotId: 'in', direction: 'input' },
          },
        ],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      expect(patchNeedsMigration(patch)).toBe(true);
    });

    it('should return false for patches that already have edges', () => {
      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [
          {
            id: 'e1',
            from: { kind: 'port', blockId: 'a', slotId: 'out' },
            to: { kind: 'port', blockId: 'b', slotId: 'in' },
            enabled: true,
          },
        ],
        settings: { seed: 0, speed: 1 },
      };

      expect(patchNeedsMigration(patch)).toBe(false);
    });

    it('should return false for empty patches', () => {
      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      expect(patchNeedsMigration(patch)).toBe(false);
    });
  });

  describe('getMigrationSummary', () => {
    it('should provide accurate summary of migration work', () => {
      const busType: TypeDesc = {
        world: 'signal',
        domain: 'float',
        category: 'core',
        busEligible: true,
      };

      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [
          { id: 'c1', from: { blockId: 'a', slotId: 'out', direction: 'output' }, to: { blockId: 'b', slotId: 'in', direction: 'input' } },
          { id: 'c2', from: { blockId: 'c', slotId: 'out', direction: 'output' }, to: { blockId: 'd', slotId: 'in', direction: 'input' } },
        ],
        buses: [{ id: 'bus1', name: 'Bus', type: busType, combine: { when: 'multi', mode: 'sum' }, defaultValue: 0, sortKey: 0 }],
        publishers: [
          { id: 'p1', from: { blockId: 'e', slotId: 'out', direction: 'output' }, busId: 'bus1', enabled: true, sortKey: 0 },
        ],
        listeners: [
          { id: 'l1', busId: 'bus1', to: { blockId: 'f', slotId: 'in', direction: 'input' }, enabled: true },
        ],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      const summary = getMigrationSummary(patch);

      expect(summary).toEqual({
        needsMigration: true,
        legacyConnectionCount: 2,
        legacyPublisherCount: 1,
        legacyListenerCount: 1,
        totalEdgeCount: 4,
        existingEdgeCount: 0,
      });
    });

    it('should handle patches that do not need migration', () => {
      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [
          {
            id: 'e1',
            from: { kind: 'port', blockId: 'a', slotId: 'out' },
            to: { kind: 'port', blockId: 'b', slotId: 'in' },
            enabled: true,
          },
        ],
        settings: { seed: 0, speed: 1 },
      };

      const summary = getMigrationSummary(patch);

      expect(summary).toEqual({
        needsMigration: false,
        legacyConnectionCount: 0,
        legacyPublisherCount: 0,
        legacyListenerCount: 0,
        totalEdgeCount: 0,
        existingEdgeCount: 1,
      });
    });
  });

  describe('Roundtrip Conversion', () => {
    it('should preserve all data through legacy→edges conversion', () => {
      const originalConnection: Connection = {
        id: 'c1',
        from: { blockId: 'osc', slotId: 'wave', direction: 'output' },
        to: { blockId: 'gain', slotId: 'input', direction: 'input' },
        enabled: true,
        lensStack: [{ lensId: "mul", params: { factor: { kind: "literal", value: 0.5 } }, enabled: true }],
        adapterChain: [{ adapterId: 'float-to-vec2', params: {} }],
      };

      const patch: Patch = {
        version: 1,
        blocks: [],
        connections: [originalConnection],
        buses: [],
        publishers: [],
        listeners: [],
        defaultSources: [],
        edges: [],
        settings: { seed: 0, speed: 1 },
      };

      // Migrate to edges
      const migrated = migratePatchToEdges(patch);

      // Verify edge preserves all metadata (now using transforms field)
      expect(migrated.edges![0]).toMatchObject({
        id: 'c1',
        enabled: true,
        transforms: [
          { adapterId: 'float-to-vec2', params: {} },
          { kind: 'lens', lens: { lensId: "mul", params: { factor: { kind: "literal", value: 0.5 } }, enabled: true } },
        ],
      });

      // Original connection should still be present for backward compat
      expect(migrated.connections).toHaveLength(1);
      expect(migrated.connections[0]).toMatchObject(originalConnection);
    });
  });
});
