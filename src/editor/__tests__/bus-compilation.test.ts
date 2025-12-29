/**
 * Bus Compilation Tests (Phase 2)
 *
 * Tests Signal bus compilation, publisher ordering, combine modes,
 * and error handling per DOD-2025-12-16-consolidated.md
 */

import { describe, it, expect } from 'vitest';
import { compilePatch } from '../compiler/compile';
import type { CompilerPatch, BlockRegistry, CompileCtx, Seed, RuntimeCtx, Artifact } from '../compiler/types';
import type { Bus, Publisher, Listener } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create canonical buses required for TimeRoot auto-publication.
 * Matches the default buses from BusStore.createDefaultBuses().
 */
function createCanonicalBuses(): Bus[] {
  return [
    {
      id: 'phaseA',
      name: 'phaseA',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(primary)' },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    },
    {
      id: 'pulse',
      name: 'pulse',
      type: { world: 'event', domain: 'trigger', category: 'core', busEligible: true, semantics: 'pulse' },
      combineMode: 'last',
      defaultValue: false,
      sortKey: 0,
    },
    {
      id: 'energy',
      name: 'energy',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'energy' },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    },
  ];
}

/**
 * Create a minimal compile context for testing.
 */
function createTestContext(): CompileCtx {
  return {
    env: {},
    geom: {
      get: <K extends object, V>(_key: K, compute: () => V): V => compute(),
      invalidate: () => {},
    },
  };
}

/**
 * Create a minimal block registry with test blocks.
 */
function createTestRegistry(): BlockRegistry {
  return {
    // InfiniteTimeRoot - required for all patches (includes all standard outputs)
    InfiniteTimeRoot: {
      type: 'InfiniteTimeRoot',
      inputs: [],
      outputs: [
        { name: 'systemTime', type: { kind: 'Signal:Time' }, required: true },
        { name: 'cycleT', type: { kind: 'Signal:Time' }, required: true },
        { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
        { name: 'wrap', type: { kind: 'Event' }, required: true },
        { name: 'cycleIndex', type: { kind: 'Signal:int' }, required: true },
        { name: 'energy', type: { kind: 'Signal:float' }, required: true },
      ],
      compile: ({ params }: { params: Record<string, unknown> }) => {
        const periodMs = (params.periodMs as number) ?? 3000;
        return {
          systemTime: { kind: 'Signal:Time', value: (t: number) => t },
          cycleT: { kind: 'Signal:Time', value: (t: number) => t % periodMs },
          phase: { kind: 'Signal:phase', value: (t: number) => (t / periodMs) % 1 },
          wrap: { kind: 'Event', value: (t: number, lastT: number) => Math.floor(t / periodMs) > Math.floor(lastT / periodMs) },
          cycleIndex: { kind: 'Signal:int', value: (t: number) => Math.floor(t / periodMs) },
          energy: { kind: 'Signal:float', value: () => 1.0 },
        };
      },
    },

    // Simple number source
    NumberSource: {
      type: 'NumberSource',
      inputs: [],
      outputs: [{ name: 'value', type: { kind: 'Signal:float' }, required: true }],
      compile: ({ params }: { params: Record<string, unknown> }) => ({
        value: { kind: 'Signal:float', value: () => (params.value as number) ?? 0 },
      }),
    },
    // Simple number consumer (outputs RenderTreeProgram for patch output)
    NumberSink: {
      type: 'NumberSink',
      inputs: [{ name: 'input', type: { kind: 'Signal:float' }, required: true }],
      outputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' }, required: true }],
      compile: ({ inputs }: { inputs: Record<string, Artifact> }) => {
        const input = inputs.input;
        if (input?.kind !== 'Signal:float') {
          return {
            program: {
              kind: 'Error',
              message: 'NumberSink requires Signal:float input',
            },
          };
        }
        return {
          program: {
            kind: 'RenderTreeProgram',
            value: {
              signal: (_t: number, ctx: RuntimeCtx) => ({
                kind: 'group',
                id: 'root',
                children: [],
                meta: { value: input.value(_t, ctx) },
              }),
              event: () => [],
            },
          },
        };
      },
    },
  };
}

// =============================================================================
// Happy Path Tests
// =============================================================================

describe('Bus Compilation - Happy Path', () => {
  it('compiles single Signal<float> bus with one publisher and one listener', () => {
    const blocks = [
      { id: 'timeroot', type: 'InfiniteTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'NumberSource', params: { value: 42 } },
      { id: 'sink1', type: 'NumberSink', params: {} },
    ];

    const bus: Bus = {
      id: 'bus1',
      name: 'Test Bus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      {
        id: 'pub1',
        busId: 'bus1',
        from: { blockId: 'source1', slotId: 'value', direction: 'output' },
        enabled: true,
        sortKey: 0,
      },
    ];

    const listeners: Listener[] = [
      {
        id: 'list1',
        busId: 'bus1',
        to: { blockId: 'sink1', slotId: 'input', direction: 'input' },
        enabled: true,
      },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers,
      listeners,
      defaultSources: {},
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();
  });

  it('returns default value when bus has no publishers', () => {
    const blocks = [
      { id: 'timeroot', type: 'InfiniteTimeRoot', params: { periodMs: 3000 } },
      { id: 'sink1', type: 'NumberSink', params: {} },
    ];

    const bus: Bus = {
      id: 'bus1',
      name: 'Empty Bus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 99, // Should return this
      sortKey: 0,
    };

    const listeners: Listener[] = [
      {
        id: 'list1',
        busId: 'bus1',
        to: { blockId: 'sink1', slotId: 'input', direction: 'input' },
        enabled: true,
      },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers: [],
      listeners,
      defaultSources: {},
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore - accessing meta for test
      expect(output.meta?.value).toBe(99);
    }
  });

  it('combines multiple publishers with "last" mode - highest sortKey wins', () => {
    const blocks = [
      { id: 'timeroot', type: 'InfiniteTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'NumberSource', params: { value: 10 } },
      { id: 'source2', type: 'NumberSource', params: { value: 20 } },
      { id: 'source3', type: 'NumberSource', params: { value: 30 } },
      { id: 'sink1', type: 'NumberSink', params: {} },
    ];

    const bus: Bus = {
      id: 'bus1',
      name: 'Multi Publisher Bus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
      { id: 'pub3', busId: 'bus1', from: { blockId: 'source3', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 30 }, // Highest - should win
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers,
      listeners,
      defaultSources: {},
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      expect(output.meta?.value).toBe(30); // source3 has highest sortKey
    }
  });

  it('combines multiple publishers with "sum" mode', () => {
    const blocks = [
      { id: 'timeroot', type: 'InfiniteTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'NumberSource', params: { value: 10 } },
      { id: 'source2', type: 'NumberSource', params: { value: 20 } },
      { id: 'source3', type: 'NumberSource', params: { value: 30 } },
      { id: 'sink1', type: 'NumberSink', params: {} },
    ];

    const bus: Bus = {
      id: 'bus1',
      name: 'Sum Bus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
      { id: 'pub3', busId: 'bus1', from: { blockId: 'source3', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 30 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers,
      listeners,
      defaultSources: {},
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      expect(output.meta?.value).toBe(60); // 10 + 20 + 30
    }
  });
});

// =============================================================================
// sortKey Determinism Tests
// =============================================================================

describe('Bus Compilation - sortKey Determinism', () => {
  it('stable results with same sortKeys using id tie-breaker', () => {
    const blocks = [
      { id: 'timeroot', type: 'InfiniteTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'NumberSource', params: { value: 100 } },
      { id: 'source2', type: 'NumberSource', params: { value: 200 } },
      { id: 'sink1', type: 'NumberSink', params: {} },
    ];

    const bus: Bus = {
      id: 'bus1',
      name: 'Tie Bus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    // Same sortKey - id tie-breaker should make pub2 win (alphabetically later)
    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers,
      listeners,
      defaultSources: {},
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      expect(output.meta?.value).toBe(200); // pub2 wins via id tie-breaker
    }
  });

  it('result changes when sortKeys swap', () => {
    const blocks = [
      { id: 'timeroot', type: 'InfiniteTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'NumberSource', params: { value: 100 } },
      { id: 'source2', type: 'NumberSource', params: { value: 200 } },
      { id: 'sink1', type: 'NumberSink', params: {} },
    ];

    const bus: Bus = {
      id: 'bus1',
      name: 'Test Bus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    // First configuration: pub1 higher sortKey
    const publishers1: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch1: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers: publishers1,
      listeners,
      defaultSources: {},
    };

    const result1 = compilePatch(patch1, createTestRegistry(), 42 as Seed, createTestContext());
    expect(result1.ok).toBe(true);
    let value1: number | undefined;
    if (result1.program) {
      const output1 = result1.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      value1 = output1.meta?.value;
      expect(value1).toBe(100); // pub1 wins
    }

    // Second configuration: swap sortKeys
    const publishers2: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
    ];

    const patch2: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers: publishers2,
      listeners,
      defaultSources: {},
    };

    const result2 = compilePatch(patch2, createTestRegistry(), 42 as Seed, createTestContext());
    expect(result2.ok).toBe(true);
    if (result2.program) {
      const output2 = result2.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      const value2 = output2.meta?.value;
      expect(value2).toBe(200); // pub2 wins
      expect(value2).not.toBe(value1); // Results swapped
    }
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Bus Compilation - Error Handling', () => {
  // NOTE: Field buses are now supported - see field-bus-compilation.test.ts
  // The old "rejects Field bus" test was removed as Field buses now work.

  it('rejects unsupported combine mode for Signal bus', () => {
    const blocks = [
      { id: 'timeroot', type: 'InfiniteTimeRoot', params: { periodMs: 3000 } },
      { id: 'sink1', type: 'NumberSink', params: {} },
    ];

    const bus: Bus = {
      id: 'bus1',
      name: 'Average Bus',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'average', // Not supported for Signal buses (only Field buses)
      defaultValue: 0,
      sortKey: 0,
    };

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), bus],
      publishers: [],
      listeners: [],
      defaultSources: {},
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(false);
    // Check for UnsupportedCombineMode error
    const combineError = result.errors.find(e => e.code === 'UnsupportedCombineMode' && e.message.includes('average'));
    expect(combineError).toBeDefined();
    expect(combineError?.message).toContain('average');
    expect(combineError?.message).toContain('last, sum');
  });
});
