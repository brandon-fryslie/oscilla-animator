/**
 * Tests for Edge Migration Helpers
 *
 * Sprint: Phase 0 - Sprint 1: Unify Connections → Edge Type
 */

import { describe, it, expect } from 'vitest';
import {
  validateEdge,
  connectionToEdge,
  publisherToEdge,
  listenerToEdge,
  edgeToConnection,
  edgeToPublisher,
  edgeToListener,
  convertToEdges,
  convertFromEdges,
} from '../edgeMigration';
import type {
  Edge,
  Connection,
  Publisher,
  Listener,
} from '../types';

describe('Edge Validation', () => {
  it('accepts valid port→port edge', () => {
    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };
    expect(() => validateEdge(edge)).not.toThrow();
  });

  it('accepts valid port→bus edge', () => {
    const edge: Edge = {
      id: 'e2',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'bus', busId: 'mybus' },
      enabled: true,
    };
    expect(() => validateEdge(edge)).not.toThrow();
  });

  it('accepts valid bus→port edge', () => {
    const edge: Edge = {
      id: 'e3',
      from: { kind: 'bus', busId: 'mybus' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };
    expect(() => validateEdge(edge)).not.toThrow();
  });

  it('rejects invalid bus→bus edge', () => {
    const edge: Edge = {
      id: 'e4',
      from: { kind: 'bus', busId: 'bus1' },
      to: { kind: 'bus', busId: 'bus2' },
      enabled: true,
    };
    expect(() => validateEdge(edge)).toThrow('bus→bus');
  });
});

describe('Connection → Edge Conversion', () => {
  it('converts minimal connection correctly', () => {
    const conn: Connection = {
      id: 'c1',
      from: { blockId: 'a', slotId: 'out', direction: 'output' },
      to: { blockId: 'b', slotId: 'in', direction: 'input' },
    };

    const edge = connectionToEdge(conn);

    expect(edge.id).toBe('c1');
    expect(edge.from).toEqual({ kind: 'port', blockId: 'a', slotId: 'out' });
    expect(edge.to).toEqual({ kind: 'port', blockId: 'b', slotId: 'in' });
    expect(edge.enabled).toBe(true); // Default when undefined
    expect(edge.transforms).toEqual([]);
  });

  it('converts connection with all optional fields', () => {
    const conn: Connection = {
      id: 'c2',
      from: { blockId: 'a', slotId: 'out', direction: 'output' },
      to: { blockId: 'b', slotId: 'in', direction: 'input' },
      enabled: false,
      lensStack: [{ lensId: 'lens1', params: {}, enabled: true }],
      adapterChain: [{ adapterId: 'adapter1', params: {} }],
    };

    const edge = connectionToEdge(conn);

    expect(edge.enabled).toBe(false);
    // Transforms field contains: adapters first, then lenses
    expect(edge.transforms).toHaveLength(2);
    // First is the adapter
    expect(edge.transforms?.[0]).toEqual({ adapterId: 'adapter1', params: {} });
    // Second is the lens (wrapped with kind: 'lens')
    expect(edge.transforms?.[1]).toEqual({
      kind: 'lens',
      lens: { lensId: 'lens1', params: {}, enabled: true },
    });
  });
});

describe('Publisher → Edge Conversion', () => {
  it('converts minimal publisher correctly', () => {
    const pub: Publisher = {
      id: 'p1',
      from: { blockId: 'a', slotId: 'out', direction: 'output' },
      busId: 'mybus',
      enabled: true,
      sortKey: 0,
    };

    const edge = publisherToEdge(pub);

    expect(edge.id).toBe('p1');
    expect(edge.from).toEqual({ kind: 'port', blockId: 'a', slotId: 'out' });
    expect(edge.to).toEqual({ kind: 'bus', busId: 'mybus' });
    expect(edge.enabled).toBe(true);
    expect(edge.sortKey).toBe(0);
  });

  it('converts publisher with weight and sortKey', () => {
    const pub: Publisher = {
      id: 'p2',
      from: { blockId: 'a', slotId: 'out', direction: 'output' },
      busId: 'mybus',
      enabled: true,
      weight: 1.5,
      sortKey: 10,
    };

    const edge = publisherToEdge(pub);

    expect(edge.weight).toBe(1.5);
    expect(edge.sortKey).toBe(10);
  });

  it('converts publisher with lens stack', () => {
    const pub: Publisher = {
      id: 'p3',
      from: { blockId: 'a', slotId: 'out', direction: 'output' },
      busId: 'mybus',
      enabled: true,
      sortKey: 0,
      lensStack: [{ lensId: 'scale', params: {}, enabled: true }],
    };

    const edge = publisherToEdge(pub);

    expect(edge.transforms).toHaveLength(1);
    expect(edge.transforms?.[0]).toEqual({
      kind: 'lens',
      lens: { lensId: 'scale', params: {}, enabled: true },
    });
  });
});

describe('Listener → Edge Conversion', () => {
  it('converts minimal listener correctly', () => {
    const listener: Listener = {
      id: 'l1',
      busId: 'mybus',
      to: { blockId: 'b', slotId: 'in', direction: 'input' },
      enabled: true,
    };

    const edge = listenerToEdge(listener);

    expect(edge.id).toBe('l1');
    expect(edge.from).toEqual({ kind: 'bus', busId: 'mybus' });
    expect(edge.to).toEqual({ kind: 'port', blockId: 'b', slotId: 'in' });
    expect(edge.enabled).toBe(true);
  });

  it('converts listener with lens stack', () => {
    const listener: Listener = {
      id: 'l2',
      busId: 'mybus',
      to: { blockId: 'b', slotId: 'in', direction: 'input' },
      enabled: false,
      lensStack: [
        { lensId: 'scale', params: {}, enabled: true },
        { lensId: 'offset', params: {}, enabled: true },
      ],
    };

    const edge = listenerToEdge(listener);

    expect(edge.enabled).toBe(false);
    expect(edge.transforms).toHaveLength(2);
    expect(edge.transforms?.[0]).toEqual({
      kind: 'lens',
      lens: { lensId: 'scale', params: {}, enabled: true },
    });
    expect(edge.transforms?.[1]).toEqual({
      kind: 'lens',
      lens: { lensId: 'offset', params: {}, enabled: true },
    });
  });
});

describe('Edge → Connection Conversion', () => {
  it('converts port→port edge to connection', () => {
    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };

    const conn = edgeToConnection(edge);

    expect(conn).not.toBeNull();
    expect(conn?.id).toBe('e1');
    expect(conn?.from.blockId).toBe('a');
    expect(conn?.from.slotId).toBe('out');
    expect(conn?.to.blockId).toBe('b');
    expect(conn?.to.slotId).toBe('in');
    expect(conn?.enabled).toBe(true);
  });

  it('returns null for port→bus edge', () => {
    const edge: Edge = {
      id: 'e2',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'bus', busId: 'mybus' },
      enabled: true,
    };

    const conn = edgeToConnection(edge);

    expect(conn).toBeNull();
  });

  it('returns null for bus→port edge', () => {
    const edge: Edge = {
      id: 'e3',
      from: { kind: 'bus', busId: 'mybus' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };

    const conn = edgeToConnection(edge);

    expect(conn).toBeNull();
  });

  it('does not copy transforms to legacy Connection type', () => {
    const edge: Edge = {
      id: 'e4',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: false,
      transforms: [
        { adapterId: 'adapter1', params: {} },
        { kind: 'lens', lens: { lensId: 'lens1', params: {}, enabled: true } },
      ],
    };

    const conn = edgeToConnection(edge);

    // Legacy Connection type doesn't receive transforms - it's deprecated
    expect(conn?.enabled).toBe(false);
    expect(conn?.lensStack).toBeUndefined();
    expect(conn?.adapterChain).toBeUndefined();
  });
});

describe('Edge → Publisher Conversion', () => {
  it('converts port→bus edge to publisher', () => {
    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'bus', busId: 'mybus' },
      enabled: true,
      weight: 2.0,
      sortKey: 5,
    };

    const pub = edgeToPublisher(edge);

    expect(pub).not.toBeNull();
    expect(pub?.id).toBe('e1');
    expect(pub?.from.blockId).toBe('a');
    expect(pub?.from.slotId).toBe('out');
    expect(pub?.busId).toBe('mybus');
    expect(pub?.enabled).toBe(true);
    expect(pub?.weight).toBe(2.0);
    expect(pub?.sortKey).toBe(5);
  });

  it('returns null for port→port edge', () => {
    const edge: Edge = {
      id: 'e2',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };

    const pub = edgeToPublisher(edge);

    expect(pub).toBeNull();
  });

  it('returns null for bus→port edge', () => {
    const edge: Edge = {
      id: 'e3',
      from: { kind: 'bus', busId: 'mybus' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };

    const pub = edgeToPublisher(edge);

    expect(pub).toBeNull();
  });

  it('defaults sortKey to 0 when undefined', () => {
    const edge: Edge = {
      id: 'e4',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'bus', busId: 'mybus' },
      enabled: true,
    };

    const pub = edgeToPublisher(edge);

    expect(pub?.sortKey).toBe(0);
  });
});

describe('Edge → Listener Conversion', () => {
  it('converts bus→port edge to listener', () => {
    const edge: Edge = {
      id: 'e1',
      from: { kind: 'bus', busId: 'mybus' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };

    const listener = edgeToListener(edge);

    expect(listener).not.toBeNull();
    expect(listener?.id).toBe('e1');
    expect(listener?.busId).toBe('mybus');
    expect(listener?.to.blockId).toBe('b');
    expect(listener?.to.slotId).toBe('in');
    expect(listener?.enabled).toBe(true);
  });

  it('returns null for port→port edge', () => {
    const edge: Edge = {
      id: 'e2',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'port', blockId: 'b', slotId: 'in' },
      enabled: true,
    };

    const listener = edgeToListener(edge);

    expect(listener).toBeNull();
  });

  it('returns null for port→bus edge', () => {
    const edge: Edge = {
      id: 'e3',
      from: { kind: 'port', blockId: 'a', slotId: 'out' },
      to: { kind: 'bus', busId: 'mybus' },
      enabled: true,
    };

    const listener = edgeToListener(edge);

    expect(listener).toBeNull();
  });
});

describe('Batch Conversion: convertToEdges', () => {
  it('converts mixed connection types to edges', () => {
    const connections: Connection[] = [
      {
        id: 'c1',
        from: { blockId: 'a', slotId: 'out', direction: 'output' },
        to: { blockId: 'b', slotId: 'in', direction: 'input' },
        enabled: true,
      },
    ];

    const publishers: Publisher[] = [
      {
        id: 'p1',
        from: { blockId: 'a', slotId: 'out', direction: 'output' },
        busId: 'bus1',
        enabled: true,
        sortKey: 0,
      },
    ];

    const listeners: Listener[] = [
      {
        id: 'l1',
        busId: 'bus1',
        to: { blockId: 'c', slotId: 'in', direction: 'input' },
        enabled: true,
      },
    ];

    const edges = convertToEdges(connections, publishers, listeners);

    expect(edges).toHaveLength(3);

    // Verify connection edge
    expect(edges[0].from.kind).toBe('port');
    expect(edges[0].to.kind).toBe('port');

    // Verify publisher edge
    expect(edges[1].from.kind).toBe('port');
    expect(edges[1].to.kind).toBe('bus');

    // Verify listener edge
    expect(edges[2].from.kind).toBe('bus');
    expect(edges[2].to.kind).toBe('port');
  });

  it('handles empty arrays', () => {
    const edges = convertToEdges([], [], []);
    expect(edges).toHaveLength(0);
  });
});

describe('Batch Conversion: convertFromEdges', () => {
  it('separates edges back into connection types', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: { kind: 'port', blockId: 'a', slotId: 'out' },
        to: { kind: 'port', blockId: 'b', slotId: 'in' },
        enabled: true,
      },
      {
        id: 'e2',
        from: { kind: 'port', blockId: 'a', slotId: 'out' },
        to: { kind: 'bus', busId: 'bus1' },
        enabled: true,
        weight: 1.0,
        sortKey: 0,
      },
      {
        id: 'e3',
        from: { kind: 'bus', busId: 'bus1' },
        to: { kind: 'port', blockId: 'c', slotId: 'in' },
        enabled: true,
      },
    ];

    const result = convertFromEdges(edges);

    expect(result.connections).toHaveLength(1);
    expect(result.publishers).toHaveLength(1);
    expect(result.listeners).toHaveLength(1);

    expect(result.connections[0].id).toBe('e1');
    expect(result.publishers[0].id).toBe('e2');
    expect(result.listeners[0].id).toBe('e3');
  });

  it('handles empty edge array', () => {
    const result = convertFromEdges([]);

    expect(result.connections).toHaveLength(0);
    expect(result.publishers).toHaveLength(0);
    expect(result.listeners).toHaveLength(0);
  });

  it('round-trips correctly', () => {
    const originalConnections: Connection[] = [
      {
        id: 'c1',
        from: { blockId: 'a', slotId: 'out', direction: 'output' },
        to: { blockId: 'b', slotId: 'in', direction: 'input' },
        enabled: true,
      },
    ];

    const originalPublishers: Publisher[] = [
      {
        id: 'p1',
        from: { blockId: 'a', slotId: 'out', direction: 'output' },
        busId: 'bus1',
        enabled: true,
        sortKey: 0,
      },
    ];

    const originalListeners: Listener[] = [
      {
        id: 'l1',
        busId: 'bus1',
        to: { blockId: 'c', slotId: 'in', direction: 'input' },
        enabled: true,
      },
    ];

    // Forward conversion
    const edges = convertToEdges(
      originalConnections,
      originalPublishers,
      originalListeners
    );

    // Reverse conversion
    const result = convertFromEdges(edges);

    // Verify counts match
    expect(result.connections).toHaveLength(originalConnections.length);
    expect(result.publishers).toHaveLength(originalPublishers.length);
    expect(result.listeners).toHaveLength(originalListeners.length);

    // Verify IDs are preserved
    expect(result.connections[0].id).toBe(originalConnections[0].id);
    expect(result.publishers[0].id).toBe(originalPublishers[0].id);
    expect(result.listeners[0].id).toBe(originalListeners[0].id);
  });
});
