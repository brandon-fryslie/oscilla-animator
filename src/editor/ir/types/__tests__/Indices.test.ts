import { describe, it, expect } from 'vitest';
import {
  nodeIndex,
  portIndex,
  busIndex,
  valueSlot,
  stepIndex,
  nodeId,
  busId,
  stepId,
  exprId,
  stateId,
  type NodeIndex,
  type BusIndex,
  type ValueSlot,
} from '../Indices';
import { DebugIndexBuilder } from '../DebugIndex';

describe('Indices', () => {
  describe('Factory functions', () => {
    it('creates NodeIndex from number', () => {
      const idx: NodeIndex = nodeIndex(5);
      expect(idx).toBe(5);
    });

    it('creates BusIndex from number', () => {
      const idx: BusIndex = busIndex(3);
      expect(idx).toBe(3);
    });

    it('creates ValueSlot from number', () => {
      const slot: ValueSlot = valueSlot(10);
      expect(slot).toBe(10);
    });

    it('creates branded IDs from strings', () => {
      expect(nodeId('node-1')).toBe('node-1');
      expect(busId('phaseA')).toBe('phaseA');
      expect(stepId('step-0')).toBe('step-0');
      expect(exprId('expr-1')).toBe('expr-1');
      expect(stateId('state-x')).toBe('state-x');
    });

    it('creates all index types', () => {
      expect(portIndex(2)).toBe(2);
      expect(stepIndex(7)).toBe(7);
    });
  });
});

describe('DebugIndexBuilder', () => {
  it('assigns sequential indices to nodes', () => {
    const builder = new DebugIndexBuilder('test-compile', 1);

    const idx1 = builder.internNode(nodeId('node-a'));
    const idx2 = builder.internNode(nodeId('node-b'));
    const idx3 = builder.internNode(nodeId('node-c'));

    expect(idx1).toBe(0);
    expect(idx2).toBe(1);
    expect(idx3).toBe(2);
  });

  it('returns same index for duplicate node IDs (idempotent)', () => {
    const builder = new DebugIndexBuilder('test-compile', 1);

    const idx1 = builder.internNode(nodeId('node-a'));
    const idx2 = builder.internNode(nodeId('node-b'));
    const idx3 = builder.internNode(nodeId('node-a')); // Same as idx1

    expect(idx1).toBe(0);
    expect(idx2).toBe(1);
    expect(idx3).toBe(0); // Interned, same index
  });

  it('assigns sequential indices to buses', () => {
    const builder = new DebugIndexBuilder('test-compile', 1);

    const idx1 = builder.internBus(busId('phaseA'));
    const idx2 = builder.internBus(busId('energy'));
    const idx3 = builder.internBus(busId('phaseA')); // Duplicate

    expect(idx1).toBe(0);
    expect(idx2).toBe(1);
    expect(idx3).toBe(0); // Same as idx1
  });

  it('assigns sequential slots to ports', () => {
    const builder = new DebugIndexBuilder('test-compile', 1);

    const slot1 = builder.internPort(nodeId('osc-1'), 'out');
    const slot2 = builder.internPort(nodeId('add-1'), 'result');
    const slot3 = builder.internPort(nodeId('osc-1'), 'out'); // Duplicate

    expect(slot1).toBe(0);
    expect(slot2).toBe(1);
    expect(slot3).toBe(0); // Same as slot1
  });

  it('builds a consistent debug index', () => {
    const builder = new DebugIndexBuilder('test-compile', 1);

    builder.internNode(nodeId('osc-1'), 'block-1');
    builder.internNode(nodeId('add-1'), 'block-2');
    builder.internBus(busId('phaseA'));
    builder.internPort(nodeId('osc-1'), 'out');

    const index = builder.build();

    expect(index.compileId).toBe('test-compile');
    expect(index.patchRevision).toBe(1);
    expect(index.nodeIndexToId[0]).toBe('osc-1');
    expect(index.nodeIndexToId[1]).toBe('add-1');
    expect(index.nodeIdToIndex.get(nodeId('osc-1'))).toBe(0);
    expect(index.busIndexToId[0]).toBe('phaseA');
    expect(index.slotToPortKey[0]).toBe('osc-1:out');
  });

  it('supports round-trip id↔index lookup', () => {
    const builder = new DebugIndexBuilder('test', 1);
    const nid = nodeId('my-node');
    const idx = builder.internNode(nid);
    const index = builder.build();

    // Index → ID
    expect(index.nodeIndexToId[idx]).toBe('my-node');
    // ID → Index
    expect(index.nodeIdToIndex.get(nid)).toBe(idx);
  });

  it('records node to block mapping', () => {
    const builder = new DebugIndexBuilder('test', 1);
    builder.internNode(nodeId('ir-node-1'), 'editor-block-xyz');
    const index = builder.build();

    expect(index.nodeIdToBlockId.get(nodeId('ir-node-1'))).toBe('editor-block-xyz');
  });

  it('handles nodes without block mapping', () => {
    const builder = new DebugIndexBuilder('test', 1);
    builder.internNode(nodeId('synthetic-node'));
    const index = builder.build();

    expect(index.nodeIdToBlockId.has(nodeId('synthetic-node'))).toBe(false);
  });

  it('handles empty builder', () => {
    const builder = new DebugIndexBuilder('empty', 0);
    const index = builder.build();

    expect(index.nodeIndexToId.length).toBe(0);
    expect(index.busIndexToId.length).toBe(0);
    expect(index.slotToPortKey.length).toBe(0);
  });

  it('handles large number of entities', () => {
    const builder = new DebugIndexBuilder('large', 1);

    for (let i = 0; i < 100; i++) {
      builder.internNode(nodeId(`node-${i}`));
      builder.internBus(busId(`bus-${i}`));
      builder.internPort(nodeId(`node-${i}`), 'out');
    }

    const index = builder.build();

    expect(index.nodeIndexToId.length).toBe(100);
    expect(index.busIndexToId.length).toBe(100);
    expect(index.slotToPortKey.length).toBe(100);

    // Verify random lookups
    expect(index.nodeIdToIndex.get(nodeId('node-50'))).toBe(50);
    expect(index.busIdToIndex.get(busId('bus-75'))).toBe(75);
  });
});
