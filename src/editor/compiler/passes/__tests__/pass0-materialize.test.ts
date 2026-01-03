/**
 * Pass 0 Materialize Tests
 *
 * Tests BusBlock materialization in the compiler pass.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../../stores/RootStore';
import type { CombinePolicy, TypeDesc } from '../../../types';
import { createTypeDesc } from '../../../types';

describe('Pass 0 Materialize', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  it('should materialize BusBlocks from patch', () => {
    const combineSum: CombinePolicy = { when: 'multi', mode: 'sum' };

    // Create a BusBlock
    const bus = root.patchStore.addBus({
      name: 'TestBus',
      type: createTypeDesc('signal', 'float', 'core', true),
      combine: combineSum,
    });

    // BusBlock should exist in patch.blocks
    expect(root.patchStore.blocks.some(b => b.id === bus.id)).toBe(true);

    // BusBlock should have correct type
    const busBlock = root.patchStore.blocks.find(b => b.id === bus.id);
    expect(busBlock?.type).toBe('BusBlock');
  });

  it('should create bus index from BusBlocks', () => {
    const combineSum: CombinePolicy = { when: 'multi', mode: 'sum' };
    const combineMax: CombinePolicy = { when: 'multi', mode: 'max' };

    // Create multiple BusBlocks
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

    // busBlocks computed property acts as the bus index
    expect(root.patchStore.busBlocks).toHaveLength(2);

    // Can retrieve by ID
    expect(root.patchStore.getBusById(bus1.id)?.params.name).toBe('Bus1');
    expect(root.patchStore.getBusById(bus2.id)?.params.name).toBe('Bus2');
  });

  it('should validate BusBlock structure', () => {
    const combineSum: CombinePolicy = { when: 'multi', mode: 'sum' };
    const floatType = createTypeDesc('signal', 'float', 'core', true);

    // Create a valid BusBlock
    const bus = root.patchStore.addBus({
      name: 'ValidBus',
      type: floatType,
      combine: combineSum,
      defaultValue: 0,
    });

    // BusBlock should have required params
    expect(bus.params.name).toBe('ValidBus');
    // Type is stored as busType in params
    expect((bus.params.busType as TypeDesc).domain).toBe('float');
    expect(bus.params.combine).toEqual(combineSum);
    expect(bus.params.defaultValue).toBe(0);

    // BusBlock should have 'in' and 'out' ports
    expect(bus.inputs.some(i => i.id === 'in')).toBe(true);
    expect(bus.outputs.some(o => o.id === 'out')).toBe(true);
  });
});
