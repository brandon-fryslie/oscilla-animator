/**
 * SemanticGraph tests
 *
 * Tests for the semantic graph construction and query API.
 */

import { describe, it, expect } from 'vitest';
import { SemanticGraph } from '../graph';
import type { PatchDocument } from '../types';

describe('SemanticGraph', () => {
  describe('graph construction', () => {
    it('should build graph from simple patch with blocks only', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'block1',
            type: 'FiniteTimeRoot',
            inputs: [],
            outputs: [{ id: 'progress', type: 'Signal<Unit>' }],
          },
          {
            id: 'block2',
            type: 'RenderInstances2D',
            inputs: [{ id: 'progress', type: 'Signal<number>' }],
            outputs: [{ id: 'render', type: 'Render' }],
          },
        ],
        connections: [],
      };

      const graph = SemanticGraph.fromPatch(patch);

      expect(graph.getBlockCount()).toBe(2);
      expect(graph.hasBlock('block1')).toBe(true);
      expect(graph.hasBlock('block2')).toBe(true);
      expect(graph.hasBlock('nonexistent')).toBe(false);
    });

    it('should index wire edges correctly', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'block1',
            type: 'FiniteTimeRoot',
            inputs: [],
            outputs: [{ id: 'progress', type: 'Signal<Unit>' }],
          },
          {
            id: 'block2',
            type: 'RenderInstances2D',
            inputs: [{ id: 'progress', type: 'Signal<number>' }],
            outputs: [{ id: 'render', type: 'Render' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'block1', slotId: 'progress' },
            to: { blockId: 'block2', slotId: 'progress' },
          },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);

      // Check incoming wires
      const incomingWires = graph.getIncomingWires({
        blockId: 'block2',
        slotId: 'progress',
        dir: 'input',
      });
      expect(incomingWires).toHaveLength(1);
      expect(incomingWires[0]?.connectionId).toBe('conn1');

      // Check outgoing wires
      const outgoingWires = graph.getOutgoingWires({
        blockId: 'block1',
        slotId: 'progress',
        dir: 'output',
      });
      expect(outgoingWires).toHaveLength(1);
      expect(outgoingWires[0]?.connectionId).toBe('conn1');
    });

    it('should index publisher and listener edges correctly', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'block1',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'block2',
            type: 'Oscillator',
            inputs: [{ id: 'phase', type: 'Signal<phase>' }],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
        ],
        connections: [],
        buses: [
          {
            id: 'phaseA',
            name: 'phaseA',
            type: {
              world: 'signal',
              domain: 'phase',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last',
            defaultValue: 0,
            sortKey: 0,
          },
        ],
        publishers: [
          {
            id: 'pub1',
            busId: 'phaseA',
            from: {
              blockId: 'block1',
              slotId: 'phase',
              dir: 'output',
            },
            enabled: true,
            sortKey: 0,
          },
        ],
        listeners: [
          {
            id: 'listener1',
            busId: 'phaseA',
            to: {
              blockId: 'block2',
              slotId: 'phase',
              dir: 'input',
            },
            enabled: true,
          },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);

      // Check publisher edges
      const outgoingPublishers = graph.getOutgoingPublishers({
        blockId: 'block1',
        slotId: 'phase',
        dir: 'output',
      });
      expect(outgoingPublishers).toHaveLength(1);
      expect(outgoingPublishers[0]?.publisherId).toBe('pub1');

      // Check listener edges
      const incomingListeners = graph.getIncomingListeners({
        blockId: 'block2',
        slotId: 'phase',
        dir: 'input',
      });
      expect(incomingListeners).toHaveLength(1);
      expect(incomingListeners[0]?.listenerId).toBe('listener1');

      // Check bus publishers
      const busPublishers = graph.getBusPublishers('phaseA');
      expect(busPublishers).toHaveLength(1);
      expect(busPublishers[0]?.publisherId).toBe('pub1');

      // Check bus listeners
      const busListeners = graph.getBusListeners('phaseA');
      expect(busListeners).toHaveLength(1);
      expect(busListeners[0]?.listenerId).toBe('listener1');
    });

    it('should skip disabled publishers and listeners', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'block1',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
        ],
        connections: [],
        buses: [
          {
            id: 'phaseA',
            name: 'phaseA',
            type: {
              world: 'signal',
              domain: 'phase',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last',
            defaultValue: 0,
            sortKey: 0,
          },
        ],
        publishers: [
          {
            id: 'pub1',
            busId: 'phaseA',
            from: {
              blockId: 'block1',
              slotId: 'phase',
              dir: 'output',
            },
            enabled: false, // Disabled
            sortKey: 0,
          },
        ],
        listeners: [],
      };

      const graph = SemanticGraph.fromPatch(patch);

      // Disabled publishers should not be indexed
      const busPublishers = graph.getBusPublishers('phaseA');
      expect(busPublishers).toHaveLength(0);
    });
  });

  describe('cycle detection', () => {
    it('should detect no cycles in acyclic graph', () => {
      const patch: PatchDocument = {
        blocks: [
          { id: 'a', type: 'A', inputs: [], outputs: [{ id: 'out', type: 'Signal<number>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [{ id: 'out', type: 'Signal<number>' }] },
          { id: 'c', type: 'C', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [{ id: 'out', type: 'Signal<number>' }] },
        ],
        connections: [
          { id: 'conn1', from: { blockId: 'a', slotId: 'out' }, to: { blockId: 'b', slotId: 'in' } },
          { id: 'conn2', from: { blockId: 'b', slotId: 'out' }, to: { blockId: 'c', slotId: 'in' } },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);
      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(0);
    });

    it('should detect simple cycle', () => {
      const patch: PatchDocument = {
        blocks: [
          { id: 'a', type: 'A', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [{ id: 'out', type: 'Signal<number>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [{ id: 'out', type: 'Signal<number>' }] },
        ],
        connections: [
          { id: 'conn1', from: { blockId: 'a', slotId: 'out' }, to: { blockId: 'b', slotId: 'in' } },
          { id: 'conn2', from: { blockId: 'b', slotId: 'out' }, to: { blockId: 'a', slotId: 'in' } },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);
      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain('a');
      expect(cycles[0]).toContain('b');
    });

    it('should detect if adding edge would create cycle', () => {
      const patch: PatchDocument = {
        blocks: [
          { id: 'a', type: 'A', inputs: [], outputs: [{ id: 'out', type: 'Signal<number>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [{ id: 'out', type: 'Signal<number>' }] },
          { id: 'c', type: 'C', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [{ id: 'out', type: 'Signal<number>' }] },
        ],
        connections: [
          { id: 'conn1', from: { blockId: 'a', slotId: 'out' }, to: { blockId: 'b', slotId: 'in' } },
          { id: 'conn2', from: { blockId: 'b', slotId: 'out' }, to: { blockId: 'c', slotId: 'in' } },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);

      // Adding c -> a would create a cycle
      expect(graph.wouldCreateCycle('c', 'a')).toBe(true);

      // Adding c -> b would create a cycle
      expect(graph.wouldCreateCycle('c', 'b')).toBe(true);

      // Adding a -> c would NOT create a cycle (already flows that way)
      expect(graph.wouldCreateCycle('a', 'c')).toBe(false);
    });
  });

  describe('downstream block queries', () => {
    it('should return downstream blocks correctly', () => {
      const patch: PatchDocument = {
        blocks: [
          { id: 'a', type: 'A', inputs: [], outputs: [{ id: 'out', type: 'Signal<number>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [{ id: 'out', type: 'Signal<number>' }] },
          { id: 'c', type: 'C', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [] },
          { id: 'd', type: 'D', inputs: [{ id: 'in', type: 'Signal<number>' }], outputs: [] },
        ],
        connections: [
          { id: 'conn1', from: { blockId: 'a', slotId: 'out' }, to: { blockId: 'b', slotId: 'in' } },
          { id: 'conn2', from: { blockId: 'a', slotId: 'out' }, to: { blockId: 'c', slotId: 'in' } },
          { id: 'conn3', from: { blockId: 'b', slotId: 'out' }, to: { blockId: 'd', slotId: 'in' } },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);

      const downstreamA = graph.getDownstreamBlocks('a');
      expect(downstreamA).toContain('b');
      expect(downstreamA).toContain('c');
      expect(downstreamA).toHaveLength(2);

      const downstreamB = graph.getDownstreamBlocks('b');
      expect(downstreamB).toContain('d');
      expect(downstreamB).toHaveLength(1);

      const downstreamC = graph.getDownstreamBlocks('c');
      expect(downstreamC).toHaveLength(0);
    });
  });

  describe('bus publisher sorting', () => {
    it('should sort publishers by sortKey', () => {
      const patch: PatchDocument = {
        blocks: [
          { id: 'block1', type: 'A', inputs: [], outputs: [{ id: 'val', type: 'Signal<number>' }] },
          { id: 'block2', type: 'B', inputs: [], outputs: [{ id: 'val', type: 'Signal<number>' }] },
          { id: 'block3', type: 'C', inputs: [], outputs: [{ id: 'val', type: 'Signal<number>' }] },
        ],
        connections: [],
        buses: [
          {
            id: 'energy',
            name: 'energy',
            type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
            combineMode: 'sum',
            defaultValue: 0,
            sortKey: 0,
          },
        ],
        publishers: [
          {
            id: 'pub1',
            busId: 'energy',
            from: { blockId: 'block1', slotId: 'val', dir: 'output' },
            enabled: true,
            sortKey: 20,
          },
          {
            id: 'pub2',
            busId: 'energy',
            from: { blockId: 'block2', slotId: 'val', dir: 'output' },
            enabled: true,
            sortKey: 10,
          },
          {
            id: 'pub3',
            busId: 'energy',
            from: { blockId: 'block3', slotId: 'val', dir: 'output' },
            enabled: true,
            sortKey: 30,
          },
        ],
        listeners: [],
      };

      const graph = SemanticGraph.fromPatch(patch);
      const busPublishers = graph.getBusPublishers('energy');

      expect(busPublishers).toHaveLength(3);
      expect(busPublishers[0]?.sortKey).toBe(10);
      expect(busPublishers[1]?.sortKey).toBe(20);
      expect(busPublishers[2]?.sortKey).toBe(30);
    });
  });
});
