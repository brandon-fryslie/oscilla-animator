/**
 * SemanticGraph tests
 *
 * Tests for the semantic graph construction and query API.
 *
 * NOTE: After bus-block unification (2026-01-02), buses are now BusBlocks.
 * Tests for publisher/listener indexing and bus publisher sorting have been
 * removed as these are no longer separate concepts.
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
            inputs: [{ id: 'progress', type: 'Signal<float>' }],
            outputs: [{ id: 'render', type: 'Render' }],
          },
        ],
        edges: [],
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
            inputs: [{ id: 'progress', type: 'Signal<float>' }],
            outputs: [{ id: 'render', type: 'Render' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'block1', slotId: 'progress' },
            to: { kind: 'port', blockId: 'block2', slotId: 'progress' },
            enabled: true,
          role: { kind: 'user' },
          },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);

      // Check incoming wires
      const incomingWires = graph.getIncomingWires({
        blockId: 'block2',
        slotId: 'progress',
        direction: 'input',
      });
      expect(incomingWires).toHaveLength(1);
      expect(incomingWires[0]?.connectionId).toBe('conn1');

      // Check outgoing wires
      const outgoingWires = graph.getOutgoingWires({
        blockId: 'block1',
        slotId: 'progress',
        direction: 'output',
      });
      expect(outgoingWires).toHaveLength(1);
      expect(outgoingWires[0]?.connectionId).toBe('conn1');
    });
  });

  describe('cycle detection', () => {
    it('should detect no cycles in acyclic graph', () => {
      const patch: PatchDocument = {
        blocks: [
          { id: 'a', type: 'A', inputs: [], outputs: [{ id: 'out', type: 'Signal<float>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [{ id: 'out', type: 'Signal<float>' }] },
          { id: 'c', type: 'C', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [{ id: 'out', type: 'Signal<float>' }] },
        ],
        edges: [
          { id: 'conn1', from: { kind: 'port', blockId: 'a', slotId: 'out' }, to: { kind: 'port', blockId: 'b', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
          { id: 'conn2', from: { kind: 'port', blockId: 'b', slotId: 'out' }, to: { kind: 'port', blockId: 'c', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
        ],
      };

      const graph = SemanticGraph.fromPatch(patch);
      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(0);
    });

    it('should detect simple cycle', () => {
      const patch: PatchDocument = {
        blocks: [
          { id: 'a', type: 'A', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [{ id: 'out', type: 'Signal<float>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [{ id: 'out', type: 'Signal<float>' }] },
        ],
        edges: [
          { id: 'conn1', from: { kind: 'port', blockId: 'a', slotId: 'out' }, to: { kind: 'port', blockId: 'b', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
          { id: 'conn2', from: { kind: 'port', blockId: 'b', slotId: 'out' }, to: { kind: 'port', blockId: 'a', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
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
          { id: 'a', type: 'A', inputs: [], outputs: [{ id: 'out', type: 'Signal<float>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [{ id: 'out', type: 'Signal<float>' }] },
          { id: 'c', type: 'C', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [{ id: 'out', type: 'Signal<float>' }] },
        ],
        edges: [
          { id: 'conn1', from: { kind: 'port', blockId: 'a', slotId: 'out' }, to: { kind: 'port', blockId: 'b', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
          { id: 'conn2', from: { kind: 'port', blockId: 'b', slotId: 'out' }, to: { kind: 'port', blockId: 'c', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
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
          { id: 'a', type: 'A', inputs: [], outputs: [{ id: 'out', type: 'Signal<float>' }] },
          { id: 'b', type: 'B', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [{ id: 'out', type: 'Signal<float>' }] },
          { id: 'c', type: 'C', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [] },
          { id: 'd', type: 'D', inputs: [{ id: 'in', type: 'Signal<float>' }], outputs: [] },
        ],
        edges: [
          { id: 'conn1', from: { kind: 'port', blockId: 'a', slotId: 'out' }, to: { kind: 'port', blockId: 'b', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
          { id: 'conn2', from: { kind: 'port', blockId: 'a', slotId: 'out' }, to: { kind: 'port', blockId: 'c', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
          { id: 'conn3', from: { kind: 'port', blockId: 'b', slotId: 'out' }, to: { kind: 'port', blockId: 'd', slotId: 'in' }, enabled: true, role: { kind: 'user' } },
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
});
