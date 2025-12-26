/**
 * @file UnifiedCompiler tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedCompiler } from '../UnifiedCompiler';
import { stateBlockRegistry } from '../StateBlock';
import { createDelayBlock } from '../blocks/DelayBlock';
import type { PatchDefinition } from '../UnifiedCompiler';

describe('UnifiedCompiler', () => {
  let compiler: UnifiedCompiler;

  beforeEach(() => {
    compiler = new UnifiedCompiler();

    // Clear and re-register Delay block
    stateBlockRegistry.clear();
    stateBlockRegistry.register('Delay', createDelayBlock({ delay: 0.5 }));
  });

  it('compiles empty patch', () => {
    const patch: PatchDefinition = {
      blocks: new Map(),
      connections: [],
    };

    const result = compiler.compile(patch);

    expect(result.errors).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
    expect(result.buses).toHaveLength(0);
  });

  it('compiles simple linear patch', () => {
    const patch: PatchDefinition = {
      blocks: new Map([
        ['block1', { id: 'block1', type: 'Source', params: {} }],
        ['block2', { id: 'block2', type: 'Transform', params: {} }],
        ['block3', { id: 'block3', type: 'Sink', params: {} }],
      ]),
      connections: [
        { from: { blockId: 'block1', port: 'out' }, to: { blockId: 'block2', port: 'in' } },
        { from: { blockId: 'block2', port: 'out' }, to: { blockId: 'block3', port: 'in' } },
      ],
    };

    const result = compiler.compile(patch);

    expect(result.errors).toHaveLength(0);
    expect(result.blocks).toHaveLength(3);

    // Check evaluation order
    const order = result.evaluationOrder;
    expect(order.indexOf('block1')).toBeLessThan(order.indexOf('block2'));
    expect(order.indexOf('block2')).toBeLessThan(order.indexOf('block3'));
  });

  it('detects instantaneous cycle', () => {
    const patch: PatchDefinition = {
      blocks: new Map([
        ['block1', { id: 'block1', type: 'Source', params: {} }],
        ['block2', { id: 'block2', type: 'Transform', params: {} }],
      ]),
      connections: [
        { from: { blockId: 'block1', port: 'out' }, to: { blockId: 'block2', port: 'in' } },
        { from: { blockId: 'block2', port: 'out' }, to: { blockId: 'block1', port: 'in' } },
      ],
    };

    const result = compiler.compile(patch);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.type).toBe('cycle');
    expect(result.errors[0]?.message).toContain('instantaneous cycle');
  });

  it('allows cycle through state block', () => {
    const patch: PatchDefinition = {
      blocks: new Map([
        ['block1', { id: 'block1', type: 'Source', params: {} }],
        ['delay1', { id: 'delay1', type: 'Delay', params: { delay: 0.5 } }],
      ]),
      connections: [
        { from: { blockId: 'block1', port: 'out' }, to: { blockId: 'delay1', port: 'input' } },
        { from: { blockId: 'delay1', port: 'output' }, to: { blockId: 'block1', port: 'in' } },
      ],
    };

    const result = compiler.compile(patch);


    expect(result.errors).toHaveLength(0);
    expect(result.blocks).toHaveLength(2);
  });

  it('compiles patch with buses', () => {
    const patch: PatchDefinition = {
      blocks: new Map([
        ['source1', { id: 'source1', type: 'Source', params: {} }],
        ['source2', { id: 'source2', type: 'Source', params: {} }],
        ['sink1', { id: 'sink1', type: 'Sink', params: {} }],
      ]),
      connections: [],
      buses: new Map([
        ['bus1', { id: 'bus1', name: 'TestBus', type: 'Number' }],
      ]),
      publishers: [
        { blockId: 'source1', busId: 'bus1', port: 'out', sortKey: 0 },
        { blockId: 'source2', busId: 'bus1', port: 'out', sortKey: 1 },
      ],
      listeners: [
        { blockId: 'sink1', busId: 'bus1', port: 'in' },
      ],
    };

    const result = compiler.compile(patch);

    expect(result.errors).toHaveLength(0);
    expect(result.blocks).toHaveLength(3);
    expect(result.buses).toHaveLength(1);
  });

  it('initializes state memory for state blocks', () => {
    const patch: PatchDefinition = {
      blocks: new Map([
        ['delay1', { id: 'delay1', type: 'Delay', params: { delay: 0.5 } }],
      ]),
      connections: [],
    };

    const result = compiler.compile(patch);

    expect(result.errors).toHaveLength(0);
    expect(result.stateMemory.has('delay1')).toBe(true);
  });

  it('sorts publishers by sort key', () => {
    const patch: PatchDefinition = {
      blocks: new Map([
        ['source1', { id: 'source1', type: 'Source', params: {} }],
        ['source2', { id: 'source2', type: 'Source', params: {} }],
        ['source3', { id: 'source3', type: 'Source', params: {} }],
      ]),
      connections: [],
      buses: new Map([
        ['bus1', { id: 'bus1', name: 'TestBus', type: 'Number' }],
      ]),
      publishers: [
        { blockId: 'source3', busId: 'bus1', port: 'out', sortKey: 2 },
        { blockId: 'source1', busId: 'bus1', port: 'out', sortKey: 0 },
        { blockId: 'source2', busId: 'bus1', port: 'out', sortKey: 1 },
      ],
      listeners: [],
    };

    const result = compiler.compile(patch);

    expect(result.errors).toHaveLength(0);

    const bus = result.buses.find(b => b.id === 'bus1');
    expect(bus).toBeDefined();
    expect(bus!.publishers.map(p => p.blockId)).toEqual(['source1', 'source2', 'source3']);
  });

  it('handles disabled publishers and listeners', () => {
    const patch: PatchDefinition = {
      blocks: new Map([
        ['source1', { id: 'source1', type: 'Source', params: {} }],
        ['source2', { id: 'source2', type: 'Source', params: {} }],
        ['sink1', { id: 'sink1', type: 'Sink', params: {} }],
        ['sink2', { id: 'sink2', type: 'Sink', params: {} }],
      ]),
      connections: [],
      buses: new Map([
        ['bus1', { id: 'bus1', name: 'TestBus', type: 'Number' }],
      ]),
      publishers: [
        { blockId: 'source1', busId: 'bus1', port: 'out', sortKey: 0, disabled: false },
        { blockId: 'source2', busId: 'bus1', port: 'out', sortKey: 1, disabled: true },
      ],
      listeners: [
        { blockId: 'sink1', busId: 'bus1', port: 'in', disabled: false },
        { blockId: 'sink2', busId: 'bus1', port: 'in', disabled: true },
      ],
    };

    const result = compiler.compile(patch);

    expect(result.errors).toHaveLength(0);

    const bus = result.buses.find(b => b.id === 'bus1');
    expect(bus).toBeDefined();
    expect(bus!.publishers).toHaveLength(1);
    expect(bus!.publishers[0].blockId).toBe('source1');
    expect(bus!.listeners).toHaveLength(1);
    expect(bus!.listeners[0].blockId).toBe('sink1');
  });
});
