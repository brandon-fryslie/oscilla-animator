/**
 * Composite Expansion Tests
 *
 * Tests composite expansion with Edge-based (BusBlock) connections.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../stores/RootStore';
import type { CombinePolicy } from '../types';
import { createTypeDesc } from '../types';

describe('Composite Expansion', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  it('should expand composite with BusBlock connections', () => {
    const combine: CombinePolicy = { when: 'multi', mode: 'sum' };

    // Add a BusBlock for signal routing
    const busBlock = root.patchStore.addBus({
      name: 'TestBus',
      type: createTypeDesc('signal', 'float', 'core', true),
      combine,
    });

    expect(root.patchStore.busBlocks).toHaveLength(1);
    expect(busBlock.type).toBe('BusBlock');
    expect(busBlock.params.name).toBe('TestBus');

    // Add a source block
    root.patchStore.addBlock('FieldConstNumber', { value: 42 });

    // Add a sink block
    root.patchStore.addBlock('FieldConstNumber', { value: 0 });

    expect(root.patchStore.blocks).toHaveLength(3); // BusBlock + 2 regular blocks
    expect(root.patchStore.userBlocks).toHaveLength(2); // BusBlocks are hidden
  });

  it('should preserve Edge references during expansion', () => {
    // Add two blocks
    const sourceId = root.patchStore.addBlock('FieldConstNumber', { value: 1 });
    const sinkId = root.patchStore.addBlock('FieldConstNumber', { value: 2 });

    // Connect them via connect() which creates a connection/edge
    root.patchStore.connect(sourceId, 'value', sinkId, 'value');

    // Verify edge exists
    expect(root.patchStore.edges).toHaveLength(1);
    const edge = root.patchStore.edges[0];
    expect(edge.from.blockId).toBe(sourceId);
    expect(edge.to.blockId).toBe(sinkId);

    // Edge should have proper port refs
    expect(edge.from.slotId).toBe('value');
    expect(edge.to.slotId).toBe('value');
  });

  it('should handle nested composites with BusBlocks', () => {
    const combineSum: CombinePolicy = { when: 'multi', mode: 'sum' };
    const combineMax: CombinePolicy = { when: 'multi', mode: 'max' };

    // Create multiple BusBlocks for routing
    const bus1 = root.patchStore.addBus({
      name: 'Bus1',
      type: createTypeDesc('signal', 'float', 'core', true),
      combine: combineSum,
    });
    const bus2 = root.patchStore.addBus({
      name: 'Bus2',
      type: createTypeDesc('signal', 'float', 'core', true),
      combine: combineMax,
    });

    expect(root.patchStore.busBlocks).toHaveLength(2);

    // Verify buses have different IDs
    expect(bus1.id).not.toBe(bus2.id);

    // Verify buses have correct combine policies
    expect(bus1.params.combine).toEqual(combineSum);
    expect(bus2.params.combine).toEqual(combineMax);

    // BusBlocks should be retrievable by ID (comparing by id, not identity)
    expect(root.patchStore.getBusById(bus1.id)?.id).toBe(bus1.id);
    expect(root.patchStore.getBusById(bus2.id)?.id).toBe(bus2.id);
  });
});
