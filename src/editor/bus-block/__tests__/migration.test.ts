/**
 * Edge Migration Tests
 *
 * Sprint: Bus-Block Unification - Sprint 1 (Foundation)
 * DOD: 10+ unit tests validating edge migration utilities
 */

import { describe, it, expect } from 'vitest';
import { migrateEdgesToPortOnly, isMigrated, safeMigrate } from '../migration';
import type { Bus, Block, Edge, TypeDesc } from '../../types';

// Test fixtures
const testBusType: TypeDesc = {
  world: 'signal',
  domain: 'float',
  category: 'core',
  busEligible: true,
};

const createTestBus = (id: string, name: string): Bus => ({
  id,
  name,
  type: testBusType,
  combine: { when: 'multi', mode: 'sum' },
  defaultValue: 0,
  sortKey: 0,
  origin: 'user',
});

const createTestBlock = (id: string, type: string): Block => ({
  id,
  type,
  label: `${type} Block`,
  inputs: [
    { id: 'in', label: 'Input', type: 'Signal<float>', direction: 'input' },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: 'Signal<float>', direction: 'output' },
  ],
  params: {},
  category: 'Other',
  description: `Test ${type} block`,
});

const createBusBlock = (id: string, name: string): Block => ({
  id,
  type: 'BusBlock',
  label: name,
  inputs: [
    { id: 'in', label: 'Publishers', type: 'Signal<float>', direction: 'input' },
  ],
  outputs: [
    { id: 'out', label: name, type: 'Signal<float>', direction: 'output' },
  ],
  params: {
    busId: id,
    busName: name,
  },
  category: 'Other',
  description: `Bus: ${name}`,
  hidden: true,
  role: 'internal',
});

describe('migrateEdgesToPortOnly', () => {
  it('converts buses to BusBlocks', () => {
    const bus = createTestBus('bus-energy', 'Energy');
    const patch = {
      blocks: [],
      buses: [bus],
      edges: [],
    };

    const migrated = migrateEdgesToPortOnly(patch);

    // Check that buses array is empty
    expect(migrated.buses).toHaveLength(0);

    // Check that a BusBlock was created
    const busBlock = migrated.blocks.find(b => b.type === 'BusBlock');
    expect(busBlock).toBeDefined();
    expect(busBlock?.id).toBe('bus-energy'); // ID preserved
    expect(busBlock?.params.busName).toBe('Energy');
  });

  it('migrates publisher edges (port→bus becomes port→BusBlock.in)', () => {
    const bus = createTestBus('bus-123', 'TestBus');
    const block = createTestBlock('block-1', 'Oscillator');
    const edge: Edge = {
      id: 'edge-1',
      from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
      to: { kind: 'bus', busId: 'bus-123' },
      enabled: true,
    };

    const patch = {
      blocks: [block],
      buses: [bus],
      edges: [edge],
    };

    const migrated = migrateEdgesToPortOnly(patch);

    expect(migrated.edges).toHaveLength(1);
    const migratedEdge = migrated.edges[0];

    // Source should be unchanged (block-1.out)
    expect(migratedEdge.from.kind).toBe('port');
    if (migratedEdge.from.kind === 'port') {
      expect(migratedEdge.from.blockId).toBe('block-1');
      expect(migratedEdge.from.slotId).toBe('out');
    }

    // Destination should be BusBlock.in
    expect(migratedEdge.to.kind).toBe('port');
    if (migratedEdge.to.kind === 'port') {
      expect(migratedEdge.to.blockId).toBe('bus-123'); // Bus ID becomes block ID
      expect(migratedEdge.to.slotId).toBe('in'); // Publishing to bus input
    }
  });

  it('migrates listener edges (bus→port becomes BusBlock.out→port)', () => {
    const bus = createTestBus('bus-456', 'SourceBus');
    const block = createTestBlock('block-2', 'Effect');
    const edge: Edge = {
      id: 'edge-2',
      from: { kind: 'bus', busId: 'bus-456' },
      to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
      enabled: true,
    };

    const patch = {
      blocks: [block],
      buses: [bus],
      edges: [edge],
    };

    const migrated = migrateEdgesToPortOnly(patch);

    expect(migrated.edges).toHaveLength(1);
    const migratedEdge = migrated.edges[0];

    // Source should be BusBlock.out
    expect(migratedEdge.from.kind).toBe('port');
    if (migratedEdge.from.kind === 'port') {
      expect(migratedEdge.from.blockId).toBe('bus-456'); // Bus ID becomes block ID
      expect(migratedEdge.from.slotId).toBe('out'); // Listening from bus output
    }

    // Destination should be unchanged (block-2.in)
    expect(migratedEdge.to.kind).toBe('port');
    if (migratedEdge.to.kind === 'port') {
      expect(migratedEdge.to.blockId).toBe('block-2');
      expect(migratedEdge.to.slotId).toBe('in');
    }
  });

  it('leaves wire edges unchanged (port→port)', () => {
    const block1 = createTestBlock('block-1', 'Source');
    const block2 = createTestBlock('block-2', 'Sink');
    const edge: Edge = {
      id: 'edge-wire',
      from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
      to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
      enabled: true,
    };

    const patch = {
      blocks: [block1, block2],
      buses: [],
      edges: [edge],
    };

    const migrated = migrateEdgesToPortOnly(patch);

    expect(migrated.edges).toHaveLength(1);
    const migratedEdge = migrated.edges[0];

    // Both endpoints should be unchanged
    expect(migratedEdge.from).toEqual({
      kind: 'port',
      blockId: 'block-1',
      slotId: 'out',
    });
    expect(migratedEdge.to).toEqual({
      kind: 'port',
      blockId: 'block-2',
      slotId: 'in',
    });
  });

  it('handles multiple publishers to same bus', () => {
    const bus = createTestBus('bus-multi', 'MultiBus');
    const block1 = createTestBlock('block-1', 'Source1');
    const block2 = createTestBlock('block-2', 'Source2');
    const edges: Edge[] = [
      {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
        to: { kind: 'bus', busId: 'bus-multi' },
        enabled: true,
      },
      {
        id: 'edge-2',
        from: { kind: 'port', blockId: 'block-2', slotId: 'out' },
        to: { kind: 'bus', busId: 'bus-multi' },
        enabled: true,
      },
    ];

    const patch = {
      blocks: [block1, block2],
      buses: [bus],
      edges,
    };

    const migrated = migrateEdgesToPortOnly(patch);

    expect(migrated.edges).toHaveLength(2);

    // Both edges should point to the same BusBlock input
    for (const edge of migrated.edges) {
      expect(edge.to.kind).toBe('port');
      if (edge.to.kind === 'port') {
        expect(edge.to.blockId).toBe('bus-multi');
        expect(edge.to.slotId).toBe('in');
      }
    }
  });

  it('handles multiple listeners from same bus', () => {
    const bus = createTestBus('bus-broadcast', 'BroadcastBus');
    const block1 = createTestBlock('block-1', 'Listener1');
    const block2 = createTestBlock('block-2', 'Listener2');
    const edges: Edge[] = [
      {
        id: 'edge-1',
        from: { kind: 'bus', busId: 'bus-broadcast' },
        to: { kind: 'port', blockId: 'block-1', slotId: 'in' },
        enabled: true,
      },
      {
        id: 'edge-2',
        from: { kind: 'bus', busId: 'bus-broadcast' },
        to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
        enabled: true,
      },
    ];

    const patch = {
      blocks: [block1, block2],
      buses: [bus],
      edges,
    };

    const migrated = migrateEdgesToPortOnly(patch);

    expect(migrated.edges).toHaveLength(2);

    // Both edges should originate from the same BusBlock output
    for (const edge of migrated.edges) {
      expect(edge.from.kind).toBe('port');
      if (edge.from.kind === 'port') {
        expect(edge.from.blockId).toBe('bus-broadcast');
        expect(edge.from.slotId).toBe('out');
      }
    }
  });

  it('preserves edge metadata (id, enabled, transforms, etc.)', () => {
    const bus = createTestBus('bus-meta', 'MetaBus');
    const block = createTestBlock('block-1', 'Source');
    const edge: Edge = {
      id: 'edge-with-metadata',
      from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
      to: { kind: 'bus', busId: 'bus-meta' },
      enabled: false,
      weight: 0.5,
      sortKey: 10,
    };

    const patch = {
      blocks: [block],
      buses: [bus],
      edges: [edge],
    };

    const migrated = migrateEdgesToPortOnly(patch);

    expect(migrated.edges).toHaveLength(1);
    const migratedEdge = migrated.edges[0];

    // Metadata should be preserved
    expect(migratedEdge.id).toBe('edge-with-metadata');
    expect(migratedEdge.enabled).toBe(false);
    expect(migratedEdge.weight).toBe(0.5);
    expect(migratedEdge.sortKey).toBe(10);
  });

  it('handles complex patch with multiple buses and edge types', () => {
    const bus1 = createTestBus('bus-1', 'Bus1');
    const bus2 = createTestBus('bus-2', 'Bus2');
    const block1 = createTestBlock('block-1', 'Source');
    const block2 = createTestBlock('block-2', 'Processor');
    const block3 = createTestBlock('block-3', 'Sink');

    const edges: Edge[] = [
      // block-1 publishes to bus-1
      {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
        to: { kind: 'bus', busId: 'bus-1' },
        enabled: true,
      },
      // block-2 listens to bus-1
      {
        id: 'edge-2',
        from: { kind: 'bus', busId: 'bus-1' },
        to: { kind: 'port', blockId: 'block-2', slotId: 'in' },
        enabled: true,
      },
      // block-2 publishes to bus-2
      {
        id: 'edge-3',
        from: { kind: 'port', blockId: 'block-2', slotId: 'out' },
        to: { kind: 'bus', busId: 'bus-2' },
        enabled: true,
      },
      // block-3 listens to bus-2
      {
        id: 'edge-4',
        from: { kind: 'bus', busId: 'bus-2' },
        to: { kind: 'port', blockId: 'block-3', slotId: 'in' },
        enabled: true,
      },
      // Direct wire: block-1 → block-3
      {
        id: 'edge-wire',
        from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
        to: { kind: 'port', blockId: 'block-3', slotId: 'in' },
        enabled: true,
      },
    ];

    const patch = {
      blocks: [block1, block2, block3],
      buses: [bus1, bus2],
      edges,
    };

    const migrated = migrateEdgesToPortOnly(patch);

    // Should have 2 BusBlocks + 3 original blocks
    expect(migrated.blocks).toHaveLength(5);
    expect(migrated.blocks.filter(b => b.type === 'BusBlock')).toHaveLength(2);

    // All edges should have kind='port' endpoints
    expect(migrated.edges).toHaveLength(5);
    for (const edge of migrated.edges) {
      expect(edge.from.kind).toBe('port');
      expect(edge.to.kind).toBe('port');
    }

    // No buses should remain
    expect(migrated.buses).toHaveLength(0);
  });

  it('throws error for missing bus reference', () => {
    const block = createTestBlock('block-1', 'Source');
    const edge: Edge = {
      id: 'edge-bad',
      from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
      to: { kind: 'bus', busId: 'bus-nonexistent' }, // References non-existent bus
      enabled: true,
    };

    const patch = {
      blocks: [block],
      buses: [], // Empty - bus doesn't exist
      edges: [edge],
    };

    expect(() => migrateEdgesToPortOnly(patch)).toThrow(
      'Cannot migrate endpoint: bus "bus-nonexistent" not found'
    );
  });
});

describe('isMigrated', () => {
  it('returns false for patches with buses', () => {
    const bus = createTestBus('bus-1', 'Bus1');
    const patch = {
      blocks: [],
      buses: [bus],
      edges: [],
    };

    expect(isMigrated(patch)).toBe(false);
  });

  it('returns false for patches with bus endpoints', () => {
    const block = createTestBlock('block-1', 'Source');
    const edge: Edge = {
      id: 'edge-1',
      from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
      to: { kind: 'bus', busId: 'bus-1' },
      enabled: true,
    };

    const patch = {
      blocks: [block],
      buses: [], // No buses, but edge still references one
      edges: [edge],
    };

    expect(isMigrated(patch)).toBe(false);
  });

  it('returns true for fully migrated patches', () => {
    const block = createTestBlock('block-1', 'Source');
    const busBlock = createBusBlock('bus-123', 'Bus123');

    const edge: Edge = {
      id: 'edge-1',
      from: { kind: 'port', blockId: 'block-1', slotId: 'out' },
      to: { kind: 'port', blockId: 'bus-123', slotId: 'in' },
      enabled: true,
    };

    const patch = {
      blocks: [block, busBlock],
      buses: [],
      edges: [edge],
    };

    expect(isMigrated(patch)).toBe(true);
  });
});

describe('safeMigrate', () => {
  it('migrates unmigrated patches', () => {
    const bus = createTestBus('bus-1', 'Bus1');
    const patch = {
      blocks: [],
      buses: [bus],
      edges: [],
    };

    const result = safeMigrate(patch);

    expect(result.buses).toHaveLength(0);
    expect(result.blocks.filter(b => b.type === 'BusBlock')).toHaveLength(1);
  });

  it('returns migrated patches unchanged', () => {
    const busBlock = createBusBlock('bus-123', 'Bus123');

    const patch = {
      blocks: [busBlock],
      buses: [],
      edges: [],
    };

    const result = safeMigrate(patch);

    // Should be the same object (no migration needed)
    expect(result).toBe(patch);
  });

  it('prevents double-migration', () => {
    const bus = createTestBus('bus-1', 'Bus1');
    const patch = {
      blocks: [],
      buses: [bus],
      edges: [],
    };

    // First migration
    const migrated1 = safeMigrate(patch);
    expect(migrated1.blocks).toHaveLength(1);

    // Second migration should not add another BusBlock
    const migrated2 = safeMigrate(migrated1);
    expect(migrated2.blocks).toHaveLength(1);
    expect(migrated2).toBe(migrated1); // Same reference
  });
});
