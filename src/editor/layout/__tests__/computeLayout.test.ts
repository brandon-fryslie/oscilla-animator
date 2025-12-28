/**
 * Layout Computation Tests
 *
 * Tests for the main computeLayout function.
 */

import { describe, it, expect } from 'vitest';
import { computeLayout } from '../computeLayout';
import type { GraphData, UILayoutState } from '../types';

describe('computeLayout', () => {
  describe('empty graph', () => {
    it('handles empty graph gracefully', () => {
      const graph: GraphData = {
        blocks: [],
        directBindings: [],
        busBindings: [],
      };

      const uiState: UILayoutState = {
        density: 'normal',
      };

      const result = computeLayout(graph, uiState);

      expect(result.nodes).toEqual({});
      expect(result.connectors).toEqual([]);
      expect(result.overflowLinks).toEqual([]);
      expect(result.boundsWorld).toEqual({ x: 0, y: 0, width: 0, height: 0 });
      expect(result.debug?.totalBlocks).toBe(0);
    });
  });

  describe('single block', () => {
    it('positions single block at origin', () => {
      const graph: GraphData = {
        blocks: [
          {
            id: 'block-1',
            type: 'time:cycle',
            label: 'Cycle',
            role: 'time',
            inputs: [],
            outputs: [{ id: 'phase', label: 'Phase', direction: 'output' }],
          },
        ],
        directBindings: [],
        busBindings: [],
      };

      const uiState: UILayoutState = {
        density: 'normal',
      };

      const result = computeLayout(graph, uiState);

      expect(Object.keys(result.nodes)).toHaveLength(1);
      const node = result.nodes['block-1'];
      expect(node).toBeDefined();
      expect(node.blockId).toBe('block-1');
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.w).toBe(300); // normal density
      expect(node.h).toBe(56); // normal density
      expect(node.column).toBe(0); // time is in column 0
      expect(node.role).toBe('time');
      expect(node.depth).toBe(0); // no dependencies
    });
  });

  describe('two connected blocks', () => {
    it('positions consumer after producer in dependency order', () => {
      const graph: GraphData = {
        blocks: [
          {
            id: 'producer',
            type: 'time:cycle',
            label: 'Cycle',
            role: 'time',
            inputs: [],
            outputs: [{ id: 'phase', label: 'Phase', direction: 'output' }],
          },
          {
            id: 'consumer',
            type: 'operator:multiply',
            label: 'Multiply',
            role: 'operator',
            inputs: [{ id: 'value', label: 'Value', direction: 'input' }],
            outputs: [{ id: 'result', label: 'Result', direction: 'output' }],
          },
        ],
        directBindings: [
          {
            id: 'conn-1',
            from: { blockId: 'producer', portId: 'phase' },
            to: { blockId: 'consumer', portId: 'value' },
          },
        ],
        busBindings: [],
      };

      const uiState: UILayoutState = {
        density: 'normal',
      };

      const result = computeLayout(graph, uiState);

      expect(Object.keys(result.nodes)).toHaveLength(2);

      const producer = result.nodes['producer'];
      const consumer = result.nodes['consumer'];

      expect(producer.depth).toBe(0);
      expect(consumer.depth).toBe(1); // depends on producer

      // Different columns (time vs operator)
      expect(producer.column).toBe(0);
      expect(consumer.column).toBe(1);

      // Should have one connector
      expect(result.connectors.length).toBeGreaterThan(0);
      const connector = result.connectors[0];
      expect(connector.from.blockId).toBe('producer');
      expect(connector.to.blockId).toBe('consumer');
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const graph: GraphData = {
        blocks: [
          {
            id: 'block-1',
            type: 'time:cycle',
            label: 'Cycle',
            role: 'time',
            inputs: [],
            outputs: [{ id: 'phase', label: 'Phase', direction: 'output' }],
          },
          {
            id: 'block-2',
            type: 'operator:multiply',
            label: 'Multiply',
            role: 'operator',
            inputs: [{ id: 'value', label: 'Value', direction: 'input' }],
            outputs: [{ id: 'result', label: 'Result', direction: 'output' }],
          },
        ],
        directBindings: [
          {
            id: 'conn-1',
            from: { blockId: 'block-1', portId: 'phase' },
            to: { blockId: 'block-2', portId: 'value' },
          },
        ],
        busBindings: [],
      };

      const uiState: UILayoutState = {
        density: 'normal',
      };

      const result1 = computeLayout(graph, uiState);
      const result2 = computeLayout(graph, uiState);

      // Results should be deeply equal
      expect(result1.nodes).toEqual(result2.nodes);
      expect(result1.connectors).toEqual(result2.connectors);
      expect(result1.overflowLinks).toEqual(result2.overflowLinks);
      expect(result1.boundsWorld).toEqual(result2.boundsWorld);
    });

    it('produces identical output run 100 times', () => {
      const graph: GraphData = {
        blocks: [
          {
            id: 'a',
            type: 'time:cycle',
            label: 'A',
            role: 'time',
            inputs: [],
            outputs: [{ id: 'out', label: 'Out', direction: 'output' }],
          },
          {
            id: 'b',
            type: 'operator:add',
            label: 'B',
            role: 'operator',
            inputs: [{ id: 'in', label: 'In', direction: 'input' }],
            outputs: [{ id: 'out', label: 'Out', direction: 'output' }],
          },
          {
            id: 'c',
            type: 'operator:multiply',
            label: 'C',
            role: 'operator',
            inputs: [{ id: 'in', label: 'In', direction: 'input' }],
            outputs: [{ id: 'out', label: 'Out', direction: 'output' }],
          },
        ],
        directBindings: [
          {
            id: 'conn-1',
            from: { blockId: 'a', portId: 'out' },
            to: { blockId: 'b', portId: 'in' },
          },
          {
            id: 'conn-2',
            from: { blockId: 'b', portId: 'out' },
            to: { blockId: 'c', portId: 'in' },
          },
        ],
        busBindings: [],
      };

      const uiState: UILayoutState = {
        density: 'normal',
      };

      // Run 100 times
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(computeLayout(graph, uiState));
      }

      // All results should be identical
      const first = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i].nodes).toEqual(first.nodes);
        expect(results[i].connectors).toEqual(first.connectors);
        expect(results[i].boundsWorld).toEqual(first.boundsWorld);
      }
    });
  });

  describe('density modes', () => {
    it('uses different block sizes for different densities', () => {
      const graph: GraphData = {
        blocks: [
          {
            id: 'block-1',
            type: 'time:cycle',
            label: 'Cycle',
            role: 'time',
            inputs: [],
            outputs: [],
          },
        ],
        directBindings: [],
        busBindings: [],
      };

      const overviewResult = computeLayout(graph, { density: 'overview' });
      const normalResult = computeLayout(graph, { density: 'normal' });
      const detailResult = computeLayout(graph, { density: 'detail' });

      expect(overviewResult.nodes['block-1'].w).toBe(260);
      expect(overviewResult.nodes['block-1'].h).toBe(36);

      expect(normalResult.nodes['block-1'].w).toBe(300);
      expect(normalResult.nodes['block-1'].h).toBe(56);

      expect(detailResult.nodes['block-1'].w).toBe(340);
      expect(detailResult.nodes['block-1'].h).toBe(96);
    });

    it('hides connectors in overview mode', () => {
      const graph: GraphData = {
        blocks: [
          {
            id: 'producer',
            type: 'time:cycle',
            label: 'Cycle',
            role: 'time',
            inputs: [],
            outputs: [{ id: 'phase', label: 'Phase', direction: 'output' }],
          },
          {
            id: 'consumer',
            type: 'operator:multiply',
            label: 'Multiply',
            role: 'operator',
            inputs: [{ id: 'value', label: 'Value', direction: 'input' }],
            outputs: [],
          },
        ],
        directBindings: [
          {
            id: 'conn-1',
            from: { blockId: 'producer', portId: 'phase' },
            to: { blockId: 'consumer', portId: 'value' },
          },
        ],
        busBindings: [],
      };

      const overviewResult = computeLayout(graph, { density: 'overview' });
      const normalResult = computeLayout(graph, { density: 'normal' });

      // Overview mode: no connectors, all become overflow links
      expect(overviewResult.connectors).toHaveLength(0);
      expect(overviewResult.overflowLinks.length).toBeGreaterThan(0);

      // Normal mode: should have connectors (if distance <= Lmax)
      // (depends on layout, but expect at least possibility)
      expect(normalResult.connectors.length + normalResult.overflowLinks.length).toBe(1);
    });
  });

  describe('debug information', () => {
    it('includes debug statistics', () => {
      const graph: GraphData = {
        blocks: [
          {
            id: 'block-1',
            type: 'time:cycle',
            label: 'Cycle',
            role: 'time',
            inputs: [],
            outputs: [{ id: 'phase', label: 'Phase', direction: 'output' }],
          },
          {
            id: 'block-2',
            type: 'operator:multiply',
            label: 'Multiply',
            role: 'operator',
            inputs: [{ id: 'value', label: 'Value', direction: 'input' }],
            outputs: [],
          },
        ],
        directBindings: [
          {
            id: 'conn-1',
            from: { blockId: 'block-1', portId: 'phase' },
            to: { blockId: 'block-2', portId: 'value' },
          },
        ],
        busBindings: [],
      };

      const result = computeLayout(graph, { density: 'normal' });

      expect(result.debug).toBeDefined();
      expect(result.debug!.totalBlocks).toBe(2);
      expect(result.debug!.columnCount).toBeGreaterThan(0);
      expect(result.debug!.maxDepth).toBeGreaterThanOrEqual(0);
    });
  });
});
