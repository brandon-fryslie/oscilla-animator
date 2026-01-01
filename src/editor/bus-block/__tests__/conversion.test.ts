/**
 * Bus ↔ BusBlock Conversion Tests
 *
 * Sprint: Bus-Block Unification - Sprint 1 (Foundation)
 * DOD: 8+ unit tests validating conversion utilities
 */

import { describe, it, expect } from 'vitest';
import { convertBusToBlock, convertBlockToBus } from '../conversion';
import type { Bus, Block, TypeDesc } from '../../types';

describe('convertBusToBlock', () => {
  it('preserves bus ID as block ID', () => {
    const bus: Bus = {
      id: 'bus-123',
      name: 'TestBus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: { when: 'multi', mode: 'sum' },
      defaultValue: 0,
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.id).toBe('bus-123');
  });

  it('sets block type to BusBlock', () => {
    const bus: Bus = {
      id: 'bus-456',
      name: 'AnotherBus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: { when: 'multi', mode: 'last' },
      defaultValue: 0,
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.type).toBe('BusBlock');
  });

  it('stores bus name in params.busName', () => {
    const bus: Bus = {
      id: 'bus-789',
      name: 'Energy',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: { when: 'multi', mode: 'sum' },
      defaultValue: 0,
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.params.busName).toBe('Energy');
  });

  it('stores bus type in params.busType', () => {
    const busType: TypeDesc = { world: 'signal', domain: 'vec2', category: 'core', busEligible: true };
    const bus: Bus = {
      id: 'bus-type-test',
      name: 'Position',
      type: busType,
      combine: { when: 'multi', mode: 'last' },
      defaultValue: { x: 0, y: 0 },
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.params.busType).toEqual(busType);
  });

  it('stores combine policy in params.combine', () => {
    const combinePolicy = { when: 'always', mode: 'sum' } as const;
    const bus: Bus = {
      id: 'bus-combine-test',
      name: 'Multiplier',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: combinePolicy,
      defaultValue: 1,
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.params.combine).toEqual(combinePolicy);
  });

  it('marks block as hidden', () => {
    const bus: Bus = {
      id: 'bus-hidden-test',
      name: 'InternalBus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: { when: 'multi', mode: 'last' },
      defaultValue: 0,
      sortKey: 0,
      origin: 'built-in',
    };

    const block = convertBusToBlock(bus);

    expect(block.hidden).toBe(true);
  });

  it('sets block role to internal', () => {
    const bus: Bus = {
      id: 'bus-role-test',
      name: 'SystemBus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: { when: 'multi', mode: 'last' },
      defaultValue: 0,
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.role).toBe('internal');
  });

  it('creates input port with bus combine policy', () => {
    const combinePolicy = { when: 'multi', mode: 'sum' } as const;
    const bus: Bus = {
      id: 'bus-input-test',
      name: 'Accumulator',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: combinePolicy,
      defaultValue: 0,
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.inputs).toHaveLength(1);
    expect(block.inputs[0].id).toBe('in');
    expect(block.inputs[0].direction).toBe('input');
    expect(block.inputs[0].combine).toEqual(combinePolicy);
  });

  it('creates output port for bus output', () => {
    const busType: TypeDesc = { world: 'signal', domain: 'color', category: 'core', busEligible: true };
    const bus: Bus = {
      id: 'bus-output-test',
      name: 'Palette',
      type: busType,
      combine: { when: 'multi', mode: 'layer' },
      defaultValue: '#000000',
      sortKey: 0,
      origin: 'user',
    };

    const block = convertBusToBlock(bus);

    expect(block.outputs).toHaveLength(1);
    expect(block.outputs[0].id).toBe('out');
    expect(block.outputs[0].direction).toBe('output');
    // Note: SlotType is placeholder 'Signal<float>' - actual type resolved from params
  });
});

describe('convertBlockToBus', () => {
  it('converts BusBlock back to Bus', () => {
    const originalBus: Bus = {
      id: 'bus-roundtrip',
      name: 'RoundtripBus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combine: { when: 'multi', mode: 'sum' },
      defaultValue: 0,
      sortKey: 5,
      origin: 'user',
    };

    const block = convertBusToBlock(originalBus);
    const recoveredBus = convertBlockToBus(block);

    expect(recoveredBus).toEqual(originalBus);
  });

  it('throws error for non-BusBlock types', () => {
    const regularBlock: Block = {
      id: 'block-123',
      type: 'SignalOsc',
      label: 'Oscillator',
      inputs: [],
      outputs: [],
      params: {},
      category: 'Sources',
      description: 'Signal oscillator',
    };

    expect(() => convertBlockToBus(regularBlock)).toThrow('Cannot convert block of type "SignalOsc" to Bus');
  });

  it('validates busId parameter', () => {
    const invalidBlock: Block = {
      id: 'block-invalid',
      type: 'BusBlock',
      label: 'Bad Bus',
      inputs: [],
      outputs: [],
      params: {
        // Missing busId
        busName: 'Invalid',
        busType: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        combine: { when: 'multi', mode: 'last' },
        defaultValue: 0,
      },
      category: 'Other',
      description: 'Invalid bus block',
    };

    expect(() => convertBlockToBus(invalidBlock)).toThrow('busId must be a string');
  });

  it('validates busName parameter', () => {
    const invalidBlock: Block = {
      id: 'block-invalid',
      type: 'BusBlock',
      label: 'Bad Bus',
      inputs: [],
      outputs: [],
      params: {
        busId: 'bus-123',
        // Missing busName
        busType: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        combine: { when: 'multi', mode: 'last' },
        defaultValue: 0,
      },
      category: 'Other',
      description: 'Invalid bus block',
    };

    expect(() => convertBlockToBus(invalidBlock)).toThrow('busName must be a string');
  });

  it('validates busType parameter', () => {
    const invalidBlock: Block = {
      id: 'block-invalid',
      type: 'BusBlock',
      label: 'Bad Bus',
      inputs: [],
      outputs: [],
      params: {
        busId: 'bus-123',
        busName: 'Invalid',
        // Missing busType
        combine: { when: 'multi', mode: 'last' },
        defaultValue: 0,
      },
      category: 'Other',
      description: 'Invalid bus block',
    };

    expect(() => convertBlockToBus(invalidBlock)).toThrow('busType must be a TypeDesc object');
  });

  it('validates combine parameter', () => {
    const invalidBlock: Block = {
      id: 'block-invalid',
      type: 'BusBlock',
      label: 'Bad Bus',
      inputs: [],
      outputs: [],
      params: {
        busId: 'bus-123',
        busName: 'Invalid',
        busType: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        // Missing combine
        defaultValue: 0,
      },
      category: 'Other',
      description: 'Invalid bus block',
    };

    expect(() => convertBlockToBus(invalidBlock)).toThrow('combine must be a CombinePolicy object');
  });

  it('handles missing sortKey gracefully', () => {
    const block: Block = {
      id: 'bus-missing-sortkey',
      type: 'BusBlock',
      label: 'Bus',
      inputs: [],
      outputs: [],
      params: {
        busId: 'bus-123',
        busName: 'TestBus',
        busType: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        combine: { when: 'multi', mode: 'last' },
        defaultValue: 0,
        // sortKey missing - should default to 0
      },
      category: 'Other',
      description: 'Bus block',
    };

    const bus = convertBlockToBus(block);

    expect(bus.sortKey).toBe(0);
  });

  it('handles invalid origin gracefully', () => {
    const block: Block = {
      id: 'bus-invalid-origin',
      type: 'BusBlock',
      label: 'Bus',
      inputs: [],
      outputs: [],
      params: {
        busId: 'bus-123',
        busName: 'TestBus',
        busType: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        combine: { when: 'multi', mode: 'last' },
        defaultValue: 0,
        sortKey: 0,
        origin: 'invalid-value',
      },
      category: 'Other',
      description: 'Bus block',
    };

    const bus = convertBlockToBus(block);

    // Should default to 'user' for invalid origin
    expect(bus.origin).toBe('user');
  });
});

describe('roundtrip conversion', () => {
  it('Bus → BusBlock → Bus preserves all data', () => {
    const originalBus: Bus = {
      id: 'bus-complete',
      name: 'CompleteTest',
      type: { world: 'signal', domain: 'vec3', category: 'core', busEligible: true },
      combine: { when: 'always', mode: 'sum' },
      defaultValue: { x: 0, y: 0, z: 0 },
      sortKey: 42,
      origin: 'built-in',
    };

    const block = convertBusToBlock(originalBus);
    const recoveredBus = convertBlockToBus(block);

    expect(recoveredBus.id).toBe(originalBus.id);
    expect(recoveredBus.name).toBe(originalBus.name);
    expect(recoveredBus.type).toEqual(originalBus.type);
    expect(recoveredBus.combine).toEqual(originalBus.combine);
    expect(recoveredBus.defaultValue).toEqual(originalBus.defaultValue);
    expect(recoveredBus.sortKey).toBe(originalBus.sortKey);
    expect(recoveredBus.origin).toBe(originalBus.origin);
  });
});
